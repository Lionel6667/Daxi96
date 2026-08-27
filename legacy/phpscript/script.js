
const CONFIG = {
    API_URL: 'api.php',
    MAX_MESSAGE_LENGTH: 2000,
    TYPING_DELAY: 1000,
    TOAST_DURATION: 3000
};


const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const clearChatBtn = document.getElementById('clearChat');
const toggleThemeBtn = document.getElementById('toggleTheme');
const typingIndicator = document.getElementById('typingIndicator');
const charCount = document.getElementById('charCount');
const toast = document.getElementById('toast');
const suggestionBtns = document.querySelectorAll('.suggestion-btn');
const attachFileBtn = document.getElementById('attachFile');
const imageInput = document.getElementById('imageInput');
const imagePreview = document.getElementById('imagePreview');
const previewImg = document.getElementById('previewImg');
const removeImageBtn = document.getElementById('removeImage');


let conversationHistory = [];
let isProcessing = false;
let currentImage = null;


document.addEventListener('DOMContentLoaded', () => {
    loadConversationHistory();
    setupEventListeners();
    adjustTextareaHeight();
});


function setupEventListeners() {
    
    sendBtn.addEventListener('click', sendMessage);
    
    
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    
    messageInput.addEventListener('input', () => {
        adjustTextareaHeight();
        updateCharCount();
    });

    
    messageInput.addEventListener('input', updateCharCount);

    
    clearChatBtn.addEventListener('click', clearChat);

    
    toggleThemeBtn.addEventListener('click', toggleTheme);

    
    suggestionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const prompt = btn.getAttribute('data-prompt');
            messageInput.value = prompt;
            sendMessage();
        });
    });

    
    attachFileBtn.addEventListener('click', () => {
        imageInput.click();
    });

    imageInput.addEventListener('change', handleImageSelect);
    removeImageBtn.addEventListener('click', removeImage);
}


function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('Veuillez sélectionner une image', 'error');
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        showToast('Image trop grande (max 5MB)', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        currentImage = e.target.result;
        previewImg.src = currentImage;
        imagePreview.style.display = 'block';
        showToast('Image ajoutée', 'success');
    };
    reader.readAsDataURL(file);
}


function removeImage() {
    currentImage = null;
    imagePreview.style.display = 'none';
    previewImg.src = '';
    imageInput.value = '';
}


async function sendMessage() {
    const message = messageInput.value.trim();
    
    if ((!message && !currentImage) || isProcessing) return;
    
    if (message.length > CONFIG.MAX_MESSAGE_LENGTH) {
        showToast('Message trop long !', 'error');
        return;
    }

    isProcessing = true;
    sendBtn.disabled = true;

    
    const welcomeMsg = document.querySelector('.welcome-message');
    if (welcomeMsg) {
        welcomeMsg.style.display = 'none';
    }

    
    addMessage(message, 'user', currentImage);
    
    
    messageInput.value = '';
    updateCharCount();
    adjustTextareaHeight();
    
    const imageToSend = currentImage;
    removeImage();

    
    showTypingIndicator();

    try {
        
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message || 'Analyse cette image',
                image: imageToSend,
                history: conversationHistory
            })
        });

        const data = await response.json();

        if (data.success) {
            
            setTimeout(() => {
                hideTypingIndicator();
                addMessage(data.response, 'bot');
                
                
                conversationHistory.push({
                    role: 'user',
                    content: message || 'Image envoyée',
                    image: imageToSend
                });
                conversationHistory.push({
                    role: 'bot',
                    content: data.response
                });
                
                saveConversationHistory();
            }, CONFIG.TYPING_DELAY);
        } else {
            hideTypingIndicator();
            showToast(data.error || 'Erreur lors de l\'envoi du message', 'error');
        }
    } catch (error) {
        hideTypingIndicator();
        showToast('Erreur de connexion au serveur', 'error');
        console.error('Error:', error);
    } finally {
        isProcessing = false;
        sendBtn.disabled = false;
        messageInput.focus();
    }
}


