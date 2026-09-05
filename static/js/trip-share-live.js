
(function (global) {
  'use strict';

  var PIPELINE = [
    { key: 'pending', label: 'Demande' },
    { key: 'price_proposed', label: 'Devis' },
    { key: 'price_confirmed', label: 'Confirmé' },
    { key: 'driver_assigned', label: 'Assigné' },
    { key: 'on_way', label: 'En route' },
    { key: 'arrived', label: 'Sur place' },
    { key: 'in_progress', label: 'En cours' },
    { key: 'completed', label: 'Terminé' },
  ];

  var PIPELINE_ROUNDTRIP = [
    { key: 'pending', label: 'Demande' },
    { key: 'price_proposed', label: 'Devis' },
    { key: 'price_confirmed', label: 'Confirmé' },
    { key: 'driver_assigned', label: 'Assigné' },
    { key: 'on_way', label: 'En route' },
    { key: 'arrived', label: 'Sur place' },
    { key: 'outbound', label: 'Aller' },
    { key: 'waiting_return', label: 'Attente' },
    { key: 'return', label: 'Retour' },
    { key: 'completed', label: 'Terminé' },
  ];

  var STATUS_INDEX = {
    pending: 0, price_proposed: 1, price_confirmed: 2,
    driver_assigned: 3, on_way: 4, arrived: 5, in_progress: 6, completed: 7,
  };

  var REFRESH_EVENTS = [
    'snapshot', 'status_updated', 'status_changed', 'driver_on_the_way',
    'driver_arrived', 'driver_assigned', 'driver_accepted', 'in_progress',
    'round_trip_waiting', 'round_trip_return_started',
    'order_completed', 'order_cancelled', 'coords_set', 'trip_paused',
    'trip_resumed', 'trip_extended', 'price_updated', 'payment_confirmed',
    'now_transition', 'relocate_prompt',
  ];

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function haversineKm(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return 0;
    var R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function formatCountdown(secs) {
    if (secs == null || secs <= 0) return 'Bientôt';
    var h = Math.floor(secs / 3600);
    var m = Math.floor((secs % 3600) / 60);
    if (h > 0) return 'Dans ' + h + ' h ' + m + ' min';
    return 'Dans ' + Math.max(1, m) + ' min';
  }

  function DaxiTripShare(cfg) {
    this.token = cfg.token;
    this.googleKey = cfg.googleKey || '';
    this.state = cfg.initial || {};
    this.map = null;
    this.markers = {};
    this.polylines = [];
    this.directionsSvc = null;
    this.ws = null;
    this._drvPos = null;
    this._drvTarget = null;
    this._animFrame = null;
    this._pollTimer = null;
    this._countdownTimer = null;
    this._lastPoll = 0;
  }

  DaxiTripShare.prototype.boot = function () {
    var self = this;
    this.applyTheme(this.state);
    this.renderStatic(this.state);
    this.bindActions();
    if (this.googleKey) {
      this.loadMaps(function () { self.initMap(); });
    }
    this.poll(true);
    this.connectWs();
    this._pollTimer = setInterval(function () { self.poll(false); }, 12000);
    this._countdownTimer = setInterval(function () { self.tickCountdown(); }, 1000);
  };

  DaxiTripShare.prototype.applyTheme = function (d) {
    var theme = (d && d.card_theme) || 'oneway';
    document.body.setAttribute('data-ts-theme', theme);
  };

  DaxiTripShare.prototype.renderStatic = function (d) {
    if (!d) return;
    this.applyTheme(d);
    this.setText('ts-trip-title', d.card_title || 'Suivi course');
    this.setText('ts-trip-sub', d.card_subtitle || '');
    this.setText('ts-trip-badge', d.card_badge || '');
    this.setIcon('ts-trip-icon', d.card_icon || 'ri-car-line');
    this.setText('ts-client-name', d.client_name || 'un proche');
    this.setText('ts-live-status', d.status_label || d.status || '');
    this.updateWaiting(d);
    this.updatePipeline(d);
    this.updateRoute(d);
    this.updateMeta(d);
    this.updateDriver(d);
    this.updateBanners(d);
    this.updateEta(d);
    this.tickCountdown();
  };

  DaxiTripShare.prototype.setText = function (id, txt) {
    var el = $(id);
    if (el && txt != null) el.textContent = txt;
  };

  DaxiTripShare.prototype.setIcon = function (id, cls) {
    var el = $(id);
    if (el) el.className = cls;
  };

  DaxiTripShare.prototype.setHtml = function (id, html) {
    var el = $(id);
    if (el) el.innerHTML = html;
  };

  DaxiTripShare.prototype.updateWaiting = function (d) {
    var box = $('ts-waiting');
    if (!box) return;
    if (!d.waiting_title && !d.waiting_detail) {
      box.style.display = 'none';
      return;
    }
    box.style.display = '';
    this.setText('ts-waiting-title', d.waiting_title || '');
    this.setText('ts-waiting-detail', d.waiting_detail || '');
  };

  DaxiTripShare.prototype.updatePipeline = function (d) {
    var root = $('ts-pipeline');
    if (!root) return;
    var idx = d.status_pipeline_index != null ? d.status_pipeline_index : (STATUS_INDEX[d.status] != null ? STATUS_INDEX[d.status] : -1);
    if (d.status === 'cancelled') idx = -1;
    var steps = (d.is_round_trip || (d.trip_type || '').indexOf('round') >= 0 || (d.trip_type || '').indexOf('retour') >= 0)
      ? PIPELINE_ROUNDTRIP : PIPELINE;
    var html = '';
    steps.forEach(function (step, i) {
      var cls = 'ts-pipe-step';
      if (idx >= 0) {
        if (i < idx) cls += ' done';
        if (i === idx) cls += ' on';
      }
      html += '<div class="' + cls + '">' + esc(step.label) + '</div>';
    });
    root.innerHTML = html;
  };

  DaxiTripShare.prototype.updateRoute = function (d) {
    this.setText('ts-pickup', d.pickup || '—');
    this.setText('ts-dest', d.destination || '—');
    var meeting = $('ts-meeting-block');
    if (meeting) {
      var show = d.meeting_lat && d.meeting_lng &&
        (Math.abs(d.meeting_lat - (d.pickup_lat || 0)) > 0.0001 ||
         Math.abs(d.meeting_lng - (d.pickup_lng || 0)) > 0.0001);
      meeting.style.display = show ? '' : 'none';
      if (show) this.setText('ts-meeting-lbl', 'Point de rendez-vous confirmé');
    }
    var stopsEl = $('ts-stops');
    if (stopsEl && d.plan_stops && d.plan_stops.length) {
      var sh = '';
      d.plan_stops.forEach(function (s, i) {
        sh += '<div class="ts-stop"><div class="ts-stop-num">' + (i + 1) + '</div><div><div class="ts-lbl">Étape ' + (i + 1) + '</div><div class="ts-addr" style="margin-bottom:0">' + esc(s.label || 'Arrêt') + '</div></div></div>';
      });
      stopsEl.innerHTML = sh;
      stopsEl.style.display = '';
    } else if (stopsEl) {
      stopsEl.style.display = 'none';
    }
    var itin = $('ts-itinerary');
    if (itin) {
      if (d.plan_itinerary) {
        itin.textContent = d.plan_itinerary;
        itin.parentElement.style.display = '';
      } else {
        itin.parentElement.style.display = 'none';
      }
    }
  };

  DaxiTripShare.prototype.updateMeta = function (d) {
    var chips = [];
    if (d.passengers) chips.push('<span class="ts-chip"><i class="ri-user-3-line"></i> ' + d.passengers + ' passager' + (d.passengers > 1 ? 's' : '') + '</span>');
    if (d.vehicle_type_label) chips.push('<span class="ts-chip"><i class="ri-car-line"></i> ' + esc(d.vehicle_type_label) + '</span>');
    if (d.payment_method_label) chips.push('<span class="ts-chip"><i class="ri-wallet-3-line"></i> ' + esc(d.payment_method_label) + '</span>');
    if (d.is_later && d.scheduled_display) chips.push('<span class="ts-chip"><i class="ri-calendar-line"></i> ' + esc(d.scheduled_display) + '</span>');
    if (d.round_trip_wait_minutes) chips.push('<span class="ts-chip"><i class="ri-hourglass-line"></i> Attente retour ' + d.round_trip_wait_minutes + ' min</span>');
    if (d.is_round_trip && d.round_trip_phase === 'return') chips.push('<span class="ts-chip"><i class="ri-arrow-go-back-line"></i> Retour en cours</span>');
    else if (d.is_round_trip && d.status === 'waiting_return') chips.push('<span class="ts-chip"><i class="ri-hourglass-line"></i> Pause avant retour</span>');
    else if (d.is_round_trip && d.status === 'in_progress') chips.push('<span class="ts-chip"><i class="ri-steering-2-line"></i> Aller en cours</span>');
    if (d.service_plan_display) chips.push('<span class="ts-chip"><i class="ri-vip-crown-line"></i> ' + esc(d.service_plan_display) + '</span>');
    if (d.plan_occasion) chips.push('<span class="ts-chip"><i class="ri-gift-line"></i> ' + esc(d.plan_occasion) + '</span>');
    this.setHtml('ts-meta-chips', chips.join(''));
    var priceHtml = '';
    if (d.price) {
      priceHtml = '<span class="ts-price-main">$' + esc(d.price) + '</span>';
      var extras = [];
      if (d.pause_price > 0) extras.push('pause +$' + d.pause_price);
      if (d.extra_km_price > 0) extras.push('extension +$' + d.extra_km_price);
      if (extras.length) priceHtml += '<span class="ts-price-extra">' + extras.join(' · ') + '</span>';
    }
    this.setHtml('ts-price-row', priceHtml);
  };

  DaxiTripShare.prototype.updateDriver = function (d) {
    this.setText('ts-drv-name', d.driver_name || 'Chauffeur DAXI');
    var meta = [];
    if (d.driver_vehicle || d.driver_vehicle_label) meta.push(d.driver_vehicle_label || d.driver_vehicle);
    if (d.driver_car_year) meta.push('(' + d.driver_car_year + ')');
    if (d.driver_plate) meta.push(d.driver_plate);
    if (d.driver_rating) meta.push('⭐ ' + d.driver_rating);
    if (d.driver_is_verified) meta.push('✓ Vérifié');
    this.setText('ts-drv-meta', meta.join(' · '));
    var av = $('ts-avatar');
    if (av && d.driver_photo) av.innerHTML = '<img src="' + esc(d.driver_photo) + '" alt="">';
    var car = $('ts-car-img');
    if (car && d.driver_car_image) {
      car.style.display = '';
      car.innerHTML = '<img src="' + esc(d.driver_car_image) + '" alt="Véhicule">';
    }
    var call = $('ts-btn-call');
    if (call && d.driver_phone) {
      call.href = 'tel:' + d.driver_phone;
      call.style.display = '';
      var wa = $('ts-btn-wa');
      if (wa) {
        wa.href = 'https://wa.me/' + String(d.driver_phone).replace(/\D/g, '');
        wa.style.display = '';
      }
    }
  };

  DaxiTripShare.prototype.updateBanners = function (d) {
    var root = $('ts-banners');
    if (!root) return;
    var html = '';
    if (d.sos_triggered) {
      html += '<div class="ts-banner ts-banner--sos"><i class="ri-alarm-warning-fill"></i><span>Alerte sécurité active — l\'équipe DAXI a été prévenue.</span></div>';
    }
    if (d.is_paused) {
      html += '<div class="ts-banner ts-banner--pause"><i class="ri-pause-circle-line"></i><span>Course en pause' + (d.pause_price > 0 ? ' · supplément en cours' : '') + '</span></div>';
    }
    if (d.is_extended) {
      html += '<div class="ts-banner ts-banner--extend"><i class="ri-route-line"></i><span>Trajet prolongé' + (d.extra_km_price > 0 ? ' · +' + d.extra_km_price + ' $' : '') + '</span></div>';
    }
    if (d.is_round_trip && d.status === 'waiting_return') {
      var waitTxt = 'Arrivé à destination — attente avant le retour';
      if (d.round_trip_wait_remaining_seconds != null && d.round_trip_wait_minutes) {
        var rm = Math.max(1, Math.ceil(d.round_trip_wait_remaining_seconds / 60));
        waitTxt += ' (~' + rm + ' min restantes)';
      }
      html += '<div class="ts-banner ts-banner--rt-wait"><i class="ri-hourglass-line"></i><span>' + esc(waitTxt) + '</span></div>';
    } else if (d.is_round_trip && d.round_trip_phase === 'return') {
      html += '<div class="ts-banner ts-banner--rt-return"><i class="ri-arrow-go-back-line"></i><span>Retour en cours vers le point de départ</span></div>';
    }
    if (d.airport_sign || d.airport_landing) {
      html += '<div class="ts-banner ts-banner--airport"><i class="ri-flight-land-line"></i><span>';
      if (d.airport_sign) html += 'Panneau : <strong>' + esc(d.airport_sign) + '</strong>';
      if (d.airport_landing) html += (d.airport_sign ? ' · ' : '') + 'Atterrissage : ' + esc(d.airport_landing);
      html += '</span></div>';
    }
    if (d.status === 'completed') {
      html += '<div class="ts-banner ts-banner--done"><i class="ri-check-double-line"></i><span>Course terminée en toute sécurité.</span></div>';
    } else if (d.status === 'cancelled') {
      html += '<div class="ts-banner ts-banner--sos" style="border-color:#6b7280;background:rgba(107,114,128,.12);color:#d1d5db"><i class="ri-close-circle-line"></i><span>Cette course a été annulée.</span></div>';
    }
    root.innerHTML = html;
  };

  DaxiTripShare.prototype.updateEta = function (d) {
    var card = $('ts-eta-card');
    if (!card) return;
    var show = d.status && d.status !== 'completed' && d.status !== 'cancelled';
    card.style.display = show ? '' : 'none';
    if (!show) return;
    var txt = d.eta_driver_client_display || (d.eta_minutes ? d.eta_minutes + ' min' : '—');
    this.setText('ts-eta-val', txt);
    var dist = '';
    if (d.distance_driver_client != null) {
      dist = (d.distance_driver_client / 1000).toFixed(1) + ' km · chauffeur → client';
    }
    if (d.eta_total_display) dist += (dist ? ' · ' : '') + 'total ~' + d.eta_total_display;
    this.setText('ts-eta-sub', dist);
    var pill = $('ts-live-pill');
    if (pill) {
      pill.classList.toggle('off', d.status === 'completed' || d.status === 'cancelled');
    }
  };

  DaxiTripShare.prototype.tickCountdown = function () {
    var el = $('ts-countdown');
    if (!el || !this.state.is_later) return;
    var secs = this.state.time_until_scheduled;
    if (secs == null && this.state.scheduled_at) {
      secs = Math.floor((new Date(this.state.scheduled_at).getTime() - Date.now()) / 1000);
    }
    if (secs == null) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.textContent = this.state.is_later_active
      ? '⏱ Départ imminent — ' + formatCountdown(secs)
      : '📅 Course programmée — ' + formatCountdown(secs);
  };

  DaxiTripShare.prototype.applyPayload = function (d) {
    if (!d || d.error) return;
    var prevPhase = this.state.round_trip_phase;
    var prevStatus = this.state.status;
    Object.assign(this.state, d);
    this.renderStatic(this.state);
    if (d.driver_lat && d.driver_lng) this.updateDriverMarker(d.driver_lat, d.driver_lng);
    if (d.client_lat && d.client_lng) this.updateClientMarker(d.client_lat, d.client_lng);
    if (this.map && d.is_round_trip && (d.round_trip_phase !== prevPhase || d.status !== prevStatus)) {
      this._refreshRoundTripRoute(d);
    }
    if (d.status === 'completed' || d.status === 'cancelled') {
      this.setWsStatus(false, d.status === 'completed' ? 'Course terminée' : 'Course annulée');
    }
  };

  DaxiTripShare.prototype._refreshRoundTripRoute = function (d) {
    if (!this.map || !google || !google.maps) return;
    var pickup = { lat: parseFloat(d.pickup_lat), lng: parseFloat(d.pickup_lng) };
    var dest = d.dest_lat ? { lat: parseFloat(d.dest_lat), lng: parseFloat(d.dest_lng) } : null;
    if (!dest || !dest.lat) return;
    this.polylines.forEach(function (p) { if (p && p.setMap) p.setMap(null); });
    this.polylines = [];
    if (d.round_trip_phase === 'return' || d.round_trip_nav_target === 'pickup') {
      this._drawRoute(dest, pickup);
    } else {
      this._drawRoute(pickup, dest);
    }
  };

  DaxiTripShare.prototype.poll = function (force) {
    var self = this;
    var now = Date.now();
    if (!force && now - this._lastPoll < 8000) return;
    this._lastPoll = now;
    fetch('/api/track/' + this.token + '/')
      .then(function (r) { return r.json(); })
      .then(function (d) { self.applyPayload(d); })
      .catch(function () {});
  };

  DaxiTripShare.prototype.setWsStatus = function (on, label) {
    var el = $('ts-ws');
    if (!el) return;
    el.className = 'ts-ws' + (on ? '' : ' off');
    el.innerHTML = '<i class="ri-record-circle-fill"></i> ' + esc(label || (on ? 'Temps réel actif' : 'Mise à jour périodique'));
  };

  DaxiTripShare.prototype.onWsMessage = function (ev) {
    var self = this;
    try {
      var msg = JSON.parse(ev.data);
      var type = msg.event || msg.type;
      var data = msg.data || msg;
      if (type === 'driver_location') {
        var lat = data.latitude != null ? data.latitude : data.driver_lat || data.lat;
        var lng = data.longitude != null ? data.longitude : data.driver_lng || data.lng;
        if (lat != null && lng != null) {
          this.updateDriverMarker(lat, lng);
          this.state.driver_lat = lat;
          this.state.driver_lng = lng;
        }
        return;
      }
      if (REFRESH_EVENTS.indexOf(type) >= 0) {
        this.poll(true);
        return;
      }
      if (type === 'snapshot' || data.status) this.applyPayload(data);
    } catch (e) {}
  };

  DaxiTripShare.prototype.connectWs = function () {
    var self = this;
    var proto = location.protocol === 'https:' ? 'wss' : 'ws';
    try {
      this.ws = new WebSocket(proto + '://' + location.host + '/ws/track/' + this.token + '/');
      this.ws.onopen = function () { self.setWsStatus(true); };
      this.ws.onclose = function () { self.setWsStatus(false); setTimeout(function () { self.connectWs(); }, 4000); };
      this.ws.onerror = function () { self.setWsStatus(false); };
      this.ws.onmessage = function (e) { self.onWsMessage(e); };
    } catch (e) {
      this.setWsStatus(false);
    }
  };

  DaxiTripShare.prototype.loadMaps = function (cb) {
    if (global.google && global.google.maps) { cb(); return; }
    var s = document.createElement('script');
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(this.googleKey) + '&libraries=geometry&v=weekly';
    s.onload = cb;
    s.onerror = function () {
      var m = $('ts-map');
      if (m) m.innerHTML = '<p style="padding:20px;text-align:center;color:#94a3b8">Carte indisponible</p>';
    };
    document.head.appendChild(s);
  };

  DaxiTripShare.prototype.initMap = function () {
    var d = this.state;
    var pickup = { lat: parseFloat(d.pickup_lat) || 18.533, lng: parseFloat(d.pickup_lng) || -72.333 };
    var dest = d.dest_lat ? { lat: parseFloat(d.dest_lat), lng: parseFloat(d.dest_lng) } : null;
    var styles = [
      { elementType: 'geometry', stylers: [{ color: '#0d1117' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#8b9cb3' }] },
      { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
    ];
    this.map = new google.maps.Map($('ts-map'), {
      center: pickup, zoom: 14, disableDefaultUI: true, zoomControl: true,
      styles: styles, gestureHandling: 'greedy',
    });
    this.directionsSvc = new google.maps.DirectionsService();
    this.markers.pickup = this._pin(pickup, '#10b981', 'Départ');
    if (dest && dest.lat) {
      this.markers.dest = this._pin(dest, '#ef4444', 'Destination');
      this._drawRoute(pickup, dest);
      var bounds = new google.maps.LatLngBounds();
      bounds.extend(pickup); bounds.extend(dest);
      this.map.fitBounds(bounds, 56);
    }
    if (d.plan_stops && d.plan_stops.length) {
      var self = this;
      d.plan_stops.forEach(function (s, i) {
        if (s.lat && s.lng) self.markers['stop' + i] = self._pin({ lat: s.lat, lng: s.lng }, '#f59e0b', s.label || ('Étape ' + (i + 1)));
      });
    }
    if (d.driver_lat && d.driver_lng) this.updateDriverMarker(d.driver_lat, d.driver_lng);
    if (d.client_lat && d.client_lng) this.updateClientMarker(d.client_lat, d.client_lng);
  };

  DaxiTripShare.prototype._pin = function (pos, color, title) {
    return new google.maps.Marker({
      map: this.map, position: pos, title: title || '',
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
    });
  };

  DaxiTripShare.prototype._drawRoute = function (origin, destination) {
    var self = this;
    if (!this.directionsSvc) return;
    function paint(path) {
      if (!path || path.length < 2) return;
      self.polylines.forEach(function (p) { p.setMap(null); });
      self.polylines = [
        new google.maps.Polyline({ path: path, map: self.map, strokeColor: '#f59e0b', strokeOpacity: 0.35, strokeWeight: 10, zIndex: 1 }),
        new google.maps.Polyline({ path: path, map: self.map, strokeColor: '#fbbf24', strokeOpacity: 0.95, strokeWeight: 4, zIndex: 2 }),
      ];
    }
    if (global.DaxiRoutes && typeof global.DaxiRoutes.computeRoute === 'function') {
      global.DaxiRoutes.computeRoute(origin, destination).then(function (route) {
        if (route && route.path) paint(route.path);
      });
      return;
    }
    this.directionsSvc.route({
      origin: origin, destination: destination, travelMode: google.maps.TravelMode.DRIVING,
    }, function (result, status) {
      if (status !== 'OK' || !result.routes.length) return;
      paint(result.routes[0].overview_path);
    });
  };

  DaxiTripShare.prototype.updateDriverMarker = function (lat, lng) {
    if (!this.map) return;
    if (!this._drvPos) this._drvPos = { lat: lat, lng: lng };
    this._drvTarget = { lat: lat, lng: lng };
    if (!this.markers.driver) {
      var icon = (global.DaxiMapMarkers && DaxiMapMarkers.driverGoogleIcon)
        ? DaxiMapMarkers.driverGoogleIcon({ color: '#f59e0b', size: 34 })
        : { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#f59e0b', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2.5 };
      this.markers.driver = new google.maps.Marker({ map: this.map, position: this._drvPos, title: 'Chauffeur', icon: icon, zIndex: 99 });
      var self = this;
      if (!this._animFrame) {
        function anim() {
          if (self._drvPos && self._drvTarget) {
            self._drvPos.lat = lerp(self._drvPos.lat, self._drvTarget.lat, 0.14);
            self._drvPos.lng = lerp(self._drvPos.lng, self._drvTarget.lng, 0.14);
            self.markers.driver.setPosition(self._drvPos);
          }
          self._animFrame = requestAnimationFrame(anim);
        }
        anim();
      }
    }
    if (this.state.status !== 'completed') this.map.panTo(this._drvTarget);
  };

  DaxiTripShare.prototype.updateClientMarker = function (lat, lng) {
    if (!this.map) return;
    var pos = { lat: lat, lng: lng };
    if (!this.markers.client) {
      this.markers.client = this._pin(pos, '#6366f1', 'Client');
    } else {
      this.markers.client.setPosition(pos);
    }
  };

  DaxiTripShare.prototype.bindActions = function () {
    var self = this;
    var shareBtn = $('ts-btn-share');
    if (shareBtn) shareBtn.addEventListener('click', function () {
      var url = location.href;
      if (navigator.share) navigator.share({ title: 'Suivi DAXI', url: url }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { alert('Lien copié'); });
      else prompt('Copiez le lien :', url);
    });
    var gpsBtn = $('ts-btn-gps');
    if (gpsBtn) gpsBtn.addEventListener('click', function () {
      var d = self.state;
      if (global.DaxiExternalNav && DaxiExternalNav.open) {
        DaxiExternalNav.open('google', d.pickup_lat, d.pickup_lng, d.dest_lat, d.dest_lng, d.destination, { status: d.status });
      }
    });
  };

  global.DaxiTripShare = DaxiTripShare;

  document.addEventListener('DOMContentLoaded', function () {
    var cfg = global.__DAXI_TRACK__;
    if (!cfg || !cfg.token) return;
    var app = new DaxiTripShare(cfg);
    app.boot();
    global.__daxiTrackApp = app;
  });
})(typeof window !== 'undefined' ? window : this);