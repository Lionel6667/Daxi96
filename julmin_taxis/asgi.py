import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'julmin_taxis.settings')

from django.core.asgi import get_asgi_application

django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter
from channels.sessions import SessionMiddlewareStack
from julmin_taxis.channels_auth import JWTAuthMiddlewareStack
import chat.routing
import orders.routing
import firebase_db.routing

application = ProtocolTypeRouter({
    'http': django_asgi_app,
    'websocket': SessionMiddlewareStack(
        JWTAuthMiddlewareStack(
            URLRouter(
                firebase_db.routing.websocket_urlpatterns +
                chat.routing.websocket_urlpatterns +
                orders.routing.websocket_urlpatterns
            )
        )
    ),
})
