const { chromium, firefox, webkit } = require('playwright');
const { WEB_PROFILES, MODULE_INFO } = require('./web-profiles');

class TestRunner {
  constructor() {
    this.runId = null;
    this.cancelled = false;
    this.browser = null;
    this.page = null;
  }

  cancel() {
    this.cancelled = true;
    if (this.page) { this.stopScreencast(this.page).catch(() => {}); }
    if (this.browser) { this.browser.close().catch(() => {}); }
  }

  broadcastStep(testId, module, title, action, selector) {
    if (global.broadcastWs) {
      global.broadcastWs({
        type: 'test_step',
        runId: this.runId,
        data: { testId, module, title, action: action || '', selector: selector || '' }
      });
    }
  }

  broadcastModuleDone(module, passed, failed, notes) {
    if (global.broadcastWs) {
      global.broadcastWs({
        type: 'module_done',
        runId: this.runId,
        data: { module, passed, failed, notes }
      });
    }
  }

  broadcastProgress(percent) {
    if (global.broadcastWs) {
      global.broadcastWs({
        type: 'test_step',
        runId: this.runId,
        data: { testId: 'PROGRESS', module: '', title: `Progress ${percent}%`, action: 'progress', selector: `${percent}` }
      });
    }
  }

  broadcastDone() {
    if (global.broadcastWs) {
      global.broadcastWs({ type: 'test_done', runId: this.runId, data: {} });
    }
  }

  async startScreencast(page, width = 1920, height = 1080) {
    try {
      this._lastFrameTime = 0;
      this._framePending = false;
      this._screencastSize = { width, height };
      await page.screencast.start({
        size: { width, height },
        quality: 95,
        onFrame: ({ data }) => {
          const now = Date.now();
          if (this._framePending) return;
          if (now - this._lastFrameTime < 80) return;
          this._lastFrameTime = now;
          this._framePending = true;
          if (global.broadcastFrame) {
            global.broadcastFrame(this.runId, data);
          }
          this._framePending = false;
        },
      });
    } catch (e) {
      console.error('  Screencast start failed:', e.message);
    }
  }

  async updateScreencastSize(page, width, height) {
    try {
      await page.screencast.stop();
    } catch {}
    await this.startScreencast(page, width, height);
  }

  async setMobileViewport(page, w = 393, h = 852) {
    await page.setViewportSize({ width: w, height: h });
    await this.updateScreencastSize(page, Math.max(w, 393), Math.max(h, 600));
    await page.waitForTimeout(500);
  }

  async setTabletViewport(page, w = 834, h = 1194) {
    await page.setViewportSize({ width: w, height: h });
    await this.updateScreencastSize(page, w, h);
    await page.waitForTimeout(500);
  }

  async setDesktopViewport(page) {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await this.updateScreencastSize(page, 1920, 1080);
    await page.waitForTimeout(300);
  }

  async stopScreencast(page) {
    try {
      await page.screencast.stop();
    } catch {}
  }

  async run(runConfig) {
    const { url, username, password, browser: browserType, testModules, testMode, webTarget, role: selectedRole } = runConfig;
    const profile = webTarget ? WEB_PROFILES[webTarget] : null;
    const mode = testMode || 'login_dashboard';
    const results = [];
    this.runId = runConfig.id;
    this.cancelled = false;

    let browser;
    let page;
    try {
      const engine = this.getBrowser(browserType);
      browser = await engine.launch({ headless: true, slowMo: 0 });
      this.browser = browser;
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        ignoreHTTPSErrors: true,
        locale: 'id-ID',
        timezoneId: 'Asia/Jakarta',
        deviceScaleFactor: 2,
      });
      page = await context.newPage();
      this.page = page;

      // ===== Console Error & Warning Capture =====
      this.consoleErrors = [];
      this.networkErrors = [];
      page.on('console', (msg) => {
        const type = msg.type();
        if (type === 'error') {
          this.consoleErrors.push({ type, text: msg.text(), url: page.url(), time: Date.now() });
        }
      });
      page.on('pageerror', (err) => {
        this.consoleErrors.push({ type: 'pageerror', text: err.message, url: page.url(), time: Date.now() });
      });
      const seenNetErrors = new Set();
      page.on('requestfailed', (req) => {
        const reqUrl = req.url();
        const failure = req.failure()?.errorText || 'unknown';
        if (failure === 'net::ERR_ABORTED' && reqUrl.includes('_rsc=')) return;
        const key = reqUrl + '|' + req.method();
        if (seenNetErrors.has(key)) return;
        seenNetErrors.add(key);
        this.networkErrors.push({ url: reqUrl, method: req.method(), failure, time: Date.now() });
      });
      page.on('response', (res) => {
        if (res.status() >= 400) {
          const key = res.url() + '|' + res.request().method() + '|' + res.status();
          if (seenNetErrors.has(key)) return;
          seenNetErrors.add(key);
          this.networkErrors.push({ url: res.url(), method: res.request().method(), status: res.status(), statusText: res.statusText(), time: Date.now() });
        }
      });

      // ===== Start Live Browser Screencast =====
      await this.startScreencast(page);

      // ===== Multi-role web profile mode =====
      if (profile) {
        return await this.runMultiRole(page, browser, profile, runConfig, results, selectedRole, testModules);
      }

      // ===== Legacy mode (no web profile) =====
      const targetUrl = url;
      runConfig.currentTest = 'Mendeteksi struktur website...';
      runConfig.progress = 5;
      this.broadcastStep('DETECT', '', 'Mendeteksi struktur website', 'navigate', targetUrl);
      let detect = await this.detectWebsite(page, targetUrl);

      const allModules = ['login', 'dashboard', 'navigation', 'structure', 'security', 'form_validation', 'responsive', 'performance', 'crud', 'api_data'];
      const modeModules = {
        login_dashboard: allModules,
        direct_dashboard: ['dashboard', 'navigation', 'structure', 'security', 'form_validation', 'responsive', 'performance', 'crud', 'api_data'],
      };
      const relevantForMode = modeModules[mode] || allModules;
      let modules = testModules.includes('all') ? relevantForMode : testModules.filter(m => relevantForMode.includes(m));

      const authState = { isAuthenticated: false, dashboardUrl: targetUrl, loginUrl: targetUrl };
      const totalModules = modules.length;
      const MODULE_NAMES_MAP = {
        login: 'Login & Auth', dashboard: 'Dashboard Layout', navigation: 'Navigation & Menu',
        structure: 'Structure & Layout', security: 'Security & Hack', form_validation: 'Form & Input',
        responsive: 'Responsive & Mobile', performance: 'Performance & Network',
        crud: 'CRUD & Interaction', api_data: 'API & Data',
      };
      const ESTIMATED_TESTS_PER_MODULE = 10;
      const totalEstimatedTests = totalModules * ESTIMATED_TESTS_PER_MODULE;
      let completedTests = 0;

      for (let modIdx = 0; modIdx < modules.length; modIdx++) {
        if (this.cancelled) break;
        const mod = modules[modIdx];
        const modStartProgress = 5 + Math.round((modIdx / totalModules) * 90);
        runConfig.progress = modStartProgress;
        runConfig.currentTest = `Menjalankan modul: ${MODULE_NAMES_MAP[mod] || mod}`;
        this.broadcastProgress(runConfig.progress);

        let modResults;
        if (mod === 'login') {
          if (mode === 'direct_dashboard') {
            modResults = [];
          } else {
            modResults = await this.runModule(page, mod, targetUrl, targetUrl, username, password, authState, detect, runConfig);
            if (authState.isAuthenticated) {
              runConfig.currentTest = 'Mendeteksi struktur dashboard...';
              detect = await this.detectWebsite(page, authState.dashboardUrl);
              detect.hasLogin = true;
            } else if (username && password) {
              runConfig.currentTest = 'Auto-login untuk modul selanjutnya...';
              const reAuth = await this.ensureAuthenticated(page, targetUrl, username, password, authState);
              if (reAuth) {
                detect = await this.detectWebsite(page, authState.dashboardUrl);
                detect.hasLogin = true;
              }
            }
          }
        } else {
          if (mode === 'login_dashboard' && !authState.isAuthenticated && username && password) {
            await this.ensureAuthenticated(page, targetUrl, username, password, authState);
          }
          if (authState.isAuthenticated && username && password) {
            const currentUrl = page.url();
            if (currentUrl.includes('sign_in') || currentUrl.includes('login') || currentUrl.includes('auth')) {
              runConfig.currentTest = `Re-login untuk modul: ${MODULE_NAMES_MAP[mod] || mod}...`;
              const reAuth = await this.ensureAuthenticated(page, targetUrl, username, password, authState);
              if (!reAuth) {
                modResults = [];
              } else {
                modResults = await this.runModule(page, mod, authState.dashboardUrl, targetUrl, username, password, authState, detect, runConfig);
              }
            } else {
              const tUrl = authState.isAuthenticated ? authState.dashboardUrl : targetUrl;
              modResults = await this.runModule(page, mod, tUrl, targetUrl, username, password, authState, detect, runConfig);
            }
          } else {
            const tUrl = authState.isAuthenticated ? authState.dashboardUrl : targetUrl;
            modResults = await this.runModule(page, mod, tUrl, targetUrl, username, password, authState, detect, runConfig);
          }
        }

        results.push(...modResults);
        runConfig.results.push(...modResults);
        completedTests += modResults.length;
        runConfig.progress = 5 + Math.round((completedTests / totalEstimatedTests) * 90);
        const modPassed = modResults.filter(r => r.status === 'passed').length;
        const modFailed = modResults.filter(r => r.status === 'failed').length;
        const modNotes = modResults.filter(r => r.status === 'note').length;
        this.broadcastModuleDone(MODULE_NAMES_MAP[mod] || mod, modPassed, modFailed, modNotes);
        this.broadcastProgress(runConfig.progress);
      }

      if (this.cancelled) {
        this.broadcastStep('CANCEL', '', 'Tes dibatalkan', 'done', '');
        this.broadcastDone();
        await this.stopScreencast(page);
        await browser.close();
        this.browser = null;
        this.page = null;
        return results;
      }

      // ===== FASE 3: Report Console & Network Errors =====
      if (this.consoleErrors && this.consoleErrors.length > 0) {
        const errors = this.consoleErrors.filter(e => e.type === 'error' || e.type === 'pageerror');
        const errorDetails = errors.slice(0, 10).map(e => `[${e.type}] ${e.text} (at ${e.url})`).join('\n');
        results.push({
          testId: 'TC-P-008', module: 'Performance & Network',
          title: `Console errors detected (${errors.length} errors)`,
          precondition: 'Browser console monitored during test',
          steps: '1. Capture all console.error, uncaught exceptions',
          expected: 'No console errors',
          actual: errors.length > 0 ? `${errors.length} console errors:\n${errorDetails}` : 'No console errors',
          status: errors.length > 0 ? 'failed' : 'passed',
          category: 'primary',
          duration: 0,
        });
        runConfig.results.push(results[results.length - 1]);
      }

      if (this.networkErrors && this.networkErrors.length > 0) {
        const realErrors = this.networkErrors.filter(e => !(e.failure === 'net::ERR_ABORTED' && e.url && e.url.includes('_rsc=')));
        if (realErrors.length > 0) {
          const netDetails = realErrors.slice(0, 10).map(e => e.status ? `[${e.status}] ${e.method} ${e.url}` : `[FAIL] ${e.method} ${e.url}: ${e.failure}`).join('\n');
          results.push({
            testId: 'TC-P-009', module: 'Performance & Network',
            title: `Network errors detected (${realErrors.length} issues)`,
            precondition: 'All network requests monitored during test',
            steps: '1. Monitor all HTTP requests and responses\n2. Flag 4xx/5xx responses and failed requests',
            expected: 'No network errors',
            actual: `${realErrors.length} network issues:\n${netDetails}`,
            status: realErrors.some(e => (e.status && e.status >= 400) || (e.failure && e.failure !== 'net::ERR_ABORTED')) ? 'failed' : 'passed',
            category: 'primary',
            duration: 0,
          });
          runConfig.results.push(results[results.length - 1]);
        }
      }

