/** Page object stubs — fill in as flows grow. Minimal for Phase 4. */

class ClientHomePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
  }
  async goto() {
    await this.page.goto('/');
  }
  body() {
    return this.page.locator('body');
  }
}

class DriverLoginPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
  }
  async goto() {
    await this.page.goto('/driver/login/');
  }
}

class AdminDashboardPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
  }
  async goto() {
    await this.page.goto('/admin-dashboard/');
  }
}

class EnterpriseLoginPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
  }
  async goto() {
    await this.page.goto('/entreprise/');
  }
}

module.exports = {
  ClientHomePage,
  DriverLoginPage,
  AdminDashboardPage,
  EnterpriseLoginPage,
};
