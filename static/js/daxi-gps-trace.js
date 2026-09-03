(function (global) {
  'use strict';

  var PREFIX = '[DAXI-GPS-TRACE]';
  var MAX = 80;
  var REJECT_ACCURACY_M = 5000;
  var IMPRECISE_ACCURACY_M = 500;
  var DEFAULT_TIMEOUT_MS = 12000;
  var submittedKeys = {};
  // Console muted by default. Set window.DAXI_GPS_TRACE_VERBOSE = true to debug.

  function ts() {
    return new Date().toISOString();
  }

  function pick(obj, keys) {
    var out = {};
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (obj[k] != null && obj[k] !== '') out[k] = obj[k];
    }
    return out;
  }

  function log(side, step, data) {
    data = data || {};
    var entry = {
      ts: ts(),
      side: side,
      step: step,
      ok: data.ok !== false,
      lat: data.lat,
      lng: data.lng,
      accuracy: data.accuracy,
      source: data.source,
      httpStatus: data.httpStatus,
      reason: data.reason,
      orderId: data.orderId,
      driverId: data.driverId,
      channel: data.channel,
      extra: data.extra
    };
    // Hard mute: never spam console (enable only with window.DAXI_GPS_TRACE_VERBOSE = true).
    try {
      if (global.DAXI_GPS_TRACE_VERBOSE) {
        if (data.ok === false) console.warn(PREFIX, step, entry);
        else console.log(PREFIX, step, entry);
      }
    } catch (e) {}
    // Cap memory log aggressively for high-frequency fixes.
    if (step === 'WEB_GPS_FIX') {
      var last = (global._daxiGpsTraceLog || [])[(global._daxiGpsTraceLog || []).length - 1];
      if (last && last.step === 'WEB_GPS_FIX' && last.side === side
          && Math.abs((+new Date(entry.ts)) - (+new Date(last.ts || 0))) < 2000) {
        last.ts = entry.ts;
        last.lat = entry.lat;
        last.lng = entry.lng;
        last.accuracy = entry.accuracy;
        return last;
      }
    }
    global._daxiGpsTraceLog = global._daxiGpsTraceLog || [];
    global._daxiGpsTraceLog.push(entry);
    if (global._daxiGpsTraceLog.length > MAX) {
      global._daxiGpsTraceLog.shift();
    }
    return entry;
  }

  function ok(side, step, data) {
    return log(side, step, Object.assign({}, data || {}, { ok: true }));
  }

  function fail(side, step, data) {
    return log(side, step, Object.assign({}, data || {}, { ok: false }));
  }

  var CHAIN_STEPS = [
    { key: 'GPS', patterns: [/GPS_OBTAINED/, /GPS_PRIME/, /DRIVER_GPS_OBTAINED/, /WEB_GPS/] },
    { key: 'LOCAL_UI', patterns: [/LOCAL_UI/, /DRIVER_MAP_UI/, /CLIENT_PIN_UI/] },
    { key: 'SEND', patterns: [/POST_.*_SEND/, /WS_.*_SEND/, /SEND_LOCATION/, /THROTTLED/] },
    { key: 'BACKEND', patterns: [/BACKEND_.*RECEIVED/, /BACKEND_.*RESPONSE/, /VALIDATE_DRIVER_GPS/] },
    { key: 'DATABASE', patterns: [/SAVED/, /DATABASE/] },
    { key: 'WEBSOCKET', patterns: [/WS_.*RECV/, /WS_BROADCAST/, /BROADCAST/] },
    { key: 'OTHER_USER_UI', patterns: [/DRIVER_UI_APPLY/, /CLIENT_UI_APPLY/, /OTHER_USER_UI/] }
  ];

  function matches(step, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      if (patterns[i].test(step)) return true;
    }
    return false;
  }

  function printChain(side, orderId) {
    var entries = (global._daxiGpsTraceLog || []).filter(function (e) {
      if (e.side !== side) return false;
      if (orderId != null && e.orderId != null && String(e.orderId) !== String(orderId)) return false;
      return true;
    });
    var chain = {};
    var failed = [];
    CHAIN_STEPS.forEach(function (s) {
      chain[s.key] = { ok: false, fail: false, lastStep: null };
    });
    entries.forEach(function (e) {
      CHAIN_STEPS.forEach(function (s) {
        if (matches(e.step, s.patterns)) {
          chain[s.key].lastStep = e.step;
          if (e.ok) chain[s.key].ok = true;
          else chain[s.key].fail = true;
        }
      });
      if (!e.ok) failed.push(e);
    });
    var line = ['GPS', 'LOCAL_UI', 'SEND', 'BACKEND', 'DATABASE', 'WEBSOCKET', 'OTHER_USER_UI'].map(function (k) {
      var c = chain[k];
      if (c.fail) return k + ' ❌';
      if (c.ok) return k + ' ✓';
      return k + ' —';
    }).join(' → ');
    if (!global.DAXI_GPS_TRACE_VERBOSE) return { chain: chain, failures: failed, line: line };
    console.log(PREFIX + ' CHAIN ' + side + ': ' + line);
    if (failed.length) console.warn(PREFIX + ' FAILURES', failed);
    return { chain: chain, failures: failed, line: line };
  }

  global.DaxiGpsTrace = {
    log: log,
    ok: ok,
    fail: fail,
    printChain: printChain,
    gps: function (side, data) {
      return ok(side, side + '_GPS_OBTAINED', pick(data, ['lat', 'lng', 'accuracy', 'source', 'orderId', 'driverId', 'extra']));
    },
    throttle: function (side, channel, data) {
      return fail(side, side + '_SEND_THROTTLED', Object.assign({ channel: channel, reason: 'throttle' }, pick(data, ['lat', 'lng', 'accuracy', 'source', 'orderId', 'driverId'])));
    }
  };

  function envInfo() {
    return {
      https: global.location && global.location.protocol === 'https:',
      user_agent: navigator.userAgent || '',
      platform: navigator.platform || '',
      gps_supported: !!(navigator && navigator.geolocation),
      language: navigator.language || '',
      on_line: typeof navigator.onLine === 'boolean' ? navigator.onLine : null
    };
  }

  function isExploitable(acc, threshold) {
    return isFinite(acc) && acc > 0 && acc <= threshold && acc <= REJECT_ACCURACY_M;
  }

  function isPrecise(acc, target) {
    return isFinite(acc) && acc > 0 && acc <= target;
  }

  function ensureStatusEl(side) {
    return null;
  }

  function setUserMessage(side, key, autoHideMs) {
    return;
  }

  var sessions = {};

  function getSession(side) {
    return sessions[side];
  }

  function getCsrf() {
    if (typeof global.getCsrf === 'function') return global.getCsrf();
    var m = document.cookie.match(/csrftoken=([^;]+)/);
    return m ? m[1] : '';
  }

  function buildReport(side) {
    var s = sessions[side];
    if (!s) return null;
    var elapsed = Date.now() - s.startedAt;
    return Object.assign({}, envInfo(), {
      side: side,
      permission: s.permission,
      watch_started: s.watchStarted,
      fixes_received: s.fixesReceived,
      best_accuracy: s.bestAccuracy,
      last_accuracy: s.lastAccuracy,
      last_lat: s.lastLat,
      last_lng: s.lastLng,
      elapsed_ms: elapsed,
      exploitable: s.exploitable,
      position_obtained: s.fixesReceived > 0,
      error: s.lastError,
      error_code: s.lastErrorCode,
      report_reason: s.reportReason,
      events: s.events.slice(-40)
    });
  }

  function submitReport(side, reason, force) {
    var s = sessions[side];
    if (!s) return;
    if (s.submitted && !force) return;
    var key = side + ':' + reason;
    if (!force && submittedKeys[key]) return;
    submittedKeys[key] = true;
    s.reportReason = reason;
    var report = buildReport(side);
    if (!report) return;
  if (!force && reason === 'timeout' && s.exploitable) return;

    s.submitted = true;
    log(side, 'WEB_GPS_DIAGNOSTIC_SEND', { ok: true, extra: { reason: reason, report: report } });

    try {
      fetch('/htmx/gps-diagnostic/', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrf()
        },
        body: JSON.stringify(report)
      }).catch(function () {});
    } catch (e) {}
  }

  function scheduleFailureReport(side, timeoutMs) {
    var s = sessions[side];
    if (!s) return;
    if (s.reportTimeoutId) clearTimeout(s.reportTimeoutId);
    s.reportTimeoutId = setTimeout(function () {
      if (!s.exploitable) {
        submitReport(side, 'timeout');
      }
    }, timeoutMs || DEFAULT_TIMEOUT_MS);
  }

  function queryPermission(side) {
    var s = sessions[side];
    if (!s) return;
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(function (p) {
        s.permission = p.state;
        log(side, 'WEB_GPS_PERMISSION', { ok: p.state !== 'denied', extra: { permission: p.state } });
        if (p.state === 'denied') {
          submitReport(side, 'permission_denied');
        }
        p.onchange = function () {
          s.permission = p.state;
          if (p.state === 'granted' && !s.watchStarted) {
            global.DaxiWebGps && global.DaxiWebGps.ensureWatch(side);
          }
        };
      }).catch(function () {
        s.permission = 'unknown';
      });
    }
  }

  function recordFix(side, pos, meta) {
    meta = meta || {};
    var s = sessions[side];
    if (!s || !pos || !pos.coords) return;

    var acc = pos.coords.accuracy || 99999;
    var lat = pos.coords.latitude;
    var lng = pos.coords.longitude;
    var elapsed = Date.now() - s.startedAt;
    var obtained = true;
    var exploitable = isExploitable(acc, s.exploitableThreshold);
    var precise = isPrecise(acc, s.targetAccuracy);
    var reason = null;

    if (acc > REJECT_ACCURACY_M) {
      reason = 'accuracy_reject_km';
      exploitable = false;
    } else if (acc > IMPRECISE_ACCURACY_M) {
      reason = 'accuracy_imprecise';
    } else if (!exploitable) {
      reason = 'accuracy_above_threshold';
    }

    s.fixesReceived += 1;
    s.lastAccuracy = acc;
    s.lastLat = lat;
    s.lastLng = lng;

    if (s.bestAccuracy == null || acc < s.bestAccuracy) {
      s.bestAccuracy = acc;
    }

    var event = {
      ts: ts(),
      type: meta.type || 'watchPosition',
      lat: lat,
      lng: lng,
      accuracy: acc,
      elapsed_ms: elapsed,
      obtained: obtained,
      exploitable: exploitable,
      precise: precise,
      reason: reason
    };
    s.events.push(event);

    log(side, 'WEB_GPS_FIX', {
      lat: lat,
      lng: lng,
      accuracy: acc,
      source: meta.source || 'navigator.geolocation',
      ok: exploitable,
      reason: reason,
      extra: { type: meta.type, precise: precise }
    });

    if (exploitable) {
      var prev = s.exploitableBest;
      if (!prev || acc < prev.accuracy - 1) {
        s.exploitableBest = {
          lat: lat,
          lng: lng,
          accuracy: acc,
          time: pos.timestamp || Date.now()
        };
        s.exploitable = true;
        global._daxiWebGpsExploitableFix = s.exploitableBest;
        if (prev && prev.accuracy > s.exploitableThreshold && acc <= s.exploitableThreshold) {
          submitReport(side, 'major_improvement', true);
        }
      }
    }

    return event;
  }

  function recordError(side, err, meta) {
    meta = meta || {};
    var s = sessions[side];
    if (!s) return;
    var code = err && err.code;
    var msg = (err && (err.message || String(err))) || 'unknown';
    var label = 'UNKNOWN';
    if (code === 1) label = 'PERMISSION_DENIED';
    else if (code === 2) label = 'POSITION_UNAVAILABLE';
    else if (code === 3) label = 'TIMEOUT';

    s.lastError = label + ':' + msg;
    s.lastErrorCode = code;
    s.events.push({
      ts: ts(),
      error: label,
      message: msg,
      type: meta.type || 'getCurrentPosition',
      elapsed_ms: Date.now() - s.startedAt
    });

    fail(side, 'WEB_GPS_ERROR', {
      reason: label,
      extra: { message: msg, type: meta.type }
    });

    if (code === 1) {
      s.permission = 'denied';
      submitReport(side, 'permission_denied');
    } else {
      submitReport(side, 'error_' + label.toLowerCase());
    }
  }

  global.DaxiWebGps = {
    REJECT_ACCURACY_M: REJECT_ACCURACY_M,
    IMPRECISE_ACCURACY_M: IMPRECISE_ACCURACY_M,

    startSession: function (side, opts) {
      opts = opts || {};
      sessions[side] = {
        side: side,
        startedAt: Date.now(),
        permission: 'unknown',
        watchStarted: false,
        fixesReceived: 0,
        bestAccuracy: null,
        lastAccuracy: null,
        lastLat: null,
        lastLng: null,
        lastError: null,
        lastErrorCode: null,
        exploitable: false,
        exploitableBest: null,
        submitted: false,
        reportTimeoutId: null,
        hideTimer: null,
        uiState: 'searching',
        exploitableThreshold: opts.exploitableM || 120,
        targetAccuracy: opts.targetAccuracy || 50,
        events: []
      };
      queryPermission(side);
      scheduleFailureReport(side, opts.timeoutMs || DEFAULT_TIMEOUT_MS);
      log(side, 'WEB_GPS_SESSION_START', { ok: true, extra: opts });
      return sessions[side];
    },

    getSession: getSession,
    recordFix: recordFix,
    recordError: recordError,
    recordRawPosition: function (side, pos, meta) {
      return recordFix(side, pos, meta);
    },
    recordEngineFix: function (side, fix, source) {
      if (!fix) return;
      var acc = fix.rawAccuracy || fix.accuracy || 99999;
      recordFix(side, {
        coords: {
          latitude: fix.lat,
          longitude: fix.lng,
          accuracy: acc,
          speed: fix.speed,
          heading: fix.heading
        },
        timestamp: fix.timestamp || Date.now()
      }, { type: 'DaxiGpsEngine', source: source || 'navigator.geolocation' });
    },
    markWatchStarted: function (side) {
      var s = sessions[side];
      if (s) s.watchStarted = true;
    },
    setUserMessage: setUserMessage,
    buildReport: buildReport,
    submitReport: submitReport,
    getExploitableFix: function (side) {
      var s = sessions[side];
      return s && s.exploitableBest ? s.exploitableBest : global._daxiWebGpsExploitableFix;
    },
    isExploitable: isExploitable
  };
})(typeof window !== 'undefined' ? window : this);
