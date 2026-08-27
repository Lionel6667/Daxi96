from django.db import models
from django.conf import settings
from django.utils import timezone
from django.core.validators import MinValueValidator, MaxValueValidator
from decimal import Decimal


class Order(models.Model):
    STATUS_CHOICES = [
        ('pending', 'En attente'),
        ('price_proposed', 'Prix proposé'),
        ('price_confirmed', 'Prix confirmé'),
        ('driver_assigned', 'Chauffeur assigné'),
        ('on_way', 'En route'),
        ('arrived', 'Arrivé'),
        ('in_progress', 'Course en cours'),
        ('waiting_return', 'Attente retour'),
        ('completed', 'Terminé'),
        ('cancelled', 'Annulé'),
    ]

    ROUND_TRIP_PHASE_CHOICES = [
        ('', '—'),
        ('outbound', 'Aller'),
        ('waiting', 'Attente'),
        ('return', 'Retour'),
    ]

    VEHICLE_TYPE_CHOICES = [
        ('economy', 'Économique'),
        ('premium', 'Premium'),
        ('suv', 'SUV'),
        ('van', 'Van'),
    ]

                 
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='orders'
    )
    guest_id = models.CharField(max_length=100, blank=True)
    firebase_uid = models.CharField(max_length=100, blank=True, db_index=True)                           
    firebase_user_id = models.CharField(max_length=20, blank=True)                                  
    firebase_table = models.CharField(max_length=50, blank=True)                                                
    client_name = models.CharField(max_length=200, verbose_name='Nom client', blank=True, default='Client')
    client_email = models.EmailField(verbose_name='Email client', blank=True)
    client_phone = models.CharField(max_length=20, verbose_name='Téléphone client', blank=True)

                  
    pickup = models.TextField(verbose_name='Lieu de départ', blank=True)
    destination = models.TextField(verbose_name='Destination', blank=True)
    pickup_lat = models.FloatField(null=True, blank=True)
    pickup_lng = models.FloatField(null=True, blank=True)
    destination_lat = models.FloatField(null=True, blank=True)
    destination_lng = models.FloatField(null=True, blank=True)
    date = models.DateField(verbose_name='Date', null=True, blank=True)
    time = models.TimeField(verbose_name='Heure', null=True, blank=True)
    vehicle_type = models.CharField(max_length=20, choices=VEHICLE_TYPE_CHOICES, default='economy')
    notes = models.TextField(blank=True, verbose_name='Notes')
    description = models.TextField(blank=True)                                 
    service_plan = models.CharField(max_length=20, blank=True)
    trip_type = models.CharField(max_length=20, blank=True, default='one_way')
    passengers = models.PositiveIntegerField(default=1, verbose_name='Nombre de passagers')
    round_trip_wait_minutes = models.PositiveIntegerField(
        default=0, verbose_name='Attente aller-retour (minutes)',
    )
    round_trip_allow_driver_other_rides = models.BooleanField(
        default=False,
        verbose_name='Chauffeur autorisé autres courses si attente ≥ 30 min',
    )
    round_trip_phase = models.CharField(
        max_length=20, blank=True, default='',
        choices=ROUND_TRIP_PHASE_CHOICES,
        verbose_name='Phase aller-retour',
    )
    round_trip_wait_started_at = models.DateTimeField(
        null=True, blank=True, verbose_name='Début attente retour',
    )
    return_started_at = models.DateTimeField(
        null=True, blank=True, verbose_name='Début trajet retour',
    )
    waiting_return_at = models.DateTimeField(
        null=True, blank=True, verbose_name='Arrivée à destination (aller)',
    )
    round_trip_pickup_requested_at = models.DateTimeField(
        null=True, blank=True, verbose_name='Client a demandé le retour',
    )
    round_trip_pickup_request_dismissed_at = models.DateTimeField(
        null=True, blank=True, verbose_name='Alerte retour fermée par chauffeur',
    )

                                                              
    driver_name = models.CharField(max_length=200, blank=True)
    driver_phone = models.CharField(max_length=20, blank=True)
    driver_photo_url = models.TextField(blank=True)

                      
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True,
                                validators=[MinValueValidator(Decimal('0.00'))])
    price_confirmed = models.BooleanField(default=False)
    price_email_sent = models.BooleanField(default=False)

             
    PAYMENT_METHOD_CHOICES = [
        ('card', 'Carte bancaire'),
        ('moncash', 'MonCash'),
        ('in_person', 'Payer le chauffeur directement'),
    ]
    PAYMENT_STATUS_CHOICES = [
        ('pending', 'En attente'),
        ('paid', 'Payé'),
        ('failed', 'Échoué'),
        ('in_person', 'Paiement direct'),
    ]
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, blank=True)
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default='pending')
    contract_accepted_at = models.DateTimeField(null=True, blank=True, verbose_name='Contrat accepté le')
    nowpayments_invoice_id = models.CharField(max_length=100, blank=True)
    nowpayments_payment_id = models.CharField(max_length=100, blank=True)
                                                         
    driver_commission_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

                                                                                
    is_extended = models.BooleanField(default=False)
    extension_start_lat = models.FloatField(null=True, blank=True)
    extension_start_lng = models.FloatField(null=True, blank=True)
    extra_km_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, default=Decimal('0.00'))
    extra_km_rate = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)                        

                                                                               
    is_paused = models.BooleanField(default=False)
    pause_started_at = models.DateTimeField(null=True, blank=True)
    pause_accumulated_seconds = models.IntegerField(default=0)
    pause_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, default=Decimal('0.00'))
    pause_rate_snapshot = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)                

                       
    driver = models.ForeignKey(
        'drivers.Driver',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='orders'
    )

                          
    enterprise = models.ForeignKey(
        'enterprises.Enterprise',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='orders'
    )
    enterprise_commission_pct = models.FloatField(null=True, blank=True,
                                                   validators=[MinValueValidator(0.0), MaxValueValidator(100.0)])

                               
    scheduled_at = models.DateTimeField(null=True, blank=True, verbose_name='Programmé pour')
    is_later = models.BooleanField(default=False, verbose_name='Commande programmée')
    client_gps_lat = models.FloatField(null=True, blank=True, verbose_name='GPS client lat')
    client_gps_lng = models.FloatField(null=True, blank=True, verbose_name='GPS client lng')
    client_gps_updated_at = models.DateTimeField(null=True, blank=True)
    meeting_lat = models.FloatField(null=True, blank=True, verbose_name='Lieu RDV lat (figé)')
    meeting_lng = models.FloatField(null=True, blank=True, verbose_name='Lieu RDV lng (figé)')
    meeting_relocate_prompted_at = models.DateTimeField(null=True, blank=True)
    meeting_relocate_dismissed = models.BooleanField(default=False, verbose_name='Alerte déplacement RDV ignorée')
    pickup_confirm_sent = models.BooleanField(default=False, verbose_name='Rappel RDV 1h envoyé')
    meeting_prompt_acknowledged = models.BooleanField(
        default=False,
        verbose_name='Client a répondu au rappel lieu de RDV',
    )

                                 
    pickup_coords_set_by_driver = models.BooleanField(default=False, verbose_name='Coords départ saisies par chauffeur')
    dest_coords_set_by_driver = models.BooleanField(default=False, verbose_name='Coords dest saisies par chauffeur')
    coords_placed_by = models.ForeignKey(
        'drivers.Driver',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='orders_coords_placed',
        verbose_name='Coords placées par (chauffeur)',
    )

                                                          
    share_token = models.CharField(max_length=48, unique=True, null=True, blank=True, db_index=True)
    public_code = models.CharField(
        max_length=16, unique=True, null=True, blank=True, db_index=True,
        verbose_name='Code public',
        help_text='Référence non séquentielle affichée client/entreprise (ex. DX-7K4M2Q9)',
    )

                
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    price_proposed_at = models.DateTimeField(null=True, blank=True)
    driver_assigned_at = models.DateTimeField(null=True, blank=True)
    on_way_at = models.DateTimeField(null=True, blank=True)
    arrived_at = models.DateTimeField(null=True, blank=True)
    in_progress_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

                        
    reminder_sent = models.BooleanField(default=False)
    completion_email_sent = models.BooleanField(default=False)

                                           
    sos_triggered_at = models.DateTimeField(null=True, blank=True, verbose_name='SOS déclenché le')
    SOS_BY_CHOICES = [('client', 'Client'), ('driver', 'Chauffeur')]
    sos_triggered_by = models.CharField(
        max_length=10, choices=SOS_BY_CHOICES, blank=True, verbose_name='SOS déclenché par',
    )

    class Meta:
        verbose_name = 'Commande'
        verbose_name_plural = 'Commandes'
        ordering = ['-created_at']

    def __str__(self):
        ref = self.public_code or f'#{self.pk}'
        return f"{ref} - {self.client_name}: {self.pickup} → {self.destination}"

    @property
    def ref_code(self):
        """Public-facing order reference (never expose sequential volume)."""
        if self.public_code:
            return self.public_code
        return f'DX-{self.pk}'

    @staticmethod
    def mint_public_code():
        import secrets
        alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
        for _ in range(40):
            code = 'DX-' + ''.join(secrets.choice(alphabet) for _ in range(7))
            if not Order.objects.filter(public_code=code).exists():
                return code
        import uuid
        return 'DX-' + uuid.uuid4().hex[:7].upper()

    def ensure_public_code(self):
        if self.public_code:
            return self.public_code
        self.public_code = Order.mint_public_code()
        self.save(update_fields=['public_code'])
        return self.public_code

    def save(self, *args, **kwargs):
        if not self.public_code:
            self.public_code = Order.mint_public_code()
        super().save(*args, **kwargs)

    def ensure_share_token(self):
        if self.share_token:
            return self.share_token
        import secrets
        token = secrets.token_urlsafe(24)[:32]
        while Order.objects.filter(share_token=token).exists():
            token = secrets.token_urlsafe(24)[:32]
        self.share_token = token
        self.save(update_fields=['share_token'])
        return token

    def update_status(self, new_status):
        """Update order status and set relevant timestamp."""
        valid_statuses = [s[0] for s in self.STATUS_CHOICES]
        if new_status not in valid_statuses:
            raise ValueError(f"Invalid status '{new_status}'. Must be one of: {valid_statuses}")
        self.status = new_status
        now = timezone.now()
        timestamp_map = {
            'price_proposed': 'price_proposed_at',
            'driver_assigned': 'driver_assigned_at',
            'on_way': 'on_way_at',
            'arrived': 'arrived_at',
            'in_progress': 'in_progress_at',
            'waiting_return': 'waiting_return_at',
            'completed': 'completed_at',
            'cancelled': 'cancelled_at',
        }
        if new_status in timestamp_map:
            setattr(self, timestamp_map[new_status], now)
        self.save()

    @property
    def is_active(self):
        return self.status not in ('completed', 'cancelled')

    @property
    def is_round_trip(self):
        tt = (self.trip_type or '').lower().strip()
        return tt in ('round_trip', 'aller-retour', 'aller retour') or 'retour' in tt

    @property
    def duration_minutes(self):
        """Calculate trip duration if completed."""
        if self.in_progress_at and self.completed_at:
            delta = self.completed_at - self.in_progress_at
            return int(delta.total_seconds() / 60)
        return None

    @property
    def total_price(self):
        """Prix total incluant pause et extension."""
        from decimal import Decimal as _D
        base = self.price or _D('0')
        extra = self.extra_km_price or _D('0')
        pause = self.pause_price or _D('0')
        if self.is_paused and self.pause_started_at and self.pause_rate_snapshot:
            elapsed = (timezone.now() - self.pause_started_at).total_seconds()
            total_secs = (self.pause_accumulated_seconds or 0) + elapsed
            intervals = total_secs / 300
            pause = (_D(str(self.pause_rate_snapshot)) * _D(str(intervals))).quantize(_D('0.01'))
        return (base + extra + pause).quantize(_D('0.01'))

    @property
    def distance_km(self):
        """Distance estimée départ → destination (km)."""
        if not all([self.pickup_lat, self.pickup_lng, self.destination_lat, self.destination_lng]):
            return None
        import math
        lat1, lon1 = math.radians(self.pickup_lat), math.radians(self.pickup_lng)
        lat2, lon2 = math.radians(self.destination_lat), math.radians(self.destination_lng)
        dlat, dlon = lat2 - lat1, lon2 - lon1
        a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        return round(6371 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)), 1)


