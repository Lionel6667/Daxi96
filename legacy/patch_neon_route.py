import os
import re

def patch_vubez2_luminous():
    path = 'vubez2.html'
    if not os.path.exists(path): return
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    
    content = content.replace('introMinZoom: 12.5,', 'introMinZoom: 15.2,')
    content = content.replace('introAerialPadding: 60,', 'introAerialPadding: 30,')

    
    
    new_route_func = """function _daxiAddRoute(map, id, path, color) {
    if (map.getSource('route-' + id)) {
        map.getSource('route-' + id).setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: path } });
        if (map.getSource('glow-' + id)) map.getSource('glow-' + id).setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: path } });
        return;
    }
    
    // Glow Layer (Neon effect)
    map.addSource('glow-' + id, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: path } } });
    map.addLayer({
        id: 'glow-layer-' + id, type: 'line', source: 'glow-' + id,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
            'line-color': color === '#facc15' ? '#fbbf24' : '#00f2ff',
            'line-width': 12,
            'line-opacity': 0.4,
            'line-blur': 8
        }
    });

    // Main Route Layer (Bright white/cyan)
    map.addSource('route-' + id, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: path } } });
    map.addLayer({
        id: 'route-layer-' + id, type: 'line', source: 'route-' + id,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
            'line-color': '#ffffff',
            'line-width': 5,
            'line-opacity': 0.95
        }
    });
}"""
    content = re.sub(r'function _daxiAddRoute\(map, id, path, color\) \{.*?\}', new_route_func, content, flags=re.DOTALL)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patched vubez2.html with Neon Route and Higher Zoom")

patch_vubez2_luminous()
