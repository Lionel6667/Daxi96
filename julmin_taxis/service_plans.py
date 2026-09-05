"""
Catalogue forfaits DAXI + prix fixes — source unique côté serveur.
Le client charge /api/client/service-plans/ à la demande (pas dans le HTML).
"""
import copy

from julmin_taxis.service_plans_i18n import PLAN_CATALOG_L10N

                                                                      
FIXED_PLAN_PRICES = {
    'demi-journee': 70.0,
    'demi_journee': 70.0,
    'journee-complete': 140.0,
    'journee_complete': 140.0,
    'journee': 140.0,
    'elegance-night': 150.0,
    'elegance_night': 150.0,
}

PLAN_SLUGS = {
    'ville-a-ville': '1',
    'demi-journee': '2',
    'journee-complete': '3',
    'elegance-night': '4',
    'accueil-aeroport-cap': '5',
    'business-vip': '6',
}

                                                  
FIXED_PLAN_BY_ID = {
    '2': {
        'slug': 'demi-journee',
        'amount': 70.0,
        'btn_label': 'Demi-Journée • 70$',
    },
    '3': {
        'slug': 'journee-complete',
        'amount': 140.0,
        'btn_label': 'Journée • 140$',
    },
    '4': {
        'slug': 'elegance-night',
        'amount': 150.0,
        'btn_label': 'Élégance Night • 150$',
    },
}

