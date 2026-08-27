from django.contrib import admin
from .models import ForumPost, ForumComment, TouristAttraction


@admin.register(ForumPost)
class ForumPostAdmin(admin.ModelAdmin):
    list_display = ['author', 'content_preview', 'likes_count', 'is_visible', 'created_at']
    list_filter = ['is_visible', 'created_at']
    search_fields = ['content', 'author__username']
    actions = ['hide_posts', 'show_posts']

    def content_preview(self, obj):
        return obj.content[:80] + '...' if len(obj.content) > 80 else obj.content
    content_preview.short_description = 'Contenu'

    def hide_posts(self, request, queryset):
        queryset.update(is_visible=False)
    hide_posts.short_description = "Masquer les posts"

    def show_posts(self, request, queryset):
        queryset.update(is_visible=True)
    show_posts.short_description = "Afficher les posts"


@admin.register(ForumComment)
class ForumCommentAdmin(admin.ModelAdmin):
    list_display = ['author', 'post', 'content', 'created_at']
    search_fields = ['content', 'author__username']


@admin.register(TouristAttraction)
class TouristAttractionAdmin(admin.ModelAdmin):
    list_display = ['name', 'location', 'is_active', 'order']
    list_editable = ['is_active', 'order']
    search_fields = ['name', 'location']
