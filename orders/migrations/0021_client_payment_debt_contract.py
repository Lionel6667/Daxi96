

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0020_systemconfig_usd_htg_rate'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='contract_accepted_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Contrat accepté le'),
        ),
        migrations.CreateModel(
            name='ClientPaymentDebt',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('guest_id', models.CharField(blank=True, db_index=True, max_length=100)),
                ('amount_usd', models.DecimalField(decimal_places=2, max_digits=10)),
                ('reason', models.TextField(blank=True)),
                ('is_paid', models.BooleanField(default=False)),
                ('paid_at', models.DateTimeField(blank=True, null=True)),
                ('payment_reference', models.CharField(blank=True, max_length=120)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('order', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='payment_debts', to='orders.order')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='payment_debts', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Dette client',
                'verbose_name_plural': 'Dettes clients',
                'ordering': ['-created_at'],
            },
        ),
    ]
