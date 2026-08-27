#!/usr/bin/env python3
"""
Transform vubez2.html: strip all JS except Google Maps (+ Places) + Push notifications.
Replace with HTMX-driven server-side rendering.
"""
import re, sys, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

INPUT  = "vubez2.html"
OUTPUT = "vubez2.html"
BACKUP = "vubez2.html.bak"

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


old_order_btn = '<button id="orderTaxiBtn"'
new_order_btn = (
    '<input type="hidden" name="pickup" id="pickupHidden">\n'
    '                    <input type="hidden" name="destination" id="destinationHidden">\n'
    '                    <input type="hidden" name="pickup_lat" id="pickupLatHidden">\n'
    '                    <input type="hidden" name="pickup_lng" id="pickupLngHidden">\n'
    '                    <input type="hidden" name="destination_lat" id="destLatHidden">\n'
    '                    <input type="hidden" name="destination_lng" id="destLngHidden">\n'
    '                    <input type="hidden" name="date" id="bookingDateHidden">\n'
    '                    <input type="hidden" name="time" id="bookingTimeHidden">\n'
    '                    <div id="booking-response" style="margin-bottom:8px;"></div>\n'
    '                    <button id="orderTaxiBtn"\n'
    '                        hx-post="/htmx/client/order/create/"\n'
    '                        hx-target="#booking-response"\n'
    '                        hx-swap="innerHTML"\n'
    '                        hx-include="[name=pickup],[name=destination],[name=pickup_lat],[name=pickup_lng],[name=destination_lat],[name=destination_lng],[name=date],[name=time],[name=notes],[name=passengerCount]"'
)
html = html.replace(old_order_btn, new_order_btn, 1)
print("Booking button replaced with HTMX")


html = html.replace('id="bookingDescription"', 'id="bookingDescription" name="notes"')


orders_replacement = '''<!-- My Orders Section — server-rendered via HTMX -->
        <section class="mb-8" id="my-orders-section">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <h3 class="text-lg font-semibold text-gray-800">Mes courses</h3>
                <div style="display:flex;gap:6px;">
                    <button onclick="loadClientOrders(\'active\')"
                            style="padding:5px 12px;background:linear-gradient(135deg,#667eea,#764ba2);color:white;border:none;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer;">
                        En cours
                    </button>
                    <button onclick="loadClientOrders(\'history\')"
                            style="padding:5px 12px;background:white;color:#374151;border:1px solid #e5e7eb;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer;">
                        Historique
                    </button>
                </div>
            </div>
            <div id="client-orders-htmx"
                 hx-get="/htmx/client/orders/?tab=active"
                 hx-trigger="load"
                 hx-swap="innerHTML">
                <div style="text-align:center;padding:30px;color:#9ca3af;font-size:13px;">Chargement de vos courses...</div>
            </div>
        </section>'''


old_orders_pattern = r'<div id="pendingRequestsContainer"[^>]*>[\s\S]*?</section>\s*\n\s*<!-- Transferring Request Section -->[\s\S]*?</section>'
html = re.sub(old_orders_pattern, '', html, count=1)


html = html.replace(
    '</section>\n\n        <!-- SECTION DES PLANS DE SERVICES AJOUTÉE ICI -->',
    '</section>\n\n        ' + orders_replacement + '\n\n        <!-- SECTION DES PLANS DE SERVICES AJOUTÉE ICI -->',
    1
)
print("Orders sections replaced with HTMX loader")


html = html.replace(
    '<button id="loginWithPasswordBtn"\n                    class="w-full gold-button py-3 !rounded-button font-semibold mt-2 btn-glow" data-translate="login">',
    '<button id="loginWithPasswordBtn"\n'
    '                    hx-post="/htmx/client/login/"\n'
    '                    hx-target="body"\n'
    '                    hx-swap="innerHTML"\n'
    '                    hx-include="#emailInput,#passwordInput"\n'
    '                    class="w-full gold-button py-3 !rounded-button font-semibold mt-2 btn-glow" data-translate="login">'
)


