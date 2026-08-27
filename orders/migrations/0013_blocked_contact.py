

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('orders', '0012_order_share_chat_enhancements'),
    ]

    operations = [
        migrations.CreateModel(
            name='BlockedContact',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('email', models.EmailField(blank=True, db_index=True, max_length=254)),
                ('phone', models.CharField(blank=True, db_index=True, max_length=40)),
                ('guest_id', models.CharField(blank=True, db_index=True, max_length=100)),
                ('client_name', models.CharField(blank=True, max_length=200)),
                ('reason', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='blocked_contacts', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Contact bloqué',
                'verbose_name_plural': 'Contacts bloqués',
            },
        ),
    ]
