from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from .models import BlogCategory, BlogTag, BlogArticle
from .permissions import IsStaffMember
from .serializers import (
    BlogCategorySerializer,
    BlogTagSerializer,
    BlogArticleListSerializer,
    BlogArticleDetailSerializer,
    BlogArticleWriteSerializer,
)


def _published_qs():
  now = timezone.now()
  return BlogArticle.objects.filter(
      Q(status=BlogArticle.STATUS_PUBLISHED) |
      Q(status=BlogArticle.STATUS_SCHEDULED, scheduled_at__lte=now)
  ).select_related('category').prefetch_related('tags')


class BlogArticleListView(generics.ListAPIView):
    serializer_class = BlogArticleListSerializer
    permission_classes = [AllowAny]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['category__slug']
    search_fields = ['title', 'excerpt', 'content', 'meta_keywords']
    ordering_fields = ['published_at', 'view_count', 'created_at']
    ordering = ['-published_at']

    def get_queryset(self):
        qs = _published_qs()
        tag = self.request.query_params.get('tag')
        if tag:
            qs = qs.filter(tags__slug=tag)
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            qs = qs.filter(published_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(published_at__date__lte=date_to)
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category__slug=category)
        return qs.distinct()


class BlogArticleDetailView(generics.RetrieveAPIView):
    serializer_class = BlogArticleDetailSerializer
    permission_classes = [AllowAny]
    lookup_field = 'slug'

    def get_queryset(self):
        return _published_qs()

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        instance.increment_views()
        serializer = self.get_serializer(instance)
        return Response(serializer.data)


class BlogCategoryListView(generics.ListAPIView):
    queryset = BlogCategory.objects.filter(is_active=True)
    serializer_class = BlogCategorySerializer
    permission_classes = [AllowAny]


class BlogTagListView(generics.ListAPIView):
    queryset = BlogTag.objects.all()
    serializer_class = BlogTagSerializer
    permission_classes = [AllowAny]


                                                                                

class AdminBlogDashboardView(APIView):
    permission_classes = [IsStaffMember]

    def get(self, request):
        return Response({
            'total': BlogArticle.objects.count(),
            'published': BlogArticle.objects.filter(status=BlogArticle.STATUS_PUBLISHED).count(),
            'drafts': BlogArticle.objects.filter(status=BlogArticle.STATUS_DRAFT).count(),
            'scheduled': BlogArticle.objects.filter(status=BlogArticle.STATUS_SCHEDULED).count(),
            'categories': BlogCategory.objects.count(),
            'tags': BlogTag.objects.count(),
            'top_views': BlogArticleListSerializer(
                BlogArticle.objects.order_by('-view_count')[:5],
                many=True,
                context={'request': request},
            ).data,
        })


class AdminBlogArticleListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsStaffMember]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['title', 'slug', 'content']
    ordering = ['-updated_at']

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return BlogArticleWriteSerializer
        return BlogArticleListSerializer

    def get_queryset(self):
        qs = BlogArticle.objects.select_related('category').prefetch_related('tags')
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        cat = self.request.query_params.get('category')
        if cat:
            qs = qs.filter(category__slug=cat)
        return qs

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)


class AdminBlogArticleDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsStaffMember]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    queryset = BlogArticle.objects.all()

    def get_serializer_class(self):
        if self.request.method in ('PUT', 'PATCH', 'POST'):
            return BlogArticleWriteSerializer
        return BlogArticleDetailSerializer


class AdminBlogArticleDuplicateView(APIView):
    permission_classes = [IsStaffMember]

    def post(self, request, pk):
        try:
            src = BlogArticle.objects.get(pk=pk)
        except BlogArticle.DoesNotExist:
            return Response({'error': 'Article introuvable'}, status=404)
        tags = list(src.tags.all())
        src.pk = None
        src.slug = ''
        src.title = src.title + ' (copie)'
        src.status = BlogArticle.STATUS_DRAFT
        src.published_at = None
        src.scheduled_at = None
        src.view_count = 0
        src.save()
        src.tags.set(tags)
        return Response(BlogArticleDetailSerializer(src, context={'request': request}).data, status=201)


class AdminBlogArticlePreviewView(APIView):
    permission_classes = [IsStaffMember]

    def get(self, request, pk):
        article = get_object_or_404(BlogArticle, pk=pk)
        return Response(BlogArticleDetailSerializer(article, context={'request': request}).data)


class AdminBlogCategoryListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsStaffMember]
    queryset = BlogCategory.objects.all()
    serializer_class = BlogCategorySerializer


class AdminBlogCategoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsStaffMember]
    queryset = BlogCategory.objects.all()
    serializer_class = BlogCategorySerializer
    lookup_field = 'pk'


class AdminBlogTagListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsStaffMember]
    queryset = BlogTag.objects.all()
    serializer_class = BlogTagSerializer


class AdminBlogTagDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsStaffMember]
    queryset = BlogTag.objects.all()
    serializer_class = BlogTagSerializer
    lookup_field = 'pk'


class AdminBlogTagMergeView(APIView):
    permission_classes = [IsStaffMember]

    def post(self, request):
        source_id = request.data.get('source_id')
        target_id = request.data.get('target_id')
        try:
            source = BlogTag.objects.get(pk=source_id)
            target = BlogTag.objects.get(pk=target_id)
        except BlogTag.DoesNotExist:
            return Response({'error': 'Tag introuvable'}, status=404)
        for article in source.articles.all():
            article.tags.add(target)
            article.tags.remove(source)
        source.delete()
        return Response({'message': f'Tag fusionné dans {target.name}'})


class AdminBlogBulkActionView(APIView):
    permission_classes = [IsStaffMember]

    def post(self, request):
        ids = request.data.get('ids', [])
        action = request.data.get('action', '')
        qs = BlogArticle.objects.filter(pk__in=ids)
        if action == 'publish':
            now = timezone.now()
            qs.update(status=BlogArticle.STATUS_PUBLISHED, published_at=now)
        elif action == 'draft':
            qs.update(status=BlogArticle.STATUS_DRAFT)
        elif action == 'delete':
            qs.delete()
        else:
            return Response({'error': 'Action inconnue'}, status=400)
        return Response({'message': 'OK', 'count': len(ids)})


class AdminBlogInlineImageView(APIView):
    """Upload an inline editor image to Cloudinary."""
    permission_classes = [IsStaffMember]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        uploaded = request.FILES.get('image') or request.FILES.get('file')
        if not uploaded:
            return Response({'error': 'Aucune image fournie.'}, status=400)
        from julmin_taxis.media_utils import upload_image_to_cloudinary
        url, err = upload_image_to_cloudinary(uploaded, folder='daxi/blog/inline')
        if not url:
            return Response({'error': err or 'Upload Cloudinary échoué'}, status=400)
        return Response({'url': url})
