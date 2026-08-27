"""
Moteur de calcul de prix dynamique DAXI.

Algorithme :
1. Récupérer le tracé réel de la route via OSRM
2. Découper le tracé en segments
3. Pour chaque segment, détecter les zones traversées (Shapely)
4. Calculer la distance par zone
5. Appliquer la formule de prix avec impacts cumulés

Formule :
    base = distance_km × base_price_per_km
    Pour chaque zone traversée :
        zone_impact = min(sum(tag.impact_percent), max_zone_impact) / 100
        contribution = (zone_distance / total_distance) × base × (1 + zone_impact)
    Part hors-zone :
        contribution = (hors_zone_distance / total_distance) × base
    prix_brut = sum(contributions)
    prix_final = max(prix_brut × global_multiplier, minimum_price)
"""
import logging
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from .routing import get_best_route, segment_length_km

logger = logging.getLogger(__name__)


                                                                             
                                                                  
                                                                             

try:
    from shapely.geometry import LineString, Point, Polygon, shape
    SHAPELY_AVAILABLE = True
    logger.debug("Shapely disponible — calculs géométriques précis activés")
except ImportError:
    SHAPELY_AVAILABLE = False
    logger.warning(
        "Shapely non installé — utilisation du test point-in-polygon basique. "
        "Installez shapely pour des calculs plus précis : pip install shapely"
    )


def _point_in_polygon_ray_casting(lat: float, lng: float,
                                   polygon_coords: list) -> bool:
    """
    Algorithme ray-casting pour déterminer si un point est dans un polygone.
    polygon_coords : liste de [lng, lat] (format GeoJSON)
    """
    x, y = lng, lat
    n = len(polygon_coords)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon_coords[i][0], polygon_coords[i][1]
        xj, yj = polygon_coords[j][0], polygon_coords[j][1]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def _build_shapely_polygon(geojson_polygon: dict):
    """Construit un objet Shapely Polygon depuis un GeoJSON Polygon."""
    if not SHAPELY_AVAILABLE:
        return None
    try:
        return shape(geojson_polygon)
    except Exception as e:
        logger.error(f"Erreur construction Shapely polygon: {e}")
        return None


def _point_in_zone(lat: float, lng: float, zone) -> bool:
    """
    Teste si un point est dans une zone (PricingZone).
    Utilise Shapely si disponible, sinon ray-casting.
    """
    polygon_data = zone.polygon
    if not polygon_data:
        return False

                                                                              
    coords = polygon_data.get('coordinates', [])
    if not coords:
        return False

    outer_ring = coords[0]                    

    if SHAPELY_AVAILABLE:
        try:
            poly = _build_shapely_polygon(polygon_data)
            if poly and poly.is_valid:
                return poly.contains(Point(lng, lat))
        except Exception:
            pass                         

    return _point_in_polygon_ray_casting(lat, lng, outer_ring)


def _segment_fraction_in_zone(pt_a: list, pt_b: list, zone,
                                sub_divisions: int = 10) -> float:
    """
    Calcule quelle fraction d'un segment [pt_a, pt_b] est à l'intérieur d'une zone.
    Méthode : subdivise le segment en sous-points et teste chacun.
    Retourne une valeur entre 0.0 et 1.0.

    Plus `sub_divisions` est grand, plus le calcul est précis (mais plus lent).
    """
    if SHAPELY_AVAILABLE:
        try:
            poly = _build_shapely_polygon(zone.polygon)
            if poly and poly.is_valid:
                                                                    
                line = LineString([(pt_a[1], pt_a[0]), (pt_b[1], pt_b[0])])
                intersection = poly.intersection(line)
                if intersection.is_empty:
                    return 0.0
                total_len = line.length
                if total_len == 0:
                    return 0.0
                return min(intersection.length / total_len, 1.0)
        except Exception as e:
            logger.debug(f"Shapely intersection failed: {e}, using subdivision method")

                               
    in_zone_count = 0
    for i in range(sub_divisions + 1):
        t = i / sub_divisions
        lat = pt_a[0] + t * (pt_b[0] - pt_a[0])
        lng = pt_a[1] + t * (pt_b[1] - pt_a[1])
        if _point_in_zone(lat, lng, zone):
            in_zone_count += 1

    return in_zone_count / (sub_divisions + 1)


                                                                             
                  
                                                                             

