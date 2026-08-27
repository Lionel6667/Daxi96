
(function(global) {
  'use strict';

  function csrfFrom(form) {
    return form.dataset.csrf || (global.getCsrfToken && global.getCsrfToken()) || (global.getCsrf && global.getCsrf()) || '';
  }

  function messagesTarget(orderId, scope) {
    if (scope === 'driver') return document.getElementById('chat-msgs');
    return document.getElementById('chat-messages-' + orderId);
  }

  function getReplyId(orderId, scope) {
    if (scope === 'driver' && global._chatReplyTo) return global._chatReplyTo;
    var rb = document.getElementById('chat-reply-bar-' + orderId);
    return rb && rb.dataset.replyTo ? rb.dataset.replyTo : null;
  }

  function clearReply(orderId, scope) {
    if (scope === 'driver') {
      window._chatReplyTo = null;
      var dbar = document.getElementById('chat-reply-bar');
      if (dbar) {
        dbar.classList.remove('open');
        dbar.style.display = '';
        delete dbar.dataset.replyTo;
      }
      var dprev = document.getElementById('chat-reply-preview');
      var dthumb = document.getElementById('chat-reply-thumb');
      if (dprev) dprev.textContent = '';
      if (dthumb) { dthumb.src = ''; dthumb.style.display = 'none'; }
      return;
    }
    if (global._daxiChatCancelReply) global._daxiChatCancelReply(orderId);
  }

  function replyBarEls(orderId, scope) {
    if (scope === 'driver') {
      return {
        bar: document.getElementById('chat-reply-bar'),
        preview: document.getElementById('chat-reply-preview'),
        thumb: document.getElementById('chat-reply-thumb')
      };
    }
    return {
      bar: document.getElementById('chat-reply-bar-' + orderId),
      preview: document.getElementById('chat-reply-preview-' + orderId),
      thumb: document.getElementById('chat-reply-thumb-' + orderId)
    };
  }

  function showReplyBar(orderId, msgId, scope, row, fallbackPreview) {
    var info = (global.DaxiChatUI && global.DaxiChatUI.extractReplyFromRow && row)
      ? global.DaxiChatUI.extractReplyFromRow(row)
      : { text: (fallbackPreview || 'Message').trim(), kind: 'text', thumb: null };
    if (scope === 'driver') window._chatReplyTo = msgId;
    var els = replyBarEls(orderId, scope);
    if (!els.bar || !els.preview) return;
    els.bar.dataset.replyTo = msgId;
    els.preview.textContent = info.text;
    if (els.thumb) {
      if (info.thumb) {
        els.thumb.src = info.thumb;
        els.thumb.style.display = 'block';
      } else {
        els.thumb.src = '';
        els.thumb.style.display = 'none';
      }
    }
    els.bar.classList.add('open');
    if (scope === 'driver') els.bar.style.display = 'flex';
  }

  function afterSend(html, orderId, scope) {
    var target = messagesTarget(orderId, scope);
    if (target && html) {
      target.innerHTML = html;
      if (global.DaxiChatUI) {
        var root = target.querySelector('.daxi-wa');
        if (root) global.DaxiChatUI.initMessagesRoot(root);
        else global.DaxiChatUI.scrollBottom(target);
      }
    }
    clearReply(orderId, scope);
  }

  function sendPayload(form, body) {
    var orderId = form.dataset.orderId;
    var scope = form.dataset.scope || '';
    var url = form.dataset.sendUrl;
    if (!url || !orderId) {
      if (global.DaxiChatMedia) global.DaxiChatMedia.toast('Conversation non prête.', 'error');
      return;
    }
    fetch(url, {
      method: 'POST',
      headers: { 'X-CSRFToken': csrfFrom(form) },
      body: body,
      credentials: 'include'
    }).then(function(r) { return r.text(); }).then(function(html) {
      afterSend(html, orderId, scope);
    }).catch(function() {
      if (global.DaxiChatMedia) global.DaxiChatMedia.toast('Échec envoi.', 'error');
    });
  }

  function bindForm(form) {
    if (!form) return;
    var orderId = form.dataset.orderId;
    var scope = form.dataset.scope || '';
    var guestId = form.dataset.guestId || '';
    var input = form.querySelector('.daxi-chat-text-input') || form.querySelector('#chat-input');
    var imgBtn = form.querySelector('.daxi-chat-img-btn') || form.querySelector('#chat-img-btn');
    var voiceBtn = form.querySelector('.daxi-chat-voice-btn') || form.querySelector('#chat-voice-btn');
    var sendBtn = form.querySelector('.daxi-chat-send-trigger') || form.querySelector('#chat-send-btn');

    function sendText() {
      if (!input || !input.value.trim()) return;
      var fd = new FormData();
      fd.append('message', input.value.trim());
      if (guestId) fd.append('guest_id', guestId);
      var rid = getReplyId(orderId, scope);
      if (rid) fd.append('reply_to', rid);
      input.value = '';
      sendPayload(form, fd);
    }

    if (!form.dataset.bound) {
      form.dataset.bound = '1';
      if (sendBtn) sendBtn.addEventListener('click', sendText);
      form.addEventListener('submit', function(e) { e.preventDefault(); sendText(); });
      if (input) input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
      });
      if (imgBtn) {
        imgBtn.addEventListener('click', function() {
          if (!global.DaxiChatMedia) return;
          global.DaxiChatMedia.openImagePicker(function(file) {
            var fd = new FormData();
            fd.append('image', file);
            if (guestId) fd.append('guest_id', guestId);
            var rid = getReplyId(orderId, scope);
            if (rid) fd.append('reply_to', rid);
            sendPayload(form, fd);
          });
        });
      }
    }

    if (voiceBtn && global.DaxiChatMedia) {
      global.DaxiChatMedia.bindVoiceButton(voiceBtn, {
        onSend: function(blob, filename, durationSec) {
          var fd = new FormData();
          fd.append('audio', blob, filename);
          if (durationSec > 0) fd.append('audio_duration', String(durationSec));
          if (guestId) fd.append('guest_id', guestId);
          var rid = getReplyId(orderId, scope);
          if (rid) fd.append('reply_to', rid);
          sendPayload(form, fd);
        }
      }, true);
    }
  }

  global._daxiChatReply = function(orderId, msgId, preview, scope, row) {
    showReplyBar(orderId, msgId, scope || '', row, preview);
  };

  global._daxiChatCancelReply = function(orderId, scope) {
    clearReply(orderId, scope);
  };

  function initAll() {
    document.querySelectorAll('.daxi-chat-form').forEach(bindForm);
  }

  function bindRootEvents() {
    if (!document.body) return;
    document.body.addEventListener('htmx:afterSwap', initAll);
    document.body.addEventListener('htmx:afterSettle', initAll);
  }

  document.addEventListener('DOMContentLoaded', function() {
    initAll();
    bindRootEvents();
  });
  if (document.body) bindRootEvents();

  global.DaxiChatComposer = { init: initAll, bindForm: bindForm };
})(window);