from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0011_order_round_trip_wait'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='share_token',
            field=models.CharField(blank=True, db_index=True, max_length=48, null=True, unique=True),
        ),
        migrations.AddField(
            model_name='ordermessage',
            name='image_url',
            field=models.URLField(blank=True, max_length=500),
        ),
        migrations.AddField(
            model_name='ordermessage',
            name='message_type',
            field=models.CharField(default='text', max_length=10),
        ),
        migrations.AlterField(
            model_name='ordermessage',
            name='content',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='ordermessage',
            name='reply_to',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='replies', to='orders.ordermessage'
            ),
        ),
    ]
