from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='Enterprise',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200, verbose_name="Nom de l'entreprise")),
                ('phone', models.CharField(max_length=30, verbose_name='Téléphone')),
                ('email', models.EmailField(unique=True, verbose_name='Email')),
                ('password_hash', models.CharField(max_length=256)),
                ('status', models.CharField(choices=[('pending', 'En attente'), ('approved', 'Approuvé'), ('rejected', 'Refusé')], default='pending', max_length=20)),
                ('commission_percent', models.FloatField(default=0, verbose_name='Commission (%)')),
                ('affiliate_code', models.CharField(blank=True, max_length=30, unique=True)),
                ('mode', models.CharField(choices=[('shared_code', 'Code partagé — clients commandent eux-mêmes'), ('self_order', 'Commande directe — je commande pour mes clients')], default='shared_code', max_length=20)),
                ('presentation', models.TextField(blank=True, verbose_name='Présentation')),
                ('admin_notes', models.TextField(blank=True, verbose_name='Notes admin')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('approved_at', models.DateTimeField(blank=True, null=True)),
            ],
            options={
                'verbose_name': 'Entreprise partenaire',
                'verbose_name_plural': 'Entreprises partenaires',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='EnterpriseChatMessage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('message', models.TextField()),
                ('is_from_admin', models.BooleanField(default=False)),
                ('is_read', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('enterprise', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='chat_messages', to='enterprises.enterprise')),
            ],
            options={
                'ordering': ['created_at'],
            },
        ),
    ]
