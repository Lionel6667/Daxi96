from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('drivers', '0007_alter_driverwallettransaction_transaction_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='driverwallettransaction',
            name='payout_method',
            field=models.CharField(blank=True, choices=[('moncash', 'MonCash'), ('natcash', 'NatCash')], default='', max_length=10),
        ),
        migrations.AddField(
            model_name='driverwallettransaction',
            name='payout_phone',
            field=models.CharField(blank=True, default='', max_length=30),
        ),
        migrations.AddField(
            model_name='driverwallettransaction',
            name='admin_status',
            field=models.CharField(blank=True, choices=[('pending', 'En attente'), ('paid', 'Payé'), ('rejected', 'Refusé')], default='', max_length=10),
        ),
    ]
