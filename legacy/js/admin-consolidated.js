





let adminGMap = null;
let adminGMarkers = {};
let adminPolylines = {};

function initAdminMap() {
    
    if (adminGMap) return;
    const mapEl = document.getElementById('admin-realtime-map');
    if (!mapEl) return console.warn('[Admin Map] Element not found');

    adminGMap = new google.maps.Map(mapEl, {
        center: { lat: 19.0, lng: -72.5 },
        zoom: 7,
        styles: [
            { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
            { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
            { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
            { featureType: 'administrative.land_parcel', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
            { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#eeeeee' }] },
            { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
            { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#e5e5e5' }] },
            { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
            { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
            { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
            { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9c9c9' }] }
        ],
        mapTypeControl: true,
        fullscreenControl: true
    });

    
    db.ref('drivers').on('value', snap => {
        const driversObj = snap.val() || {};
        Object.keys(adminGMarkers).forEach(k => {
            if (!driversObj[k]) {
                adminGMarkers[k].setMap(null);
                delete adminGMarkers[k];
            }
        });
        Object.entries(driversObj).forEach(([id, drv]) => {
            const loc = drv.location || drv.lastLocation || drv.geo || null;
            if (loc && loc.lat && loc.lng) {
                const pos = { lat: parseFloat(loc.lat), lng: parseFloat(loc.lng) };
                if (!adminGMarkers[id]) {
                    adminGMarkers[id] = new google.maps.Marker({
                        position: pos,
                        map: adminGMap,
                        title: (drv.firstname ? (drv.firstname + ' ' + (drv.lastname || '')) : 'Chauffeur'),
                        icon: {
                            path: google.maps.SymbolPath.CIRCLE,
                            scale: 7,
                            fillColor: drv.isActive ? '#10B981' : '#9CA3AF',
                            fillOpacity: 1,
                            strokeColor: '#fff',
                            strokeWeight: 2
                        },
                        animation: google.maps.Animation.DROP
                    });
                } else {
                    adminGMarkers[id].setPosition(pos);
                }
            }
        });
    });

    
    db.ref('commande_confirmed').on('value', snap => {
        const data = snap.val() || {};
        Object.keys(adminPolylines).forEach(k => {
            if (!data[k]) {
                adminPolylines[k].setMap(null);
                delete adminPolylines[k];
            }
        });

        let active = 0;
        Object.entries(data).forEach(([key, order]) => {
            if (!order) return;
            if (order.status && order.status.toLowerCase().includes('termin')) return;

            active++;
            const driverLoc = order.driverLocation || (order.driver && order.driver.location) || null;
            const clientLoc = order.clientLocation || order.pickupLocation || order.location || null;
            if (driverLoc && clientLoc && driverLoc.lat && driverLoc.lng && clientLoc.lat && clientLoc.lng) {
                const path = [
                    { lat: parseFloat(driverLoc.lat), lng: parseFloat(driverLoc.lng) },
                    { lat: parseFloat(clientLoc.lat), lng: parseFloat(clientLoc.lng) }
                ];
                if (adminPolylines[key]) {
                    adminPolylines[key].setPath(path);
                } else {
                    const pl = new google.maps.Polyline({
                        path: path,
                        strokeColor: '#2563eb',
                        strokeOpacity: 0.85,
                        strokeWeight: 4,
                        geodesic: true,
                        map: adminGMap
                    });
                    adminPolylines[key] = pl;
                }
            }
        });
        const el = document.getElementById('admin-active-trips');
        if (el) {
            el.textContent = `${active} ${active === 1 ? 'course en cours' : 'courses en cours'}`;
        }
    });
}






window.__adm_openOrder = function(orderId) {
    const orders = window.orders || [];
    const o = orders.find(x => x.id === orderId);
    if (!o) return;
    const body = document.getElementById('adm-modal-body');
    const hasClientLocation = o.clientLocation && o.clientLocation.lat && o.clientLocation.lng;
    const mapHtml = hasClientLocation ? `<div id="order-detail-map-${orderId}" style="width:100%;height:250px;margin:12px 0;border-radius:8px;border:1px solid #e5e7eb;"></div>` : '';

    body.innerHTML = `
        <div style="font-size: 14px; line-height: 1.6;">
            <div style="margin-bottom: 8px;"><strong>👤 Client:</strong> ${o.passengerName || 'N/A'}</div>
            <div style="margin-bottom: 8px;"><strong>📞 Téléphone:</strong> ${o.passengerPhone || 'N/A'}</div>
            <div style="margin-bottom: 8px;"><strong>📍 Départ:</strong> ${o.pickup || 'N/A'}</div>
            <div style="margin-bottom: 8px;"><strong>🎯 Destination:</strong> ${o.destination || 'N/A'}</div>
            <div style="margin-bottom: 8px;"><strong>👥 Passagers:</strong> ${o.passengerCount || 1}</div>
            <div style="margin-bottom: 12px;"><strong>💰 Prix proposé:</strong> ${o.proposedPrice ? ('$' + o.proposedPrice) : 'En attente'}</div>
            ${mapHtml}
            <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
                <button class='btn btn-primary' onclick="(function(){ window.__adm_proposePrice('${orderId}') })()">💰 Prix</button>
                <button class='btn btn-secondary' onclick="(function(){ window.__adm_showReassign('${orderId}') })()">👤 Assigner</button>
                <button class='btn btn-secondary' onclick="(function(){ window.__adm_transferOrder('${orderId}') })()">🔄 Transférer</button>
                <button class='btn btn-danger' onclick="(function(){ if(confirm('Supprimer ?')) window.__adm_deleteOrder('${orderId}') })()">🗑️ Supprimer</button>
            </div>
        </div>
    `;

    
    if (hasClientLocation) {
        setTimeout(() => {
            const mapEl = document.getElementById('order-detail-map-' + orderId);
            if (!mapEl) return;
            const detailMap = new google.maps.Map(mapEl, {
                center: { lat: parseFloat(o.clientLocation.lat), lng: parseFloat(o.clientLocation.lng) },
                zoom: 14,
                styles: [
                    { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
                    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9c9c9' }] }
                ]
            });

            
            new google.maps.Marker({
                position: { lat: parseFloat(o.clientLocation.lat), lng: parseFloat(o.clientLocation.lng) },
                map: detailMap,
                title: '📍 Client: ' + (o.passengerName || 'Client'),
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 8,
                    fillColor: '#f59e0b',
                    fillOpacity: 1,
                    strokeColor: '#fff',
                    strokeWeight: 2
                }
            });

            
            const drivers = window.drivers || [];
            if (drivers && Array.isArray(drivers)) {
                drivers.forEach(drv => {
                    const dloc = drv.location || drv.lastLocation || drv.geo;
                    if (dloc && dloc.lat && dloc.lng) {
                        new google.maps.Marker({
                            position: { lat: parseFloat(dloc.lat), lng: parseFloat(dloc.lng) },
                            map: detailMap,
                            title: (drv.firstname || 'Chauffeur') + ' - ' + (drv.isActive ? 'Actif' : 'Inactif'),
                            icon: {
                                path: google.maps.SymbolPath.CIRCLE,
                                scale: 6,
                                fillColor: drv.isActive ? '#10B981' : '#9CA3AF',
                                fillOpacity: 1,
                                strokeColor: '#fff',
                                strokeWeight: 1.5
                            }
                        });
                    }
                });
            }
        }, 200);
    }

    document.getElementById('adm-order-modal').classList.remove('hidden');
};





window.__adm_transferOrder = function(orderId) {
    if (!confirm('Transférer cette commande ?')) return;
    Promise.all([
        db.ref(`commande/${orderId}`).once('value'),
        db.ref(`commande_unconfirmed/${orderId}`).once('value'),
        db.ref(`commande_transfered/${orderId}`).once('value')
    ]).then(([commandeSnap, unconfirmedSnap, transferedSnap]) => {
        const dataCommande = commandeSnap.val() || {};
        const dataUnconfirmed = unconfirmedSnap.val() || {};
        const dataExisting = transferedSnap.val() || {};

        const hasAny = (obj) => obj && typeof obj === 'object' && Object.keys(obj).length > 0;
        if (!hasAny(dataCommande) && !hasAny(dataUnconfirmed) && !hasAny(dataExisting)) {
            return alert('Commande introuvable');
        }

        
        const merged = { ...dataCommande, ...dataUnconfirmed, ...dataExisting };
        merged.transferredAt = merged.transferredAt || new Date().toISOString();

        db.ref(`commande_transfered/${orderId}`).update(merged).then(() => {
            
            if (commandeSnap.exists()) return db.ref(`commande/${orderId}`).remove();
        }).then(() => {
            alert('Commande transférée');
            if (window.renderPending) window.renderPending();
            if (window.renderToday) window.renderToday();
            if (window.updatePendingCount) window.updatePendingCount();
            document.getElementById('adm-order-modal').classList.add('hidden');
        }).catch(err => {
            console.error('Transfer error:', err);
            alert('Erreur transfert');
        });
    });
};


function updatePendingCount() {
    const orders = window.orders || [];
    const count = orders.filter(o => {
        if (!o) return false;
        if (o.source === 'commande_confirmed' || o.status === 'confirmed' || o.status === 'finished') return false;
        return !o.proposedPrice && !o.driverAssigned;
    }).length;
    const el = document.getElementById('sub-pending-count');
    if (el) el.textContent = count;
}





function loadAdminActiveTrips() {
    const listEl = document.getElementById('admin-active-trips-list');
    if (!listEl) return;

    db.ref('commande_confirmed').on('value', snap => {
        const data = snap.val() || {};
        const activeTrips = Object.entries(data).filter(([k, o]) => {
            if (!o) return false;
            return o.status && (o.status.toLowerCase().includes('en route') || o.status.toLowerCase().includes('route'));
        }).map(([k, o]) => {
            const timeElapsed = o.acceptedAt ? Math.round((Date.now() - o.acceptedAt) / 60000) + ' min' : '—';
            return `
                <div class="order-card" style="margin-bottom:8px;">
                    <div class="order-header"><span class="order-status-badge status-pending">En route</span></div>
                    <div class="order-info" style="font-size:12px;">
                        <div class="order-info-label">🚗 ${o.driverName || 'Chauffeur'}</div>
                        <div class="order-info-value">${timeElapsed}</div>
                    </div>
                    <div class="order-info" style="font-size:12px;">
                        <div class="order-info-label">👤 ${o.passengerName || 'Client'}</div>
                        <div class="order-info-value">${o.passengerPhone || ''}</div>
                    </div>
                    <div class="order-info" style="font-size:12px;">
                        <div class="order-info-label">🎯 ${o.destination || '—'}</div>
                    </div>
                </div>
            `;
        });

        listEl.innerHTML = activeTrips.length === 0 
            ? '<div class="p-4 text-center text-gray-600">Aucune course en cours</div>' 
            : activeTrips.join('');
    });
}





function loadModifiedOrders() {
    const listEl = document.getElementById('admin-modified-list');
    if (!listEl) return;

    db.ref('commande_modified').on('value', snap => {
        const data = snap.val() || {};
        const modified = Object.entries(data).map(([k, o]) => {
            if (!o) return '';
            const modDate = o.modifiedAt ? new Date(o.modifiedAt).toLocaleString('fr-FR') : 'Date inconnue';
            return `
                <div class="order-card" style="margin-bottom:8px;">
                    <div class="order-header"><span class="order-status-badge status-pending">Modifiée</span></div>
                    <div class="order-info" style="font-size:12px;">
                        <div class="order-info-label">👤 ${o.passengerName || 'Client'}</div>
                        <div class="order-info-value">${modDate}</div>
                    </div>
                    <div class="order-info" style="font-size:12px;">
                        <div class="order-info-label">📝 ${o.modificationReason || 'Modification'}</div>
                    </div>
                </div>
            `;
        }).filter(x => x);

        listEl.innerHTML = modified.length === 0 
            ? '<div class="p-4 text-center text-gray-600">Aucune modification</div>' 
            : modified.join('');
    });
}





window.__adm_searchClientHistory = function(query) {
    if (!query.trim()) {
        document.getElementById('admin-client-history').innerHTML = '<div class="p-4 text-gray-600">Entrez un téléphone ou nom...</div>';
        return;
    }

    const listEl = document.getElementById('admin-client-history');
    listEl.innerHTML = '<div class="p-4"><i class="fas fa-spinner fa-spin"></i> Recherche...</div>';

    Promise.all([
        db.ref('commande').once('value'),
        db.ref('commande_confirmed').once('value'),
        db.ref('commande_transfered').once('value')
    ]).then(([snap1, snap2, snap3]) => {
        const allOrders = [];
        [snap1, snap2, snap3].forEach(snap => {
            const data = snap.val() || {};
            Object.entries(data).forEach(([k, o]) => {
                if (o && (
                    (o.passengerPhone && o.passengerPhone.includes(query)) ||
                    (o.passengerName && o.passengerName.toLowerCase().includes(query.toLowerCase()))
                )) {
                    allOrders.push({ id: k, ...o });
                }
            });
        });

        listEl.innerHTML = allOrders.length === 0 
            ? '<div class="p-4 text-gray-600">Aucun résultat</div>' 
            : allOrders.map(o => `
                <div class="order-card" style="margin-bottom:8px;">
                    <div class="order-header"><span class="order-status-badge ${o.status === 'finished' ? 'status-assigned' : 'status-pending'}">${o.status || 'En attente'}</span></div>
                    <div class="order-info" style="font-size:12px;">
                        <div class="order-info-label">👤 ${o.passengerName || 'Invité'}</div>
                        <div class="order-info-value">${o.passengerPhone || ''}</div>
                    </div>
                    <div class="order-info" style="font-size:12px;">
                        <div class="order-info-label">📍 ${o.pickup || '—'}</div>
                        <div class="order-info-value">🎯 ${o.destination || '—'}</div>
                    </div>
                </div>
            `).join('');
    }).catch(err => {
        console.error('Search error:', err);
        listEl.innerHTML = '<div class="p-4 text-red-600">Erreur</div>';
    });
};


window.addEventListener('load', () => {
    setTimeout(() => {
        if (window.showSubtab) {
            
            const origShowSubtab = window.showSubtab;
            window.showSubtab = function(key) {
                origShowSubtab(key);
                if (key === 'map') setTimeout(initAdminMap, 300);
                if (key === 'adminfunc') {
                    setTimeout(() => {
                        loadAdminActiveTrips();
                        loadModifiedOrders();
                    }, 300);
                }
            };
        }
    }, 500);
});

console.log('[Admin Enhancements] Loaded successfully');
