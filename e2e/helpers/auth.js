/**
 * Soft auth/credential helpers for Phase 5 client specs.
 * Prefer fixtures / storageState from Phase 4 when available.
 * Never skip to hide missing credentials — fail with a clear message.
 *
 * Demo fallback (manage.py create_demo_accounts):
 *   demo.client@daxi.ht / DemoDaxi2026!
 *   admin@daxi.com / DemoDaxi2026!
 */

const DEMO_CLIENT_USER = 'demo.client@daxi.ht';
const DEMO_CLIENT_PASS = 'DemoDaxi2026!';

const DEMO_DRIVER_USER = 'demo.driver@daxi.ht';
const DEMO_DRIVER_PASS = 'DemoDaxi2026!';


const DEMO_ADMIN_USER = 'admin@daxi.com';
const DEMO_ADMIN_PASS = 'DemoDaxi2026!';

const DEMO_ENTERPRISE_USER = 'demo.entreprise@daxi.ht';
const DEMO_ENTERPRISE_PASS = 'DemoDaxi2026!';

/**
 * Resolve enterprise credentials: env wins; else demo seed from create_demo_accounts.
 * @param {import('@playwright/test').TestInfo} [testInfo]
 * @returns {{ email: string, pass: string, source: 'env'|'demo' }}
 */
function resolveEnterpriseCredentials(testInfo) {
  let email = (process.env.DAXI_E2E_ENTERPRISE_USER || process.env.DAXI_ENTERPRISE_EMAIL || '').trim();
  let pass = (process.env.DAXI_E2E_ENTERPRISE_PASS || process.env.DAXI_ENTERPRISE_PASSWORD || '').trim();

  if (email && pass) {
    process.env.DAXI_ENTERPRISE_EMAIL = email;
    process.env.DAXI_ENTERPRISE_PASSWORD = pass;
    process.env.DAXI_E2E_ENTERPRISE_USER = email;
    process.env.DAXI_E2E_ENTERPRISE_PASS = pass;
    return { email, pass, source: 'env' };
  }

  process.env.DAXI_ENTERPRISE_EMAIL = DEMO_ENTERPRISE_USER;
  process.env.DAXI_ENTERPRISE_PASSWORD = DEMO_ENTERPRISE_PASS;
  process.env.DAXI_E2E_ENTERPRISE_USER = DEMO_ENTERPRISE_USER;
  process.env.DAXI_E2E_ENTERPRISE_PASS = DEMO_ENTERPRISE_PASS;
  if (testInfo) {
    testInfo.annotations.push({
      type: 'prerequisite',
      description:
        `Using demo enterprise credentials (${DEMO_ENTERPRISE_USER}) from create_demo_accounts. ` +
        `Override with DAXI_ENTERPRISE_EMAIL / DAXI_ENTERPRISE_PASSWORD when needed.`,
    });
  }
  return { email: DEMO_ENTERPRISE_USER, pass: DEMO_ENTERPRISE_PASS, source: 'demo' };
}



/**
 * Resolve admin credentials: env wins; else demo seed from create_demo_accounts.
 * @param {import('@playwright/test').TestInfo} [testInfo]
 * @returns {{ email: string, pass: string, source: 'env'|'demo' }}
 */
function resolveAdminCredentials(testInfo) {
  let email = (process.env.DAXI_E2E_ADMIN_USER || process.env.DAXI_ADMIN_USER || '').trim();
  let pass = (process.env.DAXI_E2E_ADMIN_PASS || process.env.DAXI_ADMIN_PASSWORD || '').trim();

  if (email && pass) {
    process.env.DAXI_ADMIN_USER = email;
    process.env.DAXI_ADMIN_PASSWORD = pass;
    process.env.DAXI_E2E_ADMIN_USER = email;
    process.env.DAXI_E2E_ADMIN_PASS = pass;
    return { email, pass, source: 'env' };
  }

  process.env.DAXI_ADMIN_USER = DEMO_ADMIN_USER;
  process.env.DAXI_ADMIN_PASSWORD = DEMO_ADMIN_PASS;
  process.env.DAXI_E2E_ADMIN_USER = DEMO_ADMIN_USER;
  process.env.DAXI_E2E_ADMIN_PASS = DEMO_ADMIN_PASS;
  if (testInfo) {
    testInfo.annotations.push({
      type: 'prerequisite',
      description:
        `Using demo admin credentials (${DEMO_ADMIN_USER}) from create_demo_accounts. ` +
        `Override with DAXI_ADMIN_USER / DAXI_ADMIN_PASSWORD when needed.`,
    });
  }
  return { email: DEMO_ADMIN_USER, pass: DEMO_ADMIN_PASS, source: 'demo' };
}


/**
 * @param {import('@playwright/test').TestInfo} testInfo
 * @param {string[]} requiredEnvKeys
 */
