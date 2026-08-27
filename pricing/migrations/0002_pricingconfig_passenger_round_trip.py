from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('pricing', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='pricingconfig',
            name='round_trip_multiplier',
            field=models.FloatField(
                default=1.8,
                help_text='Prix AR = prix simple × ce multiplicateur. Ex: 1.8 = +80%',
                validators=[django.core.validators.MinValueValidator(1.0), django.core.validators.MaxValueValidator(5.0)],
                verbose_name='Multiplicateur aller-retour',
            ),
        ),
        migrations.AddField(
            model_name='pricingconfig',
            name='passenger_price_percent',
            field=models.FloatField(
                default=5.0,
                help_text='Ex: 5 = +5% par passager au-delà du 1er',
                validators=[django.core.validators.MinValueValidator(0.0), django.core.validators.MaxValueValidator(100.0)],
                verbose_name='Majoration par passager supplémentaire (%)',
            ),
        ),
    ]
