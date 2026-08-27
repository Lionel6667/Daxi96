#!/usr/bin/env python3
"""
Transform driver.html: strip all JS except Google Maps + Geolocation + Push.
Replace with HTMX-driven server-side rendering.
"""
import re, sys, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

INPUT  = "driver.html"
OUTPUT = "driver.html"
BACKUP = "driver.html.bak"

with open(INPUT, 'r', encoding='utf-8') as f:
    html = f.read()

with open(BACKUP, 'w', encoding='utf-8') as f:
    f.write(html)
print("Backup created:", BACKUP)

MAPS_API_KEY = 'AIzaSyAnJLrSxMKAvUEni2TU2_-8awj_0lg29Fc'


html = html.replace('<script src="/static/js/firebase-shim.js"></script>', '<!-- firebase-shim removed -->')
HTMX_CDN = '<script src="https://unpkg.com/htmx.org@2.0.2" integrity="sha384-Y7hw+L/jvKeWIRRkqWYfPcvVxHzVzn5REgzbawhxAuQGwX1XWe70vji+VSeHOThJ" crossorigin="anonymous"></script>'
if 'htmx.org' not in html:
    html = html.replace('</head>', HTMX_CDN + '\n</head>', 1)
    print("HTMX CDN added")


html = re.sub(
    r'<script(?![^>]*\bsrc\b)[^>]*>[\s\S]*?</script>',
    '',
    html,
    flags=re.IGNORECASE
)
print("Inline scripts stripped")


login_form_replacement = '''<section id="login-section" class="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div class="bg-white rounded-lg shadow-sm p-6 w-full max-w-md">
            <div class="text-center mb-6">
                <div class="w-16 h-16 bg-gradient-to-br from-amber-400 to-yellow-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <i class="ri-taxi-line text-gray-900 text-2xl"></i>
                </div>
                <h2 class="text-2xl font-bold text-gray-800">Connexion Chauffeur</h2>
                <p class="text-gray-500 text-sm mt-1">Accédez à votre espace chauffeur</p>
            </div>
            <form id="driver-login-form"
                  hx-post="/htmx/driver/login/"
                  hx-target="body"
                  hx-swap="innerHTML">
                <div id="driver-login-error" class="hidden bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-3"></div>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Email ou Téléphone</label>
                    <input type="text" name="identifier" required autofocus
                           class="w-full px-3 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                           placeholder="votre@email.com ou +509...">
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
                    <input type="password" name="password" required
                           class="w-full px-3 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                           placeholder="Votre mot de passe">
                </div>
                <button type="submit"
                        class="w-full bg-gradient-to-r from-amber-500 to-yellow-600 text-white py-3 rounded-lg font-semibold text-sm">
                    Se connecter
                </button>
                <p class="text-center text-sm text-gray-500 mt-4">
                    Pas encore inscrit ?
                    <a href="#" onclick="document.getElementById('register-section').classList.remove('hidden'); document.getElementById('login-section').classList.add('hidden');" class="text-amber-600 font-semibold">S'inscrire</a>
                </p>
            </form>
        </div>
    </section>'''

html = re.sub(
    r'<section id="login-section"[\s\S]*?</section>(?=\s*<div id="main-interface")',
    login_form_replacement + '\n\n    ',
    html, count=1
)
print("Login section replaced")


