from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('notifications', '0003_pushdevice_active_timestamps'),
    ]

    operations = [
        migrations.AddField(
            model_name='pushdevice',
            name='device_id',
            field=models.CharField(blank=True, db_index=True, max_length=80),
        ),
    ]
