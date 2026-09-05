
(function (global) {
  'use strict';

  var DAXI_INTRO_ENABLED = true;
  try {
    if (typeof global._daxiBootMark === 'function') global._daxiBootMark('intro-js');
  } catch (eIntroJs) {}





  var EASE = {
    gravity: 'cubic-bezier(0.55, 0.06, 0.85, 0.28)',
    snap: 'cubic-bezier(0.13, 0.82, 0.22, 1)',
    back: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    rubber: 'cubic-bezier(0.22, 1.55, 0.32, 1)',
    settle: 'cubic-bezier(0.22, 1.15, 0.36, 1)'
  };

  var INTRO = {
    durationMs: 1600,
    fadeMs: 180,
    killMs: 2000,
    easing: EASE.rubber,
    letters: {

      D: {
        delay: 0,
        duration: 520,
        origin: '50% 50%',
        keys: [
          { t: 0.00, x: 0, y: 0, sx: 0.28, sy: 1.42, r: 0, o: 1, e: EASE.snap },
          { t: 0.12, x: 0, y: 0, sx: 0.36, sy: 1.34, r: 0, o: 1, e: EASE.back },
          { t: 0.42, x: 0, y: 0, sx: 1.42, sy: 0.72, r: 0, o: 1, e: EASE.rubber },
          { t: 0.62, x: 0, y: 0, sx: 0.82, sy: 1.16, r: 0, o: 1, e: EASE.rubber },
          { t: 0.78, x: 0, y: 0, sx: 1.10, sy: 0.93, r: 0, o: 1, e: EASE.settle },
          { t: 0.90, x: 0, y: 0, sx: 0.97, sy: 1.03, r: 0, o: 1, e: EASE.settle },
          { t: 1.00, x: 0, y: 0, sx: 1.00, sy: 1.00, r: 0, o: 1 }
        ]
      },

      A: {
        delay: 180,
        duration: 520,
        origin: '50% 100%',
        keys: [
          { t: 0.00, x: 0, y: -72, sx: 1.28, sy: 0.38, r: 0, o: 1, e: EASE.gravity },
          { t: 0.38, x: 0, y: 16, sx: 1.38, sy: 0.42, r: 0, o: 1, e: EASE.back },
          { t: 0.54, x: 0, y: -18, sx: 0.82, sy: 1.38, r: 0, o: 1, e: EASE.rubber },
          { t: 0.70, x: 0, y: 8, sx: 1.14, sy: 0.86, r: 0, o: 1, e: EASE.rubber },
          { t: 0.84, x: 0, y: -3, sx: 0.94, sy: 1.08, r: 0, o: 1, e: EASE.settle },
          { t: 1.00, x: 0, y: 0, sx: 1.00, sy: 1.00, r: 0, o: 1 }
        ]
      },

      X: {
        delay: 360,
        duration: 520,
        origin: '50% 50%',
        keys: [
          { t: 0.00, x: 0, y: 0, sx: 0.48, sy: 1.32, r: -18, o: 1, e: EASE.back },
          { t: 0.36, x: 0, y: 0, sx: 1.28, sy: 0.74, r: 12, o: 1, e: EASE.rubber },
          { t: 0.56, x: 0, y: 0, sx: 0.84, sy: 1.16, r: -8, o: 1, e: EASE.rubber },
          { t: 0.74, x: 0, y: 0, sx: 1.10, sy: 0.90, r: 4, o: 1, e: EASE.settle },
          { t: 0.88, x: 0, y: 0, sx: 0.96, sy: 1.04, r: -1.5, o: 1, e: EASE.settle },
          { t: 1.00, x: 0, y: 0, sx: 1.00, sy: 1.00, r: 0, o: 1 }
        ]
      },

      I: {
        delay: 520,
        duration: 480,
        origin: '50% 100%',
        keys: [
          { t: 0.00, x: 0, y: 0, sx: 1.32, sy: 0.22, r: 0, o: 1, e: EASE.back },
          { t: 0.40, x: 0, y: 0, sx: 0.78, sy: 1.52, r: 0, o: 1, e: EASE.rubber },
          { t: 0.60, x: 0, y: 0, sx: 1.14, sy: 0.82, r: 0, o: 1, e: EASE.rubber },
          { t: 0.78, x: 0, y: 0, sx: 0.94, sy: 1.10, r: 0, o: 1, e: EASE.settle },
          { t: 1.00, x: 0, y: 0, sx: 1.00, sy: 1.00, r: 0, o: 1 }
        ]
      }
    },
    chorus: {
      delay: 980,
      duration: 260,
      keys: [
        { t: 0.00, sx: 1.00, sy: 1.00, e: EASE.snap },
        { t: 0.30, sx: 1.10, sy: 0.86, e: EASE.back },
        { t: 0.58, sx: 0.94, sy: 1.10, e: EASE.settle },
        { t: 0.78, sx: 1.03, sy: 0.97, e: EASE.settle },
        { t: 1.00, sx: 1.00, sy: 1.00 }
      ]
    }
  };

  function readIntroTheme() {
    try {
      if (global.DaxiTheme && typeof global.DaxiTheme.get === 'function') {
        var t = global.DaxiTheme.get();
        if (t === 'light' || t === 'dark') return t;
      }
    } catch (e0) {}
    try {
      var stored = localStorage.getItem('daxi-theme');
      if (stored === 'light' || stored === 'dark') return stored;
    } catch (e1) {}
    try {
      var attr = document.documentElement.getAttribute('data-theme');
      if (attr === 'light' || attr === 'dark') return attr;
    } catch (e2) {}
    return 'dark';
  }

  function introPalette() {
    var light = readIntroTheme() === 'light';
    return {
      bg: light ? '#F0F4F9' : '#05070d',
      letter: light ? '#C27803' : '#f6c453'
    };
  }

  function buildIntroCss() {
    var p = introPalette();
    return (
    '#daxi-cinematic{position:fixed;inset:0;width:100%;height:100%;z-index:2147483000;' +
    'display:flex;align-items:center;justify-content:center;' +
    'background:' + p.bg + ';' +
    'overflow:hidden;pointer-events:auto}' +
    '#daxi-cin-word{display:flex;align-items:center;justify-content:center;gap:0.02em;' +
    'transform-origin:50% 50%;will-change:transform}' +
    '#daxi-cin-word span{display:inline-block;transform-origin:50% 50%;' +
    'font:800 clamp(52px,16vw,92px)/1 Montserrat,"Segoe UI",system-ui,sans-serif;' +
    'letter-spacing:0.06em;color:' + p.letter + ';opacity:0;' +
    'will-change:transform,opacity;backface-visibility:hidden;' +
    '-webkit-font-smoothing:antialiased}' +
    'html.daxi-intro-playing,html.daxi-intro-playing body{background:' + p.bg + '!important}' +
    'html.daxi-intro-playing #initialLoader,html.daxi-intro-done #initialLoader{background:' + p.bg + '!important}' +
    'html.daxi-intro-playing #initialLoader .daxi-initial-loader__content,' +
    'html.daxi-intro-done #initialLoader .daxi-initial-loader__content' +
    '{visibility:hidden!important;opacity:0!important}' +
    'html.daxi-intro-playing #splash,html.daxi-intro-done #splash,' +
    'html.daxi-intro-playing #daxi-web-radar,html.daxi-intro-done #daxi-web-radar,' +
    'html.daxi-intro-playing #admin-boot-overlay,html.daxi-intro-done #admin-boot-overlay,' +
    /* Hide app shells only while intro runs — never after done (map/admin must show). */
    'html.daxi-intro-playing #admin-app,' +
    'html.daxi-intro-playing #drv-map-stage,' +
    'html.daxi-intro-boot #admin-app,html.daxi-intro-boot #admin-boot-overlay,' +
    'html.daxi-intro-boot #drv-map-stage,html.daxi-intro-boot #splash,' +
    'html.daxi-intro-boot #daxi-web-radar' +
    '{display:none!important;opacity:0!important;visibility:hidden!important}'
    );
  }

  function injectCss() {
    var s = document.getElementById('daxi-cin-css');
    if (!s) {
      s = document.createElement('style');
      s.id = 'daxi-cin-css';
      (document.head || document.documentElement).appendChild(s);
    }
    s.textContent = buildIntroCss();
    try {
      var root = document.getElementById('daxi-cinematic');
      if (root) root.setAttribute('data-intro-theme', readIntroTheme());
    } catch (e) {}
  }

  function bootMark(n) {
    try {
      if (typeof global._daxiBootMark === 'function') global._daxiBootMark(n);
    } catch (e) {}
  }

  function dispatchIntroEvent(name) {
    try { document.dispatchEvent(new Event(name)); } catch (e) {}
    try { global.dispatchEvent(new Event(name)); } catch (e2) {}
  }

  function persistBootLog() {
    try {
      if (typeof global._daxiBootDump === 'function') global._daxiBootDump();
      else if (global.localStorage) {
        global.localStorage.setItem('daxi_boot_log', JSON.stringify(global._daxiBootLog || []));
      }
    } catch (e) {}
  }

  function hideNativeSplash() {
    if (global._daxiSplashHidden) return;
    var opts = { fadeOutDuration: 220 };
    function attempt() {
      if (global._daxiSplashHidden) return true;
      try {
        var C = global.Capacitor;
        if (!C) return false;
        if (C.Plugins && C.Plugins.SplashScreen && typeof C.Plugins.SplashScreen.hide === 'function') {
          global._daxiSplashHidden = true;
          bootMark('splash-hide');
          C.Plugins.SplashScreen.hide(opts);
          return true;
        }
        if (typeof C.nativePromise === 'function') {
          global._daxiSplashHidden = true;
          bootMark('splash-hide');
          C.nativePromise('SplashScreen', 'hide', opts);
          return true;
        }
        if (typeof C.toNative === 'function') {
          global._daxiSplashHidden = true;
          bootMark('splash-hide');
          C.toNative('SplashScreen', 'hide', opts);
          return true;
        }
      } catch (e) {}
      return false;
    }
    if (attempt()) return;
    var n = 0;
    var id = setInterval(function () {
      n += 1;
      if (attempt() || n > 80) clearInterval(id);
    }, 50);
  }

  function signalIntroVisible() {
    if (global._daxiIntroVisible) return;
    global._daxiIntroVisible = true;
    global._daxiIntroFirstFrame = true;
    bootMark('intro-visible');
    hideNativeSplash();
    dispatchIntroEvent('daxi:intro-visible');
    persistBootLog();
  }

  function waitOverlayPainted(root, cb) {
    var tries = 0;
    function check() {
      tries += 1;
      var ready = false;
      try {
        ready = !!(root && root.isConnected && root.getBoundingClientRect().height > 40);
        if (ready) {
          var letter = root.querySelector('span');
          if (letter && letter.getBoundingClientRect().width <= 0 && tries < 24) ready = false;
        }
      } catch (e) {}
      if (ready || tries > 45) {
        requestAnimationFrame(function () {
          signalIntroVisible();
          if (cb) cb();
        });
        return;
      }
      requestAnimationFrame(check);
    }
    requestAnimationFrame(function () { requestAnimationFrame(check); });
  }

  function isNativeShell() {
    try {
      if (global.DAXI_INTRO_FORCE) return true;
      if (global.DAXI_INTRO_DISABLED) return false;
      var ua = navigator.userAgent || '';
      if (/DaxiAndroid\//i.test(ua)) return true;
      if (global.DaxiAndroid) return true;
      if (global._daxiCapacitorApp) return true;
      if (global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform()) {
        return true;
      }
      if (document.documentElement && document.documentElement.classList.contains('daxi-native-shell')) {
        return true;
      }
    } catch (e) {}
    return false;
  }

  function prefersReducedMotion() {
    try {
      return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
      return false;
    }
  }

  function xform(k) {
    var x = k.x || 0;
    var y = k.y || 0;
    var r = k.r || 0;
    return (
      'translate(' + x + 'px,' + y + 'px) rotate(' + r + 'deg) scaleX(' + k.sx + ') scaleY(' + k.sy + ')'
    );
  }

  function keysToFrames(keys, withOpacity) {
    var frames = [];
    var i;
    for (i = 0; i < keys.length; i++) {
      var k = keys[i];
      var f = {
        transform: xform(k),
        offset: k.t,
        easing: k.e || INTRO.easing
      };
      if (withOpacity) f.opacity = k.o == null ? 1 : k.o;
      frames.push(f);
    }
    return frames;
  }

  function playOn(el, keys, delay, duration, withOpacity) {
    if (!el) return null;
    if (typeof el.animate !== 'function') {
      el.style.opacity = '1';
      el.style.transform = 'none';
      return null;
    }
    // Schedule with setTimeout — WAAPI `delay` is unreliable on Android WebView
    // (only the first letter "D" would animate; A/X/I stayed at opacity:0).
    var start = function () {
      try {
        el.style.opacity = '1';
        return el.animate(keysToFrames(keys, withOpacity), {
          duration: duration,
          easing: 'linear',
          fill: 'forwards'
        });
      } catch (eAnim) {
        el.style.opacity = '1';
        el.style.transform = 'none';
        return null;
      }
    };
    delay = delay || 0;
    if (delay <= 0) return start();
    // Fallback: if animate never paints, force letter visible shortly after start.
    setTimeout(function () {
      try {
        if (el && (!el.getAnimations || !el.getAnimations().length)) {
          if (parseFloat(window.getComputedStyle(el).opacity || '0') < 0.2) {
            el.style.opacity = '1';
            el.style.transform = 'none';
          }
        }
      } catch (eFall) {
        try { el.style.opacity = '1'; } catch (e2) {}
      }
    }, delay + Math.min(180, duration * 0.2));
    return setTimeout(start, delay);
  }

  function forceWordVisible(root) {
    if (!root) return;
    try {
      var spans = root.querySelectorAll('#daxi-cin-word span');
      var i;
      for (i = 0; i < spans.length; i++) {
        spans[i].style.opacity = '1';
        spans[i].style.transform = 'none';
      }
      var word = root.querySelector('#daxi-cin-word');
      if (word) word.style.transform = 'none';
    } catch (e) {}
  }

  function mountWord(root) {
    var word = document.createElement('div');
    word.id = 'daxi-cin-word';
    var letters = ['D', 'A', 'X', 'I'];
    var nodes = {};
    var i;
    for (i = 0; i < letters.length; i++) {
      var ch = letters[i];
      var span = document.createElement('span');
      span.textContent = ch;
      span.setAttribute('data-letter', ch);
      if (INTRO.letters[ch] && INTRO.letters[ch].origin) {
        span.style.transformOrigin = INTRO.letters[ch].origin;
      }
      word.appendChild(span);
      nodes[ch] = span;
    }
    root.appendChild(word);
    return { word: word, nodes: nodes };
  }

  function playReduced(root) {
    var parts = mountWord(root);
    var ch;
    for (ch in parts.nodes) {
      if (!parts.nodes.hasOwnProperty(ch)) continue;
      parts.nodes[ch].style.opacity = '1';
      parts.nodes[ch].style.transform = 'none';
    }
    waitOverlayPainted(root);
    return new Promise(function (resolve) {
      setTimeout(function () {
        if (root.parentNode) root.parentNode.removeChild(root);
        resolve();
      }, 420);
    });
  }

  function playWordIntro(root) {
    var parts = mountWord(root);
    var letters = INTRO.letters;
    var ch;
    for (ch in letters) {
      if (!letters.hasOwnProperty(ch)) continue;
      playOn(parts.nodes[ch], letters[ch].keys, letters[ch].delay, letters[ch].duration, true);
    }
    playOn(parts.word, INTRO.chorus.keys, INTRO.chorus.delay, INTRO.chorus.duration, false);
    waitOverlayPainted(root);
  }

  function releaseWebBootingLock() {
    if (isNativeShell()) return;
    try {
      document.documentElement.classList.remove('daxi-booting');
      document.documentElement.classList.remove('daxi-intro-boot');
    } catch (e) {}
  }

  function playDaxiIntro() {
    if (typeof document === 'undefined') return Promise.resolve();
    if (!DAXI_INTRO_ENABLED || global.DAXI_INTRO_DISABLED) {
      return Promise.resolve();
    }
    if (!isNativeShell()) {
      return Promise.resolve();
    }
    if (global._daxiIntroPromise) return global._daxiIntroPromise;

    try {
      var bootTheme = readIntroTheme();
      document.documentElement.setAttribute('data-theme', bootTheme);
      document.documentElement.style.colorScheme = bootTheme;
    } catch (eTheme) {}
    injectCss();
    global._daxiIntroPlaying = true;
    bootMark('intro-play');
    try {
      document.documentElement.classList.add('daxi-intro-playing');
    } catch (eEarly) {}

    global._daxiIntroPromise = new Promise(function (resolve) {
      var settled = false;
      var killer = 0;

      var done = function () {
        if (settled) return;
        settled = true;
        if (killer) clearTimeout(killer);
        global._daxiIntroPlaying = false;
        global._daxiIntroDone = true;
        global._daxiSkipSecondaryBoot = true;
        bootMark('intro-complete');
        try {
          document.documentElement.classList.add('daxi-intro-done');
          document.documentElement.classList.remove('daxi-intro-playing');
          document.documentElement.classList.remove('daxi-intro-boot');
          // Re-apply CSS so post-intro rules (map/admin visible) stick even if
          // an older cached stylesheet was injected earlier in the session.
          injectCss();
        } catch (e) {}
        try {
          var el = document.getElementById('daxi-cinematic');
          if (el && el.parentNode) el.parentNode.removeChild(el);
          var loader = document.getElementById('initialLoader');
          if (loader) loader.classList.remove('daxi-intro-live');
        } catch (e2) {}
        dispatchIntroEvent('daxi:intro-complete');
        persistBootLog();
        resolve();
      };

      var start = function () {
        if (settled) return;
        var parent = document.documentElement;
        var root = document.getElementById('daxi-cinematic');
        if (!root) {
          root = document.createElement('div');
          root.id = 'daxi-cinematic';
          root.setAttribute('aria-hidden', 'true');
          parent.appendChild(root);
        }

        if (prefersReducedMotion()) {
          playReduced(root).then(done);
          killer = setTimeout(done, 900);
          return;
        }

        try {
          playWordIntro(root);
          killer = setTimeout(done, INTRO.killMs);
          setTimeout(function () {
            if (settled || !root) {
              if (!settled) done();
              return;
            }
            forceWordVisible(root);
            if (typeof root.animate !== 'function') {
              if (!settled) done();
              return;
            }
            try {
              root
                .animate([{ opacity: 1 }, { opacity: 0 }], {
                  duration: INTRO.fadeMs,
                  fill: 'forwards',
                  easing: 'cubic-bezier(.4,0,.2,1)'
                })
                .finished.catch(function () {})
                .then(done);
            } catch (eFade) {
              done();
            }
          }, INTRO.durationMs);
        } catch (e) {
          signalIntroVisible();
          done();
        }
      };

      start();
    });

    return global._daxiIntroPromise;
  }

  global.daxiShouldSkipSecondaryBoot = function () {
    try {
      if (global._daxiIntroDone || global._daxiIntroPlaying || global._daxiSkipSecondaryBoot) return true;
      if (global._daxiCapacitorApp) return true;
      if (global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform()) {
        return true;
      }
      if (document.documentElement && document.documentElement.classList.contains('daxi-native-shell')) {
        return true;
      }
    } catch (e) {}
    return false;
  };

  global.daxiWaitForIntro = function (timeoutMs) {
    timeoutMs = timeoutMs || 4200;
    if (!global.daxiShouldSkipSecondaryBoot || !global.daxiShouldSkipSecondaryBoot()) {
      return Promise.resolve();
    }
    if (global._daxiIntroDone) return Promise.resolve();
    return new Promise(function (resolve) {
      var done = false;
      var finish = function () {
        if (done) return;
        done = true;
        resolve();
      };
      try {
        global.addEventListener('daxi:intro-complete', finish, { once: true });
      } catch (e0) {}
      setTimeout(finish, timeoutMs);
    });
  };

  global.DAXI_INTRO_ENABLED = DAXI_INTRO_ENABLED;
  global.playDaxiIntro = playDaxiIntro;
  global.DaxiIntro = {
    play: playDaxiIntro,
    enabled: DAXI_INTRO_ENABLED,
    motion: INTRO,
    ease: EASE
  };

  try {
    if (isNativeShell()) injectCss();
  } catch (eBootCss) {}

  function bootIntroWhenReady() {
    if (!isNativeShell() || global.DAXI_INTRO_DISABLED || !DAXI_INTRO_ENABLED) return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        playDaxiIntro();
      });
    } else {
      playDaxiIntro();
    }
  }
  bootIntroWhenReady();
})(typeof window !== 'undefined' ? window : this);
