

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('forum', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='forumpost',
            name='color',
            field=models.CharField(blank=True, default='#6366f1', max_length=20),
        ),
        migrations.AddField(
            model_name='forumpost',
            name='is_published',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='forumpost',
            name='title',
            field=models.CharField(blank=True, max_length=300, verbose_name='Titre'),
        ),
        migrations.AlterField(
            model_name='forumpost',
            name='author',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='forum_posts', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AlterField(
            model_name='forumpost',
            name='content',
            field=models.TextField(blank=True, verbose_name='Contenu'),
        ),
    ]
