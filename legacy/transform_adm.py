#!/usr/bin/env python3
"""
Transform adm.html: strip all JS except Google Maps + Push notifications.
Replace with HTMX-driven server-side rendering.
"""
import re, sys, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

INPUT  = "adm.html"
OUTPUT = "adm.html"
BACKUP = "adm.html.bak"

with open(INPUT, 'r', encoding='utf-8') as f:
    html = f.read()

with open(BACKUP, 'w', encoding='utf-8') as f:
    f.write(html)
print("Backup created:", BACKUP)


html = html.replace(
    '<script src="/static/js/firebase-shim.js"></script>',
    '<!-- firebase-shim removed -->'
)

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
print("Inline script blocks stripped")

MAPS_API_KEY = 'AIzaSyAnJLrSxMKAvUEni2TU2_-8awj_0lg29Fc'

MANDATORY_JS = """<script>
// Tailwind config
tailwind.config = {
    theme: { extend: { colors: { primary: '#D4AF37', secondary: '#FFD700', dark: '#1f2937' } } }
};
const GOOGLE_MAPS_API_KEY = '""" + MAPS_API_KEY + """';

// ===== GOOGLE MAPS (MANDATORY) =====
window.googleMapsLoaded = false;
window.initGoogleMaps = function() {
    window.googleMapsLoaded = true;
    window.dispatchEvent(new Event('googleMapsReady'));
    initAllMapDivs();
};

function initAllMapDivs() {
    document.querySelectorAll('[data-lat][data-lng]').forEach(function(el) {
        if (el.dataset.mapInit) return;
        el.dataset.mapInit = '1';
        var lat = parseFloat(el.dataset.lat);
        var lng = parseFloat(el.dataset.lng);
        var dLat = parseFloat(el.dataset.destLat || 0);
        var dLng = parseFloat(el.dataset.destLng || 0);
        if (!lat || !lng) return;
        var map = new google.maps.Map(el, { center: {lat:lat,lng:lng}, zoom:13, mapTypeControl:false, streetViewControl:false });
        new google.maps.Marker({position:{lat:lat,lng:lng}, map:map, title:'Depart', icon:'http://maps.google.com/mapfiles/ms/icons/green-dot.png'});
        if (dLat && dLng) {
            new google.maps.Marker({position:{lat:dLat,lng:dLng}, map:map, title:'Destination', icon:'http://maps.google.com/mapfiles/ms/icons/red-dot.png'});
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

// ===== PUSH NOTIFICATIONS (MANDATORY) =====
var messaging = null;
try { firebase.initializeApp({}); messaging = firebase.messaging(); } catch(e) {}

function getCsrfToken() {
    var el = document.querySelector('[name=csrfmiddlewaretoken]');
    return el ? el.value : '';
}

if (messaging) {
    messaging.onMessage(function(payload) {
        var body = (payload.notification && payload.notification.body) || 'Nouvelle notification';
        var flash = document.getElementById('flash-message');
        if (flash) {
            flash.innerHTML = '<div style="background:#667eea;color:white;padding:12px 16px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);">&#128276; ' + body + '</div>';
            setTimeout(function(){ flash.innerHTML=''; }, 5000);
        }
    });
}

// ===== TAB NAVIGATION (minimal JS) =====
function showAdminTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(function(el) {
        el.classList.remove('active'); el.style.display = 'none';
    });
    document.querySelectorAll('.tab-item').forEach(function(el) { el.classList.remove('active'); });
    var section = document.getElementById(tabName + '-section');
    var tabItem = document.querySelector('.tab-item[data-tab="' + tabName + '"]');
    if (section) { section.classList.add('active'); section.style.display = 'block'; }
    if (tabItem) tabItem.classList.add('active');
    if (section) {
        section.querySelectorAll('[hx-trigger]').forEach(function(el) {
            var trigger = el.getAttribute('hx-trigger') || '';
            if (trigger.includes('revealed') || trigger.includes('load')) htmx.trigger(el, 'load');
        });
    }
}

document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.tab-item[data-tab]').forEach(function(el) {
        el.addEventListener('click', function() { showAdminTab(this.dataset.tab); });
    });
    var main = document.getElementById('main-interface');
    var loginSection = document.getElementById('login-section');
    if (main && !main.classList.contains('hidden')) {
        if (loginSection) loginSection.style.display = 'none';
        var tabBar = document.getElementById('admin-tab-bar');
        if (tabBar) tabBar.classList.remove('hidden');
        showAdminTab('dashboard');
    }
});

function adminLogout() {
    fetch('/htmx/admin/logout/', {method:'POST', headers:{'X-CSRFToken': getCsrfToken()}})
      .then(function() { window.location.reload(); });
}

// ===== ORDERS TAB FUNCTIONS =====
function loadOrdersTab(status) {
    var loader = document.getElementById('orders-htmx-loader');
    if (!loader) return;
    var url = status === 'calendar' ? '/htmx/admin/calendar/' : '/htmx/admin/orders/?status=' + status;
    loader.setAttribute('hx-get', url);
    htmx.trigger(loader, 'load');
    document.querySelectorAll('[id^="subtab-"]').forEach(function(b) {
        b.style.background = 'white'; b.style.color = '#374151'; b.style.border = '2px solid #e5e7eb';
    });
    var active = document.getElementById('subtab-' + status);
    if (active) { active.style.background = 'linear-gradient(135deg,#667eea,#764ba2)'; active.style.color = 'white'; active.style.border = 'none'; }
}

setInterval(function() {
    var s = document.getElementById('orders-section');
    if (s && s.classList.contains('active')) {
        var loader = document.getElementById('orders-htmx-loader');
        if (loader) htmx.trigger(loader, 'load');
    }
}, 30000);

// ===== PRICE PROPOSAL MODAL =====
function openProposePrice(orderId, currentPrice) {
    var modal = document.getElementById('propose-price-modal');
    var form  = document.getElementById('propose-price-form');
    if (!modal || !form) return;
    form.setAttribute('hx-post', '/htmx/admin/orders/' + orderId + '/propose-price/');
    htmx.process(form);
    if (currentPrice) { var inp = form.querySelector('input[name="price"]'); if (inp) inp.value = currentPrice; }
    modal.style.display = 'flex';
}

// ===== DRIVER ASSIGNMENT =====
function assignDriver(driverId) {
    var modal = Array.from(document.querySelectorAll('[id^="assign-modal-"]')).find(function(m) {
        return m.style.display !== 'none' && m.style.display !== '';
    });
    if (!modal) return;
    var orderId = modal.id.replace('assign-modal-', '');
    fetch('/htmx/admin/orders/' + orderId + '/assign-driver/', {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRFToken': getCsrfToken()},
        body: 'driver_id=' + driverId
    }).then(function(r) { return r.text(); })
      .then(function(txt) {
          var flash = document.getElementById('flash-message');
          if (flash) { flash.innerHTML = txt; setTimeout(function(){ flash.innerHTML=''; }, 4000); }
          modal.style.display = 'none';
          var loader = document.getElementById('orders-htmx-loader');
          if (loader) htmx.trigger(loader, 'load');
      });
}

function loadAdminChat(orderId) {
    var el = document.getElementById('chat-messages-' + orderId);
    if (el) htmx.trigger(el, 'load');
}
</script>"""