register_form_replacement = '''<section id="register-section" class="min-h-screen bg-gray-50 flex items-center justify-center px-4 hidden">
        <div class="bg-white rounded-lg shadow-sm p-6 w-full max-w-md">
            <h2 class="text-2xl font-bold text-gray-800 mb-2 text-center">Inscription Chauffeur</h2>
            <p class="text-gray-600 text-center text-sm mb-6">Créez votre compte chauffeur</p>
            <form hx-post="/htmx/driver/register/"
                  hx-target="body"
                  hx-swap="innerHTML">
                <div class="grid grid-cols-2 gap-3 mb-3">
                    <div>
                        <label class="block text-xs font-medium text-gray-700 mb-1">Prénom *</label>
                        <input type="text" name="firstname" required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none">
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-700 mb-1">Nom *</label>
                        <input type="text" name="lastname" required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none">
                    </div>
                </div>
                <div class="mb-3">
                    <label class="block text-xs font-medium text-gray-700 mb-1">Email *</label>
                    <input type="email" name="email" required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none">
                </div>
                <div class="mb-3">
                    <label class="block text-xs font-medium text-gray-700 mb-1">Téléphone *</label>
                    <input type="tel" name="phone" required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none">
                </div>
                <div class="mb-3">
                    <label class="block text-xs font-medium text-gray-700 mb-1">Ville</label>
                    <input type="text" name="city" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none">
                </div>
                <div class="grid grid-cols-2 gap-3 mb-3">
                    <div>
                        <label class="block text-xs font-medium text-gray-700 mb-1">Véhicule</label>
                        <input type="text" name="vehicle" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none">
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-gray-700 mb-1">Plaque</label>
                        <input type="text" name="plate" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none">
                    </div>
                </div>
                <div class="mb-4">
                    <label class="block text-xs font-medium text-gray-700 mb-1">Mot de passe *</label>
                    <input type="password" name="password" required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none">
                </div>
                <button type="submit"
                        class="w-full bg-gradient-to-r from-amber-500 to-yellow-600 text-white py-3 rounded-lg font-semibold text-sm">
                    Créer mon compte
                </button>
                <p class="text-center text-sm text-gray-500 mt-3">
                    Déjà inscrit ?
                    <a href="#" onclick="document.getElementById('login-section').classList.remove('hidden'); document.getElementById('register-section').classList.add('hidden');" class="text-amber-600 font-semibold">Se connecter</a>
                </p>
            </form>
        </div>
    </section>'''

html = re.sub(
    r'<section id="register-section"[\s\S]*?</section>(?=\s*<section id="login-section")',
    register_form_replacement + '\n\n    ',
    html, count=1
)
print("Register section replaced")


orders_content_replacement = '''<div id="driver-orders-subtab-contents">
                        <!-- Sub-tab buttons -->
                        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
                            <button onclick="loadDriverOrders(\'accepted\')"
                                    style="padding:6px 12px;background:linear-gradient(135deg,#10b981,#059669);color:white;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;">
                                &#128663; En cours
                            </button>
                            <button onclick="loadDriverOrders(\'available\')"
                                    style="padding:6px 12px;background:white;color:#374151;border:2px solid #e5e7eb;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;">
                                &#128276; Disponibles
                            </button>
                            <button onclick="loadDriverOrders(\'history\')"
                                    style="padding:6px 12px;background:white;color:#374151;border:2px solid #e5e7eb;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;">
                                &#128218; Historique
                            </button>
                            <button onclick="loadDriverCalendar()"
                                    style="padding:6px 12px;background:white;color:#374151;border:2px solid #e5e7eb;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;">
                                &#128197; Calendrier
                            </button>
                        </div>
                        <!-- Orders content loaded via HTMX -->
                        <div id="driver-orders-htmx"
                             hx-get="/htmx/driver/orders/?tab=accepted"
                             hx-trigger="load"
                             hx-swap="innerHTML">
                            <div style="text-align:center;padding:30px;color:#9ca3af;">Chargement...</div>
                        </div>
                    </div>'''

html = re.sub(
    r'<div id="driver-orders-subtab-contents">[\s\S]*?</div>\s*</div>\s*</section>\s*\n\s*<section class="mb-6 hidden" id="requests-section"',
    orders_content_replacement + '\n                </div>\n            </section>\n\n            <section class="mb-6 hidden" id="requests-section"',
    html, count=1
)
print("Driver orders content replaced")


status_section_replacement = '''<section class="mb-6">
                <div class="bg-white rounded-lg shadow-sm p-4">
                    <div class="flex items-center justify-between mb-3">
                        <h2 class="text-base font-semibold text-gray-800">Statut actuel</h2>
                        <span id="driver-status-badge"
                              style="padding:5px 12px;border-radius:14px;font-size:11px;font-weight:700;background:#f3f4f6;color:#6b7280;">
                            &#11044; Chargement...
                        </span>
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button hx-post="/htmx/driver/status/"
                                hx-vals=\'{"status":"available"}\'
                                hx-target="#driver-status-badge"
                                hx-swap="outerHTML"
                                hx-headers=\'{"X-CSRFToken": "CSRF_PLACEHOLDER"}\'
                                style="flex:1;padding:10px;background:#10b981;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">
                            &#128994; En ligne
                        </button>
                        <button hx-post="/htmx/driver/status/"
                                hx-vals=\'{"status":"offline"}\'
                                hx-target="#driver-status-badge"
                                hx-swap="outerHTML"
                                hx-headers=\'{"X-CSRFToken": "CSRF_PLACEHOLDER"}\'
                                style="flex:1;padding:10px;background:#6b7280;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">
                            &#9899; Hors ligne
                        </button>
                    </div>
                </div>
            </section>'''

