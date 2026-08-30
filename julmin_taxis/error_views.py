"""
DAXI branded HTTP error pages.

Django natively wires 400 / 403 / 404 / 500. Extra codes are available via
`render_error(request, status)` and `/__errors__/<code>/` (DEBUG or staff).
"""
from __future__ import annotations

from django.http import HttpResponse, HttpResponseNotAllowed
from django.shortcuts import render
from django.views.decorators.http import require_GET


ERROR_CATALOG = {
    400: {
        'title': 'Requête invalide',
        'lead': 'La demande envoyée au serveur est incorrecte ou incomplète.',
        'hint': 'Vérifiez l’URL ou réessayez depuis l’accueil DAXI.',
        'icon': 'ri-error-warning-line',
    },
    401: {
        'title': 'Connexion requise',
        'lead': 'Vous devez être connecté pour accéder à cette page.',
        'hint': 'Connectez-vous à votre compte DAXI, puis réessayez.',
        'icon': 'ri-lock-line',
    },
    403: {
        'title': 'Accès refusé',
        'lead': 'Vous n’avez pas la permission d’ouvrir cette ressource.',
        'hint': 'Si vous pensez que c’est une erreur, contactez le support.',
        'icon': 'ri-shield-keyhole-line',
    },
    404: {
        'title': 'Page introuvable',
        'lead': 'Cette adresse n’existe pas ou a été déplacée.',
        'hint': 'Vérifiez l’URL, ou retournez à l’accueil pour commander un taxi.',
        'icon': '',
    },
    405: {
        'title': 'Méthode non autorisée',
        'lead': 'Cette action n’est pas acceptée sur cette page.',
        'hint': 'Revenez en arrière et utilisez les boutons de l’application.',
        'icon': 'ri-prohibited-line',
    },
    408: {
        'title': 'Délai dépassé',
        'lead': 'Le serveur a trop attendu votre requête.',
        'hint': 'Vérifiez votre connexion et réessayez.',
        'icon': 'ri-timer-line',
    },
    409: {
        'title': 'Conflit',
        'lead': 'Cette action entre en conflit avec l’état actuel.',
        'hint': 'Actualisez la page, puis recommencez.',
        'icon': 'ri-git-branch-line',
    },
    410: {
        'title': 'Ressource disparue',
        'lead': 'Ce contenu a été retiré définitivement.',
        'hint': 'Il n’est plus disponible sur DAXI.',
        'icon': 'ri-delete-bin-line',
    },
    413: {
        'title': 'Fichier trop volumineux',
        'lead': 'Le contenu envoyé dépasse la taille autorisée.',
        'hint': 'Réduisez la taille du fichier ou de la requête.',
        'icon': 'ri-file-damage-line',
    },
    414: {
        'title': 'URL trop longue',
        'lead': 'L’adresse demandée est trop longue pour le serveur.',
        'hint': 'Utilisez un lien plus court ou l’accueil DAXI.',
        'icon': 'ri-link-unlink',
    },
    415: {
        'title': 'Format non supporté',
        'lead': 'Le type de contenu envoyé n’est pas accepté.',
        'hint': 'Réessayez avec un format compatible (image, PDF, etc.).',
        'icon': 'ri-file-unknow-line',
    },
    422: {
        'title': 'Données invalides',
        'lead': 'Le serveur a compris la requête, mais les données sont incorrectes.',
        'hint': 'Vérifiez les champs du formulaire et renvoyez.',
        'icon': 'ri-file-warning-line',
    },
    423: {
        'title': 'Ressource verrouillée',
        'lead': 'Cette ressource est temporairement verrouillée.',
        'hint': 'Attendez un instant, puis réessayez.',
        'icon': 'ri-lock-2-line',
    },
    429: {
        'title': 'Trop de requêtes',
        'lead': 'Vous avez envoyé trop de demandes en peu de temps.',
        'hint': 'Patientez quelques secondes avant de continuer.',
        'icon': 'ri-speed-line',
    },
    500: {
        'title': 'Erreur serveur',
        'lead': 'Un problème technique est survenu de notre côté.',
        'hint': 'Nos équipes sont prévenues. Réessayez dans un moment.',
        'icon': 'ri-server-line',
    },
    501: {
        'title': 'Non implémenté',
        'lead': 'Cette fonctionnalité n’est pas encore disponible.',
        'hint': 'Revenez plus tard ou utilisez une autre action DAXI.',
        'icon': 'ri-tools-line',
    },
    502: {
        'title': 'Passerelle invalide',
        'lead': 'Un service externe a renvoyé une réponse incorrecte.',
        'hint': 'Réessayez dans quelques instants.',
        'icon': 'ri-route-line',
    },
    503: {
        'title': 'Service indisponible',
        'lead': 'DAXI est temporairement en maintenance ou surchargé.',
        'hint': 'Réessayez bientôt. Merci de votre patience.',
        'icon': 'ri-cloud-off-line',
    },
    504: {
        'title': 'Passerelle expirée',
        'lead': 'Un service partenaire a mis trop de temps à répondre.',
        'hint': 'Vérifiez votre connexion et réessayez.',
        'icon': 'ri-time-line',
    },
    505: {
        'title': 'Version HTTP non supportée',
        'lead': 'La version du protocole utilisée n’est pas prise en charge.',
        'hint': 'Mettez à jour votre navigateur ou l’application DAXI.',
        'icon': 'ri-global-line',
    },
    507: {
        'title': 'Espace insuffisant',
        'lead': 'Le serveur n’a plus assez d’espace pour traiter la demande.',
        'hint': 'Réessayez plus tard.',
        'icon': 'ri-hard-drive-2-line',
    },
    511: {
        'title': 'Authentification réseau requise',
        'lead': 'Votre réseau exige une authentification avant d’accéder à Internet.',
        'hint': 'Connectez-vous au portail Wi‑Fi, puis rechargez DAXI.',
        'icon': 'ri-wifi-off-line',
    },
}


