if (window.__DAXI_API_LOADED__) {
} else {
window.__DAXI_API_LOADED__ = true;
const API_BASE = '/api';


const Auth = {
  getAccessToken: () => localStorage.getItem('daxi_access'),
  getRefreshToken: () => localStorage.getItem('daxi_refresh'),
  setTokens: (access, refresh) => {
    localStorage.setItem('daxi_access', access);
    if (refresh) localStorage.setItem('daxi_refresh', refresh);
  },
  clearTokens: () => {
    localStorage.removeItem('daxi_access');
    localStorage.removeItem('daxi_refresh');
    localStorage.removeItem('daxi_user');
  },
  getUser: () => {
    try { return JSON.parse(localStorage.getItem('daxi_user') || 'null'); }
    catch { return null; }
  },
  setUser: (user) => localStorage.setItem('daxi_user', JSON.stringify(user)),
  isLoggedIn: () => !!localStorage.getItem('daxi_access'),
};


const AUTH_PUBLIC_ENDPOINTS = [
  '/auth/login/', '/auth/register/', '/auth/verify-otp/', '/auth/resend-otp/',
  '/auth/forgot-password/', '/auth/verify-reset-code/', '/auth/reset-password/',
  '/auth/send-otp-email/', '/auth/send-reset-code/', '/auth/verify-reset-code-simple/',
  '/auth/reset-password-simple/', '/auth/token/refresh/',
];

function isPublicAuthEndpoint(endpoint) {
  const path = endpoint.startsWith('http')
    ? new URL(endpoint).pathname.replace(/^\/api/, '')
    : endpoint.split('?')[0];
  return AUTH_PUBLIC_ENDPOINTS.some((p) => path === p || path.endsWith(p));
}

async function apiRequest(method, endpoint, data = null, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const headers = { 'Content-Type': 'application/json' };

  const token = Auth.getAccessToken();
  if (token && !isPublicAuthEndpoint(endpoint)) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = { method, headers, credentials: 'same-origin', ...options };
  const csrf = getCSRFToken();
  if (csrf && method !== 'GET' && method !== 'HEAD') {
    headers['X-CSRFToken'] = csrf;
  }
  if (data && !(data instanceof FormData)) {
    config.body = JSON.stringify(data);
  } else if (data instanceof FormData) {
    delete headers['Content-Type'];
    config.body = data;
  }

  let response = await fetch(url, { ...config, credentials: 'same-origin' });


  if (response.status === 401 && Auth.getRefreshToken()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${Auth.getAccessToken()}`;
      config.headers = headers;
      response = await fetch(url, config);
    } else {
      Auth.clearTokens();
      window.location.href = '/login/';
      return null;
    }
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw { status: response.status, ...err };
  }

  if (response.status === 204) return null;
  return response.json();
}

async function refreshAccessToken() {
  const refresh = Auth.getRefreshToken();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/token/refresh/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCSRFToken() || '',
      },
      credentials: 'same-origin',
      body: JSON.stringify({ refresh })
    });
    if (!res.ok) return false;
    const data = await res.json();
    Auth.setTokens(data.access, data.refresh);
    return true;
  } catch {
    return false;
  }
}

const get = (endpoint, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiRequest('GET', qs ? `${endpoint}?${qs}` : endpoint);
};
const post = (endpoint, data) => apiRequest('POST', endpoint, data);
const patch = (endpoint, data) => apiRequest('PATCH', endpoint, data);
const del = (endpoint) => apiRequest('DELETE', endpoint);


const AuthAPI = {
  async register(data) {
    return post('/auth/register/', data);
  },
  async verifyOTP(email, code) {
    return post('/auth/verify-otp/', { email, code });
  },
  async resendOTP(email) {
    return post('/auth/resend-otp/', { email });
  },
  async login(email, password) {
    const res = await post('/auth/login/', { email, password });
    if (res?.tokens) {
      Auth.setTokens(res.tokens.access, res.tokens.refresh);
      Auth.setUser(res.user);
    }
    return res;
  },
  async logout() {
    try {
      await post('/auth/logout/', { refresh: Auth.getRefreshToken() });
    } catch {}
    Auth.clearTokens();
  },
  async getProfile() {
    return get('/auth/profile/');
  },
  async updateProfile(data) {
    return apiRequest('PATCH', '/auth/profile/', data);
  },
  async changePassword(oldPassword, newPassword) {
    return post('/auth/change-password/', { old_password: oldPassword, new_password: newPassword });
  },
  async forgotPassword(email) {
    return post('/auth/forgot-password/', { email });
  },
  async verifyResetCode(email, code) {
    return post('/auth/verify-reset-code/', { email, code });
  },
  async resetPassword(email, code, newPassword) {
    return post('/auth/reset-password/', { email, code, new_password: newPassword });
  },
};


const OrdersAPI = {
  async create(data) {
    return post('/orders/', data);
  },
  async getMyOrders(status = null) {
    return get('/orders/my/', status ? { status } : {});
  },
  async getOrder(id, guestId = null) {
    return get(`/orders/${id}/`, guestId ? { guest_id: guestId } : {});
  },
  async getAllOrders(params = {}) {
    const res = await get('/orders/all/', { page_size: 500, ...params });
    return Array.isArray(res) ? res : (res.results || []);
  },
  async updateStatus(id, newStatus) {
    return patch(`/orders/${id}/status/`, { status: newStatus });
  },
  async proposePrice(id, price) {
    return patch(`/orders/${id}/propose-price/`, { price });
  },
  async confirmPrice(id) {
    return patch(`/orders/${id}/confirm-price/`, {});
  },
  async assignDriver(id, driverId) {
    return patch(`/orders/${id}/assign-driver/`, { driver_id: driverId });
  },
  async getMessages(id) {
    return get(`/orders/${id}/messages/`);
  },
  async sendMessage(id, content, senderType = 'user', senderName = '') {
    return post(`/orders/${id}/messages/`, { content, sender_type: senderType, sender_name: senderName });
  },
  async deleteOrder(id) {
    return del(`/orders/${id}/delete/`);
  },
};


const DriversAPI = {
  async getAll(params = {}) {
    return get('/drivers/', params);
  },
  async getDriver(id) {
    return get(`/drivers/${id}/`);
  },
  async create(data) {
    const fd = new FormData();
    Object.entries(data).forEach(([k, v]) => v !== undefined && fd.append(k, v));
    return apiRequest('POST', '/drivers/create/', fd);
  },
  async update(id, data) {
    const fd = new FormData();
    Object.entries(data).forEach(([k, v]) => v !== undefined && fd.append(k, v));
    return apiRequest('PATCH', `/drivers/${id}/update/`, fd);
  },
  async updateStatus(id, status) {
    return patch(`/drivers/${id}/status/`, { status });
  },
  async updateLocation(id, latitude, longitude) {
    return patch(`/drivers/${id}/location/`, { latitude, longitude });
  },
  async block(id, blocked = true) {
    return patch(`/drivers/${id}/block/`, { blocked });
  },
  async delete(id) {
    return del(`/drivers/${id}/delete/`);
  },
  async getReviews(id) {
    return get(`/drivers/${id}/reviews/`);
  },
  async submitReview(driverId, rating, comment, orderId) {
    return post(`/drivers/${driverId}/reviews/create/`, { rating, comment, order_id: orderId });
  },
  async getMyProfile() {
    return get('/drivers/me/');
  },
};


const AdminAPI = {
  async getDashboardStats() {
    return get('/admin-panel/stats/');
  },
  async getUsers(search = '') {
    return get('/admin-panel/users/', search ? { search } : {});
  },
  async blockUser(id, blocked) {
    return patch(`/admin-panel/users/${id}/block/`, { blocked });
  },
  async getPendingOrders(status = 'pending') {
    return get('/admin-panel/pending-orders/', { status });
  },
  async getAvailableDrivers() {
    return get('/admin-panel/available-drivers/');
  },
  async syncSession() {
    return post('/admin-panel/sync-session/', {});
  },
  async getLiveMap() {
    return get('/admin-panel/live-map/');
  },
  async getClients(search = '') {
    return get('/admin-panel/clients/', search ? { search } : {});
  },
  async getClientDetail(params = {}) {
    return get('/admin-panel/clients/detail/', params);
  },
  async blockContact(data) {
    return post('/admin-panel/clients/block/', data);
  },
  async getForumPostsAdmin() {
    return get('/forum/admin/posts/');
  },
};


const BlogAPI = {
  async getArticles(params = {}) {
    const q = new URLSearchParams(params).toString();
    return get('/blog/articles/' + (q ? '?' + q : ''));
  },
  async getArticle(slug) {
    return get('/blog/articles/' + slug + '/');
  },
  async getCategories() {
    return get('/blog/categories/');
  },
  async getTags() {
    return get('/blog/tags/');
  },
};


const ForumAPI = {
  async getPosts() {
    return get('/forum/posts/');
  },
  async createPost(content, imageFile = null) {
    const fd = new FormData();
    fd.append('content', content);
    if (imageFile) fd.append('image', imageFile);
    return apiRequest('POST', '/forum/posts/', fd);
  },
  async deletePost(id) {
    return del(`/forum/posts/${id}/`);
  },
  async likePost(id) {
    return post(`/forum/posts/${id}/like/`, {});
  },
  async getComments(postId) {
    return get(`/forum/posts/${postId}/comments/`);
  },
  async addComment(postId, content) {
    return post(`/forum/posts/${postId}/comments/`, { content });
  },
  async getAttractions() {
    return get('/forum/attractions/');
  },
};


const ChatbotAPI = {
  async sendMessage(message, sessionId = null, language = 'fr') {
    const guestId = localStorage.getItem('daxi_guest_id') || generateGuestId();
    return post('/chatbot/message/', {
      message,
      session_id: sessionId,
      language,
      guest_id: guestId,
    });
  },
  async getHistory(sessionId) {
    return get(`/chatbot/history/${sessionId}/`);
  },
  async getAdminSessions() {
    return get('/chatbot/admin/sessions/');
  },
  async resolveSession(sessionId) {
    return patch(`/chatbot/admin/sessions/${sessionId}/resolve/`, {});
  },
  async adminReply(sessionId, content) {
    return post(`/chatbot/admin/sessions/${sessionId}/reply/`, { content });
  },
};


const NotificationsAPI = {
  async getAll() {
    return get('/notifications/');
  },
  async getUnreadCount() {
    return get('/notifications/unread-count/');
  },
  async markRead(id) {
    return patch(`/notifications/${id}/read/`, {});
  },
  async markAllRead() {
    return post('/notifications/mark-all-read/', {});
  },
};


class WSManager {
  constructor(url, handlers = {}) {
    this.url = url;
    this.handlers = handlers;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnects = 5;
    this.connect();
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let url = this.url;
    const token = typeof Auth !== 'undefined' ? Auth.getAccessToken() : localStorage.getItem('daxi_access');
    if (token && url.includes('/ws/admin/')) {
      url += (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token);
    }
    this.ws = new WebSocket(`${protocol}//${window.location.host}${url}`);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.handlers.onOpen?.();
    };

    this.ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        this.handlers.onMessage?.(data);

        if (data.event && this.handlers[data.event]) {
          this.handlers[data.event](data.data);
        }
      } catch {}
    };

    this.ws.onclose = () => {
      this.handlers.onClose?.();
      if (this.reconnectAttempts < this.maxReconnects) {
        this.reconnectAttempts++;
        setTimeout(() => this.connect(), 2000 * this.reconnectAttempts);
      }
    };

    this.ws.onerror = (e) => this.handlers.onError?.(e);
  }

  send(data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  close() {
    this.maxReconnects = 0;
    this.ws?.close();
  }
}


