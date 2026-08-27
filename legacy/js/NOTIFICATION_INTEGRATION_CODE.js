







function setupTripCompletionListener(orderId) {
    const orderRef = database.ref(`commande_confirmed/${orderId}`);
    
    orderRef.on('value', (snapshot) => {
        const order = snapshot.val();
        if (!order) return;
        
        const currentStatus = order.status;
        
        
        if (currentStatus === 'completed' && !order._notificationSent) {
            
            sendPostTripNotification(
                orderId,
                order.userId,
                order.driverName || 'Votre chauffeur',
                currentLanguage
            );
            
            
            database.ref(`commande_confirmed/${orderId}/_notificationSent`).set(true);
        }
    });
}


function sendPostTripNotification(orderId, userId, driverName, language = 'fr') {
    fetch('/phpscript/post_trip_notification.php?action=thank_you', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            orderId: orderId,
            userId: userId,
            driverName: driverName,
            language: language,
        }),
    })
    .then(response => response.json())
    .then(data => {
        console.log('[POST-TRIP] Notification envoyée:', data);
    })
    .catch(error => {
        console.error('[POST-TRIP] Erreur:', error);
    });
}







async function updateOrderStatus(driverId, driverToken, orderId, newStatus, additionalData = {}) {
    try {
        
        const response = await fetch('/phpscript/driver_security.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                action: 'update_status',
                driverId: driverId,
                token: driverToken,
                orderId: orderId,
                data: JSON.stringify({
                    status: newStatus,
                    ...additionalData,
                }),
            }).toString(),
        });
        
        const validation = await response.json();
        
        if (validation.error) {
            console.error('[SECURITY] Erreur validation:', validation.error);
            toastWarning(validation.error);
            return false;
        }
        
        
        const updateData = {
            status: newStatus,
            lastStatusUpdate: firebase.database.ServerValue.TIMESTAMP,
            updatedBy: driverId,
            ...additionalData,
        };
        
        
        await database.ref(`commande_confirmed/${orderId}`).update(updateData);
        
        console.log('[DRIVER] Statut mis à jour:', newStatus);
        toastSuccess(`✅ Statut mis à jour: ${newStatus}`);
        
        return true;
    } catch (error) {
        console.error('[DRIVER] Erreur mise à jour statut:', error);
        toastWarning('Erreur lors de la mise à jour du statut');
        return false;
    }
}



async function updateDriverLocation(driverId, driverToken, orderId, latitude, longitude) {
    
    if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
        toastWarning('Position invalide');
        return false;
    }
    
    try {
        
        const response = await fetch('/phpscript/driver_security.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                action: 'update_location',
                driverId: driverId,
                token: driverToken,
                orderId: orderId,
                data: JSON.stringify({
                    latitude: latitude,
                    longitude: longitude,
                }),
            }).toString(),
        });
        
        const validation = await response.json();
        
        if (validation.error) {
            console.error('[LOCATION] Erreur:', validation.error);
            toastWarning('Position invalide');
            return false;
        }
        
        
        const location = validation.validation.location;
        await database.ref(`commande_confirmed/${orderId}`).update({
            driverLatitude: location.latitude,
            driverLongitude: location.longitude,
            lastLocationUpdate: firebase.database.ServerValue.TIMESTAMP,
        });
        
        return true;
    } catch (error) {
        console.error('[LOCATION] Erreur:', error);
        return false;
    }
}







function setupForegroundNotifications() {
    messaging.onMessage((payload) => {
        console.log('[FCM] Message reçu en premier plan:', payload);
        
        const data = payload.data || {};
        const title = payload.notification?.title || 'Notification';
        const body = payload.notification?.body || '';
        
        
        notificationSound.play().catch(e => console.log('Son désactivé:', e));
        
        
        switch (data.type) {
            case 'reminder_24h':
            case 'reminder_30min':
            case 'reminder_1h':
                
                showReminderNotification(title, body, data);
                break;
            
            case 'post_trip_thank_you':
                
                showPostTripNotification(title, body, data);
                break;
            
            case 'price_offer':
                
                showPriceOfferNotification(title, body, data);
                break;
            
            case 'failed_trip':
                
                showFailedTripNotification(title, body, data);
                break;
            
            default:
                
                showToast(body, 'info');
        }
    });
}


