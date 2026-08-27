from django.urls import path, re_path
from .views import FirebaseNodeView, FirebaseTransactionView, FirebasePushKeyView

urlpatterns = [
    re_path(r'^push-key/(?P<path>.*)$', FirebasePushKeyView.as_view(), name='firebase-push-key'),
    re_path(r'^transaction/(?P<path>.*)$', FirebaseTransactionView.as_view(), name='firebase-transaction'),
    re_path(r'^(?P<path>.*)$', FirebaseNodeView.as_view(), name='firebase-node'),
]
