

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('drivers', '0006_add_commission_wallet_payment'),
    ]

    operations = [
        migrations.AlterField(
            model_name='driverwallettransaction',
            name='transaction_type',
            field=models.CharField(choices=[('credit_online', 'Crédit – paiement en ligne'), ('debit_moncash', "Débit – envoi MonCash à l'admin"), ('withdrawal_request', 'Demande de retrait'), ('withdrawal_paid', "Retrait payé par l'admin"), ('adjustment', 'Ajustement manuel')], max_length=30),
        ),
    ]
