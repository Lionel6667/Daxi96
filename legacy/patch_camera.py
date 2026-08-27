import codecs
import re

file_path = 'vubez2.html'
with codecs.open(file_path, 'r', 'utf-8') as f:
    content = f.read()

original_count = len(content)


old_inst = """                cameraLock: false,
                lastT: 0
            };"""
new_inst = """                cameraLock: false,
                cameraInternalChange: false,
                lastT: 0
            };"""
content = content.replace(old_inst, new_inst, 1)


old_frame_camera = """                if (inst.isFollowing && !inst.isIntro) {
                    // Look-ahead camera focal point
                    const focal = _lookAheadPt(inst.currentPos, inst.sBear, DAXI_NAV_CFG.lookAhead);
                    inst.camC[0] = lerp(inst.camC[0], focal[0], 0.105 * dt);
                    inst.camC[1] = lerp(inst.camC[1], focal[1], 0.105 * dt);
                    const targetCamB = (window._hasDeviceOrientation) ? window._userHeading : inst.sBear;
                    inst.camB    = _lerpBear(inst.camB, targetCamB, 0.105 * dt);
                    inst.followZoom = lerp(inst.followZoom, inst.followZoomTarget, 0.085 * dt);

                    const safeLA = _daxiSafeLL(inst.camC);
                    if (isFinite(safeLA[0]) && isFinite(safeLA[1])) {
                        inst.cameraLock = true;
                        inst.map.jumpTo({
                            center: safeLA,
                            bearing: inst.camB,
                            pitch: DAXI_NAV_CFG.drivePitch,
                            zoom: inst.followZoom,
                            padding: DAXI_NAV_CFG.drivePadding
                        });
                        inst.cameraLock = false;
                    }
                }"""

new_frame_camera = """                if (inst.isFollowing && !inst.isIntro) {
                    // ── Identical to navigation_engine.html ──
                    const focal = _lookAheadPt(inst.currentPos, inst.sBear, DAXI_NAV_CFG.lookAhead);
                    inst.camC[0] = lerp(inst.camC[0], focal[0], DAXI_NAV_CFG.camSmooth * dt);
                    inst.camC[1] = lerp(inst.camC[1], focal[1], DAXI_NAV_CFG.camSmooth * dt);
                    const targetCamB = (window._hasDeviceOrientation) ? window._userHeading : inst.sBear;
                    inst.camB = _lerpBear(inst.camB, targetCamB, DAXI_NAV_CFG.camSmooth * dt);
                    inst.followZoom = lerp(inst.followZoom, inst.followZoomTarget, DAXI_NAV_CFG.zoomSmooth * dt);

                    const safeLA = _daxiSafeLL(inst.camC);
                    if (isFinite(safeLA[0]) && isFinite(safeLA[1])) {
                        inst.cameraInternalChange = true;
                        inst.map.jumpTo({
                            center: safeLA,
                            bearing: inst.camB,
                            pitch: DAXI_NAV_CFG.drivePitch,
                            zoom: inst.followZoom,
                            padding: DAXI_NAV_CFG.drivePadding
                        });
                        inst.cameraInternalChange = false;
                    }
                }"""

content = content.replace(old_frame_camera, new_frame_camera, 1)


old_stopfollow = """                // ── Manual Interaction Logic
                const stopFollow = (e) => {
                    if (e && !e.originalEvent) return;
                    if (inst.isFollowing && !inst.isIntro) {
                        inst.isFollowing = false;
                        const btn = document.getElementById('daximap-recenter-' + id);
                        if (btn) btn.style.display = 'flex';
                    }
                };
                map.on('dragstart', stopFollow);
                map.on('rotatestart', stopFollow);
                map.on('pitchstart', stopFollow);
                map.on('zoom', function() {
                    if (inst.cameraLock || inst.isIntro) return;
                    var z = map.getZoom();
                    z = Math.max(DAXI_NAV_CFG.driveZoomMin, Math.min(DAXI_NAV_CFG.driveZoomMax, z));
                    inst.followZoomTarget = z;
                    if (!inst.isFollowing) inst.followZoom = z;
                });"""

new_stopfollow = """                // ── Manual Interaction Logic (identical to navigation_engine.html)
                const stopFollow = () => {
                    if (inst.cameraInternalChange) return; // ignore programmatic moves
                    if (inst.isFollowing && !inst.isIntro) {
                        inst.isFollowing = false;
                        const btn = document.getElementById('daximap-recenter-' + id);
                        if (btn) btn.style.display = 'flex';
                    }
                };
                map.on('dragstart', stopFollow);
                map.on('rotatestart', stopFollow);
                map.on('pitchstart', stopFollow);
                map.on('zoom', function() {
                    if (inst.cameraInternalChange || inst.isIntro) return;
                    var z = map.getZoom();
                    z = Math.max(DAXI_NAV_CFG.driveZoomMin, Math.min(DAXI_NAV_CFG.driveZoomMax, z));
                    inst.followZoomTarget = z;
                    if (!inst.isFollowing) inst.followZoom = z;
                });"""

content = content.replace(old_stopfollow, new_stopfollow, 1)


if 'camSmooth' not in content:
    old_cfg_pitch = "drivePitch: 65,"
    new_cfg_pitch = """drivePitch: 65,
    camSmooth: 0.105,
    zoomSmooth: 0.085,"""
    content = content.replace(old_cfg_pitch, new_cfg_pitch, 1)

with codecs.open(file_path, 'w', 'utf-8') as f:
    f.write(content)

new_count = len(content)
print(f'Done. File size: {original_count} -> {new_count} bytes')


checks = [
    ('cameraInternalChange flag in inst', 'cameraInternalChange: false,'),
    ('cameraInternalChange = true before jumpTo', 'inst.cameraInternalChange = true;'),
    ('stopFollow guard', 'if (inst.cameraInternalChange) return;'),
    ('zoom guard updated', 'if (inst.cameraInternalChange || inst.isIntro) return;'),
    ('camSmooth in CFG', 'camSmooth:'),
]
for name, pattern in checks:
    found = pattern in content
    print(f'  {"OK" if found else "MISSING"}: {name}')