PLAN_CATALOG = {
    '1': {
        'hero': 'assets/images/img87.jpg',
        'title': 'Course Ville à Ville',
        'subtitle': 'Prix à déterminer',
        'price': 'Prix sur demande',
        'description': (
            'Dites adieu aux poussières, à la chaleur, au transport en commun et au stress. '
            'Bienvenue au confort Daxi avec des chauffeurs privés expérimentés. '
            'Ce service est idéal pour les trajets entre villes, offrant confort, sécurité et ponctualité.'
        ),
        'ctaDesc': 'Contactez-nous pour une estimation personnalisée',
        'features': [
            {'icon': 'ri-time-line', 'title': 'Gagner du temps', 'desc': 'Évitez les retards et les tracas des transports en commun'},
            {'icon': 'ri-music-2-line', 'title': 'Musique à votre choix', 'desc': 'Personnalisez votre ambiance de voyage'},
            {'icon': 'ri-shield-check-line', 'title': 'Sécurité garantie', 'desc': 'Protection en cas de grève ou problème'},
            {'icon': 'ri-emotion-happy-line', 'title': 'Esprit tranquille', 'desc': 'Voyagez sereinement et sans stress'},
            {'icon': 'ri-wifi-line', 'title': 'WiFi à bord', 'desc': 'Travaillez en route avec internet'},
            {'icon': 'ri-user-voice-line', 'title': 'Service personnalisé', 'desc': 'Adaptée à vos besoins spécifiques'},
        ],
        'gallery': ['assets/images/img87.jpg', 'assets/images/img47.jpg', 'assets/images/img97.jpg', 'assets/images/img77.jfif'],
        'pricing_mode': 'dynamic',
    },
    '2': {
        'hero': 'assets/images/img97.jpg',
        'title': 'Demi-Journée',
        'subtitle': '4 heures - 70$',
        'price': '70$',
        'description': (
            'Vous aimeriez aller à une réunion le matin ? Ou passer faire des courses ? '
            'Avec Daxi tout est facile. Profitez d\'un chauffeur privé pendant 4 heures pour tous vos déplacements en ville.'
        ),
        'ctaDesc': 'Réservez votre service demi-journée maintenant',
        'features': [
            {'icon': 'ri-time-line', 'title': '4 heures de service', 'desc': 'Chauffeur privé disponible pendant 4 heures consécutives'},
            {'icon': 'ri-map-pin-2-line', 'title': 'Arrêts illimités', 'desc': 'Visitez où vous voulez en ville'},
            {'icon': 'ri-pause-circle-line', 'title': 'Attente incluse', 'desc': 'Temps d\'attente compris dans le tarif'},
            {'icon': 'ri-price-tag-3-line', 'title': 'Prix fixe', 'desc': 'Pas de surprise, tarif garanti'},
            {'icon': 'ri-focus-2-line', 'title': 'Service personnalisé', 'desc': 'Adaptée à vos besoins du moment'},
            {'icon': 'ri-customer-service-2-line', 'title': 'Qualité premium', 'desc': 'Véhicule confortable et chauffeur professionnel'},
        ],
        'gallery': ['assets/images/img97.jpg', 'assets/images/img87.jpg', 'assets/images/img47.jpg', 'assets/images/img67.jpg'],
        'pricing_mode': 'fixed',
        'fixed_amount': 70.0,
        'service_slug': 'demi-journee',
    },
    '3': {
        'hero': 'assets/images/img47.jpg',
        'title': 'Journée Complète',
        'subtitle': '8 heures - 140$',
        'price': '140$',
        'description': (
            'Idéal pour les journées chargées, les visites touristiques ou les déplacements professionnels intensifs. '
            'Profitez d\'un service complet toute la journée avec un chauffeur dédié.'
        ),
        'ctaDesc': 'Réservez votre journée complète maintenant',
        'features': [
            {'icon': 'ri-time-line', 'title': '8 heures de service', 'desc': 'Chauffeur privé disponible pendant 8 heures consécutives'},
            {'icon': 'ri-map-pin-2-line', 'title': 'Arrêts illimités', 'desc': 'Ville et zones proches, exploration complète'},
            {'icon': 'ri-pause-circle-line', 'title': 'Attente complète', 'desc': 'Tous les temps d\'attente inclus'},
            {'icon': 'ri-price-tag-3-line', 'title': 'Prix fixe garanti', 'desc': 'Pas de variation, tarif stable'},
            {'icon': 'ri-focus-2-line', 'title': 'Service flexible', 'desc': 'Adaptable à votre emploi du temps'},
            {'icon': 'ri-star-fill', 'title': 'Expérience VIP', 'desc': 'Service haut de gamme toute la journée'},
        ],
        'gallery': ['assets/images/img47.jpg', 'assets/images/img97.jpg', 'assets/images/img87.jpg', 'assets/images/img67.jpg'],
        'pricing_mode': 'fixed',
        'fixed_amount': 140.0,
        'service_slug': 'journee-complete',
    },
    '4': {
        'hero': 'assets/images/img77.jfif',
        'title': 'Elegance Night',
        'subtitle': 'Jusqu\'à 3 heures - 150$',
        'price': '150$',
        'description': (
            'Pour vos soirées spéciales. Service premium avec véhicule confortable pour sortir le soir. '
            'Réservez une expérience VIP pour votre soirée maintenant.'
        ),
        'ctaDesc': 'Réservez votre soirée VIP maintenant',
        'features': [
            {'icon': 'ri-moon-line', 'title': 'Service nocturne', 'desc': 'Votre chauffeur jusqu\'à 3h du matin'},
            {'icon': 'ri-map-pin-2-line', 'title': 'Arrêts en ville', 'desc': 'Accès complet à tous les lieux'},
            {'icon': 'ri-shield-check-line', 'title': 'Sécurité premium', 'desc': 'Trajet sécurisé et protégé'},
            {'icon': 'ri-star-fill', 'title': 'Véhicule haut de gamme', 'desc': 'Élégance et confort supérieur'},
            {'icon': 'ri-customer-service-2-line', 'title': 'Service VIP', 'desc': 'Attention personnalisée complète'},
            {'icon': 'ri-bookmark-line', 'title': 'Réservation requise', 'desc': 'Planifier à l\'avance'},
        ],
        'gallery': ['assets/images/img77.jfif', 'assets/images/img67.jpg', 'assets/images/img87.jpg', 'assets/images/img47.jpg'],
        'pricing_mode': 'fixed',
        'fixed_amount': 150.0,
        'service_slug': 'elegance-night',
    },
    '5': {
        'hero': 'assets/images/img87.jpg',
        'title': 'Accueil Aéroport Cap-Haïtien',
        'subtitle': 'Prix calculé · panneau nominatif',
        'price': 'Tarif dynamique',
        'description': (
            'Vous arrivez en avion à Cap-Haïtien ? Un chauffeur DAXI vous accueille à l\'aéroport avec un panneau à votre nom, '
            'présent 1 heure avant l\'heure d\'atterrissage prévue. Le prix est calculé par notre système tarifaire.'
        ),
        'ctaDesc': 'Réservez votre accueil aéroport en quelques clics',
        'features': [
            {'icon': 'ri-flight-land-line', 'title': 'Accueil personnalisé', 'desc': 'Panneau avec votre nom à la sortie'},
            {'icon': 'ri-time-line', 'title': '1 h avant le vol', 'desc': 'Chauffeur sur place à l\'avance'},
            {'icon': 'ri-map-pin-line', 'title': 'Aéroport CAP', 'desc': 'Départ fixe — Hugo Chávez, Cap-Haïtien'},
            {'icon': 'ri-money-dollar-circle-line', 'title': 'Prix dynamique', 'desc': 'Calculé selon la distance et la demande'},
            {'icon': 'ri-hourglass-line', 'title': 'Retards facturés', 'desc': 'Attente au-delà du forfait selon tarifs DAXI'},
            {'icon': 'ri-car-line', 'title': 'Confort garanti', 'desc': 'Véhicule propre et chauffeur professionnel'},
        ],
        'gallery': ['assets/images/img87.jpg', 'assets/images/img47.jpg', 'assets/images/img97.jpg'],
        'pricing_mode': 'dynamic',
        'service_slug': 'accueil-aeroport-cap',
    },
    '6': {
        'hero': 'assets/images/img67.jpg',
        'title': 'Business / VIP',
        'subtitle': 'Abonnement - Prix personnalisé',
        'price': 'À négocier',
        'description': (
            'Solution idéale pour les clients réguliers et les entreprises. Bénéficiez d\'avantages exclusifs, '
            'd\'un service prioritaire et d\'une attention personnalisée.'
        ),
        'ctaDesc': 'Contactez-nous pour une proposition d\'abonnement',
        'features': [
            {'icon': 'ri-building-line', 'title': 'Solutions d\'entreprise', 'desc': 'Adaptée aux besoins professionnels réguliers'},
            {'icon': 'ri-vip-crown-line', 'title': 'Service prioritaire', 'desc': 'Accès prioritaire et réservation garantie'},
            {'icon': 'ri-discount-percent-line', 'title': 'Tarifs préférentiels', 'desc': 'Réductions exclusives pour abonnés'},
            {'icon': 'ri-team-line', 'title': 'Chauffeurs dédiés', 'desc': 'Les mêmes chauffeurs de confiance'},
            {'icon': 'ri-phone-line', 'title': 'Support 24/7', 'desc': 'Assistance personnalisée permanente'},
            {'icon': 'ri-contract-line', 'title': 'Contrat flexible', 'desc': 'Conditions adaptables à vos besoins'},
        ],
        'gallery': ['assets/images/img67.jpg', 'assets/images/img87.jpg', 'assets/images/img97.jpg', 'assets/images/img47.jpg'],
        'pricing_mode': 'quote',
        'service_slug': 'business-vip',
    },
}


