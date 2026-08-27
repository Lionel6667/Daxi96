from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from decimal import Decimal

from julmin_taxis.cloudinary_storage import CloudinaryMediaStorage

_drv_photo_storage = CloudinaryMediaStorage(folder='daxi/drivers/profile')
_drv_vehicle_ref_storage = CloudinaryMediaStorage(folder='daxi/drivers/vehicle_reference')
_drv_vehicle_pro_storage = CloudinaryMediaStorage(folder='daxi/drivers/vehicle_professional')
_drv_license_storage = CloudinaryMediaStorage(folder='daxi/drivers/licenses')


class Driver(models.Model):
    STATUS_CHOICES = [
        ('available', 'Disponible'),
        ('busy', 'Occupé'),
        ('offline', 'Hors ligne'),
    ]

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='driver_profile',
        null=True, blank=True
    )
                            
    firebase_uid = models.CharField(max_length=100, blank=True, db_index=True)
    full_name = models.CharField(max_length=200, blank=True)                         
    firstname = models.CharField(max_length=100, verbose_name='Prénom', blank=True)
    lastname = models.CharField(max_length=100, verbose_name='Nom', blank=True)
    email = models.EmailField(unique=True, blank=True, null=True)
    phone = models.CharField(max_length=20, verbose_name='Téléphone', blank=True)
    city = models.CharField(max_length=100, blank=True)
    photo = models.ImageField(upload_to='drivers/', blank=True, null=True, storage=_drv_photo_storage)
    photo_base64 = models.TextField(blank=True)                          
    vehicle = models.CharField(max_length=100, verbose_name='Véhicule', blank=True)
    car_brand = models.CharField(max_length=50, blank=True, verbose_name='Marque')
    car_model = models.CharField(max_length=50, blank=True, verbose_name='Modèle')
    car_year = models.CharField(max_length=4, blank=True, verbose_name='Année')
    car_image_url = models.TextField(
        blank=True,
        verbose_name='Image voiture (URL legacy)',
        help_text='URL publique legacy — préférer vehicle_professional_photo',
    )
    vehicle_reference_photo = models.ImageField(
        upload_to='drivers/vehicle_reference/',
        blank=True,
        null=True,
        storage=_drv_vehicle_ref_storage,
        verbose_name='Photo référence véhicule (chauffeur)',
        help_text='Photo envoyée par le chauffeur à l\'inscription — admin uniquement',
    )
    vehicle_professional_photo = models.ImageField(
        upload_to='drivers/vehicle_professional/',
        blank=True,
        null=True,
        storage=_drv_vehicle_pro_storage,
        verbose_name='Photo professionnelle véhicule (public)',
        help_text='Photo officielle uploadée par l\'admin — affichée publiquement',
    )
    driving_license = models.ImageField(
        upload_to='licenses/', blank=True, null=True, storage=_drv_license_storage,
        verbose_name='Permis de conduire',
    )
    oavct_insurance = models.ImageField(
        upload_to='licenses/', blank=True, null=True, storage=_drv_license_storage,
        verbose_name='OAVCT',
    )
    dgi_card = models.ImageField(
        upload_to='licenses/', blank=True, null=True, storage=_drv_license_storage,
        verbose_name='Carte DGI',
    )
    tint_permit = models.ImageField(
        upload_to='licenses/', blank=True, null=True, storage=_drv_license_storage,
        verbose_name='Permis Teinte',
    )
    plate = models.CharField(max_length=20, verbose_name='Plaque', blank=True)
    password_hash = models.CharField(max_length=64, blank=True)                                   
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='offline')
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    location_updated_at = models.DateTimeField(null=True, blank=True, verbose_name='Dernière position GPS')
    status_updated_at = models.DateTimeField(null=True, blank=True, verbose_name='Dernier changement de statut')
    last_seen_at = models.DateTimeField(
        null=True, blank=True, verbose_name='Dernière activité',
        help_text='Dernière connexion GPS ou ouverture de l\'application chauffeur',
    )
    rating = models.FloatField(default=0.0)
    rating_count = models.PositiveIntegerField(default=0)
    total_earnings = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    completed_trips = models.PositiveIntegerField(default=0)
                                                                                                        
    commission_rate = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('80.00'),
        validators=[MinValueValidator(Decimal('0.00')), MaxValueValidator(Decimal('100.00'))],
        verbose_name='Taux commission (%)',
        help_text='Pourcentage que le chauffeur garde sur chaque course (ex: 80 = 80%)'
    )
                                                  
    wallet_balance = models.DecimalField(
        max_digits=10, decimal_places=2, default=Decimal('0.00'),
        verbose_name='Solde portefeuille',
        help_text='Solde virtuel accumulé sur les courses payées en ligne'
    )
    is_blocked = models.BooleanField(default=False)
    is_verified = models.BooleanField(default=False)
    verification_notes = models.TextField(blank=True, verbose_name='Notes de vérification')
    fcm_token = models.TextField(blank=True)
    NAV_PREF_MODE_CHOICES = [
        ('ask', 'Demander à chaque trajet'),
        ('site', 'Navigation DAXI'),
        ('external', 'Application externe'),
    ]
    NAV_PREF_APP_CHOICES = [
        ('google', 'Google Maps'),
        ('waze', 'Waze'),
        ('apple', 'Apple Plans'),
    ]
    nav_pref_mode = models.CharField(
        max_length=20, choices=NAV_PREF_MODE_CHOICES, default='ask',
        verbose_name='Préférence navigation',
    )
    nav_pref_app = models.CharField(
        max_length=20, choices=NAV_PREF_APP_CHOICES, default='google',
        verbose_name='Application GPS externe',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Chauffeur'
        verbose_name_plural = 'Chauffeurs'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.firstname} {self.lastname} ({self.plate})"

    def get_full_name(self):
        if self.full_name:
            return self.full_name
        return f"{self.firstname} {self.lastname}".strip()

    def get_public_vehicle_image_url(self):
        """URL de la photo véhicule affichée publiquement (jamais la photo référence chauffeur)."""
        if self.vehicle_professional_photo:
            try:
                return self.vehicle_professional_photo.url
            except Exception:
                pass
        legacy = (self.car_image_url or '').strip()
        return legacy or None

    def get_vehicle_reference_image_url(self):
        """URL de la photo référence envoyée par le chauffeur (admin uniquement)."""
        if self.vehicle_reference_photo:
            try:
                return self.vehicle_reference_photo.url
            except Exception:
                pass
        return None

    @property
    def public_vehicle_image_url(self):
        return self.get_public_vehicle_image_url()

    @property
    def vehicle_reference_image_url(self):
        return self.get_vehicle_reference_image_url()

    @property
    def commission_rate_deduction(self):
        """Percentage the driver must send to admin for cash payments."""
        return round(100 - float(self.commission_rate), 2)

    def get_cash_commission_stats(self):
        """Return (total_admin_due, cash_paid_to_admin, cash_owed_to_admin) for cash trips."""
        from django.db.models import Sum
        from orders.models import Order

        cash_orders = Order.objects.filter(
            driver=self,
            payment_method='in_person',
            status='completed',
        ).values('price')
        rate_deduction = Decimal(str(100 - float(self.commission_rate or 20)))
        total_admin_due = Decimal('0')
        for o in cash_orders:
            if o['price']:
                total_admin_due += (
                    Decimal(str(o['price'])) * rate_deduction / Decimal('100')
                ).quantize(Decimal('0.01'))
        paid_qs = self.wallet_transactions.filter(
            transaction_type='debit_moncash',
        ).aggregate(s=Sum('amount'))
        cash_paid = abs(paid_qs['s'] or Decimal('0'))
        cash_owed = max(Decimal('0'), total_admin_due - cash_paid)
        return total_admin_due, cash_paid, cash_owed

    @property
    def cash_owed_to_admin(self):
        return self.get_cash_commission_stats()[2]

    @property
    def withdrawable_balance(self):
        balance = self.wallet_balance or Decimal('0')
        return max(Decimal('0'), balance - self.cash_owed_to_admin)

    def recalculate_rating(self):
        """Sync rating/rating_count from DriverReview rows."""
        from django.db.models import Avg, Count
        agg = self.reviews.aggregate(avg=Avg('rating'), cnt=Count('id'))
        self.rating_count = agg['cnt'] or 0
        avg = agg['avg']
        self.rating = round(float(avg), 2) if avg is not None else 0.0
        self.save(update_fields=['rating', 'rating_count'])
        return self.rating

    def update_rating(self, new_rating):
        """Update driver average rating."""
        total = (self.rating * self.rating_count) + new_rating
        self.rating_count += 1
        self.rating = round(total / self.rating_count, 2)
        self.save(update_fields=['rating', 'rating_count'])


