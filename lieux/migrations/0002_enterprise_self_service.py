from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('lieux', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='lieuxplace',
            name='department',
            field=models.CharField(blank=True, default='', max_length=30),
        ),
        migrations.AddField(
            model_name='lieuxplace',
            name='city',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
        migrations.AddField(
            model_name='lieuxplace',
            name='is_listed',
            field=models.BooleanField(default=True, verbose_name='Visible côté client'),
        ),
        migrations.AddField(
            model_name='lieuxplace',
            name='booking_count',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='lieuxplace',
            name='activity_score',
            field=models.PositiveIntegerField(default=0, db_index=True),
        ),
        migrations.AlterModelOptions(
            name='lieuxplace',
            options={
                'ordering': ['-activity_score', '-featured', 'order', 'name'],
                'verbose_name': 'Lieu à visiter',
                'verbose_name_plural': 'Lieux à visiter',
            },
        ),
    ]
