import os

def patch_vubez2_markers():
    path = 'vubez2.html'
    if not os.path.exists(path): return
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()

    
    content = content.replace("""                if (startLat && startLng) {
                    _daxiEnsureCarLayer(inst, startLng, startLat);
                    inst.currentPos = [startLng, startLat];""", 
                              """                if (startLat && startLng) {
                    if (dImg) {
                        inst.driverMarker = _daxiDriver3D(startLat, startLng, map, dImg);
                    } else {
                        _daxiEnsureCarLayer(inst, startLng, startLat);
                    }
                    inst.currentPos = [startLng, startLat];""")

    
    content = content.replace("""                    inst.map.getSource('car-source-' + id).setData({
                        type: 'Feature',
                        geometry: {
                            type: 'Point',
                            coordinates: _daxiSafeLL(inst.currentPos)
                        },
                        properties: {
                            bearing: finalCarRotation
                        }
                    });""", 
                              """                    if (inst.map.getSource('car-source-' + id)) {
                        inst.map.getSource('car-source-' + id).setData({
                            type: 'Feature',
                            geometry: {
                                type: 'Point',
                                coordinates: _daxiSafeLL(inst.currentPos)
                            },
                            properties: {
                                bearing: finalCarRotation
                            }
                        });
                    }
                    if (inst.driverMarker) {
                        inst.driverMarker.setLngLat(_daxiSafeLL(inst.currentPos));
                        // Optional: rotate the photo marker slightly or add a pointer
                    }""")

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patched vubez2.html with Photo-based Car Marker")

patch_vubez2_markers()
