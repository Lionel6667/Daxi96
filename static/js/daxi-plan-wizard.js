
(function (global) {
    'use strict';

    var SLUGS = {
        '1': 'ville-a-ville',
        '2': 'demi-journee',
        '3': 'journee-complete',
        '4': 'elegance-night',
        '5': 'accueil-aeroport-cap'
    };

    var FIXED = { '2': 70, '3': 140, '4': 150 };

    var state = {
        planId: null,
        step: 1,
        payMethod: '',
        contractOk: false
    };

    function T(key, fb) {
        if (typeof global._daxiT === 'function') return global._daxiT(key, fb);
        var lang = (global._daxiGetSavedLang && global._daxiGetSavedLang()) || 'fr';
        var d = (global._localTranslations && global._localTranslations[lang]) || {};
        return d[key] || fb || key;
    }

    function el(id) { return document.getElementById(id); }

    function overlay() { return el('daxiPlanWizard'); }

    function rowHtml(opts) {
        opts = opts || {};
        var id = opts.id || '';
        var label = opts.label || '';
        var ph = opts.placeholder || '';
        var icon = opts.icon || 'ri-map-pin-line';
        var iconCls = opts.iconCls || 'dpw-row-icon--green';
        var type = opts.type || 'text';
        var noAc = !!opts.noAc;
        var gpsBtn = opts.gps ? (
            '<button type="button" class="dpw-row-action daxi-gps-bounce" data-dpw-gps="' + id + '" title="' + T('my_position_placeholder', 'Ma position') + '">'
            + '<i class="ri-focus-3-line"></i></button>'
        ) : '';
        var acAttr = noAc ? ' data-dpw-no-ac="1" autocomplete="name" autocorrect="off" spellcheck="false"' : ' data-dpw-ac-input="1"';
        return '<div class="dpw-row">'
            + '<i class="dpw-row-icon ' + iconCls + ' ' + icon + '"></i>'
            + '<div class="dpw-row-body">'
            + '<span class="dpw-row-label">' + label + '</span>'
            + '<input type="' + type + '" id="' + id + '" class="dpw-row-input" placeholder="' + ph + '"' + acAttr
            + (opts.required ? ' required' : '') + (opts.value ? ' value="' + opts.value + '"' : '') + '>'
            + '</div>' + gpsBtn + '</div>';
    }

    function buildPane1(planId) {
        var html = '<div class="dpw-pane active" data-pane="1">';
        html += '<p class="dpw-section-title">' + T('dpw_step_trip', 'Votre trajet') + '</p>';

        if (planId === '5') {
            html += '<p class="dpw-hint">' + T('plan_airport_wizard_hint', T('plan_airport_preview', 'Votre chauffeur vous attend à l\'aéroport avec un panneau portant votre nom.')) + '</p>';
            html += rowHtml({ id: 'dpw-sign', label: T('dpw_sign_label', 'Nom sur le panneau'), ph: T('dpw_sign_ph', 'Ex: Jean Dupont'), icon: 'ri-user-3-line', iconCls: 'dpw-row-icon--gold', required: true, noAc: true });
            html += '<div class="dpw-row" style="opacity:0.85"><i class="dpw-row-icon dpw-row-icon--blue ri-flight-land-line"></i><div class="dpw-row-body"><span class="dpw-row-label">' + T('dpw_airport_pickup', 'Prise en charge') + '</span><input class="dpw-row-input" readonly value="' + T('dpw_airport_name', 'Aéroport Cap-Haïtien') + '"></div></div>';
            html += rowHtml({ id: 'dpw-dest', label: T('dpw_where_going', 'Où vous allez'), ph: T('dpw_where_going_ph', 'Hôtel, adresse, quartier…'), icon: 'ri-flag-line', iconCls: 'dpw-row-icon--gold', required: true });
        } else if (planId === '1') {
            html += '<p class="dpw-hint">' + T('plan1_order_desc', 'Trajet inter-villes — estimation personnalisée.') + '</p>';
            html += rowHtml({ id: 'dpw-pickup', label: T('label_departure_row', 'Départ'), ph: T('departure_placeholder', 'Ville de départ'), gps: true, required: true });
            html += rowHtml({ id: 'dpw-dest', label: T('destination_label', 'Destination'), ph: T('destination_placeholder', 'Ville d\'arrivée'), icon: 'ri-flag-line', iconCls: 'dpw-row-icon--gold', required: true });
        } else {
            html += '<p class="dpw-hint">' + T('dpw_multi_hint', 'Indiquez vos arrêts dans l\'ordre de visite.') + '</p>';
            html += rowHtml({ id: 'dpw-pickup', label: T('label_departure_row', 'Départ'), ph: T('pickup_address_placeholder', 'Adresse de départ'), gps: true, required: true });
            html += '<div class="dpw-stops" id="dpw-stops"></div>';
            html += '<button type="button" class="dpw-add-stop" id="dpw-add-stop"><i class="ri-add-circle-line"></i> ' + T('dpw_add_stop', 'Ajouter une destination') + '</button>';
            if (planId === '4') {
                html += rowHtml({ id: 'dpw-occasion', label: T('dpw_occasion', 'Occasion / événement'), ph: 'Ex: Mariage, gala…', icon: 'ri-star-line', iconCls: 'dpw-row-icon--gold', noAc: true });
            }
        }
        html += '<div class="dpw-err" id="dpw-err-1"></div></div>';
        return html;
    }

    function buildPane2(planId) {
        var html = '<div class="dpw-pane" data-pane="2">';
        html += '<p class="dpw-section-title">' + T('dpw_step_schedule', 'Date & détails') + '</p>';
        if (planId === '5') {
            html += '<div class="dpw-grid-2">';
            html += '<div class="dpw-row"><div class="dpw-row-body"><span class="dpw-row-label">' + T('dpw_landing_date', 'Date d\'atterrissage') + '</span><input type="date" id="dpw-date" class="dpw-row-input" required></div></div>';
            html += '<div class="dpw-row"><div class="dpw-row-body"><span class="dpw-row-label">' + T('dpw_landing_time', 'Heure d\'atterrissage') + '</span><input type="time" id="dpw-time" class="dpw-row-input" required></div></div>';
            html += '</div>';
        } else {
            html += '<div class="dpw-grid-2">';
            html += '<div class="dpw-row"><div class="dpw-row-body"><span class="dpw-row-label">' + T('plan2_date_label', 'Date souhaitée') + '</span><input type="date" id="dpw-date" class="dpw-row-input" required></div></div>';
            html += '<div class="dpw-row"><div class="dpw-row-body"><span class="dpw-row-label">' + T('plan2_time_label', 'Heure de début') + '</span><input type="time" id="dpw-time" class="dpw-row-input" required></div></div>';
            html += '</div>';
        }
        html += '<div class="dpw-row" style="align-items:center"><div class="dpw-row-body"><span class="dpw-row-label">' + T('passenger_count_label', 'Passagers') + '</span>'
            + '<div class="dpw-passenger"><button type="button" data-dpw-pax="-">−</button><span id="dpw-pax-val">1</span><button type="button" data-dpw-pax="+">+</button></div>'
            + '<input type="hidden" id="dpw-pax" value="1"></div></div>';
        if (FIXED[planId]) {
            html += '<div class="dpw-price-badge"><div><span>' + T('dpw_fixed_price', 'Forfait tout compris') + '</span><br><strong>$' + FIXED[planId] + '</strong></div><i class="ri-vip-crown-fill" style="font-size:28px;color:#fbbf24"></i></div>';
        } else {
            html += '<div class="dpw-price-badge"><div><span>' + T('dpw_quote_price', 'Prix sur devis') + '</span><br><strong>' + T('plan1_sub', 'À déterminer') + '</strong></div></div>';
        }
        html += '<div class="dpw-err" id="dpw-err-2"></div></div>';
        return html;
    }

    function buildPane3(planId) {
        var price = FIXED[planId] ? ('$' + FIXED[planId]) : T('dpw_quote_price', 'Sur devis');
        var html = '<div class="dpw-pane" data-pane="3">';
        html += '<p class="dpw-section-title">' + T('dpw_step_payment', 'Paiement & contrat') + '</p>';
        html += '<p class="dpw-hint">' + T('pay_choose_method', 'Choisissez votre moyen de paiement') + ' · <strong>' + price + '</strong></p>';
        html += '<button type="button" class="dpw-pay-opt" data-method="moncash"><div><div class="dpw-pay-label">MonCash</div><div class="dpw-pay-desc">' + T('pay_moncash_desc', 'Paiement mobile Digicel') + '</div></div><div class="dpw-pay-radio"></div></button>';
        html += '<button type="button" class="dpw-pay-opt" data-method="card"><div><div class="dpw-pay-label">' + T('pay_card_label', 'Carte bancaire') + '</div><div class="dpw-pay-desc">' + T('pay_card_desc', 'Visa, Mastercard…') + '</div></div><div class="dpw-pay-radio"></div></button>';
        html += '<button type="button" class="dpw-pay-opt" data-method="in_person"><div><div class="dpw-pay-label">' + T('pay_cash_label', 'Payer au chauffeur') + '</div><div class="dpw-pay-desc">' + T('pay_cash_desc', 'Espèces à bord') + '</div></div><div class="dpw-pay-radio"></div></button>';
        html += '<div class="dpw-contract"><label><input type="checkbox" id="dpw-contract"><span>' + T('pay_contract_line', 'J\'accepte le contrat de transport DAXI.') + '</span></label>'
            + '<button type="button" class="dpw-contract-link" id="dpw-contract-open">' + T('pay_contract_view', 'Voir le contrat') + '</button></div>';
        html += '<div class="dpw-err" id="dpw-err-3"></div></div>';
        return html;
    }

    function stopRowHtml(idx) {
        var id = 'dpw-stop-' + idx;
        var label = T('dpw_stop_n', 'Arrêt {n}').replace(/\{n\}/g, String(idx));
        return '<div class="dpw-stop-item">' + rowHtml({
            id: id,
            label: label,
            ph: T('dpw_stop_ph', 'Adresse ou lieu'),
            icon: 'ri-map-pin-2-line',
            iconCls: 'dpw-row-icon--gold'
        }) + '</div>';
    }

    function attachPlaces(root) {
        var scope = root || document.getElementById('daxiPlanWizard');
        if (!scope) return;
        scope.querySelectorAll('[data-dpw-ac-input="1"]').forEach(function (inp) {
            if (inp.dataset.dpwPlacesReady) return;
            inp.dataset.dpwPlacesReady = '1';
            if (typeof global._daxiAttachInlinePlacesAC === 'function') {
                global._daxiAttachInlinePlacesAC(inp);
            } else if (typeof global._attachPlacesAC === 'function') {
                var sid = inp.id + '-suggestions';
                var box = document.getElementById(sid);
                if (!box) {
                    box = document.createElement('div');
                    box.id = sid;
                    box.className = 'suggestions-container hidden';
                    box.setAttribute('data-no-translate', '1');
                    document.body.appendChild(box);
                }
                global._attachPlacesAC(inp, { suggestionsId: sid });
            }
            if (typeof global._daxiBindMobilePac === 'function') global._daxiBindMobilePac(inp);
        });
    }

    function coords(id) {
        var node = el(id);
        if (!node) return null;
        var lat = parseFloat(node.dataset.lat), lng = parseFloat(node.dataset.lng);
        if (isNaN(lat) || isNaN(lng)) return null;
        return { label: node.value.trim(), lat: lat, lng: lng };
    }

    function showErr(step, msg) {
        var e = el('dpw-err-' + step);
        if (e) { e.textContent = msg; e.classList.add('show'); }
    }

    function clearErrs() {
        [1, 2, 3].forEach(function (s) {
            var e = el('dpw-err-' + s);
            if (e) { e.textContent = ''; e.classList.remove('show'); }
        });
    }

    function validateStep(step) {
        clearErrs();
        var pid = state.planId;
        if (step === 1) {
            if (pid === '5') {
                if (!(el('dpw-sign') || {}).value.trim()) { showErr(1, T('dpw_err_sign', 'Nom sur le panneau requis.')); return false; }
                if (!coords('dpw-dest')) { showErr(1, T('dpw_err_dest', 'Sélectionnez la destination.')); return false; }
            } else if (pid === '1') {
                if (!coords('dpw-pickup') || !coords('dpw-dest')) { showErr(1, T('dpw_err_route', 'Sélectionnez départ et destination.')); return false; }
            } else {
                if (!coords('dpw-pickup')) { showErr(1, T('dpw_err_pickup', 'Sélectionnez le départ ou utilisez Ma position.')); return false; }
                var stops = document.querySelectorAll('#dpw-stops .dpw-row-input');
                var ok = false;
                stops.forEach(function (inp) { if (coords(inp.id)) ok = true; });
                if (!ok) { showErr(1, T('dpw_err_stops', 'Ajoutez au moins une destination.')); return false; }
            }
        }
        if (step === 2) {
            if (!(el('dpw-date') || {}).value || !(el('dpw-time') || {}).value) {
                showErr(2, T('dpw_err_datetime', 'Date et heure requises.')); return false;
            }
        }
        if (step === 3) {
            if (!state.payMethod) { showErr(3, T('dpw_err_pay', 'Choisissez un moyen de paiement.')); return false; }
            if (!state.contractOk) { showErr(3, T('dpw_err_contract', 'Acceptez le contrat pour continuer.')); return false; }
        }
        return true;
    }

    function setStep(n) {
        state.step = n;
        document.querySelectorAll('.dpw-pane').forEach(function (p) {
            p.classList.toggle('active', parseInt(p.getAttribute('data-pane'), 10) === n);
        });
        document.querySelectorAll('.dpw-step-dot').forEach(function (d, i) {
            d.classList.toggle('active', i + 1 === n);
            d.classList.toggle('done', i + 1 < n);
        });
        var prev = el('dpwPrev');
        var next = el('dpwNext');
        if (prev) prev.style.display = n > 1 ? '' : 'none';
        if (next) next.textContent = n === 3 ? T('order_service_btn', 'Commander') : T('dpw_continue', 'Continuer');
    }

    function bindPaneEvents(planId) {
        var addBtn = el('dpw-add-stop');
        if (addBtn) {
            addBtn.onclick = function () {
                var box = el('dpw-stops');
                if (!box) return;
                var n = box.querySelectorAll('.dpw-stop-item').length + 1;
                if (n > 8) return;
                box.insertAdjacentHTML('beforeend', stopRowHtml(n));
                attachPlaces(el('daxiPlanWizard'));
            };
        }
        document.querySelectorAll('[data-dpw-pax]').forEach(function (btn) {
            btn.onclick = function () {
                var v = parseInt((el('dpw-pax') || {}).value || '1', 10);
                v = btn.getAttribute('data-dpw-pax') === '+' ? Math.min(10, v + 1) : Math.max(1, v - 1);
                if (el('dpw-pax')) el('dpw-pax').value = String(v);
                if (el('dpw-pax-val')) el('dpw-pax-val').textContent = String(v);
            };
        });
        document.querySelectorAll('.dpw-pay-opt').forEach(function (btn) {
            btn.onclick = function () {
                state.payMethod = btn.getAttribute('data-method') || '';
                document.querySelectorAll('.dpw-pay-opt').forEach(function (b) { b.classList.remove('selected'); });
                btn.classList.add('selected');
            };
        });
        var contract = el('dpw-contract');
        if (contract) contract.onchange = function () { state.contractOk = contract.checked; };
        var cOpen = el('dpw-contract-open');
        if (cOpen) cOpen.onclick = function () { window.open('/aide/#contrat', '_blank'); };
        document.querySelectorAll('[data-dpw-gps]').forEach(function (btn) {
            btn.onclick = function () {
                var targetId = btn.getAttribute('data-dpw-gps');
                var inp = el(targetId);
                if (!inp) return;
                if (typeof global._daxiUseMyPositionForInput === 'function') {
                    global._daxiUseMyPositionForInput(inp, btn);
                }
            };
        });

        var wizardRoot = el('daxiPlanWizard');
        if (planId !== '1' && planId !== '5') {
            var stopsBox = el('dpw-stops');
            if (stopsBox && !stopsBox.children.length) {
                stopsBox.innerHTML = stopRowHtml(1);
            }
        }
        attachPlaces(wizardRoot);
    }

    function subtractHour(dateStr, timeStr) {
        var d = new Date(dateStr + 'T' + timeStr + ':00');
        d.setHours(d.getHours() - 1);
        var pad = function (n) { return String(n).padStart(2, '0'); };
        return { date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), time: pad(d.getHours()) + ':' + pad(d.getMinutes()) };
    }

    function buildFormData() {
        var pid = state.planId;
        var fd = new FormData();
        var guestId = global._daxiGuestId || localStorage.getItem('daxi_guest_id') || '';
        if (guestId) fd.append('guest_id', guestId);
        if (typeof global.getCsrfToken === 'function') fd.append('csrfmiddlewaretoken', global.getCsrfToken());
        fd.append('passengerCount', (el('dpw-pax') || {}).value || '1');
        fd.append('service_plan', SLUGS[pid] || '');
        if (FIXED[pid]) fd.append('fixed_price', String(FIXED[pid]));

        var dateVal = (el('dpw-date') || {}).value;
        var timeVal = (el('dpw-time') || {}).value;

        if (pid === '5') {
            var ap = global.DAXI_CAP_AIRPORT || { label: 'Aéroport Cap-Haïtien', lat: 19.758, lng: -72.204 };
            var dest = coords('dpw-dest');
            var sched = subtractHour(dateVal, timeVal);
            fd.append('pickup', ap.label);
            fd.append('pickup_lat', String(ap.lat));
            fd.append('pickup_lng', String(ap.lng));
            fd.append('destination', dest.label);
            fd.append('destination_lat', String(dest.lat));
            fd.append('destination_lng', String(dest.lng));
            fd.append('date', sched.date);
            fd.append('time', sched.time);
            fd.append('is_later', 'true');
            fd.append('notes', '[ACCUEIL AÉROPORT CAP]\nPanneau : ' + (el('dpw-sign') || {}).value
                + '\nAtterrissage prévu : ' + dateVal + ' ' + timeVal
                + '\nChauffeur sur place 1 h avant. Retards facturés selon tarifs d\'attente DAXI.');
        } else if (pid === '1') {
            var dep = coords('dpw-pickup'), dst = coords('dpw-dest');
            fd.append('pickup', dep.label);
            fd.append('pickup_lat', String(dep.lat));
            fd.append('pickup_lng', String(dep.lng));
            fd.append('destination', dst.label);
            fd.append('destination_lat', String(dst.lat));
            fd.append('destination_lng', String(dst.lng));
            if (dateVal) fd.append('date', dateVal);
            if (timeVal) fd.append('time', timeVal);
            if (dateVal && timeVal) fd.append('is_later', 'true');
        } else {
            var pickup = coords('dpw-pickup');
            var stops = [];
            document.querySelectorAll('#dpw-stops .dpw-row-input').forEach(function (inp) {
                var c = coords(inp.id);
                if (c) stops.push(c);
            });
            var last = stops[stops.length - 1] || pickup;
            fd.append('pickup', pickup.label);
            fd.append('pickup_lat', String(pickup.lat));
            fd.append('pickup_lng', String(pickup.lng));
            fd.append('destination', last.label);
            fd.append('destination_lat', String(last.lat));
            fd.append('destination_lng', String(last.lng));
            fd.append('plan_waypoints', JSON.stringify(stops));
            fd.append('date', dateVal);
            fd.append('time', timeVal);
            fd.append('is_later', 'true');
            var notes = '';
            if (pid === '4' && el('dpw-occasion')) notes = '[ÉVÉNEMENT] ' + el('dpw-occasion').value;
            fd.append('notes', notes);
        }
        fd.append('payment_method', state.payMethod);
        fd.append('contract_accepted', '1');
        return fd;
    }

    function extractOrderId(html) {
        var m = html.match(/data-order-id=["'](\d+)["']/);
        if (m) return m[1];
        m = html.match(/id=["']co-(\d+)["']/);
        return m ? m[1] : null;
    }

    async function submitOrder() {
        var next = el('dpwNext');
        if (next) { next.disabled = true; next.textContent = T('btn_preparing', 'Préparation…'); }
        try {
            var fd = buildFormData();
            var resp = await fetch('/htmx/client/order/create/', { method: 'POST', body: fd, credentials: 'include' });
            var html = await resp.text();
            var orderId = extractOrderId(html);

            if (orderId && !FIXED[state.planId] && (html.indexOf('daxi-pp-') >= 0 || html.indexOf('price-proposal') >= 0)) {
                var cfd = new FormData();
                if (fd.get('guest_id')) cfd.append('guest_id', fd.get('guest_id'));
                if (typeof global.getCsrfToken === 'function') cfd.append('csrfmiddlewaretoken', global.getCsrfToken());
                var cResp = await fetch('/htmx/client/orders/' + orderId + '/confirm-price/', { method: 'POST', body: cfd, credentials: 'include' });
                html = await cResp.text();
            }

            if (orderId && state.payMethod) {
                var pfd = new FormData();
                pfd.append('method', state.payMethod);
                pfd.append('contract_accepted', '1');
                if (fd.get('guest_id')) pfd.append('guest_id', fd.get('guest_id'));
                if (typeof global.getCsrfToken === 'function') pfd.append('csrfmiddlewaretoken', global.getCsrfToken());
                var pResp = await fetch('/htmx/client/orders/' + orderId + '/payment/init/', { method: 'POST', body: pfd, credentials: 'include' });
                html = await pResp.text();
            }

            close();
            if (typeof global.closeDaxiPage === 'function') global.closeDaxiPage();
            if (typeof global.tabGoBook === 'function') global.tabGoBook();
            var slot = el('daxi-sheet-order-slot') || el('booking-response');
            if (slot) {
                slot.innerHTML = html;
                slot.style.display = 'block';
                if (global.htmx) global.htmx.process(slot);
            }
            if (typeof global._daxiSetSheetMode === 'function') global._daxiSetSheetMode('order');
            if (typeof global._loadDaxiSheetOrders === 'function') setTimeout(global._loadDaxiSheetOrders, 400);
            if (global.applyDaxiTranslations) global.applyDaxiTranslations();
        } catch (err) {
            showErr(3, T('lost_network_error', 'Erreur réseau.'));
        } finally {
            if (next) { next.disabled = false; next.textContent = T('order_service_btn', 'Commander'); }
        }
    }

    function open(planId) {
        planId = String(planId);
        if (!SLUGS[planId]) return;
        state = { planId: planId, step: 1, payMethod: '', contractOk: false };

        var title = el('dpwTitle');
        var sub = el('dpwSubtitle');
        var catalog = (global._daxiPlanCatalog && global._daxiPlanCatalog.plans && global._daxiPlanCatalog.plans[planId]) || {};
        if (title) title.textContent = catalog.title || T('plan' + planId + '_title', 'Forfait DAXI');
        if (sub) sub.textContent = catalog.subtitle || '';

        var body = el('dpwBody');
        if (body) body.innerHTML = buildPane1(planId) + buildPane2(planId) + buildPane3(planId);
        bindPaneEvents(planId);
        setStep(1);
        var ov = overlay();
        if (ov) { ov.classList.add('open'); ov.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; }
    }

    function close() {
        var ov = overlay();
        if (ov) { ov.classList.remove('open'); ov.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; }
    }

    function pulseDpwBtn(btn) {
        if (!btn) return;
        btn.classList.remove('dpw-btn--pulse');
        void btn.offsetWidth;
        btn.classList.add('dpw-btn--pulse');
    }

    function init() {
        var ov = overlay();
        if (!ov) return;
        el('dpwClose') && el('dpwClose').addEventListener('click', close);
        el('dpwPrev') && el('dpwPrev').addEventListener('click', function () { if (state.step > 1) setStep(state.step - 1); });
        el('dpwNext') && el('dpwNext').addEventListener('click', function () {
            var next = el('dpwNext');
            pulseDpwBtn(next);
            if (!validateStep(state.step)) return;
            if (state.step < 3) setStep(state.step + 1);
            else {
                if (next) next.classList.add('dpw-btn--loading');
                submitOrder();
            }
        });
        ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    }

    global.DaxiPlanWizard = { open: open, close: close, init: init };
    global.openPlanOrderWizard = open;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(typeof window !== 'undefined' ? window : this);