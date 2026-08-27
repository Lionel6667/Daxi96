from django.urls import path
from . import views

urlpatterns = [
    path('sessions/', views.ChatSessionListView.as_view(), name='chat-sessions'),
]
