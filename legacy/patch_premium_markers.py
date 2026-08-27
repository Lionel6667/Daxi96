import os
import re

def patch_vubez2():
    path = 'vubez2.html'
    if not os.path.exists(path): return
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    
    content = re.sub(r'function _daxiMe3D\(lat, lng, map\) \{.*?\}', """function _daxiMe3D(lat, lng, map, img) {
    if (!isFinite(lat) || !isFinite(lng) || lat === 0) return null;
    var el = document.createElement('div');
    el.style.width = '42px'; el.style.height = '42px';
    el.style.borderRadius = '50%'; el.style.border = '3px solid #3b82f6';
    el.style.boxShadow = '0 0 15px rgba(59,130,246,0.6)';
    el.style.background = img ? 'url('+img+') center/cover no-repeat' : '#60a5fa';
    if (!img) el.innerHTML = '<div style="color:white; font-size:20px; font-weight:900; display:flex; align-items:center; justify-content:center; height:100%;">👤</div>';
    var marker = new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
    marker._isUser = true;
    return marker;
}""", content, flags=re.DOTALL)

    content = re.sub(r'function _daxiDest3D\(lat, lng, map\) \{.*?\}', """function _daxiDest3D(lat, lng, map) {
    if (!isFinite(lat) || !isFinite(lng) || lat === 0) return null;
    var el = document.createElement('div');
    el.innerHTML = '<div style="background:#ef4444; width:32px; height:32px; border-radius:50%; border:3px solid white; box-shadow:0 0 20px rgba(239,68,68,0.7); display:flex; align-items:center; justify-content:center; font-size:18px;">📍</div>';
    var marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map);
    marker._isDest = true;
    return marker;
}""", content, flags=re.DOTALL)

    
    if 'function _daxiDriver3D' not in content:
        content = content.replace('// ── 3D Moi Marker', """function _daxiDriver3D(lat, lng, map, img) {
    if (!isFinite(lat) || !isFinite(lng) || lat === 0) return null;
    var el = document.createElement('div');
    el.style.width = '46px'; el.style.height = '46px';
    el.style.borderRadius = '50%'; el.style.border = '3px solid #10b981';
    el.style.boxShadow = '0 0 20px rgba(16,185,129,0.8)';
    el.style.background = img ? 'url('+img+') center/cover no-repeat' : '#10b981';
    if (!img) el.innerHTML = '<div style="color:white; font-size:22px; font-weight:900; display:flex; align-items:center; justify-content:center; height:100%;">🚕</div>';
    var marker = new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
    marker._isDriver = true;
    return marker;
}

// ── 3D Moi Marker""", 1)

    
    content = content.replace("line-color': color === '#facc15' ? '#ca8a04' : '#6d28d9'", "line-color': color === '#facc15' ? '#fbbf24' : '#8b5cf6'")
    content = content.replace("line-color': color === '#facc15' ? '#eab308' : '#8b5cf6'", "line-color': color === '#facc15' ? '#fde047' : '#a78bfa'")
    content = content.replace("line-color': color === '#facc15' ? '#fde047' : '#a78bfa'", "line-color': color === '#facc15' ? '#ffffff' : '#c4b5fd'")

    
    tracking_code = """
function daxiStartTracking(id) {
    const inst = _daxiMaps[id];
    if (!inst) return;
    if (inst._trackingInterval) clearInterval(inst._trackingInterval);
    
    inst._trackingInterval = setInterval(() => {
        // Polling order status to get latest driver coords
        fetch('/htmx/client/orders/' + id + '/status/')
        .then(r => r.json())
        .then(data => {
            if (data.driver_lat && data.driver_lng) {
                const nLat = parseFloat(data.driver_lat);
                const nLng = parseFloat(data.driver_lng);
                if (isFinite(nLat) && isFinite(nLng)) {
                    inst.targetPos = [nLng, nLat];
                    if (data.dist) {
                        const eD = document.getElementById('dxi-dist-'+id); if(eD) eD.innerText = data.dist;
                    }
                    if (data.dur) {
                        const eT = document.getElementById('dxi-dur-'+id); if(eT) eT.innerText = data.dur;
                    }
                }
            }
        }).catch(e => console.error("Tracking Error:", e));
    }, 4500);
}
"""
    if 'function daxiStartTracking' not in content:
        content = content.replace('// ── Hooks HTMX', tracking_code + '\n// ── Hooks HTMX')

    
    content = content.replace("var vLa = _df(el.dataset.driverLat), vLo = _df(el.dataset.driverLng);", 
                              "var vLa = _df(el.dataset.driverLat), vLo = _df(el.dataset.driverLng); var dImg = el.dataset.driverImg, uImg = el.dataset.userImg;")
    
    content = content.replace("if (hasDest) inst.markers.push(_daxiDest3D(dLa, dLo, map));", 
                              "if (hasDest) inst.markers.push(_daxiDest3D(dLa, dLo, map)); inst.markers.push(_daxiMe3D(pLa, pLo, map, uImg));")
    
    
    
    
    
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patched vubez2.html with Premium Markers and Tracking")

patch_vubez2()
