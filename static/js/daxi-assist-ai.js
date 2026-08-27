(function (global) {
  'use strict';

  function csrf() {
    if (global.DJANGO_SESSION && DJANGO_SESSION.csrf_token) return DJANGO_SESSION.csrf_token;
    var m = document.cookie.match(/csrftoken=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function el(html) {
    var d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstChild;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderRich(text) {
    var raw = String(text == null ? '' : text).replace(/\r\n/g, '\n').trim();
    var escaped = escapeHtml(raw);
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/(^|[^\w*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    var lines = escaped.split('\n');
    var html = '';
    var inOl = false;
    var inUl = false;
    function closeLists() {
      if (inOl) { html += '</ol>'; inOl = false; }
      if (inUl) { html += '</ul>'; inUl = false; }
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var ol = line.match(/^\s*(\d+)\.\s+(.+)$/);
      var ul = line.match(/^\s*[-•]\s+(.+)$/);
      if (ol) {
        if (inUl) { html += '</ul>'; inUl = false; }
        if (!inOl) { html += '<ol class="daxi-ai-ol">'; inOl = true; }
        html += '<li><span class="daxi-ai-n">' + ol[1] + '</span><span class="daxi-ai-li">' + ol[2] + '</span></li>';
        continue;
      }
      if (ul) {
        if (inOl) { html += '</ol>'; inOl = false; }
        if (!inUl) { html += '<ul class="daxi-ai-ul">'; inUl = true; }
        html += '<li>' + ul[1] + '</li>';
        continue;
      }
      closeLists();
      if (!line.trim()) {
        html += '<div class="daxi-ai-gap"></div>';
        continue;
      }
      html += '<p>' + line + '</p>';
    }
    closeLists();
    return html || '<p></p>';
  }

  function thinkingNode() {
    var row = document.createElement('div');
    row.className = 'daxi-ai-msg daxi-ai-msg--bot daxi-ai-thinking';
    row.innerHTML =
      '<div class="daxi-ai-think-orb"></div>' +
      '<div class="daxi-ai-think-copy">' +
        '<strong>DAXI réfléchit</strong>' +
        '<span>Je parcours le formulaire et tes options…</span>' +
      '</div>' +
      '<div class="daxi-ai-dots" aria-hidden="true"><i></i><i></i><i></i></div>';
    return row;
  }

  function mount(opts) {
    opts = opts || {};
    var audience = opts.audience === 'driver' ? 'driver' : 'client';
    var host = typeof opts.host === 'string' ? document.querySelector(opts.host) : opts.host;
    if (!host) return null;
    if (host.querySelector('.daxi-ai-panel')) return host.querySelector('.daxi-ai-panel');

    var title = audience === 'driver' ? 'Conseiller chauffeur' : 'Conseiller DAXI';
    var hint = audience === 'driver'
      ? 'En ligne · documents, inscription, courses'
      : 'En ligne · commande, paiement, suivi';
    var chips = audience === 'driver'
      ? ['Documents à fournir', 'Mon dossier est refusé', 'Comment accepter une course']
      : ['Comment commander', 'Comment payer', 'Suivre ma course'];
    var chipsHtml = chips.map(function (c) {
      return '<button type="button" class="daxi-ai-chip">' + c.replace(/</g, '') + '</button>';
    }).join('');
    var panel = el(
      '<div class="daxi-ai-panel" data-audience="' + audience + '">' +
        '<div class="daxi-ai-head">' +
          '<div class="daxi-ai-orb"></div>' +
          '<div><strong>' + title + '</strong><span>' + hint + '</span></div>' +
        '</div>' +
        '<div class="daxi-ai-log" role="log"></div>' +
        '<div class="daxi-ai-chips">' + chipsHtml + '</div>' +
        '<form class="daxi-ai-form">' +
          '<input type="text" maxlength="800" placeholder="Votre message…" autocomplete="off">' +
          '<button type="submit" aria-label="Envoyer"><i class="ri-send-plane-fill"></i></button>' +
        '</form>' +
      '</div>'
    );
    host.appendChild(panel);
    var log = panel.querySelector('.daxi-ai-log');
    var form = panel.querySelector('.daxi-ai-form');
    var input = form.querySelector('input');
    var sendBtn = form.querySelector('button');
    var chipsWrap = panel.querySelector('.daxi-ai-chips');
    var sessionId = null;
    var busy = false;

    function add(role, text) {
      var row = document.createElement('div');
      row.className = 'daxi-ai-msg daxi-ai-msg--' + role;
      if (role === 'bot') {
        row.classList.add('daxi-ai-msg--rich');
        row.innerHTML = renderRich(text);
      } else {
        row.textContent = text;
      }
      log.appendChild(row);
      log.scrollTop = log.scrollHeight;
      return row;
    }

    function send(msg) {
      msg = (msg || '').trim();
      if (!msg || busy) return;
      if (chipsWrap) chipsWrap.style.display = 'none';
      input.value = '';
      add('user', msg);
      busy = true;
      sendBtn.disabled = true;
      panel.classList.add('is-thinking');
      var wait = thinkingNode();
      log.appendChild(wait);
      log.scrollTop = log.scrollHeight;
      fetch('/api/chatbot/message/', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrf()
        },
        body: JSON.stringify({
          message: msg,
          language: document.documentElement.lang || 'fr',
          audience: audience,
          session_id: sessionId,
          guest_id: (global.DaxiGuestId && DaxiGuestId.get && DaxiGuestId.get()) || ''
        })
      }).then(function (r) { return r.json(); }).then(function (data) {
        wait.remove();
        if (data.session_id) sessionId = data.session_id;
        add('bot', data.response || data.error || 'Réessaie dans un instant.');
      }).catch(function () {
        wait.remove();
        add('bot', 'Le réseau a coupé. WhatsApp +509 4496-9696, ou réessaie.');
      }).finally(function () {
        busy = false;
        sendBtn.disabled = false;
        panel.classList.remove('is-thinking');
        input.focus();
      });
    }

    if (chipsWrap) {
      chipsWrap.addEventListener('click', function (ev) {
        var b = ev.target.closest('.daxi-ai-chip');
        if (b) send(b.textContent);
      });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      send(input.value);
    });
    return panel;
  }

  global.DaxiAssistAI = { mount: mount };
})(window);
