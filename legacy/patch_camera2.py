import codecs
import re

file_path = 'vubez2.html'
with codecs.open(file_path, 'r', 'utf-8') as f:
    content = f.read()


pattern_stopfollow = r'(// .{0,30}Manual Interaction Logic.*?const stopFollow = \(\) => \{)(.*?)\};'
replacement_stopfollow = r'''\1
                    if (inst.cameraInternalChange) return; // ignore programmatic camera moves
                    if (inst.isFollowing && !inst.isIntro) {
                        inst.isFollowing = false;
                        const btn = document.getElementById('daximap-recenter-' + id);
                        if (btn) btn.style.display = 'flex';
                    }
                };'''

content, n = re.subn(pattern_stopfollow, replacement_stopfollow, content, count=1, flags=re.DOTALL)
print(f'stopFollow replacements: {n}')


old_zoom_guard = "if (inst.cameraLock || inst.isIntro) return;"
new_zoom_guard = "if (inst.cameraInternalChange || inst.isIntro) return;"
count_zoom = content.count(old_zoom_guard)
content = content.replace(old_zoom_guard, new_zoom_guard)
print(f'zoom guard replacements: {count_zoom}')


if 'camSmooth' not in content:
    old_pitch = "drivePitch: 65,"
    new_pitch = "drivePitch: 65,\n    camSmooth: 0.105,\n    zoomSmooth: 0.085,"
    count_pitch = content.count(old_pitch)
    content = content.replace(old_pitch, new_pitch, 1)
    print(f'camSmooth added (drivePitch found {count_pitch}x)')
else:
    print('camSmooth already present')

with codecs.open(file_path, 'w', 'utf-8') as f:
    f.write(content)


checks = [
    ('cameraInternalChange guard in stopFollow', 'if (inst.cameraInternalChange) return;'),
    ('zoom guard uses cameraInternalChange', 'if (inst.cameraInternalChange || inst.isIntro) return;'),
    ('camSmooth in cfg', 'camSmooth:'),
    ('cameraInternalChange flag in inst', 'cameraInternalChange: false,'),
    ('cameraInternalChange = true before jumpTo', 'inst.cameraInternalChange = true;'),
]
print('\nVerification:')
for name, pat in checks:
    print(f'  {"OK" if pat in content else "MISSING"}: {name}')
