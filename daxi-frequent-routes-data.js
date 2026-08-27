
(function (global) {
    'use strict';

    var CITY_COORDS = {
        'Cap-Haïtien': { lat: 19.759444, lng: -72.201111 },
        'Ouanaminthe': { lat: 19.549444, lng: -71.724444 },
        'Port de Paix': { lat: 19.933333, lng: -72.833333 },
        'Gonaïves': { lat: 19.451389, lng: -72.688889 },
        'Fòlibète': { lat: 19.662500, lng: -71.836389 },
        'Hinche': { lat: 19.150000, lng: -72.016667 },
        'Mol St Nicolas': { lat: 19.806667, lng: -73.376389 }
    };

    function img(path, alt) {
        var parts = path.replace(/\\/g, '/').split('/');
        return { url: 'villes/' + parts.map(encodeURIComponent).join('/'), alt: alt };
    }

    var CAP_HAITIEN_IMAGES = [
        '2823547ffba79f081d5144b7ab283767.jpg', '2edefd2f9246ca710a2b486b856d98a6.jpg',
        '3a1e4aa7384a97535b4e0f6890a125a6.jpg', '47caf67613130649dc9d89e13b9e9d31.jpg',
        '49c9736c72498a2d58e8b56ba29b8660.jpg', '5aac0a659464cb2ee3dea330ec12ddef.jpg',
        '5b0bc117321ea8db8f223543a7b97e73.jpg', '5ba0563f24b701e6807e619ff16f44e1.jpg',
        '68de96fe915f4e71fed76d81804fe691.jpg', '69d38e7ead32c96e8f06e17fd1b57cf3.jpg',
        '874b7b72db9a78f4246db6dea0e5fa09.jpg', 'aa83e7f46659a3542e1abed0e1a4a889.jpg',
        'c45c3c7d808759c1240a9f02b1d5cd96.jpg', 'cdd8c2acc8af12c33c3dc923ad58be20.jpg',
        'e3333b9e6e0ab394e88667c1454a6c95.jpg', 'e3deaac3781e01b1e2be2dc6722fdf62.jpg'
    ].map(function (f, i) {
        return img('Cap-Haitien/' + f, 'Cap-Haïtien vue ' + (i + 1));
    });

    var GONAIVES_IMAGES = [
        img('Gonaive/926ebf1dc94412decb23154f0ad4c851.jpg', 'Gonaïves centre'),
        img('Gonaive/d58075949c0068e6f97a7e5a2b660686 (1).jpg', 'Gonaïves — paysage'),
        img('Gonaive/gonaives3.jpg', 'Gonaïves'),
        img('Gonaive/gonaive4.jpg', 'Gonaïves — ville')
    ];

    var PORT_DE_PAIX_IMAGES = [
        img('Port de paix/Port de paix.jpg', 'Port-de-Paix'),
        img('Port de paix/Port de paix 2.png', 'Port-de-Paix — baie'),
        img('Port de paix/port de paix 3.png', 'Port-de-Paix — panorama'),
        img('Port de paix/port de paix 4.png', 'Port-de-Paix — côte')
    ];

    var CITY_IMAGES = {
        'Cap-Haïtien': CAP_HAITIEN_IMAGES.slice(0, 2),
        'Ouanaminthe': [
            img('Ouanaminthe/ouanaminthe-cascade.jpg', 'Petit Saut d\'eau Ouanaminthe'),
            img('Ouanaminthe/ouanaminthe-eglise.jpg', 'Église Apostolique Ouanaminthe')
        ],
        'Port de Paix': PORT_DE_PAIX_IMAGES,
        'Gonaïves': GONAIVES_IMAGES,
        'Fòlibète': [
            img('Fort Liberte/Fort-Liberte.jpg', 'Fort-Liberté'),
            img('Fort Liberte/Fort-Liberte 2.webp', 'Baie de Fort-Liberté')
        ],
        'Mol St Nicolas': [
            img('mol saint nicolas/mole-saint-nicolas-1.jpg', 'Môle Saint-Nicolas'),
            img('mol saint nicolas/mol saint nicola 2.jpg', 'Baie du Môle')
        ],
        'Hinche': [
            img('Hinche/hinche-cathedrale.jpg', 'Cathédrale de Hinche'),
            img('Hinche/hinche-vue-aerienne.jpg', 'Hinche — plateau central')
        ]
    };

    var ROTATING_CITY_POOLS = {
        'Cap-Haïtien': CAP_HAITIEN_IMAGES,
        'Gonaïves': GONAIVES_IMAGES,
        'Port de Paix': PORT_DE_PAIX_IMAGES
    };

    /** 2 images par ville ; chaque apparition (from/to sur une route) prend la paire suivante du pool. */
    function pickCityImages(cityName, routeIndex, slot) {
        var pool = ROTATING_CITY_POOLS[cityName];
        if (pool && pool.length) {
            slot = slot || 'from';
            var routes = global.DAXI_FREQUENT_ROUTES || [];
            var occ = 0;
            for (var i = 0; i < routes.length; i++) {
                var r = routes[i];
                if (!r) continue;
                if (r.from === cityName) {
                    if (i === routeIndex && slot === 'from') break;
                    occ++;
                }
                if (r.to === cityName) {
                    if (i === routeIndex && slot === 'to') break;
                    occ++;
                }
            }
            var start = (occ * 2) % pool.length;
            if (pool.length === 1) return [pool[0], pool[0]];
            return [
                pool[start],
                pool[(start + 1) % pool.length]
            ];
        }
        return (CITY_IMAGES[cityName] || []).slice(0, 2);
    }

    var ROUTE_WAYPOINTS = {
        'Cap-Haïtien|Ouanaminthe': [
            [19.752, -72.185], [19.738, -72.172], [19.724, -72.168], [19.710, -72.155], [19.698, -72.138],
            [19.685, -72.110], [19.672, -72.082], [19.655, -72.048], [19.639, -72.009], [19.620, -71.965],
            [19.605, -71.930], [19.592, -71.895], [19.578, -71.850], [19.565, -71.780]
        ],
        'Cap-Haïtien|Port de Paix': [
            [19.788, -72.292], [19.842, -72.409], [19.893, -72.553], [19.929, -72.716], [19.936, -72.792]
        ],
        'Cap-Haïtien|Gonaïves': [
            [19.685, -72.262], [19.623, -72.335], [19.562, -72.423], [19.499, -72.535], [19.465, -72.620]
        ],
        'Cap-Haïtien|Fòlibète': [
            [19.708, -72.131], [19.682, -72.035], [19.670, -71.925]
        ],
        'Gonaïves|Port de Paix': [
            [19.516, -72.723], [19.609, -72.798], [19.719, -72.862], [19.833, -72.862], [19.905, -72.845]
        ],
        'Cap-Haïtien|Hinche': [
            [19.692, -72.177], [19.592, -72.142], [19.475, -72.118], [19.358, -72.084], [19.242, -72.053], [19.175, -72.032]
        ],
        'Cap-Haïtien|Mol St Nicolas': [
            [19.768, -72.352], [19.802, -72.533], [19.823, -72.719], [19.828, -73.006], [19.815, -73.199], [19.808, -73.285]
        ]
    };

    function buildPreviewPath(from, to) {
        var a = CITY_COORDS[from];
        var b = CITY_COORDS[to];
        if (!a || !b) return [];
        var key = from + '|' + to;
        var mid = ROUTE_WAYPOINTS[key] || [];
        var path = [[a.lat, a.lng]];
        mid.forEach(function (p) { path.push(p); });
        path.push([b.lat, b.lng]);
        return path;
    }

    var ROUTES = [
        { from: 'Cap-Haïtien', to: 'Ouanaminthe', distance: '~54 km', duration: '~2h', priceUsd: 200 },
        { from: 'Cap-Haïtien', to: 'Port de Paix', distance: '107 km', duration: '4h40 – 6h30', priceUsd: 600 },
        { from: 'Cap-Haïtien', to: 'Gonaïves', distance: '101 km', duration: '3h30 – 4h40', priceUsd: 400 },
        { from: 'Cap-Haïtien', to: 'Fòlibète', distance: '50.7 km', duration: '~1h30', priceUsd: 150 },
        { from: 'Gonaïves', to: 'Port de Paix', distance: '79.3 km', duration: '~2h40', priceUsd: 400 },
        { from: 'Cap-Haïtien', to: 'Hinche', distance: '~100 km', duration: '~3h', priceUsd: 400 },
        { from: 'Cap-Haïtien', to: 'Mol St Nicolas', distance: '178 km', duration: '≥8h', priceUsd: 800 }
    ];

    ROUTES.forEach(function (r) {
        r.realPath = buildPreviewPath(r.from, r.to);
    });

    global.DAXI_CITY_COORDS = CITY_COORDS;
    CITY_COORDS['Folibètè'] = CITY_COORDS['Fòlibète'];
    global.DAXI_CITY_IMAGES = CITY_IMAGES;
    global.DAXI_CAP_HAITIEN_IMAGES = CAP_HAITIEN_IMAGES;
    global.DAXI_FREQUENT_ROUTES = ROUTES;
    global.DAXI_PICK_CITY_IMAGES = pickCityImages;
})(typeof window !== 'undefined' ? window : this);
