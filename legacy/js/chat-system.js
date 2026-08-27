






const activeChatListeners = new Map();


const translationCache = new Map();


async function fallbackTranslateGoogle(text, sourceLang, targetLang) {
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        
        const res = await fetch(url, { 
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        clearTimeout(timeout);
        
        if (!res.ok) {
            console.warn('[Google Translate] Échec HTTP:', res.status);
            return null;
        }
        
        const data = await res.json();
        
        
        if (data && data[0] && Array.isArray(data[0])) {
            const translatedText = data[0].map(item => item[0]).join('');
            if (translatedText && translatedText.trim() !== text.trim()) {
                return translatedText.trim();
            }
        }
        
        return null;
    } catch(e) {
        console.warn('[Google Translate] Échec:', e.message);
        return null;
    }
}


async function fallbackTranslateMyMemory(text, sourceLang, targetLang) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(sourceLang)}|${encodeURIComponent(targetLang)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error('MyMemory HTTP ' + res.status);
        const data = await res.json();
        return (data?.responseData?.translatedText || '').trim() || text;
    } catch(e) {
        console.warn('[MyMemory] Échec:', e.message);
        return text;
    } finally { 
        clearTimeout(timeout); 
    }
}


const GCLOUD_TRANSLATE_PROXY = (typeof window !== 'undefined' && window.GCLOUD_TRANSLATE_PROXY) ? window.GCLOUD_TRANSLATE_PROXY : null;
async function fallbackTranslatePowerful(text, sourceLang, targetLang) {
    if (!GCLOUD_TRANSLATE_PROXY) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
        const res = await fetch(GCLOUD_TRANSLATE_PROXY, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: text, source: sourceLang, target: targetLang }),
            signal: controller.signal
        });
        if (!res.ok) throw new Error('Proxy HTTP ' + res.status);
        const data = await res.json();
        const out = (data?.translatedText || data?.data?.translatedText || '').trim();
        return out || null;
    } catch (e) {
        console.warn('[Powerful Proxy] Échec:', e.message);
        return null;
    } finally { 
        clearTimeout(timeout); 
    }
}


function detectChatLang(text) {
    try {
        const s = (' ' + (text || '') + ' ').toLowerCase();
        const score = { fr: 0, en: 0, es: 0, ht: 0 };
        const add = (arr, k) => arr.forEach(w => { if (s.indexOf(w) !== -1) score[k]++; });
        
        add([' le ',' la ',' les ',' des ',' et ',' est ',' je ',' tu ',' il ',' elle ',' nous ',' vous ',' ils ',' elles ',' un ',' une ',' du ',' au ',' aux ',' avec ',' pour ',' sur ',' pas ',' plus ',' merci ',' oui ',' non '], 'fr');
        add([' the ',' and ',' you ',' are ',' is ',' with ',' for ',' on ',' not ',' i ',' we ',' they ',' to ',' from ',' hello ',' thank ',' yes ',' no '], 'en');
        add([' el ',' la ',' los ',' las ',' de ',' y ',' que ',' para ',' con ',' no ',' yo ',' tú ',' él ',' ella ',' nosotros ',' vosotros ',' ellos ',' gracias ',' si '], 'es');
        add([' mwen ',' ou ',' li ',' nou ',' yo ',' ak ',' pou ',' pa ',' nan ',' sa ',' ki ',' yon ',' se ',' koman ',' bonjou ',' mesi ',' wi '], 'ht');
        
        let best = 'fr', bestVal = -1;
        for (const k in score) { 
            if (score[k] > bestVal) { 
                best = k; 
                bestVal = score[k]; 
            } 
        }
        return best;
    } catch (e) {
        return 'fr';
    }
}


async function smartTranslate(text, sourceLang, targetLang) {
    if (!text || !text.trim()) return text;
    if (sourceLang === targetLang) return text;

    
    const cacheKey = `${sourceLang}->${targetLang}:${text}`;
    if (translationCache.has(cacheKey)) {
        return translationCache.get(cacheKey);
    }

    
    let translated = await fallbackTranslatePowerful(text, sourceLang, targetLang);
    
    if (!translated) {
        translated = await fallbackTranslateGoogle(text, sourceLang, targetLang);
    }
    
    if (!translated) {
        translated = await fallbackTranslateMyMemory(text, sourceLang, targetLang);
    }
    
    
    if (translated) {
        translationCache.set(cacheKey, translated);
        
        if (translationCache.size > 100) {
            const firstKey = translationCache.keys().next().value;
            translationCache.delete(firstKey);
        }
    }
    
    return translated || text;
}


