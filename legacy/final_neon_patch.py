import os
import re

def final_neon_patch():
    
    v_path = 'vubez2.html'
    if os.path.exists(v_path):
        with open(v_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        
        neon_css = """
          .car-el {
              width: 46px; height: 46px;
              filter: drop-shadow(0 0 10px rgba(99,179,237,0.9))
                      drop-shadow(0 0 20px rgba(59,130,246,0.5));
          }
          .dx-neon-text {
              color: #ffffff !important;
              text-shadow: 0 0 5px #fff, 0 0 10px #fff, 0 0 20px #00ffff, 0 0 30px #00ffff !important;
          }
          .dx-neon-stats {
              color: #ffffff !important;
              text-shadow: 0 0 10px #00ffff, 0 0 20px #00ffff !important;
          }"""
        content = re.sub(r'\.car-el \{.*?\}', neon_css, content, flags=re.DOTALL)
        
        
        new_func = """function _daxiAddRoute(map, id, path, color) {
    if (!path || !path.length) return;
    const coords = path.map(pt => [pt.lng, pt.lat]);

    if (map.getSource('route-' + id)) {
        map.getSource('route-' + id).setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } });
        if (map.getSource('glow1-' + id)) map.getSource('glow1-' + id).setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } });
        if (map.getSource('glow2-' + id)) map.getSource('glow2-' + id).setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } });
        if (map.getSource('glow3-' + id)) map.getSource('glow3-' + id).setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } });
        return;
    }
    
    const isDriver = (color === '#facc15');
    const neonColor = isDriver ? '#fde047' : '#00ffff'; 

    map.addSource('glow3-' + id, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } });
    map.addLayer({
        id: 'glow3-layer-' + id, type: 'line', source: 'glow3-' + id,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': neonColor, 'line-width': 45, 'line-opacity': 0.12, 'line-blur': 25 }
    });

    map.addSource('glow2-' + id, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } });
    map.addLayer({
        id: 'glow2-layer-' + id, type: 'line', source: 'glow2-' + id,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': neonColor, 'line-width': 20, 'line-opacity': 0.4, 'line-blur': 12 }
    });

    map.addSource('glow1-' + id, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } });
    map.addLayer({
        id: 'glow1-layer-' + id, type: 'line', source: 'glow1-' + id,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': neonColor, 'line-width': 10, 'line-opacity': 0.8, 'line-blur': 3 }
    });

    map.addSource('route-' + id, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } });
    map.addLayer({
        id: 'route-layer-' + id, type: 'line', source: 'route-' + id,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 1.0 }
    });
}"""
        content = re.sub(r'function _daxiAddRoute\(map, id, path, color\) \{.*?\}', new_func, content, flags=re.DOTALL)
        
        with open(v_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print("Patched vubez2.html with Hyper Neon")

    
    c_path = 'julmin_taxis_django/templates/htmx/client_orders.html'
    if os.path.exists(c_path):
        with open(c_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        
        content = content.replace('color:#ffffff; font-weight:900;', 'font-weight:900; text-shadow:none;') 
        content = content.replace('Itinéraire Daxi', '<span class="dx-neon-text">ITINERAIRE DAXI</span>')
        content = content.replace('class="dx-val-dist">', 'class="dx-val-dist dx-neon-stats">')
        content = content.replace('class="dx-val-dur">', 'class="dx-val-dur dx-neon-stats">')
        
        with open(c_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print("Patched client_orders.html with Neon classes")

final_neon_patch()
