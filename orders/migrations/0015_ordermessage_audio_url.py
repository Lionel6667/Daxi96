from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0014_order_sos_lostobject_driver'),
    ]

    operations = [
        migrations.AddField(
            model_name='ordermessage',
            name='audio_url',
            field=models.URLField(blank=True, max_length=500),
        ),
        migrations.AlterField(
            model_name='ordermessage',
            name='message_type',
            field=models.CharField(default='text', max_length=10),
        ),
    ]
