let currentPlanIndex = 0;
const totalPlans = 6;

window.DAXI_CAP_AIRPORT = {
    label: 'Aéroport International Hugo Chávez, Cap-Haïtien',
    lat: 19.732978,
    lng: -72.195742,
};

window.DAXI_PLAN_SLUGS = {
    'ville-a-ville': '1',
    'demi-journee': '2',
    'journee-complete': '3',
    'elegance-night': '4',
    'business-vip': '6',
    'accueil-aeroport-cap': '5',
};
window.DAXI_PLAN_SLUG_BY_ID = Object.fromEntries(
    Object.entries(window.DAXI_PLAN_SLUGS).map(function(e) { return [e[1], e[0]]; })
);


function _loadPlanCatalog() {
    var lang = (typeof window._daxiGetSavedLang === 'function' ? window._daxiGetSavedLang() : localStorage.getItem('daxi_lang')) || 'fr';
    if (window._daxiPlanCatalog && window._daxiPlanCatalogLang === lang) return Promise.resolve(window._daxiPlanCatalog);
    if (window._daxiPlanCatalogPromise && window._daxiPlanCatalogPromiseLang === lang) return window._daxiPlanCatalogPromise;
    window._daxiPlanCatalogPromiseLang = lang;
    window._daxiPlanCatalogPromise = fetch('/api/client/service-plans/?lang=' + encodeURIComponent(lang), { credentials: 'include' })
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) {
            if (!data || !data.plans) throw new Error('plans_unavailable');
            window._daxiPlanCatalog = data;
            window._daxiPlanCatalogLang = lang;
            return data;
        })
        .catch(function() {
            window._daxiPlanCatalogPromise = null;
            window._daxiPlanCatalogPromiseLang = null;
            return null;
        });
    return window._daxiPlanCatalogPromise;
}
window._daxiInvalidatePlanCatalog = function() {
    window._daxiPlanCatalog = null;
    window._daxiPlanCatalogLang = null;
    window._daxiPlanCatalogPromise = null;
    window._daxiPlanCatalogPromiseLang = null;
};
window._loadPlanCatalog = _loadPlanCatalog;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { _loadPlanCatalog(); });
} else {
    _loadPlanCatalog();
}

function _renderPlanModal(planId, data) {
    var modal = document.getElementById('planDetailModal');
    if (!modal || !data) return;

    var heroEl = document.getElementById('planHero');
    if (heroEl) heroEl.style.backgroundImage = 'linear-gradient(135deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.1) 100%), url(\'' + data.hero + '\')';

    var titleEl = document.getElementById('planHeroTitle');
    if (titleEl) titleEl.textContent = data.title;

    var subEl = document.getElementById('planHeroSubtitle');
    if (subEl) subEl.textContent = data.subtitle;

    var priceEl = document.getElementById('planHeroPrice');
    if (priceEl) priceEl.textContent = data.price;

    window.__currentPlanDetail = planId;

    var descBox = document.getElementById('planDescriptionBox');
    if (descBox) descBox.textContent = data.description;

    var ctaDesc = document.getElementById('planCtaDesc');
    if (ctaDesc) ctaDesc.textContent = data.ctaDesc;

    var ctaTitle = document.getElementById('planCtaTitle');
    var lang = (typeof window._daxiGetSavedLang === 'function' ? window._daxiGetSavedLang() : localStorage.getItem('daxi_lang')) || 'fr';
    var dict = (window._localTranslations && window._localTranslations[lang]) || {};
    if (ctaTitle) ctaTitle.textContent = dict.plan_cta_interest || 'Intéressé par ce plan ?';

    var featuresGrid = document.getElementById('planFeaturesGrid');
    if (featuresGrid) {
        featuresGrid.innerHTML = '';
        (data.features || []).forEach(function(feature) {
            var card = document.createElement('div');
            card.className = 'plan-feature-card';
            card.innerHTML = '<div class="plan-feature-icon"><i class="' + feature.icon + '"></i></div>'
                + '<div class="plan-feature-text">'
                + '<div class="plan-feature-title">' + feature.title + '</div>'
                + '<div class="plan-feature-desc">' + feature.desc + '</div>'
                + '</div>';
            featuresGrid.appendChild(card);
        });
    }

    var animTargets = modal.querySelectorAll('.plan-description, .plan-features-grid, .plan-cta-section');
    animTargets.forEach(function(el, i) {
        el.classList.add('animate-on-scroll');
        el.style.transitionDelay = (i * 120) + 'ms';
    });

    var io = new IntersectionObserver(function(entries, obs) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('in-view');
                obs.unobserve(entry.target);
            }
        });
    }, { root: modal, threshold: 0.15 });

    animTargets.forEach(function(el) { io.observe(el); });

    modal.classList.remove('hide');
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    setTimeout(function() { modal.scrollTop = 0; }, 50);
}

function openPlanModal(planId) {
    var lang = (typeof window._daxiGetSavedLang === 'function' ? window._daxiGetSavedLang() : localStorage.getItem('daxi_lang')) || 'fr';
    if (window._daxiPlanCatalogLang !== lang) {
        if (window._daxiInvalidatePlanCatalog) window._daxiInvalidatePlanCatalog();
    }
    _loadPlanCatalog().then(function(catalog) {
        if (!catalog) {
            var ld = (window._localTranslations && window._localTranslations[window._daxiGetSavedLang()]) || {};
            alert(ld.plan_load_error || 'Impossible de charger les forfaits. Réessayez.');
            return;
        }
        var data = catalog.plans[String(planId)];
        if (!data) return;
        _renderPlanModal(planId, data);
    });
}

function closePlanModal(skipBlock) {
    var modal = document.getElementById('planDetailModal');
    if (!modal) return;
    modal.classList.add('hide');


    if (!skipBlock) window.__preventOpenOrderModalUntil = Date.now() + 1200;

    setTimeout(function() {
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }, 600);
}

function initPlanDetailModal() {
    var modal = document.getElementById('planDetailModal');
    if (!modal) return;
    var closeBtn = document.getElementById('planCloseBtn');
    var backBtn = document.getElementById('planBackBtn');
    var imageViewer = document.getElementById('planImageViewer');
    var imageViewerClose = document.getElementById('imageViewerClose');


    if (closeBtn) closeBtn.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); closePlanModal(); });
    if (backBtn) backBtn.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); closePlanModal(); });
    if (imageViewerClose) imageViewerClose.addEventListener('click', function() { if (imageViewer) imageViewer.classList.remove('show'); });


    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && imageViewer) {
            imageViewer.classList.remove('show');
        }
    });


    if (imageViewer) {
        imageViewer.addEventListener('click', function(e) {
            if (e.target === imageViewer) imageViewer.classList.remove('show');
        });
    }


    var planBookBtnEl = document.getElementById('planBookBtn');
    if (planBookBtnEl) {
        planBookBtnEl.addEventListener('click', function(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            var planId = String(window.__currentPlanDetail || '');
            if (!planId) return;


            if (planId === '6') {
                closePlanModal();
                var pickupVal = (document.getElementById('destinationAddress') || {}).value || '';
                var destVal   = (document.getElementById('destinationAddressArrival') || {}).value || '';
                var dateVal   = (document.getElementById('bookingDate') || {}).value || '';
                var timeVal   = (document.getElementById('bookingTime') || {}).value || '';
                var waMsg = 'Bonjour DAXI 👋\n\nJe suis intéressé(e) par le Plan *Business / VIP*.\n\n'
                    + (pickupVal ? '📍 Départ : ' + pickupVal + '\n' : '')
                    + (destVal   ? '🎯 Destination : ' + destVal + '\n' : '')
                    + (dateVal   ? '📅 Date : ' + dateVal + '\n' : '')
                    + (timeVal   ? '⏰ Heure : ' + timeVal + '\n' : '')
                    + '\nMerci de me contacter pour discuter du tarif et des modalités. 🙏';
                window.open('https://wa.me/50944969696?text=' + encodeURIComponent(waMsg), '_blank');
                return;
            }


                if (planId === '1' || planId === '2' || planId === '3' || planId === '4' || planId === '5') {
                    closePlanModal(true);
                    setTimeout(function() {
                        if (window.DaxiPlanWizard && window.DaxiPlanWizard.open) {
                            window.DaxiPlanWizard.open(planId);
                        } else if (typeof openPlanOrderWizard === 'function') {
                            openPlanOrderWizard(planId);
                        }
                    }, 300);
                    return;
                }


                _loadPlanCatalog().then(function(catalog) {
                if (!catalog) return;
                var fixed = catalog.fixed_by_id && catalog.fixed_by_id[planId];
                if (fixed) {
                    closePlanModal(true);
                    var spHidden = document.getElementById('servicePlanHidden');
                    var fpHidden = document.getElementById('fixedPriceHidden');
                    if (spHidden) spHidden.value = fixed.slug || '';
                    if (fpHidden) fpHidden.value = fixed.amount != null ? String(fixed.amount) : '';
                    var btn = document.getElementById('orderTaxiBtn');
                    if (btn) {
                        btn.dataset.fixedPlan = fixed.slug || '';
                        btn.textContent = 'Réserver — ' + (fixed.btn_label || fixed.slug || '');
                    }
                    setTimeout(function() {
                        var bookingSection = document.getElementById('orderTaxiBtn');
                        if (bookingSection) bookingSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 400);
                    return;
                }
                });
        });
    }
}


function handleTouristAttractions() {
    const attractions = {
        citadelle: {
            fr: {
                name: "Citadelle La Ferrière",
                description: "La Citadelle La Ferrière est une forteresse monumentale située au sommet de la montagne Bonnet à l'Évêque, dans le Nord d'Haiti. Construite entre 1805 et 1820 sous les ordres du roi Henri Christophe, elle représente l'un des plus beaux exemples d'architecture militaire du XIXe siècle.",
                history: "Érigée après l'indépendance d'Haiti, la Citadelle avait pour but de défendre la nouvelle nation contre un éventuel retour des Français. With its walls over 40 meters high and 365 cannons, it is the largest fortress in the Americas, classified as a UNESCO World Heritage Site."
            },
            ht: {
                name: "Sitadèl Laferyè",
                description: "Sitadèl Laferyè se yon fò monimantal ki chita sou tèt mòn Bonnet a l'Evek, nan Nò Ayiti. Li te konstwi ant 1805 ak 1820 sou lòd wa Henri Christophe, e li reprezante youn nan pi bèl egzanp achitekti militè nan syèk la 19.",
                history: "Li te bati apre endepandans Ayiti, Sitadèl la te gen objektif pou defann nouvo nasyon an kont yon evantyèl retounen Fransè yo. Avèk mi ki pi wo pase 40 mèt ak 365 kanon, li se pi gwo fò nan Amerik yo, klase nan patrimwàn mondyal UNESCO."
            },
            en: {
                name: "Citadelle La Ferrière",
                description: "The Citadelle La Ferrière is a monumental fortress located atop Bonnet à l'Évêque mountain in northern Haiti. Built between 1805 and 1820 under King Henri Christophe, it represents one of the finest examples of 19th-century military architecture.",
                history: "Erected after Haiti's independence, the Citadel was intended to defend the new nation against a possible French return. With walls over 40 meters high and 365 cannons, it is the largest fortress in the Americas, classified as a UNESCO World Heritage Site."
            },
            es: {
                name: "Ciudadela La Ferrière",
                description: "La Ciudadela La Ferrière es una fortaleza monumental ubicada en la cima de la montaña Bonnet à l'Évêque, en el norte de Haití. Construida entre 1805 and 1820 bajo las órdenes del rey Henri Christophe, representa uno de los mejores ejemplos de arquitectura militar del siglo XIX.",
                history: "Erigida después de la independencia de Haití, la Ciudadela tenía como objetivo defender la nueva nación contra un posible regreso de los franceses. Con sus muros de más de 40 metros de altura and sus 365 cañones, es la fortaleza más grande de las Américas, clasificada como Patrimonio de la Humanidad por la UNESCO."
            }
        },
        labadee: {
            fr: {
                name: "Labadee",
                description: "Labadee est une station balnéaire privée située sur la côte nord d'Haïti. Connue pour ses plages de sable blanc, ses eaux turquoises et ses activités nautiques, c'est une destination de choix pour les croisiéristes et les vacanciers.",
                history: "Nommée d'après le marquis de La Badie, un colon français du XVIIe siècle, la région a été développée en station touristique dans les années 1980. Aujourd'hui, elle offre une combinaison unique de paysages paradisiaques et de culture haïtienne authentique."
            },
            ht: {
                name: "Labadee",
                description: "Labadee se yon estasyon balyè prive ki sitiye sou kòt nò Ayiti. Li konnen pou plaj sab blan li yo, dlo tèk li yo ak aktivite nòtik li yo. Li se yon destinasyon popilè pou pasaje bato kwazyè ak vakansye.",
                history: "Yo te rele li apre Markis La Badie, yon kolon franse nan syèk la 17, rejyon an te devlope kòm estasyon touris nan ane 1980 yo. Jodi a, li ofri yon konbinezon inik nan peyizaj paradi ak kilti ayisyèn otantik."
            },
            en: {
                name: "Labadee",
                description: "Labadee is a private beach resort located on Haiti's northern coast. Known for its white sand beaches, turquoise waters and water activities, it's a popular destination for cruise passengers and vacationers.",
                history: "Named after the Marquis de La Badie, a 17th-century French colonist, the area was developed as a tourist resort in the 1980s. Today, it offers a unique combination of paradise landscapes and authentic Haitian culture."
            },
            es: {
                name: "Labadee",
                description: "Labadee es un complejo turístico privado ubicado en la costa norte de Haití. Conocido por sus playas de arena blanca, aguas turquesas and actividades acuáticas, es un destino popular para pasajeros de cruceros and vacacionistas.",
                history: "Nombrado en honor al Marqués de La Badie, un colono francés del siglo XVII, el área se desarrolló como complejo turístico en la década de 1980. Hoy ofrece una combinación única de paisajes paradisíacos and cultura haitiana auténtica."
            }
        },
        verrieres: {
            fr: {
                name: "Monument de Vertières",
                description: "Le Monument de Vertières commémore la célèbre bataille de Vertières qui a scellé l'indépendance d'Haïti le 18 novembre 1803. Situé près de Cap-Haïtien, il rend hommage aux héros de la révolution haïtienne.",
                history: "Érigé en 1953 pour le 150e anniversaire de la bataille, ce monument symbolise la résistance et la victoire des esclaves insurgés contre l'armée napoléonienne. C'est un lieu de pèlerinage historique pour tous les Haïtiens."
            },
            ht: {
                name: "Moniman Vètyè",
                description: "Moniman Vètyè komemore batay Vètyè ki te sele endepandans Ayiti sou 18 novanm 1803. Li sitiye toupre Okap, e li rann omaj bay ewo revolisyon ayisyèn yo.",
                history: "Li te bati an 1953 pou 150yèm anivèsè batay la, moniman sa a senbolize rezistans ak viktwa esklav rebèl yo kont lame Napoleon an. Li se yon kote pelrenaj istorik pou tout Ayisyen."
            },
            en: {
                name: "Vertières Monument",
                description: "The Vertières Monument commemorates the famous Battle of Vertières that sealed Haiti's independence on November 18, 1803. Located near Cap-Haïtien, it pays tribute to the heroes of the Haitian revolution.",
                history: "Erected in 1953 for the 150th anniversary of the battle, this monument symbolizes the resistance and victory of insurgent slaves against Napoleon's army. It is a historical pilgrimage site for all Haitians."
            },
            es: {
                name: "Monumento de Vertières",
                description: "El Monumento de Vertières conmemora la famosa Batalla de Vertières que selló la independencia de Haití el 18 de noviembre de 1803. Ubicado cerca de Cap-Haïtien, rinde homenaje a los héroes de la revolución haitiana.",
                history: "Erigido en 1953 para el 150 aniversario de la batalla, este monumento simboliza la resistencia and victoria de los esclavos insurgentes contra el ejército napoleónico. Es un lugar de peregrinación histórica para todos los haitianos."
            }
        },
        cathedrale: {
            fr: {
                name: "Cathédrale de Cap-Haïtien",
                description: "La Cathédrale Notre-Dame de l'Assomption de Cap-Haïtien est un joyau architectural de style néo-classique. Construite au XVIIIe siècle, elle domine la place d'Armes avec son imposante façade blanche.",
                history: "Édifiée pendant la période coloniale, la cathédrale a survécu au tremblement de terre de 1842 et a été restaurée plusieurs fois. Elle témoigne de la riche histoire religieuse et culturelle de la région."
            },
            ht: {
                name: "Katredal Okap",
                description: "Katredal Notre-Dame de l'Assomption nan Okap se yon bijou achitekti nan style neo-klasik. Li te konstwi nan syèk la 18, e li domine Plas d'Armes ak fasad blan enpòtan li.",
                history: "Bati pandan peryòd kolonyal la, katredal la te siviv tranbleman tè 1842 la e li te retabli plizyè fwa. Li temwaye rich istwa relijye ak kiltirèl rejyon an."
            },
            en: {
                name: "Cathedral of Cap-Haïtien",
                description: "The Notre-Dame de l'Assomption Cathedral in Cap-Haïtien is an architectural gem in neoclassical style. Built in the 18th century, it dominates Place d'Armes with its imposing white facade.",
                history: "Built during the colonial period, the cathedral survived the 1842 earthquake and has been restored several times. It testifies to the region's rich religious and cultural history."
            },
            es: {
                name: "Catedral de Cap-Haïtien",
                description: "La Catedral de Notre-Dame de l'Assomption en Cap-Haïtien es una joya arquitectónica de estilo neoclásico. Construida en el siglo XVIII, domina la Place d'Armes con su imponente fachada blanca.",
                history: "Edificada durante el período colonial, la catedral sobrevivió al terremoto de 1842 and ha sido restaurada varias veces. Testimonia la rica historia religiosa and cultural de la región."
            }
        },
        palais: {
            fr: {
                name: "Palais Sans Souci",
                description: "Le Palais Sans Souci fut la résidence royale du roi Henri Christophe au début du XIXe siècle. Situé à Milot, près de la Citadelle, ce palais somptueux était surnommé le 'Versailles des Caraïbes'.",
                history: "Construit entre 1810 et 1813, le palais fut le centre du royaume d'Haïti jusqu'au suicide du roi en 1820. Détruit par un tremblement de terre en 1842, ses ruines majestueuses sont aujourd'hui classées au patrimoine mondial de l'UNESCO."
            },
            ht: {
                name: "Palè San Souci",
                description: "Palè San Souci te rezidans wa Henri Christophe nan kòmansman syèk la 19. Li sitiye nan Milò, toupre Sitadèl la. Yo te rele li 'Vèsay Karayib la'.",
                history: "Konstwi ant 1810 ak 1813, palè a te sant wayòm Ayiti jouk lè wa a te komèt swisid an 1820. Detwi pa yon tranbleman tè an 1842, demajè li yo klasè kòm patrimwàn mondyal UNESCO jodi a."
            },
            en: {
                name: "Sans-Souci Palace",
                description: "The Sans-Souci Palace was the royal residence of King Henri Christophe in the early 19th century. Located in Milot near the Citadel, this sumptuous palace was nicknamed the 'Versailles of the Caribbean'.",
                history: "Built between 1810 and 1813, the palace was the center of the Kingdom of Haiti until the king's suicide in 1820. Destroyed by an earthquake in 1842, its majestic ruins are now classified as a UNESCO World Heritage Site."
            },
            es: {
                name: "Palacio Sans Souci",
                description: "El Palacio Sans Souci fue la residencia real del rey Henri Christophe a principios del siglo XIX. Ubicado en Milot, cerca de la Ciudadela, este suntuoso palacio fue apodado el 'Versalles del Caribe'.",
                history: "Construido entre 1810 and 1813, el palacio fue el centro del Reino de Haití hasta el suicidio del rey en 1820. Destruido por un terremoto en 1842, sus majestuosas ruinas están clasificadas hoy como Patrimonio de la Humanidad por la UNESCO."
            }
        }
    };

    function showExplorerMain() {
        var explorer = document.getElementById('explorerSection');
        if (!explorer) return;
        var grid = explorer.querySelector('.grid');
        var title = explorer.querySelector('h2');
        if (grid) grid.style.display = '';
        if (title) title.style.display = '';
        explorer.querySelectorAll('.attraction-detail').forEach(function(detail) {
            detail.style.display = 'none';
        });
    }

    function showMainPage() {
        showExplorerMain();
        document.querySelectorAll('main > section, main > div').forEach(function(el) {
            if (!el.classList.contains('attraction-detail')) {
                el.style.display = 'block';
            }
        });
        document.querySelectorAll('.attraction-detail').forEach(function(detail) {
            if (!document.getElementById('explorerSection') || !document.getElementById('explorerSection').contains(detail)) {
            detail.style.display = 'none';
            }
        });
    }

    document.addEventListener('click', function(e) {
        var button = e.target.closest('.learn-more-btn[data-attraction]');
        if (!button) return;
        e.preventDefault();
        e.stopPropagation();
        const attractionId = button.dataset.attraction;
            if (!attractionId || !attractions[attractionId]) return;
            const lang = (typeof currentLanguage !== 'undefined') ? currentLanguage : 'fr';
            const attraction = attractions[attractionId][lang] || attractions[attractionId]['fr'];
        const explorer = document.getElementById('explorerSection');
        let detailContainer = document.getElementById(attractionId + '-detail');
            if (!detailContainer) return;

        if (explorer && detailContainer.parentNode !== explorer) {
            explorer.appendChild(detailContainer);
        }

        if (explorer) {
            var grid = explorer.querySelector('.grid');
            var title = explorer.querySelector('h2');
            if (grid) grid.style.display = 'none';
            if (title) title.style.display = 'none';
        } else {
            document.querySelectorAll('main > section, main > div').forEach(function(el) {
                if (!el.classList.contains('attraction-detail')) {
                    el.style.display = 'none';
                }
            });
        }

            detailContainer.style.display = 'block';
            detailContainer.innerHTML = `
                <button type="button" class="mb-6 bg-gray-100 text-gray-700 px-4 py-2 !rounded-button font-medium cursor-pointer back-to-main-btn btn-glow" style="background:rgba(255,255,255,0.08)!important;color:#e2e8f0!important;border:1px solid rgba(148,163,184,0.2);">
                    <i class="ri-arrow-left-line"></i> <span data-translate="back">Retour</span>
                </button>

                <div class="rounded-xl overflow-hidden" style="background:rgba(255,255,255,0.06);border:1px solid rgba(148,163,184,0.15);">
                    <div class="h-48 bg-cover bg-center" style="background-image: url('assets/images/${attractionId === 'citadelle' ? 'img12.jpg' :
                                                                                      attractionId === 'labadee' ? 'img9.webp.jpg' :
                                                                                      attractionId === 'verrieres' ? 'img11.jpg' :
                                                                                      attractionId === 'cathedrale' ? 'img4.jpg' : 'img10.jpg'}')"></div>
                    <div class="p-5">
                        <h2 class="text-2xl font-bold mb-3" style="color:#f8fafc!important;">${attraction.name}</h2>

                        <div class="mb-5">
                            <h3 class="text-lg font-semibold mb-2" style="color:#e2e8f0!important;" data-translate="description">Description</h3>
                            <p style="color:rgba(255,255,255,0.65)!important;line-height:1.6;">${attraction.description}</p>
                        </div>

                        <div class="mb-5">
                            <h3 class="text-lg font-semibold mb-2" style="color:#e2e8f0!important;" data-translate="history">Histoire</h3>
                            <p style="color:rgba(255,255,255,0.65)!important;line-height:1.6;">${attraction.history}</p>
                        </div>

                        <div class="mb-2">
                            <h3 class="text-lg font-semibold mb-2" style="color:#e2e8f0!important;" data-translate="visit">Visiter</h3>
                            <p class="mb-4" style="color:rgba(255,255,255,0.55)!important;" data-translate="visit_desc">Commandez un taxi pour visiter ce lieu historique :</p>
                            <div class="double-button-container">
                                <button type="button" class="bg-gray-100 text-gray-700 px-6 py-3 !rounded-button font-medium cursor-pointer back-to-main-btn" style="background:rgba(255,255,255,0.08)!important;color:#e2e8f0!important;">
                                    <i class="ri-arrow-left-line"></i> <span data-translate="back">Retour</span>
                                </button>
                                <button type="button" class="gold-button px-6 py-3 !rounded-button font-semibold visit-btn btn-glow" data-attraction="${attraction.name}">
                                    <span data-translate="order">Commander</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            if (typeof updateLanguage === 'function') {
                try { updateLanguage(lang); } catch(err) {}
            }

            detailContainer.querySelectorAll('.back-to-main-btn').forEach(function(btn) {
                btn.addEventListener('click', showExplorerMain);
            });

            const visitButton = detailContainer.querySelector('.visit-btn');
            if (visitButton) {
                visitButton.addEventListener('click', function() {
                    const attractionName = this.dataset.attraction;
                    closeDaxiPage();
                    tabGoBook();
                    const destField = document.getElementById('destinationAddressArrival');
                    if (destField) destField.value = attractionName;
                    const destHidden = document.getElementById('destinationHidden');
                    if (destHidden) destHidden.value = attractionName;
                    const nowBtn = document.getElementById('nowBtn');
                    if (nowBtn) nowBtn.classList.add('active');
                    const laterBtn = document.getElementById('laterBtn');
                    if (laterBtn) laterBtn.classList.remove('active');
                    const dateTimeSection = document.getElementById('dateTimeSection');
                    if (dateTimeSection) dateTimeSection.classList.add('hidden');
                    const bookingDesc = document.getElementById('bookingDescription');
                    if (bookingDesc) bookingDesc.value = '';
                    setTimeout(function() {
                        var bookingSection = document.getElementById('orderTaxiBtn');
                        if (bookingSection) bookingSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 300);
                });
            }

            detailContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    window.showExplorerMain = showExplorerMain;


}


function initServicePlansSection() {
    var stage = document.querySelector('.daxi-plans-stage');
    var plansContainer = stage ? stage.querySelector('.plans-container') : null;
    var planCards = stage ? Array.prototype.slice.call(stage.querySelectorAll('.plan-card')) : [];
    var dots = document.querySelectorAll('.dots-indicator .dot');
    var leftArrow = stage ? stage.querySelector('.nav-arrow.left') : null;
    var rightArrow = stage ? stage.querySelector('.nav-arrow.right') : null;
    if (!plansContainer || planCards.length === 0) return;

    var total = planCards.length;
    var isProgrammatic = false;
    var navLockUntil = 0;
    var autoScrollTimer = null;
    var autoScrollDelay = 4200;
    var scrollSnapTimer = null;

    function scrollCardToCenter(index, behavior) {
        var card = planCards[index];
        if (!card) return;
        isProgrammatic = true;
        navLockUntil = Date.now() + (behavior === 'smooth' ? 700 : 80);
        var containerRect = plansContainer.getBoundingClientRect();
        var cardRect = card.getBoundingClientRect();
        var delta = (cardRect.left + cardRect.width / 2) - (containerRect.left + containerRect.width / 2);
        plansContainer.scrollBy({ left: delta, behavior: behavior || 'smooth' });
        setTimeout(function() { isProgrammatic = false; }, behavior === 'smooth' ? 700 : 80);
    }

    function nearestIndex() {
        var center = plansContainer.scrollLeft + plansContainer.clientWidth / 2;
        var best = 0;
        var bestDist = Infinity;
        planCards.forEach(function(card, i) {
            var cardCenter = card.offsetLeft + card.offsetWidth / 2;
            var d = Math.abs(cardCenter - center);
            if (d < bestDist) { bestDist = d; best = i; }
        });
        return best;
    }

    function updateActivePlan(index, behavior) {
        if (index < 0) index = total - 1;
        if (index >= total) index = 0;
        currentPlanIndex = index;
        planCards.forEach(function(card, i) {
            card.classList.toggle('active', i === index);
        });
        dots.forEach(function(dot, i) {
            dot.classList.toggle('active', i === index);
        });
        var railLabel = document.getElementById('daxiPlansRailLabel');
        var railFill = document.getElementById('daxiPlansRailFill');
        if (railLabel) railLabel.textContent = (index + 1) + ' / ' + total;
        if (railFill) railFill.style.width = Math.round(((index + 1) / total) * 100) + '%';
        scrollCardToCenter(index, behavior);
    }

    window.focusPlanCard = function(index) {
        stopAutoScroll();
        updateActivePlan(index, 'smooth');
    };

    function startAutoScroll() {
        stopAutoScroll();
        autoScrollTimer = setInterval(function() {
            updateActivePlan((currentPlanIndex + 1) % total, 'smooth');
        }, autoScrollDelay);
    }

    function stopAutoScroll() {
        if (autoScrollTimer) {
            clearInterval(autoScrollTimer);
            autoScrollTimer = null;
        }
    }

    plansContainer.addEventListener('scroll', function() {
        if (isProgrammatic || Date.now() < navLockUntil) return;
        clearTimeout(scrollSnapTimer);
        scrollSnapTimer = setTimeout(function() {
            if (isProgrammatic || Date.now() < navLockUntil) return;
            var idx = nearestIndex();
            if (idx !== currentPlanIndex) {
                currentPlanIndex = idx;
                planCards.forEach(function(card, i) { card.classList.toggle('active', i === idx); });
                dots.forEach(function(dot, i) { dot.classList.toggle('active', i === idx); });
                var railLabel = document.getElementById('daxiPlansRailLabel');
                var railFill = document.getElementById('daxiPlansRailFill');
                if (railLabel) railLabel.textContent = (idx + 1) + ' / ' + total;
                if (railFill) railFill.style.width = Math.round(((idx + 1) / total) * 100) + '%';
            }
        }, 80);
    }, { passive: true });

    if (leftArrow) {
        leftArrow.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            stopAutoScroll();
            updateActivePlan(currentPlanIndex - 1, 'smooth');
        });
    }
    if (rightArrow) {
        rightArrow.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            stopAutoScroll();
            updateActivePlan(currentPlanIndex + 1, 'smooth');
        });
    }
    dots.forEach(function(dot, index) {
        dot.addEventListener('click', function() {
            stopAutoScroll();
            updateActivePlan(index, 'smooth');
        });
    });

    stage.addEventListener('mouseenter', stopAutoScroll);
    stage.addEventListener('mouseleave', function() {});
    stage.addEventListener('touchstart', stopAutoScroll, { passive: true });

    updateActivePlan(0, 'auto');

    document.querySelectorAll('.learn-more-btn[data-plan]').forEach(function(button) {
        button.addEventListener('click', function () {
            if (window.__preventOpenOrderModalUntil && Date.now() < window.__preventOpenOrderModalUntil) return;
            var planId = this.dataset.plan;
            if (!planId) return;
            try { openPlanModal(planId); } catch (e) {
                var modal = document.getElementById('planModal' + planId);
                if (modal) { modal.style.display = 'block'; document.body.style.overflow = 'hidden'; }
            }
        });
    });

    document.querySelectorAll('.close-plan-modal').forEach(function(button) {
        button.addEventListener('click', function () {
            document.querySelectorAll('.plan-modal').forEach(function(modal) { modal.style.display = 'none'; });
            document.body.style.overflow = '';
        });
    });

    document.querySelectorAll('.plan-modal').forEach(function(modal) {
        modal.addEventListener('click', function (e) {
            if (e.target === this) {
                this.style.display = 'none';
                document.body.style.overflow = '';
            }
        });
    });
}


function _cleanAddressDisplay(addr) {
    if (!addr) return '';
    var raw = String(addr).trim();
    var plusSeg = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,4}(\s*,\s*)?/i;
    var plusOnly = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,4}$/i;
    var s = raw.replace(plusSeg, '').replace(/^,\s*/, '').trim();
    if (!s) {
        s = raw.split(',').map(function(p) { return p.trim(); })
            .filter(function(p) { return p && !plusOnly.test(p); }).join(', ');
    }
    return s || raw;
}
window._cleanAddressDisplay = _cleanAddressDisplay;

function _cleanPlaceName(place, fallback) {
    var plusLead = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,4}/i;
    var addr = place.formatted_address || place.formattedAddress || '';
    var name = place.name || (place.displayName && (place.displayName.text || place.displayName)) || '';
    if (typeof name !== 'string') name = String(name || '');
    if (name && plusLead.test(addr)) {
        var rest = addr.indexOf(',') > -1 ? addr.split(', ').slice(1).join(', ') : '';
        return _cleanAddressDisplay(name + (rest ? ', ' + rest : ''));
    }
    return _cleanAddressDisplay(addr || name || fallback || '');
}

function _daxiPlaceToLegacyShape(place) {
    if (!place) return { formatted_address: '', name: '' };
    var dn = place.displayName;
    return {
        formatted_address: place.formatted_address || place.formattedAddress || '',
        name: place.name || (dn && (dn.text || dn)) || ''
    };
}

function _daxiPlaceCoords(place) {
    if (!place) return null;
    if (place.location) {
        var loc = place.location;
        if (typeof loc.lat === 'function') {
            return { lat: loc.lat(), lng: loc.lng() };
        }
        if (loc.lat != null && loc.lng != null) {
            return { lat: +loc.lat, lng: +loc.lng };
        }
        if (loc.latitude != null && loc.longitude != null) {
            return { lat: +loc.latitude, lng: +loc.longitude };
        }
    }
    if (place.lat != null && place.lng != null) {
        return { lat: +place.lat, lng: +place.lng };
    }
    if (place.geometry && place.geometry.location) return _daxiLatLngParts(place.geometry.location);
    return null;
}

function _daxiPlacesNow() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}
function _daxiPlacesTrace(tag, extra) {
    var t = _daxiPlacesNow();
    if (!window._daxiPlacesTraceT0) window._daxiPlacesTraceT0 = t;
    var since = t - window._daxiPlacesTraceT0;
    var delta = window._daxiPlacesTraceLast != null ? (t - window._daxiPlacesTraceLast) : 0;
    window._daxiPlacesTraceLast = t;
    var rec = { tag: tag, t: +t.toFixed(3), since: +since.toFixed(3), delta: +delta.toFixed(3), extra: extra || null, iso: new Date().toISOString() };
    window._daxiPlacesTraceLog = window._daxiPlacesTraceLog || [];
    window._daxiPlacesTraceLog.push(rec);
    if (extra !== undefined && extra !== null) console.log(tag + '  +' + since.toFixed(1) + 'ms  Δ' + delta.toFixed(1) + 'ms', extra);
    else console.log(tag + '  +' + since.toFixed(1) + 'ms  Δ' + delta.toFixed(1) + 'ms');
    return t;
}
function _daxiPlacesTraceReset(reason) {
    window._daxiPlacesTraceLog = [];
    window._daxiPlacesTraceT0 = _daxiPlacesNow();
    window._daxiPlacesTraceLast = window._daxiPlacesTraceT0;
    window._daxiPlacesHbLast = window._daxiPlacesTraceT0;
    _daxiPlacesTrace('[PLACES] TRACE RESET', {
        reason: reason || '',
        cap: !!window._daxiCapacitorApp,
        daxiAndroid: !!(window.DaxiAndroid),
        nativeFetchDetails: !!(window.DaxiAndroid && typeof DaxiAndroid.fetchPlaceDetailsAsync === 'function'),
        nativePredictions: !!(window.DaxiAndroid && typeof DaxiAndroid.fetchPlacePredictionsAsync === 'function'),
        active: document.activeElement && (document.activeElement.id || document.activeElement.tagName),
        vvH: window.visualViewport ? window.visualViewport.height : null,
        innerH: window.innerHeight
    });
    if (window._daxiPlacesHbTimer) clearInterval(window._daxiPlacesHbTimer);
    window._daxiPlacesHbTimer = setInterval(function() {
        var n = _daxiPlacesNow();
        var gap = n - window._daxiPlacesHbLast;
        window._daxiPlacesHbLast = n;
        if (gap > 80) {
            _daxiPlacesTrace('[HB] event-loop stall', { gapMs: +gap.toFixed(1), sinceMs: +(n - window._daxiPlacesTraceT0).toFixed(1) });
        }
        if (n - window._daxiPlacesTraceT0 > 20000) {
            clearInterval(window._daxiPlacesHbTimer);
            window._daxiPlacesHbTimer = null;
            _daxiPlacesTrace('[HB] heartbeat stopped');
        }
    }, 50);
    try {
        setTimeout(function() { _daxiPlacesTrace('[HB] setTimeout0 fired'); }, 0);
        requestAnimationFrame(function() {
            _daxiPlacesTrace('[HB] rAF1 fired');
            requestAnimationFrame(function() { _daxiPlacesTrace('[HB] rAF2 fired'); });
        });
    } catch (eHb) {}
}
try {
    if (typeof PerformanceObserver !== 'undefined' && !window._daxiPlacesLongTaskObs) {
        window._daxiPlacesLongTaskObs = new PerformanceObserver(function(list) {
            list.getEntries().forEach(function(e) {
                if (e.duration >= 50) {
                    _daxiPlacesTrace('[LONG TASK] ' + e.duration.toFixed(1) + 'ms', { start: e.startTime, name: e.name || '' });
                }
            });
        });
        window._daxiPlacesLongTaskObs.observe({ type: 'longtask', buffered: true });
    }
} catch (eLt) {}
window._daxiPlacesTrace = _daxiPlacesTrace;
window._daxiPlacesTraceReset = _daxiPlacesTraceReset;
window._daxiDumpPlacesTrace = function() {
    console.table(window._daxiPlacesTraceLog || []);
    return window._daxiPlacesTraceLog;
};
function _daxiPlacesTraceActive() {
    return !!(window._daxiPlacesTraceT0 && (_daxiPlacesNow() - window._daxiPlacesTraceT0) < 15000);
}

function _daxiOnPlaceSelected(inputEl, place, opts, displayValue, extra) {
    extra = extra || {};
    if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[PLACES] _daxiOnPlaceSelected START', { input: inputEl && inputEl.id });
    window._daxiSelectingPlace = true;
    var parts = _daxiPlaceCoords(place);
    if (typeof _daxiMapLog === 'function') {
        _daxiMapLog('placeSelected', { input: inputEl && inputEl.id, parts: parts });
    }
    if (!parts) {
        if (typeof _daxiMapWarn === 'function') _daxiMapWarn('placeSelected-no-coords', place);
        window._daxiSelectingPlace = false;
        return;
    }
    var cleanName = inputEl._daxiLockedPlaceLabel || _cleanPlaceName(_daxiPlaceToLegacyShape(place), displayValue || inputEl.value);
    if (!_isPlaceCovered(parts.lat, parts.lng)) {
        _rejectUncoveredPlace(inputEl, parts);
        window._daxiSelectingPlace = false;
        return;
    }
    _clearUncoveredBlock(inputEl);
    inputEl.value = cleanName;
    inputEl.dataset.placeSelected = '1';
    inputEl.dataset.lat = parts.lat;
    inputEl.dataset.lng = parts.lng;
    if (place && (place.place_id || place.id)) {
        inputEl.dataset.placeId = place.place_id || place.id;
    }
    if (extra.geometry_type === 'road' && extra.geometry && window.DaxiMapProvider) {
        DaxiMapProvider.storeRoadOnInput(inputEl, extra.geometry);
        DaxiMapProvider.previewSelectedRoad(extra.geometry);
    } else if (window.DaxiMapProvider) {
        DaxiMapProvider.storeRoadOnInput(inputEl, null);
        if (!extra.keepRoadPreview) DaxiMapProvider.clearRoadPreview();
    }
    _daxiSyncPlacesInputDisplay(inputEl, cleanName);
    if (inputEl.classList.contains('destination-input') && typeof window._syncPlanWaypointsFromInputs === 'function') {
        window._syncPlanWaypointsFromInputs();
    }
    if (opts && opts.onPlace) {
        var legacy = Object.assign(_daxiPlaceToLegacyShape(place), {
            geometry: { location: { lat: function() { return parts.lat; }, lng: function() { return parts.lng; } } },
            place_id: place.id || place.place_id || ''
        });
        if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[MAP] opts.onPlace (fields only, no _showPinMap)');
        opts.onPlace(legacy, cleanName);
        if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[MAP] opts.onPlace END');
    }
    if (typeof _daxiBlurPlacesFieldAfterSelect === 'function') {
        _daxiBlurPlacesFieldAfterSelect(inputEl);
        if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[UI] blur after select');
    }
    var inputId = inputEl.id || '';
    var latElPick = document.getElementById('pickupLatHidden');
    var lngElPick = document.getElementById('pickupLngHidden');
    var latElDest = document.getElementById('destLatHidden');
    var lngElDest = document.getElementById('destLngHidden');
    if (inputId === 'destinationAddress') {
        if (latElPick) latElPick.value = parts.lat;
        if (lngElPick) lngElPick.value = parts.lng;
        if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[MAP] setBookingPoint pickup (deferred, skipResize)');
        _setMainMapBookingPoint('pickup', parts.lat, parts.lng, 'pickupLatHidden', 'pickupLngHidden', 'destinationAddress', { silent: false, deferMapOps: true, skipMapResize: true });
    } else if (inputId === 'destinationAddressArrival') {
        if (latElDest) latElDest.value = parts.lat;
        if (lngElDest) lngElDest.value = parts.lng;
        if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[MAP] setBookingPoint dest (deferred, skipResize)');
        _setMainMapBookingPoint('dest', parts.lat, parts.lng, 'destLatHidden', 'destLngHidden', 'destinationAddressArrival', { silent: false, deferMapOps: true, skipMapResize: true });
    }
    if (!_daxiMainMapIsGoogle() && navigator.onLine && typeof window._daxiRecoverLiveGoogleMap === 'function') {

    }
    if (typeof _daxiDeferAfterPaint === 'function') {
        _daxiDeferAfterPaint(function() {
            window._daxiSelectingPlace = false;
        });
    } else {
        setTimeout(function() { window._daxiSelectingPlace = false; }, 50);
    }
}

var _HAITI_BOUNDS = null;

var _DAXI_COVERED_SLUGS = ['nord'];
var _DAXI_ALL_DEPTS = [];
var _DAXI_DEPTS_READY = false;

var _DAXI_ACTIVE_BOUNDS = null;
var _DAXI_ACTIVE_BOUNDS_LITERAL = null;

function _daxiBoundsFromDepts(depts) {
    if (!depts || !depts.length) return null;
    var sw_lat = Math.min.apply(null, depts.map(function(d){ return d.lat_min; }));
    var sw_lng = Math.min.apply(null, depts.map(function(d){ return d.lng_min; }));
    var ne_lat = Math.max.apply(null, depts.map(function(d){ return d.lat_max; }));
    var ne_lng = Math.max.apply(null, depts.map(function(d){ return d.lng_max; }));
  return {
        sw: { lat: sw_lat, lng: sw_lng },
        ne: { lat: ne_lat, lng: ne_lng }
    };
}

function _daxiClearMainMapPair() {
    if (window.DaxiMainMapDual && window.DaxiMainMapDual.destroy) {
        window.DaxiMainMapDual.destroy();
    }
    window._daxiMainMapPair = null;
}

var _DAXI_CAP_HAITIEN = { lat: 19.7558, lng: -72.2018 };
var _DAXI_CAP_HAITIEN_ZOOM = 14;

function _daxiFocusCapHaitien(map, opts) {
    opts = opts || {};
    map = map || window._clientBgMap;
    if (!map) return;
    try {
        if (map.setCenter) map.setCenter(_DAXI_CAP_HAITIEN);
        if (map.setZoom) map.setZoom(opts.zoom != null ? opts.zoom : _DAXI_CAP_HAITIEN_ZOOM);
        if (map.setTilt) map.setTilt(opts.tilt != null ? opts.tilt : 52);
        if (map.setHeading) map.setHeading(0);
    } catch (e) {}
}

function _daxiApplyActiveBoundsToMaps() {
    if (_DAXI_ACTIVE_BOUNDS_LITERAL && window.google && google.maps && !_DAXI_ACTIVE_BOUNDS) {
        _DAXI_ACTIVE_BOUNDS = new google.maps.LatLngBounds(
            new google.maps.LatLng(_DAXI_ACTIVE_BOUNDS_LITERAL.sw.lat, _DAXI_ACTIVE_BOUNDS_LITERAL.sw.lng),
            new google.maps.LatLng(_DAXI_ACTIVE_BOUNDS_LITERAL.ne.lat, _DAXI_ACTIVE_BOUNDS_LITERAL.ne.lng)
        );
    }
    if (_DAXI_ACTIVE_BOUNDS && typeof _HAITI_BOUNDS !== 'undefined' && _HAITI_BOUNDS) {
        _HAITI_BOUNDS = _DAXI_ACTIVE_BOUNDS;
    }
    _daxiFocusCapHaitien(window._clientBgMap, { zoom: _DAXI_CAP_HAITIEN_ZOOM, tilt: 52 });
}

function _parseCoveredDepts(data) {
    if (!data || !data.departments) return;
        _DAXI_ALL_DEPTS = data.departments;
        _DAXI_COVERED_SLUGS = data.departments.filter(function(d){ return d.is_active; }).map(function(d){ return d.slug; });
        var covered = data.departments.filter(function(d){ return d.is_active && d.lat_min && d.lat_max && d.lng_min && d.lng_max; });
        if (covered.length) {
            _DAXI_ACTIVE_BOUNDS_LITERAL = _daxiBoundsFromDepts(covered);
            if (window.google && google.maps) {
                _DAXI_ACTIVE_BOUNDS = new google.maps.LatLngBounds(
                    new google.maps.LatLng(_DAXI_ACTIVE_BOUNDS_LITERAL.sw.lat, _DAXI_ACTIVE_BOUNDS_LITERAL.sw.lng),
                    new google.maps.LatLng(_DAXI_ACTIVE_BOUNDS_LITERAL.ne.lat, _DAXI_ACTIVE_BOUNDS_LITERAL.ne.lng)
                );
            }
        }
    _DAXI_DEPTS_READY = true;
    _daxiApplyActiveBoundsToMaps();
}

function _ensureCoverageCheck(lat, lng, cb) {
    function run() { cb(_isPlaceCovered(lat, lng)); }
    if (_DAXI_DEPTS_READY) { run(); return; }
    fetch('/api/admin-panel/covered-departments/')
    .then(function(r){ return r.json(); })
    .then(function(data) { _parseCoveredDepts(data); run(); })
    .catch(function(){ cb(true); });
}


(function _loadCoveredDepts() {
    var catalogP = (window.DaxiPlacesCatalog && DaxiPlacesCatalog.load)
        ? DaxiPlacesCatalog.load()
        : Promise.resolve();
    var deptsP = fetch('/api/admin-panel/covered-departments/')
        .then(function(r){ return r.json(); })
        .then(_parseCoveredDepts)
        .catch(function(){});
    Promise.all([catalogP, deptsP]).then(function() {
        if (window.DaxiPlacesCatalog && DaxiPlacesCatalog.ready()) {
            console.info('[Daxi] Lieux sauvegardés chargés — suggestions hybrides DAXI + Google');
        }
    });
})();

(function _daxiLoadMapConfig() {
    fetch('/api/geo/map-config/', { credentials: 'include' })
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(cfg) {
        if (!cfg) return;
        window._DAXI_MAP_CONFIG = cfg;
        if (window._daxiPreferGoogleMaps && window._daxiPreferGoogleMaps()) {
            window.DAXI_USE_GOOGLE_MAPS = true;
            window.DAXI_USE_MAPLIBRE = false;
            window._DAXI_USE_MAPLIBRE = false;
        } else {
            window._DAXI_USE_MAPLIBRE = !!cfg.use_maplibre;
        }
        if (cfg.prefer_local_tiles && window.DaxiMapLibre) {
            var bg = document.getElementById('client-bg-map');
            if (bg && !window._clientBgMap) {
                DaxiMapProvider.initMapLibreBackground(bg).catch(function(){});
            }
        }
    })
    .catch(function(){});
})();


function _isPlaceCovered(lat, lng) {
    if (!_DAXI_DEPTS_READY) return true;
    var covered = _DAXI_ALL_DEPTS.filter(function(d){ return d.is_active; });
    if (!covered.length) return true;
    for (var i = 0; i < covered.length; i++) {
        var d = covered[i];
        if (d.lat_min && lat >= d.lat_min && lat <= d.lat_max && lng >= d.lng_min && lng <= d.lng_max) return true;
    }
    return false;
}


function _showUncoveredBlock(anchorEl) {
    var id = 'daxi-uncovered-' + (anchorEl.id || 'field');
    if (document.getElementById(id)) return;
    var warn = document.createElement('div');
    warn.id = id;
    warn.className = 'daxi-uncovered-block';
    warn.style.cssText = 'padding:8px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.35);border-radius:10px;color:#fca5a5;font-size:12px;margin-top:4px;display:flex;align-items:flex-start;gap:6px;line-height:1.35;';
    warn.innerHTML = '<i class="ri-error-warning-line" style="flex-shrink:0;margin-top:1px;"></i><span>DAXI ne couvre pas encore cette zone. Choisissez une adresse dans une zone desservie.</span>';
    var host = anchorEl.closest('.daxi-row-body') || anchorEl.parentNode;
    host.appendChild(warn);
}

function _clearUncoveredBlock(anchorEl) {
    if (!anchorEl) return;
    anchorEl.dataset.daxiUncovered = '';
    var el = document.getElementById('daxi-uncovered-' + (anchorEl.id || 'field'));
    if (el) el.remove();
}

function _rejectUncoveredPlace(inputEl, parts) {
    _clearPlaceCoordsForInput(inputEl);
    inputEl.value = '';
    inputEl.dataset.placeSelected = '';
    inputEl.dataset.daxiUncovered = '1';
    _showUncoveredBlock(inputEl);
    if (window._bookingMarkers) {
        var key = inputEl.id === 'destinationAddress' ? 'pickup' : 'dest';
        var m = window._bookingMarkers[key];
        if (m) {
            if (m._dom && m.overlay) m.overlay.setMap(null);
            else if (m.map != null) m.map = null;
            else if (m.setMap) m.setMap(null);
            window._bookingMarkers[key] = null;
        }
    }
}

function _warnGpsOutsideCoverage(lat, lng) {
    if (lat == null || lng == null) return;
    var inp = document.getElementById('destinationAddress');
    if (!inp || inp.dataset.placeSelected === '1') return;
    if (!_isPlaceCovered(lat, lng)) {
        inp.dataset.daxiGpsUncovered = '1';
        _showUncoveredBlock(inp);
        _showMapPrecisionHint('DAXI ne couvre pas encore votre zone actuelle', 7000);
    } else if (!inp.dataset.daxiUncovered) {
        inp.dataset.daxiGpsUncovered = '';
        _clearUncoveredBlock(inp);
    }
}

function _daxiLatLngParts(loc) {
    if (!loc) return null;
    return {
        lat: typeof loc.lat === 'function' ? loc.lat() : loc.lat,
        lng: typeof loc.lng === 'function' ? loc.lng() : loc.lng
    };
}

function _daxiMainMapIsGoogle() {
    return !!(
        window.google && window.google.maps && window._clientBgMap &&
        !window._daxiOfflineMapMode && typeof window._clientBgMap.getDiv === 'function'
    );
}

function _daxiIsOfflineBookingMarker(marker) {
    return !!(marker && marker.position && marker.setPosition == null && marker.addListener == null);
}

function _daxiResetStaleBookingMarkers() {
    if (!window._bookingMarkers) return;
    ['pickup', 'dest'].forEach(function(key) {
        if (_daxiIsOfflineBookingMarker(window._bookingMarkers[key])) {
            window._bookingMarkers[key] = null;
        }
    });
}

function _daxiPromoteMainMapMarkers() {
    if (!_daxiMainMapIsGoogle()) return;
    _daxiResetStaleBookingMarkers();
    var booking = window._daxiOfflineBooking || {};
    var pickup = booking.pickup;
    if (pickup && pickup.lat != null && pickup.lng != null) {
        _setMainMapBookingPoint('pickup', pickup.lat, pickup.lng, 'pickupLatHidden', 'pickupLngHidden', 'destinationAddress', { silent: true });
    }
    var dest = booking.dest;
    if (dest && dest.lat != null && dest.lng != null) {
        _setMainMapBookingPoint('dest', dest.lat, dest.lng, 'destLatHidden', 'destLngHidden', 'destinationAddressArrival', { silent: true });
    }
    _daxiSyncBookingMarkersFromForm();
    if (typeof _daxiReattachMainMapOverlays === 'function') _daxiReattachMainMapOverlays();
    if (typeof _flushClientGpsToMap === 'function') _flushClientGpsToMap();
}
window._daxiPromoteMainMapMarkers = _daxiPromoteMainMapMarkers;

function _daxiSyncBookingMarkersFromForm() {
    if (!_daxiMainMapIsGoogle()) return;
    function _num(id) {
        var el = document.getElementById(id);
        var v = el && el.value != null ? parseFloat(el.value) : NaN;
        return isFinite(v) ? v : null;
    }
    var pLa = _num('pickupLatHidden');
    var pLo = _num('pickupLngHidden');
    if (pLa != null && pLo != null) {
        _setMainMapBookingPoint('pickup', pLa, pLo, 'pickupLatHidden', 'pickupLngHidden', 'destinationAddress', { silent: true });
    }
    var dLa = _num('destLatHidden');
    var dLo = _num('destLngHidden');
    if (dLa != null && dLo != null) {
        _setMainMapBookingPoint('dest', dLa, dLo, 'destLatHidden', 'destLngHidden', 'destinationAddressArrival', { silent: true });
    }
}
window._daxiSyncBookingMarkersFromForm = _daxiSyncBookingMarkersFromForm;

function _daxiScheduleBookingMarkerRetry() {
    if (window._daxiBookingMarkerRetryTimer) return;
    window._daxiBookingMarkerRetryTimer = setTimeout(function() {
        window._daxiBookingMarkerRetryTimer = null;
        if (typeof _daxiFlushPendingBookingMarkers === 'function') _daxiFlushPendingBookingMarkers();
        if (_daxiMainMapIsGoogle()) _daxiSyncBookingMarkersFromForm();
    }, 350);
}

function _daxiFlushPendingBookingMarkers() {
    var q = window._daxiPendingBookingMarkers;
    if (!q || !q.length) return;
    window._daxiPendingBookingMarkers = [];
    q.forEach(function(args) {
        try { _setMainMapBookingPoint.apply(null, args); } catch (e) {}
    });
}
window._daxiFlushPendingBookingMarkers = _daxiFlushPendingBookingMarkers;

function _daxiEnsureMarkerLibReady() {
    if (window._daxiAdvancedMarkerElement) return Promise.resolve(true);
    if (window._daxiMarkerLibPromise) return window._daxiMarkerLibPromise;
    if (!window.google || !window.google.maps || typeof window.google.maps.importLibrary !== 'function') {
        return Promise.resolve(false);
    }
    window._daxiMarkerLibPromise = window.google.maps.importLibrary('marker').then(function(markerLib) {
        window._daxiAdvancedMarkerElement = markerLib.AdvancedMarkerElement;
        window._daxiPinElement = markerLib.PinElement || null;
        return true;
    }).catch(function(err) {
        console.warn('[Daxi Maps] marker library unavailable:', err);
        window._daxiAdvancedMarkerElement = null;
        return false;
    });
    return window._daxiMarkerLibPromise;
}
window._daxiEnsureMarkerLibReady = _daxiEnsureMarkerLibReady;

function _daxiWireDomBookingMarkerDrag(el, overlay, marker, onDragEnd) {
    var dragging = false;
    var dragPointerId = null;
    function setDraggable(draggable) {
        marker._draggable = !!draggable;
        el.style.pointerEvents = draggable ? 'auto' : 'none';
        el.style.cursor = draggable ? 'grab' : 'default';
        el.style.touchAction = draggable ? 'none' : 'auto';
    }
    function finishDrag(np) {
        dragging = false;
        dragPointerId = null;
        window._daxiPinDragging = false;
        el.style.cursor = marker._draggable ? 'grab' : 'default';
        if (np && typeof onDragEnd === 'function') onDragEnd(np);
    }
    function moveToClientPoint(clientX, clientY) {
        var projection = overlay.getProjection();
        var map = overlay.getMap();
        if (!projection || !map || !map.getDiv) return null;
        var rect = map.getDiv().getBoundingClientRect();
        var point = projection.fromDivPixelToLatLng(new google.maps.Point(clientX - rect.left, clientY - rect.top));
        if (!point) return null;
        var np = { lat: point.lat(), lng: point.lng() };
        marker.position = np;
        overlay._daxiPos = np;
        overlay.draw();
        return np;
    }
    el.addEventListener('pointerdown', function(e) {
        if (!marker._draggable) return;
        e.preventDefault();
        e.stopPropagation();
        dragging = true;
        dragPointerId = e.pointerId;
        window._daxiPinDragging = true;
        el.style.cursor = 'grabbing';
        if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', function(e) {
        if (!dragging || e.pointerId !== dragPointerId) return;
        e.preventDefault();
        moveToClientPoint(e.clientX, e.clientY);
    });
    el.addEventListener('pointerup', function(e) {
        if (!dragging || e.pointerId !== dragPointerId) return;
        e.preventDefault();
        var np = marker.position;
        if (el.releasePointerCapture) {
            try { el.releasePointerCapture(e.pointerId); } catch (err) {}
        }
        finishDrag(np);
    });
    el.addEventListener('pointercancel', function(e) {
        if (!dragging || e.pointerId !== dragPointerId) return;
        if (el.releasePointerCapture) {
            try { el.releasePointerCapture(e.pointerId); } catch (err2) {}
        }
        finishDrag(marker.position);
    });
    marker._setDraggable = setDraggable;
    setDraggable(!marker._markersLocked);
}

function _daxiCreateDomBookingMarker(type, pos, markersLocked, onDragEnd) {
    var el = _daxiPinMarkerEl(type);
    el.style.position = 'absolute';
    el.style.transform = 'translate(-50%, -100%)';
    el.style.zIndex = String(type === 'pickup' ? 10001 : 10002);
    el.style.pointerEvents = markersLocked ? 'none' : 'auto';
    el.style.filter = 'drop-shadow(0 4px 10px rgba(0,0,0,0.45))';
    var overlay = new google.maps.OverlayView();
    overlay._daxiPos = { lat: +pos.lat, lng: +pos.lng };
    overlay.onAdd = function() {
        var pane = this.getPanes();
        if (pane && pane.overlayMouseTarget) pane.overlayMouseTarget.appendChild(el);
        else if (pane && pane.floatPane) pane.floatPane.appendChild(el);
        var self = this;
        google.maps.event.addListenerOnce(this, 'projection_changed', function() { self.draw(); });
    };
    overlay.draw = function() {
        var projection = this.getProjection();
        if (!projection || !this._daxiPos) return;
        var point = projection.fromLatLngToDivPixel(new google.maps.LatLng(this._daxiPos.lat, this._daxiPos.lng));
        if (point) {
            el.style.left = point.x + 'px';
            el.style.top = point.y + 'px';
            el.style.display = 'block';
        }
    };
    overlay.onRemove = function() {
        if (el.parentNode) el.parentNode.removeChild(el);
    };
    overlay.setMap(window._clientBgMap);
    var marker = {
        _dom: true,
        _markersLocked: !!markersLocked,
        position: { lat: +pos.lat, lng: +pos.lng },
        overlay: overlay,
        element: el,
        map: window._clientBgMap,
        setMap: function(m) { overlay.setMap(m); this.map = m; },
        setPosition: function(p) {
            this.position = { lat: +p.lat, lng: +p.lng };
            overlay._daxiPos = this.position;
            overlay.draw();
        }
    };
    _daxiWireDomBookingMarkerDrag(el, overlay, marker, onDragEnd);
    google.maps.event.addListenerOnce(window._clientBgMap, 'idle', function() { overlay.draw(); });
    return marker;
}

function _daxiRedrawBookingMarkers() {
    if (!window._bookingMarkers || !window._clientBgMap) return;
    ['pickup', 'dest'].forEach(function(key) {
        var m = window._bookingMarkers[key];
        if (m && m._dom && m.overlay && m.overlay.draw) m.overlay.draw();
        else if (m && m.map != null) m.map = window._clientBgMap;
    });
}
window._daxiRedrawBookingMarkers = _daxiRedrawBookingMarkers;

function _daxiCreateBookingMapMarker(type, pos, markersLocked, onDragEnd) {
    pos = { lat: +pos.lat, lng: +pos.lng };
    if (window._daxiAdvancedMarkerElement && window._clientBgMap) {
        try {
        var pinColor = type === 'pickup' ? '#22c55e' : '#eab308';
        var content;
        if (window._daxiPinElement) {
            try {
                var pin = new window._daxiPinElement({
                    background: pinColor,
                    borderColor: '#ffffff',
                    glyphColor: '#ffffff',
                    scale: 1.15
                });
                content = pin.element;
            } catch (pinErr) {
                content = _daxiPinMarkerEl(type);
            }
        } else {
            content = _daxiPinMarkerEl(type);
        }
        var adv = new window._daxiAdvancedMarkerElement({
            map: window._clientBgMap,
            position: pos,
            content: content,
            gmpDraggable: !markersLocked,
            zIndex: type === 'pickup' ? 1001 : 1002,
            title: markersLocked
                ? (type === 'pickup' ? 'Départ' : 'Destination')
                : (type === 'pickup' ? 'Départ — glissez pour ajuster' : 'Destination — glissez pour ajuster')
        });
        if (typeof _daxiPlacesTrace === 'function' && typeof _daxiPlacesTraceActive === 'function' && _daxiPlacesTraceActive()) {
            _daxiPlacesTrace('[MAP] AdvancedMarker created');
        }
        adv.position = pos;
        adv.addListener('dragstart', function() { window._daxiPinDragging = true; });
        adv.addListener('dragend', function() {
            window._daxiPinDragging = false;
            var p = adv.position;
            if (!p) return;
            var np = {
                lat: typeof p.lat === 'function' ? p.lat() : p.lat,
                lng: typeof p.lng === 'function' ? p.lng() : p.lng
            };
            adv.position = np;
            if (typeof onDragEnd === 'function') onDragEnd(np);
        });
        return adv;
        } catch (advErr) {
            console.warn('[Daxi Maps] AdvancedMarker fallback:', advErr);
        }
    }
    if (window._clientBgMap && window.google && google.maps && google.maps.OverlayView) {
        return _daxiCreateDomBookingMarker(type, pos, markersLocked, onDragEnd);
    }
    var marker = new google.maps.Marker({
        map: window._clientBgMap,
        position: pos,
        draggable: !markersLocked,
        title: markersLocked
            ? (type === 'pickup' ? 'Départ' : 'Destination')
            : (type === 'pickup' ? 'Départ — glissez pour ajuster' : 'Destination — glissez pour ajuster'),
        zIndex: type === 'pickup' ? 1001 : 1002,
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 13,
            fillColor: type === 'pickup' ? '#22c55e' : '#eab308',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 4
        }
    });
    marker.position = pos;
    marker.addListener('dragstart', function() { window._daxiPinDragging = true; });
    marker.addListener('dragend', function() {
        window._daxiPinDragging = false;
        var p = marker.getPosition();
        if (!p) return;
        marker.position = { lat: p.lat(), lng: p.lng() };
        if (typeof onDragEnd === 'function') onDragEnd(marker.position);
    });
    return marker;
}

function _daxiMapCenteredDot(innerStyle) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'width:0;height:0;overflow:visible;pointer-events:auto;';
    var dot = document.createElement('div');
    dot.style.cssText = innerStyle;
    wrap.appendChild(dot);
    return wrap;
}

function _daxiPickupGreenDotEl() {
    var el = document.createElement('div');
    el.style.cssText = 'position:relative;width:30px;height:30px;pointer-events:auto;';
    var pulse = document.createElement('div');
    pulse.style.cssText = 'position:absolute;inset:-8px;border-radius:50%;background:rgba(34,197,94,0.22);';
    var dot = document.createElement('div');
    dot.style.cssText = 'position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:#22c55e;border:3px solid #ffffff;box-shadow:0 2px 12px rgba(34,197,94,0.75);';
    el.appendChild(pulse);
    el.appendChild(dot);
    return el;
}

function _daxiPinMarkerEl(type) {
    if (type === 'pickup') return _daxiPickupGreenDotEl();
    var color = '#eab308';
    var glow = '#fde047';
    var half = 13;
    return _daxiMapCenteredDot(
        'position:absolute;left:-' + half + 'px;top:-' + half + 'px;width:26px;height:26px;border-radius:50%;' +
        'border:3px solid #fff;background:radial-gradient(circle at 32% 28%,' + glow + ',' + color + ' 72%);' +
        'box-shadow:0 0 0 5px rgba(234,179,8,0.35),0 6px 18px rgba(0,0,0,0.5);'
    );
}

function _daxiIsOrderPositionsLocked() {
    if (!document.body.classList.contains('daxi-sheet-order-mode') && !window._daxiMainMapFocusOrderId) return false;
    var card = null;
    var orderId = window._daxiMainMapFocusOrderId;
    if (orderId) {
        card = document.querySelector('#daxi-sheet-order-slot [data-order-id="' + orderId + '"]')
            || document.getElementById('co-' + orderId);
    }
    if (!card) card = document.querySelector('#daxi-sheet-order-slot [data-order-id][data-status]');
    if (!card) {
        var meta = (window._daxiSheetOrderList || []).find(function(o) { return String(o.id) === String(orderId); });
        if (!meta) return false;
        var st = meta.status || '';
        if (['driver_assigned', 'on_way', 'arrived', 'in_progress', 'completed'].indexOf(st) >= 0) return true;
        if (st === 'price_confirmed') {
            var ps = meta.payment_status || '';
            return ps === 'paid' || ps === 'in_person';
        }
        return false;
    }
    var status = card.getAttribute('data-status') || '';
    if (['pending', 'price_proposed', 'cancelled'].indexOf(status) >= 0) return false;
    if (['driver_assigned', 'on_way', 'arrived', 'in_progress', 'completed'].indexOf(status) >= 0) return true;
    if (status === 'price_confirmed') {
        var pay = card.getAttribute('data-payment-status') || '';
        return pay === 'paid' || pay === 'in_person';
    }
    return false;
}

function _daxiSetBookingMarkersDraggable(draggable) {
    if (!window._bookingMarkers) return;
    ['pickup', 'dest'].forEach(function(key) {
        var m = window._bookingMarkers[key];
        if (!m) return;
        if (m.gmpDraggable != null) m.gmpDraggable = !!draggable;
        else if (m.setDraggable) m.setDraggable(!!draggable);
        else if (m._dom) {
            m._markersLocked = !draggable;
            if (m._setDraggable) m._setDraggable(!!draggable);
            else if (m.element) m.element.style.pointerEvents = draggable ? 'auto' : 'none';
        }
        var title = draggable
            ? (key === 'pickup' ? 'Départ — glissez pour ajuster' : 'Destination — glissez pour ajuster')
            : (key === 'pickup' ? 'Départ' : 'Destination');
        if (m.title != null) m.title = title;
    });
}

function _daxiApplyBookingMarkersLock() {
    _daxiSetBookingMarkersDraggable(!_daxiIsOrderPositionsLocked());
}
window._daxiApplyBookingMarkersLock = _daxiApplyBookingMarkersLock;

window._bookingMarkers = { pickup: null, dest: null };
window._planStopMarkers = window._planStopMarkers || [];
window._planWaypoints = window._planWaypoints || [];
window._bookingRouteLine = null;
window._bookingRouteGlow = null;
var _bookingRouteReq = 0;

function _showMapPrecisionHint(msg, ms, icon) {
    if (/GPS|±\s*\d|satellite|précision|precision|affinage|haute précision/i.test(String(msg || ''))) return;
    var el = document.getElementById('daxi-map-precision-hint');
    if (!el) return;
    var ic = icon != null ? icon : '↔';
    el.innerHTML = '<span class="daxi-pin-hint-pill"><span class="daxi-pin-hint-icon" aria-hidden="true">' + ic + '</span><span class="daxi-pin-hint-text">' + msg + '</span></span>';
    el.classList.add('show');
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(function() { el.classList.remove('show'); }, ms || 5000);
}

var _gpsHintLastAt = 0;
var _gpsScanDone = false;
var _gpsLockedShown = false;

function _showGpsHintThrottled(msg, ms, minGap) {
    return;
}

function _daxiMapFarFromUser(lat, lng) {
    if (!window._clientBgMap || lat == null || lng == null) return true;
    try {
        var c = window._clientBgMap.getCenter();
        if (!c) return true;
        var clat = typeof c.lat === 'function' ? c.lat() : c.lat;
        var clng = typeof c.lng === 'function' ? c.lng() : c.lng;
        if (clat == null || clng == null) return true;
        var dLat = (lat - clat) * 111320;
        var dLng = (lng - clng) * 111320 * Math.cos(lat * Math.PI / 180);
        return Math.sqrt(dLat * dLat + dLng * dLng) > 1200;
    } catch (e) {
        return true;
    }
}

function _daxiHasManualPickup() {
    return !!(window._bookingMarkers && window._bookingMarkers.pickup && !window._daxiPickupFromGps);
}

var _daxiLastAutoPanTs = 0;
var _daxiLastAutoPanLat = null;
var _daxiLastAutoPanLng = null;

function _daxiGpsMoveMeters(lat, lng, lat2, lng2) {
    if (lat == null || lng == null || lat2 == null || lng2 == null) return 9999;
    var dLat = (lat - lat2) * 111320;
    var dLng = (lng - lng2) * 111320 * Math.cos(lat * Math.PI / 180);
    return Math.sqrt(dLat * dLat + dLng * dLng);
}

function _daxiShouldThrottleAutoPan(lat, lng, opts) {
    opts = opts || {};
    if (opts.forceCenter || opts.forcePan) return false;
    var now = Date.now();
    if (!_daxiLastAutoPanTs || (now - _daxiLastAutoPanTs) > 4000) return false;
    if (_daxiLastAutoPanLat == null || _daxiLastAutoPanLng == null) return false;
    return _daxiGpsMoveMeters(lat, lng, _daxiLastAutoPanLat, _daxiLastAutoPanLng) < 100;
}

function _daxiAnimateMapToUser(lat, lng, acc, opts) {
    if (!window._clientBgMap || lat == null || lng == null) return;
    opts = opts || {};
    if (_daxiShouldThrottleAutoPan(lat, lng, opts)) return;
    if (!_shouldAutoPanMap(opts) && !opts.forceCenter && !opts.forcePan) return;
    var targetZoom = _getClientGpsZoom(acc || 60);
    _daxiCenterClientOnVisibleMap(lat, lng, { zoom: targetZoom });
}

function _finalizeClientGpsScan(acc) {
    acc = Math.round(acc || 999);
    if (acc > DAXI_GPS_VALIDATED_MAX_M) return;
    _gpsScanDone = true;
    if (!window._clientGpsPannedOnce) {
        var p = window._lastClientGpsPos;
        if (p && window._clientBgMap) {
            _daxiAnimateMapToUser(p.lat, p.lng, acc, { forceCenter: true });
            window._clientGpsPannedOnce = true;
        }
    }
}

function _syncSheetHeightVar(skipRepan) {
    var sheet = document.getElementById('appSheet');
    if (!sheet) return;
    var h = sheet.offsetHeight;
    if (document.body.classList.contains('daxi-sheet-collapsed-mode') ||
        (sheet.classList && sheet.classList.contains('daxi-sheet-hidden'))) {
        h = 0;
    }
    document.documentElement.style.setProperty('--daxi-sheet-height', h + 'px');
    _syncMapFloatControls();
    _syncMapTapZone();
    _daxiApplyMapViewportPadding();
    if (skipRepan) return;
    if (!document.body.classList.contains('daxi-sheet-order-mode') && !window._daxiMainMapFocusOrderId) {
        if (window._daxiMapFocusLockUntil && Date.now() < window._daxiMapFocusLockUntil) {
            _daxiRepanBookingPointForSheet();
        } else if (window._lastClientGpsPos && typeof _daxiRepanClientGpsForSheet === 'function' && !_daxiHasManualPickup()) {
            _daxiRepanClientGpsForSheet();
        }
    }
}

function _daxiRepanBookingPointForSheet() {
    if (!window._clientBgMap || window._daxiMapUserInteracting) return;
    var dest = window._bookingMarkers && window._bookingMarkers.dest;
    var pickup = window._bookingMarkers && window._bookingMarkers.pickup;
    var m = dest || pickup;
    if (!m) return;
    var p = _daxiLatLngParts(m.position || (m.getPosition && m.getPosition()));
    if (!p) return;
    var z = dest ? 15 : 16;
    _daxiCenterClientOnVisibleMap(p.lat, p.lng, { zoom: z });
}

function _syncMapTapZone() {
    var nav = document.querySelector('nav.nav-gradient');
    var navH = nav ? nav.offsetHeight : 56;
    document.documentElement.style.setProperty('--daxi-nav-height', navH + 'px');
}

function _syncMapFloatControls() {
    var cm = document.getElementById('client-map-compass');
    var wa = document.getElementById('client-map-whatsapp');
    if (!cm && !wa) return;
    var tabH = 60;
    try {
        var tv = getComputedStyle(document.documentElement).getPropertyValue('--daxi-tab-bar-height').trim();
        if (tv) tabH = parseInt(tv, 10) || tabH;
    } catch (e) {}
    var sheetH = 0;
    try {
        var sv = getComputedStyle(document.documentElement).getPropertyValue('--daxi-sheet-height').trim();
        if (sv) sheetH = parseInt(sv, 10) || 0;
    } catch (e) {}
    var nav = document.querySelector('nav.nav-gradient');
    var navH = nav ? nav.offsetHeight : 56;
    var routesHud = document.getElementById('daxi-routes-map-hud');
    var explorerHud = document.getElementById('daxi-explorer-hud');
    var routesH = (document.body.classList.contains('daxi-routes-mode') && routesHud && routesHud.offsetHeight)
        ? routesHud.offsetHeight : 0;
    var explorerH = (document.body.classList.contains('daxi-explorer-mode') && explorerHud && explorerHud.offsetHeight)
        ? explorerHud.offsetHeight : 0;
    var hudH = routesH || explorerH;
    var vh = window.innerHeight || document.documentElement.clientHeight || 600;
    var visibleTop = navH + 8;
    var visibleBottom = vh - tabH - sheetH - hudH - 8;
    if (visibleBottom < visibleTop + 80) visibleBottom = visibleTop + 80;
    var midY = Math.round((visibleTop + visibleBottom) / 2);
    var gap = 52;
    if (cm) {
        cm.style.top = Math.max(visibleTop + 4, midY - gap) + 'px';
        cm.style.bottom = 'auto';
    }
    if (wa) {
        wa.style.top = Math.min(visibleBottom - 44, midY + 4) + 'px';
        wa.style.bottom = 'auto';
    }
}

function _daxiHideAllPlaceSuggestions() {
    document.querySelectorAll('.suggestions-container:not(.hidden)').forEach(function(box) {
        if (typeof _daxiHideCustomSuggestions === 'function') _daxiHideCustomSuggestions(box);
        else {
            box.classList.add('hidden');
            box.innerHTML = '';
        }
    });
    document.querySelectorAll('.pac-container').forEach(function(el) {
        el.style.display = 'none';
    });
    var active = document.activeElement;
    if (active && active.blur && active.matches && active.matches('input, textarea, gmp-place-autocomplete, .daxi-place-ac')) {
        active.blur();
    }
}
window._daxiHideAllPlaceSuggestions = _daxiHideAllPlaceSuggestions;

var _DAXI_NO_COLLAPSE_SEL = [
    '#daxiSheetExpandFab',
    '#daxiSheetExpandFabWrap',
    '#appSheet',
    '.app-sheet',
    '#mainTabBar',
    '.tab-bar',
    '#daxiMenuFab',
    '#client-map-compass',
    '#client-map-whatsapp',
    '[data-daxi-no-collapse]',
    '.suggestions-container',
    '.suggestion-item',
    '.pac-container',
    '.daxi-map-offline-sheet',
    'gmp-place-autocomplete',
    '.gm-bundled-control',
    '.gm-control-active',
    '.gm-fullscreen-control',
    '.gm-svpc'
].join(', ');

function _daxiEventPathNodes(e) {
    if (!e) return [];
    var path = [];
    if (typeof e.composedPath === 'function') {
        try { path = e.composedPath() || []; } catch (err) { path = []; }
    }
    if ((!path || !path.length) && e.path) path = e.path;
    if (!path || !path.length) {
        var n = e.target;
        while (n) {
            path.push(n);
            if (n === document || n === window) break;
            n = n.parentElement || n.parentNode;
        }
    }
    return path;
}

function _daxiNodeBlocksMapCollapse(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.matches && node.matches(_DAXI_NO_COLLAPSE_SEL)) return true;
    if (node.closest && node.closest(_DAXI_NO_COLLAPSE_SEL)) return true;
    var id = node.id || '';
    if (id === 'daxiSheetExpandFab' || id === 'daxiSheetExpandFabWrap' || id === 'appSheet' || id === 'mainTabBar') return true;
    return false;
}

function _daxiEventClientXY(e) {
    if (!e) return null;
    if (e.clientX != null && e.clientY != null) return { x: e.clientX, y: e.clientY };
    var t = (e.changedTouches && e.changedTouches[0]) || (e.touches && e.touches[0]);
    if (t) return { x: t.clientX, y: t.clientY };
    return null;
}

function _daxiPointHitsProtectedChrome(x, y) {
    if (x == null || y == null || typeof document.elementFromPoint !== 'function') return false;
    var stack = [];
    if (typeof document.elementsFromPoint === 'function') {
        try { stack = document.elementsFromPoint(x, y) || []; } catch (err) { stack = []; }
    }
    if (!stack.length) {
        var top = document.elementFromPoint(x, y);
        if (top) stack = [top];
    }
    for (var i = 0; i < stack.length; i++) {
        if (_daxiNodeBlocksMapCollapse(stack[i])) return true;
    }
    return false;
}

function _daxiMarkProtectedPointer(e) {
    if (!e) return;
    window._daxiProtectedPointer = {
        id: e.pointerId,
        stamp: e.timeStamp,
        awaitingClick: e.type !== 'click'
    };
}

function _daxiIsProtectedPointerEvent(e) {
    var g = window._daxiProtectedPointer;
    if (!g || !e) return false;
    if (e.pointerId != null && e.pointerId === g.id && e.timeStamp === g.stamp) return true;
    if (e.type === 'click' && e.pointerId != null && e.pointerId === g.id && g.awaitingClick) {
        g.awaitingClick = false;
        return true;
    }
    return false;
}

function _daxiEventShouldIgnoreMapCollapse(e) {
    if (window._daxiSelectingPlace) return true;
    if (_daxiIsProtectedPointerEvent(e)) return true;
    var nodes = _daxiEventPathNodes(e);
    var i;
    for (i = 0; i < nodes.length; i++) {
        if (_daxiNodeBlocksMapCollapse(nodes[i])) return true;
    }
    var xy = _daxiEventClientXY(e);
    if (xy && _daxiPointHitsProtectedChrome(xy.x, xy.y)) return true;
    return false;
}
window._daxiEventShouldIgnoreMapCollapse = _daxiEventShouldIgnoreMapCollapse;

function _daxiCanCollapseSheetFromMap() {
    if (window._daxiPinDragging) return false;
    if (document.body.classList.contains('daxi-sheet-collapsed-mode')) return false;
    var sheet = document.getElementById('appSheet');
    if (sheet && sheet.classList.contains('daxi-sheet-hidden')) return false;
    if (document.body.classList.contains('daxi-routes-mode')) return false;
    if (document.body.classList.contains('daxi-explorer-mode')) return false;
    return true;
}

function _daxiCollapseSheetFromMapTap(e) {
    if (typeof _daxiMapLog === 'function') _daxiMapLog('collapseSheetFromMapTap');
    var domEvent = e && e.domEvent ? e.domEvent : e;
    if (_daxiEventShouldIgnoreMapCollapse(domEvent || e)) return;
    _daxiHideAllPlaceSuggestions();
    var pageOverlay = document.getElementById('daxiPageOverlay');
    if (pageOverlay && pageOverlay.classList.contains('show')) {
        if (typeof closeDaxiPage === 'function') closeDaxiPage();
        return;
    }
    if (!_daxiCanCollapseSheetFromMap()) return;
    _daxiSetSheetCollapsed(true);
}

function _daxiUpdateExpandFab() {
    var fab = document.getElementById('daxiSheetExpandFab');
    if (!fab) return;
    var overlay = document.getElementById('daxiPageOverlay');
    var pageOpen = document.body.classList.contains('daxi-page-open')
        || (overlay && overlay.classList.contains('show'));
    if (pageOpen
        || document.body.classList.contains('daxi-explorer-mode')
        || document.body.classList.contains('daxi-explorer-traveling')
        || document.body.classList.contains('daxi-routes-mode')) {
        fab.style.display = '';
        fab.style.opacity = '';
        fab.style.pointerEvents = '';
        return;
    }
    fab.style.display = '';
    fab.style.opacity = '';
    fab.style.pointerEvents = '';
    fab.style.visibility = '';
    var isOrder = window._daxiSheetPreferredMode === 'order'
        || (window._daxiSheetPreferredMode !== 'form' && document.body.classList.contains('daxi-sheet-order-mode'));
    if (isOrder) {
        fab.innerHTML = '<i class="ri-arrow-up-s-line"></i> <span data-translate="btn_view_my_ride">Voir ma course</span>';
    } else {
        fab.innerHTML = '<i class="ri-arrow-up-s-line"></i> <span data-translate="order_taxi_btn">Commander un taxi</span>';
    }
    if (window.applyDaxiTranslations) window.applyDaxiTranslations();
    _daxiWireSheetOpenTargets();
}

function _initMapTapZone() {
    if (window._daxiMapTapZoneReady) return;
    window._daxiMapTapZoneReady = true;
    _daxiWireMapCollapsePointer();
    _syncMapTapZone();
}

function _daxiWireMapCollapsePointer() {
    var stage = document.getElementById('daxi-map-stage');
    if (!stage || stage.dataset.daxiCollapsePointerBound) return;
    stage.dataset.daxiCollapsePointerBound = '1';
    var down = null;
    stage.addEventListener('pointerdown', function(e) {
        if (e.isPrimary === false) return;
        if (e.button != null && e.button !== 0) return;
        down = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }, true);
    stage.addEventListener('pointerup', function(e) {
        if (!down || e.pointerId !== down.id) return;
        var dx = Math.abs(e.clientX - down.x);
        var dy = Math.abs(e.clientY - down.y);
        down = null;
        if (dx > 14 || dy > 14) return;
        if (window._daxiMapDidDrag || window._daxiPinDragging) return;
        if (typeof _daxiMapLog === 'function') _daxiMapLog('mapStagePointerUp');
        _daxiCollapseSheetFromMapTap(e);
    }, true);
    stage.addEventListener('pointercancel', function(e) {
        if (down && e.pointerId === down.id) down = null;
    }, true);
}
window._daxiWireMapCollapsePointer = _daxiWireMapCollapsePointer;

function _daxiSheetIsCollapsed() {
    return document.body.classList.contains('daxi-sheet-collapsed-mode');
}

function _daxiMarkSheetUserOpen() {
    window._daxiSheetUserOpened = true;
}

function _daxiPrepareSheetVisible() {
    var sheet = document.getElementById('appSheet');
    if (sheet) {
        sheet.classList.remove('daxi-sheet-hidden', 'daxi-sheet-dragging');
        sheet.style.transform = '';
        sheet.style.opacity = '';
        sheet.style.pointerEvents = '';
        sheet.style.display = '';
        sheet.style.transition = '';
    }
    document.body.classList.remove('daxi-sheet-collapsed-mode');
    window._daxiSheetDragOffset = 0;
}

function _daxiOpenSheetOrder(source) {
    _daxiMarkSheetUserOpen();
    window._daxiSheetPreferredMode = 'order';
    _daxiPrepareSheetVisible();
    _daxiSetSheetMode('order', { expand: true });
    _daxiSetSheetCollapsed(false);
    if (typeof _daxiBootstrapOrdersFromCache === 'function') _daxiBootstrapOrdersFromCache();
    var slot = document.getElementById('daxi-sheet-order-slot');
    if (slot && slot.querySelector('[id^="co-"], #pending-coords-card, #guest-phone-card, #price-proposal-card, #payment-selection-wrap')) {
        window._daxiSheetView = 'detail';
        if (typeof _daxiProcessSheetSlot === 'function') _daxiProcessSheetSlot(slot);
        _daxiUpdateSheetSwitcher();
        _syncSheetHeightVar();
        if (typeof _daxiMaybeBackgroundRefreshOrders === 'function') _daxiMaybeBackgroundRefreshOrders();
        return;
    }
    var orders = window._daxiSheetOrderList || [];
    if (!orders.length && window._daxiOrdersBootPromise && !window._daxiOrdersBootComplete) {
        var slotWait = document.getElementById('daxi-sheet-order-slot');
        if (slotWait && !slotWait.querySelector('[id^="co-"]')) {
            slotWait.innerHTML = '<div style="padding:28px 16px;text-align:center;color:#94a3b8;font-size:13px;">Chargement de vos courses…</div>';
        }
        window._daxiOrdersBootPromise.then(function() {
            _daxiOpenSheetOrder(source);
        }).catch(function() {
            _daxiMaybeBackgroundRefreshOrders();
        });
        return;
    }
    if (orders.length) {
        var active = orders.find(function(o) { return o.active; }) || orders[0];
        if (active && _daxiShowSheetOrderFromMemory(active.id)) {
            _syncSheetHeightVar();
            if (typeof _daxiMaybeBackgroundRefreshOrders === 'function') _daxiMaybeBackgroundRefreshOrders();
            return;
        }
        if (orders.length > 1) {
            _daxiShowOrderListView();
            if (typeof _daxiMaybeBackgroundRefreshOrders === 'function') _daxiMaybeBackgroundRefreshOrders();
            return;
        }
        _daxiRenderOrderListView();
        _syncSheetHeightVar();
        if (typeof _daxiMaybeBackgroundRefreshOrders === 'function') _daxiMaybeBackgroundRefreshOrders();
        return;
    }
    _daxiSetSheetMode('form');
    _daxiUpdateSheetSwitcher();
    _syncSheetHeightVar();
    if (typeof _daxiMaybeBackgroundRefreshOrders === 'function') _daxiMaybeBackgroundRefreshOrders();
}
window._daxiOpenSheetOrder = _daxiOpenSheetOrder;

(function _daxiWireSheetTabClicksEarly() {
    if (window._daxiSheetTabClicksWired) return;
    window._daxiSheetTabClicksWired = true;
    document.addEventListener('click', function(e) {
        var orderTab = e.target && e.target.closest ? e.target.closest('#daxiSwitchOrder') : null;
        if (orderTab) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof _daxiOpenSheetOrder === 'function') _daxiOpenSheetOrder('switch-order');
            return;
        }
        var formTab = e.target && e.target.closest ? e.target.closest('#daxiSwitchForm') : null;
        if (formTab) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof _daxiOpenSheetForm === 'function') _daxiOpenSheetForm('switch-form');
        }
    }, true);
})();

(function _daxiWireClientMenuEarly() {
    if (window._daxiClientMenuWired) return;
    window._daxiClientMenuWired = true;
    function openSidebar() {
        var sidebarMenu = document.getElementById('sidebarMenu');
        var sidebarOverlay = document.getElementById('sidebarOverlay');
        if (sidebarMenu) sidebarMenu.classList.add('active');
        if (sidebarOverlay) sidebarOverlay.classList.add('active');
    }
    function closeSidebar() {
        var sidebarMenu = document.getElementById('sidebarMenu');
        var sidebarOverlay = document.getElementById('sidebarOverlay');
        if (sidebarMenu) sidebarMenu.classList.remove('active');
        if (sidebarOverlay) sidebarOverlay.classList.remove('active');
    }
    window.openSidebar = openSidebar;
    window.closeSidebar = closeSidebar;
    document.addEventListener('click', function(e) {
        var fab = e.target && e.target.closest ? e.target.closest('#daxiMenuFab') : null;
        if (fab) {
            e.preventDefault();
            e.stopPropagation();
            openSidebar();
            return;
        }
        var toggle = e.target && e.target.closest ? e.target.closest('#menuToggle') : null;
        if (toggle) {
            e.preventDefault();
            e.stopPropagation();
            openSidebar();
        }
    }, true);
})();

function _daxiOpenSheetForm(source) {
    _daxiMarkSheetUserOpen();
    window._daxiSheetPreferredMode = 'form';
    _daxiPrepareSheetVisible();
    _daxiSetSheetMode('form', { expand: true });
    _daxiSetSheetCollapsed(false);
    var sheet = document.getElementById('appSheet');
    if (sheet) {
        sheet.classList.remove('daxi-sheet-hidden', 'daxi-sheet-dragging');
        sheet.style.transform = '';
        sheet.style.opacity = '1';
        sheet.style.pointerEvents = '';
    }
    _daxiUpdateSheetSwitcher();
    if (typeof _syncSheetHeightVar === 'function') _syncSheetHeightVar();
    if (typeof _daxiRequestCommanderGpsFocus === 'function') {
        _daxiRequestCommanderGpsFocus(source || 'sheet-form');
    }
}
window._daxiOpenSheetForm = _daxiOpenSheetForm;

function _daxiOpenSheet(source) {
    _daxiMarkSheetUserOpen();
    var wantsOrder = window._daxiSheetPreferredMode === 'order'
        || (window._daxiSheetPreferredMode !== 'form' && document.body.classList.contains('daxi-sheet-order-mode'));
    if (wantsOrder) {
        _daxiOpenSheetOrder(source || 'fab');
    } else {
        _daxiOpenSheetForm(source || 'fab');
    }
}
window._daxiOpenSheet = _daxiOpenSheet;

function _daxiStopMapBleed(e) {
    if (!e) return;
    _daxiMarkProtectedPointer(e);
    e.stopPropagation();
}

function _daxiIsolateCommandChrome() {
    var wrap = document.getElementById('daxiSheetExpandFabWrap');
    var fab = document.getElementById('daxiSheetExpandFab');
    var types = ['pointerdown', 'touchstart', 'mousedown', 'click'];
    if (fab && !fab.dataset.daxiNoBleedBound) {
        fab.dataset.daxiNoBleedBound = '1';
        types.forEach(function(type) {
            fab.addEventListener(type, _daxiStopMapBleed, true);
        });
    }
    if (wrap && !wrap.dataset.daxiNoBleedBound) {
        wrap.dataset.daxiNoBleedBound = '1';
        types.forEach(function(type) {
            wrap.addEventListener(type, _daxiStopMapBleed, false);
        });
    }
}

function _daxiWireSheetOpenTargets() {
    _daxiIsolateCommandChrome();
    function onFabClick(e) {
        e.preventDefault();
        _daxiStopMapBleed(e);
        _daxiOpenSheet((e.currentTarget && e.currentTarget.id) || 'fab');
    }
    var fab = document.getElementById('daxiSheetExpandFab');
    if (fab && !fab.dataset.daxiOpenBound) {
        fab.dataset.daxiOpenBound = '1';
        fab.addEventListener('click', onFabClick, true);
    }
    var mini = document.getElementById('daxiSheetOrderMini');
    if (mini && !mini.dataset.daxiOpenBound) {
        mini.dataset.daxiOpenBound = '1';
        mini.addEventListener('click', onFabClick);
    }
}

function _daxiSetSheetCollapsed(collapsed) {
    var sheet = document.getElementById('appSheet');
    if (sheet) {
        sheet.classList.remove('daxi-sheet-dragging');
        sheet.style.transition = '';
        if (collapsed) {
            sheet.style.transform = '';
            sheet.style.opacity = '';
        }
    }
    window._daxiSheetDragOffset = 0;
    document.body.classList.toggle('daxi-sheet-collapsed-mode', !!collapsed);
    _daxiUpdateExpandFab();
    _syncSheetHeightVar();
    if (collapsed) {
        _daxiUpdateOrderMini();
        var activeMeta = (window._daxiSheetOrderList || []).find(function(o) { return o.active; })
            || (window._daxiSheetOrderList || [])[0];
        if (activeMeta && activeMeta.id) {
            window._daxiMainMapFocusOrderId = String(activeMeta.id);
            var mapEl = document.getElementById('daximap-' + activeMeta.id);
            if (mapEl && window._daxiUpdateMainMapForOrder) _daxiUpdateMainMapForOrder(activeMeta.id);
            else if (mapEl && window._daxiSyncMainMapOrderTracking) _daxiSyncMainMapOrderTracking(mapEl);
        }
    } else {
        if (sheet) sheet.classList.remove('daxi-sheet-hidden');
        if (!document.body.classList.contains('daxi-sheet-order-mode') && window._bookingMarkers) {
            setTimeout(function() { _fitMapToBookingMarkers(); }, 180);
        }
    }
    if (!document.body.classList.contains('daxi-sheet-order-mode') && !window._daxiMainMapFocusOrderId) {
        _daxiRepanClientGpsForSheet();
    }
}
function _daxiShowSheetOrderFromMemory(orderId) {
    if (!orderId) return false;
    var slot = document.getElementById('daxi-sheet-order-slot');
    if (!slot) return false;
    var liveInst = window._daxiMaps && window._daxiMaps[orderId];
    var liveMapEl = document.getElementById('daximap-' + orderId);
    var liveOk = false;
    if (liveInst && liveInst.map && liveMapEl) {
        try {
            var mapDiv = liveInst.map.getDiv();
            liveOk = mapDiv && mapDiv.isConnected && mapDiv === liveMapEl;
        } catch (e) {}
    }
    if (liveOk && liveMapEl.dataset.mapReady && slot.contains(liveMapEl)) {
        window._daxiSheetView = 'detail';
        window._daxiMainMapFocusOrderId = String(orderId);
        if (window._daxiOnSheetOrderSwap) window._daxiOnSheetOrderSwap(orderId);
        (window._daxiSheetOrderList || []).forEach(function(o) { o.active = String(o.id) === String(orderId); });
        _daxiRenderOrderPills();
        if (window._daxiAfterSheetOrderLoaded) _daxiAfterSheetOrderLoaded(orderId);
        return true;
    }
    _daxiHydrateSheetCacheFromStorage(orderId);
    var html = window._daxiSheetOrderHtmlCache[orderId];
    if (_daxiOrderInCheckoutPhase(orderId)) {
        if (html && html.length >= 40) {
            window._daxiSheetView = 'detail';
            window._daxiMainMapFocusOrderId = String(orderId);
            if (window._daxiOnSheetOrderSwap) window._daxiOnSheetOrderSwap(orderId);
            (window._daxiSheetOrderList || []).forEach(function(o) { o.active = String(o.id) === String(orderId); });
            _daxiRenderOrderPills();
            _daxiPrepareMapSlot(orderId);
            slot.innerHTML = html;
            if (typeof _daxiProcessSheetSlot === 'function') _daxiProcessSheetSlot(slot);
            if (window._daxiAfterSheetOrderLoaded) _daxiAfterSheetOrderLoaded(orderId);
            _daxiLoadSheetOrder(orderId, { preferCache: true, silentRefresh: true });
            return true;
        }
        _daxiLoadSheetOrder(orderId, { preferCache: true });
        return true;
    }
    var html = window._daxiSheetOrderHtmlCache[orderId];
    if (!html || html.length < 40) return false;
    window._daxiSheetView = 'detail';
    window._daxiMainMapFocusOrderId = String(orderId);
    if (window._daxiOnSheetOrderSwap) window._daxiOnSheetOrderSwap(orderId);
    (window._daxiSheetOrderList || []).forEach(function(o) { o.active = String(o.id) === String(orderId); });
    _daxiRenderOrderPills();
    _daxiPrepareMapSlot(orderId);
    slot.innerHTML = html;
    if (typeof _daxiProcessSheetSlot === 'function') _daxiProcessSheetSlot(slot);
    if (window._daxiAfterSheetOrderLoaded) _daxiAfterSheetOrderLoaded(orderId);
    return true;
}
window._daxiShowSheetOrderFromMemory = _daxiShowSheetOrderFromMemory;

window._daxiExpandSheet = function(opts) {
    opts = opts || {};
    function continueExpand() {
        _daxiPrepareSheetVisible();

        var wantsOrder = window._daxiSheetPreferredMode === 'order'
            || (window._daxiSheetPreferredMode !== 'form' && document.body.classList.contains('daxi-sheet-order-mode'));

        if (!wantsOrder) {
            _daxiSetSheetMode('form', { expand: true });
            _syncSheetHeightVar();
            return;
        }

        if (typeof _daxiBootstrapOrdersFromCache === 'function') _daxiBootstrapOrdersFromCache();

        var hasOrders = window._daxiSheetOrderList && window._daxiSheetOrderList.length > 0;
        if (!hasOrders) {
            _daxiSetSheetMode('order', { expand: true });
            _daxiRenderOrderEmptyState();
            _syncSheetHeightVar();
            if (typeof _daxiMaybeBackgroundRefreshOrders === 'function') _daxiMaybeBackgroundRefreshOrders();
            return;
        }

        _daxiSetSheetMode('order', { expand: true });
        var slot = document.getElementById('daxi-sheet-order-slot');
        if (!slot) {
            _syncSheetHeightVar();
            return;
        }

        if (slot.querySelector('[id^="co-"], #pending-coords-card, #guest-phone-card, #price-proposal-card, #payment-selection-wrap')) {
            _syncSheetHeightVar();
            if (window._daxiUpdateOrderMini) _daxiUpdateOrderMini();
            return;
        }

        var active = (window._daxiSheetOrderList || []).find(function(o) { return o.active; })
            || (window._daxiSheetOrderList || [])[0];
        if (!active) {
            _daxiShowOrderListView();
            _syncSheetHeightVar();
            return;
        }

        if (_daxiShowSheetOrderFromMemory(active.id)) {
            _syncSheetHeightVar();
            return;
        }

        if ((window._daxiSheetOrderList || []).length > 1) {
            _daxiShowOrderListView();
            _syncSheetHeightVar();
            return;
        }

        _daxiRenderOrderListView();
        _syncSheetHeightVar();
    }
    continueExpand();
};
window._daxiCollapseSheet = function() { _daxiSetSheetCollapsed(true); };
window._daxiSetSheetCollapsed = _daxiSetSheetCollapsed;

document.addEventListener('daxi-theme-change', function(e) {
    var theme = (e && e.detail && e.detail.theme) || document.documentElement.getAttribute('data-theme') || 'dark';
    if (window.DaxiMapTheme && window.DaxiMapTheme.syncChromeTheme) {
        window.DaxiMapTheme.syncChromeTheme(theme);
    }
    if (typeof _daxiUpdateExpandFab === 'function') _daxiUpdateExpandFab();
    if (typeof _syncSheetHeightVar === 'function') _syncSheetHeightVar();
    var fab = document.getElementById('daxiSheetExpandFab');
    if (fab) {
        fab.style.pointerEvents = 'auto';
        fab.setAttribute('data-theme-mode', theme);
    }
});

window._daxiLastKnownPrice = window._daxiLastKnownPrice || {};
window._daxiPinDragging = false;

function _daxiFormatUsd(amount, decimals) {
    if (amount == null || amount === '' || isNaN(amount)) return '—';
    var d = decimals == null ? 2 : decimals;
    return '$' + Number(amount).toFixed(d);
}
window._daxiFormatUsd = _daxiFormatUsd;

function _daxiApplyPriceToUI(orderId, total) {
    if (total == null || isNaN(total)) return;
    var prev = window._daxiLastKnownPrice[orderId];
    var bumped = (prev != null && total > prev + 0.009);
    window._daxiLastKnownPrice[orderId] = total;
    var priceStr = _daxiFormatUsd(total, 2);
    var mini = document.getElementById('daxiMiniPrice');
    if (mini) {
        mini.textContent = priceStr;
        if (bumped) {
            mini.classList.remove('daxi-price-bump');
            void mini.offsetWidth;
            mini.classList.add('daxi-price-bump');
        }
    }
    document.querySelectorAll('#daxi-sheet-order-slot .daxi-oc-price-val, #daxi-sheet-order-slot .daxi-pp-price-val').forEach(function(el) {
        if (el.classList.contains('daxi-pp-price-val')) {
            var numEl = el.querySelector('.daxi-pp-price-num');
            var curEl = el.querySelector('.daxi-pp-price-cur');
            if (numEl) numEl.textContent = Number(total).toFixed(2);
            if (curEl) curEl.textContent = '$';
            if (!numEl) el.textContent = priceStr;
        } else {
            el.textContent = priceStr;
        }
        if (bumped) {
            el.classList.remove('daxi-price-bump');
            void el.offsetWidth;
            el.classList.add('daxi-price-bump');
        }
    });
}

function _daxiUpdateOrderMini() {
    var statusEl = document.getElementById('daxiMiniStatus');
    var miniPriceEl = document.getElementById('daxiMiniPrice');
    var card = document.querySelector('#daxi-sheet-order-slot [data-order-id][data-status]');
    var orders = window._daxiSheetOrderList || [];
    if (!card && !orders.length) return;
    var labels = {
        driver_assigned: _daxiT('mini_driver_assigned', 'Chauffeur assigné'),
        on_way: _daxiT('mini_on_way', 'Chauffeur en route'),
        arrived: _daxiT('mini_arrived', 'Chauffeur sur place'),
        in_progress: _daxiT('mini_in_progress', 'Course en cours'),
        price_proposed: _daxiT('mini_price_proposed', 'Prix à valider'),
        pending: _daxiT('mini_pending', 'En attente')
    };
    if (card) {
        var st = card.getAttribute('data-status') || '';
        var waitTitle = card.querySelector('.daxi-oc-wait-banner__title');
        var badgeLabel = card.querySelector('.daxi-oc-badge--' + st);
        if (statusEl) {
            statusEl.textContent = (waitTitle && waitTitle.textContent.trim())
                || (badgeLabel && badgeLabel.textContent.trim())
                || labels[st]
                || _daxiT('mini_ride_default', 'Ma course');
        }
        var orderId = card.getAttribute('data-order-id');
        var priceEl = card.querySelector('.daxi-oc-price-val, .daxi-pp-price-val');
        var total = card.getAttribute('data-total-price');
        if (!total && priceEl) total = parseFloat(priceEl.textContent.replace(/[^0-9.]/g, ''));
        if (total) _daxiApplyPriceToUI(orderId, parseFloat(total));
        return;
    }
    var active = orders.find(function(o) { return o.active; }) || orders[0];
    if (!active) return;
    if (statusEl) {
        var label = active.client_status_label
            || (active.status ? _daxiStatusLabel(active.status) : '')
            || active.status_label
            || labels[active.status]
            || _daxiT('mini_ride_default', 'Ma course');
        statusEl.textContent = orders.length > 1
            ? _daxiT('mini_active_orders', '{n} courses actives').replace(/\{n\}/g, String(orders.length))
            : label;
    }
    if (miniPriceEl) {
        miniPriceEl.textContent = active.price != null ? _daxiFormatUsd(active.price, 2) : '—';
    }
}

function _syncRoundTripWaitUi() {
    var tripTypeHidden = document.getElementById('tripTypeHidden');
    var block = document.getElementById('roundTripWaitBlock');
    var isRt = tripTypeHidden && tripTypeHidden.value.indexOf('retour') >= 0;
    if (block) block.classList.toggle('hidden', !isRt);
    var waitWrap = document.getElementById('roundTripAllowWrap');
    var waitSel = document.getElementById('roundTripWaitMin');
    if (!isRt) {
        var waitH = document.getElementById('roundTripWaitHidden');
        var allowH = document.getElementById('roundTripAllowHidden');
        if (waitH) waitH.value = '0';
        if (allowH) allowH.value = 'false';
        if (waitWrap) waitWrap.classList.add('hidden');
    } else if (waitWrap && waitSel) {
        var waitMin = parseInt(waitSel.value, 10) || 0;
        waitWrap.classList.toggle('hidden', waitMin <= 30);
        if (waitMin <= 30) {
            var allowCb = document.getElementById('roundTripAllowOther');
            var allowH = document.getElementById('roundTripAllowHidden');
            if (allowCb) allowCb.checked = false;
            if (allowH) allowH.value = 'false';
        }
    }
}
window._syncRoundTripWaitUi = _syncRoundTripWaitUi;

function _daxiMapPadding(extraBottom) {
    var vh = window.innerHeight || document.documentElement.clientHeight || 600;
    var nav = document.querySelector('nav.nav-gradient');
    var navH = nav ? nav.offsetHeight : 56;
    var tabH = 60;
    try {
        var tv = getComputedStyle(document.documentElement).getPropertyValue('--daxi-tab-bar-height').trim();
        if (tv) tabH = parseInt(tv, 10) || tabH;
    } catch (e) {}
    var sheetH = 0;
    var sheet = document.getElementById('appSheet');
    if (sheet && !document.body.classList.contains('daxi-sheet-collapsed-mode') && !sheet.classList.contains('daxi-sheet-hidden')) {
        sheetH = sheet.offsetHeight || 0;
    }
    try {
        var sv = getComputedStyle(document.documentElement).getPropertyValue('--daxi-sheet-height').trim();
        if (sv) sheetH = Math.max(sheetH, parseInt(sv, 10) || 0);
    } catch (e) {}
    var hudExtra = document.body.classList.contains('daxi-route-hud-visible') ? 44 : 0;
    var orderExtra = document.body.classList.contains('daxi-sheet-order-mode') ? 72 : 0;
    return {
        top: navH + 8 + hudExtra,
        right: 24,
        bottom: tabH + sheetH + (extraBottom != null ? extraBottom : 20) + orderExtra,
        left: 24
    };
}

function _daxiApplyMapViewportPadding() {
    if (!window._clientBgMap || typeof window._clientBgMap.setOptions !== 'function') return;
    if (window._daxiApplyingMapPadding) return;
    window._daxiApplyingMapPadding = true;
    try {
        if (typeof _daxiPlacesTrace === 'function' && typeof _daxiPlacesTraceActive === 'function' && _daxiPlacesTraceActive()) {
            _daxiPlacesTrace('[MAP] setOptions(padding) START');
        }
        window._clientBgMap.setOptions({ padding: _daxiMapPadding(20) });
        if (typeof _daxiPlacesTrace === 'function' && typeof _daxiPlacesTraceActive === 'function' && _daxiPlacesTraceActive()) {
            _daxiPlacesTrace('[MAP] setOptions(padding) END');
        }
    } catch (e) {}
    window._daxiApplyingMapPadding = false;
}
window._daxiApplyMapViewportPadding = _daxiApplyMapViewportPadding;

function _daxiVisibleMapRectPx() {
    var vh = window.innerHeight || document.documentElement.clientHeight || 600;
    var vw = window.innerWidth || document.documentElement.clientWidth || 400;
    var nav = document.querySelector('nav.nav-gradient');
    var navH = nav ? nav.offsetHeight : 56;
    var tabH = 60;
    try {
        var tv = getComputedStyle(document.documentElement).getPropertyValue('--daxi-tab-bar-height').trim();
        if (tv) tabH = parseInt(tv, 10) || tabH;
    } catch (e) {}
    var sheetH = 0;
    var sheet = document.getElementById('appSheet');
    if (sheet && !document.body.classList.contains('daxi-sheet-collapsed-mode') && !sheet.classList.contains('daxi-sheet-hidden')) {
        sheetH = sheet.offsetHeight || 0;
    }
    var top = navH + (document.body.classList.contains('daxi-route-hud-visible') ? 52 : 10);
    var bottom = vh - tabH - sheetH - 14;
    if (bottom < top + 80) bottom = top + 80;
    return { top: top, bottom: bottom, left: 16, right: vw - 16 };
}

function _daxiEnsureMapOverlayProjection(cb) {
    var map = window._clientBgMap;
    if (!map || !window.google || !google.maps) return;
    var ov = window._daxiMapOverlayHelper;
    if (!ov) {
        ov = new google.maps.OverlayView();
        ov.onAdd = function() {};
        ov.draw = function() {};
        ov.onRemove = function() {};
        ov.setMap(map);
        window._daxiMapOverlayHelper = ov;
    }
    var proj = ov.getProjection();
    if (proj) { cb(proj); return; }
    google.maps.event.addListenerOnce(ov, 'projection_changed', function() {
        var p = ov.getProjection();
        if (p) cb(p);
    });
}

function _daxiLatLngToContainerPx(lat, lng, cb) {
    _daxiEnsureMapOverlayProjection(function(projection) {
        var pt = projection.fromLatLngToContainerPixel(new google.maps.LatLng(lat, lng));
        cb(pt ? { x: pt.x, y: pt.y } : null);
    });
}

function _daxiExpandLatLngBounds(bounds, padRatio) {
    padRatio = padRatio == null ? 0.22 : padRatio;
    if (!bounds || bounds.isEmpty()) return bounds;
    var ne = bounds.getNorthEast();
    var sw = bounds.getSouthWest();
    var latMid = (ne.lat() + sw.lat()) / 2;
    var lngMid = (ne.lng() + sw.lng()) / 2;
    var latSpan = Math.max(Math.abs(ne.lat() - sw.lat()), 0.0028);
    var lngSpan = Math.max(Math.abs(ne.lng() - sw.lng()), 0.0028);
    latSpan *= (1 + padRatio);
    lngSpan *= (1 + padRatio);
    var out = new google.maps.LatLngBounds(
        { lat: latMid - latSpan / 2, lng: lngMid - lngSpan / 2 },
        { lat: latMid + latSpan / 2, lng: lngMid + lngSpan / 2 }
    );
    return out;
}

function _daxiBothMarkersInVisibleStrip(cb) {
    var rect = _daxiVisibleMapRectPx();
    var keys = ['pickup', 'dest'];
    var pending = 0;
    var allOk = true;
    keys.forEach(function(k) {
        var m = window._bookingMarkers[k];
        if (!m) return;
        var p = _daxiLatLngParts(m.position || (m.getPosition && m.getPosition()));
        if (!p) return;
        pending++;
        _daxiLatLngToContainerPx(p.lat, p.lng, function(pt) {
            pending--;
            if (!pt || pt.y < rect.top || pt.y > rect.bottom || pt.x < rect.left || pt.x > rect.right) {
                allOk = false;
            }
            if (pending <= 0) cb(allOk);
        });
    });
    if (pending === 0) cb(allOk);
}

function _daxiFitBothBookingMarkersVisible(retry) {
    retry = retry || 0;
    if (!window._clientBgMap || !window.google) return;
    var pM = window._bookingMarkers.pickup, dM = window._bookingMarkers.dest;
    if (!pM || !dM) {
        _fitMapToBookingMarkers();
        return;
    }
    var pp = _daxiLatLngParts(pM.position || (pM.getPosition && pM.getPosition()));
    var dp = _daxiLatLngParts(dM.position || (dM.getPosition && dM.getPosition()));
    if (!pp || !dp) return;
    var bounds = new google.maps.LatLngBounds();
    bounds.extend(pp);
    bounds.extend(dp);
    bounds = _daxiExpandLatLngBounds(bounds, 0.28);
    var map = window._clientBgMap;
    if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[MAP] fitBounds START');
    map.fitBounds(bounds, _daxiMapPadding(48));
    if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[MAP] fitBounds END');
    google.maps.event.addListenerOnce(map, 'idle', function() {
        _daxiBothMarkersInVisibleStrip(function(ok) {
            if (!ok && retry < 5 && map.getZoom() > 9) {
                map.setZoom(map.getZoom() - 1);
                setTimeout(function() { _daxiFitBothBookingMarkersVisible(retry + 1); }, 80);
                return;
            }
            _daxiRestoreBookingMapTilt(map);
        });
    });
}
window._daxiFitBothBookingMarkersVisible = _daxiFitBothBookingMarkersVisible;

function _daxiVisibleMapMidY() {
    _syncSheetHeightVar();
    var vh = window.innerHeight || document.documentElement.clientHeight || 600;
    var nav = document.querySelector('nav.nav-gradient');
    var navH = nav ? nav.offsetHeight : 56;
    var tabH = 60;
    try {
        var tv = getComputedStyle(document.documentElement).getPropertyValue('--daxi-tab-bar-height').trim();
        if (tv) tabH = parseInt(tv, 10) || tabH;
    } catch (e) {}
    var sheetH = 0;
    var sheet = document.getElementById('appSheet');
    if (sheet && !document.body.classList.contains('daxi-sheet-collapsed-mode') && !sheet.classList.contains('daxi-sheet-hidden')) {
        sheetH = sheet.offsetHeight || 0;
    }
    var visibleTop = navH + 8;
    var visibleBottom = vh - tabH - sheetH - 8;
    if (visibleBottom < visibleTop + 60) visibleBottom = visibleTop + 60;
    return (visibleTop + visibleBottom) / 2;
}
window._daxiVisibleMapMidY = _daxiVisibleMapMidY;

function _daxiVisibleMapOffsetY() {
    var vh = window.innerHeight || document.documentElement.clientHeight || 600;
    return Math.round(vh / 2 - _daxiVisibleMapMidY());
}

function _daxiPanMapForSheet() {
    _daxiApplyMapViewportPadding();
}

function _daxiIsClientDotInVisibleStrip(lat, lng, cb) {
    var rect = _daxiVisibleMapRectPx();
    _daxiLatLngToContainerPx(lat, lng, function(pt) {
        if (!pt) { cb(false); return; }
        cb(pt.x >= rect.left && pt.x <= rect.right && pt.y >= rect.top && pt.y <= rect.bottom);
    });
}

function _daxiSmartPanForClientGps(lat, lng, acc, opts) {
    opts = opts || {};
    if (!window._clientBgMap || lat == null || lng == null) return;
    if (!_shouldAutoPanMap(opts) && !opts.forceCenter && !opts.forcePan) return;
    if (opts.forceCenter || opts.forcePan || !window._clientGpsPannedOnce) {
        if (!_daxiShouldThrottleAutoPan(lat, lng, opts)) {
            window._clientGpsPannedOnce = true;
            _daxiAnimateMapToUser(lat, lng, acc, opts);
        }
        return;
    }
    _daxiIsClientDotInVisibleStrip(lat, lng, function(visible) {
        if (!visible && !_daxiShouldThrottleAutoPan(lat, lng, opts)) {
            _daxiAnimateMapToUser(lat, lng, acc, opts);
        }
    });
}

function _daxiCenterClientOnVisibleMap(lat, lng, opts) {
    opts = opts || {};
    if (!window._clientBgMap || lat == null || lng == null) return;
    var _traceMap = typeof _daxiPlacesTrace === 'function' && typeof _daxiPlacesTraceActive === 'function' && _daxiPlacesTraceActive();
    if (_traceMap) _daxiPlacesTrace('[MAP] center START', { lat: lat, lng: lng, zoom: opts.zoom });
    _syncSheetHeightVar(true);
    _daxiApplyMapViewportPadding();
    if (_traceMap) _daxiPlacesTrace('[MAP] after _syncSheetHeightVar');
    try {
        var pos = { lat: lat, lng: lng };
        if (opts.zoom != null && window._clientBgMap.setZoom) {
            if (_traceMap) _daxiPlacesTrace('[MAP] setZoom START', { zoom: opts.zoom });
            window._clientBgMap.setZoom(opts.zoom);
            if (_traceMap) _daxiPlacesTrace('[MAP] setZoom END');
        }
        if (window._clientBgMap.setCenter) {
            if (_traceMap) _daxiPlacesTrace('[MAP] setCenter START');
            window._clientBgMap.setCenter(pos);
            if (_traceMap) _daxiPlacesTrace('[MAP] setCenter END');
        } else if (window._clientBgMap.panTo) {
            if (_traceMap) _daxiPlacesTrace('[MAP] panTo START');
            window._clientBgMap.panTo(pos);
            if (_traceMap) _daxiPlacesTrace('[MAP] panTo END');
        }
        if (window._clientBgMap.panBy) {
            var offsetY = _daxiVisibleMapOffsetY();
            if (offsetY) window._clientBgMap.panBy(0, offsetY);
        }
        if (!opts.skipPanMark) {
            _daxiLastAutoPanTs = Date.now();
            _daxiLastAutoPanLat = lat;
            _daxiLastAutoPanLng = lng;
        }
    } catch (e) {}
    if (_traceMap) _daxiPlacesTrace('[MAP] center END');
}

function _daxiRepanClientGpsForSheet() {
    _daxiApplyMapViewportPadding();
    var p = window._lastClientGpsPos;
    if (p && p.lat != null && p.lng != null && window._clientBgMap && !_daxiHasManualPickup()) {
        _daxiIsClientDotInVisibleStrip(p.lat, p.lng, function(visible) {
            if (!visible) _daxiCenterClientOnVisibleMap(p.lat, p.lng, { skipPanMark: true });
        });
    }
}

function _hideBookingValidationErr() {
    var inline = document.getElementById('daxi-booking-inline-err');
    if (inline) {
        inline.innerHTML = '';
        inline.style.display = 'none';
    }
    var respEl = document.getElementById('booking-response');
    if (respEl && respEl.querySelector && respEl.querySelector('[style*="fef2f2"]')) {
        respEl.innerHTML = '';
        respEl.style.display = 'none';
    }
}

function _showBookingValidationErr(msg) {
    var inlineId = 'daxi-booking-inline-err';
    var inline = document.getElementById(inlineId);
    if (!inline) {
        var wrap = document.querySelector('.daxi-order-cta-wrap');
        if (wrap) {
            inline = document.createElement('div');
            inline.id = inlineId;
            wrap.parentNode.insertBefore(inline, wrap);
        }
    }
    var html = '<div style="padding:10px 14px;margin-bottom:10px;background:#fef2f2;border:1px solid #fca5a5;border-radius:10px;color:#b91c1c;font-size:13px;font-weight:600;">'
        + '⚠️ ' + msg + '</div>';
    if (inline) {
        inline.innerHTML = html;
        inline.style.display = 'block';
        inline.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        clearTimeout(inline._hideTimer);
        inline._hideTimer = setTimeout(function() { _hideBookingValidationErr(); }, 4500);
    }
    if (window._daxiSetSheetCollapsed) _daxiSetSheetCollapsed(false);
    if (window._daxiSetSheetMode) _daxiSetSheetMode('form');
    var respEl = document.getElementById('booking-response');
    if (respEl) {
        respEl.style.display = 'block';
        respEl.innerHTML = html;
        clearTimeout(respEl._hideTimer);
        respEl._hideTimer = setTimeout(function() { _hideBookingValidationErr(); }, 4500);
    }
}

function _daxiLooksLikeEmail(val) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val || '').trim());
}

function _daxiPersistAffiliateRef() {
    var ref = '';
    try {
        var params = new URLSearchParams(window.location.search || '');
        ref = (params.get('ref') || '').trim();
        if (!ref) ref = (sessionStorage.getItem('daxi_ref') || '').trim();
        if (!ref) ref = (localStorage.getItem('daxi_ref') || '').trim();
        if (ref) {
            sessionStorage.setItem('daxi_ref', ref);
            localStorage.setItem('daxi_ref', ref);
        }
    } catch (err) {}
    var hidden = document.getElementById('affiliateCodeHidden');
    if (hidden && ref) hidden.value = ref;
    return ref;
}
window._daxiPersistAffiliateRef = _daxiPersistAffiliateRef;

function _syncBookingHiddenFields() {
    var pickup = document.getElementById('destinationAddress');
    var dest = document.getElementById('destinationAddressArrival');
    var pickupHidden = document.getElementById('pickupHidden');
    var destHidden = document.getElementById('destinationHidden');
    var bookingDate = document.getElementById('bookingDate');
    var bookingTime = document.getElementById('bookingTime');
    var dateHidden = document.getElementById('bookingDateHidden');
    var timeHidden = document.getElementById('bookingTimeHidden');
    var guestIdHidden = document.getElementById('guestIdHidden');
    var laterBtn = document.getElementById('laterBtn');
    var isLaterHidden = document.getElementById('isLaterHidden');

    if (pickup && pickupHidden) pickupHidden.value = pickup.value.trim();
    if (dest && destHidden) destHidden.value = dest.value.trim();
    var pLatH = document.getElementById('pickupLatHidden');
    var pLngH = document.getElementById('pickupLngHidden');
    var dLatH = document.getElementById('destLatHidden');
    var dLngH = document.getElementById('destLngHidden');
    _daxiSyncPlaceCoordsToHidden(pickup, pLatH, pLngH);
    _daxiSyncPlaceCoordsToHidden(dest, dLatH, dLngH);
    if (pickup && _daxiLooksLikeEmail(pickup.value)) {
        pickup.value = '';
        if (pickupHidden) pickupHidden.value = '';
        pickup.dataset.placeSelected = '0';
    }
    if (dest && _daxiLooksLikeEmail(dest.value)) {
        dest.value = '';
        if (destHidden) destHidden.value = '';
        dest.dataset.placeSelected = '0';
    }
    if (bookingDate && dateHidden) dateHidden.value = bookingDate.value;
    if (bookingTime && timeHidden) timeHidden.value = bookingTime.value;
    if (guestIdHidden) guestIdHidden.value = window._daxiGuestId || localStorage.getItem('daxi_guest_id') || '';
    if (isLaterHidden) isLaterHidden.value = (laterBtn && laterBtn.classList.contains('active')) ? 'true' : 'false';
    var waitSel = document.getElementById('roundTripWaitMin');
    var waitH = document.getElementById('roundTripWaitHidden');
    var allowH = document.getElementById('roundTripAllowHidden');
    var allowCb = document.getElementById('roundTripAllowOther');
    if (waitSel && waitH) waitH.value = waitSel.value || '0';
    if (allowH && allowCb) allowH.value = allowCb.checked ? 'true' : 'false';
    if (typeof _daxiPersistAffiliateRef === 'function') _daxiPersistAffiliateRef();
    _syncClientGpsAccuracyHiddenFields();
}

function _syncClientGpsAccuracyHiddenFields() {
    var accH = document.getElementById('clientGpsAccHidden');
    var cLatH = document.getElementById('clientGpsLatHidden');
    var cLngH = document.getElementById('clientGpsLngHidden');
    var maxM = (typeof DAXI_GPS_VALIDATED_MAX_M === 'number') ? DAXI_GPS_VALIDATED_MAX_M : 300;
    var src = null;
    if (window._daxiPickupFromGps) {
        var validated = window.DaxiClientGps && DaxiClientGps.getValidated && DaxiClientGps.getValidated();
        var last = window._lastClientGpsPos;
        if (validated && validated.acc <= maxM) src = validated;
        else if (last && last.acc != null && last.acc <= maxM) src = last;
    }
    if (src && src.lat != null && src.lng != null) {
        if (cLatH) cLatH.value = src.lat;
        if (cLngH) cLngH.value = src.lng;
        if (accH) accH.value = Math.round(src.acc);
    } else {
        if (cLatH) cLatH.value = '';
        if (cLngH) cLngH.value = '';
        if (accH) accH.value = '';
    }
}

function _validateBookingForm() {
    _syncBookingHiddenFields();

    var pickup = document.getElementById('destinationAddress');
    var dest = document.getElementById('destinationAddressArrival');
    var pLat = document.getElementById('pickupLatHidden');
    var pLng = document.getElementById('pickupLngHidden');
    var dLat = document.getElementById('destLatHidden');
    var dLng = document.getElementById('destLngHidden');
    var laterBtn = document.getElementById('laterBtn');
    var bookingDate = document.getElementById('bookingDate');
    var bookingTime = document.getElementById('bookingTime');

    var pickupVal = pickup ? pickup.value.trim() : '';
    var destVal = dest ? dest.value.trim() : '';

    if (!pickupVal) return 'Veuillez indiquer votre point de départ.';
    if (pLat && pLat.value.trim() && pLng && pLng.value.trim() && pickup && pickup.dataset.daxiUncovered === '1') {
        return 'DAXI ne couvre pas encore le point de départ sélectionné.';
    }
    if (pickup && pickup.dataset.daxiGpsUncovered === '1') {
        return 'DAXI ne couvre pas encore votre zone actuelle.';
    }
    if (!destVal) return 'Veuillez saisir votre destination.';
    if (dLat && dLat.value.trim() && dLng && dLng.value.trim() && dest && dest.dataset.daxiUncovered === '1') {
        return 'DAXI ne couvre pas encore la destination sélectionnée.';
    }
    if (laterBtn && laterBtn.classList.contains('active')) {
        if (!bookingDate || !bookingDate.value.trim()) return 'Veuillez choisir une date pour la course programmée.';
        if (!bookingTime || !bookingTime.value.trim()) return 'Veuillez choisir une heure pour la course programmée.';
    }
    if (!(window.DJANGO_SESSION && window.DJANGO_SESSION.is_authenticated)) {
        var gid = window._daxiGuestId || localStorage.getItem('daxi_guest_id') || '';
        if (!gid) return 'Identifiant de session manquant. Veuillez rafraîchir la page.';
    }
    return null;
}
window._validateBookingForm = _validateBookingForm;

window._daxiRecentOrderSigs = window._daxiRecentOrderSigs || {};
window._daxiOrderCreateInFlight = false;

function _daxiOrderSignature() {
    _syncBookingHiddenFields();
    var parts = [
        (document.getElementById('pickupHidden') || {}).value || '',
        (document.getElementById('destinationHidden') || {}).value || '',
        (document.getElementById('guestIdHidden') || {}).value || '',
        (document.getElementById('pickupLatHidden') || {}).value || '',
        (document.getElementById('pickupLngHidden') || {}).value || '',
        (document.getElementById('destLatHidden') || {}).value || '',
        (document.getElementById('destLngHidden') || {}).value || '',
        (document.getElementById('tripTypeHidden') || {}).value || '',
        (document.getElementById('passengerCountHidden') || {}).value || '',
        (document.getElementById('bookingDateHidden') || {}).value || '',
        (document.getElementById('bookingTimeHidden') || {}).value || '',
        (document.getElementById('isLaterHidden') || {}).value || '',
        (document.getElementById('servicePlanHidden') || {}).value || ''
    ];
    return parts.map(function(p) { return String(p).trim().toLowerCase(); }).join('|');
}

function _daxiCheckDuplicateOrder() {
    var sig = _daxiOrderSignature();
    if (!sig.replace(/\|/g, '')) return '';
    var prev = window._daxiRecentOrderSigs[sig];
    if (prev && (Date.now() - prev) < 20000) {
        var dict = (window._localTranslations && window._localTranslations[localStorage.getItem('daxi_lang') || 'fr']) || {};
        return dict.dup_order_msg || 'Une commande identique vient d\'être envoyée. Patientez quelques secondes.';
    }
    return '';
}

function _daxiMarkOrderSubmitted() {
    var sig = _daxiOrderSignature();
    if (sig.replace(/\|/g, '')) window._daxiRecentOrderSigs[sig] = Date.now();
}


window._daxiSheetOrderList = [];
window._daxiSheetOrderHtmlCache = {};
function _daxiPurgeLegacySheetCaches() {
    try {
        var drop = [];
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (!key) continue;
            if (key.indexOf('daxi_sheet_html_v1_') === 0 || key.indexOf('daxi_sheet_html_v2_') === 0 || key.indexOf('daxi_sheet_html_v3_') === 0) drop.push(key);
        }
        drop.forEach(function(k) { localStorage.removeItem(k); });
    } catch (e) {}
}
_daxiPurgeLegacySheetCaches();
try {
    var _daxiSheetCacheBuild = '20260724a';
    if (localStorage.getItem('daxi_sheet_cache_build') !== _daxiSheetCacheBuild) {
        var _purgeKeys = [];
        for (var _pi = 0; _pi < localStorage.length; _pi++) {
            var _pk = localStorage.key(_pi);
            if (_pk && _pk.indexOf('daxi_sheet_html_v') === 0) _purgeKeys.push(_pk);
        }
        _purgeKeys.forEach(function(k) { localStorage.removeItem(k); });
        window._daxiSheetOrderHtmlCache = {};
        localStorage.setItem('daxi_sheet_cache_build', _daxiSheetCacheBuild);
    }
} catch (e) {}

function _daxiHydrateAllSheetCachesFromStorage() {
    try {
        for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (!key || key.indexOf('daxi_sheet_html_v5_') !== 0) continue;
            var oid = key.slice('daxi_sheet_html_v5_'.length);
            if (!oid || window._daxiSheetOrderHtmlCache[oid]) continue;
            var html = localStorage.getItem(key);
            if (html && html.length > 40) window._daxiSheetOrderHtmlCache[oid] = _daxiPatchSheetHtml(html);
        }
    } catch (e) {}
}
_daxiHydrateAllSheetCachesFromStorage();

function _daxiPersistOrdersListMeta() {
    try {
        var list = window._daxiSheetOrderList || [];
        if (!list.length) {
            localStorage.removeItem('daxi_sheet_orders_meta_v1');
            return;
        }
        localStorage.setItem('daxi_sheet_orders_meta_v1', JSON.stringify({ saved_at: Date.now(), orders: list }));
    } catch (e) {}
}
function _daxiHydrateOrdersListMeta() {
    try {
        if (window._daxiSheetOrderList && window._daxiSheetOrderList.length) return;
        var raw = localStorage.getItem('daxi_sheet_orders_meta_v1');
        if (!raw) return;
        var p = JSON.parse(raw);
        if (p && p.orders && p.orders.length) {
            window._daxiSheetOrderList = p.orders;
            if (window._daxiOrdersMetaLive) {
                _daxiUpdateSheetSwitcher();
                _daxiUpdateOrderMini();
            }
        }
    } catch (e) {}
}
_daxiHydrateOrdersListMeta();

function _daxiBootstrapOrdersFromCache() {
    if (window._daxiSheetOrderList && window._daxiSheetOrderList.length) return false;
    if (window._daxiOrdersEmptyConfirmed && (typeof _daxiSheetSlotHasCheckoutFlow !== 'function' || !_daxiSheetSlotHasCheckoutFlow())) return false;
    _daxiHydrateAllSheetCachesFromStorage();
    var ids = Object.keys(window._daxiSheetOrderHtmlCache || {}).filter(function(id) {
        return window._daxiSheetOrderHtmlCache[id] && window._daxiSheetOrderHtmlCache[id].length > 40;
    });
    if (!ids.length) return false;
    window._daxiSheetOrderList = ids.map(function(id, i) {
        return { id: parseInt(id, 10) || id, label: 'Course #' + id, active: i === 0 };
    });
    _daxiUpdateSheetSwitcher();
    _daxiUpdateOrderMini();
    return true;
}

function _daxiGuestQs() {
    var gid = (typeof _daxiGuestIdForRequest === 'function' ? _daxiGuestIdForRequest() : '')
        || window._daxiGuestId
        || localStorage.getItem('daxi_guest_id')
        || '';
    return gid ? ('?guest_id=' + encodeURIComponent(gid)) : '';
}

function _daxiWsGuestQs() {
    var qs = _daxiGuestQs();
    return qs ? qs.replace(/^\?/, '?') : '';
}

function _daxiPrepareMapSlot(orderId) {
    if (!orderId) return;
    if (window.DaxiOrderCardMap && typeof DaxiOrderCardMap.destroyOrder === 'function') {
        try { DaxiOrderCardMap.destroyOrder(orderId); } catch (e) {}
    }
    var el = document.getElementById('daximap-' + orderId);
    var inst = window._daxiMaps && window._daxiMaps[orderId];
    if (inst && inst.map) {
        var mapDiv = null;
        try { mapDiv = inst.map.getDiv(); } catch (e) {}
        if (!mapDiv || !mapDiv.isConnected || mapDiv !== el) {
            try {
                if (window.google && google.maps && google.maps.event) {
                    google.maps.event.clearInstanceListeners(inst.map);
                }
            } catch (e2) {}
            delete window._daxiMaps[orderId];
        }
    }
    if (el) {
        delete el.dataset.mapReady;
        delete el.dataset.daxiDriverObs;
        delete el.dataset.daxiCardMapReady;
        el.style.opacity = '0';
    }
}
window._daxiPrepareMapSlot = _daxiPrepareMapSlot;

function _daxiDestroyOrderMaps(orderId) {
    if (orderId == null || orderId === '') return;
    var oid = String(orderId);

    if (window.DaxiOrderCardMap && typeof DaxiOrderCardMap.destroyOrder === 'function') {
        DaxiOrderCardMap.destroyOrder(oid);
    }

    var inst = window._daxiMaps && window._daxiMaps[oid];
    if (inst && inst.map && window.google && google.maps && google.maps.event) {
        try { google.maps.event.clearInstanceListeners(inst.map); } catch (e) {}
    }
    if (window._daxiMaps) delete window._daxiMaps[oid];

    var mapEl = document.getElementById('daximap-' + oid);
    if (mapEl) {
        mapEl.innerHTML = '';
        delete mapEl.dataset.mapReady;
        delete mapEl.dataset.daxiCardMapReady;
        delete mapEl.dataset.daxiDriverObs;
        mapEl.style.opacity = '';
    }
    var skel = document.getElementById('daximap-skel-' + oid);
    if (skel) {
        skel.style.display = 'none';
        skel.innerHTML = '';
    }

    if (window._daxiInvalidateSheetCache) window._daxiInvalidateSheetCache(oid);

    if (String(window._daxiMainMapFocusOrderId) === oid) {
        window._daxiMainMapFocusOrderId = null;
        if (typeof _daxiClearMainMapOrderTrack === 'function') _daxiClearMainMapOrderTrack();
        if (typeof _daxiClearBookingRouteHud === 'function') _daxiClearBookingRouteHud();
        if (window._bookingMarkers) {
            ['pickup', 'dest'].forEach(function(key) {
                var m = window._bookingMarkers[key];
                if (!m) return;
                if (m.map != null) m.map = null;
                else if (m.setMap) m.setMap(null);
                window._bookingMarkers[key] = null;
            });
        }
    }
}
window._daxiDestroyOrderMaps = _daxiDestroyOrderMaps;

function _daxiSetSheetMode(mode, opts) {
    opts = opts || {};
    var isOrder = mode === 'order';
    window._daxiSheetPreferredMode = isOrder ? 'order' : 'form';
    document.documentElement.classList.toggle('daxi-sheet-order-mode', isOrder);
    if (document.body) document.body.classList.toggle('daxi-sheet-order-mode', isOrder);
    var swForm = document.getElementById('daxiSwitchForm');
    var swOrder = document.getElementById('daxiSwitchOrder');
    if (swForm) swForm.classList.toggle('active', !isOrder);
    if (swOrder) swOrder.classList.toggle('active', isOrder);
    _daxiUpdateSheetSwitcher();
    _syncSheetHeightVar();
    _daxiUpdateExpandFab();
    if (opts.expand) {
        _daxiSetSheetCollapsed(false);
        var sheetEl = document.getElementById('appSheet');
        if (sheetEl) sheetEl.classList.remove('daxi-sheet-hidden');
    }
    if (isOrder) {
        _daxiUpdateOrderMini();
        _daxiRepanClientGpsForSheet();
        var card = document.querySelector('#daxi-sheet-order-slot [data-status]');
        var st = card ? card.getAttribute('data-status') : '';
        if (card && st && window._daxiScanLiveTracking) {
            setTimeout(window._daxiScanLiveTracking, 300);
        }
        if (window.applyDaxiTranslations) window.applyDaxiTranslations();
    }
}
window._daxiSetSheetMode = _daxiSetSheetMode;

function _daxiSheetTabsShouldShow() {
    if (typeof _daxiSheetSlotHasCheckoutFlow === 'function' && _daxiSheetSlotHasCheckoutFlow()) return true;
    var slot = document.getElementById('daxi-sheet-order-slot');
    if (slot && slot.querySelector('[id^="co-"], #pending-coords-card, #guest-phone-card, #price-proposal-card, #payment-selection-wrap, .daxi-pay-wrap')) return true;
    if (!window._daxiOrdersMetaLive) return false;
    if (window._daxiSheetOrderList && window._daxiSheetOrderList.length > 0) return true;
    return false;
}

function _daxiUpdateSheetSwitcher() {
    var show = _daxiSheetTabsShouldShow();
    var sw = document.getElementById('daxiSheetSwitcher');
    if (sw) sw.classList.toggle('has-orders', show);
    var swOrder = document.getElementById('daxiSwitchOrder');
    if (swOrder) {
        swOrder.hidden = !show;
        swOrder.setAttribute('aria-hidden', show ? 'false' : 'true');
        swOrder.style.display = show ? '' : 'none';
    }
}

function _daxiT(key, fallback) {
    var lang = (typeof window._daxiGetSavedLang === 'function' ? window._daxiGetSavedLang() : localStorage.getItem('daxi_lang')) || 'fr';
    var dict = (window._localTranslations && window._localTranslations[lang]) || {};
    return dict[key] || fallback || key;
}

function _daxiShortLabel(str, max) {
    max = max || 24;
    if (!str) return '';
    str = String(str).trim();
    if (str.length <= max) return str;
    return str.slice(0, Math.max(1, max - 1)) + '…';
}
function _daxiMyPositionLabel() {
    return _daxiT('my_position_placeholder', 'Ma position actuelle');
}
var _DAXI_STATUS_LABELS = {
    pending: 'En attente',
    price_proposed: 'Prix proposé',
    price_confirmed: 'Prix confirmé',
    driver_assigned: 'Chauffeur assigné',
    on_way: 'Chauffeur en route',
    arrived: 'Chauffeur arrivé',
    in_progress: 'Course en cours',
    completed: 'Terminée',
    cancelled: 'Annulée'
};
function _daxiStatusLabel(status) {
    var key = 'status_' + (status || '');
    return _daxiT(key, _DAXI_STATUS_LABELS[status] || status || '');
}
function _daxiEnrichOrderMeta(order) {
    if (!order) return order;
    order = Object.assign({}, order);
    if (!order.id && order.order_id) order.id = order.order_id;
    if (order.status) order.status_label = _daxiStatusLabel(order.status);
    return order;
}

function _daxiFormatScheduledAt(iso) {
    if (!iso) return '';
    try {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleString('fr-HT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
}

function _daxiPickupPromptKey(orderId, kind) {
    return 'daxi_pickup_prompt_ack_' + orderId + (kind ? ('_' + kind) : '');
}

function _daxiUpsertSheetOrderMeta(order) {
    if (!order || order.id == null) return;
    window._daxiSheetOrderList = window._daxiSheetOrderList || [];
    var id = String(order.id);
    var found = window._daxiSheetOrderList.find(function(o) { return String(o.id) === id; });
    if (found) {
        Object.keys(order).forEach(function(k) { if (order[k] != null) found[k] = order[k]; });
        return found;
    }
    var copy = Object.assign({}, order);
    copy.active = false;
    window._daxiSheetOrderList.push(copy);
    return copy;
}

function _daxiShouldShowPickupPrompt(orderId, kind) {
    if (!orderId) return false;
    if (window._daxiPickupModalOrderId && String(window._daxiPickupModalOrderId) === String(orderId)) return false;
    if (document.getElementById('daxi-pickup-modal-' + orderId)) return false;
    if (document.querySelector('.daxi-pickup-modal-wrap')) return false;
    var meta = (window._daxiSheetOrderList || []).find(function(o) { return String(o.id) === String(orderId); });
    if (meta && meta.meeting_prompt_acknowledged) return false;
    try {
        if (localStorage.getItem(_daxiPickupPromptKey(orderId)) === '1') return false;
        if (localStorage.getItem(_daxiPickupPromptKey(orderId, 'later')) === '1') return false;
        if (localStorage.getItem(_daxiPickupPromptKey(orderId, 'relocate')) === '1') return false;
    } catch (e) {}
    return true;
}

function _daxiMarkPickupPromptShown(orderId) {
    window._daxiPickupModalOrderId = String(orderId);
}

function _daxiMarkPickupPromptDone(orderId) {
    try {
        localStorage.setItem(_daxiPickupPromptKey(orderId), '1');
        localStorage.setItem(_daxiPickupPromptKey(orderId, 'later'), '1');
        localStorage.setItem(_daxiPickupPromptKey(orderId, 'relocate'), '1');
    } catch (e) {}
    window._daxiPickupModalOrderId = null;
    var meta = (window._daxiSheetOrderList || []).find(function(o) { return String(o.id) === String(orderId); });
    if (meta) meta.meeting_prompt_acknowledged = true;
}

function _daxiCheckPendingPickupPrompts(orders) {
    if (!orders || !orders.length) return;
    for (var i = 0; i < orders.length; i++) {
        var o = orders[i];
        if (o.meeting_prompt_acknowledged) continue;
        if (o.pickup_confirm_sent && o.is_later && _daxiShouldShowPickupPrompt(o.id, 'later')) {
            _daxiShowPickupModal(o.id, {
                isLaterConfirm: true,
                order: _daxiEnrichOrderMeta(o)
            });
            return;
        }
    }
}

function _daxiOrderMetaFromOpts(orderId, opts) {
    opts = opts || {};
    if (opts.order) return opts.order;
    var found = (window._daxiSheetOrderList || []).find(function(o) { return String(o.id) === String(orderId); });
    if (found) return found;
    return { id: orderId };
}

function _daxiRenderOrderEmptyState() {
    var slot = document.getElementById('daxi-sheet-order-slot');
    if (!slot) return;
    if (slot.querySelector('[id^="co-"], #pending-coords-card, #guest-phone-card, #price-proposal-card, #payment-selection-wrap')) return;
    window._daxiSheetView = 'empty';
    slot.innerHTML = '<div class="daxi-order-list-wrap daxi-order-list-empty">'
        + '<div class="daxi-order-list-title">' + _daxiT('sheet_orders_empty_title', 'Aucune course en cours') + '</div>'
        + '<div class="daxi-order-list-sub">' + _daxiT('sheet_orders_empty_sub', 'Vos courses actives apparaîtront ici. Vous pouvez en commander une nouvelle à tout moment.') + '</div>'
        + '</div>';
    _daxiRenderOrderPills();
    _syncSheetHeightVar();
}
window._daxiRenderOrderEmptyState = _daxiRenderOrderEmptyState;

function _daxiMaybeBackgroundRefreshOrders() {
    if (window._daxiOrdersMetaRefreshInFlight) return;
    if (typeof _loadDaxiSheetOrders !== 'function') return;
    window._daxiOrdersMetaRefreshInFlight = _loadDaxiSheetOrders({
        metaOnly: true,
        keepOpen: true,
        keepSlot: true
    }).catch(function() {}).finally(function() {
        window._daxiOrdersMetaRefreshInFlight = null;
    });
}
window._daxiMaybeBackgroundRefreshOrders = _daxiMaybeBackgroundRefreshOrders;

function _daxiFormatOrderRef(o) {
    var code = '';
    if (o && typeof o === 'object') {
        code = (o.ref_tail || o.public_code || o.code || '').toString();
    } else if (o != null) {
        code = String(o);
    }
    if (code) {
        var raw = code.replace(/^DX-/i, '');
        if (raw.length > 4) return raw.slice(-4).toUpperCase();
        return raw.toUpperCase();
    }
    return '';
}
window._daxiFormatOrderRef = _daxiFormatOrderRef;

function _daxiSyncPlaceCoordsToHidden(inputEl, latH, lngH) {
    if (!inputEl || !latH || !lngH) return;
    var sel = inputEl.dataset.placeSelected || '';
    if (sel === '1' || sel === 'pending') {
        if (inputEl.dataset.lat && inputEl.dataset.lng) {
            latH.value = inputEl.dataset.lat;
            lngH.value = inputEl.dataset.lng;
        }
        return;
    }
    latH.value = '';
    lngH.value = '';
}

function _daxiBookingHasPendingPlaceCoords() {
    var pickup = document.getElementById('destinationAddress');
    var dest = document.getElementById('destinationAddressArrival');
    return (pickup && pickup.dataset.placeSelected === 'pending')
        || (dest && dest.dataset.placeSelected === 'pending');
}

function _daxiWaitForBookingPlaceCoords(maxMs) {
    maxMs = maxMs == null ? 15000 : maxMs;
    var t0 = Date.now();
    return new Promise(function(resolve) {
        function tick() {
            _syncBookingHiddenFields();
            if (!_daxiBookingHasPendingPlaceCoords()) {
                resolve(true);
                return;
            }
            if (Date.now() - t0 >= maxMs) {
                resolve(false);
                return;
            }
            setTimeout(tick, 250);
        }
        tick();
    });
}
window._daxiWaitForBookingPlaceCoords = _daxiWaitForBookingPlaceCoords;

function _daxiCaptureBookingPlacesForOrder(orderId) {
    if (!orderId) return;
    window._daxiPendingOrderPlaces = window._daxiPendingOrderPlaces || {};
    var pickupIn = document.getElementById('destinationAddress');
    var destIn = document.getElementById('destinationAddressArrival');
    function snap(el, kind) {
        if (!el) return null;
        return {
            kind: kind,
            label: (el.value || '').trim(),
            placeId: el.dataset.placeId || '',
            lat: el.dataset.lat || (kind === 'pickup' ? (document.getElementById('pickupLatHidden') || {}).value : (document.getElementById('destLatHidden') || {}).value) || '',
            lng: el.dataset.lng || (kind === 'pickup' ? (document.getElementById('pickupLngHidden') || {}).value : (document.getElementById('destLngHidden') || {}).value) || '',
            placeSelected: el.dataset.placeSelected || ''
        };
    }
    window._daxiPendingOrderPlaces[orderId] = {
        pickup: snap(pickupIn, 'pickup'),
        dest: snap(destIn, 'dest'),
        capturedAt: Date.now()
    };
}
window._daxiCaptureBookingPlacesForOrder = _daxiCaptureBookingPlacesForOrder;

function _daxiResolvePlaceSnapshot(snapshot) {
    if (!snapshot) return Promise.resolve(null);
    if (snapshot.lat && snapshot.lng) {
        return Promise.resolve({ lat: +snapshot.lat, lng: +snapshot.lng });
    }
    if (!snapshot.placeId) return Promise.resolve(null);
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function() { try { ctrl.abort(); } catch (e) {} }, 8000) : null;
    var waitFn = window._daxiWaitForOnline || function() { return Promise.resolve(true); };
    return waitFn(4000).then(function() {
        return fetch('/api/places/details/?place_id=' + encodeURIComponent(snapshot.placeId), {
            credentials: 'include',
            signal: ctrl ? ctrl.signal : undefined
        });
    }).then(function(res) {
        if (timer) clearTimeout(timer);
        if (!res.ok) return null;
        return res.json();
    }).then(function(json) {
        if (json && json.lat != null && json.lng != null) {
            return { lat: +json.lat, lng: +json.lng };
        }
        return null;
    }).catch(function() {
        if (timer) clearTimeout(timer);
        return null;
    });
}

function _daxiStopOrderCoordsBackfill(orderId) {
    var timers = window._daxiCoordsBackfillTimers || {};
    if (timers[orderId]) {
        clearTimeout(timers[orderId]);
        delete timers[orderId];
    }
}
window._daxiStopOrderCoordsBackfill = _daxiStopOrderCoordsBackfill;

function _daxiStartOrderCoordsBackfill(orderId) {
    if (!orderId) return;
    _daxiStopOrderCoordsBackfill(orderId);
    window._daxiCoordsBackfillTimers = window._daxiCoordsBackfillTimers || {};
    var attempt = 0;

    function schedule(nextMs) {
        window._daxiCoordsBackfillTimers[orderId] = setTimeout(tick, nextMs);
    }

    function tick() {
        attempt += 1;
        var store = (window._daxiPendingOrderPlaces || {})[orderId];
        if (!store) {
            _daxiCaptureBookingPlacesForOrder(orderId);
            store = (window._daxiPendingOrderPlaces || {})[orderId];
        }
        if (!store) {
            schedule(Math.min(8000, 3000 + attempt * 500));
            return;
        }
        Promise.all([
            _daxiResolvePlaceSnapshot(store.pickup),
            _daxiResolvePlaceSnapshot(store.dest)
        ]).then(function(parts) {
            var pickup = parts[0];
            var dest = parts[1];
            if (!pickup && !dest) {
                schedule(Math.min(12000, 3500 + attempt * 600));
                return;
            }
            var body = new URLSearchParams();
            var gid = window._daxiGuestId || localStorage.getItem('daxi_guest_id') || '';
            if (gid) body.set('guest_id', gid);
            if (pickup) {
                body.set('pickup_lat', String(pickup.lat));
                body.set('pickup_lng', String(pickup.lng));
            }
            if (dest) {
                body.set('destination_lat', String(dest.lat));
                body.set('destination_lng', String(dest.lng));
            }
            var csrf = typeof getCsrfToken === 'function' ? getCsrfToken() : '';
            if (csrf) body.set('csrfmiddlewaretoken', csrf);
            return fetch('/htmx/client/orders/' + orderId + '/coords/', {
                method: 'POST',
                credentials: 'include',
                headers: csrf ? { 'X-CSRFToken': csrf } : {},
                body: body
            }).then(function(r) { return r.json(); }).then(function(json) {
                if (!json || !json.ok) {
                    schedule(Math.min(12000, 3500 + attempt * 600));
                    return;
                }
                if (json.complete && (json.status === 'price_proposed' || (json.price && json.price > 0))) {
                    _daxiStopOrderCoordsBackfill(orderId);
                    if (window._daxiRefreshOrderSheet) {
                        window._daxiRefreshOrderSheet(orderId, { forceDom: true, checkoutTransition: true });
                    }
                    if (window._loadDaxiSheetOrders) {
                        window._loadDaxiSheetOrders({ keepOpen: true, metaOnly: true });
                    }
                    return;
                }
                if (json.complete) {
                    _daxiStopOrderCoordsBackfill(orderId);
                    return;
                }
                schedule(Math.min(10000, 3000 + attempt * 500));
            }).catch(function() {
                schedule(Math.min(12000, 3500 + attempt * 600));
            });
        });
    }

    schedule(1200);
}
window._daxiStartOrderCoordsBackfill = _daxiStartOrderCoordsBackfill;

function _daxiRenderOrderListView() {
    var slot = document.getElementById('daxi-sheet-order-slot');
    if (!slot) return;
    var orders = window._daxiSheetOrderList || [];
    if (!orders.length) {
        _daxiRenderOrderEmptyState();
        return;
    }
    window._daxiSheetView = 'list';
    var html = '<div class="daxi-order-list-wrap">'
        + '<div class="daxi-order-list-title">' + _daxiT('sheet_orders_title', 'Vos courses en cours') + '</div>'
        + '<div class="daxi-order-list-sub">' + _daxiT('sheet_orders_sub', 'Sélectionnez une course pour voir le suivi, la carte et les détails.') + '</div>';
    orders.forEach(function(o) {
        var sched = o.scheduled_at ? _daxiFormatScheduledAt(o.scheduled_at) : '';
        var price = o.price != null ? ('<span class="daxi-order-list-price">' + _daxiFormatUsd(o.price, 2) + '</span>') : '';
        var refTail = _daxiFormatOrderRef(o) || String(o.id || '').slice(-4);
        var orderLabel = refTail
            ? (_daxiT('order_number', 'Course ···{id}').replace(/\{id\}/g, refTail))
            : _daxiT('order_pill_ride', 'Course');
        var statusTxt = o.client_status_label || (o.status ? _daxiStatusLabel(o.status) : (o.status_label || ''));
        html += '<div class="daxi-order-list-card" data-order-list-id="' + o.id + '" role="button" tabindex="0">'
            + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px;">'
            + '<span class="daxi-order-list-id">' + orderLabel + '</span>'
            + price + '</div>'
            + '<div class="daxi-order-list-route">'
            + (o.pickup || _daxiT('label_depart_fallback', 'Départ')) + ' → ' + (o.destination || _daxiT('label_dest_fallback', 'Destination')) + '</div>'
            + '<div class="daxi-order-list-meta">' + statusTxt + (sched ? (' · ' + sched) : '') + '</div>'
            + '</div>';
    });
    html += '</div>';
    slot.innerHTML = html;
    slot.querySelectorAll('[data-order-list-id]').forEach(function(card) {
        var oid = card.getAttribute('data-order-list-id');
        card.onclick = function() { _daxiLoadSheetOrder(oid, { preferCache: true }); };
    });
    _daxiRenderOrderPills();
    _syncSheetHeightVar();
}
window._daxiRenderOrderListView = _daxiRenderOrderListView;

function _daxiShowOrderListView() {
    _daxiMarkSheetUserOpen();
    _daxiRenderOrderListView();
    if (window._daxiSetSheetMode) _daxiSetSheetMode('order', { expand: true });
    if (typeof tabSetActive === 'function') tabSetActive('tabbtn-book');
    _daxiSetSheetCollapsed(false);
}

function _daxiPrependOrderListBack(slot) {
    if (!slot || slot.querySelector('.daxi-order-list-back')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'daxi-order-list-back';
    btn.innerHTML = '<i class="ri-arrow-left-s-line" style="font-size:16px;"></i> ' + _daxiT('order_back_list', 'Retour à mes courses');
    btn.onclick = function(e) {
        e.preventDefault();
        window._daxiSheetView = 'list';
        _daxiShowOrderListView();
    };
    slot.insertBefore(btn, slot.firstChild);
}

function _daxiRenderOrderPills() {
    var wrap = document.getElementById('daxi-order-pills');
    if (!wrap) return;
    wrap.innerHTML = '';
    var show = window._daxiSheetView === 'detail' && window._daxiSheetOrderList && window._daxiSheetOrderList.length > 1;
    document.body.classList.toggle('daxi-sheet-view-detail', window._daxiSheetView === 'detail');
    wrap.classList.toggle('has-items', !!show);
    wrap.setAttribute('aria-hidden', show ? 'false' : 'true');
    if (!show) return;
    window._daxiSheetOrderList.forEach(function(o) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'daxi-order-pill' + (o.active ? ' active' : '');
        var badge = document.createElement('span');
        badge.className = 'daxi-order-pill__badge';
        badge.textContent = '#' + o.id;
        var route = document.createElement('span');
        route.className = 'daxi-order-pill__route';
        route.textContent = _daxiShortLabel(o.destination || o.label || _daxiT('order_pill_ride', 'Course'), 30);
        btn.appendChild(badge);
        btn.appendChild(route);
        btn.onclick = function() { _daxiLoadSheetOrder(o.id, { preferCache: true }); };
        wrap.appendChild(btn);
        if (o.active) {
            requestAnimationFrame(function() {
                try { btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); } catch (e) {}
            });
        }
    });
    _syncSheetHeightVar();
}

function _daxiProcessSheetSlot(root) {
    root = root || document.getElementById('daxi-sheet-order-slot');
    if (!root) return;
    if (window.htmx && typeof htmx.process === 'function') {
        try { htmx.process(root); } catch (e) {}
    }
    if (window.DaxiActionButtons && DaxiActionButtons.decorate) DaxiActionButtons.decorate(root);
    if (window.DaxiOrderCardMap) {
        try {
            if (typeof DaxiOrderCardMap.refreshAllInRoot === 'function') {
                DaxiOrderCardMap.refreshAllInRoot(root, true);
            } else if (typeof DaxiOrderCardMap.init === 'function') {
                DaxiOrderCardMap.init(root);
            }
        } catch (e) {}
    }
    if (typeof _daxiInitPaymentCheckoutInRoot === 'function') _daxiInitPaymentCheckoutInRoot(root);
}
window._daxiProcessSheetSlot = _daxiProcessSheetSlot;

(function _daxiInstallPaymentCheckoutDelegation() {
    if (window._daxiPayCheckoutBound) return;
    window._daxiPayCheckoutBound = true;
    window._daxiPaySelected = window._daxiPaySelected || {};

    function _payWrap(el) {
        return el && el.closest('.daxi-pay-wrap[data-order-id]');
    }
    function _payOid(wrap) {
        return wrap ? (wrap.getAttribute('data-order-id') || '') : '';
    }
    function _paySyncContinue(wrap) {
        if (!wrap) return;
        var oid = _payOid(wrap);
        var selected = window._daxiPaySelected[oid] || '';
        var methodInput = document.getElementById('daxiPayMethod-' + oid);
        var contractCheck = document.getElementById('daxiPayContractCheck-' + oid);
        var contractVal = document.getElementById('daxiPayContractVal-' + oid);
        var continueBtn = document.getElementById('daxiPayContinue-' + oid);
        if (methodInput) methodInput.value = selected;
        var ok = selected && contractCheck && contractCheck.checked;
        if (continueBtn) continueBtn.disabled = !ok;
        if (contractVal) contractVal.value = (contractCheck && contractCheck.checked) ? '1' : '0';
    }
    window._daxiClosePaymentContract = function(oid) {
        var overlay = document.getElementById('daxiContractOverlay-' + oid);
        if (overlay) overlay.classList.remove('open');
        if (!document.querySelector('.daxi-contract-overlay.open')) {
            document.body.classList.remove('daxi-contract-open');
        }
    };
    window._daxiInitPaymentCheckoutInRoot = function(root) {
        root = root || document;
        if (document.body.classList.contains('daxi-contract-open') && !document.querySelector('.daxi-contract-overlay.open')) {
            document.body.classList.remove('daxi-contract-open');
        }
        root.querySelectorAll('.daxi-pay-icon--moncash, .daxi-pay-opt--moncash .daxi-pay-icon').forEach(function(box) {
            box.style.background = '#ffffff';
            box.style.width = '52px';
            box.style.height = '52px';
            box.style.padding = '2px';
            box.style.boxSizing = 'border-box';
            box.style.overflow = 'hidden';
            box.style.border = '1px solid #e2e8f0';
            var img = box.querySelector('img');
            if (img) {
                img.src = '/static/payments/moncash-badge.png?v=20260827d';
                img.style.cssText = 'width:100%;height:100%;object-fit:contain;object-position:center;background:#fff;display:block;';
                img.alt = 'MonCash';
            }
        });
        root.querySelectorAll('.daxi-pay-wrap[data-order-id]').forEach(function(wrap) {
            _paySyncContinue(wrap);
        });
    };

    document.addEventListener('click', function(e) {
        var opt = e.target.closest('.daxi-pay-opt[data-method]');
        if (opt) {
            var wrap = _payWrap(opt);
            if (!wrap) return;
            e.preventDefault();
            var oid = _payOid(wrap);
            window._daxiPaySelected[oid] = opt.getAttribute('data-method') || '';
            wrap.querySelectorAll('.daxi-pay-opt').forEach(function(b) { b.classList.remove('selected'); });
            opt.classList.add('selected');
            _paySyncContinue(wrap);
            return;
        }
        var openBtn = e.target.closest('[id^="daxiPayContractOpen-"]');
        if (openBtn) {
            e.preventDefault();
            e.stopPropagation();
            var openOid = openBtn.id.replace('daxiPayContractOpen-', '');
            var overlay = document.getElementById('daxiContractOverlay-' + openOid);
            if (overlay) {
                overlay.classList.add('open');
                document.body.classList.add('daxi-contract-open');
                if (overlay.parentNode !== document.body) document.body.appendChild(overlay);
            }
            return;
        }
        var closeBtn = e.target.closest('[id^="daxiContractClose-"], [id^="daxiContractCloseIcon-"]');
        if (closeBtn) {
            e.preventDefault();
            e.stopPropagation();
            var closeOid = closeBtn.id.replace('daxiContractClose-', '').replace('daxiContractCloseIcon-', '');
            window._daxiClosePaymentContract(closeOid);
            return;
        }
        var openOverlay = e.target.closest('.daxi-contract-overlay.open');
        if (openOverlay && e.target === openOverlay) {
            var ovOid = (openOverlay.id || '').replace('daxiContractOverlay-', '');
            window._daxiClosePaymentContract(ovOid);
            return;
        }
        var continueBtn = e.target.closest('[id^="daxiPayContinue-"]');
        if (!continueBtn || continueBtn.disabled) return;
        var contOid = continueBtn.id.replace('daxiPayContinue-', '');
        var selected = window._daxiPaySelected[contOid] || '';
        if (!selected) return;
        var form = document.getElementById('daxiPayForm-' + contOid);
        if (!form) return;
        e.preventDefault();
        if (selected === 'card') {
            var guestIn = form.querySelector('input[name="guest_id"]');
            var guestId = guestIn ? guestIn.value : '';
            var url = '/payment/' + contOid + '/card/?' + (guestId ? 'guest_id=' + encodeURIComponent(guestId) + '&' : '') + 'contract_accepted=1';
            var csrf = (typeof getCsrfToken === 'function' ? getCsrfToken() : '') || '';
            var ackBody = 'contract_accepted=1' + (guestId ? '&guest_id=' + encodeURIComponent(guestId) : '');
            fetch('/htmx/client/orders/' + contOid + '/payment/contract-ack/', {
                method: 'POST',
                headers: { 'X-CSRFToken': csrf, 'Content-Type': 'application/x-www-form-urlencoded' },
                body: ackBody
            }).finally(function() {
                if (window._daxiOpenCardPayment) window._daxiOpenCardPayment(url, contOid);
                else window.location.href = url;
            });
            return;
        }
        if (window.htmx) {
            continueBtn.disabled = true;
            htmx.trigger(form, 'submit');
        }
    });

    document.addEventListener('change', function(e) {
        if (!e.target || !e.target.id || e.target.id.indexOf('daxiPayContractCheck-') !== 0) return;
        var oid = e.target.id.replace('daxiPayContractCheck-', '');
        var wrap = document.querySelector('.daxi-pay-wrap[data-order-id="' + oid + '"]');
        if (wrap) _paySyncContinue(wrap);
    });

    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return;
        var openOv = document.querySelector('.daxi-contract-overlay.open');
        if (!openOv) return;
        var oid = (openOv.id || '').replace('daxiContractOverlay-', '');
        window._daxiClosePaymentContract(oid);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { window._daxiInitPaymentCheckoutInRoot(document); });
    } else {
        window._daxiInitPaymentCheckoutInRoot(document);
    }
})();

function _daxiPatchSheetHtml(html) {
    if (!html || typeof html !== 'string') return html;
    if (html.indexOf('data-daxi-cancel-order') >= 0) return html;
    if (html.indexOf('/cancel/') < 0) return html;
    return html.replace(
        /<button([^>]*)\shx-post="\/htmx\/client\/orders\/(\d+)\/cancel\/"([^>]*)>([\s\S]*?)<\/button>/gi,
        function(full, a, oid, b, inner) {
            return '<button type="button" class="daxi-oc-btn daxi-oc-btn--cancel" data-daxi-cancel-order="' + oid + '">' + inner + '</button>';
        }
    );
}

window._daxiConfirmCancel = function(message, onOk) {
    var msg = message || 'Annuler cette course ?';
    if (window.DaxiModal && DaxiModal.confirm) {
        DaxiModal.confirm(msg, { type: 'warn', okLabel: 'Oui, annuler', danger: true }).then(function(ok) {
            if (ok && onOk) onOk();
        });
        return false;
    }
    var preferModal = ('ontouchstart' in window)
        || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    if (!preferModal) {
        try {
            if (window.confirm(msg)) {
                if (onOk) onOk();
                return true;
            }
            return false;
        } catch (e) {}
    }
    var overlay = document.getElementById('daxi-cancel-confirm-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'daxi-cancel-confirm-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:20px;';
        overlay.innerHTML = '<div style="background:#0f172a;border:1px solid rgba(239,68,68,.35);border-radius:14px;padding:20px;max-width:340px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.45);">'
            + '<div id="daxi-cancel-confirm-msg" style="color:#f8fafc;font-size:15px;font-weight:700;margin-bottom:16px;">Annuler cette course ?</div>'
            + '<div style="display:flex;gap:10px;">'
            + '<button type="button" id="daxi-cancel-confirm-no" style="flex:1;padding:12px;border:none;border-radius:10px;background:#334155;color:#e2e8f0;font-weight:700;">Non</button>'
            + '<button type="button" id="daxi-cancel-confirm-yes" style="flex:1;padding:12px;border:none;border-radius:10px;background:#ef4444;color:#fff;font-weight:700;">Oui, annuler</button>'
            + '</div></div>';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', function(ev) {
            if (ev.target === overlay) overlay.style.display = 'none';
        });
    }
    var msgEl = document.getElementById('daxi-cancel-confirm-msg');
    if (msgEl) msgEl.textContent = message || 'Annuler cette course ?';
    overlay.style.display = 'flex';
    var yesBtn = document.getElementById('daxi-cancel-confirm-yes');
    var noBtn = document.getElementById('daxi-cancel-confirm-no');
    function close() { overlay.style.display = 'none'; }
    if (noBtn) noBtn.onclick = close;
    if (yesBtn) {
        yesBtn.onclick = function() {
            close();
            if (onOk) onOk();
        };
    }
    return false;
};

window._daxiClientCancelOrder = function(orderId, btn, guestId) {
    if (!orderId) return false;
    guestId = guestId || _daxiGuestIdForRequest();
    var run = function() {
        var fd = new FormData();
        fd.append('sheet_mode', '1');
        if (guestId) fd.append('guest_id', guestId);
        return _daxiClientFetch('/htmx/client/orders/' + orderId + '/cancel/', { body: fd })
          .then(function(r) { return r.text().then(function(t) { return { ok: r.ok, text: t }; }); })
          .then(function(res) {
            if (!res.ok) {
                var msg = (res.text && res.text.indexOf('daxi-htmx-error') >= 0)
                    ? res.text.replace(/<[^>]+>/g, ' ').trim()
                    : 'Impossible d\'annuler la course.';
                throw new Error(msg || 'cancel failed');
            }
            if (window._daxiOnOrderCancelled) window._daxiOnOrderCancelled(orderId);
          })
          .catch(function(err) {
            var msg = (err && err.message) ? err.message : 'Impossible d\'annuler la course.';
            if (window.showDaxiNotification) showDaxiNotification('Erreur', msg, { type: 'error' });
            else alert(msg);
          });
    };
    var start = function() {
        if (window.DaxiActionButtons && btn) DaxiActionButtons.runWithBtn(btn, run);
        else run();
    };
    window._daxiConfirmCancel('Annuler cette course ?', start);
    return false;
};

if (!window._daxiCancelClickBound) {
    window._daxiCancelClickBound = true;
    window._daxiCancelLastTap = 0;
    function _daxiHandleCancelTap(e) {
        if (e.type === 'click' && (Date.now() - window._daxiCancelLastTap) < 500) return;
        var btn = e.target.closest('[data-daxi-cancel-order], .daxi-oc-btn--cancel');
        if (!btn || btn.disabled || btn.classList.contains('daxi-btn-busy')) return;
        var oid = btn.getAttribute('data-daxi-cancel-order');
        if (!oid) {
            var card = btn.closest('[id^="co-"]');
            if (card && card.id) oid = card.id.replace(/^co-/, '');
        }
        if (!oid) return;
        window._daxiCancelLastTap = Date.now();
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        var gid = btn.getAttribute('data-guest-id') || '';
        if (window._daxiClientCancelOrder) window._daxiClientCancelOrder(oid, btn, gid);
    }
    document.addEventListener('click', _daxiHandleCancelTap, true);
}

function _daxiAfterSheetOrderLoaded(orderId) {
    window._daxiSheetView = 'detail';
    _daxiRenderOrderPills();
    var slot = document.getElementById('daxi-sheet-order-slot');
    if (slot) _daxiPrependOrderListBack(slot);
    var mapEl = orderId ? document.getElementById('daximap-' + orderId) : null;
    var hasLiveMap = false;
    if (orderId && window._daxiMaps && window._daxiMaps[orderId] && window._daxiMaps[orderId].map && mapEl) {
        try {
            var liveDiv = window._daxiMaps[orderId].map.getDiv();
            hasLiveMap = liveDiv && liveDiv.isConnected && liveDiv === mapEl;
        } catch (e) { hasLiveMap = false; }
    }
    if (mapEl && hasLiveMap && mapEl.dataset.mapReady) {
        if (slot) _daxiProcessSheetSlot(slot);
    } else {
        _daxiPrepareMapSlot(orderId);
        if (slot) _daxiProcessSheetSlot(slot);
        if (window._daxiInitSheetOrderMap) _daxiInitSheetOrderMap(orderId);
    }
    if (window._daxiSetSheetMode) _daxiSetSheetMode('order', { expand: true });
    if (window._syncSheetHeightVar) _syncSheetHeightVar();
    var sheet = document.getElementById('appSheet');
    if (sheet) {
        sheet.classList.remove('daxi-sheet-hidden');
        var inner = sheet.querySelector('.sheet-inner');
        if (inner) inner.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (window._daxiSetSheetCollapsed) _daxiSetSheetCollapsed(false);
}
window._daxiAfterSheetOrderLoaded = _daxiAfterSheetOrderLoaded;

function _daxiSheetCacheStorageKey(orderId) {
    return 'daxi_sheet_html_v5_' + orderId;
}
function _daxiHydrateSheetCacheFromStorage(orderId) {
    if (!orderId || window._daxiSheetOrderHtmlCache[orderId]) return;
    try {
        var html = localStorage.getItem(_daxiSheetCacheStorageKey(orderId));
        if (html && html.length > 40) window._daxiSheetOrderHtmlCache[orderId] = _daxiPatchSheetHtml(html);
    } catch (e) {}
}
function _daxiSanitizeSheetHtmlForCache(html) {
    if (!html || typeof html !== 'string') return html;
    return html
        .replace(/\s*data-map-ready="[^"]*"/gi, '')
        .replace(/\s*data-daxi-card-map-ready="[^"]*"/gi, '')
        .replace(/\s*data-daxi-driver-obs="[^"]*"/gi, '');
}

function _daxiPersistSheetCacheToStorage(orderId, html) {
    if (!orderId || !html) return;
    try { localStorage.setItem(_daxiSheetCacheStorageKey(orderId), _daxiSanitizeSheetHtmlForCache(html)); } catch (e) {}
}

function _daxiInvalidateSheetCache(orderId) {
    if (!orderId) return;
    delete window._daxiSheetOrderHtmlCache[orderId];
    try { localStorage.removeItem(_daxiSheetCacheStorageKey(orderId)); } catch (e) {}
}

function _daxiRefreshOrderSheet(orderId, opts) {
    opts = opts || {};
    if (!orderId) return Promise.resolve();
    if (opts.cacheOnly) {
        _daxiInvalidateSheetCache(orderId);
        return _daxiPrefetchOrderSheets([orderId]);
    }
    var slot = document.getElementById('daxi-sheet-order-slot');
    var active = (window._daxiSheetOrderList || []).find(function(o) { return o.active; });
    var isActiveDetail = window._daxiSheetView === 'detail' && active && String(active.id) === String(orderId);
    if (opts.silent && !opts.forceDom) {
        _daxiInvalidateSheetCache(orderId);
        return new Promise(function(resolve) {
            _daxiFetchSheetOrderHtml(orderId, {
                silent: true,
                cacheOnly: true,
                onOk: function(html) { resolve(html); },
                onFail: function() { resolve(null); }
            });
        });
    }
    if (!isActiveDetail && !opts.force) {
        return _daxiPrefetchOrderSheets([orderId]);
    }
    if (opts.forceDom && !opts.checkoutTransition) {
        opts.silent = false;
    }
    if (slot && !opts.silent) {
        if (typeof _daxiSheetSlotHasCheckoutFlow === 'function'
            && _daxiSheetSlotHasCheckoutFlow()
            && !opts.checkoutTransition) {
            opts.silent = true;
        } else {
            slot.innerHTML = '<div style="text-align:center;padding:28px;color:#94a3b8;"><i class="ri-loader-4-line" style="font-size:26px;animation:spin 1s linear infinite;"></i><p style="margin-top:10px;font-size:12px;">Mise à jour…</p></div>';
        }
    }
    return new Promise(function(resolve) {
        _daxiFetchSheetOrderHtml(orderId, {
            silent: false,
            onOk: function(html) {
                if (slot && html) {
                    slot.innerHTML = html;
                    _daxiProcessSheetSlot(slot);
                    _daxiAfterSheetOrderLoaded(orderId);
                }
                resolve(html);
            },
            onFail: function() { resolve(null); }
        });
    });
}
window._daxiRefreshOrderSheet = _daxiRefreshOrderSheet;

function _daxiPrefetchOrderSheets(orderIds) {
    if (!orderIds || !orderIds.length) return Promise.resolve();
    if (_daxiSheetSlotHasCheckoutFlow()) return Promise.resolve();
    var qs = _daxiGuestQs();
    var jobs = orderIds.map(function(id) {
        if (!id) return Promise.resolve();
        _daxiHydrateSheetCacheFromStorage(id);
        if (window._daxiSheetOrderHtmlCache[id]) return Promise.resolve();
        return fetch('/htmx/client/orders/' + id + '/sheet/' + qs, { credentials: 'include' })
            .then(function(r) { return r.ok ? r.text() : ''; })
            .then(function(html) {
                if (html && html.trim().length > 40) {
                    window._daxiSheetOrderHtmlCache[id] = html;
                    _daxiPersistSheetCacheToStorage(id, html);
                    if (window.DaxiOrderCardMap && typeof DaxiOrderCardMap.prefetchFromHtml === 'function') {
                        try { DaxiOrderCardMap.prefetchFromHtml(html, id); } catch (e) {}
                    }
                }
            })
            .catch(function() {});
    });
    return Promise.all(jobs);
}

function _daxiLoadSheetOrder(orderId, opts) {
    opts = opts || {};
    if (!orderId) return;
    _daxiMarkSheetUserOpen();
    _daxiPrepareSheetVisible();
    _daxiHydrateSheetCacheFromStorage(orderId);
    window._daxiSheetView = 'detail';
    window._daxiMainMapFocusOrderId = String(orderId);
    if (window._daxiOnSheetOrderSwap) window._daxiOnSheetOrderSwap(orderId);
    window._daxiSheetOrderList = window._daxiSheetOrderList || [];
    window._daxiSheetOrderList.forEach(function(o) { o.active = (String(o.id) === String(orderId)); });
    _daxiRenderOrderPills();
    var slot = document.getElementById('daxi-sheet-order-slot');
    var cached = window._daxiSheetOrderHtmlCache[orderId];

    function applyHtml(html) {
        if (!slot || !html) return false;
        html = _daxiPatchSheetHtml(html);
        _daxiPrepareMapSlot(orderId);
        slot.innerHTML = html;
        window._daxiSheetOrderHtmlCache[orderId] = html;
        _daxiPersistSheetCacheToStorage(orderId, html);
        _daxiProcessSheetSlot(slot);
        return true;
    }

    function finish() {
        _daxiAfterSheetOrderLoaded(orderId);
    }

    function fail() {
        if (cached && applyHtml(cached)) {
            finish();
            return;
        }
        _daxiHydrateSheetCacheFromStorage(orderId);
        if (window._daxiSheetOrderHtmlCache[orderId] && applyHtml(window._daxiSheetOrderHtmlCache[orderId])) {
            finish();
            return;
        }
        if (slot) {
            slot.innerHTML = '<div style="padding:20px;text-align:center;color:#ef4444;font-size:13px;">Course non disponible hors ligne.</div>';
        }
    }

    if (opts.memoryOnly || opts.cacheOnly) {
        if (cached && applyHtml(cached)) { finish(); return; }
        _daxiHydrateSheetCacheFromStorage(orderId);
        if (window._daxiSheetOrderHtmlCache[orderId] && applyHtml(window._daxiSheetOrderHtmlCache[orderId])) {
            finish();
            return;
        }
        fail();
        return;
    }

    if (cached && opts.preferCache !== false) {
        applyHtml(cached);
        finish();
        if (!opts.silentRefresh && !opts.cacheOnly && !opts.memoryOnly) {
            _daxiFetchSheetOrderHtml(orderId, {
                silent: true,
                cacheOnly: true
            });
        }
        return;
    }

    if (!window.htmx) {
        if (cached && applyHtml(cached)) { finish(); return; }
        fail();
        return;
    }

    if (!cached) {
        if (slot) {
            slot.innerHTML = '<div style="text-align:center;padding:28px;color:#94a3b8;"><i class="ri-loader-4-line" style="font-size:26px;animation:spin 1s linear infinite;"></i><p style="margin-top:10px;font-size:12px;">Chargement de la course…</p></div>';
        }
    }
    _daxiFetchSheetOrderHtml(orderId, { onOk: finish, onFail: fail });
}

function _daxiIsSheetErrorHtml(html) {
    if (!html || typeof html !== 'string') return false;
    return html.indexOf('ri-error-warning-line') >= 0 ||
        html.indexOf('Non autorisé') >= 0 ||
        html.indexOf('Session expirée') >= 0 ||
        html.indexOf('Commande introuvable') >= 0;
}

function _daxiFetchSheetOrderHtml(orderId, opts) {
    opts = opts || {};
    var qs = _daxiGuestQs();
    var sep = qs ? '&' : '?';
    var url = '/htmx/client/orders/' + orderId + '/sheet/' + qs + sep + '_=' + Date.now();
    var slot = document.getElementById('daxi-sheet-order-slot');
    var done = false;

    function finish(html) {
        if (done) return;
        done = true;
        if (html && _daxiIsSheetErrorHtml(html)) {
            if (slot && !opts.silent) {
                slot.innerHTML = '<div style="padding:20px;text-align:center;color:#ef4444;font-size:13px;">' +
                    (html.indexOf('Non autorisé') >= 0 ? 'Accès refusé à cette course. Reconnectez-vous ou réessayez.' : 'Impossible de charger cette course.') +
                    '</div>';
            }
            if (opts.onFail) opts.onFail();
            return;
        }
        if (html) {
            html = _daxiPatchSheetHtml(html);
            window._daxiSheetOrderHtmlCache[orderId] = html;
            _daxiPersistSheetCacheToStorage(orderId, html);
            if (slot && !opts.silent) {
                slot.innerHTML = html;
                _daxiProcessSheetSlot(slot);
            } else if (slot && opts.silent && !opts.cacheOnly) {
                var viewing = window._daxiSheetView === 'detail' && (window._daxiSheetOrderList || []).some(function(o) {
                    return o.active && String(o.id) === String(orderId);
                });
                if (viewing) {
                    slot.innerHTML = html;
                    _daxiProcessSheetSlot(slot);
                }
            }
        }
        if (opts.onOk) opts.onOk(html);
    }

    function fail() {
        if (done) return;
        done = true;
        if (opts.onFail) opts.onFail();
    }

    if (window.htmx) {
        var onSwap = function(evt) {
            if (!evt.detail || !evt.detail.target || evt.detail.target.id !== 'daxi-sheet-order-slot') return;
            document.body.removeEventListener('htmx:afterSwap', onSwap);
            document.body.removeEventListener('htmx:responseError', onErr);
            finish(evt.detail.target.innerHTML);
        };
        var onErr = function(evt) {
            if (!evt.detail || !evt.detail.target || evt.detail.target.id !== 'daxi-sheet-order-slot') return;
            document.body.removeEventListener('htmx:afterSwap', onSwap);
            document.body.removeEventListener('htmx:responseError', onErr);
            fail();
        };
        document.body.addEventListener('htmx:afterSwap', onSwap);
        document.body.addEventListener('htmx:responseError', onErr);
        var req = htmx.ajax('GET', url, { target: '#daxi-sheet-order-slot', swap: 'innerHTML' });
        if (req && typeof req.then === 'function') {
            req.then(function() { finish(slot ? slot.innerHTML : ''); }).catch(fail);
        }
        setTimeout(function() {
            if (!done && slot && slot.querySelector('.ri-loader-4-line')) fail();
        }, 15000);
        return;
    }

    fetch(url, { credentials: 'include' })
        .then(function(r) { return r.ok ? r.text() : Promise.reject(); })
        .then(finish)
        .catch(fail);
}

function _daxiInitClientOrdersListMaps() {
    var root = document.getElementById('client-orders-htmx');
    if (!root) return;
    root.style.display = 'block';
    function boot() {
        if (!window.DaxiOrderCardMap) return;
        if (typeof DaxiOrderCardMap.refreshAllInRoot === 'function') {
            DaxiOrderCardMap.refreshAllInRoot(root, true);
        } else {
            if (typeof DaxiOrderCardMap.init === 'function') DaxiOrderCardMap.init(root);
            setTimeout(function() {
                if (typeof DaxiOrderCardMap.resizeVisible === 'function') DaxiOrderCardMap.resizeVisible(root);
            }, 400);
        }
    }
    if (window.google && window.google.maps && window.google.maps.Map) boot();
    else document.addEventListener('daxi-gmaps-ready', boot, { once: true });
    setTimeout(boot, 320);
}
window._daxiInitClientOrdersListMaps = _daxiInitClientOrdersListMaps;

function _daxiNotifyGoogleMapsReady() {
    try { document.dispatchEvent(new CustomEvent('daxi-gmaps-ready')); } catch (e) {}
    if (!window.DaxiOrderCardMap) return;
    ['daxi-sheet-order-slot', 'client-orders-htmx', 'orders-list'].forEach(function(id) {
        var root = document.getElementById(id);
        if (!root) return;
        if (typeof DaxiOrderCardMap.refreshAllInRoot === 'function') {
            try { DaxiOrderCardMap.refreshAllInRoot(root, true); } catch (e) {}
            return;
        }
        if (typeof DaxiOrderCardMap.init === 'function') {
            try { DaxiOrderCardMap.init(root); } catch (e) {}
        }
        setTimeout(function() {
            if (typeof DaxiOrderCardMap.resizeVisible === 'function') {
                try { DaxiOrderCardMap.resizeVisible(root); } catch (e) {}
            }
        }, 400);
    });
}
window._daxiNotifyGoogleMapsReady = _daxiNotifyGoogleMapsReady;

function _daxiInitSheetOrderMap(orderId) {
    var mapEl = orderId ? document.getElementById('daximap-' + orderId) : null;
    var inst = orderId && window._daxiMaps && window._daxiMaps[orderId];
    if (mapEl && inst && inst.map) {
        try {
            var liveDiv = inst.map.getDiv();
            if (liveDiv && liveDiv.isConnected && liveDiv === mapEl && mapEl.dataset.mapReady) return;
        } catch (e) {}
    }
    _daxiPrepareMapSlot(orderId);
    var slot = document.getElementById('daxi-sheet-order-slot');
    function bootCardMap() {
        if (window.DaxiOrderCardMap) {
            if (typeof DaxiOrderCardMap.init === 'function') DaxiOrderCardMap.init(slot);
            setTimeout(function() {
                if (typeof DaxiOrderCardMap.resizeVisible === 'function') DaxiOrderCardMap.resizeVisible(slot);
            }, 350);
        } else if (typeof initDaxiMaps3D === 'function') {
            initDaxiMaps3D(slot);
        }
        if (window._daxiScanLiveTracking) _daxiScanLiveTracking();
    }
    if (window.google && window.google.maps && window.google.maps.Map) {
        bootCardMap();
    } else {
        document.addEventListener('daxi-gmaps-ready', bootCardMap, { once: true });
        setTimeout(bootCardMap, 300);
    }
}

window._daxiTrackRide = function(orderId) {
    if (!orderId) return;
    if (typeof closeDaxiPage === 'function') closeDaxiPage();
    if (typeof tabGoBook === 'function') tabGoBook();
    if (window._daxiLoadSheetOrder) {
        window._daxiLoadSheetOrder(orderId, { preferCache: false });
    }
};

function _daxiSheetSlotHasCheckoutFlow() {
    var slot = document.getElementById('daxi-sheet-order-slot');
    if (!slot) return false;
    return !!slot.querySelector('#guest-phone-card, #pending-coords-card, #price-proposal-card, #payment-selection-wrap, .daxi-pay-wrap, [data-daxi-checkout-flow="1"]');
}

function _daxiOrderInCheckoutPhase(orderId) {
    var o = (window._daxiSheetOrderList || []).find(function(x) { return String(x.id) === String(orderId); });
    if (!o || !o.status) return false;
    return o.status === 'pending' || o.status === 'price_proposed' || o.status === 'price_confirmed';
}

function _daxiApplySheetOrdersMeta(data, opts) {
    opts = opts || {};
    if (!data || !data.orders || !data.orders.length) {
        if (_daxiSheetSlotHasCheckoutFlow()) {
            _daxiUpdateSheetSwitcher();
            return;
        }
        window._daxiSheetOrderList = [];
        _daxiRenderOrderPills();
        var slotEmpty = document.getElementById('daxi-sheet-order-slot');
        if (slotEmpty && !_daxiSheetSlotHasCheckoutFlow()) slotEmpty.innerHTML = '';
        _daxiSetSheetMode('form');
        _daxiUpdateSheetSwitcher();
        return;
    }
    var prevActive = (window._daxiSheetOrderList || []).find(function(o) { return o.active; });
    window._daxiSheetOrderList = data.orders.map(function(o) {
        o.active = prevActive ? String(o.id) === String(prevActive.id) : false;
        return o;
    });
    if (!prevActive) window._daxiSheetOrderList[0].active = true;
    _daxiPrefetchOrderSheets(data.orders.map(function(o) { return o.id; }));
    _daxiUpdateSheetSwitcher();
    _daxiRenderOrderPills();
    _daxiUpdateOrderMini();
    _syncSheetHeightVar();
    _daxiCheckPendingPickupPrompts(data.orders);
    _daxiRepanClientGpsForSheet();
    var activeId = (window._daxiSheetOrderList.find(function(o) { return o.active; }) || {}).id;
    if (activeId) {
        window._daxiMainMapFocusOrderId = String(activeId);
        var mapElMeta = document.getElementById('daximap-' + activeId);
        if (mapElMeta && window._daxiSyncMainMapOrderTracking) _daxiSyncMainMapOrderTracking(mapElMeta);
    }
    if (activeId && window._daxiUpdateMainMapForOrder) _daxiUpdateMainMapForOrder(activeId);
    data.orders.forEach(function(o) {
        if (window._daxiStartLiveTracking) setTimeout(function() { _daxiStartLiveTracking(o.id); }, 400);
    });
    _daxiPersistOrdersListMeta();
}

function _loadDaxiSheetOrders(opts) {
    opts = opts || {};
    var qs = _daxiGuestQs();
    var sep = qs ? '&' : '?';
    var checkout = _daxiSheetSlotHasCheckoutFlow();
    var slot = document.getElementById('daxi-sheet-order-slot');

    function afterMeta(data) {
        window._daxiOrdersMetaLive = true;
        if (!data || !data.orders || !data.orders.length) {
            if (checkout || opts.keepOpen || opts.keepSlot || _daxiSheetSlotHasCheckoutFlow()) {
                _daxiApplySheetOrdersMeta(data, { keepSlot: true });
                _daxiUpdateSheetSwitcher();
                return Promise.resolve();
            }
            window._daxiSheetOrderList = [];
            window._daxiOrdersEmptyConfirmed = true;
            if (typeof _daxiPersistOrdersListMeta === 'function') _daxiPersistOrdersListMeta();
            _daxiRenderOrderPills();
            if (slot && !_daxiSheetSlotHasCheckoutFlow()) slot.innerHTML = '';
            _daxiSetSheetMode('form');
            _daxiUpdateSheetSwitcher();
            return Promise.resolve();
        }

        window._daxiOrdersEmptyConfirmed = false;
        var preserve = !opts.forceReload && (_daxiSheetSlotHasCheckoutFlow() || checkout);
        var inDetail = window._daxiSheetView === 'detail' && slot && slot.querySelector('[id^="co-"], #price-proposal-card, #guest-phone-card, #pending-coords-card');
        var refreshOid = opts.refreshDetailOrderId || (opts.refreshActiveDetail && (window._daxiSheetOrderList || []).find(function(o) { return o.active; }) || {}).id;

        if (preserve || opts.keepOpen || opts.metaOnly) {
            _daxiApplySheetOrdersMeta(data, { keepSlot: true });
            if (opts.metaOnly && window._daxiSheetView === 'empty' && data.orders && data.orders.length && !_daxiSheetIsCollapsed()) {
                if (data.orders.length > 1) {
                    _daxiRenderOrderListView();
                } else {
                    var firstOrder = data.orders[0];
                    if (!firstOrder || !_daxiShowSheetOrderFromMemory(firstOrder.id)) {
                        _daxiRenderOrderListView();
                    }
                }
            }
            if (refreshOid && (inDetail || opts.refreshActiveDetail) && !opts.metaOnly) {
                if (_daxiSheetSlotHasCheckoutFlow()) {
                    return Promise.resolve();
                }
                return _daxiRefreshOrderSheet(refreshOid, { silent: !!opts.metaOnly });
            }
            if (opts.awaitPrefetch) {
                return _daxiPrefetchOrderSheets(data.orders.map(function(o) { return o.id; }));
            }
            return Promise.resolve();
        }

        if (inDetail && refreshOid) {
            _daxiApplySheetOrdersMeta(data, { keepSlot: true });
            return _daxiRefreshOrderSheet(refreshOid);
        }

        _daxiApplySheetOrdersMeta(data, { keepSlot: true });

        if (opts.initialBoot) {
            _daxiUpdateSheetSwitcher();
            _daxiUpdateOrderMini();
            if (opts.awaitPrefetch) {
                return _daxiPrefetchOrderSheets(data.orders.map(function(o) { return o.id; }));
            }
            return Promise.resolve();
        }

        var userWantsOrder = window._daxiSheetPreferredMode === 'order'
            || document.body.classList.contains('daxi-sheet-order-mode')
            || _daxiSheetSlotHasCheckoutFlow();
        if (!userWantsOrder) {
            _daxiUpdateSheetSwitcher();
            _daxiUpdateOrderMini();
            if (opts.awaitPrefetch) {
                return _daxiPrefetchOrderSheets(data.orders.map(function(o) { return o.id; }));
            }
            return Promise.resolve();
        }

        window._daxiSheetView = 'list';
        _daxiRenderOrderListView();
        var shouldExpand;
        if (opts.keepOpen || opts.openAfterLoad) {
            shouldExpand = true;
        } else         if (opts.initialBoot && !window._daxiSheetUserOpened) {
            shouldExpand = false;
        } else if (window._daxiSheetUserOpened || window._daxiSheetPreferredMode === 'order') {
            shouldExpand = true;
        } else {
            shouldExpand = !_daxiSheetIsCollapsed();
        }
        _daxiSetSheetMode('order', { expand: shouldExpand });
        if (!shouldExpand) _daxiSetSheetCollapsed(true);
        if (typeof tabSetActive === 'function') tabSetActive('tabbtn-book');
        if (opts.openAfterLoad) {
            _daxiSetSheetCollapsed(false);
            _daxiSetSheetMode('order', { expand: true });
        }
        if (opts.awaitPrefetch) {
            return _daxiPrefetchOrderSheets(data.orders.map(function(o) { return o.id; }));
        }
        return Promise.resolve();
    }

    function fetchSheet(attempt) {
        return fetch('/htmx/client/orders/sheet/' + qs + sep + '_=' + Date.now(), { credentials: 'include' })
            .then(function(r) {
                if (!r.ok) throw new Error('http_' + r.status);
                return r.json();
            })
            .catch(function(err) {
                if ((attempt || 0) < 2) {
                    return new Promise(function(resolve) { setTimeout(resolve, 800); })
                        .then(function() { return fetchSheet((attempt || 0) + 1); });
                }
                throw err;
            });
    }
    return fetchSheet(0)
        .then(afterMeta)
        .catch(function() {
            window._daxiOrdersMetaLive = true;
            if (typeof _daxiHydrateOrdersListMeta === 'function') _daxiHydrateOrdersListMeta();
            if (typeof _daxiBootstrapOrdersFromCache === 'function') _daxiBootstrapOrdersFromCache();
            if (window._daxiSheetOrderList && window._daxiSheetOrderList.length) {
                _daxiUpdateSheetSwitcher();
                _daxiUpdateOrderMini();
                if (document.body.classList.contains('daxi-sheet-order-mode') || window._daxiSheetPreferredMode === 'order' || opts.openAfterLoad || opts.keepOpen) {
                    _daxiSetSheetMode('order', { expand: true });
                    _daxiSetSheetCollapsed(false);
                    if (window._daxiSheetView === 'list' || (window._daxiSheetOrderList.length > 1 && window._daxiSheetView !== 'detail')) {
                        _daxiRenderOrderListView();
                    } else if (window._daxiSheetView !== 'detail') {
                        var cachedFirst = window._daxiSheetOrderList[0];
                        if (!cachedFirst || !_daxiShowSheetOrderFromMemory(cachedFirst.id)) _daxiRenderOrderListView();
                    }
                }
                return;
            }
            if (document.body.classList.contains('daxi-sheet-order-mode') || window._daxiSheetPreferredMode === 'order' || opts.keepOpen || opts.keepSlot) {
                if (!_daxiSheetIsCollapsed() && typeof _daxiRenderOrderEmptyState === 'function') {
                    _daxiRenderOrderEmptyState();
                }
                return;
            }
            if (!checkout && window._daxiSheetPreferredMode !== 'order' &&
                !document.body.classList.contains('daxi-sheet-order-mode') &&
                !opts.keepOpen && !opts.keepSlot) {
                _daxiSetSheetMode('form');
            }
        });
}
window._loadDaxiSheetOrders = _loadDaxiSheetOrders;

function _daxiBootLoadOrders(opts) {
    opts = opts || {};
    if (window._daxiOrdersBootPromise && !opts.force) return window._daxiOrdersBootPromise;
    window._daxiBootState = window._daxiBootState || {};
    window._daxiBootState.ordersReady = false;
    window._daxiOrdersBootComplete = false;
    window._daxiOrdersBootPromise = _loadDaxiSheetOrders({ awaitPrefetch: true, initialBoot: true }).finally(function() {
        window._daxiBootState.ordersReady = true;
        window._daxiOrdersBootComplete = true;
        if (window._daxiSheetOrderList && window._daxiSheetOrderList.length) {
            _daxiUpdateSheetSwitcher();
            _daxiUpdateOrderMini();
            _daxiRenderOrderPills();
        }
        if (window._daxiTryDismissInitialLoader) window._daxiTryDismissInitialLoader();
    });
    return window._daxiOrdersBootPromise;
}
window._daxiBootLoadOrders = _daxiBootLoadOrders;
_daxiBootLoadOrders();
document.addEventListener('daxi:guest-id-ready', function() {
    if (!(window._daxiSheetOrderList && window._daxiSheetOrderList.length)) {
        window._daxiOrdersBootPromise = null;
        window._daxiOrdersBootComplete = false;
        _daxiBootLoadOrders({ force: true });
    }
    if (typeof _daxiBootPreloadClientOrders === 'function') _daxiBootPreloadClientOrders();
    if (typeof _daxiPreloadClientPages === 'function') _daxiPreloadClientPages();
});
if (typeof _daxiBootPreloadClientOrders === 'function') _daxiBootPreloadClientOrders();

window._daxiOnPriceRefused = function(orderId) {
    window._daxiOnOrderCancelled(orderId);
};

window._daxiOnOrderCancelled = function(orderId, opts) {
    opts = opts || {};
    if (orderId && window._daxiDestroyOrderMaps) window._daxiDestroyOrderMaps(orderId);
    if (orderId && window._daxiTrackers && window._daxiTrackers[orderId]) {
        var t = window._daxiTrackers[orderId];
        if (t.pollTimer) clearInterval(t.pollTimer);
        if (t.ws) try { t.ws.close(); } catch (e) {}
        delete window._daxiTrackers[orderId];
    }
    var oid = orderId != null ? String(orderId) : '';
    if (oid) {
        var mapWrap = document.getElementById('daximap-wrap-' + oid);
        if (mapWrap) mapWrap.remove();
        var chatWrap = document.getElementById('client-chat-wrap-' + oid);
        if (chatWrap) chatWrap.remove();
        if (window._daxiOfflineData && window._daxiOfflineData.orders) {
            window._daxiOfflineData.orders = window._daxiOfflineData.orders.filter(function(o) {
                return String(o.id) !== oid;
            });
        }
    }
    var wasActiveDetail = false;
    window._daxiSheetOrderList = (window._daxiSheetOrderList || []).filter(function(o) {
        if (String(o.id) === String(orderId) && o.active) wasActiveDetail = true;
        return String(o.id) !== String(orderId);
    });
    var slot = document.getElementById('daxi-sheet-order-slot');
    var listCard = document.getElementById('co-' + orderId);
    if (listCard) listCard.remove();
    if (typeof _daxiSyncClientOrdersCacheFromDom === 'function') _daxiSyncClientOrdersCacheFromDom('active');
    if (wasActiveDetail && slot) slot.innerHTML = '';
    if (window._daxiSyncClientOrdersCount) window._daxiSyncClientOrdersCount();
    var pills = document.getElementById('daxi-order-pills');
    if (pills) { pills.innerHTML = ''; pills.classList.remove('has-items'); }
    var respEl = document.getElementById('booking-response');
    if (respEl) { respEl.innerHTML = ''; respEl.style.display = 'none'; }
    if (window._daxiSheetOrderList.length) {
        window._daxiSheetView = 'list';
        _daxiRenderOrderListView();
        _daxiSetSheetMode('order', { expand: false });
        if (wasActiveDetail) {
            var next = window._daxiSheetOrderList[0];
            if (next && next.id && window._daxiLoadSheetOrder) {
                window._daxiLoadSheetOrder(next.id, { preferCache: false });
            }
        }
    } else {
        window._daxiMainMapFocusOrderId = null;
        window._daxiSheetPreferredMode = 'form';
        if (typeof _daxiClearMainMapOrderTrack === 'function') _daxiClearMainMapOrderTrack();
        if (typeof _daxiClearBookingRouteHud === 'function') _daxiClearBookingRouteHud();
        if (slot) slot.innerHTML = '';
        if (window._daxiSetSheetMode) _daxiSetSheetMode('form');
        if (window._daxiUpdateSheetSwitcher) _daxiUpdateSheetSwitcher();
    }
    if (window._daxiSetSheetCollapsed) _daxiSetSheetCollapsed(false);
    if (!opts.silent && window.showDaxiNotification) {
        showDaxiNotification('Course annulée', 'La course a été retirée de votre espace.', { type: 'warning' });
    }
};

function _daxiSyncClientOrdersCount() {
    var container = document.getElementById('client-orders-container');
    if (!container) return;
    var cards = container.querySelectorAll('[id^="co-"]');
    var nowCount = 0;
    var laterCount = 0;
    cards.forEach(function(card) {
        if (card.getAttribute('data-timing') === 'later') laterCount++;
        else nowCount++;
    });
    container.querySelectorAll('.daxi-orders-section').forEach(function(section) {
        var countEl = section.querySelector('.daxi-orders-section-count');
        if (!countEl) return;
        var isLater = !!section.querySelector('.daxi-orders-section-badge--later');
        var n = isLater ? laterCount : nowCount;
        countEl.setAttribute('data-count', String(n));
        if (isLater) {
            countEl.textContent = n === 1 ? '1 planifiée' : (n + ' planifiées');
        } else {
            countEl.textContent = n === 1 ? '1 course' : (n + ' courses');
        }
        var mini = section.querySelector('.daxi-orders-empty-mini');
        var hasCards = isLater ? laterCount > 0 : nowCount > 0;
        if (mini) mini.style.display = hasCards ? 'none' : '';
    });
    var activeTotal = nowCount + laterCount;
    var countEl = document.getElementById('ordersCount');
    var countBadge = document.getElementById('ordersCountBadge');
    if (countEl) countEl.textContent = String(activeTotal);
    if (countBadge) countBadge.style.display = activeTotal ? 'inline-flex' : 'none';
    var globalEmpty = container.querySelector('.daxi-orders-empty');
    if (globalEmpty) globalEmpty.style.display = activeTotal ? 'none' : '';
}
window._daxiSyncClientOrdersCount = _daxiSyncClientOrdersCount;

window._daxiOnSheetOrderSwap = function(orderId) {
    if (!orderId) return;
    window._daxiSheetOrderList = window._daxiSheetOrderList || [];
    var exists = window._daxiSheetOrderList.some(function(o) { return String(o.id) === String(orderId); });
    if (!exists) {
        var checkoutLive = typeof _daxiSheetSlotHasCheckoutFlow === 'function' && _daxiSheetSlotHasCheckoutFlow();
        if (!checkoutLive) {
            _daxiUpdateSheetSwitcher();
            return;
        }
        window._daxiSheetOrderList.unshift({ id: parseInt(orderId, 10), label: 'Course #' + orderId, active: true });
    }
    window._daxiSheetOrderList.forEach(function(o) { o.active = String(o.id) === String(orderId); });
    _daxiRenderOrderPills();
    _daxiUpdateSheetSwitcher();
    if (window._daxiSheetView === 'detail') {
        _daxiSetSheetMode('order', { expand: true });
    }
};

function _initDaxiSheetUi() {
    if (window._daxiSheetUiReady) return;
    window._daxiSheetUiReady = true;
    window._daxiSheetPreferredMode = window._daxiSheetPreferredMode || 'form';

    _daxiWireSheetOpenTargets();

    var swForm = document.getElementById('daxiSwitchForm');
    var swOrder = document.getElementById('daxiSwitchOrder');
    if (swForm) swForm.onclick = null;
    if (swOrder) swOrder.onclick = null;

    var passHidden = document.getElementById('passengerCount');
    var passDisplay = document.getElementById('passengerDisplay');
    var passMinus = document.getElementById('passMinus');
    var passPlus = document.getElementById('passPlus');
    function _syncPass(n) {
        n = Math.max(1, Math.min(10, n));
        if (passHidden) passHidden.value = n;
        if (passDisplay) passDisplay.textContent = n;
        if (passMinus) passMinus.disabled = n <= 1;
        if (passPlus) passPlus.disabled = n >= 10;
    }
    if (passMinus) passMinus.onclick = function(e) { e.preventDefault(); _syncPass(parseInt(passHidden.value, 10) - 1); };
    if (passPlus) passPlus.onclick = function(e) { e.preventDefault(); _syncPass(parseInt(passHidden.value, 10) + 1); };
    _syncPass(parseInt(passHidden && passHidden.value, 10) || 1);

    _daxiBootLoadOrders();
    _daxiUpdateExpandFab();
    if (typeof _daxiBootPreloadClientOrders === 'function') _daxiBootPreloadClientOrders();
    if (typeof _daxiPreloadClientPages === 'function') _daxiPreloadClientPages();

    var waitSel = document.getElementById('roundTripWaitMin');
    if (waitSel) {
        waitSel.addEventListener('change', function() {
            _syncRoundTripWaitUi();
            _syncBookingHiddenFields();
        });
    }
    var allowCb = document.getElementById('roundTripAllowOther');
    if (allowCb) {
        allowCb.addEventListener('change', _syncBookingHiddenFields);
    }
    _syncRoundTripWaitUi();
    if (window._initDaxiSheetHandleDrag) _initDaxiSheetHandleDrag();

    (function _initBookingHelpModal() {
        var btn = document.getElementById('daxiBookingHelpBtn');
        var overlay = document.getElementById('daxiBookingHelpOverlay');
        if (!btn || !overlay || overlay.dataset.bound) return;
        overlay.dataset.bound = '1';
        var closeBtn = document.getElementById('daxiBookingHelpClose');
        var doneBtn = document.getElementById('daxiBookingHelpDone');
        function setOpen(open) {
            if (open) {
                overlay.classList.add('open');
                document.body.classList.add('daxi-booking-help-open');
                if (overlay.parentNode !== document.body) document.body.appendChild(overlay);
            } else {
                overlay.classList.remove('open');
                document.body.classList.remove('daxi-booking-help-open');
            }
        }
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof applyTranslations === 'function') {
                var lang = (typeof window._daxiGetSavedLang === 'function' ? window._daxiGetSavedLang() : localStorage.getItem('daxi_lang')) || 'fr';
                var dict = (window._localTranslations && window._localTranslations[lang]) || {};
                applyTranslations(dict);
            }
            setOpen(true);
        });
        if (closeBtn) closeBtn.addEventListener('click', function() { setOpen(false); });
        if (doneBtn) doneBtn.addEventListener('click', function() { setOpen(false); });
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) setOpen(false);
        });
    })();
}

document.body.addEventListener('htmx:beforeSwap', function(evt) {
    if (!evt.detail || !evt.detail.target) return;
    var tgt = evt.detail.target;
    if (!tgt.id) return;
    if (tgt.id === 'client-orders-htmx' || tgt.id === 'daxi-sheet-order-slot' ||
        tgt.id.indexOf('co-') === 0 || tgt.id === 'orders-list-container') {
        if (window.DaxiOrderCardMap && typeof DaxiOrderCardMap.destroyInRoot === 'function') {
            try { DaxiOrderCardMap.destroyInRoot(tgt); } catch (e) {}
        }
    }
});

document.body.addEventListener('htmx:afterSwap', function(evt) {
    if (!evt.detail || !evt.detail.target) return;
    var tgt = evt.detail.target;
    if (tgt.id && tgt.id.indexOf('co-') === 0) {
        var cancelDoneCo = tgt.querySelector('#daxi-cancel-done');
        if (cancelDoneCo) {
            var cid = cancelDoneCo.getAttribute('data-order-id');
            if (window._daxiOnOrderCancelled) window._daxiOnOrderCancelled(cid);
            return;
        }
    }
    if (tgt.id === 'daxi-sheet-order-slot') {
        _daxiProcessSheetSlot(tgt);
        var refuseDone = evt.detail.target.querySelector('#daxi-refuse-done');
        if (refuseDone) {
            var refusedId = refuseDone.getAttribute('data-order-id');
            if (window._daxiOnPriceRefused) window._daxiOnPriceRefused(refusedId);
            _syncSheetHeightVar();
            return;
        }
        var cancelDone = evt.detail.target.querySelector('#daxi-cancel-done');
        if (cancelDone) {
            var cancelledId = cancelDone.getAttribute('data-order-id');
            if (window._daxiOnOrderCancelled) window._daxiOnOrderCancelled(cancelledId);
            _syncSheetHeightVar();
            return;
        }
        var gidEl = evt.detail.target.querySelector('[id^="proposal-guest-id-"]');
        if (gidEl) {
            var gid = localStorage.getItem('daxi_guest_id') || '';
            if (gid) gidEl.value = gid;
        }
        var card = evt.detail.target.querySelector('[id^="co-"], #price-proposal-card');
        var oid = null;
        if (card) {
            if (card.id === 'price-proposal-card') oid = card.getAttribute('data-order-id');
            else oid = card.id.replace('co-', '');
        }
        if (oid) {
            if (evt.detail.elt && evt.detail.elt.id === 'orderTaxiBtn') {
                window._daxiSheetView = 'detail';
                if (typeof _daxiMaybeRefreshClientOrdersCache === 'function') {
                    _daxiMaybeRefreshClientOrdersCache('new-order');
                }
            }
            window._daxiOnSheetOrderSwap(oid);
            var cardHtml = _daxiPatchSheetHtml(evt.detail.target.innerHTML);
            window._daxiSheetOrderHtmlCache[oid] = cardHtml;
            if (typeof _daxiPersistSheetCacheToStorage === 'function') _daxiPersistSheetCacheToStorage(oid, cardHtml);
            window._daxiSheetPreferredMode = 'order';
            _daxiSetSheetMode('order', { expand: true });
            _daxiSetSheetCollapsed(false);
            _daxiUpdateSheetSwitcher();
        }
        var guestPhone = evt.detail.target.querySelector('#guest-phone-card');
        if (guestPhone) {
            window._daxiSheetView = 'detail';
            var form = guestPhone.querySelector('form[hx-post]');
            var m = form && form.getAttribute('hx-post') && form.getAttribute('hx-post').match(/orders\/(\d+)\//);
            if (m) {
                window._daxiOnSheetOrderSwap(m[1]);
                var phoneHtml = _daxiPatchSheetHtml(evt.detail.target.innerHTML);
                window._daxiSheetOrderHtmlCache[m[1]] = phoneHtml;
                if (typeof _daxiPersistSheetCacheToStorage === 'function') _daxiPersistSheetCacheToStorage(m[1], phoneHtml);
            }
            window._daxiSheetPreferredMode = 'order';
            _daxiSetSheetMode('order', { expand: true });
            _daxiSetSheetCollapsed(false);
            _daxiUpdateSheetSwitcher();
        }
        var pendingCoords = evt.detail.target.querySelector('#pending-coords-card');
        if (pendingCoords) {
            window._daxiSheetView = 'detail';
            window._daxiSheetPreferredMode = 'order';
            _daxiSetSheetMode('order', { expand: true });
            _daxiSetSheetCollapsed(false);
            _daxiUpdateSheetSwitcher();
            var pcOid = pendingCoords.getAttribute('data-order-id')
                || (evt.detail.target.querySelector('[data-order-id]') && evt.detail.target.querySelector('[data-order-id]').getAttribute('data-order-id'));
            if (pcOid) {
                window._daxiOnSheetOrderSwap(pcOid);
                var pcHtml = _daxiPatchSheetHtml(evt.detail.target.innerHTML);
                window._daxiSheetOrderHtmlCache[pcOid] = pcHtml;
                if (typeof _daxiPersistSheetCacheToStorage === 'function') _daxiPersistSheetCacheToStorage(pcOid, pcHtml);
            }
            if (typeof _daxiCaptureBookingPlacesForOrder === 'function') _daxiCaptureBookingPlacesForOrder(pcOid);
            if (typeof _daxiStartOrderCoordsBackfill === 'function' && pcOid) _daxiStartOrderCoordsBackfill(pcOid);
        }
        var respEl = document.getElementById('booking-response');
        if (respEl && (card || gidEl)) {
            respEl.innerHTML = '';
            respEl.style.display = 'none';
        }
        if (evt.detail.target.textContent.indexOf('Commande annulée') !== -1) {
            setTimeout(function() { _loadDaxiSheetOrders({ keepOpen: true, refreshActiveDetail: true }); }, 200);
        }
        if (window._daxiUpdateOrderMini) _daxiUpdateOrderMini();
        _syncSheetHeightVar();
        if (window.applyDaxiTranslations) window.applyDaxiTranslations();
        var mapEl = evt.detail.target.querySelector('[data-daximap="1"]');
        if (mapEl) {
            var oid = mapEl.id.replace('daximap-', '');
            _daxiInitSheetOrderMap(oid);
            if (window._daxiUpdateMainMapForOrder) _daxiUpdateMainMapForOrder(oid);
        }
        if (window._daxiApplyBookingMarkersLock) window._daxiApplyBookingMarkersLock();
    }
    if (evt.detail.target.id === 'client-orders-htmx') {
        if (window.applyDaxiTranslations) window.applyDaxiTranslations();
        if (window.DaxiOrderCardMap && typeof DaxiOrderCardMap.init === 'function') {
            try { DaxiOrderCardMap.init(evt.detail.target); } catch (e) {}
        }
        if (window.DaxiOrderCardMap && typeof DaxiOrderCardMap.resizeVisible === 'function') {
            setTimeout(function() {
                try { DaxiOrderCardMap.resizeVisible(evt.detail.target); } catch (e) {}
            }, 400);
        }
    }
});

function _reverseGeocodeToInput(lat, lng, inputId) {
    if (inputId === 'destinationAddress' && window._daxiPickupFromGps) return;
    var inp = document.getElementById(inputId);
    if (!inp || !google || !google.maps || !google.maps.Geocoder) return;
    new google.maps.Geocoder().geocode({ location: { lat: lat, lng: lng } }, function(results, status) {
        if (status === 'OK' && results[0]) {
            var cleaned = _cleanAddressDisplay(results[0].formatted_address);
            inp.value = cleaned;
            inp.dataset.placeSelected = '1';
            var ph = inputId === 'destinationAddress' ? document.getElementById('pickupHidden') : document.getElementById('destinationHidden');
            if (ph) ph.value = cleaned;
        }
    });
}

function _updateBookingRoute() {
    if (!window._clientBgMap || !window.google || !google.maps) return;
    if (window._planWaypoints && window._planWaypoints.length) {
        _drawMultiStopRoute();
        return;
    }
    var p = window._bookingMarkers.pickup, d = window._bookingMarkers.dest;
    if (!p || !d || !p.position || !d.position) {
        if (window._bookingRouteLine) window._bookingRouteLine.setMap(null);
        if (window._bookingRouteGlow) window._bookingRouteGlow.setMap(null);
        if (window.DaxiMapSnap && DaxiMapSnap.setActiveRoutePath) DaxiMapSnap.setActiveRoutePath(null);
        else window._daxiActiveRoutePath = null;
        return;
    }
    var pp = _daxiLatLngParts(p.position || (p.getPosition && p.getPosition()));
    var dp = _daxiLatLngParts(d.position || (d.getPosition && d.getPosition()));
    if (!pp || !dp) return;

    var reqId = ++_bookingRouteReq;
    if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[ROUTE] calculation START', { from: pp, to: dp });
    _fetchSmartRoute(pp.lat, pp.lng, dp.lat, dp.lng).then(function(route) {
        if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[ROUTE] calculation END', { ok: !!(route && route.path), pts: route && route.path && route.path.length });
        if (reqId !== _bookingRouteReq) return;
        if (!route || !route.path || route.path.length < 2) {
            if (typeof _fetchRoute === 'function') {
                return _fetchRoute(pp.lng, pp.lat, dp.lng, dp.lat).then(function(fb) {
                    if (reqId !== _bookingRouteReq || !fb) return;
                    _drawBookingRoutePath(fb.path, fb.distanceText, fb.durationText);
                });
            }
            return;
        }
        _drawBookingRoutePath(route.path, route.distanceText, route.durationText);
    });
}

function _daxiSimplifyRoutePath(path) {
    if (!path || path.length < 2) return path || [];
    var out = [];
    var last = null;
    for (var i = 0; i < path.length; i++) {
        var pt = path[i];
        var lat = typeof pt.lat === 'function' ? pt.lat() : pt.lat;
        var lng = typeof pt.lng === 'function' ? pt.lng() : pt.lng;
        if (!isFinite(lat) || !isFinite(lng)) continue;
        if (last && Math.abs(last.lat - lat) < 1e-5 && Math.abs(last.lng - lng) < 1e-5) continue;
        out.push({ lat: lat, lng: lng });
        last = { lat: lat, lng: lng };
    }
    return out.length >= 2 ? out : path;
}

function _drawBookingRoutePath(path, distanceText, durationText) {
    if (document.body.classList.contains('daxi-explorer-mode')) return;
    if (!window._clientBgMap || !path || path.length < 2) return;
    path = _daxiSimplifyRoutePath(path);
    if (!window._bookingRouteGlow) {
        window._bookingRouteGlow = new google.maps.Polyline({
            strokeColor: '#22c55e', strokeOpacity: 0.25, strokeWeight: 12,
            map: window._clientBgMap, zIndex: 499
        });
    }
    if (!window._bookingRouteLine) {
        window._bookingRouteLine = new google.maps.Polyline({
            strokeColor: '#4ade80', strokeOpacity: 0.9, strokeWeight: 4,
            map: window._clientBgMap, zIndex: 500
        });
    }
    window._bookingRouteGlow.setPath(path);
    window._bookingRouteGlow.setMap(window._clientBgMap);
    window._bookingRouteLine.setPath(path);
    window._bookingRouteLine.setMap(window._clientBgMap);
    if (window.DaxiMapSnap && DaxiMapSnap.setActiveRoutePath) {
        DaxiMapSnap.setActiveRoutePath(path);
    } else {
        window._daxiActiveRoutePath = path;
    }
    if (distanceText && durationText) {
        var hud = document.getElementById('daxiRouteStatsHud');
        if (hud) {
            var stops = (window._planWaypoints && window._planWaypoints.length) ? ' · ' + (window._planWaypoints.length + 1) + ' arrêts' : '';
            hud.innerHTML = '<span class="daxi-route-km">' + distanceText + stops + '</span>'
                + '<span class="daxi-route-dur">~ ' + durationText + '</span>';
            hud.style.display = 'block';
            document.body.classList.add('daxi-route-hud-visible');
        }
    } else {
        document.body.classList.remove('daxi-route-hud-visible');
    }
}

function _clearPlanStopMarkers() {
    (window._planStopMarkers || []).forEach(function(m) {
        if (!m) return;
        if (m.map != null) m.map = null;
        else if (m.setMap) m.setMap(null);
    });
    window._planStopMarkers = [];
}

function _drawPlanStopMarker(lat, lng, num) {
    if (!window._clientBgMap || !window.google) return;
    var pos = { lat: lat, lng: lng };
    var marker;
    if (window._daxiAdvancedMarkerElement) {
        var el = _daxiMapCenteredDot(
            'position:absolute;left:-11px;top:-11px;width:22px;height:22px;border-radius:50%;border:2px solid #fff;background:#a855f7;color:#fff;font-size:10px;font-weight:900;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.4);'
        );
        el.firstChild.textContent = String(num);
        marker = new window._daxiAdvancedMarkerElement({ map: window._clientBgMap, position: pos, content: el, zIndex: 1000 + num });
    } else {
        marker = new google.maps.Marker({
            map: window._clientBgMap, position: pos, zIndex: 1000 + num,
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 11, fillColor: '#a855f7', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
            label: { text: String(num), color: '#fff', fontWeight: '900', fontSize: '10px' }
        });
    }
    window._planStopMarkers.push(marker);
}

function _drawMultiStopRoute() {
    if (!window._clientBgMap || !window.google || !google.maps) return;
    var pM = window._bookingMarkers.pickup, dM = window._bookingMarkers.dest;
    if (!pM || !dM) return;
    var pp = _daxiLatLngParts(pM.position || (pM.getPosition && pM.getPosition()));
    var dp = _daxiLatLngParts(dM.position || (dM.getPosition && dM.getPosition()));
    if (!pp || !dp) return;
    var wps = window._planWaypoints || [];
    _clearPlanStopMarkers();
    wps.forEach(function(w, i) { _drawPlanStopMarker(w.lat, w.lng, i + 1); });
    if (!wps.length) { _updateBookingRoute(); return; }
    _daxiDirectionsRoute(pp, dp, wps).then(function(route) {
        if (!route || !route.path || route.path.length < 2) { _updateBookingRoute(); return; }
        _drawBookingRoutePath(route.path, route.distanceText, route.durationText);
        var bounds = new google.maps.LatLngBounds();
        route.path.forEach(function(pt) {
            bounds.extend(typeof pt.lat === 'function' ? pt : new google.maps.LatLng(pt.lat, pt.lng));
        });
        window._clientBgMap.fitBounds(bounds, _daxiMapPadding());
        _daxiRestoreBookingMapTilt(window._clientBgMap);
    });
}

window._syncPlanWaypointsFromInputs = function() {
    window._planWaypoints = [];
    document.querySelectorAll('.destination-item .destination-input[data-lat][data-lng]').forEach(function(inp) {
        var lat = parseFloat(inp.dataset.lat), lng = parseFloat(inp.dataset.lng);
        if (inp.value.trim() && !isNaN(lat) && !isNaN(lng)) {
            window._planWaypoints.push({ label: inp.value.trim(), lat: lat, lng: lng });
        }
    });
    var hidden = document.getElementById('planWaypointsHidden');
    if (hidden) hidden.value = window._planWaypoints.length ? JSON.stringify(window._planWaypoints) : '';
    _drawMultiStopRoute();
};

document.addEventListener('click', function(e) {
    var addBtn = e.target.closest('.add-destination-btn');
    if (!addBtn) return;
    e.preventDefault();
    var planId = addBtn.getAttribute('data-plan');
    var container = document.getElementById('plan' + planId + '-destinations-container');
    if (!container) return;
    var items = container.querySelectorAll('.destination-item');
    var idx = items.length + 1;
    var div = document.createElement('div');
    div.className = 'destination-item mb-3';
    div.innerHTML = '<label class="text-sm font-medium text-gray-700">Destination ' + idx + '</label>' +
        '<div class="relative">' +
        '<input type="text" class="destination-input w-full px-3 py-2 border rounded-lg mt-1" placeholder="Adresse ou lieu..." data-no-translate="1">' +
        '<div class="suggestions-container hidden" style="position:absolute;z-index:1000;background:white;border:1px solid #e5e7eb;border-radius:0.5rem;max-height:200px;overflow-y:auto;width:100%;margin-top:4px;box-shadow:0 4px 6px rgba(0,0,0,0.1);"></div>' +
        '</div>';
    container.appendChild(div);
    var inp = div.querySelector('.destination-input');
    var box = div.querySelector('.suggestions-container');
    if (box && !box.id) box.id = 'plan' + planId + '-dest-' + idx + '-suggestions';
    if (inp && typeof _attachPlacesAC === 'function') {
        _attachPlacesAC(inp, {
            suggestionsId: box && box.id,
            onPlace: function() { if (window._syncPlanWaypointsFromInputs) window._syncPlanWaypointsFromInputs(); }
        });
    }
});

function _fetchSmartRoute(lat1, lng1, lat2, lng2) {
    var headers = { 'Content-Type': 'application/json' };
    if (typeof getCsrfToken === 'function') {
        var csrf = getCsrfToken();
        if (csrf) headers['X-CSRFToken'] = csrf;
    }
    return fetch('/api/pricing/route/', {
        method: 'POST',
        headers: headers,
        credentials: 'same-origin',
        body: JSON.stringify({
            origin_lat: lat1, origin_lng: lng1,
            dest_lat: lat2, dest_lng: lng2,
            save_log: false
        })
    }).then(function(r) { return r.ok ? r.json() : null; }).then(function(data) {
        if (!data || !data.route_coordinates || !data.route_coordinates.length) return null;
        var path = data.route_coordinates.map(function(c) {
            return new google.maps.LatLng(c[0], c[1]);
        });
        path = _daxiSimplifyRoutePath(path);
        var km = data.total_distance_km;
        var durS = data.duration_s || 0;
        var durMin = Math.max(1, Math.round(durS / 60));
        return {
            path: path,
            distanceText: (km != null ? km.toFixed(1) : '?') + ' km',
            durationText: durMin >= 60 ? Math.floor(durMin/60) + ' h ' + (durMin%60) + ' min' : durMin + ' min'
        };
    }).catch(function() { return null; });
}
window._fetchSmartRoute = _fetchSmartRoute;

var _routeAnimToken = 0;
function _playRouteRevealAnimation() {
    if (!window._clientBgMap || !window.google) return;
    var pM = window._bookingMarkers.pickup, dM = window._bookingMarkers.dest;
    if (!pM || !dM) return;
    var pp = _daxiLatLngParts(pM.position || (pM.getPosition && pM.getPosition()));
    var dp = _daxiLatLngParts(dM.position || (dM.getPosition && dM.getPosition()));
    if (!pp || !dp) return;

    var token = ++_routeAnimToken;
    var map = window._clientBgMap;
    var bounds = new google.maps.LatLngBounds();
    bounds.extend(pp);
    bounds.extend(dp);

    _daxiFitBothBookingMarkersVisible(0);

    _fetchSmartRoute(pp.lat, pp.lng, dp.lat, dp.lng).then(function(route) {
        if (token !== _routeAnimToken) return;
        if (route && route.path) _drawBookingRoutePath(route.path, route.distanceText, route.durationText);

        setTimeout(function() {
            if (token !== _routeAnimToken) return;
            _daxiFitBothBookingMarkersVisible(0);
        }, 600);
    });
}

function _triggerDestRoutePreview() {
    window._daxiDestConfirmed = true;
    if (window._daxiRoutePreviewTimer) clearTimeout(window._daxiRoutePreviewTimer);
    window._daxiRoutePreviewTimer = setTimeout(function() {
        window._daxiRoutePreviewTimer = null;
        _updateBookingRoute();
        setTimeout(function() {
            if (typeof _daxiFitBothBookingMarkersVisible === 'function') _daxiFitBothBookingMarkersVisible(0);
        }, 500);
    }, 400);
}
window._triggerDestRoutePreview = _triggerDestRoutePreview;
window._updateBookingRoute = _updateBookingRoute;

function _daxiRestoreBookingMapTilt(map) {
    _daxiRestoreMapTilt(map || window._clientBgMap, (typeof DAXI_TRACK_CFG !== 'undefined' && DAXI_TRACK_CFG.pitch) ? DAXI_TRACK_CFG.pitch : 52);
}

function _fitMapToBookingMarkers(focusType) {
    if (!window._clientBgMap || !window.google) return;
    if (focusType === 'pickup') {
        _zoomToBookingPoint('pickup');
        return;
    }
    var bounds = new google.maps.LatLngBounds();
    var count = 0;
    ['pickup', 'dest'].forEach(function(k) {
        var m = window._bookingMarkers[k];
        if (m) {
            var p = _daxiLatLngParts(m.position || (m.getPosition && m.getPosition()));
            if (p) { bounds.extend(p); count++; }
        }
    });
    if (!count) return;
    if (count > 1) {
        _daxiFitBothBookingMarkersVisible(0);
        return;
    }
    var pad = _daxiMapPadding();
    {
        var only = _daxiLatLngParts(
            (window._bookingMarkers.pickup && window._bookingMarkers.pickup.position) ||
            (window._bookingMarkers.dest && window._bookingMarkers.dest.position)
        );
        if (only) {
            var z = (window._bookingMarkers.pickup && window._bookingMarkers.pickup.position) ? 16 : 15;
            _daxiCenterClientOnVisibleMap(only.lat, only.lng, { zoom: z });
        }
    }
    _daxiRestoreBookingMapTilt(window._clientBgMap);
}

window._daxiDestConfirmed = true;

function _showDestConfirmBar(show) {  }

function confirmBookingDestination() {
    _triggerDestRoutePreview();
}

function _zoomToBookingPoint(type) {
    if (!window._clientBgMap || !window.google) return;
    var key = type === 'pickup' ? 'pickup' : 'dest';
    var m = window._bookingMarkers[key];
    if (!m) return;
    var p = _daxiLatLngParts(m.position || (m.getPosition && m.getPosition()));
    if (!p) return;
    var z = type === 'pickup' ? 16 : 15;
    _daxiCenterClientOnVisibleMap(p.lat, p.lng, { zoom: z });
    _daxiRestoreBookingMapTilt(window._clientBgMap);
}

function _syncGpsPickupHiddenFields(lat, lng) {
    var latEl = document.getElementById('pickupLatHidden');
    var lngEl = document.getElementById('pickupLngHidden');
    if (latEl) latEl.value = lat;
    if (lngEl) lngEl.value = lng;
    _syncClientGpsAccuracyHiddenFields();
}

function _hideGpsPickupMarker() {
    var m = window._bookingMarkers && window._bookingMarkers.pickup;
    if (!m) return;
    if (m._dom && m.overlay && m.overlay.setMap) m.overlay.setMap(null);
    else if (m.map != null) m.map = null;
    else if (m.setMap) m.setMap(null);
    window._bookingMarkers.pickup = null;
}

function _setMainMapBookingPoint(type, lat, lng, latFieldId, lngFieldId, inputId, opts) {
    opts = opts || {};
    if (typeof _daxiPlacesTrace === 'function' && typeof _daxiPlacesTraceActive === 'function' && _daxiPlacesTraceActive()) {
        _daxiPlacesTrace('[MAP] _setMainMapBookingPoint', { type: type, defer: !!opts.deferMapOps, skipResize: !!opts.skipMapResize, silent: !!opts.silent });
    }
    if (typeof _daxiMapLog === 'function') {
        _daxiMapLog('setBookingPoint', { type: type, lat: lat, lng: lng, google: _daxiMainMapIsGoogle(), offline: !!window._daxiOfflineMapMode });
    }
    if (!isFinite(lat) || !isFinite(lng)) return;
    if (type === 'pickup' && opts.gpsLabel) {
        window._daxiPickupFromGps = true;
        _syncGpsPickupHiddenFields(lat, lng);
        _hideGpsPickupMarker();
        var latElG = document.getElementById(latFieldId);
        var lngElG = document.getElementById(lngFieldId);
        if (latElG) latElG.value = lat;
        if (lngElG) lngElG.value = lng;
        var pinG = document.getElementById(inputId);
        if (pinG) { pinG.value = _daxiMyPositionLabel(); pinG.dataset.placeSelected = '1'; }
        var phG = document.getElementById('pickupHidden');
        if (phG) phG.value = _daxiMyPositionLabel();
        if (!opts.silent && !opts.uncovered) {
            _daxiSmartPanForClientGps(lat, lng, 60, { forcePan: true });
        }
        return;
    }
    if (window._daxiOfflineMapMode && window._clientBgMap) {
        var offKey = type === 'pickup' ? 'pickup' : 'dest';
        window._bookingMarkers = window._bookingMarkers || { pickup: null, dest: null };
        window._bookingMarkers[offKey] = { position: { lat: lat, lng: lng } };
        if (type === 'pickup') window._daxiPickupFromGps = !!opts.gpsLabel;
        if (typeof window._updateOfflineBookingMarker === 'function') {
            window._updateOfflineBookingMarker(type, lat, lng);
        }
        var latEl0 = document.getElementById(latFieldId);
        var lngEl0 = document.getElementById(lngFieldId);
        if (latEl0) latEl0.value = lat;
        if (lngEl0) lngEl0.value = lng;
        if (type === 'dest') {
            if (!opts.silent && typeof _triggerDestRoutePreview === 'function') {
                if (opts.deferMapOps) _daxiDeferAfterPaint(function() { _triggerDestRoutePreview(); });
                else _triggerDestRoutePreview();
            }
            if (opts.deferMapOps) {
                _daxiDeferAfterPaint(function() {
                    _daxiCenterClientOnVisibleMap(lat, lng, { zoom: 15 });
                    window._daxiMapFocusLockUntil = Date.now() + 8000;
                });
            } else {
                _daxiCenterClientOnVisibleMap(lat, lng, { zoom: 15 });
                window._daxiMapFocusLockUntil = Date.now() + 8000;
            }
        } else if (!opts.silent) {
            if (opts.deferMapOps) {
                _daxiDeferAfterPaint(function() {
                    _daxiCenterClientOnVisibleMap(lat, lng, { zoom: 16 });
                    window._daxiMapFocusLockUntil = Date.now() + 8000;
                });
            } else {
                _daxiCenterClientOnVisibleMap(lat, lng, { zoom: 16 });
                window._daxiMapFocusLockUntil = Date.now() + 8000;
            }
        } else if (opts.gpsLabel) {
            _daxiCenterClientOnVisibleMap(lat, lng, { zoom: 16 });
        }
        if (opts.gpsLabel && type === 'pickup') {
            var pin0 = document.getElementById(inputId);
            if (pin0) { pin0.value = _daxiMyPositionLabel(); pin0.dataset.placeSelected = '1'; }
            var ph0 = document.getElementById('pickupHidden');
            if (ph0) ph0.value = _daxiMyPositionLabel();
        }
        return;
    }
    if (!_daxiMainMapIsGoogle()) {
        window._daxiPendingBookingMarkers = window._daxiPendingBookingMarkers || [];
        window._daxiPendingBookingMarkers.push([type, lat, lng, latFieldId, lngFieldId, inputId, opts]);
        _daxiScheduleBookingMarkerRetry();
        return;
    }
    if (!window._clientBgMap || !window.google || !google.maps) return;
    function _applyBookingMarkerOnMap() {
    window._bookingMarkers = window._bookingMarkers || { pickup: null, dest: null };
    var pos = { lat: lat, lng: lng };
    var key = type === 'pickup' ? 'pickup' : 'dest';
    var marker = window._bookingMarkers[key];
    if (_daxiIsOfflineBookingMarker(marker)) {
        window._bookingMarkers[key] = null;
        marker = null;
    }
    var markersLocked = _daxiIsOrderPositionsLocked();
    function _onBookingMarkerDrag(np) {
        if (_daxiIsOrderPositionsLocked()) return;
        if (!np) return;
        var latEl = document.getElementById(latFieldId);
        var lngEl = document.getElementById(lngFieldId);
        if (latEl) latEl.value = np.lat;
        if (lngEl) lngEl.value = np.lng;
        if (type === 'pickup') {
            window._daxiPickupFromGps = false;
            _reverseGeocodeToInput(np.lat, np.lng, inputId);
            var ph = document.getElementById('pickupHidden');
            var inp = document.getElementById(inputId);
            if (ph && inp && inp.value) ph.value = inp.value;
        } else {
            _reverseGeocodeToInput(np.lat, np.lng, inputId);
        }
        if (type === 'dest') {
            _triggerDestRoutePreview();
            _daxiCenterClientOnVisibleMap(np.lat, np.lng, { zoom: 15 });
            window._daxiMapFocusLockUntil = Date.now() + 8000;
            return;
        }
        _updateBookingRoute();
        _daxiCenterClientOnVisibleMap(np.lat, np.lng, { zoom: 16 });
        window._daxiMapFocusLockUntil = Date.now() + 8000;
        _fitMapToBookingMarkers('pickup');
    }
    if (!marker) {
        marker = _daxiCreateBookingMapMarker(type, pos, markersLocked, _onBookingMarkerDrag);
        window._bookingMarkers[key] = marker;
        if (typeof _daxiMapLog === 'function') {
            _daxiMapLog('markerPlaced', { type: type, dom: !!(marker && marker._dom), pos: pos });
        }
    } else if (marker._dom && marker.setPosition) {
        marker.setPosition(pos);
        marker.setMap(window._clientBgMap);
    } else if (window._daxiAdvancedMarkerElement && marker.position != null && marker.map != null && marker.content != null) {
        marker.position = pos;
        marker.map = window._clientBgMap;
        if (marker.content != null) marker.content = _daxiPinMarkerEl(type);
    } else if (marker.setPosition) {
        marker.setPosition(pos);
        marker.position = pos;
        marker.setMap(window._clientBgMap);
    }
    _daxiApplyBookingMarkersLock();
    marker = window._bookingMarkers[key];
    if (marker && window._clientBgMap) {
        if (marker._dom && marker.overlay) marker.overlay.setMap(window._clientBgMap);
        else if (marker.map != null) marker.map = window._clientBgMap;
        else if (marker.setMap) marker.setMap(window._clientBgMap);
    }
    var latEl = document.getElementById(latFieldId);
    var lngEl = document.getElementById(lngFieldId);
    if (latEl) latEl.value = lat;
    if (lngEl) lngEl.value = lng;
    function _runHeavyMapOps() {
        if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[MAP] update START', { type: type, silent: !!opts.silent });
        if (type === 'dest') {
            if (!opts.silent) {
                _showMapPrecisionHint('Glissez l’épingle sur la carte pour affiner l’emplacement.', 6500, '◎');
                _triggerDestRoutePreview();
            }
            _daxiCenterClientOnVisibleMap(lat, lng, { zoom: 15 });
            window._daxiMapFocusLockUntil = Date.now() + 8000;
        } else if (!opts.silent) {
            _daxiCenterClientOnVisibleMap(lat, lng, { zoom: 16 });
            _updateBookingRoute();
            window._daxiMapFocusLockUntil = Date.now() + 8000;
        } else if (opts.gpsLabel) {
            _daxiCenterClientOnVisibleMap(lat, lng, { zoom: 16 });
        }
        if (opts.gpsLabel && type === 'pickup') {
            var pin = document.getElementById(inputId);
            if (pin) { pin.value = _daxiMyPositionLabel(); pin.dataset.placeSelected = '1'; }
            var ph2 = document.getElementById('pickupHidden');
            if (ph2) ph2.value = _daxiMyPositionLabel();
        } else if (!opts.silent && type !== 'dest') {
            _showMapPrecisionHint('Ajustez le départ en glissant l’épingle sur la carte.', 6500, '◎');
        }
        if (!opts.skipMapResize) {
            try { google.maps.event.trigger(window._clientBgMap, 'resize'); } catch (e) {}
        } else if (typeof _daxiPlacesTrace === 'function') {
            _daxiPlacesTrace('[MAP] trigger(resize) SKIPPED');
        }
        if (typeof _daxiRedrawBookingMarkers === 'function') _daxiRedrawBookingMarkers();
        if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[MAP] update END');
    }
    if (opts.deferMapOps && !opts.silent) {
        if (typeof _daxiDeferAfterPaint === 'function') _daxiDeferAfterPaint(_runHeavyMapOps);
        else setTimeout(_runHeavyMapOps, 0);
    } else {
        _runHeavyMapOps();
    }
    }
    _applyBookingMarkerOnMap();
}

function _showPinMap(mapId, lat, lng, latFieldId, lngFieldId) {
    var type = (mapId.indexOf('pickup') >= 0 || mapId.indexOf('depart') >= 0) ? 'pickup' : 'dest';
    var inputId = type === 'pickup' ? 'destinationAddress' : 'destinationAddressArrival';
    if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[MAP] _showPinMap (NO defer, WILL resize)', { type: type });
    _setMainMapBookingPoint(type, lat, lng, latFieldId, lngFieldId, inputId);
}

function _clearPlaceCoordsForInput(inputEl) {
    inputEl.dataset.placeSelected = '';
    var isP = (inputEl.id === 'destinationAddress');
    var isD = (inputEl.id === 'destinationAddressArrival');
    if (isP) {
        var e; e = document.getElementById('pickupLatHidden'); if(e) e.value = '';
        e = document.getElementById('pickupLngHidden'); if(e) e.value = '';
    }
    if (isD) {
        var e; e = document.getElementById('destLatHidden'); if(e) e.value = '';
        e = document.getElementById('destLngHidden'); if(e) e.value = '';
    }
}

async function _daxiEnsurePlacesReady() {
    if (!window.google || !window.google.maps) return false;
    try {
        if (typeof google.maps.importLibrary === 'function') {
            await google.maps.importLibrary('places');
        }
    } catch (e) {
        console.warn('[Daxi Maps] importLibrary(places) failed:', e);
    }
    var p = google.maps.places;
    return !!(p && (
        (p.AutocompleteSuggestion && typeof p.AutocompleteSuggestion.fetchAutocompleteSuggestions === 'function') ||
        p.AutocompleteService ||
        p.PlaceAutocompleteElement ||
        p.Autocomplete
    ));
}
window._daxiEnsurePlacesReady = _daxiEnsurePlacesReady;

function _daxiResolveSuggestionsId(inputEl, opts) {
    if (opts && opts.suggestionsId) return opts.suggestionsId;
    if (!inputEl || !inputEl.id) return null;
    var candidates = [
        inputEl.id + 'Suggestions',
        inputEl.id + '-suggestions'
    ];
    for (var i = 0; i < candidates.length; i++) {
        if (document.getElementById(candidates[i])) return candidates[i];
    }
    var parent = inputEl.parentElement;
    if (!parent) return null;
    var sib = parent.querySelector('.suggestions-container');
    return sib ? (sib.id || null) : null;
}

function _daxiPredictionLabel(pred) {
    if (!pred) return '';
    if (pred.description) return pred.description;
    var pp = pred.placePrediction;
    if (!pp) return '';
    if (pp.text && pp.text.text) return pp.text.text;
    var main = (pp.mainText && pp.mainText.text) || '';
    var sec = (pp.secondaryText && pp.secondaryText.text) || '';
    return sec ? (main + ', ' + sec) : main;
}

async function _daxiGetAcSessionToken(inputEl) {
    await _daxiEnsurePlacesReady();
    if (!inputEl._daxiAcToken && google.maps.places && google.maps.places.AutocompleteSessionToken) {
        inputEl._daxiAcToken = new google.maps.places.AutocompleteSessionToken();
    }
    return inputEl._daxiAcToken || null;
}

function _daxiResetAcSessionToken(inputEl) {
    if (inputEl) inputEl._daxiAcToken = null;
}

function _daxiBuildAutocompleteRequest(query, sessionToken) {
    var req = { input: query, includedRegionCodes: ['ht'], language: 'fr' };
    if (sessionToken) req.sessionToken = sessionToken;
    var bounds = _DAXI_ACTIVE_BOUNDS || _HAITI_BOUNDS;
    if (bounds && typeof bounds.getNorthEast === 'function') {
        var ne = bounds.getNorthEast();
        var sw = bounds.getSouthWest();
        req.locationBias = {
            west: sw.lng(),
            south: sw.lat(),
            east: ne.lng(),
            north: ne.lat()
        };
    } else {
        req.locationBias = { west: -74.5, south: 17.9, east: -71.6, north: 20.1 };
    }
    return req;
}

async function _daxiFetchDaxiPlaceSuggestions(query) {
    query = (query || '').trim();
    if (query.length < 2) return [];
    try {
        var res = await fetch('/api/places/autocomplete/?q=' + encodeURIComponent(query), { credentials: 'include' });
        if (!res.ok) return [];
        var data = await res.json();
        return (data.predictions || []).map(function(p) {
            return {
                place_id: p.place_id,
                description: p.description,
                lat: p.lat,
                lng: p.lng,
                source: p.source || 'known',
                source_label: p.source_label || 'DAXI',
                _daxiLocal: true
            };
        });
    } catch (e) {
        console.warn('[Daxi] local places autocomplete failed:', e);
        return [];
    }
}

function _daxiMergePlaceSuggestions(localItems, googleItems, limit) {
    limit = limit || 12;
    var merged = [];
    var seen = {};
    function add(item) {
        if (!item || !item.description) return;
        var key = item.place_id || (item.description || '').toLowerCase();
        if (seen[key]) return;
        seen[key] = 1;
        merged.push(item);
    }
    (localItems || []).forEach(add);
    (googleItems || []).forEach(add);
    return merged.slice(0, limit);
}

function _daxiFetchPlacePredictionsNative(query, inputEl) {
    query = (query || '').trim();
    if (query.length < 2) return Promise.resolve([]);
    var reqId = (inputEl && inputEl._daxiSuggestReqId) || 0;
    var t0 = Date.now();
    function log(stage, extra) {
        if (typeof window._daxiNetLog === 'function') window._daxiNetLog(stage, Object.assign({ query: query, reqId: reqId, _t0: t0 }, extra || {}));
    }
    function fetchViaWebView() {
        log('JS_SUGGEST_FALLBACK_FETCH', {});
        var url = '/api/places/autocomplete/?q=' + encodeURIComponent(query);
        return fetch(url, { credentials: 'include' })
            .then(function(res) {
                if (!res.ok) throw new Error('http_' + res.status);
                return res.json();
            })
            .then(function(parsed) {
                var preds = parsed && parsed.predictions ? parsed.predictions : [];
                log('JS_SUGGEST_FALLBACK_OK', { count: preds.length });
                return preds.map(function(p) {
                    return {
                        place_id: p.place_id || '',
                        description: p.description || p.label || '',
                        source: p.source || 'backend',
                        source_label: p.source_label || p.source || 'Daxi'
                    };
                }).filter(function(p) { return p.place_id && p.description; });
            })
            .catch(function(e) {
                log('JS_SUGGEST_FALLBACK_FAIL', { error: String(e) });
                return [];
            });
    }
    if (!window.DaxiAndroid || typeof DaxiAndroid.fetchPlacePredictionsAsync !== 'function') {
        log('JS_SUGGEST_NO_BRIDGE', {});
        return fetchViaWebView();
    }
    return new Promise(function(resolve) {
        var cbId = 'pp_' + reqId + '_' + Date.now();
        var settled = false;
        function finish(items, source) {
            if (settled) return;
            settled = true;
            log('JS_SUGGEST_DONE', { count: (items || []).length, source: source || 'native' });
            resolve(items || []);
        }
        var timeoutId = setTimeout(function() {
            if (window._daxiPredictionCbs && window._daxiPredictionCbs[cbId]) {
                delete window._daxiPredictionCbs[cbId];
                log('JS_SUGGEST_TIMEOUT', { cbId: cbId });
                fetchViaWebView().then(function(items) { finish(items, 'fallback_timeout'); });
            }
        }, 2800);
        window._daxiPredictionCbs = window._daxiPredictionCbs || {};
        window._daxiPredictionCbs[cbId] = function(jsonStr) {
            clearTimeout(timeoutId);
            delete window._daxiPredictionCbs[cbId];
            if (inputEl && inputEl._daxiSuggestReqId !== reqId) return finish([], 'stale');
            try {
                var parsed = JSON.parse(jsonStr);
                var preds = parsed && parsed.predictions ? parsed.predictions : (Array.isArray(parsed) ? parsed : []);
                var items = preds.map(function(p) {
                    return {
                        place_id: p.place_id || '',
                        description: p.description || p.label || '',
                        source: p.source || 'backend',
                        source_label: p.source_label || p.source || 'Daxi'
                    };
                }).filter(function(p) { return p.place_id && p.description; });
                if (items.length) return finish(items, 'native');
                log('JS_SUGGEST_NATIVE_EMPTY', { cbId: cbId });
                fetchViaWebView().then(function(fb) { finish(fb, 'fallback_empty'); });
            } catch (e) {
                log('JS_SUGGEST_PARSE_FAIL', { error: String(e) });
                fetchViaWebView().then(function(fb) { finish(fb, 'fallback_parse'); });
            }
        };
        log('JS_SUGGEST_BRIDGE_CALL', { cbId: cbId });
        DaxiAndroid.fetchPlacePredictionsAsync(query, cbId);
    });
}

function _daxiHasNativePlacesBridge() {
    return !!(window.DaxiAndroid && typeof DaxiAndroid.fetchPlacePredictionsAsync === 'function');
}

async function _daxiFetchGooglePlaceSuggestions(query, inputEl) {
    query = (query || '').trim();
    if (query.length < 2) return [];
    if (_daxiHasNativePlacesBridge()) {
        return _daxiFetchPlacePredictionsNative(query, inputEl);
    }
    var ready = await _daxiEnsurePlacesReady();
    if (!ready) {
        return _daxiFetchDaxiPlaceSuggestions(query);
    }
    var sessionToken = await _daxiGetAcSessionToken(inputEl);
    var placesLib = google.maps.places;

    function fromLegacy() {
        return new Promise(function(resolve) {
            if (!placesLib.AutocompleteService) return resolve([]);
            var svc = new placesLib.AutocompleteService();
            var legacyReq = {
                input: query,
                language: 'fr',
                componentRestrictions: { country: 'ht' },
                sessionToken: sessionToken
            };
            var bounds = _DAXI_ACTIVE_BOUNDS || _HAITI_BOUNDS;
            if (bounds && typeof bounds.getNorthEast === 'function') {
                legacyReq.bounds = bounds;
            }
            var done = false;
            var timer = setTimeout(function() {
                if (done) return;
                done = true;
                resolve([]);
            }, 2800);
            svc.getPlacePredictions(legacyReq, function(predictions, status) {
                if (done) return;
                done = true;
                clearTimeout(timer);
                if (status !== 'OK' || !predictions) return resolve([]);
                resolve(predictions.map(function(p) {
                    return {
                        place_id: p.place_id,
                        description: p.description,
                        source: 'google',
                        source_label: 'Google'
                    };
                }));
            });
        });
    }

    async function fromNewApi() {
        if (!placesLib.AutocompleteSuggestion || typeof placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions !== 'function') {
            return [];
        }
        var req = _daxiBuildAutocompleteRequest(query, sessionToken);
        req.language = 'fr';
        var resp = await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions(req);
        var suggestions = (resp && resp.suggestions) || [];
        return suggestions.map(function(s) {
            var pp = s.placePrediction;
            if (!pp) return null;
            var pid = pp.placeId || '';
            var desc = _daxiPredictionLabel({ placePrediction: pp });
            if (!pid || !desc) return null;
            return {
                place_id: pid,
                description: desc,
                source: 'google',
                source_label: 'Google',
                placePrediction: pp,
                _newApi: true
            };
        }).filter(Boolean);
    }

    var items = await fromLegacy();
    if (!items.length) {
        try { items = await fromNewApi(); } catch (e) {
            console.warn('[Daxi] AutocompleteSuggestion failed:', e);
        }
    }
    if (!items.length) items = await _daxiFetchDaxiPlaceSuggestions(query);
    return items;
}

async function _daxiFetchPlaceSuggestions(query, inputEl) {
    query = (query || '').trim();
    if (query.length < 2) return [];

    var local = [];
    if (window.DaxiPlacesCatalog) {
        if (!DaxiPlacesCatalog.ready()) {
            try { await DaxiPlacesCatalog.load(); } catch (e) {}
        }
        if (DaxiPlacesCatalog.ready()) {
            local = DaxiPlacesCatalog.search(query, 12);
        }
    }
    if (!local.length) {
        local = await _daxiFetchDaxiPlaceSuggestions(query);
    }

    var googleItems = await _daxiFetchGooglePlaceSuggestions(query, inputEl);
    return _daxiMergePlaceSuggestions(local, googleItems, 12);
}

function _daxiPacShowsVisibleItems() {
    var pacs = document.querySelectorAll('.pac-container');
    for (var i = 0; i < pacs.length; i++) {
        var pac = pacs[i];
        if (!pac.querySelector('.pac-item')) continue;
        var r = pac.getBoundingClientRect();
        if (r.width > 0 && r.height > 8) return true;
    }
    return false;
}

function _daxiClearPacInlineLayout() {
    document.querySelectorAll('.pac-container').forEach(function(pac) {
        pac.style.position = '';
        pac.style.left = '';
        pac.style.right = '';
        pac.style.width = '';
        pac.style.top = '';
        pac.style.bottom = '';
        pac.style.maxHeight = '';
        pac.style.zIndex = '';
        pac.style.display = '';
    });
}

function _daxiIsMobileBookingUI() {
    try {
        return window.matchMedia('(max-width: 768px)').matches;
    } catch (e) {
        return (window.innerWidth || 999) <= 768;
    }
}

function _daxiBookingSheetTopPx() {
    var sheet = document.getElementById('appSheet');
    if (!sheet || sheet.classList.contains('daxi-sheet-hidden')) return window.innerHeight;
    var r = sheet.getBoundingClientRect();
    return r.top > 0 ? r.top : window.innerHeight;
}

function _daxiSuggestDropdownTop(inputEl, maxH) {
    var rect = inputEl.getBoundingClientRect();
    var vv = window.visualViewport;
    var viewH = vv ? vv.height : window.innerHeight;
    var viewTop = vv ? (vv.offsetTop || 0) : 0;
    var sheetTop = _daxiBookingSheetTopPx();
    var spaceBelow = Math.min(viewH - (rect.bottom - viewTop), sheetTop - rect.bottom - 10);
    var spaceAbove = rect.top - viewTop - 10;
    if (spaceBelow < 110 && spaceAbove > spaceBelow) {
        var h = Math.min(maxH, Math.max(120, spaceAbove - 6));
        return {
            topPx: Math.max(viewTop + 6, rect.top - h - 10),
            maxH: h,
            above: true
        };
    }
    var hBelow = Math.min(maxH, Math.max(120, spaceBelow));
    return {
        topPx: Math.min(rect.bottom + 10, sheetTop - hBelow - 8),
        maxH: hBelow,
        above: false
    };
}

function _daxiPositionPacForInput(inputEl) {
    if (!inputEl) return;
    var pacs = document.querySelectorAll('.pac-container');
    if (!pacs.length) return;
    var maxH = 320;
    var place = _daxiSuggestDropdownTop(inputEl, maxH);
    var rect = inputEl.getBoundingClientRect();
    pacs.forEach(function(pac) {
        if (!pac.querySelector('.pac-item')) return;
        pac.style.position = 'fixed';
        pac.style.left = Math.max(8, rect.left) + 'px';
        pac.style.width = Math.max(120, rect.width) + 'px';
        pac.style.right = 'auto';
        pac.style.top = place.topPx + 'px';
        pac.style.bottom = 'auto';
        pac.style.maxHeight = place.maxH + 'px';
        pac.style.zIndex = '100500';
    });
    if (typeof _daxiSyncPacContainersTheme === 'function') _daxiSyncPacContainersTheme();
}

function _daxiReadUiTheme(theme) {
    if (theme) return theme;
    if (window.DaxiTheme && typeof window.DaxiTheme.get === 'function') return window.DaxiTheme.get();
    return document.documentElement.getAttribute('data-theme') || 'dark';
}

function _daxiApplySuggestionsBoxTheme(box, theme) {
    if (!box) return;
    theme = _daxiReadUiTheme(theme);
    var isLight = theme === 'light';
    var mode = isLight ? 'light' : 'dark';
    box.setAttribute('data-daxi-suggest-theme', mode);
    box.classList.remove('daxi-suggest--light', 'daxi-suggest--dark');
    box.classList.add(isLight ? 'daxi-suggest--light' : 'daxi-suggest--dark');
    if (isLight) {
        box.style.setProperty('background', 'rgba(255, 255, 255, 0.98)', 'important');
        box.style.setProperty('border', '1px solid rgba(148, 163, 184, 0.38)', 'important');
        box.style.setProperty('box-shadow', '0 8px 28px rgba(16, 42, 67, 0.14)', 'important');
        box.style.setProperty('color', '#334155', 'important');
    } else {
        box.style.setProperty('background', 'rgba(10, 16, 36, 0.98)', 'important');
        box.style.setProperty('border', '1px solid rgba(255, 255, 255, 0.12)', 'important');
        box.style.setProperty('box-shadow', '0 8px 28px rgba(0, 0, 0, 0.5)', 'important');
        box.style.setProperty('color', 'rgba(255, 255, 255, 0.92)', 'important');
    }
    box.querySelectorAll('.suggestion-item').forEach(function(row) {
        row.style.removeProperty('background');
        if (isLight) {
            row.style.setProperty('color', '#334155', 'important');
            row.style.setProperty('border-bottom', '1px solid rgba(15, 36, 71, 0.08)', 'important');
        } else {
            row.style.setProperty('color', 'rgba(255, 255, 255, 0.92)', 'important');
            row.style.setProperty('border-bottom', '1px solid rgba(255, 255, 255, 0.06)', 'important');
        }
    });
}
window._daxiApplySuggestionsBoxTheme = _daxiApplySuggestionsBoxTheme;

function _daxiSyncPacContainersTheme(theme) {
    theme = _daxiReadUiTheme(theme);
    var isLight = theme === 'light';
    document.querySelectorAll('.pac-container').forEach(function(pac) {
        if (isLight) {
            pac.style.setProperty('background', '#ffffff', 'important');
            pac.style.setProperty('border', '1px solid rgba(148, 163, 184, 0.35)', 'important');
            pac.style.setProperty('box-shadow', '0 8px 28px rgba(16, 42, 67, 0.12)', 'important');
        } else {
            pac.style.setProperty('background', 'rgba(8, 14, 35, 0.98)', 'important');
            pac.style.setProperty('border', '1px solid rgba(255, 255, 255, 0.14)', 'important');
            pac.style.setProperty('box-shadow', '0 16px 48px rgba(0, 0, 0, 0.55)', 'important');
        }
        pac.querySelectorAll('.pac-item, .pac-item-query').forEach(function(item) {
            item.style.setProperty('color', isLight ? '#475569' : 'rgba(255,255,255,0.88)', 'important');
        });
        pac.querySelectorAll('.pac-matched').forEach(function(item) {
            item.style.setProperty('color', isLight ? '#c27803' : '#4ade80', 'important');
        });
    });
}
window._daxiSyncPacContainersTheme = _daxiSyncPacContainersTheme;

function _daxiSyncAllSuggestionsTheme(theme) {
    theme = _daxiReadUiTheme(theme);
    document.querySelectorAll('.suggestions-container').forEach(function(b) {
        _daxiApplySuggestionsBoxTheme(b, theme);
    });
    _daxiSyncPacContainersTheme(theme);
}
window._daxiSyncAllSuggestionsTheme = _daxiSyncAllSuggestionsTheme;
document.addEventListener('daxi-theme-change', function(e) {
    var t = (e && e.detail && e.detail.theme) || document.documentElement.getAttribute('data-theme') || 'dark';
    _daxiSyncAllSuggestionsTheme(t);
});
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { _daxiSyncAllSuggestionsTheme(); });
} else {
    _daxiSyncAllSuggestionsTheme();
}

function _daxiPositionSuggestionsBox(inputEl, box) {
    if (!inputEl || !box || box.classList.contains('hidden')) return;
    _daxiEnsureSuggestionsOnBody(box);
    var rect = inputEl.getBoundingClientRect();
    var maxH = 320;
    var place = _daxiSuggestDropdownTop(inputEl, maxH);
    box.style.position = 'fixed';
    box.style.left = Math.max(8, rect.left) + 'px';
    box.style.width = Math.max(120, rect.width) + 'px';
    box.style.right = 'auto';
    box.style.top = place.topPx + 'px';
    box.style.bottom = 'auto';
    box.style.maxHeight = place.maxH + 'px';
    box.style.zIndex = '100500';
    box.style.boxSizing = 'border-box';
    if (typeof window._daxiApplySuggestionsBoxTheme === 'function') {
        window._daxiApplySuggestionsBoxTheme(box);
    }
}

var _daxiPlacesService = null;
var _daxiPlacesDetails = null;

function _daxiBlurPlacesFieldAfterSelect(inputEl) {
    if (!inputEl) return;
    var active = inputEl;
    try {
        if (typeof _daxiGetPlacesActiveInput === 'function') {
            active = _daxiGetPlacesActiveInput(inputEl) || inputEl;
        }
    } catch (e) {}
    try {
        if (active && typeof active.blur === 'function') active.blur();
    } catch (e2) {}
    if (active !== inputEl) {
        try { if (inputEl.blur) inputEl.blur(); } catch (e3) {}
    }
}

function _daxiHideCustomSuggestions(box) {
    if (!box) return;
    if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[UI] hideSuggestions START', { rows: box.childElementCount, parent: box.parentElement && box.parentElement.id });
    box.classList.add('hidden');
    box.style.visibility = 'hidden';
    box.style.pointerEvents = 'none';
    box.setAttribute('aria-hidden', 'true');
    box._daxiSuggestClearGen = (box._daxiSuggestClearGen || 0) + 1;
    var gen = box._daxiSuggestClearGen;
    function clearDom() {
        if (box._daxiSuggestClearGen !== gen) return;
        if (!box.classList.contains('hidden')) return;
        if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[UI] hideSuggestions DOM clear');
        box.innerHTML = '';
        if (box._daxiSuggestHome && box.parentElement === document.body) {
            var home = box._daxiSuggestHome;
            if (home.next) home.parent.insertBefore(box, home.next);
            else home.parent.appendChild(box);
        }
        box.style.position = '';
        box.style.left = '';
        box.style.right = '';
        box.style.width = '';
        box.style.top = '';
        box.style.maxHeight = '';
        box.style.zIndex = '';
        box.style.visibility = '';
        box.style.pointerEvents = '';
        box.removeAttribute('aria-hidden');
        if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[UI] hideSuggestions END');
    }
    requestAnimationFrame(function() {
        requestAnimationFrame(clearDom);
    });
}

function _daxiEnsureSuggestionsOnBody(box) {
    if (!box || box.parentElement === document.body) return;
    if (!box._daxiSuggestHome) {
        box._daxiSuggestHome = { parent: box.parentNode, next: box.nextSibling };
    }
    document.body.appendChild(box);
}

function _daxiDeferAfterPaint(fn) {
    requestAnimationFrame(function() {
        requestAnimationFrame(fn);
    });
}
window._daxiDeferAfterPaint = _daxiDeferAfterPaint;

function _daxiPlaceSelectSeqValid(seq, inputEl) {
    return seq === window._daxiPlaceSelectSeq && inputEl && inputEl._daxiPlaceSelectSeq === seq;
}

function _daxiShowPlaceSelectError(inputEl, reason) {
    if (!inputEl) return;
    inputEl.dataset.placeSelected = 'error';
    if (typeof _daxiMapWarn === 'function') _daxiMapWarn('placeSelectError', reason);
    if (typeof _showMapPrecisionHint === 'function') {
        _showMapPrecisionHint('Lieu introuvable. Réessayez ou saisissez une autre adresse.', 4500, '⚠');
    }
}

function _daxiApplyPlaceSelectionImmediate(inputEl, label, opts) {
    opts = opts || {};
    if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[UI] input update START', { input: inputEl && inputEl.id, label: label });
    var cleanLabel = label || '';
    try {
        if (typeof _cleanPlaceName === 'function') cleanLabel = _cleanPlaceName({}, cleanLabel) || cleanLabel;
    } catch (e) {}
    inputEl.value = cleanLabel;
    inputEl.dataset.placeSelected = 'pending';
    if (opts && opts.placeId) inputEl.dataset.placeId = opts.placeId;
    inputEl.dataset.lat = '';
    inputEl.dataset.lng = '';
    if (typeof _clearUncoveredBlock === 'function') _clearUncoveredBlock(inputEl);
    if (typeof _daxiSyncPlacesInputDisplay === 'function') _daxiSyncPlacesInputDisplay(inputEl, cleanLabel);
    var inputId = inputEl.id || '';
    if (inputId === 'destinationAddress') {
        var ph = document.getElementById('pickupHidden');
        if (ph) ph.value = cleanLabel;
    } else if (inputId === 'destinationAddressArrival') {
        var dh = document.getElementById('destinationHidden');
        if (dh) dh.value = cleanLabel;
    }
    var sid = opts.suggestionsId || inputEl.dataset.daxiSuggestionsId;
    if (sid) {
        var box = document.getElementById(sid);
        if (box && typeof _daxiHideCustomSuggestions === 'function') _daxiHideCustomSuggestions(box);
    }
    if (inputEl.classList.contains('destination-input') && typeof window._syncPlanWaypointsFromInputs === 'function') {
        window._syncPlanWaypointsFromInputs();
    }
    if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[UI] input update END');
    if (typeof _daxiBlurPlacesFieldAfterSelect === 'function') _daxiBlurPlacesFieldAfterSelect(inputEl);
}

function _daxiSchedulePlaceCoords(seq, inputEl, det, opts) {
    if (!_daxiPlaceSelectSeqValid(seq, inputEl)) return;
    _daxiApplyPlaceDetails(inputEl, det, opts);
}

function _daxiWaitForOnline(maxMs) {
    maxMs = maxMs == null ? 6000 : maxMs;
    var onlineNow = (typeof _daxiIsOnlineForHtmx === 'function') ? _daxiIsOnlineForHtmx() : (navigator.onLine !== false);
    if (onlineNow) return Promise.resolve(true);
    return new Promise(function(resolve) {
        var done = false;
        var timer = setTimeout(function() {
            var still = (typeof _daxiIsOnlineForHtmx === 'function') ? _daxiIsOnlineForHtmx() : (navigator.onLine !== false);
            finish(still);
        }, maxMs);
        function finish(ok) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            window.removeEventListener('online', onUp);
            resolve(!!ok);
        }
        function onUp() { finish(true); }
        window.addEventListener('online', onUp);
    });
}
window._daxiWaitForOnline = _daxiWaitForOnline;

function _daxiFetchPlaceDetailsBg(placeId, seq, inputEl, opts) {
    if (!placeId) {
        _daxiShowPlaceSelectError(inputEl, 'empty_place_id');
        return;
    }
    if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[PLACES] getPlace START', { placeId: placeId, seq: seq });
    if (window.DaxiAndroid && typeof DaxiAndroid.fetchPlaceDetailsAsync === 'function') {
        var cbId = 'pd_' + seq;
        var timeoutId = setTimeout(function() {
            if (window._daxiPlaceDetailsCbs && window._daxiPlaceDetailsCbs[cbId]) {
                delete window._daxiPlaceDetailsCbs[cbId];
                if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[PLACES] getPlace END', { path: 'native', error: 'timeout' });
                if (_daxiPlaceSelectSeqValid(seq, inputEl)) {
                    viaServer().then(function(serverDet) {
                        if (!_daxiPlaceSelectSeqValid(seq, inputEl)) return;
                        if (serverDet && serverDet.lat != null && serverDet.lng != null) {
                            _daxiSchedulePlaceCoords(seq, inputEl, serverDet, opts);
                            return;
                        }
                        _daxiShowPlaceSelectError(inputEl, 'timeout');
                    }).catch(function() {
                        if (_daxiPlaceSelectSeqValid(seq, inputEl)) _daxiShowPlaceSelectError(inputEl, 'timeout');
                    });
                }
            }
        }, 12000);
        window._daxiPlaceDetailsCbs = window._daxiPlaceDetailsCbs || {};
        window._daxiPlaceDetailsCbs[cbId] = function(jsonStr) {
            clearTimeout(timeoutId);
            delete window._daxiPlaceDetailsCbs[cbId];
            if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[CAPACITOR] bridge END', { cbId: cbId, bytes: jsonStr ? jsonStr.length : 0 });
            if (!_daxiPlaceSelectSeqValid(seq, inputEl)) return;
            try {
                var det = JSON.parse(jsonStr);
                if (det.error || det.lat == null || det.lng == null) {
                    if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[PLACES] getPlace END', { path: 'native', error: det.error || 'no_coords' });
                    _daxiShowPlaceSelectError(inputEl, det.error || 'no_coords');
                    return;
                }
                if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[PLACES] getPlace END', { path: 'native' });
                _daxiSchedulePlaceCoords(seq, inputEl, det, opts);
            } catch (e) {
                if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[PLACES] getPlace END', { path: 'native', error: 'parse' });
                _daxiShowPlaceSelectError(inputEl, 'parse');
            }
        };
        if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[CAPACITOR] bridge START', { cbId: cbId, placeId: placeId });
        DaxiAndroid.fetchPlaceDetailsAsync(placeId, cbId);
        return;
    }
    function viaServerOnce() {
        if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[PLACES] viaServer HTTP START');
        var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var t = ctrl ? setTimeout(function() { try { ctrl.abort(); } catch (e) {} }, 8000) : null;
        return fetch('/api/places/details/?place_id=' + encodeURIComponent(placeId), {
            credentials: 'include',
            signal: ctrl ? ctrl.signal : undefined
        }).then(function(res) {
            if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[PLACES] viaServer HTTP status', { ok: res.ok, status: res.status });
            if (t) clearTimeout(t);
            if (!res.ok) throw new Error('http_' + res.status);
            return res.json();
        }).then(function(json) {
            if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[PLACES] viaServer JSON parsed', { lat: json && json.lat, lng: json && json.lng });
            return json;
        }).catch(function(e) {
            if (t) clearTimeout(t);
            if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[PLACES] viaServer FAIL', { err: String(e && e.message || e) });
            throw e;
        });
    }
    function viaServer() {
        var attempt = 0;
        function next() {
            attempt += 1;
            var waitFn = window._daxiWaitForOnline || function() { return Promise.resolve(true); };
            return waitFn(4500).then(function() {
                return viaServerOnce();
            }).catch(function(e) {
                if (attempt < 3 && _daxiPlaceSelectSeqValid(seq, inputEl)) {
                    if (typeof _showMapPrecisionHint === 'function' && attempt === 1) {
                        _showMapPrecisionHint('Connexion instable, nouvel essai…', 2200, '↻');
                    }
                    return new Promise(function(resolve) { setTimeout(resolve, 400 * attempt); }).then(next);
                }
                throw e;
            });
        }
        return next();
    }
    function viaGoogleJs() {
        if (window._daxiCapacitorApp || (typeof window._daxiIsNativeApp === 'function' && window._daxiIsNativeApp())) {
            if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[PLACES] viaGoogleJs SKIPPED (native/capacitor)');
            return Promise.resolve(null);
        }
        if (!window.google || !google.maps || !google.maps.places) return Promise.resolve(null);
        var P = google.maps.places.Place;
        if (P) {
            var place = new P({ id: placeId });
            if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[PLACES] fetchFields START');
            return place.fetchFields({ fields: ['location', 'displayName', 'formattedAddress', 'id'] }).then(function() {
                if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[PLACES] fetchFields END');
                var loc = place.location;
                if (!loc) return null;
                var lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat;
                var lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng;
                var dn = place.displayName;
                return {
                    place_id: place.id || placeId,
                    lat: lat,
                    lng: lng,
                    name: (dn && (dn.text || dn)) || '',
                    formatted_address: place.formattedAddress || ''
                };
            }).catch(function() { return null; });
        }
        if (google.maps.places.PlacesService && document.getElementById('daxi-main-map')) {
            return new Promise(function(resolve) {
                try {
                    var svc = new google.maps.places.PlacesService(document.getElementById('daxi-main-map'));
                    svc.getDetails({ placeId: placeId, fields: ['geometry', 'formatted_address', 'name', 'place_id'] }, function(res, status) {
                        if (status !== 'OK' || !res || !res.geometry || !res.geometry.location) return resolve(null);
                        resolve({
                            place_id: res.place_id || placeId,
                            lat: res.geometry.location.lat(),
                            lng: res.geometry.location.lng(),
                            name: res.name || '',
                            formatted_address: res.formatted_address || ''
                        });
                    });
                } catch (e) { resolve(null); }
            });
        }
        return Promise.resolve(null);
    }
    viaServer().then(function(serverDet) {
        if (!_daxiPlaceSelectSeqValid(seq, inputEl)) return;
        if (serverDet && serverDet.lat != null && serverDet.lng != null) {
            if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[PLACES] getPlace END', { path: 'viaServer' });
            _daxiSchedulePlaceCoords(seq, inputEl, serverDet, opts);
            return;
        }
        return viaGoogleJs().then(function(det) {
            if (!_daxiPlaceSelectSeqValid(seq, inputEl)) return;
            if (det && det.lat != null && det.lng != null) {
                if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[PLACES] getPlace END', { path: 'viaGoogleJs' });
                _daxiSchedulePlaceCoords(seq, inputEl, det, opts);
                return;
            }
            if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[PLACES] getPlace END', { path: 'none', error: 'no_coords' });
            _daxiShowPlaceSelectError(inputEl, 'no_coords');
        });
    }).catch(function() {
        if (!_daxiPlaceSelectSeqValid(seq, inputEl)) return;
        viaGoogleJs().then(function(det) {
            if (!_daxiPlaceSelectSeqValid(seq, inputEl)) return;
            if (det && det.lat != null && det.lng != null) {
                if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[PLACES] getPlace END', { path: 'viaGoogleJs-fallback' });
                _daxiSchedulePlaceCoords(seq, inputEl, det, opts);
                return;
            }
            if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[PLACES] getPlace END', { path: 'fallback', error: 'fetch_failed' });
            _daxiShowPlaceSelectError(inputEl, 'fetch_failed');
        });
    });
}

function _daxiApplyPlaceDetails(inputEl, det, opts) {
    if (!det || det.lat == null || det.lng == null) return;
    if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[PLACES] coordonnées obtenues', { lat: det.lat, lng: det.lng, source: det.source || '' });
    inputEl.dataset.placeSelected = '1';
    var detPlace = {
        geometry: { location: { lat: function() { return +det.lat; }, lng: function() { return +det.lng; } } },
        place_id: det.place_id || ''
    };
    var extra = {
        geometry_type: det.geometry_type || 'point',
        geometry: det.geometry || null,
    };
    _daxiOnPlaceSelected(inputEl, detPlace, opts, inputEl._daxiLockedPlaceLabel || det.formatted_address || det.name || inputEl.value, extra);
}

function _daxiSelectPrediction(inputEl, item, opts) {
    if (!item || !inputEl) return;
    opts = opts || {};
    if (typeof _daxiPlacesTraceReset === 'function') {
        var _nowSel = typeof _daxiPlacesNow === 'function' ? _daxiPlacesNow() : Date.now();
        if (!window._daxiPlacesTraceT0 || (_nowSel - window._daxiPlacesTraceT0) > 80) {
            _daxiPlacesTraceReset('selectPrediction');
        }
    }
    if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[PLACES] suggestion sélectionnée', {
        input: inputEl.id,
        place_id: item.place_id || '',
        local: !!item._daxiLocal,
        hasCoords: item.lat != null && item.lng != null,
        newApi: !!item._newApi
    });
    var catalog = window.DaxiPlacesCatalog;
    var pid = item.place_id || '';
    var label = item.description || item.formatted_address || inputEl.value || '';

    inputEl._daxiSuggestReqId = (inputEl._daxiSuggestReqId || 0) + 1;
    window._daxiPlaceSelectSeq = (window._daxiPlaceSelectSeq || 0) + 1;
    var seq = window._daxiPlaceSelectSeq;
    inputEl._daxiPlaceSelectSeq = seq;
    inputEl._daxiLockedPlaceLabel = label;
    if (pid) inputEl.dataset.placeId = pid;

    _daxiApplyPlaceSelectionImmediate(inputEl, label, Object.assign({}, opts, { placeId: pid }));

    if (item._daxiLocal && item.lat != null && item.lng != null) {
        _daxiSchedulePlaceCoords(seq, inputEl, {
            place_id: pid,
            lat: item.lat,
            lng: item.lng,
            formatted_address: label,
            geometry_type: item.geometry_type || 'point',
            geometry: item.geometry || null,
        }, opts);
        return;
    }

    if (catalog && catalog.isDaxiId(pid)) {
        var full = catalog.getById(pid) || item;
        if (full.lat != null && full.lng != null) {
            _daxiSchedulePlaceCoords(seq, inputEl, {
                place_id: full.place_id || pid,
                lat: full.lat,
                lng: full.lng,
                formatted_address: full.description || label,
                geometry_type: full.geometry_type || 'point',
                geometry: full.geometry || null,
            }, opts);
            if (full.place_id && full.place_id.indexOf('daxi_known_') === 0) {
                fetch('/api/places/details/?place_id=' + encodeURIComponent(full.place_id), { credentials: 'include' }).catch(function() {});
            }
            return;
        }
        _daxiFetchPlaceDetailsBg(pid, seq, inputEl, opts);
        return;
    }

    if (!catalog || !catalog.isGoogleId(pid)) {
        if (_daxiHasNativePlacesBridge && _daxiHasNativePlacesBridge()) {
            _daxiShowPlaceSelectError(inputEl, 'invalid_id');
        } else {
            console.warn('[Daxi] Ignored invalid place_id for Google:', pid);
        }
        return;
    }

    _daxiFetchPlaceDetailsBg(pid, seq, inputEl, opts);
}

function _daxiFillCustomSuggestions(inputEl, containerId, query, opts) {
    var box = containerId ? document.getElementById(containerId) : null;
    if (!box || !inputEl) return;
    query = (query || '').trim();
    if (query.length < 2) {
        _daxiHideCustomSuggestions(box);
        return;
    }

    function renderItems(items) {
        if (!_daxiIsPlacesFieldFocused(inputEl)) return;
        if (!items || !items.length) {
            _daxiHideCustomSuggestions(box);
            return;
        }
        if (typeof _daxiPacItemPriority === 'function') {
            items.sort(function(a, b) {
                return _daxiPacItemPriority(b.description) - _daxiPacItemPriority(a.description);
            });
        }
        box._daxiSuggestClearGen = (box._daxiSuggestClearGen || 0) + 1;
        box.style.visibility = '';
        box.style.pointerEvents = '';
        box.removeAttribute('aria-hidden');
        box.innerHTML = '';
        items.slice(0, 12).forEach(function(item) {
            var row = document.createElement('div');
            row.className = 'suggestion-item';
            var text = document.createElement('span');
            text.textContent = item.description;
            row.appendChild(text);
            row.addEventListener('pointerdown', function(e) {
                e.preventDefault();
                e.stopPropagation();
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                window._daxiSelectingPlace = true;
                if (typeof _daxiPlacesTraceReset === 'function') _daxiPlacesTraceReset('pointerdown');
                if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[PLACES] pointerdown', { pointerId: e.pointerId, capture: false });
                _daxiSelectPrediction(inputEl, item, opts);
                if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[PLACES] pointerdown handler returned');
            }, true);
            row.addEventListener('pointerup', function(e) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[PLACES] pointerup', { pointerId: e.pointerId });
                _daxiHideCustomSuggestions(box);
                requestAnimationFrame(function() { window._daxiSelectingPlace = false; });
            }, true);
            row.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
            }, true);
            box.appendChild(row);
        });
        box.classList.remove('hidden');
        _daxiPositionSuggestionsBox(_daxiGetPlacesActiveInput(inputEl) || inputEl, box);
        if (typeof window._daxiApplySuggestionsBoxTheme === 'function') {
            window._daxiApplySuggestionsBoxTheme(box);
        }
    }

    var reqId = (inputEl._daxiSuggestReqId || 0) + 1;
    inputEl._daxiSuggestReqId = reqId;

    function paint(items) {
        if (inputEl._daxiSuggestReqId !== reqId) return;
        renderItems(items);
    }

    function getLocalInstant() {
        if (window.DaxiPlacesCatalog && DaxiPlacesCatalog.ready()) {
            return DaxiPlacesCatalog.search(query, 12);
        }
        return [];
    }

    var local = getLocalInstant();
    if (local.length) {
        _daxiFilterSuggestionsByCoverage(local).then(paint);
    }

    var localP = Promise.resolve(local);
    if (window.DaxiPlacesCatalog && !DaxiPlacesCatalog.ready()) {
        localP = DaxiPlacesCatalog.load().then(function() {
            return getLocalInstant();
        }).catch(function() { return []; });
        localP.then(function(l) {
            if (inputEl._daxiSuggestReqId !== reqId) return;
            local = l;
            if (l.length) _daxiFilterSuggestionsByCoverage(l).then(paint);
        });
    }

    _daxiFetchGooglePlaceSuggestions(query, inputEl).then(function(googleItems) {
        if (inputEl._daxiSuggestReqId !== reqId) return;
        return localP.then(function(l) {
            if (l.length) local = l;
            var merged = _daxiMergePlaceSuggestions(local, googleItems, 12);
            return _daxiFilterSuggestionsByCoverage(merged);
        });
    }).then(function(merged) {
        if (inputEl._daxiSuggestReqId !== reqId) return;
        if (merged && merged.length) paint(merged);
        else if (!local.length) _daxiHideCustomSuggestions(box);
    }).catch(function(e) {
        console.warn('[Daxi] suggestions failed:', e);
        if (!local.length) _daxiHideCustomSuggestions(box);
    });
}

function _daxiBoundsToLiteral(bounds) {
    if (!bounds) return null;
    if (bounds.west != null && bounds.north != null) return bounds;
    try {
        var sw = bounds.getSouthWest ? bounds.getSouthWest() : null;
        var ne = bounds.getNorthEast ? bounds.getNorthEast() : null;
        if (!sw || !ne) return null;
        return { west: sw.lng(), south: sw.lat(), east: ne.lng(), north: ne.lat() };
    } catch (e) { return null; }
}

function _daxiGetGmpWidget(inputEl) {
    if (!inputEl || !inputEl.id) return null;
    var parent = inputEl.parentElement;
    if (!parent) return null;
    return parent.querySelector('gmp-place-autocomplete[data-daxi-for="' + inputEl.id + '"]');
}

function _daxiGetPlacesActiveInput(inputEl) {
    return _daxiGetGmpWidget(inputEl) || inputEl;
}

function _daxiSyncPlacesInputDisplay(inputEl, value) {
    if (!inputEl) return;
    if (value != null) inputEl.value = value;
    var gmp = _daxiGetGmpWidget(inputEl);
    if (gmp && value != null) {
        try { gmp.value = value; } catch (e) {}
    }
}
window._daxiSyncPlacesInputDisplay = _daxiSyncPlacesInputDisplay;

function _daxiIsPlacesFieldFocused(inputEl) {
    var active = _daxiGetPlacesActiveInput(inputEl) || inputEl;
    return document.activeElement === inputEl || document.activeElement === active;
}

async function _daxiHandleGmpPlaceSelect(inputEl, gmp, opts, ev) {
    if (typeof _daxiIsNativeAndroid === 'function' && _daxiIsNativeAndroid()) return;
    try {
        var place;
        if (ev.placePrediction && typeof ev.placePrediction.toPlace === 'function') {
            place = ev.placePrediction.toPlace();
        } else if (ev.place) {
            place = ev.place;
        } else return;
        if (typeof _daxiPlacesTraceReset === 'function') _daxiPlacesTraceReset('gmp-select');
        if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[PLACES] GMP fetchFields START');
        await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'id'] });
        if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[PLACES] GMP fetchFields END');
        _daxiResetAcSessionToken(inputEl);
        var dn = place.displayName;
        var displayVal = place.formattedAddress || (dn && (dn.text || dn)) || gmp.value;
        _daxiOnPlaceSelected(inputEl, place, opts, displayVal);
        _daxiSyncPlacesInputDisplay(inputEl, inputEl.value);
    } catch (e) {
        console.warn('[Daxi] GMP place select failed', e);
    }
}

async function _daxiTryAttachGmpPlacesAC(inputEl, opts) {
    if (typeof _daxiIsNativeAndroid === 'function' && _daxiIsNativeAndroid()) return false;
    if (!inputEl || inputEl.dataset.daxiGmpAc) return false;
    try {
        var placesLib = await google.maps.importLibrary('places');
        var Pace = placesLib.PlaceAutocompleteElement;
        if (!Pace) return false;
        var gmpOpts = { includedRegionCodes: ['ht'] };
        var bias = _daxiBoundsToLiteral(_DAXI_ACTIVE_BOUNDS) || _daxiBoundsToLiteral(_HAITI_BOUNDS);
        if (bias) gmpOpts.locationBias = bias;
        var gmp = new Pace(gmpOpts);
        gmp.classList.add('daxi-place-ac');
        if (inputEl.className) {
            inputEl.className.split(/\s+/).forEach(function(c) {
                if (c && c !== 'daxi-place-ac-hidden') gmp.classList.add(c);
            });
        }
        if (inputEl.placeholder) gmp.placeholder = inputEl.placeholder;
        if (inputEl.value) gmp.value = inputEl.value;
        gmp.setAttribute('data-daxi-for', inputEl.id || '');
        var parent = inputEl.parentElement;
        if (!parent) return false;
        parent.insertBefore(gmp, inputEl.nextSibling);
        inputEl.classList.add('daxi-place-ac-hidden');
        inputEl.setAttribute('aria-hidden', 'true');
        inputEl.tabIndex = -1;
        inputEl.dataset.daxiGmpAc = '1';
        gmp.addEventListener('gmp-select', function(ev) { _daxiHandleGmpPlaceSelect(inputEl, gmp, opts, ev); });
        gmp.addEventListener('gmp-placeselect', function(ev) { _daxiHandleGmpPlaceSelect(inputEl, gmp, opts, ev); });
        gmp.addEventListener('input', function() {
            inputEl.value = gmp.value;
            _clearPlaceCoordsForInput(inputEl);
            _clearUncoveredBlock(inputEl);
        });
        return true;
    } catch (e) {
        console.warn('[Daxi] PlaceAutocompleteElement init failed', e);
        return false;
    }
}

function _daxiCleanupGmpWidget(inputEl) {
    if (!inputEl) return;
    inputEl.classList.remove('daxi-place-ac-hidden');
    inputEl.removeAttribute('aria-hidden');
    if (inputEl.tabIndex < 0) inputEl.tabIndex = 0;
    inputEl.dataset.daxiGmpAc = '';
    var parent = inputEl.parentElement;
    if (!parent) return;
    var fid = inputEl.id || '';
    parent.querySelectorAll('gmp-place-autocomplete').forEach(function(el) {
        if (!fid || el.getAttribute('data-daxi-for') === fid) el.remove();
    });
}

function _daxiBindPlacesSuggestHandlers(inputEl, opts, suggestionsId, hasGmp) {
    var activeEl = _daxiGetPlacesActiveInput(inputEl) || inputEl;
    function onInput() {
        if (activeEl !== inputEl) inputEl.value = activeEl.value;
        _clearPlaceCoordsForInput(inputEl);
        _clearUncoveredBlock(inputEl);
        var q = activeEl.value || '';
        if (!suggestionsId || hasGmp) return;
        clearTimeout(inputEl._daxiSuggestTimer);
        inputEl._daxiSuggestTimer = setTimeout(function() {
            _daxiFillCustomSuggestions(inputEl, suggestionsId, q, opts);
        }, 140);
    }
    function onBlur() {
        clearTimeout(inputEl._daxiSuggestTimer);
        if (!suggestionsId) return;
        setTimeout(function() {
            var box = document.getElementById(suggestionsId);
            if (box) _daxiHideCustomSuggestions(box);
        }, 180);
    }
    function onFocus() {
        var q = (activeEl.value || '').trim();
        if (q.length >= 2 && suggestionsId && !hasGmp) {
            _daxiFillCustomSuggestions(inputEl, suggestionsId, q, opts);
        }
        if (!hasGmp) _daxiBindMobilePac(activeEl);
        if (_daxiIsMobileBookingUI()) {
            setTimeout(function() {
                _daxiPositionPacForInput(activeEl);
                if (suggestionsId) {
                    var box = document.getElementById(suggestionsId);
                    if (box && !box.classList.contains('hidden')) _daxiPositionSuggestionsBox(activeEl, box);
                }
            }, 40);
        }
    }
    activeEl.addEventListener('input', onInput);
    activeEl.addEventListener('blur', onBlur);
    activeEl.addEventListener('focus', onFocus);
    if (activeEl !== inputEl) {
        inputEl.addEventListener('input', onInput);
        inputEl.addEventListener('blur', onBlur);
        inputEl.addEventListener('focus', onFocus);
    }
    if (!hasGmp) _daxiBindMobilePac(activeEl);
}

async function _daxiInitPlacesACAsync(inputEl, opts) {
    if (window.DaxiPlacesCatalog && !DaxiPlacesCatalog.ready()) {
        try { await DaxiPlacesCatalog.load(); } catch (e) {}
    }
    var suggestionsId = _daxiResolveSuggestionsId(inputEl, opts);
    if (suggestionsId) {
        opts.suggestionsId = suggestionsId;
        inputEl.dataset.daxiSuggestionsId = suggestionsId;
    }
    _daxiBindPlacesSuggestHandlers(inputEl, opts, suggestionsId, false);
}

function _attachPlacesAC(inputEl, opts) {
    if (!inputEl || inputEl.dataset.acInit) return;
    opts = opts || {};
    _daxiCleanupGmpWidget(inputEl);
    inputEl.dataset.acInit = '1';
    _daxiInitPlacesACAsync(inputEl, opts).catch(function(e) {
        console.warn('[Daxi] Places AC init failed for', inputEl.id || inputEl.name, e);
        var suggestionsId = _daxiResolveSuggestionsId(inputEl, opts);
        _daxiBindPlacesSuggestHandlers(inputEl, opts, suggestionsId, false);
    });
}

function _daxiAttachInlinePlacesAC(inputEl, onCoords) {
    if (!inputEl || inputEl.dataset.acInit) return;
    var boxId = inputEl.id ? (inputEl.id + '-suggestions') : ('daxi-inline-suggest-' + Date.now());
    var box = document.getElementById(boxId);
    if (!box) {
        box = document.createElement('div');
        box.id = boxId;
        box.className = 'suggestions-container hidden';
        box.setAttribute('data-no-translate', '1');
        if (typeof window._daxiApplySuggestionsBoxTheme === 'function') {
            window._daxiApplySuggestionsBoxTheme(box);
        }
        document.body.appendChild(box);
    }
    _attachPlacesAC(inputEl, {
        suggestionsId: boxId,
        onPlace: function(place) {
            var parts = _daxiPlaceCoords(place);
            if (!parts) return;
            inputEl.dataset.lat = parts.lat;
            inputEl.dataset.lng = parts.lng;
            if (typeof onCoords === 'function') onCoords(parts, inputEl.value);
        }
    });
}

function _daxiBindMobilePac(inputEl) {
    if (!inputEl || inputEl.dataset.pacMobile) return;
    inputEl.dataset.pacMobile = '1';
    var repositionTimer = null;
    function reposition() {
        var root = inputEl.id ? document.getElementById(inputEl.id) : inputEl;
        var activeEl = (root && _daxiGetPlacesActiveInput(root)) || inputEl;
        if (!_daxiIsPlacesFieldFocused(root || inputEl)) return;
        var vv = window.visualViewport;
        var kbHeight = vv ? (window.innerHeight - vv.height - (vv.offsetTop || 0)) : 0;
        if (kbHeight > 50) {
            document.body.classList.add('daxi-kb-open');
        } else if (!_daxiIsMobileBookingUI()) {
            document.body.classList.remove('daxi-kb-open');
            _daxiClearPacInlineLayout();
            return;
        } else {
            document.body.classList.remove('daxi-kb-open');
        }
        _daxiPositionPacForInput(activeEl);
        var sid = (root || inputEl).dataset.daxiSuggestionsId;
        if (sid) {
            var box = document.getElementById(sid);
            if (box && !box.classList.contains('hidden')) _daxiPositionSuggestionsBox(activeEl, box);
        }
        if (typeof _daxiSortPacByCoverage === 'function') _daxiSortPacByCoverage();
    }
    function scheduleReposition() {
        clearTimeout(repositionTimer);
        repositionTimer = setTimeout(reposition, 50);
    }
    inputEl.addEventListener('focus', function() {
        setTimeout(reposition, 30);
        setTimeout(reposition, 200);
    });
    inputEl.addEventListener('blur', function() {
        setTimeout(function() {
            if (document.activeElement !== inputEl) {
                document.body.classList.remove('daxi-kb-open');
                _daxiClearPacInlineLayout();
            }
        }, 200);
    });
    inputEl.addEventListener('input', scheduleReposition);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', scheduleReposition);
        window.visualViewport.addEventListener('scroll', scheduleReposition);
    }
}

var _DAXI_COVERED_CITY_HINTS = ['cap-haitien', 'cap-haïtien', 'cap haitien', 'limonade', 'quartier-morin', 'quartier morin', 'milot', 'dondon', 'plaine du nord', 'okap'];
var _DAXI_UNCOVERED_CITY_HINTS = ['port-au-prince', 'port au prince', 'delmas', 'petion-ville', 'pétion-ville', 'carrefour', 'cité soleil', 'tabarre'];

function _daxiNormalizePlaceText(text) {
    return (text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function _daxiPacItemPriority(text) {
    var t = _daxiNormalizePlaceText(text);
    var i;
    for (i = 0; i < _DAXI_UNCOVERED_CITY_HINTS.length; i++) {
        if (t.indexOf(_daxiNormalizePlaceText(_DAXI_UNCOVERED_CITY_HINTS[i])) !== -1) return -1;
    }
    if (_DAXI_DEPTS_READY) {
        var covered = _DAXI_ALL_DEPTS.filter(function(d) { return d.is_active; });
        for (i = 0; i < covered.length; i++) {
            var name = _daxiNormalizePlaceText(covered[i].name || '');
            if (name && t.indexOf(name) !== -1) return 3;
        }
    }
    if (window._DAXI_ACTIVE_DEPT && window._DAXI_ACTIVE_DEPT.name) {
        var activeName = _daxiNormalizePlaceText(window._DAXI_ACTIVE_DEPT.name);
        if (activeName && t.indexOf(activeName) !== -1) return 5;
    }
    for (i = 0; i < _DAXI_COVERED_CITY_HINTS.length; i++) {
        if (t.indexOf(_daxiNormalizePlaceText(_DAXI_COVERED_CITY_HINTS[i])) !== -1) return 4;
    }
    if (window._DAXI_ACTIVE_DEPT && window._DAXI_ACTIVE_DEPT.is_active) return 1;
    return 0;
}

function _daxiSortPacByCoverage() {
    if (window._daxiSortingPac) return;
    window._daxiSortingPac = true;
    try {
        var containers = document.querySelectorAll('.pac-container');
        containers.forEach(function(pac) {
            if (!pac.querySelector('.pac-item')) return;
            var items = Array.prototype.slice.call(pac.querySelectorAll('.pac-item'));
            if (items.length < 2) return;
            items.sort(function(a, b) {
                return _daxiPacItemPriority(b.textContent) - _daxiPacItemPriority(a.textContent);
            });
            var needSort = false;
            for (var i = 0; i < items.length; i++) {
                if (pac.children[i] !== items[i]) { needSort = true; break; }
            }
            if (!needSort) return;
            items.forEach(function(item) { pac.appendChild(item); });
        });
        _daxiFilterPacByCoverage();
    } finally {
        window._daxiSortingPac = false;
    }
}

function _daxiFilterPacByCoverage() {
    if (!_DAXI_DEPTS_READY) return;
    document.querySelectorAll('.pac-container .pac-item').forEach(function(item) {
        var pri = typeof _daxiPacItemPriority === 'function' ? _daxiPacItemPriority(item.textContent) : 1;
        item.style.display = pri > 0 ? '' : 'none';
    });
}

async function _daxiFilterSuggestionsByCoverage(items) {
    if (!items || !items.length) return [];
    if (!_DAXI_DEPTS_READY) return items.slice(0, 12);
    var filtered = [];
    for (var i = 0; i < items.length && filtered.length < 12; i++) {
        var item = items[i];
        var pri = typeof _daxiPacItemPriority === 'function' ? _daxiPacItemPriority(item.description || '') : 1;
        if (pri < 0) continue;
        if (item.lat != null && item.lng != null) {
            if (_isPlaceCovered(+item.lat, +item.lng)) filtered.push(item);
            continue;
        }

        var desc = String(item.description || '').toLowerCase();
        if (/port-au-prince|pétion|petion|delmas|carrefour|tabarre|gonaïves|gonaives|cayes|jacmel|jérémie|jeremie/.test(desc)) {
            continue;
        }
        filtered.push(item);
    }
    return filtered;
}

function initPlacesAutocomplete() {
    _initPlacesAutocompleteAsync().catch(function(err) {
        console.error('[Daxi Maps] Places init failed:', err);
        if (window._daxiTryDismissInitialLoader) window._daxiTryDismissInitialLoader();
        else if (window._daxiDismissInitialLoader) window._daxiDismissInitialLoader();
    });
}

function _daxiIsGoogleMapsReady() {
    return !!(window.google && window.google.maps && typeof window.google.maps.Map === 'function');
}
async function _daxiEnsureGoogleMapsReady() {
    if (!window.google || !window.google.maps) return false;
    if (_daxiIsGoogleMapsReady()) return true;
    try {
        if (typeof google.maps.importLibrary === 'function') {
            await google.maps.importLibrary('maps');
            await google.maps.importLibrary('geometry');
            await google.maps.importLibrary('places');
            await google.maps.importLibrary('marker');
        }
    } catch (e) {
        console.warn('[Daxi Maps] importLibrary(maps) failed — API legacy:', e);
    }
    return _daxiIsGoogleMapsReady();
}
window._daxiIsGoogleMapsReady = _daxiIsGoogleMapsReady;
window._daxiEnsureGoogleMapsReady = _daxiEnsureGoogleMapsReady;

function _daxiMapDevLog(msg, extra) {
    if (window.DAXI_API_DEBUG_LOGS === false) return;
    if (extra !== undefined) console.info('[DAXI MAP]', msg, extra);
    else console.info('[DAXI MAP]', msg);
}
window._daxiMapDevLog = _daxiMapDevLog;

function _daxiPreferGoogleMaps() {
    if (window.DAXI_USE_GOOGLE_MAPS === false) return false;
    if (window.DAXI_USE_GOOGLE_MAPS === true) return true;
    if (window.DAXI_USE_MAPLIBRE === true || window._DAXI_USE_MAPLIBRE === true) return false;
    if (window._daxiCapacitorApp) return true;
    return true;
}
window._daxiPreferGoogleMaps = _daxiPreferGoogleMaps;

window._DAXI_MAP_PHASE = window._DAXI_MAP_PHASE || 'MAP_LOADING';
window._daxiGoogleMapHasBeenShown = !!window._daxiGoogleMapHasBeenShown;

function _daxiSetMapPhase(phase) {
    if (window._DAXI_MAP_PHASE === 'MAP_VISIBLE' && phase !== 'MAP_VISIBLE') return window._DAXI_MAP_PHASE;
    window._DAXI_MAP_PHASE = phase;
    return phase;
}

function _daxiBlockMapPlaceholderMutations() {
    if (window._daxiGoogleMapHasBeenShown || window._DAXI_MAP_PHASE === 'MAP_VISIBLE') return true;
    if (!(window._daxiPreferGoogleMaps && window._daxiPreferGoogleMaps())) return false;
    var p = window._DAXI_MAP_PHASE;
    return p === 'MAP_LOADING' || p === 'MAP_RENDERING' || p === 'MAP_READY';
}
window._daxiBlockMapPlaceholderMutations = _daxiBlockMapPlaceholderMutations;

function _daxiPlaceholderLog(action, reason) {
    if (window.DAXI_API_DEBUG_LOGS === false) return;
    console.info('[DAXI MAP PLACEHOLDER] ' + action + ' reason=' + (reason || 'unknown'));
}

function _daxiLogMapVisibility() {
    var ph = document.getElementById('daxi-map-placeholder');
    var stage = document.getElementById('daxi-map-stage');
    var phVis = true;
    if (document.documentElement.classList.contains('daxi-placeholder-gone')) phVis = false;
    if (stage && stage.classList.contains('daxi-placeholder-gone')) phVis = false;
    if (ph) {
        try {
            var ps = window.getComputedStyle(ph);
            if (ps.display === 'none' || ps.visibility === 'hidden' || parseFloat(ps.opacity) === 0) phVis = false;
        } catch (e1) {}
    }
    var mapVis = !!(stage && stage.classList.contains('daxi-map-css-visible'));
    var key = String(!!phVis) + '|' + String(!!mapVis);
    if (window._daxiLastVisibilityLog === key) return;
    window._daxiLastVisibilityLog = key;
    console.info('[DAXI MAP VISIBILITY]\nplaceholder=' + phVis + '\nmapVisible=' + mapVis);
}
window._daxiLogMapVisibility = _daxiLogMapVisibility;

function _daxiMapContainerHasSize(el) {
    if (!el) return false;
    try {
        var st = window.getComputedStyle(el);
        if (st.display === 'none') return false;
        var r = el.getBoundingClientRect();
        return r.width > 8 && r.height > 8;
    } catch (e) {
        return false;
    }
}

function _daxiGoogleMapInstanceReady(map) {
    map = map || window._clientBgMap;
    if (!window.google || !window.google.maps || !map) return false;
    try {
        var c = map.getCenter && map.getCenter();
        var z = map.getZoom && map.getZoom();
        if (!c || z == null || isNaN(z)) return false;
        var lat = typeof c.lat === 'function' ? c.lat() : c.lat;
        var lng = typeof c.lng === 'function' ? c.lng() : c.lng;
        if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return false;
        var div = map.getDiv ? map.getDiv() : null;
        if (!div) return false;
        if (!(div.offsetWidth > 0 && div.offsetHeight > 0)) return false;
    } catch (e) {
        return false;
    }
    return true;
}

function _daxiGoogleMapHasFirstRender(map) {
    map = map || window._clientBgMap;
    if (!_daxiGoogleMapInstanceReady(map)) return false;
    try {
        var div = map.getDiv();
        if (!div) return false;
        if (div.querySelector('.gm-err-container, .gm-err-message')) return false;
        var gm = div.querySelector('.gm-style');
        if (!gm) return false;
        var canvas = gm.querySelector('canvas');
        if (canvas && (canvas.width > 32 || canvas.offsetWidth > 32)) return true;
        var img = gm.querySelector('img[src]');
        if (img && (img.naturalWidth > 32 || img.offsetWidth > 32)) return true;
        if (window._daxiMapReady && window._daxiMapReady.tiles && gm.childElementCount > 1) return true;
    } catch (e) {
        return false;
    }
    return false;
}

function _daxiMainMapCssVisibleEnough() {
    var el = document.getElementById('daxi-main-map');
    if (!el) return false;
    try {
        var st = window.getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden') return false;
        if (!(parseFloat(st.opacity) > 0)) return false;
        if (!(el.offsetWidth > 0 && el.offsetHeight > 0)) return false;
    } catch (e) {
        return false;
    }
    return true;
}

function _daxiCanHideMapPlaceholder() {
    if (!_daxiMainMapCssVisibleEnough()) return false;
    if (!_daxiGoogleMapHasFirstRender()) return false;
    return true;
}

function _daxiEnsureGoogleMapSized(reason) {
    var map = window._clientBgMap;
    if (!map || !window.google || !google.maps) return;
    try { google.maps.event.trigger(map, 'resize'); } catch (e) {}
    try {
        var c = map.getCenter && map.getCenter();
        if (c) map.setCenter(c);
    } catch (e2) {}
}

function _daxiPlaceholderShow(reason) {
    if (window._daxiGoogleMapHasBeenShown || window._DAXI_MAP_PHASE === 'MAP_VISIBLE') {
        _daxiPlaceholderLog('SHOW skipped', reason || 'locked');
        return;
    }
    _daxiPlaceholderLog('SHOW', reason || 'unknown');
    var stage = document.getElementById('daxi-map-stage');
    var ph = document.getElementById('daxi-map-placeholder');
    document.documentElement.classList.remove('daxi-placeholder-gone');
    if (stage) stage.classList.remove('daxi-placeholder-gone');
    if (ph) {
        ph.removeAttribute('aria-hidden');
        ph.style.removeProperty('display');
        ph.style.removeProperty('opacity');
        ph.style.removeProperty('visibility');
        ph.style.removeProperty('pointer-events');
        ph.style.zIndex = '50';
        ph.style.opacity = '1';
        ph.style.visibility = 'visible';
    }
    _daxiLogMapVisibility();
}

function _daxiMakeMapCssVisible() {
    var stage = document.getElementById('daxi-map-stage');
    var el = document.getElementById('daxi-main-map');
    if (stage) stage.classList.add('daxi-map-css-visible');
    if (el) {
        el.style.visibility = 'visible';
        el.style.opacity = '1';
    }
    _daxiEnsureGoogleMapSized('map-css-visible');
    _daxiLogMapVisibility();
}

function _daxiPlaceholderHide(reason) {
    if (window._daxiGoogleMapHasBeenShown) {
        _daxiMapDevLog('Map already visible');
        _daxiEnsureGoogleMapSized(reason || 'already-visible');
        return;
    }
    var force = reason === 'timeout-force' || reason === 'boot-timeout' || reason === 'force-hide';
    if (!force && !_daxiCanHideMapPlaceholder()) {
        _daxiPlaceholderLog('HIDE blocked', reason || 'not-painted');
        return;
    }
    _daxiPlaceholderLog('HIDE', reason || 'google-map-ready');
    window._daxiGoogleMapHasBeenShown = true;
    _daxiSetMapPhase('MAP_VISIBLE');
    window._daxiMapVisualReady = true;
    window._daxiMapPlaceholderHidden = true;
    window._daxiBootState = window._daxiBootState || {};
    window._daxiBootState.mapReady = true;
    var stage = document.getElementById('daxi-map-stage');
    var ph = document.getElementById('daxi-map-placeholder');
    if (stage) {
        stage.classList.add('is-live');
        stage.classList.add('daxi-placeholder-gone');
        stage.classList.add('daxi-map-css-visible');
    }
    document.documentElement.classList.add('daxi-map-live');
    document.documentElement.classList.add('daxi-placeholder-gone');
    if (ph) {
        ph.setAttribute('aria-hidden', 'true');
        ph.style.opacity = '0';
        ph.style.visibility = 'hidden';
        ph.style.pointerEvents = 'none';
        setTimeout(function() { ph.style.display = 'none'; }, 650);
    }
    _daxiLogMapVisibility();
    _daxiEnsureGoogleMapSized(reason || 'google-map-ready');
    if (typeof _daxiSyncClientGpsOnMapReady === 'function') {
        _daxiSyncClientGpsOnMapReady('map-visible');
    } else if (typeof _daxiFocusMapOnReadyGps === 'function') {
        setTimeout(function() { _daxiFocusMapOnReadyGps('map-visible'); }, 80);
    }
}

function _daxiTryCommitGoogleMapVisible(reason) {
    if (window._daxiGoogleMapHasBeenShown) {
        _daxiMapDevLog('Map already visible');
        _daxiEnsureGoogleMapSized(reason);
        return true;
    }
    if (reason === 'timeout' || reason === 'gps' || reason === 'location') return false;
    if (!_daxiGoogleMapInstanceReady()) {
        var el = document.getElementById('daxi-main-map');
        if (window._clientBgMap && !_daxiMapContainerHasSize(el)) {
            requestAnimationFrame(function() { _daxiTryCommitGoogleMapVisible(reason || 'resize'); });
        }
        if (!window._daxiMapForceRevealTimer) {
            window._daxiMapForceRevealTimer = setTimeout(function() {
                window._daxiMapForceRevealTimer = null;
                if (!window._daxiGoogleMapHasBeenShown && window._clientBgMap) {
                    _daxiPlaceholderHide('timeout-force');
                }
            }, 3500);
        }
        return false;
    }
    if (window._DAXI_MAP_PHASE !== 'MAP_VISIBLE') _daxiSetMapPhase('MAP_READY');
    _daxiMapDevLog('Map ready');
    if (!_daxiGoogleMapHasFirstRender()) return false;
    _daxiMakeMapCssVisible();
    _daxiEnsureGoogleMapSized(reason || 'pre-hide');
    var finish = function() {
        if (window._daxiGoogleMapHasBeenShown) return;
        if (!_daxiCanHideMapPlaceholder()) {
            setTimeout(function() { _daxiTryCommitGoogleMapVisible('paint-retry'); }, 400);
            return;
        }
        _daxiSetMapPhase('MAP_VISIBLE');
        _daxiPlaceholderHide(reason || 'first-render');
    };
    requestAnimationFrame(function() {
        requestAnimationFrame(function() {
            setTimeout(finish, 280);
        });
    });
    return false;
}

function _daxiScheduleGoogleMapCommit() {
    if (window._daxiGoogleMapCommitTimer) clearTimeout(window._daxiGoogleMapCommitTimer);
    window._daxiGoogleMapCommitTimer = setTimeout(function() {
        if (window._daxiGoogleMapHasBeenShown) return;
        if (_daxiCanHideMapPlaceholder()) _daxiTryCommitGoogleMapVisible('verified-ready');
        else _daxiPlaceholderLog('KEEP', 'google-not-ready');
    }, 12000);
}

function _daxiMapReady(engine) {
    engine = engine || (window._clientBgMap && window.google && window.google.maps ? 'google' : 'unknown');
    window._daxiMapEngine = engine;
    if (engine === 'google') {
        _daxiSetMapPhase('MAP_READY');
        return;
    }
    _daxiTryCommitGoogleMapVisible(engine || 'map-ready');
}
_daxiMapReady.idle = false;
_daxiMapReady.tiles = false;
window._daxiMapReady = _daxiMapReady;
window._daxiTryCommitGoogleMapVisible = _daxiTryCommitGoogleMapVisible;
window._daxiEnsureGoogleMapSized = _daxiEnsureGoogleMapSized;
window._daxiMakeMapCssVisible = _daxiMakeMapCssVisible;
window._daxiPlaceholderShow = _daxiPlaceholderShow;
window._daxiPlaceholderHide = _daxiPlaceholderHide;
if (typeof _daxiLogMapVisibility === 'function') _daxiLogMapVisibility();

function _daxiResetMapReadyFlags(idle, tiles) {
    if (typeof window._daxiMapReady !== 'function') {
        window._daxiMapReady = _daxiMapReady;
    }
    window._daxiMapReady.idle = !!idle;
    window._daxiMapReady.tiles = !!tiles;
}
window._daxiResetMapReadyFlags = _daxiResetMapReadyFlags;

function _daxiRecoverLiveGoogleMap(reason) {
    if (window._daxiGoogleMapHasBeenShown || window._DAXI_MAP_PHASE === 'MAP_VISIBLE') {
        _daxiEnsureGoogleMapSized(reason || 'recover');
        return false;
    }
    if (window._daxiBlockMapPlaceholderMutations && window._daxiBlockMapPlaceholderMutations() && window._clientBgMap) {
        _daxiEnsureGoogleMapSized(reason || 'recover-locked');
        return false;
    }
    if (window._clientBgMap && window.google && window.google.maps) {
        _daxiEnsureGoogleMapSized(reason || 'recover-existing');
        return false;
    }
    if (reason === 'place-selected') return false;
    if (reason !== 'offline-onNetworkReady' && reason !== 'manual-retry' && window._clientBgMap) {

        var mapEl = document.getElementById('daxi-main-map');
        var hasTiles = mapEl && mapEl.querySelector('.gm-style');
        if (hasTiles) return false;
        if (typeof _daxiIsGoogleMapVisuallyReady === 'function' && _daxiIsGoogleMapVisuallyReady()) return false;
    }
    var now = Date.now();
    if (window._daxiRecoverLiveGoogleMap._busy) return false;
    if (window._daxiRecoverLiveGoogleMap._last && now - window._daxiRecoverLiveGoogleMap._last < 4000) return false;
    window._daxiRecoverLiveGoogleMap._last = now;
    window._daxiRecoverLiveGoogleMap._busy = true;
    setTimeout(function() { window._daxiRecoverLiveGoogleMap._busy = false; }, 8000);
    if (typeof _daxiMapLog === 'function') {
        _daxiMapLog('recoverLiveGoogleMap', { reason: reason || '', online: navigator.onLine });
    }
    if (!navigator.onLine) return false;
    _daxiPlaceholderShow(reason || 'map-reset');
    window._daxiExternalMapsBlocked = false;
    window._daxiMapPlaceholderHidden = false;
    window._daxiBootVisualDone = false;
    window._daxiMapVisualReady = false;
    window.googleMapsLoaded = false;
    window._daxiMapsLoading = false;
    window._clientBgMap = null;
    _daxiClearMainMapPair();
    if (typeof window._daxiResetMapReadyFlags === 'function') window._daxiResetMapReadyFlags(false, false);
    window._daxiMapTilesReadySignaled = false;
    var el = document.getElementById('daxi-main-map');
    if (el) {
        el.innerHTML = '';
        el._mapInit = false;
    }
    if (window.DaxiMapPlaceholder) {
        if (DaxiMapPlaceholder.hideOfflineModal) DaxiMapPlaceholder.hideOfflineModal('daxi-map-stage');
    }
    try {
        sessionStorage.removeItem('daxi_maps_probe_failed');
        sessionStorage.removeItem('daxi_skip_tile_prefetch');
    } catch (e) {}
    if (typeof window._daxiLoadGoogleMaps === 'function') window._daxiLoadGoogleMaps();
    return true;
}
window._daxiRecoverLiveGoogleMap = _daxiRecoverLiveGoogleMap;

function _daxiMapHasRenderedTiles(mapOrDiv) {
    if (window.DaxiMapPlaceholder && DaxiMapPlaceholder.mapIsVisuallyReady) {
        return DaxiMapPlaceholder.mapIsVisuallyReady(mapOrDiv, {
            mapSignals: window._daxiMapReady || null
        });
    }
    return false;
}
window._daxiMapHasRenderedTiles = _daxiMapHasRenderedTiles;

function _daxiIsGoogleMapVisuallyReady() {
    if (window._daxiGoogleMapHasBeenShown) return true;
    if (window._daxiPreferGoogleMaps && window._daxiPreferGoogleMaps()) {
        return _daxiGoogleMapInstanceReady();
    }
    if (window._daxiMapLibreBg || window._daxiMapLibreReady) return true;
    if (window._daxiOfflineMapMode && window._clientBgMap) return true;
    if (!window._clientBgMap || !window.google || !window.google.maps) return false;
    return _daxiMapHasRenderedTiles(window._clientBgMap);
}
window._daxiIsGoogleMapVisuallyReady = _daxiIsGoogleMapVisuallyReady;

function _daxiTryRevealMapWhenReady() {
    if (!_daxiIsGoogleMapVisuallyReady()) return false;
    if (typeof window._daxiRevealLiveMap === 'function') window._daxiRevealLiveMap();
    return true;
}
window._daxiTryRevealMapWhenReady = _daxiTryRevealMapWhenReady;

function _daxiScheduleMapRevealCheck() {
    if (window.DaxiMapPlaceholder && DaxiMapPlaceholder.startLiveRevealWatcher) {
        DaxiMapPlaceholder.startLiveRevealWatcher('daxi-map-stage', {
            getMap: function() { return window._clientBgMap; },
            getMapEl: function() { return document.getElementById('daxi-main-map'); },
            canReveal: function() {
                if (window._daxiGoogleMapHasBeenShown) return true;
                if (window._daxiPreferGoogleMaps && window._daxiPreferGoogleMaps()) {
                    return _daxiGoogleMapInstanceReady();
                }
                if (window._daxiMapLibreBg || window._daxiMapLibreReady) return true;
                if (window._daxiOfflineMapMode && window._clientBgMap) return true;
                return !!(window._clientBgMap && window.google && window.google.maps);
            },
            onRevealed: function() {
                if (typeof window._daxiTryCommitGoogleMapVisible === 'function') {
                    window._daxiTryCommitGoogleMapVisible('watcher');
                }
            }
        });
        return;
    }
    if (window._daxiMapRevealPoll) return;
    function tick() {
        if (_daxiTryRevealMapWhenReady()) {
            window._daxiMapRevealPoll = null;
            return;
        }
        window._daxiMapRevealPoll = setTimeout(tick, 250);
    }
    tick();
}
window._daxiScheduleMapRevealCheck = _daxiScheduleMapRevealCheck;

function _daxiRestoreMapPlaceholderIfNeeded() {
    if (window._daxiGoogleMapHasBeenShown || window._DAXI_MAP_PHASE === 'MAP_VISIBLE') return;
    if (_daxiIsGoogleMapVisuallyReady()) return;
    if (window._clientBgMap && window.google && window.google.maps) return;
    _daxiPlaceholderShow('restore-if-needed');
}
window._daxiRestoreMapPlaceholderIfNeeded = _daxiRestoreMapPlaceholderIfNeeded;

function _daxiForceHideMapPlaceholder() {
    if (window._daxiPreferGoogleMaps && window._daxiPreferGoogleMaps()) {
        _daxiTryCommitGoogleMapVisible('force-hide-redirect');
        return;
    }
    _daxiPlaceholderHide('force-hide');
}

function _daxiRevealLiveMap(force) {
    if (window._daxiGoogleMapHasBeenShown) {
        _daxiMapDevLog('Map already visible');
        _daxiEnsureGoogleMapSized('reveal');
        if (typeof _daxiApplyMapViewportPadding === 'function') _daxiApplyMapViewportPadding();
        if (typeof _daxiFlushClientGpsToMap === 'function') _daxiFlushClientGpsToMap();
        return;
    }
    if (window._daxiPreferGoogleMaps && window._daxiPreferGoogleMaps()) {
        _daxiTryCommitGoogleMapVisible(force ? 'reveal-force' : 'reveal');
        return;
    }
    if (window._lastClientGpsPos && typeof _updateClientLocationVisual === 'function') {
        var gp = window._lastClientGpsPos;
        setTimeout(function() {
            _updateClientLocationVisual(gp.lat, gp.lng, gp.acc || 40, false);
        }, 80);
    }
    if (typeof _daxiFlushClientGpsToMap === 'function') _daxiFlushClientGpsToMap();
    if (typeof _daxiFlushPendingBookingMarkers === 'function') _daxiFlushPendingBookingMarkers();
    if (typeof _daxiSyncBookingMarkersFromForm === 'function') _daxiSyncBookingMarkersFromForm();
    if (window._daxiPendingMapTheme && window._clientBgMap && typeof _daxiApplyClientBgMapTheme === 'function') {
        _daxiApplyClientBgMapTheme(window._daxiPendingMapTheme);
    }
    if (typeof window._daxiStopMapsRetryLoop === 'function') window._daxiStopMapsRetryLoop();
}
window._daxiRevealLiveMap = _daxiRevealLiveMap;

function _daxiMapColorScheme(theme) {
    theme = theme || document.documentElement.getAttribute('data-theme') || 'dark';
    if (window.google && google.maps && google.maps.ColorScheme) {
        return theme === 'light' ? google.maps.ColorScheme.LIGHT : google.maps.ColorScheme.DARK;
    }
    return theme === 'light' ? 'LIGHT' : 'DARK';
}
function _daxiMapBgColor(theme) {
    theme = theme || document.documentElement.getAttribute('data-theme') || 'dark';
    return theme === 'light' ? '#F0F4F9' : '#070b14';
}
function _daxiApplyMapContainerTheme(theme) {
    theme = theme || document.documentElement.getAttribute('data-theme') || 'dark';
    if (window.DaxiMapPlaceholder && DaxiMapPlaceholder.applyTheme) {
        DaxiMapPlaceholder.applyTheme('daxi-map-stage', theme);
    }
    var isLight = theme === 'light';
    var mapEl = document.getElementById('daxi-main-map');
    var stage = document.getElementById('daxi-map-stage');
    if (mapEl) mapEl.style.background = 'transparent';
    if (stage) stage.setAttribute('data-map-theme', theme);
    document.documentElement.classList.toggle('daxi-map-theme-light', isLight);
    document.documentElement.classList.toggle('daxi-map-theme-dark', !isLight);
}
function _daxiApplyClientBgMapTheme(theme) {
    if (typeof window._daxiApplyMainBgMapTheme === 'function') {
        return window._daxiApplyMainBgMapTheme(theme);
    }
    theme = theme || document.documentElement.getAttribute('data-theme') || 'dark';
    if (window.DaxiMainMapDual && window._daxiMainMapPair && window.DaxiMainMapDual.applyTheme) {
        window.DaxiMainMapDual.applyTheme(theme);
        window._daxiClientMapTheme = theme;
        try { google.maps.event.trigger(window._clientBgMap, 'resize'); } catch (e) {}
        return true;
    }
    if (!window._clientBgMap) return false;
    if (window._daxiClientMapTheme === theme) {
        try { google.maps.event.trigger(window._clientBgMap, 'resize'); } catch (e) {}
        return true;
    }
    var ok = false;
    if (window.DaxiMapTheme && window.DaxiMapTheme.applyMainMapThemeInstant) {
        ok = window.DaxiMapTheme.applyMainMapThemeInstant(window._clientBgMap, theme);
    } else if (window.DaxiMapTheme && window.DaxiMapTheme.applyMainMapTheme) {
        ok = window.DaxiMapTheme.applyMainMapTheme(window._clientBgMap, theme);
    } else if (window.DaxiMapTheme && window.DaxiMapTheme.applyMapTheme) {
        ok = window.DaxiMapTheme.applyMapTheme(window._clientBgMap, theme);
    } else {
        try {
            window._clientBgMap.setOptions({
                colorScheme: _daxiMapColorScheme(theme),
                backgroundColor: _daxiMapBgColor(theme)
            });
            ok = true;
        } catch (e2) {
            ok = false;
        }
    }
    if (ok) window._daxiClientMapTheme = theme;
    return ok;
}
window._daxiClientMapTheme = null;

function _daxiCaptureMapView(map) {
    if (!map || !map.getCenter) return null;
    try {
        var c = map.getCenter();
        if (!c) return null;
        return {
            center: { lat: c.lat(), lng: c.lng() },
            zoom: map.getZoom(),
            tilt: map.getTilt ? map.getTilt() : 0,
            heading: map.getHeading ? map.getHeading() : 0
        };
    } catch (e) { return null; }
}

function _daxiDetachMainMapOverlays() {
    if (window._bookingMarkers) {
        ['pickup', 'dest'].forEach(function(k) {
            var m = window._bookingMarkers[k];
            if (!m) return;
            if (m._dom && m.overlay) m.overlay.setMap(null);
            else if (m.map != null) m.map = null;
            else if (m.setMap) m.setMap(null);
        });
    }
    if (window._bookingRouteGlow && window._bookingRouteGlow.setMap) window._bookingRouteGlow.setMap(null);
    if (window._bookingRouteLine && window._bookingRouteLine.setMap) window._bookingRouteLine.setMap(null);
    if (window._clientLocationMarker) {
        if (window._clientLocationMarkerIsAdvanced) window._clientLocationMarker.map = null;
        else if (window._clientLocationMarker.setMap) window._clientLocationMarker.setMap(null);
    }
    if (window._clientLocationAccuracyCircle && window._clientLocationAccuracyCircle.setMap) {
        window._clientLocationAccuracyCircle.setMap(null);
    }
}

function _daxiReattachMainMapOverlays() {
    var map = window._clientBgMap;
    if (!map) return;
    if (window._bookingMarkers) {
        ['pickup', 'dest'].forEach(function(k) {
            var m = window._bookingMarkers[k];
            if (!m) return;
            if (m._dom && m.overlay) m.overlay.setMap(map);
            else if (m.map != null) m.map = map;
            else if (m.setMap) m.setMap(map);
        });
    }
    if (window._bookingRouteGlow && window._bookingRouteGlow.setMap) window._bookingRouteGlow.setMap(map);
    if (window._bookingRouteLine && window._bookingRouteLine.setMap) window._bookingRouteLine.setMap(map);
    if (window._clientLocationMarker) {
        if (window._clientLocationMarkerIsAdvanced) window._clientLocationMarker.map = map;
        else if (window._clientLocationMarker.setMap) window._clientLocationMarker.setMap(map);
    }
    if (window._clientLocationAccuracyCircle && window._clientLocationAccuracyCircle.setMap) {
        window._clientLocationAccuracyCircle.setMap(null);
        window._clientLocationAccuracyCircle = null;
    }
}

function _daxiWireOneMainMapGmapsListeners(map) {
    if (!map || map._daxiGmapsListenersBound) return;
    map._daxiGmapsListenersBound = true;
    map.addListener('dragstart', function() {
        window._daxiMapUserInteracting = true;
        window._daxiMapDidDrag = true;
        window._daxiMapUserInteractedAt = Date.now();
    });
    map.addListener('zoom_changed', function() {
        window._daxiMapUserInteractedAt = Date.now();
    });
    map.addListener('dragend', function() {
        setTimeout(function() {
            window._daxiMapUserInteracting = false;
            window._daxiMapDidDrag = false;
        }, 120);
    });
    map.addListener('idle', function() {
        if (typeof _daxiRedrawBookingMarkers === 'function') _daxiRedrawBookingMarkers();
    });
    map.addListener('click', function(mapsMouseEvent) {
        if (window._daxiPinDragging) return;
        var domEvent = mapsMouseEvent && mapsMouseEvent.domEvent;
        _daxiCollapseSheetFromMapTap(domEvent || mapsMouseEvent);
    });
}

function _daxiWireClientBgMapInteractionListeners(bgEl) {
    if (window.DaxiMainMapDual && window._daxiMainMapPair) {
        var pair = window._daxiMainMapPair;
        if (pair.dark) _daxiWireOneMainMapGmapsListeners(pair.dark);
        if (pair.light) _daxiWireOneMainMapGmapsListeners(pair.light);
    } else if (window._clientBgMap) {
        _daxiWireOneMainMapGmapsListeners(window._clientBgMap);
    }
    if (!bgEl) return;
    window._daxiMapUserInteracting = false;
    window._daxiMapDidDrag = false;
    if (!window._daxiMapTapZoneReady) _initMapTapZone();
    else if (typeof _daxiWireMapCollapsePointer === 'function') _daxiWireMapCollapsePointer();
    if (bgEl._daxiTouchThemeBound) return;
    bgEl._daxiTouchThemeBound = true;
}

function _daxiSoftReinitTrackingMaps(theme) {
    if (!document.body.classList.contains('daxi-sheet-order-mode')) return;
    var had = false;
    document.querySelectorAll('#daxi-sheet-order-slot [data-daximap="1"][data-map-ready]').forEach(function(el) {
        had = true;
        el.dataset.daxiColorScheme = theme;
        var id = el.id.replace('daximap-', '');
        var inst = window._daxiMaps && window._daxiMaps[id];
        if (inst && inst.map && google.maps && google.maps.event) {
            try { google.maps.event.clearInstanceListeners(inst.map); } catch (e) {}
        }
        if (window._daxiMaps) delete window._daxiMaps[id];
        el.innerHTML = '';
        delete el.dataset.mapReady;
        el.style.opacity = '0';
    });
    if (had && typeof initDaxiMaps3D === 'function') {
        setTimeout(function() { initDaxiMaps3D(document.getElementById('daxi-sheet-order-slot')); }, 80);
    }
}

function _daxiRestoreMapSessionAfterReinit() {
    _daxiReattachMainMapOverlays();
    if (typeof _flushClientGpsToMap === 'function') _flushClientGpsToMap();
    if (window._bookingMarkers && (window._bookingMarkers.pickup || window._bookingMarkers.dest)) {
        if (typeof _updateBookingRoute === 'function') _updateBookingRoute();
        if (typeof _fitMapToBookingMarkers === 'function') _fitMapToBookingMarkers();
    }
    if (window._daxiMainMapFocusOrderId) {
        var el = document.getElementById('daximap-' + window._daxiMainMapFocusOrderId);
        if (!el) el = document.querySelector('[data-order-id="' + window._daxiMainMapFocusOrderId + '"]');
        if (el && typeof _daxiFitOrderOnMainMap === 'function') {
            var pLa = _df(el.dataset.meetingLat) || _df(el.dataset.pickupLat);
            var pLo = _df(el.dataset.meetingLng) || _df(el.dataset.pickupLng);
            var dLa = _df(el.dataset.destLat), dLo = _df(el.dataset.destLng);
            if (isFinite(pLa) && isFinite(pLo)) {
                _daxiFitOrderOnMainMap(el, pLa, pLo, dLa, dLo);
            }
        }
    }
    if (document.body.classList.contains('daxi-routes-mode') && window.DaxiRoutesMap && window.DaxiRoutesMap.enter) {
        try { window.DaxiRoutesMap.enter(); } catch (e) {}
    } else if (document.body.classList.contains('daxi-explorer-mode') && window.DaxiExplorerMap && window.DaxiExplorerMap.enter) {
        try { window.DaxiExplorerMap.enter(); } catch (e) {}
    }
}

function _daxiClientMapThemeNeedsReinit(map) {
    if (!map) return true;
    try {
        if (typeof map.getMapId === 'function' && map.getMapId()) return true;
    } catch (e) {}
    try {
        if (map.getRenderingType && map.getRenderingType() === 'VECTOR') return true;
    } catch (e) {}
    return false;
}

function _daxiReinitClientBgMap(theme) {
    theme = theme || document.documentElement.getAttribute('data-theme') || 'dark';
    if (window.DaxiMainMapDual && window._daxiMainMapPair && window.DaxiMainMapDual.applyTheme) {
        if (window._daxiClientMapTheme === theme) return false;
        window.DaxiMainMapDual.applyTheme(theme);
        window._daxiClientMapTheme = theme;
        _daxiApplyMapContainerTheme(theme);
        _daxiReattachMainMapOverlays();
        if (typeof _daxiFlushPendingBookingMarkers === 'function') _daxiFlushPendingBookingMarkers();
        if (typeof _daxiSyncBookingMarkersFromForm === 'function') _daxiSyncBookingMarkersFromForm();
        try { google.maps.event.trigger(window._clientBgMap, 'resize'); } catch (e) {}
        return true;
    }
    if (window._daxiClientMapTheme === theme && window._clientBgMap) return false;
    if (window._daxiMapReinitBusy) {
        window._daxiPendingMapTheme = theme;
        return false;
    }
    if (!_daxiIsGoogleMapsReady()) return false;
    var bgEl = document.getElementById('daxi-main-map');
    if (!bgEl) return false;
    var stage = document.getElementById('daxi-map-stage') || bgEl.parentElement;
    if (!window.DaxiMapTheme || !window.DaxiMapTheme.crossfade) {
        window._daxiMapReinitBusy = true;
        try {
            var restoreFast = _daxiCaptureMapView(window._clientBgMap);
            _daxiApplyMapContainerTheme(theme);
            if (window._clientBgMap && google.maps && google.maps.event) {
                try { google.maps.event.clearInstanceListeners(window._clientBgMap); } catch (e) {}
            }
            _daxiDetachMainMapOverlays();
            bgEl.innerHTML = '';
            bgEl._mapInit = false;
            window._clientBgMap = null;
            _daxiClearMainMapPair();
            _initClientBgMap({ theme: theme, restore: restoreFast, isReinit: true });
            _daxiRestoreMapSessionAfterReinit();
            window._daxiClientMapTheme = theme;
            return true;
        } finally {
            window._daxiMapReinitBusy = false;
        }
    }

    window._daxiMapReinitBusy = true;
    var restore = _daxiCaptureMapView(window._clientBgMap);
    _daxiDetachMainMapOverlays();
    bgEl.classList.add('daxi-map-swapping');
    if (!(window._daxiGoogleMapHasBeenShown) && window.DaxiMapPlaceholder && DaxiMapPlaceholder.showSwapPlaceholder) {
        DaxiMapPlaceholder.showSwapPlaceholder(stage, theme);
    }

    window.DaxiMapTheme.crossfade(stage, theme, function(finishVeil) {
        _daxiApplyMapContainerTheme(theme);
        if (window._clientBgMap && google.maps && google.maps.event) {
            try { google.maps.event.clearInstanceListeners(window._clientBgMap); } catch (e) {}
        }
        bgEl.innerHTML = '';
        bgEl._mapInit = false;
        window._clientBgMap = null;
        _daxiClearMainMapPair();
        _initClientBgMap({ theme: theme, restore: restore, isReinit: true });

        var completed = false;
        function done() {
            if (completed) return;
            completed = true;
            bgEl.classList.remove('daxi-map-swapping');
            _daxiRestoreMapSessionAfterReinit();
            window._daxiClientMapTheme = theme;
            window._daxiMapReinitBusy = false;
            finishVeil();
            _daxiSoftReinitTrackingMaps(theme);
            if (typeof _daxiScheduleMapRevealCheck === 'function') _daxiScheduleMapRevealCheck();
            if (window._daxiPendingMapTheme && window._daxiPendingMapTheme !== theme) {
                var pending = window._daxiPendingMapTheme;
                window._daxiPendingMapTheme = null;
                _daxiReinitClientBgMap(pending);
            } else {
                window._daxiPendingMapTheme = null;
            }
        }
        if (window._clientBgMap && google.maps && google.maps.event) {
            google.maps.event.addListenerOnce(window._clientBgMap, 'tilesloaded', done);
            setTimeout(done, 2800);
        } else {
            done();
        }
    });
    return true;
}
window._daxiReinitClientBgMap = _daxiReinitClientBgMap;

window._daxiApplyClientMapsTheme = function(theme) {
    if (typeof window.DaxiClientMapUI !== 'undefined' && window.DaxiClientMapUI.applyClientMapsTheme) {
        window.DaxiClientMapUI.applyClientMapsTheme(theme);
        return;
    }
    theme = theme || document.documentElement.getAttribute('data-theme') || 'dark';
    window._daxiPendingMapTheme = theme;
    _daxiApplyMapContainerTheme(theme);
    if (window.DaxiMapPlaceholder && DaxiMapPlaceholder.applyTheme) {
        DaxiMapPlaceholder.applyTheme('daxi-map-stage', theme);
    }
    if (window.DaxiOrderCardMap && window.DaxiOrderCardMap.syncAllThemes) {
        window.DaxiOrderCardMap.syncAllThemes(theme);
    }
    if (window._clientBgMap && window.google && window.google.maps) {
        if (_daxiApplyClientBgMapTheme(theme)) {
            if (typeof _daxiReattachMainMapOverlays === 'function') _daxiReattachMainMapOverlays();
            if (typeof _daxiFlushPendingBookingMarkers === 'function') _daxiFlushPendingBookingMarkers();
            if (typeof _daxiSyncBookingMarkersFromForm === 'function') _daxiSyncBookingMarkersFromForm();
        }
        return;
    }
    if (!window._daxiMapsLoading && !window.googleMapsLoaded && typeof window._daxiLoadGoogleMaps === 'function') {
        window._daxiLoadGoogleMaps();
    }
};
window._daxiSyncClientMapsTheme = function(theme) {
    theme = theme || document.documentElement.getAttribute('data-theme') || 'dark';
    window._daxiApplyClientMapsTheme(theme);
};
_daxiApplyMapContainerTheme();

function _daxiSignalClientMapTilesReady(source) {
    if (!window._clientBgMap || !window.google || !google.maps) return;
    window._daxiMapReady = window._daxiMapReady || _daxiMapReady;
    if (typeof window._daxiMapReady !== 'function' && typeof _daxiMapReady === 'function') {
        window._daxiMapReady = _daxiMapReady;
    }
    if (source === 'idle') window._daxiMapReady.idle = true;
    if (source === 'tilesloaded') {
        window._daxiMapReady.tiles = true;
        window._daxiMapTilesReadySignaled = true;
    }
    window._daxiBootState = window._daxiBootState || {};
    window._daxiBootState.mapReady = true;
    window._daxiBootState.routesReady = true;
    if (window.DaxiRoutesMap && window.DaxiRoutesMap.warmup && !window._daxiRoutesWarmupStarted) {
        window._daxiRoutesWarmupStarted = true;
        window.DaxiRoutesMap.warmup({ timeoutMs: 15000 }).catch(function() {});
    }
    if (typeof _daxiPromoteMainMapMarkers === 'function') _daxiPromoteMainMapMarkers();
    if (typeof _daxiNotifyGoogleMapsReady === 'function') _daxiNotifyGoogleMapsReady();
    _daxiScheduleMapRevealCheck();
    if (typeof window._daxiFinishClientBootVisual === 'function') window._daxiFinishClientBootVisual();
}

function _initClientBgMap(opts) {
    opts = opts || {};
    var theme = opts.theme || window._daxiPendingMapTheme || document.documentElement.getAttribute('data-theme') || 'dark';
    var bgEl = document.getElementById('daxi-main-map');
    if (!bgEl || !_daxiIsGoogleMapsReady()) return;
    if (bgEl.querySelector('[data-daxi-map-blocked-message]') && !bgEl.querySelector('.gm-style')) {
      bgEl.innerHTML = '';
      bgEl._mapInit = false;
    }
    if (bgEl._mapInit && !window._daxiOfflineMapMode && !opts.isReinit) return;
    if (window._daxiOfflineMapMode && !window._daxiHybridShell && !window._daxiExternalMapsBlocked) {
        bgEl._mapInit = false;
        window._daxiOfflineMapMode = false;
        bgEl.innerHTML = '';
        window._clientBgMap = null;
        _daxiClearMainMapPair();
    }


    if (window._daxiOfflineMapMode && (window._daxiHybridShell || window._daxiExternalMapsBlocked) && window._daxiNativeOnline && _daxiMapsApiKey() && location.protocol !== 'file:') {
        bgEl._mapInit = false;
        window._daxiOfflineMapMode = false;
        bgEl.innerHTML = '';
        window._clientBgMap = null;
        _daxiClearMainMapPair();
    }
    if (bgEl._mapInit && !opts.isReinit) return;
    bgEl._mapInit = true;
    var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
    var restore = opts.restore || null;
    if (window.DaxiMainMapDual && window.DaxiMainMapDual.create && !opts.isReinit && !window._daxiMainMapPair) {
        var pair = window.DaxiMainMapDual.create(bgEl, {
            theme: theme,
            restore: restore,
            paddingFn: _daxiMapPadding
        });
        if (!pair) {
            bgEl._mapInit = false;
            console.warn('[Daxi Maps] Double couche carte indisponible — repli simple');
        } else {
            window._clientBgMap = window.DaxiMainMapDual.getActiveMap();
            window._daxiClientMapTheme = theme;
            if (typeof window._daxiMapDevLog === 'function') {
                window._daxiMapDevLog('Creating map');
                window._daxiMapDevLog('Map rendering');
            }
            if (typeof _daxiSetMapPhase === 'function') _daxiSetMapPhase('MAP_RENDERING');
            if (typeof _daxiScheduleGoogleMapCommit === 'function') _daxiScheduleGoogleMapCommit();
        }
    }
    if (!window._clientBgMap) {
    var _mapOpts = {
        mapId:                     'c4948b020bfc08331f1cb94e',
        center:                    (restore && restore.center) ? restore.center : _DAXI_CAP_HAITIEN,
        zoom:                      (restore && restore.zoom != null) ? restore.zoom : _DAXI_CAP_HAITIEN_ZOOM,
        tilt:                      (restore && restore.tilt != null) ? restore.tilt : 52,
        heading:                   (restore && restore.heading != null) ? restore.heading : 0,
        colorScheme:               _daxiMapColorScheme(theme),
        disableDefaultUI:          true,
        gestureHandling:           'greedy',
        draggable:                 true,
        zoomControl:               false,
        scrollwheel:               true,
        disableDoubleClickZoom:    false,
        clickableIcons:            false,
        tiltInteractionEnabled:    true,
        headingInteractionEnabled: false,
        backgroundColor:           _daxiMapBgColor(theme),
        padding:                   _daxiMapPadding(20),
    };
    try {
        if (typeof window._daxiMapDevLog === 'function') {
            window._daxiMapDevLog('Creating map');
            window._daxiMapDevLog('Map rendering');
        }
        if (typeof _daxiSetMapPhase === 'function') _daxiSetMapPhase('MAP_RENDERING');
        window._clientBgMap = new google.maps.Map(bgEl, _mapOpts);
        window._daxiClientMapTheme = theme;
        if (typeof _daxiScheduleGoogleMapCommit === 'function') _daxiScheduleGoogleMapCommit();
    } catch (e) {
        bgEl._mapInit = false;
        console.warn('[Daxi Maps] Initialisation carte reportée:', e);
        return;
    }
    }
    if (!window._clientBgMap) return;
    window._daxiMapSupports3D = true;
    try {
        if (window._clientBgMap.getRenderingType && window._clientBgMap.getRenderingType() === 'RASTER') {
            window._daxiMapSupports3D = false;
        }
    } catch (e) { window._daxiMapSupports3D = false; }
    if (typeof window._daxiResetMapReadyFlags === 'function') window._daxiResetMapReadyFlags(false, false);
    window._daxiMapTilesReadySignaled = false;
    _daxiEnsureMarkerLibReady().then(function() {
        if (!window._bookingMarkers) return;
        var needsUpgrade = ['pickup', 'dest'].some(function(k) {
            return window._bookingMarkers[k] && window._bookingMarkers[k]._dom;
        });
        if (!needsUpgrade) return;
        ['pickup', 'dest'].forEach(function(k) {
            var m = window._bookingMarkers[k];
            if (m && m._dom) {
                if (m.overlay) m.overlay.setMap(null);
                window._bookingMarkers[k] = null;
            }
        });
        if (typeof _daxiSyncBookingMarkersFromForm === 'function') _daxiSyncBookingMarkersFromForm();
    });
    if (!opts.isReinit) {
    if (!window._daxiMapDismissTimer) window._daxiMapDismissTimer = null;
    window._daxiTryDismissInitialLoader = function() {
      if (typeof window._daxiFinishClientBootVisual === 'function') {
        window._daxiFinishClientBootVisual();
      }
    };
    function _daxiOnMainMapBootIdle() {
        if (window._daxiMainMapBootIdleDone) return;
        window._daxiMainMapBootIdleDone = true;
        window._daxiMapReady.idle = true;
        if (typeof _daxiSetMapPhase === 'function') _daxiSetMapPhase('MAP_READY');
        if (typeof window._daxiTryCommitGoogleMapVisible === 'function') {
            window._daxiTryCommitGoogleMapVisible('idle');
        }
        if (window._daxiPendingExplorer && window.DaxiExplorerMap && window.DaxiExplorerMap.enter) {
            window._daxiPendingExplorer = false;
            setTimeout(function() { window.DaxiExplorerMap.enter(); }, 120);
        }
        var cm = document.getElementById('client-map-compass');
        if (cm) cm.style.display = 'flex';
        var wa = document.getElementById('client-map-whatsapp');
        if (wa) wa.style.display = 'flex';
        _syncMapFloatControls();
        _daxiApplyMapViewportPadding();
        if (typeof _flushClientGpsToMap === 'function') _flushClientGpsToMap();
        if (typeof _daxiFlushPendingBookingMarkers === 'function') _daxiFlushPendingBookingMarkers();
        if (typeof _daxiSyncBookingMarkersFromForm === 'function') _daxiSyncBookingMarkersFromForm();
        if (typeof _daxiNotifyGoogleMapsReady === 'function') _daxiNotifyGoogleMapsReady();
        _daxiScheduleMapRevealCheck();
    }
    function _daxiOnMainMapTilesOnce() {
        window._daxiMapTilesReadySignaled = true;
        window._daxiMapReady.tiles = true;
        _daxiSignalClientMapTilesReady('tilesloaded');
        if (typeof window._daxiTryCommitGoogleMapVisible === 'function') {
            window._daxiTryCommitGoogleMapVisible('tilesloaded');
        }
    }
    google.maps.event.addListenerOnce(window._clientBgMap, 'idle', _daxiOnMainMapBootIdle);
    google.maps.event.addListenerOnce(window._clientBgMap, 'tilesloaded', _daxiOnMainMapTilesOnce);
    google.maps.event.addListener(window._clientBgMap, 'tilesloaded', function() {
        _daxiScheduleMapRevealCheck();
    });
    } else {
        google.maps.event.addListenerOnce(window._clientBgMap, 'idle', function() {
            _daxiReattachMainMapOverlays();
            _daxiApplyMapViewportPadding();
            if (typeof _flushClientGpsToMap === 'function') _flushClientGpsToMap();
            if (typeof _daxiPromoteMainMapMarkers === 'function') _daxiPromoteMainMapMarkers();
            if (typeof _daxiNotifyGoogleMapsReady === 'function') _daxiNotifyGoogleMapsReady();
            _syncMapFloatControls();
        });
    }
    _daxiWireClientBgMapInteractionListeners(bgEl);
    if (!opts.isReinit && !opts.restore) {
        _daxiApplyActiveBoundsToMaps();
    }
    if (!opts.isReinit) {
        _daxiScheduleMapRevealCheck();
        try { google.maps.event.trigger(window._clientBgMap, 'resize'); } catch (e) {}
    }
    if (google.maps.importLibrary && !window._daxiMarkerLibPromise) {
        window._daxiMarkerLibPromise = google.maps.importLibrary('marker').then(function(markerLib) {
            window._daxiAdvancedMarkerElement = markerLib.AdvancedMarkerElement;
            window._daxiPinElement = markerLib.PinElement || null;
            if (typeof _daxiFlushPendingBookingMarkers === 'function') _daxiFlushPendingBookingMarkers();
            if (typeof _daxiSyncBookingMarkersFromForm === 'function') _daxiSyncBookingMarkersFromForm();
            return markerLib;
        }).catch(function(err) {
            console.warn('[Daxi Maps] AdvancedMarkerElement unavailable, using classic markers', err);
            window._daxiAdvancedMarkerElement = null;
            if (typeof _daxiFlushPendingBookingMarkers === 'function') _daxiFlushPendingBookingMarkers();
            return null;
        });
    }
}

async function _initPlacesAutocompleteAsync() {
    if (!window.google || !window.google.maps) {
        window._daxiBootState = window._daxiBootState || {};
        window._daxiBootState.mapReady = true;
        window._daxiBootState.routesReady = true;
        if (window.DaxiOffline && DaxiOffline.initSimpleMap) {
            DaxiOffline.initSimpleMap('daxi-main-map');
            if (typeof _flushClientGpsToMap === 'function') _flushClientGpsToMap();
        }
        if (window._daxiTryDismissInitialLoader) window._daxiTryDismissInitialLoader();
        return;
    }
    if (!(await _daxiEnsureGoogleMapsReady())) {
        window._daxiBootState = window._daxiBootState || {};
        window._daxiBootState.mapReady = true;
        window._daxiBootState.routesReady = true;
        if (window.DaxiOffline && DaxiOffline.initSimpleMap) {
            DaxiOffline.initSimpleMap('daxi-main-map');
            if (typeof _flushClientGpsToMap === 'function') _flushClientGpsToMap();
        }
        if (window._daxiTryDismissInitialLoader) window._daxiTryDismissInitialLoader();
        return;
    }

    MapOverlay = class extends google.maps.OverlayView {
        constructor(position, element) {
            super();
            this.position = position;
            this.element = element;
            this.element.style.position = 'absolute';
            this.element.style.transform = 'translate(-50%, -50%)';
        }
        onAdd() {
            this.getPanes().overlayMouseTarget.appendChild(this.element);
        }
        draw() {
            const projection = this.getProjection();
            if (!projection) return;
            const pos = projection.fromLatLngToDivPixel(new google.maps.LatLng(this.position.lat, this.position.lng));
            if (pos) {
                this.element.style.left = pos.x + 'px';
                this.element.style.top = pos.y + 'px';
            }
        }
        onRemove() {
            if (this.element.parentNode) {
                this.element.parentNode.removeChild(this.element);
            }
        }
        setPosition(latLng) {
            this.position = latLng;
            this.draw();
        }
    };


    _HAITI_BOUNDS = new google.maps.LatLngBounds(
        new google.maps.LatLng(17.9, -74.5),
        new google.maps.LatLng(20.1, -71.6)
    );

    if (_DAXI_ACTIVE_BOUNDS) _HAITI_BOUNDS = _DAXI_ACTIVE_BOUNDS;


    _initClientBgMap();
    _daxiApplyActiveBoundsToMaps();
    if (typeof _daxiMapLog === 'function') _daxiMapLog('clientBgMap-init-done', { hasMap: !!window._clientBgMap });
    if (typeof _flushClientGpsToMap === 'function') _flushClientGpsToMap();

    try {
        if (window._daxiMarkerLibPromise) {
            await window._daxiMarkerLibPromise;
        } else if (google.maps.importLibrary) {
            window._daxiMarkerLibPromise = google.maps.importLibrary('marker').then(function(markerLib) {
                window._daxiAdvancedMarkerElement = markerLib.AdvancedMarkerElement;
                window._daxiPinElement = markerLib.PinElement || null;
                return markerLib;
            });
            await window._daxiMarkerLibPromise;
        }
    } catch (err) {
        console.warn('[Daxi Maps] AdvancedMarkerElement unavailable, using classic markers', err);
        window._daxiAdvancedMarkerElement = null;
    }
    if (typeof _daxiFlushPendingBookingMarkers === 'function') _daxiFlushPendingBookingMarkers();
    if (typeof _daxiSyncBookingMarkersFromForm === 'function') _daxiSyncBookingMarkersFromForm();
    if (typeof _daxiPromoteMainMapMarkers === 'function') _daxiPromoteMainMapMarkers();

    if (!(await _daxiEnsurePlacesReady())) {
        console.warn('[Daxi Maps] Places library unavailable — suggestions limitées');
    }

    document.querySelectorAll('gmp-place-autocomplete[data-daxi-for]').forEach(function(gmp) {
        var inp = document.getElementById(gmp.getAttribute('data-daxi-for') || '');
        if (inp) _daxiCleanupGmpWidget(inp);
    });


    var pickupIn = document.getElementById('destinationAddress');
    var destIn   = document.getElementById('destinationAddressArrival');
    if (pickupIn) {
        if (pickupIn.value) pickupIn.value = _cleanAddressDisplay(pickupIn.value);
        _attachPlacesAC(pickupIn, { suggestionsId: 'destinationAddressSuggestions', onPlace: function(p, name) {
        window._daxiPickupFromGps = false;
        var parts = _daxiLatLngParts(p.geometry.location);
        if (!parts) return;
        var e; e = document.getElementById('pickupLatHidden'); if(e) e.value = parts.lat;
        e = document.getElementById('pickupLngHidden'); if(e) e.value = parts.lng;
        e = document.getElementById('pickupHidden'); if(e) e.value = name;
    }});
    }
    if (destIn) {
        if (destIn.value) destIn.value = _cleanAddressDisplay(destIn.value);
        _attachPlacesAC(destIn, { suggestionsId: 'destinationAddressArrivalSuggestions', onPlace: function(p, name) {
        var parts = _daxiLatLngParts(p.geometry.location);
        if (!parts) return;
        var e; e = document.getElementById('destLatHidden'); if(e) e.value = parts.lat;
        e = document.getElementById('destLngHidden'); if(e) e.value = parts.lng;
        e = document.getElementById('destinationHidden'); if(e) e.value = name;
    }});
    }


    ['plan1-departure','plan1-destination',
     'plan2-departure','plan3-departure','plan4-departure','plan6-departure','plan5-destination']
    .forEach(function(id) {
        var el = document.getElementById(id);
        if (el) _attachPlacesAC(el, {
            suggestionsId: id + '-suggestions',
            onPlace: function() { if (window._syncPlanWaypointsFromInputs) window._syncPlanWaypointsFromInputs(); }
        });
    });


    document.querySelectorAll('.destination-input:not([data-ac-init])').forEach(function(el) {
        var box = el.parentElement && el.parentElement.querySelector('.suggestions-container');
        var sid = null;
        if (box) {
            if (!box.id) {
                box.id = 'daxi-dest-suggest-' + Math.random().toString(36).slice(2, 9);
            }
            sid = box.id;
        }
        _attachPlacesAC(el, {
            suggestionsId: sid || undefined,
            onPlace: function() { if (window._syncPlanWaypointsFromInputs) window._syncPlanWaypointsFromInputs(); }
        });
    });

    _syncSheetHeightVar();
    window.addEventListener('resize', function() {
        _syncSheetHeightVar();
        _syncMapFloatControls();
    });
    var appSheet = document.getElementById('appSheet');
    if (appSheet && window.ResizeObserver) {
        new ResizeObserver(_syncSheetHeightVar).observe(appSheet);
    }
    _initDaxiSheetUi();
    _initPlan5AirportStepper();
}

function _initPlan5AirportStepper() {
    var passHidden = document.getElementById('plan5-passengers');
    var passDisplay = document.getElementById('plan5-passenger-display');
    var passMinus = document.getElementById('plan5-passMinus');
    var passPlus = document.getElementById('plan5-passPlus');
    if (!passHidden || passHidden.dataset.bound) return;
    passHidden.dataset.bound = '1';
    function _syncPlan5Pass(n) {
        n = Math.max(1, Math.min(10, n));
        passHidden.value = n;
        if (passDisplay) passDisplay.textContent = n;
        if (passMinus) passMinus.disabled = n <= 1;
        if (passPlus) passPlus.disabled = n >= 10;
    }
    if (passMinus) passMinus.onclick = function(e) { e.preventDefault(); _syncPlan5Pass(parseInt(passHidden.value, 10) - 1); };
    if (passPlus) passPlus.onclick = function(e) { e.preventDefault(); _syncPlan5Pass(parseInt(passHidden.value, 10) + 1); };
    _syncPlan5Pass(parseInt(passHidden.value, 10) || 1);
}


document.body.addEventListener('click', function(evt) {
    var btn = evt.target.closest('#orderTaxiBtn');
    if (!btn) return;
    if (window.DaxiShellRole && typeof DaxiShellRole.tryOpenAdminFromBooking === 'function') {
        if (DaxiShellRole.tryOpenAdminFromBooking()) {
            evt.preventDefault();
            evt.stopImmediatePropagation();
            return;
        }
    } else if (window.DaxiAppShell && typeof DaxiAppShell.tryOpenAdminFromBooking === 'function') {
        if (DaxiAppShell.tryOpenAdminFromBooking()) {
            evt.preventDefault();
            evt.stopImmediatePropagation();
            return;
        }
    }
    if (window._daxiOrderCreatePostOwner || window._daxiOrderCreateInFlight) {
        evt.preventDefault();
        evt.stopImmediatePropagation();
        return;
    }
    _syncBookingHiddenFields();
    if (_daxiBookingHasPendingPlaceCoords()) {
        evt.preventDefault();
        evt.stopImmediatePropagation();
        _setOrderBtnLoading(true);
        if (typeof _showMapPrecisionHint === 'function') {
            _showMapPrecisionHint('Localisation en cours…', 2500, '↻');
        }
        _daxiWaitForBookingPlaceCoords(15000).then(function() {
            _syncBookingHiddenFields();
            _daxiResetOrderCreateLoading('coords_wait');
            htmx.trigger(btn, 'click');
        });
        return;
    }
    var errMsg = _validateBookingForm();
    if (errMsg) {
        evt.preventDefault();
        evt.stopImmediatePropagation();
        _setOrderBtnLoading(false);
        _showBookingValidationErr(errMsg);
            return;
    }
    var dupMsg = _daxiCheckDuplicateOrder();
    if (dupMsg) {
        evt.preventDefault();
        evt.stopImmediatePropagation();
        _setOrderBtnLoading(false);
        _showBookingValidationErr(dupMsg);
        return;
    }
    window._daxiOrderHtmxStarted = false;
    _daxiStartOrderCreateWatchdog();
    if (window._daxiOrderCreateFallbackTimer) clearTimeout(window._daxiOrderCreateFallbackTimer);
    window._daxiOrderCreateFallbackTimer = setTimeout(function() {
        if (window._daxiOrderHtmxStarted) return;
        if (typeof _daxiSubmitOrderCreateViaFetch === 'function') _daxiSubmitOrderCreateViaFetch();
    }, 1800);


    var btnBusy = document.getElementById('orderTaxiBtn');
    if (btnBusy && !btnBusy.classList.contains('daxi-btn-busy')) {
        if (!btnBusy.dataset.origHtml) btnBusy.dataset.origHtml = btnBusy.innerHTML;
        btnBusy.classList.add('daxi-btn-busy');
        btnBusy.innerHTML = '<span class="daxi-btn-spinner"></span>' + ((window._localTranslations && window._localTranslations[localStorage.getItem('daxi_lang') || 'fr'] && window._localTranslations[localStorage.getItem('daxi_lang') || 'fr'].btn_preparing) || 'Préparation...');
    }
    window._daxiOrderCreateInFlight = true;
    var inline = document.getElementById('daxi-booking-inline-err');
    if (inline) inline.innerHTML = '';
}, true);

document.addEventListener('htmx:afterRequest', function(evt) {
    var xhr = evt.detail.xhr;
    if (xhr && xhr.getResponseHeader && xhr.getResponseHeader('HX-Refresh') === 'true') {
        window.location.href = '/';
    }
    if (evt.detail.elt && evt.detail.elt.id === 'orderTaxiBtn') {
        var xhrStatus = xhr && xhr.status;
        var isRateLimited = xhrStatus === 429;
        if (!isRateLimited) {
            _daxiResetOrderCreateLoading('afterRequest');
        }
        var btn = document.getElementById('orderTaxiBtn');
        if (btn && !isRateLimited) {
            delete btn.dataset.fixedPlan;
            btn.textContent = 'COMMANDER UN TAXI';
        }
        if (!isRateLimited) {
            var sp = document.getElementById('servicePlanHidden'); if (sp) sp.value = '';
            var fp = document.getElementById('fixedPriceHidden'); if (fp) fp.value = '';
        }
        if (evt.detail.successful) {
            var respEl = document.getElementById('booking-response');
            if (respEl) { respEl.innerHTML = ''; respEl.style.display = 'none'; }
            _daxiSetSheetMode('order', { expand: true });
            _daxiSetSheetCollapsed(false);
            if (window._loadDaxiSheetOrders) setTimeout(function() { _loadDaxiSheetOrders({ keepOpen: true, awaitPrefetch: true }); }, 300);
        } else {
            var errText = (xhr && xhr.responseText) || '';
            if (isRateLimited) {
                window._daxiOrderCreateCooldownUntil = Date.now() + 120000;
                _showBookingValidationErr('Trop de tentatives. Patientez 2 minutes avant de réessayer.');
                if (btn) {
                    btn.disabled = true;
                    btn.classList.remove('daxi-btn-loading');
                    btn.textContent = 'Patientez 2 min…';
                    setTimeout(function() {
                        window._daxiOrderCreateCooldownUntil = 0;
                        window._daxiOrderCreateInFlight = false;
                        if (btn) {
                            btn.disabled = false;
                            btn.textContent = 'COMMANDER UN TAXI';
                        }
                    }, 120000);
                }
            } else if (errText.indexOf('daxi-htmx-error') >= 0) {
                _showBookingValidationErr(errText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
            }
        }
    }
    var guestFormDone = evt.detail.elt && evt.detail.elt.closest && evt.detail.elt.closest('#guest-phone-card form');
    if (guestFormDone && !evt.detail.successful) {
        var gbtn = guestFormDone.querySelector('button[type=submit]');
        if (gbtn) {
            gbtn.disabled = false;
            gbtn.classList.remove('daxi-btn-loading');
            if (gbtn.dataset.origHtml) gbtn.innerHTML = gbtn.dataset.origHtml;
        }
    }
});

function _daxiResetOrderCreateLoading(reason) {
    window._daxiOrderCreateInFlight = false;
    window._daxiOrderHtmxStarted = false;
    window._daxiOrderCreatePostOwner = '';
    if (window._daxiOrderCreateFallbackTimer) {
        clearTimeout(window._daxiOrderCreateFallbackTimer);
        window._daxiOrderCreateFallbackTimer = null;
    }
    if (window._daxiOrderCreateWatchdog) {
        clearTimeout(window._daxiOrderCreateWatchdog);
        window._daxiOrderCreateWatchdog = null;
    }
    _setOrderBtnLoading(false);
    if (typeof window._daxiNetLog === 'function') {
        window._daxiNetLog('JS_ORDER_LOADING_RESET', { reason: reason || 'unknown' });
    }
}

function _daxiStartOrderCreateWatchdog() {
    if (window._daxiOrderCreateWatchdog) clearTimeout(window._daxiOrderCreateWatchdog);
    window._daxiOrderCreateWatchdog = setTimeout(function() {
        if (!window._daxiOrderCreateInFlight && !(document.getElementById('orderTaxiBtn') || {}).classList.contains('daxi-btn-busy')) return;
        _daxiResetOrderCreateLoading('watchdog_timeout');
        _showBookingValidationErr('La connexion est lente ou indisponible. Vérifiez votre réseau et réessayez.');
    }, 20000);
}

function _daxiCollectBookingFormData() {
    if (typeof _syncBookingHiddenFields === 'function') _syncBookingHiddenFields();
    var names = [
        'pickup', 'destination', 'pickup_lat', 'pickup_lng', 'destination_lat', 'destination_lng',
        'client_gps_lat', 'client_gps_lng', 'client_gps_accuracy',
        'date', 'time', 'notes', 'passengerCount', 'trip_type', 'is_later', 'guest_id',
        'service_plan', 'fixed_price', 'round_trip_wait_minutes', 'round_trip_allow_driver_other_rides',
        'plan_waypoints', 'affiliate_code'
    ];
    var fd = new FormData();
    names.forEach(function(n) {
        var el = document.querySelector('[name="' + n + '"]');
        if (el && el.value != null) fd.append(n, el.value);
    });
    return fd;
}

function _daxiSubmitOrderCreateViaFetch() {
    if (window._daxiOrderCreatePostOwner === 'htmx' || window._daxiOrderHtmxStarted) return;
    if (window._daxiOrderCreatePostOwner === 'fetch') return;
    window._daxiOrderCreatePostOwner = 'fetch';
    window._daxiOrderHtmxStarted = true;
    window._daxiOrderCreateInFlight = true;
    if (typeof _daxiMarkOrderSubmitted === 'function') _daxiMarkOrderSubmitted();
    _daxiStartOrderCreateWatchdog();
    var fd = _daxiCollectBookingFormData();
    _daxiClientFetch('/htmx/client/order/create/', { body: fd })
        .then(function(resp) {
            return resp.text().then(function(html) {
                _daxiResetOrderCreateLoading('fetch_fallback_' + resp.status);
                if (!resp.ok) {
                    _showBookingValidationErr('Impossible de créer la commande. Réessayez.');
                    return;
                }
                var slot = document.getElementById('daxi-sheet-order-slot');
                if (slot) {
                    slot.innerHTML = html;
                    if (window.htmx && htmx.process) htmx.process(slot);
                }
                if (typeof _daxiSetSheetMode === 'function') _daxiSetSheetMode('order', { expand: true });
                if (window._loadDaxiSheetOrders) setTimeout(function() { _loadDaxiSheetOrders({ keepOpen: true, awaitPrefetch: true }); }, 300);
            });
        })
        .catch(function() {
            _daxiResetOrderCreateLoading('fetch_fallback_error');
            _showBookingValidationErr('Connexion impossible. Vérifiez votre réseau et réessayez.');
        });
}

function _setOrderBtnLoading(loading) {
    var btn = document.getElementById('orderTaxiBtn');
    if (!btn) return;
    if (loading) {
        if (!btn.dataset.origHtml) btn.dataset.origHtml = btn.innerHTML;

        btn.disabled = true;
        btn.classList.add('daxi-btn-busy');
        btn.innerHTML = '<span class="daxi-btn-spinner"></span>' + ((window._localTranslations && window._localTranslations[localStorage.getItem('daxi_lang') || 'fr'] && window._localTranslations[localStorage.getItem('daxi_lang') || 'fr'].btn_preparing) || 'Préparation...');
    } else {
        btn.disabled = false;
        btn.removeAttribute('disabled');
        btn.classList.remove('daxi-btn-busy', 'daxi-btn-loading', 'btn-loading');
        if (btn.dataset.origHtml) {
            btn.innerHTML = btn.dataset.origHtml;
        } else {
            btn.textContent = 'COMMANDER UN TAXI';
        }
        window._daxiOrderCreateInFlight = false;
    }
}

function _daxiIsOrderCreateHtmx(evt) {
    var elt = evt.detail && evt.detail.elt;
    if (!elt) return false;
    var path = (evt.detail.pathInfo && evt.detail.pathInfo.requestPath) || elt.getAttribute('hx-post') || '';
    return path.indexOf('/htmx/client/order/create') >= 0;
}

document.body.addEventListener('htmx:responseError', function(evt) {
    if (!_daxiIsOrderCreateHtmx(evt)) return;
    var xhr = evt.detail.xhr;
    if (xhr && xhr.status === 429) {
        evt.stopPropagation();
    }
    _daxiResetOrderCreateLoading('responseError_' + (xhr && xhr.status));
    if (xhr && xhr.status !== 429) {
        _showBookingValidationErr('Impossible de créer la commande (erreur réseau). Réessayez.');
    }
});

document.body.addEventListener('htmx:sendError', function(evt) {
    if (!_daxiIsOrderCreateHtmx(evt)) return;
    _daxiResetOrderCreateLoading('sendError');
    _showBookingValidationErr('Connexion impossible. Vérifiez votre réseau et réessayez.');
});

document.body.addEventListener('htmx:timeout', function(evt) {
    if (!_daxiIsOrderCreateHtmx(evt)) return;
    _daxiResetOrderCreateLoading('htmx_timeout');
    _showBookingValidationErr('Délai dépassé. Réessayez.');
});

document.body.addEventListener('htmx:beforeRequest', function(evt) {
    if (_daxiIsOrderCreateHtmx(evt)) {
        if (window._daxiOrderCreateCooldownUntil && Date.now() < window._daxiOrderCreateCooldownUntil) {
            evt.preventDefault();
            _daxiResetOrderCreateLoading('cooldown');
            return;
        }


        if (window._daxiOrderCreateInFlight && evt.detail.elt && evt.detail.elt.disabled) {
            evt.preventDefault();
            return;
        }
        if (window._daxiOrderCreatePostOwner === 'fetch') {
            evt.preventDefault();
            return;
        }
        window._daxiOrderCreatePostOwner = 'htmx';
        window._daxiOrderHtmxStarted = true;
        window._daxiOrderCreateInFlight = true;
        if (typeof _daxiMarkOrderSubmitted === 'function') _daxiMarkOrderSubmitted();
        _daxiStartOrderCreateWatchdog();
        if (evt.detail.elt && evt.detail.elt.id === 'orderTaxiBtn') {
            _setOrderBtnLoading(true);
        }

        try {
            var csrf = typeof getCsrfToken === 'function' ? getCsrfToken() : '';
            if (csrf) {
                evt.detail.headers = evt.detail.headers || {};
                evt.detail.headers['X-CSRFToken'] = csrf;
                evt.detail.parameters = evt.detail.parameters || {};
                if (!evt.detail.parameters.csrfmiddlewaretoken) {
                    evt.detail.parameters.csrfmiddlewaretoken = csrf;
                }
            }
        } catch (_csrfErr) {}
    }
    var guestForm = evt.detail.elt && evt.detail.elt.closest && evt.detail.elt.closest('#guest-phone-card form');
    if (guestForm) {
        var gbtn = guestForm.querySelector('button[type=submit]');
        if (gbtn) {
            gbtn.disabled = true;
            gbtn.classList.add('daxi-btn-loading');
            if (!gbtn.dataset.origHtml) gbtn.dataset.origHtml = gbtn.innerHTML;
            gbtn.innerHTML = '<span class="daxi-btn-spinner"></span> Enregistrement…';
        }
    }
    var refuseBtn = evt.detail.elt && evt.detail.elt.closest && evt.detail.elt.closest('[hx-post*="/refuse-price/"]');
    if (refuseBtn) {
        refuseBtn.disabled = true;
        refuseBtn.style.opacity = '0.6';
    }
});


document.addEventListener('click', function(e) {
    var planBtn = e.target.closest('.learn-more-btn[data-plan]');
    if (planBtn) {
        if (window.__preventOpenOrderModalUntil && Date.now() < window.__preventOpenOrderModalUntil) return;
        var planId = planBtn.dataset.plan;
        if (planId && typeof openPlanModal === 'function') {
            e.preventDefault();
            openPlanModal(planId);
            if (window.daxiSetRoute) daxiSetRoute('tarif', window.DAXI_PLAN_SLUG_BY_ID[planId] || '');
        }
        return;
    }
    var orderBtn = e.target.closest('.order-plan-btn[data-plan]');
    if (orderBtn) {
        e.preventDefault();
        var pid = orderBtn.getAttribute('data-plan');
        if (window.DaxiPlanWizard && window.DaxiPlanWizard.open) {
            window.DaxiPlanWizard.open(pid);
        } else if (typeof submitPlanOrder === 'function') {
            submitPlanOrder(pid);
        }
    }
});

function sharePlanLink(slug) {
    var base = (window._daxiLiveBaseUrl || window.DAXI_API_BASE_URL || '').replace(/\/$/, '');
    if (!base || /localhost|127\.0\.0\.1/i.test(base)) base = 'https://daxipro.com';
    var url = base + '/#/tarif/' + slug;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function() {
            if (typeof showToast === 'function') showToast('Lien copié', 'success');
            else alert('Lien copié dans le presse-papiers.');
        }).catch(function() { prompt('Copiez ce lien :', url); });
    } else {
        prompt('Copiez ce lien :', url);
    }
}
window.sharePlanLink = sharePlanLink;

function _planInputCoords(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    var lat = parseFloat(el.dataset.lat), lng = parseFloat(el.dataset.lng);
    if (isNaN(lat) || isNaN(lng)) return null;
    return { label: el.value.trim(), lat: lat, lng: lng };
}

function _subtractOneHour(dateStr, timeStr) {
    if (!dateStr || !timeStr) return { date: dateStr, time: timeStr };
    var d = new Date(dateStr + 'T' + timeStr + ':00');
    d.setHours(d.getHours() - 1);
    var pad = function(n) { return String(n).padStart(2, '0'); };
    return {
        date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
        time: pad(d.getHours()) + ':' + pad(d.getMinutes()),
    };
}

async function submitPlanOrder(planId) {
    var fd = new FormData();
    var guestId = window._daxiGuestId || localStorage.getItem('daxi_guest_id') || '';
    if (guestId) fd.append('guest_id', guestId);
    fd.append('csrfmiddlewaretoken', typeof getCsrfToken === 'function' ? getCsrfToken() : '');

    if (planId === '5') {
        var ap = window.DAXI_CAP_AIRPORT;
        var dest = _planInputCoords('plan5-destination');
        var signName = (document.getElementById('plan5-sign-name') || {}).value || '';
        var arrDate = (document.getElementById('plan5-arrival-date') || {}).value || '';
        var arrTime = (document.getElementById('plan5-arrival-time') || {}).value || '';
        var pax = (document.getElementById('plan5-passengers') || {}).value || '1';
        if (!signName || !arrDate || !arrTime || !dest) {
            alert('Remplissez le nom sur le panneau, la date/heure d\'atterrissage et la destination.');
            return;
        }
        var sched = _subtractOneHour(arrDate, arrTime);
        fd.append('pickup', ap.label);
        fd.append('pickup_lat', String(ap.lat));
        fd.append('pickup_lng', String(ap.lng));
        fd.append('destination', dest.label);
        fd.append('destination_lat', String(dest.lat));
        fd.append('destination_lng', String(dest.lng));
        fd.append('date', sched.date);
        fd.append('time', sched.time);
        fd.append('is_later', 'true');
        fd.append('passengerCount', pax);
        fd.append('service_plan', 'accueil-aeroport-cap');
        fd.append('notes',
            '[ACCUEIL AÉROPORT CAP]\nPanneau : ' + signName
            + '\nAtterrissage prévu : ' + arrDate + ' ' + arrTime
            + '\nChauffeur sur place 1 h avant. Retards facturés selon tarifs d\'attente DAXI.'
        );
    } else if (planId === '1') {
        var dep = _planInputCoords('plan1-departure');
        var dst = _planInputCoords('plan1-destination');
        if (!dep || !dst) { alert('Sélectionnez départ et destination sur la carte/liste.'); return; }
        fd.append('pickup', dep.label);
        fd.append('pickup_lat', String(dep.lat));
        fd.append('pickup_lng', String(dep.lng));
        fd.append('destination', dst.label);
        fd.append('destination_lat', String(dst.lat));
        fd.append('destination_lng', String(dst.lng));
        var d1 = (document.getElementById('plan1-date') || {}).value;
        var t1 = (document.getElementById('plan1-time') || {}).value;
        if (d1) fd.append('date', d1);
        if (t1) fd.append('time', t1);
        if (d1 && t1) fd.append('is_later', 'true');
        fd.append('passengerCount', (document.getElementById('plan1-passengers') || {}).value || '1');
        fd.append('service_plan', 'ville-a-ville');
    } else {
        alert('Utilisez le bouton Commander depuis la fiche du plan.');
        return;
    }

    try {
        var resp = await _daxiClientFetch('/htmx/client/order/create/', { body: fd });
        var html = await resp.text();
        document.querySelectorAll('.plan-modal').forEach(function(m) { m.style.display = 'none'; });
        document.body.style.overflow = '';
        if (typeof closeDaxiPage === 'function') closeDaxiPage();
        if (typeof tabGoBook === 'function') tabGoBook();
        var slot = document.getElementById('booking-response');
        if (slot) { slot.innerHTML = html; slot.style.display = 'block'; }
        if (window.htmx) htmx.process(slot || document.body);
        if (typeof _daxiSetSheetMode === 'function') _daxiSetSheetMode('order');
        if (typeof _loadDaxiSheetOrders === 'function') setTimeout(function() { _loadDaxiSheetOrders({ keepOpen: true, awaitPrefetch: true }); }, 400);
    } catch (err) {
        alert('Erreur réseau. Réessayez.');
    }
}
window.submitPlanOrder = submitPlanOrder;


document.body.addEventListener('registrationComplete', function() {
    setTimeout(function() { window.location.href = '/'; }, 3000);
});

function _daxiMarkNotifAsked() {
    try { localStorage.setItem('daxi_notif_asked', '1'); } catch (e) {}
    try {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences) {
            window.Capacitor.Plugins.Preferences.set({ key: 'daxi_notif_asked', value: '1' });
        }
    } catch (e2) {}
}

function _daxiWasNotifAsked() {
    try {
        if (localStorage.getItem('daxi_notif_asked') === '1') return true;
    } catch (e) {}
    return false;
}

async function _daxiRestoreNotifAskedFlag() {
    try {
        if (_daxiWasNotifAsked()) return true;
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences) {
            var pref = await window.Capacitor.Plugins.Preferences.get({ key: 'daxi_notif_asked' });
            if (pref && pref.value === '1') {
                _daxiMarkNotifAsked();
                return true;
            }
        }
    } catch (e) {}
    return false;
}

function _scheduleNotificationPrompt() {
    if (window._daxiNativePermissionHost) return;
    var nativeAndroid = _daxiIsNativeAndroid();
    if (!nativeAndroid && typeof Notification === 'undefined') return;
    if (!nativeAndroid && Notification.permission === 'granted') {
        _daxiMarkNotifAsked();
        if (window._daxiEnsurePushRegistration) {
            window._daxiEnsurePushRegistration().then(function(result) {
                result = result || {};
                if (!result.ok && result.reason === 'config' && window.showDaxiNotification) {
                    showDaxiNotification('Notifications', 'Autorisation OK — configuration push en cours.', { type: 'info' });
                }
            });
        }
        return;
    }
    _daxiRestoreNotifAskedFlag().then(function(asked) {
        if (asked || _daxiWasNotifAsked()) return;
        if (!nativeAndroid && typeof Notification !== 'undefined' && Notification.permission === 'denied') {
            _daxiMarkNotifAsked();
            return;
        }
        if (nativeAndroid && window.DaxiAndroid && typeof window._daxiNativePushGranted === 'boolean' && window._daxiNativePushGranted) {
            _daxiMarkNotifAsked();
            return;
        }

        var delay = 120000;
        function tryShowNotificationPrompt() {
            if (document.hidden) {
                setTimeout(tryShowNotificationPrompt, 15000);
                return;
            }
            if (_daxiWasNotifAsked()) return;
            if (window._daxiNativePushGranted) {
                _daxiMarkNotifAsked();
                return;
            }
            var locEl = document.getElementById('locationSharePrompt');
            if (locEl && locEl.classList.contains('show')) {
                setTimeout(tryShowNotificationPrompt, 20000);
                return;
            }
            if (typeof _wasLocPromptDone === 'function' && !_wasLocPromptDone()) {
                setTimeout(tryShowNotificationPrompt, 20000);
                return;
            }
            _showNotificationModal();
        }
        setTimeout(tryShowNotificationPrompt, delay);
    });
}

function _daxiNotifLabels() {
    return {
        pending: { title: 'Commande enregistrée', msg: 'Votre demande a bien été reçue. Nous vous contacterons bientôt.', type: 'info' },
        price_proposed: { title: 'Prix proposé', msg: 'Un tarif vous a été proposé pour votre course.', type: 'info' },
        price_confirmed: { title: 'Prix confirmé', msg: 'Le tarif de votre course a été confirmé.', type: 'success' },
        driver_assigned: { title: 'Chauffeur assigné', msg: 'Votre chauffeur a été assigné à la course.', type: 'success' },
        on_way: { title: 'Chauffeur en route', msg: 'Votre chauffeur est en route vers vous.', type: 'info' },
        arrived: { title: 'Chauffeur arrivé', msg: 'Votre chauffeur est arrivé au point de départ.', type: 'success' },
        in_progress: { title: 'Course démarrée', msg: 'Votre course est en cours.', type: 'info' },
        completed: { title: 'Course terminée', msg: 'Merci d\'avoir voyagé avec Daxi.', type: 'success' },
        cancelled: { title: 'Course annulée', msg: 'Votre course a été annulée.', type: 'warning' },
        payment_confirmed: { title: 'Paiement confirmé', msg: 'Votre paiement a été enregistré.', type: 'success' },
        new_message: { title: 'Nouveau message', msg: 'Vous avez un message du chauffeur.', type: 'info' },
        trip_reminder: { title: 'Rappel de course', msg: 'Votre course planifiée approche — préparez-vous.', type: 'info' },
        order_cancelled: { title: 'Course annulée', msg: 'Votre course a été annulée.', type: 'warning' }
    };
}
window._daxiNotifLabels = _daxiNotifLabels;

function showDaxiNotification(title, message, opts) {
    opts = opts || {};
    var type = opts.type || 'info';
    var iconUrl = opts.icon || 'assets/images/daxi-logo-gold.png';
    var existing = document.querySelectorAll('.daxi-wa-notif');
    if (existing.length > 4) existing[0].remove();

    var el = document.createElement('div');
    el.className = 'daxi-wa-notif daxi-wa-notif--' + type;
    el.innerHTML =
        '<div class="daxi-wa-notif__avatar"><img src="' + iconUrl + '" alt="Daxi"></div>' +
        '<div class="daxi-wa-notif__body">' +
            '<div class="daxi-wa-notif__head"><span class="daxi-wa-notif__app">Daxi</span><span class="daxi-wa-notif__time">maintenant</span></div>' +
            '<div class="daxi-wa-notif__title">' + (title || 'Daxi') + '</div>' +
            '<div class="daxi-wa-notif__msg">' + (message || '') + '</div>' +
        '</div>' +
        '<button type="button" class="daxi-wa-notif__close" aria-label="Fermer">&times;</button>';
    document.body.appendChild(el);
    requestAnimationFrame(function() { el.classList.add('show'); });
    var close = el.querySelector('.daxi-wa-notif__close');
    if (close) close.addEventListener('click', function() { el.classList.remove('show'); setTimeout(function() { el.remove(); }, 300); });
    if (opts.onClick) el.addEventListener('click', function(e) { if (!e.target.closest('.daxi-wa-notif__close')) opts.onClick(); });
    setTimeout(function() {
        if (!el.parentNode) return;
        el.classList.remove('show');
        setTimeout(function() { if (el.parentNode) el.remove(); }, 350);
    }, opts.duration || 7000);

    var isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())
        || !!(window._daxiCapacitorApp || window._daxiHybridShell || window.DaxiAndroid);
    if (!opts.skipNative && !isNative && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
            new Notification(title || 'Daxi', { body: message || '', icon: iconUrl, badge: iconUrl, tag: 'daxi-' + (title || 'n') });
        } catch (e) {}
    }
}
window.showDaxiNotification = showDaxiNotification;
window.showToast = function(msg, type) { showDaxiNotification(type === 'error' ? 'Erreur' : 'Daxi', msg, { type: type || 'info' }); };

function _daxiNotifyOrderEvent(eventName, data) {
    data = data || {};
    if (data.silent === true || data.silent === 1 || data.silent === '1') {
        if (window.DaxiRealtimeSync) DaxiRealtimeSync.handle(eventName, data);
        else if (typeof _refreshClientOrdersPage === 'function') _refreshClientOrdersPage();
        return;
    }
    if (window.DaxiNotifPolicy && !window.DaxiNotifPolicy.shouldShow(eventName, data)) {
        if (window.DaxiRealtimeSync) DaxiRealtimeSync.handle(eventName, data);
        else if (typeof _refreshClientOrdersPage === 'function') _refreshClientOrdersPage();
        return;
    }
    var labels = (window._daxiNotifLabels && window._daxiNotifLabels()) || {};
    var status = (data && data.status) || eventName || '';
    var cfg = labels[status] || labels[eventName];
    if (cfg && window.showDaxiNotification) {
        var msg = data.message || cfg.msg;
        showDaxiNotification(cfg.title, msg, { type: cfg.type, skipNative: true });
        if (window.DaxiNotifPolicy) {
            window.DaxiNotifPolicy.recordShown(status || eventName, data.order_id || data.id);
        }
    }
    if (window.DaxiRealtimeSync) DaxiRealtimeSync.handle(eventName, data);
    else if (typeof _refreshClientOrdersPage === 'function') _refreshClientOrdersPage();
}


function _daxiIsNativeAndroid() {
    if (window.DaxiAndroid) return true;
    if (window._daxiNativePermissionHost || window._daxiHybridShell || window._daxiUseNativeGps) return true;
    return /DaxiAndroid/i.test(navigator.userAgent || '');
}

function _daxiWaitForNativeBridge(timeoutMs) {
    return new Promise(function(resolve) {
        var started = Date.now();
        (function tick() {
            if (window.DaxiAndroid) return resolve(true);
            if (Date.now() - started >= (timeoutMs || 3000)) return resolve(false);
            setTimeout(tick, 40);
        })();
    });
}

function _daxiCapPush() {
    try {
        return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
    } catch (e) {
        return null;
    }
}

function _daxiRequestWebPushPermission() {
    if (typeof Notification === 'undefined') return Promise.resolve({ ok: false, reason: 'unsupported' });
    if (Notification.permission === 'granted') {
        if (!window._daxiEnsurePushRegistration) return Promise.resolve({ ok: true, reason: 'web' });
        return window._daxiEnsurePushRegistration();
    }
    if (Notification.permission === 'denied') {
        return Promise.resolve({ ok: false, reason: 'permission' });
    }
    var permPromise;
    try {
        permPromise = Notification.requestPermission();
    } catch (e) {
        return Promise.resolve({ ok: false, reason: 'unsupported' });
    }
    if (!permPromise || typeof permPromise.then !== 'function') {
        return Promise.resolve({ ok: Notification.permission === 'granted', reason: Notification.permission === 'granted' ? 'web' : 'permission' });
    }
    return permPromise.then(function(perm) {
        if (perm !== 'granted') {
            return { ok: false, reason: 'permission' };
        }
        if (!window._daxiEnsurePushRegistration) {
            return { ok: true, reason: 'web' };
        }
        return window._daxiEnsurePushRegistration();
    });
}

function _daxiRequestPushPermission() {
    function nativeRequest() {
        return new Promise(function(resolve) {
            window._daxiNativeNotifPermResolve = resolve;
            try {
                window.DaxiAndroid.requestNotificationPermission();
            } catch (e) {
                window._daxiNativeNotifPermResolve = null;
                resolve({ ok: false, reason: 'error' });
            }
        });
    }
    if (window.DaxiAndroid && window.DaxiAndroid.requestNotificationPermission) {
        return nativeRequest();
    }
    var capPush = _daxiCapPush();
    if (capPush && capPush.requestPermissions) {
        return capPush.requestPermissions().then(function(perm) {
            var ok = perm && (perm.receive === 'granted' || perm.display === 'granted');
            if (!ok) return { ok: false, reason: 'permission' };
            if (window._daxiOnNativeNotifPermissionGranted) window._daxiOnNativeNotifPermissionGranted();
            return { ok: true, platform: 'capacitor' };
        }).catch(function() {
            return _daxiRequestWebPushPermission();
        });
    }
    if (_daxiIsNativeAndroid()) {
        return _daxiWaitForNativeBridge(2500).then(function(ready) {
            if (ready && window.DaxiAndroid && window.DaxiAndroid.requestNotificationPermission) {
                return nativeRequest();
            }
            return _daxiRequestWebPushPermission();
        });
    }
    return _daxiRequestWebPushPermission();
}

function _daxiSendTestWebNotification() {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
        new Notification('Daxi', {
            body: 'Notifications activées — vous recevrez vos alertes de course ici.',
            icon: 'assets/images/daxi-logo-gold.png',
            badge: 'assets/images/daxi-logo-gold.png',
            tag: 'daxi-welcome'
        });
    } catch (e) {}
}

window._daxiOnPlaceDetailsResult = function(callbackId, jsonStr) {
    if (typeof _daxiPlacesTrace === 'function') _daxiPlacesTrace('[CAPACITOR] _daxiOnPlaceDetailsResult', { callbackId: callbackId, bytes: jsonStr ? jsonStr.length : 0 });
    var cb = window._daxiPlaceDetailsCbs && window._daxiPlaceDetailsCbs[callbackId];
    if (typeof cb === 'function') cb(jsonStr);
};
window._daxiOnPlacePredictionsResult = function(callbackId, jsonStr) {
    var cb = window._daxiPredictionCbs && window._daxiPredictionCbs[callbackId];
    if (typeof cb === 'function') cb(jsonStr);
};

window._daxiOnNativeNotifPermissionGranted = function() {
    var done = function(result) {
        result = result || { ok: true, platform: 'android' };
        _daxiFeedbackPushResult(result);
        _daxiMarkNotifAsked();
        window._daxiNativePushGranted = true;
        if (window._daxiNativeNotifPermResolve) {
            window._daxiNativeNotifPermResolve(result);
            window._daxiNativeNotifPermResolve = null;
        }
    };
    if (window._daxiEnsurePushRegistration) {
        window._daxiEnsurePushRegistration().then(done).catch(function() { done({ ok: true, platform: 'android' }); });
    } else {
        done({ ok: true, platform: 'android' });
    }
};

window._daxiOnNativeNotifPermissionDenied = function() {
    try { _daxiMarkNotifAsked(); } catch (e) {}
    if (window.showDaxiNotification) {
        showDaxiNotification(
            'Notifications refusées',
            'Activez les notifications Daxi dans les paramètres Android pour recevoir les alertes dans la barre de statut, même app fermée.',
            { type: 'info' }
        );
    }
    if (window._daxiNativeNotifPermResolve) {
        window._daxiNativeNotifPermResolve({ ok: false, reason: 'permission' });
        window._daxiNativeNotifPermResolve = null;
    }
};

function _daxiFeedbackPushResult(result) {
    result = result || {};
    if (!window.showDaxiNotification) return;
    try {
        if (localStorage.getItem('daxi_notif_notice_shown') === '1') return;
        localStorage.setItem('daxi_notif_notice_shown', '1');
    } catch (e) {}
    if (result.ok) {
        var okMsg = _daxiIsNativeAndroid()
            ? 'Vous recevrez les alertes dans la barre de notifications, même quand l\'app est fermée.'
            : 'Vous recevrez les mises à jour de vos courses en temps réel.';
        showDaxiNotification('Notifications activées', okMsg, { type: 'success' });
        return;
    }
    if (result.reason === 'timeout') {
        showDaxiNotification('Notifications', 'La demande a pris trop de temps. Réessayez depuis le menu ou rechargez la page.', { type: 'info' });
        return;
    }
    var msgs = {
        config: _daxiIsNativeAndroid()
            ? 'Autorisation OK, mais l\'enregistrement FCM n\'est pas encore prêt. Réessayez dans quelques secondes.'
            : 'Autorisation OK, mais la configuration push n\'est pas encore disponible sur ce navigateur.',
        permission: _daxiIsNativeAndroid()
            ? 'Autorisez les notifications Daxi dans les paramètres Android.'
            : 'Autorisez les notifications dans les paramètres du navigateur.',
        token: _daxiIsNativeAndroid()
            ? 'Impossible d\'obtenir le jeton FCM. Vérifiez la connexion et réessayez.'
            : 'Impossible d\'obtenir le jeton push. Sur ngrok, ajoutez ce domaine dans Firebase Console → Authentication → Authorized domains, puis rechargez.',
        network: 'Connexion insuffisante pour finaliser l\'enregistrement push.',
        firebase: 'Module Firebase indisponible. Rechargez la page.',
        unsupported: _daxiIsNativeAndroid()
            ? 'Pont natif indisponible. Réinstallez ou mettez à jour l\'application Daxi.'
            : 'Ce navigateur ne prend pas en charge les notifications push.',
        native_bridge: 'Les notifications de cette session sont actives.'
    };
    var msg = msgs[result.reason] || 'Les alertes navigateur restent actives pour cette session.';
    if (result.detail && result.reason === 'token') {
        msg += ' (' + result.detail + ')';
    }
    showDaxiNotification(result.reason === 'permission' ? 'Notifications' : 'Notifications partielles', msg, { type: result.reason === 'permission' ? 'info' : 'warning' });
}

function requestNotificationPermission() {
    return _daxiRequestPushPermission().then(function(result) {
        if (result && (result.ok || result.reason === 'permission')) _daxiMarkNotifAsked();
        if (result && !result.pending) _daxiFeedbackPushResult(result);
        return !!(result && result.ok);
    });
}

function _showNotificationModal() {
    if (window._daxiNativePermissionHost) return;
    if (_daxiWasNotifAsked()) return;
    if (window._daxiNativePushGranted) {
        _daxiMarkNotifAsked();
        return;
    }
    var nativeAndroid = _daxiIsNativeAndroid();
    if (!nativeAndroid) {
        if (typeof Notification === 'undefined') return;
        if (Notification.permission === 'granted' || Notification.permission === 'denied') {
            _daxiMarkNotifAsked();
            return;
        }
    }
    var modal = document.getElementById('notificationPermissionModal');
    if (!modal) return;
    var androidHint = modal.querySelector('.notify-modal-android-hint');
    if (androidHint) androidHint.style.display = nativeAndroid ? 'block' : 'none';
    modal.style.display = 'flex';
    var acceptBtn = document.getElementById('acceptNotificationBtn');
    var declineBtn = document.getElementById('declineNotificationBtn');
    if (acceptBtn) {
        acceptBtn.disabled = false;
        var acceptLabel = acceptBtn.querySelector('span');
        if (acceptLabel && !acceptLabel.dataset.origLabel) acceptLabel.dataset.origLabel = acceptLabel.textContent || '';
    }
    function closeModal(markAsked) {
        modal.style.display = 'none';
        if (acceptBtn) {
            acceptBtn.disabled = false;
            var lbl = acceptBtn.querySelector('span');
            if (lbl && lbl.dataset.origLabel) lbl.textContent = lbl.dataset.origLabel;
        }
        if (markAsked) _daxiMarkNotifAsked();
    }
    if (acceptBtn && !acceptBtn.dataset.bound) {
        acceptBtn.dataset.bound = '1';
        acceptBtn.onclick = function() {
            if (acceptBtn.disabled) return;
            acceptBtn.disabled = true;
            var labelEl = acceptBtn.querySelector('span');
            if (labelEl) labelEl.textContent = '…';
            modal.style.display = 'none';
            var isNative = _daxiIsNativeAndroid();
            var _finishAccept = function(result) {
                acceptBtn.disabled = false;
                if (labelEl && labelEl.dataset.origLabel) labelEl.textContent = labelEl.dataset.origLabel;
                modal.style.display = 'none';
                if (result && result.pending) return;
                if (result && result.ok) {
                    _daxiMarkNotifAsked();
                    window._daxiNativePushGranted = true;
                    if (!isNative) _daxiSendTestWebNotification();
                } else if (result && (result.reason === 'permission' || result.reason === 'unsupported')) {
                    _daxiMarkNotifAsked();
                } else if (result && result.reason === 'timeout') {
                    
                } else if (result) {
                    _daxiMarkNotifAsked();
                }
                if (result && !result.pending) _daxiFeedbackPushResult(result);
            };
            var _raceMs = isNative ? 60000 : 25000;
            var _race = new Promise(function(resolve) {
                setTimeout(function() { resolve({ ok: false, reason: 'timeout' }); }, _raceMs);
            });
            Promise.race([_daxiRequestPushPermission(), _race])
                .then(_finishAccept)
                .catch(function() { _finishAccept({ ok: false, reason: 'network' }); });
        };
    }
    if (declineBtn && !declineBtn.dataset.bound) {
        declineBtn.dataset.bound = '1';
        declineBtn.onclick = function() { closeModal(true); };
    }
}


function getCsrfToken() {
    if (window.DaxiApi && typeof window.DaxiApi.getCsrfToken === 'function') {
        var fromApi = window.DaxiApi.getCsrfToken();
        if (fromApi) return fromApi;
    }
    var match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
    if (window.DJANGO_SESSION && window.DJANGO_SESSION.csrf_token) return window.DJANGO_SESSION.csrf_token;
    var el = document.querySelector('[name=csrfmiddlewaretoken]');
    if (el) return el.value;
    return '';
}

function _daxiGuestIdForRequest() {
    var ds = window.DJANGO_SESSION || {};
    if (ds.is_authenticated) return '';
    return (window._daxiGuestId || localStorage.getItem('daxi_guest_id') || '').trim();
}

function _daxiAppendClientAuth(body) {
    var csrf = getCsrfToken();
    if (body instanceof FormData) {
        if (csrf && !body.has('csrfmiddlewaretoken')) body.append('csrfmiddlewaretoken', csrf);
        var gid = _daxiGuestIdForRequest();
        if (gid && !body.has('guest_id')) body.append('guest_id', gid);
    } else if (body instanceof URLSearchParams) {
        if (csrf && !body.has('csrfmiddlewaretoken')) body.set('csrfmiddlewaretoken', csrf);
        var gid2 = _daxiGuestIdForRequest();
        if (gid2 && !body.has('guest_id')) body.set('guest_id', gid2);
    }
    return csrf;
}

function _daxiClientFetch(url, opts) {
    opts = opts || {};
    var headers = Object.assign({}, opts.headers || {});
    var body = opts.body;
    if (body && (body instanceof FormData || body instanceof URLSearchParams)) {
        var csrf = _daxiAppendClientAuth(body);
        if (csrf) headers['X-CSRFToken'] = csrf;
    } else if (!headers['X-CSRFToken']) {
        var token = getCsrfToken();
        if (token) headers['X-CSRFToken'] = token;
    }
    return fetch(url, {
        method: opts.method || 'POST',
        credentials: 'include',
        headers: headers,
        body: body
    });
}
window._daxiClientFetch = _daxiClientFetch;

function _daxiIsOnlineForHtmx() {
    if (typeof window._daxiNativeOnline === 'boolean') return window._daxiNativeOnline;
    return navigator.onLine !== false;
}

function _daxiFetchTextWithTimeout(url, opts) {
    opts = opts || {};
    var ms = opts.timeoutMs || 45000;
    var retries = opts.retries != null ? opts.retries : 2;
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;
    if (ctrl) {
        timer = setTimeout(function() {
            try { ctrl.abort(); } catch (e) {}
        }, ms);
    }
    var init = { credentials: 'include' };
    if (ctrl) init.signal = ctrl.signal;
    return fetch(url, init).then(function(r) {
        if (timer) clearTimeout(timer);
        return r.ok ? r.text() : Promise.reject(new Error('http_' + r.status));
    }).catch(function(err) {
        if (timer) clearTimeout(timer);
        if (retries > 0) {
            return new Promise(function(resolve) { setTimeout(resolve, 700); }).then(function() {
                return _daxiFetchTextWithTimeout(url, Object.assign({}, opts, { retries: retries - 1 }));
            });
        }
        return Promise.reject(err);
    });
}
window._daxiFetchTextWithTimeout = _daxiFetchTextWithTimeout;

function _daxiShowClientOrdersLoadError(tab) {
    var ordersEl = document.getElementById('client-orders-htmx');
    if (!ordersEl) return;
    tab = _daxiClientOrdersTabKey(tab || 'active');

    if (_daxiHasClientOrdersCache(tab)) {
        _daxiApplyClientOrdersHtml(tab, window._daxiClientOrdersCache[tab].html, { initMaps: true });
        return;
    }
    ordersEl.innerHTML = '<div id="client-orders-container" data-tab="' + tab + '" style="text-align:center;padding:36px 24px;color:#94a3b8;">'
        + '<p style="margin:0 0 14px;font-size:15px;color:#e2e8f0;">Aucune course à afficher pour le moment</p>'
        + '<p style="margin:0 0 18px;font-size:13px;line-height:1.5;">La synchronisation a échoué. Vous pouvez réessayer.</p>'
        + '<button type="button" onclick="window._refreshClientOrdersPage&&window._refreshClientOrdersPage({forceRefresh:true})" '
        + 'style="padding:10px 20px;border-radius:10px;border:none;background:#f97316;color:#fff;font-weight:600;cursor:pointer;">Réessayer</button>'
        + '</div>';
    ordersEl.dataset.currentTab = tab;
    ordersEl.style.display = 'block';
}
window._daxiShowClientOrdersLoadError = _daxiShowClientOrdersLoadError;

window._daxiClientOrdersCache = window._daxiClientOrdersCache || {};
window._daxiClientOrdersFetch = window._daxiClientOrdersFetch || {};

function _daxiEnsureClientOrdersStore() {
    if (!window._daxiClientOrdersCache || typeof window._daxiClientOrdersCache !== 'object') {
        window._daxiClientOrdersCache = {};
    }
    if (!window._daxiClientOrdersFetch || typeof window._daxiClientOrdersFetch !== 'object') {
        window._daxiClientOrdersFetch = {};
    }
}

function _daxiClientOrdersTabKey(tab) {
    return tab === 'history' ? 'history' : 'active';
}

function _daxiCanPreloadClientOrders() {
    var ds = window.DJANGO_SESSION || {};
    if (ds.is_authenticated) return true;
    var gid = window._daxiGuestId || localStorage.getItem('daxi_guest_id') || '';
    return !!gid;
}

function _daxiHasClientOrdersCache(tab) {
    _daxiEnsureClientOrdersStore();
    var key = _daxiClientOrdersTabKey(tab);
    var entry = window._daxiClientOrdersCache[key];
    return !!(entry && entry.html && entry.html.indexOf('client-orders-container') >= 0);
}

function _daxiInvalidateClientOrdersCache(tab) {
    _daxiEnsureClientOrdersStore();
    if (!tab || tab === 'all') {
        delete window._daxiClientOrdersCache.active;
        delete window._daxiClientOrdersCache.history;
        return;
    }
    delete window._daxiClientOrdersCache[_daxiClientOrdersTabKey(tab)];
}
window._daxiInvalidateClientOrdersCache = _daxiInvalidateClientOrdersCache;

window._daxiFocusClientOrder = function(orderId) {
    var oid = String(orderId || '').trim();
    if (!oid) return;
    tabGoOrders();
    setTimeout(function() {
        var el = document.getElementById('co-' + oid);
        if (!el) {
            if (window._daxiBootPreloadClientOrders) window._daxiBootPreloadClientOrders();
            setTimeout(function() { window._daxiFocusClientOrder(oid); }, 800);
            return;
        }
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('daxi-order-focus-pulse');
        setTimeout(function() { el.classList.remove('daxi-order-focus-pulse'); }, 2400);
    }, 500);
};
if (window.DaxiDeepLink && typeof window.DaxiDeepLink.ready === 'function') {
    window.DaxiDeepLink.ready();
}

window.daxiRateDriver = function(orderId, stars, btn) {
    var wrap = document.getElementById('rating-wrap-' + orderId);
    if (!wrap) return;
    wrap.querySelectorAll('.daxi-client-rating__star').forEach(function(b) {
        var n = parseInt(b.getAttribute('data-star'), 10);
        b.classList.toggle('is-active', n <= stars);
    });
    wrap.dataset.selectedRating = String(stars);
};

window.daxiSubmitDriverRating = function(orderId) {
    var wrap = document.getElementById('rating-wrap-' + orderId);
    if (!wrap) return;
    var rating = wrap.dataset.selectedRating || '';
    var comment = document.getElementById('rating-comment-' + orderId);
    var msg = comment ? comment.value : '';
    if (!rating) { alert('Sélectionnez un nombre d\'étoiles'); return; }
    var csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || '';
    fetch('/htmx/client/orders/' + orderId + '/rating/', {
        method: 'POST',
        headers: { 'X-CSRFToken': csrf, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'rating=' + encodeURIComponent(rating) + '&comment=' + encodeURIComponent(msg)
    }).then(function(r) { return r.text(); }).then(function(html) {
        var card = document.getElementById('co-' + orderId);
        if (card && html) card.outerHTML = html;
    }).catch(function() { alert('Erreur lors de l\'envoi de la note.'); });
};

function _daxiSyncClientOrdersCacheFromDom(tab) {
    _daxiEnsureClientOrdersStore();
    var key = _daxiClientOrdersTabKey(tab);
    var root = document.getElementById('client-orders-htmx');
    if (!root || !root.querySelector('#client-orders-container')) return;
    window._daxiClientOrdersCache[key] = {
        html: root.innerHTML,
        loadedAt: Date.now(),
        ready: true
    };
}
window._daxiSyncClientOrdersCacheFromDom = _daxiSyncClientOrdersCacheFromDom;

function _daxiApplyClientOrdersHtml(tab, html, opts) {
    opts = opts || {};
    var ordersEl = document.getElementById('client-orders-htmx');
    if (!ordersEl || !html) return false;
    ordersEl.dataset.currentTab = _daxiClientOrdersTabKey(tab);
    ordersEl.style.display = 'block';
    ordersEl.innerHTML = html;
    _daxiMarkSectionReady('all-pending-requests');
    if (window.applyDaxiTranslations) window.applyDaxiTranslations();
    try { document.dispatchEvent(new CustomEvent('daxi:orders-page-open')); } catch (e) {}
    if (opts.initMaps !== false && typeof _daxiInitClientOrdersListMaps === 'function') {
        setTimeout(function() { _daxiInitClientOrdersListMaps(); }, opts.mapDelay || 80);
    }
    return true;
}
window._daxiApplyClientOrdersHtml = _daxiApplyClientOrdersHtml;

function _daxiServeOfflineOrdersTab(tab, opts) {
    opts = opts || {};
    tab = _daxiClientOrdersTabKey(tab);
    if (_daxiHasClientOrdersCache(tab)) {
        if (opts.apply) _daxiApplyClientOrdersHtml(tab, window._daxiClientOrdersCache[tab].html, opts);
        return Promise.resolve(window._daxiClientOrdersCache[tab]);
    }
    var path = _clientOrdersUrl(tab);
    var bare = '/htmx/client/orders/?tab=' + tab;
    function applyCachedHtml(html) {
        if (!html) return null;
        var entry = { html: html, loadedAt: Date.now(), ready: html.indexOf('client-orders-container') >= 0 };
        if (entry.ready) {
            window._daxiClientOrdersCache[tab] = entry;
            if (opts.apply) _daxiApplyClientOrdersHtml(tab, html, opts);
            return entry;
        }
        return null;
    }
    if (window.DaxiOffline && DaxiOffline.tryServeHtmxFromCache) {
        return DaxiOffline.tryServeHtmxFromCache(path, '#client-orders-htmx').then(function(served) {
            if (served) {
                var el = document.getElementById('client-orders-htmx');
                var entry = applyCachedHtml(el ? el.innerHTML : '');
                if (entry) return entry;
            }
            return DaxiOffline.tryServeHtmxFromCache(bare, '#client-orders-htmx').then(function(served2) {
                if (served2) {
                    var el2 = document.getElementById('client-orders-htmx');
                    var entry2 = applyCachedHtml(el2 ? el2.innerHTML : '');
                    if (entry2) return entry2;
                }
                if (opts.apply && DaxiOffline.renderOfflineOrders) {
                    DaxiOffline.renderOfflineOrders((window._daxiOfflineData || {}).orders || [], tab);
                }
                return null;
            });
        });
    }
    if (opts.apply && window.DaxiOffline && DaxiOffline.renderOfflineOrders) {
        DaxiOffline.renderOfflineOrders((window._daxiOfflineData || {}).orders || [], tab);
    }
    return Promise.resolve(null);
}
window._daxiServeOfflineOrdersTab = _daxiServeOfflineOrdersTab;

function _daxiFetchClientOrdersTab(tab, opts) {
    opts = opts || {};
    _daxiEnsureClientOrdersStore();
    tab = _daxiClientOrdersTabKey(tab);
    var cacheKey = tab;

    if (!opts.forceRefresh && _daxiHasClientOrdersCache(cacheKey)) {
        if (opts.apply) _daxiApplyClientOrdersHtml(cacheKey, window._daxiClientOrdersCache[cacheKey].html, opts);
        return Promise.resolve(window._daxiClientOrdersCache[cacheKey]);
    }

    if (window._daxiClientOrdersFetch[cacheKey]) {
        return window._daxiClientOrdersFetch[cacheKey].then(function(entry) {
            if (opts.apply && entry && entry.html) _daxiApplyClientOrdersHtml(cacheKey, entry.html, opts);
            return entry;
        });
    }

    if (window.DaxiOffline && DaxiOffline.isReadOnly && DaxiOffline.isReadOnly()) {
        return _daxiServeOfflineOrdersTab(tab, opts);
    }

    if (!_daxiIsOnlineForHtmx()) {
        return _daxiServeOfflineOrdersTab(tab, opts);
    }

    var url = _clientOrdersUrl(cacheKey);
    window._daxiClientOrdersFetch[cacheKey] = _daxiFetchTextWithTimeout(url, { timeoutMs: 45000 })
        .then(function(html) {
            var entry = {
                html: html,
                loadedAt: Date.now(),
                ready: html.indexOf('client-orders-container') >= 0
            };
            if (entry.ready) {
                window._daxiClientOrdersCache[cacheKey] = entry;
                if (window.DaxiOffline && DaxiOffline.cacheHtmxResponse) {
                    DaxiOffline.cacheHtmxResponse(url, html);
                }
            }
            window._daxiClientOrdersFetch[cacheKey] = null;
            if (opts.apply) {
                if (entry.ready) _daxiApplyClientOrdersHtml(cacheKey, html, opts);
                else if (opts.apply) _daxiShowClientOrdersLoadError(cacheKey);
            }
            return entry;
        })
        .catch(function() {
            window._daxiClientOrdersFetch[cacheKey] = null;
            return _daxiServeOfflineOrdersTab(tab, opts).then(function(entry) {

                if (!entry && opts.apply) _daxiShowClientOrdersLoadError(cacheKey);
                return entry;
            });
        });
    return window._daxiClientOrdersFetch[cacheKey];
}
window._daxiFetchClientOrdersTab = _daxiFetchClientOrdersTab;

function _daxiBootPreloadClientOrders() {
    if (!_daxiCanPreloadClientOrders()) return Promise.resolve();
    if (window._daxiClientOrdersBootDone) return window._daxiClientOrdersBootPromise || Promise.resolve();
    if (window._daxiClientOrdersBootPromise) return window._daxiClientOrdersBootPromise;
    window._daxiClientOrdersBootStarted = true;
    window._daxiClientOrdersBootPromise = Promise.all([
        _daxiFetchClientOrdersTab('active', { apply: true }),
        _daxiFetchClientOrdersTab('history', { apply: false })
    ]).then(function() {
            window._daxiClientOrdersBootDone = true;
        })
        .catch(function() {
            window._daxiClientOrdersBootPromise = null;
        });
    return window._daxiClientOrdersBootPromise;
}
window._daxiBootPreloadClientOrders = _daxiBootPreloadClientOrders;

function _daxiClientOrdersPageIsOpen() {
    var overlay = document.getElementById('daxiPageOverlay');
    return !!(overlay && overlay.classList.contains('show')
        && window._daxiPageEl && window._daxiPageEl.id === 'all-pending-requests');
}

function _daxiMaybeRefreshClientOrdersCache(reason) {
    _daxiInvalidateClientOrdersCache('active');
    _daxiFetchClientOrdersTab('active', {
        forceRefresh: true,
        apply: _daxiClientOrdersPageIsOpen()
    });
}
window._daxiMaybeRefreshClientOrdersCache = _daxiMaybeRefreshClientOrdersCache;

function _daxiOnClientOrdersRealtime(orderId, ev, data) {
    if (!orderId) return;
    ev = ev || '';
    if (ev === 'order_cancelled' || ev === 'cancelled' || ev === 'order_deleted' || ev === 'price_refused') return;
    var major = [
        'price_proposed', 'payment_confirmed', 'coords_set', 'driver_assigned',
        'driver_accepted', 'driver_on_the_way', 'driver_arrived', 'in_progress', 'completed'
    ];
    if (major.indexOf(ev) >= 0) _daxiMaybeRefreshClientOrdersCache(ev);
}
window._daxiOnClientOrdersRealtime = _daxiOnClientOrdersRealtime;

function loadClientOrders(tab) {
    switchOrdersTab(tab);
}

function _clientOrdersUrl(tab) {
    var url = '/htmx/client/orders/?tab=' + (tab || 'active');
    var ds = window.DJANGO_SESSION || {};
    if (!ds.is_authenticated) {
        var gid = window._daxiGuestId || localStorage.getItem('daxi_guest_id') || '';
        if (gid) url += '&guest_id=' + encodeURIComponent(gid);
    }
    return url;
}

function _refreshClientOrdersPage(opts) {
    opts = opts || {};
    _daxiEnsureClientOrdersStore();
    var ordersEl = document.getElementById('client-orders-htmx');
    if (!ordersEl) return;
    var tab = _daxiClientOrdersTabKey(ordersEl.dataset.currentTab || 'active');
    ordersEl.dataset.currentTab = tab;
    ordersEl.style.display = 'block';

    if ((window.DaxiOffline && DaxiOffline.isReadOnly && DaxiOffline.isReadOnly()) || !_daxiIsOnlineForHtmx()) {
        return _daxiServeOfflineOrdersTab(tab, { apply: true, initMaps: true });
    }

    if (!opts.forceRefresh && _daxiHasClientOrdersCache(tab)) {
        _daxiApplyClientOrdersHtml(tab, window._daxiClientOrdersCache[tab].html, { initMaps: true });
        return;
    }

    if (!opts.forceRefresh && ordersEl.querySelector('#client-orders-container')) {
        if (typeof _daxiInitClientOrdersListMaps === 'function') _daxiInitClientOrdersListMaps();
        _daxiSyncClientOrdersCacheFromDom(tab);
        return;
    }

    if (!opts.forceRefresh && window._daxiClientOrdersFetch[tab]) {
        if (!ordersEl.querySelector('#client-orders-container')) {
            ordersEl.innerHTML = '<div style="text-align:center;padding:32px;color:#94a3b8;"><i class="ri-loader-4-line" style="font-size:28px;animation:spin 1s linear infinite;"></i></div>';
        }
        window._daxiClientOrdersFetch[tab].then(function(entry) {
            if (entry && entry.html) _daxiApplyClientOrdersHtml(tab, entry.html, { initMaps: true });
            else _daxiShowClientOrdersLoadError(tab);
        }).catch(function() {
            _daxiShowClientOrdersLoadError(tab);
        });
        return;
    }

    if (!ordersEl.querySelector('#client-orders-container')) {
        ordersEl.innerHTML = '<div style="text-align:center;padding:32px;color:#94a3b8;"><i class="ri-loader-4-line" style="font-size:28px;animation:spin 1s linear infinite;"></i></div>';
    }
    _daxiFetchClientOrdersTab(tab, { forceRefresh: !!opts.forceRefresh, apply: true });
}


function clientToggleChat(orderId, guestId) {
    var wrap = document.getElementById('client-chat-wrap-' + orderId);
    if (!wrap) return;
    var isOpen = wrap.style.display !== 'none';
    wrap.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) {
        var badge = document.getElementById('client-chat-badge-' + orderId);
        if (badge) badge.style.display = 'none';

        htmx.trigger(wrap.querySelector('[hx-get]'), 'revealed');
    }
}

function clientSendChat(orderId, guestId, csrfToken) {
    var input = document.getElementById('client-chat-input-' + orderId);
    if (!input || !input.value.trim()) return;
    var msg = input.value.trim();
    input.value = '';
    var body = new FormData();
    body.append('message', msg);
    if (guestId) body.append('guest_id', guestId);
    var replyWrap = document.getElementById('client-chat-reply-' + orderId);
    if (replyWrap && replyWrap.dataset.replyTo) body.append('reply_to', replyWrap.dataset.replyTo);
    _daxiClientFetch('/htmx/client/chat/' + orderId + '/send/', { body: body })
    .then(function(r) { return r.text(); }).then(function(html) {
        var msgArea = document.getElementById('chat-messages-' + orderId);
        if (msgArea && html) {
            msgArea.innerHTML = html;
            msgArea.scrollTop = msgArea.scrollHeight;
        }
        if (window._daxiChatCancelReply) window._daxiChatCancelReply(orderId);
    }).catch(function() {});
}

window._daxiChatSendImage = function(orderId, guestId, csrfToken) {
    if (!window.DaxiChatMedia) return;
    window.DaxiChatMedia.openImagePicker(function(file) {
        var body = new FormData();
        body.append('image', file);
        if (guestId) body.append('guest_id', guestId);
        var replyWrap = document.getElementById('client-chat-reply-' + orderId);
        if (replyWrap && replyWrap.dataset.replyTo) body.append('reply_to', replyWrap.dataset.replyTo);
        _daxiClientFetch('/htmx/client/chat/' + orderId + '/send/', { body: body })
        .then(function(r) { return r.text(); }).then(function(html) {
            var msgArea = document.getElementById('chat-messages-' + orderId);
            if (msgArea && html) { msgArea.innerHTML = html; msgArea.scrollTop = msgArea.scrollHeight; }
            if (window._daxiChatCancelReply) window._daxiChatCancelReply(orderId);
        }).catch(function() {
            if (window.DaxiChatMedia) window.DaxiChatMedia.toast('Échec envoi image.', 'error');
        });
    });
};

window._daxiChatPickImage = function(orderId, guestId, csrfToken) {
    window._daxiChatSendImage(orderId, guestId, csrfToken);
};

window._daxiClientDangerAlert = function(orderId, message, meta) {
    meta = meta || {};
    var isDanger = meta.severity === 'danger' || meta.is_danger;
    var ttl = parseInt(meta.ttl_ms, 10) || (isDanger ? 6000 : 4000);
    var id = 'daxi-client-zone-banner';
    var banner = document.getElementById(id);
    if (!banner) {
        banner = document.createElement('div');
        banner.id = id;
        document.body.appendChild(banner);
        if (!document.getElementById('daxi-client-zone-style')) {
            var st = document.createElement('style');
            st.id = 'daxi-client-zone-style';
            st.textContent = '@keyframes daxiZoneIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}';
            document.head.appendChild(st);
        }
    }
    banner.style.cssText = (isDanger
        ? 'position:fixed;top:calc(12px + env(safe-area-inset-top));left:12px;right:12px;z-index:22000;background:linear-gradient(135deg,#7f1d1d,#b91c1c);color:#fff;border:1px solid #fca5a5;'
        : 'position:fixed;top:calc(12px + env(safe-area-inset-top));left:12px;right:12px;z-index:22000;background:rgba(15,23,42,.94);color:#fde68a;border:1px solid rgba(251,191,36,.45);')
        + 'padding:12px 14px;border-radius:14px;font-size:13px;font-weight:700;box-shadow:0 10px 28px rgba(0,0,0,.28);animation:daxiZoneIn .18s ease-out;';
    var title = isDanger ? 'Zone sensible' : 'Sur la route';
    banner.innerHTML = title + (meta.distance_m != null ? ' · ' + meta.distance_m + ' m' : '') + '<br><span style="font-weight:600;font-size:12px;opacity:.95;">' + (message || 'Restez vigilant.') + '</span>';
    clearTimeout(window._daxiClientZoneTimer);
    window._daxiClientZoneTimer = setTimeout(function() {
        if (banner && banner.parentNode) banner.remove();
    }, ttl);
};

window._daxiChatVoiceRec = null;
window._daxiChatToggleVoice = function(orderId, guestId, csrfToken) {
    var btn = document.getElementById('client-chat-voice-btn-' + orderId);
    if (!btn || !window.DaxiChatMedia) return;
    if (btn.dataset.daxiVoiceBound) return;
    window.DaxiChatMedia.bindHoldToRecord(btn, {
        onBlob: function(blob, filename) {
            var body = new FormData();
            body.append('audio', blob, filename);
            if (guestId) body.append('guest_id', guestId);
            var replyWrap = document.getElementById('client-chat-reply-' + orderId);
            if (replyWrap && replyWrap.dataset.replyTo) body.append('reply_to', replyWrap.dataset.replyTo);
            _daxiClientFetch('/htmx/client/chat/' + orderId + '/send/', { body: body })
            .then(function(r) { return r.text(); }).then(function(html) {
                var msgArea = document.getElementById('chat-messages-' + orderId);
                if (msgArea && html) { msgArea.innerHTML = html; msgArea.scrollTop = msgArea.scrollHeight; }
            }).catch(function() {
                window.DaxiChatMedia.toast('Échec envoi vocal.', 'error');
            });
        }
    });
    window.DaxiChatMedia.toast('Maintenez le micro pour enregistrer.', 'info');
};

window._daxiShareTrip = function(orderId, guestId) {
    var body = new FormData();
    var gid = guestId || window._daxiGuestId || localStorage.getItem('daxi_guest_id') || '';
    if (gid) body.append('guest_id', gid);
    _daxiClientFetch('/htmx/client/orders/' + orderId + '/share/', { body: body })
    .then(function(r) {
        var ct = (r.headers.get('content-type') || '').toLowerCase();
        if (ct.indexOf('application/json') >= 0) {
            return r.json().then(function(d) { return { ok: r.ok, data: d }; });
        }
        return r.text().then(function() {
            return { ok: false, data: { error: r.status === 403 ? 'Session expirée' : 'Réponse serveur invalide' } };
        });
    }).then(function(res) {
        var d = res.data || {};
        if (!res.ok || !d.ok || !d.url) {
            var msg = d.error || 'Impossible de partager cette course';
            if (window.showDaxiNotification) showDaxiNotification('Partage', msg, { type: 'error' });
            else alert(msg);
            return;
        }
        if (navigator.share) {
            navigator.share({ title: 'Suivi course DAXI', text: 'Suis ma course en direct', url: d.url }).catch(function(){});
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(d.url).then(function() {
                if (window.showDaxiNotification) showDaxiNotification('Lien copié', 'Le lien de suivi est dans le presse-papiers', { type: 'success' });
                else alert('Lien copié !');
            });
        } else {
            prompt('Copiez ce lien :', d.url);
        }
    }).catch(function() {
        if (window.showDaxiNotification) showDaxiNotification('Erreur réseau', 'Vérifiez votre connexion', { type: 'error' });
        else alert('Erreur réseau');
    });
};

window._daxiRequestReturnPickup = function(orderId, guestId, btnEl) {
    if (!orderId) return;
    if (btnEl) {
        btnEl.classList.remove('daxi-btn-click-anim');
        void btnEl.offsetWidth;
        btnEl.classList.add('daxi-btn-click-anim');
    }
    var confirmMsg = 'Avez-vous terminé votre activité et êtes-vous prêt(e) à être repris(e) au point de départ ?\n\nVotre chauffeur sera alerté immédiatement.';
    var proceed = function() {
        if (btnEl) { btnEl.disabled = true; btnEl.style.opacity = '0.7'; }
        var fd = new FormData();
        fd.append('ready', '1');
        var gid = guestId || window._daxiGuestId || localStorage.getItem('daxi_guest_id') || '';
        if (gid) fd.append('guest_id', gid);
        var target = document.getElementById('co-' + orderId);
        _daxiClientFetch('/htmx/client/orders/' + orderId + '/request-return/', { body: fd })
        .then(function(r) { return r.text().then(function(t) { return { ok: r.ok, text: t }; }); })
        .then(function(res) {
            if (!res.ok) {
                var err = (res.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || 'Action impossible';
                if (btnEl) { btnEl.disabled = false; btnEl.style.opacity = ''; }
                if (window.showDaxiNotification) showDaxiNotification('Retour', err, { type: 'error' });
                else alert(err);
                return;
            }
            if (target && res.text) {
                var wrap = document.createElement('div');
                wrap.innerHTML = res.text.trim();
                var newEl = wrap.firstElementChild;
                if (newEl) target.replaceWith(newEl);
            }
            if (window.showDaxiNotification) {
                showDaxiNotification('Chauffeur alerté', 'Votre demande de retour a été envoyée.', { type: 'success' });
            }
        }).catch(function() {
            if (btnEl) { btnEl.disabled = false; btnEl.style.opacity = ''; }
            if (window.showDaxiNotification) showDaxiNotification('Erreur réseau', 'Impossible d\'envoyer la demande', { type: 'error' });
        });
    };
    if (window.DaxiModal && DaxiModal.confirm) {
        DaxiModal.confirm(confirmMsg, { okLabel: 'Oui, je suis prêt(e)', title: 'Demander le retour' }).then(function(ok) {
            if (ok) proceed();
        });
        return;
    }
    if (confirm(confirmMsg)) proceed();
};

window._daxiTriggerSos = function(orderId, guestId) {
    if (!orderId) return;
    if (!confirm('🆘 URGENCE : signaler un danger extrême à l\'équipe DAXI ?\n\nLe chauffeur ne sera PAS alerté — seule notre équipe de sécurité interviendra.')) return;
    var fd = new FormData();
    var gid = guestId || window._daxiGuestId || localStorage.getItem('daxi_guest_id') || '';
    if (gid) fd.append('guest_id', gid);
    var target = document.getElementById('co-' + orderId);
    if (target) {
        target.style.opacity = '0.6';
        target.style.pointerEvents = 'none';
    }
    _daxiClientFetch('/htmx/client/orders/' + orderId + '/sos/', { body: fd })
    .then(function(r) { return r.text().then(function(t) { return { ok: r.ok, status: r.status, text: t }; }); })
    .then(function(res) {
        if (target) { target.style.opacity = ''; target.style.pointerEvents = ''; }
        if (res.status >= 500) {
            if (window.showDaxiNotification) showDaxiNotification('Erreur', 'Erreur serveur — réessayez', { type: 'error' });
            return;
        }
        if (res.text && target) {
            var wrap = document.createElement('div');
            wrap.innerHTML = res.text.trim();
            var newEl = wrap.firstElementChild;
            if (newEl) target.replaceWith(newEl);
        }
        if (res.text.indexOf('daxi-oc-card--sos') >= 0 || res.text.indexOf('SOS signalé') >= 0) {
            if (window.showDaxiNotification) showDaxiNotification('🆘 SOS envoyé', 'L\'équipe DAXI a été alertée. Restez en sécurité.', { type: 'error' });
        } else if (res.text.indexOf('text-red-500') >= 0 || res.text.indexOf('déjà signalé') >= 0) {
            var errMsg = res.text.indexOf('déjà') >= 0 ? 'SOS déjà signalé pour cette course' : 'Action impossible';
            if (window.showDaxiNotification) showDaxiNotification('SOS', errMsg, { type: 'warning' });
        }
    }).catch(function() {
        if (target) { target.style.opacity = ''; target.style.pointerEvents = ''; }
        if (window.showDaxiNotification) showDaxiNotification('Erreur réseau', 'Impossible d\'envoyer le SOS', { type: 'error' });
    });
};

function renderStars(rating) {
    var stars = '';
    var fullStars = Math.floor(rating);
    var halfStar = rating % 1 >= 0.5;
    for (var i = 0; i < 5; i++) {
        if (i < fullStars) stars += '<i class="ri-star-fill"></i>';
        else if (i === fullStars && halfStar) stars += '<i class="ri-star-half-fill"></i>';
        else stars += '<i class="ri-star-line"></i>';
    }
    return stars;
}

function renderTopDriversFromDjango() {
    renderSidebarTopDrivers();
}

function _getTopDriversData() {
    var driversMap = (window.DJANGO_PRELOAD && window.DJANGO_PRELOAD.drivers) || {};
    var drivers = Object.values(driversMap).filter(function(d) {
        return d && d.isBlocked !== true;
    });
    if (!drivers.length && window._daxiOfflineData && window._daxiOfflineData.drivers) {
        drivers = window._daxiOfflineData.drivers.slice();
    }
    if (!drivers.length) {
        drivers = [
            { firstname: 'Jean', lastname: 'Baptiste', rating: 4.9, completedTrips: 150, photoURL: '' },
            { firstname: 'Marie', lastname: 'Joseph', rating: 4.7, completedTrips: 120, photoURL: '' },
            { firstname: 'Pierre', lastname: 'Louis', rating: 4.6, completedTrips: 95, photoURL: '' }
        ];
    }
    drivers.sort(function(a, b) {
        var ra = parseFloat(a.rating || 0);
        var rb = parseFloat(b.rating || 0);
        if (rb !== ra) return rb - ra;
        return parseInt(b.completedTrips || b.completed_trips || 0, 10) - parseInt(a.completedTrips || a.completed_trips || 0, 10);
    });
    return drivers.slice(0, 3);
}


function _daxiAbsMediaUrl(url) {
    url = String(url || '').trim();
    if (!url) return '';
    if (/^blob:/i.test(url)) return url;
    if (/^data:/i.test(url)) {
        if (!/^data:image\//i.test(url) || url.indexOf(',') < 0) return '';
        var payload = url.split(',')[1] || '';
        if (payload.length < 200) return '';
        return url;
    }
    if (url.indexOf('//') === 0) url = 'https:' + url;
    var origin = '';
    try { origin = String(location.origin || ''); } catch (e0) {}
    var base = (window._daxiLiveBaseUrl || window.DAXI_API_BASE_URL || origin || '').replace(/\/$/, '');
    try {
        if (/^https?:\/\//i.test(url)) {
            var u = new URL(url);
            if (/cloudinary\.com$/i.test(u.hostname) || /\.cloudinary\.com$/i.test(u.hostname)) {
                if (/\/upload\/drivers\//i.test(u.pathname)) return '';
                return url.replace(/^http:\/\//i, 'https://');
            }
            if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
                return (base || origin) + u.pathname + u.search;
            }
            if (u.protocol === 'http:') return url.replace(/^http:\/\//i, 'https://');
            return url;
        }
        if (url.charAt(0) === '/') return (base || origin) + url;
        if (/^(media|static|assets|uploads)\//i.test(url)) return (base || origin) + '/' + url;
    } catch (e) {}
    return url;
}
window._daxiAbsMediaUrl = _daxiAbsMediaUrl;

function renderSidebarTopDrivers() {
    var wrap = document.getElementById('sidebarTopDrivers');
    if (!wrap) return;
    var lang = (typeof window._daxiGetSavedLang === 'function' ? window._daxiGetSavedLang() : localStorage.getItem('daxi_lang')) || 'fr';
    var dict = (window._localTranslations && window._localTranslations[lang]) || {};
    var top = _getTopDriversData();
    wrap.innerHTML = top.map(function(d, i) {
        var rawRating = parseFloat(d.rating);
        var rating = (isNaN(rawRating) || rawRating === 0) ? 2.5 : Math.max(2.5, rawRating);
        var photoURL = (typeof window._daxiAbsMediaUrl === 'function')
            ? window._daxiAbsMediaUrl(d.photoURL || d.photo_url || d.photo || '')
            : (d.photoURL || d.photo_url || d.photo || '');
        var lastname = d.lastname || d.nom || '';
        var firstname = d.firstname || d.prenom || '';
        var initial = (firstname || lastname || 'C').charAt(0).toUpperCase();
        var fullname = (firstname + ' ' + lastname).trim() || (dict.top_driver_default_name || 'Chauffeur');
        var trips = parseInt(d.completedTrips || d.completed_trips || 0, 10);
        var tripsKey = trips === 1 ? 'top_driver_trips_1' : (trips === 0 ? 'top_driver_trips_0' : 'top_driver_trips_n');
        var tripsTpl = dict[tripsKey] || (trips === 1 ? '1 course' : trips + ' courses');
        var tripsLabel = tripsTpl.replace(/\{n\}/g, String(trips));
        var avatarHtml = photoURL
            ? '<img class="sdrv-avatar" src="' + photoURL.replace(/"/g, '&quot;') + '" alt="" referrerpolicy="no-referrer" loading="eager" fetchpriority="high" onerror="this.removeAttribute(\'crossorigin\');this.style.display=\'none\';if(this.nextSibling)this.nextSibling.style.display=\'flex\';">'
              + '<div class="sdrv-avatar" style="display:none">' + initial + '</div>'
            : '<div class="sdrv-avatar">' + initial + '</div>';
        var tripsMeta = trips > 0 ? (' · ' + tripsLabel) : '';
        return '<div class="sidebar-driver-chip">'
            + '<span class="sdrv-rank sdrv-rank--' + (i + 1) + '">' + (i + 1) + '</span>'
            + avatarHtml
            + '<div class="sdrv-info">'
            + '<div class="sdrv-name">' + fullname + '</div>'
            + '<div class="sdrv-meta"><i class="ri-star-fill"></i>' + rating.toFixed(1) + tripsMeta + '</div>'
            + '</div></div>';
    }).join('');
}

function renderPendingOrdersFromDjango() {
    var section = document.getElementById('all-pending-requests');
    var container = document.getElementById('pendingOrdersContainer');
    var countBadge = document.getElementById('ordersCountBadge');
    var countEl = document.getElementById('ordersCount');
    if (!section || !container) return;

    var pendingMap = (window.DJANGO_PRELOAD && window.DJANGO_PRELOAD.commande) || {};
    var confirmedMap = (window.DJANGO_PRELOAD && window.DJANGO_PRELOAD.commande_confirmed) || {};
    var orders = Object.values(pendingMap).concat(Object.values(confirmedMap));

    orders.sort(function(a, b) {
        return parseInt(b.timestamp || 0, 10) - parseInt(a.timestamp || 0, 10);
    });

    if (!orders.length) {
        section.style.display = 'none';
        container.innerHTML = '';
        if (countBadge) countBadge.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    section.classList.add('show-heading');
    if (countEl) countEl.textContent = String(orders.length);
    if (countBadge) countBadge.style.display = 'inline-flex';

    container.innerHTML = orders.slice(0, 8).map(function(o) {
        var status = o.status || 'pending';
        var pickup = _cleanAddressDisplay(o.pickup || 'Départ non défini');
        var destination = _cleanAddressDisplay(o.destination || 'Destination non définie');
        var price = parseFloat(o.price || 0);

        var badgeBg = '#fef3c7';
        var badgeColor = '#92400e';
        var badgeText = 'En attente';
        if (status === 'driver_assigned') { badgeBg = '#ede9fe'; badgeColor = '#5b21b6'; badgeText = 'Chauffeur assigné'; }
        else if (status === 'on_way') { badgeBg = '#dbeafe'; badgeColor = '#1e40af'; badgeText = 'En route'; }
        else if (status === 'arrived') { badgeBg = '#d1fae5'; badgeColor = '#065f46'; badgeText = 'Sur place'; }
        else if (status === 'in_progress') { badgeBg = '#dbeafe'; badgeColor = '#1e40af'; badgeText = 'En course'; }
        else if (status === 'price_proposed') { badgeBg = '#ede9fe'; badgeColor = '#5b21b6'; badgeText = 'Prix proposé'; }
        else if (status === 'price_confirmed') { badgeBg = '#d1fae5'; badgeColor = '#065f46'; badgeText = 'Prix confirmé'; }

        return '<div class="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">'
            + '<span style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px;background:' + badgeBg + ';color:' + badgeColor + ';">' + badgeText + '</span>'
            + (price > 0 ? '<span style="font-size:12px;font-weight:700;color:#111827;">$' + price.toFixed(2) + '</span>' : '')
            + '</div>'
            + '<div style="margin-top:8px;font-size:12px;color:#374151;">📍 ' + pickup + '</div>'
            + '<div style="margin-top:4px;font-size:12px;color:#374151;">🎯 ' + destination + '</div>'
            + '</div>';
    }).join('');
}

function openFullscreenBlog() {
    var modal = document.getElementById('blogFullscreenModal');
    if (!modal) return;
    modal.classList.add('show');
    var fc = document.getElementById('blogFullscreenContainer');
    if (!fc) return;
    if (fc.dataset.loaded === '1' && fc.innerHTML.trim()) return;
    if (window._daxiBlogPreloadPromise) {
        window._daxiBlogPreloadPromise.then(function() {
            if (fc.dataset.loaded === '1' && fc.innerHTML.trim()) return;
        }).catch(function() {});
        return;
    }
    var offline = (window.DaxiOffline && DaxiOffline.isReadOnly && DaxiOffline.isReadOnly()) || !_daxiIsOnlineForHtmx();
    if (offline && window.DaxiOffline && DaxiOffline.tryServeHtmxFromCache) {
        DaxiOffline.tryServeHtmxFromCache('/htmx/blog/', '#blogFullscreenContainer').then(function(ok) {
            if (ok) {
                fc.dataset.loaded = '1';
                return;
            }
            fc.innerHTML = '<div style="padding:28px;text-align:center;color:#94a3b8;">'
                + '<p style="font-weight:700;">Blog hors ligne</p>'
                + '<p style="font-size:12px;margin-top:6px;">Ouvrez le blog une fois en ligne pour le mettre en cache.</p></div>';
        });
        return;
    }
    if (typeof _daxiPreloadBlogOnce === 'function') _daxiPreloadBlogOnce();
    else if (typeof htmx !== 'undefined') {
        htmx.ajax('GET', '/htmx/blog/', { target: '#blogFullscreenContainer', swap: 'innerHTML' });
    }
}

function closeFullscreenBlog() {
    var modal = document.getElementById('blogFullscreenModal');
    if (modal) modal.classList.remove('show');
}

function openBlogArticle(slug) {
    if (!slug) return;
    window.location.href = '/blog/' + slug + '/';
}

function openFullscreenForum() { openFullscreenBlog(); }
function closeFullscreenForum() { closeFullscreenBlog(); }

function closeForumDetailModal() {
    var modal = document.getElementById('forumPublicationDetailModal');
    if (modal) modal.style.display = 'none';
}

function closeCancellationModal() {
    var modal = document.getElementById('cancellationReasonModal');
    if (modal) modal.classList.add('hidden');
}

function confirmCancellationWithReason() {
    closeCancellationModal();
}

function toggleAssistanceFab() {
    var subs = document.getElementById('assistanceSubs');
    var icon = document.getElementById('assistanceFabIcon');
    if (!subs) return;
    var isOpen = subs.classList.contains('open');
    if (isOpen) {
        subs.classList.remove('open');
        if (icon) { icon.className = 'ri-customer-service-2-fill'; }
    } else {
        subs.classList.add('open');
        if (icon) { icon.className = 'ri-close-line'; }
    }
}

document.addEventListener('click', function(e) {
    var fab = document.querySelector('.assistance-fab');
    if (fab && !fab.contains(e.target)) {
        var subs = document.getElementById('assistanceSubs');
        var icon = document.getElementById('assistanceFabIcon');
        if (subs) subs.classList.remove('open');
        if (icon) icon.className = 'ri-customer-service-2-fill';
    }
});


document.addEventListener('htmx:configRequest', function(e) {
    var csrf = typeof getCsrfToken === 'function' ? getCsrfToken() : '';
    if (csrf) {
        e.detail.headers['X-CSRFToken'] = csrf;
        var verb = String(e.detail.verb || 'get').toLowerCase();
        if (verb !== 'get' && verb !== 'head') {
            e.detail.parameters = e.detail.parameters || {};
            if (!e.detail.parameters.csrfmiddlewaretoken) {
                e.detail.parameters.csrfmiddlewaretoken = csrf;
            }
        }
    }
    e.detail.headers['ngrok-skip-browser-warning'] = 'true';
    var path = (e.detail.path || '').toString();
    if (path.indexOf('/htmx/client/') >= 0 && typeof _daxiGuestIdForRequest === 'function') {
        var gid = _daxiGuestIdForRequest();
        if (gid) {
            e.detail.parameters = e.detail.parameters || {};
            var cur = e.detail.parameters.guest_id;
            if (!cur || !String(cur).trim()) e.detail.parameters.guest_id = gid;
        }
    }
});

function _daxiClearActionBtnBusy(el) {
    if (!el) return;
    try {
        el.disabled = false;
        el.style.opacity = '';
        el.style.pointerEvents = '';
        el.classList.remove('daxi-btn-busy', 'daxi-btn-loading');
        el.removeAttribute('aria-busy');
        if (el.dataset && el.dataset.origHtml) el.innerHTML = el.dataset.origHtml;
    } catch (e) {}
}

document.body.addEventListener('htmx:afterRequest', function(evt) {
    var el = evt.detail && evt.detail.elt;
    if (!el) return;
    if (el.matches && (el.matches('[hx-post*="confirm-price"],[hx-post*="refuse-price"],[hx-post*="/cancel"]') ||
        (el.closest && el.closest('[hx-post*="confirm-price"],[hx-post*="refuse-price"],[hx-post*="/cancel"]')))) {
        _daxiClearActionBtnBusy(el);
        var wrap = el.closest && el.closest('[hx-post*="confirm-price"],[hx-post*="refuse-price"],[hx-post*="/cancel"]');
        if (wrap && wrap !== el) _daxiClearActionBtnBusy(wrap);
    }
});
document.body.addEventListener('htmx:responseError', function(evt) {
    var el = evt.detail && evt.detail.elt;
    if (el) _daxiClearActionBtnBusy(el);
});
document.body.addEventListener('htmx:sendError', function(evt) {
    var el = evt.detail && evt.detail.elt;
    if (el) _daxiClearActionBtnBusy(el);
});

document.body.addEventListener('htmx:afterSwap', function(evt) {
    var root = evt.detail && evt.detail.target;
    if (!root || !root.querySelector) return;
    var card = root.querySelector('[id^="proposal-guest-id-"]');
    if (card && !card.value) {
        var gid = (typeof _daxiGuestIdForRequest === 'function' ? _daxiGuestIdForRequest() : '') ||
            window._daxiGuestId || localStorage.getItem('daxi_guest_id') || '';
        if (gid) card.value = gid;
    }
});

document.body.addEventListener('htmx:beforeRequest', function(evt) {
    var path = evt.detail && evt.detail.pathInfo && evt.detail.pathInfo.requestPath;
    if (!path || !window.DaxiNotifPolicy) return;
    var m = path.match(/\/htmx\/client\/orders\/(\d+)\/(confirm-price|refuse-price|cancel\/|payment\/init)/);
    if (!m) return;
    var oid = m[1];
    var seg = m[2];
    var action = seg.indexOf('confirm-price') === 0 ? 'price_confirmed'
        : seg.indexOf('refuse-price') === 0 ? 'price_refused'
        : seg.indexOf('cancel') === 0 ? 'order_cancelled'
        : seg.indexOf('payment') === 0 ? 'payment_confirmed' : null;
    if (action) window.DaxiNotifPolicy.markUserAction(oid, action);
    if (seg.indexOf('confirm-price') === 0) {
        var btn = evt.detail && evt.detail.elt;
        if (btn && btn.tagName === 'BUTTON') {
            btn.disabled = true;
            btn.setAttribute('aria-busy', 'true');
        }
    }
});

(function _daxiInstallPriceActionFallback() {
    if (window._daxiPriceActionFallbackBound) return;
    window._daxiPriceActionFallbackBound = true;
    function markBusy(btn, on) {
        if (!btn) return;
        try {
            if (on) {
                if (!btn.dataset.origHtml) btn.dataset.origHtml = btn.innerHTML;
                btn.disabled = true;
                btn.setAttribute('aria-busy', 'true');
                btn.style.opacity = '0.7';
            } else {
                btn.disabled = false;
                btn.removeAttribute('aria-busy');
                btn.style.opacity = '';
                if (btn.dataset.origHtml) btn.innerHTML = btn.dataset.origHtml;
            }
        } catch (e) {}
    }
    function postPriceAction(btn) {
        var action = btn.getAttribute('data-daxi-price-action');
        var oid = btn.getAttribute('data-order-id') || '';
        var hxPost = btn.getAttribute('hx-post') || '';
        if (!oid && hxPost) {
            var m = hxPost.match(/\/orders\/(\d+)\//);
            if (m) oid = m[1];
        }
        if (!action && hxPost) {
            if (hxPost.indexOf('confirm-price') >= 0) action = 'confirm';
            else if (hxPost.indexOf('refuse-price') >= 0) action = 'refuse';
        }
        if (!oid || (action !== 'confirm' && action !== 'refuse')) return false;
        var url = hxPost || ('/htmx/client/orders/' + oid + '/' + (action === 'confirm' ? 'confirm-price' : 'refuse-price') + '/');
        if (window._daxiPriceActionInFlight === oid + ':' + action) return true;
        window._daxiPriceActionInFlight = oid + ':' + action;
        markBusy(btn, true);
        var fd = new FormData();
        var guestEl = document.getElementById('proposal-guest-id-' + oid) || document.getElementById('guestIdHidden');
        if (guestEl && guestEl.value) fd.append('guest_id', guestEl.value);
        var csrf = typeof getCsrfToken === 'function' ? getCsrfToken() : '';
        if (csrf) fd.append('csrfmiddlewaretoken', csrf);
        var fetchFn = window._daxiClientFetch || function(u, o) {
            return fetch(u, Object.assign({ credentials: 'include' }, o || {}));
        };
        fetchFn(url, { method: 'POST', body: fd })
            .then(function(resp) {
                return resp.text().then(function(html) {
                    markBusy(btn, false);
                    window._daxiPriceActionInFlight = '';
                    if (!resp.ok) {
                        if (window.showDaxiNotification) {
                            showDaxiNotification('Action impossible', 'Réessayez dans un instant.', { type: 'warning' });
                        }
                        return;
                    }
                    var slot = document.getElementById('daxi-sheet-order-slot');
                    if (slot) {
                        slot.innerHTML = html;
                        if (typeof _daxiProcessSheetSlot === 'function') _daxiProcessSheetSlot(slot);
                        else if (window.htmx && htmx.process) htmx.process(slot);
                    }
                    if (typeof _daxiSetSheetMode === 'function') _daxiSetSheetMode('order', { expand: true });
                    if (window._loadDaxiSheetOrders) setTimeout(function() { _loadDaxiSheetOrders({ keepOpen: true }); }, 250);
                });
            })
            .catch(function() {
                markBusy(btn, false);
                window._daxiPriceActionInFlight = '';
                if (window.showDaxiNotification) {
                    showDaxiNotification('Connexion', 'Impossible de joindre le serveur. Réessayez.', { type: 'warning' });
                }
            });
        return true;
    }
    document.addEventListener('click', function(e) {
        var btn = e.target && e.target.closest
            ? e.target.closest('.daxi-pp-btn[data-daxi-price-action], [hx-post*="confirm-price"], [hx-post*="refuse-price"]')
            : null;
        if (!btn || btn.disabled || btn.getAttribute('aria-busy') === 'true') return;

        var forceFetch = !!(window._daxiCapacitorApp || window._daxiHybridShell || window._daxiUseNativeGps);
        if (!forceFetch && window.htmx) return;
        e.preventDefault();
        e.stopPropagation();
        postPriceAction(btn);
    }, true);
})();


(function _daxiWireCardPaymentOverlay() {
    function overlayEl() { return document.getElementById('daxiCardPaymentOverlay'); }
    function frameEl() { return document.getElementById('daxiCardPaymentFrame'); }
    function closeCardPayment() {
        var ov = overlayEl();
        var fr = frameEl();
        if (ov) {
            ov.classList.remove('show');
            ov.setAttribute('aria-hidden', 'true');
        }
        if (fr) fr.src = 'about:blank';
        document.body.classList.remove('daxi-card-pay-open');
    }
    window._daxiCloseCardPayment = closeCardPayment;
    window._daxiOpenCardPayment = function(url, orderId) {
        if (!url) return;
        var ov = overlayEl();
        var fr = frameEl();
        if (!ov || !fr) {
            window.location.href = url;
            return;
        }
        var theme = document.documentElement.getAttribute('data-theme') || 'dark';
        var sep = url.indexOf('?') >= 0 ? '&' : '?';
        fr.src = url + sep + 'embed=1&theme=' + encodeURIComponent(theme);
        ov.classList.add('show');
        ov.setAttribute('aria-hidden', 'false');
        document.body.classList.add('daxi-card-pay-open');
        ov.dataset.orderId = orderId ? String(orderId) : '';
    };
    window.addEventListener('message', function(ev) {
        var data = ev && ev.data;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'daxi-card-paid' || data.type === 'daxi-card-close') {
            var oid = data.orderId || (overlayEl() && overlayEl().dataset.orderId);
            closeCardPayment();
            if (data.type === 'daxi-card-paid' && oid) {
                if (typeof window._daxiLoadSheetOrder === 'function') {
                    window._daxiLoadSheetOrder(String(oid), { preferCache: false });
                } else if (typeof window._daxiFocusClientOrder === 'function') {
                    window._daxiFocusClientOrder(String(oid));
                }
            }
        }
    });
})();

document.addEventListener('DOMContentLoaded', function() {
    if (typeof _initMapTapZone === 'function') _initMapTapZone();
    if (typeof _daxiIsolateCommandChrome === 'function') _daxiIsolateCommandChrome();
    if (typeof _daxiWireSheetOpenTargets === 'function') _daxiWireSheetOpenTargets();
    if (typeof _daxiPersistAffiliateRef === 'function') _daxiPersistAffiliateRef();
    window.addEventListener('online', function() {
        if (typeof _daxiMapLog === 'function') _daxiMapLog('window-online');
        if (window._daxiGoogleMapHasBeenShown) {
            if (typeof _daxiEnsureGoogleMapSized === 'function') _daxiEnsureGoogleMapSized('window-online');
            return;
        }
        if (typeof window._daxiRecoverLiveGoogleMap === 'function') window._daxiRecoverLiveGoogleMap('window-online');
    });
    var _recoverPolls = 0;
    var _recoverTimer = setInterval(function() {
        _recoverPolls += 1;
        if (window._daxiGoogleMapHasBeenShown || (window._clientBgMap && document.querySelector('#daxi-main-map .gm-style'))) {
            clearInterval(_recoverTimer);
            return;
        }
        var needsMap = navigator.onLine && !window._clientBgMap && !window._daxiMapsLoading;
        if (needsMap && typeof window._daxiRecoverLiveGoogleMap === 'function') {
            window._daxiRecoverLiveGoogleMap('poll-' + _recoverPolls);
        }
        if (_recoverPolls >= 20) clearInterval(_recoverTimer);
    }, 3000);
    if (typeof _initDaxiSheetUi === 'function') _initDaxiSheetUi();


    document.addEventListener('DOMContentLoaded', function () {
        if (typeof AOS !== 'undefined') {
            AOS.init({ once: true, duration: 600, offset: 60, easing: 'ease-out-quad' });
        }
    });

    renderTopDriversFromDjango();
    initServicePlansSection();
    handleTouristAttractions();
    if (typeof _initDaxiExperienceHub === 'function') _initDaxiExperienceHub();
    initPlanDetailModal();
    document.addEventListener('daxi:bootstrap-ready', function() {
        if (typeof displayUserName === 'function') displayUserName();
        if (typeof renderSidebarTopDrivers === 'function') renderSidebarTopDrivers();
    });


    try {
        if (location.hash && location.hash.length > 2) {
            setTimeout(function() { if (window.daxiNavigateFromHash) daxiNavigateFromHash(); }, 150);
        } else {
            var _urlTab = new URLSearchParams(window.location.search).get('tab');
            if (_urlTab === 'orders' || _urlTab === 'courses') setTimeout(function() { tabGoOrders(); }, 120);
            else if (_urlTab === 'tarif' || _urlTab === 'tarifs' || _urlTab === 'explorer') setTimeout(function() { tabGoTarif(); }, 120);
            else if (_urlTab === 'account' || _urlTab === 'compte') setTimeout(function() { tabGoAccount(); }, 120);
            if (_urlTab) history.replaceState(null, '', window.location.pathname);
        }
    } catch(_e) {}


    var djangoSession = window.DJANGO_SESSION || {};
    var isAuthenticated = djangoSession.is_authenticated;
    if (typeof _daxiSeedAccountSlot === 'function') _daxiSeedAccountSlot();
    else if (typeof _daxiMarkSectionReady === 'function') _daxiMarkSectionReady('accountSection');
    var pendingSec = document.getElementById('all-pending-requests');
    var htmxOrdersEl = document.getElementById('client-orders-htmx');
    var firebaseOrdersEl = document.getElementById('pendingOrdersContainer');
    var tabBtns = document.getElementById('orders-tab-btns');

    if (isAuthenticated) {
        if (pendingSec) pendingSec.style.display = 'block';
        if (htmxOrdersEl) htmxOrdersEl.style.display = 'block';
        if (firebaseOrdersEl) firebaseOrdersEl.style.display = 'none';
        if (tabBtns) { tabBtns.style.display = 'flex'; tabBtns.style.gap = '6px'; }
        if (window.DaxiOffline && DaxiOffline.isReadOnly && DaxiOffline.isReadOnly()) {
            if (DaxiOffline.applyCachedUi) DaxiOffline.applyCachedUi('active');
        } else if (typeof _daxiBootPreloadClientOrders === 'function') {
            _daxiBootPreloadClientOrders();
        }
        _daxiPreloadAccountOnce();
    } else {
        var guestIdVal = window._daxiGuestId || localStorage.getItem('daxi_guest_id') || '';
        if (htmxOrdersEl) htmxOrdersEl.style.display = 'block';
        if (firebaseOrdersEl) firebaseOrdersEl.style.display = 'none';
        if (tabBtns) tabBtns.style.display = 'none';
        if (window.DaxiOffline && DaxiOffline.isReadOnly && DaxiOffline.isReadOnly()) {
            if (DaxiOffline.applyCachedUi) DaxiOffline.applyCachedUi('active');
        } else if (guestIdVal && typeof _daxiBootPreloadClientOrders === 'function') {
            _daxiBootPreloadClientOrders();
        }
        try {
            _daxiPreloadAccountOnce();
        } catch(e) {}
    }

    var menuToggle = document.getElementById('menuToggle');
    var sidebarMenu = document.getElementById('sidebarMenu');
    var sidebarOverlay = document.getElementById('sidebarOverlay');
    var sidebarClose = document.getElementById('sidebarClose');

    function openSidebar() {
        if (sidebarMenu) sidebarMenu.classList.add('active');
        if (sidebarOverlay) sidebarOverlay.classList.add('active');
    }
    function closeSidebar() {
        if (sidebarMenu) sidebarMenu.classList.remove('active');
        if (sidebarOverlay) sidebarOverlay.classList.remove('active');
    }
    window.openSidebar = openSidebar;
    window.closeSidebar = closeSidebar;

    if (menuToggle) menuToggle.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        openSidebar();
    });
    var menuFab = document.getElementById('daxiMenuFab');
    if (menuFab && !menuFab.dataset.daxiMenuBound) {
        menuFab.dataset.daxiMenuBound = '1';
        menuFab.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); openSidebar(); });
    }
    if (sidebarClose) sidebarClose.addEventListener('click', closeSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

    if (sidebarMenu) {
        sidebarMenu.addEventListener('click', function(evt) {
            if (evt.target.closest('.sidebar-menu-item, .sidebar-nav-group summary')) {
                if (!evt.target.closest('.sidebar-language-btn')) {
                    setTimeout(closeSidebar, 80);
                }
            }
        });
    }


    var loginBtn = document.getElementById('loginBtn');
    var sidebarLoginBtn = document.getElementById('sidebarLoginBtn');
    var loginModal = document.getElementById('loginModal');

    window.daxiIsValidEmail = function(email) {
        email = String(email || '').trim();
        if (!email || email.length > 254 || email.indexOf(' ') !== -1) return false;
        return /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(email);
    };

    function openLoginModal(tab) {
        if (typeof closeSignupModal === 'function') closeSignupModal();
        var forgotModal = document.getElementById('forgotPasswordModal');
        if (forgotModal) {
            forgotModal.style.display = 'none';
            forgotModal.classList.remove('is-open');
        }
        if (loginModal) {
            loginModal.style.display = 'flex';
            loginModal.style.zIndex = '20000';
            loginModal.classList.add('is-open');
        }
        closeSidebar();
        var wantTab = (tab === 'id') ? 'id' : 'password';
        document.querySelectorAll('#loginModal .tab').forEach(function(t) {
            t.classList.toggle('active', t.dataset.tab === wantTab);
        });
        document.querySelectorAll('#loginModal .tab-content').forEach(function(c) { c.classList.remove('active'); });
        var content = document.getElementById(wantTab + 'Tab');
        if (content) content.classList.add('active');
    }
    function openSignupModal() {
        var signupModal = document.getElementById('daxiSignupModal');
        if (!signupModal) return;
        if (loginModal) {
            loginModal.style.display = 'none';
            loginModal.classList.remove('is-open');
        }
        var forgotModal = document.getElementById('forgotPasswordModal');
        if (forgotModal) {
            forgotModal.style.display = 'none';
            forgotModal.classList.remove('is-open');
        }
        closeSidebar();
        if (typeof window._daxiRegenSignupId === 'function') window._daxiRegenSignupId();
        if (typeof window.regWizardGo === 'function') window.regWizardGo(1, true);
        signupModal.style.display = 'flex';
        signupModal.style.zIndex = '20000';
        signupModal.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        var firstInput = document.getElementById('lastName');
        if (firstInput) setTimeout(function() { firstInput.focus(); }, 180);
    }
    function closeSignupModal() {
        var signupModal = document.getElementById('daxiSignupModal');
        if (!signupModal) return;
        signupModal.style.display = 'none';
        signupModal.classList.remove('is-open');
        document.body.style.overflow = '';
    }
    window.openLoginModal = openLoginModal;
    window.openSignupModal = openSignupModal;
    window.closeSignupModal = closeSignupModal;
    if (loginBtn) loginBtn.addEventListener('click', openLoginModal);
    if (sidebarLoginBtn) sidebarLoginBtn.addEventListener('click', openLoginModal);


    document.querySelectorAll('.close-modal').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var modal = btn.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
                modal.classList.remove('is-open');
            }
        });
    });
    document.querySelectorAll('.close-signup-modal').forEach(function(btn) {
        btn.addEventListener('click', function() {
            if (typeof closeSignupModal === 'function') closeSignupModal();
        });
    });
    var signupModalEl = document.getElementById('daxiSignupModal');
    if (signupModalEl) {
        signupModalEl.addEventListener('click', function(e) {
            if (e.target === signupModalEl && typeof closeSignupModal === 'function') closeSignupModal();
        });
    }


    document.querySelectorAll('#loginModal .tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
            var tabName = tab.dataset.tab;
            document.querySelectorAll('#loginModal .tab').forEach(function(t){ t.classList.remove('active'); });
            document.querySelectorAll('#loginModal .tab-content').forEach(function(c){ c.classList.remove('active'); });
            tab.classList.add('active');
            var content = document.getElementById(tabName + 'Tab');
            if (content) content.classList.add('active');
        });
    });


    var nowBtn = document.getElementById('nowBtn');
    var laterBtn = document.getElementById('laterBtn');
    var dateTimeSection = document.getElementById('dateTimeSection');

    if (nowBtn) nowBtn.addEventListener('click', function() {
        nowBtn.classList.add('active'); if (laterBtn) laterBtn.classList.remove('active');
        if (dateTimeSection) dateTimeSection.classList.add('hidden');
        var isLaterHidden = document.getElementById('isLaterHidden');
        if (isLaterHidden) isLaterHidden.value = 'false';

        var btn = document.getElementById('orderTaxiBtn');
        if (btn && !btn.dataset.fixedPlan) btn.textContent = 'Commander un Taxi';

        try {
            var ordersTab = document.getElementById('tabbtn-orders');
            var onOrdersTab = ordersTab && ordersTab.classList.contains('active');
            if (onOrdersTab) {
                window._daxiDriverTapCount = (window._daxiDriverTapCount || 0) + 1;
                clearTimeout(window._daxiDriverTapTimer);
                window._daxiDriverTapTimer = setTimeout(function() { window._daxiDriverTapCount = 0; }, 2200);
                if (window._daxiDriverTapCount >= 5) {
                    window._daxiDriverTapCount = 0;
                    var req = (typeof DaxiAndroid !== 'undefined' && DaxiAndroid.requestDriverAccess)
                        ? DaxiAndroid.requestDriverAccess()
                        : null;
                    var handle = function(data) {
                        if (data && data.allowed && data.redirect) {
                            window.location.href = data.redirect;
                        }
                    };
                    if (req) {
                        try { handle(JSON.parse(req)); } catch (e) {}
                    } else {
                        fetch('/api/mobile/driver-access/', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' })
                            .then(function(r) { return r.json(); })
                            .then(handle)
                            .catch(function() {});
                    }
                }
            }
        } catch (e) {}
    });
    if (laterBtn) laterBtn.addEventListener('click', function() {
        laterBtn.classList.add('active'); if (nowBtn) nowBtn.classList.remove('active');
        if (dateTimeSection) dateTimeSection.classList.remove('hidden');
        var isLaterHidden = document.getElementById('isLaterHidden');
        if (isLaterHidden) isLaterHidden.value = 'true';
        captureScheduledGps();
        setTimeout(function() { _syncSheetHeightVar(); if (window._bookingMarkers) _fitMapToBookingMarkers(); }, 80);
    });
    (function bindDatetimePlaceholders() {
        document.querySelectorAll('#dateTimeSection .daxi-datetime-field').forEach(function(field) {
            var input = field.querySelector('input');
            if (!input) return;
            var sync = function() { field.classList.toggle('is-empty', !input.value); };
            input.addEventListener('input', sync);
            input.addEventListener('change', sync);
            sync();
        });
    })();

    var notesRow = document.getElementById('notesToggleRow');
    var notesExpand = document.getElementById('notesExpand');
    var notesChevron = document.getElementById('notesChevron');
    function toggleNotesExpand() {
        if (!notesExpand) return;
        var open = notesExpand.classList.toggle('open');
        if (notesChevron) notesChevron.className = 'daxi-row-chevron ' + (open ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line');
        if (open) {
            var ta = document.getElementById('bookingDescription');
            if (ta) setTimeout(function() { ta.focus(); }, 80);
        }
    }
    if (notesRow) {
        notesRow.addEventListener('click', toggleNotesExpand);
        notesRow.addEventListener('keydown', function(ev) {
            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggleNotesExpand(); }
        });
    }


    var oneWayBtn = document.getElementById('oneWayBtn');
    var roundTripBtn = document.getElementById('roundTripBtn');
    var tripTypeHidden = document.getElementById('tripTypeHidden');
    function setTripType(value, activeBtn, inactiveBtn) {
        if (tripTypeHidden) tripTypeHidden.value = value;
        if (activeBtn) activeBtn.classList.add('active');
        if (inactiveBtn) inactiveBtn.classList.remove('active');
        if (window._syncRoundTripWaitUi) _syncRoundTripWaitUi();
        _syncBookingHiddenFields();
    }
    if (oneWayBtn) oneWayBtn.addEventListener('click', function() { setTripType('aller simple', oneWayBtn, roundTripBtn); });
    if (roundTripBtn) roundTripBtn.addEventListener('click', function() { setTripType('aller-retour', roundTripBtn, oneWayBtn); });


    var orderBtn = document.getElementById('orderTaxiBtn');
    if (orderBtn) {
        orderBtn.addEventListener('htmx:configRequest', function() {
            _syncBookingHiddenFields();
        }, {once: false});
    }


    var blogBtn = document.getElementById('sidebarBlogBtn');
    var blogModal = document.getElementById('blogFullscreenModal');
    if (blogBtn && blogModal) {
        blogBtn.addEventListener('click', function() {
            openFullscreenBlog();
            closeSidebar();
        });
    }


    var closePlanBtns = document.querySelectorAll('.plan-close-btn');
    closePlanBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
            var modal = btn.closest('.plan-detail-modal');
            if (modal) modal.classList.remove('show');
        });
    });


    document.querySelectorAll('.route-book-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var dest = btn.getAttribute('data-to');
            var destField = document.getElementById('destinationAddressArrival') || document.getElementById('arrivalAddress');
            if (destField) {
                destField.value = dest;

                destField.dataset.placeSelected = '1';
            }

            var destHidden = document.getElementById('destinationHidden');
            if (destHidden) destHidden.value = dest;

            var destLat = document.getElementById('destLatHidden');
            var destLng = document.getElementById('destLngHidden');
            if (destLat) destLat.value = '';
            if (destLng) destLng.value = '';
            var bookingSection = document.getElementById('bookingSection');
            if (bookingSection) bookingSection.scrollIntoView({ behavior: 'smooth' });
        });
    });


    var _oldGpsNote = document.getElementById('gpsUnavailableNote');
    if (_oldGpsNote) _oldGpsNote.remove();


    window.captureScheduledGps = function() {
        var statusEl = document.getElementById('scheduledGpsStatus');
        var btn = document.getElementById('scheduledGpsBtn');
        if (statusEl) statusEl.textContent = '📡 Localisation...';
        if (!navigator.geolocation) {
            if (statusEl) statusEl.textContent = '⚠️ GPS non disponible — votre position sera demandée au moment du départ.';
            return;
        }
        navigator.geolocation.getCurrentPosition(function(pos) {
            var validated = _daxiValidateGeoPos(pos, 'scheduled-capture');
            if (!validated) {
                if (statusEl) statusEl.textContent = '⚠️ Précision insuffisante — réessayez ou saisissez l\'adresse.';
                return;
            }
            var lat = validated.lat, lng = validated.lng;

            var latEl = document.getElementById('pickupLatHidden');
            var lngEl = document.getElementById('pickupLngHidden');
            if (latEl) latEl.value = lat;
            if (lngEl) lngEl.value = lng;

            window._scheduledPickupLat = lat;
            window._scheduledPickupLng = lng;
            if (statusEl) statusEl.textContent = '✅ Position enregistrée (' + lat.toFixed(4) + ', ' + lng.toFixed(4) + ')';
            if (btn) { btn.textContent = '✅ Position enregistrée'; btn.style.background = '#10b981'; btn.style.color = '#fff'; }
        }, function() {
            if (statusEl) statusEl.textContent = '❌ GPS refusé — votre position sera demandée plus tard.';
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    };


    window._daxiLoaderDismissed = window._daxiLoaderDismissed || false;
    if (!window._daxiDismissInitialLoader) {
        window._daxiDismissInitialLoader = function() {
            if (window._daxiIntroPlaying) {
                window._daxiLoaderDismissQueued = true;
                if (typeof window._daxiBootMark === 'function') window._daxiBootMark('loader-dismiss-deferred');
                if (!window._daxiLoaderFlushBound) {
                    window._daxiLoaderFlushBound = true;
                    var flush = function() {
                        if (window._daxiLoaderDismissQueued && window._daxiDismissInitialLoader) {
                            window._daxiLoaderDismissQueued = false;
                            window._daxiDismissInitialLoader();
                        }
                    };
                    window.addEventListener('daxi:intro-complete', flush, { once: true });
                    document.addEventListener('daxi:intro-complete', flush, { once: true });
                }
                return;
            }
            if (window._daxiLoaderDismissed) return;
            window._daxiLoaderDismissed = true;
            if (typeof window._daxiBootMark === 'function') window._daxiBootMark('loader-dismiss');
            document.documentElement.classList.remove('daxi-booting');
            var loader = document.getElementById('initialLoader');
            if (loader) {
                loader.classList.add('is-dismissed');
                loader.style.pointerEvents = 'none';
                loader.style.opacity = '0';
                loader.style.visibility = 'hidden';
                setTimeout(function(){ loader.style.display = 'none'; }, 550);
            }
        };
    }





    setTimeout(function() {
        if (window._daxiIsNativeApp && window._daxiIsNativeApp()) return;
        if (typeof _daxiMaybeAskLocation === 'function') _daxiMaybeAskLocation();
    }, 4500);


    function _onLoginSuccess(data) {

        window.DJANGO_SESSION = Object.assign(window.DJANGO_SESSION || {}, {
            is_authenticated: true,
            user_name: data.user_name || '',
            first_name: data.first_name || '',
            user_id: data.user_id || '',
            csrf_token: data.csrf_token || (window.DJANGO_SESSION && window.DJANGO_SESSION.csrf_token) || '',
        });
        localStorage.setItem('daxi_auth', JSON.stringify({
            is_authenticated: true,
            user_name: data.user_name || '',
            first_name: data.first_name || '',
            user_id: data.user_id || '',
        }));

        var loginModal = document.getElementById('loginModal');
        if (loginModal) loginModal.style.display = 'none';

        displayUserName();

        var htmxOrdersEl = document.getElementById('client-orders-htmx');
        var firebaseOrdersEl = document.getElementById('pendingOrdersContainer');
        var tabBtns = document.getElementById('orders-tab-btns');
        var pendingSec = document.getElementById('all-pending-requests');
        if (pendingSec) pendingSec.style.display = 'block';
        if (htmxOrdersEl) htmxOrdersEl.style.display = 'block';
        if (firebaseOrdersEl) firebaseOrdersEl.style.display = 'none';
        if (tabBtns) { tabBtns.style.display = 'flex'; tabBtns.style.gap = '6px'; }

        var loginBtn = document.getElementById('loginBtn');
        if (loginBtn) loginBtn.style.display = 'none';

        if (typeof _daxiBootPreloadClientOrders === 'function') {
            _daxiInvalidateClientOrdersCache('all');
            _daxiBootPreloadClientOrders();
        }
        if (window._daxiRegisterPushToken) {
            try { window._daxiRegisterPushToken(); } catch (ePush) {}
        }
        if (window.DaxiDeepLink && typeof window.DaxiDeepLink.ready === 'function') {
            window.DaxiDeepLink.ready();
        }
    }
    window._onLoginSuccess = _onLoginSuccess;


    window._scrollToOrders = function() {
        var sec = document.getElementById('all-pending-requests');
        var htmxEl = document.getElementById('client-orders-htmx');
        if (sec) { sec.style.display = 'block'; sec.classList.add('show-heading'); }
        if (htmxEl) { htmxEl.style.display = 'block'; }

        var ds = window.DJANGO_SESSION || {};
        if (typeof _daxiBootPreloadClientOrders === 'function') {
            _daxiBootPreloadClientOrders().then(function() {
                if (_daxiHasClientOrdersCache('active')) {
                    _daxiApplyClientOrdersHtml('active', window._daxiClientOrdersCache.active.html, { initMaps: true });
                }
            });
        }
        setTimeout(function() {
            if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 200);
    };


    var loginWithIdBtn = document.getElementById('loginWithIdBtn');
    if (loginWithIdBtn) {
        loginWithIdBtn.addEventListener('click', function() {
            var userId = (document.getElementById('userIdInput') || {}).value || '';
            userId = userId.trim();
            if (!userId) {
                showAuthError('idTab', 'Veuillez saisir votre ID.');
                return;
            }
            if (window.daxiBtnLoading) daxiBtnLoading(loginWithIdBtn, true);

            var formData = new FormData();
            formData.append('user_id', userId);
            var csrf = getCsrfToken();
            if (csrf) formData.append('csrfmiddlewaretoken', csrf);
            var gidForLogin = window._daxiGuestId || localStorage.getItem('daxi_guest_id') || '';
            if (gidForLogin) formData.append('guest_id', gidForLogin);

            fetch('/htmx/client/login-by-id/', {
                method: 'POST',
                body: formData,
                credentials: 'same-origin',
            })
            .then(function(r) {
                if (r.status === 404) throw new Error('LOGIN_ENDPOINT_NOT_FOUND');
                return r.json();
            })
            .then(function(data) {
                if (data && data.success) {
                    _onLoginSuccess(data);
                } else {
                    var msg = data && data.error ? data.error : (data && data.message ? data.message : 'Erreur de connexion.');
                    showAuthError('idTab', msg);
                }
            })
            .catch(function(err) {
                var msg = 'Erreur réseau. Réessayez.';
                if (err && err.message === 'LOGIN_ENDPOINT_NOT_FOUND') {
                    msg = 'Le service de connexion n\'est pas disponible pour le moment.';
                }
                showAuthError('idTab', msg);
            })
            .finally(function() {
                if (window.daxiBtnLoading) daxiBtnLoading(loginWithIdBtn, false);
            });
        });
    }


    var loginWithPasswordBtn = document.getElementById('loginWithPasswordBtn');
    if (loginWithPasswordBtn) {
        loginWithPasswordBtn.addEventListener('click', function() {
            var emailInput = document.getElementById('emailInput');
            var passwordInput = document.getElementById('passwordInput');
            var errDiv = document.getElementById('loginPasswordError');
            var email = emailInput ? emailInput.value.trim() : '';
            var password = passwordInput ? passwordInput.value : '';
            if (!email || !password) {
                if (errDiv) errDiv.innerHTML = '<div style="color:#ef4444;font-size:13px;padding:8px;background:#fee2e2;border-radius:8px;">Email et mot de passe requis.</div>';
                return;
            }
            if (typeof window.daxiIsValidEmail === 'function' && !window.daxiIsValidEmail(email)) {
                if (errDiv) errDiv.innerHTML = '<div style="color:#ef4444;font-size:13px;padding:8px;background:#fee2e2;border-radius:8px;">Entrez une adresse email valide (ex. toi@gmail.com ou toi@entreprise.ht).</div>';
                return;
            }
            if (window.daxiBtnLoading) daxiBtnLoading(loginWithPasswordBtn, true);
            if (errDiv) errDiv.innerHTML = '';

            var formData = new FormData();
            formData.append('email', email);
            formData.append('password', password);
            var csrf = getCsrfToken();
            if (csrf) formData.append('csrfmiddlewaretoken', csrf);
            var gidForLogin2 = window._daxiGuestId || localStorage.getItem('daxi_guest_id') || '';
            if (gidForLogin2) formData.append('guest_id', gidForLogin2);

            fetch('/htmx/client/login/', {
                method: 'POST',
                body: formData,
                credentials: 'same-origin',
            })
            .then(function(r) {
                if (r.status === 404) throw new Error('LOGIN_ENDPOINT_NOT_FOUND');
                return r.json();
            })
            .then(function(data) {
                if (data && data.success) {
                    _onLoginSuccess(data);
                } else {
                    var msg = data && data.error ? data.error : (data && data.message ? data.message : 'Erreur de connexion.');
                    if (errDiv) errDiv.innerHTML = '<div style="color:#ef4444;font-size:13px;padding:8px;background:#fee2e2;border-radius:8px;">' + msg + '</div>';
                    if (window.daxiBtnLoading) daxiBtnLoading(loginWithPasswordBtn, false);
                }
            })
            .catch(function(err) {
                var msg = 'Erreur réseau. Réessayez.';
                if (err && err.message === 'LOGIN_ENDPOINT_NOT_FOUND') {
                    msg = 'Le service de connexion n\'est pas disponible pour le moment. Veuillez réessayer plus tard.';
                }
                if (errDiv) errDiv.innerHTML = '<div style="color:#ef4444;font-size:13px;padding:8px;background:#fee2e2;border-radius:8px;">' + msg + '</div>';
                if (window.daxiBtnLoading) daxiBtnLoading(loginWithPasswordBtn, false);
            });
        });
    }


    function generateUserId() {
        return String(Math.floor(1000 + Math.random() * 9000));
    }
    var generatedIdEl = document.getElementById('generatedUserId');
    var generatedIdValue = generateUserId();
    if (generatedIdEl) generatedIdEl.textContent = generatedIdValue;


    var registerForm = document.getElementById('createAccountForm');
    if (registerForm) {
        var hiddenIdField = document.createElement('input');
        hiddenIdField.type = 'hidden';
        hiddenIdField.name = 'firebase_user_id';
        hiddenIdField.id = 'firebaseUserIdHidden';
        hiddenIdField.value = generatedIdValue;
        registerForm.appendChild(hiddenIdField);


        registerForm.addEventListener('htmx:configRequest', function(e) {
            var code = (document.getElementById('countryCode') || {}).value || '+509';
            var num = (document.getElementById('phone') || {}).value || '';
            if (num) {
                e.detail.parameters['phone'] = (typeof daxiNormalizePhone === 'function')
                    ? daxiNormalizePhone(code, num)
                    : (code + num.replace(/\D/g, ''));
            }

            var el = document.getElementById('generatedUserId');
            if (el) e.detail.parameters['firebase_user_id'] = el.textContent;

            var gid = window._daxiGuestId || localStorage.getItem('daxi_guest_id') || '';
            if (gid) e.detail.parameters['guest_id'] = gid;
        });
    }


    window._daxiRegenSignupId = function() {
        var newId = generateUserId();
        var el = document.getElementById('generatedUserId');
        var hidden = document.getElementById('firebaseUserIdHidden');
        if (el) el.textContent = newId;
        if (hidden) hidden.value = newId;
    };
    window._daxiRegenSignupId();


    var resetPhone = '';
    var resetCodeValue = '';

    function _forgotPhoneValue() {
        var prefix = (document.getElementById('forgotCountryCode') || {}).value || '+509';
        var num = (document.getElementById('forgotPasswordPhone') || {}).value || '';
        if (typeof daxiNormalizePhone === 'function') return daxiNormalizePhone(prefix, num);
        return prefix + String(num).replace(/\D/g, '');
    }

    function openForgotPasswordModal() {
        if (typeof closeSignupModal === 'function') closeSignupModal();
        var loginModal = document.getElementById('loginModal');
        var forgotPasswordModal = document.getElementById('forgotPasswordModal');
        if (!forgotPasswordModal) return false;
        if (loginModal) {
            loginModal.style.display = 'none';
            loginModal.classList.remove('is-open');
        }
        document.body.appendChild(forgotPasswordModal);
        var step1 = document.getElementById('forgotPasswordStep1');
        var step2 = document.getElementById('forgotPasswordStep2');
        var step3 = document.getElementById('forgotPasswordStep3');
        if (step1) step1.style.display = 'block';
        if (step2) step2.style.display = 'none';
        if (step3) step3.style.display = 'none';
        forgotPasswordModal.style.display = 'flex';
        forgotPasswordModal.style.zIndex = '50000';
        forgotPasswordModal.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        var phoneInput = document.getElementById('forgotPasswordPhone');
        if (phoneInput) setTimeout(function() { phoneInput.focus(); }, 80);
        return false;
    }
    window.openForgotPasswordModal = openForgotPasswordModal;

    var forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
    var forgotPasswordModal = document.getElementById('forgotPasswordModal');
    if (forgotPasswordBtn) {
        forgotPasswordBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (e.stopImmediatePropagation) e.stopImmediatePropagation();
            openForgotPasswordModal();
        }, true);
    }

    document.querySelectorAll('.close-forgot-modal').forEach(function(btn) {
        btn.addEventListener('click', function() {
            if (forgotPasswordModal) {
                forgotPasswordModal.style.display = 'none';
                forgotPasswordModal.classList.remove('is-open');
            }
            document.body.style.overflow = '';
            document.getElementById('forgotPasswordStep1').style.display = 'block';
            document.getElementById('forgotPasswordStep2').style.display = 'none';
            document.getElementById('forgotPasswordStep3').style.display = 'none';
        });
    });


    var sendResetCodeBtn = document.getElementById('sendResetCodeBtn');
    if (sendResetCodeBtn) {
        sendResetCodeBtn.addEventListener('click', function() {
            resetPhone = _forgotPhoneValue();
            if (!resetPhone) { alert('Entrez le numéro WhatsApp de ton compte.'); return; }

            sendResetCodeBtn.disabled = true;
            sendResetCodeBtn.innerHTML = '<i class="ri-whatsapp-fill"></i> Envoi...';

            fetch('/api/auth/forgot-password/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                body: JSON.stringify({ phone: resetPhone }),
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.error) { alert(data.error); return; }
                var sentTo = document.getElementById('sentToEmail');
                if (sentTo) sentTo.textContent = data.phone_hint || resetPhone;
                document.getElementById('forgotPasswordStep1').style.display = 'none';
                document.getElementById('forgotPasswordStep2').style.display = 'block';
            })
            .catch(function() { alert('Erreur réseau. Réessayez.'); })
            .finally(function() {
                sendResetCodeBtn.disabled = false;
                sendResetCodeBtn.innerHTML = '<i class="ri-whatsapp-fill"></i> Envoyer le code WhatsApp';
            });
        });
    }


    var verifyResetCodeBtn = document.getElementById('verifyResetCodeBtn');
    if (verifyResetCodeBtn) {
        verifyResetCodeBtn.addEventListener('click', function() {
            var code = (document.getElementById('resetCode') || {}).value || '';
            if (!code || code.length !== 6) { alert('Entrez le code à 6 chiffres.'); return; }
            if (!resetPhone) { alert('Numéro introuvable. Recommence depuis le début.'); return; }
            resetCodeValue = code;

            verifyResetCodeBtn.disabled = true;
            verifyResetCodeBtn.textContent = 'Vérification...';

            fetch('/api/auth/verify-reset-code/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                body: JSON.stringify({ phone: resetPhone, code: code }),
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.error || !data.valid) {
                    alert(data.error || 'Code incorrect ou expiré.');
                    return;
                }
                document.getElementById('forgotPasswordStep2').style.display = 'none';
                document.getElementById('forgotPasswordStep3').style.display = 'block';
            })
            .catch(function() { alert('Erreur réseau. Réessayez.'); })
            .finally(function() {
                verifyResetCodeBtn.disabled = false;
                verifyResetCodeBtn.innerHTML = '<i class="ri-check-line"></i> Vérifier le code';
            });
        });
    }


    var resendResetCodeBtn = document.getElementById('resendResetCodeBtn');
    if (resendResetCodeBtn) {
        resendResetCodeBtn.addEventListener('click', function() {
            if (!resetPhone) { alert('Numéro introuvable. Recommence depuis le début.'); return; }
            fetch('/api/auth/forgot-password/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                body: JSON.stringify({ phone: resetPhone }),
            }).catch(function(){});
            alert('Code renvoyé sur WhatsApp.');
        });
    }


    var saveNewPasswordBtn = document.getElementById('saveNewPasswordBtn');
    if (saveNewPasswordBtn) {
        saveNewPasswordBtn.addEventListener('click', function() {
            var newPw = (document.getElementById('newPassword') || {}).value || '';
            var confirmPw = (document.getElementById('confirmNewPassword') || {}).value || '';
            var errEl = document.getElementById('newPasswordError');

            if (newPw !== confirmPw) {
                if (errEl) errEl.style.display = 'block';
                return;
            }
            if (errEl) errEl.style.display = 'none';
            if (newPw.length < 6) { alert('Le mot de passe doit contenir au moins 6 caractères.'); return; }

            saveNewPasswordBtn.disabled = true;
            saveNewPasswordBtn.textContent = 'Sauvegarde...';

            fetch('/api/auth/reset-password/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                body: JSON.stringify({ phone: resetPhone, code: resetCodeValue, new_password: newPw }),
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.error) { alert(data.error); return; }
                alert('Mot de passe réinitialisé ! Connectez-vous avec votre nouveau mot de passe.');
                if (forgotPasswordModal) {
                    forgotPasswordModal.style.display = 'none';
                    forgotPasswordModal.classList.remove('is-open');
                }
                document.getElementById('forgotPasswordStep1').style.display = 'block';
                document.getElementById('forgotPasswordStep2').style.display = 'none';
                document.getElementById('forgotPasswordStep3').style.display = 'none';
                if (typeof openLoginModal === 'function') openLoginModal('password');
            })
            .catch(function() { alert('Erreur réseau. Réessayez.'); })
            .finally(function() {
                saveNewPasswordBtn.disabled = false;
                saveNewPasswordBtn.innerHTML = '<i class="ri-save-line"></i> Enregistrer';
            });
        });
    }
});


function showAuthError(tabId, msg) {
    var tab = document.getElementById(tabId);
    if (!tab) return;
    var err = tab.querySelector('.auth-error-msg') || document.createElement('div');
    err.className = 'auth-error-msg';
    err.style.cssText = 'margin-top:8px;padding:8px 12px;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;color:#b91c1c;font-size:13px;';
    err.textContent = msg;
    tab.appendChild(err);
    setTimeout(function() { if (err.parentNode) err.parentNode.removeChild(err); }, 5000);
}


function switchOrdersTab(tab) {
    var activeBtn = document.getElementById('orders-tab-active');
    var histBtn = document.getElementById('orders-tab-history');
    var ordersEl = document.getElementById('client-orders-htmx');
    if (ordersEl) ordersEl.dataset.currentTab = tab;

    if (tab === 'active') {
        if (activeBtn) { activeBtn.style.background = 'linear-gradient(135deg,#667eea,#764ba2)'; activeBtn.style.color = 'white'; activeBtn.style.border = 'none'; }
        if (histBtn) { histBtn.style.background = 'white'; histBtn.style.color = '#374151'; histBtn.style.border = '1px solid #e5e7eb'; }
    } else {
        if (histBtn) { histBtn.style.background = 'linear-gradient(135deg,#667eea,#764ba2)'; histBtn.style.color = 'white'; histBtn.style.border = 'none'; }
        if (activeBtn) { activeBtn.style.background = 'white'; activeBtn.style.color = '#374151'; activeBtn.style.border = '1px solid #e5e7eb'; }
    }
    if ((window.DaxiOffline && DaxiOffline.isReadOnly && DaxiOffline.isReadOnly()) || !_daxiIsOnlineForHtmx()) {
        return _daxiServeOfflineOrdersTab(tab, { apply: true, initMaps: true });
    }
    if (_daxiHasClientOrdersCache(tab)) {
        _daxiApplyClientOrdersHtml(tab, window._daxiClientOrdersCache[_daxiClientOrdersTabKey(tab)].html, { initMaps: true });
        return;
    }
    _daxiFetchClientOrdersTab(tab, { apply: true });
}


function _daxiClearClientAuthUi() {
    if (window.DJANGO_SESSION) {
        window.DJANGO_SESSION.is_authenticated = false;
        window.DJANGO_SESSION.user_name = null;
        window.DJANGO_SESSION.first_name = null;
        window.DJANGO_SESSION.user_id = null;
        window.DJANGO_SESSION.user_email = null;
        window.DJANGO_SESSION.user_phone = null;
    }
    try { localStorage.removeItem('daxi_auth'); } catch (e) {}

    var loginSection = document.getElementById('loginSection');
    var userDisplay = document.getElementById('userDisplay');
    if (loginSection) loginSection.classList.remove('hidden');
    if (userDisplay) userDisplay.classList.add('hidden');

    var sidebarUserSection = document.getElementById('sidebarUserSection');
    var sidebarLoginSection = document.getElementById('sidebarLoginSection');
    if (sidebarUserSection) sidebarUserSection.classList.add('hidden');
    if (sidebarLoginSection) sidebarLoginSection.style.display = '';

    var loginBtn = document.getElementById('loginBtn');
    if (loginBtn) loginBtn.style.display = '';

    var accountSlot = document.getElementById('account-htmx-slot');
    if (accountSlot && !accountSlot.querySelector('.daxi-acc, .daxi-acc-guest, .daxi-gate, [data-daxi-account-shell]')) {
        if (window.DaxiOffline && DaxiOffline.renderCachedAccountIfAny) {
            DaxiOffline.renderCachedAccountIfAny();
        }
    }
    window._daxiAccountPreloaded = false;

    if (window.DaxiRealtime && typeof DaxiRealtime.disconnect === 'function') {
        try { DaxiRealtime.disconnect(); } catch (e) {}
    }
}
window._daxiClearClientAuthUi = _daxiClearClientAuthUi;

function displayUserName() {
    var ds = window.DJANGO_SESSION || {};
    if (!ds.is_authenticated) {
        _daxiClearClientAuthUi();
        return;
    }
    var fullName = ds.user_name || ds.first_name || '';
    var userId = ds.user_id || '';
    var firstName = (fullName || '').split(' ')[0] || fullName;


    var loginSection = document.getElementById('loginSection');
    var userDisplay = document.getElementById('userDisplay');
    var userNameEl = document.getElementById('userName');
    var userIdEl = document.getElementById('userIdValue');
    if (loginSection) loginSection.classList.add('hidden');
    if (userDisplay) userDisplay.classList.remove('hidden');
    if (userNameEl) userNameEl.textContent = firstName || 'Moi';
    if (userIdEl && userId) userIdEl.textContent = userId;


    var sidebarUserSection = document.getElementById('sidebarUserSection');
    var sidebarLoginSection = document.getElementById('sidebarLoginSection');
    var sidebarUserName = document.getElementById('sidebarUserName');
    var sidebarUserIdValue = document.getElementById('sidebarUserIdValue');
    if (sidebarUserSection) sidebarUserSection.classList.remove('hidden');
    if (sidebarLoginSection) sidebarLoginSection.style.display = 'none';
    if (sidebarUserName) sidebarUserName.textContent = fullName || firstName || 'Utilisateur';
    if (sidebarUserIdValue && userId) sidebarUserIdValue.textContent = userId;
    _daxiSyncSidebarEnterprise();
}

function _daxiNativeAppPageUrl(url) {
    var path = url || '/';
    try {
        var u = new URL(path, location.origin);
        path = u.pathname + u.search + (u.hash || '');
    } catch (e) {
        if (path.charAt(0) !== '/') path = '/' + path;
    }
    if (typeof window.nativePageUrl === 'function') return window.nativePageUrl(path);
    if (window.DaxiApi && typeof window.DaxiApi.nativePageUrl === 'function') return window.DaxiApi.nativePageUrl(path);
    var base = (window.DAXI_API_BASE_URL || '').replace(/\/$/, '');
    var isNative = !!(window._daxiCapacitorApp || window.DaxiAndroid
        || (window._daxiIsNativeApp && window._daxiIsNativeApp()));
    if (isNative && base) return base + path;
    return path;
}

function _daxiGoEnterprise(e, url) {
    try { sessionStorage.setItem('daxi_from_app', '1'); } catch (_) {}
    if (e) e.preventDefault();
    var online = true;
    try {
        if (window.DaxiAndroid && typeof DaxiAndroid.isOnline === 'function') online = !!DaxiAndroid.isOnline();
        else if (typeof navigator.onLine === 'boolean') online = navigator.onLine;
    } catch (eOn) {}
    if (!online) {
        if (window.showDaxiNotification) showDaxiNotification('Hors ligne', 'Connexion internet requise pour ouvrir cette page.', { type: 'warning' });
        else if (window.showToast) showToast('Connexion internet requise pour ouvrir cette page.', 'warning');
        return false;
    }
    if (typeof closeSidebar === 'function') closeSidebar();
    window.location.assign(_daxiNativeAppPageUrl(url || '/entreprise/'));
}
window._daxiGoEnterprise = _daxiGoEnterprise;

document.addEventListener('click', function(evt) {
    var a = evt.target && evt.target.closest ? evt.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (!/\/(entreprise|driver|admin)/i.test(href)) return;
    var online = true;
    try {
        if (window.DaxiAndroid && typeof DaxiAndroid.isOnline === 'function') online = !!DaxiAndroid.isOnline();
        else if (typeof navigator.onLine === 'boolean') online = navigator.onLine;
    } catch (e) {}
    if (online) return;
    evt.preventDefault();
    evt.stopPropagation();
    if (window.showDaxiNotification) showDaxiNotification('Hors ligne', 'Connexion internet requise pour ouvrir cette page.', { type: 'warning' });
    else if (window.showToast) showToast('Connexion internet requise pour ouvrir cette page.', 'warning');
}, true);

function _daxiSyncSidebarEnterprise() {
    var s = window.DJANGO_SESSION || {};
    var btn = document.getElementById('sidebarEnterpriseBtn');
    var promo = document.getElementById('sidebarEnterprisePromo');
    var has = !!(s.has_enterprise || s.enterprise_id || s.current_enterprise_id
        || (s.enterprise_ids && s.enterprise_ids.length));

    if (promo) {
        if (has) promo.classList.add('hidden');
        else promo.classList.remove('hidden');
    }
    if (!btn) return;
    if (!has) {
        btn.classList.add('hidden');
        return;
    }
    btn.classList.remove('hidden');
    btn.href = s.enterprise_url || (
        s.enterprise_status === 'approved' && (s.enterprise_id || s.current_enterprise_id)
            ? '/entreprise/dashboard/'
            : '/entreprise/'
    );
    var span = btn.querySelector('span');
    if (span && s.enterprise_name) {
        span.textContent = s.enterprise_name;
        span.setAttribute('data-no-translate', '1');
    }
}
window._daxiSyncSidebarEnterprise = _daxiSyncSidebarEnterprise;


(function() {
    function boot() {
        if (typeof displayUserName === 'function') displayUserName();
        else if (typeof _daxiSyncSidebarEnterprise === 'function') _daxiSyncSidebarEnterprise();
        if (window.DaxiRealtime && window.DJANGO_SESSION && window.DJANGO_SESSION.is_authenticated) {
            DaxiRealtime.connect('client-main', DaxiRealtime.wsUrl('/ws/user/'), {
                onEvent: function(ev, data) {
                    if (!DaxiRealtime.isOrderEvent(ev)) return;
                    if (typeof _daxiNotifyOrderEvent === 'function') _daxiNotifyOrderEvent(ev, data || {});
                    if (window.DaxiRealtimeSync) DaxiRealtimeSync.handle(ev, data || {});
                    else if (typeof _loadDaxiSheetOrders === 'function') _loadDaxiSheetOrders({ keepOpen: true, metaOnly: true });
                }
            });
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();


(function() {
    function setupLogout() {
        function doLogout(e) {
            if (e) e.preventDefault();
            var csrf = getCsrfToken();
            fetch('/htmx/client/logout/', {
                method: 'POST',
                headers: { 'X-CSRFToken': csrf },
                credentials: 'same-origin',
            }).then(function(r) { return r.json().catch(function() { return {}; }); })
            .then(function(data) {
                if (data && data.csrf_token && window.DJANGO_SESSION) {
                    window.DJANGO_SESSION.csrf_token = data.csrf_token;
                }
                _daxiClearClientAuthUi();
                if (window.showDaxiNotification) {
                    showDaxiNotification('Déconnexion', 'Vous êtes déconnecté.', { type: 'info' });
                }
            }).catch(function() {
                _daxiClearClientAuthUi();
            });
        }
        var lb = document.getElementById('logoutBtn');
        var slb = document.getElementById('sidebarLogoutBtn');
        if (lb) lb.addEventListener('click', doLogout);
        if (slb) slb.addEventListener('click', doLogout);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupLogout);
    } else {
        setupLogout();
    }
})();


(function() {
    function setupToggle(inputId, iconId) {
        var input = document.getElementById(inputId);
        var icon = document.getElementById(iconId);
        if (!input || !icon) return;

        var newIcon = icon.cloneNode(true);
        icon.parentNode.replaceChild(newIcon, icon);
        newIcon.style.display = '';
        newIcon.addEventListener('click', function() {
            if (input.type === 'password') {
                input.type = 'text';
                newIcon.classList.remove('ri-eye-line');
                newIcon.classList.add('ri-eye-off-line');
            } else {
                input.type = 'password';
                newIcon.classList.remove('ri-eye-off-line');
                newIcon.classList.add('ri-eye-line');
            }
        });
    }
    function initToggles() {
        setupToggle('passwordInput', 'loginTogglePassword');
        setupToggle('password', 'passwordToggle');
        setupToggle('confirmPassword', 'confirmPasswordToggle');
        setupToggle('newPassword', 'toggleNewPassword');
        setupToggle('confirmNewPassword', 'toggleConfirmNewPassword');
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initToggles);
    } else {
        initToggles();
    }

    document.addEventListener('click', function(e) {
        var t = e.target.closest && e.target.closest('.toggle-password');
        if (!t) return;
        var container = t.parentNode;
        if (!container) return;
        var input = container.querySelector('input[type="password"], input[type="text"]');
        if (!input) return;
        if (input.type === 'password') {
            input.type = 'text';
            t.classList.remove('ri-eye-line');
            t.classList.add('ri-eye-off-line');
        } else {
            input.type = 'password';
            t.classList.remove('ri-eye-off-line');
            t.classList.add('ri-eye-line');
        }
    });
})();


(function() {
    var _pendingRegData = null;

    var _regAnimating = false;
    window.regWizardGo = function(step, instant) {
        if (_regAnimating && !instant) return;
        var steps = document.querySelectorAll('#daxiSignupModal .reg-step');
        var target = null;
        var current = null;
        steps.forEach(function(el) {
            var n = parseInt(el.getAttribute('data-reg-step'), 10);
            if (n === step) target = el;
            if (el.classList.contains('is-active')) current = el;
        });
        if (!target) return;
        function activate() {
            steps.forEach(function(el) {
                var n = parseInt(el.getAttribute('data-reg-step'), 10);
                var on = n === step;
                el.classList.toggle('is-active', on);
                el.style.display = on ? 'block' : 'none';
            });
            var fill = document.getElementById('daxiSignupProgressFill');
            if (fill) fill.style.width = (step * 33.33) + '%';
            document.querySelectorAll('#daxiSignupModal .daxi-signup-step-label').forEach(function(lbl) {
                var n = parseInt(lbl.getAttribute('data-step-label'), 10);
                lbl.classList.toggle('is-active', n === step);
                lbl.classList.toggle('is-done', n < step);
            });
            _regAnimating = false;
        }
        if (instant || !current || current === target) {
            activate();
            return;
        }
        _regAnimating = true;
        current.classList.add('reg-step--exit');
        setTimeout(function() {
            current.classList.remove('is-active', 'reg-step--exit');
            current.style.display = 'none';
            target.style.display = 'block';
            target.classList.add('is-active');
            activate();
        }, 260);
    };
    window.regWizardNext = function(from) {
        if (from === 1) {
            var ln = (document.getElementById('lastName') || {}).value || '';
            var fn = (document.getElementById('firstName') || {}).value || '';
            var em = (document.getElementById('email') || {}).value || '';
            if (!ln || !fn || !em) { alert('Remplissez nom, prénom et email.'); return; }
            if (typeof window.daxiIsValidEmail === 'function' && !window.daxiIsValidEmail(em)) {
                alert('Entrez une adresse email valide (ex. toi@gmail.com ou toi@entreprise.ht).');
                return;
            }
            regWizardGo(2);
        } else if (from === 2) {
            var phone = (document.getElementById('phone') || {}).value || '';
            var pw = (document.getElementById('password') || {}).value || '';
            var cpw = (document.getElementById('confirmPassword') || {}).value || '';
            if (!phone) { alert('Le numéro WhatsApp est obligatoire.'); return; }
            if (!pw || pw.length < 6) { alert('Mot de passe min. 6 caractères.'); return; }
            if (pw !== cpw) {
                var pe = document.getElementById('passwordError');
                if (pe) pe.style.display = 'block';
                return;
            }
            regWizardGo(3);
        }
    };
    window.regWizardPrev = function(from) {
        if (from === 2) regWizardGo(1);
        else if (from === 3) regWizardGo(2);
    };

    function setupRegistration() {
        var form = document.getElementById('createAccountForm');
        if (!form) return;

        form.removeAttribute('hx-post');
        form.removeAttribute('hx-target');
        form.removeAttribute('hx-swap');


        form.addEventListener('htmx:beforeRequest', function(e) {
            e.preventDefault();
            e.stopPropagation();
        });

        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            var submitBtn = form.querySelector('[type="submit"]');

            var lastName = (document.getElementById('lastName') || {}).value || '';
            var firstName = (document.getElementById('firstName') || {}).value || '';
            var email = (document.getElementById('email') || {}).value || '';
            var countryCode = (document.getElementById('countryCode') || {}).value || '+509';
            var phoneRaw = (document.getElementById('phone') || {}).value || '';
            var phone = (typeof daxiNormalizePhone === 'function')
                ? daxiNormalizePhone(countryCode, phoneRaw)
                : (countryCode + phoneRaw.replace(/\D/g, ''));
            var password = (document.getElementById('password') || {}).value || '';
            var confirmPassword = (document.getElementById('confirmPassword') || {}).value || '';
            var age = (document.getElementById('age') || {}).value || '';
            var userId = (document.getElementById('generatedUserId') || {}).textContent || '';


            var errEl = document.getElementById('registerError');
            function showErr(msg) { if (errEl) errEl.innerHTML = '<div style="color:#ef4444;font-size:13px;margin-top:6px;">' + msg + '</div>'; }

            if (!lastName || !firstName || !email || !password) { showErr('Tous les champs sont obligatoires.'); return; }
            if (typeof window.daxiIsValidEmail === 'function' && !window.daxiIsValidEmail(email)) {
                showErr('Entrez une adresse email valide (ex. toi@gmail.com ou toi@entreprise.ht).');
                return;
            }
            if (!phoneRaw) { showErr('Le numéro WhatsApp est obligatoire.'); return; }
            if (!phone) { showErr('Numéro WhatsApp invalide. Exemple : 40123456'); return; }
            if (password !== confirmPassword) {
                var pe = document.getElementById('passwordError');
                if (pe) pe.style.display = 'block';
                return;
            }
            if (password.length < 6) { showErr('Le mot de passe doit contenir au moins 6 caractères.'); return; }


            if (submitBtn) { submitBtn.classList.add('btn-loading'); submitBtn.disabled = true; }


            try {
                var otpResp = await fetch('/api/auth/send-otp/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                    body: JSON.stringify({
                        email: email,
                        phone: phone,
                        name: firstName + ' ' + lastName,
                    }),
                    credentials: 'same-origin',
                });
                var otpData = await otpResp.json();
                if (!otpData.success) {
                    showErr('Erreur envoi WhatsApp : ' + (otpData.message || 'Réessayez.'));
                    if (submitBtn) { submitBtn.classList.remove('btn-loading'); submitBtn.disabled = false; }
                    return;
                }
            } catch(ex) {
                showErr('Erreur réseau. Vérifiez votre connexion.');
                if (submitBtn) { submitBtn.classList.remove('btn-loading'); submitBtn.disabled = false; }
                return;
            }


            _pendingRegData = {
                firstname: firstName,
                lastname: lastName,
                email: email,
                phone: phone,
                password: password,
                age: age,
                firebase_user_id: userId,
            };
            localStorage.setItem('_pendingReg', JSON.stringify(_pendingRegData));

            if (submitBtn) { submitBtn.classList.remove('btn-loading'); submitBtn.disabled = false; }


            if (typeof closeSignupModal === 'function') closeSignupModal();
            var loginModal = document.getElementById('loginModal');
            if (loginModal) {
                loginModal.style.display = 'none';
                loginModal.classList.remove('is-open');
            }
            if (errEl) errEl.innerHTML = '';
            showEmailVerification(email);
        });
    }

    function showEmailVerification(email) {
        var modal = document.getElementById('emailVerificationModal');
        if (!modal) return;
        if (modal.parentNode !== document.body) document.body.appendChild(modal);
        modal.classList.add('is-open');
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        var descEl = document.getElementById('otpModalDesc');
        if (descEl) {
            var wa = (_pendingRegData && _pendingRegData.phone) ? _pendingRegData.phone : 'votre WhatsApp';
            descEl.textContent = 'Un code à 6 chiffres a été envoyé sur ' + wa + '.';
        }
        var statusEl = document.getElementById('otpModalStatus');
        if (statusEl) statusEl.textContent = '';
        var boxes = document.querySelectorAll('#otpBoxes .otp-box');
        boxes.forEach(function(b) { b.value = ''; });
        var hidden = document.getElementById('otpInput');
        if (hidden) hidden.value = '';
        if (boxes[0]) setTimeout(function() { boxes[0].focus(); }, 120);
    }
    window.showEmailVerification = showEmailVerification;

    function _otpCollectCode() {
        var code = '';
        document.querySelectorAll('#otpBoxes .otp-box').forEach(function(b) { code += (b.value || '').replace(/\D/g, ''); });
        var hidden = document.getElementById('otpInput');
        if (hidden) hidden.value = code;
        return code;
    }

    function _otpAutoSubmitIfComplete() {
        var code = _otpCollectCode();
        if (code.length === 6) {
            var btn = document.getElementById('verifyOtpBtn');
            if (btn && !btn.disabled) btn.click();
        }
    }

    async function _submitOtpVerification() {
        var code = _otpCollectCode();
        var statusEl = document.getElementById('otpModalStatus');
        if (!code || code.length !== 6) {
            if (statusEl) statusEl.textContent = 'Entrez les 6 chiffres du code.';
            return;
        }
        var pending = _pendingRegData || JSON.parse(localStorage.getItem('_pendingReg') || 'null');
        if (!pending) {
            if (statusEl) statusEl.textContent = 'Session expirée. Recommencez l\'inscription.';
            return;
        }
        var verifyBtn = document.getElementById('verifyOtpBtn');
        if (verifyBtn) { verifyBtn.classList.add('btn-loading'); verifyBtn.disabled = true; }
        if (statusEl) statusEl.textContent = 'Vérification…';

        try {
            var verifyResp = await fetch('/api/auth/verify-reg-otp/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                credentials: 'same-origin',
                body: JSON.stringify({
                    email: pending.email,
                    phone: pending.phone,
                    otp: code,
                }),
            });
            var verifyData = await verifyResp.json();
            if (!verifyData.success) {
                if (statusEl) statusEl.textContent = verifyData.message || 'Code incorrect ou expiré.';
                if (verifyBtn) { verifyBtn.classList.remove('btn-loading'); verifyBtn.disabled = false; }
                return;
            }
        } catch (ex) {
            if (statusEl) statusEl.textContent = 'Erreur réseau. Réessayez.';
            if (verifyBtn) { verifyBtn.classList.remove('btn-loading'); verifyBtn.disabled = false; }
            return;
        }

        var formData = new FormData();
        formData.append('firstname', pending.firstname);
        formData.append('lastname', pending.lastname);
        formData.append('email', pending.email);
        formData.append('phone', pending.phone);
        formData.append('password', pending.password);
        formData.append('age', pending.age);
        formData.append('firebase_user_id', pending.firebase_user_id);
        formData.append('otp', code);
        formData.append('csrfmiddlewaretoken', getCsrfToken());

        try {
            var resp = await fetch('/htmx/client/register/', {
                method: 'POST',
                body: formData,
                credentials: 'same-origin',
            });
                    var html = await resp.text();
                    if (!resp.ok || html.indexOf('register-success') === -1) {
                        if (statusEl) {
                            var tmp = document.createElement('div');
                            tmp.innerHTML = html;
                            statusEl.textContent = (tmp.textContent || 'Code incorrect ou expiré.').trim().slice(0, 120);
                        }
                        if (verifyBtn) { verifyBtn.classList.remove('btn-loading'); verifyBtn.disabled = false; }
                        return;
                    }
                    var otpModal = document.getElementById('emailVerificationModal');
                    if (otpModal) {
                        otpModal.classList.remove('is-open');
                        otpModal.style.display = 'none';
                    }
            document.body.style.overflow = '';
            localStorage.removeItem('_pendingReg');
            _pendingRegData = null;
            var errEl = document.getElementById('registerError');
            if (errEl) errEl.innerHTML = html;
            setTimeout(function() { window.location.href = '/'; }, 3000);
        } catch(ex) {
            if (statusEl) statusEl.textContent = 'Erreur réseau. Réessayez.';
        } finally {
            if (verifyBtn) { verifyBtn.classList.remove('btn-loading'); verifyBtn.disabled = false; }
        }
    }

    function _closeOtpModal() {
        var modal = document.getElementById('emailVerificationModal');
        if (modal) {
            modal.classList.remove('is-open');
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
    }

    async function _resendOtpCode() {
        var pending = _pendingRegData || JSON.parse(localStorage.getItem('_pendingReg') || 'null');
        if (!pending) { alert('Session expirée. Recommencez l\'inscription.'); return false; }
        var statusEl = document.getElementById('otpModalStatus');
        try {
            var r = await fetch('/api/auth/send-otp/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                body: JSON.stringify({
                    email: pending.email,
                    phone: pending.phone,
                    name: (pending.firstname || '') + ' ' + (pending.lastname || ''),
                }),
                credentials: 'same-origin',
            });
            var d = await r.json();
            if (d.success) {
                if (statusEl) statusEl.textContent = 'Code envoyé sur WhatsApp.';
                var boxes = document.querySelectorAll('#otpBoxes .otp-box');
                boxes.forEach(function(b) { b.value = ''; });
                if (boxes[0]) boxes[0].focus();
                return true;
            }
            if (statusEl) statusEl.textContent = 'Erreur : ' + (d.message || 'Réessayez.');
        } catch (ex) {
            if (statusEl) statusEl.textContent = 'Erreur réseau.';
        }
        return false;
    }

    function setupOTPVerification() {
        var verifyBtn = document.getElementById('verifyOtpBtn');
        var resendLink = document.getElementById('resendOtp');
        var sendBtn = document.getElementById('sendOtpBtn');
        var closeBtn = document.getElementById('otpModalClose');
        var boxes = document.querySelectorAll('#otpBoxes .otp-box');

        if (closeBtn) closeBtn.addEventListener('click', _closeOtpModal);
        if (sendBtn) sendBtn.addEventListener('click', function(e) { e.preventDefault(); _resendOtpCode(); });

        if (verifyBtn) {
            verifyBtn.addEventListener('click', function(e) {
                e.preventDefault();
                _submitOtpVerification();
            });
        }

        boxes.forEach(function(box, idx) {
            box.addEventListener('input', function() {
                this.value = (this.value || '').replace(/\D/g, '').slice(0, 1);
                if (this.value && boxes[idx + 1]) boxes[idx + 1].focus();
                _otpAutoSubmitIfComplete();
            });
            box.addEventListener('keydown', function(e) {
                if (e.key === 'Backspace' && !this.value && boxes[idx - 1]) {
                    boxes[idx - 1].focus();
                }
            });
            box.addEventListener('paste', function(e) {
                e.preventDefault();
                var pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
                for (var i = 0; i < pasted.length && i < boxes.length; i++) boxes[i].value = pasted[i];
                if (pasted.length >= 6) _otpAutoSubmitIfComplete();
                else if (boxes[pasted.length]) boxes[pasted.length].focus();
            });
        });

        if (resendLink) {
            resendLink.addEventListener('click', async function(e) {
                e.preventDefault();
                _resendOtpCode();
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setupRegistration();
            setupOTPVerification();
        });
    } else {
        setupRegistration();
        setupOTPVerification();
    }


    document.body.addEventListener('htmx:beforeRequest', function(evt) {
        var el = evt.detail && evt.detail.elt;
        if (el && (el.id === 'createAccountForm' || (el.closest && el.closest('#createAccountForm')))) {
            evt.preventDefault();
        }
    }, true);
    if (typeof window.regWizardGo === 'function') window.regWizardGo(1, true);
})();


window._daxiGetSavedLang = function() {
    try {
        var l = localStorage.getItem('daxi_lang');
        if (l) return l;
    } catch (e) {}
    try {
        var m = document.cookie.match(/(?:^|;\s*)daxi_lang=([^;]+)/);
        if (m) return decodeURIComponent(m[1]);
    } catch (e2) {}
    return 'fr';
};
window._daxiPersistLang = function(lang) {
    if (!lang) return;
    try { localStorage.setItem('daxi_lang', lang); } catch (e) {}
    try { document.cookie = 'daxi_lang=' + encodeURIComponent(lang) + ';path=/;max-age=31536000;SameSite=Lax'; } catch (e2) {}
};


(function() {
    var _currentLang = 'fr';
    var _localTranslations = window._localTranslations || {
        fr: {
            order_taxi: 'Commander votre Taxi',
            departure_placeholder: 'Adresse de départ',
            destination_placeholder: 'Adresse d\'arrivée',
            different_address: 'Indiquer une adresse différente',
            address_explanation: 'Si vous ne souhaitez pas partager votre position, entrez manuellement votre adresse de départ.',
            passenger_count_label: 'Nombre de passagers',
            one_way: 'Aller simple',
            round_trip: 'Aller retour',
            description_placeholder: 'Description supplémentaire (optionnel)',
            now: 'Maintenant',
            later: 'Plus tard',
            order_taxi_btn: 'Commander un Taxi',
            service_plans: 'Nos Plans de Service',
            learn_more: 'En savoir plus',
            discover_haiti: 'Découvrez Haïti',
            top_drivers: 'Meilleurs Chauffeurs de la Semaine',
            login: 'Connexion',
            logout: 'Déconnexion',
            language: 'Langue',
            back: 'Retour',
            order_service_btn: 'Commander',
            instant_contact_text: 'Besoin immédiatement? Contactez-nous via WhatsApp!',
            citadelle_name: 'Citadelle La Ferrière',
            citadelle_desc: 'Forteresse historique perchée sur une montagne',
            labadee_name: 'Labadee',
            labadee_desc: 'Plages paradisiaques et eaux cristallines',
            verrieres_name: 'Monuments de Vertière',
            verrieres_desc: 'Mémorial historique de la bataille de Vertière',
            share_location_btn: 'Activer la localisation',
            manual_address_btn: 'Entrer l\'adresse manuellement',
            map_benefit_title: 'Pourquoi activer votre position',
            map_benefit_point1: 'Obtenez le prix de la course immédiatement, sans délai d’attente système',
            map_benefit_point2: 'Voyez votre position sur la carte et évitez les erreurs d’adresse',
            map_benefit_point3: 'Le chauffeur accepte directement et vous récupère là où vous êtes',
            map_benefit_desc: 'Nous n’accéderons à votre localisation qu’après votre accord. Vous pouvez aussi saisir l’adresse manuellement.',
            location_desc: 'La localisation permet d’obtenir le prix sans attente, de vous voir sur la carte, d’éviter les erreurs d’adresse, et qu’un chauffeur accepte puis vous récupère directement où vous êtes.',
            plan1_title: 'Course Ville à Ville',
            plan1_sub: 'Prix à déterminer',
            plan1_preview: 'Déplacez-vous en toute sérénité entre les villes avec notre service de transport confortable et sécurisé.',
            plan2_title: 'Demi-Journée',
            plan2_sub: '4 heures - 70$',
            plan2_preview: 'Idéal pour vos courses, rendez-vous et visites. Votre chauffeur privé disponible pendant 4 heures.',
            plan3_title: 'Journée Complète',
            plan3_sub: '8 heures - 140$',
            plan3_preview: 'Service complet pour vos journées chargées. Profitez d\'un chauffeur dédié pendant 8 heures.',
            plan4_title: 'Elegance Night',
            plan4_sub: 'Jusqu\'à 3h - 150$',
            plan4_preview: 'Pour vos soirées spéciales. Service premium avec véhicule haut de gamme pour vos sorties nocturnes.',
            plan5_title: 'Business / VIP',
            plan5_sub: 'Prix personnalisé',
            plan5_preview: 'Solution idéale pour les clients réguliers. Bénéficiez d\'avantages exclusifs et d\'un service prioritaire.',
            no_drivers: 'Aucun chauffeur disponible pour le moment.',
            id_tab: 'ID',
            password_tab: 'Mot de passe',
            signup_tab: 'Inscription',
            signup_wizard_sub: 'Rejoignez DAXI en 3 étapes simples',
            signup_step_identity: 'Identité',
            signup_step_security: 'Sécurité',
            signup_step_finish: 'Finalisation',
            signup_whatsapp_hint: 'Votre code de vérification sera envoyé sur WhatsApp.',
            signup_next: 'Suivant',
            signup_back: 'Retour',
            signup_have_account: 'Déjà un compte ?',
            login_welcome_sub: 'Accédez à votre espace DAXI',
            id_login_desc: 'Connectez-vous avec votre ID unique pour accéder à votre compte permanent.',
            your_id: 'Votre ID',
            your_id_placeholder: 'Entrez votre ID à 4 chiffres',
            login_with_id: 'Se connecter avec mon ID',
            password_login_desc: 'Connectez-vous avec votre email et mot de passe.',
            email: 'Email',
            email_placeholder: 'Votre adresse email',
            password: 'Mot de passe',
            password_placeholder: '••••••••',
            confirm_password: 'Confirmer le mot de passe',
            confirm_password_placeholder: '••••••••',
            password_error: 'Les mots de passe ne correspondent pas',
            last_name: 'Nom',
            last_name_placeholder: 'Ex: Jean',
            first_name: 'Prénom',
            first_name_placeholder: 'Ex: Pierre',
            phone: 'Téléphone',
            phone_placeholder: 'Numéro de téléphone',
            age: 'Âge',
            age_placeholder: 'Votre âge',
            unique_id: 'Votre ID unique',
            save_id: 'Conservez cet ID pour accéder à votre compte depuis n\'importe quel appareil',
            save: 'Enregistrer',
            order_service: 'Commander ce service',
            departure_label: 'Point de départ',
            destination_label: 'Ville de destination',
            plan1_order_desc: 'Ce service est disponible sur demande. Veuillez remplir le formulaire pour une estimation personnalisée.',
            plan2_order_desc: 'Remplissez le formulaire ci-dessous pour réserver votre chauffeur privé pour 4 heures.',
            plan3_order_desc: 'Remplissez le formulaire ci-dessous pour réserver votre chauffeur privé pour 8 heures.',
            plan4_order_desc: 'Remplissez le formulaire pour réserver votre service VIP nocturne.',
            plan5_order_desc: 'Remplissez le formulaire pour recevoir une proposition sur mesure.',
            plan2_date_label: 'Date souhaitée',
            plan2_time_label: 'Heure de début',
            plan3_date_label: 'Date souhaitée',
            plan3_time_label: 'Heure de début',
            plan4_date_label: 'Date de la soirée',
            plan4_time_label: 'Heure de début',
            occasion_label: 'Occasion (optionnel)',
            occasion_placeholder: 'Ex: Anniversaire, Soirée entre amis',
            plan5_quote_title: 'Demander un devis personnalisé',
            different_departure: 'Indiquer un point de départ différent',
            departure_explanation: 'Par défaut, nous viendrons vous chercher à votre position actuelle.',
            departure_address: 'Adresse de départ',
            note: 'Note :',
            plan1_price_note: 'Prix à déterminer par l\'administrateur selon la distance et la demande.',
            plan_features: 'Caractéristiques :',
            notify_modal_title: 'Recevez les alertes importantes de vos courses',
            notify_benefit_price: 'Alerte quand un prix vous est proposé',
            notify_benefit_driver: 'Chauffeur assigné et arrivée en temps réel',
            notify_benefit_messages: 'Messages importants du chauffeur',
            notify_modal_desc: 'Prix proposé, chauffeur assigné, arrivée du chauffeur et messages importants.',
            notify_modal_sub: 'Prix proposé, chauffeur assigné, arrivée du chauffeur et messages importants.',
            notify_settings: 'Vous pourrez modifier ce choix dans les paramètres du téléphone.',
            notify_decline: 'Plus tard',
            notify_accept: 'Autoriser les notifications',
            open_forum: 'Ouvrir le forum',
            pending_orders: 'Mes Commandes',
            cathedrale_name: 'Cathédrale de Cap-Haïtien',
            cathedrale_desc: 'Joyau architectural du nord d\'Haïti',
            palais_name: 'Palais Sans Souci',
            palais_desc: 'Ancien palais royal d\'Henri Christophe',
            services: 'Services à bord',
            wifi_service: 'Wifi gratuit',
            wifi_desc: 'Vous trouverez internet à bord de nos véhicules pour rester connecté.',
            water_service: 'Bouteille d\'eau disponible',
            water_desc: 'Une bouteille d\'eau est disponible à bord pour vous rafraîchir durant votre trajet.',
            frequent_routes: 'Itinéraires fréquents',
            forum_title: 'Forum Communauté',
            blog_title: 'Blog Daxi',
            blog_subtitle: 'Actualités, conseils voyage et découvertes',
            open_blog: 'Ouvrir le blog',
            nav_blog: 'Blog',
            forum_subtitle: 'Découvrez les dernières annonces et discussions',
            trip_history: 'Historique des parcours',
            map_title: 'Carte de la commande',
            download_apk: 'Télécharger l\'APK Android',
            download_modal_title: 'Téléchargez notre application android',
            download_modal_desc: 'Pour une expérience optimale, téléchargez notre application mobile. Commandez vos trajets plus rapidement et bénéficiez de fonctionnalités exclusives !',
            close: 'Fermer',
            accept: 'Accepter',
            location_access: 'Accès à votre localisation',
            location_desc: 'La localisation permet d’obtenir le prix sans attente, de vous voir sur la carte, d’éviter les erreurs d’adresse, et qu’un chauffeur accepte puis vous récupère directement où vous êtes.',
            driver_reviews: 'Avis sur le chauffeur',
            description: 'Description',
            history: 'Histoire',
            visit: 'Visiter',
            visit_desc: 'Commandez un taxi pour visiter ce lieu historique :',
            order: 'Commander',
            trip_one_way: 'Aller simple',
            trip_round_trip: 'Aller retour',
            payment_in_person: 'Sur place',
            payment_moncash: 'MonCash',
            payment_card: 'Carte',
            timing_now: 'Maintenant',
            label_departure: 'Départ',
            label_arrival: 'Arrivée',
            label_passengers_short: 'pers.',
            label_paused: 'Pause',
            label_extended: 'Prolongée',
            label_in_hours: 'dans',
            label_driver_note: 'Repère chauffeur',
            gps_at_departure: 'Position GPS au départ du trajet',
            gps_update_btn: 'Mettre à jour',
            btn_accept_price: 'Accepter',
            btn_refuse_price: 'Refuser',
            btn_track_ride: 'Suivre la course',
            btn_download_receipt: '🧾 Télécharger le reçu PDF',
            btn_cancel_ride: 'Annuler la course',
            status_pending: 'En attente',
            status_price_proposed: 'Prix proposé',
            status_price_confirmed: 'Confirmé',
            status_driver_assigned: 'Chauffeur assigné',
            status_on_way: 'En route',
            status_arrived: 'Sur place',
            status_in_progress: 'Course en cours',
            status_completed: 'Terminé',
            status_cancelled: 'Annulé',
            orders_tab_active: 'En cours',
            orders_tab_history: 'Historique',
            btn_view_my_ride: 'Voir ma course',
            sheet_tab_new_trip: 'Nouveau trajet',
            sheet_tab_my_ride: 'Ma course',
            nav_discover: 'Découvrir',
            nav_haiti: 'Haïti',
            nav_routes: 'Itinéraires',
            nav_tarifs: 'Tarifs',
            nav_community: 'Communauté',
            nav_reviews: 'Avis clients',
            nav_top_drivers: 'Top chauffeurs',
            nav_forum: 'Forum',
            nav_help: 'Aide',
            nav_my_enterprise: 'Mon entreprise',
            nav_register_enterprise: 'Inscrire mon entreprise',
            enterprise_promo_title: 'Vous avez une entreprise ?',
            enterprise_promo_sub: 'Devenez partenaire DAXI',
            account_enterprise_title: 'Espace partenaire',
            account_enterprise_sub: 'Gérez les courses de votre entreprise sur DAXI',
            account_enterprise_cta: 'Inscrire mon entreprise',
            nav_lost_object: 'Objet perdu',
            tab_book: 'Commander',
            tab_orders: 'Mes courses',
            tab_tarif: 'Tarif',
            tab_account: 'Mon compte',
            label_departure_row: 'Départ',
            label_destination_row: 'Destination',
            fab_order_taxi: 'Commander un taxi',
            page_my_account: 'Mon compte',
            page_my_profile: 'Mon profil',
            page_tarifs: 'Nos Tarifs & Services',
            page_reviews: 'Avis clients',
            page_routes: 'Itinéraires fréquents',
            page_lost_object: 'Objet perdu',
            page_assistance: 'Assistance DAXI',
            assist_hero_title: 'Comment pouvons-nous vous aider ?',
            assist_hero_sub: 'Réservez, suivez votre course, payez ou signalez un problème — notre équipe DAXI vous répond rapidement.',
            assist_contact_title: 'Nous contacter',
            assist_wa_title: 'WhatsApp — réponse rapide',
            assist_wa_sub: '+509 4496-9696 · idéal pour une course en cours',
            assist_phone_title: 'Téléphone',
            assist_email_title: 'Email',
            assist_faq_title: 'Questions fréquentes',
            assist_faq_1_q: 'Comment commander un taxi ?',
            assist_faq_1_a: 'Sur l\'onglet « Nouveau trajet », indiquez votre point de départ (icône GPS ou adresse manuelle), votre destination, puis appuyez sur « Commander un taxi ». Vous recevrez un prix avant de confirmer.',
            assist_faq_2_q: 'Comment fonctionne le prix ?',
            assist_faq_2_a: 'Le tarif est calculé selon la distance et le type de course. Un devis vous est affiché avant paiement. Les forfaits ont un prix fixe indiqué sur la carte du plan.',
            assist_faq_3_q: 'Puis-je payer comment ?',
            assist_faq_3_a: 'MonCash, carte bancaire ou espèces au chauffeur (selon les options proposées). Les pénalités d\'annulation se règlent en ligne.',
            assist_faq_4_q: 'Le chauffeur ne me trouve pas',
            assist_faq_4_a: 'Activez la localisation ou tapez un repère précis. Ajoutez une note pour le chauffeur. Vous pouvez aussi l\'appeler via l\'onglet « Ma course ».',
            assist_faq_5_q: 'Objet oublié dans le véhicule',
            assist_faq_5_a: 'Ouvrez « Objet perdu » dans le menu ou contactez-nous sur WhatsApp avec l\'heure de la course et une description de l\'objet.',
            assist_faq_6_q: 'Mon compte est bloqué',
            assist_faq_6_a: 'Écrivez-nous sur WhatsApp ou à info@daxipro.com avec votre numéro. Nous examinons chaque dossier sous 24 h.',
            assist_hours_title: 'Disponibilité',
            assist_hours_body: 'Assistance téléphonique : lun – dim, 6h – 22h. WhatsApp : réponse prioritaire 7j/7.',
            bh_title: 'Comment passer une commande sur Daxi',
            bh_lead: 'Ce guide décrit chaque zone du formulaire, la carte et la suite du parcours jusqu\'à la course.',
            bh_depart_p1: 'Indiquez où le chauffeur doit vous prendre en charge : tapez une adresse et choisissez une suggestion dans la liste.',
            bh_depart_p2: 'Le point de départ doit être dans une zone couverte par Daxi. Sans coordonnées valides, la commande ne pourra pas être tarifée.',
            bh_gps_p1: 'À droite du champ Départ, le bouton cible vert sert à utiliser votre position GPS actuelle en un appui. Daxi remplit le départ avec « Ma position actuelle » et centre la carte sur vous.',
            bh_gps_p2: 'Autorisez la localisation si le navigateur ou l\'application le demande. Vous pourrez affiner le point en glissant l\'épingle sur la carte.',
            bh_dest_p1: 'Où vous souhaitez être déposé. Sélectionnez toujours une adresse dans la liste de suggestions pour enregistrer les coordonnées exactes.',
            bh_dest_p2: 'La carte affiche l\'itinéraire et la distance estimée une fois le départ et la destination renseignés.',
            bh_map_h: 'Affiner sur la carte',
            bh_map_p1: 'Après avoir saisi une adresse ou utilisé Ma position actuelle, glissez l\'épingle pour ajuster l\'emplacement exact — par exemple devant une porte précise.',
            bh_map_warn: 'Placez le point d\'arrivée au plus près du lieu où vous voulez descendre. Tout kilomètre au-delà du point enregistré peut entraîner des frais supplémentaires.',
            bh_note_p: 'Ajoutez un détail utile : couleur de maison, point de repère, « devant la boutique X », etc.',
            bh_pax_p: 'Nombre de personnes dans le véhicule (boutons − et +).',
            bh_trip_h: 'Type de trajet',
            bh_trip_p1: 'Aller simple : une seule course jusqu\'à la destination.',
            bh_trip_p2: 'Aller-retour : retour au point de départ, avec temps d\'attente au retour si besoin.',
            bh_time_h: 'Maintenant ou Plus tard',
            bh_time_p1: 'Maintenant : course immédiate dès validation du prix et du paiement.',
            bh_time_p2: 'Plus tard : course programmée — choisissez date et heure de départ.',
            bh_order_h: 'Bouton Commander',
            bh_order_p: 'Une fois le formulaire complet, validez. Vous verrez le prix proposé, le paiement, puis le suivi dans l\'onglet Ma course.',
            bh_tips_h: 'Astuces interface',
            bh_tips_p: 'Touchez la carte pour réduire le panneau et mieux voir l\'itinéraire. Le bandeau en haut affiche distance et durée estimées.',
            bh_done: 'J\'ai compris',
            pickup_address_placeholder: 'Adresse de départ',
            my_position_placeholder: 'Ma position actuelle',
            where_go_placeholder: 'Où allez-vous ?',
            loader_map_loading: 'Chargement de la carte…',
            loader_map_ready: 'Carte prête…',
            loader_orders: 'Chargement de vos courses…',
            loader_slow: 'Connexion lente — finalisation…',
            btn_preparing: 'Préparation...',
            dup_order_msg: 'Une commande identique vient d\'être envoyée. Patientez quelques secondes.',
            orders_no_immediate: 'Aucune course immédiate',
            orders_no_scheduled: 'Aucune course planifiée',
            orders_empty_active_title: 'Aucune course active',
            orders_empty_active_sub: 'Commandez votre prochain trajet depuis l\'accueil',
            orders_empty_history_title: 'Aucune course dans l\'historique',
            orders_empty_history_sub: 'Vos courses terminées apparaîtront ici',
            orders_count_0_trips: '0 courses',
            orders_count_1_trip: '1 course',
            orders_count_n_trips: '{n} courses',
            orders_count_0_scheduled: '0 planifiées',
            orders_count_1_scheduled: '1 planifiée',
            orders_count_n_scheduled: '{n} planifiées',
            label_driver_note_row: 'Ajouter un repère pour le chauffeur (optionnel)',
            account_guest_badge: 'Votre espace Daxi',
            account_guest_title: 'Connectez-vous',
            account_guest_sub: 'Accédez à vos courses, statistiques et paramètres.',
            account_sign_in: 'Se connecter',
            account_sign_up: 'Créer un compte',
            account_perk_rides: 'Courses',
            account_perk_stats: 'Statistiques',
            account_perk_settings: 'Paramètres',
            account_stats: 'Statistiques',
            account_info: 'Informations',
            account_actions: 'Actions',
            reviews_badge: 'Avis Google',
            reviews_title_prefix: 'Ce que nos',
            reviews_title_highlight: 'clients',
            reviews_title_suffix: 'disent',
            reviews_subtitle: 'Plus de 200 clients satisfaits font confiance à Daxi chaque jour. Découvrez leurs avis authentiques ci-dessous.',
            reviews_out_of: 'sur 5',
            reviews_based_on: 'Basé sur 200+ avis',
            reviews_cta_title: 'Satisfait du service Daxi ?',
            reviews_subtitle_cta: 'Partagez votre expérience. Un avis nous aide à grandir et à améliorer le service.',
            reviews_cta_btn: 'Laisser un avis Google',
            blog_search_placeholder: 'Rechercher un article…',
            blog_all_categories: 'Toutes catégories',
            blog_no_articles: 'Aucun article pour le moment.',
            blog_loading: 'Chargement...',
            lost_login_required: 'Connectez-vous ou commandez une course pour signaler un objet perdu.',
            lost_no_completed: 'Aucune course terminée',
            lost_no_completed_sub: 'Terminez une course pour pouvoir signaler un objet oublié.',
            lost_intro: 'Sélectionnez la course pendant laquelle vous avez oublié un objet, décrivez-le, puis envoyez — le chauffeur et notre équipe seront notifiés.',
            lost_order_label: 'Course concernée',
            lost_order_placeholder: '— Choisir une course —',
            lost_desc_label: 'Description de l\'objet',
            lost_desc_placeholder: 'Ex: sac noir, téléphone Samsung, clés avec porte-clés rouge…',
            lost_submit: 'Signaler l\'objet perdu',
            lost_sending: 'Envoi…',
            lost_choose_order: 'Choisissez une course.',
            lost_min_chars: 'Minimum 5 caractères.',
            lost_network_error: 'Erreur réseau.',
            lost_loading: 'Chargement',
            lost_loading_sub: 'Récupération de vos courses terminées…',
            lost_load_error: 'Impossible de charger pour le moment.',
            lost_retry: 'Réessayer',
            driver_space: 'Espace Chauffeur',
            wait_driver_title: 'Recherche d\'un chauffeur en cours',
            wait_driver_msg: 'Votre moyen de paiement est confirmé. Nous contactons les chauffeurs disponibles dans votre zone — vous serez notifié dès qu\'un chauffeur accepte votre course.',
            wait_driver_detail: 'Votre moyen de paiement est confirmé. Nous contactons les chauffeurs disponibles dans votre zone.',
            wait_price_title: 'En attente du prix',
            wait_price_detail: 'Votre trajet est localisé sur la carte par un chauffeur ou l\'équipe DAXI. Le tarif vous sera envoyé par WhatsApp.',
            wait_payment_title: 'Finalisez le paiement',
            wait_payment_detail: 'Choisissez un mode de paiement pour lancer la recherche de chauffeur.',
            wait_active_title: 'Course en cours',
            wait_active_detail: 'Suivez votre chauffeur sur la carte.',
            wait_confirmed_title: 'Prix confirmé',
            wait_confirmed_detail: 'Prochaine étape : attribution d\'un chauffeur.',
            sheet_orders_title: 'Vos courses en cours',
            sheet_orders_sub: 'Sélectionnez une course pour voir le suivi, la carte et les détails.',
            order_number: 'Commande {id}',
            order_back_list: 'Retour à mes courses',
            label_depart_fallback: 'Départ',
            label_dest_fallback: 'Destination',
            mini_ride_default: 'Ma course',
            mini_active_orders: '{n} courses actives',
            mini_driver_assigned: 'Chauffeur assigné',
            mini_on_way: 'Chauffeur en route',
            mini_arrived: 'Chauffeur sur place',
            mini_in_progress: 'Course en cours',
            mini_price_proposed: 'Prix à valider',
            mini_pending: 'En attente',
            my_position_btn: 'Ma position',
            dpw_step_trip: 'Votre trajet',
            dpw_step_schedule: 'Date & détails',
            dpw_step_payment: 'Paiement & contrat',
            dpw_continue: 'Continuer',
            dpw_back: 'Retour',
            dpw_sign_label: 'Nom sur le panneau',
            dpw_airport_pickup: 'Prise en charge aéroport',
            dpw_multi_hint: 'Ajoutez vos arrêts dans l\'ordre de visite.',
            dpw_add_stop: 'Ajouter une destination',
            dpw_occasion: 'Occasion / événement',
            dpw_landing_date: 'Date d\'atterrissage',
            dpw_landing_time: 'Heure d\'atterrissage',
            dpw_landing_at: 'Atterrissage prévu',
            dpw_fixed_price: 'Forfait tout compris',
            dpw_quote_price: 'Prix sur devis',
            dpw_plan_badge: 'Forfait',
            dpw_itinerary: 'Itinéraire',
            dpw_last_stop: 'Dernière destination',
            dpw_fixed_badge: 'Prix fixe',
            dpw_plan_ville_hint: 'Trajet inter-villes · devis personnalisé',
            dpw_stop_n: 'Arrêt {n}',
            dpw_stop_ph: 'Adresse ou lieu',
            gps_not_found_msg: 'Impossible de trouver votre position actuelle. Saisissez l\'adresse manuellement.',
            gps_permission_denied: 'Autorisez la localisation ou saisissez l\'adresse manuellement.',
            top_driver_trips_0: '0 course',
            top_driver_trips_1: '1 course',
            top_driver_trips_n: '{n} courses',
            top_driver_default_name: 'Chauffeur',
            plan_gallery_title: 'Galerie d\'images',
            plan_cta_interest: 'Intéressé par ce plan ?',
            plan_load_error: 'Impossible de charger les forfaits. Réessayez.',
            plan_airport_title: 'Accueil Aéroport',
            plan_airport_sub: 'Cap-Haïtien · prix calculé',
            plan_airport_preview: 'Arrivée en avion ? Votre chauffeur vous attend à l\'aéroport de Cap-Haïtien avec un panneau portant votre nom, 1 h avant l\'atterrissage. Retards facturés selon les tarifs d\'attente DAXI.',
            plan_airport_wizard_hint: 'Votre chauffeur vous accueille à l\'aéroport avec un panneau portant votre nom, 1 h avant votre atterrissage.',
            dpw_where_going: 'Où vous allez',
            dpw_where_going_ph: 'Hôtel, adresse, quartier…',
            dpw_sign_ph: 'Ex: Jean Dupont',
            dpw_airport_name: 'Aéroport Cap-Haïtien',
            pay_choose_method: 'Choisir votre moyen de paiement',
            pay_order_label: 'Commande',
            pay_pending_msg: 'Paiement non finalisé — choisissez à nouveau votre moyen de paiement pour continuer.',
            pay_moncash_desc: 'Paiement mobile Digicel · rapide et sécurisé',
            pay_card_label: 'Carte bancaire',
            pay_card_desc: 'Visa, Mastercard, American Express',
            pay_cash_label: 'Payer au chauffeur',
            pay_cash_desc: 'Espèces à bord — les pénalités d\'annulation se règlent en ligne',
            pay_continue_btn: 'Continuer',
            pay_contract_line: 'J\'accepte le contrat de transport et conditions de remboursement de DAXI.',
            pay_contract_view: 'Voir le contrat',
            pay_confirmed_title: 'Paiement confirmé !',
            pay_confirmed_msg: 'Votre paiement a été reçu avec succès.',
            pay_confirmed_driver: 'Un chauffeur va vous être assigné très prochainement.',
            perk_included: 'Inclus',
            perk_free: 'Gratuit'
        },
        ht: {
            order_taxi: 'Kòmande Taxi Ou',
            departure_placeholder: 'Adrès depa',
            destination_placeholder: 'Adrès rive',
            different_address: 'Endike yon lòt adrès',
            address_explanation: 'Si ou pa vle pataje pozisyon ou, antre adrès depa ou manyèlman.',
            passenger_count_label: 'Kantite pasaje',
            one_way: 'Ale sèlman',
            round_trip: 'Ale retou',
            description_placeholder: 'Deskripsyon siplemantè (opsyonèl)',
            now: 'Kounye a',
            later: 'Pita',
            order_taxi_btn: 'Kòmande yon Taxi',
            service_plans: 'Plan Sèvis Nou yo',
            learn_more: 'Aprann plis',
            discover_haiti: 'Dekouvri Ayiti',
            top_drivers: 'Pi Bon Chofè Semèn nan',
            login: 'Koneksyon',
            logout: 'Dekoneksyon',
            language: 'Lang',
            back: 'Retounen',
            order_service_btn: 'Kòmande',
            instant_contact_text: 'Ou bezwen touswit? Kontakte nou sou WhatsApp!',
            citadelle_name: 'Sitadèl Laferyè',
            citadelle_desc: 'Fò istorik sou tèt yon mòn',
            labadee_name: 'Labadi',
            labadee_desc: 'Plaj paradi ak dlo klè',
            verrieres_name: 'Moniman Vètyè',
            verrieres_desc: 'Memoryèl istorik batay Vètyè',
            share_location_btn: 'Aktive lokalizasyon',
            manual_address_btn: 'Antre adrès manyèlman',
            map_benefit_title: 'Poukisa aktive pozisyon ou',
            map_benefit_point1: 'Jwenn pri kous la touswit, san tann sistèm',
            map_benefit_point2: 'Wè pozisyon ou sou kat la epi evite erè adrès',
            map_benefit_point3: 'Chofè a aksepte dirèkteman epi vin chèche ou kote ou ye',
            map_benefit_desc: 'Nou p’ap jwenn lokalizasyon ou san ou dakò. Ou ka antre adrès la manyèlman tou.',
            location_desc: 'Lokalizasyon pèmèt ou jwenn pri a san tann, wè tèt ou sou kat la, evite erè adrès, epi yon chofè aksepte epi vin chèche ou kote ou ye.',
            plan1_title: 'Kous Vil a Vil',
            plan1_sub: 'Pri pou detèmine',
            plan1_preview: 'Deplase ou san estrès ant vil yo ak sèvis transpò konfòtab e an sekirite nou an.',
            plan2_title: 'Demi Jounnen',
            plan2_sub: '4 èdtan - 70$',
            plan2_preview: 'Ideyal pou kous, randevou ak vizit ou yo. Chofè prive ou disponib pandan 4 èdtan.',
            plan3_title: 'Jounnen Konplè',
            plan3_sub: '8 èdtan - 140$',
            plan3_preview: 'Sèvis konplè pou jounen chaje. Chofè dedye pandan 8 èdtan.',
            plan4_title: 'Elegance Night',
            plan4_sub: 'Jiska 3 èdtan - 150$',
            plan4_preview: 'Pou sware espesyal ou yo. Sèvis premyòm ak machin wo nivo pou sòti aswè ou yo.',
            plan5_title: 'Business / VIP',
            plan5_sub: 'Pri pèsonalize',
            plan5_preview: 'Solisyon ideyal pou kliyan regilye. Benefisye avantaj eksklizif ak sèvis priyorite.',
            no_drivers: 'Pa gen chofè disponib pou kounye a.',
            id_tab: 'ID',
            password_tab: 'Modpas',
            signup_tab: 'Enskri',
            signup_wizard_sub: 'Antre nan DAXI an 3 etap senp',
            signup_step_identity: 'Idantite',
            signup_step_security: 'Sekirite',
            signup_step_finish: 'Finalizasyon',
            signup_whatsapp_hint: 'Kòd verifikasyon an ap voye sou WhatsApp.',
            signup_next: 'Swivan',
            signup_back: 'Retounen',
            signup_have_account: 'Ou gen kont deja ?',
            login_welcome_sub: 'Jwenn aksè nan espas DAXI ou',
            id_login_desc: 'Konekte ak ID inik ou pou jwenn kont ou pèmanan.',
            your_id: 'ID ou',
            your_id_placeholder: 'Antre ID 4 chif ou',
            login_with_id: 'Konekte ak ID mwen',
            password_login_desc: 'Konekte ak imèl ak modpas ou.',
            email: 'Imèl',
            email_placeholder: 'Adrès imèl ou',
            password: 'Modpas',
            password_placeholder: '••••••••',
            confirm_password: 'Konfime modpas',
            confirm_password_placeholder: '••••••••',
            password_error: 'Modpas yo pa menm',
            last_name: 'Non',
            last_name_placeholder: 'Egz: Jean',
            first_name: 'Prenon',
            first_name_placeholder: 'Egz: Pierre',
            phone: 'Telefòn',
            phone_placeholder: 'Nimewo telefòn',
            age: 'Laj',
            age_placeholder: 'Laj ou',
            unique_id: 'ID inik ou',
            save_id: 'Konsève ID sa pou jwenn kont ou nenpòt kote',
            save: 'Anrejistre',
            order_service: 'Kòmande sèvis sa',
            departure_label: 'Pwen depa',
            destination_label: 'Vil destinasyon',
            plan1_order_desc: 'Sèvis sa disponib sou demann. Ranpli fòm nan pou yon estimasyon.',
            plan2_order_desc: 'Ranpli fòm nan pou rezève chofè prive ou pou 4 èdtan.',
            plan3_order_desc: 'Ranpli fòm nan pou rezève chofè prive ou pou 8 èdtan.',
            plan4_order_desc: 'Ranpli fòm nan pou rezève sèvis VIP nuit ou.',
            plan5_order_desc: 'Ranpli fòm nan pou resevwa yon pwopozisyon pèsonalize.',
            plan2_date_label: 'Dat ou vle',
            plan2_time_label: 'Lè kòmansman',
            plan3_date_label: 'Dat ou vle',
            plan3_time_label: 'Lè kòmansman',
            plan4_date_label: 'Dat sware a',
            plan4_time_label: 'Lè kòmansman',
            occasion_label: 'Okazyon (opsyonèl)',
            occasion_placeholder: 'Egz: Anivèsè, Sware ant zanmi',
            plan5_quote_title: 'Mande yon devis pèsonalize',
            different_departure: 'Endike yon lòt pwen depa',
            departure_explanation: 'Pa defò, nou pral chèche ou nan pozisyon aktyèl ou.',
            departure_address: 'Adrès depa',
            note: 'Nòt :',
            plan1_price_note: 'Pri pou detèmine pa administratè a selon distans ak demann.',
            plan_features: 'Karakteristik :',
            notify_modal_title: 'Res rete enfòme sou kous ou',
            notify_benefit_price: 'Alèt lè yo ba ou yon pri',
            notify_benefit_driver: 'Chofè asiye ak rive an tan reyèl',
            notify_benefit_messages: 'Mesaj enpòtan nan men chofè a',
            notify_modal_desc: 'Aktive notifikasyon yo pou resevwa alèt lè yo ba ou yon pri, lè yo asiye yon chofè, lè li rive, ak plis ankò.',
            notify_settings: 'Ou ka chanje chwa sa a nan paramèt telefòn ou.',
            notify_decline: 'Non mèsi',
            notify_accept: 'Otorize',
            open_forum: 'Ouvri fowòm nan',
            pending_orders: 'Kòmand Mwen',
            cathedrale_name: 'Katedral Cap-Ayisyen',
            cathedrale_desc: 'Bijou achitekti nò Ayiti a',
            palais_name: 'Palè San Souci',
            palais_desc: 'Ansyen palè wayal Henri Christophe',
            services: 'Sèvis nan vwayaj',
            wifi_service: 'Wifi gratis',
            wifi_desc: 'Ou pral jwenn entènèt nan veyikil nou yo pou rete konekte.',
            water_service: 'Boutèy dlo disponib',
            water_desc: 'Gen yon boutèy dlo nan veyikil la pou ou rafraîchi pandan vwayaj ou.',
            frequent_routes: 'Wout frekant',
            forum_title: 'Fowòm Kominote',
            forum_subtitle: 'Dekouvri dènye anons ak diskisyon yo',
            trip_history: 'Istorik vwayaj',
            map_title: 'Kat kòmand lan',
            download_apk: 'Telechaje APK Android',
            download_modal_title: 'Telechaje aplikasyon android nou an',
            download_modal_desc: 'Pou yon eksperyans optimal, telechaje aplikasyon mobil nou an. Kòmande vwayaj ou pi vit ak jwi fonksyon eksklizif yo!',
            close: 'Fèmen',
            accept: 'Aksepte',
            location_access: 'Aksè nan lokalizasyon ou',
            location_desc: 'Lokalizasyon pèmèt ou jwenn pri a san tann, wè tèt ou sou kat la, evite erè adrès, epi yon chofè aksepte epi vin chèche ou kote ou ye.',
            driver_reviews: 'Avis sou chofè a',
            description: 'Deskripsyon',
            history: 'Istwa',
            visit: 'Vizite',
            visit_desc: 'Kòmande yon taksi pou vizite kote istorik sa a:',
            order: 'Kòmande',
            trip_one_way: 'Ale sèlman',
            trip_round_trip: 'Ale retou',
            payment_in_person: 'Sou plas',
            payment_moncash: 'MonCash',
            payment_card: 'Kat',
            timing_now: 'Kounye a',
            label_departure: 'Depa',
            label_arrival: 'Rive',
            label_passengers_short: 'moun',
            label_paused: 'Poz',
            label_extended: 'Pwolonje',
            label_in_hours: 'nan',
            label_driver_note: 'Repè chofè',
            gps_at_departure: 'Pozisyon GPS nan depa vwayaj la',
            gps_update_btn: 'Mete ajou',
            btn_accept_price: 'Aksepte',
            btn_refuse_price: 'Refize',
            btn_track_ride: 'Swiv kous la',
            btn_download_receipt: '🧾 Telechaje resi PDF',
            btn_cancel_ride: 'Anile kous la',
            status_pending: 'An atant',
            status_price_proposed: 'Pri pwopoze',
            status_price_confirmed: 'Pri konfime',
            status_driver_assigned: 'Chofè asiyen',
            status_on_way: 'Sou wout',
            status_arrived: 'Sou plas',
            status_in_progress: 'Nan kous',
            status_completed: 'Fini',
            status_cancelled: 'Anile',
            orders_tab_active: 'An kou',
            orders_tab_history: 'Istwa',
            btn_view_my_ride: 'Gade kous mwen',
            sheet_tab_new_trip: 'Nouvo vwayaj',
            sheet_tab_my_ride: 'Kous mwen',
            nav_discover: 'Dekouvri',
            nav_haiti: 'Ayiti',
            nav_routes: 'Wout yo',
            nav_tarifs: 'Tarif yo',
            nav_community: 'Kominote',
            nav_reviews: 'Opinyon kliyan',
            nav_top_drivers: 'Top chofè yo',
            nav_forum: 'Fowòm',
            nav_help: 'Èd',
            nav_my_enterprise: 'Antrepriz mwen',
            nav_register_enterprise: 'Enskri antrepriz mwen',
            enterprise_promo_title: 'Ou gen yon antrepriz ?',
            enterprise_promo_sub: 'Vin patnè DAXI',
            account_enterprise_title: 'Espas patnè',
            account_enterprise_sub: 'Jere kous antrepriz ou sou DAXI',
            account_enterprise_cta: 'Enskri antrepriz mwen',
            nav_lost_object: 'Objè pèdi',
            tab_book: 'Kòmande',
            tab_orders: 'Kous mwen yo',
            tab_tarif: 'Tarif',
            tab_account: 'Kont mwen',
            label_departure_row: 'Kote depa',
            label_destination_row: 'Kote ale',
            fab_order_taxi: 'Kòmande yon taxi',
            page_my_account: 'Kont mwen',
            page_my_profile: 'Pwofil mwen',
            page_tarifs: 'Tarif & Sèvis nou yo',
            page_reviews: 'Opinyon kliyan',
            page_routes: 'Wout frekan',
            page_lost_object: 'Objè pèdi',
            page_assistance: 'Asistans DAXI',
            assist_hero_title: 'Kijan nou ka ede ou ?',
            assist_hero_sub: 'Rezève, swiv kous ou, peye oswa rapòte yon pwoblèm — ekip DAXI la reponn rapid.',
            assist_contact_title: 'Kontakte nou',
            assist_wa_title: 'WhatsApp — repons rapid',
            assist_wa_sub: '+509 4496-9696 · ideyal pou yon kous an kou',
            assist_phone_title: 'Telefòn',
            assist_email_title: 'Imèl',
            assist_faq_title: 'Kesyon souvan poze',
            assist_faq_1_q: 'Kijan pou kòmande yon taxi ?',
            assist_faq_1_a: 'Nan « Nouvo vwayaj », endike kote depa ou (ikon GPS oswa adrès manyèl), destinasyon ou, epi peze « Kòmande yon taxi ». W ap resevwa yon pri anvan konfime.',
            assist_faq_2_q: 'Kijan pri a kalkile ?',
            assist_faq_2_a: 'Pri a depann de distans ak kalite kous la. Yon estimasyon parèt anvan peman. Forfè yo gen pri fiks sou kat plan an.',
            assist_faq_3_q: 'Ki jan mwen ka peye ?',
            assist_faq_3_a: 'MonCash, kat bankè oswa lajan kach bay chofè a (selon opsyon yo). Penalite anilasyon peye sou entènèt.',
            assist_faq_4_q: 'Chofè a pa jwenn mwen',
            assist_faq_4_a: 'Aktive lokalizasyon ou oswa antre yon repè egzak. Ajoute yon nòt pou chofè a. Ou ka rele l tou nan « Kous mwen ».',
            assist_faq_5_q: 'Mwen bliye yon bagay nan machin nan',
            assist_faq_5_a: 'Louvri « Objè pèdi » nan meni an oswa kontakte nou sou WhatsApp ak lè kous la ak deskripsyon bagay la.',
            assist_faq_6_q: 'Kont mwen bloke',
            assist_faq_6_a: 'Ekri nou sou WhatsApp oswa info@daxipro.com ak nimewo telefòn ou. Nou egzamine chak dosye nan 24 èdtan.',
            assist_hours_title: 'Disponibilite',
            assist_hours_body: 'Asistans telefòn : lun – dim, 6è – 22è. WhatsApp : repons priyorite 7j/7.',
            bh_title: 'Kijan pou pase yon kòmand sou Daxi',
            bh_lead: 'Gid sa a eksplike chak pati nan fòmilè a, kat la ak etap yo jiska kous la.',
            bh_depart_p1: 'Endike kote chofè a dwe vin chèche ou : tape yon adrès epi chwazi yon sijesyon nan lis la.',
            bh_depart_p2: 'Pwen depa a dwe nan yon zòn kouvri pa Daxi. San kòdone valab, kòmand lan pa ka tarifye.',
            bh_gps_p1: 'Bò dwat chan Kote depa a, bouton vèt la sèvi pou itilize pozisyon GPS ou nan yon sèl klike. Daxi ranpli depa a ak « Pozisyon mwen kounye a » epi santre kat la sou ou.',
            bh_gps_p2: 'Otorize lokalizasyon si navigatè a mande. Ou ka ajiste pwen an lè w glise epeng la sou kat la.',
            bh_dest_p1: 'Kote ou vle desann. Toujou chwazi yon adrès nan lis sijesyon yo pou anrejistre kòdone egzak yo.',
            bh_dest_p2: 'Kat la montre wout la ak distans estime yon fwa depa ak destinasyon an ranpli.',
            bh_map_h: 'Ajiste sou kat la',
            bh_map_p1: 'Apre ou antre yon adrès oswa itilize Pozisyon mwen, glise epeng la pou ajiste kote egzak la — devan yon pòt, pa egzanp.',
            bh_map_warn: 'Mete pwen rive a pi pre kote ou vle desann. Chak kilomèt depase pwen anrejistre a ka koute plis.',
            bh_note_p: 'Ajoute yon detay itil : koulè kay, repè, « devan boutik X », elatriye.',
            bh_pax_p: 'Kantite moun ki pral nan machin nan (bouton − ak +).',
            bh_trip_h: 'Kalite vwayaj',
            bh_trip_p1: 'Ale sèlman : yon sèl kous jiska destinasyon an.',
            bh_trip_p2: 'Ale retou : retou nan pwen depa a, ak tan tann nan retou si bezwen.',
            bh_time_h: 'Kounye a oswa Pita',
            bh_time_p1: 'Kounye a : kous imedyat apre validasyon pri ak peman.',
            bh_time_p2: 'Pita : kous pwograme — chwazi dat ak lè depa.',
            bh_order_h: 'Bouton Kòmande',
            bh_order_p: 'Lè fòmilè a konplè, valide. W ap wè pri a, peman an, epi swivi nan onglet Kous mwen.',
            bh_tips_h: 'Konsèy entèfas',
            bh_tips_p: 'Manyen kat la pou diminye panèl la epi wè wout la pi byen. Ba anlè a montre distans ak dire estime.',
            bh_done: 'Mwen konprann',
            my_position_placeholder: 'Pozisyon mwen kounye a',
            where_go_placeholder: 'Kote w ap ale?',
            loader_map_loading: 'Chajman kat la…',
            loader_map_ready: 'Kat la pare…',
            loader_orders: 'Chajman kous ou yo…',
            loader_slow: 'Koneksyon lan dousman — finalizasyon…',
            btn_preparing: 'Preparasyon...',
            dup_order_msg: 'Menm kòmand lan fèk voye. Tann kèk segond.',
            pickup_address_placeholder: 'Adrès depa',
            blog_title: 'Blog Daxi',
            blog_subtitle: 'Aktyalite, konsèy vwayaj ak dekouvèt',
            open_blog: 'Ouvri blog la',
            nav_blog: 'Blog',
            orders_no_immediate: 'Pa gen kous imedya',
            orders_no_scheduled: 'Pa gen kous planifye',
            orders_empty_active_title: 'Pa gen kous aktif',
            orders_empty_active_sub: 'Kòmande pwochen vwayaj ou depi akèy la',
            orders_empty_history_title: 'Pa gen kous nan istwa a',
            orders_empty_history_sub: 'Kous fini ou yo ap parèt isit la',
            orders_count_0_trips: '0 kous',
            orders_count_1_trip: '1 kous',
            orders_count_n_trips: '{n} kous',
            orders_count_0_scheduled: '0 planifye',
            orders_count_1_scheduled: '1 planifye',
            orders_count_n_scheduled: '{n} planifye',
            label_driver_note_row: 'Ajoute yon repè pou chofè a (opsyonèl)',
            account_guest_badge: 'Espas Daxi ou',
            account_guest_title: 'Konekte',
            account_guest_sub: 'Jwenn aksè nan kous, estatistik ak paramèt ou yo.',
            account_sign_in: 'Konekte',
            account_sign_up: 'Kreye yon kont',
            account_perk_rides: 'Kous',
            account_perk_stats: 'Estatistik',
            account_perk_settings: 'Paramèt',
            account_stats: 'Estatistik',
            account_info: 'Enfòmasyon',
            account_actions: 'Aksyon',
            reviews_badge: 'Avis Google',
            reviews_title_prefix: 'Sa kliyan nou yo',
            reviews_title_highlight: 'di',
            reviews_title_suffix: 'sou nou',
            reviews_subtitle: 'Plis pase 200 kliyan satisfè fè konfyans nan Daxi chak jou. Dekouvri opinyon otantik yo anba a.',
            reviews_out_of: 'sou 5',
            reviews_based_on: 'Baze sou 200+ avis',
            reviews_cta_title: 'Ou satisfè ak sèvis Daxi?',
            reviews_subtitle_cta: 'Pataje eksperyans ou. Yon ti avis ede nou grandi e amelyore sèvis la.',
            reviews_cta_btn: 'Kite yon avis sou Google',
            blog_search_placeholder: 'Chèche yon atik…',
            blog_all_categories: 'Tout kategori',
            blog_no_articles: 'Pa gen atik pou kounye a.',
            blog_loading: 'Chajman...',
            lost_login_required: 'Konekte oswa kòmande yon kous pou siyale yon objè pèdi.',
            lost_no_completed: 'Pa gen kous fini',
            lost_no_completed_sub: 'Fini yon kous pou ka siyale yon objè ou bliye.',
            lost_intro: 'Chwazi kous kote ou te bliye yon objè, dekri li, epi voye — chofè a ak ekip nou an ap resevwa alèt.',
            lost_order_label: 'Kous konsène',
            lost_order_placeholder: '— Chwazi yon kous —',
            lost_desc_label: 'Deskripsyon objè a',
            lost_desc_placeholder: 'Egz: sak nwa, telefòn Samsung, kle ak pòt-kle wouj…',
            lost_submit: 'Siyale objè pèdi a',
            lost_sending: 'Voye…',
            lost_choose_order: 'Chwazi yon kous.',
            lost_min_chars: 'Omwen 5 karaktè.',
            lost_network_error: 'Erè rezo.',
            lost_loading: 'Chajman',
            lost_loading_sub: 'Rekipere kous fini ou yo…',
            lost_load_error: 'Pa ka chaje kounye a.',
            lost_retry: 'Eseye ankò',
            driver_space: 'Espas Chofè',
            wait_driver_title: 'N ap chèche yon chofè',
            wait_driver_msg: 'Mwayen peman ou konfime. N ap kontakte chofè ki disponib nan zòn ou — ou ap resevwa yon alèt le yon chofè aksepte kous ou.',
            wait_driver_detail: 'Mwayen peman ou konfime. N ap kontakte chofè ki disponib nan zòn ou.',
            wait_price_title: 'N ap tann pri a',
            wait_price_detail: 'Yon chofè oswa ekip DAXI ap mete kote depa ak rive sou kat la. Pri a ap voye ba ou sou WhatsApp.',
            wait_payment_title: 'Fini peye',
            wait_payment_detail: 'Chwazi yon mwayen peman pou nou ka chèche yon chofè.',
            wait_active_title: 'Kous lan an kou',
            wait_active_detail: 'Swiv chofè ou sou kat la.',
            wait_confirmed_title: 'Pri konfime',
            wait_confirmed_detail: 'Pwochen etap : nou pral ba ou yon chofè.',
            sheet_orders_title: 'Kous ou yo an kou',
            sheet_orders_sub: 'Chwazi yon kous pou wè swivi, kat ak detay yo.',
            order_number: 'Kòmand {id}',
            order_back_list: 'Retounen nan kous mwen yo',
            label_depart_fallback: 'Depa',
            label_dest_fallback: 'Destinasyon',
            mini_ride_default: 'Kous mwen',
            mini_active_orders: '{n} kous aktiv',
            mini_driver_assigned: 'Chofè asiyen',
            mini_on_way: 'Chofè sou wout',
            mini_arrived: 'Chofè sou plas',
            mini_in_progress: 'Nan kous',
            mini_price_proposed: 'Pri pou valide',
            mini_pending: 'An atant',
            my_position_btn: 'Pozisyon mwen',
            dpw_step_trip: 'Vwayaj ou',
            dpw_step_schedule: 'Dat & detay',
            dpw_step_payment: 'Peman & kontra',
            dpw_continue: 'Kontinye',
            dpw_back: 'Retounen',
            dpw_sign_label: 'Non sou pano a',
            dpw_airport_pickup: 'Pran nan aewopò',
            dpw_multi_hint: 'Ajoute arè ou yo nan lòd vizit la.',
            dpw_add_stop: 'Ajoute yon destinasyon',
            dpw_occasion: 'Okazyon / evènman',
            dpw_landing_date: 'Dat aterisaj',
            dpw_landing_time: 'Lè aterisaj',
            dpw_landing_at: 'Aterisaj prevwa',
            dpw_fixed_price: 'Forfait tout enkli',
            dpw_quote_price: 'Pri sou demann',
            dpw_plan_badge: 'Forfait',
            dpw_itinerary: 'Wout la',
            dpw_last_stop: 'Dènye destinasyon',
            dpw_fixed_badge: 'Pri fiks',
            dpw_plan_ville_hint: 'Vwayaj ant vil · estimasyon pèsonalize',
            dpw_stop_n: 'Arè {n}',
            dpw_stop_ph: 'Adrès oswa kote',
            gps_not_found_msg: 'Nou pa t kapab jwenn pozisyon ou. Antre adrès la manyèlman.',
            gps_permission_denied: 'Otorize lokalizasyon an oswa antre adrès la manyèlman.',
            top_driver_trips_0: '0 kous',
            top_driver_trips_1: '1 kous',
            top_driver_trips_n: '{n} kous',
            top_driver_default_name: 'Chofè',
            plan_gallery_title: 'Galri foto',
            plan_cta_interest: 'Enterese nan plan sa a?',
            plan_load_error: 'Pa ka chaje forfè yo. Eseye ankò.',
            plan_airport_title: 'Akey Aewopò',
            plan_airport_sub: 'Cap-Ayisyen · pri kalkile',
            plan_airport_preview: 'Ou rive nan avyon? Chofè ou ap tann ou nan aewopò Cap-Ayisyen ak yon pano ki gen non ou, 1 èdtan anvan aterisaj. Reta faktire selon tarif tann DAXI.',
            plan_airport_wizard_hint: 'Chofè ou ap resevwa ou nan aewopò a ak yon pano ki gen non ou, 1 èdtan anvan lè aterisaj la.',
            dpw_where_going: 'Kote ou prale',
            dpw_where_going_ph: 'Otèl, adrès, katye…',
            dpw_sign_ph: 'Egz: Jean Dupont',
            dpw_airport_name: 'Aewopò Cap-Ayisyen',
            pay_choose_method: 'Chwazi mwayen peman ou',
            pay_order_label: 'Kòmand',
            pay_pending_msg: 'Peman pa fini — chwazi ankò mwayen peman ou pou kontinye.',
            pay_moncash_desc: 'Peman mobil Digicel · rapid e an sekirite',
            pay_card_label: 'Kat bankè',
            pay_card_desc: 'Visa, Mastercard, American Express',
            pay_cash_label: 'Peye chofè a',
            pay_cash_desc: 'Lajan kach nan machin — penalite anilasyon peye sou entènèt',
            pay_continue_btn: 'Kontinye',
            pay_contract_line: 'Mwen aksepte kontra transpò ak kondisyon ranbousman DAXI.',
            pay_contract_view: 'Gade kontra a',
            pay_confirmed_title: 'Peman konfime!',
            pay_confirmed_msg: 'Peman ou resevwa avèk siksè.',
            pay_confirmed_driver: 'Yon chofè ap asiyen ou trè byento.',
            perk_included: 'Enkli',
            perk_free: 'Gratis'
        },
        en: {
            order_taxi: 'Order Your Taxi',
            departure_placeholder: 'Departure address',
            destination_placeholder: 'Arrival address',
            different_address: 'Enter a different address',
            address_explanation: 'If you don\'t want to share your location, enter your departure address manually.',
            passenger_count_label: 'Number of passengers',
            one_way: 'One way',
            round_trip: 'Round trip',
            description_placeholder: 'Additional description (optional)',
            now: 'Now',
            later: 'Later',
            order_taxi_btn: 'Order a Taxi',
            service_plans: 'Our Service Plans',
            learn_more: 'Learn more',
            discover_haiti: 'Discover Haiti',
            top_drivers: 'Top Drivers of the Week',
            login: 'Login',
            logout: 'Logout',
            language: 'Language',
            back: 'Back',
            order_service_btn: 'Order',
            instant_contact_text: 'Need it right now? Contact us via WhatsApp!',
            citadelle_name: 'Citadelle La Ferrière',
            citadelle_desc: 'Historic fortress perched on a mountain',
            labadee_name: 'Labadee',
            labadee_desc: 'Paradise beaches and crystal clear waters',
            verrieres_name: 'Vertière Monuments',
            verrieres_desc: 'Historic memorial of the Battle of Vertière',
            share_location_btn: 'Enable location',
            manual_address_btn: 'Enter address manually',
            map_benefit_title: 'Why enable your location',
            map_benefit_point1: 'Get the trip price immediately, without system waiting time',
            map_benefit_point2: 'See yourself on the map and avoid address mistakes',
            map_benefit_point3: 'A driver can accept right away and pick you up where you are',
            map_benefit_desc: 'We only access your location after you agree. You can also enter the address manually.',
            location_desc: 'Location lets you get the price without waiting, see yourself on the map, avoid address errors, and have a driver accept and pick you up where you are.',
            plan1_title: 'City to City',
            plan1_sub: 'Price on request',
            plan1_preview: 'Travel between cities with peace of mind thanks to our comfortable and secure transport service.',
            plan2_title: 'Half Day',
            plan2_sub: '4 hours - $70',
            plan2_preview: 'Ideal for errands, appointments and visits. Your private driver available for 4 hours.',
            plan3_title: 'Full Day',
            plan3_sub: '8 hours - $140',
            plan3_preview: 'Complete service for busy days. Enjoy a dedicated driver for 8 hours.',
            plan4_title: 'Elegance Night',
            plan4_sub: 'Up to 3h - $150',
            plan4_preview: 'For your special evenings. Premium service with a high-end vehicle for your nights out.',
            plan5_title: 'Business / VIP',
            plan5_sub: 'Custom pricing',
            plan5_preview: 'Ideal solution for regular clients. Enjoy exclusive benefits and priority service.',
            no_drivers: 'No drivers available at the moment.',
            id_tab: 'ID',
            password_tab: 'Password',
            signup_tab: 'Sign up',
            signup_wizard_sub: 'Join DAXI in 3 simple steps',
            signup_step_identity: 'Identity',
            signup_step_security: 'Security',
            signup_step_finish: 'Finish',
            signup_whatsapp_hint: 'Your verification code will be sent via WhatsApp.',
            signup_next: 'Next',
            signup_back: 'Back',
            signup_have_account: 'Already have an account?',
            login_welcome_sub: 'Access your DAXI space',
            id_login_desc: 'Log in with your unique ID to access your permanent account.',
            your_id: 'Your ID',
            your_id_placeholder: 'Enter your 4-digit ID',
            login_with_id: 'Log in with my ID',
            password_login_desc: 'Log in with your email and password.',
            email: 'Email',
            email_placeholder: 'Your email address',
            password: 'Password',
            password_placeholder: '••••••••',
            confirm_password: 'Confirm password',
            confirm_password_placeholder: '••••••••',
            password_error: 'Passwords do not match',
            last_name: 'Last name',
            last_name_placeholder: 'Ex: Jean',
            first_name: 'First name',
            first_name_placeholder: 'Ex: Pierre',
            phone: 'Phone',
            phone_placeholder: 'Phone number',
            age: 'Age',
            age_placeholder: 'Your age',
            unique_id: 'Your unique ID',
            save_id: 'Save this ID to access your account from any device',
            save: 'Save',
            order_service: 'Order this service',
            departure_label: 'Departure point',
            destination_label: 'Destination city',
            plan1_order_desc: 'This service is available on request. Fill in the form for a personalized estimate.',
            plan2_order_desc: 'Fill in the form below to book your private driver for 4 hours.',
            plan3_order_desc: 'Fill in the form below to book your private driver for 8 hours.',
            plan4_order_desc: 'Fill in the form to book your VIP night service.',
            plan5_order_desc: 'Fill in the form to receive a customized proposal.',
            plan2_date_label: 'Desired date',
            plan2_time_label: 'Start time',
            plan3_date_label: 'Desired date',
            plan3_time_label: 'Start time',
            plan4_date_label: 'Evening date',
            plan4_time_label: 'Start time',
            occasion_label: 'Occasion (optional)',
            occasion_placeholder: 'Ex: Birthday, Night out with friends',
            plan5_quote_title: 'Request a personalized quote',
            different_departure: 'Enter a different departure point',
            departure_explanation: 'By default, we will pick you up at your current location.',
            departure_address: 'Departure address',
            note: 'Note:',
            plan1_price_note: 'Price to be determined by the administrator based on distance and demand.',
            plan_features: 'Features:',
            notify_modal_title: 'Stay updated on your ride',
            notify_benefit_price: 'Alert when a price is offered',
            notify_benefit_driver: 'Driver assigned and arrival in real time',
            notify_benefit_messages: 'Important messages from your driver',
            notify_modal_desc: 'Enable notifications to be alerted when a price is proposed, a driver is assigned, when they arrive, and more.',
            notify_settings: 'You can change this choice in your phone settings.',
            notify_decline: 'No thanks',
            notify_accept: 'Allow',
            open_forum: 'Open the forum',
            pending_orders: 'My Orders',
            cathedrale_name: 'Cathedral of Cap-Haïtien',
            cathedrale_desc: 'Architectural gem of northern Haiti',
            palais_name: 'Sans Souci Palace',
            palais_desc: 'Former royal palace of Henri Christophe',
            services: 'On-board services',
            wifi_service: 'Free Wifi',
            wifi_desc: 'You will find internet on board our vehicles to stay connected.',
            water_service: 'Water bottle available',
            water_desc: 'A water bottle is available on board to refresh you during your trip.',
            frequent_routes: 'Frequent routes',
            forum_title: 'Community Forum',
            forum_subtitle: 'Discover the latest announcements and discussions',
            trip_history: 'Trip history',
            map_title: 'Order map',
            download_apk: 'Download Android APK',
            download_modal_title: 'Download our Android app',
            download_modal_desc: 'For the best experience, download our mobile app. Order your trips faster and enjoy exclusive features!',
            close: 'Close',
            accept: 'Accept',
            location_access: 'Access to your location',
            location_desc: 'Location lets you get the price without waiting, see yourself on the map, avoid address errors, and have a driver accept and pick you up where you are.',
            driver_reviews: 'Driver reviews',
            description: 'Description',
            history: 'History',
            visit: 'Visit',
            visit_desc: 'Order a taxi to visit this historic site:',
            order: 'Order',
            trip_one_way: 'One way',
            trip_round_trip: 'Round trip',
            payment_in_person: 'Cash',
            payment_moncash: 'MonCash',
            payment_card: 'Card',
            timing_now: 'Now',
            label_departure: 'Pickup',
            label_arrival: 'Drop-off',
            label_passengers_short: 'pax',
            label_paused: 'Paused',
            label_extended: 'Extended',
            label_in_hours: 'in',
            label_driver_note: 'Driver note',
            gps_at_departure: 'GPS position at trip start',
            gps_update_btn: 'Update',
            btn_accept_price: 'Accept',
            btn_refuse_price: 'Decline',
            btn_track_ride: 'Track ride',
            btn_download_receipt: '🧾 Download PDF receipt',
            btn_cancel_ride: 'Cancel ride',
            status_pending: 'Pending',
            status_price_proposed: 'Price proposed',
            status_price_confirmed: 'Confirmed',
            status_driver_assigned: 'Driver assigned',
            status_on_way: 'On the way',
            status_arrived: 'Arrived',
            status_in_progress: 'Ride in progress',
            status_completed: 'Completed',
            status_cancelled: 'Cancelled',
            orders_tab_active: 'Active',
            orders_tab_history: 'History',
            btn_view_my_ride: 'View my ride',
            sheet_tab_new_trip: 'New trip',
            sheet_tab_my_ride: 'My ride',
            nav_discover: 'Discover',
            nav_haiti: 'Haiti',
            nav_routes: 'Routes',
            nav_tarifs: 'Rates',
            nav_community: 'Community',
            nav_reviews: 'Customer reviews',
            nav_top_drivers: 'Top drivers',
            nav_forum: 'Forum',
            nav_help: 'Help',
            nav_my_enterprise: 'My business',
            nav_register_enterprise: 'Register my business',
            enterprise_promo_title: 'Have a business?',
            enterprise_promo_sub: 'Become a DAXI partner',
            account_enterprise_title: 'Partner portal',
            account_enterprise_sub: 'Manage your company rides on DAXI',
            account_enterprise_cta: 'Register my business',
            nav_lost_object: 'Lost item',
            tab_book: 'Book',
            tab_orders: 'My rides',
            tab_tarif: 'Rates',
            tab_account: 'My account',
            label_departure_row: 'Pickup',
            label_destination_row: 'Destination',
            fab_order_taxi: 'Book a taxi',
            page_my_account: 'My account',
            page_my_profile: 'My profile',
            page_tarifs: 'Our Rates & Services',
            page_reviews: 'Customer reviews',
            page_routes: 'Frequent routes',
            page_lost_object: 'Lost item',
            page_assistance: 'DAXI Support',
            assist_hero_title: 'How can we help you?',
            assist_hero_sub: 'Book, track your ride, pay or report an issue — the DAXI team responds quickly.',
            assist_contact_title: 'Contact us',
            assist_wa_title: 'WhatsApp — fast reply',
            assist_wa_sub: '+509 4496-9696 · best for an active ride',
            assist_phone_title: 'Phone',
            assist_email_title: 'Email',
            assist_faq_title: 'Frequently asked questions',
            assist_faq_1_q: 'How do I order a taxi?',
            assist_faq_1_a: 'On « New trip », enter pickup (GPS icon or manual address), destination, then tap « Order a taxi ». You\'ll see a price before confirming.',
            assist_faq_2_q: 'How is the price calculated?',
            assist_faq_2_a: 'Based on distance and trip type. A quote is shown before payment. Service plans show fixed prices on their card.',
            assist_faq_3_q: 'How can I pay?',
            assist_faq_3_a: 'MonCash, bank card or cash to the driver (as offered at checkout). Cancellation fees are paid online.',
            assist_faq_4_q: 'The driver can\'t find me',
            assist_faq_4_a: 'Enable location or enter a clear landmark. Add a note for the driver. You can also call from « My ride ».',
            assist_faq_5_q: 'I left something in the vehicle',
            assist_faq_5_a: 'Open « Lost item » in the menu or WhatsApp us with ride time and item description.',
            assist_faq_6_q: 'My account is blocked',
            assist_faq_6_a: 'WhatsApp or email info@daxipro.com with your phone number. We review within 24 hours.',
            assist_hours_title: 'Availability',
            assist_hours_body: 'Phone support: Mon – Sun, 6am – 10pm. WhatsApp: priority replies 7 days a week.',
            bh_title: 'How to place an order on Daxi',
            bh_lead: 'This guide explains each part of the form, the map and the steps until your ride.',
            bh_depart_p1: 'Enter where the driver should pick you up: type an address and pick a suggestion from the list.',
            bh_depart_p2: 'Pickup must be in a Daxi-covered area. Without valid coordinates, the order cannot be priced.',
            bh_gps_p1: 'The green target button next to Departure uses your current GPS in one tap. Daxi fills pickup with « My current location » and centers the map on you.',
            bh_gps_p2: 'Allow location if prompted. You can fine-tune by dragging the pin on the map.',
            bh_dest_p1: 'Where you want to be dropped off. Always pick an address from suggestions to save exact coordinates.',
            bh_dest_p2: 'The map shows the route and estimated distance once pickup and destination are set.',
            bh_map_h: 'Fine-tune on the map',
            bh_map_p1: 'After entering an address or using My location, drag the pin to adjust the exact spot — e.g. in front of a door.',
            bh_map_warn: 'Place the drop-off point as close as possible. Extra distance beyond the registered point may incur additional fees.',
            bh_note_p: 'Add a useful detail: house color, landmark, « in front of shop X », etc.',
            bh_pax_p: 'Number of people in the vehicle (− and + buttons).',
            bh_trip_h: 'Trip type',
            bh_trip_p1: 'One way: a single ride to the destination.',
            bh_trip_p2: 'Round trip: return to pickup, with optional wait time on the way back.',
            bh_time_h: 'Now or Later',
            bh_time_p1: 'Now: immediate ride after price and payment validation.',
            bh_time_p2: 'Later: scheduled ride — choose date and departure time.',
            bh_order_h: 'Order button',
            bh_order_p: 'When the form is complete, confirm. You will see the proposed price, payment, then tracking in My ride.',
            bh_tips_h: 'Interface tips',
            bh_tips_p: 'Tap the map to collapse the panel and see the route better. The top banner shows distance and estimated time.',
            bh_done: 'Got it',
            my_position_placeholder: 'My current location',
            where_go_placeholder: 'Where are you going?',
            loader_map_loading: 'Loading map…',
            loader_map_ready: 'Map ready…',
            loader_orders: 'Loading your rides…',
            loader_slow: 'Slow connection — finishing…',
            btn_preparing: 'Preparing...',
            dup_order_msg: 'An identical order was just sent. Please wait a few seconds.',
            pickup_address_placeholder: 'Departure address',
            orders_no_immediate: 'No immediate rides',
            orders_no_scheduled: 'No scheduled rides',
            orders_empty_active_title: 'No active rides',
            orders_empty_active_sub: 'Book your next trip from the home screen',
            orders_empty_history_title: 'No rides in history',
            orders_empty_history_sub: 'Your completed rides will appear here',
            orders_count_0_trips: '0 rides',
            orders_count_1_trip: '1 ride',
            orders_count_n_trips: '{n} rides',
            orders_count_0_scheduled: '0 scheduled',
            orders_count_1_scheduled: '1 scheduled',
            orders_count_n_scheduled: '{n} scheduled',
            label_driver_note_row: 'Add a landmark for the driver (optional)',
            account_guest_badge: 'Your Daxi space',
            account_guest_title: 'Sign in',
            account_guest_sub: 'Access your rides, stats and settings.',
            account_sign_in: 'Sign in',
            account_sign_up: 'Create account',
            account_perk_rides: 'Rides',
            account_perk_stats: 'Stats',
            account_perk_settings: 'Settings',
            account_stats: 'Statistics',
            account_info: 'Information',
            account_actions: 'Actions',
            reviews_badge: 'Google Reviews',
            reviews_title_prefix: 'What our',
            reviews_title_highlight: 'clients',
            reviews_title_suffix: 'say',
            reviews_subtitle: 'Over 200 satisfied clients trust Daxi every day. Read their authentic reviews below.',
            reviews_out_of: 'out of 5',
            reviews_based_on: 'Based on 200+ reviews',
            reviews_cta_title: 'Happy with Daxi?',
            reviews_subtitle_cta: 'Share your experience. A review helps us grow and improve our service.',
            reviews_cta_btn: 'Leave a Google review',
            blog_search_placeholder: 'Search an article…',
            blog_all_categories: 'All categories',
            blog_no_articles: 'No articles yet.',
            blog_loading: 'Loading...',
            lost_login_required: 'Sign in or book a ride to report a lost item.',
            lost_no_completed: 'No completed rides',
            lost_no_completed_sub: 'Complete a ride to report a forgotten item.',
            lost_intro: 'Select the ride during which you forgot an item, describe it, and submit — the driver and our team will be notified.',
            lost_order_label: 'Related ride',
            lost_order_placeholder: '— Choose a ride —',
            lost_desc_label: 'Item description',
            lost_desc_placeholder: 'E.g. black bag, Samsung phone, keys with red keychain…',
            lost_submit: 'Report lost item',
            lost_sending: 'Sending…',
            lost_choose_order: 'Choose a ride.',
            lost_min_chars: 'Minimum 5 characters.',
            lost_network_error: 'Network error.',
            lost_loading: 'Loading',
            lost_loading_sub: 'Fetching your completed rides…',
            lost_load_error: 'Unable to load right now.',
            lost_retry: 'Retry',
            driver_space: 'Driver space',
            wait_driver_title: 'Searching for a driver',
            wait_driver_msg: 'Your payment method is confirmed. We are contacting available drivers in your area — you will be notified as soon as a driver accepts your ride.',
            wait_driver_detail: 'Your payment is confirmed. We are contacting available drivers near you.',
            wait_price_title: 'Waiting for price',
            wait_price_detail: 'A driver or the DAXI team will place your pickup and drop-off on the map. The fare will be sent via WhatsApp.',
            wait_payment_title: 'Complete payment',
            wait_payment_detail: 'Choose a payment method to start driver search.',
            wait_active_title: 'Ride in progress',
            wait_active_detail: 'Track your driver on the map.',
            wait_confirmed_title: 'Price confirmed',
            wait_confirmed_detail: 'Next step: driver assignment.',
            sheet_orders_title: 'Your active rides',
            sheet_orders_sub: 'Select a ride to see tracking, map and details.',
            order_number: 'Order {id}',
            order_back_list: 'Back to my rides',
            label_depart_fallback: 'Pickup',
            label_dest_fallback: 'Destination',
            mini_ride_default: 'My ride',
            mini_active_orders: '{n} active rides',
            mini_driver_assigned: 'Driver assigned',
            mini_on_way: 'Driver on the way',
            mini_arrived: 'Driver arrived',
            mini_in_progress: 'Ride in progress',
            mini_price_proposed: 'Price to confirm',
            mini_pending: 'Pending',
            my_position_btn: 'My location',
            top_driver_trips_0: '0 rides',
            top_driver_trips_1: '1 ride',
            top_driver_trips_n: '{n} rides',
            top_driver_default_name: 'Driver',
            plan_gallery_title: 'Image gallery',
            plan_cta_interest: 'Interested in this plan?',
            plan_load_error: 'Unable to load plans. Please try again.',
            plan_airport_title: 'Airport Pickup',
            plan_airport_sub: 'Cap-Haïtien · calculated price',
            plan_airport_preview: 'Arriving by plane? Your driver waits at Cap-Haïtien airport with a sign bearing your name, 1 hour before landing. Delays billed per DAXI waiting rates.',
            dpw_stop_n: 'Stop {n}',
            dpw_stop_ph: 'Address or place',
            gps_not_found_msg: 'Could not find your current location. Please enter the address manually.',
            gps_permission_denied: 'Allow location access or enter the address manually.',
            dpw_where_going: 'Where you are going',
            dpw_where_going_ph: 'Hotel, address, neighborhood…',
            dpw_sign_ph: 'E.g. John Smith',
            dpw_airport_name: 'Cap-Haïtien Airport',
            pay_choose_method: 'Choose your payment method',
            pay_order_label: 'Order',
            pay_pending_msg: 'Payment not completed — choose your payment method again to continue.',
            pay_moncash_desc: 'Digicel mobile payment · fast and secure',
            pay_card_label: 'Bank card',
            pay_card_desc: 'Visa, Mastercard, American Express',
            pay_cash_label: 'Pay the driver',
            pay_cash_desc: 'Cash on board — cancellation fees paid online',
            pay_continue_btn: 'Continue',
            pay_contract_line: 'I accept the DAXI transport contract and refund conditions.',
            pay_contract_view: 'View contract',
            pay_confirmed_title: 'Payment confirmed!',
            pay_confirmed_msg: 'Your payment was received successfully.',
            pay_confirmed_driver: 'A driver will be assigned to you very soon.',
            perk_included: 'Included',
            perk_free: 'Free'
        },
        es: {
            order_taxi: 'Pedir su Taxi',
            departure_placeholder: 'Dirección de salida',
            destination_placeholder: 'Dirección de llegada',
            different_address: 'Indicar otra dirección',
            address_explanation: 'Si no desea compartir su ubicación, ingrese su dirección de salida manualmente.',
            passenger_count_label: 'Número de pasajeros',
            one_way: 'Solo ida',
            round_trip: 'Ida y vuelta',
            description_placeholder: 'Descripción adicional (opcional)',
            now: 'Ahora',
            later: 'Más tarde',
            order_taxi_btn: 'Pedir un Taxi',
            service_plans: 'Nuestros Planes de Servicio',
            learn_more: 'Saber más',
            discover_haiti: 'Descubra Haití',
            top_drivers: 'Mejores Conductores de la Semana',
            login: 'Iniciar sesión',
            logout: 'Cerrar sesión',
            language: 'Idioma',
            back: 'Volver',
            order_service_btn: 'Pedir',
            instant_contact_text: '¿Lo necesitas ahora? ¡Contáctanos por WhatsApp!',
            citadelle_name: 'Ciudadela La Ferrière',
            citadelle_desc: 'Fortaleza histórica en la cima de una montaña',
            labadee_name: 'Labadee',
            labadee_desc: 'Playas paradisíacas y aguas cristalinas',
            verrieres_name: 'Monumentos de Vertière',
            verrieres_desc: 'Memorial histórico de la batalla de Vertière',
            share_location_btn: 'Activar ubicación',
            manual_address_btn: 'Ingresar dirección manualmente',
            map_benefit_title: 'Por qué activar su ubicación',
            map_benefit_point1: 'Obtenga el precio del viaje de inmediato, sin espera del sistema',
            map_benefit_point2: 'Véase en el mapa y evite errores de dirección',
            map_benefit_point3: 'Un conductor acepta de inmediato y le recoge donde está',
            map_benefit_desc: 'Solo accedemos a su ubicación después de su acuerdo. También puede ingresar la dirección manualmente.',
            location_desc: 'La ubicación permite obtener el precio sin espera, verse en el mapa, evitar errores de dirección, y que un conductor acepte y le recoja donde está.',
            plan1_title: 'Ciudad a Ciudad',
            plan1_sub: 'Precio a determinar',
            plan1_preview: 'Desplácese con tranquilidad entre ciudades con nuestro servicio de transporte cómodo y seguro.',
            plan2_title: 'Medio Día',
            plan2_sub: '4 horas - $70',
            plan2_preview: 'Ideal para recados, citas y visitas. Su conductor privado disponible durante 4 horas.',
            plan3_title: 'Día Completo',
            plan3_sub: '8 horas - $140',
            plan3_preview: 'Servicio completo para días ocupados. Disfrute de un conductor dedicado durante 8 horas.',
            plan4_title: 'Elegance Night',
            plan4_sub: 'Hasta 3h - $150',
            plan4_preview: 'Para sus noches especiales. Servicio premium con vehículo de alta gama para sus salidas nocturnas.',
            plan5_title: 'Business / VIP',
            plan5_sub: 'Precio personalizado',
            plan5_preview: 'Solución ideal para clientes regulares. Beneficios exclusivos y servicio prioritario.',
            no_drivers: 'No hay conductores disponibles en este momento.',
            id_tab: 'ID',
            password_tab: 'Contraseña',
            signup_tab: 'Registrarse',
            signup_wizard_sub: 'Únase a DAXI en 3 pasos simples',
            signup_step_identity: 'Identidad',
            signup_step_security: 'Seguridad',
            signup_step_finish: 'Finalización',
            signup_whatsapp_hint: 'Su código de verificación se enviará por WhatsApp.',
            signup_next: 'Siguiente',
            signup_back: 'Volver',
            signup_have_account: '¿Ya tiene una cuenta?',
            login_welcome_sub: 'Acceda a su espacio DAXI',
            id_login_desc: 'Inicie sesión con su ID único para acceder a su cuenta permanente.',
            your_id: 'Su ID',
            your_id_placeholder: 'Ingrese su ID de 4 dígitos',
            login_with_id: 'Iniciar sesión con mi ID',
            password_login_desc: 'Inicie sesión con su email y contraseña.',
            email: 'Email',
            email_placeholder: 'Su dirección de email',
            password: 'Contraseña',
            password_placeholder: '••••••••',
            confirm_password: 'Confirmar contraseña',
            confirm_password_placeholder: '••••••••',
            password_error: 'Las contraseñas no coinciden',
            last_name: 'Apellido',
            last_name_placeholder: 'Ej: Jean',
            first_name: 'Nombre',
            first_name_placeholder: 'Ej: Pierre',
            phone: 'Teléfono',
            phone_placeholder: 'Número de teléfono',
            age: 'Edad',
            age_placeholder: 'Su edad',
            unique_id: 'Su ID único',
            save_id: 'Guarde este ID para acceder a su cuenta desde cualquier dispositivo',
            save: 'Guardar',
            order_service: 'Pedir este servicio',
            departure_label: 'Punto de salida',
            destination_label: 'Ciudad de destino',
            plan1_order_desc: 'Este servicio está disponible bajo demanda. Llene el formulario para una estimación personalizada.',
            plan2_order_desc: 'Llene el formulario para reservar su conductor privado por 4 horas.',
            plan3_order_desc: 'Llene el formulario para reservar su conductor privado por 8 horas.',
            plan4_order_desc: 'Llene el formulario para reservar su servicio VIP nocturno.',
            plan5_order_desc: 'Llene el formulario para recibir una propuesta personalizada.',
            plan2_date_label: 'Fecha deseada',
            plan2_time_label: 'Hora de inicio',
            plan3_date_label: 'Fecha deseada',
            plan3_time_label: 'Hora de inicio',
            plan4_date_label: 'Fecha de la noche',
            plan4_time_label: 'Hora de inicio',
            occasion_label: 'Ocasión (opcional)',
            occasion_placeholder: 'Ej: Cumpleaños, Noche con amigos',
            plan5_quote_title: 'Solicitar un presupuesto personalizado',
            different_departure: 'Indicar un punto de salida diferente',
            departure_explanation: 'Por defecto, le recogemos en su ubicación actual.',
            departure_address: 'Dirección de salida',
            note: 'Nota:',
            plan1_price_note: 'Precio a determinar por el administrador según la distancia y la demanda.',
            plan_features: 'Características:',
            notify_modal_title: 'Mantenerse informado de su viaje',
            notify_benefit_price: 'Alerta cuando se proponga un precio',
            notify_benefit_driver: 'Conductor asignado y llegada en tiempo real',
            notify_benefit_messages: 'Mensajes importantes del conductor',
            notify_modal_desc: 'Activa las notificaciones para recibir alertas cuando se proponga un precio, se asigne un conductor, llegue, y más.',
            notify_settings: 'Puede cambiar esta opción en los ajustes del teléfono.',
            notify_decline: 'No gracias',
            notify_accept: 'Permitir',
            open_forum: 'Abrir el foro',
            pending_orders: 'Mis Pedidos',
            cathedrale_name: 'Catedral de Cap-Haïtien',
            cathedrale_desc: 'Joya arquitectónica del norte de Haití',
            palais_name: 'Palacio Sans Souci',
            palais_desc: 'Antiguo palacio real de Henri Christophe',
            services: 'Servicios a bordo',
            wifi_service: 'Wifi gratis',
            wifi_desc: 'Encontrará internet a bordo de nuestros vehículos para mantenerse conectado.',
            water_service: 'Botella de agua disponible',
            water_desc: 'Hay una botella de agua disponible a bordo para refrescarse durante el viaje.',
            frequent_routes: 'Rutas frecuentes',
            forum_title: 'Foro Comunidad',
            forum_subtitle: 'Descubra los últimos anuncios y debates',
            trip_history: 'Historial de viajes',
            map_title: 'Mapa del pedido',
            download_apk: 'Descargar APK Android',
            download_modal_title: 'Descargue nuestra aplicación Android',
            download_modal_desc: '¡Para una experiencia óptima, descargue nuestra aplicación móvil. Pida sus viajes más rápido y disfrute de funciones exclusivas!',
            close: 'Cerrar',
            accept: 'Aceptar',
            location_access: 'Acceso a su ubicación',
            location_desc: 'La ubicación permite obtener el precio sin espera, verse en el mapa, evitar errores de dirección, y que un conductor acepte y le recoja donde está.',
            driver_reviews: 'Opiniones sobre el conductor',
            description: 'Descripción',
            history: 'Historia',
            visit: 'Visitar',
            visit_desc: 'Pida un taxi para visitar este lugar histórico:',
            order: 'Pedir',
            trip_one_way: 'Solo ida',
            trip_round_trip: 'Ida y vuelta',
            payment_in_person: 'En efectivo',
            payment_moncash: 'MonCash',
            payment_card: 'Tarjeta',
            timing_now: 'Ahora',
            label_departure: 'Salida',
            label_arrival: 'Llegada',
            label_passengers_short: 'pers.',
            label_paused: 'Pausa',
            label_extended: 'Prolongado',
            label_in_hours: 'en',
            label_driver_note: 'Nota para el conductor',
            gps_at_departure: 'Posición GPS al inicio del viaje',
            gps_update_btn: 'Actualizar',
            btn_accept_price: 'Aceptar',
            btn_refuse_price: 'Rechazar',
            btn_track_ride: 'Seguir el viaje',
            btn_download_receipt: '🧾 Descargar recibo PDF',
            btn_cancel_ride: 'Cancelar viaje',
            status_pending: 'Pendiente',
            status_price_proposed: 'Precio propuesto',
            status_price_confirmed: 'Confirmado',
            status_driver_assigned: 'Conductor asignado',
            status_on_way: 'En camino',
            status_arrived: 'En el lugar',
            status_in_progress: 'Viaje en curso',
            status_completed: 'Terminado',
            status_cancelled: 'Cancelado',
            orders_tab_active: 'Activas',
            orders_tab_history: 'Historial',
            btn_view_my_ride: 'Ver mi viaje',
            sheet_tab_new_trip: 'Nuevo viaje',
            sheet_tab_my_ride: 'Mi viaje',
            nav_discover: 'Descubrir',
            nav_haiti: 'Haití',
            nav_routes: 'Rutas',
            nav_tarifs: 'Tarifas',
            nav_community: 'Comunidad',
            nav_reviews: 'Opiniones de clientes',
            nav_top_drivers: 'Mejores conductores',
            nav_forum: 'Foro',
            nav_help: 'Ayuda',
            nav_my_enterprise: 'Mi empresa',
            nav_register_enterprise: 'Registrar mi empresa',
            enterprise_promo_title: '¿Tiene una empresa?',
            enterprise_promo_sub: 'Conviértase en socio DAXI',
            account_enterprise_title: 'Espacio socio',
            account_enterprise_sub: 'Gestione los viajes de su empresa en DAXI',
            account_enterprise_cta: 'Registrar mi empresa',
            nav_lost_object: 'Objeto perdido',
            tab_book: 'Reservar',
            tab_orders: 'Mis viajes',
            tab_tarif: 'Tarifas',
            tab_account: 'Mi cuenta',
            label_departure_row: 'Salida',
            label_destination_row: 'Destino',
            fab_order_taxi: 'Reservar un taxi',
            page_my_account: 'Mi cuenta',
            page_my_profile: 'Mi perfil',
            page_tarifs: 'Nuestras tarifas y servicios',
            page_reviews: 'Opiniones de clientes',
            page_routes: 'Rutas frecuentes',
            page_lost_object: 'Objeto perdido',
            page_assistance: 'Asistencia DAXI',
            assist_hero_title: '¿Cómo podemos ayudarle?',
            assist_hero_sub: 'Reserve, siga su viaje, pague o reporte un problema — el equipo DAXI responde rápido.',
            assist_contact_title: 'Contáctenos',
            assist_wa_title: 'WhatsApp — respuesta rápida',
            assist_wa_sub: '+509 4496-9696 · ideal para un viaje en curso',
            assist_phone_title: 'Teléfono',
            assist_email_title: 'Correo',
            assist_faq_title: 'Preguntas frecuentes',
            assist_faq_1_q: '¿Cómo pedir un taxi?',
            assist_faq_1_a: 'En « Nuevo viaje », indique salida (icono GPS o dirección manual), destino y pulse « Pedir un taxi ». Verá el precio antes de confirmar.',
            assist_faq_2_q: '¿Cómo se calcula el precio?',
            assist_faq_2_a: 'Según distancia y tipo de viaje. Cotización antes del pago. Los planes muestran precio fijo en su tarjeta.',
            assist_faq_3_q: '¿Cómo puedo pagar?',
            assist_faq_3_a: 'MonCash, tarjeta o efectivo al conductor (según opciones). Las penalizaciones de cancelación se pagan en línea.',
            assist_faq_4_q: 'El conductor no me encuentra',
            assist_faq_4_a: 'Active la ubicación o escriba una referencia clara. Añada una nota. También puede llamar desde « Mi viaje ».',
            assist_faq_5_q: 'Olvidé algo en el vehículo',
            assist_faq_5_a: 'Abra « Objeto perdido » en el menú o escríbanos por WhatsApp con hora y descripción.',
            assist_faq_6_q: 'Mi cuenta está bloqueada',
            assist_faq_6_a: 'WhatsApp o info@daxipro.com con su número. Revisamos en 24 horas.',
            assist_hours_title: 'Disponibilidad',
            assist_hours_body: 'Teléfono: lun – dom, 6h – 22h. WhatsApp: respuesta prioritaria 7 días.',
            bh_title: 'Cómo hacer un pedido en Daxi',
            bh_lead: 'Esta guía explica cada parte del formulario, el mapa y los pasos hasta su viaje.',
            bh_depart_p1: 'Indique dónde debe recogerle el conductor: escriba una dirección y elija una sugerencia de la lista.',
            bh_depart_p2: 'La salida debe estar en una zona cubierta por Daxi. Sin coordenadas válidas, no se puede calcular el precio.',
            bh_gps_p1: 'El botón verde junto a Salida usa su GPS actual con un toque. Daxi rellena la salida con « Mi ubicación actual » y centra el mapa.',
            bh_gps_p2: 'Permita la ubicación si se solicita. Puede ajustar arrastrando el pin en el mapa.',
            bh_dest_p1: 'Dónde desea bajarse. Elija siempre una dirección de las sugerencias para guardar coordenadas exactas.',
            bh_dest_p2: 'El mapa muestra la ruta y distancia estimada cuando salida y destino están definidos.',
            bh_map_h: 'Ajustar en el mapa',
            bh_map_p1: 'Tras introducir una dirección o usar Mi ubicación, arrastre el pin para el punto exacto.',
            bh_map_warn: 'Coloque la llegada lo más cerca posible. Kilómetros extra pueden generar cargos adicionales.',
            bh_note_p: 'Añada un detalle útil: color de casa, referencia, « frente a la tienda X », etc.',
            bh_pax_p: 'Número de personas en el vehículo (botones − y +).',
            bh_trip_h: 'Tipo de viaje',
            bh_trip_p1: 'Solo ida: un viaje hasta el destino.',
            bh_trip_p2: 'Ida y vuelta: regreso al punto de salida, con tiempo de espera opcional.',
            bh_time_h: 'Ahora o Más tarde',
            bh_time_p1: 'Ahora: viaje inmediato tras validar precio y pago.',
            bh_time_p2: 'Más tarde: viaje programado — elija fecha y hora.',
            bh_order_h: 'Botón Pedir',
            bh_order_p: 'Con el formulario completo, confirme. Verá el precio, el pago y el seguimiento en Mi viaje.',
            bh_tips_h: 'Consejos de interfaz',
            bh_tips_p: 'Toque el mapa para reducir el panel y ver mejor la ruta. La barra superior muestra distancia y tiempo.',
            bh_done: 'Entendido',
            my_position_placeholder: 'Mi ubicación actual',
            where_go_placeholder: '¿A dónde va?',
            loader_map_loading: 'Cargando el mapa…',
            loader_map_ready: 'Mapa listo…',
            loader_orders: 'Cargando sus viajes…',
            loader_slow: 'Conexión lenta — finalizando…',
            btn_preparing: 'Preparando...',
            dup_order_msg: 'Se acaba de enviar un pedido idéntico. Espere unos segundos.',
            pickup_address_placeholder: 'Dirección de salida',
            orders_no_immediate: 'Ningún viaje inmediato',
            orders_no_scheduled: 'Ningún viaje programado',
            orders_empty_active_title: 'Ningún viaje activo',
            orders_empty_active_sub: 'Reserve su próximo viaje desde el inicio',
            orders_empty_history_title: 'Ningún viaje en el historial',
            orders_empty_history_sub: 'Sus viajes completados aparecerán aquí',
            orders_count_0_trips: '0 viajes',
            orders_count_1_trip: '1 viaje',
            orders_count_n_trips: '{n} viajes',
            orders_count_0_scheduled: '0 programados',
            orders_count_1_scheduled: '1 programado',
            orders_count_n_scheduled: '{n} programados',
            label_driver_note_row: 'Añadir un punto de referencia para el conductor (opcional)',
            account_guest_badge: 'Su espacio Daxi',
            account_guest_title: 'Iniciar sesión',
            account_guest_sub: 'Acceda a sus viajes, estadísticas y ajustes.',
            account_sign_in: 'Iniciar sesión',
            account_sign_up: 'Crear cuenta',
            account_perk_rides: 'Viajes',
            account_perk_stats: 'Estadísticas',
            account_perk_settings: 'Ajustes',
            account_stats: 'Estadísticas',
            account_info: 'Información',
            account_actions: 'Acciones',
            reviews_badge: 'Reseñas de Google',
            reviews_title_prefix: 'Lo que dicen',
            reviews_title_highlight: 'nuestros clientes',
            reviews_title_suffix: '',
            reviews_subtitle: 'Más de 200 clientes satisfechos confían en Daxi cada día. Descubra sus opiniones auténticas abajo.',
            reviews_out_of: 'de 5',
            reviews_based_on: 'Basado en más de 200 reseñas',
            reviews_cta_title: '¿Satisfecho con Daxi?',
            reviews_subtitle_cta: 'Comparta su experiencia. Una reseña nos ayuda a crecer y mejorar el servicio.',
            reviews_cta_btn: 'Dejar una reseña en Google',
            blog_search_placeholder: 'Buscar un artículo…',
            blog_all_categories: 'Todas las categorías',
            blog_no_articles: 'Ningún artículo por el momento.',
            blog_loading: 'Cargando...',
            lost_login_required: 'Inicie sesión o reserve un viaje para reportar un objeto perdido.',
            lost_no_completed: 'Ningún viaje completado',
            lost_no_completed_sub: 'Complete un viaje para poder reportar un objeto olvidado.',
            lost_intro: 'Seleccione el viaje durante el cual olvidó un objeto, descríbalo y envíe — el conductor y nuestro equipo serán notificados.',
            lost_order_label: 'Viaje concernido',
            lost_order_placeholder: '— Elegir un viaje —',
            lost_desc_label: 'Descripción del objeto',
            lost_desc_placeholder: 'Ej: bolsa negra, teléfono Samsung, llaves con llavero rojo…',
            lost_submit: 'Reportar objeto perdido',
            lost_sending: 'Enviando…',
            lost_choose_order: 'Elija un viaje.',
            lost_min_chars: 'Mínimo 5 caracteres.',
            lost_network_error: 'Error de red.',
            lost_loading: 'Cargando',
            lost_loading_sub: 'Recuperando sus viajes completados…',
            lost_load_error: 'No se puede cargar por el momento.',
            lost_retry: 'Reintentar',
            driver_space: 'Espacio Conductor',
            wait_driver_title: 'Buscando un conductor',
            wait_driver_msg: 'Su método de pago está confirmado. Contactamos conductores disponibles en su zona — será notificado cuando un conductor acepte su viaje.',
            wait_driver_detail: 'Su pago está confirmado. Contactamos conductores disponibles cerca de usted.',
            wait_price_title: 'Esperando el precio',
            wait_price_detail: 'Un conductor o el equipo DAXI ubicará su salida y llegada en el mapa. La tarifa se enviará por WhatsApp.',
            wait_payment_title: 'Finalice el pago',
            wait_payment_detail: 'Elija un método de pago para buscar un conductor.',
            wait_active_title: 'Viaje en curso',
            wait_active_detail: 'Siga a su conductor en el mapa.',
            wait_confirmed_title: 'Precio confirmado',
            wait_confirmed_detail: 'Siguiente paso: asignación de conductor.',
            sheet_orders_title: 'Sus viajes en curso',
            sheet_orders_sub: 'Seleccione un viaje para ver el seguimiento, el mapa y los detalles.',
            order_number: 'Pedido {id}',
            order_back_list: 'Volver a mis viajes',
            label_depart_fallback: 'Salida',
            label_dest_fallback: 'Destino',
            mini_ride_default: 'Mi viaje',
            mini_active_orders: '{n} viajes activos',
            mini_driver_assigned: 'Conductor asignado',
            mini_on_way: 'Conductor en camino',
            mini_arrived: 'Conductor en el lugar',
            mini_in_progress: 'Viaje en curso',
            mini_price_proposed: 'Precio por confirmar',
            mini_pending: 'Pendiente',
            my_position_btn: 'Mi ubicación',
            top_driver_trips_0: '0 viajes',
            top_driver_trips_1: '1 viaje',
            top_driver_trips_n: '{n} viajes',
            top_driver_default_name: 'Conductor',
            plan_gallery_title: 'Galería de imágenes',
            plan_cta_interest: '¿Interesado en este plan?',
            plan_load_error: 'No se pueden cargar los planes. Inténtelo de nuevo.',
            plan_airport_title: 'Recepción Aeropuerto',
            plan_airport_sub: 'Cap-Haïtien · precio calculado',
            plan_airport_preview: '¿Llega en avión? Su conductor le espera en el aeropuerto de Cap-Haïtien con un cartel con su nombre, 1 h antes del aterrizaje. Retrasos facturados según tarifas DAXI.',
            dpw_stop_n: 'Parada {n}',
            dpw_stop_ph: 'Dirección o lugar',
            gps_not_found_msg: 'No pudimos encontrar su ubicación. Ingrese la dirección manualmente.',
            gps_permission_denied: 'Permita la ubicación o ingrese la dirección manualmente.',
            dpw_where_going: 'A dónde va',
            dpw_where_going_ph: 'Hotel, dirección, barrio…',
            dpw_sign_ph: 'Ej: Juan Pérez',
            dpw_airport_name: 'Aeropuerto Cap-Haïtien',
            pay_choose_method: 'Elija su método de pago',
            pay_order_label: 'Pedido',
            pay_pending_msg: 'Pago no finalizado — elija de nuevo su método de pago para continuar.',
            pay_moncash_desc: 'Pago móvil Digicel · rápido y seguro',
            pay_card_label: 'Tarjeta bancaria',
            pay_card_desc: 'Visa, Mastercard, American Express',
            pay_cash_label: 'Pagar al conductor',
            pay_cash_desc: 'Efectivo a bordo — las penalidades de cancelación se pagan en línea',
            pay_continue_btn: 'Continuar',
            pay_contract_line: 'Acepto el contrato de transporte y condiciones de reembolso de DAXI.',
            pay_contract_view: 'Ver contrato',
            pay_confirmed_title: '¡Pago confirmado!',
            pay_confirmed_msg: 'Su pago fue recibido con éxito.',
            pay_confirmed_driver: 'Se le asignará un conductor muy pronto.',
            perk_included: 'Incluido',
            perk_free: 'Gratis'
        }
    };

    function _daxiTranslateDynamicCounts(dict) {
        if (!dict) return;
        document.querySelectorAll('[data-i18n-count]').forEach(function(el) {
            var n = parseInt(el.getAttribute('data-count'), 10);
            if (isNaN(n)) n = 0;
            var kind = el.getAttribute('data-i18n-count') || 'trips';
            var key = n === 0 ? ('orders_count_0_' + kind) : (n === 1 ? ('orders_count_1_' + kind) : ('orders_count_n_' + kind));
            var tpl = dict[key];
            if (tpl) el.textContent = tpl.replace(/\{n\}/g, String(n));
        });
    }
    window._daxiTranslateDynamicCounts = function(lang) {
        var l = lang || localStorage.getItem('daxi_lang') || 'fr';
        var dict = (_localTranslations && _localTranslations[l]) || {};
        _daxiTranslateDynamicCounts(dict);
    };

    function applyTranslations(dict) {
        if (!dict) return;
        document.querySelectorAll('[data-translate]').forEach(function(el) {
            if (el.closest('[data-i18n-static]') || el.hasAttribute('data-i18n-static')) return;
            var key = el.getAttribute('data-translate');
            if (dict[key] === undefined) return;
            var val = dict[key];
            if (el.classList.contains('daxi-row-action') || el.classList.contains('dpw-row-action')) {
                el.setAttribute('title', val);
                el.setAttribute('aria-label', val);
                var stray = el.querySelector('.i18n-text');
                if (stray) stray.remove();
                return;
            }
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                if (el.placeholder !== val) el.placeholder = val;
                return;
            }
            if (el.childElementCount === 0) {
                if (el.textContent !== val) el.textContent = val;
                return;
            }
            var label = el.querySelector(':scope > .i18n-text');
            if (!label) {
                for (var n = 0; n < el.childNodes.length; n++) {
                    var node = el.childNodes[n];
                    if (node.nodeType === 3 && node.textContent.trim()) {
                        label = document.createElement('span');
                        label.className = 'i18n-text';
                        label.textContent = val;
                        el.replaceChild(label, node);
                        return;
                    }
                }
                label = document.createElement('span');
                label.className = 'i18n-text';
                el.appendChild(label);
            }
            if (label.textContent !== val) label.textContent = val;
        });
        _daxiTranslateDynamicCounts(dict);
    }

    var _i18nApplyTimer = null;
    function _applyTranslationsDebounced(dict) {
        clearTimeout(_i18nApplyTimer);
        _i18nApplyTimer = setTimeout(function() { applyTranslations(dict); }, 40);
    }

    async function translatePage(lang) {
        if (window.DaxiAutoI18n && typeof window.DaxiAutoI18n.translatePage === 'function') {
            return window.DaxiAutoI18n.translatePage(lang);
        }
        _currentLang = lang;
        if (lang === 'fr') return;

        if (_localTranslations[lang] && Object.keys(_localTranslations[lang]).length > 0) {
            _applyTranslationsDebounced(_localTranslations[lang]);
            return;
        }

        try {
            var r = await fetch('/api/translations/?lang=' + lang, { credentials: 'same-origin' });
            if (r.ok) {
                var data = await r.json();
                if (data.translations && Object.keys(data.translations).length > 0) {
                    _localTranslations[lang] = data.translations;
                    _applyTranslationsDebounced(data.translations);
                    return;
                }
            }
        } catch(ex) {}

        if (lang === 'fr') return;

        try {
            var genR = await fetch('/api/translations/generate/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
                body: JSON.stringify({ lang: lang }),
                credentials: 'same-origin',
            });
            if (genR.ok) {
                var genData = await genR.json();
                if (genData.translations && Object.keys(genData.translations).length > 0) {
                    _localTranslations[lang] = genData.translations;
                    _applyTranslationsDebounced(genData.translations);
                } else if (genData.error) {
                    console.warn('Traduction impossible:', genData.error);
                }
            }
        } catch(ex) {
            console.warn('Erreur traduction:', ex);
        }
    }
    window.translatePage = translatePage;
    window._localTranslations = _localTranslations;
    window.applyDaxiTranslations = function(lang) {
        if (window.DaxiAutoI18n && typeof window.DaxiAutoI18n.apply === 'function') {
            return window.DaxiAutoI18n.apply(lang);
        }
        var l = lang || _currentLang || localStorage.getItem('daxi_lang') || 'fr';
        if (l === 'fr') return;
        if (_localTranslations[l]) _applyTranslationsDebounced(_localTranslations[l]);
    };


    var langSelect = document.getElementById('languageSelect');
    if (langSelect) {
        langSelect.addEventListener('change', function() {
            localStorage.setItem('daxi_lang', this.value);
            if (window._daxiPersistLang) window._daxiPersistLang(this.value);
            if (window._daxiInvalidatePlanCatalog) window._daxiInvalidatePlanCatalog();
            translatePage(this.value);
        });
    }

    document.querySelectorAll('.sidebar-language-btn[data-lang]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.sidebar-language-btn').forEach(function(b){ b.classList.remove('active'); });
            btn.classList.add('active');
            if (langSelect) langSelect.value = btn.dataset.lang;
            localStorage.setItem('daxi_lang', btn.dataset.lang);
            if (window._daxiPersistLang) window._daxiPersistLang(btn.dataset.lang);
            if (window._daxiInvalidatePlanCatalog) window._daxiInvalidatePlanCatalog();
            translatePage(btn.dataset.lang);
        });
    });

    (function() {
        var saved = (typeof window._daxiGetSavedLang === 'function') ? window._daxiGetSavedLang() : (localStorage.getItem('daxi_lang') || 'fr');
        if (langSelect) langSelect.value = saved;
        document.querySelectorAll('.sidebar-language-btn[data-lang]').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.lang === saved);
        });
        if (window._daxiPersistLang) window._daxiPersistLang(saved);
        function applySaved() {
            translatePage(saved);
            if (typeof renderSidebarTopDrivers === 'function') renderSidebarTopDrivers();
        }
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', applySaved);
        } else {
            applySaved();
        }
    })();
    (function _daxiFixGpsBtnIcon() {
        var btn = document.getElementById('myPositionBtn');
        if (!btn) return;
        var stray = btn.querySelector('.i18n-text');
        if (stray) stray.remove();
        if (!btn.querySelector('i')) {
            btn.innerHTML = '<i class="ri-focus-3-line" aria-hidden="true"></i>';
        }
    })();
})();


(function() {
    function addRipple(btn) {
        if (btn.classList.contains('btn-ripple-container')) return;
        btn.classList.add('btn-ripple-container');
    }
    function initRipples() {
        document.querySelectorAll('button, .gold-button, .btn-glow').forEach(addRipple);
    }
    document.addEventListener('click', function(e) {
        var btn = e.target.closest('button, .gold-button, .btn-glow');
        if (!btn) return;

        if (!btn.classList.contains('btn-ripple-container')) btn.classList.add('btn-ripple-container');
        var ripple = document.createElement('span');
        ripple.classList.add('ripple');
        var rect = btn.getBoundingClientRect();
        var size = Math.max(rect.width, rect.height);
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
        ripple.style.top  = (e.clientY - rect.top  - size / 2) + 'px';
        btn.appendChild(ripple);
        ripple.addEventListener('animationend', function() { ripple.remove(); });
    }, true);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initRipples);
    } else {
        initRipples();
    }
})();
