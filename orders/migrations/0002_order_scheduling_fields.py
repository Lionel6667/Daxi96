
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('orders', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='scheduled_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Programmé pour'),
        ),
        migrations.AddField(
            model_name='order',
            name='is_later',
            field=models.BooleanField(default=False, verbose_name='Commande programmée'),
        ),
        migrations.AddField(
            model_name='order',
            name='client_gps_lat',
            field=models.FloatField(blank=True, null=True, verbose_name='GPS client lat'),
        ),
        migrations.AddField(
            model_name='order',
            name='client_gps_lng',
            field=models.FloatField(blank=True, null=True, verbose_name='GPS client lng'),
        ),
        migrations.AddField(
            model_name='order',
            name='client_gps_updated_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='pickup_coords_set_by_driver',
            field=models.BooleanField(default=False, verbose_name='Coords départ saisies par chauffeur'),
        ),
        migrations.AddField(
            model_name='order',
            name='dest_coords_set_by_driver',
            field=models.BooleanField(default=False, verbose_name='Coords dest saisies par chauffeur'),
        ),
    ]
