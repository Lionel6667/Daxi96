/** Shared Playwright helpers for DAXI e2e. */
const PAGEERROR_ALLOWLIST = [
  /Failed to load resource/i,
  /net::ERR_/i,
  /Google Maps/i,
  /Mapbox|mapbox/i,
  /firebase/i,
  /ResizeObserver loop/i,
  /Script error\.?/i,
  /Loading chunk/i,
];

function isAllowedPageError(message) {
  return PAGEERROR_ALLOWLIST.some((re) => re.test(String(message || '')));
}

module.exports = { PAGEERROR_ALLOWLIST, isAllowedPageError };
