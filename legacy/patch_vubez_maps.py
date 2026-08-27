import re

with open('vubez2.html', 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = "// DAXI — Carte premium style Uber/Bolt"
end_marker = "window.addEventListener('load', () => {"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print("Markers not found")
    exit(1)

new_script = """// DAXI — Carte premium style Uber/Bolt  (Google Maps 3D WebGL)
// ════════════════════════════════════════════════════════════════════════════
var _daxiMaps = {}; // Instances
var _dirService = null;

const DAXI_NAV_CFG = {
    introMs: 4000,
    drivePitch: 65,
    camSmooth: 0.105,
    zoomSmooth: 0.085,
    bearSmooth: 0.09,
    posSmooth: 0.1,
    driveZoomDefault: 18.5,
    driveZoomMin: 13.2,
    driveZoomMax: 20.0,
    lookAhead: 0.00092,
    enterDriveMs: 2200
};

// ── Helpers Mathématiques
const lerp = (a, b, t) => a + (b - a) * t;
const _toRad = d => d * Math.PI / 180;
const _toDeg = r => r * 180 / Math.PI;
function _calcBearing(a, b) {
    const lat1 = _toRad(a[1]), lat2 = _toRad(b[1]);
    const dLng = _toRad(b[0] - a[0]);
    const y = Math.sin(dLng) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return (_toDeg(Math.atan2(y, x)) + 360) % 360;
}
function _lerpBear(a, b, t) {
    return (a + (((b - a + 540) % 360) - 180) * t + 360) % 360;
}
function _lookAheadPt(p, bearDeg, off) {
    const r = _toRad(bearDeg);
    return [p[0] + Math.sin(r) * off, p[1] + Math.cos(r) * off];
}

// ── Format coord: String "19,75" -> Number 19.75
function _df(v) {
    if (v === undefined || v === null || v === '' || v === 'None' || v === 'NaN') return 0;
    var n = parseFloat(String(v).replace(',', '.'));
    return (typeof n === 'number' && !isNaN(n) && isFinite(n)) ? n : 0;
}
function _daxiSafeLL(ll) {
    if (!ll) return [-72.333, 18.533];
    var lng = 0, lat = 0;
    if (Array.isArray(ll)) { lng = ll[0]; lat = ll[1]; }
    else { lng = ll.lng; lat = ll.lat; }
    lng = parseFloat(lng);
    lat = parseFloat(lat);
    return [isFinite(lng) && lng !== 0 ? lng : -72.333, isFinite(lat) && lat !== 0 ? lat : 18.533];
}

// ── Google Maps MapOverlay Class (Pour icônes HTML)
class MapOverlay extends google.maps.OverlayView {
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
}

// ── 3D Markers ──
function _daxiDriver3D(lat, lng, map, img) {
    if (!isFinite(lat) || !isFinite(lng) || lat === 0) return null;
    var el = document.createElement('div');
    el.style.cssText = 'position:relative;width:52px;height:52px;transform-origin:center center;will-change:transform;pointer-events:none;';
    var ring = document.createElement('div');
    ring.style.cssText = 'position:absolute;inset:-6px;border-radius:50%;border:2px solid rgba(16,185,129,0.5);animation:daxiSpin 3s linear infinite;';
    var circle = document.createElement('div');
    circle.style.cssText = [
        'position:absolute;inset:0;border-radius:50%;',
        'border:3px solid #10b981;',
        'box-shadow:0 0 0 3px rgba(16,185,129,0.25), 0 0 18px rgba(16,185,129,0.6), 0 4px 12px rgba(0,0,0,0.5);',
        img ? 'background:url('+img+') center/cover no-repeat;' : 'background:linear-gradient(135deg,#059669,#10b981);',
        'display:flex;align-items:center;justify-content:center;'
    ].join('');
    if (!img) circle.innerHTML = '<span style="font-size:22px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));">🚕</span>';
    el.appendChild(ring);
    el.appendChild(circle);
    const overlay = new MapOverlay({ lat, lng }, el);
    overlay.setMap(map);
    overlay._el = el;
    return overlay;
}

function _daxiMe3D(lat, lng, map, img) {
    if (!isFinite(lat) || !isFinite(lng) || lat === 0) return null;
    var el = document.createElement('div');
    el.style.cssText = 'position:relative;width:46px;height:46px;transform-origin:center center;pointer-events:none;';
    var pulse = document.createElement('div');
    pulse.style.cssText = 'position:absolute;inset:-8px;border-radius:50%;background:rgba(59,130,246,0.2);animation:daxiSpin 4s linear infinite reverse;';
    var circle = document.createElement('div');
    circle.style.cssText = [
        'position:absolute;inset:0;border-radius:50%;',
        'border:3px solid #3b82f6;',
        'box-shadow:0 0 0 3px rgba(59,130,246,0.2), 0 0 16px rgba(59,130,246,0.7), 0 4px 10px rgba(0,0,0,0.5);',
        img ? 'background:url('+img+') center/cover no-repeat;' : 'background:linear-gradient(135deg,#1d4ed8,#3b82f6);',
        'display:flex;align-items:center;justify-content:center;'
    ].join('');
    if (!img) circle.innerHTML = '<span style="font-size:20px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.6));">👤</span>';
    el.appendChild(pulse);
    el.appendChild(circle);
    const overlay = new MapOverlay({ lat, lng }, el);
    overlay.setMap(map);
    return overlay;
}

function _daxiDest3D(lat, lng, map, markerId) {
    if (!isFinite(lat) || !isFinite(lng) || lat === 0) return null;
    var uid = markerId || ('dest' + Math.random().toString(36).slice(2, 7));
    var el = document.createElement('div');
    el.style.cssText = 'position:relative;width:36px;height:50px;transform:translate(-50%, -100%);pointer-events:none;';
    el.innerHTML = `
      <svg width="36" height="50" viewBox="0 0 36 50" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="pinGrad-${uid}" cx="40%" cy="35%" r="60%">
            <stop offset="0%" stop-color="#f87171"/>
            <stop offset="100%" stop-color="#b91c1c"/>
          </radialGradient>
        </defs>
        <path d="M18 2 C9.163 2 2 9.163 2 18 C2 29 18 48 18 48 C18 48 34 29 34 18 C34 9.163 26.837 2 18 2 Z"
              fill="url(#pinGrad-${uid})" />
        <circle cx="18" cy="18" r="7" fill="rgba(255,255,255,0.9)"/>
        <circle cx="18" cy="18" r="3.5" fill="#ef4444"/>
      </svg>`;
    const overlay = new MapOverlay({ lat, lng }, el);
    overlay.setMap(map);
    return overlay;
}

// ── Fetch Route using Google Maps ──
function _fetchRoute(lng1, lat1, lng2, lat2) {
    return new Promise(resolve => {
        if (!_dirService) _dirService = new google.maps.DirectionsService();
        _dirService.route({
            origin:      { lat: lat1, lng: lng1 },
            destination: { lat: lat2, lng: lng2 },
            travelMode:  google.maps.TravelMode.DRIVING,
        }, (result, status) => {
            if (status !== 'OK' || !result || !result.routes || !result.routes[0]) {
                resolve(null); return; 
            }
            const path = result.routes[0].overview_path;
            if (!path || path.length < 2) { resolve(null); return; }
            resolve(path.map(p => new google.maps.LatLng(p.lat(), p.lng())));
        });
    });
}

function _daxiHUD(id, hasDest, hasDriver, dist, dur, eta) { }

// ── Google Maps Engine Init ──
function initDaxiMaps3D() {
    if (!window.google || !window.google.maps) return;

    document.querySelectorAll('[data-daximap="1"]:not([data-map-ready])').forEach(async function(el) {
        el.dataset.mapReady = '1';
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.8s ease';

        var id  = el.id.replace('daximap-', '');
        var pLa = _df(el.dataset.pickupLat), pLo = _df(el.dataset.pickupLng);
        var dLa = _df(el.dataset.destLat),   dLo = _df(el.dataset.destLng);
        var vLa = _df(el.dataset.driverLat), vLo = _df(el.dataset.driverLng); 
        var dImg = el.dataset.driverImg, uImg = el.dataset.userImg;
        var hasDest = !!(dLa && dLo);
        var hasDriver = !!(vLa && vLo);

        const center = _daxiSafeLL([pLo, pLa]);
        if (!isFinite(center[0])) center[0] = -72.333;
        if (!isFinite(center[1])) center[1] = 18.533;

        el.innerHTML = ''; 

        // Initialisation de la carte WebGL 3D
        var map = new google.maps.Map(el, {
            center: { lat: center[1], lng: center[0] },
            zoom: DAXI_NAV_CFG.driveZoomDefault,
            pitch: 0,
            heading: 0,
            disableDefaultUI: true,
            gestureHandling: 'greedy',
            mapId: 'c4948b020bfc08331f1cb94e', // Carte Daxi
            colorScheme: google.maps.ColorScheme.DARK,
            tiltInteractionEnabled: true,
            headingInteractionEnabled: true
        });

        // Setup des Polylines
        const _pickupPolyGlow = new google.maps.Polyline({
            path: [], strokeColor: '#7e22ce', strokeWeight: 14, zIndex: 6
        });
        const _pickupPoly = new google.maps.Polyline({
            path: [], strokeColor: '#a855f7', strokeWeight: 6, zIndex: 7
        });
        const _tripPolyGlow = new google.maps.Polyline({
            path: [], strokeColor: '#065f46', strokeWeight: 14, zIndex: 4
        });
        const _tripPoly = new google.maps.Polyline({
            path: [], strokeColor: '#34d399', strokeWeight: 6, zIndex: 5
        });

        var inst = { 
            map: map, 
            id: id,
            targetPos: [center[0], center[1]],
            currentPos: [center[0], center[1]],
            sBear: 0,
            camC: [center[0], center[1]],
            camB: 0,
            isFollowing: false,
            isIntro: true,
            lastT: 0,
            driverMarker: null,
            userMarker: null,
            destMarker: null,
            _interpFrom: [center[0], center[1]],
            _interpTo:   [center[0], center[1]],
            _interpStart: 0,
            _interpDur: 2000
        };
        _daxiMaps[id] = inst;

        const statusAttr = el.dataset.orderStatus || '';
        const caseA = hasDriver && (statusAttr === 'driver_assigned' || statusAttr === 'on_way' || statusAttr === 'arrived' || statusAttr === 'in_progress');

        // ── Observers pour mise à jour en temps réel ──
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes') {
                    if (mutation.attributeName === 'data-driver-lat' || mutation.attributeName === 'data-driver-lng') {
                        var newVLa = _df(el.dataset.driverLat), newVLo = _df(el.dataset.driverLng);
                        if (isFinite(newVLa) && isFinite(newVLo) && newVLa !== 0) {
                            inst._interpFrom = [...inst.currentPos];
                            inst._interpTo = [newVLo, newVLa];
                            inst.targetPos = [newVLo, newVLa];
                            inst._interpStart = performance.now();
                            // Update routing dynamically
                            if (caseA && pLa && pLo) {
                                _fetchRoute(newVLo, newVLa, pLo, pLa).then(path1 => {
                                    if (path1) { _pickupPoly.setPath(path1); _pickupPolyGlow.setPath(path1); }
                                });
                            }
                        }
                    }
                }
            });
        });
        observer.observe(el, { attributes: true });

        // Initial Markers
        inst.userMarker = _daxiMe3D(pLa, pLo, map, uImg);
        
        if (caseA) {
            inst.driverMarker = _daxiDriver3D(vLa, vLo, map, dImg);
            inst.currentPos = [vLo, vLa];
            inst.targetPos  = [vLo, vLa];
            inst.camC       = [vLo, vLa];
            inst._interpFrom = [vLo, vLa];
            inst._interpTo = [vLo, vLa];
        } else if (hasDest) {
            inst.destMarker = _daxiDest3D(dLa, dLo, map, id);
        }

        // Fetch Routes
        if (caseA && pLa && pLo) {
            const path1 = await _fetchRoute(vLo, vLa, pLo, pLa);
            if (path1) {
                _pickupPoly.setPath(path1);
                _pickupPolyGlow.setPath(path1);
                _pickupPoly.setMap(map);
                _pickupPolyGlow.setMap(map);
            }
        }
        if (hasDest && pLa && pLo) {
            const path2 = await _fetchRoute(pLo, pLa, dLo, dLa);
            if (path2) {
                _tripPoly.setPath(path2);
                _tripPolyGlow.setPath(path2);
                if (!caseA) {
                    _tripPoly.setMap(map);
                    _tripPolyGlow.setMap(map);
                }
            }
        }

        // ── Motion Animation Loop ──
        function frame(ts) {
            const dt = inst.lastT ? Math.min((ts - inst.lastT) / 16.67, 3) : 1;
            inst.lastT = ts;

            if (inst._interpStart > 0 && caseA) {
                const elapsed = performance.now() - inst._interpStart;
                const t = Math.min(elapsed / inst._interpDur, 1);
                const eased = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
                inst.currentPos[0] = inst._interpFrom[0] + (inst._interpTo[0] - inst._interpFrom[0]) * eased;
                inst.currentPos[1] = inst._interpFrom[1] + (inst._interpTo[1] - inst._interpFrom[1]) * eased;
            }

            if (caseA && inst.driverMarker) {
                const dx = inst._interpTo[0] - inst._interpFrom[0];
                const dy = inst._interpTo[1] - inst._interpFrom[1];
                let targetBear = inst.sBear;
                if (Math.abs(dx) + Math.abs(dy) > 1e-8) {
                    targetBear = _calcBearing(inst._interpFrom, inst._interpTo);
                }
                inst.sBear = _lerpBear(inst.sBear, targetBear, DAXI_NAV_CFG.bearSmooth * dt);
                
                inst.driverMarker.setPosition({ lat: inst.currentPos[1], lng: inst.currentPos[0] });
                if (inst.driverMarker._el) {
                    inst.driverMarker._el.style.transform = inst.isFollowing 
                        ? `rotateX(${DAXI_NAV_CFG.drivePitch}deg)` 
                        : `rotateZ(${inst.sBear}deg)`;
                }
            }

            if (inst.isFollowing && !inst.isIntro && caseA) {
                const focal = _lookAheadPt(inst.currentPos, inst.sBear, DAXI_NAV_CFG.lookAhead);
                inst.camC[0] = lerp(inst.camC[0], focal[0], DAXI_NAV_CFG.camSmooth * dt);
                inst.camC[1] = lerp(inst.camC[1], focal[1], DAXI_NAV_CFG.camSmooth * dt);
                const safeCamB = (window._hasDeviceOrientation) ? window._userHeading : inst.sBear;
                inst.camB = _lerpBear(inst.camB, safeCamB, DAXI_NAV_CFG.camSmooth * dt);

                map.moveCamera({
                    center: { lat: inst.camC[1], lng: inst.camC[0] },
                    heading: inst.camB,
                    tilt: DAXI_NAV_CFG.drivePitch
                });
            }

            requestAnimationFrame(frame);
        }
        
        google.maps.event.addListenerOnce(map, 'idle', () => {
            requestAnimationFrame(frame);
            el.style.opacity = '1';
            
            // Intro sequence: Fit bounds to all markers, then wait
            const bounds = new google.maps.LatLngBounds();
            bounds.extend({ lat: pLa, lng: pLo });
            if (caseA) bounds.extend({ lat: inst.currentPos[1], lng: inst.currentPos[0] });
            if (hasDest) bounds.extend({ lat: dLa, lng: dLo });
            
            map.fitBounds(bounds, { padding: 50 });
            
            // Interaction logic
            const stopFollow = () => {
                if (inst.isFollowing && !inst.isIntro) {
                    inst.isFollowing = false;
                    const btn = document.getElementById('daximap-recenter-' + id);
                    if (btn) btn.style.display = 'flex';
                }
            };
            map.addListener('dragstart', stopFollow);

            inst.doEnterDrive = () => {
                if (inst.introExitScheduled) return;
                inst.introExitScheduled = true;
                const intro = document.getElementById('daximap-intro-' + id);
                if (intro) { intro.style.transition = 'opacity 0.6s ease'; intro.style.opacity = '0'; setTimeout(()=>intro.style.display='none',600); }
                
                inst.isIntro = false;
                if (caseA) {
                    inst.isFollowing = true;
                    map.setOptions({ padding: { bottom: el.offsetHeight * 0.4 } });
                } else {
                    map.fitBounds(bounds, { padding: 80 });
                }
            };

            const vBtn = document.getElementById('daximap-see-btn-' + id);
            if (vBtn) {
                vBtn.onclick = () => {
                    vBtn.style.display = 'none';
                    inst.doEnterDrive();
                };
            } else {
                setTimeout(() => inst.doEnterDrive(), 2000);
            }
        });
    });
}
"""

with open('vubez2.html', 'w', encoding='utf-8') as f:
    f.write(content[:start_idx] + new_script + '\n' + content[end_idx:])

print("Patch applied successfully.")