def _meta_for(status: int) -> dict:
    meta = ERROR_CATALOG.get(status)
    if meta:
        return meta
    return {
        'title': f'Erreur {status}',
        'lead': 'Une erreur inattendue s’est produite.',
        'hint': 'Retournez à l’accueil DAXI ou contactez le support.',
        'icon': 'ri-alert-line',
    }


def render_error(request, status: int, *, exception=None) -> HttpResponse:
    status = int(status or 500)
    if status < 400 or status > 599:
        status = 500
    meta = _meta_for(status)
    ctx = {
        'status_code': status,
        'error_title': meta['title'],
        'error_lead': meta['lead'],
        'error_hint': meta['hint'],
        'error_icon': meta['icon'],
        'home_url': '/',
        'support_url': 'https://wa.me/50944969696',
        'show_debug_bits': bool(getattr(request, 'user', None) and getattr(request.user, 'is_staff', False)),
        'exception_name': type(exception).__name__ if exception else '',
    }
    response = render(request, 'errors/error.html', ctx, status=status)
    response['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    return response


def bad_request(request, exception=None):
    return render_error(request, 400, exception=exception)


def permission_denied(request, exception=None):
    return render_error(request, 403, exception=exception)


def page_not_found(request, exception=None):
    return render_error(request, 404, exception=exception)


def server_error(request):
    return render_error(request, 500)


@require_GET
def error_preview(request, code: int):
    """Preview any catalogued error page (DEBUG or staff only)."""
    from django.conf import settings
    user = getattr(request, 'user', None)
    allowed = settings.DEBUG or (user and user.is_authenticated and user.is_staff)
    if not allowed:
        return render_error(request, 404)
    return render_error(request, int(code))


def csrf_failure(request, reason=''):
    """Custom CSRF failure page (wired via CSRF_FAILURE_VIEW)."""
    resp = render_error(request, 403)

    return resp
