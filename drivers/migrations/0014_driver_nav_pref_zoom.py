from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('drivers', '0013_driver_vehicle_photos'),
    ]

    operations = [
        migrations.AddField(
            model_name='driver',
            name='nav_pref_zoom',
            field=models.FloatField(
                default=20.0,
                help_text='Niveau de zoom Google Maps en mode navigation (environ 14–21).',
                verbose_name='Zoom navigation par défaut',
            ),
        ),
    ]
