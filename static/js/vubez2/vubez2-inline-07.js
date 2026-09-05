var _tabActive = 'tabbtn-book';
var _tabIds = ['tabbtn-book','tabbtn-orders','tabbtn-tarif','tabbtn-account'];

function _daxiTabBtnPulse(id) {
    var btn = document.getElementById(id);
    if (!btn) return;
    btn.classList.add('daxi-tab-tap');
    setTimeout(function() { btn.classList.remove('daxi-tab-tap'); }, 180);
}

(function _daxiWireTabBar() {
    var bar = document.getElementById('mainTabBar');
    if (!bar || bar.dataset.wired) return;
    bar.dataset.wired = '1';
    function onTabPress(e) {
        var btn = e.target && e.target.closest ? e.target.closest('.tab-bar-btn[data-tab]') : null;
        if (!btn || !bar.contains(btn)) return;
        e.preventDefault();
        var tab = btn.getAttribute('data-tab');
        if (tab === 'book') tabGoBook();
        else if (tab === 'orders') tabGoOrders();
        else if (tab === 'tarif') tabGoTarif();
        else if (tab === 'account') tabGoAccount();
    }
    bar.addEventListener('click', onTabPress);
})();

window.daxiBtnLoading = function(btn, on) {
    if (!btn) return;
    if (on) {
        if (window.DaxiActionButtons) { DaxiActionButtons.markBusy(btn, true); return; }
        btn.disabled = true;
        btn.classList.add('daxi-btn-busy');
    } else {
        if (window.DaxiActionButtons) { DaxiActionButtons.markBusy(btn, false); return; }
        btn.disabled = false;
        btn.classList.remove('daxi-btn-busy', 'daxi-btn-loading', 'btn-loading');
    }
};

function tabSetActive(id) {
    _tabActive = id;
    _tabIds.forEach(function(tid) {
        var col = (tid === id) ? '#f59e0b' : '#9ca3af';
        var icon = document.getElementById(tid + '-icon');
        var lbl  = document.getElementById(tid + '-lbl');
        if (icon) icon.style.color = col;
        if (lbl)  lbl.style.color  = col;
    });
}

function _daxiResumeMainMapAfterOverlay() {
    if (!window._clientBgMap) return;
    
    if (!window._daxiMapReady || (!window._daxiMapReady.idle && !window._daxiMapReady.tiles)) {
        if (typeof window._daxiResetMapReadyFlags === 'function') window._daxiResetMapReadyFlags(true, true);
        else {
            window._daxiMapReady.idle = true;
            window._daxiMapReady.tiles = true;
        }
    }
    if (typeof _daxiApplyMapViewportPadding === 'function') _daxiApplyMapViewportPadding();
    try {
        if (window.google && google.maps) google.maps.event.trigger(window._clientBgMap, 'resize');
    } catch (e) {}
    if (typeof _daxiFlushClientGpsToMap === 'function') _daxiFlushClientGpsToMap();
}
window._daxiResumeMainMapAfterOverlay = _daxiResumeMainMapAfterOverlay;

function tabGoBook() {
    _daxiTabBtnPulse('tabbtn-book');
    if (document.body.classList.contains('daxi-page-open')) {
        if (window.DaxiRoutesMap) window.DaxiRoutesMap.exit();
        if (window.DaxiExplorerMap) window.DaxiExplorerMap.exit();
        if (typeof closeDaxiPage === 'function') closeDaxiPage();
    }
    tabSetActive('tabbtn-book');
    if (window.daxiSetRoute) daxiSetRoute('commander', '', true);
    if (typeof _daxiShowCommanderTabInstant === 'function') _daxiShowCommanderTabInstant();
    if (typeof _ensureClientGpsLiveRunning === 'function') _ensureClientGpsLiveRunning();
    if (typeof _ensureClientGpsRefineLoop === 'function') _ensureClientGpsRefineLoop();
}

