

import django.db.models.deletion
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0023_order_coords_placed_by'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name='systemconfig',
            name='extra_km_rate',
            field=models.DecimalField(decimal_places=2, default=Decimal('50.00'), max_digits=8, verbose_name='Frais par km supplémentaire ($)'),
        ),
        migrations.AlterField(
            model_name='systemconfig',
            name='wait_rate_per_5min',
            field=models.DecimalField(decimal_places=2, default=Decimal('100.00'), max_digits=8, verbose_name="Frais d'attente par 5 min ($)"),
        ),
        migrations.CreateModel(
            name='SecurityLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('action', models.CharField(choices=[('PRICE_CHANGE', 'Changement prix'), ('STATUS_CHANGE', 'Changement statut'), ('PAYMENT', 'Paiement'), ('REFUND', 'Remboursement'), ('WALLET', 'Wallet chauffeur'), ('DRIVER_BLOCK', 'Blocage chauffeur'), ('ACCESS_DENIED', 'Accès refusé')], db_index=True, max_length=32)),
                ('actor_type', models.CharField(choices=[('staff', 'Staff'), ('driver', 'Chauffeur'), ('client', 'Client'), ('enterprise', 'Entreprise'), ('guest', 'Guest'), ('gateway', 'Passerelle'), ('system', 'Système'), ('anonymous', 'Anonyme')], default='anonymous', max_length=16)),
                ('actor_id', models.CharField(blank=True, max_length=64)),
                ('old_value', models.TextField(blank=True)),
                ('new_value', models.TextField(blank=True)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('order', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='security_logs', to='orders.order')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='security_logs', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Journal sécurité',
                'verbose_name_plural': 'Journaux sécurité',
                'ordering': ['-created_at'],
            },
        ),
    ]