function displayChatMessage(orderId, msgData, containerSuffix = 'confirmed') {
    try {
        const messagesContainer = document.getElementById(`chat-messages-${containerSuffix}-${orderId}`);
        if (!messagesContainer) {
            console.warn('[Chat] Container not found:', `chat-messages-${containerSuffix}-${orderId}`);
            return;
        }
        
        
        if (messagesContainer.querySelector(`[data-message-id="${msgData.id}"]`)) {
            return;
        }
        
        const el = document.createElement('div');
        el.className = 'order-chat-message my-1';
        el.setAttribute('data-message-id', msgData.id);
        
        
        const currentUserId = localStorage.getItem('userId') || localStorage.getItem('guestId') || localStorage.getItem('adminId') || localStorage.getItem('driverId');
        const isOwnMessage = msgData.senderId === currentUserId;
        
        
        const senderLabel = isOwnMessage 
            ? 'Vous'
            : (msgData.sender || 'Utilisateur');
        
        
        let senderClass = 'text-primary';
        if (msgData.senderType === 'admin') senderClass = 'text-red-600';
        else if (msgData.senderType === 'driver') senderClass = 'text-blue-600';
        
        
        const time = msgData.timestamp ? new Date(msgData.timestamp).toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit'
        }) : '';
        
        el.innerHTML = `
            <span class="font-bold text-xs ${senderClass}">${senderLabel}</span> 
            <span class="text-xs text-gray-500">${time}</span>
            <div class="text-sm">${msgData.message}</div>
        `;
        
        
        const langMenu = document.createElement('select');
        langMenu.className = 'ml-2 text-xs border rounded px-1 py-0.5';
        langMenu.innerHTML = `
            <option value="">Traduire</option>
            <option value="fr">Français</option>
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="ht">Kreyòl</option>
        `;
        el.appendChild(langMenu);
        
        const translationDiv = document.createElement('div');
        translationDiv.className = 'text-xs text-blue-700 mt-1';
        el.appendChild(translationDiv);
        
        langMenu.addEventListener('change', async function() {
            const targetLang = langMenu.value;
            if (!targetLang) {
                translationDiv.textContent = '';
                return;
            }
            const sourceLang = detectChatLang(msgData.message);
            const LANG_LABELS = { fr: 'Français', en: 'English', es: 'Español', ht: 'Kreyòl' };
            if (sourceLang === targetLang) {
                translationDiv.textContent = `Traduction (${LANG_LABELS[targetLang]}) : ${msgData.message}`;
                return;
            }
            translationDiv.textContent = 'Traduction...';
            try {
                const translated = await smartTranslate(msgData.message, sourceLang, targetLang);
                if (translated) {
                    translationDiv.textContent = `Traduction (${LANG_LABELS[targetLang]}) : ${translated}`;
                } else {
                    translationDiv.textContent = 'Erreur de traduction';
                }
            } catch (e) {
                translationDiv.textContent = 'Erreur de traduction';
            }
        });
        
        messagesContainer.appendChild(el);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
    } catch (error) {
        console.error('[Chat] Error displaying message:', error);
    }
}