class OrderMessage(models.Model):
    """Messages attached to an order (driver ↔ client chat)."""
    SENDER_TYPE_CHOICES = [
        ('user', 'Client'),
        ('driver', 'Chauffeur'),
        ('admin', 'Admin'),
        ('system', 'Système'),
    ]

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True
    )
    sender_type = models.CharField(max_length=10, choices=SENDER_TYPE_CHOICES)
    sender_name = models.CharField(max_length=200, blank=True)
    content = models.TextField(blank=True)
    image_url = models.URLField(blank=True, max_length=500)
    audio_url = models.URLField(blank=True, max_length=500)
    message_type = models.CharField(max_length=10, default='text')                        
    reply_to = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True, related_name='replies'
    )
    audio_duration_sec = models.PositiveSmallIntegerField(null=True, blank=True)
    is_read = models.BooleanField(default=False)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Message de commande'
        verbose_name_plural = 'Messages de commande'
        ordering = ['timestamp']

    def __str__(self):
        return f"[{self.order}] {self.sender_type}: {self.content[:50]}"


class LostObject(models.Model):
    STATUS_CHOICES = [
        ('reported', 'Signalé'),
        ('found', 'Retrouvé'),
        ('returned', 'Rendu'),
    ]

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='lost_objects')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True)
    description = models.TextField(verbose_name="Description de l'objet")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='reported')
    driver_handled = models.BooleanField(default=False, verbose_name='Traité par le chauffeur')
    driver_handled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Objet perdu - Commande #{self.order.id}"