function _daxiShowCommanderTabInstant() {
    window._daxiSheetPreferredMode = 'form';
    document.documentElement.classList.remove('daxi-sheet-order-mode');
    if (document.body) {
        document.body.classList.remove('daxi-page-open', 'daxi-sheet-collapsed-mode', 'daxi-sheet-order-mode');
        document.body.style.overflow = '';
    }
    window._daxiMainMapFocusOrderId = null;
    var sheet = document.getElementById('appSheet');
    if (sheet) {
        sheet.classList.remove('daxi-sheet-hidden', 'daxi-sheet-dragging');
        sheet.style.transform = '';
        sheet.style.opacity = '1';
        sheet.style.pointerEvents = '';
        sheet.style.display = '';
        sheet.scrollTop = 0;
    }
    var swForm = document.getElementById('daxiSwitchForm');
    var swOrder = document.getElementById('daxiSwitchOrder');
    if (swForm) swForm.classList.add('active');
    if (swOrder) swOrder.classList.remove('active');
    if (typeof _daxiUpdateSheetSwitcher === 'function') _daxiUpdateSheetSwitcher();
    if (typeof _syncSheetHeightVar === 'function') _syncSheetHeightVar(true);
    if (typeof _daxiUpdateExpandFab === 'function') _daxiUpdateExpandFab();
}
window._daxiShowCommanderTabInstant = _daxiShowCommanderTabInstant;
function tabGoOrders(fromAccount) {
    if (!fromAccount) _daxiTabBtnPulse('tabbtn-orders');
    if (window.DaxiExplorerMap) window.DaxiExplorerMap.exit();
    if (!fromAccount) tabSetActive('tabbtn-orders');
    var opts = fromAccount ? {
        returnTo: { sectionId: 'accountSection', title: 'Mon compte', tabId: 'tabbtn-account' },
        keepTab: 'tabbtn-account'
    } : {};
    openDaxiPage('all-pending-requests', 'Mes Commandes', opts);
    if (!fromAccount && window.daxiSetRoute) daxiSetRoute('courses');
}
function _daxiIsMapExperienceOffline() {
    if (window._daxiForceOfflineUiPreview) return true;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    if (window.DaxiOffline && DaxiOffline.isReadOnly && DaxiOffline.isReadOnly()) return true;
    return false;
}
function _daxiMapsExperienceReady() {
    if (_daxiIsMapExperienceOffline()) return false;
    if (window._clientBgMap && window.google && window.google.maps) return true;
    if (typeof window._daxiIsGoogleMapsReady === 'function' && window._daxiIsGoogleMapsReady()) return true;
    return false;
}
function _daxiOpenExplorerFallback() {
    try { if (window.DaxiExplorerMap && DaxiExplorerMap.exit) DaxiExplorerMap.exit(); } catch (e) {}
    openDaxiPage('explorerSection', 'Découvrez Haïti');
    if (typeof window.showExplorerMain === 'function') window.showExplorerMain();
    var pending = window._daxiPendingExplorerPlace;
    if (pending) {
        window._daxiPendingExplorerPlace = null;
        setTimeout(function() {
            var btn = document.querySelector('.learn-more-btn[data-attraction="' + pending + '"]');
            if (btn) btn.click();
        }, 220);
    }
}
function _daxiOpenRoutesFallback() {
    try { if (window.DaxiRoutesMap && DaxiRoutesMap.exit) DaxiRoutesMap.exit(); } catch (e) {}
    var pendingSlug = window._daxiPendingRouteSlug;
    var loadUi = (window.DaxiLazy && DaxiLazy.loadRoutesOfflineUi)
        ? DaxiLazy.loadRoutesOfflineUi()
        : Promise.resolve();
    loadUi.then(function () {
        openDaxiPage('frequentRoutesSection', 'Itinéraires fréquents');
        if (pendingSlug) {
            window._daxiPendingRouteSlug = null;
            setTimeout(function() {
                var card = document.querySelector('[data-route-slug="' + pendingSlug + '"]');
                if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 280);
        }
    }).catch(function () {
        openDaxiPage('frequentRoutesSection', 'Itinéraires fréquents');
    });
}
window._daxiOpenExplorerFallback = _daxiOpenExplorerFallback;
window._daxiOpenRoutesFallback = _daxiOpenRoutesFallback;
window._daxiMapsExperienceReady = _daxiMapsExperienceReady;
function _daxiShowMapNeedOnline(kind) {
    if (kind === 'explorer') { _daxiOpenExplorerFallback(); return; }
    if (kind === 'routes') { _daxiOpenRoutesFallback(); return; }
}
window._daxiShowMapNeedOnline = _daxiShowMapNeedOnline;

function tabGoTarif() {
    if (typeof closeSidebar === 'function') closeSidebar();
    _daxiTabBtnPulse('tabbtn-tarif');
    try { if (window.DaxiExplorerMap) window.DaxiExplorerMap.exit(); } catch (eTarif) {}
    tabSetActive('tabbtn-tarif');
    openDaxiPage('servicePlansSection', 'Nos Tarifs & Services');
    if (window.daxiSetRoute) daxiSetRoute('tarif');
    setTimeout(function() {
        if (window._daxiRecenterPlanCarousel) window._daxiRecenterPlanCarousel();
    }, 280);
}
function tabGoExplorer() {
    if (typeof closeSidebar === 'function') closeSidebar();
    tabSetActive('tabbtn-tarif');
    window._daxiPendingExplorer = true;
    function launch() {
        if (_daxiMapsExperienceReady() && window.DaxiExplorerMap && window.DaxiExplorerMap.enter) {
            window.DaxiExplorerMap.enter();
        } else if (_daxiIsMapExperienceOffline()) {
            _daxiOpenExplorerFallback();
        } else if (window.DaxiExplorerMap && window.DaxiExplorerMap.enter) {
            window.DaxiExplorerMap.enter();
        } else {
            _daxiOpenExplorerFallback();
        }
    }
    if (window.DaxiLazy && DaxiLazy.ensureExplorerMap) {
        DaxiLazy.ensureExplorerMap().then(launch).catch(function () { _daxiOpenExplorerFallback(); });
    } else {
        launch();
    }
    if (window.daxiSetRoute) daxiSetRoute('explorer');
}
function tabGoAccount() {
    _daxiTabBtnPulse('tabbtn-account');
    try { if (window.DaxiExplorerMap) window.DaxiExplorerMap.exit(); } catch (eAcc) {}
    tabSetActive('tabbtn-account');
    openDaxiPage('accountSection', 'Mon compte');
    var _accOnline = (typeof _daxiIsOnlineForHtmx === 'function' && _daxiIsOnlineForHtmx()) || !!window._daxiNativeOnline;
    if (!_accOnline && window.DaxiOffline && DaxiOffline.renderCachedAccountIfAny) {
        DaxiOffline.renderCachedAccountIfAny();
    }
    if (typeof _daxiLoadAccountPage === 'function') _daxiLoadAccountPage(true);
    else _daxiPreloadAccountOnce();
    if (window.daxiSetRoute) daxiSetRoute('compte');
}

var _daxiPageReturn = null;


var _daxiPageOrigParent = null;
var _daxiPageEl = null;
var _DAXI_TAB_BY_SECTION = {
    'explorerSection': 'tabbtn-tarif',
    'all-pending-requests': 'tabbtn-orders',
    'lostObjectSection': 'tabbtn-orders',
    'accountSection': 'tabbtn-account',
    'servicePlansSection': 'tabbtn-tarif',
    'reviewsSection': 'tabbtn-tarif',
    'frequentRoutesSection': 'tabbtn-tarif',
    'lieuxSection': 'tabbtn-tarif',
    'assistanceSection': 'tabbtn-account'
};

var _DAXI_PAGE_TITLE_KEYS = {
    'all-pending-requests': 'pending_orders',
    'servicePlansSection': 'page_tarifs',
    'explorerSection': 'discover_haiti',
    'accountSection': 'page_my_account',
    'accountSettingsSection': 'page_my_profile',
    'reviewsSection': 'page_reviews',
    'frequentRoutesSection': 'page_routes',
    'lostObjectSection': 'page_lost_object',
    'assistanceSection': 'page_assistance'
};

var _DAXI_INSTANT_SECTIONS = {
    servicePlansSection: true,
    reviewsSection: true,
    frequentRoutesSection: true,
    'all-pending-requests': true,
    accountSection: true,
    assistanceSection: true
};

function _daxiMarkSectionReady(sectionId) {
    if (sectionId) _DAXI_INSTANT_SECTIONS[sectionId] = true;
}

function openSidebarAssist() {
    openDaxiPage('assistanceSection', 'Assistance DAXI');
    if (window.daxiSetRoute) daxiSetRoute('assistance');
}

function _daxiParkPageSection() {
    if (!_daxiPageEl) return;
    _daxiPageEl.style.display = 'none';
    var parent = _daxiPageOrigParent;
    if (parent && parent.isConnected) {
        parent.appendChild(_daxiPageEl);
    } else {
        var fallback = document.querySelector('.app-sheet .sheet-inner');
        if (fallback) fallback.appendChild(_daxiPageEl);
    }
    _daxiPageEl = null;
    _daxiPageOrigParent = null;
}

function openDaxiPage(sectionId, title, opts) {
    opts = opts || {};
    if (opts.returnTo) {
        _daxiPageReturn = opts.returnTo;
    } else if (!opts.keepReturn) {
        _daxiPageReturn = null;
    }
    if (typeof closeSidebar === 'function') closeSidebar();
    var tabId = _DAXI_TAB_BY_SECTION[sectionId];
    if (opts.keepTab && typeof tabSetActive === 'function') {
        tabSetActive(opts.keepTab);
    } else if (tabId && typeof tabSetActive === 'function') {
        tabSetActive(tabId);
    }
    var overlay = document.getElementById('daxiPageOverlay');
    var body    = document.getElementById('daxiPageBody');
    var titleEl = document.getElementById('daxiPageTitle');
    var sheet   = document.getElementById('appSheet');
    if (!overlay || !body) return;

    if (_daxiPageEl && _daxiPageEl.id !== sectionId) {
        _daxiParkPageSection();
        var overlayBody = document.getElementById('daxiPageBody');
        if (overlayBody) overlayBody.innerHTML = '';
    }

    var section = document.getElementById(sectionId);
    if (!section) { console.warn('[DAXI] section not found:', sectionId); return; }

    document.body.classList.add('daxi-page-open');
    if (sheet) sheet.classList.add('daxi-sheet-hidden');
    if (typeof _daxiSetSheetCollapsed === 'function') _daxiSetSheetCollapsed(true);

    titleEl.textContent = title || '';
    var tkey = _DAXI_PAGE_TITLE_KEYS[sectionId];
    if (tkey) {
        titleEl.setAttribute('data-translate', tkey);
        var frDict = (window._localTranslations && window._localTranslations.fr) || {};
        if (frDict[tkey]) titleEl.textContent = frDict[tkey];
    } else {
        titleEl.removeAttribute('data-translate');
    }
    if (window.DaxiShellRole && DaxiShellRole.installTitleTapGate) {
        try { DaxiShellRole.installTitleTapGate(); } catch (e) {}
    }

    if (section.parentNode !== body) {
        _daxiPageOrigParent = section.parentNode;
        _daxiPageEl = section;
        body.innerHTML = '';
        body.appendChild(section);
    } else {
        _daxiPageEl = section;
    }
    section.style.display = '';
    section.style.visibility = 'visible';
    section.style.opacity = '1';

    overlay.classList.remove('slide-out');
    var instant = !opts.forceRefresh && (_DAXI_INSTANT_SECTIONS[sectionId] || (section.dataset && section.dataset.daxiReady === '1'));
    overlay.classList.add('show');
    if (instant) overlay.classList.remove('slide-in');
    else overlay.classList.add('slide-in');
    document.body.style.overflow = 'hidden';
    body.scrollTop = 0;

    if (sectionId === 'explorerSection') {
        if (_daxiMapsExperienceReady() && window.DaxiExplorerMap && window.DaxiExplorerMap.enter) {
            setTimeout(function () { window.DaxiExplorerMap.enter(); }, 60);
        } else if (typeof window.showExplorerMain === 'function') {
            window.showExplorerMain();
        }
    }
    if (sectionId === 'all-pending-requests') {
        section.classList.add('show-heading');
        var ordersEl = document.getElementById('client-orders-htmx');
        if (ordersEl) ordersEl.style.display = 'block';
        var tabBtns = document.getElementById('orders-tab-btns');
        var ds = window.DJANGO_SESSION || {};
        if (tabBtns && ds.is_authenticated) {
            tabBtns.style.display = 'flex';
            tabBtns.style.gap = '6px';
        }
        _refreshClientOrdersPage({ preferCache: true });
        setTimeout(function() {
            try { document.dispatchEvent(new CustomEvent('daxi:orders-page-open')); } catch (e) {}
            if (typeof _daxiInitClientOrdersListMaps === 'function') _daxiInitClientOrdersListMaps();
        }, 80);
    }
    if (sectionId === 'accountSection') {
        _daxiLoadAccountPage(!!opts.forceRefresh);
        var settingsInline = document.getElementById('account-settings-inline-slot');
        if (opts.showSettings && settingsInline) {
            settingsInline.style.display = 'block';
            _loadClientAccountSettingsPage(opts.forceRefresh, 'account-settings-inline-slot');
            setTimeout(function() {
                settingsInline.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 120);
        } else if (settingsInline && !opts.keepSettings) {
            settingsInline.style.display = 'none';
        }
    }
    if (sectionId === 'lieuxSection' && window._daxiLoadLieux) {
        _daxiLoadLieux(window._daxiLieuxQ || '', window._daxiLieuxCat || '');
    }
    if (sectionId === 'lostObjectSection') {
        _loadClientLostObjectPage(opts.forceRefresh);
    }
    if (sectionId === 'frequentRoutesSection') {
        if (_daxiMapsExperienceReady() && window.DaxiRoutesMap && window.DaxiRoutesMap.enter) {
            setTimeout(function () { window.DaxiRoutesMap.enter(); }, 80);
        } else if (window.DaxiLazy && DaxiLazy.loadRoutesOfflineUi) {
            DaxiLazy.loadRoutesOfflineUi().catch(function () {});
        }
    }
    if (sectionId === 'servicePlansSection') {
        function recenter() {
            if (window._daxiRecenterPlanCarousel) window._daxiRecenterPlanCarousel();
        }
        requestAnimationFrame(function() {
            requestAnimationFrame(recenter);
        });
        setTimeout(recenter, 80);
        setTimeout(recenter, 280);
    }
    setTimeout(function() {
        if (window.applyDaxiTranslations) window.applyDaxiTranslations();
    }, 60);
}

(function _daxiBootDeepLink() {
    function tryOpen() {
        var p = new URLSearchParams(location.search).get('daxi_page');
        if (p === 'assistance' && typeof openDaxiPage === 'function') {
            openDaxiPage('assistanceSection', 'Assistance DAXI');
            if (history.replaceState) history.replaceState(null, '', location.pathname + (location.hash || ''));
        }
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() { setTimeout(tryOpen, 350); });
    } else {
        setTimeout(tryOpen, 350);
    }
})();

function closeDaxiPage() {
    if (window.DaxiExplorerMap) window.DaxiExplorerMap.exit();
    var overlay = document.getElementById('daxiPageOverlay');
    var body    = document.getElementById('daxiPageBody');
    var sheet   = document.getElementById('appSheet');
    if (overlay) overlay.classList.remove('show', 'slide-in');
    document.body.classList.remove('daxi-page-open');
    document.body.style.overflow = '';
    if (sheet) sheet.classList.remove('daxi-sheet-hidden');
    if (typeof _daxiUpdateExpandFab === 'function') _daxiUpdateExpandFab();
    if (_daxiPageEl) {
        _daxiParkPageSection();
    }
    if (body) body.innerHTML = '';
}

function daxiHandleSystemBack() {
    try {
        var sidebar = document.getElementById('sidebarMenu');
        if (sidebar && sidebar.classList.contains('active')) {
            if (typeof closeSidebar === 'function') closeSidebar();
            return true;
        }
        var planModal = document.getElementById('planDetailModal');
        if (planModal && planModal.classList.contains('show')) {
            if (typeof closePlanModal === 'function') closePlanModal();
            else if (typeof window.closePlanModal === 'function') window.closePlanModal();
            else {
                planModal.classList.remove('show');
                planModal.style.display = 'none';
                document.body.style.overflow = '';
            }
            return true;
        }
        var help = document.getElementById('daxiBookingHelpOverlay');
        if (help && help.classList.contains('show')) {
            help.classList.remove('show');
            help.style.display = 'none';
            return true;
        }
        var cardPay = document.getElementById('daxiCardPaymentOverlay');
        if (cardPay && cardPay.classList.contains('show')) {
            cardPay.classList.remove('show');
            cardPay.style.display = 'none';
            return true;
        }
        function _vis(el) {
            if (!el) return false;
            if (el.classList && (el.classList.contains('show') || el.classList.contains('active'))) return true;
            var d = el.style && el.style.display;
            return !!(d && d !== 'none');
        }
        var loginModal = document.getElementById('loginModal');
        if (_vis(loginModal)) {
            loginModal.style.display = 'none';
            loginModal.classList.remove('show', 'active');
            return true;
        }
        var signupModal = document.getElementById('daxiSignupModal');
        if (_vis(signupModal)) {
            signupModal.style.display = 'none';
            signupModal.classList.remove('show', 'active');
            return true;
        }
        var forgot = document.getElementById('forgotPasswordModal');
        if (_vis(forgot)) {
            forgot.style.display = 'none';
            forgot.classList.remove('show', 'active');
            return true;
        }
        var blogModal = document.getElementById('blogFullscreenModal');
        if (blogModal && blogModal.classList.contains('show')) {
            if (typeof closeFullscreenBlog === 'function') closeFullscreenBlog();
            else blogModal.classList.remove('show');
            return true;
        }
        var locPrompt = document.getElementById('locationSharePrompt');
        if (locPrompt && locPrompt.classList.contains('show')) {
            if (typeof _hideLocationSharePrompt === 'function') _hideLocationSharePrompt();
            else locPrompt.classList.remove('show');
            return true;
        }
        var notifModal = document.getElementById('notificationPermissionModal');
        if (notifModal && notifModal.style.display && notifModal.style.display !== 'none') {
            notifModal.style.display = 'none';
            return true;
        }
        var gpsBoot = document.getElementById('daxiGpsBoot');
        if (gpsBoot && gpsBoot.classList.contains('is-on')) {
            gpsBoot.classList.remove('is-on');
            return true;
        }
        var overlay = document.getElementById('daxiPageOverlay');
        if (overlay && overlay.classList.contains('show')) {
            if (typeof daxiPageBack === 'function') daxiPageBack();
            return true;
        }
        if (document.body && document.body.classList.contains('daxi-explorer-mode') && window.DaxiExplorerMap && DaxiExplorerMap.exit) {
            DaxiExplorerMap.exit();
            return true;
        }
        if (document.body && document.body.classList.contains('daxi-routes-mode') && window.DaxiRoutesMap && DaxiRoutesMap.exit) {
            DaxiRoutesMap.exit();
            return true;
        }
        if (document.body && document.body.classList.contains('daxi-sheet-order-mode')) {
            if (typeof _daxiOpenSheetForm === 'function') _daxiOpenSheetForm('system-back');
            else if (typeof _daxiSetSheetMode === 'function') _daxiSetSheetMode('form');
            return true;
        }
        if (document.body && !document.body.classList.contains('daxi-sheet-collapsed-mode') && typeof _daxiSetSheetCollapsed === 'function') {
            _daxiSetSheetCollapsed(true);
            return true;
        }
        if (window.history && window.history.length > 1) {
            window.history.back();
            return true;
        }
    } catch (e) {}
    return false;
}
window.daxiHandleSystemBack = daxiHandleSystemBack;

function daxiPageBack() {
    if (_daxiPageReturn) {
        var ret = _daxiPageReturn;
        _daxiPageReturn = null;
        openDaxiPage(ret.sectionId, ret.title, { keepTab: ret.tabId });
        if (ret.tabId && typeof tabSetActive === 'function') tabSetActive(ret.tabId);
        if (ret.sectionId === 'accountSection' && window.daxiSetRoute) window.daxiSetRoute('compte');
        return;
    }
    var currentId = _daxiPageEl && _daxiPageEl.id;
    if (currentId === 'accountSection') {
        var settingsInline = document.getElementById('account-settings-inline-slot');
        if (settingsInline && settingsInline.style.display !== 'none' && settingsInline.innerHTML.trim()) {
            settingsInline.style.display = 'none';
            if (window.daxiSetRoute) window.daxiSetRoute('compte');
            return;
        }
        closeDaxiPage();
        if (typeof tabSetActive === 'function') tabSetActive('tabbtn-account');
        if (window.daxiSetRoute) window.daxiSetRoute('compte');
        return;
    }
    if (typeof tabGoBook === 'function') tabGoBook();
    else {
        closeDaxiPage();
        if (window.daxiSetRoute) window.daxiSetRoute('commander', '', true);
    }
}
window.daxiPageBack = daxiPageBack;


function openSidebarTarifs()  { tabGoTarif(); }
function openSidebarExplorer(){
    if (typeof closeSidebar === 'function') closeSidebar();
    tabGoExplorer();
}
window.openSidebarExplorer = openSidebarExplorer;
function openSidebarLieux() {
    if (typeof closeSidebar === 'function') closeSidebar();
    if (window.DaxiExplorerMap && DaxiExplorerMap.exit) try { DaxiExplorerMap.exit(); } catch (e) {}
    if (window.DaxiRoutesMap && DaxiRoutesMap.exit) try { DaxiRoutesMap.exit(); } catch (e2) {}
    openDaxiPage('lieuxSection', 'Lieux à visiter');
    if (window._daxiLoadLieux) _daxiLoadLieux('', '');
    if (window.daxiSetRoute) daxiSetRoute('lieux');
}
window.openSidebarLieux = openSidebarLieux;
window._daxiLieuxCat = '';
window._daxiLieuxQ = '';
window._daxiLoadLieux = function(q, cat) {
    window._daxiLieuxQ = q || '';
    window._daxiLieuxCat = cat || '';
    var slot = document.getElementById('client-lieux-slot');
    if (!slot) return;
    slot.querySelectorAll('.daxi-lieux-chip').forEach(function(chip) {
        chip.classList.toggle('is-on', (chip.getAttribute('data-cat') || '') === window._daxiLieuxCat);
    });
    var qs = '?q=' + encodeURIComponent(window._daxiLieuxQ) + '&cat=' + encodeURIComponent(window._daxiLieuxCat);
    var url = '/htmx/lieux/client/' + qs;
    var offline = (typeof window._daxiNativeOnline === 'boolean' && !window._daxiNativeOnline)
        || (window.DaxiOffline && DaxiOffline.isReadOnly && DaxiOffline.isReadOnly())
        || (typeof navigator !== 'undefined' && navigator.onLine === false);
    if (!offline) {
        var grid = slot.querySelector('.daxi-lieux-grid, .daxi-lieux-empty');
        if (grid) grid.style.opacity = '0.4';
    }
    fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'text/html' } })
        .then(function(r) { if (!r.ok) throw new Error('lieux'); return r.text(); })
        .then(function(html) { slot.innerHTML = html; })
        .catch(function() {
            var applyEmpty = function() {
                slot.innerHTML = '<div class="daxi-lieux-empty"><i class="ri-map-pin-line"></i><p>Ouvrez Lieux une fois en ligne pour les consulter hors connexion.</p></div>';
            };
            if (window.DaxiOffline && DaxiOffline.tryServeHtmxFromCache) {
                DaxiOffline.tryServeHtmxFromCache(url, slot).then(function(ok) {
                    if (ok) return;
                    DaxiOffline.tryServeHtmxFromCache('/htmx/lieux/client/', slot).then(function(ok2) {
                        if (!ok2) applyEmpty();
                    });
                });
                return;
            }
            applyEmpty();
        });
};
window._daxiOpenLieu = function(id) {
    var slot = document.getElementById('client-lieux-slot');
    if (!slot) return;
    fetch('/htmx/lieux/client/' + id + '/', { credentials: 'same-origin', headers: { 'Accept': 'text/html' } })
        .then(function(r) { return r.text(); })
        .then(function(html) { slot.innerHTML = html; slot.scrollTo ? slot.scrollTo(0, 0) : 0; });
};
window._daxiLieuxLightbox = function(url) {
    var box = document.createElement('div');
    box.className = 'daxi-lieux-lb';
    box.onclick = function() { box.remove(); };
    box.innerHTML = '<img src="' + url + '" alt="">';
    document.body.appendChild(box);
};
window._daxiBookLieu = function(address, lat, lng) {
    lat = (lat === null || lat === undefined || lat === '') ? null : Number(lat);
    lng = (lng === null || lng === undefined || lng === '') ? null : Number(lng);
    if (!lat || !lng || !isFinite(lat) || !isFinite(lng)) {
        alert('Ce lieu n’a pas encore de position GPS. L’entreprise peut l’ajouter depuis son espace pro.');
        return;
    }
    if (typeof closeDaxiPage === 'function') closeDaxiPage();
    var dest = document.getElementById('destinationAddressArrival');
    var destHidden = document.getElementById('destinationHidden');
    var destLat = document.getElementById('destLatHidden');
    var destLng = document.getElementById('destLngHidden');
    if (dest) dest.value = address || '';
    if (destHidden) destHidden.value = address || '';
    if (destLat) destLat.value = String(lat);
    if (destLng) destLng.value = String(lng);
    if (typeof _daxiOpenSheetForm === 'function') _daxiOpenSheetForm('lieu');
    else if (typeof tabGoBook === 'function') tabGoBook();
};
function openSidebarReviews() { openDaxiPage('reviewsSection', 'Avis clients'); if (window.daxiSetRoute) daxiSetRoute('avis'); }
function openSidebarRoutes() {
    if (typeof closeSidebar === 'function') closeSidebar();
    if (window.DaxiExplorerMap && typeof window.DaxiExplorerMap.exit === 'function') {
        try { window.DaxiExplorerMap.exit(); } catch (e) {}
    }
    if (window.daxiSetRoute) daxiSetRoute('itineraires', '');
    function launch() {
        if (_daxiMapsExperienceReady() && window.DaxiRoutesMap && window.DaxiRoutesMap.enter) {
            window.DaxiRoutesMap.enter();
        } else if (_daxiIsMapExperienceOffline()) {
            _daxiOpenRoutesFallback();
        } else if (window.DaxiRoutesMap && window.DaxiRoutesMap.enter) {
            window.DaxiRoutesMap.enter();
        } else {
            _daxiOpenRoutesFallback();
        }
    }
    if (window.DaxiLazy && DaxiLazy.ensureRoutesMap) {
        DaxiLazy.ensureRoutesMap().then(launch).catch(function () { _daxiOpenRoutesFallback(); });
    } else {
        launch();
    }
}
function openSidebarOrders()  { tabGoOrders(); }
function openSidebarLostObject() {
    if (typeof closeSidebar === 'function') closeSidebar();
    openDaxiPage('lostObjectSection', 'Objet perdu');
    if (window.daxiSetRoute) daxiSetRoute('objet-perdu');
}
function _loadClientLostObjectPage(forceRefresh, silent) {
    var slot = document.getElementById('client-lost-object-slot');
    if (!slot) return;
    if (slot.dataset.loaded === '1' && !forceRefresh && slot.innerHTML.trim()) return;
    if (!silent) {
        slot.innerHTML = '<div class="daxi-lost-loader"><div class="daxi-lost-loader__ring"></div><div class="daxi-lost-loader__title" data-translate="lost_loading">Chargement</div><div class="daxi-lost-loader__sub" data-translate="lost_loading_sub">Récupération de vos courses terminées…</div></div>';
        if (window.applyDaxiTranslations) window.applyDaxiTranslations();
    }
    var qs = typeof _daxiGuestQs === 'function' ? _daxiGuestQs() : '';
    var url = '/htmx/client/lost-objects/' + qs;
    fetch(url, { credentials: 'include', headers: { 'Accept': 'text/html' } })
        .then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.text();
        })
        .then(function(html) {
            slot.innerHTML = html;
            slot.dataset.loaded = '1';
            slot.querySelectorAll('script').forEach(function(oldScript) {
                var s = document.createElement('script');
                if (oldScript.src) s.src = oldScript.src;
                else s.textContent = oldScript.textContent;
                document.body.appendChild(s);
            });
            if (window.DaxiAutoI18n && window.DaxiAutoI18n.apply) window.DaxiAutoI18n.apply();
            else if (window.applyDaxiTranslations) window.applyDaxiTranslations();
        })
        .catch(function() {
            var d = (window._localTranslations && window._localTranslations[localStorage.getItem('daxi_lang') || 'fr']) || {};
            slot.innerHTML = '<div style="padding:28px 16px;text-align:center;color:#94a3b8;"><p style="font-size:14px;margin-bottom:14px;" data-translate="lost_load_error">' + (d.lost_load_error || 'Impossible de charger pour le moment.') + '</p><button type="button" onclick="window._loadClientLostObjectPage(true)" style="padding:12px 22px;border:none;border-radius:12px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;font-weight:800;font-size:13px;cursor:pointer;" data-translate="lost_retry">' + (d.lost_retry || 'Réessayer') + '</button></div>';
            if (window.applyDaxiTranslations) window.applyDaxiTranslations();
        });
}
window._loadClientLostObjectPage = _loadClientLostObjectPage;

function _loadClientAccountSettingsPage(forceRefresh, slotId) {
    slotId = slotId || 'account-settings-inline-slot';
    var slot = document.getElementById(slotId);
    if (!slot) return;
    if (slot.dataset.loaded === '1' && !forceRefresh && slot.innerHTML.trim()) return;
    slot.innerHTML = '<div style="text-align:center;padding:40px;color:#64748b;"><i class="ri-loader-4-line" style="font-size:24px;animation:spin 1s linear infinite;"></i></div>';
    fetch('/htmx/client/account/settings/', { credentials: 'include', headers: { 'Accept': 'text/html' } })
        .then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.text();
        })
        .then(function(html) {
            slot.innerHTML = html;
            slot.dataset.loaded = '1';
            slot.querySelectorAll('script').forEach(function(oldScript) {
                var s = document.createElement('script');
                if (oldScript.src) s.src = oldScript.src;
                else s.textContent = oldScript.textContent;
                document.body.appendChild(s);
            });
            if (window.applyDaxiTranslations) window.applyDaxiTranslations();
        })
        .catch(function() {
            slot.innerHTML = '<div style="padding:28px 16px;text-align:center;color:#94a3b8;"><p style="font-size:14px;margin-bottom:14px;">Impossible de charger le profil.</p><button type="button" onclick="window._loadClientAccountSettingsPage(true)" style="padding:12px 22px;border:none;border-radius:12px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#000;font-weight:800;font-size:13px;cursor:pointer;">Réessayer</button></div>';
        });
}
window._loadClientAccountSettingsPage = _loadClientAccountSettingsPage;

