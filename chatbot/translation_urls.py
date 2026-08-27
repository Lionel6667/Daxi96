from django.urls import path
from .views import SiteTranslationsView, GenerateTranslationsView, AutoTranslateView, SiteTranslationBundleView

urlpatterns = [
    path('', SiteTranslationsView.as_view(), name='site-translations'),
    path('bundle/', SiteTranslationBundleView.as_view(), name='site-translation-bundle'),
    path('generate/', GenerateTranslationsView.as_view(), name='generate-translations'),
    path('auto/', AutoTranslateView.as_view(), name='auto-translations'),
]
