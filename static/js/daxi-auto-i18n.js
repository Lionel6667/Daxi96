
(function (global) {
    'use strict';

    var _currentLang = 'fr';
    var _pending = null;
    var _batchRunning = false;
    var _autoTranslatePaused = false;
    var _autoTranslateMaxRounds = 12;

    var SKIP_SEL = '[data-no-translate],[data-notranslate],script,style,noscript,.pac-container,.daxi-smart-ac-panel,#daxi-main-map,iframe,.gm-style,.gm-style *,.daxi-oc-pipeline,.daxi-oc-pipeline *';

    function getCsrf() {
        if (typeof global.getCsrfToken === 'function') return global.getCsrfToken();
        var m = document.cookie.match(/csrftoken=([^;]+)/);
        return m ? decodeURIComponent(m[1]) : '';
    }

    global._daxiGetSavedLang = function () {
        try {
            var l = localStorage.getItem('daxi_lang');
            if (l) return l;
        } catch (e) {}
        try {
            var m = document.cookie.match(/(?:^|;\s*)daxi_lang=([^;]+)/);
            if (m) return decodeURIComponent(m[1]);
        } catch (e2) {}
        return 'fr';
    };

    global._daxiPersistLang = function (lang) {
        if (!lang) return;
        try { localStorage.setItem('daxi_lang', lang); } catch (e) {}
        try {
            global.document.cookie = 'daxi_lang=' + encodeURIComponent(lang) + ';path=/;max-age=31536000;SameSite=Lax';
        } catch (e2) {}
    };

    function _syncLanguageUi(lang) {
        var langSelect = document.getElementById('languageSelect');
        if (langSelect && langSelect.value !== lang) langSelect.value = lang;
        document.querySelectorAll('.sidebar-language-btn[data-lang]').forEach(function (btn) {
            btn.classList.toggle('active', btn.dataset.lang === lang);
        });
        document.documentElement.lang = lang === 'ht' ? 'ht' : lang;
    }

    function _isSkipped(el) {
        if (!el) return true;
        if (el.hasAttribute('data-translate')) return false;
        if (el.closest(SKIP_SEL)) return true;
        var tag = (el.tagName || '').toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'noscript') return true;
        return false;
    }

    function _cacheKey(lang) { return 'daxi_phrase_i18n_' + lang; }

    function _loadPhraseCache(lang) {
        try {
            var raw = localStorage.getItem(_cacheKey(lang));
            return raw ? JSON.parse(raw) : {};
        } catch (e) { return {}; }
    }

    function _savePhraseCache(lang, map) {
        try { localStorage.setItem(_cacheKey(lang), JSON.stringify(map)); } catch (e) {}
    }

    function _buildFrPhraseMap(lang) {
        var map = {};
        var loc = global._localTranslations || {};
        var fr = loc.fr || {};
        var tgt = loc[lang] || {};
        Object.keys(fr).forEach(function (k) {
            var frVal = fr[k];
            var trVal = tgt[k];
            if (frVal && trVal && frVal !== trVal) map[frVal] = trVal;
        });
        Object.assign(map, _loadPhraseCache(lang));
        return map;
    }

    function _collectStrings() {
        var set = new Set();
        var roots = [document.body];
        roots.forEach(function (root) {
            if (!root || _isSkipped(root)) return;
            var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
                acceptNode: function (node) {
                    if (_isSkipped(node.parentElement)) return NodeFilter.FILTER_REJECT;
                    var t = (node.textContent || '').replace(/\s+/g, ' ').trim();
                    if (t.length < 2 || t.length > 500) return NodeFilter.FILTER_REJECT;
                    if (/^[\d\s\W]+$/.test(t)) return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                }
            });
            var n;
            while (n = walker.nextNode()) set.add(n.textContent.replace(/\s+/g, ' ').trim());

            root.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(function (el) {
                if (_isSkipped(el)) return;
                var ph = (el.placeholder || '').trim();
                if (ph.length >= 2 && ph.length < 300) set.add(ph);
            });
            root.querySelectorAll('[title],[aria-label]').forEach(function (el) {
                if (_isSkipped(el)) return;
                ['title', 'aria-label'].forEach(function (attr) {
                    var t = (el.getAttribute(attr) || '').trim();
                    if (t.length >= 2 && t.length < 300) set.add(t);
                });
            });
            root.querySelectorAll('option').forEach(function (el) {
                if (_isSkipped(el)) return;
                var t = (el.textContent || '').replace(/\s+/g, ' ').trim();
                if (t.length >= 2 && t.length < 300) set.add(t);
            });
            root.querySelectorAll('button,[role="button"]').forEach(function (el) {
                if (_isSkipped(el)) return;
                if (el.childElementCount === 0) {
                    var t = (el.textContent || '').replace(/\s+/g, ' ').trim();
                    if (t.length >= 2 && t.length < 300) set.add(t);
                }
            });
        });
        return Array.from(set);
    }

    function _restoreFrench() {
        document.querySelectorAll('[data-i18n-orig]').forEach(function (el) {
            el.textContent = el.getAttribute('data-i18n-orig');
            el.removeAttribute('data-i18n-orig');
        });
        document.querySelectorAll('[data-i18n-ph-orig]').forEach(function (el) {
            el.placeholder = el.getAttribute('data-i18n-ph-orig');
            el.removeAttribute('data-i18n-ph-orig');
        });
        document.querySelectorAll('[data-i18n-title-orig]').forEach(function (el) {
            el.title = el.getAttribute('data-i18n-title-orig');
            el.removeAttribute('data-i18n-title-orig');
        });
        document.querySelectorAll('[data-i18n-aria-orig]').forEach(function (el) {
            el.setAttribute('aria-label', el.getAttribute('data-i18n-aria-orig'));
            el.removeAttribute('data-i18n-aria-orig');
        });
    }

    function _applyKeyDict(dict) {
        if (!dict) return;
        document.querySelectorAll('[data-translate]').forEach(function (el) {
            if (_isSkipped(el)) return;
            var key = el.getAttribute('data-translate');
            if (!dict[key]) return;
            var val = dict[key];
            if (el.classList.contains('daxi-row-action') || el.classList.contains('dpw-row-action')) {
                el.setAttribute('title', val);
                el.setAttribute('aria-label', val);
                var stray = el.querySelector('.i18n-text');
                if (stray) stray.remove();
                return;
            }
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                if (!el.hasAttribute('data-i18n-ph-orig')) el.setAttribute('data-i18n-ph-orig', el.placeholder);
                el.placeholder = val;
                return;
            }
            if (!el.hasAttribute('data-i18n-orig')) el.setAttribute('data-i18n-orig', el.textContent);
            if (el.childElementCount === 0) el.textContent = val;
            else {
                var span = el.querySelector(':scope > .i18n-text') || el;
                if (!span.hasAttribute('data-i18n-orig')) span.setAttribute('data-i18n-orig', span.textContent);
                span.textContent = val;
            }
        });
    }

    function _applyPhraseMap(map) {
        if (!map) return;
        var keys = Object.keys(map).filter(function (k) { return k && map[k]; });
        keys.sort(function (a, b) { return b.length - a.length; });

        keys.forEach(function (frText) {
            var trVal = map[frText];
            if (!trVal || frText === trVal) return;

            document.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(function (el) {
                if (_isSkipped(el)) return;
                if (el.placeholder === frText) {
                    if (!el.hasAttribute('data-i18n-ph-orig')) el.setAttribute('data-i18n-ph-orig', frText);
                    el.placeholder = trVal;
                }
            });
            document.querySelectorAll('[title]').forEach(function (el) {
                if (_isSkipped(el)) return;
                if (el.title === frText) {
                    if (!el.hasAttribute('data-i18n-title-orig')) el.setAttribute('data-i18n-title-orig', frText);
                    el.title = trVal;
                }
            });
            document.querySelectorAll('[aria-label]').forEach(function (el) {
                if (_isSkipped(el)) return;
                if (el.getAttribute('aria-label') === frText) {
                    if (!el.hasAttribute('data-i18n-aria-orig')) el.setAttribute('data-i18n-aria-orig', frText);
                    el.setAttribute('aria-label', trVal);
                }
            });
        });

        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        var node;
        while (node = walker.nextNode()) {
            if (_isSkipped(node.parentElement)) continue;
            var raw = node.textContent;
            var trimmed = raw.replace(/\s+/g, ' ').trim();
            if (!trimmed) continue;
            for (var i = 0; i < keys.length; i++) {
                var fr = keys[i];
                if (trimmed.indexOf(fr) === -1) continue;
                var tr = map[fr];
                if (!node.parentElement.hasAttribute('data-i18n-orig')) {
                    node.parentElement.setAttribute('data-i18n-orig', node.parentElement.textContent);
                }
                node.textContent = raw.replace(fr, tr);
                break;
            }
        }
    }

    function _fetchKeyTranslations(lang) {
        return fetch('/api/translations/?lang=' + encodeURIComponent(lang), { credentials: 'same-origin' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) { return (d && d.translations) ? d.translations : {}; })
            .catch(function () { return {}; });
    }

    function _autoTranslateBatch(lang, texts) {
        if (!texts.length || _autoTranslatePaused) return Promise.resolve({ ok: false, translations: {} });
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            _autoTranslatePaused = true;
            return Promise.resolve({ ok: false, translations: {} });
        }
        return fetch('/api/translations/auto/', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
            body: JSON.stringify({ lang: lang, texts: texts })
        }).then(function (r) {
            if (!r.ok) {
                _autoTranslatePaused = true;
                return { ok: false, translations: {} };
            }
            return r.json().then(function (d) {
                return { ok: true, translations: (d && d.translations) ? d.translations : {} };
            });
        }).catch(function () {
            _autoTranslatePaused = true;
            return { ok: false, translations: {} };
        });
    }

    function _applyInstant(lang) {
        var keyDict = {};
        if (global._localTranslations && global._localTranslations[lang]) {
            Object.assign(keyDict, global._localTranslations[lang]);
        }
        _applyKeyDict(keyDict);
        _applyPhraseMap(_buildFrPhraseMap(lang));
        if (typeof window._daxiTranslateDynamicCounts === 'function') window._daxiTranslateDynamicCounts(lang);
        if (typeof renderSidebarTopDrivers === 'function') renderSidebarTopDrivers();
    }

    function _translateAllRemaining(lang) {
        if (_batchRunning || lang === 'fr' || _autoTranslatePaused) return Promise.resolve();
        _batchRunning = true;
        var phraseMap = _buildFrPhraseMap(lang);
        var rounds = 0;

        function nextRound() {
            if (_autoTranslatePaused) {
                _batchRunning = false;
                return Promise.resolve();
            }
            if (rounds >= _autoTranslateMaxRounds) {
                _batchRunning = false;
                return Promise.resolve();
            }
            rounds += 1;
            var all = _collectStrings();
            var missing = all.filter(function (t) {
                return !phraseMap[t] && t.length >= 2 && !/^[\d\s\W]+$/.test(t);
            }).slice(0, 100);
            if (!missing.length) {
                _batchRunning = false;
                return Promise.resolve();
            }
            return _autoTranslateBatch(lang, missing).then(function (result) {
                var part = (result && result.translations) ? result.translations : {};
                var added = false;
                Object.keys(part || {}).forEach(function (k) {
                    if (part[k] && part[k] !== k) {
                        phraseMap[k] = part[k];
                        added = true;
                    }
                });
                _savePhraseCache(lang, phraseMap);
                if (added) _applyPhraseMap(part);
                if (!added || !result || !result.ok) {
                    _batchRunning = false;
                    return Promise.resolve();
                }
                return nextRound();
            });
        }
        return nextRound().finally(function () { _batchRunning = false; });
    }

    function translatePage(lang) {
        _currentLang = lang || 'fr';
        _autoTranslatePaused = true;
        localStorage.setItem('daxi_lang', _currentLang);
        if (global._daxiPersistLang) global._daxiPersistLang(_currentLang);
        if (global._daxiInvalidatePlanCatalog) global._daxiInvalidatePlanCatalog();
        _syncLanguageUi(_currentLang);

        if (_currentLang === 'fr') {
            _restoreFrench();
            return Promise.resolve();
        }

        _applyInstant(_currentLang);

        if (typeof global._daxiRenderOrderListView === 'function' && global._daxiSheetView === 'list') {
            global._daxiRenderOrderListView();
        }
        if (typeof global._daxiUpdateOrderMini === 'function') {
            global._daxiUpdateOrderMini();
        }

        var planModal = document.getElementById('planDetailModal');
        if (planModal && planModal.classList.contains('show') && global.__currentPlanDetail && typeof global.openPlanModal === 'function') {
            global.openPlanModal(global.__currentPlanDetail);
        }

        return Promise.resolve();
    }

    function init() {
        var saved = (global._daxiGetSavedLang ? global._daxiGetSavedLang() : localStorage.getItem('daxi_lang')) || 'fr';
        _syncLanguageUi(saved);
        if (global._daxiPersistLang) global._daxiPersistLang(saved);
        var langSelect = document.getElementById('languageSelect');
        if (langSelect) {
            langSelect.addEventListener('change', function () { translatePage(this.value); });
        }
        document.querySelectorAll('.sidebar-language-btn[data-lang]').forEach(function (btn) {
            btn.addEventListener('click', function () { translatePage(btn.dataset.lang); });
        });
        document.body.addEventListener('htmx:afterSettle', function () {
            var l = _currentLang || localStorage.getItem('daxi_lang') || 'fr';
            if (l !== 'fr') {
                _applyInstant(l);
            }
            if (global.DaxiRecentPlaces && global.DaxiRecentPlaces.invalidate) {
                global.DaxiRecentPlaces.invalidate();
            }
        });
        var saved = (global._daxiGetSavedLang ? global._daxiGetSavedLang() : localStorage.getItem('daxi_lang')) || 'fr';
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () { translatePage(saved); });
        } else {
            translatePage(saved);
        }
    }

    global.DaxiAutoI18n = {
        translatePage: translatePage,
        apply: function (lang) { return translatePage(lang || _currentLang); },
        init: init,
        getLang: function () { return _currentLang; }
    };
    global.translatePage = translatePage;
    global.applyDaxiTranslations = function (lang) { return global.DaxiAutoI18n.apply(lang); };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(typeof window !== 'undefined' ? window : this);