class BlockedContact(models.Model):
    """Clients bloqués (compte ou invité) — empêche nouvelles commandes."""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='blocked_contacts',
    )
    email = models.EmailField(blank=True, db_index=True)
    phone = models.CharField(max_length=40, blank=True, db_index=True)
    guest_id = models.CharField(max_length=100, blank=True, db_index=True)
    client_name = models.CharField(max_length=200, blank=True)
    reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Contact bloqué'
        verbose_name_plural = 'Contacts bloqués'

    def __str__(self):
        return self.client_name or self.email or self.phone or self.guest_id or f'#{self.pk}'


def client_is_blocked(*, user=None, email='', phone='', guest_id=''):
    """Return True if this client must not place orders."""
    from accounts.models import CustomUser
    from django.db.models import Q

    if user and getattr(user, 'is_blocked', False):
        return True

    email = (email or '').strip()
    phone = (phone or '').strip()
    guest_id = (guest_id or '').strip()

    contact_q = Q()
    if email:
        contact_q |= Q(email__iexact=email)
    if phone:
        contact_q |= Q(phone=phone)
    if guest_id:
        contact_q |= Q(guest_id=guest_id)
    if contact_q and BlockedContact.objects.filter(contact_q).exists():
        return True

    user_q = Q(is_blocked=True)
    filters = Q()
    if email:
        filters |= Q(email__iexact=email)
    if phone:
        filters |= Q(phone=phone)
    if guest_id:
        filters |= Q(firebase_user_id=guest_id) | Q(firebase_uid=guest_id)
    if user:
        filters |= Q(pk=user.pk)
    if filters:
        return CustomUser.objects.filter(user_q & filters).exists()
    return False


