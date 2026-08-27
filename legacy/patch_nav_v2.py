import os
import re

def patch_vubez2():
    path = 'vubez2.html'
    if not os.path.exists(path): return
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    
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

    
    exit_pattern = r'const runIntroExit = \(\) => \{.*?\}\r?\n\s+if \(hasDest && pLa && pLo\)'
    
    
    
    old_exit_func = r'const runIntroExit = \(\) => \{.*?setTimeout\(\(\) => \{.*?inst\.isIntro = false;.*?\}, 1000\);.*?\}'
    
    
    
    start_str = "const runIntroExit = () => {"
    end_str = "inst.introRouteReady = true;"
    
    
    
    
    content = content.replace("getElementById('dx-dist-'+id)", "getElementById('dxi-dist-'+id)")
    content = content.replace("getElementById('dx-dur-'+id)", "getElementById('dxi-dur-'+id)")
    
    
    
    
    content = content.replace("if (intro) intro.style.display = 'none';", "if (intro) intro.style.display = 'none'; inst.isIntro = false;")

    
    content = re.sub(r'// ── Live HUD Overlay Update.*?requestAnimationFrame\(frame\);', 'requestAnimationFrame(frame);', content, flags=re.DOTALL)

    
    content = content.replace("interactive: true,", "interactive: true, dragPan: true, scrollZoom: true, boxZoom: true, dragRotate: true,")

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patched vubez2.html for Navigation and HUD")

def patch_template():
    path = 'julmin_taxis_django/templates/htmx/client_orders.html'
    if not os.path.exists(path): return
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    
    content = content.replace('ItinAcraire Daxi', 'Itinéraire Daxi')
    content = content.replace('Julmin Taxis — Itinéraire', 'Itinéraire Daxi')
    
    
    content = re.sub(r'<div style="font-size:11px; margin-top:10px; color:#bfdbfe;">.*?</div>', 
                     '<div style="font-size:11px; margin-top:10px; color:#ffffff; font-weight:600;">Chargement de votre trajet...</div>', content)
    
    
    content = re.sub(r'<!-- HUD info below map.*?<div id="daximap-info-{{ o.id }}".*?</div>', '', content, flags=re.DOTALL)
    
    
    
    if '◎</button>' in content and '🎯' in content:
        
        content = re.sub(r'<button onclick="daxiMapRecenter\(\'{{ o.id }}\'\)" id="daximap-recenter-{{ o.id }}".*?</button>', '', content, flags=re.DOTALL)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patched client_orders.html for UI Cleanup")

patch_vubez2()
patch_template()
