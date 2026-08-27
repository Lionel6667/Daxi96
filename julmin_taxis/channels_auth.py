"""Middleware Channels — JWT staff via ?token= sur WebSocket."""
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware


@database_sync_to_async
def _user_from_token(token):
    from julmin_taxis.staff_auth import staff_user_from_token
    return staff_user_from_token(token)


class JWTQueryAuthMiddleware(BaseMiddleware):
    """Enrichit scope['user'] depuis le JWT passé en query string."""

    async def __call__(self, scope, receive, send):
        if scope.get('type') == 'websocket':
            user = scope.get('user')
            authenticated = bool(
                user and getattr(user, 'is_authenticated', False)
            )
            if not authenticated:
                qs = parse_qs(scope.get('query_string', b'').decode())
                token = (qs.get('token') or [None])[0]
                if token:
                    scope['user'] = await _user_from_token(token)
        return await super().__call__(scope, receive, send)


def JWTAuthMiddlewareStack(inner):
    from channels.auth import AuthMiddlewareStack
    return JWTQueryAuthMiddleware(AuthMiddlewareStack(inner))