function _daxiLoadAccountPage(force) {
    var slot = document.getElementById('account-htmx-slot');
    if (!slot) return Promise.resolve();
    var staleGuest = slot.querySelector('.daxi-acc-guest') && !slot.querySelector('.daxi-gate');
    if (staleGuest) force = true;
    if (!force && slot.innerHTML.trim() && slot.querySelector('.daxi-acc-hero, .daxi-gate')) {
        _daxiMarkSectionReady('accountSection');
        return Promise.resolve();
    }
    var online = (typeof _daxiIsOnlineForHtmx === 'function' && _daxiIsOnlineForHtmx()) || !!window._daxiNativeOnline;
    if (!online) {
        if (window.DaxiOffline && DaxiOffline.renderCachedAccountIfAny) {
            DaxiOffline.renderCachedAccountIfAny();
        }
        _daxiMarkSectionReady('accountSection');
        return Promise.resolve();
    }
    var base = (window._daxiLiveBaseUrl || '').replace(/\/$/, '');
    var url = (base ? base : '') + '/htmx/client/account/';
    if (!url.startsWith('http')) url = '/htmx/client/account/';
    if (typeof htmx !== 'undefined' && !window._daxiHybridShell) {
        htmx.ajax('GET', url, { target: '#account-htmx-slot', swap: 'innerHTML' });
        _daxiMarkSectionReady('accountSection');
        return Promise.resolve();
    }
    return fetch(url, {
        credentials: 'include',
        headers: { 'Accept': 'text/html', 'ngrok-skip-browser-warning': 'true' }
    }).then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
    }).then(function(html) {
        if (html && html.trim()) {
            slot.innerHTML = html;
            if (window.htmx && typeof htmx.process === 'function') htmx.process(slot);
        }
        _daxiMarkSectionReady('accountSection');
        if (window.applyDaxiTranslations) window.applyDaxiTranslations();
    }).catch(function() {
        if (window.DaxiOffline && DaxiOffline.renderCachedAccountIfAny) DaxiOffline.renderCachedAccountIfAny();
        _daxiMarkSectionReady('accountSection');
    });
}
window._daxiLoadAccountPage = _daxiLoadAccountPage;

function _daxiPreloadAccountOnce(force) {
    if (!force && window._daxiAccountPreloaded) return;
    window._daxiAccountPreloaded = true;
    _daxiLoadAccountPage(!!force);
}
window._daxiPreloadAccountOnce = _daxiPreloadAccountOnce;

function _daxiSeedAccountSlot() {
    var slot = document.getElementById('account-htmx-slot');
    if (!slot) return;
    var s = window.DJANGO_SESSION || {};
    if (!s.is_authenticated) {
        _daxiMarkSectionReady('accountSection');
        return;
    }
    var name = (s.user_name || s.first_name || 'Utilisateur').replace(/</g, '&lt;');
    var initials = (s.first_name || s.user_name || 'U').charAt(0).toUpperCase();
    var uid = (s.user_id || '—').toString().replace(/</g, '&lt;');
    slot.innerHTML =
        '<div class="daxi-acc" id="daxi-account-root">' +
        '<div class="daxi-acc-hero">' +
        '<div class="daxi-acc-avatar"><span>' + initials + '</span></div>' +
        '<div class="daxi-acc-hero-name">' + name + '</div>' +
        '<div class="daxi-acc-hero-id">ID: ' + uid + '</div>' +
        '</div>' +
        '<div class="daxi-acc-card"><div class="daxi-acc-card-h" data-translate="account_stats">Statistiques</div>' +
        '<div class="daxi-acc-stats">' +
        '<div class="daxi-acc-stat"><div class="n">—</div><div class="l" data-translate="account_perk_rides">Courses</div></div>' +
        '<div class="daxi-acc-stat"><div class="n">—</div><div class="l" data-translate="account_this_month">Ce mois</div></div>' +
        '<div class="daxi-acc-stat"><div class="n">—</div><div class="l" data-translate="account_in_progress">En cours</div></div>' +
        '<div class="daxi-acc-stat"><div class="n">—</div><div class="l" data-translate="account_completed">Terminées</div></div>' +
        '</div></div></div>';
    _daxiMarkSectionReady('accountSection');
    if (window.applyDaxiTranslations) window.applyDaxiTranslations();
}
window._daxiSeedAccountSlot = _daxiSeedAccountSlot;

function _daxiPreloadBlogOnce() {
    var fc = document.getElementById('blogFullscreenContainer');
    if (!fc) return Promise.resolve();
    if (fc.dataset.loaded === '1' && fc.innerHTML.trim()) return Promise.resolve();
    if (window._daxiBlogPreloadPromise) return window._daxiBlogPreloadPromise;
    if (!_daxiIsOnlineForHtmx()) {
        if (window.DaxiOffline && DaxiOffline.tryServeHtmxFromCache) {
            return DaxiOffline.tryServeHtmxFromCache('/htmx/blog/', '#blogFullscreenContainer').then(function(ok) {
                if (ok) fc.dataset.loaded = '1';
            });
        }
        return Promise.resolve();
    }
    window._daxiBlogPreloadPromise = fetch('/htmx/blog/', {
        credentials: 'include',
        headers: { 'Accept': 'text/html' }
    }).then(function(r) {
        if (!r.ok) throw new Error('http_' + r.status);
        return r.text();
    }).then(function(html) {
        if (html && html.trim()) {
            fc.innerHTML = html;
            fc.dataset.loaded = '1';
            if (window.htmx && typeof htmx.process === 'function') htmx.process(fc);
            if (window.DaxiAutoI18n && window.DaxiAutoI18n.apply) window.DaxiAutoI18n.apply();
            else if (window.applyDaxiTranslations) window.applyDaxiTranslations();
        }
    }).catch(function() {
        window._daxiBlogPreloadPromise = null;
    });
    return window._daxiBlogPreloadPromise;
}
window._daxiPreloadBlogOnce = _daxiPreloadBlogOnce;

function _daxiPreloadClientPages() {
    
    
    
    if (window._daxiIntroPlaying) {
        if (!window._daxiPreloadDeferred) {
            window._daxiPreloadDeferred = true;
            var resume = function() {
                window._daxiPreloadDeferred = false;
                _daxiPreloadClientPages();
            };
            if (window._daxiIntroPromise) window._daxiIntroPromise.then(resume, resume);
            else setTimeout(resume, 2000);
        }
        return;
    }
    if (!window._daxiPagesPreloaded) {
        window._daxiPagesPreloaded = true;
        ['servicePlansSection', 'reviewsSection', 'frequentRoutesSection'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) {
                el.dataset.daxiReady = '1';
                _daxiMarkSectionReady(id);
            }
        });
        if (window.DaxiRoutesMap && window.DaxiRoutesMap.preloadImages) {
            var preloadRoutes = function() { window.DaxiRoutesMap.preloadImages(false); };
            if (window.requestIdleCallback) requestIdleCallback(preloadRoutes, { timeout: 4000 });
            else setTimeout(preloadRoutes, 2500);
        }
        _daxiPreloadAccountOnce();
        _daxiPreloadBlogOnce();
    }
    if (window._daxiBootPreloadClientOrders) window._daxiBootPreloadClientOrders();
    if (typeof _loadClientLostObjectPage === 'function') _loadClientLostObjectPage(false, true);
}
window._daxiPreloadClientPages = _daxiPreloadClientPages;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { _daxiPreloadClientPages(); });
} else {
    _daxiPreloadClientPages();
}

document.body.addEventListener('htmx:afterSwap', function(evt) {
    if (!evt.detail || !evt.detail.target) return;
    if (evt.detail.target.id === 'account-htmx-slot' && evt.detail.target.innerHTML.trim()) {
        _daxiMarkSectionReady('accountSection');
        if (window.DaxiAutoI18n && window.DaxiAutoI18n.apply) window.DaxiAutoI18n.apply();
        else if (window.applyDaxiTranslations) window.applyDaxiTranslations();
    }
    if ((evt.detail.target.id === 'account-settings-inline-slot' || evt.detail.target.id === 'account-htmx-slot') && evt.detail.target.innerHTML.trim()) {
        if (window.DaxiAutoI18n && window.DaxiAutoI18n.apply) window.DaxiAutoI18n.apply();
        else if (window.applyDaxiTranslations) window.applyDaxiTranslations();
    }
    if (evt.detail.target.id === 'client-orders-htmx' && evt.detail.target.innerHTML.trim()) {
        if (typeof _daxiSyncClientOrdersCacheFromDom === 'function') {
            _daxiSyncClientOrdersCacheFromDom(evt.detail.target.dataset.currentTab || 'active');
        }
        _daxiMarkSectionReady('all-pending-requests');
        if (window.DaxiAutoI18n && window.DaxiAutoI18n.apply) window.DaxiAutoI18n.apply();
        else if (window.applyDaxiTranslations) window.applyDaxiTranslations();
        var ordersRoot = evt.detail.target;
        ordersRoot.style.display = 'block';
        try { document.dispatchEvent(new CustomEvent('daxi:orders-page-open')); } catch (e) {}
        if (typeof _daxiInitClientOrdersListMaps === 'function') {
            setTimeout(function() { _daxiInitClientOrdersListMaps(); }, 150);
        } else if (window.DaxiOrderCardMap && typeof DaxiOrderCardMap.init === 'function') {
            setTimeout(function() {
                try { DaxiOrderCardMap.init(ordersRoot); } catch (e) {}
            }, 150);
        }
    }
    if (evt.detail.target.id === 'blogFullscreenContainer' && evt.detail.target.innerHTML.trim()) {
        evt.detail.target.dataset.loaded = '1';
        if (window.DaxiAutoI18n && window.DaxiAutoI18n.apply) window.DaxiAutoI18n.apply();
        else if (window.applyDaxiTranslations) window.applyDaxiTranslations();
    }
    if (evt.detail.target.id === 'daxi-sheet-order-slot' && evt.detail.target.innerHTML.trim()) {
        if (window.DaxiAutoI18n && window.DaxiAutoI18n.apply) window.DaxiAutoI18n.apply();
        else if (window.applyDaxiTranslations) window.applyDaxiTranslations();
        if (window._daxiApplyBookingMarkersLock) window._daxiApplyBookingMarkersLock();
    }
});

function openDaxiAccountSettings() {
    openDaxiPage('accountSection', 'Mon compte', {
        keepTab: 'tabbtn-account',
        showSettings: true
    });
    if (window.daxiSetRoute) window.daxiSetRoute('compte', 'parametres');
}

function openDaxiPageFromAccount(sectionId, title) {
    openDaxiPage(sectionId, title, {
        returnTo: { sectionId: 'accountSection', title: 'Mon compte', tabId: 'tabbtn-account' },
        keepTab: 'tabbtn-account'
    });
}
window.openDaxiPageFromAccount = openDaxiPageFromAccount;

function daxiClientLogout() {
    if (!confirm('Se déconnecter ?')) return;
    fetch('/htmx/client/logout/', {
        method: 'POST', credentials: 'include',
        headers: { 'X-CSRFToken': typeof getCsrfToken === 'function' ? getCsrfToken() : '' }
    }).then(function(r) { return r.json().catch(function() { return {}; }); })
    .then(function(data) {
        if (data && data.csrf_token && window.DJANGO_SESSION) {
            window.DJANGO_SESSION.csrf_token = data.csrf_token;
        }
        _daxiClearClientAuthUi();
        if (window.showDaxiNotification) {
            showDaxiNotification('Déconnexion', 'Vous êtes déconnecté.', { type: 'info' });
        }
    }).catch(function() {
        _daxiClearClientAuthUi();
    });
}
window.daxiClientLogout = daxiClientLogout;