html = re.sub(r'<input type="email" id="emailInput"', '<input type="email" id="emailInput" name="email"', html)
html = re.sub(r'<input type="password" id="passwordInput"', '<input type="password" id="passwordInput" name="password"', html)


old_form = '<form id="createAccountForm">'
new_form = (
    '<form id="createAccountForm"\n'
    '                    hx-post="/htmx/client/register/"\n'
    '                    hx-target="body"\n'
    '                    hx-swap="innerHTML">'
)
html = html.replace(old_form, new_form, 1)


html = re.sub(r'<input type="text" id="lastName"', '<input type="text" id="lastName" name="lastname"', html)
html = re.sub(r'<input type="text" id="firstName"', '<input type="text" id="firstName" name="firstname"', html)
html = re.sub(r'<input type="email" id="email"', '<input type="email" id="email" name="email"', html)
html = re.sub(r'<input type="tel" id="phone"', '<input type="tel" id="phone" name="phone"', html)
html = re.sub(r'<input type="password" id="password"', '<input type="password" id="password" name="password"', html)

print("Login/register forms updated with HTMX")


html = re.sub(
    r'<div id="forumFullscreenContainer"[^>]*>[\s\S]*?</div>(?=\s*</div>\s*</div>\s*</div>)',
    '<div id="forumFullscreenContainer"\n'
    '                 hx-get="/htmx/forum/"\n'
    '                 hx-trigger="revealed"\n'
    '                 hx-swap="innerHTML"\n'
    '                 class="forum-pub-grid">\n'
    '            <div style="text-align:center;padding:30px;color:#9ca3af;">Chargement...</div>\n'
    '        </div>',
    html, count=1
)
print("Forum modal replaced with HTMX")


