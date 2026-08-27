

from decimal import Decimal
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0008_add_commission_wallet_payment'),
    ]

    operations = [
        migrations.CreateModel(
            name='SystemConfig',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('wait_rate_per_5min', models.DecimalField(decimal_places=2, default=Decimal('100.00'), max_digits=8, verbose_name="Frais d'attente par 5 min (HTG)")),
                ('extra_km_rate', models.DecimalField(decimal_places=2, default=Decimal('50.00'), max_digits=8, verbose_name='Frais par km supplémentaire (HTG)')),
            ],
            options={
                'verbose_name': 'Configuration système',
                'verbose_name_plural': 'Configuration système',
            },
        ),
        migrations.AddField(
            model_name='order',
            name='extension_start_lat',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='extension_start_lng',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='extra_km_price',
            field=models.DecimalField(blank=True, decimal_places=2, default=Decimal('0.00'), max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='extra_km_rate',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='is_extended',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='order',
            name='is_paused',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='order',
            name='pause_accumulated_seconds',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='order',
            name='pause_price',
            field=models.DecimalField(blank=True, decimal_places=2, default=Decimal('0.00'), max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='pause_rate_snapshot',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='pause_started_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
