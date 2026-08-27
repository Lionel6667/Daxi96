from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import ChatSession, ChatMessage


class ChatSessionListView(APIView):
    """List user's chat sessions."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        sessions = ChatSession.objects.filter(user=request.user).order_by('-updated_at')[:20]
        data = [{
            'id': s.pk,
            'is_escalated': s.is_escalated,
            'is_resolved': s.is_resolved,
            'created_at': s.created_at,
            'updated_at': s.updated_at,
            'message_count': s.messages.count(),
        } for s in sessions]
        return Response(data)
