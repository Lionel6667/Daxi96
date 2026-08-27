

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='BlogCategory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120, verbose_name='Nom')),
                ('slug', models.SlugField(blank=True, max_length=140, unique=True)),
                ('color', models.CharField(blank=True, default='#6366f1', max_length=20)),
                ('icon', models.CharField(blank=True, help_text='Classe Remix Icon, ex: ri-news-line', max_length=80)),
                ('description', models.TextField(blank=True)),
                ('order', models.PositiveIntegerField(default=0)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Catégorie blog',
                'verbose_name_plural': 'Catégories blog',
                'ordering': ['order', 'name'],
            },
        ),
        migrations.CreateModel(
            name='BlogTag',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=80, unique=True)),
                ('slug', models.SlugField(blank=True, max_length=100, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'verbose_name': 'Tag blog',
                'verbose_name_plural': 'Tags blog',
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='BlogArticle',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=300)),
                ('slug', models.SlugField(blank=True, max_length=320, unique=True)),
                ('excerpt', models.TextField(blank=True, help_text='Résumé court')),
                ('content', models.TextField(blank=True, help_text='Contenu HTML riche')),
                ('cover_image', models.ImageField(blank=True, null=True, upload_to='blog/covers/')),
                ('status', models.CharField(choices=[('draft', 'Brouillon'), ('published', 'Publié'), ('scheduled', 'Programmé')], default='draft', max_length=20)),
                ('published_at', models.DateTimeField(blank=True, null=True)),
                ('scheduled_at', models.DateTimeField(blank=True, null=True)),
                ('reading_time_min', models.PositiveSmallIntegerField(default=1)),
                ('view_count', models.PositiveIntegerField(default=0)),
                ('seo_title', models.CharField(blank=True, max_length=300)),
                ('meta_description', models.TextField(blank=True, max_length=500)),
                ('meta_keywords', models.CharField(blank=True, max_length=500)),
                ('og_image', models.ImageField(blank=True, null=True, upload_to='blog/og/')),
                ('canonical_url', models.URLField(blank=True, max_length=500)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('author', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='blog_articles', to=settings.AUTH_USER_MODEL)),
                ('category', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='articles', to='blog.blogcategory')),
                ('tags', models.ManyToManyField(blank=True, related_name='articles', to='blog.blogtag')),
            ],
            options={
                'verbose_name': 'Article blog',
                'verbose_name_plural': 'Articles blog',
                'ordering': ['-published_at', '-created_at'],
            },
        ),
    ]
