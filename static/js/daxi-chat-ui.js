
(function(global) {
  'use strict';

  var _audioPlayers = {};
  var _actionSheet = null;

  function scrollBottom(container) {
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }

  function csrf() {
    return (global.getCsrfToken && global.getCsrfToken()) || (global.getCsrf && global.getCsrf()) || '';
  }

  function ensureActionSheet() {
    if (_actionSheet) return _actionSheet;
    _actionSheet = document.createElement('div');
    _actionSheet.id = 'daxi-chat-action-sheet';
    _actionSheet.className = 'daxi-chat-action-sheet';
    _actionSheet.innerHTML = ''
      + '<div class="daxi-chat-action-sheet__backdrop"></div>'
      + '<div class="daxi-chat-action-sheet__panel">'
      + '  <button type="button" data-act="reply"><i class="ri-reply-line"></i> Répondre</button>'
      + '  <button type="button" data-act="edit"><i class="ri-edit-line"></i> Modifier</button>'
      + '  <button type="button" data-act="delete" class="danger"><i class="ri-delete-bin-line"></i> Supprimer</button>'
      + '  <button type="button" data-act="cancel" class="muted">Annuler</button>'
      + '</div>';
    document.body.appendChild(_actionSheet);
    _actionSheet.querySelector('.daxi-chat-action-sheet__backdrop').onclick = closeActionSheet;
    _actionSheet.querySelector('[data-act="cancel"]').onclick = closeActionSheet;
    return _actionSheet;
  }

  function closeActionSheet() {
    if (_actionSheet) _actionSheet.classList.remove('open');
  }

  function openActionSheet(row, orderId, scope) {
    var sheet = ensureActionSheet();
    var msgId = row.dataset.msgId;
    var preview = row.dataset.preview || '';
    var canEdit = row.dataset.canEdit === '1';
    var isOwn = row.dataset.own === '1';
    sheet.querySelector('[data-act="edit"]').style.display = (isOwn && canEdit) ? 'flex' : 'none';
    sheet.querySelector('[data-act="delete"]').style.display = isOwn ? 'flex' : 'none';
    sheet.querySelector('[data-act="reply"]').onclick = function() {
      closeActionSheet();
      if (global._daxiChatReply) global._daxiChatReply(orderId, msgId, preview, scope, row);
    };
    sheet.querySelector('[data-act="edit"]').onclick = function() {
      closeActionSheet();
      var textEl = row.querySelector('.daxi-wa-text');
      var current = textEl ? textEl.textContent : '';
      var next = prompt('Modifier le message :', current);
      if (next == null || !next.trim() || next.trim() === current) return;
      var fd = new FormData();
      fd.append('message', next.trim());
      fetch('/htmx/chat/' + scope + '/' + orderId + '/' + msgId + '/edit/', {
        method: 'POST',
        headers: { 'X-CSRFToken': csrf() },
        body: fd,
        credentials: 'include'
      }).then(function(r) { return r.text(); }).then(function(html) {
        var target = document.getElementById('chat-messages-' + orderId) || document.getElementById('chat-msgs');
        if (target && html) {
          target.innerHTML = html;
          if (global.DaxiChatUI) global.DaxiChatUI.initMessagesRoot(target.querySelector('.daxi-wa') || target);
        }
      });
    };
    sheet.querySelector('[data-act="delete"]').onclick = function() {
      closeActionSheet();
      if (!confirm('Supprimer ce message ?')) return;
      fetch('/htmx/chat/' + scope + '/' + orderId + '/' + msgId + '/delete/', {
        method: 'POST',
        headers: { 'X-CSRFToken': csrf() },
        credentials: 'include'
      }).then(function(r) { return r.text(); }).then(function(html) {
        var target = document.getElementById('chat-messages-' + orderId) || document.getElementById('chat-msgs');
        if (target && html) {
          target.innerHTML = html;
          if (global.DaxiChatUI) global.DaxiChatUI.initMessagesRoot(target.querySelector('.daxi-wa') || target);
        }
      });
    };
    sheet.classList.add('open');
  }

  function formatDur(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }

  function resolveAudioDuration(audio, durEl, presetSec) {
    if (!durEl) return;
    if (presetSec > 0) {
      durEl.textContent = formatDur(presetSec);
      return;
    }
    if (!audio) return;
    function applyFromAudio() {
      if (!audio || !durEl) return false;
      var d = audio.duration;
      if (isFinite(d) && d > 0 && d < 86400) {
        durEl.textContent = formatDur(d);
        return true;
      }
      return false;
    }
    if (applyFromAudio()) return;
    function onMeta() { applyFromAudio(); }
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('canplaythrough', onMeta);
    if (!isFinite(audio.duration) || audio.duration === Infinity) {
      var seeked = false;
      audio.addEventListener('loadeddata', function() {
        if (seeked || applyFromAudio()) return;
        seeked = true;
        var onSeeked = function() {
          audio.removeEventListener('seeked', onSeeked);
          audio.currentTime = 0;
          applyFromAudio();
        };
        audio.addEventListener('seeked', onSeeked);
        try { audio.currentTime = 1e10; } catch (e) {}
      });
    }
  }

  function extractReplyFromRow(row) {
    if (!row) return { text: 'Message', kind: 'text', thumb: null };
    var textEl = row.querySelector('.daxi-wa-text');
    var img = row.querySelector('.daxi-wa-img');
    var audio = row.querySelector('.daxi-wa-audio');
    var text = textEl && textEl.textContent ? textEl.textContent.trim() : '';
    if (text) {
      return { text: text.slice(0, 120), kind: 'text', thumb: img ? img.src : null };
    }
    if (img) {
      return { text: 'Photo', kind: 'image', thumb: img.src };
    }
    if (audio) {
      var dur = audio.dataset.duration;
      var durEl = audio.querySelector('.daxi-wa-audio-dur');
      if (!dur && durEl && durEl.textContent && durEl.textContent !== '…') dur = durEl.textContent;
      var label = 'Message vocal';
      if (dur) label += ' (' + dur + ')';
      return { text: label, kind: 'audio', thumb: null };
    }
    return { text: (row.dataset.preview || 'Message').trim(), kind: 'text', thumb: null };
  }

  function bindCustomAudio(wrap) {
    if (!wrap || wrap.dataset.audioBound) return;
    wrap.dataset.audioBound = '1';
    var btn = wrap.querySelector('.daxi-wa-audio-play');
    var fill = wrap.querySelector('.daxi-wa-audio-fill');
    var durEl = wrap.querySelector('.daxi-wa-audio-dur');
    var src = btn && btn.dataset.src;
    if (!btn || !src) return;
    var preset = parseInt(wrap.dataset.duration || '', 10);
    var id = wrap.dataset.audioId || src;
    if (!_audioPlayers[id]) {
      var audio = new Audio(src);
      audio.preload = 'metadata';
      _audioPlayers[id] = { audio: audio, playing: false };
      resolveAudioDuration(audio, durEl, preset);
      try { audio.load(); } catch (e) {}
      audio.addEventListener('timeupdate', function() {
        if (!fill || !isFinite(audio.duration) || audio.duration <= 0) return;
        fill.style.width = Math.round((audio.currentTime / audio.duration) * 100) + '%';
        if (durEl && _audioPlayers[id].playing) durEl.textContent = formatDur(audio.currentTime);
      });
      audio.addEventListener('ended', function() {
        _audioPlayers[id].playing = false;
        btn.innerHTML = '<i class="ri-play-fill"></i>';
        if (fill) fill.style.width = '0%';
        resolveAudioDuration(audio, durEl, preset);
      });
    }
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var entry = _audioPlayers[id];
      if (!entry) return;
      Object.keys(_audioPlayers).forEach(function(k) {
        if (k !== id && _audioPlayers[k].playing) {
          _audioPlayers[k].audio.pause();
          _audioPlayers[k].playing = false;
        }
      });
      if (entry.playing) {
        entry.audio.pause();
        entry.playing = false;
        btn.innerHTML = '<i class="ri-play-fill"></i>';
      } else {
        entry.audio.play().catch(function() {});
        entry.playing = true;
        btn.innerHTML = '<i class="ri-pause-fill"></i>';
      }
    });
  }

  function bindSwipeReply(row, onReply) {
    if (!row || row.dataset.swipeBound) return;
    row.dataset.swipeBound = '1';
    var startX = 0, curX = 0, dragging = false;
    var bubble = row.querySelector('.daxi-wa-bubble');
    function reset() {
      if (bubble) bubble.style.transform = '';
      dragging = false;
      curX = 0;
    }
    row.addEventListener('touchstart', function(e) {
      if (!e.touches || !e.touches[0]) return;
      startX = e.touches[0].clientX;
      dragging = true;
    }, { passive: true });
    row.addEventListener('touchmove', function(e) {
      if (!dragging || !bubble || !e.touches[0]) return;
      curX = e.touches[0].clientX - startX;
      var clamped = Math.max(-52, Math.min(52, curX));
      bubble.style.transform = 'translateX(' + clamped + 'px)';
    }, { passive: true });
    row.addEventListener('touchend', function() {
      if (!bubble) return;
      if (Math.abs(curX) > 40 && typeof onReply === 'function') onReply();
      reset();
    });
  }

  function initMessagesRoot(root) {
    if (!root) return;
    var orderId = root.dataset.orderId;
    var scope = root.dataset.scope || '';
    var msgs = root.querySelector('.daxi-wa-msgs');
    if (!msgs) return;

    msgs.querySelectorAll('.daxi-wa-audio').forEach(function(wrap) {
      try { bindCustomAudio(wrap); } catch (e) { console.warn('[DaxiChatUI] audio', e); }
    });
    msgs.querySelectorAll('.daxi-wa-row').forEach(function(row) {
      var msgId = row.dataset.msgId;
      var preview = row.dataset.preview || '';
      var menuBtn = row.querySelector('.daxi-wa-row-menu');
      if (menuBtn && !menuBtn.dataset.bound) {
        menuBtn.dataset.bound = '1';
        menuBtn.addEventListener('click', function(e) {
          e.stopPropagation();
          openActionSheet(row, orderId, scope);
        });
      }
      bindSwipeReply(row, function() {
        if (global._daxiChatReply) global._daxiChatReply(orderId, msgId, preview, scope, row);
      });
    });

    var container = document.getElementById('chat-messages-' + orderId)
      || document.getElementById('chat-msgs')
      || root.parentElement;
    scrollBottom(container);
  }

  function initAll(evt) {
    var roots = [];
    if (evt && evt.detail && evt.detail.target) {
      var t = evt.detail.target;
      if (t.classList && t.classList.contains('daxi-wa')) roots.push(t);
      t.querySelectorAll && t.querySelectorAll('.daxi-wa[data-order-id]').forEach(function(r) { roots.push(r); });
      t.querySelectorAll && t.querySelectorAll('.daxi-chat-shell__msgs').forEach(function(msgs) {
        var wa = msgs.querySelector('.daxi-wa');
        if (wa) roots.push(wa);
      });
    }
    if (!roots.length) {
      document.querySelectorAll('.daxi-wa[data-order-id]').forEach(function(r) { roots.push(r); });
    }
    roots.forEach(initMessagesRoot);
    if (global.DaxiChatComposer) global.DaxiChatComposer.init();
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

  global.DaxiChatUI = {
    init: initAll,
    initMessagesRoot: initMessagesRoot,
    scrollBottom: scrollBottom,
    extractReplyFromRow: extractReplyFromRow
  };
})(window);