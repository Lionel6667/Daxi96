import re

with open('vubez2.html', 'r', encoding='utf-8') as f:
    content = f.read()


start_marker = "const statusAttr = el.dataset.orderStatus || '';"
end_marker = "// Interaction logic"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print("Markers not found")
    exit(1)

new_script = """const statusAttr = el.dataset.orderStatus || '';
        const caseA = hasDriver && (statusAttr === 'driver_assigned' || statusAttr === 'on_way' || statusAttr === 'arrived');
        const isInProgress = hasDriver && (statusAttr === 'in_progress');
        const caseActive = caseA || isInProgress;

        // ── Observers pour mise à jour en temps réel ──
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes') {
                    if (mutation.attributeName === 'data-driver-lat' || mutation.attributeName === 'data-driver-lng') {
                        var newVLa = _df(el.dataset.driverLat), newVLo = _df(el.dataset.driverLng);
                        if (isFinite(newVLa) && isFinite(newVLo) && newVLa !== 0) {
                            inst._interpFrom = [...inst.currentPos];
                            inst._interpTo = [newVLo, newVLa];
                            inst.targetPos = [newVLo, newVLa];
                            inst._interpStart = performance.now();
                            // Update routing dynamically
                            if (caseA && pLa && pLo) {
                                _fetchRoute(newVLo, newVLa, pLo, pLa).then(path1 => {
                                    if (path1) { _pickupPoly.setPath(path1); _pickupPolyGlow.setPath(path1); }
                                });
                            } else if (isInProgress && dLa && dLo) {
                                _fetchRoute(newVLo, newVLa, dLo, dLa).then(pathTrip => {
                                    if (pathTrip) { _tripPoly.setPath(pathTrip); _tripPolyGlow.setPath(pathTrip); }
                                });
                            }
                        }
                    }
                }
            });
        });
        observer.observe(el, { attributes: true });

        // Initial Markers
        if (!isInProgress) {
            inst.userMarker = _daxiMe3D(pLa, pLo, map, uImg);
        }
        
        if (caseActive) {
            inst.driverMarker = _daxiDriver3D(vLa, vLo, map, dImg);
            inst.currentPos = [vLo, vLa];
            inst.targetPos  = [vLo, vLa];
            inst.camC       = [vLo, vLa];
            inst._interpFrom = [vLo, vLa];
            inst._interpTo = [vLo, vLa];
            if (isInProgress && hasDest) {
                inst.destMarker = _daxiDest3D(dLa, dLo, map, id);
            }
        } else if (hasDest) {
            inst.destMarker = _daxiDest3D(dLa, dLo, map, id);
        }

        // Fetch Routes
        if (caseA && pLa && pLo) {
            _fetchRoute(vLo, vLa, pLo, pLa).then(path1 => {
                if (path1) {
                    _pickupPoly.setPath(path1);
                    _pickupPolyGlow.setPath(path1);
                    _pickupPoly.setMap(map);
                    _pickupPolyGlow.setMap(map);
                }
            });
        } else if (isInProgress && hasDest && dLa && dLo) {
            _fetchRoute(vLo, vLa, dLo, dLa).then(pathTrip => {
                if (pathTrip) {
                    _tripPoly.setPath(pathTrip);
                    _tripPolyGlow.setPath(pathTrip);
                    _tripPoly.setMap(map);
                    _tripPolyGlow.setMap(map);
                }
            });
        } else if (!caseActive && hasDest && pLa && pLo) {
            _fetchRoute(pLo, pLa, dLo, dLa).then(path2 => {
                if (path2) {
                    _tripPoly.setPath(path2);
                    _tripPolyGlow.setPath(path2);
                    _tripPoly.setMap(map);
                    _tripPolyGlow.setMap(map);
                }
            });
        }

        // ── Motion Animation Loop ──
        function frame(ts) {
            const dt = inst.lastT ? Math.min((ts - inst.lastT) / 16.67, 3) : 1;
            inst.lastT = ts;

            if (inst._interpStart > 0 && caseActive) {
                const elapsed = performance.now() - inst._interpStart;
                const t = Math.min(elapsed / inst._interpDur, 1);
                const eased = t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
                inst.currentPos[0] = inst._interpFrom[0] + (inst._interpTo[0] - inst._interpFrom[0]) * eased;
                inst.currentPos[1] = inst._interpFrom[1] + (inst._interpTo[1] - inst._interpFrom[1]) * eased;
            }

            if (caseActive && inst.driverMarker) {
                const dx = inst._interpTo[0] - inst._interpFrom[0];
                const dy = inst._interpTo[1] - inst._interpFrom[1];
                let targetBear = inst.sBear;
                if (Math.abs(dx) + Math.abs(dy) > 1e-8) {
                    targetBear = _calcBearing(inst._interpFrom, inst._interpTo);
                }
                inst.sBear = _lerpBear(inst.sBear, targetBear, DAXI_NAV_CFG.bearSmooth * dt);
                
                inst.driverMarker.setPosition({ lat: inst.currentPos[1], lng: inst.currentPos[0] });
                if (inst.driverMarker._el) {
                    inst.driverMarker._el.style.transform = inst.isFollowing 
                        ? `rotateX(${DAXI_NAV_CFG.drivePitch}deg)` 
                        : `rotateZ(${inst.sBear}deg)`;
                }
            }

            if (inst.isFollowing && !inst.isIntro && caseActive) {
                const focal = _lookAheadPt(inst.currentPos, inst.sBear, DAXI_NAV_CFG.lookAhead);
                inst.camC[0] = lerp(inst.camC[0], focal[0], DAXI_NAV_CFG.camSmooth * dt);
                inst.camC[1] = lerp(inst.camC[1], focal[1], DAXI_NAV_CFG.camSmooth * dt);
                const safeCamB = (window._hasDeviceOrientation) ? window._userHeading : inst.sBear;
                inst.camB = _lerpBear(inst.camB, safeCamB, DAXI_NAV_CFG.camSmooth * dt);

                map.moveCamera({
                    center: { lat: inst.camC[1], lng: inst.camC[0] },
                    heading: inst.camB,
                    tilt: DAXI_NAV_CFG.drivePitch
                });
            }

            requestAnimationFrame(frame);
        }
        
        google.maps.event.addListenerOnce(map, 'idle', () => {
            requestAnimationFrame(frame);
            el.style.opacity = '1';
            
            // Intro sequence: Fit bounds to all markers, then wait
            const bounds = new google.maps.LatLngBounds();
            if (!isInProgress) bounds.extend({ lat: pLa, lng: pLo });
            if (caseActive) bounds.extend({ lat: inst.currentPos[1], lng: inst.currentPos[0] });
            if (hasDest && (!caseActive || isInProgress)) bounds.extend({ lat: dLa, lng: dLo });
            
            map.fitBounds(bounds, { padding: 50 });
            
            """

with open('vubez2.html', 'w', encoding='utf-8') as f:
    f.write(content[:start_idx] + new_script + content[end_idx:])

print("Patch applied successfully.")
