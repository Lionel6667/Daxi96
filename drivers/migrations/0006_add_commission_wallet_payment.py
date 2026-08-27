

from decimal import Decimal
import django.core.validators
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0008_add_commission_wallet_payment'),
        ('drivers', '0005_driver_dgi_card_driver_oavct_insurance_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='driver',
            name='commission_rate',
            field=models.DecimalField(decimal_places=2, default=Decimal('80.00'), help_text='Pourcentage que le chauffeur garde sur chaque course (ex: 80 = 80%)', max_digits=5, validators=[django.core.validators.MinValueValidator(Decimal('0.00')), django.core.validators.MaxValueValidator(Decimal('100.00'))], verbose_name='Taux commission (%)'),
        ),
        migrations.AddField(
            model_name='driver',
            name='wallet_balance',
            field=models.DecimalField(decimal_places=2, default=Decimal('0.00'), help_text='Solde virtuel accumulé sur les courses payées en ligne', max_digits=10, verbose_name='Solde portefeuille'),
        ),
        migrations.CreateModel(
            name='DriverWalletTransaction',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('transaction_type', models.CharField(choices=[('credit_online', 'Crédit – paiement en ligne'), ('debit_moncash', 'Débit – envoi MonCash'), ('adjustment', 'Ajustement manuel')], max_length=30)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=10)),
                ('balance_after', models.DecimalField(decimal_places=2, default=Decimal('0.00'), max_digits=10)),
                ('note', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('driver', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='wallet_transactions', to='drivers.driver')),
                ('order', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='wallet_tx', to='orders.order')),
            ],
            options={
                'verbose_name': 'Transaction portefeuille',
                'verbose_name_plural': 'Transactions portefeuille',
                'ordering': ['-created_at'],
            },
        ),
    ]