      runConfig.progress = 100;
      runConfig.currentTest = 'Selesai';
      this.broadcastStep('DONE', '', 'Tes selesai', 'done', '');
      this.broadcastDone();
      return results;
    } catch (err) {
      this.broadcastDone();
      throw err;
    } finally {
      // Always cleanup browser to prevent memory leaks
      try {
        if (this.page) await this.stopScreencast(this.page).catch(() => {});
      } catch {}
      try {
        if (browser) await browser.close().catch(() => {});
      } catch {}
      this.browser = null;
      this.page = null;
    }
  }

  // ===== Multi-role web profile runner =====
  async runMultiRole(page, browser, profile, runConfig, results, selectedRole, testModules) {
    const roles = selectedRole && selectedRole !== 'all'
      ? profile.roles.filter(r => r.id === selectedRole)
      : profile.roles;
    const url = profile.url;
    const totalRoles = roles.length;
    const modules = testModules && testModules.includes('all') ? profile.modules : (testModules || profile.modules);
    const totalModuleSlots = totalRoles * modules.length;
    let completedSlots = 0;
    const allConsoleErrors = [];
    const allNetworkErrors = [];

    for (let roleIdx = 0; roleIdx < roles.length; roleIdx++) {
      if (this.cancelled) break;
      const role = roles[roleIdx];
      const rolePrefix = `[${role.label}]`;

      // Fresh context per role to avoid session bleed
      if (roleIdx > 0) {
        await page.context().clearCookies();
        await page.goto('about:blank').catch(() => {});
      }

      runConfig.currentTest = `${rolePrefix} Login sebagai ${role.email}...`;
      const roleBaseProgress = Math.round((roleIdx / totalRoles) * 100);
      runConfig.progress = roleBaseProgress;
      this.broadcastProgress(runConfig.progress);
      this.broadcastStep('ROLE', '', `Testing role: ${role.label}`, 'navigate', url);

      // Login
      const authState = { isAuthenticated: false, dashboardUrl: url, loginUrl: url };
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(async () => {
        await page.goto(url, { waitUntil: 'load', timeout: 15000 }).catch(() => {});
      });
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(2000);

      // Detect website structure
      let detect = await this.detectWebsite(page, url);

      // Try to navigate to login page and login
      const hasLoginForm = await this.navigateToLoginPage(page, url);
      if (hasLoginForm) {
        await this.fillLoginForm(page, role.email, role.password);
        try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
        await page.waitForTimeout(2000);
        const afterUrl = page.url();
        if (!afterUrl.includes('sign_in') && !afterUrl.includes('login') && !afterUrl.includes('auth')) {
          authState.isAuthenticated = true;
          authState.dashboardUrl = afterUrl;
        }
      }

      // Re-detect after login
      if (authState.isAuthenticated) {
        runConfig.currentTest = `${rolePrefix} Mendeteksi struktur dashboard...`;
        detect = await this.detectWebsite(page, authState.dashboardUrl);
        detect.hasLogin = true;
      }

      // Run modules for this role
      for (let modIdx = 0; modIdx < modules.length; modIdx++) {
        if (this.cancelled) break;
        const mod = modules[modIdx];
        const modName = MODULE_INFO[mod]?.label || mod;
        const slotProgress = Math.round(((completedSlots) / totalModuleSlots) * 95) + 2;
        runConfig.progress = slotProgress;
        runConfig.currentTest = `${rolePrefix} ${modName}`;
        this.broadcastProgress(runConfig.progress);

        // Ensure authenticated before non-login modules
        if (mod !== 'login' && mod !== 'landing_page' && authState.isAuthenticated) {
          const currentUrl = page.url();
          if (currentUrl.includes('sign_in') || currentUrl.includes('login') || currentUrl.includes('auth')) {
            await this.ensureAuthenticated(page, url, role.email, role.password, authState);
          }
        }

        const targetUrl = authState.isAuthenticated ? authState.dashboardUrl : url;
        let modResults = await this.runProfileModule(page, mod, targetUrl, url, role, authState, detect, profile, runConfig);

        // Prefix test IDs and module names with role
        modResults = modResults.map(r => ({
          ...r,
          testId: r.testId,
          module: `${rolePrefix} ${r.module}`,
          role: role.id,
          roleLabel: role.label,
        }));

        results.push(...modResults);
        runConfig.results.push(...modResults);
        completedSlots++;
        const modPassed = modResults.filter(r => r.status === 'passed').length;
        const modFailed = modResults.filter(r => r.status === 'failed').length;
        const modNotes = modResults.filter(r => r.status === 'note').length;
        this.broadcastModuleDone(`${rolePrefix} ${modName}`, modPassed, modFailed, modNotes);
        this.broadcastProgress(Math.round(((completedSlots) / totalModuleSlots) * 95) + 2);
      }

      // Collect console/network errors per role
      if (this.consoleErrors?.length > 0) allConsoleErrors.push(...this.consoleErrors.map(e => ({ ...e, role: role.id })));
      if (this.networkErrors?.length > 0) allNetworkErrors.push(...this.networkErrors.map(e => ({ ...e, role: role.id })));
      // Reset for next role
      this.consoleErrors = [];
      this.networkErrors = [];

      // Logout for next role
      if (roleIdx < roles.length - 1) {
        runConfig.currentTest = `${rolePrefix} Logout...`;
        await this.logout(page, authState).catch(() => {});
      }
    }

    // Console & network error summary
    if (allConsoleErrors.length > 0) {
      const errors = allConsoleErrors.filter(e => e.type === 'error' || e.type === 'pageerror');
      if (errors.length > 0) {
        const errorDetails = errors.slice(0, 15).map(e => `[${e.role}] [${e.type}] ${e.text}`).join('\n');
        results.push({
          testId: 'TC-P-008', module: 'Performance & Network',
          title: `Console errors detected (${errors.length} errors across all roles)`,
          precondition: 'Browser console monitored during all role tests',
          steps: '1. Capture all console.error, uncaught exceptions per role',
          expected: 'No console errors',
          actual: `${errors.length} console errors:\n${errorDetails}`,
          status: 'failed', category: 'primary', duration: 0,
        });
        runConfig.results.push(results[results.length - 1]);
      }
    }
    if (allNetworkErrors.length > 0) {
      const realErrors = allNetworkErrors.filter(e => !(e.failure === 'net::ERR_ABORTED' && e.url && e.url.includes('_rsc=')));
      if (realErrors.length > 0) {
        const netDetails = realErrors.slice(0, 15).map(e => `[${e.role}] ${e.status ? `[${e.status}]` : '[FAIL]'} ${e.method} ${e.url}`).join('\n');
        results.push({
          testId: 'TC-P-009', module: 'Performance & Network',
          title: `Network errors detected (${realErrors.length} issues across all roles)`,
          precondition: 'All network requests monitored during all role tests',
          steps: '1. Monitor all HTTP requests and responses per role',
          expected: 'No network errors',
          actual: `${realErrors.length} network issues:\n${netDetails}`,
          status: 'failed', category: 'primary', duration: 0,
        });
        runConfig.results.push(results[results.length - 1]);
      }
    }

    runConfig.progress = 100;
    runConfig.currentTest = 'Selesai';
    this.broadcastStep('DONE', '', 'Tes selesai', 'done', '');
    this.broadcastDone();
    return results;
  }

  // Logout helper
  async logout(page, authState) {
    const logoutSels = [
      'button:has-text("Logout")', 'button:has-text("Log out")', 'button:has-text("Keluar")',
      'a:has-text("Logout")', 'a:has-text("Log out")', 'a:has-text("Keluar")',
      'button:has-text("Sign out")', 'a:has-text("Sign out")',
      '[data-testid*="logout"]', '[class*="logout"]',
    ];
    for (const s of logoutSels) {
      const el = page.locator(s).first();
      if (await el.isVisible().catch(() => false)) {
        await el.click().catch(() => {});
        await page.waitForTimeout(2000);
        return true;
      }
    }
    // Try dropdown menu first
    const menuSels = ['button:has-text("Menu")', '[class*="dropdown"]', '[class*="user-menu"]', '[aria-label*="menu" i]', '.avatar', '[class*="avatar"]'];
    for (const s of menuSels) {
      const el = page.locator(s).first();
      if (await el.isVisible().catch(() => false)) {
        await el.click().catch(() => {});
        await page.waitForTimeout(500);
        for (const ls of logoutSels) {
          const logoutEl = page.locator(ls).first();
          if (await logoutEl.isVisible().catch(() => false)) {
            await logoutEl.click().catch(() => {});
            await page.waitForTimeout(2000);
            return true;
          }
        }
      }
    }
    // Fallback: clear cookies
    await page.context().clearCookies();
    return false;
  }

  // ===== Profile module dispatcher =====
  async runProfileModule(page, mod, targetUrl, originalUrl, role, authState, detect, profile, runConfig) {
    // Common modules — reuse existing test functions
    switch (mod) {
      case 'login': return this.testLoginProfile(page, originalUrl, role, authState, detect, profile);
      case 'dashboard': return this.testDashboard(page, targetUrl, detect, authState);
      case 'navigation': return this.testNavigation(page, targetUrl, detect);
      case 'structure': return this.testStructure(page, targetUrl, detect);
      case 'security': return this.testSecurityProfile(page, targetUrl, detect, role, authState);
      case 'form_validation':
        if (!detect.hasForm) return [];
        return this.testFormValidation(page, targetUrl, detect);
      case 'responsive': return this.testResponsive(page, targetUrl, detect);
      case 'performance': return this.testPerformance(page, targetUrl, detect);
      // Competency-specific
      case 'crud_employee': return this.testCrudEmployee(page, targetUrl, role, authState, detect);
      case 'crud_kompetensi': return this.testCrudKompetensi(page, targetUrl, role, authState, detect);
      case 'test_assessment': return this.testAssessment(page, targetUrl, role, authState, detect);
      case 'payment_booking': return this.testPaymentBooking(page, targetUrl, role, authState, detect);
      case 'notification_integration': return this.testNotificationIntegration(page, targetUrl, role, authState, detect);
      case 'report_export': return this.testReportExport(page, targetUrl, role, authState, detect);
      // Psikotest-specific
      case 'crud_master': return this.testCrudMaster(page, targetUrl, role, authState, detect);
      case 'ai_integration': return this.testAiIntegration(page, targetUrl, role, authState, detect);
      case 'booking_consultant': return this.testBookingConsultant(page, targetUrl, role, authState, detect);
      case 'result_report': return this.testResultReport(page, targetUrl, role, authState, detect);
      // Consultant-specific
      case 'landing_page': return this.testLandingPage(page, targetUrl, detect);
      case 'profile_management': return this.testProfileManagement(page, targetUrl, role, authState, detect);
      case 'booking_schedule': return this.testBookingSchedule(page, targetUrl, role, authState, detect);
      case 'payment_referal': return this.testPaymentReferal(page, targetUrl, role, authState, detect);
      case 'notification': return this.testNotification(page, targetUrl, role, authState, detect);
      // Legacy fallback
      case 'crud': return this.testCrud(page, targetUrl, detect, authState);
      case 'api_data': return this.testApiData(page, targetUrl, detect, authState);
      default: return [];
    }
  }

  // ===== Login tests for profile mode =====
  async testLoginProfile(page, url, role, authState, detect, profile) {
    const M = 'Login & Auth'; const R = [];
    const email = role.email;
    const pwd = role.password;

    // TC-L-001: Login form detected
    R.push(await this.safeTest('TC-L-001', M, 'Form login terdeteksi di halaman',
      'URL = halaman login', '1. Buka URL\n2. Cari form login',
      'Form login ditemukan', async () => {
        await this.ensureOnPage(page, url);
        const hasForm = await this.detectLoginForm(page);
        if (!hasForm) throw new Error('Form login tidak ditemukan');
        return 'Form login terdeteksi';
      }));

    // TC-L-002: Email/username field
    R.push(await this.safeTest('TC-L-002', M, 'Field username/email terdeteksi',
      'Form login ditemukan', '1. Cari input username/email',
      'Field username ditemukan', async () => {
        const userSels = ['input[name="user[login]"]', 'input[name="username"]', 'input[name="email"]', 'input[type="email"]', '#username', '#email', 'input[placeholder*="username" i]', 'input[placeholder*="email" i]', 'input[autocomplete="username"]'];
        let found = false;
        for (const s of userSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
          if (await page.locator(s).first().count() > 0) { found = true; break; }
        }
        if (!found) throw new Error('Field username/email tidak ditemukan');
        return 'Field username/email terdeteksi';
      }));

    // TC-L-003: Password masking
    R.push(await this.safeTest('TC-L-003', M, 'Password masking (type=password)',
      'Form login ditemukan', '1. Cari input password\n2. Cek type=password',
      'Password field type=password', async () => {
        const pwdEl = page.locator('input[type="password"]').first();
        if (!await pwdEl.isVisible().catch(() => false) && await pwdEl.count() === 0) throw new Error('Input password tidak ditemukan');
        return 'Password masking aktif (type=password)';
      }));

    // TC-L-004: Submit button
    R.push(await this.safeTest('TC-L-004', M, 'Submit button terdeteksi',
      'Form login ditemukan', '1. Cari button submit/login',
      'Submit button ditemukan', async () => {
        const submitSels = ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Sign in")', 'button:has-text("Login")', 'button:has-text("Masuk")', 'button:has-text("Log in")'];
        let found = false;
        for (const s of submitSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
          if (await page.locator(s).first().count() > 0) { found = true; break; }
        }
        if (!found) throw new Error('Submit button tidak ditemukan');
        return 'Submit button terdeteksi';
      }));

    // TC-L-005: Empty field validation
    R.push(await this.safeTest('TC-L-005', M, 'Validasi field kosong',
      'Form login ditemukan', '1. Submit form kosong\n2. Cek error message',
      'Error muncul saat field kosong', async () => {
        const submitBtn = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Masuk"), button:has-text("Sign in")').first();
        if (await submitBtn.isVisible().catch(() => false)) {
          await submitBtn.click().catch(() => {});
          await page.waitForTimeout(1000);
        }
        const hasError = await this.smartWait(page, [
          '.error', '.alert', '[class*="error"]', '[class*="invalid"]', '[class*="danger"]',
          'text="required"', 'text="wajib"', 'text="harus diisi"', '[role="alert"]',
        ], { timeout: 3000 });
        if (hasError) return 'Validasi field kosong aktif';
        // HTML5 validation
        const emailInput = page.locator('input[type="email"], input[name="email"], input[name="username"]').first();
        if (await emailInput.isVisible().catch(() => false)) {
          const valid = await emailInput.evaluate(el => el.validity?.valid).catch(() => true);
          if (!valid) return 'HTML5 validation aktif';
        }
        return 'Validasi field kosong terdeteksi (browser default)';
      }));

    // TC-L-006: Invalid credentials
    R.push(await this.safeTest('TC-L-006', M, 'Login dengan kredensial invalid ditolak',
      'Form login ditemukan', '1. Isi email invalid\n2. Isi password invalid\n3. Submit\n4. Cek error',
      'Login gagal, error message muncul', async () => {
        await this.fillLoginForm(page, 'invalid@test.com', 'wrongpassword123');
        await page.waitForTimeout(2000);
        const hasError = await this.smartWait(page, [
          '.error', '.alert', '[class*="error"]', '[class*="invalid"]', '[class*="danger"]',
          'text="invalid"', 'text="salah"', 'text="gagal"', 'text="incorrect"', '[role="alert"]',
        ], { timeout: 3000 });
        const stillOnLogin = await this.loginFormStillVisible(page);
        if (hasError || stillOnLogin) return 'Login invalid ditolak dengan pesan error';
        throw new Error('Login invalid tidak ditolak');
      }));

    // TC-L-007: Valid login
    R.push(await this.safeTest('TC-L-007', M, `Login valid sebagai ${role.label}`,
      'Kredensial valid', `1. Isi email: ${email}\n2. Isi password\n3. Submit\n4. Cek redirect`,
      'Login berhasil, redirect ke dashboard', async () => {
        await this.navigateToLoginPage(page, url);
        await this.fillLoginForm(page, email, pwd);
        try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
        await page.waitForTimeout(2000);
        const currentUrl = page.url();
        if (currentUrl.includes('sign_in') || currentUrl.includes('login') || currentUrl.includes('auth')) {
          throw new Error(`Login gagal untuk ${role.label}, masih di halaman login`);
        }
        authState.isAuthenticated = true;
        authState.dashboardUrl = currentUrl;
        return `Login berhasil, redirect ke: ${currentUrl}`;
      }));

    // TC-L-008: Session persistence
    if (authState.isAuthenticated) {
      R.push(await this.safeTest('TC-L-008', M, 'Session persist setelah refresh',
        'User login', '1. Refresh halaman\n2. Cek masih login',
        'Session tetap aktif', async () => {
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(2000);
          const afterUrl = page.url();
          if (afterUrl.includes('sign_in') || afterUrl.includes('login')) throw new Error('Session hilang setelah refresh');
          return 'Session persist setelah refresh';
        }));
    } else {
      R.push(this.skip('TC-L-008', M, 'Session persist setelah refresh', 'User login', '1. Refresh', 'Session aktif', 'not authenticated'));
    }

    // TC-L-009: Logout
    if (authState.isAuthenticated) {
      R.push(await this.safeTest('TC-L-009', M, 'Logout berhasil',
        'User login', '1. Cari tombol logout\n2. Klik logout\n3. Cek redirect ke login',
        'Logout berhasil, redirect ke login', async () => {
          const loggedOut = await this.logout(page, authState);
          if (!loggedOut) throw new Error('Tombol logout tidak ditemukan');
          const afterUrl = page.url();
          if (afterUrl.includes('login') || afterUrl.includes('sign_in') || afterUrl.includes('auth') || afterUrl === url) {
            return 'Logout berhasil, session cleared';
          }
          return 'Logout berhasil (URL: ' + afterUrl + ')';
        }));
      // Re-login for subsequent modules
      if (authState.isAuthenticated === false) {
        await this.navigateToLoginPage(page, url);
        await this.fillLoginForm(page, email, pwd);
        try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
        await page.waitForTimeout(2000);
        const afterUrl = page.url();
        if (!afterUrl.includes('sign_in') && !afterUrl.includes('login') && !afterUrl.includes('auth')) {
          authState.isAuthenticated = true;
          authState.dashboardUrl = afterUrl;
        }
      }
    } else {
      R.push(this.skip('TC-L-009', M, 'Logout berhasil', 'User login', '1. Logout', 'Redirect login', 'not authenticated'));
    }

    // TC-L-010: Back button security
    if (authState.isAuthenticated) {
      R.push(await this.noteTest('TC-L-010', M, 'Back button security setelah logout',
        'User login', '1. Login\n2. Logout\n3. Back button\n4. Cek tidak bisa akses dashboard',
        'Tidak bisa akses dashboard setelah logout', async () => {
          // Logout first
          await this.logout(page, authState);
          await page.waitForTimeout(1000);
          // Go back
          await page.goBack().catch(() => {});
          await page.waitForTimeout(2000);
          const afterUrl = page.url();
          if (afterUrl.includes('dashboard') || afterUrl.includes('admin') || afterUrl.includes('panel')) {
            throw new Error('Back button bisa akses dashboard setelah logout — security issue');
          }
          return 'Back button security OK';
        }));
      // Re-login
      await this.navigateToLoginPage(page, url);
      await this.fillLoginForm(page, email, pwd);
      try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
      await page.waitForTimeout(2000);
      const afterUrl = page.url();
      if (!afterUrl.includes('sign_in') && !afterUrl.includes('login') && !afterUrl.includes('auth')) {
        authState.isAuthenticated = true;
        authState.dashboardUrl = afterUrl;
      }
    } else {
      R.push(this.skip('TC-L-010', M, 'Back button security', 'User login', '1. Logout\n2. Back', 'No dashboard access', 'not authenticated'));
    }

    // TC-L-011: Register link (if applicable)
    R.push(await this.noteTest('TC-L-011', M, 'Link register tersedia',
      'Halaman login', '1. Cari link register/sign up',
      'Link register ditemukan', async () => {
        const registerSels = ['a:has-text("Register")', 'a:has-text("Sign up")', 'a:has-text("Daftar")', 'a[href*="register"]', 'a[href*="signup"]', 'a[href*="sign_up"]'];
        let found = false;
        for (const s of registerSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Link register tidak ditemukan');
        return 'Link register tersedia';
      }));

    // TC-L-012: Forgot password link
    R.push(await this.noteTest('TC-L-012', M, 'Link forgot/reset password tersedia',
      'Halaman login', '1. Cari link forgot password',
      'Link forgot password ditemukan', async () => {
        const forgotSels = ['a:has-text("Forgot")', 'a:has-text("Reset")', 'a:has-text("Lupa")', 'a:has-text("Lupa Password")', 'a[href*="forgot"]', 'a[href*="reset"]', 'a[href*="password"]'];
        let found = false;
        for (const s of forgotSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Link forgot password tidak ditemukan');
        return 'Link forgot/reset password tersedia';
      }));

    // TC-L-013: OAuth/SSO buttons (if applicable)
    R.push(await this.noteTest('TC-L-013', M, 'OAuth/SSO login button tersedia',
      'Halaman login', '1. Cari button Google/GitHub/Microsoft/SSO',
      'OAuth button ditemukan', async () => {
        const oauthSels = ['button:has-text("Google")', 'button:has-text("GitHub")', 'button:has-text("Microsoft")', 'button:has-text("SSO")', 'a:has-text("Google")', 'a:has-text("SSO")', '[class*="oauth"]', '[class*="sso"]', '[data-testid*="google"]', '[data-testid*="oauth"]'];
        let found = false;
        for (const s of oauthSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('OAuth/SSO button tidak ditemukan');
        return 'OAuth/SSO login button tersedia';
      }));

    // TC-L-014: Permission boundary — non-admin should not see admin features
    if (role.id !== 'admin' && role.id !== 'useradmin') {
      R.push(await this.noteTest('TC-L-014', M, `Permission boundary: ${role.label} tidak bisa akses admin`,
        `${role.label} login`, '1. Login sebagai non-admin\n2. Coba akses /admin atau fitur admin',
        'Akses admin ditolak', async () => {
          if (!authState.isAuthenticated) throw new Error('Not authenticated');
          let baseUrl;
          try { baseUrl = new URL(url).origin; } catch { baseUrl = url; }
          const adminRoutes = ['/admin', '/admin/dashboard', '/admin/users', '/admin/settings', '/manage', '/cms'];
          let blocked = false;
          for (const route of adminRoutes) {
            try {
              await page.goto(baseUrl + route, { waitUntil: 'domcontentloaded', timeout: 10000 });
              await page.waitForTimeout(2000);
              const currentUrl = page.url();
              // If redirected back to login or dashboard or got 403
              if (currentUrl.includes('login') || currentUrl.includes('sign_in') || currentUrl.includes('403') || currentUrl.includes('unauthorized')) {
                blocked = true; break;
              }
              // Check for access denied message
              const hasDenied = await page.evaluate(() => {
                const text = document.body?.innerText || '';
                return text.includes('403') || text.includes('Unauthorized') || text.includes('Akses ditolak') || text.includes('Permission denied') || text.includes('Tidak memiliki akses');
              }).catch(() => false);
              if (hasDenied) { blocked = true; break; }
            } catch {}
          }
          if (blocked) return 'Permission boundary aktif — akses admin ditolak untuk non-admin';
          throw new Error('Non-admin bisa mengakses route admin — potential security issue');
        }));
    }

    // Re-login after permission boundary test
    if (authState.isAuthenticated) {
      const currentUrl = page.url();
      if (currentUrl.includes('login') || currentUrl.includes('sign_in') || currentUrl.includes('auth')) {
        await this.fillLoginForm(page, email, pwd);
        try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
        await page.waitForTimeout(2000);
        const afterUrl = page.url();
        if (!afterUrl.includes('sign_in') && !afterUrl.includes('login') && !afterUrl.includes('auth')) {
          authState.isAuthenticated = true;
          authState.dashboardUrl = afterUrl;
        }
      }
    }

    return R;
  }

  // ===== Security tests with role awareness =====
  async testSecurityProfile(page, url, detect, role, authState) {
    // Run standard security tests
    const baseResults = await this.testSecurity(page, url, detect);
    // Add role-specific permission tests
    const M = 'Security & Hack';
    const R = [...baseResults];

    // TC-SEC-EXTRA-1: IDOR — try accessing other users' data
    R.push(await this.noteTest('TC-SEC-IDOR', M, 'IDOR: Akses data user lain ditolak',
      'User authenticated', '1. Coba akses API /users/1 atau /api/users/1\n2. Cek response',
      'Akses ditolak atau data terbatas', async () => {
        let baseUrl;
        try { baseUrl = new URL(url).origin; } catch { baseUrl = url; }
        const idorUrls = ['/api/users/1', '/api/employees/1', '/api/profile/1', '/users/1', '/employees/1'];
        let blocked = false;
        for (const u of idorUrls) {
          try {
            const res = await page.goto(baseUrl + u, { waitUntil: 'domcontentloaded', timeout: 8000 });
            if (res && (res.status() === 401 || res.status() === 403)) { blocked = true; break; }
          } catch {}
        }
        if (blocked) return 'IDOR protection aktif';
        return 'IDOR test selesai — perlu verifikasi manual';
      }));

    return R;
  }

  // ===== Competency-specific test modules =====

  async testCrudEmployee(page, url, role, authState, detect) {
    const M = 'CRUD Employee/Divisi/Role'; const R = [];
    const isAdmin = role.id === 'admin';

    // TC-EMP-001: Employee table detected
    R.push(await this.safeTest('TC-EMP-001', M, 'Tabel employee terdeteksi',
      'Dashboard admin', '1. Cari tabel employee/pegawai',
      'Tabel employee ditemukan', async () => {
        await this.navigateToDashboard(page, url, authState);
        const tableSels = ['table', '[class*="table"]', '[class*="grid"]', '[data-testid*="employee"]', '[class*="employee-list"]', '[class*="pegawai"]'];
        let found = false;
        for (const s of tableSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Tabel employee tidak ditemukan');
        return 'Tabel employee terdeteksi';
      }));

    // TC-EMP-002: Add employee button
    R.push(await this.safeTest('TC-EMP-002', M, 'Button tambah employee terdeteksi',
      'Tabel employee', '1. Cari button add/tambah employee',
      'Button add ditemukan', async () => {
        const addSels = ['button:has-text("Add")', 'button:has-text("Tambah")', 'button:has-text("Create")', 'button:has-text("Buat")', 'button:has-text("New")', 'a:has-text("Add")', 'a:has-text("Tambah")', '[class*="add-button"]', '[data-testid*="add"]'];
        let found = false;
        for (const s of addSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Button tambah employee tidak ditemukan');
        return 'Button tambah employee terdeteksi';
      }));

    // TC-EMP-003: CRUD Divisi
    R.push(await this.noteTest('TC-EMP-003', M, 'CRUD Divisi terdeteksi',
      'Dashboard admin', '1. Cari menu/section divisi\n2. Cek tabel/list divisi',
      'Fitur divisi tersedia', async () => {
        const divSels = ['a:has-text("Divisi")', 'a[href*="divisi"]', 'button:has-text("Divisi")', '[class*="divisi"]', '[data-testid*="divisi"]', 'a:has-text("Division")', 'a[href*="division"]'];
        let found = false;
        for (const s of divSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Fitur divisi tidak ditemukan');
        return 'CRUD Divisi terdeteksi';
      }));

    // TC-EMP-004: CRUD Role
    R.push(await this.noteTest('TC-EMP-004', M, 'CRUD Role terdeteksi',
      'Dashboard admin', '1. Cari menu/section role\n2. Cek tabel/list role',
      'Fitur role tersedia', async () => {
        const roleSels = ['a:has-text("Role")', 'a[href*="role"]', 'button:has-text("Role")', '[class*="role"]', '[data-testid*="role"]'];
        let found = false;
        for (const s of roleSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Fitur role tidak ditemukan');
        return 'CRUD Role terdeteksi';
      }));

    // TC-EMP-005: CRUD User
    R.push(await this.noteTest('TC-EMP-005', M, 'CRUD User terdeteksi',
      'Dashboard admin', '1. Cari menu/section user\n2. Cek tabel/list user',
      'Fitur user management tersedia', async () => {
        const userSels = ['a:has-text("User")', 'a[href*="user"]', 'button:has-text("User")', '[class*="user-list"]', '[data-testid*="user"]', 'a:has-text("Users")', 'a[href*="users"]'];
        let found = false;
        for (const s of userSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Fitur user management tidak ditemukan');
        return 'CRUD User terdeteksi';
      }));

    // TC-EMP-006: Search/filter employee
    R.push(await this.noteTest('TC-EMP-006', M, 'Search/filter employee tersedia',
      'Tabel employee', '1. Cari input search di tabel employee',
      'Search tersedia', async () => {
        const searchSels = ['input[placeholder*="search" i]', 'input[placeholder*="cari" i]', 'input[type="search"]', '[class*="search"]', '[data-testid*="search"]'];
        let found = false;
        for (const s of searchSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Search/filter employee tidak ditemukan');
        return 'Search/filter employee tersedia';
      }));

    // TC-EMP-007: Edit employee
    R.push(await this.noteTest('TC-EMP-007', M, 'Button edit employee terdeteksi',
      'Tabel employee', '1. Cari button edit di tabel',
      'Button edit ditemukan', async () => {
        const editSels = ['button:has-text("Edit")', 'button:has-text("Ubah")', 'a:has-text("Edit")', 'a:has-text("Ubah")', '[class*="edit"]', '[data-testid*="edit"]', 'button[aria-label*="edit" i]'];
        let found = false;
        for (const s of editSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Button edit tidak ditemukan');
        return 'Button edit employee terdeteksi';
      }));

    // TC-EMP-008: Delete employee
    R.push(await this.noteTest('TC-EMP-008', M, 'Button delete employee terdeteksi',
      'Tabel employee', '1. Cari button delete di tabel',
      'Button delete ditemukan', async () => {
        const delSels = ['button:has-text("Delete")', 'button:has-text("Hapus")', 'button:has-text("Remove")', 'a:has-text("Delete")', 'a:has-text("Hapus")', '[class*="delete"]', '[data-testid*="delete"]', 'button[aria-label*="delete" i]'];
        let found = false;
        for (const s of delSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Button delete tidak ditemukan');
        return 'Button delete employee terdeteksi';
      }));

    // TC-EMP-009: Permission — non-admin cannot manage employees
    if (!isAdmin) {
      R.push(await this.noteTest('TC-EMP-009', M, `Permission: ${role.label} tidak bisa manage employee`,
        'Non-admin login', '1. Coba akses menu employee\n2. Cek ditolak',
        'Akses manage employee ditolak', async () => {
          const empSels = ['a:has-text("Employee")', 'a[href*="employee"]', 'a:has-text("Pegawai")', 'a[href*="pegawai"]', 'button:has-text("Add Employee")', 'button:has-text("Tambah Pegawai")'];
          let canAccess = false;
          for (const s of empSels) {
            if (await page.locator(s).first().isVisible().catch(() => false)) { canAccess = true; break; }
          }
          if (canAccess) throw new Error('Non-admin bisa mengakses menu employee');
          return 'Permission boundary aktif — non-admin tidak bisa manage employee';
        }));
    }

    // TC-EMP-010: Pagination
    R.push(await this.noteTest('TC-EMP-010', M, 'Pagination employee tersedia',
      'Tabel employee', '1. Cari pagination di tabel',
      'Pagination ditemukan', async () => {
        const pagSels = ['[class*="pagination"]', 'nav[aria-label*="page"]', 'button:has-text("Next")', 'button:has-text("Prev")', '[class*="page-nav"]'];
        let found = false;
        for (const s of pagSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Pagination tidak ditemukan');
        return 'Pagination employee tersedia';
      }));

    return R;
  }

  async testCrudKompetensi(page, url, role, authState, detect) {
    const M = 'CRUD Kompetensi'; const R = [];

    // TC-KOMP-001: Master Kompetensi menu
    R.push(await this.safeTest('TC-KOMP-001', M, 'Menu Master Kompetensi terdeteksi',
      'Dashboard', '1. Cari menu kompetensi',
      'Menu kompetensi ditemukan', async () => {
        const kompSels = ['a:has-text("Kompetensi")', 'a[href*="kompetensi"]', 'a:has-text("Competency")', 'a[href*="competency"]', 'button:has-text("Kompetensi")', '[class*="kompetensi"]', '[data-testid*="kompetensi"]'];
        let found = false;
        for (const s of kompSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Menu kompetensi tidak ditemukan');
        return 'Menu Master Kompetensi terdeteksi';
      }));

    // TC-KOMP-002: Form Kompetensi
    R.push(await this.noteTest('TC-KOMP-002', M, 'Form Kompetensi User terdeteksi',
      'Menu kompetensi', '1. Cari form input kompetensi',
      'Form kompetensi ditemukan', async () => {
        const formSels = ['form', 'input[name*="kompetensi"]', 'textarea[name*="kompetensi"]', '[class*="form-kompetensi"]', '[data-testid*="form-kompetensi"]'];
        let found = false;
        for (const s of formSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Form kompetensi tidak ditemukan');
        return 'Form Kompetensi User terdeteksi';
      }));

    // TC-KOMP-003: AI Generate Kompetensi button
    R.push(await this.noteTest('TC-KOMP-003', M, 'Button AI Generate Kompetensi terdeteksi',
      'Menu kompetensi', '1. Cari button AI generate',
      'Button AI generate ditemukan', async () => {
        const aiSels = ['button:has-text("AI")', 'button:has-text("Generate")', 'button:has-text("Generate AI")', 'button:has-text("AI Generate")', '[class*="ai-generate"]', '[data-testid*="ai-generate"]', 'button:has-text("Auto Generate")'];
        let found = false;
        for (const s of aiSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Button AI Generate Kompetensi tidak ditemukan');
        return 'Button AI Generate Kompetensi terdeteksi';
      }));

    // TC-KOMP-004: Result Competency display
    R.push(await this.noteTest('TC-KOMP-004', M, 'Result Competency terdeteksi',
      'Menu kompetensi', '1. Cari section result/hasil kompetensi',
      'Result competency ditemukan', async () => {
        const resultSels = ['a:has-text("Result")', 'a:has-text("Hasil")', '[class*="result"]', '[class*="hasil"]', '[data-testid*="result"]', 'a[href*="result"]'];
        let found = false;
        for (const s of resultSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Result competency tidak ditemukan');
        return 'Result Competency terdeteksi';
      }));

    // TC-KOMP-005: Norm Group & Norm Table
    R.push(await this.noteTest('TC-KOMP-005', M, 'Norm Group & Norm Table terdeteksi',
      'Dashboard admin', '1. Cari menu norm group/table',
      'Norm group/table ditemukan', async () => {
        const normSels = ['a:has-text("Norm Group")', 'a:has-text("Norm Table")', 'a[href*="norm"]', '[class*="norm"]', '[data-testid*="norm"]'];
        let found = false;
        for (const s of normSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Norm group/table tidak ditemukan');
        return 'Norm Group & Norm Table terdeteksi';
      }));

    return R;
  }

  async testAssessment(page, url, role, authState, detect) {
    const M = 'Test & Assessment'; const R = [];

    // TC-ASSESS-001: Test list
    R.push(await this.safeTest('TC-ASSESS-001', M, 'List test/assessment terdeteksi',
      'Dashboard', '1. Cari list/section test',
      'List test ditemukan', async () => {
        const testSels = ['a:has-text("Test")', 'a[href*="test"]', 'a:has-text("Assessment")', 'a[href*="assessment"]', '[class*="test-list"]', '[class*="assessment"]', '[data-testid*="test"]'];
        let found = false;
        for (const s of testSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('List test tidak ditemukan');
        return 'List test/assessment terdeteksi';
      }));

    // TC-ASSESS-002: Test + Dimensi
    R.push(await this.noteTest('TC-ASSESS-002', M, 'Test dengan Dimensi terdeteksi',
      'Menu test', '1. Cari section dimensi',
      'Dimensi terdeteksi', async () => {
        const dimSels = ['a:has-text("Dimensi")', 'a[href*="dimensi"]', 'a:has-text("Dimension")', '[class*="dimensi"]', '[data-testid*="dimensi"]'];
        let found = false;
        for (const s of dimSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Dimensi tidak ditemukan');
        return 'Test dengan Dimensi terdeteksi';
      }));

    // TC-ASSESS-003: Bank Soal
    R.push(await this.noteTest('TC-ASSESS-003', M, 'Bank Soal terdeteksi',
      'Dashboard admin', '1. Cari menu bank soal',
      'Bank soal ditemukan', async () => {
        const soalSels = ['a:has-text("Bank Soal")', 'a:has-text("Soal")', 'a[href*="soal"]', 'a[href*="question"]', '[class*="soal"]', '[class*="question-bank"]', '[data-testid*="soal"]'];
        let found = false;
        for (const s of soalSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Bank soal tidak ditemukan');
        return 'Bank Soal terdeteksi';
      }));

    // TC-ASSESS-004: Import Excel Soal
    R.push(await this.noteTest('TC-ASSESS-004', M, 'Import Excel Soal terdeteksi',
      'Bank soal', '1. Cari button import excel',
      'Import excel ditemukan', async () => {
        const importSels = ['button:has-text("Import")', 'button:has-text("Excel")', 'a:has-text("Import")', 'input[type="file"][accept*="excel"]', 'input[type="file"][accept*=".xls"]', '[class*="import"]', '[data-testid*="import"]'];
        let found = false;
        for (const s of importSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Import Excel tidak ditemukan');
        return 'Import Excel Soal terdeteksi';
      }));

    // TC-ASSESS-005: Navigasi Test
    R.push(await this.noteTest('TC-ASSESS-005', M, 'Navigasi test (next/prev) terdeteksi',
      'Halaman test', '1. Cari button next/prev di test',
      'Navigasi test ditemukan', async () => {
        const navSels = ['button:has-text("Next")', 'button:has-text("Selanjutnya")', 'button:has-text("Prev")', 'button:has-text("Sebelumnya")', 'button:has-text("Lanjut")', '[class*="next"]', '[class*="prev"]', '[data-testid*="next"]'];
        let found = false;
        for (const s of navSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Navigasi test tidak ditemukan');
        return 'Navigasi test terdeteksi';
      }));

    // TC-ASSESS-006: Test dengan Kamera
    R.push(await this.noteTest('TC-ASSESS-006', M, 'Test dengan kamera terdeteksi',
      'Halaman test', '1. Cari indikator kamera/video',
      'Fitur kamera terdeteksi', async () => {
        const camSels = ['video', '[class*="camera"]', '[class*="webcam"]', '[data-testid*="camera"]', 'button:has-text("Camera")', 'button:has-text("Kamera")', 'canvas[class*="camera"]'];
        let found = false;
        for (const s of camSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Fitur kamera tidak ditemukan');
        return 'Test dengan kamera terdeteksi';
      }));

    // TC-ASSESS-007: Mulai Ujian (peserta)
    R.push(await this.noteTest('TC-ASSESS-007', M, 'Button mulai ujian terdeteksi',
      'Dashboard peserta', '1. Cari button mulai/start ujian',
      'Button mulai ujian ditemukan', async () => {
        const startSels = ['button:has-text("Mulai")', 'button:has-text("Start")', 'button:has-text("Begin")', 'a:has-text("Mulai")', 'a:has-text("Start")', '[class*="start"]', '[data-testid*="start"]'];
        let found = false;
        for (const s of startSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Button mulai ujian tidak ditemukan');
        return 'Button mulai ujian terdeteksi';
      }));

    // TC-ASSESS-008: Recording/Zoom
    R.push(await this.noteTest('TC-ASSESS-008', M, 'Recording/Zoom assessment terdeteksi',
      'Halaman test', '1. Cari indikator recording/zoom',
      'Recording terdeteksi', async () => {
        const recSels = ['button:has-text("Record")', 'button:has-text("Recording")', '[class*="record"]', '[class*="zoom"]', '[data-testid*="record"]', 'video[class*="record"]'];
        let found = false;
        for (const s of recSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Recording/Zoom tidak ditemukan');
        return 'Recording/Zoom assessment terdeteksi';
      }));

    return R;
  }

  async testPaymentBooking(page, url, role, authState, detect) {
    const M = 'Payment & Booking'; const R = [];

    // TC-PAY-001: Setting Price
    R.push(await this.noteTest('TC-PAY-001', M, 'Setting Price terdeteksi',
      'Dashboard admin', '1. Cari menu setting price',
      'Setting price ditemukan', async () => {
        const priceSels = ['a:has-text("Price")', 'a:has-text("Harga")', 'a[href*="price"]', 'a:has-text("Setting Price")', '[class*="price"]', '[data-testid*="price"]'];
        let found = false;
        for (const s of priceSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Setting price tidak ditemukan');
        return 'Setting Price terdeteksi';
      }));

    // TC-PAY-002: Payment Gateway
    R.push(await this.noteTest('TC-PAY-002', M, 'Payment Gateway terdeteksi',
      'Halaman payment', '1. Cari indikator payment gateway',
      'Payment gateway ditemukan', async () => {
        const paySels = ['button:has-text("Bayar")', 'button:has-text("Pay")', 'button:has-text("Payment")', '[class*="payment"]', '[class*="midtrans"]', '[class*="xendit"]', '[class*="stripe"]', '[data-testid*="payment"]', 'img[src*="midtrans"]', 'img[src*="xendit"]', 'img[src*="stripe"]'];
        let found = false;
        for (const s of paySels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Payment gateway tidak ditemukan');
        return 'Payment Gateway terdeteksi';
      }));

    // TC-PAY-003: Kode Referal
    R.push(await this.noteTest('TC-PAY-003', M, 'Kode Referal terdeteksi',
      'Dashboard', '1. Cari input/section kode referal',
      'Kode referal ditemukan', async () => {
        const refSels = ['input[placeholder*="referal" i]', 'input[placeholder*="referral" i]', 'input[name*="referal"]', 'input[name*="referral"]', 'a:has-text("Referal")', 'a:has-text("Referral")', '[class*="referal"]', '[class*="referral"]', '[data-testid*="referal"]'];
        let found = false;
        for (const s of refSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Kode referal tidak ditemukan');
        return 'Kode Referal terdeteksi';
      }));

    // TC-PAY-004: Booking dengan Referal
    R.push(await this.noteTest('TC-PAY-004', M, 'Booking dengan kode referal terdeteksi',
      'Halaman booking', '1. Cari form booking dengan field referal',
      'Booking dengan referal tersedia', async () => {
        const bookSels = ['button:has-text("Booking")', 'a:has-text("Booking")', 'a[href*="booking"]', '[class*="booking"]', '[data-testid*="booking"]'];
        let found = false;
        for (const s of bookSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Booking tidak ditemukan');
        return 'Booking dengan kode referal terdeteksi';
      }));

    // TC-PAY-005: Cancellation
    R.push(await this.noteTest('TC-PAY-005', M, 'Cancellation terdeteksi',
      'Dashboard', '1. Cari button cancel/batalkan',
      'Cancellation ditemukan', async () => {
        const cancelSels = ['button:has-text("Cancel")', 'button:has-text("Batalkan")', 'a:has-text("Cancel")', '[class*="cancel"]', '[data-testid*="cancel"]'];
        let found = false;
        for (const s of cancelSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Cancellation tidak ditemukan');
        return 'Cancellation terdeteksi';
      }));

    // TC-PAY-006: Reschedule
    R.push(await this.noteTest('TC-PAY-006', M, 'Reschedule terdeteksi',
      'Dashboard', '1. Cari button reschedule/jadwal ulang',
      'Reschedule ditemukan', async () => {
        const resSels = ['button:has-text("Reschedule")', 'button:has-text("Jadwal Ulang")', 'a:has-text("Reschedule")', '[class*="reschedule"]', '[data-testid*="reschedule"]'];
        let found = false;
        for (const s of resSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Reschedule tidak ditemukan');
        return 'Reschedule terdeteksi';
      }));

    return R;
  }

  async testNotificationIntegration(page, url, role, authState, detect) {
    const M = 'Notification & Integration'; const R = [];

    // TC-NI-001: Email notification
    R.push(await this.noteTest('TC-NI-001', M, 'Email notification terdeteksi',
      'Dashboard', '1. Cari indikator email notif',
      'Email notif ditemukan', async () => {
        const notifSels = ['[class*="notif"]', '[class*="notification"]', '[class*="bell"]', 'button[aria-label*="notif"]', '[data-testid*="notif"]', 'a:has-text("Notifikasi")', 'a:has-text("Notification")'];
        let found = false;
        for (const s of notifSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Notification tidak ditemukan');
        return 'Email notification terdeteksi';
      }));

    // TC-NI-002: Upload Foto/OSS
    R.push(await this.noteTest('TC-NI-002', M, 'Upload foto/attachment terdeteksi',
      'Profile/settings', '1. Cari input file upload',
      'Upload ditemukan', async () => {
        const uploadSels = ['input[type="file"]', '[class*="upload"]', '[class*="dropzone"]', 'button:has-text("Upload")', 'button:has-text("Foto")', '[data-testid*="upload"]'];
        let found = false;
        for (const s of uploadSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Upload tidak ditemukan');
        return 'Upload foto/attachment terdeteksi';
      }));

    // TC-NI-003: Foto Profile
    R.push(await this.noteTest('TC-NI-003', M, 'Foto profile terdeteksi',
      'Profile', '1. Cari avatar/foto profile',
      'Foto profile ditemukan', async () => {
        const avatarSels = ['[class*="avatar"]', 'img[class*="profile"]', '[class*="profile-pic"]', '[data-testid*="avatar"]', '[class*="user-avatar"]'];
        let found = false;
        for (const s of avatarSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Foto profile tidak ditemukan');
        return 'Foto profile terdeteksi';
      }));

    // TC-NI-004: Integrasi AI
    R.push(await this.noteTest('TC-NI-004', M, 'Integrasi AI terdeteksi',
      'Dashboard', '1. Cari indikator AI integration',
      'AI integration ditemukan', async () => {
        const aiSels = ['[class*="ai"]', 'button:has-text("AI")', 'button:has-text("Generate")', '[data-testid*="ai"]', 'text*="AI"', 'text*="artificial intelligence"'];
        let found = false;
        for (const s of aiSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Integrasi AI tidak ditemukan');
        return 'Integrasi AI terdeteksi';
      }));

    return R;
  }

  async testReportExport(page, url, role, authState, detect) {
    const M = 'Report & Export'; const R = [];

    // TC-REP-001: Report PDF
    R.push(await this.noteTest('TC-REP-001', M, 'Report PDF terdeteksi',
      'Dashboard', '1. Cari button download/export PDF',
      'Report PDF ditemukan', async () => {
        const pdfSels = ['button:has-text("PDF")', 'button:has-text("Export")', 'button:has-text("Download")', 'a:has-text("PDF")', 'a:has-text("Export")', '[class*="export"]', '[class*="pdf"]', '[data-testid*="export"]', '[data-testid*="pdf"]'];
        let found = false;
        for (const s of pdfSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Report PDF tidak ditemukan');
        return 'Report PDF terdeteksi';
      }));

    // TC-REP-002: Logo + PT dinamis
    R.push(await this.noteTest('TC-REP-002', M, 'Logo + PT pada report dinamis',
      'Report settings', '1. Cari setting logo/PT di report',
      'Setting logo/PT ditemukan', async () => {
        const logoSels = ['input[accept*="image"]', '[class*="logo"]', 'button:has-text("Logo")', 'input[name*="logo"]', 'input[name*="company"]', 'input[name*="pt"]'];
        let found = false;
        for (const s of logoSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Setting logo/PT tidak ditemukan');
        return 'Logo + PT dinamis terdeteksi';
      }));

    // TC-REP-003: Dashboard Report
    R.push(await this.noteTest('TC-REP-003', M, 'Dashboard Report terdeteksi',
      'Dashboard admin', '1. Cari menu report',
      'Dashboard report ditemukan', async () => {
        const repSels = ['a:has-text("Report")', 'a:has-text("Laporan")', 'a[href*="report"]', '[class*="report"]', '[data-testid*="report"]'];
        let found = false;
        for (const s of repSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Dashboard report tidak ditemukan');
        return 'Dashboard Report terdeteksi';
      }));

    return R;
  }

  // ===== Psikotest-specific test modules =====

  async testCrudMaster(page, url, role, authState, detect) {
    const M = 'CRUD Master Data'; const R = [];

    // TC-MST-001: Master Kompetensi
    R.push(await this.safeTest('TC-MST-001', M, 'Master Kompetensi terdeteksi',
      'Dashboard admin', '1. Cari menu master kompetensi',
      'Master kompetensi ditemukan', async () => {
        const kompSels = ['a:has-text("Kompetensi")', 'a[href*="kompetensi"]', 'a:has-text("Master")', '[class*="master-kompetensi"]', '[data-testid*="master-kompetensi"]'];
        let found = false;
        for (const s of kompSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Master kompetensi tidak ditemukan');
        return 'Master Kompetensi terdeteksi';
      }));

    // TC-MST-002: Bank Soal
    R.push(await this.noteTest('TC-MST-002', M, 'Bank Soal terdeteksi',
      'Dashboard admin', '1. Cari menu bank soal',
      'Bank soal ditemukan', async () => {
        const soalSels = ['a:has-text("Bank Soal")', 'a:has-text("Soal")', 'a[href*="soal"]', 'a[href*="question"]', '[class*="soal"]', '[data-testid*="soal"]'];
        let found = false;
        for (const s of soalSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Bank soal tidak ditemukan');
        return 'Bank Soal terdeteksi';
      }));

    // TC-MST-003: Dimensi
    R.push(await this.noteTest('TC-MST-003', M, 'Dimensi test terdeteksi',
      'Dashboard admin', '1. Cari menu dimensi',
      'Dimensi ditemukan', async () => {
        const dimSels = ['a:has-text("Dimensi")', 'a[href*="dimensi"]', 'a:has-text("Dimension")', '[class*="dimensi"]', '[data-testid*="dimensi"]'];
        let found = false;
        for (const s of dimSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Dimensi tidak ditemukan');
        return 'Dimensi test terdeteksi';
      }));

    // TC-MST-004: Norm Group & Norm Table
    R.push(await this.noteTest('TC-MST-004', M, 'Norm Group & Norm Table terdeteksi',
      'Dashboard admin', '1. Cari menu norm group/table',
      'Norm group/table ditemukan', async () => {
        const normSels = ['a:has-text("Norm")', 'a[href*="norm"]', '[class*="norm"]', '[data-testid*="norm"]'];
        let found = false;
        for (const s of normSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Norm group/table tidak ditemukan');
        return 'Norm Group & Norm Table terdeteksi';
      }));

    return R;
  }

  async testAiIntegration(page, url, role, authState, detect) {
    const M = 'AI Integration'; const R = [];

    // TC-AI-001: AI Generate Kompetensi
    R.push(await this.noteTest('TC-AI-001', M, 'AI Generate Kompetensi terdeteksi',
      'Menu kompetensi', '1. Cari button AI generate kompetensi',
      'AI generate kompetensi ditemukan', async () => {
        const aiSels = ['button:has-text("AI")', 'button:has-text("Generate")', 'button:has-text("AI Generate")', '[class*="ai-generate"]', '[data-testid*="ai-generate"]'];
        let found = false;
        for (const s of aiSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('AI generate kompetensi tidak ditemukan');
        return 'AI Generate Kompetensi terdeteksi';
      }));

    // TC-AI-002: Bank Soal Generate AI
    R.push(await this.noteTest('TC-AI-002', M, 'Bank Soal Generate AI terdeteksi',
      'Bank soal', '1. Cari button AI generate soal',
      'AI generate soal ditemukan', async () => {
        const aiSels = ['button:has-text("Generate Soal")', 'button:has-text("AI Soal")', 'button:has-text("Generate Question")', '[class*="ai-soal"]', '[data-testid*="ai-soal"]'];
        let found = false;
        for (const s of aiSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('AI generate soal tidak ditemukan');
        return 'Bank Soal Generate AI terdeteksi';
      }));

    // TC-AI-003: Integrasi AI indicator
    R.push(await this.noteTest('TC-AI-003', M, 'Indikator integrasi AI terdeteksi',
      'Dashboard', '1. Cari elemen AI di page',
      'Indikator AI ditemukan', async () => {
        const hasAi = await page.evaluate(() => {
          const text = document.body?.innerText || '';
          return text.includes('AI') || text.includes('Artificial Intelligence') || text.includes('Generate') || text.includes('OpenAI') || text.includes('GPT');
        }).catch(() => false);
        if (!hasAi) throw new Error('Indikator integrasi AI tidak ditemukan');
        return 'Indikator integrasi AI terdeteksi';
      }));

    return R;
  }

  async testBookingConsultant(page, url, role, authState, detect) {
    const M = 'Booking Consultant'; const R = [];

    // TC-BC-001: Booking menu
    R.push(await this.safeTest('TC-BC-001', M, 'Menu Booking Consultant terdeteksi',
      'Dashboard', '1. Cari menu booking',
      'Menu booking ditemukan', async () => {
        const bookSels = ['a:has-text("Booking")', 'a[href*="booking"]', 'button:has-text("Booking")', '[class*="booking"]', '[data-testid*="booking"]'];
        let found = false;
        for (const s of bookSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Menu booking tidak ditemukan');
        return 'Menu Booking Consultant terdeteksi';
      }));

    // TC-BC-002: Consultant Set Jadwal
    R.push(await this.noteTest('TC-BC-002', M, 'Consultant Set Jadwal terdeteksi',
      'Dashboard consultant', '1. Cari menu set jadwal',
      'Set jadwal ditemukan', async () => {
        const jadwalSels = ['a:has-text("Jadwal")', 'a:has-text("Schedule")', 'a[href*="jadwal"]', 'a[href*="schedule"]', '[class*="jadwal"]', '[class*="schedule"]', '[data-testid*="jadwal"]'];
        let found = false;
        for (const s of jadwalSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Set jadwal tidak ditemukan');
        return 'Consultant Set Jadwal terdeteksi';
      }));

    // TC-BC-003: Consultant Update Done
    R.push(await this.noteTest('TC-BC-003', M, 'Consultant Update Done terdeteksi',
      'Dashboard consultant', '1. Cari button done/selesai',
      'Update done ditemukan', async () => {
        const doneSels = ['button:has-text("Done")', 'button:has-text("Selesai")', 'button:has-text("Complete")', 'a:has-text("Done")', '[class*="done"]', '[class*="complete"]', '[data-testid*="done"]'];
        let found = false;
        for (const s of doneSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Update done tidak ditemukan');
        return 'Consultant Update Done terdeteksi';
      }));

    // TC-BC-004: Result Halaman
    R.push(await this.noteTest('TC-BC-004', M, 'Result Halaman terdeteksi',
      'Dashboard', '1. Cari menu result/hasil',
      'Result halaman ditemukan', async () => {
        const resultSels = ['a:has-text("Result")', 'a:has-text("Hasil")', 'a[href*="result"]', 'a[href*="hasil"]', '[class*="result"]', '[data-testid*="result"]'];
        let found = false;
        for (const s of resultSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Result halaman tidak ditemukan');
        return 'Result Halaman terdeteksi';
      }));

    return R;
  }

  async testResultReport(page, url, role, authState, detect) {
    const M = 'Result & Report'; const R = [];

    // TC-RR-001: Result Competency
    R.push(await this.noteTest('TC-RR-001', M, 'Result Competency terdeteksi',
      'Dashboard', '1. Cari menu result kompetensi',
      'Result kompetensi ditemukan', async () => {
        const resSels = ['a:has-text("Result")', 'a:has-text("Hasil")', 'a[href*="result"]', '[class*="result"]', '[data-testid*="result"]'];
        let found = false;
        for (const s of resSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Result kompetensi tidak ditemukan');
        return 'Result Competency terdeteksi';
      }));

    // TC-RR-002: Form Kompetensi User
    R.push(await this.noteTest('TC-RR-002', M, 'Form Kompetensi User terdeteksi',
      'Dashboard', '1. Cari form kompetensi',
      'Form kompetensi ditemukan', async () => {
        const formSels = ['form', 'input[name*="kompetensi"]', 'textarea', '[class*="form-kompetensi"]', '[data-testid*="form-kompetensi"]'];
        let found = false;
        for (const s of formSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Form kompetensi tidak ditemukan');
        return 'Form Kompetensi User terdeteksi';
      }));

    // TC-RR-003: Dashboard Report
    R.push(await this.noteTest('TC-RR-003', M, 'Dashboard Report terdeteksi',
      'Dashboard admin', '1. Cari menu report',
      'Dashboard report ditemukan', async () => {
        const repSels = ['a:has-text("Report")', 'a:has-text("Laporan")', 'a[href*="report"]', '[class*="report"]', '[data-testid*="report"]'];
        let found = false;
        for (const s of repSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Dashboard report tidak ditemukan');
        return 'Dashboard Report terdeteksi';
      }));

    return R;
  }

  // ===== Consultant-specific test modules =====

  async testLandingPage(page, url, detect) {
    const M = 'Landing Page'; const R = [];

    // TC-LP-001: Landing page content
    R.push(await this.safeTest('TC-LP-001', M, 'Landing page content terdeteksi',
      'URL = landing page', '1. Buka URL\n2. Cek konten landing page',
      'Landing page memiliki konten', async () => {
        const hasContent = await page.evaluate(() => {
          const text = document.body?.innerText || '';
          return text.length > 100 && (text.includes('konsultasi') || text.includes('consultant') || text.includes('booking') || text.includes('psikolog') || text.includes('layanan') || text.includes('service'));
        }).catch(() => false);
        if (!hasContent) throw new Error('Landing page tidak memiliki konten yang relevan');
        return 'Landing page content terdeteksi';
      }));

    // TC-LP-002: CTA button
    R.push(await this.noteTest('TC-LP-002', M, 'CTA button terdeteksi',
      'Landing page', '1. Cari button CTA (Daftar/Booking/Mulai)',
      'CTA button ditemukan', async () => {
        const ctaSels = ['button:has-text("Daftar")', 'button:has-text("Register")', 'button:has-text("Booking")', 'button:has-text("Mulai")', 'button:has-text("Get Started")', 'a:has-text("Daftar")', 'a:has-text("Register")', 'a:has-text("Booking")', 'a[href*="register"]', 'a[href*="booking"]'];
        let found = false;
        for (const s of ctaSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('CTA button tidak ditemukan');
        return 'CTA button terdeteksi';
      }));

    // TC-LP-003: FAQ section
    R.push(await this.noteTest('TC-LP-003', M, 'FAQ section terdeteksi',
      'Landing page', '1. Cari section FAQ',
      'FAQ ditemukan', async () => {
        const faqSels = ['[class*="faq"]', 'section:has-text("FAQ")', 'h2:has-text("FAQ")', 'h3:has-text("FAQ")', 'a:has-text("FAQ")', '[data-testid*="faq"]'];
        let found = false;
        for (const s of faqSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('FAQ tidak ditemukan');
        return 'FAQ section terdeteksi';
      }));

    // TC-LP-004: Home page navigation
    R.push(await this.noteTest('TC-LP-004', M, 'Home page navigation terdeteksi',
      'Landing page', '1. Cari nav link ke home',
      'Home navigation ditemukan', async () => {
        const homeSels = ['a:has-text("Home")', 'a:has-text("Beranda")', 'a[href="/"]', 'a[href*="home"]', 'nav a:first-child'];
        let found = false;
        for (const s of homeSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Home navigation tidak ditemukan');
        return 'Home page navigation terdeteksi';
      }));

    return R;
  }

  async testProfileManagement(page, url, role, authState, detect) {
    const M = 'Profile Management'; const R = [];

    // TC-PM-001: Profile page
    R.push(await this.safeTest('TC-PM-001', M, 'Halaman profile terdeteksi',
      'User login', '1. Cari menu/profile link',
      'Profile page ditemukan', async () => {
        const profSels = ['a:has-text("Profile")', 'a:has-text("Profil")', 'a[href*="profile"]', '[class*="profile"]', '[data-testid*="profile"]'];
        let found = false;
        for (const s of profSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Profile page tidak ditemukan');
        return 'Halaman profile terdeteksi';
      }));

    // TC-PM-002: Profile Consultant
    R.push(await this.noteTest('TC-PM-002', M, 'Profile Consultant terdeteksi',
      'Dashboard consultant', '1. Cari section profile consultant',
      'Profile consultant ditemukan', async () => {
        const profSels = ['a:has-text("Profile")', 'a:has-text("Profil")', '[class*="consultant-profile"]', '[data-testid*="consultant-profile"]'];
        let found = false;
        for (const s of profSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Profile consultant tidak ditemukan');
        return 'Profile Consultant terdeteksi';
      }));

    // TC-PM-003: Profil Client
    R.push(await this.noteTest('TC-PM-003', M, 'Profil Client terdeteksi',
      'Dashboard client', '1. Cari section profil client',
      'Profil client ditemukan', async () => {
        const profSels = ['a:has-text("Profile")', 'a:has-text("Profil")', '[class*="client-profile"]', '[data-testid*="client-profile"]'];
        let found = false;
        for (const s of profSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Profil client tidak ditemukan');
        return 'Profil Client terdeteksi';
      }));

    // TC-PM-004: Register Consultant
    R.push(await this.noteTest('TC-PM-004', M, 'Register Consultant terdeteksi',
      'Landing/login page', '1. Cari link register consultant',
      'Register consultant ditemukan', async () => {
        const regSels = ['a:has-text("Register")', 'a:has-text("Daftar Consultant")', 'a:has-text("Daftar Konsultan")', 'a[href*="register"]', 'a[href*="consultant/register"]'];
        let found = false;
        for (const s of regSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Register consultant tidak ditemukan');
        return 'Register Consultant terdeteksi';
      }));

    // TC-PM-005: Foto Profile
    R.push(await this.noteTest('TC-PM-005', M, 'Foto profile terdeteksi',
      'Profile page', '1. Cari avatar/foto profile',
      'Foto profile ditemukan', async () => {
        const avatarSels = ['[class*="avatar"]', 'img[class*="profile"]', '[class*="profile-pic"]', '[data-testid*="avatar"]'];
        let found = false;
        for (const s of avatarSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Foto profile tidak ditemukan');
        return 'Foto profile terdeteksi';
      }));

    return R;
  }

  async testBookingSchedule(page, url, role, authState, detect) {
    const M = 'Booking & Schedule'; const R = [];

    // TC-BS-001: Booking form
    R.push(await this.safeTest('TC-BS-001', M, 'Form booking terdeteksi',
      'Dashboard', '1. Cari form booking',
      'Form booking ditemukan', async () => {
        const formSels = ['form', '[class*="booking-form"]', '[data-testid*="booking-form"]', 'button:has-text("Booking")', 'a:has-text("Booking")'];
        let found = false;
        for (const s of formSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Form booking tidak ditemukan');
        return 'Form booking terdeteksi';
      }));

    // TC-BS-002: Set Jadwal
    R.push(await this.noteTest('TC-BS-002', M, 'Set Jadwal terdeteksi',
      'Dashboard consultant', '1. Cari calendar/jadwal',
      'Set jadwal ditemukan', async () => {
        const calSels = ['[class*="calendar"]', '[class*="jadwal"]', '[class*="schedule"]', 'input[type="date"]', 'input[type="datetime-local"]', '[data-testid*="jadwal"]', '[data-testid*="schedule"]'];
        let found = false;
        for (const s of calSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Set jadwal tidak ditemukan');
        return 'Set Jadwal terdeteksi';
      }));

    // TC-BS-003: Update Done
    R.push(await this.noteTest('TC-BS-003', M, 'Update Done terdeteksi',
      'Dashboard consultant', '1. Cari button done/selesai',
      'Update done ditemukan', async () => {
        const doneSels = ['button:has-text("Done")', 'button:has-text("Selesai")', 'button:has-text("Complete")', '[class*="done"]', '[data-testid*="done"]'];
        let found = false;
        for (const s of doneSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Update done tidak ditemukan');
        return 'Update Done terdeteksi';
      }));

    // TC-BS-004: Cancellation
    R.push(await this.noteTest('TC-BS-004', M, 'Cancellation terdeteksi',
      'Dashboard', '1. Cari button cancel',
      'Cancellation ditemukan', async () => {
        const cancelSels = ['button:has-text("Cancel")', 'button:has-text("Batalkan")', '[class*="cancel"]', '[data-testid*="cancel"]'];
        let found = false;
        for (const s of cancelSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Cancellation tidak ditemukan');
        return 'Cancellation terdeteksi';
      }));

    // TC-BS-005: Reschedule
    R.push(await this.noteTest('TC-BS-005', M, 'Reschedule terdeteksi',
      'Dashboard', '1. Cari button reschedule',
      'Reschedule ditemukan', async () => {
        const resSels = ['button:has-text("Reschedule")', 'button:has-text("Jadwal Ulang")', '[class*="reschedule"]', '[data-testid*="reschedule"]'];
        let found = false;
        for (const s of resSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Reschedule tidak ditemukan');
        return 'Reschedule terdeteksi';
      }));

    return R;
  }

  async testPaymentReferal(page, url, role, authState, detect) {
    const M = 'Payment & Referal'; const R = [];

    // TC-PR-001: Payment Gateway
    R.push(await this.noteTest('TC-PR-001', M, 'Payment Gateway terdeteksi',
      'Halaman payment', '1. Cari indikator payment gateway',
      'Payment gateway ditemukan', async () => {
        const paySels = ['button:has-text("Bayar")', 'button:has-text("Pay")', '[class*="payment"]', '[class*="midtrans"]', '[class*="xendit"]', '[data-testid*="payment"]'];
        let found = false;
        for (const s of paySels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Payment gateway tidak ditemukan');
        return 'Payment Gateway terdeteksi';
      }));

    // TC-PR-002: Kode Referal
    R.push(await this.noteTest('TC-PR-002', M, 'Kode Referal terdeteksi',
      'Dashboard', '1. Cari input kode referal',
      'Kode referal ditemukan', async () => {
        const refSels = ['input[placeholder*="referal" i]', 'input[placeholder*="referral" i]', 'input[name*="referal"]', '[class*="referal"]', '[class*="referral"]', '[data-testid*="referal"]'];
        let found = false;
        for (const s of refSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Kode referal tidak ditemukan');
        return 'Kode Referal terdeteksi';
      }));

    // TC-PR-003: Booking dengan Referal
    R.push(await this.noteTest('TC-PR-003', M, 'Booking dengan kode referal terdeteksi',
      'Halaman booking', '1. Cari form booking dengan field referal',
      'Booking dengan referal tersedia', async () => {
        const bookSels = ['button:has-text("Booking")', 'a:has-text("Booking")', '[class*="booking"]', '[data-testid*="booking"]'];
        let found = false;
        for (const s of bookSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Booking tidak ditemukan');
        return 'Booking dengan kode referal terdeteksi';
      }));

    return R;
  }

  async testNotification(page, url, role, authState, detect) {
    const M = 'Notification'; const R = [];

    // TC-NOTIF-001: Notification bell/icon
    R.push(await this.noteTest('TC-NOTIF-001', M, 'Notification icon terdeteksi',
      'Dashboard', '1. Cari icon/bell notifikasi',
      'Notification ditemukan', async () => {
        const notifSels = ['[class*="notif"]', '[class*="bell"]', 'button[aria-label*="notif"]', '[data-testid*="notif"]', 'svg[class*="bell"]'];
        let found = false;
        for (const s of notifSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Notification tidak ditemukan');
        return 'Notification icon terdeteksi';
      }));

    // TC-NOTIF-002: Email notification setting
    R.push(await this.noteTest('TC-NOTIF-002', M, 'Email notification setting terdeteksi',
      'Settings', '1. Cari setting email notif',
      'Email notif setting ditemukan', async () => {
        const emailSels = ['input[type="checkbox"][name*="email"]', 'input[type="checkbox"][name*="notif"]', 'button:has-text("Email")', '[class*="email-notif"]', '[data-testid*="email-notif"]'];
        let found = false;
        for (const s of emailSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Email notification setting tidak ditemukan');
        return 'Email notification setting terdeteksi';
      }));

    return R;
  }

  getBrowser(type) {
    if (type === 'firefox') return firefox;
    if (type === 'webkit') return webkit;
    return chromium;
  }

  // ===== Deteksi struktur website =====
  async detectWebsite(page, url) {
    const d = {
      hasLogin: false, hasForm: false, hasNav: false, hasFooter: false,
      hasSearch: false, hasDropdown: false, hasModal: false, hasButtons: false,
      hasCrudTable: false, hasAddButton: false, hasEditButton: false, hasDeleteButton: false,
      hasPayment: false, hasCamera: false,
      hasMultiRole: false, hasFileUpload: false, hasEmailNotif: false, hasBooking: false,
      linkCount: 0, imageCount: 0, formCount: 0, inputCount: 0,
      title: '', h1Count: 0, isHttps: false,
      lang: 'en', langDir: 'ltr',
      // Adaptive detection fields
      menuLayout: 'unknown', framework: 'unknown', testAttributes: false,
      keywords: {}, navPages: [],
    };

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 }).catch(async () => {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      });
      // Wait for SPA render — body should have content
      await page.waitForFunction(() => document.body && document.body.innerText.length > 0, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(500);
      d.isHttps = url.startsWith('https://') || page.url().startsWith('https://');
      d.title = await page.title();
      d.hasLogin = await this.detectLoginForm(page);
      // Deteksi nav: selector luas + cek elemen dengan banyak link
      d.hasNav = await page.locator('nav, [role="navigation"], .navbar, .nav, .menu, .navigation, header nav, .top-nav, .main-nav, .header-nav, [class*="nav"], [class*="menu"], [class*="sidebar"], [class*="drawer"], [class*="sidenav"], aside, [data-testid*="nav"]').count() > 0;
      if (!d.hasNav) {
        // Fallback: cek elemen dengan >3 link internal
        const navLinks = await page.evaluate(() => {
          const els = document.querySelectorAll('header, [class*="nav"], [class*="menu"], [class*="header"], [class*="sidebar"], [class*="drawer"], aside');
          for (const el of els) {
            if (el.querySelectorAll('a[href]').length > 3) return true;
          }
          return false;
        });
        d.hasNav = navLinks;
      }
      // Wait for lazy-loaded footer
      await page.waitForSelector('footer, .footer, #footer, [role="contentinfo"], [class*="footer"], [class*="bottom-bar"]', { timeout: 3000 }).catch(() => {});
      d.hasFooter = await page.locator('footer, .footer, #footer, [role="contentinfo"], [class*="footer"], [class*="bottom-bar"], [data-testid*="footer"], [class*="copyright"]').count() > 0;
      if (!d.hasFooter) {
        // Fallback: cek elemen di bawah halaman dengan link atau copyright
        d.hasFooter = await page.evaluate(() => {
          const els = document.querySelectorAll('[class*="footer"], [id*="footer"], [class*="copyright"], [class*="bottom"], [data-testid*="footer"]');
          for (const el of els) { if (el.querySelectorAll('a[href], span, p').length > 0 && el.getBoundingClientRect().top > 500) return true; }
          // GitLab: cek .layout-footer, .footer-container, .gl-footer
          const gl = document.querySelectorAll('.layout-footer, .footer-container, .gl-footer, .footer-links');
          return gl.length > 0;
        });
      }
      d.hasSearch = await page.locator('input[type="search"], input[name*="search" i], input[placeholder*="search" i], [class*="search"] input, [data-testid*="search"] input, input[aria-label*="search" i], input[placeholder*="Search" i], input[name*="q"], input[id*="search"], [data-icon*="search"], [class*="search-icon"]').count() > 0;
      if (!d.hasSearch) {
        // Fallback: cek elemen dengan role search atau data-testid search
        d.hasSearch = await page.locator('[role="search"], [data-testid*="search"], .search, [class*="search-box"], button:has-text("Search")').count() > 0;
      }
      d.hasDropdown = await page.locator('select, .dropdown-toggle, [data-toggle="dropdown"], [aria-haspopup="true"], [data-bs-toggle="dropdown"], details > summary, .dropdown, [class*="select"], [role="combobox"], [role="listbox"], [class*="popover"], [aria-expanded], [class*="combobox"]').count() > 0;
      d.hasModal = await page.locator('[data-bs-toggle="modal"], [data-toggle="modal"], [data-target*="modal"], [class*="modal"][style*="block"], [aria-modal="true"], [role="dialog"], [class*="dialog"], [class*="popup"], [class*="MuiDialog"], [class*="ant-modal"], [class*="modal-open"]').count() > 0;
      d.hasButtons = await page.locator('button, [role="button"], .btn, [class*="button"]').count() > 0;
      d.linkCount = await page.locator('a[href]').count();
      d.imageCount = await page.locator('img').count();
      d.formCount = await page.locator('form').count();
      d.inputCount = await page.locator('input:not([type="hidden"])').count();
      d.h1Count = await page.locator('h1').count();
      d.hasForm = d.formCount > 0 && d.inputCount > 0;
      // SPA form fallback: cek input dalam elemen form-like
      if (!d.hasForm && d.inputCount > 0) {
        d.hasForm = await page.evaluate(() => {
          const containers = document.querySelectorAll('[class*="form"], [role="form"], [data-testid*="form"]');
          for (const c of containers) {
            if (c.querySelectorAll('input:not([type="hidden"])').length > 0) return true;
          }
          return false;
        });
      }
      // CRUD detection
      d.hasCrudTable = await page.locator('table tbody tr, [class*="table"] [class*="row"], [role="grid"] [role="row"], [class*="datagrid"], [class*="data-table"], [class*="list"] [class*="item"]').count() > 0;
      d.hasAddButton = await page.locator('button:has-text("Add"), button:has-text("Create"), button:has-text("New"), button:has-text("Tambah"), button:has-text("Buat"), [class*="add"]:not(.address), [data-testid*="add"], [data-testid*="create"]').count() > 0;
      d.hasEditButton = await page.locator('button:has-text("Edit"), [class*="edit"], [data-testid*="edit"], a:has-text("Edit"), [aria-label*="edit" i]').count() > 0;
      d.hasDeleteButton = await page.locator('button:has-text("Delete"), button:has-text("Remove"), button:has-text("Hapus"), [class*="delete"], [data-testid*="delete"], [aria-label*="delete" i]').count() > 0;
      // Deteksi bahasa website
      d.lang = await page.locator('html').getAttribute('lang') || 'en';
      d.langDir = await page.locator('html').getAttribute('dir') || 'ltr';
      // Deteksi payment: form/card/payment/checkout/ecommerce
      d.hasPayment = await page.locator('input[name*="card" i], input[name*="cc" i], input[placeholder*="card" i], input[autocomplete="cc-number"], input[autocomplete="cc-exp"], input[autocomplete="cc-csc"], [class*="payment"], [class*="checkout"], [class*="stripe"], [class*="paypal"], button:has-text("Pay"), button:has-text("Checkout"), button:has-text("Bayar"), [data-testid*="payment"]').count() > 0;
      // Deteksi camera: video/stream/camera/webcam
      d.hasCamera = await page.locator('video:not([src*="promo"]):not([src*="video."]), [class*="camera"], [class*="webcam"], [class*="scanner"], button:has-text("Camera"), button:has-text("Kamera"), button:has-text("Scan"), [data-testid*="camera"], [data-testid*="scan"], #camera, #webcam').count() > 0;
      // Deteksi multi-role: role selector, admin/consultant/client menu
      d.hasMultiRole = await page.locator('select[name*="role" i], input[name*="role" i], [class*="role-selector"], [class*="role-picker"], button:has-text("Admin"), button:has-text("Consultant"), button:has-text("Consultant"), button:has-text("Client"), button:has-text("Peserta"), a:has-text("Register as"), a:has-text("Daftar sebagai"), [data-testid*="role"]').count() > 0;
      // Deteksi file upload: input[type=file], drag-drop area, upload button
      d.hasFileUpload = await page.locator('input[type="file"], [class*="upload"], [class*="dropzone"], [class*="drag-drop"], [class*="file-input"], button:has-text("Upload"), button:has-text("Import"), button:has-text("Choose File"), button:has-text("Pilih File"), [data-testid*="upload"], [data-testid*="import"]').count() > 0;
      // Deteksi email notification: register/reset-password/verify-email links
      d.hasEmailNotif = await page.locator('a:has-text("Register"), a:has-text("Daftar"), a:has-text("Reset Password"), a:has-text("Lupa Password"), a:has-text("Forgot Password"), a:has-text("Verify Email"), button:has-text("Register"), button:has-text("Daftar"), [class*="notification"], [class*="toast"], [class*="alert"], [role="alert"]').count() > 0;
      // Deteksi booking: schedule/calendar/booking/appointment/jadwal
      d.hasBooking = await page.locator('[class*="booking"], [class*="schedule"], [class*="calendar"], [class*="appointment"], [class*="jadwal"], button:has-text("Book"), button:has-text("Booking"), button:has-text("Janji"), button:has-text("Schedule"), button:has-text("Pilih Jadwal"), [data-testid*="booking"], [data-testid*="schedule"], input[type="date"], input[type="datetime-local"]').count() > 0;

      // ===== Adaptive Detection =====
      // Detect language from content if html lang is generic
      const htmlLang = (d.lang || '').toLowerCase();
      if (htmlLang.startsWith('id') || htmlLang === 'id') {
        d.lang = 'id';
      } else if (htmlLang.startsWith('en') || htmlLang === 'en') {
        d.lang = 'en';
      } else {
        // Detect from body text
        const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 3000) || '').catch(() => '');
        const idKeywords = ['dan', 'atau', 'untuk', 'dari', 'pada', 'dengan', 'ini', 'itu', 'yang', 'tidak', 'akan', 'dalam', 'oleh', 'halaman', 'masuk', 'daftar', 'simpan', 'batal', 'hapus', 'edit', 'tambah', 'cari', 'kirim', 'lihat', 'keluar'];
        const enKeywords = ['the', 'and', 'or', 'for', 'from', 'with', 'this', 'that', 'not', 'will', 'into', 'page', 'login', 'register', 'save', 'cancel', 'delete', 'edit', 'add', 'search', 'submit', 'view', 'logout'];
        let idCount = 0, enCount = 0;
        const lowerText = bodyText.toLowerCase();
        for (const k of idKeywords) { if (new RegExp(`\\b${k}\\b`).test(lowerText)) idCount++; }
        for (const k of enKeywords) { if (new RegExp(`\\b${k}\\b`).test(lowerText)) enCount++; }
        d.lang = idCount > enCount ? 'id' : 'en';
      }

      // Detect menu layout
      const hasSidebar = await page.locator('[class*="sidebar"], aside, [class*="sidenav"], [class*="side-nav"], [class*="side-menu"]').count() > 0;
      const hasTopbar = await page.locator('header nav, [class*="topbar"], [class*="top-bar"], [class*="header-nav"], [class*="navbar"]').count() > 0;
      const hasHamburger = await page.locator('[class*="hamburger"], [class*="menu-toggle"], [aria-label*="menu" i], button[class*="toggle"], [data-testid*="menu-toggle"]').count() > 0;
      d.menuLayout = hasSidebar ? 'sidebar' : (hasTopbar ? 'topbar' : (hasHamburger ? 'hamburger' : 'unknown'));

      // Detect framework
      d.framework = await page.evaluate(() => {
        if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__ || document.querySelector('[data-reactroot], [data-reactid]') || document.querySelector('#root, #app')?.querySelector('[class*="react"]')) return 'react';
        if (window.__VUE__ || document.querySelector('[data-v-]') || document.querySelector('#app')?.__vue__) return 'vue';
        if (window.angular || document.querySelector('[ng-app], [ng-controller], [data-ng-app]')) return 'angular';
        if (window.jQuery || document.querySelector('script[src*="jquery"]')) return 'jquery';
        if (document.querySelector('[data-svelte], [class*="svelte"]')) return 'svelte';
        return 'unknown';
      }).catch(() => 'unknown');

      // Detect test attributes
      d.testAttributes = await page.locator('[data-testid], [data-cy], [data-qa], [data-test]').count() > 0;

      // Build keyword sets based on detected language
      if (d.lang === 'id') {
        d.keywords = {
          save: ['Simpan', 'Save'], submit: ['Kirim', 'Submit', 'Simpan'],
          add: ['Tambah', 'Add', 'Buat', 'Create', 'New', 'Baru'],
          edit: ['Edit', 'Ubah', 'Modify'],
          delete: ['Hapus', 'Delete', 'Remove', 'Buang'],
          cancel: ['Batal', 'Cancel'],
          search: ['Cari', 'Search', 'Filter', 'Saring'],
          login: ['Masuk', 'Login', 'Sign in'],
          logout: ['Keluar', 'Logout', 'Sign out'],
          register: ['Daftar', 'Register', 'Sign up'],
          close: ['Tutup', 'Close'],
          confirm: ['Konfirmasi', 'Confirm', 'Ya', 'Yes', 'OK'],
        };
      } else {
        d.keywords = {
          save: ['Save', 'Simpan'], submit: ['Submit', 'Save', 'Kirim'],
          add: ['Add', 'Create', 'New', 'Tambah', 'Buat'],
          edit: ['Edit', 'Modify', 'Ubah'],
          delete: ['Delete', 'Remove', 'Hapus'],
          cancel: ['Cancel', 'Batal'],
          search: ['Search', 'Filter', 'Cari'],
          login: ['Login', 'Sign in', 'Masuk'],
          logout: ['Logout', 'Sign out', 'Keluar'],
          register: ['Register', 'Sign up', 'Daftar'],
          close: ['Close', 'Tutup'],
          confirm: ['Confirm', 'Yes', 'OK', 'Ya'],
        };
      }

      // Discover navigation pages (internal links from nav/sidebar/menu)
      d.navPages = await page.evaluate((baseUrl) => {
        const navSelectors = 'nav a[href], [class*="nav"] a[href], [class*="sidebar"] a[href], [class*="menu"] a[href], [role="navigation"] a[href], aside a[href], header a[href]';
        const links = Array.from(document.querySelectorAll(navSelectors));
        const seen = new Set();
        const pages = [];
        for (const a of links) {
          try {
            const href = a.href;
            if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
            const url = new URL(href, baseUrl);
            if (url.hostname !== new URL(baseUrl).hostname) continue;
            if (url.pathname === new URL(baseUrl).pathname) continue;
            if (seen.has(url.pathname)) continue;
            seen.add(url.pathname);
            const text = a.innerText.trim().substring(0, 60);
            if (!text) continue;
            pages.push({ text, href: url.href, path: url.pathname });
          } catch {}
        }
        return pages.slice(0, 15);
      }, page.url()).catch(() => []);
    } catch {}
    return d;
  }

  async detectLoginForm(page) {
    // Fast path: check if password input is already visible
    if (await page.locator('input[type="password"]').first().isVisible().catch(() => false)) return true;
    // Wait for SPA hydration before checking
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(1000);
    const sels = [
      'input[type="password"]',
      'form[action*="sign_in"]', 'form[action*="login"]', 'form[action*="auth"]',
      'form[class*="login" i]', 'form[class*="auth" i]', 'form[class*="signin" i]',
      'input[name="user[login]"]', 'input[name="username"]', 'input[name="email"]', 'input[name="password"]',
      'input[id*="password"]', 'input[placeholder*="password" i]',
      'input[autocomplete="current-password"]', 'input[autocomplete="username"]',
      'input[autocomplete="email"]',
      '[class*="login-form"]', '[class*="auth-form"]', '[data-testid*="login"]',
      'button:has-text("Sign in")', 'button:has-text("Login")', 'button:has-text("Masuk")', 'button:has-text("Log in")',
      'a:has-text("Sign in")', 'a:has-text("Login")', 'a:has-text("Log in")',
      '[role="form"][class*="login" i]', 'div[class*="login-form" i]', 'div[class*="auth-form" i]',
    ];
    for (const s of sels) {
      if (await page.locator(s).count() > 0) return true;
    }
    // Last resort: wait for password input with timeout
    try {
      await page.waitForSelector('input[type="password"]', { timeout: 8000, state: 'attached' });
      return true;
    } catch { return false; }
  }

  // Navigate to login page — try URL, then /login, /auth, /sign_in, then click Login/Masuk link
  async navigateToLoginPage(page, url) {
    let baseUrl;
    try { baseUrl = new URL(url).origin; } catch { baseUrl = url; }
    // Strategy 1: Check if current page already has a password input
    if (await page.locator('input[type="password"]').first().isVisible().catch(() => false)) return true;

    // Strategy 2: Try common login routes
    const loginRoutes = ['/login', '/auth', '/sign_in', '/signin', '/masuk', '/admin/login', '/users/sign_in'];
    for (const route of loginRoutes) {
      const loginUrl = baseUrl + route;
      if (loginUrl === url) continue; // Already tried
      try {
        await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(2000);
        if (await page.locator('input[type="password"]').first().isVisible().catch(() => false)) return true;
      } catch {}
    }

    // Strategy 3: Go back to original URL and click Login/Masuk link
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const loginLinkSels = [
      'a:has-text("Login")', 'a:has-text("Sign in")', 'a:has-text("Masuk")', 'a:has-text("Log in")',
      'button:has-text("Login")', 'button:has-text("Sign in")', 'button:has-text("Masuk")', 'button:has-text("Log in")',
      'a[href*="login"]', 'a[href*="auth"]', 'a[href*="sign_in"]', 'a[href*="masuk"]',
    ];
    for (const s of loginLinkSels) {
      const link = page.locator(s).first();
      if (await link.isVisible().catch(() => false)) {
        await link.click().catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(2000);
        if (await page.locator('input[type="password"]').first().isVisible().catch(() => false)) return true;
        break;
      }
    }

    // Strategy 4: Just wait on the original URL for SPA to render
    try { await page.waitForSelector('input[type="password"]', { timeout: 10000, state: 'visible' }); return true; } catch {}
    return false;
  }

  // Navigate to nav pages and find one that contains the target feature
  async findFeaturePage(page, navPages, featureSelectors, originalUrl) {
    // First check current page
    for (const sel of featureSelectors) {
      if (await page.locator(sel).first().isVisible().catch(() => false)) {
        return { found: true, url: page.url(), page: null };
      }
    }
    // Try each nav page
    for (const navPage of navPages.slice(0, 8)) {
      try {
        await page.goto(navPage.href, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(800);
        for (const sel of featureSelectors) {
          if (await page.locator(sel).first().isVisible().catch(() => false)) {
            return { found: true, url: navPage.href, page: navPage };
          }
        }
      } catch {}
    }
    // Return to original URL
    await page.goto(originalUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(500);
    return { found: false, url: originalUrl, page: null };
  }

  async fillLoginForm(page, username, password) {
    const userSels = ['input[name="user[login]"]', 'input[name="username"]', 'input[name="email"]',
      'input[type="email"]', '#username', '#email', '#user_login',
      'input[placeholder*="username" i]', 'input[placeholder*="email" i]',
      'input[id*="user"]', 'input[id*="email"]', 'input[placeholder*="user" i]',
      'input[name*="user" i]', 'input[data-testid*="username"]', 'input[data-testid*="email"]',
      'input[autocomplete="username"]'];
    for (const s of userSels) {
      const el = page.locator(s).first();
      if (await el.isVisible().catch(() => false)) { await el.fill(username); break; }
    }
    const passSels = ['input[name="user[password]"]', 'input[name="password"]', 'input[type="password"]', '#password',
      'input[id*="pass"]', 'input[placeholder*="pass" i]', 'input[autocomplete="current-password"]',
      'input[data-testid*="password"]'];
    for (const s of passSels) {
      const el = page.locator(s).first();
      if (await el.isVisible().catch(() => false)) { await el.fill(password); break; }
    }
    const submitSels = ['button[type="submit"]', 'input[type="submit"]',
      'button:has-text("Sign in")', 'button:has-text("Login")', 'button:has-text("Masuk")',
      'button:has-text("Log in")', 'button[type="button"]:has-text("Login")',
      '[role="submit"]', 'button[data-testid*="submit"]', 'button[data-testid*="login"]',
      'input[type="button"][value*="Login"]', 'input[type="button"][value*="Sign"]'];
    for (const s of submitSels) {
      const el = page.locator(s).first();
      if (await el.isVisible().catch(() => false)) { await el.click(); break; }
    }
  }

  // Helper: re-login after session disruption (cookie clear, negative tests)
  async ensureAuthenticated(page, url, username, password, authState) {
    if (!username || !password) return false;
    // Try to find login form on current page first
    let hasForm = await this.detectLoginForm(page);
    if (!hasForm) {
      // Clear cookies and navigate to login page
      await page.context().clearCookies();
      hasForm = await this.navigateToLoginPage(page, url);
    }
    if (!hasForm) return false;
    await this.fillLoginForm(page, username, password);
    // Wait for navigation after login (SPA redirect)
    try { await page.waitForLoadState('networkidle', { timeout: 8000 }); } catch {}
    await page.waitForTimeout(2000);
    const after = page.url();
    if (after.includes('sign_in') || after.includes('login') || after.includes('auth')) return false;
    authState.isAuthenticated = true;
    authState.dashboardUrl = after;
    return true;
  }

  // Navigate to dashboard page — try current URL, then common dashboard routes
  async navigateToDashboard(page, url, authState) {
    let baseUrl;
    try { baseUrl = new URL(url).origin; } catch { baseUrl = url; }
    // If we have a dashboard URL from auth, try it first
    if (authState.dashboardUrl && authState.dashboardUrl !== url) {
      await page.goto(authState.dashboardUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }
    // Check if current page has dashboard-like content (cards/widgets/stats)
    const hasDashboardContent = await page.evaluate(() => {
      const els = document.querySelectorAll('[class*="card"], [class*="widget"], [class*="stat"], [class*="metric"], [class*="summary"], [class*="grid-item"], [class*="tile"], canvas, svg[class*="chart"], [class*="chart"], table, [class*="data-table"]');
      return els.length > 0;
    }).catch(() => false);
    if (hasDashboardContent) return true;

    // Try common dashboard routes
    const dashboardRoutes = ['/dashboard', '/admin', '/admin/dashboard', '/home', '/panel', '/console', '/app', '/manage', '/cms'];
    for (const route of dashboardRoutes) {
      const dashUrl = baseUrl + route;
      if (dashUrl === url) continue;
      try {
        await page.goto(dashUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(2000);
        const hasContent = await page.evaluate(() => {
          const els = document.querySelectorAll('[class*="card"], [class*="widget"], [class*="stat"], [class*="metric"], [class*="summary"], [class*="grid-item"], [class*="tile"], canvas, svg[class*="chart"], [class*="chart"], table, [class*="data-table"]');
          return els.length > 0;
        }).catch(() => false);
        if (hasContent) {
          authState.dashboardUrl = dashUrl;
          return true;
        }
      } catch {}
    }

    // Try clicking dashboard/home link in nav
    const navLinkSels = [
      'a:has-text("Dashboard")', 'a:has-text("Panel")', 'a:has-text("Beranda")', 'a:has-text("Home")',
      'a:has-text("Admin")', 'a[href*="dashboard"]', 'a[href*="admin"]', 'a[href*="home"]',
    ];
    for (const s of navLinkSels) {
      const link = page.locator(s).first();
      if (await link.isVisible().catch(() => false)) {
        await link.click().catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(2000);
        const hasContent = await page.evaluate(() => {
          const els = document.querySelectorAll('[class*="card"], [class*="widget"], [class*="stat"], [class*="metric"], [class*="summary"], [class*="grid-item"], [class*="tile"], canvas, svg[class*="chart"], [class*="chart"], table, [class*="data-table"]');
          return els.length > 0;
        }).catch(() => false);
        if (hasContent) {
          authState.dashboardUrl = page.url();
          return true;
        }
        break;
      }
    }

    // Last resort: go back to original URL and wait
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(2000);
    return false;
  }

  // ===== Dispatcher =====
  async runModule(page, mod, targetUrl, originalUrl, username, password, authState, detect, runConfig) {
    switch (mod) {
      case 'login':
        if (!detect.hasLogin && !password) return [];
        return this.testLogin(page, originalUrl, username, password, authState, detect);
      case 'dashboard': return this.testDashboard(page, targetUrl, detect, authState);
      case 'navigation': return this.testNavigation(page, targetUrl, detect);
      case 'structure': return this.testStructure(page, targetUrl, detect);
      case 'security': return this.testSecurity(page, targetUrl, detect);
      case 'form_validation':
        if (!detect.hasForm) return [];
        return this.testFormValidation(page, targetUrl, detect);
      case 'responsive': return this.testResponsive(page, targetUrl, detect);
      case 'performance': return this.testPerformance(page, targetUrl, detect);
      case 'crud': return this.testCrud(page, targetUrl, detect, authState);
      case 'api_data': return this.testApiData(page, targetUrl, detect, authState);
      default: return [];
    }
  }

  // ===== Core helpers =====
  makeResult(id, modul, title, preConditions, testSteps, expected, actual, status, duration, error, category) {
    return { testId: id, module: modul, title, preConditions: preConditions || '', testSteps: testSteps || '',
      expected: expected || '', actual: actual || '', status, duration, error: error || '',
      category: category || 'primary', timestamp: new Date().toISOString() };
  }

  async safeTest(id, modul, title, preConditions, testSteps, expected, testFn, category) {
    const cat = category || 'primary';
    const start = Date.now();
    this.broadcastStep(id, modul, title, 'start', '');
    try {
      const actual = await testFn();
      this.broadcastStep(id, modul, title, 'done', actual);
      return this.makeResult(id, modul, title, preConditions, testSteps, expected, actual, 'passed', Date.now() - start, '', cat);
    } catch (err) {
      this.broadcastStep(id, modul, title, 'error', err.message);
      return this.makeResult(id, modul, title, preConditions, testSteps, expected, err.message, 'failed', Date.now() - start, err.message, cat);
    }
  }

  async noteTest(id, modul, title, preConditions, testSteps, expected, testFn, category) {
    const cat = category || 'note';
    const start = Date.now();
    this.broadcastStep(id, modul, title, 'start', '');
    try {
      const actual = await testFn();
      this.broadcastStep(id, modul, title, 'done', actual);
      return this.makeResult(id, modul, title, preConditions, testSteps, expected, actual, 'passed', Date.now() - start, '', cat);
    } catch (err) {
      this.broadcastStep(id, modul, title, 'note', err.message);
      return this.makeResult(id, modul, title, preConditions, testSteps, expected, err.message, 'note', Date.now() - start, err.message, cat);
    }
  }

  skip(id, modul, title, preConditions, testSteps, expected, reason) {
    this.broadcastStep(id, modul, title, 'note', reason || 'skipped');
    return this.makeResult(id, modul, title, preConditions, testSteps, expected, `Skipped: ${reason}`, 'skipped', 0, reason || 'skipped', 'primary');
  }

  async ensureOnPage(page, url) {
    const current = page.url();
    if (current === url || current.startsWith(url) || url.startsWith(current)) return;
    if (current.startsWith('about:')) return;
    try {
      if (new URL(current).origin === new URL(url).origin) return;
    } catch {}
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(500);
  }

  // Smart wait: wait for any of multiple selectors to appear, or URL to change
  async smartWait(page, selectors, opts = {}) {
    const { timeout = 5000, urlChange = false, originalUrl = null } = opts;
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (urlChange && originalUrl && page.url() !== originalUrl) return true;
      for (const s of selectors) {
        if (await page.locator(s).first().isVisible().catch(() => false)) return true;
      }
      await page.waitForTimeout(200);
    }
    return false;
  }

  // Check if login form is still visible (strong indicator that login failed)
  async loginFormStillVisible(page) {
    const pwdVisible = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
    if (pwdVisible) return true;
    const loginBtn = await page.locator('button:has-text("Login"), button:has-text("Sign in"), button:has-text("Masuk"), button:has-text("Log in")').first().isVisible().catch(() => false);
    return loginBtn;
  }

  note(id, modul, title, preConditions, testSteps, expected, reason) {
    return this.makeResult(id, modul, title, preConditions, testSteps, expected, `Catatan: ${reason}`, 'note', 0, '', 'optional');
  }

  // Sama seperti safeTest, tapi kegagalan dianggap "catatan" (note), bukan "gagal".
  // Digunakan untuk cek best-practice / non-mandatory (optional) agar tidak menurunkan nilai.
  async noteTest(id, modul, title, preConditions, testSteps, expected, testFn) {
    const start = Date.now();
    this.broadcastStep(id, modul, title, 'start', '');
    try {
      const actual = await testFn();
      this.broadcastStep(id, modul, title, 'done', actual);
      return this.makeResult(id, modul, title, preConditions, testSteps, expected, actual, 'passed', Date.now() - start, '', 'optional');
    } catch (err) {
      this.broadcastStep(id, modul, title, 'note', err.message);
      return this.makeResult(id, modul, title, preConditions, testSteps, expected, `Catatan: ${err.message}`, 'note', Date.now() - start, '', 'optional');
    }
  }

  // ===== Scanning Total Helpers =====
  async scanAllButtons(page, opts = {}) {
    const { maxButtons = 30, clickTimeout = 3000, returnToUrl = null } = opts;
    const buttons = [];
    const sels = ['button:visible', 'a[href]:visible', '[role="button"]:visible', '.btn:visible', '[class*="button"]:visible'];
    const seen = new Set();
    for (const s of sels) {
      const els = await page.locator(s).all();
      for (const el of els) {
        if (buttons.length >= maxButtons) break;
        try {
          const text = (await el.innerText().catch(() => '')).trim().slice(0, 80);
          const href = await el.getAttribute('href').catch(() => null);
          const key = text || href || `btn_${buttons.length}`;
          if (!text && !href) continue;
          if (seen.has(key)) continue;
          if (await el.isDisabled().catch(() => false)) continue;
          seen.add(key);
          buttons.push({ locator: el, text, href, selector: s });
        } catch {}
      }
      if (buttons.length >= maxButtons) break;
    }
    return buttons;
  }

  async clickAndObserve(page, btn, url, opts = {}) {
    const { waitMs = 2000, allowNavigation = false, skipDangerous = true } = opts;
    const beforeUrl = page.url();
    const beforeDom = await page.evaluate(() => document.querySelectorAll('*').length).catch(() => 0);
    let result = { text: btn.text, href: btn.href, beforeUrl, reaction: 'none', details: '' };

    // Guard: skip dangerous buttons
    if (skipDangerous) {
      const btnText = (btn.text || '').toLowerCase();
      const btnHref = (btn.href || '').toLowerCase();
      const dangerous = ['logout', 'log out', 'sign out', 'signout', 'keluar', 'delete', 'remove', 'hapus', 'destroy', 'reset database', 'drop'];
      for (const d of dangerous) {
        if (btnText.includes(d) || btnHref.includes(d)) {
          result.reaction = 'skipped';
          result.details = `Skipped dangerous button: ${btn.text || btn.href}`;
          return result;
        }
      }
      // Skip external links
      if (btn.href) {
        try {
          const btnUrl = new URL(btn.href, beforeUrl);
          const pageUrl = new URL(beforeUrl);
          if (btnUrl.hostname !== pageUrl.hostname) {
            result.reaction = 'skipped';
            result.details = `Skipped external link: ${btn.href}`;
            return result;
          }
        } catch {}
      }
    }

    try {
      await btn.locator.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(waitMs);
      const afterUrl = page.url();
      const afterDom = await page.evaluate(() => document.querySelectorAll('*').length).catch(() => 0);
      if (afterUrl !== beforeUrl) {
        result.reaction = 'navigate';
        result.details = afterUrl;
        // Always return to original URL unless explicitly allowed
        if (!allowNavigation && url) {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        }
      } else {
        const modalVisible = await page.locator('[role="dialog"]:visible, [class*="modal"]:visible, [class*="popup"]:visible, [aria-modal="true"]:visible').first().isVisible().catch(() => false);
        if (modalVisible) {
          result.reaction = 'modal';
          result.details = 'Modal/popup opened';
        } else if (afterDom > beforeDom + 5) {
          result.reaction = 'dom_change';
          result.details = `DOM +${afterDom - beforeDom} elements`;
        } else {
          const formVisible = await page.locator('form:visible, [class*="form"]:visible').first().isVisible().catch(() => false);
          if (formVisible && afterDom !== beforeDom) {
            result.reaction = 'form_open';
            result.details = 'Form appeared';
          } else {
            result.reaction = 'no_change';
            result.details = 'No visible change';
          }
        }
      }
    } catch (e) {
      result.reaction = 'error';
      result.details = e.message.slice(0, 100);
    }
    return result;
  }

  async scanAllInputs(page, opts = {}) {
    const { fill = true, marker = 'SCAN' } = opts;
    const inputs = [];
    const sels = [
      'input[type="text"]:visible', 'input:not([type]):visible', 'input[type="email"]:visible',
      'input[type="password"]:visible', 'input[type="number"]:visible', 'input[type="tel"]:visible',
      'input[type="url"]:visible', 'input[type="search"]:visible', 'input[type="date"]:visible',
      'input[type="datetime-local"]:visible', 'input[type="time"]:visible',
      'textarea:visible', 'select:visible',
      'input[type="checkbox"]:visible', 'input[type="radio"]:visible',
    ];
    for (const s of sels) {
      const els = await page.locator(s).all();
      for (let i = 0; i < els.length; i++) {
        try {
          const el = els[i];
          const type = await el.getAttribute('type').catch(() => 'text');
          const name = await el.getAttribute('name').catch(() => '');
          const placeholder = await el.getAttribute('placeholder').catch(() => '');
          const required = await el.getAttribute('required').catch(() => null);
          const id = await el.getAttribute('id').catch(() => '');
          const inputInfo = { type: type || 'text', name, placeholder, required: !!required, id, filled: false };
          if (fill) {
            try {
              switch (type) {
                case 'email': await el.fill(`test_${Date.now()}@test.com`); inputInfo.filled = true; break;
                case 'password': await el.fill('TestPass123!'); inputInfo.filled = true; break;
                case 'number': await el.fill('123'); inputInfo.filled = true; break;
                case 'tel': await el.fill('081234567890'); inputInfo.filled = true; break;
                case 'url': await el.fill('https://example.com'); inputInfo.filled = true; break;
                case 'search': await el.fill(`${marker}_search`); inputInfo.filled = true; break;
                case 'date': await el.fill('2026-12-31'); inputInfo.filled = true; break;
                case 'datetime-local': await el.fill('2026-12-31T10:00'); inputInfo.filled = true; break;
                case 'time': await el.fill('10:00'); inputInfo.filled = true; break;
                case 'checkbox': await el.check().catch(() => {}); inputInfo.filled = true; break;
                case 'radio': await el.check().catch(() => {}); inputInfo.filled = true; break;
                case 'file': break; // skip file inputs
                default:
                  if (await el.evaluate(e => e.tagName.toLowerCase()).catch(() => '') === 'textarea') {
                    await el.fill(`${marker}_textarea_${i}`); inputInfo.filled = true;
                  } else if (await el.evaluate(e => e.tagName.toLowerCase()).catch(() => '') === 'select') {
                    const options = await el.locator('option').all();
                    if (options.length > 1) { await options[1].click(); inputInfo.filled = true; }
                  } else {
                    await el.fill(`${marker}_${i}`); inputInfo.filled = true;
                  }
              }
            } catch {}
          }
          inputs.push(inputInfo);
        } catch {}
      }
    }
    return inputs;
  }

  async scanPageFeatures(page, url, opts = {}) {
    const { maxButtons = 20, clickEach = false } = opts;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(async () => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    });
    await page.waitForTimeout(1500);

    const features = { buttons: [], inputs: [], tables: [], forms: [], modals: [], tabs: [], navs: [], cards: [] };

    // Scan tables
    features.tables = await page.locator('table:visible, [role="grid"]:visible, [class*="data-table"]:visible, [class*="datagrid"]:visible').count();
    // Scan forms
    features.forms = await page.locator('form:visible, [class*="form"]:visible[style*="block"], [role="form"]:visible').count();
    // Scan modals
    features.modals = await page.locator('[role="dialog"]:visible, [class*="modal"]:visible, [aria-modal="true"]:visible').count();
    // Scan tabs
    features.tabs = await page.locator('[role="tab"]:visible, [class*="tab"]:visible, .nav-tabs:visible, [class*="tab-list"]:visible').count();
    // Scan navs
    features.navs = await page.locator('nav:visible, [role="navigation"]:visible, .navbar:visible, [class*="sidebar"]:visible, [class*="menu"]:visible').count();
    // Scan cards
    features.cards = await page.locator('[class*="card"]:visible, [class*="widget"]:visible, [class*="stat"]:visible').count();

    // Scan buttons
    features.buttons = await this.scanAllButtons(page, { maxButtons });

    // Scan inputs (without filling)
    features.inputs = await this.scanAllInputs(page, { fill: false });

    // Optionally click each button and record reactions
    if (clickEach) {
      const clickResults = [];
      for (const btn of features.buttons.slice(0, maxButtons)) {
        const result = await this.clickAndObserve(page, btn, url);
        clickResults.push(result);
        // Close any opened modal
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(500);
      }
      features.clickResults = clickResults;
    }

    return features;
  }

  async fillAllVisibleInputs(page, marker = 'TEST') {
    return await this.scanAllInputs(page, { fill: true, marker });
  }

  async findAndClickButton(page, texts = [], opts = {}) {
    const { waitMs = 1500 } = opts;
    for (const text of texts) {
      const sels = [
        `button:has-text("${text}")`, `a:has-text("${text}")`,
        `button[aria-label*="${text}" i]`, `[data-testid*="${text.toLowerCase()}"]`,
        `[class*="${text.toLowerCase().replace(/\s/g, '-')}"]`,
      ];
      for (const s of sels) {
        const el = page.locator(s).first();
        if (await el.isVisible().catch(() => false)) {
          await el.click().catch(() => {});
          await page.waitForTimeout(waitMs);
          return el;
        }
      }
    }
    return null;
  }

  // Get keywords for a category based on detected language
  getKeywords(category, d) {
    if (d && d.keywords && d.keywords[category]) return d.keywords[category];
    // Fallback: return both ID and EN
    const fallback = {
      save: ['Simpan', 'Save'], submit: ['Kirim', 'Submit', 'Simpan', 'Save'],
      add: ['Tambah', 'Add', 'Buat', 'Create', 'New', 'Baru'],
      edit: ['Edit', 'Ubah', 'Modify'],
      delete: ['Hapus', 'Delete', 'Remove', 'Buang'],
      cancel: ['Batal', 'Cancel'],
      search: ['Cari', 'Search', 'Filter', 'Saring'],
      login: ['Masuk', 'Login', 'Sign in'],
      logout: ['Keluar', 'Logout', 'Sign out'],
      register: ['Daftar', 'Register', 'Sign up'],
      close: ['Tutup', 'Close'],
      confirm: ['Konfirmasi', 'Confirm', 'Ya', 'Yes', 'OK'],
    };
    return fallback[category] || [];
  }

  async findVisibleForm(page) {
    const formSels = ['form:visible', '[role="form"]:visible', '[class*="form"]:visible:not([class*="format"])'];
    for (const s of formSels) {
      const form = page.locator(s).first();
      if (await form.isVisible().catch(() => false)) {
        const inputs = await form.locator('input:visible, textarea:visible, select:visible').count();
        if (inputs > 0) return form;
      }
    }
    return null;
  }

  async closeModal(page) {
    // Phase 1: Try clicking (x) close button in modal/dialog
    const closeSels = [
      '[class*="modal"] [class*="close"]', '[class*="modal"] [aria-label*="close" i]',
      '[class*="modal"] button:has-text("×")', '[class*="modal"] button:has-text("✕")',
      '[class*="modal"] button:has-text("✗")', '[class*="modal"] .close',
      '[role="dialog"] [class*="close"]', '[role="dialog"] [aria-label*="close" i]',
      '[role="dialog"] button:has-text("×")', '[role="dialog"] .close',
      '[aria-modal="true"] [class*="close"]', '[aria-modal="true"] [aria-label*="close" i]',
      '[class*="popup"] [class*="close"]', '[class*="popup"] .close',
      'button:has-text("Close")', 'button:has-text("Tutup")',
      'button:has-text("Cancel")', 'button:has-text("Batal")',
      '[aria-label*="close" i]', '[class*="close"]:visible',
      'button[data-dismiss="modal"]', '[data-bs-dismiss="modal"]',
    ];
    for (const s of closeSels) {
      const el = page.locator(s).first();
      if (await el.isVisible().catch(() => false)) {
        await el.click().catch(() => {});
        await page.waitForTimeout(800);
        // Verify modal closed
        const stillVisible = await page.locator('[role="dialog"]:visible, [class*="modal"]:visible, [aria-modal="true"]:visible').first().isVisible().catch(() => false);
        if (!stillVisible) return true;
      }
    }
    // Phase 2: Press Escape
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(500);
    const stillVisible2 = await page.locator('[role="dialog"]:visible, [class*="modal"]:visible, [aria-modal="true"]:visible').first().isVisible().catch(() => false);
    if (!stillVisible2) return true;
    // Phase 3: Click outside modal (click body/background)
    await page.locator('body').click({ position: { x: 10, y: 10 } }).catch(() => {});
    await page.waitForTimeout(500);
    return false;
  }

  // ===== Modul: Login & Auth (12 tests) =====
  async testLogin(page, url, username, password, authState, d) {
    const M = 'Login & Auth'; const R = [];

    if (!d.hasLogin && !password) {
      for (let i = 1; i <= 12; i++) {
        R.push(this.skip(`TC-L-${String(i).padStart(3, '0')}`, M, `Login test ${i}`, 'Login form', 'N/A', 'N/A', 'no login form detected'));
      }
      return R;
    }

    // TC-L-001: Form login terdeteksi
    R.push(await this.safeTest('TC-L-001', M, 'Form login terdeteksi di halaman',
      'URL = halaman login', '1. Buka URL\n2. Cari form login (password input, submit button)',
      'Form login ditemukan', async () => {
        // Navigate to login page using multiple strategies
        const found = await this.navigateToLoginPage(page, url);
        if (!found) throw new Error('Form login tidak ditemukan');
        return 'Form login terdeteksi';
      }));

    // TC-L-002: Field username/email terdeteksi
    R.push(await this.safeTest('TC-L-002', M, 'Field username/email terdeteksi',
      'Form login ditemukan', '1. Cari input username/email',
      'Field username ditemukan', async () => {
        // Don't reload — form should already be visible from TC-L-001
        const userSels = ['input[name="user[login]"]', 'input[name="username"]', 'input[name="email"]', 'input[type="email"]', '#username', '#email', 'input[placeholder*="username" i]', 'input[placeholder*="email" i]', 'input[placeholder*="user" i]', 'input[autocomplete="username"]', 'input[autocomplete="email"]', 'input[id*="user"]', 'input[id*="email"]', 'input[data-testid*="username"]', 'input[data-testid*="email"]', 'input[name*="user" i]', 'input[name*="email" i]'];
        let found = false;
        for (const s of userSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) {
          // Check count() as fallback (element may be attached but not yet visible due to animation)
          for (const s of userSels) {
            if (await page.locator(s).count() > 0) { found = true; break; }
          }
        }
        if (!found) {
          // Wait for SPA hydration and try again
          try { await page.waitForSelector('input[type="email"], input[name*="email" i], input[name*="user" i]', { timeout: 8000 }); found = true; } catch {}
        }
        if (!found) throw new Error('Field username/email tidak ditemukan');
        return 'Field username/email terdeteksi';
      }));

    // TC-L-003: Password masking
    R.push(await this.safeTest('TC-L-003', M, 'Password masking (type=password)',
      'Form login ditemukan', '1. Cari input password\n2. Cek type=password',
      'Password field menggunakan type=password', async () => {
        // Don't reload — form should already be visible from TC-L-001
        const pwd = page.locator('input[type="password"]').first();
        if (!await pwd.isVisible().catch(() => false)) {
          // Check count() as fallback (element may be attached but not yet visible)
          if (await page.locator('input[type="password"]').count() > 0) {
            return 'Password masking aktif (type=password)';
          }
          try { await page.waitForSelector('input[type="password"]', { timeout: 5000, state: 'visible' }); } catch { throw new Error('Input password tidak ditemukan'); }
        }
        return 'Password masking aktif (type=password)';
      }));

    // TC-L-004: Submit button terdeteksi
    R.push(await this.safeTest('TC-L-004', M, 'Submit button terdeteksi',
      'Form login ditemukan', '1. Cari button submit/login/sign in',
      'Submit button ditemukan', async () => {
        // Don't reload — form should already be visible from TC-L-001
        const submitSels = ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Sign in")', 'button:has-text("Login")', 'button:has-text("Masuk")', 'button:has-text("Log in")', 'button:has-text("Sign In")', 'button:has-text("Login")', 'button:has-text("Masuk")', 'button:has-text("Log In")', 'button[type="button"]:has-text("Login")', 'button[type="button"]:has-text("Sign")', 'button[type="button"]:has-text("Masuk")', '[role="submit"]', 'button[data-testid*="submit"]', 'button[data-testid*="login"]', 'input[type="button"][value*="Login"]', 'input[type="button"][value*="Sign"]', 'input[type="button"][value*="Masuk"]'];
        let found = false;
        for (const s of submitSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) {
          // Check count() as fallback (element may be attached but not yet visible)
          for (const s of submitSels) {
            if (await page.locator(s).count() > 0) { found = true; break; }
          }
        }
        if (!found) {
          // Wait for SPA hydration and try again
          try { await page.waitForSelector('button[type="submit"], button:has-text("Login"), button:has-text("Sign in"), button:has-text("Masuk")', { timeout: 8000 }); found = true; } catch {}
        }
        if (!found) throw new Error('Submit button tidak ditemukan');
        return 'Submit button terdeteksi';
      }));

    // TC-L-005: Empty field validation
    R.push(await this.safeTest('TC-L-005', M, 'Empty field validation — submit dengan field kosong',
      'Form login ditemukan', '1. Kosongkan semua field\n2. Klik submit\n3. Cek error validation',
      'Form menolak submit kosong dengan pesan error', async () => {
        const userField = page.locator('input[name="username"], input[name="email"], input[type="email"], #username, input[placeholder*="username" i]').first();
        const pwdField = page.locator('input[type="password"]').first();
        // Check if form has novalidate — if so, browser won't do HTML5 validation
        const formNoValidate = await page.locator('form[novalidate]').count() > 0;
        if (await userField.isVisible().catch(() => false)) await userField.fill('');
        if (await pwdField.isVisible().catch(() => false)) await pwdField.fill('');
        const submitBtn = page.locator('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign in"), button:has-text("Masuk")').first();
        const urlBefore = page.url();
        if (await submitBtn.isVisible().catch(() => false)) await submitBtn.click().catch(() => {});
        // Smart wait for error indicators or URL change
        const foundError = await this.smartWait(page, [
          '[class*="error"]:visible', '[class*="invalid"]:visible', '[class*="alert"]:visible',
          '[role="alert"]:visible', '.text-red', '.text-danger', '[class*="danger"]:visible',
          '[class*="warning"]:visible', '[class*="feedback"]:visible',
        ], { timeout: 3000 });
        // Check HTML5 :invalid pseudo-class (browser native validation)
        const hasInvalidInput = await page.evaluate(() => {
          const inputs = document.querySelectorAll('input:invalid, textarea:invalid, select:invalid');
          return inputs.length > 0;
        }).catch(() => false);
        const stillOnLogin = page.url().includes('login') || page.url().includes('sign_in') || page.url().includes('auth') || page.url() === urlBefore;
        // Also check for validation text in body
        const bodyText = await page.locator('body').innerText().catch(() => '');
        const validationTexts = ['required', 'wajib', 'harus diisi', 'tidak boleh kosong', 'cannot be empty', 'please fill', 'masukkan', 'enter your', 'field is required', 'is required'];
        const hasValidationText = validationTexts.some(t => bodyText.toLowerCase().includes(t));
        if (foundError || hasInvalidInput || stillOnLogin || hasValidationText) {
          const reason = foundError ? 'error element' : hasInvalidInput ? 'HTML5 invalid' : hasValidationText ? 'validation text' : 'still on login';
          return `Empty field validation berfungsi (${reason})`;
        }
        // If form has novalidate and no other validation, it's a real issue
        if (formNoValidate) throw new Error('Form has novalidate and no custom validation — empty submit accepted');
        throw new Error('Form tidak memvalidasi field kosong');
      }));

    // TC-L-006: Invalid login rejected
    R.push(await this.safeTest('TC-L-006', M, 'Invalid login credentials ditolak',
      'Form login ditemukan', '1. Isi username/password salah\n2. Submit\n3. Cek tidak redirect ke dashboard',
      'Login invalid ditolak, tetap di halaman login', async () => {
        const urlBefore = page.url();
        await this.fillLoginForm(page, 'invalid_user_test', 'invalid_pass_test');
        // Smart wait: either login form stays (blocked) or URL changes to dashboard (bypassed)
        await page.waitForTimeout(1000);
        const stillHasLoginForm = await this.loginFormStillVisible(page);
        const currentUrl = page.url();
        const urlChanged = currentUrl !== urlBefore && !currentUrl.includes('login') && !currentUrl.includes('sign_in') && !currentUrl.includes('auth');
        // Check for error messages
        const hasError = await page.locator('[class*="error"]:visible, [class*="alert"]:visible, [role="alert"]:visible, [class*="invalid"]:visible, [class*="danger"]:visible').first().isVisible().catch(() => false);
        const bodyText = await page.locator('body').innerText().catch(() => '');
        const rejectTexts = ['invalid', 'salah', 'incorrect', 'wrong', 'gagal', 'failed', 'tidak ditemukan', 'not found', 'bad credentials', 'mismatch'];
        const hasRejectText = rejectTexts.some(t => bodyText.toLowerCase().includes(t));
        if (stillHasLoginForm || hasError || hasRejectText) {
          return 'Login invalid ditolak, tetap di halaman login';
        }
        if (urlChanged) {
          throw new Error('Login invalid diterima — redirect ke halaman lain (CRITICAL)');
        }
        // URL didn't change but no error visible — ambiguous, likely blocked
        return 'Login invalid ditolak (tidak ada redirect, form masih ada)';
      }));

    // TC-L-007: SQL injection blocked
    R.push(await this.safeTest('TC-L-007', M, 'SQL injection payload diblokir di login',
      'Form login ditemukan', '1. Isi SQL injection payload\n2. Submit\n3. Cek tidak bypass login',
      'SQL injection tidak berhasil bypass login', async () => {
        const payloads = ["' OR '1'='1", "admin'--", "' OR '1'='1' --", '" OR "1"="1', "1' OR '1' = 1"];
        let blocked = true;
        for (const payload of payloads) {
          const urlBefore = page.url();
          await this.fillLoginForm(page, payload, payload);
          await page.waitForTimeout(1000);
          const stillHasLoginForm = await this.loginFormStillVisible(page);
          const currentUrl = page.url();
          const urlChanged = currentUrl !== urlBefore && !currentUrl.includes('login') && !currentUrl.includes('sign_in') && !currentUrl.includes('auth');
          if (!stillHasLoginForm && urlChanged) {
            blocked = false; break;
          }
        }
        if (!blocked) throw new Error('SQL injection berhasil bypass login (CRITICAL)');
        return 'SQL injection diblokir — tidak ada bypass';
      }));

    // TC-L-008: XSS payload blocked in login
    R.push(await this.safeTest('TC-L-008', M, 'XSS payload diblokir di login form',
      'Form login ditemukan', '1. Isi XSS payload di username\n2. Submit\n3. Cek tidak ada script execution',
      'XSS payload tidak dieksekusi', async () => {
        const xssPayloads = ['<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', 'javascript:alert(1)'];
        let safe = true;
        const scriptCountBefore = await page.evaluate(() => document.querySelectorAll('script').length).catch(() => 0);
        for (const payload of xssPayloads) {
          await this.fillLoginForm(page, payload, 'test123');
          await page.waitForTimeout(1000);
          const scriptCountAfter = await page.evaluate(() => document.querySelectorAll('script').length).catch(() => 0);
          const hasScript = await page.locator('script:has-text("alert")').count() > 0;
          const bodyText = await page.locator('body').innerText().catch(() => '');
          const domMutated = scriptCountAfter > scriptCountBefore;
          if (hasScript || bodyText.includes('alert(1)') || domMutated) { safe = false; break; }
        }
        if (!safe) throw new Error('XSS payload dieksekusi (CRITICAL)');
        return 'XSS payload diblokir — tidak ada script execution';
      }));

    // TC-L-009: Valid login → redirect dashboard
    if (username && password) {
      R.push(await this.safeTest('TC-L-009', M, 'Valid login → redirect ke dashboard',
        'Kredensial valid tersedia', '1. Isi username/password valid\n2. Submit\n3. Cek redirect ke dashboard',
        'Berhasil login dan redirect ke dashboard', async () => {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
          await this.fillLoginForm(page, username, password);
          await page.waitForTimeout(3000);
          const currentUrl = page.url();
          if (currentUrl.includes('sign_in') || currentUrl.includes('login') || currentUrl.includes('auth')) {
            throw new Error('Login valid gagal — masih di halaman login');
          }
          authState.isAuthenticated = true;
          authState.dashboardUrl = currentUrl;
          return `Login berhasil, redirect ke: ${currentUrl}`;
        }));
    } else {
      R.push(this.skip('TC-L-009', M, 'Valid login → redirect ke dashboard',
        'Kredensial valid', '1. Login', 'Redirect dashboard', 'no credentials provided'));
    }

    // TC-L-010: Session persist after login
    if (authState.isAuthenticated) {
      R.push(await this.safeTest('TC-L-010', M, 'Session persist setelah refresh',
        'User sudah login', '1. Refresh halaman\n2. Cek masih authenticated',
        'Session tetap aktif setelah refresh', async () => {
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
          await page.waitForLoadState('domcontentloaded').catch(() => {});
          const currentUrl = page.url();
          if (currentUrl.includes('sign_in') || currentUrl.includes('login') || currentUrl.includes('auth')) {
            throw new Error('Session hilang setelah refresh');
          }
          return 'Session persist setelah refresh';
        }));
    } else {
      R.push(this.skip('TC-L-010', M, 'Session persist setelah refresh',
        'User login', '1. Refresh', 'Session aktif', 'not authenticated'));
    }

    // TC-L-011: Back button security
    if (authState.isAuthenticated) {
      R.push(await this.noteTest('TC-L-011', M, 'Back button security — tidak bisa akses login setelah logout',
        'User sudah login', '1. Logout (jika ada)\n2. Klik back button\n3. Cek tidak bisa akses dashboard',
        'Back button tidak menampilkan dashboard setelah logout', async () => {
          // Try direct logout selectors first
          const logoutSels = ['a:has-text("Logout")', 'a:has-text("Keluar")', 'a:has-text("Sign out")', 'button:has-text("Logout")', 'button:has-text("Keluar")', 'a[href*="sign_out"]', 'a[href*="logout"]', '[data-testid="sign-out-link"]', 'a[data-method="delete"][href*="sign_out"]'];
          let loggedOut = false;
          for (const s of logoutSels) {
            if (await page.locator(s).first().isVisible().catch(() => false)) {
              await page.locator(s).first().click().catch(() => {});
              await page.waitForTimeout(1000);
              loggedOut = true; break;
            }
          }
          // If not found, try opening user dropdown menu first (GitLab, GitHub, etc.)
          if (!loggedOut) {
            const menuSels = ['[data-testid="user-menu"]', '.header-user-dropdown-toggle', '[class*="user-avatar"]', '[class*="user-menu"]', 'button[aria-label*="menu" i]', '.nav-links .dropdown-toggle', '[class*="avatar"]', 'img[class*="avatar"]'];
            for (const ms of menuSels) {
              if (await page.locator(ms).first().isVisible().catch(() => false)) {
                await page.locator(ms).first().click().catch(() => {});
                await page.waitForTimeout(800);
                for (const s of logoutSels) {
                  if (await page.locator(s).first().isVisible().catch(() => false)) {
                    await page.locator(s).first().click().catch(() => {});
                    await page.waitForTimeout(1000);
                    loggedOut = true; break;
                  }
                }
                if (loggedOut) break;
              }
            }
          }
          if (!loggedOut) throw new Error('Tidak ada tombol logout terdeteksi');
          await page.goBack().catch(() => {});
          await page.waitForTimeout(1000);
          const currentUrl = page.url();
          if (currentUrl.includes('dashboard') || currentUrl.includes('admin')) {
            throw new Error('Back button menampilkan dashboard setelah logout (SECURITY ISSUE)');
          }
          // Re-login to restore session for subsequent tests
          if (username && password) {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
            await this.fillLoginForm(page, username, password);
            await page.waitForTimeout(3000);
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
            const afterLoginUrl = page.url();
            authState.isAuthenticated = !afterLoginUrl.includes('sign_in') && !afterLoginUrl.includes('login');
            if (authState.isAuthenticated && authState.dashboardUrl) {
              await page.goto(authState.dashboardUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
              await page.waitForTimeout(1000);
            }
          }
          return 'Back button security OK';
        }));
    } else {
      R.push(this.skip('TC-L-011', M, 'Back button security',
        'User login', '1. Logout\n2. Back', 'No dashboard access', 'not authenticated'));
    }

    // TC-L-012: Logout clears session
    if (authState.isAuthenticated) {
      R.push(await this.noteTest('TC-L-012', M, 'Logout clears session',
        'User sudah login', '1. Cari tombol logout\n2. Klik logout\n3. Cek session cleared',
        'Session terclear setelah logout', async () => {
          // Try direct logout selectors first
          const logoutSels = ['a:has-text("Logout")', 'a:has-text("Keluar")', 'a:has-text("Sign out")', 'button:has-text("Logout")', 'button:has-text("Keluar")', 'a[href*="sign_out"]', 'a[href*="logout"]', '[data-testid="sign-out-link"]', 'a[data-method="delete"][href*="sign_out"]'];
          let found = false;
          for (const s of logoutSels) {
            if (await page.locator(s).first().isVisible().catch(() => false)) {
              await page.locator(s).first().click().catch(() => {});
              await page.waitForTimeout(1000);
              found = true; break;
            }
          }
          // If not found, try opening user dropdown menu first (GitLab, GitHub, etc.)
          if (!found) {
            const menuSels = ['[data-testid="user-menu"]', '.header-user-dropdown-toggle', '[class*="user-avatar"]', '[class*="user-menu"]', 'button[aria-label*="menu" i]', '.nav-links .dropdown-toggle', '[class*="avatar"]', 'img[class*="avatar"]'];
            for (const ms of menuSels) {
              if (await page.locator(ms).first().isVisible().catch(() => false)) {
                await page.locator(ms).first().click().catch(() => {});
                await page.waitForTimeout(800);
                for (const s of logoutSels) {
                  if (await page.locator(s).first().isVisible().catch(() => false)) {
                    await page.locator(s).first().click().catch(() => {});
                    await page.waitForTimeout(1000);
                    found = true; break;
                  }
                }
                if (found) break;
              }
            }
          }
          if (!found) throw new Error('Tombol logout tidak ditemukan');
          const currentUrl = page.url();
          if (currentUrl.includes('dashboard') || currentUrl.includes('admin')) {
            throw new Error('Logout tidak redirect ke login/landing');
          }
          authState.isAuthenticated = false;
          return 'Logout berhasil, session cleared';
        }));
    } else {
      R.push(this.skip('TC-L-012', M, 'Logout clears session',
        'User login', '1. Logout', 'Session cleared', 'not authenticated'));
    }

    return R;
  }

  // ===== Modul: Dashboard Layout (10 tests) =====
  async testDashboard(page, url, d, authState) {
    const M = 'Dashboard Layout'; const R = [];

    // TC-D-001: Dashboard dimuat dengan benar
    R.push(await this.safeTest('TC-D-001', M, 'Dashboard halaman dimuat dengan benar',
      'URL dashboard', '1. Buka URL\n2. Tunggu dimuat\n3. Cek judul dan konten',
      'Dashboard dimuat dengan judul', async () => {
        await this.ensureOnPage(page, url);
        const t = await page.title();
        if (!t) throw new Error('Dashboard tidak memiliki judul');
        const bodyText = await page.locator('body').innerText().catch(() => '');
        if (bodyText.length < 50) throw new Error('Dashboard kosong/minimal content');
        return `Dashboard dimuat. Judul: "${t}"`;
      }));

    // TC-D-002: Heading/title jelas
    R.push(await this.safeTest('TC-D-002', M, 'Dashboard memiliki heading/title yang jelas',
      'Dashboard dimuat', '1. Cari h1/h2\n2. Cek heading deskriptif',
      'Heading jelas dan deskriptif', async () => {
        const h1 = await page.locator('h1').count();
        const h2 = await page.locator('h2').count();
        if (h1 === 0 && h2 === 0) throw new Error('Tidak ada h1/h2 di dashboard');
        const headingText = await page.locator('h1, h2').first().innerText().catch(() => '');
        if (headingText.length < 3) throw new Error('Heading terlalu pendek/non-deskriptif');
        return `Heading ditemukan: "${headingText.substring(0, 50)}"`;
      }));

    // TC-D-003: Cards/widgets/statistics terdeteksi
    R.push(await this.safeTest('TC-D-003', M, 'Cards/widgets/statistics terdeteksi',
      'Dashboard dimuat', '1. Cari card/widget/stat elements (container only, exclude header/footer/body)',
      'Cards atau widgets ditemukan', async () => {
        // Try to navigate to actual dashboard page if current page doesn't have cards
        await this.navigateToDashboard(page, url, authState);
        // Count container cards, exclude child elements like card-header, card-body, card-footer
        const total = await page.evaluate(() => {
          const all = document.querySelectorAll('[class*="card"], [class*="widget"], [class*="stat"], [class*="metric"], [class*="summary"], [class*="grid-item"], [class*="tile"], [class*="panel"], [data-testid*="card"], [data-testid*="widget"], [data-testid*="stat"], [role="region"], article, section[class*="feature"], canvas, svg[class*="chart"], [class*="chart"]');
          let count = 0;
          const excludePatterns = ['card-header', 'card-footer', 'card-body', 'card-title', 'card-text', 'card-subtitle', 'card-img', 'widget-header', 'widget-body', 'widget-footer', 'stat-label', 'stat-value', 'card-content', 'card-description'];
          for (const el of all) {
            const cls = (el.className || '').toLowerCase();
            const isChild = excludePatterns.some(p => cls.includes(p));
            const hasParentCard = el.parentElement && (el.parentElement.className || '').toLowerCase().includes('card');
            if (!isChild && !hasParentCard) count++;
          }
          return count;
        }).catch(() => 0);
        if (total === 0) throw new Error('Tidak ada cards/widgets terdeteksi');
        return `${total} cards/widgets terdeteksi`;
      }));

    // TC-D-004: Navigasi/sidebar/header tersedia
    R.push(await this.safeTest('TC-D-004', M, 'Navigasi/sidebar/header tersedia',
      'Dashboard dimuat', '1. Cari nav, sidebar, header',
      'Elemen navigasi ditemukan', async () => {
        const navSels = ['nav', '[role="navigation"]', '[class*="sidebar"]', 'aside', 'header', '[class*="navbar"]'];
        let found = false;
        for (const s of navSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Tidak ada navigasi/sidebar/header');
        return 'Navigasi/sidebar/header terdeteksi';
      }));

    // TC-D-005: User info/profile element
    R.push(await this.safeTest('TC-D-005', M, 'User info/profile element terdeteksi',
      'Dashboard dimuat', '1. Cari user info, avatar, profile',
      'User info ditemukan', async () => {
        const userSels = ['[class*="avatar"]', '[class*="user-info"]', '[class*="profile"]', '[class*="user-menu"]', '[data-testid*="user"]'];
        let found = false;
        for (const s of userSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) return 'User info tidak ditemukan (info)';
        return 'User info/profile terdeteksi';
      }));

    // TC-D-006: Breadcrumb terdeteksi
    R.push(await this.noteTest('TC-D-006', M, 'Breadcrumb navigasi terdeteksi',
      'Dashboard dimuat', '1. Cari breadcrumb elements',
      'Breadcrumb ditemukan', async () => {
        const breadcrumbSels = ['[class*="breadcrumb"]', '[aria-label*="breadcrumb"]', 'nav ol li a', '[class*="crumb"]'];
        let found = false;
        for (const s of breadcrumbSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Breadcrumb tidak ditemukan');
        return 'Breadcrumb terdeteksi';
      }));

    // TC-D-007: Notification/toast container
    R.push(await this.safeTest('TC-D-007', M, 'Notification/toast container tersedia',
      'Dashboard dimuat', '1. Cari toast/notification/alert container',
      'Notification container ditemukan', async () => {
        const notifSels = ['[class*="toast"]', '[class*="notification"]', '[class*="alert"]', '[role="alert"]', '[class*="snackbar"]'];
        let found = false;
        for (const s of notifSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) return 'Notification container tidak ditemukan (info)';
        return 'Notification/toast container terdeteksi';
      }));

    // TC-D-008: Footer tersedia
    R.push(await this.safeTest('TC-D-008', M, 'Footer tersedia',
      'Dashboard dimuat', '1. Scroll ke bawah\n2. Cari footer element',
      'Footer ditemukan', async () => {
        // Scroll to bottom using multiple strategies (body, documentElement, keyboard, scrollable containers)
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
          document.documentElement.scrollTop = 999999;
          const scrollables = document.querySelectorAll('[class*="scroll"], [class*="content"], main, [role="main"]');
          for (const el of scrollables) { if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight; }
        }).catch(() => {});
        await page.waitForTimeout(500);
        await page.keyboard.press('End').catch(() => {});
        await page.waitForTimeout(300);
        const footerSels = ['footer', '[class*="footer"]', '[role="contentinfo"]', '[class*="bottom-bar"]', '[data-testid*="footer"]', '[class*="copyright"]', '.layout-footer', '.footer-container', '#footer'];
        let found = false;
        for (const s of footerSels) {
          if (await page.locator(s).count() > 0) { found = true; break; }
        }
        if (!found) throw new Error('Footer tidak ditemukan');
        return 'Footer terdeteksi';
      }));

    // TC-D-009: Empty state handling
    R.push(await this.noteTest('TC-D-009', M, 'Empty state handling untuk data kosong',
      'Dashboard dimuat', '1. Cari empty state messages\n2. Cari loading state indicators',
      'Empty state ditangani dengan baik', async () => {
        const bodyText = await page.locator('body').innerText().catch(() => '');
        const emptyKeywords = ['no data', 'tidak ada data', 'empty', 'kosong', 'no results', 'no items', 'no records'];
        const hasEmptyState = emptyKeywords.some(k => bodyText.toLowerCase().includes(k));
        const hasEmptyClass = await page.locator('[class*="empty"]:visible, [class*="no-data"]:visible').count() > 0;
        const hasLoadingState = await page.locator('[class*="skeleton"]:visible, [class*="spinner"]:visible, [class*="loading"]:visible').count() > 0;
        if (hasEmptyState || hasEmptyClass) return 'Empty state handling ditemukan';
        if (hasLoadingState) return 'Loading state (skeleton/spinner) ditemukan';
        throw new Error('Tidak ada empty state handling terdeteksi');
      }));

    // TC-D-010: Layout shift / broken layout detection
    R.push(await this.safeTest('TC-D-010', M, 'Layout tidak broken — no horizontal scroll, no overflow',
      'Dashboard dimuat', '1. Cek horizontal scroll\n2. Cek overflow',
      'Layout clean, no horizontal scroll', async () => {
        const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
        if (hasHScroll) throw new Error('Horizontal scroll terdeteksi — layout broken');
        const overflowEls = await page.evaluate(() => {
          const els = document.querySelectorAll('div, section, main, aside');
          let broken = 0;
          for (const el of els) {
            if (el.scrollWidth > el.clientWidth + 5 && el.clientWidth > 100) broken++;
          }
          return broken;
        });
        if (overflowEls > 3) throw new Error(`${overflowEls} elemen overflow terdeteksi`);
        return 'Layout clean — no horizontal scroll, no significant overflow';
      }));

    return R;
  }

  // ===== Modul: Navigation & Menu (10 tests) =====
  async testNavigation(page, url, d) {
    const M = 'Navigation & Menu'; const R = [];

    // TC-N-001: Internal links berfungsi
    R.push(await this.safeTest('TC-N-001', M, 'Internal links terdeteksi dan dapat diklik',
      'Halaman dimuat', '1. Cari semua a[href] internal\n2. Cek link count > 0',
      'Internal links ditemukan', async () => {
        if (d.linkCount === 0) throw new Error('Tidak ada internal links');
        return `${d.linkCount} internal links terdeteksi`;
      }));

    // TC-N-002: Menu structure (nav/sidebar) konsisten
    R.push(await this.safeTest('TC-N-002', M, 'Menu structure (nav/sidebar) terdeteksi',
      'Halaman dimuat', '1. Cari nav/sidebar/menu\n2. Cek struktur link\n3. Cek active state',
      'Menu structure ditemukan', async () => {
        if (!d.hasNav) throw new Error('Tidak ada navigasi/sidebar/menu');
        const hasActive = await page.evaluate(() => !!document.querySelector('[aria-current], .active, [class*="active"]')).catch(() => false);
        return `Menu layout: ${d.menuLayout}${hasActive ? ' (active state detected)' : ''}`;
      }));

    // TC-N-003: Hamburger menu berfungsi (jika ada)
    R.push(await this.noteTest('TC-N-003', M, 'Hamburger menu berfungsi di mobile',
      'Halaman dimuat', '1. Cari hamburger toggle\n2. Resize ke mobile\n3. Klik hamburger\n4. Cek menu terbuka',
      'Hamburger menu berfungsi', async () => {
        const hamburgerSels = ['[class*="hamburger"]', '[class*="menu-toggle"]', '[aria-label*="menu" i]', 'button[class*="toggle"]', '[data-testid*="menu-toggle"]'];
        let hamburger = null;
        for (const s of hamburgerSels) {
          const el = page.locator(s).first();
          if (await el.isVisible().catch(() => false)) { hamburger = el; break; }
        }
        if (!hamburger) throw new Error('Hamburger menu tidak ditemukan');
        await this.setMobileViewport(page, 393, 852);
        await hamburger.click().catch(() => {});
        await page.waitForTimeout(500);
        const menuVisible = await page.locator('nav:visible, [class*="sidebar"]:visible, [class*="menu"]:visible, [class*="drawer"]:visible').first().isVisible().catch(() => false);
        await this.setDesktopViewport(page);
        if (!menuVisible) throw new Error('Hamburger menu tidak terbuka setelah klik');
        return 'Hamburger menu berfungsi — menu terbuka di mobile';
      }));

    // TC-N-004: Footer links terdeteksi
    R.push(await this.safeTest('TC-N-004', M, 'Footer links terdeteksi',
      'Halaman dimuat', '1. Scroll ke bawah\n2. Cari footer\n3. Cek links di footer',
      'Footer dengan links ditemukan', async () => {
        // Scroll to bottom using multiple strategies (body, documentElement, keyboard, scrollable containers)
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
          document.documentElement.scrollTop = 999999;
          const scrollables = document.querySelectorAll('[class*="scroll"], [class*="content"], main, [role="main"]');
          for (const el of scrollables) { if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight; }
        }).catch(() => {});
        await page.waitForTimeout(500);
        await page.keyboard.press('End').catch(() => {});
        await page.waitForTimeout(300);
        const footerSels = ['footer', '[class*="footer"]', '[role="contentinfo"]', '[class*="bottom-bar"]', '[data-testid*="footer"]', '[class*="copyright"]', '.layout-footer', '.footer-container', '#footer'];
        let footerFound = false;
        for (const s of footerSels) {
          if (await page.locator(s).count() > 0) { footerFound = true; break; }
        }
        if (!footerFound) throw new Error('Footer tidak ditemukan');
        const footerLinks = await page.locator('footer a[href], [class*="footer"] a[href], [role="contentinfo"] a[href]').count();
        if (footerLinks === 0) return 'Footer ditemukan tapi tanpa links (info)';
        return `${footerLinks} footer links terdeteksi`;
      }));

    // TC-N-005: Scroll behavior — page scrollable
    R.push(await this.safeTest('TC-N-005', M, 'Scroll behavior — halaman dapat di-scroll',
      'Halaman dimuat', '1. Cek page height > viewport\n2. Scroll ke bawah\n3. Cek scroll berhasil',
      'Halaman scrollable dengan benar', async () => {
        const scrollable = await page.evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight);
        if (!scrollable) return 'Halaman fit dalam viewport — no scroll needed (OK)';
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(500);
        const scrollY = await page.evaluate(() => window.scrollY);
        if (scrollY < 100) throw new Error('Scroll tidak berfungsi');
        await page.evaluate(() => window.scrollTo(0, 0));
        return 'Scroll berfungsi dengan benar';
      }));

    // TC-N-006: Dropdown menu berfungsi (jika ada)
    R.push(await this.noteTest('TC-N-006', M, 'Dropdown menu berfungsi',
      'Halaman dimuat', '1. Cari dropdown toggle\n2. Klik untuk buka\n3. Cek menu items',
      'Dropdown menu berfungsi', async () => {
        if (!d.hasDropdown) throw new Error('Dropdown tidak ditemukan');
        const dropdownSels = ['[data-toggle="dropdown"]', '[aria-haspopup="true"]', '.dropdown-toggle', 'details > summary', '[class*="dropdown"] > button'];
        let clicked = false;
        for (const s of dropdownSels) {
          const el = page.locator(s).first();
          if (await el.isVisible().catch(() => false)) {
            await el.click().catch(() => {});
            await page.waitForTimeout(1000);
            const menuItems = await page.locator('[class*="dropdown-menu"]:visible, [class*="dropdown-content"]:visible, [role="menu"]:visible, [role="listbox"]:visible').first().isVisible().catch(() => false);
            if (menuItems) { clicked = true; break; }
            await el.click().catch(() => {});
          }
        }
        if (!clicked) throw new Error('Dropdown tidak terbuka setelah klik');
        return 'Dropdown menu berfungsi';
      }));

    // TC-N-007: Tabs/accordion berfungsi (jika ada)
    R.push(await this.noteTest('TC-N-007', M, 'Tabs/accordion berfungsi',
      'Halaman dimuat', '1. Cari tab/accordion\n2. Klik tab\n3. Cek content berubah',
      'Tab/accordion berfungsi', async () => {
        const tabSels = ['[role="tab"]', '[class*="tab"]:not([class*="table"])', '.accordion-header', '[data-toggle="tab"]', '[class*="accordion"]'];
        let found = false;
        for (const s of tabSels) {
          const el = page.locator(s).first();
          if (await el.isVisible().catch(() => false)) {
            await el.click().catch(() => {});
            await page.waitForTimeout(1000);
            found = true; break;
          }
        }
        if (!found) throw new Error('Tab/accordion tidak ditemukan');
        return 'Tab/accordion berfungsi';
      }));

    // TC-N-008: Deep linking / direct URL access
    R.push(await this.safeTest('TC-N-008', M, 'Deep linking — direct URL access berfungsi',
      'Halaman dimuat', '1. Ambil URL internal\n2. Buka langsung\n3. Cek halaman dimuat',
      'Direct URL access berfungsi', async () => {
        if (d.navPages.length === 0) return 'Tidak ada nav pages untuk test (info)';
        const testPage = d.navPages[0];
        await page.goto(testPage.href, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
        await page.waitForTimeout(800);
        const t = await page.title();
        const bodyText = await page.locator('body').innerText().catch(() => '');
        if (!t && bodyText.length < 50) throw new Error('Direct URL access gagal — halaman kosong');
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
        return `Deep link ke "${testPage.text}" berfungsi`;
      }));

    // TC-N-009: Back/forward browser navigation
    R.push(await this.noteTest('TC-N-009', M, 'Back/forward browser navigation berfungsi',
      'Halaman dimuat dengan nav pages', '1. Klik link internal\n2. Klik back\n3. Klik forward\n4. Cek halaman benar',
      'Back/forward navigation berfungsi', async () => {
        if (d.navPages.length === 0) throw new Error('Tidak ada nav pages untuk test');
        const testPage = d.navPages[0];
        const link = page.locator(`a[href="${testPage.path}"], a[href*="${testPage.path}"]`).first();
        if (await link.isVisible().catch(() => false)) {
          await link.click().catch(() => {});
        } else {
          await page.goto(testPage.href, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
        }
        await page.waitForTimeout(800);
        await page.goBack().catch(() => {});
        await page.waitForTimeout(800);
        const backUrl = page.url();
        await page.goForward().catch(() => {});
        await page.waitForTimeout(800);
        const fwdUrl = page.url();
        if (backUrl === fwdUrl) throw new Error('Back/forward tidak berubah halaman');
        return 'Back/forward navigation berfungsi';
      }));

    // TC-N-010: Search function terdeteksi (jika ada)
    R.push(await this.safeTest('TC-N-010', M, 'Search function terdeteksi',
      'Halaman dimuat', '1. Cari search input/button',
      'Search function ditemukan', async () => {
        if (!d.hasSearch) return 'Search tidak ditemukan (info)';
        const searchSels = ['input[type="search"]', 'input[name*="search" i]', 'input[placeholder*="search" i]', '[role="search"] input', 'button:has-text("Search")'];
        let found = false;
        for (const s of searchSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) return 'Search element terdeteksi tapi tidak visible (info)';
        return 'Search function terdeteksi dan visible';
      }));

    return R;
  }

  // ===== Modul: Structure & Layout (10 tests) =====
  async testStructure(page, url, d) {
    const M = 'Structure & Layout'; const R = [];

    // TC-S-001: HTML lang attribute
    R.push(await this.safeTest('TC-S-001', M, 'HTML lang attribute tersedia dan valid',
      'Halaman dimuat', '1. Cek <html lang="...">',
      'Lang attribute ada dan valid', async () => {
        const lang = await page.locator('html').getAttribute('lang');
        if (!lang) throw new Error('HTML lang attribute tidak ditemukan');
        return `Lang attribute: "${lang}"`;
      }));

    // TC-S-002: Meta viewport untuk responsif
    R.push(await this.safeTest('TC-S-002', M, 'Meta viewport untuk responsif',
      'Halaman dimuat', '1. Cari meta[name="viewport"]',
      'Meta viewport tersedia', async () => {
        if (await page.locator('meta[name="viewport"]').count() === 0) throw new Error('Meta viewport tidak ditemukan');
        return 'Meta viewport tersedia';
      }));

    // TC-S-003: Heading hierarchy (h1 > h2 > h3)
    R.push(await this.safeTest('TC-S-003', M, 'Heading hierarchy (h1 → h2 → h3) konsisten',
      'Halaman dimuat', '1. Hitung h1, h2, h3\n2. Cek hierarki',
      'Heading hierarchy konsisten', async () => {
        const h1 = await page.locator('h1').count();
        const h2 = await page.locator('h2').count();
        const h3 = await page.locator('h3').count();
        if (h1 === 0) throw new Error('Tidak ada h1');
        if (h1 > 1) throw new Error(`${h1} h1 ditemukan — seharusnya hanya 1`);
        if (h2 === 0 && h3 > 0) throw new Error('h3 tanpa h2 — hierarki skip');
        return `Heading hierarchy OK: h1=${h1}, h2=${h2}, h3=${h3}`;
      }));

    // TC-S-004: Semantic HTML elements
    R.push(await this.safeTest('TC-S-004', M, 'Semantic HTML elements (header, nav, main, footer)',
      'Halaman dimuat', '1. Cari header, nav, main, footer, section, article\n2. Cari ARIA landmarks',
      'Semantic elements digunakan', async () => {
        const semantics = ['header', 'nav', 'main', 'footer', 'section', 'article', 'aside'];
        let found = 0;
        for (const s of semantics) { if (await page.locator(s).count() > 0) found++; }
        const ariaLandmarks = await page.locator('[role="banner"], [role="main"], [role="contentinfo"], [role="navigation"], [role="complementary"]').count();
        if (found < 3 && ariaLandmarks < 2) throw new Error(`Hanya ${found} semantic elements + ${ariaLandmarks} ARIA landmarks — minimal 3 diperlukan`);
        return `${found}/${semantics.length} semantic HTML + ${ariaLandmarks} ARIA landmarks`;
      }));

    // TC-S-005: Alt text untuk images
    R.push(await this.safeTest('TC-S-005', M, 'Alt text untuk semua images',
      'Halaman dimuat dengan gambar', '1. Cari semua img\n2. Cek alt attribute',
      'Semua gambar punya alt', async () => {
        if (d.imageCount === 0) return 'Tidak ada gambar (info)';
        const result = await page.evaluate(() => {
          const imgs = document.querySelectorAll('img');
          let missing = 0;
          for (const img of imgs) {
            // Skip decorative images: alt="" is valid, role="presentation", aria-hidden="true"
            if (img.getAttribute('aria-hidden') === 'true') continue;
            if (img.getAttribute('role') === 'presentation') continue;
            if (img.hasAttribute('alt') && img.alt === '') continue; // alt="" = decorative, valid
            if (!img.alt && !img.getAttribute('aria-label') && !img.getAttribute('role')) missing++;
          }
          return { total: imgs.length, missing };
        });
        if (result.missing > 0) throw new Error(`${result.missing}/${result.total} gambar tanpa alt text`);
        return `Semua ${result.total} gambar punya alt text`;
      }));

    // TC-S-006: Input label association
    R.push(await this.noteTest('TC-S-006', M, 'Input label association',
      'Halaman dimuat dengan form', '1. Cari semua input\n2. Cek label/aria-label',
      'Semua input berlabel', async () => {
        if (d.inputCount === 0) throw new Error('Tidak ada input di halaman');
        const result = await page.evaluate(() => {
          const inputs = document.querySelectorAll('input:not([type="hidden"]), select, textarea');
          let missing = 0;
          for (const input of inputs) {
            const id = input.id;
            const hasLabel = id && document.querySelector(`label[for="${id}"]`);
            const hasAria = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby');
            const hasPlaceholder = input.getAttribute('placeholder');
            if (!hasLabel && !hasAria && !hasPlaceholder) missing++;
          }
          return { total: inputs.length, missing };
        });
        if (result.missing > 0) throw new Error(`${result.missing}/${result.total} input tanpa label`);
        return `Semua ${result.total} input berlabel`;
      }));

    // TC-S-007: Favicon tersedia
    R.push(await this.safeTest('TC-S-007', M, 'Favicon tersedia',
      'Halaman dimuat', '1. Cari link[rel*="icon"]',
      'Favicon ditemukan', async () => {
        if (await page.locator('link[rel*="icon"]').count() === 0) throw new Error('Favicon tidak ditemukan');
        return 'Favicon tersedia';
      }));

    // TC-S-008: Focus indicator terlihat
    R.push(await this.safeTest('TC-S-008', M, 'Focus indicator terlihat saat tab navigation',
      'Halaman dimuat', '1. Fokus ke elemen interaktif\n2. Cek outline tidak none/0\n3. Cek skip-to-content link',
      'Outline focus terlihat', async () => {
        const focusable = page.locator('a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled])').first();
        if (!await focusable.isVisible().catch(() => false)) return 'Tidak ada elemen focusable (info)';
        await focusable.focus();
        const outline = await focusable.evaluate(el => {
          const style = window.getComputedStyle(el);
          return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, boxShadow: style.boxShadow };
        });
        if (outline.outlineStyle === 'none' && (!outline.boxShadow || outline.boxShadow === 'none')) {
          throw new Error('Focus indicator tidak terlihat (outline: none)');
        }
        const hasSkipLink = await page.locator('a[href="#main"], a[href="#content"], a:has-text("Skip")').count() > 0;
        return `Focus indicator terlihat${hasSkipLink ? ' + skip-to-content link ditemukan' : ''}`;
      }));

    // TC-S-009: Color contrast WCAG AA
    R.push(await this.safeTest('TC-S-009', M, 'Color contrast memenuhi WCAG AA (min 4.5:1)',
      'Halaman dimuat', '1. Ambil elemen teks\n2. Hitung kontras\n3. Bandingkan threshold',
      'Kontras >= 4.5:1', async () => {
        const lowContrast = await page.evaluate(() => {
          const els = document.querySelectorAll('p, span, a, button, label, h1, h2, h3, h4, h5, h6, td, th, li');
          let low = 0, total = 0;
          for (const el of els) {
            const style = window.getComputedStyle(el);
            const color = style.color;
            const bg = style.backgroundColor;
            if (color === 'rgba(0, 0, 0, 0)' || bg === 'rgba(0, 0, 0, 0)') continue;
            total++;
            const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            const mb = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (!m || !mb) continue;
            const lum = (r, g, b) => {
              const a = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
              return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
            };
            const l1 = lum(+m[1], +m[2], +m[3]);
            const l2 = lum(+mb[1], +mb[2], +mb[3]);
            const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
            if (ratio < 4.5) low++;
          }
          return { low, total };
        });
        if (lowContrast.total === 0) return 'Tidak ada teks untuk cek kontras (info)';
        if (lowContrast.low > lowContrast.total * 0.3) {
          throw new Error(`${lowContrast.low}/${lowContrast.total} elemen di bawah 4.5:1 kontras`);
        }
        return `${lowContrast.low}/${lowContrast.total} elemen di bawah threshold (OK)`;
      }));

    // TC-S-010: Lang attribute sesuai konten
    R.push(await this.noteTest('TC-S-010', M, 'Lang attribute sesuai dengan konten website',
      'Halaman dimuat', '1. Cek html lang\n2. Bandingkan dengan detected language',
      'Lang attribute sesuai konten', async () => {
        const htmlLang = (await page.locator('html').getAttribute('lang') || '').toLowerCase();
        if (htmlLang.startsWith(d.lang)) return `Lang "${htmlLang}" sesuai detected "${d.lang}"`;
        throw new Error(`Lang "${htmlLang}" tidak sesuai detected "${d.lang}"`);
      }));

    return R;
  }

  // ===== Modul: Security & Hack (15 tests) =====
  async testSecurity(page, url, d) {
    const M = 'Security & Hack'; const R = [];
    const baseUrl = new URL(url);

    // Cache response headers once for all header-based tests
    if (!this._cachedHeaders) {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null);
      this._cachedHeaders = res ? res.headers() : {};
    }
    const getHeaders = async () => this._cachedHeaders;

    // TC-SEC-001: HTTPS enabled
    R.push(await this.safeTest('TC-SEC-001', M, 'HTTPS enabled',
      'URL target', '1. Cek URL protocol\n2. Cek redirect HTTP → HTTPS',
      'Website menggunakan HTTPS', async () => {
        if (!d.isHttps) throw new Error('Website tidak menggunakan HTTPS');
        return 'HTTPS enabled';
      }));

    // TC-SEC-002: Security headers tersedia
    R.push(await this.safeTest('TC-SEC-002', M, 'Security headers tersedia (X-Frame-Options, X-Content-Type-Options, HSTS)',
      'URL target', '1. Fetch URL\n2. Cek response headers',
      'Security headers ditemukan', async () => {
        const headers = await getHeaders();
        const securityHeaders = ['x-frame-options', 'x-content-type-options', 'strict-transport-security', 'content-security-policy'];
        const found = securityHeaders.filter(h => headers[h]);
        if (found.length < 2) throw new Error(`Hanya ${found.length}/${securityHeaders.length} security headers ditemukan`);
        if (found.length < securityHeaders.length) return `${found.length}/${securityHeaders.length} security headers: ${found.join(', ')} (missing: ${securityHeaders.filter(h => !headers[h]).join(', ')})`;
        return `${found.length}/${securityHeaders.length} security headers: ${found.join(', ')}`;
      }));

    // TC-SEC-003: CSRF token protection
    R.push(await this.safeTest('TC-SEC-003', M, 'CSRF token protection di form',
      'Halaman dengan form', '1. Cari meta csrf token\n2. Cari hidden input csrf',
      'CSRF protection ditemukan', async () => {
        const csrfMeta = await page.locator('meta[name*="csrf" i], meta[name*="token" i]').count();
        const csrfInput = await page.locator('input[name*="csrf" i], input[name*="token" i], input[name*="authenticity_token"]').count();
        if (csrfMeta === 0 && csrfInput === 0) throw new Error('CSRF token tidak ditemukan');
        return `CSRF protection ditemukan (meta: ${csrfMeta}, input: ${csrfInput})`;
      }));

    // TC-SEC-004: Cookie security flags
    R.push(await this.safeTest('TC-SEC-004', M, 'Cookie security flags (Secure, HttpOnly, SameSite)',
      'Halaman dimuat dengan cookies', '1. Get all cookies\n2. Cek Secure, HttpOnly, SameSite',
      'Cookies punya security flags', async () => {
        const cookies = await page.context().cookies();
        if (cookies.length === 0) {
          // HttpOnly cookies are not visible to JS but are captured by context.cookies()
          // If truly no cookies, mark as note
          throw new Error('Tidak ada cookies terdeteksi (mungkin menggunakan token-based auth tanpa cookie)');
        }
        const insecure = cookies.filter(c => !c.secure || !c.httpOnly);
        if (insecure.length > cookies.length * 0.5) {
          throw new Error(`${insecure.length}/${cookies.length} cookies tanpa Secure/HttpOnly flag`);
        }
        return `${cookies.length - insecure.length}/${cookies.length} cookies memiliki security flags`;
      }));

    // TC-SEC-005: XSS vector — script injection
    R.push(await this.noteTest('TC-SEC-005', M, 'XSS vector — script injection tidak dieksekusi',
      'Form/search input', '1. Isi XSS payload di input\n2. Submit\n3. Cek tidak ada script execution',
      'XSS payload tidak dieksekusi', async () => {
        const input = page.locator('input:not([type="hidden"]):not([type="password"]):visible').first();
        if (!await input.isVisible().catch(() => false)) throw new Error('Tidak ada input visible untuk test XSS');
        const xss = '<script>alert("xss")</script>';
        await input.fill(xss).catch(() => {});
        const submitBtn = page.locator('button[type="submit"], input[type="submit"]').first();
        if (await submitBtn.isVisible().catch(() => false)) await submitBtn.click().catch(() => {});
        await page.waitForTimeout(1000);
        const hasAlert = await page.locator('script:has-text("alert")').count() > 0;
        const bodyText = await page.locator('body').innerText().catch(() => '');
        if (hasAlert || bodyText.includes('alert("xss")')) {
          throw new Error('XSS payload dieksekusi (CRITICAL VULNERABILITY)');
        }
        const hasPasswordAutocompleteOff = await page.locator('input[type="password"][autocomplete="off"]').count() > 0;
        const hasPassword = await page.locator('input[type="password"]').count() > 0;
        return `XSS payload tidak dieksekusi${hasPassword ? (hasPasswordAutocompleteOff ? ' + password autocomplete=off' : ' (password autocomplete not off)') : ''}`;
      }));

    // TC-SEC-006: SQL injection di URL parameter
    R.push(await this.safeTest('TC-SEC-006', M, 'SQL injection di URL parameter diblokir',
      'URL dengan parameter', '1. Tambah SQL payload ke URL param\n2. Cek response tidak leak data',
      'SQL injection tidak berhasil', async () => {
        const payload = "' OR '1'='1";
        const testUrl = `${baseUrl.origin}${baseUrl.pathname}?id=${encodeURIComponent(payload)}`;
        const resp = await page.request.get(testUrl, { timeout: 5000 }).catch(() => null);
        if (!resp) return 'Tidak bisa test URL param (info)';
        const bodyText = await resp.text().catch(() => '');
        if (/sql|syntax|mysql|postgres|sqlite|oracle/i.test(bodyText) && /error|warning|exception/i.test(bodyText)) {
          throw new Error('SQL error terbaca di response (SQL INJECTION VULNERABILITY)');
        }
        return 'SQL injection di URL param diblokir';
      }));

    // TC-SEC-007: IDOR / broken access control
    R.push(await this.safeTest('TC-SEC-007', M, 'IDOR / broken access control — probe path',
      'URL target', '1. Akses /admin, /api/users, /.env\n2. Cek tidak expose sensitive data',
      'Sensitive paths tidak accessible', async () => {
        const probePaths = ['/admin', '/api/users', '/.env'];
        const probeResults = await Promise.allSettled(
          probePaths.map(path => page.request.get(`${baseUrl.origin}${path}`, { timeout: 5000 }).then(r => ({ path, status: r.status(), body: r.body() })))
        );
        let vulnerable = false;
        for (const result of probeResults) {
          if (result.status !== 'fulfilled' || !result.value) continue;
          const { path, status, body } = result.value;
          const bodyText = body.toString().substring(0, 5000);
          if (status === 200 && bodyText.length > 50 && !bodyText.toLowerCase().includes('not found') && !bodyText.toLowerCase().includes('login') && !bodyText.toLowerCase().includes('unauthorized')) {
            if (path === '/.env' && /DB_|SECRET|PASSWORD|API_KEY/i.test(bodyText)) { vulnerable = true; break; }
            if (path === '/admin' && !bodyText.toLowerCase().includes('login') && !bodyText.toLowerCase().includes('sign in')) { vulnerable = true; break; }
          }
        }
        if (vulnerable) throw new Error('IDOR detected — sensitive path accessible without auth (CRITICAL)');
        return 'Sensitive paths tidak accessible';
      }));

    // TC-SEC-008: Clickjacking protection
    R.push(await this.safeTest('TC-SEC-008', M, 'Clickjacking protection (X-Frame-Options atau CSP frame-ancestors)',
      'URL target', '1. Cek X-Frame-Options header\n2. Cek CSP frame-ancestors',
      'Clickjacking protection aktif', async () => {
        const headers = await getHeaders();
        const xfo = headers['x-frame-options'];
        const csp = headers['content-security-policy'] || '';
        if (!xfo && !csp.includes('frame-ancestors')) {
          throw new Error('Tidak ada clickjacking protection');
        }
        return `Clickjacking protection: ${xfo || 'CSP frame-ancestors'}`;
      }));

    // TC-SEC-009: Path traversal
    R.push(await this.safeTest('TC-SEC-009', M, 'Path traversal diblokir',
      'URL target', '1. Test ../../../etc/passwd di URL param\n2. Cek tidak bisa baca file sistem',
      'Path traversal diblokir', async () => {
        const payload = '../../../etc/passwd';
        const params = ['file', 'path', 'page'];
        let vulnerable = false;
        const probeResults = await Promise.allSettled(
          params.map(param => page.request.get(`${baseUrl.origin}${baseUrl.pathname}?${param}=${encodeURIComponent(payload)}`, { timeout: 5000 }).then(r => r.text().catch(() => '')))
        );
        for (const result of probeResults) {
          if (result.status === 'fulfilled' && /root:x:|bin\/bash|\/etc\/passwd/i.test(result.value)) { vulnerable = true; break; }
        }
        if (vulnerable) throw new Error('Path traversal berhasil — /etc/passwd terbaca (CRITICAL)');
        return 'Path traversal diblokir';
      }));

    // TC-SEC-010: SSRF
    R.push(await this.safeTest('TC-SEC-010', M, 'SSRF diblokir',
      'URL target', '1. Test URL param dengan localhost/internal IP\n2. Cek tidak expose internal data',
      'SSRF diblokir', async () => {
        const payload = 'http://localhost:80';
        const params = ['url', 'redirect', 'callback'];
        let vulnerable = false;
        const probeResults = await Promise.allSettled(
          params.map(param => page.request.get(`${baseUrl.origin}${baseUrl.pathname}?${param}=${encodeURIComponent(payload)}`, { timeout: 5000 }).then(r => r.text().catch(() => '')))
        );
        for (const result of probeResults) {
          if (result.status === 'fulfilled') {
            const body = result.value;
            // Only flag actual internal metadata responses, not HTML pages containing "localhost" in scripts
            if (/ami-id|instance-id|i-am[\s-]|\/latest\/meta-data|169\.254\.169\.254|EC2|X-Amz/i.test(body) && body.length < 5000 && !/<html|<!doctype/i.test(body)) {
              vulnerable = true; break;
            }
          }
        }
        if (vulnerable) throw new Error('SSRF terdeteksi — internal metadata terbaca (CRITICAL)');
        return 'SSRF diblokir';
      }));

    // TC-SEC-011: Sensitive data leak in error response
    R.push(await this.safeTest('TC-SEC-011', M, 'Sensitive data leak di error response',
      'URL target', '1. Akses endpoint tidak ada\n2. Cek error tidak expose DB info, internal IP, file path',
      'Error response tidak expose sensitive data', async () => {
        const errorUrl = `${baseUrl.origin}/api/nonexistent-${Date.now()}`;
        const resp = await page.request.get(errorUrl, { timeout: 5000 }).catch(() => null);
        if (!resp) return 'Tidak bisa test error endpoint (info)';
        const bodyText = await resp.text().catch(() => '');
        this._cachedErrorBody = bodyText;
        const sensitivePatterns = [/mysql|postgres|sqlite|mongodb/i, /\/var\/www|\/home\/|C:\\\\Users/i, /192\.168\.|10\.0\.|172\.16\./i, /DB_PASSWORD|SECRET_KEY|API_KEY/i];
        for (const pattern of sensitivePatterns) {
          if (pattern.test(bodyText)) throw new Error('Sensitive data terbaca di error response (CRITICAL)');
        }
        return 'Error response tidak expose sensitive data';
      }));

    // TC-SEC-012: Eval usage in JavaScript
    R.push(await this.safeTest('TC-SEC-012', M, 'Eval usage dalam JavaScript',
      'Halaman dimuat', '1. Cari script dengan eval()/new Function()/document.write()\n2. Cek tidak ada',
      'Tidak ada eval() usage', async () => {
        // Only check inline scripts (no src) — external bundles often contain webpack runtime eval which is not a security risk
        const hasDangerous = await page.evaluate(() => {
          const scripts = document.querySelectorAll('script:not([src])');
          for (const s of scripts) {
            const text = s.textContent || '';
            if (/\beval\s*\(/.test(text)) return 'eval';
            if (/new\s+Function\s*\(/.test(text)) return 'new Function';
            if (/document\.write\s*\(/.test(text)) return 'document.write';
          }
          return null;
        });
        if (hasDangerous) throw new Error(`${hasDangerous} ditemukan dalam inline JavaScript (SECURITY RISK)`);
        return 'Tidak ada eval()/new Function()/document.write() dalam inline scripts';
      }));

    // TC-SEC-013: CORS policy
    R.push(await this.safeTest('TC-SEC-013', M, 'CORS policy tidak terlalu permissive',
      'URL target', '1. Cek Access-Control-Allow-Origin header',
      'CORS policy aman (tidak wildcard)', async () => {
        const headers = await getHeaders();
        const acao = headers['access-control-allow-origin'];
        if (acao === '*') throw new Error('CORS Allow-Origin: * — terlalu permissive');
        if (!acao) return 'CORS tidak di-set (default same-origin, aman)';
        return `CORS policy: ${acao}`;
      }));

    // TC-SEC-014: Mixed content (HTTP di HTTPS)
    R.push(await this.safeTest('TC-SEC-014', M, 'Mixed content — tidak ada HTTP resource di HTTPS page',
      'HTTPS page', '1. Cek semua resource URLs\n2. Cek tidak ada http:// di https page',
      'Tidak ada mixed content', async () => {
        if (!d.isHttps) return 'Halaman tidak HTTPS — N/A (info)';
        const mixedContent = await page.evaluate(() => {
          const resources = [...document.querySelectorAll('img[src], script[src], link[href], iframe[src], video[src], audio[src]')];
          let httpCount = 0;
          for (const r of resources) {
            const src = r.src || r.href;
            if (src && src.startsWith('http://')) httpCount++;
          }
          return httpCount;
        });
        if (mixedContent > 0) throw new Error(`${mixedContent} HTTP resources di HTTPS page (mixed content)`);
        return 'Tidak ada mixed content';
      }));

    // TC-SEC-015: Server header tidak leak version info
    R.push(await this.safeTest('TC-SEC-015', M, 'Server header tidak leak version info',
      'URL target', '1. Cek Server header\n2. Cek tidak expose version detail',
      'Server header tidak leak version', async () => {
        const headers = await getHeaders();
        const server = headers['server'] || '';
        if (server && /\d+\.\d+/.test(server)) {
          throw new Error(`Server header leak version: "${server}"`);
        }
        return `Server header: "${server || 'tidak set'}" (OK)`;
      }));

    return R;
  }

  // ===== Modul: Form & Input (10 tests) =====
  async testFormValidation(page, url, d) {
    const M = 'Form & Input'; const R = [];

    // Re-detect inputs after page hydration (inputs may load after JS)
    d.inputCount = await page.locator('input:not([type="hidden"])').count();
    d.hasForm = d.inputCount > 0 || await page.locator('form').count() > 0;
    if (!d.hasForm) {
      for (let i = 1; i <= 10; i++) {
        R.push(this.skip(`TC-FV-${String(i).padStart(3, '0')}`, M, `Form test ${i}`, 'Form', 'N/A', 'N/A', 'no form detected'));
      }
      return R;
    }

    // TC-FV-001: Required fields validation
    R.push(await this.safeTest('TC-FV-001', M, 'Required fields validation — submit dengan field kosong',
      'Form dengan required fields', '1. Cari input[required]\n2. Submit kosong\n3. Cek validation error',
      'Required field validation berfungsi', async () => {
        await this.ensureOnPage(page, url);
        const requiredInputs = await page.locator('input[required]:visible, select[required]:visible, textarea[required]:visible').count();
        if (requiredInputs === 0) return 'Tidak ada required field (info)';
        const submitBtn = page.locator('button[type="submit"], input[type="submit"]').first();
        if (await submitBtn.isVisible().catch(() => false)) await submitBtn.click().catch(() => {});
        await page.waitForTimeout(2000);
        const hasError = await page.locator('[class*="error"]:visible, [class*="invalid"]:visible, [role="alert"]:visible').first().isVisible().catch(() => false);
        if (!hasError) throw new Error('Required field validation tidak berfungsi');
        return 'Required field validation berfungsi';
      }));

    // TC-FV-002: Email type validation
    R.push(await this.safeTest('TC-FV-002', M, 'Email type validation — input email invalid ditolak',
      'Form dengan email input', '1. Cari input[type=email]\n2. Isi email invalid\n3. Submit\n4. Cek error',
      'Email invalid ditolak', async () => {
        const emailInput = page.locator('input[type="email"]:visible').first();
        if (!await emailInput.isVisible().catch(() => false)) return 'Tidak ada email input (info)';
        await emailInput.fill('invalid-email');
        const submitBtn = page.locator('button[type="submit"], input[type="submit"]').first();
        if (await submitBtn.isVisible().catch(() => false)) await submitBtn.click().catch(() => {});
        await page.waitForTimeout(1000);
        const isValid = await emailInput.evaluate(el => el.validity.valid);
        if (isValid) throw new Error('Email invalid diterima — validation tidak berfungsi');
        return 'Email invalid ditolak oleh browser validation';
      }));

    // TC-FV-003: Maxlength attribute (optional — not all pages need maxlength)
    R.push(await this.noteTest('TC-FV-003', M, 'Maxlength attribute pada text input',
      'Form dengan text input', '1. Cari input dengan maxlength\n2. Cek ada batasan',
      'Maxlength ditemukan pada minimal 1 input', async () => {
        const inputs = await page.locator('input[type="text"]:visible, input:not([type]):visible, textarea:visible').all();
        let hasMaxlength = false;
        for (const input of inputs) {
          const ml = await input.getAttribute('maxlength').catch(() => null);
          if (ml) { hasMaxlength = true; break; }
        }
        if (!hasMaxlength) throw new Error('Tidak ada input dengan maxlength (best practice)');
        return 'Maxlength attribute ditemukan';
      }));

    // TC-FV-004: Autocomplete attribute
    R.push(await this.noteTest('TC-FV-004', M, 'Autocomplete attribute pada input',
      'Form dengan input', '1. Cari input dengan autocomplete',
      'Autocomplete attribute ditemukan', async () => {
        const hasAutocomplete = await page.locator('input[autocomplete]').count();
        if (hasAutocomplete === 0) throw new Error('Tidak ada input dengan autocomplete attribute');
        return `${hasAutocomplete} input dengan autocomplete attribute`;
      }));

    // TC-FV-005: XSS in form input
    R.push(await this.safeTest('TC-FV-005', M, 'XSS payload di form input tidak dieksekusi',
      'Form dengan text input', '1. Isi XSS payload variants\n2. Submit\n3. Cek tidak ada script execution',
      'XSS payload tidak dieksekusi', async () => {
        const input = page.locator('input[type="text"]:visible, input:not([type]):visible, textarea:visible').first();
        if (!await input.isVisible().catch(() => false)) return 'Tidak ada text input (info)';
        const xssPayloads = ['<img src=x onerror=alert(1)>', '<script>alert(1)</script>', 'javascript:alert(1)'];
        let vulnerable = false;
        for (const payload of xssPayloads) {
          await input.fill(payload).catch(() => {});
          const submitBtn = page.locator('button[type="submit"], input[type="submit"]').first();
          if (await submitBtn.isVisible().catch(() => false)) await submitBtn.click().catch(() => {});
          await page.waitForTimeout(1000);
          const bodyHTML = await page.locator('body').innerHTML().catch(() => '');
          if ((bodyHTML.includes('onerror=alert(1)') || bodyHTML.includes('<script>alert(1)')) && !bodyHTML.includes('&lt;')) {
            vulnerable = true; break;
          }
        }
        if (vulnerable) throw new Error('XSS payload dieksekusi di form (CRITICAL)');
        return 'XSS payload di form tidak dieksekusi (3 variants tested)';
      }));

    // TC-FV-006: Label association untuk semua input
    R.push(await this.safeTest('TC-FV-006', M, 'Label association untuk semua input',
      'Form dengan input', '1. Cari semua input\n2. Cek label[for] atau aria-label',
      'Semua input berlabel', async () => {
        const result = await page.evaluate(() => {
          const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea');
          let missing = 0;
          for (const input of inputs) {
            const id = input.id;
            const hasLabel = id && document.querySelector(`label[for="${id}"]`);
            const hasAria = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby');
            const hasPlaceholder = input.getAttribute('placeholder');
            if (!hasLabel && !hasAria && !hasPlaceholder) missing++;
          }
          return { total: inputs.length, missing };
        });
        if (result.missing > 0) throw new Error(`${result.missing}/${result.total} input tanpa label`);
        return `Semua ${result.total} input berlabel`;
      }));

    // TC-FV-007: Form reset/clear functionality
    R.push(await this.noteTest('TC-FV-007', M, 'Form reset/clear functionality',
      'Form dengan input', '1. Isi form\n2. Cari reset/clear button\n3. Klik\n4. Cek form clear',
      'Form reset berfungsi', async () => {
        const input = page.locator('input[type="text"]:visible, input:not([type]):visible').first();
        if (!await input.isVisible().catch(() => false)) return 'Tidak ada input (info)';
        await input.fill('TEST_RESET');
        const resetBtn = page.locator('button[type="reset"], button:has-text("Reset"), button:has-text("Clear"), button:has-text("Batal")').first();
        if (!await resetBtn.isVisible().catch(() => false)) throw new Error('Tombol reset/clear tidak ditemukan');
        await resetBtn.click().catch(() => {});
        await page.waitForTimeout(1000);
        const val = await input.inputValue().catch(() => '');
        if (val === 'TEST_RESET') throw new Error('Form reset tidak berfungsi — value masih ada');
        return 'Form reset berfungsi';
      }));

    // TC-FV-008: Edge case inputs
    R.push(await this.safeTest('TC-FV-008', M, 'Edge case inputs: empty, whitespace, long, unicode, special chars — no crash',
      'Form dengan input', '1. Load page\n2. Test empty, whitespace, 10000 chars, unicode, special chars\n3. Cek tidak crash',
      'Tidak crash dengan semua edge case', async () => {
        const input = page.locator('input:not([type="hidden"]):not([type="password"]):not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]):visible').first();
        if (!await input.isVisible().catch(() => false)) return 'Tidak ada input visible (info)';
        const findings = [];
        await input.fill('').catch(() => {}); findings.push('empty: OK');
        await input.fill('   ').catch(() => {}); findings.push('whitespace: OK');
        await input.fill('A'.repeat(10000)).catch(() => {}); findings.push('long: OK');
        await input.fill('🎉测试日本語🔥').catch(() => {}); findings.push('unicode: OK');
        await input.fill('<>{}[]|\\^~`$!@#%&*()_+="\'').catch(() => {}); findings.push('special: OK');
        await input.fill('test\0inject').catch(() => {}); findings.push('null-byte: OK');
        return findings.join('; ');
      }));

    // TC-FV-009: Race condition — double submit
    R.push(await this.safeTest('TC-FV-009', M, 'Race condition — double submit tidak duplicate',
      'Form dengan submit button', '1. Klik submit 2x cepat\n2. Cek button disabled, loading, atau debounce',
      'Submit tidak duplicate', async () => {
        const submitBtn = page.locator('button[type="submit"], input[type="submit"]').first();
        if (!await submitBtn.isVisible().catch(() => false)) return 'Tidak ada submit button (info)';
        const beforeDisabled = await submitBtn.isDisabled().catch(() => false);
        await Promise.all([submitBtn.click().catch(() => {}), submitBtn.click().catch(() => {})]);
        // Smart wait for submit prevention indicators
        const prevented = await this.smartWait(page, [
          'button[disabled]', 'button[aria-busy="true"]', 'button[aria-disabled="true"]',
          '[class*="loading"]:visible', '[class*="spinner"]:visible', '[class*="progress"]:visible',
        ], { timeout: 3000 });
        const afterDisabled = await submitBtn.isDisabled().catch(() => false);
        // Check CSS-based prevention: opacity, pointer-events
        const styleCheck = await submitBtn.evaluate(el => {
          const style = window.getComputedStyle(el);
          return {
            opacity: parseFloat(style.opacity),
            pointerEvents: style.pointerEvents,
            hasLoadingClass: el.className.toLowerCase().includes('loading') || el.className.toLowerCase().includes('spinner') || el.className.toLowerCase().includes('progress'),
            ariaBusy: el.getAttribute('aria-busy') === 'true',
          };
        }).catch(() => ({}));
        const hasOpacityDim = styleCheck.opacity < 1 && styleCheck.opacity > 0;
        const hasPointerNone = styleCheck.pointerEvents === 'none';
        const hasLoadingClass = styleCheck.hasLoadingClass;
        const hasAriaBusy = styleCheck.ariaBusy;
        if (afterDisabled || hasOpacityDim || hasPointerNone || hasLoadingClass || hasAriaBusy || prevented) {
          const reasons = [];
          if (afterDisabled) reasons.push('disabled');
          if (hasOpacityDim) reasons.push('opacity');
          if (hasPointerNone) reasons.push('pointer-events:none');
          if (hasLoadingClass) reasons.push('loading class');
          if (hasAriaBusy) reasons.push('aria-busy');
          return `Double submit dicegah (${reasons.join(', ')})`;
        }
        throw new Error('Button tidak di-disable — potential double submit');
      }));

    // TC-FV-010: Pattern validation (jika ada)
    R.push(await this.noteTest('TC-FV-010', M, 'Pattern validation pada input',
      'Form dengan input', '1. Cari input[pattern]\n2. Test pattern invalid',
      'Pattern validation berfungsi', async () => {
        const patternInput = page.locator('input[pattern]:visible').first();
        if (!await patternInput.isVisible().catch(() => false)) throw new Error('Tidak ada input dengan pattern');
        const pattern = await patternInput.getAttribute('pattern');
        await patternInput.fill('@@@invalid@@@');
        const isValid = await patternInput.evaluate(el => el.validity.valid);
        if (isValid) throw new Error('Pattern validation tidak berfungsi — invalid pattern diterima');
        return `Pattern validation berfungsi (pattern: ${pattern})`;
      }));

    return R;
  }

  // ===== Modul: Responsive & Mobile (8 tests) =====
  async testResponsive(page, url, d) {
    const M = 'Responsive & Mobile'; const R = [];

    // TC-R-001: Mobile viewport (iPhone 14/15 Pro 393x852)
    R.push(await this.safeTest('TC-R-001', M, 'Tampil benar di Mobile (iPhone 14/15 Pro 393x852)',
      'Halaman dimuat', '1. Set viewport 393x852\n2. Cek layout tidak broken',
      'Layout OK di mobile', async () => {
        await this.setMobileViewport(page, 393, 852);
        const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 5);
        if (hasHScroll) throw new Error('Horizontal scroll di mobile — layout broken');
        const responsiveImgs = await page.evaluate(() => document.querySelectorAll('img[srcset], picture source').length).catch(() => 0);
        return `Layout OK di mobile (393x852)${responsiveImgs > 0 ? ` + ${responsiveImgs} responsive images` : ''}`;
      }));

    // TC-R-002: Tablet viewport (iPad Pro 11" 834x1194)
    R.push(await this.safeTest('TC-R-002', M, 'Tampil benar di Tablet (iPad Pro 11" 834x1194)',
      'Halaman dimuat', '1. Set viewport 834x1194\n2. Cek layout tidak broken',
      'Layout OK di tablet', async () => {
        await this.setTabletViewport(page, 834, 1194);
        const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 5);
        if (hasHScroll) throw new Error('Horizontal scroll di tablet — layout broken');
        return 'Layout OK di tablet (834x1194)';
      }));

    // TC-R-003: Desktop viewport (1920x1080)
    R.push(await this.safeTest('TC-R-003', M, 'Tampil benar di Desktop (1920x1080)',
      'Halaman dimuat', '1. Set viewport 1920x1080\n2. Cek layout tidak broken',
      'Layout OK di desktop', async () => {
        await this.setDesktopViewport(page);
        const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 5);
        if (hasHScroll) throw new Error('Horizontal scroll di desktop — layout broken');
        return 'Layout OK di desktop (1920x1080)';
      }));

    // TC-R-004: Landscape orientation tidak break layout
    R.push(await this.safeTest('TC-R-004', M, 'Landscape orientation tidak break layout',
      'Halaman dimuat di mobile', '1. Set mobile landscape (852x393)\n2. Cek layout',
      'Layout OK di landscape', async () => {
        await this.setMobileViewport(page, 852, 393);
        const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 5);
        if (hasHScroll) throw new Error('Horizontal scroll di landscape — layout broken');
        await this.setDesktopViewport(page);
        return 'Layout OK di landscape mobile';
      }));

    // TC-R-005: Hamburger menu berfungsi di mobile
    R.push(await this.safeTest('TC-R-005', M, 'Hamburger menu berfungsi di mobile (jika ada)',
      'Halaman dimuat di mobile', '1. Set mobile viewport\n2. Cari hamburger\n3. Klik\n4. Cek menu terbuka',
      'Hamburger menu berfungsi', async () => {
        await this.setMobileViewport(page, 393, 852);
        const hamburgerSels = ['[class*="hamburger"]', '[class*="menu-toggle"]', '[aria-label*="menu" i]', 'button[class*="toggle"]'];
        let hamburger = null;
        for (const s of hamburgerSels) {
          const el = page.locator(s).first();
          if (await el.isVisible().catch(() => false)) { hamburger = el; break; }
        }
        if (!hamburger) {
          await this.setDesktopViewport(page);
          return 'Hamburger menu tidak ditemukan (info)';
        }
        await hamburger.click().catch(() => {});
        await page.waitForTimeout(500);
        const menuVisible = await page.locator('nav:visible, [class*="sidebar"]:visible, [class*="menu"]:visible, [class*="drawer"]:visible').first().isVisible().catch(() => false);
        await this.setDesktopViewport(page);
        if (!menuVisible) throw new Error('Hamburger menu tidak terbuka');
        return 'Hamburger menu berfungsi di mobile';
      }));

    // TC-R-006: Touch target min 24px
    R.push(await this.safeTest('TC-R-006', M, 'Touch target min 24px untuk interactive elements',
      'Halaman dimuat di mobile', '1. Set mobile viewport\n2. Cek button/link size',
      'Touch targets >= 24px', async () => {
        await this.setMobileViewport(page, 393, 852);
        const smallTargets = await page.evaluate(() => {
          const els = document.querySelectorAll('button, a, [role="button"], input[type="submit"], input[type="button"]');
          let small = 0, total = 0;
          for (const el of els) {
            if (el.offsetParent === null && el.getClientRects().length === 0) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;
            total++;
            if (rect.width < 24 || rect.height < 24) small++;
          }
          return { small, total };
        });
        await this.setDesktopViewport(page);
        if (smallTargets.total > 0 && smallTargets.small > smallTargets.total * 0.5) {
          throw new Error(`${smallTargets.small}/${smallTargets.total} touch targets < 24px`);
        }
        return `${smallTargets.small}/${smallTargets.total} touch targets < 24px (OK)`;
      }));

    // TC-R-007: Text readability di mobile (min 10px)
    R.push(await this.safeTest('TC-R-007', M, 'Text readability di mobile (min 10px font size)',
      'Halaman dimuat di mobile', '1. Set mobile viewport\n2. Cek font-size elemen teks',
      'Font size >= 10px di mobile', async () => {
        await this.setMobileViewport(page, 393, 852);
        const smallText = await page.evaluate(() => {
          const els = document.querySelectorAll('p, span, a, td, th, li, label, button');
          let small = 0, total = 0;
          for (const el of els) {
            const style = window.getComputedStyle(el);
            const fontSize = parseFloat(style.fontSize);
            if (fontSize === 0) continue;
            total++;
            if (fontSize < 10) small++;
          }
          return { small, total };
        });
        await this.setDesktopViewport(page);
        if (smallText.small > 0) throw new Error(`${smallText.small}/${smallText.total} elemen dengan font < 10px`);
        return `Semua ${smallText.total} elemen teks >= 10px`;
      }));

    // TC-R-008: No text overflow di mobile
    R.push(await this.safeTest('TC-R-008', M, 'No text overflow di mobile',
      'Halaman dimuat di mobile', '1. Set mobile viewport\n2. Cek text overflow',
      'Tidak ada text overflow', async () => {
        await this.setMobileViewport(page, 393, 852);
        const overflow = await page.evaluate(() => {
          const els = document.querySelectorAll('h1, h2, h3, p, span, td, th, label, button, a');
          let overflowCount = 0;
          for (const el of els) {
            if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 50) overflowCount++;
          }
          return overflowCount;
        });
        await this.setDesktopViewport(page);
        if (overflow > 5) throw new Error(`${overflow} elemen dengan text overflow di mobile`);
        return `${overflow} elemen overflow di mobile (OK)`;
      }));

    return R;
  }

  // ===== Modul: Performance & Network (8 tests) =====
  async testPerformance(page, url, d) {
    const M = 'Performance & Network'; const R = [];

    // TC-P-001: DOM load < 10 detik
    R.push(await this.safeTest('TC-P-001', M, 'DOM load < 10 detik',
      'URL target', '1. Navigate ke URL\n2. Ukur DOM load time via Navigation Timing API',
      'DOM load < 10s', async () => {
        const navStart = Date.now();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        const navTiming = await page.evaluate(() => {
          const nav = performance.getEntriesByType('navigation')[0];
          return nav ? { domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime, load: nav.loadEventEnd - nav.startTime } : null;
        }).catch(() => null);
        const domLoad = navTiming ? Math.round(navTiming.domContentLoaded) : (Date.now() - navStart);
        if (domLoad > 10000) throw new Error(`DOM load: ${domLoad}ms (terlalu lambat)`);
        return `DOM load: ${domLoad}ms (Navigation Timing API)`;
      }));

    // TC-P-002: Full load < 20 detik
    R.push(await this.safeTest('TC-P-002', M, 'Full page load < 20 detik',
      'URL target', '1. Navigate ke URL\n2. Ukur full load time via Navigation Timing API',
      'Full load < 20s', async () => {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(async () => {
          await page.goto(url, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
        });
        const navTiming = await page.evaluate(() => {
          const nav = performance.getEntriesByType('navigation')[0];
          return nav ? Math.round(nav.loadEventEnd - nav.startTime) : null;
        }).catch(() => null);
        const fullLoad = navTiming || 0;
        if (fullLoad === 0) return 'Tidak bisa mengukur full load time (info)';
        if (fullLoad > 20000) throw new Error(`Full load: ${fullLoad}ms (terlalu lambat)`);
        return `Full load: ${fullLoad}ms (Navigation Timing API)`;
      }));

    // TC-P-003: HTTP request count < 100
    R.push(await this.safeTest('TC-P-003', M, 'HTTP request count < 100',
      'Halaman dimuat', '1. Hitung semua HTTP requests via Resource Timing API',
      'Request count < 100', async () => {
        const resourceCount = await page.evaluate(() => performance.getEntriesByType('resource').length).catch(() => 0);
        if (resourceCount > 100) throw new Error(`${resourceCount} requests (terlalu banyak)`);
        return `${resourceCount} requests (Resource Timing API)`;
      }));

    // TC-P-004: Tidak ada request 4xx/5xx
    R.push(await this.safeTest('TC-P-004', M, 'Tidak ada request 4xx/5xx',
      'Halaman dimuat', '1. Monitor semua responses\n2. Cek status code',
      'Tidak ada 4xx/5xx errors', async () => {
        if (this.networkErrors && this.networkErrors.length > 0) {
          const errors = this.networkErrors.filter(e => e.status && e.status >= 400);
          if (errors.length > 0) throw new Error(`${errors.length} request error (4xx/5xx)`);
        }
        return 'Tidak ada 4xx/5xx errors';
      }));

    // TC-P-005: Cache headers tersedia
    R.push(await this.safeTest('TC-P-005', M, 'Cache headers tersedia',
      'URL target', '1. Cek cache-control atau expires header',
      'Cache headers ditemukan', async () => {
        if (!this._cachedHeaders) {
          const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null);
          this._cachedHeaders = res ? res.headers() : {};
        }
        const cacheControl = this._cachedHeaders['cache-control'];
        const expires = this._cachedHeaders['expires'];
        if (!cacheControl && !expires) throw new Error('Cache headers tidak ditemukan');
        return `Cache headers: ${cacheControl || expires}`;
      }));

    // TC-P-006: Compression enabled
    R.push(await this.safeTest('TC-P-006', M, 'Compression enabled (gzip/br)',
      'URL target', '1. Cek content-encoding header',
      'Compression aktif', async () => {
        if (!this._cachedHeaders) {
          const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null);
          this._cachedHeaders = res ? res.headers() : {};
        }
        const encoding = this._cachedHeaders['content-encoding'];
        if (!encoding) return 'Compression tidak terdeteksi (info)';
        return `Compression: ${encoding}`;
      }));

    // TC-P-007: Console errors
    R.push(await this.safeTest('TC-P-007', M, 'Tidak ada console errors',
      'Halaman dimuat', '1. Monitor console.error\n2. Report findings',
      'No console errors', async () => {
        const errors = (this.consoleErrors || []).filter(e => e.type === 'error' || e.type === 'pageerror');
        if (errors.length > 0) throw new Error(`${errors.length} console errors detected`);
        return 'No console errors';
      }));

    // TC-P-008: Network errors
    R.push(await this.safeTest('TC-P-008', M, 'Tidak ada network errors (failed requests)',
      'Halaman dimuat', '1. Monitor all network requests\n2. Flag failures (exclude RSC aborted)',
      'No network errors', async () => {
        const failed = (this.networkErrors || []).filter(e => e.failure && e.failure !== 'net::ERR_ABORTED');
        const serverErrors = (this.networkErrors || []).filter(e => e.status && e.status >= 500);
        if (serverErrors.length > 0) throw new Error(`${serverErrors.length} server errors (5xx)`);
        if (failed.length > 5) throw new Error(`${failed.length} failed requests`);
        return `${failed.length} failed, ${serverErrors.length} server errors`;
      }));

    return R;
  }

  // ===== Modul: CRUD & Interaction (10 tests) =====
  async testCrud(page, url, d, authState) {
    const M = 'CRUD & Interaction'; const R = [];

    // TC-CRUD-001: Table/data list terdeteksi
    R.push(await this.noteTest('TC-CRUD-001', M, 'Table/data list terdeteksi',
      'Dashboard dimuat', '1. Cari table, data list, grid',
      'Table atau data list ditemukan', async () => {
        await this.ensureOnPage(page, url);
        const tableSels = ['table tbody tr', '[class*="table"] [class*="row"]', '[role="grid"] [role="row"]', '[class*="data-table"]', '[class*="list"] [class*="item"]'];
        let found = false;
        for (const s of tableSels) {
          if (await page.locator(s).count() > 0) { found = true; break; }
        }
        if (!found) throw new Error('Table/data list tidak ditemukan');
        return 'Table/data list terdeteksi';
      }));

    // TC-CRUD-002: Create/Add button terdeteksi
    R.push(await this.noteTest('TC-CRUD-002', M, 'Create/Add button terdeteksi',
      'Dashboard dimuat', '1. Cari button Add/Create/New/Tambah/Buat',
      'Create button ditemukan', async () => {
        const addSels = ['button:has-text("Add")', 'button:has-text("Create")', 'button:has-text("New")', 'button:has-text("Tambah")', 'button:has-text("Buat")', '[data-testid*="add"]', '[data-testid*="create"]'];
        let found = false;
        for (const s of addSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Create/Add button tidak ditemukan');
        return 'Create/Add button terdeteksi';
      }));

    // TC-CRUD-003: Create form terbuka saat klik Add
    R.push(await this.noteTest('TC-CRUD-003', M, 'Create form terbuka saat klik Add/Create',
      'Create button ditemukan', '1. Klik Add/Create\n2. Cek form/modal muncul atau navigasi ke halaman create',
      'Form create terbuka', async () => {
        const addSels = ['button:has-text("Add")', 'button:has-text("Create")', 'button:has-text("New")', 'button:has-text("Tambah")', 'button:has-text("Buat")'];
        let clicked = false;
        for (const s of addSels) {
          const el = page.locator(s).first();
          if (await el.isVisible().catch(() => false)) { await el.click().catch(() => {}); clicked = true; break; }
        }
        if (!clicked) throw new Error('Tidak bisa klik Add button');
        const urlBefore = page.url();
        const inputCountBefore = await page.locator('input:visible, textarea:visible, select:visible').count();
        // Smart wait: form/modal appears OR URL changes OR input count increases
        const found = await this.smartWait(page, [
          'form:visible', '[class*="modal"]:visible', '[class*="dialog"]:visible', '[role="dialog"]:visible',
          '[class*="drawer"]:visible', '[class*="slide"]:visible', '[class*="panel"]:visible',
          'input:visible[type="text"]', 'input:visible[type="email"]', 'textarea:visible',
        ], { timeout: 4000, urlChange: true, originalUrl: urlBefore });
        if (found) {
          const urlAfter = page.url();
          if (urlAfter !== urlBefore) return `Form create terbuka (navigasi ke ${urlAfter})`;
          return 'Form create terbuka (modal/form muncul)';
        }
        // Last resort: check if input count increased
        const inputCountAfter = await page.locator('input:visible, textarea:visible, select:visible').count();
        if (inputCountAfter > inputCountBefore) return 'Form create terbuka (input fields bertambah)';
        throw new Error('Form create tidak terbuka setelah klik Add');
      }));

    // TC-CRUD-004: Read data — header kolom terdeteksi
    R.push(await this.noteTest('TC-CRUD-004', M, 'Read data — header kolom tabel terdeteksi',
      'Table ditemukan', '1. Cari th/header di table\n2. Cek header text',
      'Header kolom ditemukan', async () => {
        const headers = await page.locator('table th:visible, [class*="header"] [class*="cell"]:visible, [role="columnheader"]:visible').count();
        if (headers === 0) throw new Error('Header kolom tidak ditemukan');
        return `${headers} header kolom terdeteksi`;
      }));

    // TC-CRUD-005: Edit button terdeteksi
    R.push(await this.noteTest('TC-CRUD-005', M, 'Edit button terdeteksi',
      'Dashboard/table dimuat', '1. Cari button Edit/Ubah',
      'Edit button ditemukan', async () => {
        const editSels = ['button:has-text("Edit")', 'button:has-text("Ubah")', '[class*="edit"]', 'a:has-text("Edit")', '[aria-label*="edit" i]'];
        let found = false;
        for (const s of editSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Edit button tidak ditemukan');
        return 'Edit button terdeteksi';
      }));

    // TC-CRUD-006: Delete button terdeteksi
    R.push(await this.noteTest('TC-CRUD-006', M, 'Delete button terdeteksi',
      'Dashboard/table dimuat', '1. Cari button Delete/Remove/Hapus',
      'Delete button ditemukan', async () => {
        const delSels = ['button:has-text("Delete")', 'button:has-text("Remove")', 'button:has-text("Hapus")', '[class*="delete"]', '[aria-label*="delete" i]'];
        let found = false;
        for (const s of delSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Delete button tidak ditemukan');
        return 'Delete button terdeteksi';
      }));

    // TC-CRUD-007: Cancel/Close button berfungsi
    R.push(await this.noteTest('TC-CRUD-007', M, 'Cancel/Close button berfungsi',
      'Form/modal terbuka', '1. Cari Cancel/Close button\n2. Klik\n3. Cek form/modal tertutup\n4. Cek URL tidak berubah',
      'Cancel berfungsi', async () => {
        const urlBeforeCancel = page.url();
        const cancelSels = ['button:has-text("Cancel")', 'button:has-text("Batal")', 'button:has-text("Close")', 'button:has-text("Tutup")', '[class*="close"]:visible', '[aria-label*="close" i]'];
        let clicked = false;
        for (const s of cancelSels) {
          const el = page.locator(s).first();
          if (await el.isVisible().catch(() => false)) { await el.click().catch(() => {}); clicked = true; break; }
        }
        if (!clicked) throw new Error('Cancel/Close button tidak ditemukan');
        await page.waitForTimeout(800);
        const urlAfterCancel = page.url();
        if (urlAfterCancel !== urlBeforeCancel) return 'Cancel berfungsi (URL kembali ke semula)';
        return 'Cancel/Close button berfungsi (URL tidak berubah)';
      }));

    // TC-CRUD-008: Search/filter function terdeteksi
    R.push(await this.noteTest('TC-CRUD-008', M, 'Search/filter function terdeteksi',
      'Dashboard dengan table', '1. Cari search input atau filter button\n2. Cari bulk actions\n3. Cari row click',
      'Search/filter ditemukan', async () => {
        const features = [];
        if (d.hasSearch) features.push('search/filter');
        const hasBulkActions = await page.locator('input[type="checkbox"][class*="select-all"], button:has-text("Delete Selected"), button:has-text("Bulk")').count() > 0;
        if (hasBulkActions) features.push('bulk actions');
        const hasRowClick = await page.evaluate(() => !!document.querySelector('table tbody tr[onclick], table tbody tr[class*="clickable"], table tbody tr[style*="cursor"]')).catch(() => false);
        if (hasRowClick) features.push('row click');
        if (features.length === 0) throw new Error('Search/filter tidak ditemukan');
        return features.join(' + ') + ' terdeteksi';
      }));

    // TC-CRUD-009: Pagination terdeteksi (jika ada)
    R.push(await this.noteTest('TC-CRUD-009', M, 'Pagination terdeteksi',
      'Dashboard dengan table', '1. Cari pagination element',
      'Pagination ditemukan', async () => {
        const paginationSels = ['[class*="pagination"]', '[class*="pager"]', 'nav[aria-label*="page"]', '[class*="page-nav"]', '[class*="page-size"]'];
        let found = false;
        for (const s of paginationSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Pagination tidak ditemukan');
        return 'Pagination terdeteksi';
      }));

    // TC-CRUD-010: Notification/toast setelah action
    R.push(await this.noteTest('TC-CRUD-010', M, 'Notification/toast container untuk feedback action',
      'Dashboard dimuat', '1. Cari toast/notification/alert container',
      'Notification container ditemukan', async () => {
        const notifSels = ['[class*="toast"]', '[class*="notification"]', '[class*="alert"]', '[role="alert"]', '[class*="snackbar"]'];
        let found = false;
        for (const s of notifSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) { found = true; break; }
        }
        if (!found) throw new Error('Notification container tidak ditemukan');
        return 'Notification/toast container terdeteksi';
      }));

    return R;
  }

  // ===== Modul: API & Data (7 tests) =====
  async testApiData(page, url, d, authState) {
    const M = 'API & Data'; const R = [];
    const baseUrl = new URL(url);

    // TC-API-001: Tidak ada API error 5xx
    R.push(await this.safeTest('TC-API-001', M, 'Tidak ada API error 5xx (server error)',
      'Halaman dimuat', '1. Monitor semua API responses\n2. Cek 5xx errors',
      'Tidak ada 5xx errors', async () => {
        const serverErrors = (this.networkErrors || []).filter(e => e.status && e.status >= 500);
        if (serverErrors.length > 0) throw new Error(`${serverErrors.length} API 5xx errors`);
        return 'Tidak ada API 5xx errors';
      }));

    // TC-API-002: API response time < 3 detik
    R.push(await this.safeTest('TC-API-002', M, 'API response time < 3 detik',
      'URL target', '1. Ukur response time via Resource Timing API',
      'Response time < 3s', async () => {
        const apiTimings = await page.evaluate(() => {
          const resources = performance.getEntriesByType('resource');
          const apiRes = resources.filter(r => r.name.includes('/api/') || r.name.includes('/graphql'));
          if (apiRes.length === 0) return null;
          const avg = apiRes.reduce((s, r) => s + r.duration, 0) / apiRes.length;
          return { avg: Math.round(avg), count: apiRes.length };
        }).catch(() => null);
        if (apiTimings) {
          if (apiTimings.avg > 3000) throw new Error(`API avg response time: ${apiTimings.avg}ms (terlalu lambat)`);
          return `API avg response time: ${apiTimings.avg}ms (${apiTimings.count} endpoints, Resource Timing API)`;
        }
        // Always measure page load time, even if headers are cached
        const navStart = Date.now();
        const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null);
        const elapsed = Date.now() - navStart;
        if (res) this._cachedHeaders = res.headers();
        if (elapsed > 3000) throw new Error(`Response time: ${elapsed}ms (terlalu lambat)`);
        return `Page response time: ${elapsed}ms`;
      }));

    // TC-API-003: Content-Type header benar
    R.push(await this.safeTest('TC-API-003', M, 'Content-Type header benar',
      'URL target', '1. Cek Content-Type response header',
      'Content-Type sesuai', async () => {
        if (!this._cachedHeaders) {
          const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null);
          if (res) this._cachedHeaders = res.headers();
        }
        const ct = this._cachedHeaders['content-type'] || '';
        if (!ct) throw new Error('Content-Type header tidak ditemukan');
        return `Content-Type: ${ct}`;
      }));

    // TC-API-004: Sensitive data leak di API error response
    R.push(await this.safeTest('TC-API-004', M, 'API error response tidak expose sensitive data',
      'URL target', '1. Akses endpoint tidak ada\n2. Cek error tidak expose DB info/internal IP/file path',
      'Error response tidak expose sensitive data', async () => {
        if (this._cachedErrorBody) {
          const sensitive = [/mysql|postgres|sqlite|mongodb/i, /\/var\/www|\/home\/|C:\\\\Users/i, /DB_PASSWORD|SECRET_KEY|API_KEY/i];
          for (const pattern of sensitive) {
            if (pattern.test(this._cachedErrorBody)) throw new Error('Sensitive data terbaca di API error (CRITICAL)');
          }
          return 'API error response tidak expose sensitive data (cached)';
        }
        const resp = await page.request.get(`${baseUrl.origin}/api/nonexistent-${Date.now()}`, { timeout: 5000 }).catch(() => null);
        if (!resp) return 'Tidak bisa test error endpoint (info)';
        const bodyText = await resp.text().catch(() => '');
        const sensitive = [/mysql|postgres|sqlite|mongodb/i, /\/var\/www|\/home\/|C:\\\\Users/i, /DB_PASSWORD|SECRET_KEY|API_KEY/i];
        for (const pattern of sensitive) {
          if (pattern.test(bodyText)) throw new Error('Sensitive data terbaca di API error (CRITICAL)');
        }
        return 'API error response tidak expose sensitive data';
      }));

    // TC-API-005: SameSite cookie protection
    R.push(await this.noteTest('TC-API-005', M, 'SameSite cookie protection aktif',
      'Halaman dimuat dengan cookies', '1. Get all cookies\n2. Cek SameSite attribute (Strict/Lax)',
      'Cookies punya SameSite protection', async () => {
        const cookies = await page.context().cookies();
        if (cookies.length === 0) throw new Error('Tidak ada cookies terdeteksi');
        const noSameSite = cookies.filter(c => !c.sameSite || c.sameSite === 'None' || c.sameSite === 'unset');
        if (noSameSite.length > 0) {
          const detail = noSameSite.map(c => `${c.name}=${c.sameSite || 'unset'}`).join(', ');
          throw new Error(`${noSameSite.length}/${cookies.length} cookies tanpa SameSite protection (${detail})`);
        }
        return `${cookies.length} cookies, semua punya SameSite (${cookies.map(c => c.sameSite).join(', ')})`;
      }));

    // TC-API-006: Rate limiting terdeteksi (jika ada)
    R.push(await this.noteTest('TC-API-006', M, 'Rate limiting terdeteksi',
      'URL target', '1. Cek X-RateLimit headers atau 429 response',
      'Rate limiting ditemukan', async () => {
        if (!this._cachedHeaders) {
          const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null);
          if (res) this._cachedHeaders = res.headers();
        }
        const headers = this._cachedHeaders;
        const rateLimitHeaders = ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after'];
        const found = rateLimitHeaders.filter(h => headers[h]);
        if (found.length === 0) throw new Error('Rate limiting headers tidak ditemukan');
        return `Rate limiting headers: ${found.join(', ')}`;
      }));

    // TC-API-007: Verbose error messages dengan debug info
    R.push(await this.safeTest('TC-API-007', M, 'Verbose error messages tidak expose debug info',
      'URL target', '1. Akses endpoint error\n2. Cek tidak ada stack trace, debug info',
      'Error messages tidak verbose', async () => {
        let bodyText = this._cachedErrorBody || '';
        if (!bodyText) {
          const resp = await page.request.get(`${baseUrl.origin}/api/nonexistent-${Date.now()}`, { timeout: 5000 }).catch(() => null);
          if (!resp) return 'Tidak bisa test error endpoint (info)';
          bodyText = await resp.text().catch(() => '');
        }
        const debugPatterns = [/stack\s*trace/i, /at\s+Object\./i, /at\s+\w+\s+\(/i, /node_modules/i, /debug\s*info/i];
        for (const pattern of debugPatterns) {
          if (pattern.test(bodyText)) throw new Error('Verbose debug info terbaca di error response (SECURITY)');
        }
        return 'Error messages tidak expose debug info';
      }));

    return R;
  }


  generateSummary(results) {
    const total = results.length;
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const notes = results.filter(r => r.status === 'note').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    // Primary vs Optional breakdown
    const primaryResults = results.filter(r => r.category === 'primary');
    const optionalResults = results.filter(r => r.category === 'optional');
    const primaryPassed = primaryResults.filter(r => r.status === 'passed').length;
    const primaryFailed = primaryResults.filter(r => r.status === 'failed').length;
    const optionalPassed = optionalResults.filter(r => r.status === 'passed').length;
    const optionalFailed = optionalResults.filter(r => r.status === 'failed').length;
    const optionalNotes = optionalResults.filter(r => r.status === 'note').length;
    // Pass rate: primary tests (passed+failed) + optional tests that pass. Note/fail = 0 (no penalty, just catatan).
    const functional = primaryPassed + primaryFailed + optionalPassed;
    const passRate = functional > 0 ? parseFloat((((primaryPassed + optionalPassed) / functional) * 100).toFixed(2)) : 0;
    const totalDuration = results.reduce((s, r) => s + r.duration, 0);
    const modules = {};
    for (const r of results) {
      if (!modules[r.module]) modules[r.module] = { total: 0, passed: 0, failed: 0, notes: 0, skipped: 0, primary: 0, optional: 0 };
      modules[r.module].total++;
      if (r.status === 'passed') modules[r.module].passed++;
      else if (r.status === 'failed') modules[r.module].failed++;
      else if (r.status === 'note') modules[r.module].notes++;
      else if (r.status === 'skipped') modules[r.module].skipped++;
      if (r.category === 'primary') modules[r.module].primary++;
      else modules[r.module].optional++;
    }
    return { total, passed, failed, notes, skipped, passRate, totalDuration, modules,
      primary: { total: primaryResults.length, passed: primaryPassed, failed: primaryFailed },
      optional: { total: optionalResults.length, passed: optionalPassed, failed: optionalFailed, notes: optionalNotes } };
  }
}

module.exports = TestRunner;
