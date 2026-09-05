(function (global) {
  'use strict';

  // In-app readout for DaxiGpsDiag (audit phase 0, item 0.5).
  // Meant for outdoor field testing where logcat is impractical.
  // Opens on 7 taps inside the top-left 90x90px corner, or DaxiGpsDiagPanel.toggle().

  if (global.DaxiGpsDiagPanel) return;

  var el = null;
  var timer = null;

  function diag() {
    return global.DaxiGpsDiag || null;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function row(label, value, warn) {
    return '<div style="display:flex;gap:8px;justify-content:space-between">'
      + '<span style="opacity:.55">' + esc(label) + '</span>'
      + '<span style="' + (warn ? 'color:#ff6b6b;font-weight:600' : 'color:#e8e8e8') + '">' + esc(value) + '</span></div>';
  }

  function render() {
    var d = diag();
    var body = document.getElementById('daxi-gps-diag-body');
    if (!d || !body) return;
    var s = d.snapshot();
    var n = d.num;
    var w = s.displayWrites || {};
    var concurrent = [w.A, w.B, w.C, w.D].filter(function (x) { return x > 0; }).length > 1;
    var skips = Object.keys(s.commitSkips).reduce(function (a, k) { return a + s.commitSkips[k]; }, 0);
    body.innerHTML = [
      row('uptime', (s.sinceBootMs / 1000).toFixed(1) + 's'),
      row('permission', s.perm + (s.precise === false ? ' APPROX' : ''), s.precise === false),
      row('priority', s.priority, /BALANCED|LOW/.test(String(s.priority))),
      row('request', d.fmt(s.request) || '-', s.request && s.request.maxDelay > 0),
      row('provider', s.provider),
      row('fixes', s.fixes + (s.duplicates ? '  dup=' + s.duplicates : ''), s.duplicates > 0),
      row('TTFF', s.ttffMs == null ? '-' : (s.ttffMs / 1000).toFixed(1) + 's'),
      row('acc raw', n(s.rawAccuracy) + 'm', s.rawAccuracy > 50),
      row('acc published', n(s.publishedAccuracy) + 'm',
        s.publishedAccuracy != null && s.rawAccuracy != null && s.publishedAccuracy < s.rawAccuracy),
      row('best acc', s.bestAccuracy == null ? '-' : n(s.bestAccuracy) + 'm @' + (s.bestAccuracyAtMs / 1000).toFixed(1) + 's'),
      row('fix age', s.ageMs == null ? 'UNKNOWN' : (s.ageMs / 1000).toFixed(1) + 's', s.ageMs == null || s.ageMs > 5000),
      row('bridge latency', s.bridgeLatencyMs == null ? '-' : s.bridgeLatencyMs + 'ms', s.bridgeLatencyMs > 2000),
      row('display A/B/C/D', [w.A || 0, w.B || 0, w.C || 0, w.D || 0].join(' / '), concurrent),
      row('commit ok/skip', (s.commits || 0) + ' / ' + skips, skips > s.commits),
      row('skip reasons', d.fmt(s.commitSkips) || 'none', skips > 0),
      row('rejects', d.fmt(s.rejects) || 'none', Object.keys(s.rejects).length > 0),
      '<div style="margin-top:7px;padding-top:6px;border-top:1px solid rgba(255,255,255,.12);'
        + 'opacity:.6;font-size:9px;line-height:1.4;max-height:130px;overflow:auto">'
        + d.tail(14).map(esc).join('<br>')
        + '</div>'
    ].join('');
  }

  function toggle() {
    if (el) {
      el.remove();
      el = null;
      if (timer) { clearInterval(timer); timer = null; }
      return false;
    }
    if (!diag()) return false;
    el = document.createElement('div');
    el.id = 'daxi-gps-diag-panel';
    el.style.cssText = 'position:fixed;z-index:2147483647;top:8px;left:8px;right:8px;max-width:352px;'
      + 'background:rgba(8,11,20,.94);color:#e8e8e8;font:11px/1.5 ui-monospace,Menlo,Consolas,monospace;'
      + 'padding:9px 11px;border:1px solid rgba(212,175,55,.45);border-radius:10px;'
      + 'box-shadow:0 8px 24px rgba(0,0,0,.55)';
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:7px">'
      + '<b style="color:#d4af37;letter-spacing:.05em">DAXI GPS DIAG</b><span>'
      + '<button type="button" data-act="copy" style="background:#1b2233;color:#e8e8e8;border:0;border-radius:6px;padding:3px 9px;font:inherit">copier</button> '
      + '<button type="button" data-act="close" style="background:#1b2233;color:#e8e8e8;border:0;border-radius:6px;padding:3px 9px;font:inherit">&times;</button>'
      + '</span></div><div id="daxi-gps-diag-body"></div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (ev) {
      var act = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-act');
      if (act === 'close') { toggle(); return; }
      if (act !== 'copy') return;
      var text = diag().dump();
      try {
        if (navigator.clipboard) navigator.clipboard.writeText(text);
        else console.log(text);
      } catch (e) { console.log(text); }
      ev.target.textContent = 'ok';
      setTimeout(function () { if (ev.target) ev.target.textContent = 'copier'; }, 1200);
    });
    render();
    timer = setInterval(render, 500);
    return true;
  }

  var taps = [];
  function arm() {
    document.addEventListener('pointerdown', function (ev) {
      if (ev.clientX > 90 || ev.clientY > 90) return;
      var now = Date.now();
      taps.push(now);
      taps = taps.filter(function (t) { return now - t < 3000; });
      if (taps.length >= 7) {
        taps = [];
        toggle();
      }
    }, { passive: true, capture: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm);
  else arm();

  global.DaxiGpsDiagPanel = { toggle: toggle, render: render };
})(typeof window !== 'undefined' ? window : this);
