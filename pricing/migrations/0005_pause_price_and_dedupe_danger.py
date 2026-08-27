from decimal import Decimal

from django.db import migrations, models
from django.core.validators import MinValueValidator


def dedupe_danger_tags(apps, schema_editor):
    RouteTag = apps.get_model('pricing', 'RouteTag')
    PricingZone = apps.get_model('pricing', 'PricingZone')

    seen_names = {}
    for tag in RouteTag.objects.all().order_by('id'):
        key = (tag.name or '').strip().lower()
        if not key:
            continue
        if key in seen_names:
            keep = seen_names[key]
            dup = tag
            for zone in PricingZone.objects.filter(tags=dup):
                zone.tags.remove(dup)
                if keep not in zone.tags.all():
                    zone.tags.add(keep)
            dup.delete()
        else:
            seen_names[key] = tag

    
    danger_tags = list(RouteTag.objects.filter(is_danger=True).order_by('id'))
    if len(danger_tags) > 1:
        keep = danger_tags[0]
        for dup in danger_tags[1:]:
            for zone in PricingZone.objects.filter(tags=dup):
                zone.tags.remove(dup)
                if keep not in zone.tags.all():
                    zone.tags.add(keep)
            dup.delete()


def sync_pause_to_system(apps, schema_editor):
    PricingConfig = apps.get_model('pricing', 'PricingConfig')
    try:
        SystemConfig = apps.get_model('orders', 'SystemConfig')
    except LookupError:
        return
    cfg = PricingConfig.objects.filter(is_active=True).first()
    if not cfg:
        return
    rate = getattr(cfg, 'pause_price_per_5min', None)
    if rate is None:
        return
    obj, _ = SystemConfig.objects.get_or_create(pk=1)
    obj.wait_rate_per_5min = rate
    obj.save(update_fields=['wait_rate_per_5min'])


class Migration(migrations.Migration):

    dependencies = [
        ('pricing', '0004_routetag_smart_zones'),
        ('orders', '0009_systemconfig_order_extension_start_lat_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='pricingconfig',
            name='pause_price_per_5min',
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal('2.50'),
                max_digits=8,
                validators=[MinValueValidator(0.0)],
                verbose_name='Pause chauffeur par 5 min ($)',
                help_text='Frais facturés au client quand le chauffeur attend (arrêt imprévu), par tranche de 5 minutes',
            ),
        ),
        migrations.RunPython(dedupe_danger_tags, migrations.RunPython.noop),
        migrations.RunPython(sync_pause_to_system, migrations.RunPython.noop),
    ]
