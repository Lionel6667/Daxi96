import random
import string
from django.db import models
from django.utils import timezone


def _gen_code():
    chars = string.ascii_uppercase + string.digits
    for _ in range(100):
        code = 'ENT' + ''.join(random.choices(chars, k=7))
        if not Enterprise.objects.filter(affiliate_code=code).exists():
            return code
    return 'ENT' + ''.join(random.choices(chars, k=10))


class Enterprise(models.Model):
    STATUS_CHOICES = [
        ('pending',  'En attente'),
        ('approved', 'Approuvé'),
        ('rejected', 'Refusé'),
    ]
    MODE_CHOICES = [
        ('shared_code', 'Code partagé — clients commandent eux-mêmes'),
        ('self_order',  'Commande directe — je commande pour mes clients'),
    ]

              
    name               = models.CharField(max_length=200, verbose_name="Nom de l'entreprise")
    phone              = models.CharField(max_length=30,  verbose_name='Téléphone')
    email              = models.EmailField(verbose_name='Email')
    password_hash      = models.CharField(max_length=256)

                       
    status             = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    commission_percent = models.FloatField(default=0,    verbose_name='Commission (%)')
    affiliate_code     = models.CharField(max_length=30, unique=True, blank=True)
    mode               = models.CharField(max_length=20, choices=MODE_CHOICES, default='shared_code')

           
    presentation       = models.TextField(blank=True, verbose_name='Présentation')
    admin_notes        = models.TextField(blank=True, verbose_name='Notes admin')

                                                        
    address_lat = models.FloatField(null=True, blank=True, verbose_name='Latitude')
    address_lng = models.FloatField(null=True, blank=True, verbose_name='Longitude')
    address_label = models.CharField(max_length=500, blank=True, default='', verbose_name='Adresse affichée')
    LOCATION_STATUS_CHOICES = [
        ('unset', 'Non défini'),
        ('set', 'Défini'),
        ('admin_help', 'Aide admin demandée'),
    ]
    location_status = models.CharField(
        max_length=20, choices=LOCATION_STATUS_CHOICES, default='unset',
        verbose_name='Statut emplacement',
    )
    location_help_message = models.TextField(blank=True, default='', verbose_name='Message aide emplacement')
    location_help_requested_at = models.DateTimeField(null=True, blank=True)
    location_set_at = models.DateTimeField(null=True, blank=True)

                
    link_clicks         = models.PositiveIntegerField(default=0, verbose_name='Clics sur le lien affilié')
    created_at         = models.DateTimeField(auto_now_add=True)
    approved_at        = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Entreprise partenaire'
        verbose_name_plural = 'Entreprises partenaires'
        ordering = ['-created_at']
        unique_together = [['email', 'name']]

    def save(self, *args, **kwargs):
        if not self.affiliate_code:
            self.affiliate_code = _gen_code()
        super().save(*args, **kwargs)

    def get_affiliate_url(self):
        from django.conf import settings
        base = getattr(settings, 'SITE_URL', 'http://localhost:8000')
        return f"{base}/?ref={self.affiliate_code}"

    def total_orders(self):
        return self.orders.count()

    def total_earnings(self):
        from decimal import Decimal
        total = sum(
            (o.price or 0) * (o.enterprise_commission_pct or 0) / 100
            for o in self.orders.filter(status='completed')
        )
        return round(total, 2)

    def has_location(self):
        return (
            self.location_status == 'set'
            and self.address_lat is not None
            and self.address_lng is not None
        )

    def __str__(self):
        return f"{self.name} ({self.get_status_display()})"


class EnterpriseWithdrawal(models.Model):
    """Demande de retrait commission entreprise (MonCash ou NatCash)."""
    PAYOUT_CHOICES = [
        ('moncash', 'MonCash'),
        ('natcash', 'NatCash'),
    ]
    STATUS_CHOICES = [
        ('pending', 'En attente'),
        ('paid', 'Payé'),
        ('rejected', 'Refusé'),
    ]
    enterprise = models.ForeignKey(Enterprise, on_delete=models.CASCADE, related_name='withdrawals')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    payout_method = models.CharField(max_length=10, choices=PAYOUT_CHOICES, default='moncash')
    phone = models.CharField(max_length=30)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    admin_note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Retrait entreprise'
        verbose_name_plural = 'Retraits entreprise'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.enterprise.name} — {self.amount} $ ({self.get_payout_method_display()})"


class EnterpriseChatMessage(models.Model):
    enterprise    = models.ForeignKey(Enterprise, on_delete=models.CASCADE, related_name='chat_messages')
    message       = models.TextField()
    is_from_admin = models.BooleanField(default=False)
    is_read       = models.BooleanField(default=False)
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        who = 'Admin' if self.is_from_admin else self.enterprise.name
        return f"[{who}] {self.message[:40]}"
