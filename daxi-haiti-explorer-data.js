
(function (global) {
    'use strict';

    
    var PLACES = [
        {
            id: 'cathedrale',
            name: 'Cathédrale Notre-Dame de l\'Assomption',
            shortName: 'Cathédrale',
            lat: 19.760839,
            lng: -72.200944,
            altitude: 6,
            image: 'assets/images/img6.jpg',
            detailImage: 'assets/images/img4.jpg',
            color: '#667eea',
            highlights: [
                'Façade néo-classique blanche sur la place d\'Armes',
                'Cœur historique du Cap-Haïtien colonial',
                'Vue sur le centre-ville et la baie'
            ],
            description: "La Cathédrale Notre-Dame de l'Assomption est l'un des symboles du Cap-Haïtien. Sa façade blanche élégante domine la place d'Armes et rappelle l'héritage architectural français de la ville. Lieu de recueillement et de mémoire, elle reste un repère incontournable pour les habitants comme pour les visiteurs.",
            history: "Construite au XVIIIe siècle à l'époque coloniale, l'édifice a traversé les siècles et survécu au violent séisme de 1842. Elle témoigne de la vitalité religieuse et culturelle du Nord d'Haïti, dans une ville qui fut longtemps surnommée le « Paris des Antilles ».",
            visitTip: "Idéal en fin d'après-midi : la lumière dorée met en valeur la façade. Respectez les offices en cours lors de la visite."
        },
        {
            id: 'verrieres',
            name: 'Monument de Vertières',
            shortName: 'Vertières',
            lat: 19.736124,
            lng: -72.220906,
            altitude: 56,
            image: 'assets/images/img8.jpg',
            detailImage: 'assets/images/img11.jpg',
            color: '#10b981',
            highlights: [
                'Dernière grande bataille de l\'indépendance (18 nov. 1803)',
                'Monument aux héros de la révolution',
                'Site de mémoire nationale'
            ],
            description: "À l'entrée sud du Cap-Haïtien, le monument de Vertières commémore la bataille décisive qui a scellé la victoire des armées indigènes face aux troupes napoléoniennes. C'est ici que fut arrachée la première indépendance noire du monde moderne.",
            history: "Le 18 novembre 1803, sous le commandement de Jean-Jacques Dessalines, les forces haïtiennes remportèrent la victoire finale. Le monument actuel, érigé en 1953 pour le 150e anniversaire, est devenu un lieu de pèlerinage patriotique où chaque année les Haïtiens célèbrent Vertières.",
            visitTip: "Accès facile depuis la Route Nationale 1. Prévoyez une courte pause photo : le site est ouvert et très fréquenté par les locaux."
        },
        {
            id: 'labadee',
            name: 'Labadee',
            shortName: 'Labadee',
            lat: 19.786694,
            lng: -72.243901,
            altitude: 8,
            image: 'assets/images/img7.jpg',
            detailImage: 'assets/images/img9.webp.jpg',
            color: '#06b6d4',
            highlights: [
                'Plages de sable blanc et eaux turquoise',
                'Baie protégée au nord du Cap-Haïtien',
                'Artisanat local et paysages côtiers'
            ],
            description: "Labadee (Labadie) est l'une des plus belles côtes d'Haïti : une baie bordée de collines verdoyantes, de plages immaculées et d'une mer d'un bleu intense. Entre détente, baignade et découverte du littoral nord, c'est une escapade paradisiaque à quelques minutes du centre historique.",
            history: "Longtemps village de pêcheurs, la baie s'est transformée à partir des années 1980 en destination touristique internationale, tout en conservant l'authenticité de la culture haïtienne. Les marchés artisanaux et les paysages environnants restent un reflet de la richesse naturelle du Nord.",
            visitTip: "Apportez maillot et crème solaire. Les meilleures conditions sont le matin, quand la mer est la plus calme."
        },
        {
            id: 'palais',
            name: 'Palais Sans-Souci',
            shortName: 'Sans-Souci',
            lat: 19.604803,
            lng: -72.218663,
            altitude: 114,
            image: 'assets/images/img15.webp.jpg',
            detailImage: 'assets/images/img10.jpg',
            color: '#8b5cf6',
            highlights: [
                '« Versailles des Caraïbes » — résidence royale',
                'Ruines majestueuses classées UNESCO',
                'Terrasses, escaliers et jardins à flanc de colline'
            ],
            description: "À Milot, les ruines du Palais Sans-Souci évoquent la grandeur du royaume d'Henri Christophe. Niché dans les collines verdoyantes, ce palais royal accueillait autrefois une cour fastueuse — aujourd'hui ses arches, escaliers et terrasses témoignent encore de l'ambition d'une Haïti libre et souveraine.",
            history: "Construit entre 1810 et 1813 pour le roi Henri Christophe, le palais fut pendant des décennies le centre du pouvoir du Nord d'Haïti. Détruit en grande partie par le séisme de 1842, il fait partie du Parc national historique classé au patrimoine mondial de l'UNESCO depuis 1982, aux côtés de la Citadelle.",
            visitTip: "Combinez la visite avec la montée vers la Citadelle. Des guides locaux sont disponibles à Milot ; chaussures confortables recommandées."
        },
        {
            id: 'citadelle',
            name: 'Citadelle La Ferrière',
            shortName: 'Citadelle',
            lat: 19.573611,
            lng: -72.243889,
            altitude: 910,
            image: 'assets/images/img.jpg',
            detailImage: 'assets/images/img12.jpg',
            color: '#f59e0b',
            highlights: [
                'Plus grande forteresse des Amériques',
                'Vue panoramique à 910 m d\'altitude',
                'Canons, casernes et remparts d\'époque',
                'Patrimoine mondial UNESCO'
            ],
            description: "La Citadelle La Ferrière couronne le sommet du Bonnet à l'Évêque, dominant la plaine du Nord. Cette forteresse colossale, visible des kilomètres à la ronde, est l'emblème de la liberté haïtienne et l'un des monuments les plus impressionnants du continent américain.",
            history: "Henri Christophe la fit édifier de 1805 à 1820 pour défendre la jeune république contre une éventuelle reconquête française. Plus de 20 000 ouvriers y travaillèrent. Jamais assiégée, elle abrita des milliers de soldats et des stocks de canon. Aujourd'hui, elle attire des visiteurs du monde entier venus admirer son architecture militaire unique.",
            visitTip: "Montée de 7 à 8 km depuis Milot : à pied (2–3 h) ou à cheval avec un guide. Prévoyez de l'eau, un chapeau et de bonnes chaussures — le vent peut être fort au sommet."
        }
    ];

    
    var ROUTES = [
        
        [
            [19.760839, -72.200944],
            [19.7582, -72.2045],
            [19.7540, -72.2090],
            [19.7495, -72.2135],
            [19.7440, -72.2175],
            [19.7390, -72.2198],
            [19.736124, -72.220906]
        ],
        
        [
            [19.736124, -72.220906],
            [19.7420, -72.2260],
            [19.7520, -72.2340],
            [19.7640, -72.2395],
            [19.7760, -72.2425],
            [19.786694, -72.243901]
        ],
        
        [
            [19.786694, -72.243901],
            [19.7780, -72.2380],
            [19.7680, -72.2320],
            [19.7550, -72.2280],
            [19.7380, -72.2240],
            [19.7200, -72.2220],
            [19.6980, -72.2200],
            [19.6720, -72.2190],
            [19.6400, -72.2188],
            [19.6200, -72.2187],
            [19.604803, -72.218663]
        ],
        
        [
            [19.604803, -72.218663],
            [19.6000, -72.2205],
            [19.5940, -72.2250],
            [19.5880, -72.2310],
            [19.5820, -72.2370],
            [19.5775, -72.2410],
            [19.573611, -72.243889]
        ]
    ];

    global.DAXI_HAITI_PLACES = PLACES;
    global.DAXI_HAITI_ROUTES = ROUTES;
})(typeof window !== 'undefined' ? window : this);
