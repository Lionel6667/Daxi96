import re
import math
from django.db import models
from django.conf import settings
from django.utils import timezone
from django.utils.text import slugify


def _unique_slug(model_cls, base_slug, exclude_pk=None):
    slug = base_slug or 'article'
    n = 0
    while True:
        candidate = slug if n == 0 else f'{slug}-{n}'
        qs = model_cls.objects.filter(slug=candidate)
        if exclude_pk:
            qs = qs.exclude(pk=exclude_pk)
        if not qs.exists():
            return candidate
        n += 1


class BlogCategory(models.Model):
    name = models.CharField(max_length=120, verbose_name='Nom')
    slug = models.SlugField(max_length=140, unique=True, blank=True)
    color = models.CharField(max_length=20, default='#6366f1', blank=True)
    icon = models.CharField(max_length=80, blank=True, help_text='Classe Remix Icon, ex: ri-news-line')
    description = models.TextField(blank=True)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Catégorie forum'
        verbose_name_plural = 'Catégories forum'
        ordering = ['order', 'name']

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = _unique_slug(BlogCategory, slugify(self.name)[:120])
        super().save(*args, **kwargs)


class BlogTag(models.Model):
    name = models.CharField(max_length=80, unique=True)
    slug = models.SlugField(max_length=100, unique=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Tag blog'
        verbose_name_plural = 'Tags blog'
        ordering = ['name']

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = _unique_slug(BlogTag, slugify(self.name)[:100])
        super().save(*args, **kwargs)


class BlogArticle(models.Model):
    STATUS_DRAFT = 'draft'
    STATUS_PUBLISHED = 'published'
    STATUS_SCHEDULED = 'scheduled'
    STATUS_CHOICES = [
        (STATUS_DRAFT, 'Brouillon'),
        (STATUS_PUBLISHED, 'Publié'),
        (STATUS_SCHEDULED, 'Programmé'),
    ]

    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='blog_articles',
    )
    title = models.CharField(max_length=300)
    slug = models.SlugField(max_length=320, unique=True, blank=True)
    excerpt = models.TextField(blank=True, help_text='Résumé court')
    content = models.TextField(blank=True, help_text='Contenu HTML riche')
    cover_image = models.ImageField(upload_to='blog/covers/', blank=True, null=True)
    category = models.ForeignKey(
        BlogCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='articles',
    )
    tags = models.ManyToManyField(BlogTag, blank=True, related_name='articles')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    reading_time_min = models.PositiveSmallIntegerField(default=1)
    view_count = models.PositiveIntegerField(default=0)
         
    seo_title = models.CharField(max_length=300, blank=True)
    meta_description = models.TextField(blank=True, max_length=500)
    meta_keywords = models.CharField(max_length=500, blank=True)
    og_image = models.ImageField(upload_to='blog/og/', blank=True, null=True)
    canonical_url = models.URLField(blank=True, max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Article blog'
        verbose_name_plural = 'Articles blog'
        ordering = ['-published_at', '-created_at']

    def __str__(self):
        return self.title

    def _estimate_reading_time(self):
        text = re.sub(r'<[^>]+>', ' ', self.content or '')
        words = len(re.findall(r'\w+', text))
        return max(1, math.ceil(words / 200))

    def _auto_seo(self):
        if not self.seo_title:
            self.seo_title = self.title[:300]
        if not self.meta_description:
            base = self.excerpt or re.sub(r'<[^>]+>', ' ', self.content or '')
            self.meta_description = (base.strip()[:480] + '…') if len(base) > 480 else base.strip()
        if not self.meta_keywords and self.category:
            self.meta_keywords = self.category.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = _unique_slug(BlogArticle, slugify(self.title)[:300])
        else:
            self.slug = _unique_slug(BlogArticle, slugify(self.slug)[:300], exclude_pk=self.pk)
        self.reading_time_min = self._estimate_reading_time()
        self._auto_seo()
        if self.status == self.STATUS_PUBLISHED and not self.published_at:
            self.published_at = timezone.now()
        if self.status == self.STATUS_SCHEDULED and self.scheduled_at and self.scheduled_at <= timezone.now():
            self.status = self.STATUS_PUBLISHED
            self.published_at = self.scheduled_at
        super().save(*args, **kwargs)

    @property
    def is_public(self):
        if self.status == self.STATUS_PUBLISHED:
            return True
        if self.status == self.STATUS_SCHEDULED and self.scheduled_at and self.scheduled_at <= timezone.now():
            return True
        return False

    def increment_views(self):
        BlogArticle.objects.filter(pk=self.pk).update(view_count=models.F('view_count') + 1)
