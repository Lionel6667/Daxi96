from django.db import models


class SiteTranslation(models.Model):
    """Stores AI-generated page translations by language and key."""
    LANGUAGE_CHOICES = [
        ('fr', 'Français'),
        ('en', 'English'),
        ('ht', 'Kreyòl Ayisyen'),
        ('es', 'Español'),
    ]
    language = models.CharField(max_length=5, choices=LANGUAGE_CHOICES)
    key = models.CharField(max_length=200)
    value = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('language', 'key')]
        indexes = [models.Index(fields=['language'])]
        verbose_name = 'Traduction'
        verbose_name_plural = 'Traductions'

    def __str__(self):
        return f"[{self.language}] {self.key}"
