

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0004_add_price_commission_validators'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='passengers',
            field=models.PositiveIntegerField(default=1, verbose_name='Nombre de passagers'),
        ),
    ]
