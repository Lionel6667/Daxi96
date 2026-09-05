
(function (global) {
    'use strict';

    var VALIDATED_MAX_M = 300;
    var TARGET_M = 100;
    var EXTREME_REJECT_M = 300;
    var APPROX_VISUAL_MAX_MOBILE = 300;
    var APPROX_VISUAL_MAX_DESKTOP = 300;
    var MAX_JUMP_SPEED_MS = 42;
    var MAX_FIX_AGE_MS = 45000;

    var state = {
        fixNum: 0,
        lastEventAt: 0,
        bestValidatedAcc: Infinity,
        validated: null,
        approx: null,
        display: null
    };

    function haversineM(lat1, lng1, lat2, lng2) {
        var R = 6371000;
        var p1 = lat1 * Math.PI / 180;
        var p2 = lat2 * Math.PI / 180;
        var dp = (lat2 - lat1) * Math.PI / 180;
        var dl = (lng2 - lng1) * Math.PI / 180;
        var a = Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function isDesktopClient() {
        return !(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            (global.navigator && global.navigator.userAgent) || ''
        ));
    }

    function isNativeClient() {
        return !!(global._daxiCapacitorApp
            || global.DaxiAndroid
            || (global._daxiIsNativeApp && global._daxiIsNativeApp()));
    }

    function approxVisualMax() {
        return VALIDATED_MAX_M;
    }

    function canShowApproxVisual(acc) {
        return isFinite(acc) && acc <= approxVisualMax();
    }

    function isValidatedAccuracy(acc) {
        return isFinite(acc) && acc <= VALIDATED_MAX_M;
    }

    function isGeographicPlausible(lat, lng) {
        if (typeof global._isPlaceCovered === 'function' && global._DAXI_DEPTS_READY) {
            return global._isPlaceCovered(lat, lng);
        }
        return lat >= 18.5 && lat <= 20.5 && lng >= -74.5 && lng <= -71.5;
    }

    function shouldReplaceValidated(candidateAcc, candidateLat, candidateLng, candidateTs) {
        var cur = state.validated;
        if (!cur) return true;
        var dist = haversineM(cur.lat, cur.lng, candidateLat, candidateLng);
        if (dist >= 4 && candidateAcc <= cur.acc * 1.35) return true;
        if (candidateAcc > cur.acc + 0.5) return false;
        if (candidateAcc < cur.acc - 0.5) return true;
        if (candidateTs && cur.ts && candidateTs + 500 < cur.ts) return false;
        if (dist > Math.max(80, cur.acc * 2) && candidateAcc >= cur.acc) return false;
        if (dist > 1.5) return true;
        return candidateAcc <= cur.acc;
    }

    function rejectJump(lat, lng, acc, ts) {
        var ref = state.validated || state.approx;
        if (!ref) return { reject: false };
        var dt = ((ts || Date.now()) - (ref.ts || 0)) / 1000;
        if (dt <= 0 || dt > 90) return { reject: false };
        var dist = haversineM(ref.lat, ref.lng, lat, lng);
        var speed = dist / dt;
        var allowed = Math.max(MAX_JUMP_SPEED_MS, (ref.acc + acc) * 0.35);
        if (speed > allowed && dist > Math.max(250, ref.acc * 1.5)) {
            return { reject: true, reason: 'ABERRANT_JUMP', dist: dist, speed: speed };
        }
        if (!isGeographicPlausible(lat, lng)) {
            return { reject: true, reason: 'OUT_OF_COVERAGE', dist: dist, speed: speed };
        }
        return { reject: false, dist: dist, speed: speed };
    }

    function logFix(entry) {
        if (!global.console || !global.console.log) return;
        var since = state.lastEventAt ? (entry.ts - state.lastEventAt) + 'ms' : '—';
        global.console.log(
            '[DAXI GPS CLIENT]',
            'SOURCE:', entry.source || '—',
            '| ACC:', Math.round(entry.acc) + 'm',
            '| DIST:', entry.dist != null ? Math.round(entry.dist) + 'm' : '—',
            '| SINCE:', since,
            '| AGE:', entry.ageMs != null ? Math.round(entry.ageMs / 1000) + 's' : '—',
            '| BEST:', isFinite(state.bestValidatedAcc) ? Math.round(state.bestValidatedAcc) + 'm' : '—',
            '| DECISION:', entry.decision,
            '| REASON:', entry.reason
        );
    }

    function logDisplay(marker, circle, acc, syncOk) {
        if (!global.console || !global.console.log) return;
        global.console.log(
            '[DAXI GPS DISPLAY]',
            'POSITION:', marker.lat + ',' + marker.lng,
            '| MARKER:', marker.lat + ',' + marker.lng,
            '| CIRCLE:', circle.lat + ',' + circle.lng,
            '| ACC:', Math.round(acc) + 'm',
            '| SYNC:', syncOk ? 'OK' : 'ERROR'
        );
    }

    function setDisplay(lat, lng, acc, validated) {
        state.display = {
            lat: lat,
            lng: lng,
            acc: acc,
            validated: !!validated,
            ts: Date.now()
        };
    }

    function evaluateRaw(source, lat, lng, acc, ts, meta) {
        meta = meta || {};
        ts = ts || Date.now();
        var ageMs = meta.ageMs != null ? meta.ageMs : Math.max(0, Date.now() - ts);
        state.fixNum += 1;
        var jump = rejectJump(lat, lng, acc, ts);
        var dist = state.validated
            ? haversineM(state.validated.lat, state.validated.lng, lat, lng)
            : (state.approx ? haversineM(state.approx.lat, state.approx.lng, lat, lng) : 0);

        var decision = 'REJECT';
        var reason = 'UNKNOWN';
        var validated = false;

        if (meta.mock) {
            reason = 'MOCK_LOCATION';
        } else if (!isFinite(lat) || !isFinite(lng) || !isFinite(acc)) {
            reason = 'INVALID_COORDS';
        } else if (acc > EXTREME_REJECT_M) {
            reason = 'EXTREME_ACCURACY';
        } else if (ageMs > MAX_FIX_AGE_MS && !meta.allowStale) {
            reason = 'STALE_FIX';
        } else if (jump.reject) {
            reason = jump.reason;
        } else if (!isGeographicPlausible(lat, lng)) {
            reason = 'OUT_OF_COVERAGE';
        } else if (!isValidatedAccuracy(acc)) {
            decision = 'APPROXIMATE';
            reason = 'ACCURACY_ABOVE_LIMIT';
            if (!state.approx || acc < state.approx.acc) {
                state.approx = { lat: lat, lng: lng, acc: acc, ts: ts, source: source };
            }
        } else if (!shouldReplaceValidated(acc, lat, lng, ts)) {
            decision = 'REJECT';
            reason = 'WORSE_THAN_BEST';
        } else {
            decision = 'ACCEPT';
            reason = 'VALID_ACCURACY';
            validated = true;
            state.validated = { lat: lat, lng: lng, acc: acc, ts: ts, source: source };
            state.bestValidatedAcc = Math.min(state.bestValidatedAcc, acc);
            setDisplay(lat, lng, acc, true);
        }

        logFix({
            source: source,
            acc: acc,
            dist: dist,
            ts: Date.now(),
            ageMs: ageMs,
            decision: decision,
            reason: reason
        });
        state.lastEventAt = Date.now();

        return {
            decision: decision,
            reason: reason,
            validated: validated,
            allowVisual: decision === 'APPROXIMATE' ? canShowApproxVisual(acc) : (decision === 'ACCEPT'),
            lat: lat,
            lng: lng,
            acc: acc,
            ts: ts,
            dist: dist,
            speed: jump.speed
        };
    }

    function fixFromEngine(fix) {
        if (!fix) return null;
        var acc = fix.rawAccuracy != null ? fix.rawAccuracy : (fix.accuracy || 999);
        var lat = fix.lat != null ? fix.lat : (fix.raw && fix.raw.lat);
        var lng = fix.lng != null ? fix.lng : (fix.raw && fix.raw.lng);
        if (lat == null || lng == null) return null;
        return { lat: lat, lng: lng, acc: acc, ts: fix.timestamp || Date.now(), raw: fix.raw };
    }

    function fixFromGeoPos(pos, source) {
        if (!pos || !pos.coords) return null;
        var ts = pos.timestamp || Date.now();
        return {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            acc: pos.coords.accuracy || 9999,
            ts: ts,
            ageMs: Math.max(0, Date.now() - ts),
            source: source || 'geolocation'
        };
    }

    function processEngineFix(fix, source) {
        var p = fixFromEngine(fix);
        if (!p) return null;
        return evaluateRaw(source || 'engine-display', p.lat, p.lng, p.acc, p.ts, { allowStale: false });
    }

    function processGeoPos(pos, source, meta) {
        var p = fixFromGeoPos(pos, source);
        if (!p) return null;
        var nextMeta = Object.assign({ ageMs: p.ageMs }, meta || {});
        if (pos.mock) nextMeta.mock = true;
        return evaluateRaw(p.source, p.lat, p.lng, p.acc, p.ts, nextMeta);
    }

    function getValidated() {
        return state.validated ? Object.assign({}, state.validated) : null;
    }

    function getDisplay() {
        return state.display ? Object.assign({}, state.display) : null;
    }

    function getApprox() {
        return state.approx ? Object.assign({}, state.approx) : null;
    }

    function reset() {
        state.fixNum = 0;
        state.lastEventAt = 0;
        state.bestValidatedAcc = Infinity;
        state.validated = null;
        state.approx = null;
        state.display = null;
    }

    global.DaxiClientGps = {
        VALIDATED_MAX_M: VALIDATED_MAX_M,
        TARGET_M: TARGET_M,
        canShowApproxVisual: canShowApproxVisual,
        approxVisualMax: approxVisualMax,
        isValidatedAccuracy: isValidatedAccuracy,
        evaluateRaw: evaluateRaw,
        processEngineFix: processEngineFix,
        processGeoPos: processGeoPos,
        fixFromEngine: fixFromEngine,
        fixFromGeoPos: fixFromGeoPos,
        shouldReplaceValidated: shouldReplaceValidated,
        getValidated: getValidated,
        getDisplay: getDisplay,
        getApprox: getApprox,
        setDisplay: setDisplay,
        logDisplay: logDisplay,
        reset: reset,
        haversineM: haversineM
    };
})(typeof window !== 'undefined' ? window : this);
