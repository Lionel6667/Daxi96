

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0028_order_round_trip_flow'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='round_trip_pickup_requested_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Client a demandé le retour'),
        ),
        migrations.AddField(
            model_name='order',
            name='round_trip_pickup_request_dismissed_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Alerte retour fermée par chauffeur'),
        ),
    ]
