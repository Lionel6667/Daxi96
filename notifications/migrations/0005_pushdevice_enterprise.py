from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('enterprises', '0005_enterprise_location'),
        ('notifications', '0004_pushdevice_device_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='pushdevice',
            name='enterprise',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='push_devices',
                to='enterprises.enterprise',
            ),
        ),
    ]
