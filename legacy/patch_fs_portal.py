import codecs

with codecs.open('vubez2.html', 'r', 'utf-8') as f:
    content = f.read()


old_fs = """// \u2500\u2500 Fullscreen Toggle Logic (true fullscreen over everything including navbar)
function daxiMapToggleFs(id) {
    var wrap = document.getElementById('daximap-wrap-' + id);
    if (!wrap) return;
    if (!wrap._isFs) { daxiMapEnterFs(id); } else { daxiMapExitFs(id); }
}

function daxiMapEnterFs(id) {
    var wrap = document.getElementById('daximap-wrap-' + id);
    var mapEl = document.getElementById('daximap-' + id);
    var fsBtn = document.getElementById('daximap-fs-' + id);
    if (!wrap) return;
    wrap._origStyle = wrap.getAttribute('style') || '';
    wrap.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100dvh;z-index:99999;border-radius:0;background:#0d1117;overflow:hidden;';
    if (mapEl) {
        mapEl._origMapStyle = mapEl.getAttribute('style') || '';
        mapEl.style.cssText = 'width:100%;height:100%;position:relative;z-index:1;opacity:1;';
    }
    if (fsBtn) fsBtn.style.display = 'none';
    var closeBtn = document.getElementById('daximap-fs-close-' + id);
    if (closeBtn) closeBtn.style.display = 'flex';
    wrap._isFs = true;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    var inst = _daxiMaps[id];
    if (inst && inst.map) setTimeout(function() { inst.map.resize(); }, 120);
}

function daxiMapExitFs(id) {
    var wrap = document.getElementById('daximap-wrap-' + id);
    var mapEl = document.getElementById('daximap-' + id);
    var fsBtn = document.getElementById('daximap-fs-' + id);
    if (!wrap || !wrap._isFs) return;
    wrap.style.cssText = wrap._origStyle;
    if (mapEl && mapEl._origMapStyle !== undefined) mapEl.setAttribute('style', mapEl._origMapStyle);
    if (fsBtn) fsBtn.style.display = 'flex';
    var closeBtn = document.getElementById('daximap-fs-close-' + id);
    if (closeBtn) closeBtn.style.display = 'none';
    wrap._isFs = false;
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    var inst = _daxiMaps[id];
    if (inst && inst.map) setTimeout(function() { inst.map.resize(); }, 120);
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        Object.keys(_daxiMaps).forEach(function(id) {
            var w = document.getElementById('daximap-wrap-' + id);
            if (w && w._isFs) daxiMapExitFs(id);
        });
    }
});
"""

new_fs = """// \u2500\u2500 Fullscreen Toggle Logic \u2014 Portal approach (escapes perspective parent)
function daxiMapToggleFs(id) {
    var wrap = document.getElementById('daximap-wrap-' + id);
    if (!wrap) return;
    if (!wrap._isFs) { daxiMapEnterFs(id); } else { daxiMapExitFs(id); }
}

function daxiMapEnterFs(id) {
    var wrap = document.getElementById('daximap-wrap-' + id);
    var mapEl = document.getElementById('daximap-' + id);
    var fsBtn = document.getElementById('daximap-fs-' + id);
    if (!wrap) return;

    // Save state
    wrap._origStyle      = wrap.getAttribute('style') || '';
    wrap._origParent     = wrap.parentNode;
    wrap._origNextSibling = wrap.nextSibling;

    // Move to body to escape perspective/transform containers
    document.body.appendChild(wrap);

    // Style as true fullscreen
    wrap.style.cssText = [
        'position:fixed', 'top:0', 'left:0',
        'width:100vw', 'height:100vh',
        'z-index:99999', 'border-radius:0',
        'background:#0d1117', 'overflow:hidden',
        'transition:none'
    ].join(';');

    // Ensure map element fills the wrap
    if (mapEl) {
        mapEl._origMapStyle = mapEl.getAttribute('style') || '';
        mapEl.style.width  = '100%';
        mapEl.style.height = '100%';
        mapEl.style.opacity = '1';
    }

    // Toggle buttons
    if (fsBtn) fsBtn.style.display = 'none';
    var closeBtn = document.getElementById('daximap-fs-close-' + id);
    if (closeBtn) closeBtn.style.display = 'flex';

    wrap._isFs = true;
    document.body.style.overflow = 'hidden';

    // Resize Mapbox canvas to fill new dimensions
    var inst = _daxiMaps[id];
    if (inst && inst.map) {
        setTimeout(function() { inst.map.resize(); }, 60);
        setTimeout(function() { inst.map.resize(); }, 250);
    }
}

function daxiMapExitFs(id) {
    var wrap = document.getElementById('daximap-wrap-' + id);
    var mapEl = document.getElementById('daximap-' + id);
    var fsBtn = document.getElementById('daximap-fs-' + id);
    if (!wrap || !wrap._isFs) return;

    // Move back to original parent
    if (wrap._origParent) {
        if (wrap._origNextSibling) {
            wrap._origParent.insertBefore(wrap, wrap._origNextSibling);
        } else {
            wrap._origParent.appendChild(wrap);
        }
    }

    // Restore original styles
    wrap.setAttribute('style', wrap._origStyle);
    if (mapEl && mapEl._origMapStyle !== undefined) {
        mapEl.setAttribute('style', mapEl._origMapStyle);
    }

    // Toggle buttons
    if (fsBtn) fsBtn.style.display = 'flex';
    var closeBtn = document.getElementById('daximap-fs-close-' + id);
    if (closeBtn) closeBtn.style.display = 'none';

    wrap._isFs = false;
    document.body.style.overflow = '';

    // Resize back
    var inst = _daxiMaps[id];
    if (inst && inst.map) {
        setTimeout(function() { inst.map.resize(); }, 60);
        setTimeout(function() { inst.map.resize(); }, 250);
    }
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        Object.keys(_daxiMaps).forEach(function(id) {
            var w = document.getElementById('daximap-wrap-' + id);
            if (w && w._isFs) daxiMapExitFs(id);
        });
    }
});
"""

if old_fs in content:
    content = content.replace(old_fs, new_fs, 1)
    print('Fullscreen portal patch: OK')
else:
    
    start = content.find('// \u2500\u2500 Fullscreen Toggle Logic')
    if start != -1:
        
        end = content.find('\nfunction daxiMapRecenter', start)
        if end != -1:
            content = content[:start] + new_fs + content[end:]
            print('Fullscreen portal patch (by position): OK')
        else:
            print('FAILED: could not find end of fullscreen block')
    else:
        print('FAILED: could not find fullscreen block')

with codecs.open('vubez2.html', 'w', 'utf-8') as f:
    f.write(content)
print('Done.')