function showReminderNotification(title, body, data) {
    const notificationDiv = document.createElement('div');
    notificationDiv.className = 'modern-notification-toast toast-type-info show';
    notificationDiv.innerHTML = `
        <div class="toast-bg-glow toast-type-info"></div>
        <div class="toast-icon-container toast-type-info">
            <svg class="toast-icon-inner" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <div class="toast-icon-ring"></div>
        </div>
        <div class="toast-text-content">
            <div class="toast-text-title">${title}</div>
            <div class="toast-text-message">${body}</div>
        </div>
        <button class="toast-close-btn">×</button>
    `;
    
    document.body.appendChild(notificationDiv);
    
    
    setTimeout(() => {
        notificationDiv.classList.remove('show');
        setTimeout(() => notificationDiv.remove(), 300);
    }, 5000);
    
    
    notificationDiv.querySelector('.toast-close-btn').addEventListener('click', () => {
        notificationDiv.classList.remove('show');
        setTimeout(() => notificationDiv.remove(), 300);
    });
}


function showPostTripNotification(title, body, data) {
    const notificationDiv = document.createElement('div');
    notificationDiv.className = 'modern-notification-toast toast-type-success show';
    notificationDiv.innerHTML = `
        <div class="toast-bg-glow toast-type-success"></div>
        <div class="toast-icon-container toast-type-success">
            <svg class="toast-icon-inner" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
        </div>
        <div class="toast-text-content">
            <div class="toast-text-title">${title}</div>
            <div class="toast-text-message">${body}</div>
            <button class="mt-3 px-4 py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600" onclick="window.location.href='/?section=history'">
                Noter le trajet →
            </button>
        </div>
        <button class="toast-close-btn">×</button>
    `;
    
    document.body.appendChild(notificationDiv);
    
    
    setTimeout(() => {
        notificationDiv.classList.remove('show');
        setTimeout(() => notificationDiv.remove(), 300);
    }, 8000);
}


function showFailedTripNotification(title, body, data) {
    const notificationDiv = document.createElement('div');
    notificationDiv.className = 'modern-notification-toast toast-type-error show';
    notificationDiv.innerHTML = `
        <div class="toast-bg-glow toast-type-error"></div>
        <div class="toast-icon-container toast-type-error">
            <svg class="toast-icon-inner" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
        </div>
        <div class="toast-text-content">
            <div class="toast-text-title">${title}</div>
            <div class="toast-text-message">${body}</div>
            <button class="mt-3 px-4 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600" onclick="window.location.href='/?section=history'">
                Voir le détail →
            </button>
        </div>
        <button class="toast-close-btn">×</button>
    `;
    
    document.body.appendChild(notificationDiv);
    
    
    setTimeout(() => {
        notificationDiv.classList.remove('show');
        setTimeout(() => notificationDiv.remove(), 300);
    }, 10000);
}






function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.log('[Notifications] Non supportées par le navigateur');
        return;
    }
    
    if (Notification.permission === 'granted') {
        console.log('[Notifications] Permission déjà accordée');
        return;
    }
    
    if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                console.log('[Notifications] Permission accordée');
                
                if (typeof messaging !== 'undefined') {
                    messaging.getToken({
                        vapidKey: 'BPsvNMF0v2XilPFDCMub9-F0Vao4lNw7bDlTZ_RuIneOy37xNkiXHr2WCidf_HD5kxOI9uiZ_7momDE5apV8shg'
                    }).then(token => {
                        if (token) {
                            saveNotificationToken(token);
                        }
                    });
                }
            }
        });
    }
}


function saveNotificationToken(token) {
    const userId = localStorage.getItem('userId');
    if (!userId) return;
    
    database.ref(`notification_tokens/${userId}`).set({
        token: token,
        platform: 'web',
        userType: 'client',
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        lastSeen: firebase.database.ServerValue.TIMESTAMP,
    }).then(() => {
        console.log('[Token] Enregistré avec succès');
    }).catch(error => {
        console.error('[Token] Erreur d\'enregistrement:', error);
    });
}






document.addEventListener('DOMContentLoaded', () => {
    
    requestNotificationPermission();
    
    
    setupForegroundNotifications();
});
