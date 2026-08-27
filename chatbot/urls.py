from django.urls import path
from . import views

urlpatterns = [
    path('message/', views.ChatbotMessageView.as_view(), name='chatbot-message'),
    path('history/<int:session_id>/', views.ChatHistoryView.as_view(), name='chat-history'),
    path('admin/sessions/', views.AdminChatSessionsView.as_view(), name='admin-chat-sessions'),
    path('admin/sessions/<int:session_id>/resolve/', views.AdminResolveChatView.as_view(), name='admin-chat-resolve'),
    path('admin/sessions/<int:session_id>/reply/', views.AdminReplyChatView.as_view(), name='admin-chat-reply'),
                                                 
    path('escalations/', views.EscalationsView.as_view(), name='escalations'),
    path('escalations/<int:session_id>/resolve/', views.ResolveEscalationView.as_view(), name='resolve-escalation'),
]
