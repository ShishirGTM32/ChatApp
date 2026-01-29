from rest_framework import status
from rest_framework.response import Response
from .serializers import MessageSerializer, ConversationSerializer, NotificationSerializer
from .models import Message, Conversation, Notification
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q, Exists, OuterRef, Max, Count, Prefetch
from .pagination import MessageInfiniteScrollPagination
from users.serializers import UserSerializer
from django.http import HttpResponse
from django.core.cache import cache
from django.db import transaction
from rest_framework.parsers import MultiPartParser, FormParser
from .cloud import B2FileManager
from django.shortcuts import get_object_or_404
from django.http import Http404

class ConversationView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        if request.user.is_staff:
            conversations = Conversation.objects.filter(
                Exists(Message.objects.filter(conversation=OuterRef('pk')))
            ).select_related('user').annotate(
                last_message_time=Max('messages__timestamp'),
                unread_count=Count(
                    'messages',
                    filter=Q(messages__is_read=False) & ~Q(messages__sender=request.user)
                )
            ).order_by('-last_message_time') 
            
            data = []
            for conv in conversations:
                conv_data = ConversationSerializer(conv).data
                conv_data['user_details'] = UserSerializer(conv.user).data
                
                user_status = cache.get(f"user:{conv.user.id}:status", "offline")
                conv_data['is_online'] = (user_status == "online")
                
                conv_data['unread_count'] = conv.unread_count
                
                data.append(conv_data)
            
            return Response(data, status=status.HTTP_200_OK)
        else:
            conversation = Conversation.objects.filter(
                user=request.user
            ).filter(
                Exists(Message.objects.filter(conversation=OuterRef('pk')))
            ).first()
            
            if not conversation:
                return Response(
                    {"detail": "No conversation started yet"}, 
                    status=status.HTTP_404_NOT_FOUND
                )
            
            serializer = ConversationSerializer(conversation)
            response_data = serializer.data
            
            from users.models import CustomUser
            staff_users = CustomUser.objects.filter(is_staff=True)
            is_any_staff_online = False
            for staff in staff_users:
                staff_status = cache.get(f"user:{staff.id}:status", "offline")
                if staff_status == "online":
                    is_any_staff_online = True
                    break
            
            response_data['is_online'] = is_any_staff_online
            
            return Response(response_data, status=status.HTTP_200_OK)

    def post(self, request):
        if request.user.is_staff:
            return Response(
                {"detail": "Staff cannot start conversations. Only users can."}, 
                status=status.HTTP_403_FORBIDDEN
            )

        existing_conv = Conversation.objects.filter(user=request.user).first()
        if existing_conv:
            return Response(
                {"detail": "Your conversation already exists.", "cid": existing_conv.cid}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        conv = Conversation.objects.create(user=request.user)
        serializer = ConversationSerializer(conv)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class MessageView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, uuid):
        conversation = Conversation.objects.filter(cid=uuid).first()
        if not conversation:
            return Response(
                {"detail": "Conversation does not exist"}, 
                status=status.HTTP_404_NOT_FOUND
            )

        if not (request.user.is_staff or conversation.user == request.user):
            return Response(
                {"detail": "You do not have access to this conversation"}, 
                status=status.HTTP_403_FORBIDDEN
            )

        messages = Message.objects.filter(
            conversation=conversation
        ).select_related('sender')

        search_query = request.query_params.get('search', None)
        if search_query:
            messages = messages.filter(Q(message__icontains=search_query))
        
        pagination = MessageInfiniteScrollPagination()
        paginated = pagination.paginate_queryset(messages, request)
        serializer = MessageSerializer(paginated, many=True)
        
        return pagination.get_paginated_response(serializer.data)
    
class UploadImageView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    @transaction.atomic
    def post(self, request):
        image_file = request.FILES.get("image")
        if not image_file:
            return Response({"error": "No image file provided"}, status=400)

        user_id = request.user.id  

        success, msg, file_data = B2FileManager.validate_and_upload(image_file, user_id)
        if not success:
            return Response({"error": msg}, status=400)

        return Response({
            "message": "Image uploaded successfully",
            "url": file_data["b2_file_name"],
            "public_id": file_data["b2_file_name"],
            "mime_type": file_data["mime_type"],
            "file_size": file_data["file_size"]
        }, status=status.HTTP_200_OK)

class PrivateImageProxyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        public_id = request.data.get("public_id")
        if not public_id:
            return Response({"error": "public_id is required"}, status=400)

        url_data = B2FileManager.generate_signed_image_url(public_id, duration_seconds=3600)
        if not url_data:
            return Response({"error": "Failed to generate signed URL"}, status=500)

        return Response({
            "signed_url": url_data["signed_url"],
            "expires_in": url_data["expires_in"]
        })



class NotificationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        notificaton = Notification.objects.filter(user = request.user)
        read = request.query_params.get('type', None)
        if read:
            notificaton = notificaton.filter(is_read=read)
        serializer = NotificationSerializer(notificaton, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def put(self, request, id):
        try:
            notification = get_object_or_404(Notification, pk=id, user=request.user)
        except Http404:
            return Response("Not authorized for this operation", status=status.HTTP_401_UNAUTHORIZED)
        notification.is_read = True
        notification.save()
        serializer = NotificationSerializer(notification)
        return Response(serializer.data, status=status.HTTP_202_ACCEPTED)   
    