(function() {
    var _routeFromNav = false;

    function _slugify(str) {
        return String(str || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    window._daxiSlugify = _slugify;
    window._daxiRouteSlug = function(route) {
        if (!route) return '';
        return _slugify(route.from) + '-' + _slugify(route.to);
    };
    window._daxiRouteIndexFromSlug = function(slug) {
        var routes = window.DAXI_FREQUENT_ROUTES || [];
        for (var i = 0; i < routes.length; i++) {
            if (window._daxiRouteSlug(routes[i]) === slug) return i;
        }
        return -1;
    };
    window._daxiPlaceIndexFromId = function(placeId) {
        var places = window.DAXI_HAITI_PLACES || [];
        for (var i = 0; i < places.length; i++) {
            if (places[i].id === placeId) return i;
        }
        return -1;
    };
    window._daxiRouteFromNav = function() { return _routeFromNav; };

    function _parseHash() {
        var raw = (location.hash || '').replace(/^#\/?/, '').trim();
        var parts = raw.split('/').filter(Boolean);
        return { section: parts[0] || '', sub: parts[1] || '' };
    }

    window.daxiSetRoute = function(section, sub, force) {
        if (_routeFromNav && !force) return;
        var sec = section || 'commander';
        var path = '#/' + sec + (sub ? '/' + sub : '');
        if (location.hash === path) return;
        history.replaceState({ daxiRoute: sec, sub: sub || '' }, '', path);
    };

    window.daxiNavigateFromHash = function() {
        _routeFromNav = true;
        var r = _parseHash();
        var sec = r.section || 'commander';
        if (sec === 'tarif' && r.sub && window.DAXI_PLAN_SLUGS && window.DAXI_PLAN_SLUGS[r.sub]) {
            tabGoTarif();
            var pid = window.DAXI_PLAN_SLUGS[r.sub];
            setTimeout(function() {
                if (window.focusPlanCard) focusPlanCard(parseInt(pid, 10) - 1);
                if (typeof openPlanModal === 'function') openPlanModal(pid);
            }, 280);
            _routeFromNav = false;
            return;
        }
        if (sec === 'commander' || sec === 'book' || sec === '') tabGoBook();
        else if (sec === 'courses' || sec === 'mes-courses' || sec === 'orders') {
            tabGoOrders();
            if (r.sub) {
                setTimeout(function() {
                    if (window._daxiFocusClientOrder) _daxiFocusClientOrder(r.sub);
                }, 700);
            }
        }
        else if (sec === 'tarif' || sec === 'tarifs') tabGoTarif();
        else if (sec === 'compte' || sec === 'account') {
            if (r.sub === 'parametres' || r.sub === 'profil' || r.sub === 'settings') {
                tabGoAccount();
                setTimeout(function() { openDaxiAccountSettings(); }, 180);
            } else {
                tabGoAccount();
            }
        }
        else if (sec === 'explorer') {
            if (r.sub) window._daxiPendingExplorerPlace = r.sub;
            tabGoExplorer();
        }
        else if (sec === 'avis' || sec === 'reviews') openSidebarReviews();
        else if (sec === 'itineraires' || sec === 'routes') {
            if (r.sub) window._daxiPendingRouteSlug = r.sub;
            openSidebarRoutes();
        }
        else if (sec === 'objet-perdu' || sec === 'objet-oublie' || sec === 'lost-object') openSidebarLostObject();
        else if (sec === 'assistance') {
            if (typeof openSidebarAssist === 'function') openSidebarAssist();
        }
        else tabGoBook();
        _routeFromNav = false;
    };

    window.addEventListener('hashchange', function() { daxiNavigateFromHash(); });
    window.addEventListener('popstate', function() { daxiNavigateFromHash(); });

    var _initHash = (location.hash || '').replace(/^#\/?/, '').trim();
    if (!_initHash) {
        window.daxiSetRoute('commander', '', true);
    }
})();


(function() {
    function _wrapNativePos(pos) {
        return {
            coords: {
                latitude: pos.lat,
                longitude: pos.lng,
                accuracy: pos.accuracy != null ? pos.accuracy : 250,
                altitude: pos.altitude || null,
                heading: pos.heading || null,
                speed: pos.speed || null
            },
            timestamp: pos.time || pos.ts || Date.now()
        };
    }
    window._daxiCapacitorGetPosition = function(options) {
        return new Promise(function(resolve, reject) {
            function tryRead(attempt) {
                if (window._daxiGpsPerm === false) {
                    reject({ code: 1, message: 'permission' });
                    return;
                }
                if (typeof DaxiAndroid !== 'undefined' && DaxiAndroid.getCurrentLocation) {
                    try {
                        var raw = DaxiAndroid.getCurrentLocation();
                        var pos = typeof raw === 'string' ? JSON.parse(raw) : raw;
                        if (pos && pos.error === 'permission') {
                            reject({ code: 1, message: 'permission' });
                            return;
                        }
                        if (pos && pos.error) {
                            if (pos.error === 'gps_disabled') reject({ code: 2, message: pos.message || 'gps_disabled' });
                            else if (attempt < 12) setTimeout(function() { tryRead(attempt + 1); }, 800);
                            else reject(pos);
                        } else if (pos && pos.lat != null && pos.lng != null) {
                            resolve(_wrapNativePos(pos));
                        } else if (attempt < 12) {
                            setTimeout(function() { tryRead(attempt + 1); }, 800);
                        } else {
                            reject({ code: 3, message: 'no_location' });
                        }
                    } catch (e) { reject(e); }
                    return;
                }
                if (!window._daxiGpsPerm) {
                    reject({ code: 1, message: 'permission' });
                    return;
                }
                var Cap = window.Capacitor;
                if (!Cap || typeof Cap.isNativePlatform !== 'function' || !Cap.isNativePlatform()) {
                    reject({ code: 0, message: 'not-native' });
                    return;
                }
                var Geo = Cap.Plugins && Cap.Plugins.Geolocation;
                if (!Geo || typeof Geo.getCurrentPosition !== 'function') {
                    reject({ code: 0, message: 'no-geolocation-plugin' });
                    return;
                }
                Geo.getCurrentPosition({
                    enableHighAccuracy: options && options.enableHighAccuracy !== false,
                    timeout: (options && options.timeout) || 15000,
                    maximumAge: 0
                }).then(function(pos) {
                    resolve({
                        coords: {
                            latitude: pos.coords.latitude,
                            longitude: pos.coords.longitude,
                            accuracy: pos.coords.accuracy,
                            altitude: pos.coords.altitude,
                            heading: pos.coords.heading,
                            speed: pos.coords.speed
                        },
                        timestamp: pos.timestamp
                    });
                }).catch(reject);
            }
            tryRead(0);
        });
    };
    if (typeof DaxiAndroid !== 'undefined' && DaxiAndroid.isOnline && window.DaxiNetworkState) {
        
    }
})();


var DAXI_GPS_VALIDATED_MAX_M = 200;
var DAXI_GPS_TARGET_M = 100;
var DAXI_GPS_QUARTIER_ACCURACY = 200;
var DAXI_GPS_MAX_ACCEPT_M = 200;
var DAXI_GPS_FALLBACK_M = 200;
var DAXI_GPS_QUARTIER_MS = 0;
var DAXI_GPS_SCAN_MAX_MS = 15000;
var DAXI_GEO_GRANTED_KEY = 'daxi_geo_granted';
var DAXI_LOC_PROMPT_KEY = 'daxi_loc_prompt_done';

var _daxiGpsMapCommitted = null;

function _daxiResetGpsMapCommit() {
    _daxiGpsMapCommitted = null;
}

function _daxiGpsMovedM(lat1, lng1, lat2, lng2) {
    if (window.DaxiGpsEngine && typeof DaxiGpsEngine.haversineM === 'function') {
        return DaxiGpsEngine.haversineM(lat1, lng1, lat2, lng2);
    }
    var R = 6371000;
    var p = Math.PI / 180;
    var a = Math.sin(((lat2 - lat1) * p) / 2) * Math.sin(((lat2 - lat1) * p) / 2)
        + Math.cos(lat1 * p) * Math.cos(lat2 * p)
        * Math.sin(((lng2 - lng1) * p) / 2) * Math.sin(((lng2 - lng1) * p) / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function _daxiGpsNoiseM(prevAcc, acc) {
    return Math.max(8, Math.min(prevAcc, acc) * 0.45);
}

function _daxiShouldCommitGpsMapPoint(lat, lng, acc, opts) {
    opts = opts || {};
    if (!isFinite(acc) || acc > DAXI_GPS_VALIDATED_MAX_M) return false;
    if (opts.force || opts.forcePan || opts.forceCenter) return true;
    if (!_daxiGpsMapCommitted) return true;
    var prev = _daxiGpsMapCommitted;
    var moved = _daxiGpsMovedM(prev.lat, prev.lng, lat, lng);
    var better = acc + 5 < prev.acc;
    var similar = acc <= prev.acc * 1.25;
    if (better) return true;
    if (similar && moved >= _daxiGpsNoiseM(prev.acc, acc)) return true;
    return false;
}

function _daxiGpsMarkerVisible() {
    if (!window._clientLocationMarker) return false;
    if (window._clientLocationMarkerIsAdvanced) return window._clientLocationMarker.map != null;
    return !!(window._clientLocationMarker.getMap && window._clientLocationMarker.getMap());
}

// Diagnostic only (audit phase 0): maps the opts.source strings already used by
// callers onto the A|B|C|D producer taxonomy of audit section 9, so concurrent
// location subsystems writing to the same marker become visible in the logs.
function _daxiGpsDisplaySource(src) {
    src = String(src || '');
    if (src === 'native_watch') return 'A';
    if (src === 'engine-live' || src === 'refine-live') return 'B';
    if (src === 'refine-poll') return 'C';
    if (/prime|readnative|cache|flush|uncovered/i.test(src)) return 'D';
    // Never guess: an unlabelled producer must stand out rather than be filed
    // under a plausible letter, otherwise the taxonomy proves nothing.
    return src ? '?' : '?';
}

// Read-only mirror of _daxiShouldCommitGpsMapPoint, used to name the skip reason.
function _daxiGpsCommitSkipReason(lat, lng, acc, opts) {
    if (!isFinite(acc)) return 'accuracy_not_finite';
    if (acc > DAXI_GPS_VALIDATED_MAX_M) return 'above_validated_max';
    if (opts.force || opts.forcePan || opts.forceCenter) return null;
    if (!_daxiGpsMapCommitted) return null;
    var prev = _daxiGpsMapCommitted;
    var moved = _daxiGpsMovedM(prev.lat, prev.lng, lat, lng);
    var noise = _daxiGpsNoiseM(prev.acc, acc);
    if (acc > prev.acc * 1.25) return 'accuracy_worse';
    if (moved < noise) return 'jitter_inside_accuracy';
    return null;
}

function _daxiCommitGpsMapPoint(lat, lng, acc, opts) {
    opts = opts || {};
    var _diagSrc = _daxiGpsDisplaySource(opts.source);
    if (!_daxiShouldCommitGpsMapPoint(lat, lng, acc, opts)) {
        if (window.DaxiGpsDiag) {
            DaxiGpsDiag.displaySkip(_diagSrc, _daxiGpsCommitSkipReason(lat, lng, acc, opts) || 'unknown', {
                acc: acc,
                via: opts.source || '?',
                committedAcc: _daxiGpsMapCommitted ? _daxiGpsMapCommitted.acc : null,
                moved: _daxiGpsMapCommitted
                    ? Math.round(_daxiGpsMovedM(_daxiGpsMapCommitted.lat, _daxiGpsMapCommitted.lng, lat, lng))
                    : null,
                noise: _daxiGpsMapCommitted ? Math.round(_daxiGpsNoiseM(_daxiGpsMapCommitted.acc, acc)) : null
            });
        }
        return false;
    }
    if (window.DaxiGpsDiag) {
        DaxiGpsDiag.display(_diagSrc, { lat: lat, lng: lng, acc: acc, via: opts.source || 'commit' });
    }
    _updateClientLocationVisual(lat, lng, acc, false);
    if (!_daxiGpsMarkerVisible()) {
        window._daxiPendingGpsVisual = { lat: lat, lng: lng, acc: acc, scanOnly: false };
        if (window.DaxiGpsDiag) {
            DaxiGpsDiag.displaySkip(_diagSrc, 'marker_not_on_map_yet', { acc: acc, via: opts.source || '?' });
        }
        return false;
    }
    if (window.DaxiGpsDiag) DaxiGpsDiag.displayCommit(_diagSrc, { acc: acc });
    _daxiGpsMapCommitted = { lat: lat, lng: lng, acc: acc, ts: Date.now() };
    if (window._daxiPickupFromGps) {
        if (typeof _syncGpsPickupHiddenFields === 'function') _syncGpsPickupHiddenFields(lat, lng);
        if (typeof _hideGpsPickupMarker === 'function') _hideGpsPickupMarker();
    }
    _daxiCancelGpsFailureNotice();
    _daxiClearPickupWatchdog();
    return true;
}

function _daxiNotifyGpsUnavailable(msg) {
    var text = msg || (typeof _daxiT === 'function'
        ? _daxiT('gps_not_found_msg', 'Impossible de trouver votre position. Saisissez l\'adresse manuellement.')
        : 'Impossible de trouver votre position. Saisissez l\'adresse manuellement.');
    if (typeof showToast === 'function') showToast(text, 'warning');
    else if (typeof showDaxiNotification === 'function') {
        showDaxiNotification('GPS', text, { type: 'warning' });
    }
}

function _daxiFinishPickupInputState(inp, btn, ok) {
    if (inp) {
        inp.classList.remove('daxi-pickup-locating');
        if (ok) {
            inp.classList.add('daxi-pickup-located');
            setTimeout(function() { inp.classList.remove('daxi-pickup-located'); }, 2200);
        }
    }
    if (btn) btn.classList.remove('loading');
}
window._daxiResetGpsMapCommit = _daxiResetGpsMapCommit;
window._daxiCommitGpsMapPoint = _daxiCommitGpsMapPoint;

var _daxiGpsFailureTimer = null;
var _daxiPickupWatchdogTimer = null;

function _daxiGpsHasUsableFix() {
    if (typeof _daxiGpsMarkerVisible === 'function' && _daxiGpsMarkerVisible()) return true;
    if (_daxiGpsMapCommitted) return true;
    var p = window._lastClientGpsPos;
    if (p && p.lat != null && p.lng != null && (p.acc || 999) <= DAXI_GPS_VALIDATED_MAX_M) return true;
    if (window.DaxiClientGps) {
        var v = DaxiClientGps.getValidated();
        if (v && v.lat != null) return true;
        var d = DaxiClientGps.getDisplay && DaxiClientGps.getDisplay();
        if (d && d.lat != null && (d.acc || 999) <= DAXI_GPS_VALIDATED_MAX_M) return true;
    }
    return false;
}

function _daxiCancelGpsFailureNotice() {
    if (_daxiGpsFailureTimer) {
        clearTimeout(_daxiGpsFailureTimer);
        _daxiGpsFailureTimer = null;
    }
}

function _daxiScheduleGpsFailureNotice(fn, delayMs) {
    _daxiCancelGpsFailureNotice();
    _daxiGpsFailureTimer = setTimeout(function() {
        _daxiGpsFailureTimer = null;
        if (_daxiGpsHasUsableFix()) return;
        if (typeof fn === 'function') fn();
    }, delayMs || 10000);
}

function _daxiClearPickupWatchdog() {
    if (_daxiPickupWatchdogTimer) {
        clearTimeout(_daxiPickupWatchdogTimer);
        _daxiPickupWatchdogTimer = null;
    }
}

function _daxiLockGpsPan(ms) {
    window._daxiGpsPanLockUntil = Date.now() + (ms || 14000);
    window._clientGpsPannedOnce = true;
}
window._daxiLockGpsPan = _daxiLockGpsPan;
window._daxiGpsHasUsableFix = _daxiGpsHasUsableFix;
window._daxiCancelGpsFailureNotice = _daxiCancelGpsFailureNotice;

function _daxiGpsPanLocked(opts) {
    opts = opts || {};
    if (opts.forceUserRecenter) return false;
    return !!(window._daxiGpsPanLockUntil && Date.now() < window._daxiGpsPanLockUntil);
}
window._daxiGpsPanLocked = _daxiGpsPanLocked;

function _daxiValidateGeoPos(pos, source) {
    if (!pos || !pos.coords) return null;
    if (window.DaxiClientGps) {
        var ev = DaxiClientGps.processGeoPos(pos, source || 'geolocation');
        if (!ev || ev.decision !== 'ACCEPT') return null;
        return { lat: ev.lat, lng: ev.lng, acc: ev.acc, ts: ev.ts || Date.now() };
    }
    var acc = pos.coords.accuracy || 9999;
    if (acc > DAXI_GPS_VALIDATED_MAX_M) return null;
    return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        acc: acc,
        ts: pos.timestamp || Date.now()
    };
}

function _daxiValidateEngineFix(fix, source) {
    if (!fix) return null;
    if (window.DaxiClientGps) {
        var ev = DaxiClientGps.processEngineFix(fix, source || 'engine');
        if (!ev || ev.decision !== 'ACCEPT') return null;
        return { lat: ev.lat, lng: ev.lng, acc: ev.acc, ts: ev.ts || Date.now() };
    }
    var p = _fixToLatLng(fix);
    if (!p || p.acc > DAXI_GPS_VALIDATED_MAX_M) return null;
    return { lat: p.lat, lng: p.lng, acc: p.acc, ts: fix.timestamp || Date.now() };
}

function _markLocPromptDone() {
    window._daxiLocPromptDone = true;
    try { localStorage.setItem(DAXI_LOC_PROMPT_KEY, '1'); } catch (e) {}
}

function _wasLocPromptDone() {
    try { return localStorage.getItem(DAXI_LOC_PROMPT_KEY) === '1'; } catch (e) { return false; }
}

function _daxiIsNativeClientApp() {
    return !!(window._daxiCapacitorApp || window.DaxiAndroid
        || (window._daxiIsNativeApp && window._daxiIsNativeApp()));
}

function _daxiNativeGpsGranted() {
    if (window._daxiGpsPerm) return true;
    try {
        if (window.DaxiAndroid && DaxiAndroid.isLocationEnabled && DaxiAndroid.isLocationEnabled()) return true;
    } catch (e) {}
    return false;
}

function _daxiGrantGpsUserConsent() {
    window._daxiGpsUserConsent = true;
}

function _daxiHasGpsUserConsent() {
    
    if (window._daxiGpsUserConsent) return true;
    if (window._daxiGpsPerm) return true;
    return false;
}


function _daxiRequestBrowserGeoFromUserGesture(onDone) {
    function done(ok, err) {
        if (typeof onDone === 'function') {
            try { onDone(ok, err); } catch (e) {}
        }
    }
    function showBlocked() {
        if (typeof _showLocationSharePrompt === 'function') _showLocationSharePrompt(true);
        done(false, { code: 1, message: 'blocked' });
    }
    if (window.DaxiAndroid && DaxiAndroid.requestLocationPermission) {
        _daxiGrantGpsUserConsent();
        window._daxiPendingNativeGpsBoot = true;
        try { DaxiAndroid.requestLocationPermission(); } catch (e) {}
        done(true, null);
        return;
    }
    if (!navigator.geolocation || typeof navigator.geolocation.getCurrentPosition !== 'function') {
        done(false, { code: 0, message: 'unsupported' });
        return;
    }
    
    if (window._daxiGeoBrowserBlocked) {
        showBlocked();
        return;
    }
    function startOsPrompt() {
        _daxiGrantGpsUserConsent();
        try {
            navigator.geolocation.getCurrentPosition(
                function(pos) {
                    if (window._daxiClearGeoBlocked) window._daxiClearGeoBlocked();
                    _markGeoGranted();
                    done(true, null);
                    _daxiGpsFinalized = false;
                    _daxiGpsLocked = false;
                    _clientGpsBootStarted = false;
                    if (typeof _bootClientGps === 'function') _bootClientGps();
                    if (pos && pos.coords && typeof _placeClientPickupOnMap === 'function') {
                        try {
                            _placeClientPickupOnMap(pos.coords.latitude, pos.coords.longitude, {
                                acc: pos.coords.accuracy || 0,
                                forcePan: true,
                                source: 'consent-gesture'
                            });
                        } catch (e2) {}
                    }
                },
                function(err) {
                    if (err && err.code === 1 && window._daxiMarkGeoBlocked) window._daxiMarkGeoBlocked();
                    done(false, err || { code: 1 });
                    showBlocked();
                },
                { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
            );
        } catch (e3) {
            done(false, e3);
        }
    }
    if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' }).then(function(p) {
            if (p.state === 'denied') {
                if (window._daxiMarkGeoBlocked) window._daxiMarkGeoBlocked();
                showBlocked();
                return;
            }
            if (p.state === 'granted') {
                if (window._daxiClearGeoBlocked) window._daxiClearGeoBlocked();
                _daxiGrantGpsUserConsent();
                _markGeoGranted();
                _daxiGpsFinalized = false;
                _daxiGpsLocked = false;
                _clientGpsBootStarted = false;
                if (typeof _bootClientGps === 'function') _bootClientGps();
                done(true, null);
                return;
            }
            startOsPrompt();
        }).catch(function() { startOsPrompt(); });
        return;
    }
    startOsPrompt();
}
window._daxiRequestBrowserGeoFromUserGesture = _daxiRequestBrowserGeoFromUserGesture;

function _daxiMaybeAskNotificationsNow(reason) {
    if (typeof _daxiWasNotifAsked === 'function' && _daxiWasNotifAsked()) return;
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        if (typeof _daxiMarkNotifAsked === 'function') _daxiMarkNotifAsked();
        return;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        if (typeof _daxiMarkNotifAsked === 'function') _daxiMarkNotifAsked();
        return;
    }
    var locEl = document.getElementById('locationSharePrompt');
    if (locEl && locEl.classList.contains('show')) return;
    if (typeof _showNotificationModal === 'function') _showNotificationModal();
}
window._daxiMaybeAskNotificationsNow = _daxiMaybeAskNotificationsNow;

function _daxiScheduleNotifAfterLocFlow() {
    if (typeof _scheduleNotificationPrompt === 'function') {
        try { _scheduleNotificationPrompt(); } catch (e) {}
    }
}

function _daxiMaybeAskLocation() {
    
    if (window._daxiNativePermissionHost) {
        // Android WebView shows its own native consent dialog — don't OS-prompt from JS.
        return;
    }
    if (window._daxiGeoBrowserBlocked) {
        _showLocationSharePrompt(true);
        return;
    }
    if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' }).then(function(p) {
            if (p.state === 'granted') {
                if (window._daxiClearGeoBlocked) window._daxiClearGeoBlocked();
                // After user already accepted the in-app prompt once, silent GPS boot is OK.
                if (_wasLocPromptDone() || window._daxiGpsUserConsent) {
                    _markGeoGranted();
                    _daxiGrantGpsUserConsent();
                    if (window.DaxiWebGps && !window.DaxiAndroid) {
                        DaxiWebGps.startSession('CLIENT', { exploitableM: DAXI_GPS_FALLBACK_M, targetAccuracy: DAXI_GPS_TARGET_M, timeoutMs: 15000 });
                    }
                    _bootClientGps();
                    return;
                }
                // First visit this browser session / never confirmed in-app → show modal first
                _showLocationSharePrompt(false);
                return;
            }
            if (p.state === 'denied') {
                if (window._daxiMarkGeoBlocked) window._daxiMarkGeoBlocked();
                _showLocationSharePrompt(true);
                return;
            }
            _showLocationSharePrompt(false);
        }).catch(function() {
            _showLocationSharePrompt(false);
        });
        return;
    }
    _showLocationSharePrompt(false);
}
window._daxiMaybeAskLocation = _daxiMaybeAskLocation;
var _gpsError = false;
var _daxiGpsScanOverlay = null;
var _daxiGpsScanStartedAt = 0;
var _daxiGpsBootAt = 0;
var _daxiQuartierCenter = null;
var _daxiGpsQuartierReady = false;
var _daxiGpsLocked = false;
var _daxiGpsScanTimer = null;
var _daxiGpsScanTimeoutId = null;
var _daxiGpsManualShown = false;
var _daxiGpsFinalized = false;
var _daxiGpsScanVisualDone = false;
var _daxiPageGpsTimer = null;
window._daxiPickupFromGps = false;