def replace_section(html_text, section_id, replacement, stop_pattern):
    pattern = r'(<div id="' + section_id + r'"[^>]*>)[\s\S]*?(?=' + stop_pattern + r')'
    repl = replacement
    new_html = re.sub(pattern, repl, html_text, count=1)
    if new_html != html_text:
        print(f"Section #{section_id} replaced")
    else:
        print(f"WARNING: Section #{section_id} NOT found/replaced")
    return new_html

html = replace_section(html, 'dashboard-section',
    '<div id="dashboard-section" class="tab-content active">\n'
    '  <div id="admin-stats-container"\n'
    '       hx-get="/htmx/admin/stats/"\n'
    '       hx-trigger="load, every 60s"\n'
    '       hx-swap="outerHTML"\n'
    '       style="padding:16px;">\n'
    '    <div style="text-align:center;padding:40px;color:#9ca3af;">Chargement...</div>\n'
    '  </div>\n'
    '</div>\n\n    ',
    r'<div id="drivers-section"'
)

html = replace_section(html, 'drivers-section',
    '<div id="drivers-section" class="tab-content">\n'
    '  <div style="padding:10px;display:flex;gap:8px;flex-wrap:wrap;">\n'
    '    <button hx-get="/htmx/admin/drivers/?tab=confirmed" hx-target="#drivers-htmx-content" hx-swap="innerHTML"\n'
    '            style="padding:8px 14px;background:#10b981;color:white;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">&#128663; Chauffeurs</button>\n'
    '    <button hx-get="/htmx/admin/drivers/?tab=pending" hx-target="#drivers-htmx-content" hx-swap="innerHTML"\n'
    '            style="padding:8px 14px;background:#f59e0b;color:white;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">&#8987; En attente</button>\n'
    '    <button hx-get="/htmx/admin/users/" hx-target="#drivers-htmx-content" hx-swap="innerHTML"\n'
    '            style="padding:8px 14px;background:#667eea;color:white;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">&#128101; Utilisateurs</button>\n'
    '  </div>\n'
    '  <div id="drivers-htmx-content"\n'
    '       hx-get="/htmx/admin/drivers/?tab=confirmed"\n'
    '       hx-trigger="load"\n'
    '       hx-swap="innerHTML"\n'
    '       style="padding:0 10px 10px;">\n'
    '    <div style="text-align:center;padding:30px;color:#9ca3af;">Chargement...</div>\n'
    '  </div>\n'
    '</div>\n\n    ',
    r'<div id="history-section"'
)

