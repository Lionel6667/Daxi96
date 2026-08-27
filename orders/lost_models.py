from django.db import models
from django.conf import settings
from orders.models import Order

class LostObject(models.Model):
    STATUS_CHOICES = [
        ('reported', 'Signalé'),
        ('found', 'Retrouvé'),
        ('returned', 'Rendu'),
    ]

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='lost_objects')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    description = models.TextField(verbose_name='Description de l\'objet')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='reported')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Objet perdu - Commande #{self.order.id}"
