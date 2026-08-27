import re
import codecs

file_path = 'vubez2.html'
with codecs.open(file_path, 'r', 'utf-8') as f:
    content = f.read()

svg_code = """const ARROW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 46 46" width="46" height="46">
  <defs>
    <linearGradient id="arrowBody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f8fbff"/>
      <stop offset="42%" stop-color="#93c5fd"/>
      <stop offset="100%" stop-color="#3b82f6"/>
    </linearGradient>
    <linearGradient id="arrowSide" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#60a5fa"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>
  <ellipse cx="23" cy="41.5" rx="11.5" ry="2.9" fill="rgba(15,23,42,0.24)"/>
  <path d="M23 3 L38.7 37.2 L23 31.2 L7.3 37.2 Z" fill="url(#arrowBody)" stroke="#dbeafe" stroke-width="1.2"/>
  <path d="M23 7.8 L33.9 31.8 L23 27.7 Z" fill="rgba(255,255,255,0.54)"/>
  <path d="M23 7.8 L12.1 31.8 L23 27.7 Z" fill="url(#arrowSide)"/>
  <path d="M23 34 L30.4 37 L23 43 L15.6 37 Z" fill="#1e40af" opacity="0.88"/>
  <circle cx="23" cy="23.4" r="2.1" fill="#ffffff" opacity="0.8"/>
</svg>`;

function _daxiEnsureCarLayer(inst, lng, lat) {
    if (!inst.map.hasImage('car-icon')) {
        inst.map.loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ARROW_SVG), (err, image) => {
            if (!err) {
                inst.map.addImage('car-icon', image);
                _daxiAddCarLayer(inst, lng, lat);
            }
        });
    } else {
        _daxiAddCarLayer(inst, lng, lat);
    }
}

function _daxiAddCarLayer(inst, lng, lat) {
    if (inst.map.getSource('car-source-' + inst.id)) return;
    inst.map.addSource('car-source-' + inst.id, {
        type: 'geojson',
        data: {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [lng, lat] },
            properties: { bearing: 0 }
        }
    });
    inst.map.addLayer({
        id: 'car-layer-' + inst.id,
        type: 'symbol',
        source: 'car-source-' + inst.id,
        layout: {
            'icon-image': 'car-icon',
            'icon-size': 1.0,
            'icon-rotate': ['get', 'bearing'],
            'icon-rotation-alignment': 'map',
            'icon-pitch-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true
        }
    });
}
"""

content = content.replace('function makeCarEl() {', svg_code + '\\nfunction makeCarEl() {')

cm_regex = r"if\s*\(cM\)\s*\{\s*cM\.setLngLat\(_daxiSafeLL\(inst\.currentPos\)\);\s*//.*?cM\.setRotation\(inst\.sBear\);\s*\}\s*\}"
new_cm_logic = """if (inst.map.getSource('car-source-' + id)) {
                    let finalCarRotation = inst.sBear;
                    if (window._hasDeviceOrientation && inst.isFollowing && !inst.isIntro) {
                        finalCarRotation = window._userHeading;
                    }
                    inst.map.getSource('car-source-' + id).setData({
                        type: 'Feature',
                        geometry: {
                            type: 'Point',
                            coordinates: _daxiSafeLL(inst.currentPos)
                        },
                        properties: {
                            bearing: finalCarRotation
                        }
                    });
                }"""
content = re.sub(cm_regex, new_cm_logic, content, flags=re.DOTALL)

init_regex = r"var\s*carEl\s*=\s*makeCarEl\(\);\s*var\s*cM\s*=\s*new\s*mapboxgl\.Marker\(\{\s*element:\s*carEl,\s*rotationAlignment:\s*'viewport',\s*pitchAlignment:\s*'viewport'\s*\}\)\.setLngLat\(\[startLng,\s*startLat\]\)\.addTo\(map\);\s*cM\._isCar\s*=\s*true;\s*inst\.markers\.push\(cM\);"
content = re.sub(init_regex, "_daxiEnsureCarLayer(inst, startLng, startLat);", content, flags=re.DOTALL)

refresh_regex = r"cM\s*=\s*new\s*mapboxgl\.Marker\(\{\s*element:\s*makeCarEl\(\),\s*rotationAlignment:\s*'viewport',\s*pitchAlignment:\s*'viewport'\s*\}\)\.setLngLat\(\[dLng,\s*dLat\]\)\.addTo\(inst\.map\);\s*cM\._isCar\s*=\s*true;\s*inst\.markers\.push\(cM\);"
content = re.sub(refresh_regex, "_daxiEnsureCarLayer(inst, dLng, dLat);", content, flags=re.DOTALL)

refresh_if_regex = r"if\s*\(cM\)\s*\{\s*inst\.targetPos\s*=\s*\[dLng,\s*dLat\];"
content = re.sub(refresh_if_regex, "if (inst.map.getSource('car-source-' + id)) {\\n            inst.targetPos = [dLng, dLat];", content, flags=re.DOTALL)

with codecs.open(file_path, 'w', 'utf-8') as f:
    f.write(content)
print('Done patching vubez2.html')
