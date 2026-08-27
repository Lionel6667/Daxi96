
(function (global) {
  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function formatRemaining(ms) {
    if (ms <= 0) return { text: 'Maintenant', urgent: true };
    var sec = Math.floor(ms / 1000);
    var days = Math.floor(sec / 86400);
    if (days >= 1) {
      return { text: days + 'j ' + Math.floor((sec % 86400) / 3600) + 'h', urgent: false };
    }
    var hours = Math.floor(sec / 3600);
    if (hours >= 1) {
      return { text: hours + 'h ' + pad(Math.floor((sec % 3600) / 60)) + 'min', urgent: hours < 2 };
    }
    var mins = Math.floor(sec / 60);
    if (mins >= 1) {
      return { text: mins + ' min ' + pad(sec % 60) + ' s', urgent: mins < 5 };
    }
    return { text: sec + ' s', urgent: true };
  }

  function tickOne(el) {
    var iso = el.getAttribute('data-countdown-to');
    if (!iso) return;
    var target = new Date(iso).getTime();
    if (isNaN(target)) return;
    var ms = target - Date.now();
    var f = formatRemaining(ms);
    var prefix = el.getAttribute('data-countdown-prefix') || '🕐 ';
    el.textContent = prefix + f.text;
    el.classList.toggle('daxi-countdown--urgent', !!f.urgent);
    if (ms <= 0) el.classList.add('daxi-countdown--done');
  }

  function tickAll() {
    document.querySelectorAll('[data-countdown-to]').forEach(tickOne);
  }

  global.DaxiCountdown = { tick: tickAll, formatRemaining: formatRemaining };
  tickAll();
  setInterval(tickAll, 1000);
})(window);