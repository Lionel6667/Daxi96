from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/orders/(?P<order_id>\d+)/$', consumers.OrderConsumer.as_asgi()),
    re_path(r'ws/admin/orders/$', consumers.AdminOrderConsumer.as_asgi()),
    re_path(r'ws/driver/(?P<driver_id>\d+)/$', consumers.DriverConsumer.as_asgi()),
    re_path(r'ws/enterprise/(?P<enterprise_id>\d+)/$', consumers.EnterpriseOrderConsumer.as_asgi()),
    re_path(r'ws/track/(?P<token>[\w-]+)/$', consumers.TrackShareConsumer.as_asgi()),
    re_path(r'ws/user/$', consumers.UserConsumer.as_asgi()),
]
