from django.db import migrations


DEFAULT_CATEGORIES = [
    ('Annonces', 'annonces', '#f59e0b', 'ri-megaphone-line', 1),
    ('Questions & aide', 'questions-aide', '#3b82f6', 'ri-help-line', 2),
    ('Chauffeurs', 'chauffeurs', '#22c55e', 'ri-steering-2-line', 3),
    ('Clients', 'clients', '#06b6d4', 'ri-user-heart-line', 4),
    ('Sécurité', 'securite', '#ef4444', 'ri-shield-check-line', 5),
    ('Navigation & routes', 'navigation-routes', '#8b5cf6', 'ri-route-line', 6),
    ('Application DAXI', 'application-daxi', '#6366f1', 'ri-smartphone-line', 7),
    ('Cap-Haïtien & local', 'cap-haitien-local', '#ec4899', 'ri-map-pin-line', 8),
    ('Suggestions', 'suggestions', '#14b8a6', 'ri-lightbulb-line', 9),
    ('Général', 'general', '#94a3b8', 'ri-discuss-line', 10),
]


def seed_forum_categories(apps, schema_editor):
    BlogCategory = apps.get_model('blog', 'BlogCategory')
    if BlogCategory.objects.exists():
        return
    for name, slug, color, icon, order in DEFAULT_CATEGORIES:
        BlogCategory.objects.create(
            name=name,
            slug=slug,
            color=color,
            icon=icon,
            order=order,
            is_active=True,
        )


def unseed_forum_categories(apps, schema_editor):
    BlogCategory = apps.get_model('blog', 'BlogCategory')
    slugs = [row[1] for row in DEFAULT_CATEGORIES]
    BlogCategory.objects.filter(slug__in=slugs).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('blog', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_forum_categories, unseed_forum_categories),
    ]
