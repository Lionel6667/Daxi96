from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0019_order_meeting_relocate_dismissed'),
    ]

    operations = [
        migrations.AddField(
            model_name='systemconfig',
            name='usd_htg_rate',
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal('130.00'),
                max_digits=8,
                verbose_name='Taux USD → HTG',
            ),
        ),
    ]
