from django.db import models


DEPT_DEFAULT_BOUNDS = {
    'nord': {'lat_min': 19.45, 'lat_max': 20.12, 'lng_min': -73.05, 'lng_max': -71.55},
    'nord_est': {'lat_min': 19.05, 'lat_max': 19.88, 'lng_min': -72.35, 'lng_max': -71.35},
    'nord_ouest': {'lat_min': 19.55, 'lat_max': 20.05, 'lng_min': -73.55, 'lng_max': -72.55},
    'artibonite': {'lat_min': 18.85, 'lat_max': 19.78, 'lng_min': -73.25, 'lng_max': -71.85},
    'centre': {'lat_min': 18.65, 'lat_max': 19.45, 'lng_min': -72.55, 'lng_max': -71.60},
    'ouest': {'lat_min': 18.35, 'lat_max': 18.88, 'lng_min': -73.15, 'lng_max': -72.25},
    'sud': {'lat_min': 18.00, 'lat_max': 18.65, 'lng_min': -74.50, 'lng_max': -72.50},
    'sud_est': {'lat_min': 18.05, 'lat_max': 18.58, 'lng_min': -73.25, 'lng_max': -71.80},
    'grande_anse': {'lat_min': 18.20, 'lat_max': 18.58, 'lng_min': -74.50, 'lng_max': -73.50},
    'nippes': {'lat_min': 18.15, 'lat_max': 18.55, 'lng_min': -74.05, 'lng_max': -73.20},
}

HAITI_DEPARTMENTS = [
    ('nord', 'Nord'),
    ('nord_est', 'Nord-Est'),
    ('nord_ouest', 'Nord-Ouest'),
    ('artibonite', 'Artibonite'),
    ('centre', 'Centre'),
    ('ouest', 'Ouest'),
    ('sud', 'Sud'),
    ('sud_est', 'Sud-Est'),
    ('grande_anse', 'Grande-Anse'),
    ('nippes', 'Nippes'),
]


class CoveredDepartment(models.Model):
    """Departments where DAXI is available. Checked by default: Nord."""
    slug = models.CharField(max_length=30, unique=True, choices=HAITI_DEPARTMENTS)
    name = models.CharField(max_length=60)
    is_active = models.BooleanField(default=False, verbose_name='Couvert par DAXI')
                                                                              
    lat_min = models.FloatField(null=True, blank=True)
    lat_max = models.FloatField(null=True, blank=True)
    lng_min = models.FloatField(null=True, blank=True)
    lng_max = models.FloatField(null=True, blank=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Département couvert'
        verbose_name_plural = 'Départements couverts'

    def __str__(self):
        return f'{"✅" if self.is_active else "❌"} {self.name}'
