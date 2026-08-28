from django.urls import path
from . import views

urlpatterns = [
            
    path('articles/', views.BlogArticleListView.as_view(), name='blog-articles'),
    path('articles/<slug:slug>/', views.BlogArticleDetailView.as_view(), name='blog-article-detail'),
    path('categories/', views.BlogCategoryListView.as_view(), name='blog-categories'),
    path('tags/', views.BlogTagListView.as_view(), name='blog-tags'),
           
    path('admin/dashboard/', views.AdminBlogDashboardView.as_view(), name='blog-admin-dashboard'),
    path('admin/articles/', views.AdminBlogArticleListCreateView.as_view(), name='blog-admin-articles'),
    path('admin/articles/<int:pk>/', views.AdminBlogArticleDetailView.as_view(), name='blog-admin-article-detail'),
    path('admin/articles/<int:pk>/duplicate/', views.AdminBlogArticleDuplicateView.as_view(), name='blog-admin-article-duplicate'),
    path('admin/articles/<int:pk>/preview/', views.AdminBlogArticlePreviewView.as_view(), name='blog-admin-article-preview'),
    path('admin/articles/bulk/', views.AdminBlogBulkActionView.as_view(), name='blog-admin-bulk'),
    path('admin/inline-image/', views.AdminBlogInlineImageView.as_view(), name='blog-admin-inline-image'),
    path('admin/categories/', views.AdminBlogCategoryListCreateView.as_view(), name='blog-admin-categories'),
    path('admin/categories/<int:pk>/', views.AdminBlogCategoryDetailView.as_view(), name='blog-admin-category-detail'),
    path('admin/tags/', views.AdminBlogTagListCreateView.as_view(), name='blog-admin-tags'),
    path('admin/tags/<int:pk>/', views.AdminBlogTagDetailView.as_view(), name='blog-admin-tag-detail'),
    path('admin/tags/merge/', views.AdminBlogTagMergeView.as_view(), name='blog-admin-tag-merge'),
]
