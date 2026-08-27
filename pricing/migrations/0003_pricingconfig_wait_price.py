from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('pricing', '0002_pricingconfig_passenger_round_trip'),
    ]

    operations = [
        migrations.AddField(
            model_name='pricingconfig',
            name='wait_price_per_30min',
            field=models.DecimalField(
                decimal_places=2,
                default=5.0,
                help_text='Majoration pour attente aller-retour, par tranche de 30 minutes',
                max_digits=6,
                validators=[django.core.validators.MinValueValidator(0.0)],
                verbose_name="Frais d'attente AR par 30 min ($)",
            ),
        ),
        migrations.AlterField(
            model_name='pricingconfig',
            name='round_trip_multiplier',
            field=models.FloatField(
                default=2.0,
                help_text='Prix AR = prix simple × ce multiplicateur. Ex: 2.0 = double',
                validators=[
                    django.core.validators.MinValueValidator(1.0),
                    django.core.validators.MaxValueValidator(5.0),
                ],
                verbose_name='Multiplicateur aller-retour',
            ),
        ),
    ]
