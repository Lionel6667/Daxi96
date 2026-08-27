"""robots.txt — autorise explicitement les crawlers Meta/WhatsApp pour les previews."""
from django.http import HttpResponse
from django.views.decorators.http import require_GET


_ROBOTS = """# DAXI — previews WhatsApp / Facebook / iMessage
User-agent: facebookexternalhit
Allow: /

User-agent: Facebot
Allow: /

User-agent: meta-externalagent
Allow: /

User-agent: WhatsApp
Allow: /

User-agent: *
Allow: /
Disallow: /django-admin/
Disallow: /api/
Disallow: /htmx/admin/
"""


@require_GET
def robots_txt(_request):
    resp = HttpResponse(_ROBOTS.strip() + '\n', content_type='text/plain; charset=utf-8')
    resp['Cache-Control'] = 'public, max-age=3600'
    return resp
