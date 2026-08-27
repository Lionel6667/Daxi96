import codecs
with codecs.open('vubez2.html', 'r', 'utf-8') as f:
    c = f.read()

checks = [
    ('cameraInternalChange guard', 'if (inst.cameraInternalChange) return;'),
    ('True fullscreen JS', 'daxiMapEnterFs'),
    ('Fullscreen z-index 99999', 'z-index:99999'),
    ('Close button JS', 'daxiMapExitFs'),
    ('HUD overlay show code', 'daximap-hud-'),
    ('Live HUD frame update', 'dxi-dist-'),
    ('touchstart listener', "map.on('touchstart', stopFollow)"),
    ('Escape key close', "e.key === 'Escape'"),
]
print('FINAL VERIFICATION:')
for name, pat in checks:
    print('  ' + ('OK' if pat in c else 'MISSING') + ': ' + name)
