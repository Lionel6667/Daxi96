
(function (w) {
  var BASE = (w.DJANGO_CONFIG && w.DJANGO_CONFIG.appApi) || '/api/app/';

  function csrf() {
    var m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : (w.DJANGO_CSRF || '');
  }

  function call(method, path, body) {
    var url = BASE.replace(/\/$/, '') + '/' + String(path || '').replace(/^\//, '');
    var headers = {
      'Accept': 'application/json',
      'X-Daxi-Native': '1',
      'X-Requested-With': 'XMLHttpRequest',
    };
    var token = csrf();
    if (token) headers['X-CSRFToken'] = token;
    var guest = w.localStorage && w.localStorage.getItem('daxi_guest_id');
    if (guest) headers['X-Daxi-Guest-Id'] = guest;
    var opts = { method: method || 'GET', headers: headers, credentials: 'same-origin' };
    if (body != null && method && method.toUpperCase() !== 'GET') {
      headers['Content-Type'] = 'application/json';
      opts.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: 'invalid_json', status: r.status }; });
    });
  }

  w.DaxiAppApi = {
    base: BASE,
    call: call,
    home: function () { return call('GET', 'home/'); },
    me: function () { return call('GET', 'auth/me/'); },
    login: function (email, password, guestId) {
      return call('POST', 'auth/login/', { email: email, password: password, guest_id: guestId || '' });
    },
    createOrder: function (payload) { return call('POST', 'orders/create/', payload); },
    orders: function (tab) { return call('GET', 'orders/?tab=' + encodeURIComponent(tab || 'active')); },
    order: function (id) { return call('GET', 'orders/' + id + '/'); },
    orderStatus: function (id) { return call('GET', 'orders/' + id + '/status/'); },
    confirmPrice: function (id) { return call('POST', 'orders/' + id + '/confirm-price/', {}); },
    refusePrice: function (id) { return call('POST', 'orders/' + id + '/refuse-price/', {}); },
    cancelOrder: function (id) { return call('POST', 'orders/' + id + '/cancel/', {}); },
    initPayment: function (id, method) {
      return call('POST', 'orders/' + id + '/payment/init/', { method: method || 'in_person' });
    },
    chat: function (id) { return call('GET', 'chat/' + id + '/'); },
    sendChat: function (id, content) { return call('POST', 'chat/' + id + '/send/', { content: content }); },
    driverLogin: function (identifier, password) {
      return call('POST', 'driver/login/', { identifier: identifier, password: password });
    },
    driverOrders: function (tab) { return call('GET', 'driver/orders/?tab=' + encodeURIComponent(tab || 'available')); },
    driverAccept: function (id) { return call('POST', 'driver/orders/' + id + '/accept/', {}); },
    catalog: function () { return call('GET', ''); },
  };
})(window);
