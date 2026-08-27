import codecs
with codecs.open('vubez2.html', 'r', 'utf-8') as f:
    c = f.read()
checks = [
    ('camSmooth in DAXI_NAV_CFG', 'camSmooth: 0.105'),
    ('zoomSmooth in DAXI_NAV_CFG', 'zoomSmooth: 0.085'),
    ('cameraInternalChange flag in inst', 'cameraInternalChange: false,'),
    ('cameraInternalChange = true before jumpTo', 'inst.cameraInternalChange = true;'),
    ('cameraInternalChange = false after jumpTo', 'inst.cameraInternalChange = false;'),
    ('stopFollow guard', 'if (inst.cameraInternalChange) return;'),
    ('zoom guard uses cameraInternalChange', 'if (inst.cameraInternalChange || inst.isIntro) return;'),
    ('car symbol layer pitch alignment', 'icon-pitch-alignment'),
    ('_daxiEnsureCarLayer exists', '_daxiEnsureCarLayer'),
    ('_daxiAddCarLayer exists', '_daxiAddCarLayer'),
]
print('VERIFICATION RESULTS:')
all_ok = True
for name, pat in checks:
    ok = pat in c
    all_ok = all_ok and ok
    print('  ' + ('OK' if ok else 'MISSING') + ': ' + name)
print()
print('ALL OK' if all_ok else 'SOME MISSING - CHECK ABOVE')
