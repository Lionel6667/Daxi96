

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0007_merge_0002_order_scheduling_fields_0006_lostobject'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='driver_commission_amount',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='nowpayments_invoice_id',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='order',
            name='nowpayments_payment_id',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='order',
            name='payment_method',
            field=models.CharField(blank=True, choices=[('card', 'Carte bancaire'), ('moncash', 'MonCash'), ('in_person', 'Payer le chauffeur directement')], max_length=20),
        ),
        migrations.AddField(
            model_name='order',
            name='payment_status',
            field=models.CharField(choices=[('pending', 'En attente'), ('paid', 'Payé'), ('failed', 'Échoué'), ('in_person', 'Paiement direct')], default='pending', max_length=20),
        ),
    ]
