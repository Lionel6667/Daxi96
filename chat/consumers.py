import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async


class ChatConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer for real-time chat — persists messages to ChatMessage."""

    async def connect(self):
        user = self.scope.get('user')
        if not user or not user.is_authenticated:
            await self.close()
            return

        self.user_id = user.pk
        self.group_name = f'chat_user_{self.user_id}'

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        if user.is_staff:
            await self.channel_layer.group_add('chat_admin', self.channel_name)

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)
            user = self.scope.get('user')
            if user and user.is_staff:
                await self.channel_layer.group_discard('chat_admin', self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        content = (data.get('content') or data.get('message') or '').strip()
        session_id = data.get('session_id')
        if not content or not session_id:
            return

        saved = await self._save_message(session_id, content)
        if not saved:
            return

        payload = {
            'type': 'message',
            'session_id': session_id,
            'role': saved['role'],
            'content': saved['content'],
            'timestamp': saved['timestamp'],
        }
        await self.channel_layer.group_send(
            self.group_name,
            {'type': 'chat_message', 'data': payload},
        )
        if self.scope.get('user') and not self.scope['user'].is_staff:
            await self.channel_layer.group_send(
                'chat_admin',
                {'type': 'chat_message', 'data': payload},
            )

    @database_sync_to_async
    def _save_message(self, session_id, content):
        from chat.models import ChatSession, ChatMessage
        user = self.scope.get('user')
        try:
            session = ChatSession.objects.get(pk=int(session_id))
        except (ChatSession.DoesNotExist, ValueError):
            return None
        if session.user_id and session.user_id != user.pk and not user.is_staff:
            return None
        role = 'admin' if user.is_staff else 'user'
        msg = ChatMessage.objects.create(session=session, role=role, content=content)
        session.save(update_fields=['updated_at'])
        return {
            'role': role,
            'content': content,
            'timestamp': msg.timestamp.isoformat(),
        }

    async def chat_message(self, event):
        await self.send(text_data=json.dumps(event['data']))
