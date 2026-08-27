from decimal import Decimal

from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator


class RouteTag(models.Model):
    """
    Représente un type de condition de route (ex: trafic, montagne, route endommagée).
    Chaque tag a une couleur visuelle et un impact sur le prix en pourcentage.
    """
    name = models.CharField(max_length=100, unique=True, verbose_name='Nom')
    color = models.CharField(
        max_length=7, default='#FF0000',
        verbose_name='Couleur (hex)',
        help_text='Couleur hexadécimale, ex: #FF5733'
    )
    impact_percent = models.FloatField(
        default=0.0,
        validators=[MinValueValidator(-50.0), MaxValueValidator(200.0)],
        verbose_name='Impact sur le prix (%)',
        help_text='Ex: 15 = +15%, -10 = -10%'
    )
                                                   
    time_multiplier = models.FloatField(
        default=1.0,
        validators=[MinValueValidator(0.1), MaxValueValidator(10.0)],
        verbose_name='Multiplicateur de temps',
        help_text='Ex: 2.0 = 1 km prend 2× plus de temps. 1.0 = normal.'
    )
    affects_time = models.BooleanField(
        default=False,
        verbose_name='Affecte le temps de course',
        help_text='Si activé, demander le temps approximatif par km dans cette zone.'
    )
    seconds_per_km = models.PositiveIntegerField(
        default=0,
        verbose_name='Secondes par km dans la zone',
        help_text='Temps approximatif pour parcourir 1 km dans cette zone (ex: 120 = 2 min/km). 0 = utiliser le multiplicateur.'
    )
    is_danger = models.BooleanField(
        default=False,
        verbose_name='Zone danger',
        help_text='Itinéraire évité si contournement ≤ +10% temps/km. Alerte 500 m avant.'
    )
    notify_on_approach = models.BooleanField(
        default=False,
        verbose_name='Notifier à l\'approche',
        help_text='Envoie une alerte courte au chauffeur et au client. Danger = 500 m, autres = 100 m. Plusieurs situations sur la même zone sont regroupées en un seul message.'
    )
    is_system = models.BooleanField(
        default=False,
        verbose_name='Tag système',
        help_text='Tag par défaut non supprimable (ex: Danger).'
    )
    alert_message = models.TextField(
        blank=True,
        verbose_name='Message d\'alerte',
        help_text='Texte affiché au chauffeur et au client. Vide = message par défaut. Les situations d\'une même zone sont combinées.'
    )
    description = models.TextField(blank=True, verbose_name='Description')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Tag de condition'
        verbose_name_plural = 'Tags de conditions'
        ordering = ['name']

    def __str__(self):
        sign = '+' if self.impact_percent >= 0 else ''
        return f'{self.name} ({sign}{self.impact_percent}%)'


class PricingZone(models.Model):
    """
    Zone géographique dessinée sur la carte (polygone GeoJSON).
    Peut avoir plusieurs tags (conditions) associés.
    """
    name = models.CharField(max_length=200, verbose_name='Nom de la zone')
                                                                          
                                                                     
    polygon = models.JSONField(verbose_name='Polygone (GeoJSON)', default=dict)
    tags = models.ManyToManyField(
        RouteTag,
        blank=True,
        related_name='zones',
        verbose_name='Conditions associées'
    )
                                                                      
    display_color = models.CharField(
        max_length=7, default='#3388ff',
        verbose_name='Couleur d\'affichage',
        help_text='Couleur de la zone sur la carte'
    )
    display_opacity = models.FloatField(
        default=0.3,
        validators=[MinValueValidator(0.0), MaxValueValidator(1.0)],
        verbose_name='Opacité d\'affichage'
    )
    is_active = models.BooleanField(default=True, verbose_name='Active')
    notes = models.TextField(blank=True, verbose_name='Notes')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Zone de tarification'
        verbose_name_plural = 'Zones de tarification'
        ordering = ['name']

    def __str__(self):
        tag_names = ', '.join(t.name for t in self.tags.all())
        return f'{self.name} [{tag_names}]' if tag_names else self.name

    @property
    def total_impact_percent(self):
        """Impact cumulé de tous les tags de la zone."""
        return sum(t.impact_percent for t in self.tags.all())

    @property
    def combined_time_multiplier(self):
        """Multiplicateur de temps moyen des tags (conservatif)."""
        tags = list(self.tags.all())
        if not tags:
            return 1.0
                                            
        return max(t.time_multiplier for t in tags)


