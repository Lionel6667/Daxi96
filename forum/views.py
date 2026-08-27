from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from .models import ForumPost, ForumComment, TouristAttraction
from .serializers import ForumPostSerializer, ForumCommentSerializer, TouristAttractionSerializer


class ForumPostListCreateView(generics.ListCreateAPIView):
    """List and create forum posts."""
    serializer_class = ForumPostSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_queryset(self):
        return ForumPost.objects.filter(is_visible=True).select_related('author').prefetch_related('likes')

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)


class ForumPostDetailView(generics.RetrieveDestroyAPIView):
    """Get or delete a forum post."""
    serializer_class = ForumPostSerializer
    queryset = ForumPost.objects.filter(is_visible=True)

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsAuthenticated()]

    def destroy(self, request, *args, **kwargs):
        post = self.get_object()
        if not (request.user == post.author or request.user.is_staff):
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)
        post.is_visible = False
        post.save(update_fields=['is_visible'])
        return Response({'message': 'Post supprimé.'})


class ForumPostLikeView(APIView):
    """Toggle like on a forum post."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            post = ForumPost.objects.get(pk=pk, is_visible=True)
        except ForumPost.DoesNotExist:
            return Response({'error': 'Post introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        if request.user in post.likes.all():
            post.likes.remove(request.user)
            liked = False
        else:
            post.likes.add(request.user)
            liked = True

        return Response({'liked': liked, 'likes_count': post.likes_count})


class ForumCommentListCreateView(generics.ListCreateAPIView):
    """Comments on a forum post."""
    serializer_class = ForumCommentSerializer

    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_queryset(self):
        return ForumComment.objects.filter(post_id=self.kwargs['post_id']).select_related('author')

    def perform_create(self, serializer):
        try:
            post = ForumPost.objects.get(pk=self.kwargs['post_id'], is_visible=True)
        except ForumPost.DoesNotExist:
            from rest_framework.exceptions import NotFound
            raise NotFound('Post introuvable.')
        serializer.save(author=self.request.user, post=post)


class TouristAttractionListView(generics.ListAPIView):
    """List tourist attractions."""
    serializer_class = TouristAttractionSerializer
    permission_classes = [AllowAny]
    queryset = TouristAttraction.objects.filter(is_active=True).order_by('order', 'name')


class AdminForumModerationView(APIView):
    """Admin: hide/show forum posts."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if not request.user.is_staff:
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            post = ForumPost.objects.get(pk=pk)
        except ForumPost.DoesNotExist:
            return Response({'error': 'Post introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        visible = request.data.get('is_visible', not post.is_visible)
        post.is_visible = visible
        post.save(update_fields=['is_visible'])
        action = 'affiché' if visible else 'masqué'
        return Response({'message': f'Post {action}.'})


class AdminForumPostListView(APIView):
    """Admin: all forum posts including hidden."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_staff:
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)
        posts = ForumPost.objects.select_related('author').order_by('-created_at')[:100]
        return Response(ForumPostSerializer(posts, many=True, context={'request': request}).data)
