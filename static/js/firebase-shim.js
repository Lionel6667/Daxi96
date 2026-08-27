
(function (window) {
    'use strict';

    const API_BASE = '/api/fb';
    const WS_URL = (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host + '/ws/fb/';




    const _preload = window.DJANGO_PRELOAD || {};

    function _getPreloadedData(path) {
        path = (path || '').replace(/^\/+|\/+$/g, '');
        if (!path) return _preload;

        const parts = path.split('/');
        let data = _preload;
        for (const p of parts) {
            if (data && typeof data === 'object') {
                data = data[p];
            } else {
                return undefined;
            }
        }
        return data;
    }


    let _ws = null;
    let _wsReady = false;
    let _wsQueue = [];
    let _wsReconnectTimer = null;
    const _wsListeners = new Map();

    function _getWS() {
        if (_ws && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) {
            return _ws;
        }
        _wsReady = false;
        _ws = new WebSocket(WS_URL);

        _ws.onopen = () => {
            _wsReady = true;

            _wsListeners.forEach((listeners, path) => {
                if (listeners.length > 0) {
                    _ws.send(JSON.stringify({ type: 'subscribe', path }));
                }
            });

            _wsQueue.forEach(msg => _ws.send(msg));
            _wsQueue = [];
        };

        _ws.onmessage = (evt) => {
            try {
                const msg = JSON.parse(evt.data);
                const path = (msg.path || '').replace(/^\/+|\/+$/g, '');
                const eventType = msg.type;


                if (msg.data !== undefined && path) {
                    const parts = path.split('/');
                    let obj = _preload;
                    for (let i = 0; i < parts.length - 1; i++) {
                        if (!obj[parts[i]]) obj[parts[i]] = {};
                        obj = obj[parts[i]];
                    }
                    if (eventType === 'removed') {
                        delete obj[parts[parts.length - 1]];
                    } else {
                        obj[parts[parts.length - 1]] = msg.data;
                    }
                }

                _wsListeners.forEach((listeners, listenPath) => {
                    const isMatch = path === listenPath || path.startsWith(listenPath + '/');
                    if (!isMatch) return;

                    listeners.forEach(({ event, callback, context }) => {
                        if (event === 'value' && (eventType === 'value' || eventType === 'removed')) {
                            const snapshot = _makeSnapshot(msg.data, path);
                            try { callback.call(context || null, snapshot); } catch (e) { console.error('[fb-shim] listener error', e); }
                        } else if (event === eventType) {
                            const key = path.split('/').pop();
                            const snapshot = _makeSnapshot(msg.data, path, key);
                            try { callback.call(context || null, snapshot); } catch (e) { console.error('[fb-shim] listener error', e); }
                        }
                    });
                });
            } catch (e) {
                console.warn('[fb-shim] WS parse error', e);
            }
        };

        _ws.onerror = (e) => {
            console.warn('[fb-shim] WebSocket error', e);
        };

        _ws.onclose = () => {
            _wsReady = false;
            if (_wsReconnectTimer) clearTimeout(_wsReconnectTimer);
            _wsReconnectTimer = setTimeout(_getWS, 3000);
        };

        return _ws;
    }

    function _wsSend(msg) {
        const json = JSON.stringify(msg);
        if (_wsReady && _ws && _ws.readyState === WebSocket.OPEN) {
            _ws.send(json);
        } else {
            _wsQueue.push(json);
            _getWS();
        }
    }


    function _getCsrf() {
        const m = document.cookie.match(/csrftoken=([^;]+)/);
        return m ? m[1] : '';
    }

    function _request(method, path, body) {
        const url = API_BASE + '/' + path.replace(/^\/+/, '');
        const opts = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': _getCsrf(),
            },
        };
        if (body !== undefined) opts.body = JSON.stringify(body);
        return fetch(url, opts).then(r => r.json());
    }


    function _makeSnapshot(data, path, key) {
        path = (path || '').replace(/^\/+|\/+$/g, '');
        const _key = key !== undefined ? key : (path ? path.split('/').pop() : null);

        return {
            val: () => data,
            exists: () => data !== null && data !== undefined,
            key: _key,
            ref: _makeRef(path),
            forEach: (cb) => {
                if (data && typeof data === 'object' && !Array.isArray(data)) {
                    for (const [k, v] of Object.entries(data)) {
                        const child = _makeSnapshot(v, path + '/' + k, k);
                        if (cb(child) === true) break;
                    }
                }
            },
            child: (childPath) => {
                const cp = childPath.replace(/^\/+|\/+$/g, '');
                const parts = cp.split('/');
                let d = data;
                for (const p of parts) {
                    d = (d && typeof d === 'object') ? d[p] : undefined;
                }
                return _makeSnapshot(d, path + '/' + cp, parts[parts.length - 1]);
            },
            numChildren: () => {
                if (data && typeof data === 'object' && !Array.isArray(data)) return Object.keys(data).length;
                return 0;
            },
        };
    }


    function _makeRef(path, _query) {
        path = (path || '').replace(/^\/+|\/+$/g, '');
        _query = _query || {};

        const ref = {
            path,
            key: path ? path.split('/').pop() : null,

            child: (childPath) => _makeRef(path + '/' + childPath.replace(/^\/+/, '')),


            orderByChild: (field) => _makeRef(path, { ..._query, orderBy: field }),
            orderByKey: () => _makeRef(path, { ..._query, orderBy: '__key__' }),
            orderByValue: () => _makeRef(path, { ..._query, orderBy: '__value__' }),
            equalTo: (value) => _makeRef(path, { ..._query, equalTo: value }),
            startAt: (value) => _makeRef(path, { ..._query, startAt: value }),
            endAt: (value) => _makeRef(path, { ..._query, endAt: value }),
            limitToFirst: (n) => _makeRef(path, { ..._query, limitToFirst: n }),
            limitToLast: (n) => _makeRef(path, { ..._query, limitToLast: n }),


            once: (event) => {
                if (event !== 'value') return Promise.resolve(_makeSnapshot(null, path));


                const preloaded = _getPreloadedData(path);
                if (preloaded !== undefined) {
                    let data = preloaded;

                    if (_query.orderBy && _query.equalTo !== undefined && typeof data === 'object') {
                        const filtered = {};
                        for (const [k, v] of Object.entries(data)) {
                            if (v && typeof v === 'object' && String(v[_query.orderBy]) === String(_query.equalTo)) {
                                filtered[k] = v;
                            }
                        }
                        data = filtered;
                    }

                    _fetchAndUpdateCache(path);
                    return Promise.resolve(_makeSnapshot(data, path));
                }


                return _fetchFromServer(path, _query);
            },


            on: (event, callback, cancelCallback, context) => {
                if (!_wsListeners.has(path)) _wsListeners.set(path, []);
                const entry = { event, callback, context };
                _wsListeners.get(path).push(entry);

                _wsSend({ type: 'subscribe', path });

                if (event === 'value') {

                    const preloaded = _getPreloadedData(path);
                    if (preloaded !== undefined) {
                        let data = preloaded;
                        if (_query.orderBy && _query.equalTo !== undefined && typeof data === 'object') {
                            const filtered = {};
                            for (const [k, v] of Object.entries(data)) {
                                if (v && typeof v === 'object' && String(v[_query.orderBy]) === String(_query.equalTo)) {
                                    filtered[k] = v;
                                }
                            }
                            data = filtered;
                        }
                        setTimeout(() => {
                            try { callback.call(context || null, _makeSnapshot(data, path)); } catch (e) { }
                        }, 0);

                        _fetchFromServer(path, _query).then(snapshot => {
                            try { callback.call(context || null, snapshot); } catch (e) { }
                        }).catch(() => { });
                    } else {
                        _fetchFromServer(path, _query).then(snapshot => {
                            try { callback.call(context || null, snapshot); } catch (e) { }
                        }).catch(() => { });
                    }
                }

                return callback;
            },


            off: (event, callback) => {
                if (!_wsListeners.has(path)) return;
                if (!event && !callback) {
                    _wsListeners.delete(path);
                    _wsSend({ type: 'unsubscribe', path });
                } else {
                    const list = _wsListeners.get(path).filter(e => {
                        if (event && e.event !== event) return true;
                        if (callback && e.callback !== callback) return true;
                        return false;
                    });
                    _wsListeners.set(path, list);
                    if (list.length === 0) {
                        _wsListeners.delete(path);
                        _wsSend({ type: 'unsubscribe', path });
                    }
                }
            },


            set: (data) => {

                _updatePreloadCache(path, data);
                return _request('PUT', path + '/', data).then(() => undefined);
            },

            update: (data) => {

                if (data && typeof data === 'object') {
                    const existing = _getPreloadedData(path);
                    if (existing && typeof existing === 'object') {
                        _updatePreloadCache(path, { ...existing, ...data });
                    }
                }
                return _request('PATCH', path + '/', data).then(() => undefined);
            },

            remove: () => {
                _updatePreloadCache(path, null);
                return _request('DELETE', path + '/', undefined).then(() => undefined);
            },

            push: (data) => {
                if (data === undefined || data === null) {
                    const key = _generatePushKey();
                    const newRef = _makeRef(path + '/' + key);
                    newRef.key = key;
                    _request('POST', 'push-key/' + path + '/', {}).catch(() => { });
                    return newRef;
                }
                const key = _generatePushKey();
                const newRef = _makeRef(path + '/' + key);
                newRef.key = key;

                _updatePreloadCache(path + '/' + key, data);
                _request('PUT', path + '/' + key + '/', data).catch(e => console.error('[fb-shim] push error', e));
                return newRef;
            },

            transaction: (updateFn) => {
                return ref.once('value').then(snapshot => {
                    const currentVal = snapshot.val();
                    const newVal = updateFn(currentVal);
                    if (newVal === undefined) {
                        return { committed: false, snapshot };
                    }
                    _updatePreloadCache(path, newVal);
                    return _request('POST', 'transaction/' + path + '/', { value: newVal }).then(resp => {
                        return { committed: true, snapshot: _makeSnapshot(resp.value, path) };
                    });
                });
            },
        };

        return ref;
    }

    function _fetchFromServer(path, query) {
        const url = API_BASE + '/' + path + '/';
        const params = new URLSearchParams();
        if (query && query.orderBy) params.set('orderBy', query.orderBy);
        if (query && query.equalTo !== undefined) params.set('equalTo', String(query.equalTo));
        const fullUrl = params.toString() ? url + '?' + params.toString() : url;
        return fetch(fullUrl).then(r => r.json()).then(resp => {

            if (resp.data !== undefined) {
                _updatePreloadCache(path, resp.data);
            }
            return _makeSnapshot(resp.data, path);
        });
    }

    function _fetchAndUpdateCache(path) {

        fetch(API_BASE + '/' + path + '/').then(r => r.json()).then(resp => {
            if (resp.data !== undefined) {
                _updatePreloadCache(path, resp.data);
            }
        }).catch(() => { });
    }

    function _updatePreloadCache(path, data) {
        path = (path || '').replace(/^\/+|\/+$/g, '');
        if (!path) return;
        const parts = path.split('/');
        let obj = _preload;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!obj[parts[i]] || typeof obj[parts[i]] !== 'object') {
                obj[parts[i]] = {};
            }
            obj = obj[parts[i]];
        }
        if (data === null || data === undefined) {
            delete obj[parts[parts.length - 1]];
        } else {
            obj[parts[parts.length - 1]] = data;
        }
    }


    const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
    let _lastPushTime = 0;
    let _lastRandChars = new Array(12).fill(0);

    function _generatePushKey() {
        let now = Date.now();
        const dupl = now === _lastPushTime;
        _lastPushTime = now;
        const timeChars = new Array(8);
        for (let i = 7; i >= 0; i--) {
            timeChars[i] = PUSH_CHARS.charAt(now % 64);
            now = Math.floor(now / 64);
        }
        let id = timeChars.join('');
        if (!dupl) {
            for (let i = 0; i < 12; i++) _lastRandChars[i] = Math.floor(Math.random() * 64);
        } else {
            let i;
            for (i = 11; i >= 0 && _lastRandChars[i] === 63; i--) _lastRandChars[i] = 0;
            _lastRandChars[i]++;
        }
        for (let i = 0; i < 12; i++) id += PUSH_CHARS.charAt(_lastRandChars[i]);
        return id;
    }


    const _messagingStub = {
        getToken: () => Promise.resolve(null),
        onMessage: () => () => { },
        requestPermission: () => Promise.resolve(),
        usePublicVapidKey: () => { },
    };


    const _appStub = {
        name: '[DEFAULT]',
        options: {},
    };


    const _db = {
        ref: (path) => _makeRef(path || ''),
        goOnline: () => { _getWS(); },
        goOffline: () => { if (_ws) _ws.close(); },
    };

    _db.constructor = {};
    const _databaseFn = function () { return _db; };
    _databaseFn.ServerValue = {
        TIMESTAMP: { '.sv': 'timestamp' },
    };

    const firebase = {
        initializeApp: (config) => {
            console.info('[fb-shim] Firebase replaced by Django backend. Preloaded', Object.keys(_preload).length, 'data paths.');
            setTimeout(_getWS, 500);
            return _appStub;
        },
        app: () => _appStub,
        database: _databaseFn,
        messaging: () => _messagingStub,
        auth: () => ({
            currentUser: null,
            signInWithEmailAndPassword: () => Promise.resolve({ user: null }),
            signOut: () => Promise.resolve(),
            onAuthStateChanged: (cb) => { cb(null); return () => { }; },
        }),
    };


    window.firebase = firebase;
    Object.defineProperty(window, '_fbShimReady', { value: true, writable: false });

})(window);