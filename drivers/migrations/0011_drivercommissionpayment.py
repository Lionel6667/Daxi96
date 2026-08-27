from decimal import Decimal
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('drivers', '0010_driver_nav_preferences'),
    ]

    operations = [
        migrations.CreateModel(
            name='DriverCommissionPayment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('amount_usd', models.DecimalField(decimal_places=2, max_digits=10)),
                ('payment_reference', models.CharField(blank=True, db_index=True, max_length=120)),
                ('is_paid', models.BooleanField(default=False)),
                ('paid_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('driver', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='commission_payments', to='drivers.driver')),
            ],
            options={
                'verbose_name': 'Paiement commission chauffeur',
                'verbose_name_plural': 'Paiements commission chauffeur',
                'ordering': ['-created_at'],
            },
        ),
    ]
