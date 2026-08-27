from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('enterprises', '0002_enterprise_multi'),
    ]

    operations = [
        migrations.CreateModel(
            name='EnterpriseWithdrawal',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('amount', models.DecimalField(decimal_places=2, max_digits=10)),
                ('payout_method', models.CharField(choices=[('moncash', 'MonCash'), ('natcash', 'NatCash')], default='moncash', max_length=10)),
                ('phone', models.CharField(max_length=30)),
                ('status', models.CharField(choices=[('pending', 'En attente'), ('paid', 'Payé'), ('rejected', 'Refusé')], default='pending', max_length=10)),
                ('admin_note', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('paid_at', models.DateTimeField(blank=True, null=True)),
                ('enterprise', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='withdrawals', to='enterprises.enterprise')),
            ],
            options={
                'verbose_name': 'Retrait entreprise',
                'verbose_name_plural': 'Retraits entreprise',
                'ordering': ['-created_at'],
            },
        ),
    ]
