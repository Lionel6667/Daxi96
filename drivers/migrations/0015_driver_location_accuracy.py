from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('drivers', '0014_driver_nav_pref_zoom'),
    ]

    operations = [
        migrations.AddField(
            model_name='driver',
            name='location_accuracy',
            field=models.FloatField(
                blank=True,
                help_text="Rayon d’incertitude du dernier fix chauffeur, en mètres.",
                null=True,
                verbose_name='Précision GPS (m)',
            ),
        ),
    ]