function generateGuestId() {
  const id = 'guest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('daxi_guest_id', id);
  return id;
}

function showToast(message, type = 'success') {
  if (typeof window.showDaxiNotification === 'function') {
    const title = type === 'error' ? 'Erreur' : (type === 'warning' ? 'Attention' : 'Daxi');
    window.showDaxiNotification(title, message, { type: type === 'success' ? 'success' : type });
    return;
  }
  const toast = document.createElement('div');
  const colors = {
    success: 'bg-green-500',
    error: 'bg-red-500',
    warning: 'bg-yellow-500',
    info: 'bg-blue-500',
  };
  toast.className = `fixed bottom-4 right-4 z-50 ${colors[type] || colors.success} text-white px-6 py-3 rounded-xl shadow-lg font-medium text-sm transition-all duration-300`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function getStatusBadge(status) {
  const badges = {
    pending: '<span class="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">En attente</span>',
    price_proposed: '<span class="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">Prix proposé</span>',
    price_confirmed: '<span class="px-2 py-1 text-xs bg-indigo-100 text-indigo-800 rounded-full">Prix confirmé</span>',
    driver_assigned: '<span class="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded-full">Chauffeur assigné</span>',
    on_way: '<span class="px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded-full">En route</span>',
    arrived: '<span class="px-2 py-1 text-xs bg-teal-100 text-teal-800 rounded-full">Arrivé</span>',
    in_progress: '<span class="px-2 py-1 text-xs bg-cyan-100 text-cyan-800 rounded-full">En cours</span>',
    completed: '<span class="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">Terminé</span>',
    cancelled: '<span class="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">Annulé</span>',
  };
  return badges[status] || `<span class="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded-full">${status}</span>`;
}


function getCSRFToken() {
  const meta = document.querySelector('meta[name="csrf-token"]');
  if (meta && meta.content) return meta.content;
  const match = document.cookie.split(';').find((c) => c.trim().startsWith('csrftoken='));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=').trim()) : '';
}

function formatPrice(value, decimals = 2) {
  if (value == null || value === '') return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  const d = Number.isFinite(decimals) ? Math.max(0, Math.floor(decimals)) : 2;
  if (d <= 0) return '$' + amount.toFixed(0);
  return '$' + amount.toFixed(d);
}

window.Auth = Auth;
window.AuthAPI = AuthAPI;
window.OrdersAPI = OrdersAPI;
window.DriversAPI = DriversAPI;
window.AdminAPI = AdminAPI;
window.BlogAPI = BlogAPI;
window.ForumAPI = ForumAPI;
window.ChatbotAPI = ChatbotAPI;
window.NotificationsAPI = NotificationsAPI;
window.WSManager = WSManager;
window.apiRequest = apiRequest;
window.getCSRFToken = getCSRFToken;
window.formatPrice = formatPrice;
} 