async function loadChatMessages(orderId, containerSuffix = 'confirmed') {
    try {
        const messagesContainer = document.getElementById(`chat-messages-${containerSuffix}-${orderId}`);
        if (!messagesContainer) {
            console.warn('[Chat] Container not found for loading messages');
            return;
        }
        
        
        const messagesRef = database.ref(`messages/${orderId}`);
        
        
        const snapshot = await messagesRef.once('value');
        
        if (snapshot.exists()) {
            const messages = [];
            snapshot.forEach((childSnapshot) => {
                messages.push({
                    id: childSnapshot.key,
                    ...childSnapshot.val()
                });
            });
            
            
            messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            
            console.log('[Chat] Loading', messages.length, 'messages for order:', orderId);
            
            
            messages.forEach((msgData) => {
                displayChatMessage(orderId, msgData, containerSuffix);
            });
            
            
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
        
        
        startRealtimeChatListener(orderId, containerSuffix);
        
    } catch (error) {
        console.error('[Chat] Error loading messages:', error);
    }
}


function startRealtimeChatListener(orderId, containerSuffix = 'confirmed') {
    const listenerKey = `${orderId}-${containerSuffix}`;
    
    
    if (activeChatListeners.has(listenerKey)) {
        console.log('[Chat] Listener already active for:', listenerKey);
        return;
    }
    
    const messagesRef = database.ref(`messages/${orderId}`);
    
    const onMessageAdded = (snapshot) => {
        const msgId = snapshot.key;
        const msgData = {
            id: msgId,
            ...snapshot.val()
        };
        
        
        const messagesContainer = document.getElementById(`chat-messages-${containerSuffix}-${orderId}`);
        if (messagesContainer && !messagesContainer.querySelector(`[data-message-id="${msgId}"]`)) {
            displayChatMessage(orderId, msgData, containerSuffix);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
            
            
            const currentUserId = localStorage.getItem('userId') || localStorage.getItem('adminId') || localStorage.getItem('driverId');
            if (msgData.senderId !== currentUserId) {
                playNotificationSound();
            }
        }
    };
    
    messagesRef.on('child_added', onMessageAdded);
    
    activeChatListeners.set(listenerKey, {
        ref: messagesRef,
        callback: onMessageAdded
    });
    
    console.log('[Chat] Real-time listener activated for:', listenerKey);
}


function playNotificationSound() {
    try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURE=');
        audio.volume = 0.3;
        audio.play().catch(() => {});
    } catch (e) {}
}


function bindOrderChat(orderId, userType = 'client', userName = 'Utilisateur', containerSuffix = 'confirmed') {
    try {
        const form = document.getElementById(`chat-form-${containerSuffix}-${orderId}`);
        const messages = document.getElementById(`chat-messages-${containerSuffix}-${orderId}`);
        
        if (!form || !messages) {
            console.warn('[Chat] Form or messages container not found');
            return;
        }
        
        if (form.__bound) return; 
        form.__bound = true;
        
        const input = form.querySelector('.chat-input');
        
        
        loadChatMessages(orderId, containerSuffix);
        
        
        const expandBtn = document.getElementById(`chat-expand-${orderId}`);
        const chatBox = document.getElementById(`chat-box-${orderId}`);
        if (expandBtn && chatBox && !expandBtn.__bound) {
            expandBtn.__bound = true;
            expandBtn.dataset.expanded = 'false';
            expandBtn.addEventListener('click', () => {
                const expanded = expandBtn.dataset.expanded === 'true';
                const newState = !expanded;
                expandBtn.dataset.expanded = newState ? 'true' : 'false';
                messages.style.maxHeight = newState ? '360px' : '220px';
                messages.style.height = newState ? '320px' : '160px';
                expandBtn.textContent = newState ? 'Réduire' : 'Agrandir';
                if (newState) {
                    setTimeout(() => { messages.scrollTop = messages.scrollHeight; }, 50);
                }
            });
        }
        
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const msg = (input && input.value || '').trim();
            if (!msg) return;
            
            
            try {
                const userId = localStorage.getItem('userId') || localStorage.getItem('adminId') || localStorage.getItem('driverId') || 'guest';
                
                const messageData = {
                    message: msg,
                    sender: userName,
                    senderType: userType,
                    senderId: userId,
                    timestamp: Date.now(),
                    time: new Date().toISOString(),
                    read: false
                };

                const messageRef = database.ref(`messages/${orderId}`).push();
                const messageId = messageRef.key;
                await messageRef.set(messageData);

                
                try {
                    displayChatMessage(orderId, { id: messageId, ...messageData }, containerSuffix);
                } catch (e) { }

                if (input) input.value = '';
                messages.scrollTop = messages.scrollHeight;
                console.log('[Chat] Message saved to Firebase');
            } catch (error) {
                console.error('[Chat] Error saving message:', error);
            }
        });
        
    } catch (e) {
        console.error('[Chat] Error binding chat:', e);
    }
}

console.log('[Chat System] Loaded successfully');
