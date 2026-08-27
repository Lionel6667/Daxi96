from django.db import models
import uuid


class FirebaseNode(models.Model):
    """
    Generic key-value store that emulates Firebase Realtime Database.
    Each node represents a path in the Firebase tree.
    """
    path = models.TextField(unique=True, db_index=True)                              
    data = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'firebase_nodes'
        indexes = [
            models.Index(fields=['path']),
        ]

    def __str__(self):
        return self.path


class FirebaseIdempotencyKey(models.Model):
    """Used for idempotent order creation."""
    key = models.TextField(unique=True)
    order_id = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'firebase_idempotency'
