
(function(global) {
  'use strict';

  function audioMime() {
    if (typeof MediaRecorder === 'undefined') return '';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
    if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
    if (MediaRecorder.isTypeSupported('audio/aac')) return 'audio/aac';
    return '';
  }

  function audioExt(mime) {
    if (!mime) return 'webm';
    if (mime.indexOf('mp4') >= 0 || mime.indexOf('aac') >= 0) return 'm4a';
    return 'webm';
  }

  function toast(msg, type) {
    if (global.showDaxiNotification) {
      global.showDaxiNotification('Chat', msg, { type: type || 'info' });
    } else if (global.showDriverToast) {
      global.showDriverToast(msg, type || 'info');
    } else {
      alert(msg);
    }
  }

  function ensurePickerSheet() {
    var el = document.getElementById('daxi-chat-img-picker');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'daxi-chat-img-picker';
    el.className = 'daxi-chat-img-picker';
    el.innerHTML = ''
      + '<div class="daxi-chat-img-picker__backdrop"></div>'
      + '<div class="daxi-chat-img-picker__sheet">'
      + '  <div class="daxi-chat-img-picker__title">Envoyer une image</div>'
      + '  <button type="button" class="daxi-chat-img-picker__btn" data-act="camera"><i class="ri-camera-line"></i> Prendre une photo</button>'
      + '  <button type="button" class="daxi-chat-img-picker__btn" data-act="gallery"><i class="ri-image-line"></i> Choisir dans la galerie</button>'
      + '  <button type="button" class="daxi-chat-img-picker__cancel">Annuler</button>'
      + '</div>';
    document.body.appendChild(el);
    if (!document.getElementById('daxi-chat-img-picker-style')) {
      var st = document.createElement('style');
      st.id = 'daxi-chat-img-picker-style';
      st.textContent = ''
        + '.daxi-chat-img-picker{position:fixed;inset:0;z-index:120000;display:none;align-items:flex-end;justify-content:center}'
        + '.daxi-chat-img-picker.open{display:flex}'
        + '.daxi-chat-img-picker__backdrop{position:absolute;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(3px)}'
        + '.daxi-chat-img-picker__sheet{position:relative;width:min(420px,100%);background:#111827;border-radius:20px 20px 0 0;padding:18px 16px calc(env(safe-area-inset-bottom,0px)+16px);border:1px solid rgba(255,255,255,.08)}'
        + '.daxi-chat-img-picker__title{font-size:14px;font-weight:800;color:#f8fafc;margin-bottom:12px;text-align:center}'
        + '.daxi-chat-img-picker__btn{width:100%;display:flex;align-items:center;gap:10px;padding:14px 16px;margin-bottom:8px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);color:#f1f5f9;font-size:14px;font-weight:700;cursor:pointer}'
        + '.daxi-chat-img-picker__btn i{font-size:20px;color:#60a5fa}'
        + '.daxi-chat-img-picker__cancel{width:100%;padding:12px;border:none;background:transparent;color:#94a3b8;font-size:13px;font-weight:700;cursor:pointer}';
      document.head.appendChild(st);
    }
    return el;
  }

  function ensureVoiceOverlay() {
    var el = document.getElementById('daxi-voice-overlay');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'daxi-voice-overlay';
    el.className = 'daxi-voice-overlay';
    el.innerHTML = ''
      + '<div class="daxi-voice-sheet">'
      + '  <div class="daxi-voice-sheet__title">Enregistrement vocal</div>'
      + '  <div class="daxi-voice-sheet__sub">Parlez clairement, puis envoyez ou annulez</div>'
      + '  <div class="daxi-voice-wave"><span></span><span></span><span></span><span></span><span></span></div>'
      + '  <div class="daxi-voice-timer">0:00</div>'
      + '  <div class="daxi-voice-actions">'
      + '    <button type="button" class="daxi-voice-cancel" data-act="cancel">Annuler</button>'
      + '    <button type="button" class="daxi-voice-send" data-act="send">Envoyer</button>'
      + '  </div>'
      + '</div>';
    document.body.appendChild(el);
    return el;
  }

  function openImagePicker(onFile) {
    var sheet = ensurePickerSheet();
    var camInput = document.getElementById('daxi-chat-img-camera');
    var galInput = document.getElementById('daxi-chat-img-gallery');
    if (!camInput) {
      camInput = document.createElement('input');
      camInput.type = 'file';
      camInput.id = 'daxi-chat-img-camera';
      camInput.accept = 'image/*';
      camInput.capture = 'environment';
      camInput.style.display = 'none';
      document.body.appendChild(camInput);
    }
    if (!galInput) {
      galInput = document.createElement('input');
      galInput.type = 'file';
      galInput.id = 'daxi-chat-img-gallery';
      galInput.accept = 'image/*';
      galInput.style.display = 'none';
      document.body.appendChild(galInput);
    }
    function close() { sheet.classList.remove('open'); }
    function bindOnce(input) {
      input.value = '';
      input.onchange = function() {
        if (input.files && input.files[0] && typeof onFile === 'function') onFile(input.files[0]);
        close();
      };
    }
    bindOnce(camInput);
    bindOnce(galInput);
    sheet.querySelector('.daxi-chat-img-picker__backdrop').onclick = close;
    sheet.querySelector('.daxi-chat-img-picker__cancel').onclick = close;
    sheet.querySelector('[data-act="camera"]').onclick = function() { camInput.click(); };
    sheet.querySelector('[data-act="gallery"]').onclick = function() { galInput.click(); };
    sheet.classList.add('open');
  }

  var _session = null;

  function stopTracks(stream) {
    if (!stream) return;
    stream.getTracks().forEach(function(t) { t.stop(); });
  }

  function formatVoiceDur(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }

  function closeVoiceOverlay() {
    var overlay = document.getElementById('daxi-voice-overlay');
    if (overlay) overlay.classList.remove('open');
    if (_session && _session.btn) _session.btn.classList.remove('is-recording');
    if (_session && _session.stream) stopTracks(_session.stream);
    if (_session && _session.tick) clearInterval(_session.tick);
    _session = null;
  }

  function openVoiceRecorder(opts) {
    opts = opts || {};
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices) {
      toast('Enregistrement vocal non supporté.', 'error');
      return;
    }
    if (_session) return;

    var overlay = ensureVoiceOverlay();
    var timerEl = overlay.querySelector('.daxi-voice-timer');
    if (timerEl) timerEl.textContent = '0:00';
    var btn = opts.button || null;
    if (btn) btn.classList.add('is-recording');

    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
      var mime = audioMime();
      var rec;
      try {
        rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      } catch (e) {
        rec = new MediaRecorder(stream);
        mime = rec.mimeType || mime;
      }
      var chunks = [];
      var started = Date.now();
      rec.ondataavailable = function(e) { if (e.data && e.data.size) chunks.push(e.data); };

      function finish(send) {
        if (_session && _session.tick) clearInterval(_session.tick);
        var dur = Date.now() - started;
        rec.onstop = function() {
          closeVoiceOverlay();
          if (!send || dur < 400 || !chunks.length) return;
          var type = mime || (chunks[0] && chunks[0].type) || 'audio/webm';
          var blob = new Blob(chunks, { type: type });
          var durationSec = Math.max(1, Math.round(dur / 1000));
          if (typeof opts.onSend === 'function') opts.onSend(blob, 'voice.' + audioExt(type), durationSec);
        };
        try { rec.stop(); } catch (e) { closeVoiceOverlay(); }
      }

      rec.start(120);
      overlay.classList.add('open');
      var tick = setInterval(function() {
        var s = Math.floor((Date.now() - started) / 1000);
        if (timerEl) timerEl.textContent = formatVoiceDur(s);
      }, 1000);

      _session = { stream: stream, rec: rec, tick: tick, btn: btn };

      var cancelBtn = overlay.querySelector('[data-act="cancel"]');
      var sendBtn = overlay.querySelector('[data-act="send"]');
      cancelBtn.onclick = function() { finish(false); };
      sendBtn.onclick = function() { finish(true); };
      overlay.onclick = function(e) {
        if (e.target === overlay) finish(false);
      };
    }).catch(function() {
      if (btn) btn.classList.remove('is-recording');
      toast('Permission micro refusée.', 'error');
    });
  }

  function bindVoiceButton(btn, opts, force) {
    if (!btn) return;
    if (btn.dataset.daxiVoiceBound && !force) return;
    btn.dataset.daxiVoiceBound = '1';
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      openVoiceRecorder(Object.assign({ button: btn }, opts || {}));
    });
  }

  global.DaxiChatMedia = {
    audioMime: audioMime,
    audioExt: audioExt,
    openImagePicker: openImagePicker,
    openVoiceRecorder: openVoiceRecorder,
    bindVoiceButton: bindVoiceButton,
    toast: toast
  };
})(window);