MANDATORY_JS = """<script>
// ===== GOOGLE MAPS + PLACES AUTOCOMPLETE (MANDATORY) =====
window.googleMapsLoaded = false;
window.initGoogleMaps = function() {
    window.googleMapsLoaded = true;
    window.dispatchEvent(new Event('googleMapsReady'));
    initPlacesAutocomplete();
    initAllMapDivs();
};

function initPlacesAutocomplete() {
    if (typeof google === 'undefined' || !google.maps || !google.maps.places) return;

    function setupAutocomplete(inputId, latHiddenId, lngHiddenId, textHiddenId) {
        var input = document.getElementById(inputId);
        if (!input) return;
        var ac = new google.maps.places.Autocomplete(input, {
            componentRestrictions: {country: 'ht'},
            fields: ['formatted_address', 'geometry', 'name']
        });
        ac.addListener('place_changed', function() {
            var place = ac.getPlace();
            if (!place.geometry) return;
            var lat = place.geometry.location.lat();
            var lng = place.geometry.location.lng();
            var addr = place.formatted_address || place.name || input.value;
            if (latHiddenId) { var el = document.getElementById(latHiddenId); if(el) el.value = lat; }
            if (lngHiddenId) { var el = document.getElementById(lngHiddenId); if(el) el.value = lng; }
            if (textHiddenId) { var el = document.getElementById(textHiddenId); if(el) el.value = addr; }
            input.value = addr;
        });
    }

    // Pickup address
    setupAutocomplete('destinationAddress', 'pickupLatHidden', 'pickupLngHidden', 'pickupHidden');
    // Destination address
    setupAutocomplete('destinationAddressArrival', 'destLatHidden', 'destLngHidden', 'destinationHidden');
}

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
            ds.route({origin:{lat:lat,lng:lng}, destination:{lat:dLat,lng:dLng}, travelMode:google.maps.TravelMode.DRIVING}, function(res,s) {
                if (s === 'OK') dr.setDirections(res);
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
    if (window.googleMapsLoaded) { initAllMapDivs(); initPlacesAutocomplete(); }
});

// ===== PUSH NOTIFICATIONS (MANDATORY) =====
var messaging = null;
try { firebase.initializeApp({}); messaging = firebase.messaging(); } catch(e) {}

if (messaging) {
    messaging.onMessage(function(payload) {
        var body = (payload.notification && payload.notification.body) || 'Mise à jour de votre course';
        // Refresh orders when notification arrives
        var ordersEl = document.getElementById('client-orders-htmx');
        if (ordersEl) htmx.trigger(ordersEl, 'load');
        // Show notification
        if (Notification && Notification.permission === 'granted') {
            new Notification('Daxi', {body: body, icon: 'img20.png'});
        }
    });
}

function requestNotificationPermission() {
    if (!messaging) return;
    Notification.requestPermission().then(function(perm) {
        if (perm === 'granted') {
            messaging.getToken().then(function(token) {
                fetch('/api/notifications/fcm-token/', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken()},
                    body: JSON.stringify({token: token})
                }).catch(function(){});
            }).catch(function(){});
        }
    });
}

// ===== HELPERS =====
function getCsrfToken() {
    var el = document.querySelector('[name=csrfmiddlewaretoken]');
    return el ? el.value : '';
}

function loadClientOrders(tab) {
    var loader = document.getElementById('client-orders-htmx');
    if (!loader) return;
    loader.setAttribute('hx-get', '/htmx/client/orders/?tab=' + tab);
    htmx.trigger(loader, 'load');
}

// HTMX: include CSRF in all requests
document.addEventListener('htmx:configRequest', function(e) {
    e.detail.headers['X-CSRFToken'] = getCsrfToken();
});

// ===== SIDEBAR TOGGLE =====
document.addEventListener('DOMContentLoaded', function() {
    var menuToggle = document.getElementById('menuToggle');
    var sidebarMenu = document.getElementById('sidebarMenu');
    var sidebarOverlay = document.getElementById('sidebarOverlay');
    var sidebarClose = document.getElementById('sidebarClose');

    function openSidebar() {
        if (sidebarMenu) sidebarMenu.classList.add('open');
        if (sidebarOverlay) sidebarOverlay.classList.add('active');
    }
    function closeSidebar() {
        if (sidebarMenu) sidebarMenu.classList.remove('open');
        if (sidebarOverlay) sidebarOverlay.classList.remove('active');
    }

    if (menuToggle) menuToggle.addEventListener('click', openSidebar);
    if (sidebarClose) sidebarClose.addEventListener('click', closeSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

    // Login button → show modal
    var loginBtn = document.getElementById('loginBtn');
    var sidebarLoginBtn = document.getElementById('sidebarLoginBtn');
    var loginModal = document.getElementById('loginModal');

    function openLoginModal() {
        if (loginModal) { loginModal.style.display = 'flex'; }
        closeSidebar();
    }
    if (loginBtn) loginBtn.addEventListener('click', openLoginModal);
    if (sidebarLoginBtn) sidebarLoginBtn.addEventListener('click', openLoginModal);

    // Close modal buttons
    document.querySelectorAll('.close-modal').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var modal = btn.closest('.modal');
            if (modal) modal.style.display = 'none';
        });
    });

    // Modal tabs
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

    // Now/Later toggle for booking
    var nowBtn = document.getElementById('nowBtn');
    var laterBtn = document.getElementById('laterBtn');
    var dateTimeSection = document.getElementById('dateTimeSection');

    if (nowBtn) nowBtn.addEventListener('click', function() {
        nowBtn.classList.add('active'); if (laterBtn) laterBtn.classList.remove('active');
        if (dateTimeSection) dateTimeSection.classList.add('hidden');
    });
    if (laterBtn) laterBtn.addEventListener('click', function() {
        laterBtn.classList.add('active'); if (nowBtn) nowBtn.classList.remove('active');
        if (dateTimeSection) dateTimeSection.classList.remove('hidden');
    });

    // Destination switch
    var destSwitch = document.getElementById('destinationSwitch');
    var destField = document.getElementById('destinationField');
    if (destSwitch) {
        destSwitch.addEventListener('change', function() {
            if (destField) destField.classList.toggle('hidden', !this.checked);
        });
    }

    // Booking form: before submit, sync hidden fields from visible inputs
    var orderBtn = document.getElementById('orderTaxiBtn');
    if (orderBtn) {
        orderBtn.addEventListener('htmx:configRequest', function(e) {
            // Sync address text fields to hidden inputs
            var pickup = document.getElementById('destinationAddress');
            var dest = document.getElementById('destinationAddressArrival');
            var pickupHidden = document.getElementById('pickupHidden');
            var destHidden = document.getElementById('destinationHidden');
            var bookingDate = document.getElementById('bookingDate');
            var bookingTime = document.getElementById('bookingTime');
            var dateHidden = document.getElementById('bookingDateHidden');
            var timeHidden = document.getElementById('bookingTimeHidden');

            if (pickup && pickupHidden && !pickupHidden.value) pickupHidden.value = pickup.value;
            if (!pickupHidden || !pickupHidden.value) {
                // Use geolocation if available
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(function(pos) {
                        var latEl = document.getElementById('pickupLatHidden');
                        var lngEl = document.getElementById('pickupLngHidden');
                        var pickupEl = document.getElementById('pickupHidden');
                        if (latEl) latEl.value = pos.coords.latitude;
                        if (lngEl) lngEl.value = pos.coords.longitude;
                        if (pickupEl && !pickupEl.value) pickupEl.value = 'Position actuelle';
                    }, function(){});
                }
            }
            if (dest && destHidden) destHidden.value = dest.value;
            if (bookingDate && dateHidden) dateHidden.value = bookingDate.value;
            if (bookingTime && timeHidden) timeHidden.value = bookingTime.value;
        }, {once: false});
    }

    // Auto-refresh orders every 30s if logged in
    setInterval(function() {
        var ordersEl = document.getElementById('client-orders-htmx');
        if (ordersEl) htmx.trigger(ordersEl, 'load');
    }, 30000);

    // Forum button
    var forumBtn = document.getElementById('sidebarForumBtn');
    var forumModal = document.getElementById('forumFullscreenModal');
    if (forumBtn && forumModal) {
        forumBtn.addEventListener('click', function() {
            forumModal.classList.add('open');
            closeSidebar();
            var fc = document.getElementById('forumFullscreenContainer');
            if (fc) htmx.trigger(fc, 'revealed');
        });
    }

    // Close forum
    var closePlanBtns = document.querySelectorAll('.plan-close-btn');
    closePlanBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
            var modal = btn.closest('.plan-detail-modal');
            if (modal) modal.classList.remove('open');
        });
    });

    // Geolocation for pickup
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(pos) {
            var latEl = document.getElementById('pickupLatHidden');
            var lngEl = document.getElementById('pickupLngHidden');
            var pickupEl = document.getElementById('pickupHidden');
            if (latEl) latEl.value = pos.coords.latitude;
            if (lngEl) lngEl.value = pos.coords.longitude;
            if (pickupEl && !pickupEl.value) pickupEl.value = 'Position actuelle';
        }, function(){}, {enableHighAccuracy: true, timeout: 10000});
    }

    // Hide loading overlay
    var loader = document.getElementById('initialLoader');
    if (loader) { setTimeout(function(){ loader.style.opacity='0'; setTimeout(function(){ loader.style.display='none'; }, 500); }, 800); }

    // Request push permission after load
    setTimeout(requestNotificationPermission, 3000);
});
</script>"""

html = html.replace('</body>', MANDATORY_JS + '\n</body>', 1)
print("Mandatory JS injected")

with open(OUTPUT, 'w', encoding='utf-8') as f:
    f.write(html)

orig_size = os.path.getsize(BACKUP)
new_size = os.path.getsize(OUTPUT)
print(f"\nDone! {INPUT}")
print(f"  Original: {orig_size:,} bytes ({orig_size//1024} KB)")
print(f"  New:      {new_size:,} bytes ({new_size//1024} KB)")
print(f"  Reduced by: {orig_size - new_size:,} bytes ({100*(orig_size-new_size)//orig_size}%)")
