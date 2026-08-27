from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('drivers', '0001_initial'),
        ('orders', '0022_ordermessage_audio_duration_sec'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='coords_placed_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='orders_coords_placed',
                to='drivers.Driver',
                verbose_name='Coords placées par (chauffeur)',
            ),
        ),
    ]
