from django.urls import path
from .views import ConversationView, MessageView, UploadImageView, PrivateImageProxyView, NotificationView

urlpatterns = [
    path('conversation/', ConversationView.as_view(), name="conversation"),
    path('conversation/<uuid:uuid>/messages/', MessageView.as_view(), name="messages"),
    path('upload-image/', UploadImageView.as_view(), name="image-upload"),
    path('signedimage/', PrivateImageProxyView.as_view(), name='signedimage'),
    path('notifications/', NotificationView.as_view(), name='notification-view'),
    path('notifications/<int:id>/', NotificationView.as_view(), name='notification-read-view')

]