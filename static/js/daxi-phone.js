
(function (global) {
    var PREFIXES = [
        '+1809', '+1829', '+1849', '+509', '+33', '+34', '+44',
        '+49', '+39', '+41', '+32', '+52', '+57', '+1'
    ];

    function digitsOnly(s) {
        return String(s || '').replace(/\D/g, '');
    }

    function daxiSplitPhone(phone) {
        var raw = String(phone || '').trim();
        if (!raw) return { prefix: '+509', national: '' };
        var i, p;
        for (i = 0; i < PREFIXES.length; i++) {
            p = PREFIXES[i];
            if (raw.indexOf(p) === 0) {
                return { prefix: p, national: digitsOnly(raw.slice(p.length)) };
            }
        }
        var d = digitsOnly(raw);
        if (d.indexOf('509') === 0 && d.length > 3) {
            return { prefix: '+509', national: d.slice(3) };
        }
        if (d.length === 8) {
            return { prefix: '+509', national: d };
        }
        if (d.length === 9 && d.charAt(0) === '0') {
            return { prefix: '+509', national: d.slice(1) };
        }
        return { prefix: '+509', national: d };
    }

    function daxiNormalizePhone(prefix, national) {
        prefix = String(prefix || '+509').trim();
        if (prefix.charAt(0) !== '+') prefix = '+' + digitsOnly(prefix);
        var nat = digitsOnly(national);
        if (!nat) return '';
        var prefixDigits = digitsOnly(prefix);
        if (nat.indexOf(prefixDigits) === 0 && nat.length > prefixDigits.length + 4) {
            nat = nat.slice(prefixDigits.length);
        }
        if (prefix === '+509') {
            if (nat.length === 9 && nat.charAt(0) === '0') nat = nat.slice(1);
            if (nat.length !== 8) return '';
        }
        return prefix + nat;
    }

    function daxiInitPhoneFields(prefixEl, nationalEl, storedPhone) {
        if (!prefixEl || !nationalEl) return;
        var split = daxiSplitPhone(storedPhone);
        prefixEl.value = split.prefix;
        if (!prefixEl.value) prefixEl.value = '+509';
        nationalEl.value = split.national;
    }

    global.DAXI_PHONE_PREFIXES = PREFIXES;
    global.daxiSplitPhone = daxiSplitPhone;
    global.daxiNormalizePhone = daxiNormalizePhone;
    global.daxiInitPhoneFields = daxiInitPhoneFields;
})(typeof window !== 'undefined' ? window : this);