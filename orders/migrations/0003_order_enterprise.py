from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0002_order_description_order_driver_name_and_more'),
        ('enterprises', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='enterprise',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='orders',
                to='enterprises.enterprise',
            ),
        ),
        migrations.AddField(
            model_name='order',
            name='enterprise_commission_pct',
            field=models.FloatField(blank=True, null=True),
        ),
    ]
