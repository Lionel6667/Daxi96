from rest_framework import serializers
from .models import ForumPost, ForumComment, TouristAttraction


class ForumCommentSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = ForumComment
        fields = ['id', 'content', 'author_name', 'created_at']
        read_only_fields = ['id', 'author_name', 'created_at']

    def get_author_name(self, obj):
        return obj.author.get_full_name() or obj.author.username


class ForumPostSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    author_photo = serializers.SerializerMethodField()
    likes_count = serializers.ReadOnlyField()
    comments_count = serializers.SerializerMethodField()
    comments = ForumCommentSerializer(many=True, read_only=True)
    image_url = serializers.SerializerMethodField()
    is_liked = serializers.SerializerMethodField()

    class Meta:
        model = ForumPost
        fields = [
            'id', 'content', 'image', 'image_url',
            'author_name', 'author_photo', 'likes_count', 'is_liked',
            'comments_count', 'comments', 'is_visible', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']
        extra_kwargs = {'image': {'write_only': True, 'required': False}}

    def get_author_name(self, obj):
        return obj.author.get_full_name() or obj.author.username

    def get_author_photo(self, obj):
        if hasattr(obj.author, 'photo') and obj.author.photo:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.author.photo.url)
        return None

    def get_image_url(self, obj):
        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None

    def get_comments_count(self, obj):
        return obj.comments.count()

    def get_is_liked(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return request.user in obj.likes.all()
        return False


class TouristAttractionSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = TouristAttraction
        fields = ['id', 'name', 'description', 'location', 'image_url', 'latitude', 'longitude']

    def get_image_url(self, obj):
        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None
