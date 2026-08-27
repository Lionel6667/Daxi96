import codecs, re


with codecs.open('vubez2.html', 'r', 'utf-8') as f:
    content = f.read()


old_stopfollow_block = """                // ── Manual Interaction Logic
                const stopFollow = () => {
                    if (inst.cameraInternalChange) return; // ignore programmatic camera moves
                    if (inst.isFollowing && !inst.isIntro) {
                        inst.isFollowing = false;
                        const btn = document.getElementById('daximap-recenter-' + id);
                        if (btn) btn.style.display = 'flex';
                    }
                };
                map.on('dragstart', stopFollow);
                map.on('rotatestart', stopFollow);
                map.on('pitchstart', stopFollow);"""

new_stopfollow_block = """                // ── Manual Interaction Logic
                // User can drag/pan/zoom freely — only loses auto-follow
                const stopFollow = () => {
                    if (inst.cameraInternalChange) return; // ignore programmatic camera moves
                    if (inst.isFollowing && !inst.isIntro) {
                        inst.isFollowing = false;
                        const btn = document.getElementById('daximap-recenter-' + id);
                        if (btn) btn.style.display = 'flex';
                    }
                };
                map.on('dragstart', stopFollow);
                map.on('rotatestart', stopFollow);
                map.on('pitchstart', stopFollow);
                map.on('touchstart', stopFollow);"""

content = content.replace(old_stopfollow_block, new_stopfollow_block, 1)
print('PATCH 1 (manual interaction): ' + ('OK' if new_stopfollow_block in content else 'FAILED'))


old_raf = """                requestAnimationFrame(frame);
            }"""

new_raf = """                // ── Live HUD Update (km & min overlay on map)
                const hudDist = document.getElementById('dxi-dist-' + id);
                const hudDur  = document.getElementById('dxi-dur-' + id);
                if (hudDist && hudDur) {
                    const dKm = document.getElementById('dx-dist-' + id);
                    const dDur = document.getElementById('dx-dur-' + id);
                    if (dKm  && dKm.innerText  && dKm.innerText !== '--')  hudDist.textContent = dKm.innerText;
                    if (dDur && dDur.innerText && dDur.innerText !== '--') hudDur.textContent  = dDur.innerText;
                }

                requestAnimationFrame(frame);
            }"""

content = content.replace(old_raf, new_raf, 1)
print('PATCH 2 (live HUD sync in frame): ' + ('OK' if new_raf in content else 'FAILED'))


old_fs_func = """// ── Fullscreen Toggle Logic
function daxiMapToggleFs(id) {
    var wrap = document.getElementById('daximap-wrap-' + id);
    var mapEl = document.getElementById('daximap-' + id);
    var btn = document.getElementById('daximap-fs-' + id);
    if (!wrap) return;
    if (!wrap._isFs) {
        wrap._origStyle = wrap.getAttribute('style') || '';
        wrap.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:9999; border-radius:0; background:#dbe5f0;';
        if (mapEl) mapEl.style.height = '100%';
        if (btn) btn.innerHTML = '✕';
        wrap._isFs = true;
        document.body.style.overflow = 'hidden';
    } else { daxiMapExitFs(id); return; }
    var inst = _daxiMaps[id];
    if (inst && inst.map) setTimeout(() => { inst.map.resize(); }, 100);
}

function daxiMapExitFs(id) {
    var wrap = document.getElementById('daximap-wrap-' + id);
    var btn = document.getElementById('daximap-fs-' + id);
    if (!wrap || !wrap._isFs) return;
    wrap.style.cssText = wrap._origStyle;
    if (btn) btn.innerHTML = '⛶';
    wrap._isFs = false;
    document.body.style.overflow = '';
    var inst = _daxiMaps[id];
    if (inst && inst.map) setTimeout(() => { inst.map.resize(); }, 100);
}"""

new_fs_func = """// ── Fullscreen Toggle Logic (true fullscreen over everything including navbar)
function daxiMapToggleFs(id) {
    var wrap = document.getElementById('daximap-wrap-' + id);
    if (!wrap) return;
    if (!wrap._isFs) {
        daxiMapEnterFs(id);
    } else {
        daxiMapExitFs(id);
    }
}

function daxiMapEnterFs(id) {
    var wrap = document.getElementById('daximap-wrap-' + id);
    var mapEl = document.getElementById('daximap-' + id);
    var fsBtn = document.getElementById('daximap-fs-' + id);
    if (!wrap) return;
    wrap._origStyle = wrap.getAttribute('style') || '';
    // Cover EVERYTHING: navbar, modals, sidebars
    wrap.style.cssText = [
        'position:fixed',
        'top:0', 'left:0',
        'width:100vw', 'height:100dvh',
        'z-index:99999',
        'border-radius:0',
        'background:#0d1117',
        'overflow:hidden',
        'transition:none'
    ].join(';');
    if (mapEl) {
        mapEl._origMapStyle = mapEl.getAttribute('style') || '';
        mapEl.style.height = '100%';
        mapEl.style.width = '100%';
    }
    // Hide native fs button, show close button overlay
    if (fsBtn) fsBtn.style.display = 'none';
    var closeBtn = document.getElementById('daximap-fs-close-' + id);
    if (closeBtn) closeBtn.style.display = 'flex';
    wrap._isFs = true;
    document.body.style.overflow = 'hidden';
    // Prevent scroll on mobile
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
    // Restore fs button, hide close button
    if (fsBtn) fsBtn.style.display = 'flex';
    var closeBtn = document.getElementById('daximap-fs-close-' + id);
    if (closeBtn) closeBtn.style.display = 'none';
    wrap._isFs = false;
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    var inst = _daxiMaps[id];
    if (inst && inst.map) setTimeout(function() { inst.map.resize(); }, 120);
}

// Close fullscreen on Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        Object.keys(_daxiMaps).forEach(function(id) {
            var w = document.getElementById('daximap-wrap-' + id);
            if (w && w._isFs) daxiMapExitFs(id);
        });
    }
});"""

content = content.replace(old_fs_func, new_fs_func, 1)
print('PATCH 3 (true fullscreen): ' + ('OK' if new_fs_func in content else 'FAILED'))

with codecs.open('vubez2.html', 'w', 'utf-8') as f:
    f.write(content)

print('Done patching vubez2.html')
