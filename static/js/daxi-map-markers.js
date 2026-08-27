
(function (global) {
  'use strict';

  var DEFAULT_COLOR = '#f59e0b';
  var TAXI_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">' +
    '<circle cx="16" cy="16" r="15" fill="#fff" stroke="#1e293b" stroke-width="1.5"/>' +
    '<rect x="5" y="14" width="22" height="9" rx="2" fill="#f59e0b" stroke="#1e293b" stroke-width="1.2"/>' +
    '<rect x="11" y="10" width="10" height="5" rx="1.2" fill="#fbbf24" stroke="#1e293b" stroke-width="1"/>' +
    '<text x="16" y="14.5" text-anchor="middle" font-size="4.5" font-weight="800" fill="#1e293b" font-family="Arial,sans-serif">TAXI</text>' +
    '<circle cx="9" cy="23.5" r="2.8" fill="#334155"/><circle cx="23" cy="23.5" r="2.8" fill="#334155"/>' +
    '<rect x="7" y="16" width="5" height="4" rx="0.8" fill="#e0f2fe" stroke="#1e293b" stroke-width="0.6"/>' +
    '<rect x="20" y="16" width="5" height="4" rx="0.8" fill="#e0f2fe" stroke="#1e293b" stroke-width="0.6"/>' +
    '</svg>';

  var _avatarIconCache = {};

  function taxiSvgDataUri() {
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(TAXI_SVG);
  }

  function driverGoogleIcon(options) {
    options = options || {};
    var size = options.size || 32;
    var g = global.google;
    if (!g || !g.maps) return null;
    return {
      url: taxiSvgDataUri(),
      scaledSize: new g.maps.Size(size, size),
      anchor: new g.maps.Point(size / 2, size / 2),
    };
  }

  function driverOverlayElement(options) {
    options = options || {};
    var size = options.size || 32;
    var el = document.createElement('div');
    el.className = 'daxi-driver-marker daxi-driver-marker--taxi';
    el.style.cssText = [
      'width:' + size + 'px',
      'height:' + size + 'px',
      'transform-origin:center center',
      'pointer-events:none',
      'filter:drop-shadow(0 2px 4px rgba(0,0,0,.35))',
      'border-radius:50%',
      'overflow:hidden',
      'border:2px solid #fff',
      'background:#f59e0b',
    ].join(';');
    el.innerHTML = TAXI_SVG.replace('width="32" height="32"', 'width="100%" height="100%"');
    return el;
  }

  function driverMapboxElement(options) {
    return driverOverlayElement(options);
  }

  function initialsSvgIcon(options) {
    var color = options.color || '#10b981';
    var initials = String(options.initials || '?').slice(0, 2).toUpperCase();
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" width="44" height="44">' +
      '<circle cx="22" cy="22" r="20" fill="' + color + '" stroke="#fff" stroke-width="3"/>' +
      '<text x="22" y="27" text-anchor="middle" font-size="14" font-weight="800" fill="#fff" font-family="Arial,sans-serif">' +
      initials + '</text></svg>';
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }

  function canvasAvatarDataUrl(img, size, color, initials) {
    var canvas = document.createElement('canvas');
    var drawSize = Math.max(64, Math.round(size * 2));
    canvas.width = drawSize;
    canvas.height = drawSize;
    var ctx = canvas.getContext('2d');
    var r = drawSize / 2;
    var border = Math.max(2, drawSize * 0.08);
    var innerR = r - border;
    ctx.beginPath();
    ctx.arc(r, r, innerR, 0, Math.PI * 2);
    ctx.fillStyle = color || '#10b981';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = border;
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.arc(r, r, innerR - border * 0.35, 0, Math.PI * 2);
    ctx.clip();
    if (img) {
      ctx.drawImage(img, 0, 0, drawSize, drawSize);
    } else {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold ' + Math.round(drawSize * 0.36) + 'px Arial,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initials, r, r + 1);
    }
    ctx.restore();
    return canvas.toDataURL('image/png');
  }

  function googleIconFromUrl(url, size) {
    var g = global.google;
    if (!g || !g.maps) return null;
    return {
      url: url,
      scaledSize: new g.maps.Size(size, size),
      anchor: new g.maps.Point(size / 2, size / 2),
    };
  }

  function driverAvatarGoogleIcon(options) {
    options = options || {};
    var g = global.google;
    var size = options.size || 44;
    if (!g || !g.maps) return driverGoogleIcon(options);
    var url = initialsSvgIcon(options);
    return googleIconFromUrl(url, size);
  }

  function normalizePhotoUrl(photo) {
    if (!photo) return '';
    photo = String(photo).trim();
    if (!photo) return '';
    if (photo.indexOf('data:') === 0) {
      return photo.length >= 200 ? photo : '';
    }
    if (photo.indexOf('/9j/') === 0) {
      photo = 'data:image/jpeg;base64,' + photo;
    } else if (photo.charAt(0) === '/' && photo.indexOf('/9j/') > 0) {
      photo = 'data:image/jpeg;base64,' + photo.slice(1);
    }
    if (photo.indexOf('data:') === 0) {
      return photo.length >= 200 ? photo : '';
    }
    if (photo.indexOf('http://') === 0 || photo.indexOf('https://') === 0 || photo.charAt(0) === '/') {
      return photo;
    }
    return '';
  }

  function isMarkerIconUrlSafe(url) {
    if (!url) return false;
    if (url.indexOf('data:') === 0 && url.length > 12000) return false;
    return true;
  }

  function loadDriverAvatarIcon(options, callback) {
    options = options || {};
    callback = callback || function () {};
    var g = global.google;
    var size = options.size || 44;
    var photo = normalizePhotoUrl(options.photoUrl);
    var cacheKey = photo + '|' + size + '|' + (options.color || '');
    if (_avatarIconCache[cacheKey]) {
      callback(_avatarIconCache[cacheKey]);
      return;
    }
    if (!photo) {
      var emptyFb = driverAvatarGoogleIcon(options);
      _avatarIconCache[cacheKey] = emptyFb;
      callback(emptyFb);
      return;
    }
    var img = new Image();
    if (photo.indexOf('http') === 0 && photo.indexOf(global.location.origin) < 0) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = function () {
      try {
        var dataUrl = canvasAvatarDataUrl(img, size, options.color, options.initials);
        if (!isMarkerIconUrlSafe(dataUrl)) {
          var tooLarge = driverAvatarGoogleIcon(options);
          _avatarIconCache[cacheKey] = tooLarge;
          callback(tooLarge);
          return;
        }
        var icon = googleIconFromUrl(dataUrl, size);
        _avatarIconCache[cacheKey] = icon;
        callback(icon);
      } catch (e) {
        var fb = driverAvatarGoogleIcon(options);
        _avatarIconCache[cacheKey] = fb;
        callback(fb);
      }
    };
    img.onerror = function () {
      var fb = driverAvatarGoogleIcon(options);
      _avatarIconCache[cacheKey] = fb;
      callback(fb);
    };
    img.src = photo;
  }

  global.DaxiMapMarkers = {
    driverGoogleIcon: driverGoogleIcon,
    driverAvatarGoogleIcon: driverAvatarGoogleIcon,
    loadDriverAvatarIcon: loadDriverAvatarIcon,
    driverOverlayElement: driverOverlayElement,
    driverMapboxElement: driverMapboxElement,
    taxiDriverGoogleIcon: driverGoogleIcon,
    taxiDriverOverlayElement: driverOverlayElement,
    taxiDriverMapboxElement: driverMapboxElement,
  };
})(typeof window !== 'undefined' ? window : this);
