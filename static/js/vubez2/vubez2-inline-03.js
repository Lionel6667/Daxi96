(function() {
                    const cityImages = window.DAXI_CITY_IMAGES || {};
                    const cityCoords = window.DAXI_CITY_COORDS || {};
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


                    function latLngToSVG(lat, lng, bounds, width, height, padding) {
                        const x = padding + ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * (width - 2 * padding);
                        const y = height - padding - ((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * (height - 2 * padding);
                        return { x, y };
                    }


                    function calculateBounds(path) {
                        let minLat = Infinity, maxLat = -Infinity;
                        let minLng = Infinity, maxLng = -Infinity;
                        
                        path.forEach(([lat, lng]) => {
                            minLat = Math.min(minLat, lat);
                            maxLat = Math.max(maxLat, lat);
                            minLng = Math.min(minLng, lng);
                            maxLng = Math.max(maxLng, lng);
                        });
                        
                        return { minLat, maxLat, minLng, maxLng };
                    }


                    function createSVGPath(path, bounds, width, height, padding) {

                        const points = path.map(coord => latLngToSVG(coord[0], coord[1], bounds, width, height, padding));
                        
                        if (points.length < 2) return '';
                        if (points.length === 2) {
                            return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
                        }
                        

                        let pathString = `M ${points[0].x} ${points[0].y}`;
                        

                        for (let i = 0; i < points.length - 1; i++) {
                            const p0 = i > 0 ? points[i - 1] : points[i];
                            const p1 = points[i];
                            const p2 = points[i + 1];
                            const p3 = i < points.length - 2 ? points[i + 2] : points[i + 1];
                            

                            const tension = 0.5; 
                            
                            const cp1x = p1.x + (p2.x - p0.x) / 6 * tension;
                            const cp1y = p1.y + (p2.y - p0.y) / 6 * tension;
                            
                            const cp2x = p2.x - (p3.x - p1.x) / 6 * tension;
                            const cp2y = p2.y - (p3.y - p1.y) / 6 * tension;
                            
                            pathString += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
                        }
                        
                        return pathString;
                    }


                    routes.forEach((route, index) => {
                        const card = document.createElement('article');
                        card.className = 'route-map-card';
                        card.setAttribute('role', 'listitem');
                        
                        const width = 340;
                        const height = 220;
                        const padding = 40;
                        

                        const bounds = calculateBounds(route.realPath);
                        

                        const svgPath = createSVGPath(route.realPath, bounds, width, height, padding);
                        
                        const fromCoord = cityCoords[route.from] || { lat: route.realPath[0][0], lng: route.realPath[0][1] };
                        const toCoord = cityCoords[route.to] || {
                            lat: route.realPath[route.realPath.length - 1][0],
                            lng: route.realPath[route.realPath.length - 1][1]
                        };
                        const startPos = latLngToSVG(fromCoord.lat, fromCoord.lng, bounds, width, height, padding);
                        const endPos = latLngToSVG(toCoord.lat, toCoord.lng, bounds, width, height, padding);
                        const fromPhoto = firstCityImageUrl(route.from, index, 'from');
                        const toPhoto = firstCityImageUrl(route.to, index, 'to');
                        const priceLine = route.priceUsd != null ? ` • $${route.priceUsd}` : '';
                        
                        card.innerHTML = `
                            <div class="route-map-header">
                                <h4>
                                    <i class="ri-route-line"></i>
                                    ${route.from} → ${route.to}
                                </h4>
                                <p>${route.distance} • ${route.duration}${priceLine}</p>
                            </div>
                            <div class="route-svg-container">
                                <svg viewBox="0 0 340 220" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
                                    
                                    <defs>
                                        
                                        <linearGradient id="terrain-grad-${index}" x1="0%" y1="0%" x2="100%" y2="100%">
                                            <stop offset="0%" style="stop-color:#e0f2e9;stop-opacity:1" />
                                            <stop offset="100%" style="stop-color:#d4f1de;stop-opacity:1" />
                                        </linearGradient>
                                        
                                        
                                        <pattern id="grid-${index}" width="30" height="30" patternUnits="userSpaceOnUse">
                                            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#cbd5e1" stroke-width="0.5" opacity="0.2"/>
                                        </pattern>
                                        
                                        
                                        <filter id="shadow-${index}">
                                            <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.3"/>
                                        </filter>
                                        
                                        
                                        <filter id="glow-${index}">
                                            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                                            <feMerge>
                                                <feMergeNode in="coloredBlur"/>
                                                <feMergeNode in="SourceGraphic"/>
                                            </feMerge>
                                        </filter>
                                        <clipPath id="city-photo-start-${index}"><circle cx="${startPos.x}" cy="${startPos.y - 22}" r="16"/></clipPath>
                                        <clipPath id="city-photo-end-${index}"><circle cx="${endPos.x}" cy="${endPos.y - 22}" r="16"/></clipPath>
                                    </defs>
                                    
                                    
                                    <rect width="340" height="220" fill="url(#terrain-grad-${index})"/>
                                    <rect width="340" height="220" fill="url(#grid-${index})"/>
                                    
                                    
                                    ${index === 0 ? `
                                        
                                        <ellipse cx="170" cy="100" rx="80" ry="55" fill="#a7f3d0" opacity="0.35"/>
                                        <ellipse cx="120" cy="70" rx="50" ry="35" fill="#a7f3d0" opacity="0.28"/>
                                        <ellipse cx="240" cy="130" rx="60" ry="40" fill="#a7f3d0" opacity="0.3"/>
                                        <ellipse cx="80" cy="140" rx="45" ry="30" fill="#a7f3d0" opacity="0.25"/>
                                    ` : index === 1 ? `
                                        
                                        <ellipse cx="60" cy="90" rx="70" ry="60" fill="#a7f3d0" opacity="0.4"/>
                                        <ellipse cx="280" cy="110" rx="75" ry="65" fill="#a7f3d0" opacity="0.38"/>
                                        <ellipse cx="170" cy="160" rx="55" ry="35" fill="#a7f3d0" opacity="0.27"/>
                                    ` : index === 2 ? `
                                        
                                        <ellipse cx="90" cy="50" rx="65" ry="45" fill="#a7f3d0" opacity="0.33"/>
                                        <ellipse cx="170" cy="100" rx="70" ry="50" fill="#a7f3d0" opacity="0.36"/>
                                        <ellipse cx="250" cy="150" rx="68" ry="48" fill="#a7f3d0" opacity="0.34"/>
                                        <ellipse cx="130" cy="130" rx="45" ry="32" fill="#a7f3d0" opacity="0.26"/>
                                    ` : index === 3 ? `
                                        
                                        <ellipse cx="170" cy="60" rx="90" ry="50" fill="#a7f3d0" opacity="0.4"/>
                                        <ellipse cx="100" cy="120" rx="55" ry="40" fill="#a7f3d0" opacity="0.3"/>
                                        <ellipse cx="250" cy="140" rx="60" ry="42" fill="#a7f3d0" opacity="0.32"/>
                                    ` : index === 4 ? `
                                        
                                        <ellipse cx="70" cy="70" rx="50" ry="38" fill="#a7f3d0" opacity="0.3"/>
                                        <ellipse cx="180" cy="90" rx="65" ry="45" fill="#a7f3d0" opacity="0.35"/>
                                        <ellipse cx="270" cy="130" rx="58" ry="40" fill="#a7f3d0" opacity="0.32"/>
                                        <ellipse cx="130" cy="150" rx="48" ry="35" fill="#a7f3d0" opacity="0.28"/>
                                        <ellipse cx="220" cy="60" rx="42" ry="30" fill="#a7f3d0" opacity="0.26"/>
                                    ` : `
                                        
                                        <ellipse cx="100" cy="130" rx="70" ry="50" fill="#a7f3d0" opacity="0.37"/>
                                        <ellipse cx="240" cy="145" rx="75" ry="55" fill="#a7f3d0" opacity="0.39"/>
                                        <ellipse cx="170" cy="80" rx="50" ry="35" fill="#a7f3d0" opacity="0.29"/>
                                    `}
                                    
                                    
                                    ${index === 0 ? `
                                        
                                        <path d="M 150 200 Q 200 195, 250 200 T 340 205 L 340 220 L 150 220 Z" fill="#7dd3fc" opacity="0.25"/>
                                        <ellipse cx="80" cy="160" rx="35" ry="22" fill="#7dd3fc" opacity="0.28"/>
                                    ` : index === 1 ? `
                                        
                                        <path d="M 0 195 Q 50 190, 100 195 T 180 200 L 180 220 L 0 220 Z" fill="#7dd3fc" opacity="0.27"/>
                                        <ellipse cx="250" cy="70" rx="40" ry="25" fill="#7dd3fc" opacity="0.3"/>
                                    ` : index === 2 ? `
                                        
                                        <ellipse cx="120" cy="130" rx="45" ry="28" fill="#7dd3fc" opacity="0.3"/>
                                        <ellipse cx="220" cy="90" rx="38" ry="24" fill="#7dd3fc" opacity="0.28"/>
                                        <path d="M 0 210 Q 80 208, 160 210 T 340 212 L 340 220 L 0 220 Z" fill="#7dd3fc" opacity="0.2"/>
                                    ` : index === 3 ? `
                                        
                                        <path d="M 0 192 Q 85 188, 170 192 T 340 195 L 340 220 L 0 220 Z" fill="#7dd3fc" opacity="0.28"/>
                                        <ellipse cx="270" cy="120" rx="42" ry="26" fill="#7dd3fc" opacity="0.3"/>
                                    ` : index === 4 ? `
                                        
                                        <ellipse cx="90" cy="180" rx="38" ry="23" fill="#7dd3fc" opacity="0.29"/>
                                        <ellipse cx="200" cy="60" rx="35" ry="22" fill="#7dd3fc" opacity="0.27"/>
                                        <ellipse cx="270" cy="160" rx="32" ry="20" fill="#7dd3fc" opacity="0.26"/>
                                        <path d="M 0 208 Q 100 206, 200 208 T 340 210 L 340 220 L 0 220 Z" fill="#7dd3fc" opacity="0.22"/>
                                    ` : `
                                        
                                        <path d="M 50 198 Q 130 193, 210 198 T 320 202 L 320 220 L 50 220 Z" fill="#7dd3fc" opacity="0.26"/>
                                        <ellipse cx="150" cy="70" rx="40" ry="25" fill="#7dd3fc" opacity="0.29"/>
                                        <ellipse cx="70" cy="110" rx="30" ry="20" fill="#7dd3fc" opacity="0.25"/>
                                    `}
                                    
                                    
                                    ${index === 0 ? `
                                        
                                        <path class="map-roads" d="M 170 10 L 170 210" stroke-dasharray="5,4"/>
                                        <path class="map-roads" d="M 20 110 L 320 110" stroke-dasharray="5,4"/>
                                        <path class="map-roads" d="M 50 60 Q 120 80, 190 70" stroke-dasharray="4,3"/>
                                    ` : index === 1 ? `
                                        
                                        <path class="map-roads" d="M 20 20 Q 120 110, 320 200" stroke-dasharray="5,4"/>
                                        <path class="map-roads" d="M 20 200 Q 120 110, 320 20" stroke-dasharray="5,4"/>
                                        <path class="map-roads" d="M 100 50 L 240 170" stroke-dasharray="4,3"/>
                                    ` : index === 2 ? `
                                        
                                        <path class="map-roads" d="M 20 50 Q 100 80, 180 70 T 320 90" stroke-dasharray="5,4"/>
                                        <path class="map-roads" d="M 20 170 Q 100 140, 180 150 T 320 130" stroke-dasharray="5,4"/>
                                        <path class="map-roads" d="M 170 20 Q 160 110, 170 200" stroke-dasharray="4,3"/>
                                    ` : index === 3 ? `
                                        
                                        <path class="map-roads" d="M 170 110 L 20 40" stroke-dasharray="5,4"/>
                                        <path class="map-roads" d="M 170 110 L 320 40" stroke-dasharray="5,4"/>
                                        <path class="map-roads" d="M 170 110 L 20 180" stroke-dasharray="5,4"/>
                                        <path class="map-roads" d="M 170 110 L 320 180" stroke-dasharray="5,4"/>
                                    ` : index === 4 ? `
                                        
                                        <path class="map-roads" d="M 30 70 Q 90 90, 150 70 T 270 80 T 310 90" stroke-dasharray="5,4"/>
                                        <path class="map-roads" d="M 30 150 Q 90 130, 150 150 T 270 140 T 310 150" stroke-dasharray="5,4"/>
                                        <path class="map-roads" d="M 100 30 Q 120 110, 100 190" stroke-dasharray="4,3"/>
                                        <path class="map-roads" d="M 240 30 Q 220 110, 240 190" stroke-dasharray="4,3"/>
                                    ` : `
                                        
                                        <path class="map-roads" d="M 20 90 Q 85 70, 150 90 T 280 90 T 320 110" stroke-dasharray="5,4"/>
                                        <path class="map-roads" d="M 20 140 Q 85 160, 150 140 T 280 140 T 320 120" stroke-dasharray="5,4"/>
                                        <path class="map-roads" d="M 120 20 L 120 200" stroke-dasharray="4,3"/>
                                        <path class="map-roads" d="M 220 20 L 220 200" stroke-dasharray="4,3"/>
                                    `}
                                    
                                    
                                    ${index === 0 ? `
                                        <circle class="map-city-dot" cx="100" cy="80" r="3"/>
                                        <circle class="map-city-dot" cx="230" cy="120" r="3"/>
                                        <circle class="map-city-dot" cx="170" cy="150" r="3"/>
                                        <circle class="map-city-dot" cx="280" cy="70" r="2.5"/>
                                    ` : index === 1 ? `
                                        <circle class="map-city-dot" cx="70" cy="110" r="3"/>
                                        <circle class="map-city-dot" cx="270" cy="90" r="3"/>
                                        <circle class="map-city-dot" cx="150" cy="140" r="3"/>
                                        <circle class="map-city-dot" cx="200" cy="60" r="2.5"/>
                                    ` : index === 2 ? `
                                        <circle class="map-city-dot" cx="110" cy="65" r="3"/>
                                        <circle class="map-city-dot" cx="200" cy="110" r="3"/>
                                        <circle class="map-city-dot" cx="260" cy="140" r="3"/>
                                        <circle class="map-city-dot" cx="140" cy="160" r="2.5"/>
                                    ` : index === 3 ? `
                                        <circle class="map-city-dot" cx="130" cy="100" r="3"/>
                                        <circle class="map-city-dot" cx="210" cy="130" r="3"/>
                                        <circle class="map-city-dot" cx="90" cy="140" r="3"/>
                                        <circle class="map-city-dot" cx="260" cy="80" r="2.5"/>
                                    ` : index === 4 ? `
                                        <circle class="map-city-dot" cx="85" cy="90" r="3"/>
                                        <circle class="map-city-dot" cx="190" cy="70" r="3"/>
                                        <circle class="map-city-dot" cx="240" cy="120" r="3"/>
                                        <circle class="map-city-dot" cx="140" cy="140" r="2.5"/>
                                        <circle class="map-city-dot" cx="280" cy="160" r="2.5"/>
                                    ` : `
                                        <circle class="map-city-dot" cx="120" cy="90" r="3"/>
                                        <circle class="map-city-dot" cx="220" cy="70" r="3"/>
                                        <circle class="map-city-dot" cx="170" cy="130" r="3"/>
                                        <circle class="map-city-dot" cx="80" cy="120" r="2.5"/>
                                    `}
                                    
                                    
                                    <path 
                                        class="route-path-outline" 
                                        d="${svgPath}"
                                    />
                                    <path 
                                        class="route-path" 
                                        d="${svgPath}"
                                        filter="url(#shadow-${index})"
                                    />
                                    
                                    
                                    ${fromPhoto ? `<image href="${fromPhoto}" x="${startPos.x - 16}" y="${startPos.y - 38}" width="32" height="32" preserveAspectRatio="xMidYMid slice" clip-path="url(#city-photo-start-${index})"/><circle class="route-city-photo-hit" cx="${startPos.x}" cy="${startPos.y - 22}" r="18" fill="transparent" data-city="${route.from}" data-image="${fromPhoto}"/>` : ''}
                                    <circle cx="${startPos.x}" cy="${startPos.y}" r="10" fill="#10b981" opacity="0.3" filter="url(#shadow-${index})"/>
                                    <circle class="marker-dot" cx="${startPos.x}" cy="${startPos.y}" r="9" fill="#10b981" stroke="white" stroke-width="2.5" filter="url(#glow-${index})"/>
                                    <circle cx="${startPos.x}" cy="${startPos.y}" r="4" fill="white"/>
                                    <text class="city-label" x="${startPos.x}" y="${startPos.y + 25}" text-anchor="middle" fill="#064e3b" font-size="10" font-weight="700">
                                        ${route.from}
                                    </text>
                                    
                                    
                                    ${toPhoto ? `<image href="${toPhoto}" x="${endPos.x - 16}" y="${endPos.y - 38}" width="32" height="32" preserveAspectRatio="xMidYMid slice" clip-path="url(#city-photo-end-${index})"/><circle class="route-city-photo-hit" cx="${endPos.x}" cy="${endPos.y - 22}" r="18" fill="transparent" data-city="${route.to}" data-image="${toPhoto}"/>` : ''}
                                    <circle cx="${endPos.x}" cy="${endPos.y}" r="10" fill="#ef4444" opacity="0.3" filter="url(#shadow-${index})"/>
                                    <circle class="marker-dot" cx="${endPos.x}" cy="${endPos.y}" r="9" fill="#ef4444" stroke="white" stroke-width="2.5" filter="url(#glow-${index})"/>
                                    <circle cx="${endPos.x}" cy="${endPos.y}" r="4" fill="white"/>
                                    <text class="city-label" x="${endPos.x}" y="${endPos.y + 25}" text-anchor="middle" fill="#7f1d1d" font-size="10" font-weight="700">
                                        ${route.to}
                                    </text>
                                    
                                    
                                    <g filter="url(#shadow-${index})">
                                        <animateMotion
                                            dur="5s"
                                            repeatCount="indefinite"
                                            path="${svgPath}"
                                        >
                                        </animateMotion>
                                        
                                        <g transform="translate(-8, -8)">
                                            <rect x="2" y="6" width="12" height="8" rx="2" fill="#ff6b6b" stroke="white" stroke-width="1.5"/>
                                            <rect x="4" y="4" width="8" height="5" rx="1" fill="#ff8787"/>
                                            <circle cx="5" cy="14" r="2" fill="#1f2937" stroke="white" stroke-width="0.5"/>
                                            <circle cx="11" cy="14" r="2" fill="#1f2937" stroke="white" stroke-width="0.5"/>
                                        </g>
                                    </g>
                                </svg>
                            </div>
                            
                            
                            <div class="city-images-container">
                                ${getCityImages(route.from, index, 'from').map(img => `
                                    <div class="city-image-wrapper" data-city="${route.from}" data-image="${img.url}">
                                        <img src="${img.url}" alt="${img.alt}" loading="lazy">
                                        <div class="city-image-label">${route.from}</div>
                                    </div>
                                `).join('')}
                                ${getCityImages(route.to, index, 'to').map(img => `
                                    <div class="city-image-wrapper" data-city="${route.to}" data-image="${img.url}">
                                        <img src="${img.url}" alt="${img.alt}" loading="lazy">
                                        <div class="city-image-label">${route.to}</div>
                                    </div>
                                `).join('')}
                            </div>
                        `;
                        
                        card.addEventListener('click', function(e) {
                            if (e.target.closest('.city-image-wrapper')) return;
                            container.querySelectorAll('.route-map-card').forEach(function(c) { c.classList.remove('route-map-card--focused'); });
                            card.classList.add('route-map-card--focused');
                            card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                            if (window.DaxiRoutesMap && window.DaxiRoutesMap.selectRoute) {
                                window.DaxiRoutesMap.selectRoute(index);
                            }
                        });
                        container.appendChild(card);
                    });
                    

                    const modal = document.createElement('div');
                    modal.className = 'image-modal';
                    modal.innerHTML = `
                        <div class="modal-content-wrapper">
                            <span class="modal-close">&times;</span>
                            <img class="modal-image" src="" alt="">
                            <div class="modal-city-name"></div>
                        </div>
                    `;
                    document.body.appendChild(modal);
                    

                    const modalImage = modal.querySelector('.modal-image');
                    const modalCityName = modal.querySelector('.modal-city-name');
                    const modalClose = modal.querySelector('.modal-close');
                    

                    container.addEventListener('click', (e) => {
                        const photoHit = e.target.closest('.route-city-photo-hit');
                        if (photoHit) {
                            e.stopPropagation();
                            const imageUrl = photoHit.getAttribute('data-image');
                            const cityName = photoHit.getAttribute('data-city');
                            if (window._daxiOpenCityLightbox && imageUrl) {
                                window._daxiOpenCityLightbox(imageUrl, cityName, cityName);
                            } else if (imageUrl) {
                                modalImage.src = imageUrl;
                                modalCityName.textContent = cityName || '';
                                modal.classList.add('active');
                                document.body.style.overflow = 'hidden';
                            }
                            return;
                        }
                        const imageWrapper = e.target.closest('.city-image-wrapper');
                        if (imageWrapper) {
                            const imageUrl = imageWrapper.dataset.image;
                            const cityName = imageWrapper.dataset.city;
                            modalImage.src = imageUrl;
                            modalCityName.textContent = cityName;
                            modal.classList.add('active');
                            document.body.style.overflow = 'hidden';
                        }
                    });
                    

                    modalClose.addEventListener('click', () => {
                        modal.classList.remove('active');
                        document.body.style.overflow = '';
                    });
                    
                    modal.addEventListener('click', (e) => {
                        if (e.target === modal) {
                            modal.classList.remove('active');
                            document.body.style.overflow = '';
                        }
                    });
                    

                    document.addEventListener('keydown', (e) => {
                        if (e.key === 'Escape' && modal.classList.contains('active')) {
                            modal.classList.remove('active');
                            document.body.style.overflow = '';
                        }
                    });


                    container.addEventListener('keydown', (e) => {
                        if (e.key === 'ArrowRight') {
                            container.scrollBy({ left: 356, behavior: 'smooth' });
                        } else if (e.key === 'ArrowLeft') {
                            container.scrollBy({ left: -356, behavior: 'smooth' });
                        }
                    });
                    

                    const cards = container.querySelectorAll('.route-map-card');
                    cards.forEach(function(card, i) {
                        card.setAttribute('tabindex', '0');
                        if (i === 0) card.classList.add('route-map-card--focused');
                    });
                    if (cards[0]) {
                        setTimeout(function() {
                            cards[0].scrollIntoView({ behavior: 'auto', inline: 'center', block: 'nearest' });
                        }, 200);
                    }

                    if (typeof DaxiRoutesMap !== 'undefined' && DaxiRoutesMap.preloadImages) {
                        DaxiRoutesMap.preloadImages();
                    }
                })();