class PricingConfig(models.Model):
    """
    Configuration globale du système de tarification.
    Singleton — une seule instance active à la fois.
    """
    name = models.CharField(
        max_length=100, default='Configuration principale',
        verbose_name='Nom de la configuration'
    )
    base_price_per_km = models.DecimalField(
        max_digits=6, decimal_places=2,
        default=1.50,
        validators=[MinValueValidator(0.01)],
        verbose_name='Prix de base par km ($)'
    )
    minimum_price = models.DecimalField(
        max_digits=6, decimal_places=2,
        default=3.00,
        validators=[MinValueValidator(0.01)],
        verbose_name='Prix minimum ($)'
    )
    global_multiplier = models.FloatField(
        default=1.0,
        validators=[MinValueValidator(0.1), MaxValueValidator(5.0)],
        verbose_name='Multiplicateur global',
        help_text='Appliqué en dernier sur le prix total. 1.0 = normal, 1.2 = +20%'
    )
                                                              
    max_zone_impact_percent = models.FloatField(
        default=100.0,
        validators=[MinValueValidator(0.0), MaxValueValidator(300.0)],
        verbose_name='Impact maximal par zone (%)',
        help_text='Plafonne l\'impact cumulé des tags dans une zone. Ex: 100 = max +100%'
    )
    round_trip_multiplier = models.FloatField(
        default=2.0,
        validators=[MinValueValidator(1.0), MaxValueValidator(5.0)],
        verbose_name='Multiplicateur aller-retour',
        help_text='Prix AR = prix simple × ce multiplicateur. Ex: 2.0 = double'
    )
    wait_price_per_30min = models.DecimalField(
        max_digits=6, decimal_places=2,
        default=5.00,
        validators=[MinValueValidator(0.0)],
        verbose_name='Frais d\'attente AR par 30 min ($)',
        help_text='Majoration pour attente aller-retour, par tranche de 30 minutes'
    )
    pause_price_per_5min = models.DecimalField(
        max_digits=8, decimal_places=2,
        default=Decimal('2.50'),
        validators=[MinValueValidator(0.0)],
        verbose_name='Pause chauffeur par 5 min ($)',
        help_text='Frais facturés au client quand le chauffeur attend (arrêt imprévu), par tranche de 5 minutes'
    )
    passenger_price_percent = models.FloatField(
        default=5.0,
        validators=[MinValueValidator(0.0), MaxValueValidator(100.0)],
        verbose_name='Majoration par passager supplémentaire (%)',
        help_text='Ex: 5 = +5% par passager au-delà du 1er'
    )
    default_driver_commission_rate = models.DecimalField(
        max_digits=5, decimal_places=2,
        default=Decimal('80.00'),
        validators=[MinValueValidator(Decimal('0.00')), MaxValueValidator(Decimal('100.00'))],
        verbose_name='Commission chauffeur (%)',
        help_text='Pourcentage que le chauffeur garde sur chaque course (ex: 80 = 80%, admin 20%)',
    )
    currency = models.CharField(max_length=3, default='USD', verbose_name='Devise')
    is_active = models.BooleanField(default=True, verbose_name='Active')
    notes = models.TextField(blank=True, verbose_name='Notes')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Configuration tarifaire'
        verbose_name_plural = 'Configurations tarifaires'

    def __str__(self):
        return f'{self.name} ({self.base_price_per_km} {self.currency}/km)'

    @classmethod
    def get_active(cls):
        """Retourne la configuration active, ou en crée une par défaut."""
        config = cls.objects.filter(is_active=True).first()
        if not config:
            config = cls.objects.create()
        return config


class PriceCalculationLog(models.Model):
    """
    Journal des calculs de prix (pour audit et statistiques).
    """
            
    origin_lat = models.FloatField()
    origin_lng = models.FloatField()
    destination_lat = models.FloatField()
    destination_lng = models.FloatField()
    origin_address = models.TextField(blank=True)
    destination_address = models.TextField(blank=True)

              
    total_distance_km = models.FloatField()
    base_price = models.DecimalField(max_digits=8, decimal_places=2)
    final_price = models.DecimalField(max_digits=8, decimal_places=2)
    currency = models.CharField(max_length=3, default='USD')

                                    
    zones_breakdown = models.JSONField(default=list, verbose_name='Détail par zone')
    config_snapshot = models.JSONField(default=dict, verbose_name='Config au moment du calcul')

                                             
    order_id = models.CharField(max_length=100, blank=True, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Journal de calcul de prix'
        verbose_name_plural = 'Journal des calculs de prix'
        ordering = ['-created_at']

    def __str__(self):
        return f'Calcul #{self.pk} — {self.final_price} {self.currency} ({self.total_distance_km:.2f} km)'