function addMessage(text, type, image = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}-message`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = type === 'user' 
        ? '<i class="fas fa-user"></i>' 
        : '<i class="fas fa-robot"></i>';
    
    const content = document.createElement('div');
    content.className = 'message-content';
    
    
    if (image) {
        const img = document.createElement('img');
        img.src = image;
        img.className = 'message-image';
        img.onclick = () => window.open(image, '_blank');
        content.appendChild(img);
    }
    
    
    if (text) {
        const formattedText = formatMessage(text);
        const textSpan = document.createElement('div');
        textSpan.innerHTML = formattedText;
        content.appendChild(textSpan);
    }
    
    const time = document.createElement('span');
    time.className = 'message-time';
    time.textContent = getCurrentTime();
    content.appendChild(time);
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
}


function formatMessage(text) {
    
    text = text.replace(/\n/g, '<br>');
    
    
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__(.*?)__/g, '<strong>$1</strong>');
    
    
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    text = text.replace(/_(.*?)_/g, '<em>$1</em>');
    
    
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    
    text = text.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    
    
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    
    return text;
}


function showTypingIndicator() {
    typingIndicator.style.display = 'block';
    scrollToBottom();
}

function hideTypingIndicator() {
    typingIndicator.style.display = 'none';
}


function adjustTextareaHeight() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
}

function updateCharCount() {
    const count = messageInput.value.length;
    charCount.textContent = `${count}/${CONFIG.MAX_MESSAGE_LENGTH}`;
    
    if (count > CONFIG.MAX_MESSAGE_LENGTH * 0.9) {
        charCount.style.color = 'var(--danger-color)';
    } else {
        charCount.style.color = 'var(--text-secondary)';
    }
}

function scrollToBottom() {
    setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 100);
}

function getCurrentTime() {
    const now = new Date();
    return now.toLocaleTimeString('fr-FR', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    
    setTimeout(() => {
        toast.className = 'toast';
    }, CONFIG.TOAST_DURATION);
}


function clearChat() {
    if (confirm('Êtes-vous sûr de vouloir effacer toute la conversation ?')) {
        conversationHistory = [];
        messagesContainer.innerHTML = `
            <div class="welcome-message">
                <i class="fas fa-robot"></i>
                <h2>Bienvenue sur Gemini AI</h2>
                <p>Je suis votre assistant intelligent. Comment puis-je vous aider aujourd'hui ?</p>
                <div class="suggestions">
                    <button class="suggestion-btn" data-prompt="Explique-moi comment fonctionne l'intelligence artificielle">
                        <i class="fas fa-brain"></i> Intelligence Artificielle
                    </button>
                    <button class="suggestion-btn" data-prompt="Écris-moi un poème sur la nature">
                        <i class="fas fa-leaf"></i> Créer un poème
                    </button>
                    <button class="suggestion-btn" data-prompt="Aide-moi à apprendre JavaScript">
                        <i class="fas fa-code"></i> Apprendre à coder
                    </button>
                    <button class="suggestion-btn" data-prompt="Donne-moi des conseils pour être productif">
                        <i class="fas fa-lightbulb"></i> Productivité
                    </button>
                </div>
            </div>
        `;
        
        
        document.querySelectorAll('.suggestion-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const prompt = btn.getAttribute('data-prompt');
                messageInput.value = prompt;
                sendMessage();
            });
        });
        
        saveConversationHistory();
        showToast('Conversation effacée', 'success');
    }
}


function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    const icon = toggleThemeBtn.querySelector('i');
    icon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    
    showToast(`Mode ${newTheme === 'dark' ? 'sombre' : 'clair'} activé`, 'success');
}


function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    const icon = toggleThemeBtn.querySelector('i');
    icon.className = savedTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}


function saveConversationHistory() {
    try {
        localStorage.setItem('conversationHistory', JSON.stringify(conversationHistory));
    } catch (e) {
        console.error('Failed to save conversation history:', e);
    }
}

function loadConversationHistory() {
    try {
        const saved = localStorage.getItem('conversationHistory');
        if (saved) {
            conversationHistory = JSON.parse(saved);
            
            
            if (conversationHistory.length > 0) {
                document.querySelector('.welcome-message').style.display = 'none';
                
                conversationHistory.forEach(msg => {
                    addMessage(msg.content, msg.role, msg.image);
                });
            }
        }
        
        loadTheme();
    } catch (e) {
        console.error('Failed to load conversation history:', e);
        conversationHistory = [];
    }
}


window.chatBot = {
    sendMessage,
    clearChat,
    toggleTheme
};
