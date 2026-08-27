from django.urls import re_path
from .consumers import FirebaseConsumer

websocket_urlpatterns = [
    re_path(r'ws/fb/', FirebaseConsumer.as_asgi()),
]
