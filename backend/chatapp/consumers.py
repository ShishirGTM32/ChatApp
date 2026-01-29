import json
import asyncio
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from asgiref.sync import sync_to_async
from django.core.cache import cache
from django.utils import timezone
from users.models import CustomUser
from .models import Conversation, Message, Notification
import logging
from .tasks import notify_recipent_message
logger = logging.getLogger(__name__)

try:
    redis_instance = cache.client.get_client(write=True)
except Exception as e:
    logger.error(f"Redis connection error: {e}")
    redis_instance = None


class ConnectionCounter:
    TTL = 30
    
    def __init__(self, user_id, is_staff=False):
        self.user_id = str(user_id)
        self.key = f"user:{self.user_id}:connections"
        self.heartbeat_key = f"user:{self.user_id}:last_heartbeat"
        self.online_set = "online_staff" if is_staff else "online_users"
        self.is_staff = is_staff

    @sync_to_async
    def increment(self):
        try:
            count = cache.get(self.key, 0) + 1
            cache.set(self.key, count, timeout=self.TTL)
            cache.set(f"user:{self.user_id}:status", "online", timeout=self.TTL)
            cache.set(self.heartbeat_key, timezone.now().timestamp(), timeout=self.TTL)
            
            if redis_instance:
                redis_instance.sadd(self.online_set, self.user_id)
                redis_instance.publish("user_status_channel", json.dumps({
                    "user_id": self.user_id,
                    "status": "online",
                    "is_staff": self.is_staff
                }))
            
            return count
        except Exception as e:
            logger.error(f"Error incrementing connection count: {e}")
            return 1

    @sync_to_async
    def decrement(self):
        try:
            count = cache.get(self.key, 0)
            if count <= 1:
                cache.delete(self.key)
                cache.delete(self.heartbeat_key)
                cache.set(f"user:{self.user_id}:status", "offline", timeout=60)
                
                if redis_instance:
                    redis_instance.srem(self.online_set, self.user_id)
                    redis_instance.publish("user_status_channel", json.dumps({
                        "user_id": self.user_id,
                        "status": "offline",
                        "is_staff": self.is_staff
                    }))
                return 0
            else:
                count -= 1
                cache.set(self.key, count, timeout=self.TTL)
                return count
        except Exception as e:
            logger.error(f"Error decrementing connection count: {e}")
            return 0

    @sync_to_async
    def get_count(self):
        try:
            return cache.get(self.key, 0)
        except Exception as e:
            logger.error(f"Error getting connection count: {e}")
            return 0

    @sync_to_async
    def heartbeat(self):
        try:
            count = cache.get(self.key)
            if count:
                cache.set(self.key, count, timeout=self.TTL)
                cache.set(f"user:{self.user_id}:status", "online", timeout=self.TTL)
                cache.set(self.heartbeat_key, timezone.now().timestamp(), timeout=self.TTL)
                logger.debug(f"Heartbeat updated for user {self.user_id}")
        except Exception as e:
            logger.error(f"Error updating heartbeat: {e}")

    async def is_online(self):
        count = await self.get_count()
        return count > 0


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        try:
            self.user = self.scope.get("user")
            if not self.user or not self.user.is_authenticated:
                logger.warning("Unauthenticated connection attempt")
                await self.close(code=4001)
                return

            self.cid = self.scope["url_route"]["kwargs"].get("conversation_id")
            if not self.cid:
                logger.warning(f"No conversation_id provided for user {self.user.id}")
                await self.close(code=4002)
                return

            self.conversation = await self.get_conversation_by_id(self.cid)
            if not self.conversation:
                logger.warning(f"Conversation {self.cid} not found")
                await self.close(code=4004)
                return

            has_access = await self.has_access()
            if not has_access:
                logger.warning(f"User {self.user.id} denied access to conversation {self.cid}")
                await self.close(code=4003)
                return

            self.room_name = f"conversation_{self.conversation.cid}"
            await self.channel_layer.group_add(self.room_name, self.channel_name)
            await self.accept()

            self.counter = ConnectionCounter(self.user.id, self.user.is_staff)
            count = await self.counter.increment()

            if count == 1:
                await self.channel_layer.group_send(
                    self.room_name,
                    {
                        "type": "user_status_update",
                        "user_id": str(self.user.id),
                        "status": "online",
                        "is_staff": self.user.is_staff
                    }
                )

            await self.send_online_list()
            await self.send_unread_messages()

            logger.info(f"User {self.user.id} ({'staff' if self.user.is_staff else 'user'}) connected to conversation {self.cid}")

        except Exception as e:
            logger.error(f"Error in connect: {e}", exc_info=True)
            await self.close(code=4500)

    async def disconnect(self, close_code):
        try:
            if hasattr(self, "counter") and self.counter:
                count = await self.counter.decrement()
                if count == 0:
                    if hasattr(self, "room_name"):
                        await self.channel_layer.group_send(
                            self.room_name,
                            {
                                "type": "user_status_update",
                                "user_id": str(self.user.id),
                                "status": "offline",
                                "is_staff": self.user.is_staff
                            }
                        )

            if hasattr(self, "room_name") and self.room_name:
                await self.channel_layer.group_discard(self.room_name, self.channel_name)

            logger.info(f"User {self.user.id if hasattr(self, 'user') else 'Unknown'} disconnected with code {close_code}")

        except Exception as e:
            logger.error(f"Error in disconnect: {e}", exc_info=True)

    async def receive(self, text_data):
        if not text_data:
            return

        try:
            data = json.loads(text_data)
            msg_type = data.get("type")
            logger.info(f"Received message from user {self.user.id}: type={msg_type}")
            if msg_type == "chat_message":
                unread = await self.get_unread_messages()
                if unread:
                    await self.handle_read_receipt(data)
                await self.handle_chat_message(data)
            elif msg_type == "image":
                unread = await self.get_unread_messages()
                if unread:
                    await self.handle_read_receipt(data)
                await self.handle_image(data)
            elif msg_type == "read":
                await self.handle_read_receipt(data)
            elif msg_type == "typing":
                await self.handle_typing(data)
            elif msg_type == "heartbeat":
                await self.counter.heartbeat()
                await self.send_online_list()
            else:
                logger.warning(f"Unknown message type: {msg_type}")

        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON received: {e}")
        except Exception as e:
            logger.error(f"Error in receive: {e}", exc_info=True)
    
    async def handle_chat_message(self, data):
        text = data.get("text", "").strip()
        if not text:
            logger.warning("Empty message text received")
            return

        try:            
            message = await self.save_message(text)
            logger.info(f"Message saved with ID: {message.mid}")
            
            recipient_id = await self.get_recipient_id()
            recipient_online = await self.is_recipient_online()

            sender_details = await self.get_sender_details()
            initial_status = "delivered" if recipient_online else "sent"

            payload = {
                "message": message.message,
                "message_id": message.mid,
                "sender": str(self.user.id),
                "sender_name": sender_details["name"],
                "sender_email": sender_details["email"],
                "timestamp": message.timestamp.isoformat(),
                "is_read": False,
                "status": initial_status,
                "recipient_online": recipient_online
            }
            
            await self.channel_layer.group_send(self.room_name, {
                "type": "chat_message_handler",
                **payload
            })
            notify_recipent_message.delay(message.message,sender_details['name'], recipient_id, type='message')
            logger.info(f"Message broadcasted successfully by user {self.user.id} with status {initial_status}")

        except Exception as e:
            logger.error(f"Error handling chat message: {e}", exc_info=True)
            await self.send(text_data=json.dumps({
                "type": "error",
                "message": "Failed to send message"
            }))
    
    async def handle_read_receipt(self, data):
        try:
            logger.info(f"Handling read receipt from user {self.user.id}")
            updated_count = await self.mark_messages_as_read(self.user.id)
            
            if updated_count > 0:
                await self.channel_layer.group_send(
                    self.room_name,
                    {
                        "type": "read_receipt_handler",
                        "user_id": str(self.user.id)
                    }
                )
                logger.debug(f"Read receipt sent by user {self.user.id} for {updated_count} messages")
        except Exception as e:
            logger.error(f"Error handling read receipt: {e}", exc_info=True)

    
    async def handle_typing(self, data):
        try:
            is_typing = data.get("is_typing", False)
            sender_details = await self.get_sender_details()
            
            logger.debug(f"Handling typing indicator from user {self.user.id}: {is_typing}")
            
            await self.channel_layer.group_send(
                self.room_name,
                {
                    "type": "typing_indicator",
                    "user_id": str(self.user.id),
                    "sender_name": sender_details["name"],
                    "is_typing": is_typing
                }
            )
            logger.debug(f"Typing indicator broadcasted for user {self.user.id}")
        except Exception as e:
            logger.error(f"Error handling typing indicator: {e}", exc_info=True)
    
    async def handle_image(self, data):
        image_url = data.get("image", "").strip()
        caption = data.get("text", "").strip()
        
        if not image_url:
            logger.warning("Empty image URL received")
            return

        try:
            message = await self.save_image_message(image_url, caption)
            logger.info(f"Image message saved with ID: {message.mid}")

            recipient_online = await self.is_recipient_online()

            sender_details = await self.get_sender_details()
            initial_status = "delivered" if recipient_online else "sent"

            payload = {
                "message": message.message or "",
                "image": image_url, 
                "message_id": message.mid,
                "sender": str(self.user.id),
                "sender_name": sender_details["name"],
                "sender_email": sender_details["email"],
                "timestamp": message.timestamp.isoformat(),
                "is_read": False,
                "status": initial_status,
                "recipient_online": recipient_online
            }
            await self.channel_layer.group_send(self.room_name, {
                "type": "image_message_handler",
                **payload
            })

        except Exception as e:
            logger.error(f"Error handling image message: {e}", exc_info=True)
            await self.send(text_data=json.dumps({
                "type": "error",
                "message": "Failed to send image"
            }))

    async def image_message_handler(self, event):
        logger.debug(f"image_message_handler called for user {self.user.id}")
        recipient_id = await self.get_recipient_id()
        await self.send(text_data=json.dumps({
            "type": "image_message",
            "message": event.get("message", ""),
            "image": event["image"], 
            "message_id": event["message_id"],
            "sender": event["sender"],
            "sender_name": event.get("sender_name", ""),
            "sender_email": event.get("sender_email", ""),
            "timestamp": event["timestamp"],
            "is_read": event.get("is_read", False),
            "status": event.get("status", "sent"),
            "recipient_online": event.get("recipient_online")
        }))
        notify_recipent_message.delay(
            message=None,
            sender=event.get("sender_name", ""),
            recipient=recipient_id,
            type='image'
        )

    @database_sync_to_async
    def save_image_message(self, image_url, caption=None):
        return Message.objects.create(
            conversation=self.conversation,
            sender=self.user,
            image=image_url,
            message=caption or "",
            message_type="IMAGE",
            is_read=False
        )

    async def chat_message_handler(self, event):
        logger.debug(f"chat_message_handler called for user {self.user.id}: {event}")
        await self.send(text_data=json.dumps({
            "type": "chat_message",
            "message": event["message"],
            "message_id": event["message_id"],
            "sender": event["sender"],
            "sender_name": event.get("sender_name", ""),
            "sender_email": event.get("sender_email", ""),
            "timestamp": event["timestamp"],
            "is_read": event.get("is_read", False),
            "status": event.get("status", "sent"),
            "recipient_online": event.get("recipient_online")
        }))
        logger.debug(f"Message sent to client for user {self.user.id}")

    async def read_receipt_handler(self, event):
        user_id = event.get("user_id")
        if user_id != str(self.user.id):
            await self.send(text_data=json.dumps({
                "type": "read",
                "user_id": user_id
            }))
  
    async def typing_indicator(self, event):
        user_id = event.get("user_id")
        if user_id != str(self.user.id):
            logger.debug(f"Sending typing indicator to user {self.user.id}: {event}")
            await self.send(text_data=json.dumps({
                "type": "typing",
                "user_id": user_id,
                "sender_name": event.get("sender_name", ""),
                "is_typing": event.get("is_typing", False)
            }))

    async def user_status_update(self, event):
        await self.send(text_data=json.dumps({
            "type": "user_status",
            "user_id": event["user_id"],
            "status": event["status"],
            "is_staff": event.get("is_staff", False)
        }))
        if event["status"] == "online":
            await self.upgrade_message_status(event["user_id"])

    async def send_online_list(self):
        try:
            if not redis_instance:
                users = []
            else:
                if self.user.is_staff:
                    candidate_ids = await sync_to_async(redis_instance.smembers)("online_users")
                else:
                    candidate_ids = await sync_to_async(redis_instance.smembers)("online_staff")

                online_ids = []

                for raw_id in candidate_ids:
                    user_id = raw_id.decode() if isinstance(raw_id, bytes) else str(raw_id)
                    exists = await sync_to_async(cache.get)(f"user:{user_id}:connections")
                    if exists:
                        online_ids.append(user_id)
                    else:
                        await sync_to_async(redis_instance.srem)(
                            "online_users" if self.user.is_staff else "online_staff",
                            user_id
                        )

                users = await self.get_users_by_ids(online_ids)

            await self.send(text_data=json.dumps({
                "type": "online_users",
                "users": [
                    {
                        "id": str(u.id),
                        "name": f"{u.first_name} {u.last_name}".strip() or u.email,
                        "email": u.email,
                        "is_staff": u.is_staff
                    }
                    for u in users
                ]
            }))

        except Exception as e:
            logger.error(f"Error sending online list: {e}", exc_info=True)

    async def send_unread_messages(self):
        try:
            unread_messages = await self.get_unread_messages()
            for msg in unread_messages:
                sender_info = await self.get_user_info(msg.sender_id)
                
                message_data = {
                    "type": "chat_message" if msg.message_type != "IMAGE" else "image_message",
                    "message": msg.message,
                    "message_id": msg.mid,
                    "sender": str(msg.sender_id),
                    "sender_name": sender_info["name"],
                    "sender_email": sender_info["email"],
                    "timestamp": msg.timestamp.isoformat(),
                    "is_read": False,
                    "status": "delivered",
                    "unread": True
                }
                
                if msg.message_type == "IMAGE":
                    message_data["image"] = msg.image
                
                await self.send(text_data=json.dumps(message_data))
        except Exception as e:
            logger.error(f"Error sending unread messages: {e}", exc_info=True)

    async def is_recipient_online(self):
        recipient_id = await self.get_recipient_id()
        counter = ConnectionCounter(recipient_id, not self.user.is_staff)
        online = await counter.is_online()
        return online, recipient_id


    @database_sync_to_async
    def get_sender_details(self):
        return {
            "name": f"{self.user.first_name} {self.user.last_name}".strip() or self.user.email,
            "email": self.user.email
        }

    @database_sync_to_async
    def get_user_info(self, user_id):
        try:
            user = CustomUser.objects.get(id=user_id)
            return {
                "name": f"{user.first_name} {user.last_name}".strip() or user.email,
                "email": user.email
            }
        except CustomUser.DoesNotExist:
            return {"name": "Unknown User", "email": ""}

    @database_sync_to_async
    def get_users_by_ids(self, ids):
        if not ids:
            return []
        return list(CustomUser.objects.filter(id__in=ids))

    @database_sync_to_async
    def get_unread_messages(self):
        return list(
            Message.objects.filter(
                conversation=self.conversation,
                is_read=False
            )
            .exclude(sender=self.user)
            .select_related('sender')
            .order_by("timestamp")
        )

    @database_sync_to_async
    def save_message(self, text):
        message = Message.objects.create(
            conversation=self.conversation,
            sender=self.user,
            message=text,
            is_read=False
        )
        logger.info(f"Message saved to database: ID={message.mid}, sender={self.user.id}, text='{text}'")
        return message

    @database_sync_to_async
    def get_recipient_id(self):
        if self.user.is_staff:
            return self.conversation.user.id
        staff = CustomUser.objects.filter(is_staff=True).first()
        return staff.id if staff else None

    @database_sync_to_async
    def mark_messages_as_read(self, user_id):
        updated = Message.objects.filter(
            conversation=self.conversation,
            is_read=False
        ).exclude(
            sender_id=user_id
        ).update(is_read=True)
        logger.debug(f"Marked {updated} messages as read for user {user_id}")
        return updated

    @database_sync_to_async
    def get_conversation_by_id(self, cid):
        try:
            return Conversation.objects.select_related('user').get(cid=cid)
        except Conversation.DoesNotExist:
            return None

    @database_sync_to_async
    def has_access(self):
        return self.user.is_staff or self.user == self.conversation.user
    
    async def upgrade_message_status(self, online_user_id):
        try:
            recipient_id = await self.get_recipient_id()
            
            if str(online_user_id) == str(recipient_id):
                await self.channel_layer.group_send(
                    self.room_name,
                    {
                        "type": "status_upgrade_handler",
                        "recipient_id": str(online_user_id),
                        "new_status": "delivered"
                    }
                )
                logger.info(f"Upgraded message status to delivered for recipient {online_user_id}")
        except Exception as e:
            logger.error(f"Error upgrading message status: {e}", exc_info=True)
    
    async def status_upgrade_handler(self, event):
        await self.send(text_data=json.dumps({
            "type": "status_upgrade",
            "recipient_id": event["recipient_id"],
            "new_status": event["new_status"]
        }))


class NotificationConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.user = self.scope["user"]
        self.group_name = f"user_{self.user.id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def notify(self, event):
        await self.send(text_data=json.dumps({
            "type": "notification", 
            "notification": event["notification"]
        }))


    async def receive(self, text_data):
        if not text_data:
            return

        try:
            data = json.loads(text_data)
            msg_type = data.get("type")

            if msg_type == "read_notification":
                notification_id = data.get("id")  
                if notification_id:
                    await self.handle_read_receipt(notification_id)
        except Exception as e:
            pass


    async def handle_read_receipt(self, notification_id):
        try:
            updated_count = await self.mark_notification_read(notification_id)
            if updated_count > 0:
                await self.channel_layer.group_send(
                    self.group_name,
                    {
                        "type": "read_receipt_handler",
                        "notification_id": notification_id
                    }
                )
        except Exception as e:
            pass
            


    @database_sync_to_async
    def mark_notification_read(self, notification_id):
        updated = Notification.objects.filter(
            nid=notification_id,
        ).update(is_read=True)
        return updated


    async def read_receipt_handler(self, event):
        notification_id = event.get("notification_id")
        await self.send(text_data=json.dumps({
            "type": "read",
            "notification_id": notification_id
        }))