function _ensureDaxiGpsScanOverlay() {
    if (_daxiGpsScanOverlay && _daxiGpsScanOverlay.el && _daxiGpsScanOverlay.el.isConnected) {
        return _daxiGpsScanOverlay;
    }
    var el = document.getElementById('daxiGpsBoot');
    if (!el) {
        el = document.createElement('div');
        el.id = 'daxiGpsBoot';
        el.className = 'daxi-gps-boot';
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML = '<div class="daxi-gps-boot__stage">'
            + '<span class="daxi-gps-boot__ring"></span>'
            + '<span class="daxi-gps-boot__ring r2"></span>'
            + '<span class="daxi-gps-boot__ring r3"></span>'
            + '<span class="daxi-gps-boot__dot"></span>'
            + '</div>';
        document.body.appendChild(el);
    }
    _daxiGpsScanOverlay = { el: el };
    return _daxiGpsScanOverlay;
}

function _endGpsScanVisual() {
    if (_daxiGpsScanVisualDone) return;
    var elapsed = Date.now() - (_daxiGpsScanStartedAt || Date.now());
    var wait = Math.max(0, 1400 - elapsed);
    if (wait > 0) {
        setTimeout(_endGpsScanVisual, wait);
        return;
    }
    _daxiGpsScanVisualDone = true;
    if (_daxiPageGpsTimer) { clearTimeout(_daxiPageGpsTimer); _daxiPageGpsTimer = null; }
    _stopDaxiGpsScan();
}

function _scheduleGpsScanDeadline(ms) {
    if (_daxiPageGpsTimer) { clearTimeout(_daxiPageGpsTimer); _daxiPageGpsTimer = null; }
    _daxiPageGpsTimer = setTimeout(function() {
        _daxiPageGpsTimer = null;
        if (window._clientGpsPannedOnce || _daxiGpsPanLocked()) return;
        var p = window.DaxiClientGps ? DaxiClientGps.getValidated() : null;
        if (!p) p = window._lastClientGpsPos;
        if (p && (p.acc || 999) <= DAXI_GPS_VALIDATED_MAX_M && window._clientBgMap) {
            _daxiSmartPanForClientGps(p.lat, p.lng, p.acc || 999, { forcePan: true });
            if (typeof _daxiLockGpsPan === 'function') _daxiLockGpsPan();
        }
    }, ms || 5000);
}

function _updateDaxiGpsScan() {  }

function _stopDaxiGpsScan() {
    if (_daxiGpsScanTimer) { clearInterval(_daxiGpsScanTimer); _daxiGpsScanTimer = null; }
    if (_daxiGpsScanTimeoutId) { clearTimeout(_daxiGpsScanTimeoutId); _daxiGpsScanTimeoutId = null; }
    var ov = (_daxiGpsScanOverlay && _daxiGpsScanOverlay.el) || document.getElementById('daxiGpsBoot');
    if (ov) {
        ov.classList.remove('is-on');
        ov.style.display = '';
    }
}

function _finalizeGpsApprox() {
    var p = window.DaxiClientGps ? DaxiClientGps.getValidated() : null;
    if (!p) p = _daxiQuartierCenter || window._lastClientGpsPos;
    if (p && p.lat != null && p.lng != null && (p.acc || 999) <= DAXI_GPS_VALIDATED_MAX_M && window._clientBgMap) {
        _updateClientLocationVisual(p.lat, p.lng, p.acc || 999, false);
        if (_shouldAutoPanMap({ forcePan: true })) {
            _daxiSmartPanForClientGps(p.lat, p.lng, p.acc || 999, { forcePan: true });
        }
    }
    _ensureClientGpsLiveRunning();
}

function _resetGpsScanTimers() {
    if (_daxiPageGpsTimer) { clearTimeout(_daxiPageGpsTimer); _daxiPageGpsTimer = null; }
    if (_daxiGpsScanTimeoutId) { clearTimeout(_daxiGpsScanTimeoutId); _daxiGpsScanTimeoutId = null; }
    _daxiGpsBootAt = Date.now();
    _daxiGpsScanStartedAt = 0;
    _daxiQuartierCenter = null;
    _daxiGpsQuartierReady = false;
    _daxiGpsScanVisualDone = false;
    window._clientGpsPannedOnce = false;
    window._clientGpsLocatingHint = false;
}

function _hidePreciseClientMarker() {
    if (window._clientLocationMarker) {
        if (window._clientLocationMarkerIsAdvanced && window._clientLocationMarker.map != null) {
            window._clientLocationMarker.map = null;
        } else if (window._clientLocationMarker.setMap) {
            window._clientLocationMarker.setMap(null);
        }
    }
}

function _isDesktopClientGps() {
    return !(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || ''));
}

var _clientGpsEngine = null;
var _lastClientGpsPos = null;
var _clientGpsBootStarted = false;
window._daxiCommanderGpsFocusPending = true;

function _daxiCanFocusCommanderGps() {
    if (document.body.classList.contains('daxi-routes-mode')) return false;
    if (document.body.classList.contains('daxi-explorer-mode')) return false;
    if (document.body.classList.contains('daxi-explorer-traveling')) return false;
    if (document.body.classList.contains('daxi-page-open')) return false;
    if (document.body.classList.contains('daxi-sheet-order-mode')) return false;
    if (window._daxiMainMapFocusOrderId) return false;
    if (window._daxiPinDragging) return false;
    if (window._daxiMapUserInteracting) {
        window._daxiCommanderGpsFocusPending = false;
        return false;
    }
    return true;
}

function _daxiGetReadyClientGps() {
    var p = window._lastClientGpsPos || window._daxiPendingGpsVisual;
    if ((!p || p.lat == null) && window.DaxiClientGps) {
        p = (DaxiClientGps.getValidated && DaxiClientGps.getValidated())
            || (DaxiClientGps.getDisplay && DaxiClientGps.getDisplay())
            || (DaxiClientGps.getApprox && DaxiClientGps.getApprox());
    }
    if (!p || p.lat == null || p.lng == null) return null;
    return p;
}

function _daxiFocusMapOnReadyGps(source) {
    if (!_daxiCanFocusCommanderGps()) return false;
    var p = _daxiGetReadyClientGps();
    if (!p) {
        window._daxiCommanderGpsFocusPending = true;
        return false;
    }
    if (!window._clientBgMap) {
        window._daxiCommanderGpsFocusPending = true;
        return false;
    }
    var softTab = source && String(source).indexOf('tab-book') >= 0;
    if (softTab && window._clientGpsPannedOnce) {
        var accSoft = p.acc || p.accuracy || 60;
        if (typeof _updateClientLocationVisual === 'function') {
            _updateClientLocationVisual(p.lat, p.lng, accSoft, false);
        }
        window._daxiCommanderGpsFocusPending = false;
        return true;
    }
    var mapPainted = !!(window._daxiOfflineMapMode || document.querySelector('#daxi-main-map .gm-style'));
    if (!mapPainted) {
        window._daxiCommanderGpsFocusPending = true;
        if (!window._daxiGpsFocusPaintRetryTimer) {
            window._daxiGpsFocusPaintRetryTimer = setTimeout(function() {
                window._daxiGpsFocusPaintRetryTimer = null;
                _daxiFocusMapOnReadyGps(source || 'paint-retry');
            }, 180);
        }
        return false;
    }
    var acc = p.acc || p.accuracy || 60;
    if (typeof _updateClientLocationVisual === 'function') {
        _updateClientLocationVisual(p.lat, p.lng, acc, false);
    }
    window._daxiCommanderGpsFocusPending = false;
    if (!_daxiGpsPanLocked()) {
        window._clientGpsPannedOnce = true;
        _daxiAnimateMapToUser(p.lat, p.lng, acc, { forceCenter: true, forcePan: true, skipNudge: true });
        if (typeof _daxiLockGpsPan === 'function') _daxiLockGpsPan();
    }
    if (typeof window._daxiRevealLiveMap === 'function') window._daxiRevealLiveMap();
    return true;
}
window._daxiFocusMapOnReadyGps = _daxiFocusMapOnReadyGps;

function _daxiSyncClientGpsOnMapReady(source) {
    source = source || 'map-ready';
    function tick(allowPan) {
        if (typeof _daxiFlushClientGpsToMap === 'function') _daxiFlushClientGpsToMap();
        if (!allowPan || _daxiGpsPanLocked()) return;
        if (typeof _daxiFocusMapOnReadyGps === 'function' && !window._clientGpsPannedOnce) {
            _daxiFocusMapOnReadyGps(source);
        }
    }
    tick(true);
    [350, 900].forEach(function(ms) {
        setTimeout(function() { tick(false); }, ms);
    });
}
window._daxiSyncClientGpsOnMapReady = _daxiSyncClientGpsOnMapReady;

function _daxiRequestCommanderGpsFocus(source) {
    var soft = source && String(source).indexOf('tab-book') >= 0;
    if (soft && window._clientGpsPannedOnce) {
        if (typeof _daxiFlushClientGpsToMap === 'function') _daxiFlushClientGpsToMap();
        return;
    }
    window._daxiCommanderGpsFocusPending = true;
    _daxiFocusMapOnReadyGps(source || 'request');
}
window._daxiRequestCommanderGpsFocus = _daxiRequestCommanderGpsFocus;

function _shouldAutoPanMap(opts) {
    opts = opts || {};
    if (opts.forceCenter || opts.forcePan) return true;
    if (window._daxiForceGpsPanOnce) {
        window._daxiForceGpsPanOnce = false;
        return true;
    }
    
    if (window._daxiMainMapFocusOrderId) return false;
    if (document.body.classList.contains('daxi-sheet-order-mode')) return false;
    if (window._daxiSuppressGpsRepan) return false;
    if (window._daxiMapFocusLockUntil && Date.now() < window._daxiMapFocusLockUntil) return false;
    if (window._daxiMapUserPanCooldownUntil && Date.now() < window._daxiMapUserPanCooldownUntil) return false;
    if (_daxiHasManualPickup()) return false;
    if (document.body.classList.contains('daxi-routes-mode')) return false;
    if (document.body.classList.contains('daxi-explorer-mode')) return false;
    if (window._daxiSuppressGpsPan) return false;
    if (window._daxiMapUserInteracting) return false;
    return true;
}

function _placeClientPickupOnMap(lat, lng, opts) {
    opts = opts || {};
    var acc = opts.acc != null ? opts.acc : 999;
    if (!window._lastClientGpsPos) window._lastClientGpsPos = { lat: lat, lng: lng, acc: acc, ts: Date.now() };
    else {
        window._lastClientGpsPos.lat = lat;
        window._lastClientGpsPos.lng = lng;
        window._lastClientGpsPos.acc = acc;
        window._lastClientGpsPos.ts = Date.now();
    }
    var evaluated = null;
    if (window.DaxiClientGps) {
        evaluated = opts.evaluated || DaxiClientGps.evaluateRaw(
            opts.source || 'pipeline',
            lat, lng, acc,
            opts.ts || Date.now(),
            { ageMs: opts.ageMs, allowStale: !!opts.allowStale }
        );
        if (evaluated.decision === 'REJECT') {
            return false;
        }
        if (evaluated.decision === 'APPROXIMATE') {
            if (!DaxiClientGps.getValidated() && evaluated.allowVisual) {
                _daxiQuartierCenter = { lat: lat, lng: lng, acc: acc };
                _daxiCommitGpsMapPoint(lat, lng, acc, opts);
                if (_shouldAutoPanMap(opts) && !DaxiClientGps.getValidated() && !_daxiGpsPanLocked(opts)) {
                    _daxiSmartPanForClientGps(lat, lng, acc, Object.assign({}, opts, { skipNudge: true }));
                    if (typeof _daxiLockGpsPan === 'function') _daxiLockGpsPan();
                }
            }
            _ensureClientGpsLiveRunning();
            return evaluated.allowVisual;
        }
        lat = evaluated.lat;
        lng = evaluated.lng;
        acc = evaluated.acc;
    } else if (acc > DAXI_GPS_VALIDATED_MAX_M) {
        return false;
    }
    if (window.DaxiGpsTrace) DaxiGpsTrace.ok('CLIENT', 'CLIENT_LOCAL_UI', { lat: lat, lng: lng, accuracy: acc });
    if (!_daxiGpsBootAt) _daxiGpsBootAt = Date.now();

    if (!_daxiQuartierCenter || acc < (_daxiQuartierCenter.acc || 9999)) {
        _daxiQuartierCenter = { lat: lat, lng: lng, acc: acc };
    }

    if (!_daxiMainMapIsGoogle()) {
        if (!window._clientBgMap && (window._daxiOfflineMapMode || window._daxiExternalMapsBlocked) && window.DaxiOffline && DaxiOffline.initSimpleMap) {
            DaxiOffline.initSimpleMap('daxi-main-map', { force: true });
        }
        if (window._daxiOfflineMapMode || (window._daxiExternalMapsBlocked && !window.google)) {
            _daxiCommitGpsMapPoint(lat, lng, acc, opts);
            if (window._clientBgMap && _shouldAutoPanMap(opts) && !_daxiHasManualPickup()) {
                _daxiCenterClientOnVisibleMap(lat, lng, { zoom: _getClientGpsZoom(acc || 60), skipPanMark: true });
            }
            if (typeof window._daxiRevealLiveMap === 'function') window._daxiRevealLiveMap();
            return acc <= DAXI_GPS_VALIDATED_MAX_M;
        }
    }

    if (!window._clientBgMap || !window.google || !google.maps) {
        if (acc > DAXI_GPS_VALIDATED_MAX_M) return false;
        window._daxiPendingGpsVisual = { lat: lat, lng: lng, acc: acc, scanOnly: false };
        return true;
    }

    var isExact = acc <= DAXI_GPS_TARGET_M;
    var canShowValidated = acc <= DAXI_GPS_VALIDATED_MAX_M;

    if (!canShowValidated) {
        return false;
    }

    var mapCommitted = _daxiCommitGpsMapPoint(lat, lng, acc, opts);
    _ensureClientGpsRefineLoop();

    if (opts.refineOnly) return isExact;

    if (canShowValidated && (mapCommitted || opts.forcePan || opts.forceCenter)) {
        if (!_daxiGpsPanLocked(opts) && (opts.forcePan || opts.forceCenter)) {
            if (window._clientBgMap) {
                _daxiSmartPanForClientGps(lat, lng, acc, Object.assign({}, opts, { skipNudge: true }));
                if (typeof _daxiLockGpsPan === 'function') _daxiLockGpsPan();
            } else {
                window._daxiCommanderGpsFocusPending = true;
            }
        } else if (window._daxiCommanderGpsFocusPending && !_daxiGpsPanLocked()) {
            _daxiFocusMapOnReadyGps('gps-ready');
        } else if (mapCommitted && !_daxiGpsPanLocked() && !window._clientGpsPannedOnce) {
            _daxiSmartPanForClientGps(lat, lng, acc, { skipNudge: true });
            if (typeof _daxiLockGpsPan === 'function') _daxiLockGpsPan();
        }
    }

    var shouldPlacePickup = window._daxiPickupFromGps;
    if (shouldPlacePickup) {
        if (!_isPlaceCovered(lat, lng)) {
            window._daxiPickupFromGps = false;
            var inpG = document.getElementById('destinationAddress');
            if (inpG) _rejectUncoveredPlace(inpG, { lat: lat, lng: lng });
            return false;
        }
        _syncGpsPickupHiddenFields(lat, lng);
        _hideGpsPickupMarker();
        var ph = document.getElementById('pickupHidden');
        if (ph && !ph.value) ph.value = _daxiMyPositionLabel();
        if (!_gpsScanDone && acc <= DAXI_GPS_VALIDATED_MAX_M) _finalizeClientGpsScan(acc);
        _endGpsScanVisual();
        return true;
    }

    return isExact || acc <= DAXI_GPS_VALIDATED_MAX_M;
}

function _flushClientGpsToMap() {
    if (!window._lastClientGpsPos) return;
    var p = window._lastClientGpsPos;
    var opts = { acc: p.acc };
    if (!window._clientGpsPannedOnce && window._clientBgMap) opts.forceCenter = true;
    _placeClientPickupOnMap(p.lat, p.lng, opts);
}

function _resetClientGpsEngineForScan() {
    
}

function _ensureClientGpsEngineOnly() {
    if (_daxiIsNativeClientApp() && !_daxiNativeGpsGranted()) return;
    if (!window.DaxiGpsEngine) return;
    if (!_clientGpsEngine) _clientGpsEngine = _createClientGpsEngine();
    _clientGpsEngine.start(_onClientGpsLiveFix);
}

function _ensureClientGpsLiveRunning() {
    _ensureClientGpsEngineOnly();
    _ensureClientGpsRefineLoop();
}

function _fixToLatLng(fix) {
    if (!fix) return null;
    var acc = fix.rawAccuracy != null ? fix.rawAccuracy : (fix.accuracy || 999);
    if (fix.lat != null && fix.lng != null) {
        return { lat: fix.lat, lng: fix.lng, acc: acc, raw: fix.raw || null };
    }
    if (fix.raw && fix.raw.lat != null && fix.raw.lng != null) {
        return { lat: fix.raw.lat, lng: fix.raw.lng, acc: acc, raw: fix.raw };
    }
    return null;
}

function _engineFixToGeoPos(fix) {
    var p = _fixToLatLng(fix);
    return {
        coords: {
            latitude: p.lat,
            longitude: p.lng,
            accuracy: p.acc,
            speed: fix.speed || 0,
            heading: fix.heading
        },
        timestamp: fix.timestamp || Date.now()
    };
}

function _markGeoGranted() {
    try { localStorage.setItem(DAXI_GEO_GRANTED_KEY, '1'); } catch (e) {}
}

