(function(){
        var ua = navigator.userAgent || '';
        var isCap = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
        var isNative = /DaxiAndroid\//i.test(ua) || !!(window.DaxiAndroid) || isCap || !!window._daxiCapacitorApp;
        var isFile = location.protocol === 'file:';
        if (isNative || isFile) {
            document.documentElement.classList.add('daxi-native-shell');
        }
        if (isFile && !document.querySelector('base')) {
            var base = document.createElement('base');
            base.href = location.href.substring(0, location.href.lastIndexOf('/') + 1);
            document.head.insertBefore(base, document.head.firstChild);
        }
        window._daxiIsNativeApp = function() {
            return /DaxiAndroid\//i.test(navigator.userAgent || '') || !!(window.DaxiAndroid)
                || !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())
                || !!window._daxiCapacitorApp;
        };
    })();
