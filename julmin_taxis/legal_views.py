"""Pages légales publiques (Meta, App Store, etc.)."""
from django.conf import settings
from django.shortcuts import render
from django.views.decorators.http import require_GET

PUBLIC_SITE = 'https://daxipro.com'


def _legal_urls():
    base = (getattr(settings, 'SITE_URL', '') or PUBLIC_SITE).rstrip('/')
    
    prod = PUBLIC_SITE.rstrip('/')
    return {
        'site_url': base,
        'privacy_url': f'{prod}/politique-confidentialite/',
        'deletion_url': f'{prod}/suppression-donnees/',
    }


@require_GET
def privacy_policy_page(request):
    return render(request, 'legal/privacy_policy.html', _legal_urls())


@require_GET
def data_deletion_page(request):
    return render(request, 'legal/data_deletion.html', _legal_urls())