html = replace_section(html, 'history-section',
    '<div id="history-section" class="tab-content">\n'
    '  <div id="history-htmx-content"\n'
    '       hx-get="/htmx/admin/orders/?status=completed"\n'
    '       hx-trigger="revealed"\n'
    '       hx-swap="innerHTML"\n'
    '       style="padding:12px;">\n'
    '    <div style="text-align:center;padding:30px;color:#9ca3af;">Chargement historique...</div>\n'
    '  </div>\n'
    '</div>\n\n    ',
    r'<div id="earnings-section"'
)

html = replace_section(html, 'earnings-section',
    '<div id="earnings-section" class="tab-content">\n'
    '  <div hx-get="/htmx/admin/stats/"\n'
    '       hx-trigger="revealed"\n'
    '       hx-swap="outerHTML"\n'
    '       style="padding:12px;">\n'
    '    <div style="text-align:center;padding:30px;color:#9ca3af;">Chargement revenus...</div>\n'
    '  </div>\n'
    '</div>\n\n    ',
    r'<div id="orders-section"'
)

html = replace_section(html, 'orders-section',
    '<div id="orders-section" class="tab-content">\n'
    '  <div style="overflow-x:auto;white-space:nowrap;padding:10px 12px 6px;display:flex;gap:8px;">\n'
    '    <button onclick="loadOrdersTab(\'pending\')" id="subtab-pending"\n'
    '            style="padding:8px 14px;background:linear-gradient(135deg,#f59e0b,#d97706);color:white;border:none;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;">\n'
    '      &#9201; En attente\n'
    '    </button>\n'
    '    <button onclick="loadOrdersTab(\'ongoing\')" id="subtab-ongoing"\n'
    '            style="padding:8px 14px;background:white;color:#374151;border:2px solid #e5e7eb;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;">\n'
    '      &#128663; En cours\n'
    '    </button>\n'
    '    <button onclick="loadOrdersTab(\'today\')" id="subtab-today"\n'
    '            style="padding:8px 14px;background:white;color:#374151;border:2px solid #e5e7eb;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;">\n'
    "      &#128197; Aujourd'hui\n"
    '    </button>\n'
    '    <button onclick="loadOrdersTab(\'completed\')" id="subtab-completed"\n'
    '            style="padding:8px 14px;background:white;color:#374151;border:2px solid #e5e7eb;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;">\n'
    '      &#10003; Terminees\n'
    '    </button>\n'
    '    <button onclick="loadOrdersTab(\'calendar\')" id="subtab-calendar"\n'
    '            style="padding:8px 14px;background:white;color:#374151;border:2px solid #e5e7eb;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;">\n'
    '      &#128197; Calendrier\n'
    '    </button>\n'
    '    <button onclick="loadOrdersTab(\'cancelled\')" id="subtab-cancelled"\n'
    '            style="padding:8px 14px;background:white;color:#374151;border:2px solid #e5e7eb;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;">\n'
    '      &#10060; Annulees\n'
    '    </button>\n'
    '  </div>\n'
    '  <div id="orders-htmx-loader"\n'
    '       hx-get="/htmx/admin/orders/?status=pending"\n'
    '       hx-trigger="load"\n'
    '       hx-swap="innerHTML"\n'
    '       style="padding:8px 12px;min-height:200px;">\n'
    '    <div style="text-align:center;padding:40px;color:#9ca3af;">Chargement commandes...</div>\n'
    '  </div>\n'
    '  <div id="flash-message" style="position:fixed;top:20px;right:20px;z-index:99999;"></div>\n'
    '</div>\n\n    ',
    r'<div id="assistance-section"'
)

