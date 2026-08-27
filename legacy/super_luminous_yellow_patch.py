import os

def super_luminous_yellow_patch():
    path = 'vubez2.html'
    if not os.path.exists(path): return
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    start_tag = 'function _daxiAddRoute(map, id, path, color)'
    end_tag = '// ── Math Helpers for Waze Engine'
    
    start_idx = content.find(start_tag)
    end_idx = content.find(end_tag)
    
    if start_idx == -1 or end_idx == -1:
        print("Tags not found")
        return

    correct_func = """function _daxiAddRoute(map, id, path, color) {
    if (!path || !path.length) return;
    const coords = path.map(pt => [pt.lng, pt.lat]);

    if (map.getSource('route-' + id)) {
        map.getSource('route-' + id).setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } });
        if (map.getSource('glow1-' + id)) map.getSource('glow1-' + id).setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } });
        if (map.getSource('glow2-' + id)) map.getSource('glow2-' + id).setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } });
        if (map.getSource('glow3-' + id)) map.getSource('glow3-' + id).setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } });
        return;
    }
    
    // Super Luminous Neon Yellow
    const neonColor = '#ffff00'; 

    map.addSource('glow3-' + id, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } });
    map.addLayer({
        id: 'glow3-layer-' + id, type: 'line', source: 'glow3-' + id,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 
            'line-color': neonColor, 
            'line-width': 60, 
            'line-opacity': 0.15, 
            'line-blur': 35
        }
    });

    map.addSource('glow2-' + id, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } });
    map.addLayer({
        id: 'glow2-layer-' + id, type: 'line', source: 'glow2-' + id,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 
            'line-color': neonColor, 
            'line-width': 28, 
            'line-opacity': 0.5, 
            'line-blur': 18
        }
    });

    map.addSource('glow1-' + id, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } });
    map.addLayer({
        id: 'glow1-layer-' + id, type: 'line', source: 'glow1-' + id,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 
            'line-color': neonColor, 
            'line-width': 14, 
            'line-opacity': 1.0, 
            'line-blur': 5
        }
    });

    map.addSource('route-' + id, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } });
    map.addLayer({
        id: 'route-layer-' + id, type: 'line', source: 'route-' + id,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 
            'line-color': '#ffffff', 
            'line-width': 5, 
            'line-opacity': 1.0
        }
    });
}

"""
    new_content = content[:start_idx] + correct_func + content[end_idx:]
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Super Luminous Yellow patch complete.")

super_luminous_yellow_patch()
