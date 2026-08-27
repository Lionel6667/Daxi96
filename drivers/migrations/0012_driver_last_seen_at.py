from django.db import migrations, models


def backfill_last_seen(apps, schema_editor):
    Driver = apps.get_model('drivers', 'Driver')
    for driver in Driver.objects.all().iterator():
        candidates = [driver.location_updated_at, driver.status_updated_at]
        candidates = [dt for dt in candidates if dt]
        if candidates:
            driver.last_seen_at = max(candidates)
            driver.save(update_fields=['last_seen_at'])


class Migration(migrations.Migration):

    dependencies = [
        ('drivers', '0011_drivercommissionpayment'),
    ]

    operations = [
        migrations.AddField(
            model_name='driver',
            name='last_seen_at',
            field=models.DateTimeField(
                blank=True,
                help_text="Dernière connexion GPS ou ouverture de l'application chauffeur",
                null=True,
                verbose_name='Dernière activité',
            ),
        ),
        migrations.RunPython(backfill_last_seen, migrations.RunPython.noop),
    ]
