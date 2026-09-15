/**
 * Re-export auth helpers + trip-state seed entrypoints.
 */
const auth = require('./auth');
const path = require('path');

const SEED_TRIP_STATES_PY = path.join(__dirname, 'seed_trip_states.py');

module.exports = {
  ...auth,
  SEED_TRIP_STATES_PY,
  /** Prefer requiring helpers/seedApi.js from specs — this is the Python path only. */
};
