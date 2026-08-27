import os
import re

def vivid_neon_route_patch():
    
    v_path = 'vubez2.html'
    if os.path.exists(v_path):
        with open(v_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        
        neon_css_revert = """
          .car-el {
              width: 46px; height: 46px;
              filter: drop-shadow(0 0 10px rgba(99,179,237,0.9));
          }
          .dx-neon-text {
              color: #ffffff;
              font-weight: 900;
              text-shadow: 0 2px 10px rgba(0,0,0,0.5);
              font-size: 16px;
              letter-spacing: 2px;
          }
          .dx-neon-stats {
              color: #ffffff;
              font-weight: 900;
              text-shadow: 0 2px 10px rgba(0,0,0,0.5);
          }"""
        content = re.sub(r'\.car-el \{.*?\}', neon_css_revert, content, flags=re.DOTALL)
        
        
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
    // Hyper-vivid colors: Magenta for trip, Electric Yellow for driver
    const neonColor = isDriver ? '#ffff00' : '#ff00ff'; 

    // Layer 0: Background Fog (Extremely wide)
    map.addSource('glow3-' + id, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } });
    map.addLayer({
        id: 'glow3-layer-' + id, type: 'line', source: 'glow3-' + id,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': neonColor, 'line-width': 50, 'line-opacity': 0.08, 'line-blur': 30 }
    });

    // Layer 1: Wide Glow
    map.addSource('glow2-' + id, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } });
    map.addLayer({
        id: 'glow2-layer-' + id, type: 'line', source: 'glow2-' + id,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': neonColor, 'line-width': 22, 'line-opacity': 0.3, 'line-blur': 15 }
    });

    // Layer 2: Intense Inner Glow
    map.addSource('glow1-' + id, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } });
    map.addLayer({
        id: 'glow1-layer-' + id, type: 'line', source: 'glow1-' + id,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': neonColor, 'line-width': 12, 'line-opacity': 0.9, 'line-blur': 4 }
    });

    // Layer 3: White filament core (The "Gas" tube)
    map.addSource('route-' + id, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } });
    map.addLayer({
        id: 'route-layer-' + id, type: 'line', source: 'route-' + id,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 3, 'line-opacity': 1.0 }
    });
}"""
        content = re.sub(r'function _daxiAddRoute\(map, id, path, color\) \{.*?\}', new_func, content, flags=re.DOTALL)
        
        with open(v_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print("Patched vubez2.html with Hyper Vivid Route")

    
    c_path = 'julmin_taxis_django/templates/htmx/client_orders.html'
    if os.path.exists(c_path):
        with open(c_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        
        content = content.replace('<span class="dx-neon-text">ITINERAIRE DAXI</span>', 'ITINÉRAIRE DAXI')
        
        with open(c_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print("Patched client_orders.html (text cleanup)")

vivid_neon_route_patch()