html = replace_section(html, 'assistance-section',
    '<div id="assistance-section" class="tab-content">\n'
    '  <div style="padding:20px;text-align:center;color:#9ca3af;">\n'
    '    <div style="font-size:36px;margin-bottom:8px;">&#127911;</div>\n'
    '    <p>Section assistance</p>\n'
    '  </div>\n'
    '</div>\n\n    ',
    r'<div id="forum-section"'
)

html = replace_section(html, 'forum-section',
    '<div id="forum-section" class="tab-content">\n'
    '  <div style="padding:14px;">\n'
    '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">\n'
    '      <h3 style="font-size:15px;font-weight:700;color:#1f2937;">&#128240; Publications</h3>\n'
    '      <button onclick="document.getElementById(\'forum-create-modal\').style.display=\'flex\'"\n'
    '              style="padding:7px 14px;background:#667eea;color:white;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">+ Nouvelle</button>\n'
    '    </div>\n'
    '    <div id="forum-htmx-content"\n'
    '         hx-get="/htmx/forum/"\n'
    '         hx-trigger="revealed"\n'
    '         hx-swap="innerHTML">\n'
    '      <div style="text-align:center;padding:30px;color:#9ca3af;">Chargement...</div>\n'
    '    </div>\n'
    '  </div>\n'
    '  <div id="forum-create-modal"\n'
    '       style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;align-items:center;justify-content:center;padding:20px;">\n'
    '    <div style="background:white;border-radius:16px;width:100%;max-width:480px;padding:24px;">\n'
    '      <div style="display:flex;justify-content:space-between;margin-bottom:14px;">\n'
    '        <h3 style="font-weight:700;">&#128240; Nouvelle publication</h3>\n'
    '        <button onclick="document.getElementById(\'forum-create-modal\').style.display=\'none\'"\n'
    '                style="background:#f3f4f6;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;">&#x2715;</button>\n'
    '      </div>\n'
    '      <form hx-post="/htmx/forum/create/"\n'
    '            hx-target="#forum-htmx-content"\n'
    '            hx-swap="innerHTML"\n'
    '            hx-on::after-request="document.getElementById(\'forum-create-modal\').style.display=\'none\';this.reset();">\n'
    '        <input type="text" name="title" placeholder="Titre..." required\n'
    '               style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;margin-bottom:10px;outline:none;box-sizing:border-box;">\n'
    '        <textarea name="content" rows="4" placeholder="Contenu..."\n'
    '                  style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;margin-bottom:10px;outline:none;box-sizing:border-box;resize:vertical;"></textarea>\n'
    '        <button type="submit"\n'
    '                style="width:100%;padding:11px;background:#667eea;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">Publier</button>\n'
    '      </form>\n'
    '    </div>\n'
    '  </div>\n'
    '</div>\n\n    ',
    r'<div class="tab-bar'
)


html = re.sub(
    r'<button id="admin-login-btn"[^>]*>([\s\S]*?)</button>',
    '<button id="admin-login-btn"\n'
    '                    hx-post="/htmx/admin/login/"\n'
    '                    hx-include="[name=password]"\n'
    '                    hx-target="body"\n'
    '                    hx-swap="innerHTML"\n'
    '                    class="group w-full bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 text-white px-6 py-4 rounded-xl font-bold text-lg shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50 transition-all duration-300 hover:scale-105 flex items-center justify-center gap-3">\n'
    '                    <span>Se connecter</span>\n'
    '                    <i class="fas fa-arrow-right group-hover:translate-x-1 transition-transform"></i>\n'
    '                </button>',
    html, count=1
)
print("Login button updated")


html = re.sub(
    r'<input type="password" id="admin-password"(?! name=)',
    '<input type="password" id="admin-password" name="password"',
    html
)


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
