import codecs, re

with codecs.open('vubez2.html', 'r', 'utf-8') as f:
    content = f.read()


pattern1 = r"(map\.on\('rotatestart', stopFollow\);)\s*\r?\n\s*(map\.on\('pitchstart', stopFollow\);)"
replacement1 = r"map.on('rotatestart', stopFollow);\r\n                map.on('pitchstart', stopFollow);\r\n                map.on('touchstart', stopFollow);"
content, n1 = re.subn(pattern1, replacement1, content, count=1)
print(f'PATCH 1 (touchstart): {"OK" if n1 else "FAILED"}')


pattern2 = r"(\s*\r?\n\s*requestAnimationFrame\(frame\);\s*\r?\n\s*\})"
replacement2 = """
                // ── Live HUD Overlay Update
                const _hudD = document.getElementById('dxi-dist-' + id);
                const _hudT = document.getElementById('dxi-dur-' + id);
                const _srcD = document.getElementById('dx-dist-' + id);
                const _srcT = document.getElementById('dx-dur-' + id);
                if (_hudD && _srcD && _srcD.textContent && _srcD.textContent !== '--') _hudD.textContent = _srcD.textContent;
                if (_hudT && _srcT && _srcT.textContent && _srcT.textContent !== '--') _hudT.textContent = _srcT.textContent;

                requestAnimationFrame(frame);
            }"""

old_raf = content[content.find('requestAnimationFrame(frame);\r\n            }'):content.find('requestAnimationFrame(frame);\r\n            }') + 50] if 'requestAnimationFrame(frame);\r\n            }' in content else None
if old_raf:
    content = content.replace('requestAnimationFrame(frame);\r\n            }', """// ── Live HUD Overlay Update
                const _hudD = document.getElementById('dxi-dist-' + id);
                const _hudT = document.getElementById('dxi-dur-' + id);
                const _srcD = document.getElementById('dx-dist-' + id);
                const _srcT = document.getElementById('dx-dur-' + id);
                if (_hudD && _srcD && _srcD.textContent && _srcD.textContent !== '--') _hudD.textContent = _srcD.textContent;
                if (_hudT && _srcT && _srcT.textContent && _srcT.textContent !== '--') _hudT.textContent = _srcT.textContent;

                requestAnimationFrame(frame);
            }""", 1)
    print('PATCH 2 (live HUD): OK')
else:
    print('PATCH 2 (live HUD): FAILED - pattern not found')


fs_start = content.find('// \u2500\u2500 Fullscreen Toggle Logic')
fs_end = content.find('\nfunction daxiMapRecenter', fs_start)
if fs_start != -1 and fs_end != -1:
    old_fs = content[fs_start:fs_end]
    new_fs = """// \u2500\u2500 Fullscreen Toggle Logic (true fullscreen over everything including navbar)
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
    content = content[:fs_start] + new_fs + content[fs_end:]
    print('PATCH 3 (true fullscreen): OK')
else:
    print(f'PATCH 3 (true fullscreen): FAILED - fs_start={fs_start}, fs_end={fs_end}')

with codecs.open('vubez2.html', 'w', 'utf-8') as f:
    f.write(content)

print('Done.')
