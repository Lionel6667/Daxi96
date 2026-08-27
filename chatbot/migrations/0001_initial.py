from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='SiteTranslation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('language', models.CharField(choices=[('fr', 'Français'), ('en', 'English'), ('ht', 'Kreyòl Ayisyen'), ('es', 'Español')], max_length=5)),
                ('key', models.CharField(max_length=200)),
                ('value', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Traduction',
                'verbose_name_plural': 'Traductions',
            },
        ),
        migrations.AddIndex(
            model_name='sitetranslation',
            index=models.Index(fields=['language'], name='chatbot_sit_languag_idx'),
        ),
        migrations.AlterUniqueTogether(
            name='sitetranslation',
            unique_together={('language', 'key')},
        ),
    ]
