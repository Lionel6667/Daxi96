from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0030_order_public_code'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='client_gps_accuracy',
            field=models.FloatField(blank=True, null=True, verbose_name='Précision GPS client (m)'),
        ),
    ]