function requireEnvOrFail(testInfo, requiredEnvKeys) {
  const missing = requiredEnvKeys.filter(
    (k) => !process.env[k] || String(process.env[k]).trim() === '',
  );
  if (missing.length) {
    const msg =
      `Missing E2E credentials/fixtures: ${missing.join(', ')}. ` +
      `Set them in the environment (or Phase 4 storageState) before running this test. ` +
      `Do not use test.skip to hide this — fix the fixture.`;
    testInfo.annotations.push({ type: 'prerequisite', description: msg });
    throw new Error(msg);
  }
}

/**
 * Resolve registered-client credentials: env wins; else demo seed from create_demo_accounts.
 * Ensures DAXI_E2E_CLIENT_USER / DAXI_E2E_CLIENT_PASS are populated for downstream asserts.
 * @param {import('@playwright/test').TestInfo} [testInfo]
 * @returns {{ user: string, pass: string, source: 'env'|'demo' }}
 */
function resolveClientCredentials(testInfo) {
  let user = (process.env.DAXI_E2E_CLIENT_USER || '').trim();
  let pass = (process.env.DAXI_E2E_CLIENT_PASS || '').trim();
  // Also accept older .env.e2e.example names
  if (!user) user = (process.env.DAXI_CLIENT_EMAIL || '').trim();
  if (!pass) pass = (process.env.DAXI_CLIENT_PASSWORD || '').trim();

  if (user && pass) {
    process.env.DAXI_E2E_CLIENT_USER = user;
    process.env.DAXI_E2E_CLIENT_PASS = pass;
    return { user, pass, source: 'env' };
  }

  // Seed fallback — create_demo_accounts / known local demo
  process.env.DAXI_E2E_CLIENT_USER = DEMO_CLIENT_USER;
  process.env.DAXI_E2E_CLIENT_PASS = DEMO_CLIENT_PASS;
  if (testInfo) {
    testInfo.annotations.push({
      type: 'prerequisite',
      description:
        `Using demo client credentials (${DEMO_CLIENT_USER}) from create_demo_accounts. ` +
        `Override with DAXI_E2E_CLIENT_USER / DAXI_E2E_CLIENT_PASS when needed.`,
    });
  }
  return { user: DEMO_CLIENT_USER, pass: DEMO_CLIENT_PASS, source: 'demo' };
}

/**
 * Resolve driver credentials: env wins; else demo seed from create_demo_accounts.
 * @param {import('@playwright/test').TestInfo} [testInfo]
 * @returns {{ email: string, pass: string, source: 'env'|'demo' }}
 */
function resolveDriverCredentials(testInfo) {
  let email = (process.env.DAXI_E2E_DRIVER_USER || process.env.DAXI_DRIVER_EMAIL || '').trim();
  let pass = (process.env.DAXI_E2E_DRIVER_PASS || process.env.DAXI_DRIVER_PASSWORD || '').trim();

  if (email && pass) {
    process.env.DAXI_DRIVER_EMAIL = email;
    process.env.DAXI_DRIVER_PASSWORD = pass;
    process.env.DAXI_E2E_DRIVER_USER = email;
    process.env.DAXI_E2E_DRIVER_PASS = pass;
    return { email, pass, source: 'env' };
  }

  process.env.DAXI_DRIVER_EMAIL = DEMO_DRIVER_USER;
  process.env.DAXI_DRIVER_PASSWORD = DEMO_DRIVER_PASS;
  process.env.DAXI_E2E_DRIVER_USER = DEMO_DRIVER_USER;
  process.env.DAXI_E2E_DRIVER_PASS = DEMO_DRIVER_PASS;
  if (testInfo) {
    testInfo.annotations.push({
      type: 'prerequisite',
      description:
        `Using demo driver credentials (${DEMO_DRIVER_USER}) from create_demo_accounts. ` +
        `Override with DAXI_DRIVER_EMAIL / DAXI_DRIVER_PASSWORD when needed.`,
    });
  }
  return { email: DEMO_DRIVER_USER, pass: DEMO_DRIVER_PASS, source: 'demo' };
}

/**
 * Annotate prerequisites without skipping.
 * @param {import('@playwright/test').TestInfo} testInfo
 * @param {string} description
 */
function annotatePrerequisite(testInfo, description) {
  testInfo.annotations.push({ type: 'prerequisite', description });
}

/**
 * Base URL for DAXI client SPA (vubez2).
 */
function baseUrl() {
  return process.env.DAXI_BASE_URL || 'http://127.0.0.1:8000';
}

/**
 * True when destructive live mutations against a shared env are intentional.
 */
function isLiveDestructiveAllowed() {
  return process.env.DAXI_E2E_LIVE === '1';
}

module.exports = {
  requireEnvOrFail,
  resolveClientCredentials,
  resolveDriverCredentials,
  resolveAdminCredentials,
  resolveEnterpriseCredentials,
  annotatePrerequisite,
  baseUrl,
  isLiveDestructiveAllowed,
  DEMO_CLIENT_USER,
  DEMO_CLIENT_PASS,
  DEMO_DRIVER_USER,
  DEMO_DRIVER_PASS,
  DEMO_ADMIN_USER,
  DEMO_ADMIN_PASS,
  DEMO_ENTERPRISE_USER,
  DEMO_ENTERPRISE_PASS,
};
