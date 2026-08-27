from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('drivers', '0008_driverwallettransaction_payout_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='driver',
            name='location_updated_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Dernière position GPS'),
        ),
        migrations.AddField(
            model_name='driver',
            name='status_updated_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Dernier changement de statut'),
        ),
    ]
