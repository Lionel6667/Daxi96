from decimal import Decimal
from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('pricing', '0005_pause_price_and_dedupe_danger'),
    ]

    operations = [
        migrations.AddField(
            model_name='pricingconfig',
            name='default_driver_commission_rate',
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal('80.00'),
                help_text='Pourcentage que le chauffeur garde sur chaque course (ex: 80 = 80%, admin 20%)',
                max_digits=5,
                validators=[
                    django.core.validators.MinValueValidator(Decimal('0.00')),
                    django.core.validators.MaxValueValidator(Decimal('100.00')),
                ],
                verbose_name='Commission chauffeur (%)',
            ),
        ),
    ]
