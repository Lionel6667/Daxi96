"""
Redirections serveur pour les URLs figées dans les templates Meta WhatsApp.

L'admin ne doit rien changer côté Meta : chaque ancien chemin ou variante
aboutit sur la route Django actuelle.

Templates Meta et comportement attendu
--------------------------------------
| Template                  | URL Meta (typique)              | Django envoie ({{1}})     | Route finale        |
|---------------------------|---------------------------------|---------------------------|---------------------|
| chauffeur_valide          | …/driver_home (statique)        | (aucun)                   | /driver/            |
| nouvelle_commande         | …/driver/accept/{{1}} ou wa/    | {id}/{token}/ ou URL full | accept signé        |
| commande_attente_coords   | …/ {{1}}                        | driver/commande_{id}/     | /driver/#commande-N |
| commande_attente_coords   | admin                           | admin-dashboard/#orders   | admin orders        |
| recu_course               | …/ {{1}}                        | recu_{id}.pdf             | reçu PDF            |
| course_terminee           | …/ {{1}}                        | compte/?order={id}        | /compte/            |
"""
from __future__ import annotations

import re

from django.shortcuts import redirect
from django.views.decorators.http import require_GET

# (regex path sans leading slash, destination)
LEGACY_WA_REDIRECTS: tuple[tuple[str, str], ...] = (
    (r'^driver_home/?$', '/driver/'),
    (r'^driver_home\.html/?$', '/driver/'),
    (r'^driver$', '/driver/'),
    (r'^driver_login/?$', '/driver/login/'),
    (r'^driver_login\.html/?$', '/driver/login/'),
    (r'^driver/login\.html/?$', '/driver/login/'),
    (r'^compte$', '/compte/'),
    (r'^compte\.html/?$', '/compte/'),
    (r'^adm/?$', '/admin-dashboard/'),
    (r'^adm\.html/?$', '/admin-dashboard/'),
    (r'^admt/?$', '/admin-dashboard/'),
    (r'^admt\.html/?$', '/admin-dashboard/'),
    (r'^admin/?$', '/admin-dashboard/'),
    (r'^admin_dashboard/?$', '/admin-dashboard/'),
    (r'^entreprise\.html/?$', '/entreprise/'),
    (r'^entreprise/dashboard\.html/?$', '/entreprise/dashboard/'),
    (r'^vubez2/?$', '/'),
    (r'^vubez2\.html/?$', '/'),
    (r'^wa/accept/?$', '/driver/'),
)

_COMPILED = tuple(
    (re.compile(pattern, re.IGNORECASE), dest)
    for pattern, dest in LEGACY_WA_REDIRECTS
)


@require_GET
def wa_legacy_redirect_catchall(request, legacy_path: str):
    """Redirige un chemin legacy Meta/Firebase vers la route Django actuelle."""
    path = (legacy_path or '').strip('/')
    if not path:
        return redirect('/', permanent=True)
    for pattern, dest in _COMPILED:
        if pattern.match(path):
            qs = request.META.get('QUERY_STRING') or ''
            target = dest
            if qs:
                sep = '&' if '?' in target else '?'
                target = f'{target}{sep}{qs}'
            if dest.startswith('http'):
                return redirect(target, permanent=True)
            return redirect(target, permanent=True)
    from julmin_taxis.error_views import page_not_found
    return page_not_found(request)
