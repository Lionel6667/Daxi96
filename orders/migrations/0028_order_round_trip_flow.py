

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0027_rename_orders_knownplace_lat_lng_idx_orders_know_lat_51a020_idx'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='round_trip_phase',
            field=models.CharField(
                blank=True,
                choices=[('', '—'), ('outbound', 'Aller'), ('waiting', 'Attente'), ('return', 'Retour')],
                default='',
                max_length=20,
                verbose_name='Phase aller-retour',
            ),
        ),
        migrations.AddField(
            model_name='order',
            name='round_trip_wait_started_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Début attente retour'),
        ),
        migrations.AddField(
            model_name='order',
            name='return_started_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Début trajet retour'),
        ),
        migrations.AddField(
            model_name='order',
            name='waiting_return_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Arrivée à destination (aller)'),
        ),
        migrations.AlterField(
            model_name='order',
            name='status',
            field=models.CharField(
                choices=[
                    ('pending', 'En attente'),
                    ('price_proposed', 'Prix proposé'),
                    ('price_confirmed', 'Prix confirmé'),
                    ('driver_assigned', 'Chauffeur assigné'),
                    ('on_way', 'En route'),
                    ('arrived', 'Arrivé'),
                    ('in_progress', 'Course en cours'),
                    ('waiting_return', 'Attente retour'),
                    ('completed', 'Terminé'),
                    ('cancelled', 'Annulé'),
                ],
                default='pending',
                max_length=20,
            ),
        ),
    ]
