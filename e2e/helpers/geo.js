/**
 * Geolocation mocks for DAXI client E2E (Phase 5–6).
 *
 * Product gate (vubez2.html): navigator.geolocation is wrapped; calls deny unless
 * window._daxiGpsUserConsent || window._daxiGpsPerm. Init script locks those true.
 */

const PAP = {
  latitude: 18.5944,
  longitude: -72.3074,
};

const PETION_VILLE = {
  latitude: 18.5125,
  longitude: -72.285,
};

/** Cap-Haïtien / Nord (CoveredDepartment active seed) — Phase 5/8 */
const CAP_HAITIEN = {
  latitude: 19.7596,
  longitude: -72.2042,
};

const LABADEE = {
  latitude: 19.7870,
  longitude: -72.2450,
};

const CAP_AIRPORT = {
  latitude: 19.7330,
  longitude: -72.1947,
};

/**
 * Install fixed navigator.geolocation + force DAXI GPS consent before page scripts.
 * @param {{ latitude?: number, longitude?: number, accuracy?: number, fail?: boolean, failCode?: number }} options
 */
function installGeolocationMock(options = {}) {
  const lat = options.latitude ?? 18.5944;
  const lng = options.longitude ?? -72.3074;
  const accuracy = options.accuracy ?? 15;
  const fail = !!options.fail;
  const failCode = options.failCode ?? 2;

  // Survive page boot that sets _daxiGpsUserConsent = false
  try {
    Object.defineProperty(window, '_daxiGpsUserConsent', {
      configurable: true,
      enumerable: true,
      get() {
        return true;
      },
      set() {
        /* ignore product overwrite */
      },
    });
    Object.defineProperty(window, '_daxiGpsPerm', {
      configurable: true,
      enumerable: true,
      get() {
        return true;
      },
      set() {
        /* ignore */
      },
    });
    Object.defineProperty(window, '_daxiGeoBrowserBlocked', {
      configurable: true,
      enumerable: true,
      get() {
        return false;
      },
      set() {
        /* ignore blocked marks during e2e */
      },
    });
  } catch (_) {
    window._daxiGpsUserConsent = true;
    window._daxiGpsPerm = true;
    window._daxiGeoBrowserBlocked = false;
  }
  try {
    sessionStorage.removeItem('daxi_geo_blocked');
  } catch (_) {}

  const position = {
    coords: {
      latitude: lat,
      longitude: lng,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  };

  function getCurrentPosition(success, error) {
    if (fail) {
      if (typeof error === 'function') {
        error({
          code: failCode,
          message: 'Mocked geolocation failure',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        });
      }
      return;
    }
    if (typeof success === 'function') success(position);
  }

  function watchPosition(success, error) {
    getCurrentPosition(success, error);
    return 1;
  }

  const geo = {
    getCurrentPosition,
    watchPosition,
    clearWatch() {},
    _daxiGated: false,
  };

  try {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      enumerable: true,
      get() {
        return geo;
      },
    });
  } catch (_) {}

  try {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition = getCurrentPosition;
      navigator.geolocation.watchPosition = watchPosition;
      navigator.geolocation.clearWatch = function () {};
    }
  } catch (_) {}

  // Re-apply after product gate wraps geolocation (head script)
  const reapply = () => {
    try {
      sessionStorage.removeItem('daxi_geo_blocked');
    } catch (_) {}
    try {
      if (navigator.geolocation && navigator.geolocation._daxiGated) {
        // Gate already wraps; our consent locks make _daxiGeoAllowed() true → raw mock runs
        return;
      }
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition = getCurrentPosition;
        navigator.geolocation.watchPosition = watchPosition;
      }
    } catch (_) {}
  };
  document.addEventListener('DOMContentLoaded', reapply);
  setTimeout(reapply, 0);
  setTimeout(reapply, 50);

  window.__daxiE2EGeo = { lat, lng, accuracy, fail, failCode };
}

function readMockedCoordsScript() {
  return () =>
    new Promise((resolve, reject) => {
      try {
        navigator.geolocation.getCurrentPosition(
          (p) =>
            resolve({
              lat: p.coords.latitude,
              lng: p.coords.longitude,
              acc: p.coords.accuracy,
            }),
          (e) =>
            reject(
              new Error(
                (e && e.message) ||
                  `geolocation error code ${e && e.code != null ? e.code : '?'}`,
              ),
            ),
          { timeout: 5000, maximumAge: 0, enableHighAccuracy: false },
        );
      } catch (err) {
        reject(new Error(err && err.message ? err.message : String(err)));
      }
    });
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

module.exports = {
  PAP,
  PETION_VILLE,
  CAP_HAITIEN,
  LABADEE,
  CAP_AIRPORT,
  installGeolocationMock,
  readMockedCoordsScript,
  haversineMeters,
  RELOCATE_DRIFT_METERS: 200,
  RELOCATE_MAX_ACCURACY_M: 80,
};