def calculate_price(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    config=None,
    zones=None,
    order_id: str = '',
    save_log: bool = True,
) -> dict:
    """
    Calcule le prix d'une course.

    Args:
        origin_lat/lng   : coordonnées du départ
        dest_lat/lng     : coordonnées de l'arrivée
        config           : instance PricingConfig (auto si None)
        zones            : queryset de PricingZone (auto si None)
        order_id         : identifiant optionnel pour journalisation
        save_log         : enregistre le calcul dans PriceCalculationLog

    Returns dict:
        {
            "final_price": Decimal,
            "base_price": Decimal,
            "total_distance_km": float,
            "duration_s": float,
            "currency": str,
            "zones_breakdown": [...],
            "route_source": str,
            "config": {...},
        }
    """
    from .models import PricingConfig, PricingZone, PriceCalculationLog

                                                       
    if config is None:
        config = PricingConfig.get_active()

    if zones is None:
        zones = list(
            PricingZone.objects.filter(is_active=True).prefetch_related('tags')
        )

    base_per_km = float(config.base_price_per_km)
    global_mult = config.global_multiplier
    min_price = float(config.minimum_price)
    max_zone_impact = config.max_zone_impact_percent

                                                                                    
    route = get_best_route(origin_lat, origin_lng, dest_lat, dest_lng, zones=zones)
    coords = route['coordinates']                          
    total_distance_km = route['distance_km']
    duration_s = route['duration_s']

    if total_distance_km <= 0 or len(coords) < 2:
        final = Decimal(str(min_price))
        return {
            'final_price': final,
            'base_price': final,
            'total_distance_km': 0.0,
            'duration_s': 0.0,
            'currency': config.currency,
            'zones_breakdown': [],
            'route_source': route.get('source', 'unknown'),
            'config': _config_snapshot(config),
        }

                                                   
    zone_distance: dict[int, float] = {z.pk: 0.0 for z in zones}

                                                                            
    for i in range(len(coords) - 1):
        pt_a, pt_b = coords[i], coords[i + 1]
        seg_len = segment_length_km(pt_a, pt_b)
        if seg_len == 0:
            continue

        for zone in zones:
            fraction = _segment_fraction_in_zone(pt_a, pt_b, zone)
            if fraction > 0:
                zone_distance[zone.pk] += seg_len * fraction

                                                   
    zones_breakdown = []
    total_zone_distance = 0.0
    zone_price_total = 0.0

    for zone in zones:
        z_dist = zone_distance.get(zone.pk, 0.0)
        if z_dist <= 0:
            continue

        total_zone_distance += z_dist

                                  
        raw_impact = sum(t.impact_percent for t in zone.tags.all())
        capped_impact = min(raw_impact, max_zone_impact)
        impact_factor = capped_impact / 100.0

                               
        portion_ratio = z_dist / total_distance_km
        base_portion = base_per_km * z_dist
        zone_contrib = base_portion * (1.0 + impact_factor)
        zone_price_total += zone_contrib

        tag_details = [
            {
                'name': t.name,
                'color': t.color,
                'impact_percent': t.impact_percent,
                'time_multiplier': t.time_multiplier,
                'seconds_per_km': t.seconds_per_km,
                'is_danger': t.is_danger,
                'alert_message': t.alert_message or _default_alert_message(t),
            }
            for t in zone.tags.all()
        ]

        zones_breakdown.append({
            'zone_id': zone.pk,
            'zone_name': zone.name,
            'distance_km': round(z_dist, 3),
            'portion_percent': round(portion_ratio * 100, 1),
            'raw_impact_percent': round(raw_impact, 2),
            'capped_impact_percent': round(capped_impact, 2),
            'base_portion_price': round(base_portion, 4),
            'zone_price': round(zone_contrib, 4),
            'tags': tag_details,
            'display_color': zone.display_color,
        })

                                                            
    duration_s = _adjust_duration_for_zones(
        duration_s, total_distance_km, zone_distance, zones
    )

                               
    outside_distance = max(0.0, total_distance_km - total_zone_distance)
    outside_price = base_per_km * outside_distance

                                   
    base_price = base_per_km * total_distance_km
    gross_price = outside_price + zone_price_total
    final_price_raw = max(gross_price * global_mult, min_price)
    final_price = Decimal(str(final_price_raw)).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP
    )
    base_price_dec = Decimal(str(base_price)).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP
    )

    result = {
        'final_price': final_price,
        'base_price': base_price_dec,
        'total_distance_km': round(total_distance_km, 3),
        'duration_s': round(duration_s, 0),
        'duration_min': round(duration_s / 60.0, 1),
        'currency': config.currency,
        'zones_breakdown': zones_breakdown,
        'route_source': route.get('source', 'unknown'),
        'route_choice': route.get('route_choice', 'shortest'),
        'config': _config_snapshot(config),
        'route_coordinates': coords,
    }

                               
    if save_log:
        try:
            PriceCalculationLog.objects.create(
                origin_lat=origin_lat,
                origin_lng=origin_lng,
                destination_lat=dest_lat,
                destination_lng=dest_lng,
                total_distance_km=round(total_distance_km, 3),
                base_price=base_price_dec,
                final_price=final_price,
                currency=config.currency,
                zones_breakdown=zones_breakdown,
                config_snapshot=_config_snapshot(config),
                order_id=order_id,
            )
        except Exception as e:
            logger.error(f"Erreur lors de la journalisation du calcul: {e}")

    return result


