from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0021_client_payment_debt_contract'),
    ]

    operations = [
        migrations.AddField(
            model_name='ordermessage',
            name='audio_duration_sec',
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
    ]
