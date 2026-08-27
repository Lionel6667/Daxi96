importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');


const firebaseConfig = {
    apiKey: "AIzaSyCdGFcwfzj8b5eJXcmrS0LGRIxnTXZ6zac",
    authDomain: "julmin-taxis.firebaseapp.com",
    databaseURL: "https://julmin-taxis-default-rtdb.firebaseio.com",
    projectId: "julmin-taxis",
    storageBucket: "julmin-taxis.firebasestorage.app",
    messagingSenderId: "392925120550",
    appId: "1:392925120550:web:2935808aab4ead6d7d7ee7"
};


firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();


messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Message reçu en arrière-plan:', payload);

    const notificationTitle = payload.notification?.title || 'Julmin Taxis';
    const isUrgent = payload.data?.urgent === '1' || payload.data?.event === 'sos_alert';
    const notificationOptions = {
        body: payload.notification?.body || 'Vous avez une nouvelle notification',
        icon: payload.notification?.icon || '/img/logo.png',
        badge: '/img/badge.png',
        tag: payload.data?.tag || 'julmin-taxis',
        requireInteraction: isUrgent,
        vibrate: isUrgent ? [400, 120, 400, 120, 600] : [200, 100, 200],
        silent: false,
        data: payload.data || {},
        actions: payload.data?.actions ? JSON.parse(payload.data.actions) : [
            { action: 'open', title: 'Ouvrir', icon: '/img/open-icon.png' },
            { action: 'close', title: 'Fermer', icon: '/img/close-icon.png' }
        ]
    };

    return self.registration.showNotification(notificationTitle, notificationOptions);
});


self.addEventListener('notificationclick', (event) => {
    console.log('[firebase-messaging-sw.js] Notification cliquée:', event.notification.tag);
    event.notification.close();

    const data = event.notification.data || {};
    let url = data.url || data.deep_link || data.link || '/';

    if (event.action === 'close') {
        return;
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.focus();
                    if (url && url !== '/') {
                        client.navigate(url);
                    }
                    return;
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(url);
            }
        })
    );
});
