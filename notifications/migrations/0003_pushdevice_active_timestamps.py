from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('notifications', '0002_pushdevice'),
    ]

    operations = [
        migrations.AddField(
            model_name='pushdevice',
            name='is_active',
            field=models.BooleanField(db_index=True, default=True),
        ),
        migrations.AddField(
            model_name='pushdevice',
            name='created_at',
            field=models.DateTimeField(auto_now_add=True, null=True, blank=True),
        ),
        migrations.AddField(
            model_name='pushdevice',
            name='last_used_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
