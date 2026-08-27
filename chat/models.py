from django.db import models
from django.conf import settings


class ChatSession(models.Model):
    """AI/Support chat session for a user."""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='chat_sessions',
        null=True, blank=True
    )
    guest_id = models.CharField(max_length=100, blank=True)
    is_escalated = models.BooleanField(default=False)
    is_resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Session de chat'
        verbose_name_plural = 'Sessions de chat'
        ordering = ['-updated_at']

    def __str__(self):
        identifier = self.user or self.guest_id
        return f"Session #{self.pk} - {identifier}"


class ChatMessage(models.Model):
    """Individual message in a chat session."""
    ROLE_CHOICES = [
        ('user', 'Utilisateur'),
        ('assistant', 'Assistant IA'),
        ('admin', 'Admin'),
    ]

    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    content = models.TextField()
    is_read = models.BooleanField(default=False)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Message'
        verbose_name_plural = 'Messages'
        ordering = ['timestamp']

    def __str__(self):
        return f"[{self.session}] {self.role}: {self.content[:50]}"