class SystemConfig(models.Model):
    """Single-row table for admin-configurable rates.
    Access via SystemConfig.get() — creates default row if missing.
    """
                                                           
    wait_rate_per_5min = models.DecimalField(
        max_digits=8, decimal_places=2, default=Decimal('100.00'),
        verbose_name='Frais d\'attente par 5 min ($)',
    )
                                                          
    extra_km_rate = models.DecimalField(
        max_digits=8, decimal_places=2, default=Decimal('50.00'),
        verbose_name='Frais par km supplémentaire ($)',
    )
                                                                       
    usd_htg_rate = models.DecimalField(
        max_digits=8, decimal_places=2, default=Decimal('130.00'),
        verbose_name='Taux USD → HTG',
    )

    class Meta:
        verbose_name = 'Configuration système'
        verbose_name_plural = 'Configuration système'

    def __str__(self):
        return f"Config: {self.wait_rate_per_5min} $/5min · {self.extra_km_rate} $/km"

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class KnownPlace(models.Model):
    """Lieu validé manuellement (coords + libellé) — suggestions DAXI pour tous les formulaires."""
    KIND_CHOICES = [
        ('pickup', 'Départ'),
        ('dest', 'Destination'),
        ('both', 'Les deux'),
    ]
    SOURCE_CHOICES = [
        ('manual', 'Placé manuellement'),
        ('import', 'Import'),
        ('osm', 'OpenStreetMap'),
    ]
    label = models.CharField(max_length=500, verbose_name='Nom affiché')
    normalized_label = models.CharField(max_length=500, blank=True, default='', db_index=True)
    aliases = models.JSONField(default=list, blank=True)
    search_terms = models.JSONField(
        default=list, blank=True,
        help_text='Termes saisis par les clients avant correction — améliore la recherche',
    )
    lat = models.FloatField()
    lng = models.FloatField()
    kind = models.CharField(max_length=8, choices=KIND_CHOICES, default='both')
    source = models.CharField(max_length=12, choices=SOURCE_CHOICES, default='manual')
    validated_by = models.ForeignKey(
        'drivers.Driver', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='validated_places',
    )
    source_order = models.ForeignKey(
        'Order', null=True, blank=True, on_delete=models.SET_NULL,
        related_name='known_places_created',
    )
    use_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Lieu connu'
        verbose_name_plural = 'Lieux connus'
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['lat', 'lng']),
        ]
        constraints = [
            models.UniqueConstraint(fields=['lat', 'lng'], name='orders_knownplace_unique_coords'),
        ]

    def __str__(self):
        return f'{self.label} ({self.lat:.5f}, {self.lng:.5f})'

    def save(self, *args, **kwargs):
        from julmin_taxis.known_places_utils import normalize_place_name
        if self.label:
            self.normalized_label = normalize_place_name(self.label)[:500]
        super().save(*args, **kwargs)