def _default_alert_message(tag) -> str:
    if tag.is_danger:
        return (
            'Attention : vous entrez dans une zone signalée comme dangereuse. '
            'Restez vigilant.'
        )
    return f'Vous allez entrer dans une zone : {tag.name}.'


def build_client_route(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    google_duration_s: Optional[float] = None,
    google_distance_km: Optional[float] = None,
) -> dict:
    """
    Itinéraire client avec durée ajustée selon les zones admin.
    Si google_duration_s est fourni, il sert de base (Google Maps) avant ajustement.
    """
    from .models import PricingZone
    from .routing import get_best_route

    zones = list(
        PricingZone.objects.filter(is_active=True).prefetch_related('tags')
    )
    route = get_best_route(origin_lat, origin_lng, dest_lat, dest_lng, zones=zones)
    coords = route['coordinates']
    total_distance_km = (
        float(google_distance_km) if google_distance_km is not None
        else route['distance_km']
    )
    duration_s = (
        float(google_duration_s) if google_duration_s is not None
        else route['duration_s']
    )

    zone_distance: dict[int, float] = {z.pk: 0.0 for z in zones}
    for i in range(len(coords) - 1):
        pt_a, pt_b = coords[i], coords[i + 1]
        seg_len = segment_length_km(pt_a, pt_b)
        if seg_len == 0:
            continue
        for zone in zones:
            fraction = _segment_fraction_in_zone(pt_a, pt_b, zone)
            if fraction > 0:
                zone_distance[zone.pk] += seg_len * fraction

    duration_s = _adjust_duration_for_zones(
        duration_s, total_distance_km, zone_distance, zones
    )
    return {
        'coordinates': coords,
        'distance_km': total_distance_km,
        'duration_s': duration_s,
        'source': route.get('source', 'osrm'),
    }


def _adjust_duration_for_zones(
    base_duration_s: float,
    total_distance_km: float,
    zone_distance: dict,
    zones,
) -> float:
    if total_distance_km <= 0 or base_duration_s <= 0:
        return base_duration_s

    baseline_s_per_km = base_duration_s / total_distance_km
    extra_time = 0.0

    for zone in zones:
        z_dist = zone_distance.get(zone.pk, 0.0)
        if z_dist <= 0:
            continue
        tags = list(zone.tags.all())
        if not tags:
            continue

        time_tags = [t for t in tags if getattr(t, 'affects_time', False)]
        if not time_tags:
            continue

        sec_per_km_vals = [t.seconds_per_km for t in time_tags if t.seconds_per_km]
        if sec_per_km_vals:
            worst = max(sec_per_km_vals)
            zone_time = z_dist * worst
            normal_time = z_dist * baseline_s_per_km
            extra_time += max(0.0, zone_time - normal_time)
        else:
            worst_mult = max(t.time_multiplier for t in time_tags)
            if worst_mult > 1.0:
                normal_time = z_dist * baseline_s_per_km
                extra_time += normal_time * (worst_mult - 1.0)

    return base_duration_s + extra_time


def _config_snapshot(config) -> dict:
    return {
        'id': config.pk,
        'base_price_per_km': float(config.base_price_per_km),
        'minimum_price': float(config.minimum_price),
        'global_multiplier': config.global_multiplier,
        'max_zone_impact_percent': config.max_zone_impact_percent,
        'currency': config.currency,
    }
