/**
 * Geolocation mock helper stub for later booking / GPS tests.
 * Usage (future): await mockGeolocation(page, { latitude: 19.75, longitude: -72.2 });
 */
async function mockGeolocation(page, { latitude, longitude, accuracy = 25 } = {}) {
  if (latitude == null || longitude == null) {
    throw new Error('mockGeolocation requires latitude and longitude');
  }
  const context = page.context();
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude, longitude, accuracy });
  // Optional: override browser geolocation API for pages that cache early
  await page.addInitScript(
    ({ latitude: lat, longitude: lng, accuracy: acc }) => {
      const coords = {
        latitude: lat,
        longitude: lng,
        accuracy: acc,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      };
      const position = { coords, timestamp: Date.now() };
      navigator.geolocation.getCurrentPosition = (success) => success(position);
      navigator.geolocation.watchPosition = (success) => {
        success(position);
        return 1;
      };
    },
    { latitude, longitude, accuracy }
  );
}

/** Cap-Haïtien approximate center — convenient default for DAXI Haiti tests. */
const CAP_HAITIEN = { latitude: 19.759, longitude: -72.201, accuracy: 30 };

module.exports = { mockGeolocation, CAP_HAITIEN };