def resolve_fixed_plan_price(service_plan: str):
    """Retourne le prix fixe pour un slug forfait, ou None."""
    if not service_plan:
        return None
    return FIXED_PLAN_PRICES.get(service_plan.strip().lower())


def service_plans_summary():
    """Liste courte pour bootstrap mobile."""
    rows = []
    for slug, pid in PLAN_SLUGS.items():
        plan = PLAN_CATALOG.get(pid, {})
        price = plan.get('price', '')
        if plan.get('pricing_mode') == 'fixed' and plan.get('fixed_amount'):
            price = f"{int(plan['fixed_amount'])}$"
        elif plan.get('pricing_mode') == 'dynamic':
            price = 'Dynamique'
        elif plan.get('pricing_mode') == 'quote':
            price = 'Sur devis'
        rows.append({'slug': slug, 'title': plan.get('title', slug), 'price': price})
    return rows


def _localize_plan(plan_id, plan, lang):
    if lang == 'fr' or lang not in PLAN_CATALOG_L10N:
        return plan
    loc = PLAN_CATALOG_L10N[lang].get(str(plan_id))
    if not loc:
        return plan
    out = copy.deepcopy(plan)
    for key, val in loc.items():
        if key == 'features' and isinstance(val, list):
            for i, feat in enumerate(val):
                if i < len(out.get('features', [])):
                    out['features'][i].update(feat)
        else:
            out[key] = val
    return out


def service_plans_api_payload(lang='fr'):
    lang = (lang or 'fr').lower()[:2]
    if lang not in PLAN_CATALOG_L10N:
        lang = 'fr'
    plans = {
        pid: _localize_plan(pid, plan, lang)
        for pid, plan in PLAN_CATALOG.items()
    }
    return {
        'ok': True,
        'lang': lang,
        'plans': plans,
        'fixed_by_id': FIXED_PLAN_BY_ID,
        'slugs': PLAN_SLUGS,
    }
