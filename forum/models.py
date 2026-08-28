from django.db import models
from django.conf import settings

from julmin_taxis.cloudinary_storage import CloudinaryMediaStorage

_forum_image_storage = CloudinaryMediaStorage(folder='daxi/forum')
_attraction_image_storage = CloudinaryMediaStorage(folder='daxi/attractions')


class ForumPost(models.Model):
    """Community forum posts."""
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name='forum_posts',
        null=True, blank=True
    )
    title = models.CharField(max_length=300, blank=True, verbose_name='Titre')
    content = models.TextField(verbose_name='Contenu', blank=True)
    color = models.CharField(max_length=20, default='#6366f1', blank=True)
    image = models.ImageField(
        upload_to='forum/', blank=True, null=True, storage=_forum_image_storage,
    )
    likes = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name='liked_posts',
        blank=True
    )
    is_published = models.BooleanField(default=True)
    is_visible = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Post forum'
        verbose_name_plural = 'Posts forum'
        ordering = ['-created_at']

    def __str__(self):
        return self.title or f"Post de {self.author} - {self.created_at.strftime('%d/%m/%Y')}"

    @property
    def likes_count(self):
        return self.likes.count()


class ForumComment(models.Model):
    """Comments on forum posts."""
    post = models.ForeignKey(ForumPost, on_delete=models.CASCADE, related_name='comments')
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='forum_comments'
    )
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Commentaire'
        verbose_name_plural = 'Commentaires'
        ordering = ['created_at']

    def __str__(self):
        return f"Commentaire de {self.author} sur post #{self.post_id}"


class TouristAttraction(models.Model):
    """Tourist attractions displayed in the app."""
    name = models.CharField(max_length=200, verbose_name='Nom')
    description = models.TextField(verbose_name='Description')
    location = models.CharField(max_length=200, verbose_name='Lieu')
    image = models.ImageField(
        upload_to='attractions/', blank=True, null=True, storage=_attraction_image_storage,
    )
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Attraction touristique'
        verbose_name_plural = 'Attractions touristiques'
        ordering = ['order', 'name']

    def __str__(self):
        return self.name
