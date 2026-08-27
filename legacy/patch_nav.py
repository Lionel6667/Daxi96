import os

def patch_vubez2():
    path = 'vubez2.html'
    if not os.path.exists(path): return
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    
    import re
    cfg_pattern = r'const DAXI_NAV_CFG = \{.*?\};'
    new_cfg = """const DAXI_NAV_CFG = {
    introMs: 4000,
    introAerialPadding: 60,
    introMinZoom: 12.5,
    introZoomOffset: 1.5,
    introDriftZoomDelta: 0.4,
    drivePitch: 65,
    camSmooth: 0.105,
    zoomSmooth: 0.085,
    bearSmooth: 0.09,
    driveZoomDefault: 15.35,
    driveZoomMin: 13.2,
    driveZoomMax: 18.4,
    lookAhead: 0.00092,
    drivePadding: { top: 80, bottom: 290, left: 0, right: 0 },
    enterDriveMs: 2200
};"""
    content = re.sub(cfg_pattern, new_cfg, content, flags=re.DOTALL)
    
    
    hud_pattern = r'function _daxiHUD\(id, hasDest, hasDriver, dist, dur, eta\) \{.*?\}'
    new_hud = """function _daxiHUD(id, hasDest, hasDriver, dist, dur, eta) {
    // Redundant updates removed to prevent duplicate info below map container.
}"""
    content = re.sub(hud_pattern, new_hud, content, flags=re.DOTALL)
    
    
    map_init_pattern = r'FadeDuration: 0\s+\}\);'
    new_map_init = """FadeDuration: 0,
                dragPan: true,
                scrollZoom: true,
                boxZoom: true,
                dragRotate: true,
                keyboard: true,
                doubleClickZoom: true,
                touchZoomRotate: true
            });"""
    content = content.replace('fadeDuration: 0\n            });', new_map_init)
    content = content.replace('fadeDuration: 0\r\n            });', new_map_init)
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patched vubez2.html")

def patch_template():
    path = 'julmin_taxis_django/templates/htmx/client_orders.html'
    if not os.path.exists(path): return
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
        
    
    import re
    
    content = content.replace('ItinAcraire Daxi', 'Itinéraire Daxi')
    content = content.replace('Julmin Taxis — Itinéraire', 'Itinéraire Daxi')
    
    
    desc_pattern = r'<div style="font-size:11px; margin-top:10px; color:#bfdbfe;">.*?</div>'
    content = re.sub(desc_pattern, '<div style="font-size:11px; margin-top:10px; color:#ffffff; font-weight:600;">Chargement de votre trajet...</div>', content)
    
    
    content = re.sub(r'<!-- HUD info below map.*?<div id="daximap-info-{{ o.id }}".*?</div>', '', content, flags=re.DOTALL)
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patched client_orders.html")

patch_vubez2()
patch_template()