function _wasGeoPreviouslyGranted() {
    try { return localStorage.getItem(DAXI_GEO_GRANTED_KEY) === '1'; } catch (e) { return false; }
}

function _clearGeoGrantedFlag() {
    try { localStorage.removeItem(DAXI_GEO_GRANTED_KEY); } catch (e) {}
}

function _resolveGeoPermission(cb) {
    if (typeof DaxiAndroid !== 'undefined' && DaxiAndroid.isLocationEnabled && DaxiAndroid.isLocationEnabled()) {
        _markGeoGranted();
        cb('granted');
        return;
    }
    if (!navigator.geolocation) { cb('unsupported'); return; }
    if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' }).then(function(p) {
            if (p.state === 'granted') {
                _markGeoGranted();
                cb('granted');
                return;
            }
            if (p.state === 'denied') {
                _clearGeoGrantedFlag();
                cb('denied');
                return;
            }
            cb('prompt');
        }).catch(function() {
            cb(_wasGeoPreviouslyGranted() ? 'granted' : 'prompt');
        });
    } else {
        cb(_wasGeoPreviouslyGranted() ? 'granted' : 'prompt');
    }
}

function _requestPickupGps(onSuccess, onError, opts) {
    opts = opts || {};
    if (!navigator.geolocation) {
        _gpsError = true;
        if (onError) onError({ code: 0, message: 'unsupported' });
        return;
    }
    _hideLocationSharePrompt();
    var scanOpts = {
        targetAccuracy: DAXI_GPS_TARGET_M,
        maxAcceptableAccuracy: _clientGpsMaxAccept(),
        burstTimeout: _clientGpsBurstTimeout(),
        maxConcurrent: 4,
        maxTotalRequests: 8,
        maxScanMs: _clientGpsAcquireTimeout(),
        forceScan: opts.forceScan !== false
    };
    if (opts.forceScan !== false) {
        _gpsScanDone = false;
        _gpsLockedShown = false;
        _daxiGpsScanVisualDone = false;
        _scheduleGpsScanDeadline(5000);
    }
    function _pickupGpsSuccess(pos) {
        if (!pos || !pos.coords) {
            if (onError) onError({ code: 3, message: 'empty' });
            return;
        }
        _gpsError = false;
        _markGeoGranted();
        _hideLocationSharePrompt();
        var lat = pos.coords.latitude, lng = pos.coords.longitude;
        var acc = pos.coords.accuracy || 0;
        var src = (window.DaxiAndroid && DaxiAndroid.getCurrentLocation) ? 'Android' : 'GPS';
        if (window.DaxiGpsTrace) DaxiGpsTrace.gps('CLIENT', { lat: lat, lng: lng, accuracy: acc, source: src });
        var placed = _placeClientPickupOnMap(lat, lng, { acc: acc, source: 'pickup-scan' });
        _ensureClientGpsLiveRunning();
        if (acc <= DAXI_GPS_VALIDATED_MAX_M) {
            _finalizeClientGpsScan(acc);
            _endGpsScanVisual();
        }
        var pickupEl = document.getElementById('pickupHidden');
        if (placed && pickupEl && !pickupEl.value) pickupEl.value = _daxiMyPositionLabel();
        if (onSuccess) onSuccess(pos);
    }
    function _pickupGpsFail(geoErr) {
        _fallbackClientGps(_pickupGpsSuccess, function(err2) {
            _gpsError = true;
            var err = err2 || geoErr;
            if (err && err.code === 1) {
                _clearGeoGrantedFlag();
                _showLocationSharePrompt(true);
            }
            _endGpsScanVisual();
            if (onError) onError(err);
        });
    }
    var pickupTimedOut = false;
    var pickupTimer = setTimeout(function() {
        pickupTimedOut = true;
        if (_daxiGpsHasUsableFix()) {
            var cached = window._lastClientGpsPos;
            if (cached) {
                _pickupGpsSuccess({
                    coords: { latitude: cached.lat, longitude: cached.lng, accuracy: cached.acc || 60 },
                    timestamp: cached.ts || Date.now()
                });
                return;
            }
        }
        _pickupGpsFail({ code: 3, message: 'timeout' });
    }, opts.timeoutMs || 28000);
    var wrappedSuccess = function(pos) {
        clearTimeout(pickupTimer);
        if (pickupTimedOut && !_daxiGpsHasUsableFix()) return;
        pickupTimedOut = false;
        _pickupGpsSuccess(pos);
    };
    var wrappedFail = function(err) {
        if (_daxiGpsHasUsableFix()) {
            clearTimeout(pickupTimer);
            var cached = window._lastClientGpsPos;
            if (cached) {
                wrappedSuccess({
                    coords: { latitude: cached.lat, longitude: cached.lng, accuracy: cached.acc || 60 },
                    timestamp: cached.ts || Date.now()
                });
            }
            return;
        }
        clearTimeout(pickupTimer);
        if (pickupTimedOut) return;
        _pickupGpsFail(err);
    };
    _requestBestClientPosition(wrappedSuccess, wrappedFail, scanOpts);
}

var _clientGpsBootRetries = 0;

function _bootClientGps() {
    if (window._daxiGeoBrowserBlocked) {
        if (typeof _showLocationSharePrompt === 'function') _showLocationSharePrompt(true);
        return;
    }
    if (!_daxiHasGpsUserConsent()) {
        if (typeof _showLocationSharePrompt === 'function') _showLocationSharePrompt(false);
        return;
    }
    if (typeof _daxiIsNativeClientApp === 'function' && _daxiIsNativeClientApp() && typeof _daxiNativeGpsGranted === 'function' && !_daxiNativeGpsGranted()) {
        return;
    }
    if (_clientGpsBootStarted) {
        
        try { _ensureClientGpsLiveRunning(); } catch (e) {}
        return;
    }
    _clientGpsBootStarted = true;
    _daxiResetGpsMapCommit();
    if (window.DaxiClientGps) DaxiClientGps.reset();
    if (window.DaxiWebGps && !window.DaxiAndroid && !DaxiWebGps.getSession('CLIENT')) {
        DaxiWebGps.startSession('CLIENT', { exploitableM: DAXI_GPS_FALLBACK_M, targetAccuracy: DAXI_GPS_TARGET_M, timeoutMs: 15000 });
    }
    window._daxiPickupFromGps = false;
    var orderFocused = !!(window._daxiMainMapFocusOrderId || document.body.classList.contains('daxi-sheet-order-mode'));
    window._daxiForceGpsPanOnce = !orderFocused;
    _daxiGpsFinalized = false;
    _daxiGpsLocked = false;
    _resetGpsScanTimers();
    _daxiGpsScanStartedAt = Date.now();
    _ensureClientGpsLiveRunning();
    _requestBestClientPosition(function(pos) {
        if (!pos || !pos.coords) return;
        var lat = pos.coords.latitude, lng = pos.coords.longitude, acc = pos.coords.accuracy || 999;
        _markGeoGranted();
        _clientGpsBootRetries = 0;
        _placeClientPickupOnMap(lat, lng, {
            acc: acc,
            forcePan: !orderFocused,
            source: 'boot'
        });
        if (typeof _daxiSyncClientGpsOnMapReady === 'function') _daxiSyncClientGpsOnMapReady('boot');
        else if (typeof _daxiRequestCommanderGpsFocus === 'function') _daxiRequestCommanderGpsFocus('boot');
        _endGpsScanVisual();
    }, function() {
        if (window._daxiGeoBrowserBlocked) {
            _endGpsScanVisual();
            return;
        }
        if (_clientGpsBootRetries < 4) {
            _clientGpsBootRetries++;
            _clientGpsBootStarted = false;
            setTimeout(_bootClientGps, 1200);
            return;
        }
        _daxiScheduleGpsFailureNotice(_daxiNotifyGpsUnavailable, 12000);
        _endGpsScanVisual();
    }, { source: 'boot', forcePan: !orderFocused, forceScan: false });
    setTimeout(function() { if (typeof _endGpsScanVisual === 'function') _endGpsScanVisual(); }, 4200);
}

window._daxiResolveGeoPermission = _resolveGeoPermission;
window._daxiShowLocationSharePrompt = _showLocationSharePrompt;
window._daxiHideLocationSharePrompt = _hideLocationSharePrompt;
window._daxiMarkGeoGranted = _markGeoGranted;
window._daxiRequestPickupGps = _requestPickupGps;

function _absorbBestPosition(best, pos) {
    if (!pos || !pos.coords) return best;
    if (!best || (pos.coords.accuracy || 99999) < (best.coords.accuracy || 99999)) return pos;
    return best;
}

function _showLocationSharePrompt(forceDenied) {
    if (window._daxiIntroPlaying) {
        window._daxiLocationPromptQueued = forceDenied || window._daxiLocationPromptQueued || true;
        if (!window._daxiLocationPromptIntroBound) {
            window._daxiLocationPromptIntroBound = true;
            var resumeLoc = function() {
                var queued = window._daxiLocationPromptQueued;
                window._daxiLocationPromptQueued = false;
                if (queued) _showLocationSharePrompt(queued === true ? false : queued);
            };
            window.addEventListener('daxi:intro-complete', resumeLoc, { once: true });
            document.addEventListener('daxi:intro-complete', resumeLoc, { once: true });
        }
        return;
    }
    // Always show the in-app consent modal first (site + Capacitor).
    // Native Android WebView uses its own dialog via _daxiNativePermissionHost.
    if (window._daxiNativePermissionHost) return;
    _initLocationSharePrompt();
    _bindLocationSharePromptDelegation();
    if (window._daxiDismissInitialLoader) window._daxiDismissInitialLoader();
    if (typeof _endGpsScanVisual === 'function') _endGpsScanVisual();
    var el = document.getElementById('locationSharePrompt');
    if (!el) return;
    var desc = el.querySelector('.location-share-desc');
    if (desc && forceDenied === 'approximate') {
        desc.textContent = 'Android n’a autorisé que la position approximative (souvent 300 m à 1 km). DAXI a besoin de la position précise. Ouvrez les réglages de l’application → Autorisations → Localisation → Autoriser la position précise.';
    } else if (desc && forceDenied) {
        desc.textContent = 'La localisation est bloquée par le navigateur (refus répétés). Cliquez sur l’icône ⚙ / cadenas à gauche de daxipro.com → Autorisations → Localisation → Autoriser, puis rechargez la page. Ou saisissez l’adresse manuellement.';
    }
    var settingsBtn = document.getElementById('locPreciseSettingsBtn');
    if (settingsBtn) settingsBtn.hidden = forceDenied !== 'approximate';
    el.classList.add('show');
}

function _hideLocationSharePrompt() {
    var el = document.getElementById('locationSharePrompt');
    if (el) el.classList.remove('show');
}

function _initLocationSharePrompt() {
    _bindLocationSharePromptDelegation();
    var closeBtn = document.getElementById('locPromptClose');
    var enableBtn = document.getElementById('locEnableBtn');
    var settingsBtn = document.getElementById('locPreciseSettingsBtn');
    var manualBtn = document.getElementById('locManualBtn');
    var destinationSwitch = document.getElementById('destinationSwitch');
    var destinationField = document.getElementById('destinationField');
    if (closeBtn && !closeBtn.dataset.bound) {
        closeBtn.dataset.bound = '1';
        closeBtn.addEventListener('click', function() {
            _markLocPromptDone();
            _hideLocationSharePrompt();
            _daxiScheduleNotifAfterLocFlow();
        });
    }
    if (manualBtn && !manualBtn.dataset.bound) {
        manualBtn.dataset.bound = '1';
        manualBtn.addEventListener('click', function() {
            _markLocPromptDone();
            if (destinationSwitch) destinationSwitch.checked = true;
            if (destinationField) destinationField.classList.remove('hidden');
            _hideLocationSharePrompt();
            _daxiScheduleNotifAfterLocFlow();
        });
    }
    if (settingsBtn && !settingsBtn.dataset.bound) {
        settingsBtn.dataset.bound = '1';
        settingsBtn.addEventListener('click', function() {
            if (window.DaxiAndroid && typeof DaxiAndroid.openLocationSettings === 'function') {
                DaxiAndroid.openLocationSettings();
            } else if (window.DaxiGps && typeof DaxiGps.openAppSettings === 'function') {
                DaxiGps.openAppSettings();
            }
        });
    }
    if (enableBtn && !enableBtn.dataset.bound) {
        enableBtn.dataset.bound = '1';
        enableBtn.addEventListener('click', function() {
            window._daxiUserAskedLocationPrompt = true;
            _markLocPromptDone();
            _hideLocationSharePrompt();
            _daxiRequestBrowserGeoFromUserGesture(function() {
                if (window._daxiPendingPickupAfterConsent) {
                    var pending = window._daxiPendingPickupAfterConsent;
                    window._daxiPendingPickupAfterConsent = null;
                    setTimeout(function() {
                        if (typeof window._daxiUseMyPositionForInput === 'function') {
                            window._daxiUseMyPositionForInput(pending.inputEl, pending.btnEl);
                        }
                    }, 80);
                }
                _daxiScheduleNotifAfterLocFlow();
            });
        });
    }
}

function _bindLocationSharePromptDelegation() {
    if (window._daxiLocPromptDelegationBound) return;
    window._daxiLocPromptDelegationBound = true;
    document.addEventListener('click', function(e) {
        var root = document.getElementById('locationSharePrompt');
        if (!root || !root.classList.contains('show')) return;
        if (window._daxiNativePermissionHost) return;
        var closeBtn = e.target.closest('#locPromptClose');
        var manualBtn = e.target.closest('#locManualBtn');
        var enableBtn = e.target.closest('#locEnableBtn');
        if (closeBtn) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof _markLocPromptDone === 'function') _markLocPromptDone();
            if (typeof _hideLocationSharePrompt === 'function') _hideLocationSharePrompt();
            if (typeof _daxiScheduleNotifAfterLocFlow === 'function') _daxiScheduleNotifAfterLocFlow();
            return;
        }
        if (manualBtn) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof _markLocPromptDone === 'function') _markLocPromptDone();
            var destinationSwitch = document.getElementById('destinationSwitch');
            var destinationField = document.getElementById('destinationField');
            if (destinationSwitch) destinationSwitch.checked = true;
            if (destinationField) destinationField.classList.remove('hidden');
            if (typeof _hideLocationSharePrompt === 'function') _hideLocationSharePrompt();
            if (typeof _daxiScheduleNotifAfterLocFlow === 'function') _daxiScheduleNotifAfterLocFlow();
            return;
        }
        if (enableBtn) {
            e.preventDefault();
            e.stopPropagation();
            window._daxiUserAskedLocationPrompt = true;
            if (typeof _markLocPromptDone === 'function') _markLocPromptDone();
            if (typeof _hideLocationSharePrompt === 'function') _hideLocationSharePrompt();
            if (typeof _daxiRequestBrowserGeoFromUserGesture === 'function') {
                _daxiRequestBrowserGeoFromUserGesture(function() {
                    if (window._daxiPendingPickupAfterConsent) {
                        var pending = window._daxiPendingPickupAfterConsent;
                        window._daxiPendingPickupAfterConsent = null;
                        setTimeout(function() {
                            if (typeof window._daxiUseMyPositionForInput === 'function') {
                                window._daxiUseMyPositionForInput(pending.inputEl, pending.btnEl);
                            }
                        }, 80);
                    }
                    if (typeof _daxiScheduleNotifAfterLocFlow === 'function') _daxiScheduleNotifAfterLocFlow();
                });
            }
        }
    }, true);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initLocationSharePrompt);
} else {
    _initLocationSharePrompt();
}

function _clientGpsMaxAccept() {
    return DAXI_GPS_MAX_ACCEPT_M;
}

function _clientGpsFallbackAccept() {
    return DAXI_GPS_FALLBACK_M;
}

function _clientGpsBurstTimeout() {
    return _isDesktopClientGps() ? 8000 : 12000;
}

function _clientGpsAcquireTimeout() {
    return _isDesktopClientGps() ? 8000 : 12000;
}

function _clientGpsMaxRequests() {
    return 36;
}

function _clientGpsEngineMode() {
    return _isDesktopClientGps() ? 'desktop' : 'pedestrian';
}

