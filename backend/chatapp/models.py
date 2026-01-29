from django.db import models
from django.utils.text import slugify
from users.models import CustomUser
import uuid
# Create your models here.

class Conversation(models.Model):
    cid = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(CustomUser,on_delete=models.CASCADE,related_name="conversations")
    slug = models.SlugField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user"],
                name="only_one_conversation_per_user"
            )
        ]
    
    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = f"{slugify(self.user.first_name)}-{slugify(self.user.last_name)}-{self.user.id}"
        super().save(*args, **kwargs)


    
class Message(models.Model):
    MESSAGE_TYPES = [
        ("TEXT", 'Text'),
        ("IMAGE", 'Image')
    ]
    mid = models.AutoField(primary_key=True)
    conversation = models.ForeignKey(Conversation,on_delete=models.CASCADE,related_name="messages")
    sender = models.ForeignKey(CustomUser,on_delete=models.CASCADE,related_name="sent_messages")
    is_read = models.BooleanField(default=False)
    message = models.TextField(null=True, blank=True)
    image = models.URLField(null=True, blank=True)
    message_type = models.CharField(choices=MESSAGE_TYPES, default="TEXT", max_length=10)
    timestamp = models.DateTimeField(auto_now_add=True) 

    def __str__(self):
        return self.message
    
    class Meta:
        ordering = ['timestamp']

class Notification(models.Model):
    nid = models.AutoField(primary_key=True)
    notification = models.TextField()   
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.notification