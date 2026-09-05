
(function (global) {
  'use strict';

  var loaded = {};
  var loading = {};


  var ROOT_LAZY_SCRIPTS = {
    'daxi-haiti-explorer-data.js': true,
    'daxi-haiti-explorer-map.js': true,
    'daxi-frequent-routes-data.js': true,
    'daxi-frequent-routes-map.js': true
  };

  function srcFor(file) {
    var v = global._DAXI_ASSET_V || '20260830c';
    var key = file.split('?')[0];
    var base = key.split('/').pop();
    if (key.indexOf('/') >= 0) return key + '?v=' + v;
    if (ROOT_LAZY_SCRIPTS[base]) return '/' + base + '?v=' + v;
    if (base.indexOf('daxi-') === 0 || base.indexOf('gps-') === 0) {
      return '/static/js/' + base + '?v=' + v;
    }
    return '/' + base + '?v=' + v;
  }

  function loadScript(file) {
    var key = file.split('?')[0];
    if (loaded[key]) return Promise.resolve();
    if (loading[key]) return loading[key];
    loading[key] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = srcFor(file);
      s.async = false;
      s.onload = function () {
        loaded[key] = true;
        resolve();
      };
      s.onerror = function () {
        delete loading[key];
        reject(new Error('lazy load failed: ' + file));
      };
      document.head.appendChild(s);
    });
    return loading[key];
  }

  function loadMany(files) {
    var chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () { return loadScript(f); });
    });
    return chain;
  }

  function loadRoutesOfflineUi() {
    return loadMany(['daxi-frequent-routes-data.js', 'daxi-haiti-explorer-data.js', 'daxi-frequent-routes-map.js']).then(function () {
      return loadScript('/static/js/vubez2/vubez2-inline-03.js?v=' + (global._DAXI_ASSET_V || '20260902b'));
    });
  }

  function ensureRoutesMap() {
    return loadMany(['daxi-frequent-routes-data.js', 'daxi-frequent-routes-map.js']);
  }

  function ensureExplorerMap() {
    return loadMany(['daxi-haiti-explorer-data.js', 'daxi-haiti-explorer-map.js']);
  }

  function loadRoutesSection() {
    return loadRoutesOfflineUi().catch(function () {});
  }

  function onHash() {
    var h = (location.hash || '').toLowerCase();
    if (h.indexOf('explorer') >= 0 || h.indexOf('haiti') >= 0 || h.indexOf('lieux') >= 0) {
      loadMany(['daxi-haiti-explorer-data.js', 'daxi-haiti-explorer-map.js']).catch(function () {});
    }
    if (h.indexOf('route') >= 0 || h.indexOf('itin') >= 0) {
      loadRoutesSection();
    }
    if (h.indexOf('tarif') >= 0 || h.indexOf('plan') >= 0) {
      loadScript('daxi-plan-wizard.js').catch(function () {});
    }
    if (h.indexOf('assist') >= 0 || h.indexOf('aide') >= 0) {
      ensureAssistAI();
    }
  }

  function bindExplorer() {
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-daxi-nav], button, a') : null;
      if (!t) return;
      var txt = (t.textContent || '').toLowerCase();
      var href = (t.getAttribute && t.getAttribute('href')) || '';
      if (/explorer|haïti|haiti|lieux|découvrir/i.test(txt + href)) {
        loadMany(['daxi-haiti-explorer-data.js', 'daxi-haiti-explorer-map.js']).catch(function () {});
      }
      if (/itinéraire|route/i.test(txt)) {
        ensureRoutesMap().catch(function () {});
        loadRoutesSection();
      }
      if (/tarif|plan|forfait/i.test(txt)) {
        loadScript('daxi-plan-wizard.js').catch(function () {});
      }
      if (/chat|message/i.test(txt)) {
        loadMany(['daxi-chat-media.js', 'daxi-chat-ui.js', 'daxi-chat-composer.js']).catch(function () {});
      }
    }, true);
  }

  function idle(fn) {
    if (global.requestIdleCallback) global.requestIdleCallback(fn, { timeout: 4000 });
    else setTimeout(fn, 2500);
  }

  function observeLazySections() {
    if (!('IntersectionObserver' in global)) return;
    var routes = document.getElementById('routesMapsContainer');
    if (routes) {
      var rObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            loadRoutesSection();
            rObs.disconnect();
          }
        });
      }, { rootMargin: '200px' });
      rObs.observe(routes);
    }
    var explorer = document.querySelector('[data-daxi-explorer], #explorerSection, section[data-section="explorer"]');
    if (!explorer) {
      var headings = document.querySelectorAll('h2, h3');
      for (var i = 0; i < headings.length; i++) {
        if (/découvrez haïti|explorer/i.test(headings[i].textContent || '')) {
          explorer = headings[i].closest('section') || headings[i];
          break;
        }
      }
    }
    if (explorer) {
      var eObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            loadMany(['daxi-haiti-explorer-data.js', 'daxi-haiti-explorer-map.js']).catch(function () {});
            eObs.disconnect();
          }
        });
      }, { rootMargin: '300px' });
      eObs.observe(explorer);
    }
  }

  function markWeakDevice() {
    try {
      var mem = navigator.deviceMemory || 0;
      var cores = navigator.hardwareConcurrency || 0;
      if ((mem && mem <= 3) || (cores && cores <= 4)) {
        document.documentElement.classList.add('daxi-reduce-fx');
      }
    } catch (e) {}
  }

  function assistSectionVisible() {
    var section = document.getElementById('assistanceSection');
    if (!section) return false;
    if (section.style.display && section.style.display !== 'none') return true;
    try {
      return global.getComputedStyle(section).display !== 'none';
    } catch (e) {
      return false;
    }
  }

  function ensureAssistAI() {
    if (!document.getElementById('daxi-assist-ai-host')) return Promise.resolve();
    if (!assistSectionVisible()) return Promise.resolve();
    if (global.DaxiAssistAI) {
      try {
        global.DaxiAssistAI.mount({ host: '#daxi-assist-ai-host', audience: 'client' });
      } catch (e) {}
      return Promise.resolve();
    }
    if (global._daxiAssistAILoading) return global._daxiAssistAILoading;
    global._daxiAssistAILoading = loadScript('daxi-assist-ai.js').then(function () {
      if (global.DaxiAssistAI) {
        global.DaxiAssistAI.mount({ host: '#daxi-assist-ai-host', audience: 'client' });
      }
    }).catch(function () {}).finally(function () {
      global._daxiAssistAILoading = null;
    });
    return global._daxiAssistAILoading;
  }

  function bindAssistAI() {
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('a, button, [data-daxi-nav]') : null;
      if (!t) return;
      var href = (t.getAttribute && t.getAttribute('href')) || '';
      var txt = (t.textContent || '').toLowerCase();
      if (/assistance|assist|aide|daxi_page=assistance/i.test(href + txt)) {
        setTimeout(ensureAssistAI, 0);
      }
    }, true);
    try {
      var section = document.getElementById('assistanceSection');
      if (section && 'MutationObserver' in global) {
        var obs = new MutationObserver(function () {
          if (assistSectionVisible()) ensureAssistAI();
        });
        obs.observe(section, { attributes: true, attributeFilter: ['style', 'class'] });
      }
    } catch (eObs) {}
  }

  global._daxiEnsureAssistAI = ensureAssistAI;

  global.DaxiLazy = {
    load: loadScript,
    loadMany: loadMany,
    loadPlanWizard: function () { return loadScript('daxi-plan-wizard.js'); },
    ensureExplorerMap: ensureExplorerMap,
    ensureRoutesMap: ensureRoutesMap,
    loadRoutesOfflineUi: loadRoutesOfflineUi,
    ensureAssistAI: ensureAssistAI,
    preload: function () {
      idle(function () {
        if (global.AOS && !global._daxiAosInited) {
          try {
            global.AOS.init({ duration: 600, once: true, offset: 40 });
            global._daxiAosInited = true;
          } catch (e) {}
        }
      });
    }
  };

  global.addEventListener('hashchange', onHash);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      markWeakDevice();
      bindExplorer();
      bindAssistAI();
      onHash();
      observeLazySections();
      global.DaxiLazy.preload();
    });
  } else {
    markWeakDevice();
    bindExplorer();
    bindAssistAI();
    onHash();
    observeLazySections();
    global.DaxiLazy.preload();
  }
})(window);