function _createClientGpsEngine() {
    return DaxiGpsEngine.create({
        mode: _clientGpsEngineMode(),
        targetAccuracy: DAXI_GPS_TARGET_M,
        maxAccuracy: DAXI_GPS_VALIDATED_MAX_M,
        displayMaxAccuracy: DAXI_GPS_VALIDATED_MAX_M,
        geoFollow: { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
    });
}

var _clientGpsRefineTimer = null;

function _daxiIsNativeGpsHost() {
    return !!(window._daxiCapacitorApp || window._daxiUseNativeGps || window._daxiHybridShell
        || window.DaxiAndroid
        || (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()));
}

function _clientGpsRefinePollMs() {
    var v = window.DaxiClientGps && DaxiClientGps.getValidated();
    if (!v) return 1000;
    return v.acc > DAXI_GPS_TARGET_M ? 1000 : 2500;
}

function _clientGpsRefineTick() {
    if (_daxiIsNativeGpsHost()) return;
    if (!navigator.geolocation || !window.DaxiClientGps) return;
    if (typeof _daxiHasGpsUserConsent === 'function' && !_daxiHasGpsUserConsent()) return;
    _ensureClientGpsEngineOnly();
    var validated = DaxiClientGps.getValidated();
    if (validated && validated.acc <= DAXI_GPS_TARGET_M) {
        if (_clientGpsEngine) {
            var live = _clientGpsEngine.getDisplayPosition() || _clientGpsEngine.getPosition() || _clientGpsEngine.getBestFix();
            var p = live ? _fixToLatLng(live) : null;
            if (p) {
                window._lastClientGpsPos = { lat: p.lat, lng: p.lng, acc: p.acc, ts: Date.now() };
                _daxiCommitGpsMapPoint(p.lat, p.lng, p.acc, { source: 'refine-live' });
            }
        }
        return;
    }
    navigator.geolocation.getCurrentPosition(function(pos) {
        if (!pos || !pos.coords) return;
        var ev = DaxiClientGps.processGeoPos(pos, 'refine-poll', { ageMs: 0 });
        if (!ev || ev.decision === 'REJECT') return;
        window._lastClientGpsPos = { lat: ev.lat, lng: ev.lng, acc: ev.acc, ts: Date.now() };
        if (ev.decision === 'ACCEPT') {
            DaxiClientGps.setDisplay(ev.lat, ev.lng, ev.acc, true);
        }
        _placeClientPickupOnMap(ev.lat, ev.lng, {
            acc: ev.acc,
            evaluated: ev,
            refineOnly: true,
            source: 'refine-poll'
        });
    }, function() {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 });
}

function _startClientGpsRefineLoop() {
    _ensureClientGpsRefineLoop();
}

function _ensureClientGpsRefineLoop() {
    if (_daxiIsNativeGpsHost()) {
        if (_clientGpsRefineTimer) {
            clearTimeout(_clientGpsRefineTimer);
            _clientGpsRefineTimer = null;
        }
        return;
    }
    if (_clientGpsRefineTimer) return;
    function schedule() {
        _clientGpsRefineTimer = setTimeout(function() {
            _clientGpsRefineTick();
            schedule();
        }, _clientGpsRefinePollMs());
    }
    schedule();
    _clientGpsRefineTick();
}

function _daxiGetCachedClientPosition(maxAgeMs) {
    maxAgeMs = maxAgeMs || 120000;
    if (window.DaxiClientGps) {
        var v = DaxiClientGps.getValidated();
        if (v && (!v.ts || (Date.now() - v.ts) <= maxAgeMs)) {
            return { lat: v.lat, lng: v.lng, acc: v.acc, ts: v.ts || Date.now() };
        }
        var approx = DaxiClientGps.getApprox && DaxiClientGps.getApprox();
        if (approx && (!approx.ts || (Date.now() - approx.ts) <= maxAgeMs)) {
            return { lat: approx.lat, lng: approx.lng, acc: approx.acc, ts: approx.ts || Date.now() };
        }
        var disp = DaxiClientGps.getDisplay && DaxiClientGps.getDisplay();
        if (disp && (!disp.ts || (Date.now() - disp.ts) <= maxAgeMs)) {
            return { lat: disp.lat, lng: disp.lng, acc: disp.acc, ts: disp.ts || Date.now() };
        }
    }
    var p = window._lastClientGpsPos;
    if (p && p.lat != null && p.lng != null) {
        if (!p.ts || (Date.now() - p.ts) <= maxAgeMs) return p;
    }
    if (_clientGpsEngine) {
        var live = _clientGpsEngine.getDisplayPosition() || _clientGpsEngine.getPosition() || _clientGpsEngine.getBestFix();
        if (live) {
            var fix = _fixToLatLng(live);
            if (fix) {
                return { lat: fix.lat, lng: fix.lng, acc: fix.acc, ts: Date.now() };
            }
        }
    }
    return null;
}

function _daxiCachedPositionToGeoPos(p) {
    return {
        coords: { latitude: p.lat, longitude: p.lng, accuracy: p.acc || 999 },
        timestamp: p.ts || Date.now()
    };
}

function _updateClientBookingMarker(lat, lng) {
    var m = window._bookingMarkers && window._bookingMarkers.pickup;
    if (!m) return false;
    if (m.position != null) {
        m.position = { lat: lat, lng: lng };
    } else if (m.setPosition) {
        m.setPosition({ lat: lat, lng: lng });
        m.position = { lat: lat, lng: lng };
    }
    return true;
}

function _onClientGpsLiveFix(fix) {
    if (!fix) return;
    var p = _fixToLatLng(fix);
    if (!p) return;
    if (p.acc > DAXI_GPS_VALIDATED_MAX_M) return;
    var evaluated = window.DaxiClientGps ? DaxiClientGps.processEngineFix(fix, 'engine-live') : null;
    if (evaluated && evaluated.decision === 'REJECT') return;
    _gpsError = false;
    var lat = evaluated ? evaluated.lat : p.lat;
    var lng = evaluated ? evaluated.lng : p.lng;
    var acc = evaluated ? evaluated.acc : p.acc;
    window._lastClientGpsPos = { lat: lat, lng: lng, acc: acc, ts: Date.now() };
    _daxiCommitGpsMapPoint(lat, lng, acc, { source: 'engine-live' });
    _daxiCancelGpsFailureNotice();
    _daxiClearPickupWatchdog();
    if (typeof _daxiTryCompleteLocatingPickupFromGps === 'function') _daxiTryCompleteLocatingPickupFromGps();
    if (window.DaxiClientGps) {
        var validated = evaluated && evaluated.decision === 'ACCEPT';
        DaxiClientGps.setDisplay(lat, lng, acc, validated);
    }
    if (!_gpsScanDone && acc <= DAXI_GPS_VALIDATED_MAX_M) {
        _finalizeClientGpsScan(acc);
        _endGpsScanVisual();
    }
    _ensureClientGpsRefineLoop();
}

function _requestPrecisionPosition(onSuccess, onError, opts) {
    opts = opts || {};
    var target = opts.targetAccuracy || DAXI_GPS_TARGET_M;
    if (!navigator.geolocation) {
        if (onError) onError({ code: 0, message: 'geolocation unavailable' });
        return;
    }
    if (!window.DaxiGpsEngine) {
        _simpleClientGps(onSuccess, onError, opts);
        return;
    }
    _ensureClientGpsLiveRunning();
    var engine = _clientGpsEngine || _createClientGpsEngine();
    engine.rapidScan(
        function(fix) {
            if (!_clientGpsEngine) _clientGpsEngine = engine;
            var validated = _daxiValidateEngineFix(fix, 'rapidScan-done');
            if (!validated) {
                _ensureClientGpsLiveRunning();
                _fallbackClientGps(onSuccess, onError);
                return;
            }
            onSuccess({
                coords: { latitude: validated.lat, longitude: validated.lng, accuracy: validated.acc },
                timestamp: validated.ts || Date.now()
            });
            _ensureClientGpsLiveRunning();
        },
        function(err) {
            _fallbackClientGps(onSuccess, onError);
        },
        function(fix) {
            if (!_clientGpsEngine) _clientGpsEngine = engine;
            var p = _fixToLatLng(fix);
            if (!p) return;
            var evaluated = window.DaxiClientGps ? DaxiClientGps.processEngineFix(fix, 'rapidScan-refine') : null;
            if (evaluated && evaluated.decision === 'REJECT') return;
            if (!evaluated || evaluated.decision === 'ACCEPT') {
                window._lastClientGpsPos = { lat: p.lat, lng: p.lng, acc: p.acc, ts: Date.now() };
            }
            if ((!evaluated || evaluated.decision === 'ACCEPT' || evaluated.allowVisual) &&
                (!_daxiQuartierCenter || p.acc < (_daxiQuartierCenter.acc || 9999))) {
                _daxiQuartierCenter = { lat: p.lat, lng: p.lng, acc: p.acc };
            }
            _placeClientPickupOnMap(p.lat, p.lng, {
                acc: p.acc,
                refineOnly: true,
                source: 'rapidScan-refine',
                evaluated: evaluated
            });
        },
        {
            targetAccuracy: target,
            requireTargetAccuracy: false,
            maxAccuracy: DAXI_GPS_VALIDATED_MAX_M,
            fallbackAccuracy: DAXI_GPS_VALIDATED_MAX_M,
            burstTimeout: opts.burstTimeout || _clientGpsBurstTimeout(),
            maxConcurrent: opts.maxConcurrent || 6,
            maxTotalRequests: opts.maxTotalRequests || 24,
            maxScanMs: opts.maxScanMs || _clientGpsAcquireTimeout(),
            getPollMs: 600
        }
    );
}

function _fallbackClientGps(onSuccess, onError) {
    _simpleClientGps(onSuccess, onError, {
        targetAccuracy: DAXI_GPS_TARGET_M,
        maxAcceptableAccuracy: _clientGpsFallbackAccept(),
        overallTimeout: _clientGpsAcquireTimeout() + 3000,
        maxAttempts: 12,
        attemptTimeout: 12000,
        retryDelay: 250
    });
}

function _simpleClientGps(onSuccess, onError, opts) {
    opts = opts || {};
    var maxAccept = opts.maxAcceptableAccuracy || _clientGpsMaxAccept();
    var best = null, tries = 0, maxTries = opts.maxAttempts || 6, done = false;
    var timer = null;

    function _finishSuccess(pos) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        onSuccess(pos);
    }
    function _finishError(err) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (onError) onError(err);
    }

    if (window._daxiCapacitorGetPosition) {
        var capTimer = setTimeout(function() {
            if (!done && best) _finishSuccess(best);
            else if (!done) _finishError({ code: 3, message: 'imprecise', accuracy: best ? best.coords.accuracy : null });
        }, opts.overallTimeout || _clientGpsBurstTimeout() + 1000);
        function capTry() {
            if (done) return;
            tries++;
            window._daxiCapacitorGetPosition({ enableHighAccuracy: true, timeout: opts.attemptTimeout || 10000 }).then(function(pos) {
                var acc = pos.coords.accuracy || 999;
                if (acc <= maxAccept && (!best || acc < (best.coords.accuracy || 999))) best = pos;
                if (acc <= (opts.targetAccuracy || DAXI_GPS_TARGET_M) || tries >= maxTries) {
                    clearTimeout(capTimer);
                    var final = best || pos;
                    if ((final.coords.accuracy || 999) <= maxAccept) _finishSuccess(final);
                    else if ((final.coords.accuracy || 999) <= _clientGpsFallbackAccept()) _finishSuccess(final);
                    else _finishError({ code: 3, message: 'imprecise', accuracy: final.coords.accuracy });
                } else {
                    setTimeout(capTry, opts.retryDelay || 500);
                }
            }).catch(function(err) {
                if (best && (best.coords.accuracy || 999) <= maxAccept) { clearTimeout(capTimer); _finishSuccess(best); }
                else if (tries >= maxTries) { clearTimeout(capTimer); _finishError(err); }
                else setTimeout(capTry, opts.retryDelay || 500);
            });
        }
        capTry();
        return;
    }

    if (!navigator.geolocation) { if (onError) onError({ code: 0, message: 'unsupported' }); return; }
    timer = setTimeout(function() {
        if (done) return;
        done = true;
        if (best && (best.coords.accuracy || 999) <= maxAccept) onSuccess(best);
        else if (best && (best.coords.accuracy || 999) <= _clientGpsFallbackAccept()) onSuccess(best);
        else if (onError) onError({ code: 3, message: 'imprecise', accuracy: best ? best.coords.accuracy : null });
    }, opts.overallTimeout || _clientGpsBurstTimeout() + 1000);
    function go() {
        if (done) return;
        tries++;
        navigator.geolocation.getCurrentPosition(function(pos) {
            var acc = pos.coords.accuracy || 999;
            var accepted = pos;
            if (window.DaxiClientGps) {
                var ev = DaxiClientGps.processGeoPos(pos, 'simple-gps');
                if (ev && ev.decision === 'ACCEPT') {
                    accepted = {
                        coords: { latitude: ev.lat, longitude: ev.lng, accuracy: ev.acc },
                        timestamp: ev.ts || Date.now()
                    };
                    acc = ev.acc;
                } else if (ev && ev.decision === 'REJECT') {
                    if (tries >= maxTries) { done = true; clearTimeout(timer); if (onError) onError({ code: 3, message: 'rejected' }); }
                    else setTimeout(go, opts.retryDelay || 250);
                    return;
                }
            }
            if (acc <= maxAccept && (!best || acc < (best.coords.accuracy || 999))) best = accepted;
            if (acc <= (opts.targetAccuracy || DAXI_GPS_TARGET_M) || tries >= maxTries) {
                done = true;
                clearTimeout(timer);
                var final = best || accepted;
                var finalAcc = final.coords.accuracy || 999;
                if (finalAcc <= maxAccept) onSuccess(final);
                else if (finalAcc <= _clientGpsFallbackAccept()) onSuccess(final);
                else if (onError) onError({ code: 3, message: 'imprecise', accuracy: finalAcc });
            } else {
                setTimeout(go, opts.retryDelay || 250);
            }
        }, function(err) {
            if (best && (best.coords.accuracy || 999) <= maxAccept) { done = true; clearTimeout(timer); onSuccess(best); }
            else if (tries >= maxTries) { done = true; clearTimeout(timer); if (onError) onError(err); }
            else setTimeout(go, opts.retryDelay || 500);
        }, { enableHighAccuracy: true, maximumAge: 0, timeout: opts.attemptTimeout || 10000 });
    }
    go();
}

function _applyClientGpsSuccess(pos, btn, inp) {
    var lat = pos.coords.latitude, lng = pos.coords.longitude;
    var acc = Math.round(pos.coords.accuracy || 0);
    if (!inp) inp = document.getElementById('destinationAddress');
    _ensureCoverageCheck(lat, lng, function(covered) {
        if (!covered) {
            window._daxiPickupFromGps = false;
            _daxiFinishPickupInputState(inp, btn, false);
            if (inp) {
                inp.value = '';
                inp.dataset.placeSelected = '';
                if (typeof _daxiSyncPlacesInputDisplay === 'function') _daxiSyncPlacesInputDisplay(inp, '');
            }
            var ph = document.getElementById('pickupHidden');
            if (ph) ph.value = '';
            var latEl = document.getElementById('pickupLatHidden');
            var lngEl = document.getElementById('pickupLngHidden');
            if (latEl) latEl.value = '';
            if (lngEl) lngEl.value = '';
            _rejectUncoveredPlace(inp, { lat: lat, lng: lng });
            if (window.DaxiGpsDiag) {
                DaxiGpsDiag.displaySkip('D', 'uncovered-place', { acc: acc, via: 'applyClientGpsSuccess' });
            }
            return;
        }
        _gpsError = false;
        _markGeoGranted();
        _hideLocationSharePrompt();
        window._daxiPickupFromGps = true;
        _daxiResetGpsMapCommit();
        _clearUncoveredBlock(inp);
        var placed = _placeClientPickupOnMap(lat, lng, { acc: acc, force: true, source: 'my-position' });
        if (!placed) {
            window._daxiPickupFromGps = false;
            _daxiFinishPickupInputState(inp, btn, false);
            return;
        }
        _ensureClientGpsLiveRunning();
        _stopDaxiGpsScan();
        var note = document.getElementById('gpsUnavailableNote');
        if (note) note.remove();
        _daxiFinishPickupInputState(inp, btn, true);
        if (inp) {
            inp.value = _daxiMyPositionLabel();
            inp.dataset.placeSelected = '1';
            if (typeof _daxiSyncPlacesInputDisplay === 'function') {
                _daxiSyncPlacesInputDisplay(inp, _daxiMyPositionLabel());
            }
        }
        var ph2 = document.getElementById('pickupHidden');
        if (ph2) ph2.value = _daxiMyPositionLabel();
        if (!_gpsScanDone) {
            if (acc <= DAXI_GPS_VALIDATED_MAX_M) _finalizeClientGpsScan(acc);
        }
    });
}

function _startClientGpsLive(existingEngine) {
    if (existingEngine) _clientGpsEngine = existingEngine;
    _ensureClientGpsLiveRunning();
}

function _requestBestClientPosition(onSuccess, onError, opts) {
    opts = opts || {};
    if (!opts.forceScan) {
        var cached = _daxiGetCachedClientPosition();
        if (cached) {
            onSuccess(_daxiCachedPositionToGeoPos(cached));
            _ensureClientGpsLiveRunning();
            return;
        }
    }
    if (!opts.forceScan && _clientGpsEngine) {
        var live = _clientGpsEngine.getDisplayPosition() || _clientGpsEngine.getPosition() || _clientGpsEngine.getBestFix();
        if (live && (live.rawAccuracy || live.accuracy || 999) <= DAXI_GPS_VALIDATED_MAX_M) {
            onSuccess(_engineFixToGeoPos(live));
            _ensureClientGpsLiveRunning();
            return;
        }
    }
    _requestPrecisionPosition(onSuccess, function(err) {
        _fallbackClientGps(onSuccess, onError);
    }, opts);
}

function _getClientGpsZoom(accuracy) {
    if (!isFinite(accuracy)) return 17;
    if (accuracy <= 12) return 19;
    if (accuracy <= 25) return 18;
    if (accuracy <= 60) return 17;
    if (accuracy <= 100) return 16;
    if (accuracy <= 200) return 15;
    return 14;
}

function _daxiFlushClientGpsToMap() {
    var p = window._daxiPendingGpsVisual || window._lastClientGpsPos;
    if ((!p || p.lat == null) && window.DaxiClientGps) {
        p = (DaxiClientGps.getDisplay && DaxiClientGps.getDisplay())
            || (DaxiClientGps.getValidated && DaxiClientGps.getValidated())
            || (DaxiClientGps.getApprox && DaxiClientGps.getApprox());
    }
    if (!p || p.lat == null || p.lng == null) return;
    var needsForce = !_daxiGpsMarkerVisible();
    _daxiCommitGpsMapPoint(p.lat, p.lng, p.acc || p.accuracy || 250, { force: needsForce || !_daxiGpsMapCommitted, source: 'flush' });
}
window._daxiFlushClientGpsToMap = _daxiFlushClientGpsToMap;

