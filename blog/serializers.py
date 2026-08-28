from rest_framework import serializers
from .models import BlogCategory, BlogTag, BlogArticle


class BlogCategorySerializer(serializers.ModelSerializer):
    article_count = serializers.SerializerMethodField()

    class Meta:
        model = BlogCategory
        fields = [
            'id', 'name', 'slug', 'color', 'icon', 'description',
            'order', 'is_active', 'article_count',
        ]

    def get_article_count(self, obj):
        return obj.articles.filter(status=BlogArticle.STATUS_PUBLISHED).count()


class BlogTagSerializer(serializers.ModelSerializer):
    article_count = serializers.SerializerMethodField()

    class Meta:
        model = BlogTag
        fields = ['id', 'name', 'slug', 'article_count']

    def get_article_count(self, obj):
        return obj.articles.filter(status=BlogArticle.STATUS_PUBLISHED).count()


class BlogArticleListSerializer(serializers.ModelSerializer):
    category = BlogCategorySerializer(read_only=True)
    tags = BlogTagSerializer(many=True, read_only=True)
    cover_image_url = serializers.SerializerMethodField()
    url = serializers.SerializerMethodField()

    class Meta:
        model = BlogArticle
        fields = [
            'id', 'title', 'slug', 'excerpt', 'cover_image_url', 'category', 'tags',
            'status', 'published_at', 'reading_time_min', 'view_count', 'url',
            'seo_title', 'meta_description',
        ]

    def get_cover_image_url(self, obj):
        if obj.cover_image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.cover_image.url)
            return obj.cover_image.url
        return ''

    def get_url(self, obj):
        return f'/blog/{obj.slug}/'


class BlogArticleDetailSerializer(BlogArticleListSerializer):
    og_image_url = serializers.SerializerMethodField()
    similar = serializers.SerializerMethodField()

    class Meta(BlogArticleListSerializer.Meta):
        fields = BlogArticleListSerializer.Meta.fields + [
            'content', 'meta_keywords', 'og_image_url', 'canonical_url',
            'created_at', 'updated_at', 'similar',
        ]

    def get_og_image_url(self, obj):
        img = obj.og_image or obj.cover_image
        if img:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(img.url)
            return img.url
        return ''

    def get_similar(self, obj):
        qs = BlogArticle.objects.filter(status=BlogArticle.STATUS_PUBLISHED).exclude(pk=obj.pk)
        if obj.category_id:
            qs = qs.filter(category_id=obj.category_id)
        qs = qs.order_by('-published_at')[:4]
        return BlogArticleListSerializer(qs, many=True, context=self.context).data


class BlogArticleWriteSerializer(serializers.ModelSerializer):
    tag_ids = serializers.ListField(child=serializers.IntegerField(), required=False, write_only=True)
    category_id = serializers.IntegerField(required=False, allow_null=True, write_only=True)

    class Meta:
        model = BlogArticle
        fields = [
            'id', 'title', 'slug', 'excerpt', 'content', 'cover_image', 'og_image',
            'category_id', 'tag_ids', 'status', 'published_at', 'scheduled_at',
            'seo_title', 'meta_description', 'meta_keywords', 'canonical_url',
        ]

    def validate_content(self, value):
        from julmin_taxis.media_utils import rewrite_html_data_images_to_cloudinary
        return rewrite_html_data_images_to_cloudinary(value or '')

    def create(self, validated_data):
        tag_ids = validated_data.pop('tag_ids', [])
        category_id = validated_data.pop('category_id', None)
        if category_id:
            validated_data['category_id'] = category_id
        article = BlogArticle.objects.create(**validated_data)
        if tag_ids:
            article.tags.set(BlogTag.objects.filter(pk__in=tag_ids))
        return article

    def update(self, instance, validated_data):
        tag_ids = validated_data.pop('tag_ids', None)
        category_id = validated_data.pop('category_id', serializers.empty)
        if category_id is not serializers.empty:
            instance.category_id = category_id
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()
        if tag_ids is not None:
            instance.tags.set(BlogTag.objects.filter(pk__in=tag_ids))
        return instance