class DriverReview(models.Model):
    """Customer reviews for drivers."""
    driver = models.ForeignKey(Driver, on_delete=models.CASCADE, related_name='reviews')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='driver_reviews'
    )
    order = models.ForeignKey(
        'orders.Order',
        on_delete=models.SET_NULL,
        null=True,
        related_name='review'
    )
    rating = models.PositiveSmallIntegerField()       
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Avis'
        verbose_name_plural = 'Avis'
        ordering = ['-created_at']

    def __str__(self):
        return f"Avis de {self.user} pour {self.driver} - {self.rating}/5"


class DriverWalletTransaction(models.Model):
    """Log every credit/debit on a driver's virtual wallet."""
    TRANSACTION_TYPE_CHOICES = [
        ('credit_online',       "Crédit – paiement en ligne"),
        ('debit_moncash',       "Débit – envoi MonCash à l'admin"),
        ('withdrawal_request',  "Demande de retrait"),
        ('withdrawal_paid',     "Retrait payé par l'admin"),
        ('adjustment',          "Ajustement manuel"),
    ]
    driver = models.ForeignKey(Driver, on_delete=models.CASCADE, related_name='wallet_transactions')
    order = models.ForeignKey('orders.Order', on_delete=models.SET_NULL, null=True, blank=True, related_name='wallet_tx')
    PAYOUT_METHOD_CHOICES = [
        ('moncash', 'MonCash'),
        ('natcash', 'NatCash'),
    ]
    ADMIN_STATUS_CHOICES = [
        ('pending', 'En attente'),
        ('paid', 'Payé'),
        ('rejected', 'Refusé'),
    ]
    transaction_type = models.CharField(max_length=30, choices=TRANSACTION_TYPE_CHOICES)
    amount = models.DecimalField(max_digits=10, decimal_places=2)                                        
    balance_after = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    payout_method = models.CharField(max_length=10, choices=PAYOUT_METHOD_CHOICES, blank=True, default='')
    payout_phone = models.CharField(max_length=30, blank=True, default='')
    admin_status = models.CharField(max_length=10, choices=ADMIN_STATUS_CHOICES, blank=True, default='')
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Transaction portefeuille'
        verbose_name_plural = 'Transactions portefeuille'
        ordering = ['-created_at']

    def __str__(self):
        sign = '+' if self.amount >= 0 else ''
        return f"{self.driver} | {sign}{self.amount} $ | {self.get_transaction_type_display()}"


class DriverCommissionPayment(models.Model):
    """Paiement MonCash d'une commission cash due à l'admin."""
    driver = models.ForeignKey(Driver, on_delete=models.CASCADE, related_name='commission_payments')
    amount_usd = models.DecimalField(max_digits=10, decimal_places=2)
    payment_reference = models.CharField(max_length=120, blank=True, db_index=True)
    is_paid = models.BooleanField(default=False)
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Paiement commission chauffeur'
        verbose_name_plural = 'Paiements commission chauffeur'
        ordering = ['-created_at']

    def __str__(self):
        return f'Commission {self.amount_usd}$ — {self.driver}'