html = re.sub(
    r'<section class="mb-6">\s*<div class="bg-white rounded-lg shadow-sm p-6">\s*<h2[^>]*>Statut actuel</h2>[\s\S]*?</section>(?=\s*\n\s*<!-- Gestion des commandes)',
    status_section_replacement,
    html, count=1
)
print("Status section replaced")


html = re.sub(
    r'<div id="drvForumContainer"[^>]*>[\s\S]*?</div>(?=\s*</div>\s*</div>)',
    '<div id="drvForumContainer"\n'
    '                     hx-get="/htmx/forum/"\n'
    '                     hx-trigger="revealed"\n'
    '                     hx-swap="innerHTML"\n'
    '                     class="forum-pub-grid">\n'
    '                    <div style="text-align:center;padding:30px;color:#9ca3af;">Chargement...</div>\n'
    '                </div>',
    html, count=1
)
print("Forum container replaced")


MANDATORY_JS = """<script>
// ===== GOOGLE MAPS (MANDATORY) =====
window.googleMapsLoaded = false;
window.initGoogleMaps = function() {
    window.googleMapsLoaded = true;
    window.dispatchEvent(new Event('googleMapsReady'));
    initAllMapDivs();
};

function initAllMapDivs() {
    document.querySelectorAll('[data-lat][data-lng]:not([data-map-init])').forEach(function(el) {
        el.dataset.mapInit = '1';
        var lat = parseFloat(el.dataset.lat);
        var lng = parseFloat(el.dataset.lng);
        var dLat = parseFloat(el.dataset.destLat || 0);
        var dLng = parseFloat(el.dataset.destLng || 0);
        if (!lat || !lng) return;
        var map = new google.maps.Map(el, {center:{lat:lat,lng:lng}, zoom:13, mapTypeControl:false, streetViewControl:false});
        new google.maps.Marker({position:{lat:lat,lng:lng}, map:map, title:'Depart', icon:'http://maps.google.com/mapfiles/ms/icons/green-dot.png'});
        if (dLat && dLng) {
            new google.maps.Marker({position:{lat:dLat,lng:dLng}, map:map, title:'Dest', icon:'http://maps.google.com/mapfiles/ms/icons/red-dot.png'});
            var ds = new google.maps.DirectionsService();
            var dr = new google.maps.DirectionsRenderer({suppressMarkers:true});
            dr.setMap(map);
            ds.route({origin:{lat:lat,lng:lng}, destination:{lat:dLat,lng:dLng}, travelMode:google.maps.TravelMode.DRIVING}, function(res,status) {
                if (status === 'OK') dr.setDirections(res);
            });
        }
    });
}

(function() {
    if (window.googleMapsInitializing) return;
    window.googleMapsInitializing = true;
    var s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?key=""" + MAPS_API_KEY + """&libraries=places,geometry&loading=async&callback=initGoogleMaps';
    s.async = true; s.defer = true;
    document.head.appendChild(s);
})();

document.addEventListener('htmx:afterSwap', function() {
    if (window.googleMapsLoaded) initAllMapDivs();
});

// ===== GEOLOCATION (MANDATORY) =====
var driverLocationInterval = null;

function startLocationTracking() {
    if (!navigator.geolocation) return;
    driverLocationInterval = setInterval(function() {
        navigator.geolocation.getCurrentPosition(function(pos) {
            fetch('/htmx/driver/location/', {
                method: 'POST',
                headers: {'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRFToken': getCsrfToken()},
                body: 'lat=' + pos.coords.latitude + '&lng=' + pos.coords.longitude
            }).catch(function(){});
        }, function(){}, {enableHighAccuracy: true});
    }, 15000); // every 15 seconds
}

function stopLocationTracking() {
    if (driverLocationInterval) { clearInterval(driverLocationInterval); driverLocationInterval = null; }
}

// ===== PUSH NOTIFICATIONS (MANDATORY) =====
var messaging = null;
try { firebase.initializeApp({}); messaging = firebase.messaging(); } catch(e) {}

if (messaging) {
    messaging.onMessage(function(payload) {
        var body = (payload.notification && payload.notification.body) || 'Nouvelle commande!';
        var alert = document.getElementById('notification-alert');
        var txt = document.getElementById('notification-text');
        if (alert && txt) { txt.textContent = body; alert.classList.remove('hidden'); }
        // Reload orders
        var loader = document.getElementById('driver-orders-htmx');
        if (loader) htmx.trigger(loader, 'load');
    });
}

// ===== HELPER FUNCTIONS =====
function getCsrfToken() {
    var el = document.querySelector('[name=csrfmiddlewaretoken]');
    return el ? el.value : '';
}

function loadDriverOrders(tab) {
    var loader = document.getElementById('driver-orders-htmx');
    if (!loader) return;
    loader.setAttribute('hx-get', '/htmx/driver/orders/?tab=' + tab);
    htmx.trigger(loader, 'load');
}

function loadDriverCalendar() {
    var loader = document.getElementById('driver-orders-htmx');
    if (!loader) return;
    loader.setAttribute('hx-get', '/htmx/driver/calendar/');
    htmx.trigger(loader, 'load');
}

// Sidebar toggle
document.addEventListener('DOMContentLoaded', function() {
    var menuBtn = document.getElementById('driver-menu-btn');
    var sidebar = document.getElementById('driver-sidebar');
    var overlay = document.getElementById('driver-sidebar-overlay');
    var closeBtn = document.getElementById('driver-sidebar-close');

    function openSidebar() {
        if (sidebar) { sidebar.style.transform = 'translateX(0)'; }
        if (overlay) { overlay.style.display = 'block'; setTimeout(function(){ overlay.style.opacity='1'; }, 10); }
    }
    function closeSidebar() {
        if (sidebar) { sidebar.style.transform = 'translateX(100%)'; }
        if (overlay) { overlay.style.opacity='0'; setTimeout(function(){ overlay.style.display='none'; }, 300); }
    }
    window.__driverCloseSidebar = closeSidebar;

    if (menuBtn) menuBtn.addEventListener('click', openSidebar);
    if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
    if (overlay) overlay.addEventListener('click', closeSidebar);

    // Logout
    var logoutBtn = document.getElementById('driver-sidebar-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            fetch('/htmx/driver/logout/', {method:'POST', headers:{'X-CSRFToken': getCsrfToken()}})
              .then(function() { window.location.reload(); });
        });
    }

    // Profile edit
    var profileBtn = document.getElementById('driver-sidebar-edit-profile');
    if (profileBtn) {
        profileBtn.addEventListener('click', function() {
            closeSidebar();
            var loader = document.getElementById('driver-orders-htmx');
            if (loader) { loader.setAttribute('hx-get', '/htmx/driver/profile/'); htmx.trigger(loader, 'load'); }
        });
    }

    // Notification dismiss
    var dismissBtn = document.getElementById('dismiss-notification');
    if (dismissBtn) {
        dismissBtn.addEventListener('click', function() {
            var a = document.getElementById('notification-alert');
            if (a) a.classList.add('hidden');
        });
    }

    // HTMX: include CSRF in all requests
    document.body.addEventListener('htmx:configRequest', function(e) {
        e.detail.headers['X-CSRFToken'] = getCsrfToken();
    });

    // Start location tracking when on main interface
    var main = document.getElementById('main-interface');
    if (main && !main.classList.contains('hidden')) {
        startLocationTracking();
    }

    // Auto-refresh orders every 30s
    setInterval(function() {
        var loader = document.getElementById('driver-orders-htmx');
        if (loader && document.getElementById('main-interface') && !document.getElementById('main-interface').classList.contains('hidden')) {
            htmx.trigger(loader, 'load');
        }
    }, 30000);
});

// openDriverForum
function openDriverForum() {
    var modal = document.getElementById('drvForumModal');
    if (modal) { modal.classList.add('open'); htmx.trigger(document.getElementById('drvForumContainer'), 'revealed'); }
}
function closeDriverForum() {
    var modal = document.getElementById('drvForumModal');
    if (modal) modal.classList.remove('open');
}
</script>"""

html = html.replace('</body>', MANDATORY_JS + '\n</body>', 1)
print("Mandatory JS injected")


html = html.replace('"X-CSRFToken": "CSRF_PLACEHOLDER"', '"X-CSRFToken": "{{ csrf_token }}"')

with open(OUTPUT, 'w', encoding='utf-8') as f:
    f.write(html)

orig_size = os.path.getsize(BACKUP)
new_size = os.path.getsize(OUTPUT)
print(f"\nDone! {INPUT}")
print(f"  Original: {orig_size:,} bytes ({orig_size//1024} KB)")
print(f"  New:      {new_size:,} bytes ({new_size//1024} KB)")
print(f"  Reduced by: {orig_size - new_size:,} bytes ({100*(orig_size-new_size)//orig_size}%)")
