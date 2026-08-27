from django.db import migrations, models


def seed_notify_flags(apps, schema_editor):
    RouteTag = apps.get_model('pricing', 'RouteTag')
    for tag in RouteTag.objects.all():
        should = bool(tag.is_danger or (tag.alert_message or '').strip())
        if tag.notify_on_approach != should:
            tag.notify_on_approach = should
            tag.save(update_fields=['notify_on_approach'])


class Migration(migrations.Migration):

    dependencies = [
        ('pricing', '0006_pricingconfig_default_driver_commission'),
    ]

    operations = [
        migrations.AddField(
            model_name='routetag',
            name='notify_on_approach',
            field=models.BooleanField(
                default=False,
                help_text='Envoie une alerte courte au chauffeur et au client. Danger = 500 m, autres = 100 m.',
                verbose_name="Notifier à l'approche",
            ),
        ),
        migrations.RunPython(seed_notify_flags, migrations.RunPython.noop),
    ]
