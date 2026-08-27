"""Villes / communes par département — bbox (lng_min, lat_min, lng_max, lat_max)."""
from __future__ import annotations

from admin_panel.models import DEPT_DEFAULT_BOUNDS


def _cb(lng: float, lat: float, d: float = 0.07) -> tuple[float, float, float, float]:
    return (lng - d, lat - d, lng + d, lat + d)


DEPT_CITIES: dict[str, list[dict]] = {
    'nord': [
        {'slug': 'cap_haitien', 'name': 'Cap-Haïtien', 'bbox': _cb(-72.33, 19.76)},
        {'slug': 'quartier_morin', 'name': 'Quartier-Morin', 'bbox': _cb(-72.15, 19.70)},
        {'slug': 'limonade', 'name': 'Limonade', 'bbox': _cb(-72.12, 19.67)},
        {'slug': 'limbe', 'name': 'Limbe', 'bbox': _cb(-72.12, 19.70)},
        {'slug': 'plaine_du_nord', 'name': 'Plaine du Nord', 'bbox': _cb(-72.27, 19.82)},
        {'slug': 'marmelade', 'name': 'Marmelade', 'bbox': _cb(-72.35, 19.52)},
        {'slug': 'borgne', 'name': 'Borgne', 'bbox': _cb(-72.52, 19.84)},
        {'slug': 'port_margot', 'name': 'Port-Margot', 'bbox': _cb(-72.42, 19.75)},
        {'slug': 'milot', 'name': 'Milot', 'bbox': _cb(-72.22, 19.52)},
        {'slug': 'grande_riviere', 'name': 'Grande-Rivière du Nord', 'bbox': _cb(-71.90, 19.58)},
        {'slug': 'acul_du_nord', 'name': 'Acul-du-Nord', 'bbox': _cb(-72.32, 19.68)},
        {'slug': 'plaisance', 'name': 'Plaisance', 'bbox': _cb(-72.47, 19.60)},
        {'slug': 'pilate', 'name': 'Pilate', 'bbox': _cb(-72.55, 19.63)},
        {'slug': 'saint_raphael', 'name': 'Saint-Raphaël', 'bbox': _cb(-72.20, 19.44)},
        {'slug': 'dondon', 'name': 'Dondon', 'bbox': _cb(-72.25, 19.53)},
        {'slug': 'pignon', 'name': 'Pignon', 'bbox': _cb(-72.12, 19.35)},
        {'slug': 'ranquitte', 'name': 'Ranquitte', 'bbox': _cb(-72.08, 19.42)},
        {'slug': 'la_victoire', 'name': 'La Victoire', 'bbox': _cb(-72.18, 19.28)},
        {'slug': 'bahon', 'name': 'Bahon', 'bbox': _cb(-72.07, 19.48)},
        {'slug': 'ennery', 'name': 'Ennery', 'bbox': _cb(-72.48, 19.50)},
    ],
    'nord_est': [
        {'slug': 'fort_liberte', 'name': 'Fort-Liberté', 'bbox': _cb(-71.75, 19.66)},
        {'slug': 'ferrier', 'name': 'Ferrier', 'bbox': _cb(-71.80, 19.62)},
        {'slug': 'perches', 'name': 'Perches', 'bbox': _cb(-71.92, 19.62)},
        {'slug': 'ouanaminthe', 'name': 'Ouanaminthe', 'bbox': _cb(-71.65, 19.55)},
        {'slug': 'mont_organise', 'name': 'Mont-Organisé', 'bbox': _cb(-71.78, 19.48)},
        {'slug': 'trou_du_nord', 'name': 'Trou du Nord', 'bbox': _cb(-71.95, 19.62)},
        {'slug': 'caracol', 'name': 'Caracol', 'bbox': _cb(-71.92, 19.75)},
        {'slug': 'terrier_rouge', 'name': 'Terrier-Rouge', 'bbox': _cb(-71.78, 19.58)},
        {'slug': 'vallières', 'name': 'Vallières', 'bbox': _cb(-71.92, 19.48)},
        {'slug': 'carice', 'name': 'Carice', 'bbox': _cb(-71.85, 19.42)},
    ],
    'nord_ouest': [
        {'slug': 'port_de_paix', 'name': 'Port-de-Paix', 'bbox': _cb(-72.94, 19.94)},
        {'slug': 'la_pointe', 'name': 'La Pointe', 'bbox': _cb(-72.85, 19.88)},
        {'slug': 'bassin_bleu', 'name': 'Bassin-Bleu', 'bbox': _cb(-72.78, 19.82)},
        {'slug': 'saint_louis_nord', 'name': 'Saint-Louis du Nord', 'bbox': _cb(-72.94, 19.88)},
        {'slug': 'anse_rouge', 'name': 'Anse-Rouge', 'bbox': _cb(-73.05, 19.85)},
        {'slug': 'mole_st_nicolas', 'name': 'Môle-Saint-Nicolas', 'bbox': _cb(-73.25, 19.85)},
        {'slug': 'jean_rabel', 'name': 'Jean-Rabel', 'bbox': _cb(-73.18, 19.85)},
        {'slug': 'bombardopolis', 'name': 'Bombardopolis', 'bbox': _cb(-73.35, 19.72)},
    ],
    'artibonite': [
        {'slug': 'gonaives', 'name': 'Gonaïves', 'bbox': _cb(-72.68, 19.45)},
        {'slug': 'ennery_artibonite', 'name': 'Ennery (Artibonite)', 'bbox': _cb(-72.48, 19.48)},
        {'slug': 'dessalines', 'name': 'Dessalines', 'bbox': _cb(-72.48, 19.28)},
        {'slug': 'petite_riviere', 'name': 'Petite-Rivière de l\'Artibonite', 'bbox': _cb(-72.48, 19.12)},
        {'slug': 'saint_marc', 'name': 'Saint-Marc', 'bbox': _cb(-72.68, 19.12)},
        {'slug': 'les_arcadins', 'name': 'Les Arcadins', 'bbox': _cb(-72.72, 19.05)},
        {'slug': 'gros_morne', 'name': 'Gros-Morne', 'bbox': _cb(-72.62, 19.70)},
        {'slug': 'terre_neuve', 'name': 'Terre-Neuve', 'bbox': _cb(-72.78, 19.58)},
        {'slug': 'marmont', 'name': 'Marmont', 'bbox': _cb(-72.52, 19.38)},
    ],
    'centre': [
        {'slug': 'hinche', 'name': 'Hinche', 'bbox': _cb(-71.97, 19.15)},
        {'slug': 'maïssade', 'name': 'Maïssade', 'bbox': _cb(-72.15, 19.18)},
        {'slug': 'thomonde', 'name': 'Thomonde', 'bbox': _cb(-71.98, 19.02)},
        {'slug': 'cerca_la_source', 'name': 'Cerca-la-Source', 'bbox': _cb(-71.78, 19.02)},
        {'slug': 'mirebalais', 'name': 'Mirebalais', 'bbox': _cb(-72.05, 18.88)},
        {'slug': 'lascahobas', 'name': 'Lascahobas', 'bbox': _cb(-71.85, 18.95)},
        {'slug': 'belladere', 'name': 'Belladère', 'bbox': _cb(-71.72, 18.88)},
        {'slug': 'saut_deau', 'name': 'Saut-d\'Eau', 'bbox': _cb(-72.18, 18.82)},
    ],
    'ouest': [
        {'slug': 'port_au_prince', 'name': 'Port-au-Prince', 'bbox': _cb(-72.34, 18.54)},
        {'slug': 'petion_ville', 'name': 'Pétion-Ville', 'bbox': _cb(-72.28, 18.51)},
        {'slug': 'delmas', 'name': 'Delmas', 'bbox': _cb(-72.30, 18.55)},
        {'slug': 'carrefour', 'name': 'Carrefour', 'bbox': _cb(-72.38, 18.55)},
        {'slug': 'cite_soleil', 'name': 'Cité Soleil', 'bbox': _cb(-72.33, 18.58)},
        {'slug': 'tabarre', 'name': 'Tabarre', 'bbox': _cb(-72.25, 18.58)},
        {'slug': 'croix_des_bouquets', 'name': 'Croix-des-Bouquets', 'bbox': _cb(-72.22, 18.58)},
        {'slug': 'kenscoff', 'name': 'Kenscoff', 'bbox': _cb(-71.98, 18.45)},
        {'slug': 'ganthier', 'name': 'Ganthier', 'bbox': _cb(-72.05, 18.52)},
        {'slug': 'leogane', 'name': 'Léogâne', 'bbox': _cb(-72.62, 18.50)},
        {'slug': 'grand_goave', 'name': 'Grand-Goâve', 'bbox': _cb(-72.78, 18.42)},
    ],
    'sud': [
        {'slug': 'les_cayes', 'name': 'Les Cayes', 'bbox': _cb(-73.74, 18.23)},
        {'slug': 'torbeck', 'name': 'Torbeck', 'bbox': _cb(-73.38, 18.18)},
        {'slug': 'chantal', 'name': 'Chantal', 'bbox': _cb(-73.88, 18.18)},
        {'slug': 'aquin', 'name': 'Aquin', 'bbox': _cb(-73.35, 18.30)},
        {'slug': 'port_salut', 'name': 'Port-Salut', 'bbox': _cb(-73.18, 18.10)},
        {'slug': 'chardonnières', 'name': 'Chardonnières', 'bbox': _cb(-74.08, 18.28)},
        {'slug': 'cotes_de_fer', 'name': 'Côtes-de-Fer', 'bbox': _cb(-72.98, 18.18)},
        {'slug': 'camp_perrin', 'name': 'Camp-Perrin', 'bbox': _cb(-73.68, 18.32)},
    ],
    'sud_est': [
        {'slug': 'jacmel', 'name': 'Jacmel', 'bbox': _cb(-72.53, 18.24)},
        {'slug': 'marigot', 'name': 'Marigot', 'bbox': _cb(-72.28, 18.25)},
        {'slug': 'bainet', 'name': 'Bainet', 'bbox': _cb(-72.68, 18.22)},
        {'slug': 'cotes_de_fer_se', 'name': 'Côtes-de-Fer', 'bbox': _cb(-72.98, 18.18)},
        {'slug': 'belle_anse', 'name': 'Belle-Anse', 'bbox': _cb(-71.98, 18.22)},
        {'slug': 'thiotte', 'name': 'Thiotte', 'bbox': _cb(-71.82, 18.25)},
        {'slug': 'anse_a_pitres', 'name': 'Anse-à-Pitres', 'bbox': _cb(-71.72, 18.05)},
    ],
    'grande_anse': [
        {'slug': 'jeremie', 'name': 'Jérémie', 'bbox': _cb(-74.08, 18.65)},
        {'slug': 'dame_marie', 'name': 'Dame-Marie', 'bbox': _cb(-74.38, 18.55)},
        {'slug': 'corail', 'name': 'Corail', 'bbox': _cb(-73.88, 18.55)},
        {'slug': 'moron', 'name': 'Moron', 'bbox': _cb(-74.28, 18.48)},
        {'slug': 'chambellan', 'name': 'Chambellan', 'bbox': _cb(-74.18, 18.58)},
        {'slug': 'les_irois', 'name': 'Les Irois', 'bbox': _cb(-74.48, 18.42)},
    ],
    'nippes': [
        {'slug': 'miragoane', 'name': 'Miragoâne', 'bbox': _cb(-73.05, 18.45)},
        {'slug': 'petit_goave', 'name': 'Petit-Goâve', 'bbox': _cb(-72.85, 18.43)},
        {'slug': 'anse_a_veau', 'name': 'Anse-à-Veau', 'bbox': _cb(-73.28, 18.52)},
        {'slug': 'baraderes', 'name': 'Baradères', 'bbox': _cb(-73.62, 18.48)},
        {'slug': 'l_ile_a_vache', 'name': 'L\'Île-à-Vache', 'bbox': _cb(-73.68, 18.08)},
        {'slug': 'petite_riviere_nippes', 'name': 'Petite-Rivière de Nippes', 'bbox': _cb(-73.22, 18.42)},
    ],
}


def cities_for_department(department_slug: str) -> list[dict]:
    return list(DEPT_CITIES.get(department_slug, []))


def city_bbox(department_slug: str, city_slug: str) -> tuple[float, float, float, float] | None:
    for city in cities_for_department(department_slug):
        if city['slug'] == city_slug:
            return tuple(city['bbox'])
    return None


def department_bbox(department_slug: str) -> tuple[float, float, float, float] | None:
    bounds = DEPT_DEFAULT_BOUNDS.get(department_slug)
    if not bounds:
        return None
    return (
        bounds['lng_min'], bounds['lat_min'],
        bounds['lng_max'], bounds['lat_max'],
    )


def merged_bbox(bboxes: list[tuple[float, float, float, float]]) -> tuple[float, float, float, float]:
    lng_mins = [b[0] for b in bboxes]
    lat_mins = [b[1] for b in bboxes]
    lng_maxs = [b[2] for b in bboxes]
    lat_maxs = [b[3] for b in bboxes]
    return min(lng_mins), min(lat_mins), max(lng_maxs), max(lat_maxs)
