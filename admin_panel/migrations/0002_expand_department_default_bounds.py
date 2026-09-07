from django.db import migrations


# Copied from admin_panel.models.DEPT_DEFAULT_BOUNDS so the migration is stable.
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


def expand_bounds(apps, schema_editor):
    CoveredDepartment = apps.get_model('admin_panel', 'CoveredDepartment')
    for slug, bounds in DEPT_DEFAULT_BOUNDS.items():
        obj = CoveredDepartment.objects.filter(slug=slug).first()
        if not obj:
            continue
        updates = {}
        if obj.lat_min is None or obj.lat_min > bounds['lat_min']:
            updates['lat_min'] = bounds['lat_min']
        if obj.lat_max is None or obj.lat_max < bounds['lat_max']:
            updates['lat_max'] = bounds['lat_max']
        if obj.lng_min is None or obj.lng_min > bounds['lng_min']:
            updates['lng_min'] = bounds['lng_min']
        if obj.lng_max is None or obj.lng_max < bounds['lng_max']:
            updates['lng_max'] = bounds['lng_max']
        if updates:
            CoveredDepartment.objects.filter(pk=obj.pk).update(**updates)


class Migration(migrations.Migration):

    dependencies = [
        ('admin_panel', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(expand_bounds, migrations.RunPython.noop),
    ]