function _updateClientLocationVisual(lat, lng, accuracy, scanOnly) {
    window._daxiPendingGpsVisual = { lat: lat, lng: lng, acc: accuracy, scanOnly: !!scanOnly };
    var mapLive = !!(document.getElementById('daxi-map-stage') && document.getElementById('daxi-map-stage').classList.contains('is-live'));
    var mapReady = !!(window._daxiMapVisualReady || window._daxiMapPlaceholderHidden);
    if (!mapLive || !mapReady) {
        return;
    }
    if (window._daxiOfflineMapMode) {
        if (typeof window._daxiMapAllowsGpsVisual === 'function' && !window._daxiMapAllowsGpsVisual()) {
            var ov2 = document.getElementById('daxi-gps-overlay');
            if (ov2) ov2.style.display = 'none';
            return;
        }
        if (typeof window._updateOfflineMapUserDot === 'function') {
            window._updateOfflineMapUserDot(lat, lng, accuracy);
        }
        return;
    }
    if (!window._clientBgMap || !window.google || !google.maps) return;
    if (!document.querySelector('#daxi-main-map .gm-style')) {
        if (!window._daxiGpsVisualRetryTimer) {
            window._daxiGpsVisualRetryTimer = setTimeout(function() {
                window._daxiGpsVisualRetryTimer = null;
                var pending = window._daxiPendingGpsVisual;
                if (pending) _updateClientLocationVisual(pending.lat, pending.lng, pending.acc, pending.scanOnly);
            }, 180);
        }
        return;
    }
    var pos = { lat: lat, lng: lng };
    var AdvancedMarkerElement = window._daxiAdvancedMarkerElement;
    if (AdvancedMarkerElement) {
        if (!window._clientLocationMarker) {
            window._clientLocationMarker = new AdvancedMarkerElement({
                position: pos,
                map: window._clientBgMap,
                zIndex: 999,
                title: 'Votre position actuelle',
                content: _daxiClientBlueDotEl({ advancedMarker: true })
            });
            window._clientLocationMarkerIsAdvanced = true;
        } else if (window._clientLocationMarkerIsAdvanced) {
            window._clientLocationMarker.position = pos;
            window._clientLocationMarker.map = window._clientBgMap;
            if (!window._clientGpsMarkerAnchorFixed) {
                window._clientLocationMarker.content = _daxiClientBlueDotEl({ advancedMarker: true });
                window._clientGpsMarkerAnchorFixed = true;
            }
        }
    } else if (!window._clientLocationMarker) {
        window._clientLocationMarker = new google.maps.Marker({
            position: pos,
            map: window._clientBgMap,
            zIndex: 999,
            title: 'Votre position actuelle',
            icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 6,
                fillColor: '#3b82f6',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2
            }
        });
        window._clientLocationMarkerIsAdvanced = false;
    } else if (!window._clientLocationMarkerIsAdvanced) {
        window._clientLocationMarker.setPosition(pos);
        if (!window._clientLocationMarker.getMap()) window._clientLocationMarker.setMap(window._clientBgMap);
    }
    if (window._clientLocationAccuracyCircle && window._clientLocationAccuracyCircle.setMap) {
        window._clientLocationAccuracyCircle.setMap(null);
        window._clientLocationAccuracyCircle = null;
    }
    if (window.DaxiClientGps) {
        DaxiClientGps.logDisplay(pos, pos, accuracy || 0, true);
    }
}

function recenterClientMap() {
    if (!window._clientBgMap) return;
    var btn = document.getElementById('client-map-recenter');
    if (btn) btn.style.opacity = '0.45';
    if (window._bookingMarkers.pickup || window._bookingMarkers.dest) {
        _fitMapToBookingMarkers();
        if (btn) btn.style.opacity = '';
        return;
    }
    _requestBestClientPosition(function(pos) {
        var lat = pos.coords.latitude, lng = pos.coords.longitude;
        _setMainMapBookingPoint('pickup', lat, lng, 'pickupLatHidden', 'pickupLngHidden', 'destinationAddress');
        if (btn) btn.style.opacity = '';
        var acc = pos.coords.accuracy || 0;
        if (btn) btn.title = acc ? ('Précision GPS ±' + Math.round(acc) + ' m') : 'Recentrer sur ma position';
    }, function() {
        window._clientBgMap.panTo({ lat: 19.7607, lng: -72.2039 });
        if (btn) btn.style.opacity = '';
    }, {
        targetAccuracy: DAXI_GPS_TARGET_M,
        burstTimeout: _clientGpsBurstTimeout()
    });
}

function refreshGpsForOrder(orderId) {
    if (!navigator.geolocation) return;
    var statusEl = document.getElementById('gps-refresh-status-' + orderId);
    if (statusEl) statusEl.textContent = '…';
    navigator.geolocation.getCurrentPosition(function(pos) {
        var validated = _daxiValidateGeoPos(pos, 'order-refresh');
        if (!validated) {
            if (statusEl) statusEl.textContent = 'Précision insuffisante';
            return;
        }
        var lat = validated.lat, lng = validated.lng;
        var body = new URLSearchParams();
        body.set('lat', String(lat));
        body.set('lng', String(lng));
        var gid = _daxiGuestIdForRequest();
        if (gid) body.set('guest_id', gid);
        _daxiClientFetch('/htmx/client/orders/' + orderId + '/update-gps/', {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body
        }).then(function(r) { return r.text(); }).then(function() {
            if (statusEl) statusEl.textContent = '✓ Position enregistrée';
        }).catch(function() {
            if (statusEl) statusEl.textContent = 'Erreur GPS';
        });
    }, function() {
        if (statusEl) statusEl.textContent = 'GPS refusé';
    }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 });
}
window.refreshGpsForOrder = refreshGpsForOrder;

function toggleClientMapTilt() {
    if (!window._clientBgMap || !window._clientBgMap.getTilt) return;
    var cur = window._clientBgMap.getTilt() || 0;
    var next = cur > 4 ? 0 : 52;
    try { window._clientBgMap.setTilt(next); } catch (e) {}
}

function _daxiTryCompleteLocatingPickupFromGps() {
    if (!_daxiGpsHasUsableFix()) return;
    var inp = document.getElementById('destinationAddress');
    if (!inp || !inp.classList.contains('daxi-pickup-locating')) return;
    var p = window._lastClientGpsPos;
    if (!p || p.lat == null) return;
    var btn = document.getElementById('myPositionBtn');
    _applyClientGpsSuccess({
        coords: { latitude: p.lat, longitude: p.lng, accuracy: p.acc || 60 },
        timestamp: p.ts || Date.now()
    }, btn, inp);
}

function _daxiGpsFailInput(inp, btn, msg) {
    if (_daxiGpsHasUsableFix()) {
        _daxiTryCompleteLocatingPickupFromGps();
        if (inp && inp.classList.contains('daxi-pickup-locating')) return;
        _daxiFinishPickupInputState(inp, btn, true);
        var noteOk = document.getElementById('gpsUnavailableNote');
        if (noteOk) noteOk.remove();
        return;
    }
    _daxiScheduleGpsFailureNotice(function() {
        if (_daxiGpsHasUsableFix()) {
            _daxiTryCompleteLocatingPickupFromGps();
            return;
        }
        _daxiFinishPickupInputState(inp, btn, false);
        if (inp) {
            inp.value = '';
            delete inp.dataset.lat;
            delete inp.dataset.lng;
            delete inp.dataset.placeSelected;
            if (typeof _daxiSyncPlacesInputDisplay === 'function') {
                _daxiSyncPlacesInputDisplay(inp, '');
            }
            if (inp.id === 'destinationAddress') {
                window._daxiPickupFromGps = false;
                var ph = document.getElementById('pickupHidden');
                if (ph) ph.value = '';
                var latEl = document.getElementById('pickupLatHidden');
                var lngEl = document.getElementById('pickupLngHidden');
                if (latEl) latEl.value = '';
                if (lngEl) lngEl.value = '';
            }
        }
        _daxiNotifyGpsUnavailable(msg);
    }, 5000);
}

function _initDaxiSheetHandleDrag() {
    var handle = document.getElementById('daxiSheetHandleBar');
    var sheet = document.getElementById('appSheet');
    if (!handle || !sheet || handle.dataset.dragBound) return;
    handle.dataset.dragBound = '1';
    window._daxiSheetDragOffset = 0;
    var drag = { active: false, startY: 0, startOffset: 0, moved: false };

    function applyOffset(px) {
        window._daxiSheetDragOffset = px;
        if (px > 0 && !document.body.classList.contains('daxi-sheet-collapsed-mode')) {
            sheet.style.transform = 'translateY(' + px + 'px)';
        }
    }

    function onStart(e) {
        if (document.body.classList.contains('daxi-sheet-collapsed-mode')) return;
        if (e.target.closest('.daxi-sheet-chrome__bar, .daxi-sheet-toolgroup, .daxi-sheet-tool')) return;
        var y = e.touches ? e.touches[0].clientY : e.clientY;
        drag.active = true;
        drag.moved = false;
        drag.startY = y;
        drag.startOffset = window._daxiSheetDragOffset || 0;
        sheet.classList.add('daxi-sheet-dragging');
        sheet.style.transition = 'none';
    }

    function onMove(e) {
        if (!drag.active) return;
        var y = e.touches ? e.touches[0].clientY : e.clientY;
        var dy = y - drag.startY;
        if (Math.abs(dy) > 5) drag.moved = true;
        applyOffset(Math.max(0, drag.startOffset + dy));
        if (e.cancelable) e.preventDefault();
    }

    function onEnd() {
        if (!drag.active) return;
        drag.active = false;
        sheet.classList.remove('daxi-sheet-dragging');
        var threshold = Math.min(130, Math.max(72, (sheet.offsetHeight || 320) * 0.2));
        if (window._daxiSheetDragOffset >= threshold) {
            sheet.style.transition = '';
            applyOffset(0);
            _daxiSetSheetCollapsed(true);
        } else {
            sheet.style.transition = 'transform 0.28s cubic-bezier(.4,0,.2,1)';
            applyOffset(0);
            sheet.style.transform = '';
            window._daxiSheetDragOffset = 0;
            setTimeout(function() { if (sheet) sheet.style.transition = ''; }, 320);
        }
    }

    handle.addEventListener('touchstart', onStart, { passive: true });
    handle.addEventListener('touchmove', onMove, { passive: false });
    handle.addEventListener('touchend', onEnd);
    handle.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    handle.addEventListener('click', function(e) {
        if (drag.moved) { e.preventDefault(); e.stopPropagation(); return; }
        if (e.target.closest('.daxi-sheet-chrome__bar, .daxi-sheet-toolgroup, .daxi-sheet-tool')) return;
        e.preventDefault();
        e.stopPropagation();
        _daxiSetSheetCollapsed(true);
    });
}
window._initDaxiSheetHandleDrag = _initDaxiSheetHandleDrag;

window._daxiUseMyPositionForInput = function(inputEl, btnEl) {
    window._daxiUserAskedLocationPrompt = true;
    if (!inputEl) inputEl = document.getElementById('destinationAddress');
    if (!inputEl) return;
    if (!navigator.geolocation && !window._daxiCapacitorGetPosition) {
        _daxiGpsFailInput(inputEl, btnEl);
        return;
    }
    _resolveGeoPermission(function(state) {
        if (state === 'denied') {
            _daxiGpsFailInput(inputEl, btnEl, typeof _daxiT === 'function' ? _daxiT('gps_permission_denied', 'Autorisez la localisation ou saisissez l\'adresse manuellement.') : null);
            _showLocationSharePrompt(true);
            return;
        }
        if (state === 'prompt' && !_daxiHasGpsUserConsent()) {
            window._daxiPendingPickupAfterConsent = { inputEl: inputEl, btnEl: btnEl };
            window._daxiUserAskedLocationPrompt = true;
            _showLocationSharePrompt(false);
            return;
        }
        var isMainPickup = (inputEl.id === 'destinationAddress');
        if (isMainPickup) {
            var cachedPickup = _daxiGetCachedClientPosition();
            if (cachedPickup) {
                window._daxiPickupFromGps = true;
                window._daxiForceGpsPanOnce = true;
                window._daxiMapUserInteracting = false;
                inputEl.classList.add('daxi-pickup-locating');
                inputEl.classList.remove('daxi-pickup-located');
                var cachedLabel = typeof _daxiMyPositionLabel === 'function' ? _daxiMyPositionLabel() : 'Ma position actuelle';
                inputEl.value = cachedLabel;
                if (typeof _daxiSyncPlacesInputDisplay === 'function') _daxiSyncPlacesInputDisplay(inputEl, cachedLabel);
                if (btnEl) btnEl.classList.add('loading');
                _applyClientGpsSuccess(_daxiCachedPositionToGeoPos(cachedPickup), btnEl, inputEl);
                inputEl.classList.remove('daxi-pickup-locating');
                inputEl.classList.add('daxi-pickup-located');
                setTimeout(function() { inputEl.classList.remove('daxi-pickup-located'); }, 2200);
                _ensureClientGpsLiveRunning();
                return;
            }
            window._daxiPickupFromGps = true;
            window._daxiForceGpsPanOnce = true;
            window._daxiMapUserInteracting = false;
            window._daxiGpsPanLockUntil = 0;
            window._clientGpsPannedOnce = false;
            _daxiGpsFinalized = false;
            _daxiGpsLocked = false;
            _daxiGpsScanStartedAt = 0;
            _resetGpsScanTimers();
        }
        inputEl.classList.add('daxi-pickup-locating');
        inputEl.classList.remove('daxi-pickup-located');
        var locatingLabel = typeof _daxiMyPositionLabel === 'function' ? _daxiMyPositionLabel() : 'Ma position actuelle';
        inputEl.value = locatingLabel;
        if (typeof _daxiSyncPlacesInputDisplay === 'function') _daxiSyncPlacesInputDisplay(inputEl, locatingLabel);
        if (btnEl) btnEl.classList.add('loading');
        _daxiClearPickupWatchdog();
        _daxiPickupWatchdogTimer = setTimeout(function() {
            _daxiPickupWatchdogTimer = null;
            if (_daxiGpsHasUsableFix()) {
                _daxiTryCompleteLocatingPickupFromGps();
                return;
            }
            _daxiGpsFailInput(inputEl, btnEl);
        }, 35000);
        function clearPickupWatchdog() { _daxiClearPickupWatchdog(); }
        _requestPickupGps(function(pos) {
            clearPickupWatchdog();
            if (isMainPickup) {
                _applyClientGpsSuccess(pos, btnEl, inputEl);
                return;
            }
            var lat = pos.coords.latitude, lng = pos.coords.longitude;
            _ensureCoverageCheck(lat, lng, function(covered) {
                if (!covered) {
                    _daxiGpsFailInput(inputEl, btnEl);
                    return;
                }
                inputEl.dataset.lat = String(lat);
                inputEl.dataset.lng = String(lng);
                inputEl.dataset.placeSelected = '1';
                inputEl.value = typeof _daxiMyPositionLabel === 'function' ? _daxiMyPositionLabel() : 'Ma position actuelle';
                _daxiFinishPickupInputState(inputEl, btnEl, true);
                window._daxiLastGps = { lat: lat, lng: lng };
            });
        }, function() {
            clearPickupWatchdog();
            if (_daxiGpsHasUsableFix()) {
                if (isMainPickup) {
                    var cachedPos = window._lastClientGpsPos;
                    if (cachedPos) {
                        _applyClientGpsSuccess({
                            coords: { latitude: cachedPos.lat, longitude: cachedPos.lng, accuracy: cachedPos.acc || 60 },
                            timestamp: cachedPos.ts || Date.now()
                        }, btnEl, inputEl);
                    }
                    return;
                }
            }
            if (isMainPickup) {
                _stopDaxiGpsScan();
                window._daxiPickupFromGps = false;
            }
            _daxiGpsFailInput(inputEl, btnEl);
        }, { forceScan: false, source: 'my-position-btn', timeoutMs: 35000 });
    });
};

function requestMyLocation() {
    var btn = document.getElementById('myPositionBtn');
    var inp = document.getElementById('destinationAddress');
    if (window._daxiUseMyPositionForInput) {
        window._daxiUseMyPositionForInput(inp, btn);
        return;
    }
    if (!navigator.geolocation) { alert('Géolocalisation non supportée.'); return; }
    _resolveGeoPermission(function(state) {
        if (state === 'denied') {
            _showLocationSharePrompt(true);
            return;
        }
        window._daxiPickupFromGps = true;
        window._daxiForceGpsPanOnce = true;
        window._daxiMapUserInteracting = false;
        _daxiGpsFinalized = false;
        _daxiGpsLocked = false;
        _daxiGpsScanStartedAt = 0;
        _resetGpsScanTimers();
        if (btn) btn.classList.add('loading');
        _requestPickupGps(function(pos) {
            _applyClientGpsSuccess(pos, btn, inp);
        }, function(err) {
            _stopDaxiGpsScan();
            window._daxiPickupFromGps = false;
            _daxiGpsFailInput(inp, btn);
            if ((err || {}).code === 1) {
                _clearGeoGrantedFlag();
                _showLocationSharePrompt(true);
            }
        }, { forceScan: false, source: 'my-position-btn' });
    });
}

(function _daxiPreventPagePinchZoom() {
    document.addEventListener('touchmove', function(e) {
        if (e.touches.length < 2) return;
        var t = e.target;
        if (t && t.closest && (t.closest('#daxi-main-map') || t.closest('[data-daximap="1"]'))) return;
        e.preventDefault();
    }, { passive: false });
    document.addEventListener('gesturestart', function(e) { e.preventDefault(); }, { passive: false });
})();

(function _daxiBootClientGpsWhenReady() {
    function go() {
        if (window._daxiIntroPlaying) {
            window.addEventListener('daxi:intro-complete', go, { once: true });
            document.addEventListener('daxi:intro-complete', go, { once: true });
            return;
        }
        if (typeof _initClientLocationFlow === 'function') _initClientLocationFlow();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', go);
    } else {
        go();
    }
})();
