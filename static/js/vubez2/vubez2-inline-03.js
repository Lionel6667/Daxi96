(function() {
    const cityImages = window.DAXI_CITY_IMAGES || {};
    const routes = window.DAXI_FREQUENT_ROUTES || [];
    const capHaitienAllImages = window.DAXI_CAP_HAITIEN_IMAGES || [];
    const container = document.getElementById('routesMapsContainer');
    if (!container || !routes.length) return;

    function getCityImages(cityName, routeIndex, slot) {
        if (window.DAXI_PICK_CITY_IMAGES) {
            return window.DAXI_PICK_CITY_IMAGES(cityName, routeIndex, slot || 'from');
        }
        if (cityName === 'Cap-Haïtien' && capHaitienAllImages.length) {
            const base = (routeIndex * 2) + (slot === 'to' ? 1 : 0);
            return [
                capHaitienAllImages[base % capHaitienAllImages.length],
                capHaitienAllImages[(base + 1) % capHaitienAllImages.length]
            ];
        }
        return (cityImages[cityName] || []).slice(0, 2);
    }

    function firstCityImageUrl(cityName, routeIndex, slot) {
        const imgs = getCityImages(cityName, routeIndex, slot);
        return imgs.length ? imgs[0].url : '';
    }

    function routeSlug(route) {
        if (window._daxiRouteSlug) return window._daxiRouteSlug(route);
        return String(route.from + '-' + route.to).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    }

    routes.forEach((route, index) => {
        const card = document.createElement('article');
        card.className = 'daxi-route-pro';
        card.setAttribute('role', 'listitem');
        card.setAttribute('data-route-slug', routeSlug(route));

        const fromImgs = getCityImages(route.from, index, 'from');
        const toImgs = getCityImages(route.to, index, 'to');
        const fromPhoto = firstCityImageUrl(route.from, index, 'from');
        const toPhoto = firstCityImageUrl(route.to, index, 'to');
        const gallery = [];
        fromImgs.forEach(function(img) { gallery.push({ img: img, city: route.from }); });
        toImgs.forEach(function(img) {
            if (!gallery.some(function(g) { return g.img.url === img.url; })) {
                gallery.push({ img: img, city: route.to });
            }
        });
        const priceLine = route.priceUsd != null ? ('$' + route.priceUsd) : '';

        card.innerHTML = ''
            + '<div class="daxi-route-pro__visual">'
            + '<div class="daxi-route-pro__img daxi-route-pro__img--from"' + (fromPhoto ? ' style="background-image:url(\'' + fromPhoto + '\')"' : '') + '></div>'
            + '<div class="daxi-route-pro__img daxi-route-pro__img--to"' + (toPhoto ? ' style="background-image:url(\'' + toPhoto + '\')"' : '') + '></div>'
            + '<div class="daxi-route-pro__visual-shade" aria-hidden="true"></div>'
            + (priceLine ? '<span class="daxi-route-pro__price">' + priceLine + '</span>' : '')
            + '</div>'
            + '<div class="daxi-route-pro__body">'
            + '<div class="daxi-route-pro__route">'
            + '<div class="daxi-route-pro__endpoint">'
            + '<span class="daxi-route-pro__endpoint-label" data-translate="routes_from">Départ</span>'
            + '<strong class="daxi-route-pro__endpoint-name">' + route.from + '</strong>'
            + '</div>'
            + '<div class="daxi-route-pro__route-arrow" aria-hidden="true"><i class="ri-arrow-right-line"></i></div>'
            + '<div class="daxi-route-pro__endpoint daxi-route-pro__endpoint--dest">'
            + '<span class="daxi-route-pro__endpoint-label" data-translate="routes_to">Arrivée</span>'
            + '<strong class="daxi-route-pro__endpoint-name">' + route.to + '</strong>'
            + '</div>'
            + '</div>'
            + '<div class="daxi-route-pro__stats">'
            + '<div class="daxi-route-pro__stat"><i class="ri-route-line"></i><span>' + route.distance + '</span></div>'
            + '<div class="daxi-route-pro__stat"><i class="ri-time-line"></i><span>' + route.duration + '</span></div>'
            + '<div class="daxi-route-pro__stat daxi-route-pro__stat--accent"><i class="ri-shield-check-line"></i><span data-translate="routes_pro_badge">Trajet vérifié</span></div>'
            + '</div>'
            + (gallery.length ? '<div class="daxi-route-pro__mosaic">' + gallery.map(function(entry) {
                return '<button type="button" class="daxi-route-pro__mosaic-item city-image-wrapper" data-city="' + entry.city + '" data-image="' + entry.img.url + '">'
                    + '<img src="' + entry.img.url + '" alt="' + (entry.img.alt || entry.city) + '" loading="lazy">'
                    + '<span>' + entry.city + '</span>'
                    + '</button>';
            }).join('') + '</div>' : '')
            + '<button type="button" class="daxi-route-pro__cta" data-route-index="' + index + '">'
            + '<span class="daxi-route-pro__cta-text" data-translate="routes_offline_book">Commander ce trajet</span>'
            + '<i class="ri-taxi-line"></i>'
            + '</button>'
            + '</div>';

        var bookBtn = card.querySelector('.daxi-route-pro__cta');
        if (bookBtn) {
            bookBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (window.daxiSetRoute) daxiSetRoute('itineraires', routeSlug(route));
                if (window.DaxiRoutesMap && window.DaxiRoutesMap.bookRoute) {
                    window.DaxiRoutesMap.bookRoute(index);
                }
            });
        }

        card.addEventListener('click', function() {
            if (window.daxiSetRoute) daxiSetRoute('itineraires', routeSlug(route));
        });

        container.appendChild(card);
    });

    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.innerHTML = ''
        + '<div class="modal-content-wrapper">'
        + '<span class="modal-close">&times;</span>'
        + '<img class="modal-image" src="" alt="">'
        + '<div class="modal-city-name"></div>'
        + '</div>';
    document.body.appendChild(modal);

    const modalImage = modal.querySelector('.modal-image');
    const modalCityName = modal.querySelector('.modal-city-name');
    const modalClose = modal.querySelector('.modal-close');

    container.addEventListener('click', function(e) {
        const imageWrapper = e.target.closest('.city-image-wrapper');
        if (!imageWrapper) return;
        e.stopPropagation();
        const imageUrl = imageWrapper.dataset.image;
        const cityName = imageWrapper.dataset.city;
        if (window._daxiOpenCityLightbox && imageUrl) {
            window._daxiOpenCityLightbox(imageUrl, cityName, cityName);
            return;
        }
        if (!imageUrl) return;
        modalImage.src = imageUrl;
        modalCityName.textContent = cityName || '';
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    });

    modalClose.addEventListener('click', function() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    });

    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    });

    if (typeof DaxiRoutesMap !== 'undefined' && DaxiRoutesMap.preloadImages) {
        DaxiRoutesMap.preloadImages();
    }
})();
