from django.db import models
from django.conf import settings


class Notification(models.Model):
    """In-app notifications for users and drivers."""
    TYPE_CHOICES = [
        ('order_new', 'Nouvelle commande'),
        ('price_proposed', 'Prix proposé'),
        ('price_confirmed', 'Prix confirmé'),
        ('driver_assigned', 'Chauffeur assigné'),
        ('driver_on_way', 'Chauffeur en route'),
        ('driver_arrived', 'Chauffeur arrivé'),
        ('trip_started', 'Course démarrée'),
        ('trip_completed', 'Course terminée'),
        ('trip_cancelled', 'Course annulée'),
        ('reminder', 'Rappel'),
        ('system', 'Système'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
        null=True, blank=True
    )
    driver = models.ForeignKey(
        'drivers.Driver',
        on_delete=models.CASCADE,
        related_name='notifications',
        null=True, blank=True
    )
    order = models.ForeignKey(
        'orders.Order',
        on_delete=models.CASCADE,
        related_name='notifications',
        null=True, blank=True
    )
    notification_type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    title = models.CharField(max_length=200)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Notification'
        verbose_name_plural = 'Notifications'
        ordering = ['-created_at']

    def __str__(self):
        recipient = self.user or self.driver
        return f"{self.notification_type} → {recipient}"


class PushDevice(models.Model):
    """Token FCM/APNs d'un appareil — utilisateur, invité ou chauffeur (multi-appareils)."""
    token = models.CharField(max_length=512, unique=True, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='push_devices',
    )
    guest_id = models.CharField(max_length=64, blank=True, db_index=True)
    driver = models.ForeignKey(
        'drivers.Driver',
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='push_devices',
    )
    enterprise = models.ForeignKey(
        'enterprises.Enterprise',
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='push_devices',
    )
    platform = models.CharField(max_length=20, blank=True)
    device_id = models.CharField(max_length=80, blank=True, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Appareil push'
        verbose_name_plural = 'Appareils push'

    def __str__(self):
        if self.user_id:
            return f'Push user#{self.user_id}'
        if self.driver_id:
            return f'Push driver#{self.driver_id}'
        if self.enterprise_id:
            return f'Push enterprise#{self.enterprise_id}'
        return f'Push guest:{self.guest_id or "?"}'
