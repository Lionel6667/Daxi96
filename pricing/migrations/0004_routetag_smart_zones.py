from django.db import migrations, models


def seed_default_tags(apps, schema_editor):
    RouteTag = apps.get_model('pricing', 'RouteTag')
    defaults = [
        {
            'name': 'Danger',
            'color': '#FF0000',
            'impact_percent': 0,
            'time_multiplier': 1.5,
            'affects_time': True,
            'seconds_per_km': 90,
            'is_danger': True,
            'is_system': True,
            'alert_message': (
                'Attention : vous entrez dans une zone signalée comme dangereuse. '
                'Restez vigilant.'
            ),
            'description': 'Zone dangereuse — contournée si possible (max +10% temps/km).',
        },
        {
            'name': 'Embouteillage possible',
            'color': '#FFD700',
            'impact_percent': 10,
            'time_multiplier': 1.8,
            'affects_time': True,
            'seconds_per_km': 120,
            'is_danger': False,
            'is_system': False,
            'alert_message': 'Vous allez entrer dans une zone avec possibilité d\'embouteillage.',
            'description': 'Trafic dense ou ralentissements fréquents.',
        },
        {
            'name': 'Route dégradée',
            'color': '#FF8C00',
            'impact_percent': 8,
            'time_multiplier': 1.4,
            'affects_time': True,
            'seconds_per_km': 100,
            'is_danger': False,
            'is_system': False,
            'alert_message': 'Vous allez entrer dans une zone avec route en mauvais état.',
            'description': 'Chaussée abîmée, nid-de-poule ou non goudronnée.',
        },
    ]
    for data in defaults:
        RouteTag.objects.get_or_create(name=data['name'], defaults=data)


class Migration(migrations.Migration):

    dependencies = [
        ('pricing', '0003_pricingconfig_wait_price'),
    ]

    operations = [
        migrations.AddField(
            model_name='routetag',
            name='affects_time',
            field=models.BooleanField(
                default=False,
                help_text='Si activé, demander le temps approximatif par km dans cette zone.',
                verbose_name='Affecte le temps de course',
            ),
        ),
        migrations.AddField(
            model_name='routetag',
            name='seconds_per_km',
            field=models.PositiveIntegerField(
                default=0,
                help_text='Temps approximatif pour parcourir 1 km dans cette zone (ex: 120 = 2 min/km). 0 = utiliser le multiplicateur.',
                verbose_name='Secondes par km dans la zone',
            ),
        ),
        migrations.AddField(
            model_name='routetag',
            name='is_danger',
            field=models.BooleanField(
                default=False,
                help_text='Itinéraire évité si contournement ≤ +10% temps/km.',
                verbose_name='Zone danger',
            ),
        ),
        migrations.AddField(
            model_name='routetag',
            name='is_system',
            field=models.BooleanField(
                default=False,
                help_text='Tag par défaut non supprimable (ex: Danger).',
                verbose_name='Tag système',
            ),
        ),
        migrations.AddField(
            model_name='routetag',
            name='alert_message',
            field=models.TextField(
                blank=True,
                help_text='Annonce chauffeur/client avant d\'entrer dans la zone. Vide = message par défaut.',
                verbose_name="Message d'alerte (100 m avant)",
            ),
        ),
        migrations.RunPython(seed_default_tags, migrations.RunPython.noop),
    ]