class ClientPaymentDebt(models.Model):
    """Somme due par le client (souvent après annulation avec paiement espèces)."""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='payment_debts',
    )
    guest_id = models.CharField(max_length=100, blank=True, db_index=True)
    order = models.ForeignKey(
        'Order',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='payment_debts',
    )
    amount_usd = models.DecimalField(max_digits=10, decimal_places=2)
    reason = models.TextField(blank=True)
    is_paid = models.BooleanField(default=False)
    paid_at = models.DateTimeField(null=True, blank=True)
    payment_reference = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Dette client'
        verbose_name_plural = 'Dettes clients'
        ordering = ['-created_at']

    def __str__(self):
        who = self.user_id or self.guest_id or '?'
        return f'Dette {self.amount_usd}$ — {who}'


class SecurityLog(models.Model):
    """Journal d'audit sécurité / financier."""

    ACTION_CHOICES = [
        ('PRICE_CHANGE', 'Changement prix'),
        ('STATUS_CHANGE', 'Changement statut'),
        ('PAYMENT', 'Paiement'),
        ('REFUND', 'Remboursement'),
        ('WALLET', 'Wallet chauffeur'),
        ('DRIVER_BLOCK', 'Blocage chauffeur'),
        ('ACCESS_DENIED', 'Accès refusé'),
    ]

    ACTOR_CHOICES = [
        ('staff', 'Staff'),
        ('driver', 'Chauffeur'),
        ('client', 'Client'),
        ('enterprise', 'Entreprise'),
        ('guest', 'Guest'),
        ('gateway', 'Passerelle'),
        ('system', 'Système'),
        ('anonymous', 'Anonyme'),
    ]

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    action = models.CharField(max_length=32, choices=ACTION_CHOICES, db_index=True)
    actor_type = models.CharField(max_length=16, choices=ACTOR_CHOICES, default='anonymous')
    actor_id = models.CharField(max_length=64, blank=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='security_logs',
    )
    order = models.ForeignKey(
        'Order',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='security_logs',
    )
    old_value = models.TextField(blank=True)
    new_value = models.TextField(blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = 'Journal sécurité'
        verbose_name_plural = 'Journaux sécurité'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.created_at:%Y-%m-%d %H:%M} {self.action} {self.actor_type}:{self.actor_id}'

