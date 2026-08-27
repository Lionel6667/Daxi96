from django.urls import path
from . import views

urlpatterns = [
    path('posts/', views.ForumPostListCreateView.as_view(), name='forum-posts'),
    path('posts/<int:pk>/', views.ForumPostDetailView.as_view(), name='forum-post-detail'),
    path('posts/<int:pk>/like/', views.ForumPostLikeView.as_view(), name='forum-post-like'),
    path('posts/<int:post_id>/comments/', views.ForumCommentListCreateView.as_view(), name='forum-comments'),
    path('attractions/', views.TouristAttractionListView.as_view(), name='attractions'),
    path('posts/<int:pk>/moderate/', views.AdminForumModerationView.as_view(), name='forum-moderate'),
    path('admin/posts/', views.AdminForumPostListView.as_view(), name='forum-admin-posts'),
]
