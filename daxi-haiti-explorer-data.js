
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
            visitTip: "Idéal en fin d'après-midi : la lumière dorée met en valeur la façade. Respectez les offices en cours lors de la visite.",
                        i18n: {
                "ht": {
                    "name": "Kathedral Nòt-Dam Asompsyon",
                    "description": "Kathedral Nòt-Dam Asompsyon se youn nan senbòl Kap Ayisyen. Fasad blan li dominen Plas Zam yo epi li raple eritaj achitekti franse vil la.",
                    "history": "Bati nan 18yèm syèk nan tan kolonyal, edifis la te travèse syèk yo e li te siviv gwo tranblemanntè 1842.",
                    "visitTip": "Pi bon nan fen apremidi: limyè aoren mete fasad la an valè.",
                    "highlights": [
                        "Fasad neo-klasik blan sou Plas Zam yo",
                        "Kè istorik Kap Ayisyen kolonyal",
                        "View sou sant vil la ak bè a"
                    ]
                },
                "en": {
                    "name": "Cathedral of Our Lady of the Assumption",
                    "description": "The Cathedral of Our Lady of the Assumption is one of Cap-Haïtien’s symbols. Its elegant white façade overlooks the Place d’Armes and recalls the city’s French architectural heritage.",
                    "history": "Built in the 18th century during the colonial era, the building survived centuries and the violent earthquake of 1842.",
                    "visitTip": "Best in late afternoon when golden light highlights the façade. Respect ongoing services.",
                    "highlights": [
                        "White neoclassical façade on Place d’Armes",
                        "Historic heart of colonial Cap-Haïtien",
                        "Views over downtown and the bay"
                    ]
                },
                "es": {
                    "name": "Catedral de Nuestra Señora de la Asunción",
                    "description": "La Catedral de Nuestra Señora de la Asunción es uno de los símbolos de Cap-Haïtien. Su fachada blanca domina la Place d’Armes y recuerda el legado arquitectónico francés de la ciudad.",
                    "history": "Construida en el siglo XVIII en la época colonial, el edificio atravesó los siglos y sobrevivió al violento terremoto de 1842.",
                    "visitTip": "Ideal al final de la tarde: la luz dorada realza la fachada.",
                    "highlights": [
                        "Fachada neoclásica blanca en Place d’Armes",
                        "Corazón histórico del Cap-Haïtien colonial",
                        "Vista del centro y de la bahía"
                    ]
                }
            }
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
            visitTip: "Accès facile depuis la Route Nationale 1. Prévoyez une courte pause photo : le site est ouvert et très fréquenté par les locaux.",
                        i18n: {
                "ht": {
                    "name": "Moniman Vètyè",
                    "description": "Nan antre sid Kap Ayisyen, moniman Vètyè a komemore batay desizif ki te sele viktwa lame endijèn yo kont twoup Napoleon yo.",
                    "history": "18 novanm 1803, anba kòmandman Jean-Jacques Dessalines, fòs ayisyen yo te rempote viktwa final la.",
                    "visitTip": "Aksè fasil depi Route Nationale 1. Yon ti poz foto rapid rekòmande.",
                    "highlights": [
                        "Dènye gwo batay endepandans (18 nov. 1803)",
                        "Moniman ewo revolisyon yo",
                        "Sit memwa nasyonal"
                    ]
                },
                "en": {
                    "name": "Vertières Monument",
                    "description": "At the southern entrance of Cap-Haïtien, the Vertières monument commemorates the decisive battle that sealed victory over Napoleonic troops.",
                    "history": "On 18 November 1803, under Jean-Jacques Dessalines, Haitian forces won the final victory. The current monument was erected in 1953.",
                    "visitTip": "Easy access from Route Nationale 1. Plan a short photo stop.",
                    "highlights": [
                        "Last major independence battle (18 Nov 1803)",
                        "Monument to the revolution heroes",
                        "National memorial site"
                    ]
                },
                "es": {
                    "name": "Monumento de Vertières",
                    "description": "En la entrada sur de Cap-Haïtien, el monumento de Vertières conmemora la batalla decisiva que selló la victoria frente a las tropas napoleónicas.",
                    "history": "El 18 de noviembre de 1803, bajo Jean-Jacques Dessalines, las fuerzas haitianas lograron la victoria final.",
                    "visitTip": "Acceso fácil desde la Route Nationale 1. Reserve una breve pausa para fotos.",
                    "highlights": [
                        "Última gran batalla de la independencia (18 nov. 1803)",
                        "Monumento a los héroes de la revolución",
                        "Sitio de memoria nacional"
                    ]
                }
            }
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
            visitTip: "Apportez maillot et crème solaire. Les meilleures conditions sont le matin, quand la mer est la plus calme.",
                        i18n: {
                "ht": {
                    "name": "Labadi",
                    "description": "Labadi se youn nan pi bèl kòt Ayiti: yon bè antoure ak mòn vèt, plaj blan, ak yon lanmè ble fonse.",
                    "history": "Lontan vilaj pechè, bè a tounen destinasyon touris entènasyonal depi ane 1980 yo pandan l kenbe otantisite kilti ayisyen an.",
                    "visitTip": "Pote mayo ak krèm solèy. Pi bon kondisyon yo se maten.",
                    "highlights": [
                        "Plaj sab blan ak dlo turkwaz",
                        "Bè pwoteje nan nò Kap Ayisyen",
                        "Atizana lokal ak peyizaj kòtye"
                    ]
                },
                "en": {
                    "name": "Labadee",
                    "description": "Labadee is one of Haiti’s most beautiful coasts: a bay framed by green hills, immaculate beaches, and intense blue sea.",
                    "history": "Long a fishing village, the bay became an international tourist destination from the 1980s while keeping Haitian cultural authenticity.",
                    "visitTip": "Bring a swimsuit and sunscreen. Best conditions are in the morning.",
                    "highlights": [
                        "White-sand beaches and turquoise water",
                        "Protected bay north of Cap-Haïtien",
                        "Local crafts and coastal landscapes"
                    ]
                },
                "es": {
                    "name": "Labadee",
                    "description": "Labadee es una de las costas más bellas de Haití: una bahía rodeada de colinas verdes, playas inmaculadas y un mar azul intenso.",
                    "history": "Durante mucho tiempo pueblo de pescadores, la bahía se transformó desde los años 1980 en destino turístico internacional.",
                    "visitTip": "Lleve traje de baño y protector solar. Las mejores condiciones son por la mañana.",
                    "highlights": [
                        "Playas de arena blanca y aguas turquesas",
                        "Bahía protegida al norte de Cap-Haïtien",
                        "Artesanía local y paisajes costeros"
                    ]
                }
            }
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
            visitTip: "Combinez la visite avec la montée vers la Citadelle. Des guides locaux sont disponibles à Milot ; chaussures confortables recommandées.",
                        i18n: {
                "ht": {
                    "name": "Pale San-Sousi",
                    "description": "Nan Milo, kraze Pale San-Sousi a raple gwo potansyèl wayòm Henri Christophe. Arches, eskalye ak teras yo temwaye ambisyon yon Ayiti lib.",
                    "history": "Bati ant 1810 ak 1813 pou wa Henri Christophe, pale a te sant pouvwa Nò a. Tranblemanntè 1842 detwi anpil nan li.",
                    "visitTip": "Konbine vizit la ak monte nan Sitadèl. Soulye konfòtab rekòmande.",
                    "highlights": [
                        "« Versailles Karayib » — rezidans wayal",
                        "Kraze majeste klase UNESCO",
                        "Teras, eskalye ak jaden sou mòn"
                    ]
                },
                "en": {
                    "name": "Sans-Souci Palace",
                    "description": "In Milot, the ruins of Sans-Souci Palace evoke the grandeur of Henri Christophe’s kingdom — arches, stairways and terraces of a free Haiti.",
                    "history": "Built between 1810 and 1813 for King Henri Christophe, the palace was largely destroyed by the 1842 earthquake and is now UNESCO-listed.",
                    "visitTip": "Combine with the Citadelle climb. Comfortable shoes recommended.",
                    "highlights": [
                        "“Versailles of the Caribbean” — royal residence",
                        "Majestic UNESCO-listed ruins",
                        "Terraces, stairways and hillside gardens"
                    ]
                },
                "es": {
                    "name": "Palacio Sans-Souci",
                    "description": "En Milot, las ruinas del Palacio Sans-Souci evocan la grandeza del reino de Henri Christophe.",
                    "history": "Construido entre 1810 y 1813 para el rey Henri Christophe, fue destruido en gran parte por el terremoto de 1842.",
                    "visitTip": "Combine la visita con la subida a la Ciudadela. Calzado cómodo recomendado.",
                    "highlights": [
                        "«Versalles del Caribe» — residencia real",
                        "Ruinas majestuosas UNESCO",
                        "Terrazas, escaleras y jardines"
                    ]
                }
            }
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
                'Vue panoramique sur la plaine du Nord',
                'Canons, casernes et remparts d\'époque',
                'Patrimoine mondial UNESCO'
            ],
            description: "La Citadelle La Ferrière couronne le sommet du Bonnet à l'Évêque, dominant la plaine du Nord. Cette forteresse colossale, visible des kilomètres à la ronde, est l'emblème de la liberté haïtienne et l'un des monuments les plus impressionnants du continent américain.",
            history: "Henri Christophe la fit édifier de 1805 à 1820 pour défendre la jeune république contre une éventuelle reconquête française. Plus de 20 000 ouvriers y travaillèrent. Jamais assiégée, elle abrita des milliers de soldats et des stocks de canon. Aujourd'hui, elle attire des visiteurs du monde entier venus admirer son architecture militaire unique.",
            visitTip: "Montée de 7 à 8 km depuis Milot : à pied (2–3 h) ou à cheval avec un guide. Prévoyez de l'eau, un chapeau et de bonnes chaussures — le vent peut être fort au sommet.",
                        i18n: {
                "ht": {
                    "name": "Sitadèl Laferyè",
                    "description": "Sitadèl Laferyè kouwone tèt Bonèt Evek la, li dominen plèn Nò a. Fòtèrès kolosal sa a se senbòl libète ayisyen an.",
                    "history": "Henri Christophe te fè bati li soti 1805 rive 1820 pou defann jèn repiblik la. Plis pase 20 000 ouvriye te travay sou li.",
                    "visitTip": "Monte 7–8 km depi Milo: a pye oswa sou chwal ak gid. Pote dlo ak chapo.",
                    "highlights": [
                        "Pi gwo fòtèrès Amerik yo",
                        "View panoramik sou plèn Nò a",
                        "Kanon, kazèn ak rempa epòk",
                        "Patrimwàn mondyal UNESCO"
                    ]
                },
                "en": {
                    "name": "Citadelle La Ferrière",
                    "description": "Citadelle La Ferrière crowns Bonnet à l’Évêque and dominates the northern plain — an emblem of Haitian freedom.",
                    "history": "Henri Christophe had it built from 1805 to 1820 to defend the young republic. More than 20,000 workers took part.",
                    "visitTip": "7–8 km climb from Milot on foot or horseback with a guide. Bring water and a hat.",
                    "highlights": [
                        "Largest fortress in the Americas",
                        "Panoramic view of the northern plain",
                        "Period cannons, barracks and ramparts",
                        "UNESCO World Heritage"
                    ]
                },
                "es": {
                    "name": "Ciudadela La Ferrière",
                    "description": "La Ciudadela La Ferrière corona el Bonnet à l’Évêque y domina la llanura del Norte: emblema de la libertad haitiana.",
                    "history": "Henri Christophe la hizo construir de 1805 a 1820 para defender la joven república. Más de 20.000 obreros trabajaron allí.",
                    "visitTip": "Subida de 7–8 km desde Milot a pie o a caballo con guía. Lleve agua y sombrero.",
                    "highlights": [
                        "Mayor fortaleza de las Américas",
                        "Vista panorámica de la llanura del Norte",
                        "Cañones, cuarteles y murallas de época",
                        "Patrimonio mundial UNESCO"
                    ]
                }
            }
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
