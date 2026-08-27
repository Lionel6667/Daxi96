
(function (global) {
    'use strict';

    var DEG2RAD = Math.PI / 180;
    var M_PER_DEG_LAT = 111320;
    var REJECT_ACCURACY_M = 5000;
    var GEO_WATCH = { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 };
    var GEO_SINGLE = { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 };
    var GEO_FOLLOW = { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 };

    function isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
    }

    function webGpsSide() {
        if (global.DaxiWebGps && global.DaxiWebGps.getSession) {
            if (global.DaxiWebGps.getSession('DRIVER')) return 'DRIVER';
            if (global.DaxiWebGps.getSession('CLIENT')) return 'CLIENT';
        }
        return global.document && global.document.body && global.document.body.getAttribute('data-page') === 'driver' ? 'DRIVER' : 'CLIENT';
    }

    function traceFix(pos, type) {
        if (!global.DaxiWebGps || !pos) return;
        global.DaxiWebGps.recordFix(webGpsSide(), pos, {
            type: type,
            source: 'navigator.geolocation'
        });
    }

    function traceError(err, type) {
        if (!global.DaxiWebGps || !err) return;
        global.DaxiWebGps.recordError(webGpsSide(), err, { type: type });
    }

    function haversineM(lat1, lng1, lat2, lng2) {
        var R = 6371000;
        var p1 = lat1 * DEG2RAD, p2 = lat2 * DEG2RAD;
        var dp = (lat2 - lat1) * DEG2RAD, dl = (lng2 - lng1) * DEG2RAD;
        var a = Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function snapToPath(lat, lng, pathCoords) {
        if (!pathCoords || pathCoords.length < 2) return { lat: lat, lng: lng, dist: Infinity };
        var minDist = Infinity, sLat = lat, sLng = lng;
        for (var i = 0; i < pathCoords.length - 1; i++) {
            var p1 = pathCoords[i], p2 = pathCoords[i + 1];
            var l2 = Math.pow(p1.lng - p2.lng, 2) + Math.pow(p1.lat - p2.lat, 2);
            var t = l2 === 0 ? 0 : ((lng - p1.lng) * (p2.lng - p1.lng) + (lat - p1.lat) * (p2.lat - p1.lat)) / l2;
            t = Math.max(0, Math.min(1, t));
            var pLat = p1.lat + t * (p2.lat - p1.lat);
            var pLng = p1.lng + t * (p2.lng - p1.lng);
            var d = haversineM(lat, lng, pLat, pLng);
            if (d < minDist) { minDist = d; sLat = pLat; sLng = pLng; }
        }
        return { lat: sLat, lng: sLng, dist: minDist };
    }

    function rawFixFromCoords(c, timestamp) {
        var acc = c.accuracy || 9999;
        return {
            lat: c.latitude,
            lng: c.longitude,
            accuracy: acc,
            rawAccuracy: acc,
            speed: c.speed || 0,
            heading: c.heading,
            snapped: false,
            timestamp: timestamp || Date.now(),
            raw: { lat: c.latitude, lng: c.longitude }
        };
    }

    function absorbBestFix(bestRawFix, fix, acc) {
        if (acc > REJECT_ACCURACY_M) return bestRawFix;
        if (!bestRawFix || acc < bestRawFix.rawAccuracy) return fix;
        return bestRawFix;
    }

    function hasNativeGps() {
        return typeof global.DaxiAndroid !== 'undefined' &&
            global.DaxiAndroid &&
            typeof global.DaxiAndroid.getCurrentLocation === 'function' &&
            !global._daxiForceWebGps;
    }

    function nativeGeoPosition() {
        if (!hasNativeGps()) return null;
        try {
            if (global.DaxiAndroid.refreshLocation) global.DaxiAndroid.refreshLocation();
            var raw = global.DaxiAndroid.getCurrentLocation();
            var pos = typeof raw === 'string' ? JSON.parse(raw) : raw;
            if (!pos || pos.error || pos.lat == null || pos.lng == null) return null;
            return {
                coords: {
                    latitude: pos.lat,
                    longitude: pos.lng,
                    accuracy: pos.accuracy != null ? pos.accuracy : 250,
                    altitude: pos.altitude || null,
                    heading: pos.heading != null ? pos.heading : null,
                    speed: pos.speed || 0
                },
                timestamp: pos.time || pos.ts || Date.now()
            };
        } catch (e) {
            return null;
        }
    }

    function runNativeRapidScan(scanOpts, burstTarget, scanMaxAccept, fallbackAccept, maxScanMs, requireTarget, onSuccess, onError, onRefine) {
        var done = false;
        var bestRawFix = null;
        var intervalId = null;

        function cleanup() {
            if (intervalId) { clearInterval(intervalId); intervalId = null; }
        }

        function complete(fix) {
            if (done) return;
            done = true;
            cleanup();
            clearTimeout(hardTimer);
            if (fix) onSuccess(fix);
            else if (onError) onError({ code: 3, message: 'no_fix' });
        }

        function ingest(pos) {
            if (done || !pos || !pos.coords) return;
            var acc = pos.coords.accuracy || 9999;
            traceFix(pos, 'native_poll');
            var nativeAccept = Math.max(scanMaxAccept, 1500);
            if (acc > nativeAccept) return;
            var fix = rawFixFromCoords(pos.coords, pos.timestamp || Date.now());
            bestRawFix = absorbBestFix(bestRawFix, fix, acc);
            if (onRefine) onRefine(fix);
            if (acc <= burstTarget) complete(fix);
        }

        function poll() {
            ingest(nativeGeoPosition());
        }

        poll();
        intervalId = setInterval(poll, 400);

        var hardTimer = setTimeout(function () {
            if (done) return;
            if (bestRawFix && (!requireTarget || bestRawFix.rawAccuracy <= fallbackAccept)) {
                complete(bestRawFix);
            } else if (bestRawFix && !requireTarget) {
                complete(bestRawFix);
            } else if (onError) {
                onError({
                    code: 3,
                    message: bestRawFix ? 'imprecise' : 'no_fix',
                    accuracy: bestRawFix ? bestRawFix.rawAccuracy : null
                });
            }
        }, maxScanMs);
    }

    function Kalman2D(mode) {
        this.lat = 0;
        this.lng = 0;
        this.variance = mode === 'vehicle' ? 400 : 100;
        this.initialized = false;
        this.lastTime = 0;
        this.mode = mode;
    }

    Kalman2D.prototype.reset = function () {
        this.initialized = false;
        this.lastTime = 0;
        this.variance = this.mode === 'vehicle' ? 400 : 100;
    };

    Kalman2D.prototype.process = function (coords) {
        var lat = coords.latitude;
        var lng = coords.longitude;
        var accuracy = Math.max(coords.accuracy || 50, 3);
        var speed = coords.speed || 0;
        var heading = coords.heading;
        var now = coords.timestamp || Date.now();
        var dt = this.lastTime ? (now - this.lastTime) / 1000 : 0;

        if (this.initialized && dt > 0 && dt < 30 && speed > 0.3 && heading != null && !isNaN(heading)) {
            var dist = speed * dt;
            var latRad = this.lat * DEG2RAD;
            var hRad = heading * DEG2RAD;
            this.lat += (dist * Math.cos(hRad)) / M_PER_DEG_LAT;
            this.lng += (dist * Math.sin(hRad)) / (M_PER_DEG_LAT * Math.cos(latRad));
            this.variance += Math.pow(speed * dt * 0.35, 2) + dt * (this.mode === 'vehicle' ? 2 : 0.5);
        } else if (this.initialized && dt > 0) {
            this.variance += dt * (this.mode === 'vehicle' ? 4 : 1);
        }

        var R = accuracy * accuracy;
        if (!this.initialized) {
            this.lat = lat;
            this.lng = lng;
            this.variance = R;
            this.initialized = true;
        } else {
            var K = this.variance / (this.variance + R);
            this.lat += K * (lat - this.lat);
            this.lng += K * (lng - this.lng);
            this.variance = (1 - K) * this.variance;
        }
        this.lastTime = now;

        return {
            lat: this.lat,
            lng: this.lng,
            accuracy: Math.sqrt(this.variance),
            rawAccuracy: accuracy,
            speed: speed,
            heading: heading,
            timestamp: now
        };
    };

    function BearingKalman() {
        this.bear = 0;
        this.var = 1;
        this._q = 0.001;
        this._r = 0.25;
    }

    BearingKalman.prototype.update = function (m) {
        this.var += this._q;
        var diff = ((m - this.bear + 540) % 360) - 180;
        var K = this.var / (this.var + this._r);
        this.bear = (this.bear + K * diff + 360) % 360;
        this.var = (1 - K) * this.var;
        return this.bear;
    };

    function computeBearing(lng1, lat1, lng2, lat2) {
        var dLon = (lng2 - lng1) * DEG2RAD;
        var lat1R = lat1 * DEG2RAD, lat2R = lat2 * DEG2RAD;
        var y = Math.sin(dLon) * Math.cos(lat2R);
        var x = Math.cos(lat1R) * Math.sin(lat2R) - Math.sin(lat1R) * Math.cos(lat2R) * Math.cos(dLon);
        return (Math.atan2(y, x) / DEG2RAD + 360) % 360;
    }

    function createEngine(opts) {
        opts = opts || {};
        var mode = opts.mode || (isMobile() ? 'pedestrian' : 'desktop');
        var maxAccuracy = opts.maxAccuracy != null ? opts.maxAccuracy
            : (mode === 'vehicle' ? 500 : mode === 'pedestrian' ? 80 : 1500);
        var displayMaxAccuracy = opts.displayMaxAccuracy != null ? opts.displayMaxAccuracy
            : Math.max(maxAccuracy, 3000);
        var maxJumpSpeed = opts.maxJumpSpeed != null ? opts.maxJumpSpeed : (mode === 'vehicle' ? 55 : 35);
        var snapThreshold = opts.snapThreshold != null ? opts.snapThreshold : 40;
        var targetAccuracy = opts.targetAccuracy != null ? opts.targetAccuracy : 50;
        var geoFollowOpts = opts.geoFollow || GEO_FOLLOW;

        var kalman = new Kalman2D(mode === 'desktop' ? 'pedestrian' : mode);
        var bearingKalman = new BearingKalman();
        var watchId = null;
        var nativeWatchId = null;
        var snapPath = null;
        var prevRaw = null;
        var prevTime = 0;
        var bestFix = null;
        var current = null;
        var rafId = null;
        var display = null;
        var onDisplayCb = null;
        var scanning = false;
        var baseSmooth = mode === 'vehicle' ? 0.22 : 0.38;

        function lerp(a, b, t) { return a + (b - a) * t; }

        function displaySmoothFactor() {
            var sf = baseSmooth;
            if (!current) return sf;
            if ((current.rawAccuracy || 999) <= targetAccuracy) return 1;
            if ((current.rawAccuracy || 999) <= targetAccuracy * 1.5) sf = Math.min(0.85, sf * 2);
            if ((current.speed || 0) > 1.5) sf = Math.min(0.55, sf * 1.3);
            return sf;
        }

        function applySnap(lat, lng) {
            if (!snapPath) return { lat: lat, lng: lng, snapped: false };
            if (global.DaxiMapSnap && typeof global.DaxiMapSnap.snapForDisplay === 'function') {
                var ds = global.DaxiMapSnap.snapForDisplay(lat, lng, snapPath, null, snapThreshold);
                if (ds.snapped) return { lat: ds.lat, lng: ds.lng, snapped: true, snapDist: ds.dist };
                return { lat: lat, lng: lng, snapped: false };
            }
            var s = snapToPath(lat, lng, snapPath);
            if (s.dist <= snapThreshold) return { lat: s.lat, lng: s.lng, snapped: true, snapDist: s.dist };
            return { lat: lat, lng: lng, snapped: false };
        }

        function rejectJump(lat, lng, accuracy, now) {
            if (scanning) return false;
            if (!prevRaw || !prevTime) return false;
            var dt = (now - prevTime) / 1000;
            if (dt <= 0 || dt > 60) return false;
            var dist = haversineM(prevRaw.lat, prevRaw.lng, lat, lng);
            var implied = dist / dt;
            var prevAcc = prevRaw.accuracy || 50;
            if (accuracy <= targetAccuracy && accuracy < prevAcc * 0.65) return false;
            if (accuracy < prevAcc * 0.4 && dist < 400) return false;
            if (implied > maxJumpSpeed) return true;
            if (accuracy > prevAcc * 3 && dist > 30) return true;
            return false;
        }

        function buildResult(c, filtered, snapped, bearing) {
            var useRaw = (c.accuracy || 9999) <= targetAccuracy;
            return {
                lat: useRaw ? c.latitude : snapped.lat,
                lng: useRaw ? c.longitude : snapped.lng,
                accuracy: useRaw ? c.accuracy : filtered.accuracy,
                rawAccuracy: filtered.rawAccuracy,
                speed: c.speed || 0,
                heading: bearing,
                snapped: snapped.snapped,
                timestamp: c.timestamp || Date.now(),
                raw: { lat: c.latitude, lng: c.longitude }
            };
        }

        function handleRawPosition(pos, meta) {
            meta = meta || {};
            traceFix(pos, meta.type || 'watchPosition');

            var c = pos.coords;
            var now = pos.timestamp || Date.now();
            var rawAcc = c.accuracy || 9999;

            if (rawAcc > REJECT_ACCURACY_M) return null;
            if (!scanning && rawAcc > maxAccuracy) {
                if (rawAcc <= displayMaxAccuracy) {
                    var approx = rawFixFromCoords(c, now);
                    if (!bestFix || rawAcc < (bestFix.rawAccuracy || 9999)) bestFix = approx;
                    current = approx;
                    if (!display) display = { lat: approx.raw.lat, lng: approx.raw.lng };
                    else {
                        display.lat = approx.raw.lat;
                        display.lng = approx.raw.lng;
                    }
                    return approx;
                }
                return null;
            }
            if (rejectJump(c.latitude, c.longitude, rawAcc, now)) return null;

            prevRaw = { lat: c.latitude, lng: c.longitude, accuracy: rawAcc };
            prevTime = now;

            if (rawAcc <= targetAccuracy) {
                kalman.reset();
                var precise = rawFixFromCoords(c, now);
                bestFix = precise;
                current = precise;
                if (!display) display = { lat: precise.lat, lng: precise.lng };
                else {
                    display.lat = precise.lat;
                    display.lng = precise.lng;
                }
                if (global.DaxiWebGps) global.DaxiWebGps.recordEngineFix(webGpsSide(), precise, 'navigator.geolocation');
                return precise;
            }

            var filtered = kalman.process(c);
            var snapped = applySnap(filtered.lat, filtered.lng);

            var bearing = c.heading;
            if (c.speed > 1.2 && bearing != null && !isNaN(bearing)) {
                bearing = bearingKalman.update(bearing);
            } else if (current) {
                var d = haversineM(current.lat, current.lng, snapped.lat, snapped.lng);
                if (d > 1.5 && (c.speed || 0) > 0.3) {
                    bearing = bearingKalman.update(computeBearing(current.lng, current.lat, snapped.lng, snapped.lat));
                }
            }

            var result = buildResult(c, filtered, snapped, bearing);
            if (!bestFix || rawAcc < (bestFix.rawAccuracy || 999)) bestFix = result;
            current = result;

            if (!display) {
                display = { lat: result.raw.lat, lng: result.raw.lng };
            }

            if (global.DaxiWebGps) global.DaxiWebGps.recordEngineFix(webGpsSide(), result, 'navigator.geolocation');
            return result;
        }

        function startDisplayLoop() {
            if (rafId) return;
            display = display || (current ? { lat: current.raw ? current.raw.lat : current.lat, lng: current.raw ? current.raw.lng : current.lng } : null);
            function tick() {
                if (current && display) {
                    var targetLat = current.raw ? current.raw.lat : current.lat;
                    var targetLng = current.raw ? current.raw.lng : current.lng;
                    if ((current.rawAccuracy || 999) <= targetAccuracy) {
                        display.lat = targetLat;
                        display.lng = targetLng;
                    } else {
                        var sf = displaySmoothFactor();
                        display.lat = lerp(display.lat, targetLat, sf);
                        display.lng = lerp(display.lng, targetLng, sf);
                    }
                    if (onDisplayCb) onDisplayCb({
                        lat: display.lat,
                        lng: display.lng,
                        accuracy: current.accuracy,
                        rawAccuracy: current.rawAccuracy,
                        speed: current.speed,
                        heading: current.heading,
                        snapped: current.snapped,
                        timestamp: current.timestamp,
                        locked: (current.rawAccuracy || 999) <= targetAccuracy,
                        raw: current.raw
                    });
                }
                rafId = requestAnimationFrame(tick);
            }
            rafId = requestAnimationFrame(tick);
        }

        function stopDisplayLoop() {
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        }

        return {
            rapidScan: function (onSuccess, onError, onRefine, scanOpts) {
                scanOpts = scanOpts || {};
                var burstTarget = scanOpts.targetAccuracy != null ? scanOpts.targetAccuracy : targetAccuracy;
                var scanMaxAccept = scanOpts.maxAccuracy != null ? scanOpts.maxAccuracy : Math.min(maxAccuracy, 80);
                var fallbackAccept = scanOpts.fallbackAccuracy != null ? scanOpts.fallbackAccuracy : 100;
                var maxScanMs = scanOpts.maxScanMs != null ? scanOpts.maxScanMs : (isMobile() ? 12000 : 8000);
                var requireTarget = scanOpts.requireTargetAccuracy !== false;

                if (hasNativeGps()) {
                    scanning = true;
                    kalman.reset();
                    bestFix = null;
                    current = null;
                    runNativeRapidScan(
                        scanOpts, burstTarget, scanMaxAccept, fallbackAccept, maxScanMs, requireTarget,
                        function (fix) {
                            scanning = false;
                            current = fix;
                            bestFix = fix;
                            onSuccess(fix);
                        },
                        function (err) {
                            scanning = false;
                            if (onError) onError(err);
                        },
                        onRefine
                    );
                    return;
                }

                if (!navigator.geolocation) {
                    traceError({ code: 0, message: 'unsupported' }, 'rapidScan');
                    if (onError) onError({ code: 0, message: 'unsupported' });
                    return;
                }

                var done = false;
                var scanWatchId = null;
                var bestRawFix = null;
                var getCalls = 0;
                var maxGetCalls = 4;
                var liveActive = watchId != null;

                scanning = true;
                kalman.reset();
                if (!liveActive) {
                    bestFix = null;
                    current = null;
                }

                if (global.DaxiWebGps) global.DaxiWebGps.markWatchStarted(webGpsSide());

                function cleanup() {
                    scanning = false;
                    if (scanWatchId != null) {
                        navigator.geolocation.clearWatch(scanWatchId);
                        scanWatchId = null;
                    }
                }

                function complete(fix) {
                    if (done) return;
                    done = true;
                    cleanup();
                    clearTimeout(hardTimer);
                    if (fix) {
                        current = fix;
                        bestFix = fix;
                        onSuccess(fix);
                    } else if (onError) {
                        onError({ code: 3, message: 'no_fix' });
                    }
                }

                function ingest(pos, type) {
                    if (done || !pos || !pos.coords) return;
                    var c = pos.coords;
                    var acc = c.accuracy || 9999;
                    traceFix(pos, type);

                    if (acc > REJECT_ACCURACY_M) return;

                    var fix = rawFixFromCoords(c, pos.timestamp || Date.now());
                    bestRawFix = absorbBestFix(bestRawFix, fix, acc);

                    if (onRefine) onRefine(fix);

                    if (acc <= burstTarget) {
                        complete(fix);
                    }
                }

                function finishWithBest() {
                    if (!bestRawFix) return null;
                    if (requireTarget && bestRawFix.rawAccuracy > fallbackAccept) return null;
                    return bestRawFix;
                }

                function requestGet() {
                    if (done || getCalls >= maxGetCalls) return;
                    getCalls += 1;
                    navigator.geolocation.getCurrentPosition(
                        function (pos) { ingest(pos, 'getCurrentPosition'); },
                        function (err) { traceError(err, 'getCurrentPosition'); },
                        GEO_SINGLE
                    );
                }

                var hardTimer = setTimeout(function () {
                    if (done) return;
                    var fix = finishWithBest();
                    if (fix) complete(fix);
                    else if (onError) {
                        onError({
                            code: 3,
                            message: bestRawFix ? 'imprecise' : 'no_fix',
                            accuracy: bestRawFix ? bestRawFix.rawAccuracy : null
                        });
                    }
                }, maxScanMs);

                scanWatchId = navigator.geolocation.watchPosition(
                    function (pos) { ingest(pos, 'watchPosition'); },
                    function (err) { traceError(err, 'watchPosition'); },
                    GEO_WATCH
                );

                requestGet();
                var getInterval = setInterval(function () {
                    if (done) {
                        clearInterval(getInterval);
                        return;
                    }
                    requestGet();
                }, scanOpts.getPollMs != null ? scanOpts.getPollMs : 3500);
                setTimeout(function () { clearInterval(getInterval); }, maxScanMs);
            },

            scan: function (onSuccess, onError, scanOpts) {
                this.rapidScan(onSuccess, onError, null, scanOpts);
            },

            start: function (onUpdate, onError) {
                if (hasNativeGps()) {
                    if (nativeWatchId != null) return;
                    onDisplayCb = onUpdate;
                    startDisplayLoop();
                    function nativePoll() {
                        var pos = nativeGeoPosition();
                        if (!pos) return;
                        var r = handleRawPosition(pos, { type: 'native_poll' });
                        if (r && !display) display = { lat: r.raw.lat, lng: r.raw.lng };
                    }
                    nativePoll();
                    nativeWatchId = setInterval(nativePoll, 800);
                    return;
                }
                if (!navigator.geolocation) {
                    traceError({ code: 0, message: 'unsupported' }, 'start');
                    if (onError) onError({ code: 0, message: 'unsupported' });
                    return;
                }
                if (watchId != null) return;
                onDisplayCb = onUpdate;
                startDisplayLoop();
                if (global.DaxiWebGps) global.DaxiWebGps.markWatchStarted(webGpsSide());

                navigator.geolocation.getCurrentPosition(
                    function (pos) {
                        var r = handleRawPosition(pos, { type: 'getCurrentPosition' });
                        if (r && !display) display = { lat: r.raw.lat, lng: r.raw.lng };
                    },
                    function (err) { traceError(err, 'getCurrentPosition'); },
                    GEO_SINGLE
                );

                watchId = navigator.geolocation.watchPosition(function (pos) {
                    var r = handleRawPosition(pos, { type: 'watchPosition' });
                    if (r && !display) display = { lat: r.raw.lat, lng: r.raw.lng };
                }, function (err) {
                    traceError(err, 'watchPosition');
                    if (onError) onError(err);
                }, geoFollowOpts);
            },

            stop: function () {
                if (nativeWatchId != null) {
                    clearInterval(nativeWatchId);
                    nativeWatchId = null;
                }
                if (watchId != null) {
                    navigator.geolocation.clearWatch(watchId);
                    watchId = null;
                }
                stopDisplayLoop();
                onDisplayCb = null;
            },

            setSnapPath: function (path) { snapPath = path; },
            getPosition: function () { return current; },
            getBestFix: function () { return bestFix; },
            getDisplayPosition: function () { return display; },
            getTargetAccuracy: function () { return targetAccuracy; },

            reset: function () {
                kalman.reset();
                prevRaw = null;
                prevTime = 0;
                bestFix = null;
                current = null;
                display = null;
            },

            destroy: function () {
                this.stop();
                this.reset();
                snapPath = null;
            }
        };
    }

    global.DaxiGpsEngine = {
        create: createEngine,
        snapToPath: snapToPath,
        haversineM: haversineM,
        isMobile: isMobile,
        computeBearing: computeBearing,
        TARGET_ACCURACY_M: 50,
        BURST_TIMEOUT_MS: 12000,
        BURST_MAX_INFLIGHT: 4,
        BURST_MAX_REQUESTS: 8,
        REJECT_ACCURACY_M: REJECT_ACCURACY_M
    };
})(typeof window !== 'undefined' ? window : this);
