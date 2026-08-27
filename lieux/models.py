from django.db import models


class LieuxCategory(models.Model):
    slug = models.SlugField(max_length=40, unique=True)
    name = models.CharField(max_length=80)
    icon = models.CharField(max_length=60, default='ri-map-pin-line')
    color = models.CharField(max_length=20, default='#c27803')
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ['order', 'name']
        verbose_name = 'Catégorie de lieu'
        verbose_name_plural = 'Catégories de lieux'

    def __str__(self):
        return self.name


class LieuxPlace(models.Model):
    category = models.ForeignKey(
        LieuxCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name='places'
    )
    enterprise = models.ForeignKey(
        'enterprises.Enterprise', on_delete=models.SET_NULL, null=True, blank=True, related_name='visit_places'
    )
    name = models.CharField(max_length=200)
    address = models.CharField(max_length=400, blank=True, default='')
    hours = models.CharField(max_length=240, blank=True, default='', verbose_name='Horaires')
    description = models.TextField(blank=True, default='')
    cover = models.ImageField(upload_to='lieux/covers/', blank=True, null=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    is_published = models.BooleanField(default=True)
    featured = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-featured', 'order', 'name']
        verbose_name = 'Lieu à visiter'
        verbose_name_plural = 'Lieux à visiter'

    def __str__(self):
        return self.name

    @property
    def cover_url(self):
        if self.cover:
            try:
                return self.cover.url
            except Exception:
                return ''
        photo = self.photos.first()
        if photo and photo.image:
            try:
                return photo.image.url
            except Exception:
                return ''
        return ''


class LieuxPhoto(models.Model):
    place = models.ForeignKey(LieuxPlace, on_delete=models.CASCADE, related_name='photos')
    image = models.ImageField(upload_to='lieux/gallery/')
    caption = models.CharField(max_length=160, blank=True, default='')
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return f'Photo {self.pk} — {self.place_id}'
