(function (global) {
  'use strict';

  // Temporary GPS diagnostic instrumentation (audit phase 0).
  // Observes only: never alters a fix, a threshold or a display decision.
  // Set window.DAXI_GPS_DIAG = false to mute before a production release.

  if (global.DaxiGpsDiag) return;

  var MAX_LINES = 600;
  var T0 = (global._daxiGpsDiagT0 = global._daxiGpsDiagT0 || Date.now());

  var lines = [];
  var counters = {
    fixes: 0,
    duplicates: 0,
    rejects: {},
    display: { A: 0, B: 0, C: 0, D: 0 },
    commits: 0,
    commitSkips: {}
  };
  var state = {
    perm: '?',
    precise: null,
    priority: '?',
    provider: '?',
    request: null,
    lastRawAccuracy: null,
    lastPublishedAccuracy: null,
    lastAgeMs: null,
    satellitesUsed: null,
    satellitesInView: null,
    lastBridgeLatencyMs: null,
    lastSource: null,
    firstFixAtMs: null,
    bestAccuracy: null,
    bestAccuracyAtMs: null
  };

  // Sources of a display write, per audit section 9.
  //   A = native Capacitor watch  -> _daxiOnNativeGpsFix
  //   B = DaxiGpsEngine display loop
  //   C = WebView navigator.geolocation refine loop
  //   D = readNativeGps() / refreshLocation() one-shot
  var SOURCES = { A: 'native-watch', B: 'engine', C: 'webview-refine', D: 'readNativeGps' };

  function enabled() {
    return global.DAXI_GPS_DIAG !== false;
  }

  // vubez2.html replaces console.log/info/debug/warn with a no-op unless
  // window.DAXI_DEBUG is set, which would silence this channel too. Recover a
  // live console from a detached iframe so the lines still reach logcat, without
  // un-muting the whole app. console.error is the fallback: it is left untouched.
  var sink = null;

  function getSink() {
    if (sink) return sink;
    var parent = document.body || document.documentElement;
    if (parent) {
      try {
        var frame = document.createElement('iframe');
        frame.setAttribute('aria-hidden', 'true');
        frame.style.cssText = 'display:none!important;width:0;height:0;border:0';
        parent.appendChild(frame);
        var c = frame.contentWindow && frame.contentWindow.console;
        if (c && typeof c.log === 'function') {
          // Keep the frame referenced: removing it would void contentWindow.
          sink = { log: c.log.bind(c), warn: (c.warn || c.log).bind(c), frame: frame };
          return sink;
        }
        frame.parentNode.removeChild(frame);
      } catch (e) {}
    }
    var err = (typeof console !== 'undefined' && console.error)
      ? console.error.bind(console)
      : function () {};
    // Not cached while the document is still parsing, so the iframe can be
    // retried once a parent node exists.
    var fallback = { log: err, warn: err };
    if (parent) sink = fallback;
    return fallback;
  }

  function sinceBootMs() {
    return Date.now() - T0;
  }

  function stamp() {
    return '+' + (sinceBootMs() / 1000).toFixed(1) + 's';
  }

  function num(v, digits) {
    if (v == null || isNaN(v)) return '?';
    return (+v).toFixed(digits == null ? 0 : digits);
  }

  function fmt(data) {
    if (!data) return '';
    var out = [];
    for (var k in data) {
      if (!Object.prototype.hasOwnProperty.call(data, k)) continue;
      var v = data[k];
      if (v == null || v === '') continue;
      if (typeof v === 'number') v = Math.abs(v) < 1000 ? Math.round(v * 100) / 100 : Math.round(v);
      out.push(k + '=' + v);
    }
    return out.join(' ');
  }

  function emit(tag, msg, data) {
    var line = '[DAXI GPS' + (tag ? '/' + tag : '') + '] ' + stamp() + ' ' + msg;
    var tail = fmt(data);
    if (tail) line += '  ' + tail;
    lines.push(line);
    if (lines.length > MAX_LINES) lines.shift();
    if (!enabled()) return line;
    try {
      var out = getSink();
      if (data && data.warn) out.warn(line);
      else out.log(line);
    } catch (e) {}
    return line;
  }

  // ---------------------------------------------------------------- layer 1/2

  function startup(info) {
    emit('', 'startup', info);
  }

  function permission(info) {
    state.perm = info && info.perm ? info.perm : state.perm;
    if (info && info.precise != null) state.precise = !!info.precise;
    emit('', 'perm', info);
  }

  function request(info) {
    state.request = info || null;
    if (info && info.priority) state.priority = info.priority;
    emit('', 'request', info);
  }

  // Layer 2 — every write to window._daxiLastNativeGps, to expose the race
  // where an older/worse fix overwrites a fresher one (audit section 9).
  function bridgeWrite(origin, next, prev) {
    if (!next) return;
    var ageMs = next.ageMs != null ? +next.ageMs : (next.nativeTs ? Date.now() - next.nativeTs : null);
    var data = {
      origin: origin,
      acc: next.accuracy != null ? num(next.accuracy) + 'm' : 'unknown',
      ageMs: ageMs,
      nativeTs: next.nativeTs || null,
      provider: next.provider || null,
      sats: next.satellitesUsed != null
        ? (next.satellitesUsed + '/' + next.satellitesInView)
        : null,
      bridgeLatency: next.nativeTs ? (Date.now() - next.nativeTs) + 'ms' : null
    };
    if (next.satellitesUsed != null) state.satellitesUsed = next.satellitesUsed;
    if (next.satellitesInView != null) state.satellitesInView = next.satellitesInView;
    if (ageMs != null && isFinite(ageMs)) state.lastAgeMs = ageMs;
    if (next.nativeTs) state.lastBridgeLatencyMs = Date.now() - next.nativeTs;
    if (prev && prev.lat != null) {
      var accWorse = prev.accuracy != null && next.accuracy != null && next.accuracy > prev.accuracy;
      var older = prev.nativeTs && next.nativeTs && next.nativeTs < prev.nativeTs;
      data.prevAcc = prev.accuracy != null ? num(prev.accuracy) + 'm' : 'unknown';
      data.prevAgeS = prev.ts ? ((Date.now() - prev.ts) / 1000).toFixed(1) : null;
      if (older || accWorse) {
        data.warn = true;
        data.RACE = older ? 'older-fix-overwrote-newer' : 'worse-fix-overwrote-better';
      }
    }
    emit('BRIDGE', 'set _daxiLastNativeGps', data);
  }

  function bridgeCacheHit(ageMs) {
    emit('BRIDGE', 'readNativeGps served from 8s JS cache', { age: (ageMs / 1000).toFixed(1) + 's', warn: ageMs > 3000 });
  }

  function bridgeNote(msg, data) {
    emit('BRIDGE', msg, data);
  }

  // ------------------------------------------------------------------ layer 3

  function fix(info) {
    info = info || {};
    counters.fixes += 1;
    state.lastRawAccuracy = info.raw != null ? +info.raw : state.lastRawAccuracy;
    if (info.ageMs != null) state.lastAgeMs = +info.ageMs;
    if (state.firstFixAtMs == null) state.firstFixAtMs = sinceBootMs();
    if (info.raw != null && (state.bestAccuracy == null || +info.raw < state.bestAccuracy)) {
      state.bestAccuracy = +info.raw;
      state.bestAccuracyAtMs = sinceBootMs();
    }
    if (info.provider) state.provider = info.provider;
    var data = {
      raw: info.raw != null ? num(info.raw) + 'm' : '?',
      published: info.published != null ? num(info.published) + 'm' : null,
      age: info.ageMs != null ? (info.ageMs / 1000).toFixed(1) + 's' : null,
      provider: info.provider || null,
      path: info.path || null,
      dup: info.duplicates ? 'x' + info.duplicates : null
    };
    if (info.published != null) state.lastPublishedAccuracy = +info.published;
    if (info.duplicates && info.duplicates > 1) {
      data.warn = true;
      data.FABRICATED = 'same measurement fused ' + info.duplicates + 'x';
    }
    emit('ENGINE', 'fix #' + counters.fixes, data);
  }

  function duplicate(count, info) {
    counters.duplicates += 1;
    emit('ENGINE', 'DUPLICATE measurement', {
      consecutive: count,
      raw: info && info.raw != null ? num(info.raw) + 'm' : null,
      warn: count >= 3
    });
  }

  function reject(reason, ctx) {
    counters.rejects[reason] = (counters.rejects[reason] || 0) + 1;
    var data = { reason: reason, warn: true };
    for (var k in ctx) {
      if (Object.prototype.hasOwnProperty.call(ctx, k)) data[k] = ctx[k];
    }
    emit('ENGINE', 'REJECTED', data);
  }

  // ------------------------------------------------------------------ layer 4

  function display(source, info) {
    info = info || {};
    if (counters.display[source] == null) counters.display[source] = 0;
    counters.display[source] += 1;
    state.lastSource = source;
    emit('DISPLAY', 'write source=' + source + ' (' + (SOURCES[source] || '?') + ')', {
      acc: info.acc != null ? num(info.acc) + 'm' : 'unknown',
      lat: info.lat != null ? (+info.lat).toFixed(6) : null,
      lng: info.lng != null ? (+info.lng).toFixed(6) : null,
      via: info.via || null,
      n: counters.display[source]
    });
  }

  function displaySkip(source, reason, info) {
    counters.commitSkips[reason] = (counters.commitSkips[reason] || 0) + 1;
    var data = { source: source, reason: reason, warn: true };
    for (var k in info) {
      if (Object.prototype.hasOwnProperty.call(info, k)) data[k] = info[k];
    }
    emit('DISPLAY', 'COMMIT SKIPPED', data);
  }

  function displayCommit(source, info) {
    counters.commits += 1;
    emit('DISPLAY', 'COMMIT', {
      source: source,
      acc: info && info.acc != null ? num(info.acc) + 'm' : 'unknown',
      n: counters.commits
    });
  }

  // ------------------------------------------------------------------ readout

  function snapshot() {
    return {
      sinceBootMs: sinceBootMs(),
      perm: state.perm,
      precise: state.precise,
      priority: state.priority,
      provider: state.provider,
      request: state.request,
      fixes: counters.fixes,
      duplicates: counters.duplicates,
      rawAccuracy: state.lastRawAccuracy,
      publishedAccuracy: state.lastPublishedAccuracy,
      ageMs: state.lastAgeMs,
      bridgeLatencyMs: state.lastBridgeLatencyMs,
      ttffMs: state.firstFixAtMs,
      bestAccuracy: state.bestAccuracy,
      bestAccuracyAtMs: state.bestAccuracyAtMs,
      rejects: counters.rejects,
      displayWrites: counters.display,
      commits: counters.commits,
      commitSkips: counters.commitSkips,
      lastSource: state.lastSource
    };
  }

  function dump() {
    var s = snapshot();
    var head = [
      '=== DAXI GPS DIAG =====================================',
      'uptime            : ' + (s.sinceBootMs / 1000).toFixed(1) + 's',
      'permission        : ' + s.perm + (s.precise == null ? '' : (s.precise ? ' (precise)' : ' (APPROXIMATE)')),
      'effective priority: ' + s.priority,
      'request           : ' + (fmt(s.request) || '?'),
      'provider          : ' + s.provider,
      'fixes             : ' + s.fixes + '  duplicates=' + s.duplicates,
      'TTFF              : ' + (s.ttffMs == null ? 'none' : (s.ttffMs / 1000).toFixed(1) + 's'),
      'accuracy #1/best  : ' + (s.bestAccuracy == null ? '?' : num(s.bestAccuracy) + 'm at ' + (s.bestAccuracyAtMs / 1000).toFixed(1) + 's'),
      'raw / published   : ' + num(s.rawAccuracy) + 'm / ' + num(s.publishedAccuracy) + 'm',
      'last fix age      : ' + (s.ageMs == null ? 'UNKNOWN (native timestamp lost at bridge)' : (s.ageMs / 1000).toFixed(1) + 's'),
      'display writes    : ' + fmt(s.displayWrites),
      'commits / skipped : ' + s.commits + ' / ' + (fmt(s.commitSkips) || '0'),
      'rejects           : ' + (fmt(s.rejects) || 'none'),
      '======================================================='
    ].join('\n');
    return head + '\n' + lines.join('\n');
  }

  function tail(n) {
    return lines.slice(-(n || 14));
  }

  global.DaxiGpsDiag = {
    startup: startup,
    permission: permission,
    request: request,
    bridgeWrite: bridgeWrite,
    bridgeCacheHit: bridgeCacheHit,
    bridgeNote: bridgeNote,
    fix: fix,
    duplicate: duplicate,
    reject: reject,
    display: display,
    displaySkip: displaySkip,
    displayCommit: displayCommit,
    snapshot: snapshot,
    dump: dump,
    tail: tail,
    fmt: fmt,
    num: num,
    SOURCES: SOURCES
  };

  // Drain anything the Capacitor bridge queued before this file loaded.
  var queued = global._daxiGpsDiagQueue;
  if (queued && queued.length) {
    for (var i = 0; i < queued.length; i++) {
      var q = queued[i];
      try {
        if (typeof global.DaxiGpsDiag[q[0]] === 'function') global.DaxiGpsDiag[q[0]].apply(null, q.slice(1));
      } catch (e) {}
    }
    global._daxiGpsDiagQueue = [];
  }
})(typeof window !== 'undefined' ? window : this);
