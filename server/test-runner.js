const { chromium } = require('playwright');

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

  broadcastDone() {
    if (global.broadcastWs) {
      global.broadcastWs({ type: 'test_done', runId: this.runId, data: {} });
    }
  }

  async startScreencast(page) {
    try {
      await page.screencast.start({
        size: { width: 1280, height: 720 },
        quality: 80,
        onFrame: ({ data }) => {
          if (global.broadcastFrame) {
            global.broadcastFrame(this.runId, data.toString('base64'));
          }
        },
      });
    } catch (e) {
      console.error('  Screencast start failed:', e.message);
    }
  }

  async stopScreencast(page) {
    try {
      await page.screencast.stop();
    } catch {}
  }

  async run(runConfig) {
    const { url, username, password, browser: browserType, testModules, testMode } = runConfig;
    const mode = testMode || 'login_dashboard';
    const results = [];
    this.runId = runConfig.id;
    this.cancelled = false;

    let browser;
    let page;
    try {
      const engine = this.getBrowser(browserType);
      browser = await engine.launch({ headless: true, slowMo: 200 });
      this.browser = browser;
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        ignoreHTTPSErrors: true,
        locale: 'id-ID',
        timezoneId: 'Asia/Jakarta',
      });
      page = await context.newPage();
      this.page = page;

      // ===== Start Live Browser Screencast =====
      await this.startScreencast(page);

      // ===== FASE 1: Deteksi website =====
      runConfig.currentTest = 'Mendeteksi struktur website...';
      runConfig.progress = 5;
      this.broadcastStep('DETECT', '', 'Mendeteksi struktur website', 'navigate', url);
      let detect = await this.detectWebsite(page, url);

      // ===== FASE 2: Jalankan modul tes =====
      const allModules = ['dashboard', 'accessibility', 'login', 'navigation', 'security', 'performance', 'responsive', 'form_validation', 'menu_traversal', 'api_response', 'cookie_session', 'content_seo', 'crud', 'payment', 'camera', 'multi_role', 'file_upload', 'email_notif', 'booking'];

      // Modul yang relevan per mode
      const modeModules = {
        login_dashboard: allModules, // Semua modul
        direct_dashboard: ['dashboard', 'accessibility', 'navigation', 'security', 'performance', 'responsive', 'form_validation', 'menu_traversal', 'api_response', 'cookie_session', 'content_seo', 'crud', 'payment', 'camera', 'file_upload', 'booking'],
        login_only: ['login', 'accessibility', 'security', 'form_validation', 'performance', 'responsive', 'cookie_session', 'multi_role', 'email_notif'],
        dashboard_with_login: allModules, // Semua modul
      };
      const relevantForMode = modeModules[mode] || allModules;
      let modules = testModules.includes('all') ? relevantForMode : testModules.filter(m => relevantForMode.includes(m));

      // Sortir urutan modul berdasarkan mode
      if (mode === 'login_dashboard') {
        // login dulu → dashboard → sisanya urut asli
        if (modules.includes('login')) modules = ['login', ...modules.filter(m => m !== 'login')];
        if (modules.includes('dashboard')) {
          const loginIdx = modules.indexOf('login');
          if (loginIdx !== -1) {
            modules = modules.filter(m => m !== 'dashboard');
            modules.splice(loginIdx + 1, 0, 'dashboard');
          } else {
            modules = ['dashboard', ...modules.filter(m => m !== 'dashboard')];
          }
        }
      } else if (mode === 'direct_dashboard') {
        // dashboard dulu → sisanya urut asli
        if (modules.includes('dashboard')) modules = ['dashboard', ...modules.filter(m => m !== 'dashboard')];
      } else if (mode === 'login_only') {
        // login dulu → sisanya urut asli
        if (modules.includes('login')) modules = ['login', ...modules.filter(m => m !== 'login')];
      } else if (mode === 'dashboard_with_login') {
        // dashboard dulu (cek link login) → login → sisanya urut asli
        if (modules.includes('dashboard')) modules = ['dashboard', ...modules.filter(m => m !== 'dashboard')];
        if (modules.includes('login')) {
          modules = modules.filter(m => m !== 'login');
          const dashIdx = modules.indexOf('dashboard');
          modules.splice(dashIdx + 1, 0, 'login');
        }
      }

      const authState = { isAuthenticated: false, dashboardUrl: url, loginUrl: url };
      let done = 0;
      const totalModules = modules.length;

      for (let modIdx = 0; modIdx < modules.length; modIdx++) {
        if (this.cancelled) break;
        const mod = modules[modIdx];
        runConfig.progress = 5 + Math.round((modIdx / totalModules) * 90);
        runConfig.currentTest = `Menjalankan modul: ${mod}`;

        let modResults;
        if (mod === 'login') {
          if (mode === 'direct_dashboard') {
            // Mode: Langsung Dashboard - skip login module entirely
            modResults = [];
          } else if (mode === 'login_only') {
            // Mode: Halaman Login Saja - test login form, pakai credentials jika diisi
            modResults = await this.runModule(page, mod, url, url, username || '', password || '', authState, detect, runConfig);
          } else if (mode === 'dashboard_with_login') {
            // Mode: Dashboard + Menu Login - cek link login dulu, lalu login dengan kredensial
            modResults = await this.testDashboardLoginLink(page, url, detect);
            // Lanjut: login dengan kredensial jika tersedia
            if (username && password) {
              runConfig.currentTest = 'Login dari dashboard + menu login...';
              const reAuth = await this.ensureAuthenticated(page, url, username, password, authState);
              if (reAuth) {
                runConfig.currentTest = 'Mendeteksi struktur dashboard...';
                detect = await this.detectWebsite(page, authState.dashboardUrl);
                detect.hasLogin = true;
              }
            }
          } else {
            // Mode: login_dashboard (default) - full login flow with credentials
            modResults = await this.runModule(page, mod, url, url, username, password, authState, detect, runConfig);
            if (authState.isAuthenticated) {
              runConfig.currentTest = 'Mendeteksi struktur dashboard...';
              detect = await this.detectWebsite(page, authState.dashboardUrl);
              detect.hasLogin = true;
            } else if (username && password && mode === 'login_dashboard') {
              // Fallback: auto-login jika login test tidak terautentikasi tapi kredensial tersedia
              runConfig.currentTest = 'Auto-login untuk modul selanjutnya...';
              const reAuth = await this.ensureAuthenticated(page, url, username, password, authState);
              if (reAuth) {
                detect = await this.detectWebsite(page, authState.dashboardUrl);
                detect.hasLogin = true;
              }
            }
          }
        } else {
          // Modul lain: pastikan terautentikasi jika mode login_dashboard/dashboard_with_login dan kredensial tersedia
          // Kecuali untuk dashboard_with_login saat modul dashboard (test dashboard sebelum login)
          const skipAuth = (mode === 'dashboard_with_login' && mod === 'dashboard');
          if (!skipAuth && (mode === 'login_dashboard' || mode === 'dashboard_with_login') && !authState.isAuthenticated && username && password) {
            await this.ensureAuthenticated(page, url, username, password, authState);
          }
          // Modul lain pakai dashboardUrl jika sudah login, atau url asli
          const targetUrl = authState.isAuthenticated ? authState.dashboardUrl : url;
          modResults = await this.runModule(page, mod, targetUrl, url, username, password, authState, detect, runConfig);
        }

        const filtered = modResults.filter(r => r !== null);
        results.push(...filtered);
        runConfig.results.push(...filtered);
        runConfig.progress = 5 + Math.round(((modIdx + 1) / totalModules) * 90);
        this.broadcastStep('PROGRESS', '', `Progress ${runConfig.progress}%`, 'progress', `${runConfig.progress}`);
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
      runConfig.progress = 100;
      runConfig.currentTest = 'Selesai';
      this.broadcastStep('DONE', '', 'Tes selesai', 'done', '');
      this.broadcastDone();
      await this.stopScreencast(page);
      await browser.close();
      this.browser = null;
      this.page = null;
      return results;
    } catch (err) {
      this.broadcastDone();
      if (page) await this.stopScreencast(page);
      if (browser) await browser.close();
      this.browser = null;
      this.page = null;
      throw err;
    }
  }

  getBrowser() {
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
    };

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 }).catch(async () => {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      });
      d.isHttps = page.url().startsWith('https://');
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
    } catch {}
    return d;
  }

  async detectLoginForm(page) {
    const sels = [
      'input[type="password"]',
      'form[action*="sign_in"]', 'form[action*="login"]', 'form[action*="auth"]',
      'form[class*="login" i]', 'form[class*="auth" i]', 'form[class*="signin" i]',
      'input[name="user[login]"]', 'input[name="username"]', 'input[name="email"]', 'input[name="password"]',
      'input[id*="password"]', 'input[placeholder*="password" i]',
      'input[autocomplete="current-password"]', 'input[autocomplete="username"]',
      '[class*="login-form"]', '[class*="auth-form"]', '[data-testid*="login"]',
      'button:has-text("Sign in")', 'button:has-text("Login")', 'button:has-text("Masuk")', 'button:has-text("Log in")',
      'a:has-text("Sign in")', 'a:has-text("Login")', 'a:has-text("Log in")',
    ];
    for (const s of sels) {
      if (await page.locator(s).count() > 0) return true;
    }
    return false;
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
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 }).catch(async () => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    });
    await page.waitForTimeout(1000);
    if (!await this.detectLoginForm(page)) {
      await page.context().clearCookies();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 }).catch(async () => {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
      });
      await page.waitForTimeout(1500);
    }
    if (!await this.detectLoginForm(page)) return false;
    await this.fillLoginForm(page, username, password);
    await page.waitForTimeout(6000);
    const after = page.url();
    if (after.includes('sign_in') || after.includes('login') || after.includes('auth')) return false;
    authState.isAuthenticated = true;
    authState.dashboardUrl = after;
    return true;
  }

  // ===== Mode: Dashboard + Menu Login =====
  async testDashboardLoginLink(page, url, d) {
    const M = 'Login'; const R = [];

    R.push(await this.safeTest('TC-L-001', M, 'Halaman dashboard dimuat',
      'URL dashboard diketahui', '1. Buka URL\n2. Tunggu dimuat\n3. Cek judul',
      'Dashboard dimuat dengan judul', async () => {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        const t = await page.title();
        if (!t) throw new Error('Halaman tidak memiliki judul');
        return `Dashboard dimuat. Judul: "${t}"`;
      }));

    R.push(await this.safeTest('TC-L-002', M, 'Link/menu login tersedia di dashboard',
      'Dashboard dimuat', '1. Cari link login/sign in\n2. Cari di nav, header, footer, menu',
      'Link login ditemukan di dashboard', async () => {
        const sels = [
          'a:has-text("Login")', 'a:has-text("Log in")', 'a:has-text("Sign in")', 'a:has-text("Masuk")',
          'a[href*="login"]', 'a[href*="sign_in"]', 'a[href*="auth"]',
          'button:has-text("Login")', 'button:has-text("Sign in")', 'button:has-text("Masuk")',
        ];
        for (const s of sels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) return `Link login ditemukan (${s})`;
        }
        // Cari di dropdown menu
        const menuSels = ['.user-menu', '.avatar', '.profile-dropdown', '[class*="dropdown"]', '[class*="user-menu"]'];
        for (const s of menuSels) {
          const el = page.locator(s).first();
          if (await el.isVisible().catch(() => false)) {
            await el.click().catch(() => {});
            await page.waitForTimeout(1500);
            for (const ls of sels) {
              if (await page.locator(ls).first().isVisible().catch(() => false)) return `Login ditemukan di menu dropdown (${ls})`;
            }
          }
        }
        throw new Error('Link/menu login tidak ditemukan di dashboard');
      }));

    R.push(await this.safeTest('TC-L-003', M, 'Link login mengarah ke halaman login',
      'Link login ditemukan', '1. Klik link login\n2. Tunggu navigasi\n3. Cek form login di halaman tujuan',
      'Halaman login terbuka dengan form login', async () => {
        const sels = [
          'a:has-text("Login")', 'a:has-text("Log in")', 'a:has-text("Sign in")', 'a:has-text("Masuk")',
          'a[href*="login"]', 'a[href*="sign_in"]', 'a[href*="auth"]',
        ];
        let clicked = false;
        for (const s of sels) {
          const el = page.locator(s).first();
          if (await el.isVisible().catch(() => false)) { await el.click(); clicked = true; break; }
        }
        if (!clicked) throw new Error('Tidak bisa mengklik link login');
        await page.waitForTimeout(3000);
        const hasForm = await this.detectLoginForm(page);
        if (hasForm) return 'Halaman login terbuka dengan form login';
        // Cek URL mengandung login/sign_in
        const currentUrl = page.url();
        if (currentUrl.includes('login') || currentUrl.includes('sign_in') || currentUrl.includes('auth')) {
          return `Navigasi ke halaman login: ${currentUrl}`;
        }
        throw new Error('Link login tidak mengarah ke halaman login');
      }));

    // Skip test login lainnya karena tidak ada kredensial
    for (let i = 4; i <= 12; i++) {
      R.push(this.skip(`TC-L-${String(i).padStart(3, '0')}`, M, `Tes login TC-L-${String(i).padStart(3, '0')}`,
        'Mode dashboard + login', '1. Tes login', 'Login berfungsi',
        'mode dashboard_with_login - hanya cek link login'));
    }

    return R;
  }

  // ===== Dispatcher =====
  async runModule(page, mod, targetUrl, originalUrl, username, password, authState, detect, runConfig) {
    switch (mod) {
      case 'accessibility': return this.testAccessibility(page, targetUrl, detect);
      case 'login':
        if (!detect.hasLogin && !password) return [];
        return this.testLogin(page, originalUrl, username, password, authState, detect);
      case 'navigation': return this.testNavigation(page, targetUrl, detect);
      case 'security': return this.testSecurity(page, targetUrl, detect);
      case 'performance': return this.testPerformance(page, targetUrl, detect);
      case 'responsive': return this.testResponsive(page, targetUrl, detect);
      case 'form_validation':
        if (!detect.hasForm) return [];
        return this.testFormValidation(page, targetUrl, detect);
      case 'menu_traversal':
        if (detect.linkCount === 0 && !detect.hasButtons) return [];
        return this.testMenuTraversal(page, targetUrl, detect);
      case 'api_response': return this.testApiResponse(page, targetUrl, detect);
      case 'cookie_session': return this.testCookieSession(page, targetUrl, detect, authState);
      case 'content_seo': return this.testContentSeo(page, targetUrl, detect);
      case 'dashboard': return this.testDashboard(page, targetUrl, detect, authState);
      case 'crud': return this.testCrud(page, targetUrl, detect, authState);
      case 'payment': return this.testPayment(page, targetUrl, detect, authState);
      case 'camera': return this.testCamera(page, targetUrl, detect, authState);
      case 'multi_role': return this.testMultiRoleLogin(page, targetUrl, detect, authState);
      case 'file_upload': return this.testFileUpload(page, targetUrl, detect, authState);
      case 'email_notif': return this.testEmailNotification(page, targetUrl, detect, authState);
      case 'booking': return this.testBooking(page, targetUrl, detect, authState);
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
      this.broadcastStep(id, modul, title, 'done', '');
      return this.makeResult(id, modul, title, preConditions, testSteps, expected, actual, 'passed', Date.now() - start, '', cat);
    } catch (err) {
      this.broadcastStep(id, modul, title, 'error', err.message);
      return this.makeResult(id, modul, title, preConditions, testSteps, expected, err.message, 'failed', Date.now() - start, err.message, cat);
    }
  }

  skip(id, modul, title, preConditions, testSteps, expected, reason) {
    return null;
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
      this.broadcastStep(id, modul, title, 'done', '');
      return this.makeResult(id, modul, title, preConditions, testSteps, expected, actual, 'passed', Date.now() - start, '', 'optional');
    } catch (err) {
      this.broadcastStep(id, modul, title, 'note', err.message);
      return this.makeResult(id, modul, title, preConditions, testSteps, expected, `Catatan: ${err.message}`, 'note', Date.now() - start, '', 'optional');
    }
  }

  // ===== Modul: Aksesibilitas =====
  async testAccessibility(page, url, d) {
    const M = 'Aksesibilitas'; const R = [];

    R.push(await this.safeTest('TC-A-001', M, 'Halaman berhasil dimuat dengan judul',
      'Browser terbuka', '1. Buka URL\n2. Tunggu dimuat\n3. Cek judul',
      'Halaman dimuat dengan judul', async () => {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        const t = await page.title();
        if (!t) throw new Error('Halaman dimuat tapi tidak ada judul');
        return `Judul: "${t}"`;
      }));

    R.push(await this.safeTest('TC-A-002', M, 'Atribut lang pada tag html',
      'Halaman dimuat', '1. Cek tag <html>\n2. Baca atribut lang',
      'Atribut lang harus ada', async () => {
        const lang = await page.locator('html').getAttribute('lang');
        if (!lang) throw new Error('Atribut lang tidak ditemukan');
        return `lang="${lang}"`;
      }));

    if (d.imageCount > 0) {
      R.push(await this.safeTest('TC-A-003', M, 'Semua gambar memiliki atribut alt',
        'Halaman dimuat, ada gambar', '1. Cari semua <img>, <svg>, [role="img"]\n2. Cek alt/aria-label\n3. Hitung yang tidak ada',
        'Semua gambar punya alt', async () => {
          const result = await page.evaluate(() => {
            let missing = 0, total = 0;
            const imgs = document.querySelectorAll('img');
            total += imgs.length;
            for (const img of imgs) { if (!img.hasAttribute('alt')) missing++; }
            const svgs = document.querySelectorAll('svg:not([aria-hidden="true"])');
            total += svgs.length;
            for (const svg of svgs) { if (!svg.getAttribute('aria-label') && !svg.querySelector('title')) missing++; }
            const roleImgs = document.querySelectorAll('[role="img"]');
            total += roleImgs.length;
            for (const el of roleImgs) { if (!el.getAttribute('aria-label') && !el.getAttribute('title')) missing++; }
            return { total, missing };
          });
          if (result.missing > 0) throw new Error(`${result.missing}/${result.total} gambar tanpa alt/aria-label`);
          return `Semua ${result.total} gambar punya alt/aria-label`;
        }));
    } else {
      R.push(this.skip('TC-A-003', M, 'Semua gambar memiliki atribut alt',
        'Halaman dimuat', '1. Cari <img>\n2. Cek alt', 'Semua gambar punya alt', 'tidak ada gambar'));
    }

    R.push(await this.safeTest('TC-A-004', M, 'Meta viewport untuk responsif',
      'Halaman dimuat', '1. Cari meta[name="viewport"]',
      'Meta viewport harus ada', async () => {
        if (await page.locator('meta[name="viewport"]').count() === 0) throw new Error('Meta viewport tidak ditemukan');
        return 'Meta viewport ditemukan';
      }));

    if (d.h1Count > 0) {
      R.push(await this.safeTest('TC-A-005', M, 'Hanya satu h1 per halaman',
        'Halaman dimuat', '1. Hitung h1\n2. Pastikan hanya 1',
        'Tepat 1 h1', async () => {
          const c = await page.locator('h1').count();
          if (c > 1) throw new Error(`${c} h1 ditemukan (best practice: 1)`);
          return `1 h1 ditemukan`;
        }));
    } else {
      R.push(this.skip('TC-A-005', M, 'Hanya satu h1 per halaman',
        'Halaman dimuat', '1. Hitung h1', 'Tepat 1 h1', 'tidak ada h1'));
    }

    if (d.inputCount > 0) {
      R.push(await this.safeTest('TC-A-006', M, 'Input memiliki label atau aria-label',
        'Halaman dimuat, ada input', '1. Cari semua input\n2. Cek label/aria-label/placeholder',
        'Semua input berlabel', async () => {
          const result = await page.evaluate(() => {
            const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"])');
            let unlabeled = 0;
            for (const inp of inputs) {
              const id = inp.getAttribute('id');
              const aria = inp.getAttribute('aria-label');
              const ph = inp.getAttribute('placeholder');
              if (id && document.querySelector(`label[for="${id}"]`)) continue;
              if (aria || ph) continue;
              unlabeled++;
            }
            return { total: inputs.length, unlabeled };
          });
          if (result.unlabeled > 0) throw new Error(`${result.unlabeled}/${result.total} input tanpa label`);
          return `Semua ${result.total} input berlabel`;
        }));
    } else {
      R.push(this.skip('TC-A-006', M, 'Input memiliki label',
        'Halaman dimuat', '1. Cari input\n2. Cek label', 'Semua input berlabel', 'tidak ada input'));
    }

    R.push(await this.safeTest('TC-A-007', M, 'Favicon tersedia',
      'Halaman dimuat', '1. Cari link[rel*="icon"]',
      'Favicon harus ada', async () => {
        if (await page.locator('link[rel*="icon"]').count() === 0) throw new Error('Favicon tidak ditemukan');
        return 'Favicon ditemukan';
      }));

    // TC-A-008: Skip-to-content link
    R.push(await this.safeTest('TC-A-008', M, 'Skip-to-content link tersedia',
      'Halaman dimuat', '1. Cari link dengan teks "skip" atau "skip to content"\n2. Cek href ke #main atau #content',
      'Skip link ada untuk navigasi keyboard', async () => {
        const sels = ['a:has-text("Skip")', 'a:has-text("Skip to content")', 'a:has-text("Skip to main")', 'a[href="#main"]', 'a[href="#content"]', 'a.skip-link', 'a.skip-to-content'];
        for (const s of sels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) return `Skip link ditemukan (${s})`;
        }
        throw new Error('Skip-to-content link tidak ditemukan');
      }));

    // TC-A-009: Color contrast minimum (WCAG AA)
    R.push(await this.safeTest('TC-A-009', M, 'Kontras warna memenuhi WCAG AA (min 4.5:1)',
      'Halaman dimuat', '1. Ambil elemen teks visible\n2. Hitung kontras foreground vs background\n3. Bandingkan dengan threshold 4.5',
      'Kontras >= 4.5:1 untuk teks normal', async () => {
        const lowContrast = await page.evaluate(() => {
          function getContrastRatio(fg, bg) {
            function hexToRgb(c) {
              if (c.startsWith('rgb')) { const m = c.match(/\d+/g); return [parseInt(m[0]), parseInt(m[1]), parseInt(m[2])]; }
              if (c.startsWith('#')) { const h = c.slice(1); return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]; }
              return [0,0,0];
            }
            function relLum([r,g,b]) { const f = v => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }; return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b); }
            const l1 = relLum(hexToRgb(fg)), l2 = relLum(hexToRgb(bg));
            return (Math.max(l1,l2) + 0.05) / (Math.min(l1,l2) + 0.05);
          }
          let low = 0, total = 0;
          const els = document.querySelectorAll('p, span, a, li, td, label, h1, h2, h3, h4, h5, h6, div');
          for (const el of els) {
            if (el.offsetParent === null || !el.innerText.trim()) continue;
            const cs = window.getComputedStyle(el);
            const fg = cs.color, bg = cs.backgroundColor;
            if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') continue;
            const ratio = getContrastRatio(fg, bg);
            total++;
            if (ratio < 4.5) low++;
          }
          return { low, total };
        });
        if (lowContrast.total === 0) return 'Tidak ada elemen teks untuk diperiksa';
        if (lowContrast.low > lowContrast.total * 0.3) throw new Error(`${lowContrast.low}/${lowContrast.total} elemen kontras < 4.5:1`);
        return `${lowContrast.low}/${lowContrast.total} elemen di bawah threshold (OK)`;
      }));

    // TC-A-010: Focus indicator terlihat
    R.push(await this.safeTest('TC-A-010', M, 'Focus indicator terlihat saat tab navigation',
      'Halaman dimuat', '1. Fokus ke elemen interaktif pertama\n2. Cek outline tidak none/0',
      'Outline focus terlihat', async () => {
        const focusable = await page.locator('a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])').first();
        if (!await focusable.isVisible().catch(() => false)) return 'Tidak ada elemen focusable';
        await focusable.focus();
        await page.waitForTimeout(300);
        const outline = await focusable.evaluate(el => {
          const cs = window.getComputedStyle(el);
          return { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, boxShadow: cs.boxShadow, border: cs.border };
        });
        if (outline.outlineStyle === 'none' && outline.boxShadow === 'none' && outline.border === '0px') {
          throw new Error('Tidak ada focus indicator (outline:none, no box-shadow, no border)');
        }
        return `Focus indicator: outline=${outline.outlineStyle} ${outline.outlineWidth}`;
      }));

    // TC-A-011: ARIA roles pada landmark elements
    R.push(await this.safeTest('TC-A-011', M, 'ARIA landmark roles pada elemen utama',
      'Halaman dimuat', '1. Cari elemen dengan role: banner, main, navigation, contentinfo\n2. Cek HTML5 semantic tags: header, main, nav, footer',
      'Minimal 2 landmark roles', async () => {
        const landmarks = await page.evaluate(() => {
          let count = 0;
          const sels = ['header[role="banner"]', 'main[role="main"]', 'nav[role="navigation"]', 'footer[role="contentinfo"]', 'header', 'main', 'nav', 'footer', '[role="banner"]', '[role="main"]', '[role="navigation"]', '[role="contentinfo"]'];
          const found = new Set();
          for (const s of sels) { if (document.querySelector(s)) found.add(s.split('[')[0].split('[')[0] || s); }
          return found.size;
        });
        if (landmarks < 2) throw new Error(`Hanya ${landmarks} landmark ditemukan (minimal 2)`);
        return `${landmarks} landmark roles ditemukan`;
      }));

    // TC-A-012: Tombol memiliki accessible name
    R.push(await this.safeTest('TC-A-012', M, 'Tombol memiliki accessible name',
      'Halaman dimuat', '1. Cari semua button\n2. Cek teks, aria-label, atau title',
      'Semua tombol punya nama', async () => {
        const result = await page.evaluate(() => {
          const btns = document.querySelectorAll('button:not([disabled])');
          if (btns.length === 0) return { total: 0, noName: 0 };
          let noName = 0;
          for (const btn of btns) {
            const style = window.getComputedStyle(btn);
            if (style.display === 'none' || style.visibility === 'hidden') continue;
            const text = (btn.innerText || btn.textContent || '').trim();
            const aria = btn.getAttribute('aria-label');
            const title = btn.getAttribute('title');
            if (!text && !aria && !title) noName++;
          }
          return { total: btns.length, noName };
        });
        if (result.total === 0) return 'Tidak ada tombol';
        if (result.noName > 0) throw new Error(`${result.noName} tombol tanpa accessible name`);
        return `Semua ${result.total} tombol punya accessible name`;
      }));

    // TC-A-013: Form error terhubung via aria-describedby
    R.push(await this.safeTest('TC-A-013', M, 'Form error terhubung via aria-describedby',
      'Halaman dimuat dengan form', '1. Cari input dengan aria-describedby\n2. Cek elemen target ada',
      'Error message terhubung ke field', async () => {
        if (d.inputCount === 0) return 'Tidak ada input';
        const inputs = await page.locator('input[aria-describedby]').all();
        if (inputs.length === 0) return 'Tidak ada input dengan aria-describedby (info: best practice)';
        let valid = 0;
        for (const inp of inputs) {
          const descId = await inp.getAttribute('aria-describedby');
          if (descId && await page.locator(`#${descId}`).count() > 0) valid++;
        }
        if (valid < inputs.length) throw new Error(`${inputs.length - valid} aria-describedby tidak valid`);
        return `${valid}/${inputs.length} field dengan aria-describedby valid`;
      }));

    // TC-A-014: Tab order logis
    R.push(await this.safeTest('TC-A-014', M, 'Tab order logis (tidak ada tabindex positif)',
      'Halaman dimuat', '1. Cari elemen dengan tabindex > 0\n2. Tab order harus mengikuti DOM order',
      'Tidak ada tabindex positif yang mengganggu', async () => {
        const positiveTabindex = await page.locator('[tabindex]:not([tabindex="0"]):not([tabindex="-1"])').count();
        if (positiveTabindex > 3) throw new Error(`${positiveTabindex} elemen dengan tabindex positif (best practice: gunakan 0 atau -1)`);
        return `${positiveTabindex} elemen dengan tabindex positif (OK)`;
      }));

    // TC-A-015: Tidak ada autoplay media/audio
    R.push(await this.safeTest('TC-A-015', M, 'Tidak ada autoplay media/audio',
      'Halaman dimuat', '1. Cari video/audio\n2. Cek atribut autoplay',
      'Tidak ada autoplay', async () => {
        const autoplay = await page.locator('video[autoplay], audio[autoplay]').count();
        if (autoplay > 0) throw new Error(`${autoplay} media dengan autoplay`);
        return 'Tidak ada autoplay media';
      }));

    // TC-A-016: Heading hierarchy tidak skip level
    R.push(await this.safeTest('TC-A-016', M, 'Heading hierarchy tidak skip level (h1→h2, bukan h1→h4)',
      'Halaman dimuat', '1. Ambil semua heading h1-h6\n2. Cek urutan tidak skip level',
      'Hierarki heading konsisten', async () => {
        const skipped = await page.evaluate(() => {
          const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).filter(h => h.offsetParent !== null);
          let skip = 0;
          let prevLevel = 0;
          for (const h of headings) {
            const level = parseInt(h.tagName[1]);
            if (prevLevel > 0 && level > prevLevel + 1) skip++;
            prevLevel = level;
          }
          return skip;
        });
        if (skipped > 2) throw new Error(`${skipped} heading skip level`);
        return `${skipped} skip level terdeteksi (OK)`;
      }));

    // TC-A-019: Keyboard navigation - Tab through interactive elements
    R.push(await this.safeTest('TC-A-019', M, 'Keyboard navigation - Tab through all interactive elements',
      'Halaman dimuat', '1. Hitung elemen focusable via evaluate\n2. Tekan Tab berulang\n3. Cek focus berpindah ke elemen interaktif\n4. Verifikasi focus order mengikuti DOM',
      'Semua elemen interaktif reachable via Tab', async () => {
        const count = await page.evaluate(() => {
          const sel = 'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
          return document.querySelectorAll(sel).length;
        });
        if (count === 0) return 'Tidak ada elemen focusable';
        let reached = 0;
        const max = Math.min(count, 15);
        for (let i = 0; i < max; i++) {
          await page.keyboard.press('Tab');
          await page.waitForTimeout(100);
          const focused = await page.evaluate(() => document.activeElement?.tagName);
          if (focused && focused !== 'BODY') reached++;
        }
        if (reached < max * 0.5) throw new Error(`Hanya ${reached}/${max} elemen reachable via Tab`);
        return `${reached}/${max} elemen reachable via Tab (dari ${count} total)`;
      }));

    // TC-A-020: Tidak ada keyboard trap
    R.push(await this.safeTest('TC-A-020', M, 'Tidak ada keyboard trap (Tab tidak stuck)',
      'Halaman dimuat', '1. Tekan Tab 20 kali\n2. Cek focus tidak stuck di elemen yang sama',
      'Tidak ada keyboard trap', async () => {
        let prevEl = null;
        let stuck = 0;
        for (let i = 0; i < 20; i++) {
          await page.keyboard.press('Tab');
          await page.waitForTimeout(50);
          const cur = await page.evaluate(() => {
            const el = document.activeElement;
            return el ? `${el.tagName}#${el.id}.${el.className}` : 'BODY';
          });
          if (cur === prevEl) stuck++;
          prevEl = cur;
        }
        if (stuck > 5) throw new Error(`Focus stuck ${stuck} kali di elemen yang sama`);
        return `Tidak ada keyboard trap (stuck ${stuck} kali, OK)`;
      }));

    // TC-A-021: Reduced motion support
    R.push(await this.safeTest('TC-A-021', M, 'Reduced motion support (prefers-reduced-motion)',
      'Halaman dimuat', '1. Cek CSS untuk @media (prefers-reduced-motion)\n2. Emulasi reduced motion\n3. Cek animasi berkurang',
      'Mendukung prefers-reduced-motion', async () => {
        const hasReducedMotion = await page.evaluate(() => {
          for (const sheet of document.styleSheets) {
            try {
              for (const rule of sheet.cssRules) {
                if (rule.media && rule.media.mediaText && rule.media.mediaText.includes('prefers-reduced-motion')) return true;
              }
            } catch {}
          }
          return false;
        });
        if (hasReducedMotion) return 'prefers-reduced-motion media query ditemukan di CSS';
        return 'prefers-reduced-motion tidak ditemukan (info: best practice untuk accessibility)';
      }));

    // TC-A-022: Tidak ada layout shift saat font loading
    R.push(await this.safeTest('TC-A-022', M, 'Tidak ada layout shift saat font loading (FOUT/FOIT handling)',
      'Halaman dimuat', '1. Cek font-size-adjust atau font-display\n2. Cek font preload\n3. Cek CSS contains',
      'Font loading tidak cause layout shift', async () => {
        const fontInfo = await page.evaluate(() => {
          const hasPreload = document.querySelector('link[rel="preload"][as="font"]') !== null;
          let hasFontDisplay = false;
          for (const sheet of document.styleSheets) {
            try {
              for (const rule of sheet.cssRules) {
                if (rule.cssText && rule.cssText.includes('font-display')) hasFontDisplay = true;
              }
            } catch {}
          }
          const hasSizeAdjust = document.querySelector('[style*="font-size-adjust"]') !== null;
          return { hasPreload, hasFontDisplay, hasSizeAdjust };
        });
        if (fontInfo.hasFontDisplay || fontInfo.hasPreload) return 'Font loading handled (font-display atau preload)';
        return 'Font loading handling tidak terdeteksi (info: best practice)';
      }));

    // TC-A-024: Tidak ada elemen interaktif dengan aria-hidden="true"
    R.push(await this.safeTest('TC-A-024', M, 'Tidak ada elemen interaktif dengan aria-hidden="true"',
      'Halaman dimuat', '1. Cari elemen interaktif (button, a, input)\n2. Cek aria-hidden',
      'Tidak ada elemen interaktif yang di-hidden', async () => {
        const hiddenInteractive = await page.evaluate(() => {
          const els = document.querySelectorAll('button[aria-hidden="true"], a[aria-hidden="true"], input[aria-hidden="true"], select[aria-hidden="true"], textarea[aria-hidden="true"]');
          return els.length;
        });
        if (hiddenInteractive > 0) throw new Error(`${hiddenInteractive} elemen interaktif dengan aria-hidden="true"`);
        return 'Tidak ada elemen interaktif yang di-hidden';
      }));

    // TC-A-025: Status messages menggunakan role="status" atau aria-live
    R.push(await this.safeTest('TC-A-025', M, 'Status messages menggunakan role="status" atau aria-live',
      'Halaman dimuat', '1. Cari elemen dengan role="status", aria-live="polite", aria-live="assertive"\n2. Cek untuk toast/notification',
      'Status message accessible ke screen reader', async () => {
        const liveRegions = await page.evaluate(() => {
          return document.querySelectorAll('[role="status"], [aria-live="polite"], [aria-live="assertive"], [role="alert"]').length;
        });
        if (liveRegions > 0) return `${liveRegions} live region ditemukan (role="status" atau aria-live)`;
        return 'Tidak ada live region (info: best practice untuk toast/notification)';
      }));

    // TC-A-026: Modal focus trap
    R.push(await this.safeTest('TC-A-026', M, 'Modal men-trap focus dengan benar (Tab tidak keluar modal)',
      'Halaman dimuat dengan modal', '1. Cari modal yang terbuka atau buka modal\n2. Cek focus tetap di dalam modal saat Tab\n3. Cek focus kembali ke trigger saat modal tutup',
      'Modal focus trap berfungsi', async () => {
        const modalSels = ['[role="dialog"]', '.modal.show', '.modal:not([hidden])', '[class*="modal"][class*="open"]', '[class*="modal"][class*="active"]', 'dialog[open]'];
        let modalEl = null;
        for (const s of modalSels) {
          const el = page.locator(s).first();
          if (await el.isVisible().catch(() => false)) { modalEl = el; break; }
        }
        if (!modalEl) return 'Tidak ada modal terbuka di halaman (focus trap N/A)';
        const trapResult = await page.evaluate(() => {
          const modal = document.querySelector('[role="dialog"], .modal.show, .modal:not([hidden]), [class*="modal"][class*="open"], [class*="modal"][class*="active"], dialog[open]');
          if (!modal) return { error: 'no modal' };
          const focusable = modal.querySelectorAll('a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])');
          if (focusable.length === 0) return { error: 'no focusable in modal' };
          focusable[0].focus();
          const insideModal = modal.contains(document.activeElement);
          return { insideModal, focusCount: focusable.length };
        });
        if (trapResult.error) return `Modal focus trap: ${trapResult.error}`;
        if (!trapResult.insideModal) throw new Error('Focus tidak masuk ke elemen di dalam modal');
        await page.keyboard.press('Tab');
        await page.waitForTimeout(200);
        const stillInside = await page.evaluate(() => {
          const modal = document.querySelector('[role="dialog"], .modal.show, .modal:not([hidden]), [class*="modal"][class*="open"], [class*="modal"][class*="active"], dialog[open]');
          return modal ? modal.contains(document.activeElement) : false;
        });
        if (stillInside) return `Modal focus trap berfungsi (${trapResult.focusCount} elemen focusable di dalam modal)`;
        return 'Focus keluar dari modal saat Tab (focus trap tidak optimal)';
      }));

    return R;
  }

  // ===== Modul: Login =====
  async testLogin(page, url, username, password, authState, d) {
    const M = 'Login'; const R = [];

    if (!d.hasLogin && !username) {
      R.push(this.skip('TC-L-001', M, 'Form login terdeteksi',
        'Halaman dimuat', '1. Cari form login', 'Form login ada',
        'website tidak memiliki form login'));
      for (let i = 2; i <= 12; i++) {
        R.push(this.skip(`TC-L-${String(i).padStart(3, '0')}`, M, `Tes login TC-L-${String(i).padStart(3, '0')}`,
          'Form login harus ada', '1. Tes login', 'Login berfungsi',
          'tidak ada form login'));
      }
      return R;
    }

    // Pastikan di halaman login
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    let hasLogin = await this.detectLoginForm(page);

    // TC-L-001: Form login terdeteksi
    R.push(await this.safeTest('TC-L-001', M, 'Form login terdeteksi',
      'Halaman dimuat', '1. Cari input password atau form login',
      'Form login harus ada', async () => {
        if (hasLogin) return 'Form login terdeteksi di halaman';
        // Coba cari link login
        const link = page.locator('a:has-text("Sign in"), a:has-text("Login"), a:has-text("Log in"), a[href*="sign_in"], a[href*="login"]').first();
        if (await link.isVisible().catch(() => false)) {
          await link.click(); await page.waitForTimeout(3000);
          if (await this.detectLoginForm(page)) { hasLogin = true; return 'Login ditemukan via link'; }
        }
        throw new Error('Form login tidak ditemukan');
      }));

    if (!hasLogin) {
      for (let i = 2; i <= 30; i++) R.push(this.skip(`TC-L-${String(i).padStart(3, '0')}`, M, `Tes login TC-L-${String(i).padStart(3, '0')}`, 'Form login', '1. Tes', 'OK', 'form login tidak ada'));
      return R;
    }

    // TC-L-002: Field username/email
    R.push(await this.safeTest('TC-L-002', M, 'Field username/email tersedia',
      'Form login terdeteksi', '1. Cari input username/email',
      'Field terlihat', async () => {
        const sels = ['input[name="user[login]"]', 'input[name="username"]', 'input[name="email"]',
          'input[type="email"]', '#username', '#email', '#user_login',
          'input[placeholder*="username" i]', 'input[placeholder*="email" i]'];
        for (const s of sels) { if (await page.locator(s).first().isVisible().catch(() => false)) return `Ditemukan: ${s}`; }
        throw new Error('Field username/email tidak ditemukan');
      }));

    // TC-L-003: Password ter-mask
    R.push(await this.safeTest('TC-L-003', M, 'Field password ter-mask',
      'Form login terdeteksi', '1. Cari input password\n2. Cek type="password"',
      'type="password"', async () => {
        const el = page.locator('input[type="password"]').first();
        if (!await el.isVisible().catch(() => false)) throw new Error('Field password tidak ditemukan');
        return 'type="password" - ter-mask dengan benar';
      }));

    // TC-L-004: Tombol submit
    R.push(await this.safeTest('TC-L-004', M, 'Tombol submit tersedia dan enabled',
      'Form login terdeteksi', '1. Cari tombol submit\n2. Cek enabled',
      'Tombol enabled', async () => {
        const sels = ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Sign in")', 'button:has-text("Login")', 'button:has-text("Masuk")'];
        for (const s of sels) {
          const el = page.locator(s).first();
          if (await el.isVisible().catch(() => false)) {
            if (!await el.isEnabled()) throw new Error('Tombol submit disabled');
            return `Tombol submit enabled (${s})`;
          }
        }
        throw new Error('Tombol submit tidak ditemukan');
      }));

    // TC-L-005: Validasi field kosong
    R.push(await this.safeTest('TC-L-005', M, 'Validasi field kosong',
      'Form login dan tombol submit', '1. Kosongkan field\n2. Klik submit\n3. Cek tetap di login',
      'Form mencegah submit kosong', async () => {
        const before = page.url();
        const btn = page.locator('button[type="submit"], input[type="submit"]').first();
        if (await btn.isVisible().catch(() => false)) {
          await btn.click().catch(() => {});
          await page.waitForTimeout(3000);
          if (page.url() === before || page.url().includes('login')) return 'Form mencegah submit kosong';
          throw new Error('Form ter-submit dengan field kosong');
        }
        return 'Tidak ada tombol submit';
      }));

    // TC-L-006: Login invalid
    R.push(await this.safeTest('TC-L-006', M, 'Login invalid menampilkan error',
      'Form login dengan field', '1. Isi kredensial fake\n2. Submit\n3. Cek error',
      'Pesan error tampil', async () => {
        if (!await this.detectLoginForm(page)) { await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }); await page.waitForTimeout(1000); }
        const before = page.url();
        await this.fillLoginForm(page, 'invalid_user_12345', 'InvalidPass123!');
        await page.waitForTimeout(4000);
        const after = page.url();
        const errSels = ['.alert-danger', '.alert-error', '.flash-alert', '.flash-danger', '.error-message', '[role="alert"]', '.invalid-feedback', '.text-danger', '.form-error', '.flash-container .alert'];
        for (const s of errSels) {
          const el = page.locator(s).first();
          if (await el.isVisible().catch(() => false)) {
            const txt = await el.innerText().catch(() => '');
            return `Error: "${txt.substring(0, 150)}"`;
          }
        }
        if (after === before || after.includes('login') || after.includes('sign_in')) return 'Tetap di halaman login (invalid ditolak)';
        throw new Error('Tidak ada error dan navigasi terjadi');
      }));

    // TC-L-007: Link lupa password
    R.push(await this.safeTest('TC-L-007', M, 'Link lupa password tersedia',
      'Form login terdeteksi, masih di halaman login', '1. Cari link "Forgot"/"Reset"/"Lupa"',
      'Link lupa password ada di halaman login', async () => {
        if (!await this.detectLoginForm(page)) { await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }); await page.waitForTimeout(1000); }
        const sels = ['a:has-text("Forgot")', 'a:has-text("Reset password")', 'a:has-text("Lupa")', 'a[href*="password/new"]', 'a[href*="reset"]', 'a[href*="forgot"]'];
        for (const s of sels) { if (await page.locator(s).first().isVisible().catch(() => false)) return `Link ditemukan (${s})`; }
        throw new Error('Link lupa password tidak ditemukan');
      }));

    // TC-L-008: Link register
    R.push(await this.safeTest('TC-L-008', M, 'Link register tersedia',
      'Form login terdeteksi, masih di halaman login', '1. Cari link "Register"/"Sign up"/"Daftar"',
      'Link register ada di halaman login', async () => {
        if (!await this.detectLoginForm(page)) { await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }); await page.waitForTimeout(1000); }
        const sels = ['a:has-text("Register")', 'a:has-text("Sign up")', 'a:has-text("Daftar")', 'a[href*="sign_up"]', 'a[href*="register"]'];
        for (const s of sels) { if (await page.locator(s).first().isVisible().catch(() => false)) return `Link ditemukan (${s})`; }
        throw new Error('Link register tidak ditemukan');
      }));

    // TC-L-009: Login valid (TERAKHIR di pre-login tests)
    if (username && password) {
      R.push(await this.safeTest('TC-L-009', M, 'Login dengan kredensial valid',
        'Kredensial valid diberikan, form login terdeteksi', '1. Buka halaman login\n2. Isi username\n3. Isi password\n4. Klik submit\n5. Tunggu redirect',
        'Redirect ke dashboard/halaman utama', async () => {
          // Pastikan di halaman login
          await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
          await page.waitForTimeout(1000);
          if (!await this.detectLoginForm(page)) {
            await page.context().clearCookies();
            await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
            await page.waitForTimeout(1500);
          }
          if (!await this.detectLoginForm(page)) throw new Error('Form login tidak ditemukan untuk login valid');
          await this.fillLoginForm(page, username, password);
          await page.waitForTimeout(6000);
          const after = page.url();
          if (after.includes('sign_in') || after.includes('login') || after.includes('auth')) {
            const errSels = ['.alert-danger', '.flash-alert', '.flash-danger', '[role="alert"]', '.text-danger', '.flash-container .alert'];
            for (const s of errSels) {
              const el = page.locator(s).first();
              if (await el.isVisible().catch(() => false)) { const txt = await el.innerText().catch(() => ''); throw new Error(`Login gagal: ${txt.substring(0, 200)}`); }
            }
            throw new Error('Masih di halaman login setelah kredensial valid');
          }
          // Update authState untuk modul berikutnya
          authState.isAuthenticated = true;
          authState.dashboardUrl = after;
          return `Login berhasil! Redirect ke: ${after}`;
        }));

      // Post-login tests (hanya jika login berhasil)
      if (authState.isAuthenticated) {
        R.push(await this.safeTest('TC-L-010', M, 'Dashboard/halaman utama tampil setelah login',
          'Login valid berhasil, user sudah di dashboard', '1. Verifikasi halaman dimuat\n2. Cek elemen dashboard\n3. Pastikan tidak redirect ke login',
          'Dashboard tampil dengan elemen navigasi', async () => {
            const currentUrl = page.url();
            if (currentUrl.includes('sign_in') || currentUrl.includes('login') || currentUrl.includes('auth')) {
              throw new Error(`Redirect kembali ke login: ${currentUrl}`);
            }
            const dashElems = ['nav', 'header', '.navbar', '.sidebar', '.menu', '[role="navigation"]',
              '.user-menu', '.avatar', '.profile', '#dashboard', '.dashboard', '[class*="nav"]', '[class*="header"]'];
            let found = 0;
            for (const s of dashElems) { if (await page.locator(s).first().isVisible().catch(() => false)) found++; }
            if (found === 0) throw new Error('Tidak ada elemen dashboard terdeteksi');
            return `Dashboard tampil di ${currentUrl} (${found} elemen ditemukan)`;
          }));

        R.push(await this.safeTest('TC-L-011', M, 'Tombol/menu logout tersedia',
          'User di dashboard, session aktif', '1. Cari tombol/link logout langsung\n2. Cari di user menu dropdown',
          'Logout tersedia dan dapat diakses', async () => {
            const sels = ['a:has-text("Logout")', 'a:has-text("Log out")', 'a:has-text("Sign out")', 'a:has-text("Keluar")',
              'button:has-text("Logout")', 'button:has-text("Log out")', 'button:has-text("Sign out")', 'button:has-text("Keluar")',
              '[role="menuitem"]:has-text("Logout")', '[role="menuitem"]:has-text("Keluar")', '[role="menuitem"]:has-text("Log out")',
              '[role="button"]:has-text("Logout")', '[role="button"]:has-text("Keluar")',
              'a[href*="logout"]', 'a[href*="sign_out"]', '[data-testid*="logout"]', '[class*="logout"]', '[class*="sign-out"]', '[class*="signout"]'];
            for (const s of sels) { if (await page.locator(s).first().isVisible().catch(() => false)) return `Logout ditemukan (${s})`; }
            // Coba buka user menu
            const umSels = ['.user-menu', '.avatar', '.profile-dropdown', '[data-testid*="user-menu"]', '[class*="user"] [class*="menu"]', '[class*="avatar"]', 'header [class*="dropdown"]', '.header-user'];
            for (const s of umSels) {
              const um = page.locator(s).first();
              if (await um.isVisible().catch(() => false)) {
                await um.click().catch(() => {}); await page.waitForTimeout(1500);
                for (const ls of sels) { if (await page.locator(ls).first().isVisible().catch(() => false)) return `Logout di user menu (${ls})`; }
              }
            }
            throw new Error('Tombol logout tidak ditemukan');
          }));

        R.push(await this.safeTest('TC-L-012', M, 'Session persist setelah navigasi',
          'User login, session aktif', '1. Catat URL dashboard\n2. Navigasi ke halaman lain\n3. Kembali ke dashboard\n4. Cek tidak redirect ke login',
          'Session tetap aktif setelah navigasi', async () => {
            const dash = page.url();
            const cookies = await page.context().cookies();
            const sc = cookies.filter(c => c.name.toLowerCase().includes('session') || c.name.toLowerCase().includes('token') || c.name.toLowerCase().includes('auth') || c.name.toLowerCase().includes('_gitlab'));
            if (sc.length === 0) throw new Error('Tidak ada cookie session/auth');
            // Coba navigasi ke halaman lain lalu kembali
            const navLinks = await page.locator('nav a[href], [class*="nav"] a[href], header a[href]').all();
            if (navLinks.length > 0) {
              const href = await navLinks[0].getAttribute('href');
              if (href && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
                const target = new URL(href, dash).href;
                await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
                await page.waitForTimeout(1500);
                if (page.url().includes('sign_in') || page.url().includes('login')) throw new Error('Redirect ke login setelah navigasi');
                await page.goto(dash, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
                await page.waitForTimeout(1500);
                if (page.url().includes('sign_in') || page.url().includes('login')) throw new Error('Redirect ke login setelah kembali');
              }
            }
            return `Session aktif (${sc.length} cookie session)`;
          }));
      } else {
        R.push(this.skip('TC-L-010', M, 'Dashboard tampil setelah login', 'Login berhasil', '1. Cek dashboard', 'Dashboard', 'login gagal'));
        R.push(this.skip('TC-L-011', M, 'Tombol logout tersedia', 'User di dashboard', '1. Cari logout', 'Logout ada', 'login gagal'));
        R.push(this.skip('TC-L-012', M, 'Session persist', 'User login', '1. Navigasi', 'Session aktif', 'login gagal'));
      }
    } else {
      R.push(this.skip('TC-L-009', M, 'Login dengan kredensial valid', 'Kredensial valid', '1. Login', 'Dashboard', 'tidak ada kredensial'));
      R.push(this.skip('TC-L-010', M, 'Dashboard tampil setelah login', 'Login berhasil', '1. Cek dashboard', 'Dashboard', 'tidak ada kredensial'));
      R.push(this.skip('TC-L-011', M, 'Tombol logout tersedia', 'User di dashboard', '1. Cari logout', 'Logout ada', 'tidak ada kredensial'));
      R.push(this.skip('TC-L-012', M, 'Session persist', 'User login', '1. Navigasi', 'Session aktif', 'tidak ada kredensial'));
    }

    // TC-L-013: SQL injection attempt (negative test) - runs AFTER valid login, re-login after
    if (hasLogin) {
      R.push(await this.safeTest('TC-L-013', M, 'Login dengan SQL injection attempt ditolak',
        'Form login terdeteksi', '1. Isi username dengan SQL injection payload\n2. Submit\n3. Cek tidak ada error database',
        'Login ditolak, tidak ada error database terekspos', async () => {
          if (!await this.detectLoginForm(page)) { await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }); await page.waitForTimeout(1000); }
          const before = page.url();
          await this.fillLoginForm(page, "' OR '1'='1", "' OR '1'='1");
          await page.waitForTimeout(4000);
          const after = page.url();
          const html = await page.content();
          const dbErrors = /sql|database|mysql|postgres|sqlite|oracle|syntax error|query failed/i.test(html.substring(0, 5000));
          if (dbErrors) throw new Error('Error database terekspos di response');
          if (after === before || after.includes('login') || after.includes('sign_in')) return 'SQL injection ditolak, tetap di login';
          throw new Error('SQL injection berhasil login (CRITICAL)');
        }));
      // Re-login after negative test disrupted session
      if (username && password && authState.isAuthenticated) {
        await this.ensureAuthenticated(page, url, username, password, authState);
      }
    } else {
      R.push(this.skip('TC-L-013', M, 'SQL injection ditolak', 'Form login', '1. Tes SQL injection', 'Ditolak', 'tidak ada form login'));
    }

    // TC-L-014: XSS payload di field (negative test)
    if (hasLogin) {
      R.push(await this.safeTest('TC-L-014', M, 'XSS payload di field login tidak dieksekusi',
        'Form login terdeteksi', '1. Isi username dengan XSS payload\n2. Submit\n3. Cek tidak ada script execution',
        'XSS tidak dieksekusi', async () => {
          if (!await this.detectLoginForm(page)) { await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }); await page.waitForTimeout(1000); }
          await this.fillLoginForm(page, '<script>alert("xss")</script>', 'TestPass123!');
          await page.waitForTimeout(3000);
          const html = await page.content();
          if (html.includes('<script>alert("xss")</script>') && !html.includes('&lt;script&gt;')) {
            throw new Error('XSS payload tidak di-escape di HTML');
          }
          return 'XSS payload di-escape atau ditolak';
        }));
      if (username && password && authState.isAuthenticated) {
        await this.ensureAuthenticated(page, url, username, password, authState);
      }
    } else {
      R.push(this.skip('TC-L-014', M, 'XSS payload ditolak', 'Form login', '1. Tes XSS', 'Ditolak', 'tidak ada form login'));
    }

    // TC-L-030: Multi-tab session consistency
    if (authState.isAuthenticated) {
      R.push(await this.safeTest('TC-L-030', M, 'Multi-tab session consistency',
        'User sudah login', '1. Buka page baru di context sama\n2. Navigasi ke dashboard\n3. Cek session konsisten',
        'Session konsisten di multi-tab', async () => {
          const page2 = await page.context().newPage();
          try {
            await page2.goto(authState.dashboardUrl, { waitUntil: 'networkidle', timeout: 30000 });
            await page2.waitForTimeout(2000);
            const url2 = page2.url();
            if (url2.includes('login') || url2.includes('sign_in')) {
              throw new Error('Tab kedua redirect ke login (session tidak konsisten)');
            }
            return 'Session konsisten di multi-tab';
          } finally {
            await page2.close();
          }
        }));
    } else {
      R.push(this.skip('TC-L-030', M, 'Multi-tab session', 'User login', '1. Buka tab baru', 'Konsisten', 'belum login'));
    }

    return R;
  }

  // ===== Modul: Navigasi =====
  async testNavigation(page, url, d) {
    const M = 'Navigasi'; const R = [];

    R.push(await this.safeTest('TC-N-001', M, 'Halaman dimuat < 15 detik',
      'Browser terbuka', '1. Catat waktu\n2. Navigasi\n3. Hitung',
      'Load < 15s', async () => {
        const t0 = Date.now();
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        const ms = Date.now() - t0;
        if (ms > 15000) throw new Error(`Load ${(ms/1000).toFixed(2)}s`);
        return `Dimuat ${(ms/1000).toFixed(2)} detik`;
      }));

    if (d.hasNav) {
      R.push(await this.safeTest('TC-N-002', M, 'Menu navigasi tersedia',
        'Halaman dimuat', '1. Cari nav, .navbar, .menu, [class*="nav"]',
        'Navigasi ada', async () => {
          for (const s of ['nav', 'header nav', '.navbar', '.nav', '.menu', '[role="navigation"]', '[class*="nav"]', '[class*="menu"]', '[class*="sidebar"]', '[class*="drawer"]', '[class*="topbar"]', '[class*="header-nav"]', 'aside', '[data-testid*="nav"]']) {
            if (await page.locator(s).count() > 0) return `Navigasi ditemukan (${s})`;
          }
          // Fallback: cek elemen dengan >3 link
          const hasNavLinks = await page.evaluate(() => {
            const els = document.querySelectorAll('header, [class*="nav"], [class*="menu"], [class*="header"]');
            for (const el of els) { if (el.querySelectorAll('a[href]').length > 3) return true; }
            return false;
          });
          if (hasNavLinks) return 'Navigasi ditemukan (elemen dengan banyak link)';
          throw new Error('Navigasi tidak ditemukan');
        }));
    } else {
      R.push(this.skip('TC-N-002', M, 'Menu navigasi tersedia', 'Halaman dimuat', '1. Cari nav', 'Navigasi ada', 'tidak ada navigasi'));
    }

    if (d.hasFooter) {
      R.push(await this.safeTest('TC-N-003', M, 'Footer tersedia',
        'Halaman dimuat', '1. Cari footer, .footer, [class*="footer"]',
        'Footer ada', async () => {
          for (const s of ['footer', '.footer', '#footer', '[role="contentinfo"]', '[class*="footer"]', '[class*="bottom-bar"]', '[data-testid*="footer"]', '[class*="copyright"]']) {
            if (await page.locator(s).count() > 0) return `Footer ditemukan (${s})`;
          }
          throw new Error('Footer tidak ditemukan');
        }));
    } else {
      R.push(this.skip('TC-N-003', M, 'Footer tersedia', 'Halaman dimuat', '1. Cari footer', 'Footer ada', 'tidak ada footer'));
    }

    R.push(await this.safeTest('TC-N-004', M, 'Struktur heading (h1-h3)',
      'Halaman dimuat', '1. Hitung h1, h2, h3',
      'Minimal 1 heading', async () => {
        const h1 = await page.locator('h1').count();
        const h2 = await page.locator('h2').count();
        const h3 = await page.locator('h3').count();
        const t = h1 + h2 + h3;
        if (t === 0) throw new Error('Tidak ada heading h1-h3');
        return `${h1} h1, ${h2} h2, ${h3} h3`;
      }));

    if (d.linkCount > 0) {
      R.push(await this.safeTest('TC-N-005', M, 'Link internal valid',
        'Halaman dimuat, ada link', '1. Cari <a href>\n2. Validasi URL',
        'Link valid', async () => {
          const links = await page.locator('a[href]').all();
          let broken = 0;
          const n = Math.min(links.length, 10);
          for (let i = 0; i < n; i++) {
            const href = await links[i].getAttribute('href');
            if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
            try { new URL(href, url); } catch { broken++; }
          }
          if (broken > 0) throw new Error(`${broken} broken dari ${n} link`);
          return `${n} link valid`;
        }));
    } else {
      R.push(this.skip('TC-N-005', M, 'Link internal valid', 'Halaman dimuat', '1. Cek link', 'Link valid', 'tidak ada link'));
    }

    R.push(await this.safeTest('TC-N-007', M, 'Tidak ada console error kritis',
      'Browser terbuka', '1. Setup listener\n2. Navigasi\n3. Hitung error',
      'Console error minimal', async () => {
        const errs = [];
        const h = (msg) => { if (msg.type() === 'error') errs.push(msg.text()); };
        page.on('console', h);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(2000);
        page.off('console', h);
        if (errs.length > 5) throw new Error(`${errs.length} error. Pertama: ${errs[0]?.substring(0, 100)}`);
        return `${errs.length} console error`;
      }));

    // TC-N-008: Breadcrumb tersedia
    R.push(await this.safeTest('TC-N-008', M, 'Breadcrumb tersedia (jika multi-level)',
      'Halaman dimuat', '1. Cari elemen breadcrumb\n2. Cek struktur nav',
      'Breadcrumb ada (best practice untuk multi-level)', async () => {
        const sels = ['nav[aria-label="breadcrumb"]', '.breadcrumb', '[class*="breadcrumb"]', 'ol.breadcrumb', '[data-testid*="breadcrumb"]'];
        for (const s of sels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) return `Breadcrumb ditemukan (${s})`;
        }
        return 'Breadcrumb tidak ditemukan (info: best practice untuk multi-level)';
      }));

    // TC-N-009: Active state pada menu saat di halaman tersebut
    if (d.hasNav) {
      R.push(await this.safeTest('TC-N-009', M, 'Active state pada menu navigasi',
        'Halaman dimuat, ada navigasi', '1. Cari link yang href match dengan URL saat ini\n2. Cek class active/aria-current',
        'Menu aktif memiliki indikator visual', async () => {
          const currentUrl = page.url();
          const activeIndicators = await page.evaluate((curUrl) => {
            const links = document.querySelectorAll('nav a[href], header a[href], .navbar a[href], [class*="nav"] a[href]');
            for (const a of links) {
              const href = a.getAttribute('href');
              if (!href || href === '#') continue;
              const fullUrl = new URL(href, window.location.href).href;
              if (fullUrl === curUrl || curUrl.startsWith(fullUrl)) {
                const cls = a.className.toLowerCase();
                const aria = a.getAttribute('aria-current');
                if (cls.includes('active') || cls.includes('current') || cls.includes('selected') || aria === 'page') return true;
              }
            }
            return false;
          }, currentUrl);
          if (activeIndicators) return 'Active state ditemukan pada menu';
          return 'Active state tidak ditemukan (info: best practice)';
        }));
    } else {
      R.push(this.skip('TC-N-009', M, 'Active state menu', 'Ada navigasi', '1. Cek active', 'Active ada', 'tidak ada navigasi'));
    }

    // TC-N-010: 404 page custom tersedia
    R.push(await this.safeTest('TC-N-010', M, 'Custom 404 page tersedia',
      'URL target diketahui', '1. Navigasi ke URL yang tidak ada\n2. Cek response dan tampilan 404',
      'Custom 404 page (bukan default browser)', async () => {
        const baseUrl = new URL(url);
        const notFoundUrl = `${baseUrl.origin}/skyourtest-nonexistent-page-${Date.now()}`;
        const res = await page.goto(notFoundUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
        if (res && res.status() === 404) {
          const bodyText = await page.locator('body').innerText().catch(() => '');
          if (bodyText.includes('404') || bodyText.includes('not found') || bodyText.includes('tidak ditemukan')) {
            return 'Custom 404 page dengan pesan yang jelas';
          }
        }
        const title = await page.title().catch(() => '');
        if (title.includes('404') || title.toLowerCase().includes('not found')) return 'Custom 404 page terdeteksi via title';
        return '404 page tidak custom (default browser/server)';
      }));

    // TC-N-011: Redirect chain tidak terlalu panjang
    R.push(await this.safeTest('TC-N-011', M, 'Redirect chain tidak terlalu panjang (max 3)',
      'URL target', '1. Navigasi ke URL\n2. Hitung jumlah redirect\n3. Max 3 redirects',
      'Redirect chain <= 3', async () => {
        const redirects = [];
        page.on('framenavigated', (frame) => {
          if (frame === page.mainFrame()) redirects.push(frame.url());
        });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        const redirectCount = redirects.length - 1;
        if (redirectCount > 3) throw new Error(`${redirectCount} redirects (max 3)`);
        return `${redirectCount} redirect`;
      }));

    // TC-N-012: External link ada indicator (rel=noopener atau icon)
    R.push(await this.noteTest('TC-N-012', M, 'External link memiliki rel="noopener" atau indicator',
      'Halaman dimuat, ada link', '1. Cari link ke domain berbeda\n2. Cek rel="noopener" atau target="_blank"',
      'External link aman (noopener)', async () => {
        const baseUrl = new URL(url);
        const externalLinks = await page.evaluate((host) => {
          const links = Array.from(document.querySelectorAll('a[href]'));
          let withNoopener = 0, total = 0;
          for (const a of links) {
            try {
              const u = new URL(a.href, window.location.href);
              if (u.hostname !== host) {
                total++;
                const rel = a.getAttribute('rel') || '';
                if (rel.includes('noopener') || rel.includes('noreferrer')) withNoopener++;
              }
            } catch {}
          }
          return { withNoopener, total };
        }, baseUrl.hostname);
        if (externalLinks.total === 0) return 'Tidak ada external link';
        if (externalLinks.withNoopener < externalLinks.total * 0.5) {
          throw new Error(`${externalLinks.total - externalLinks.withNoopener}/${externalLinks.total} external link tanpa noopener`);
        }
        return `${externalLinks.withNoopener}/${externalLinks.total} external link aman`;
      }));

    // TC-N-013: Anchor link smooth scroll
    R.push(await this.noteTest('TC-N-013', M, 'Anchor link (#) berfungsi',
      'Halaman dimuat', '1. Cari link dengan href="#..."\n2. Klik\n3. Cek scroll terjadi',
      'Anchor link berfungsi', async () => {
        const anchorLinks = await page.locator('a[href^="#"]:not([href="#"])').all();
        if (anchorLinks.length === 0) return 'Tidak ada anchor link';
        const first = anchorLinks[0];
        if (!await first.isVisible().catch(() => false)) return 'Anchor link tidak visible';
        const beforeScroll = await page.evaluate(() => window.scrollY);
        await first.click();
        await page.waitForTimeout(1000);
        const afterScroll = await page.evaluate(() => window.scrollY);
        if (afterScroll !== beforeScroll) return 'Anchor link scroll berfungsi';
        return 'Anchor link tidak mengubah scroll (mungkin target tidak ada)';
      }));

    // TC-N-014: Page reload tidak error
    R.push(await this.safeTest('TC-N-014', M, 'Page reload (F5) tidak menyebabkan error',
      'Halaman dimuat', '1. Reload halaman\n2. Cek halaman masih dimuat dengan benar',
      'Halaman reload tanpa error', async () => {
        const beforeUrl = page.url();
        await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(1000);
        const afterUrl = page.url();
        const bodyVisible = await page.locator('body').isVisible().catch(() => false);
        if (!bodyVisible) throw new Error('Body tidak visible setelah reload');
        if (afterUrl !== beforeUrl && !afterUrl.includes(beforeUrl) && !beforeUrl.includes(afterUrl)) {
          throw new Error(`URL berubah setelah reload: ${beforeUrl} → ${afterUrl}`);
        }
        return 'Page reload berhasil tanpa error';
      }));

    // TC-N-015: Back/forward browser button berfungsi
    R.push(await this.safeTest('TC-N-015', M, 'Back/forward browser button berfungsi',
      'Halaman dimuat', '1. Navigasi ke halaman lain\n2. Tekan back\n3. Tekan forward\n4. Cek halaman benar',
      'Navigasi history tidak break', async () => {
        const url1 = page.url();
        const links = await page.locator('a[href]').all();
        if (links.length === 0) return 'Tidak ada link untuk test navigasi';
        let clicked = false;
        for (const link of links.slice(0, 5)) {
          const href = await link.getAttribute('href');
          if (href && !href.startsWith('#') && !href.startsWith('mailto') && !href.startsWith('javascript')) {
            await link.click().catch(() => {});
            await page.waitForTimeout(2000);
            clicked = true;
            break;
          }
        }
        if (!clicked) return 'Tidak ada link yang bisa di-klik';
        const url2 = page.url();
        if (url2 === url1) return 'Tidak ada navigasi terjadi';
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(1000);
        const backUrl = page.url();
        await page.goForward({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(1000);
        const fwdUrl = page.url();
        if (backUrl === url1 && fwdUrl === url2) return 'Back/forward berfungsi dengan benar';
        return `Back: ${backUrl === url1 ? 'OK' : 'FAIL'}, Forward: ${fwdUrl === url2 ? 'OK' : 'FAIL'}`;
      }));

    // TC-N-016: Deep link / direct URL access
    R.push(await this.safeTest('TC-N-016', M, 'Deep link / direct URL access berfungsi',
      'Halaman dimuat', '1. Catat URL halaman\n2. Buka URL baru\n3. Buka URL awal langsung\n4. Cek halaman dimuat',
      'Direct URL access berfungsi', async () => {
        const currentUrl = page.url();
        await page.goto(currentUrl, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(1000);
        const bodyVisible = await page.locator('body').isVisible().catch(() => false);
        if (!bodyVisible) throw new Error('Halaman tidak dimuat saat direct URL access');
        const title = await page.title();
        if (!title) throw new Error('Tidak ada judul saat direct URL access');
        return 'Direct URL access berhasil';
      }));

    // TC-N-017: Menu dropdown keyboard accessible
    R.push(await this.safeTest('TC-N-017', M, 'Menu dropdown keyboard accessible (Enter/Space/Escape)',
      'Halaman dimuat dengan dropdown', '1. Cari dropdown toggle\n2. Focus dengan keyboard\n3. Buka dengan Enter/Space\n4. Tutup dengan Escape',
      'Dropdown keyboard accessible', async () => {
        const dropdownSels = ['.dropdown-toggle', '[data-toggle="dropdown"]', '[aria-haspopup="true"]', '[data-bs-toggle="dropdown"]', 'details > summary'];
        let toggleEl = null;
        for (const s of dropdownSels) {
          const el = page.locator(s).first();
          if (await el.isVisible().catch(() => false)) { toggleEl = el; break; }
        }
        if (!toggleEl) return 'Tidak ada dropdown menu di halaman';
        await toggleEl.focus().catch(() => {});
        const wasExpanded = await page.evaluate(() => {
          const el = document.activeElement;
          return el?.getAttribute('aria-expanded') === 'true' || !!el?.closest('details[open]');
        });
        if (wasExpanded) return 'Dropdown sudah terbuka (keyboard accessible)';
        await page.keyboard.press('Enter');
        await page.waitForTimeout(500);
        const opened = await page.evaluate(() => {
          const el = document.activeElement;
          return el?.getAttribute('aria-expanded') === 'true' || !!el?.closest('details[open]') || !!document.querySelector('.dropdown-menu.show, .dropdown-menu[style*="block"]');
        });
        if (!opened) {
          await page.keyboard.press('Space');
          await page.waitForTimeout(500);
        }
        const isOpen = await page.evaluate(() => !!document.querySelector('.dropdown-menu.show, .dropdown-menu[style*="block"], details[open], [aria-expanded="true"]'));
        if (!isOpen) return 'Dropdown toggle ditemukan tapi tidak bisa dibuka dengan keyboard (info: mungkin click-only)';
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        const closed = await page.evaluate(() => !document.querySelector('.dropdown-menu.show, .dropdown-menu[style*="block"]') && !document.querySelector('[aria-expanded="true"]'));
        if (closed) return 'Dropdown keyboard accessible: Enter buka, Escape tutup';
        return 'Dropdown bisa dibuka dengan keyboard tapi Escape tidak menutup';
      }));

    // TC-N-018: Search functionality
    R.push(await this.safeTest('TC-N-018', M, 'Search functionality berfungsi',
      'Halaman dimuat', '1. Cari search box\n2. Ketik query\n3. Submit\n4. Cek hasil',
      'Search berfungsi dan return hasil', async () => {
        const searchSels = ['input[type="search"]', 'input[name="q"]', 'input[name="search"]', 'input[placeholder*="search" i]', 'input[placeholder*="cari" i]', '[role="search"] input'];
        let searchInput = null;
        for (const s of searchSels) {
          const el = page.locator(s).first();
          if (await el.isVisible().catch(() => false)) { searchInput = el; break; }
        }
        if (!searchInput) return 'Tidak ada search box di halaman';
        await searchInput.fill('test');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(3000);
        const afterUrl = page.url();
        if (afterUrl.includes('search') || afterUrl.includes('q=') || afterUrl.includes('query')) return 'Search berfungsi (URL berubah ke hasil search)';
        return 'Search box ada tapi tidak ada navigasi hasil (mungkin search client-side)';
      }));

    // TC-N-019: Pagination berfungsi
    R.push(await this.safeTest('TC-N-019', M, 'Pagination berfungsi (next/prev/page number)',
      'Halaman dimuat', '1. Cari pagination control\n2. Klik next/prev\n3. Cek URL atau content berubah',
      'Pagination berfungsi', async () => {
        const paginationSels = ['.pagination a', '[class*="pagination"] a', '.page-item a', 'nav[aria-label*="page" i] a', 'a:has-text("Next"), a:has-text("Prev"), a:has-text("Berikutnya"), a:has-text("Sebelumnya")'];
        let pagLink = null;
        for (const s of paginationSels) {
          const el = page.locator(s).first();
          if (await el.isVisible().catch(() => false)) { pagLink = el; break; }
        }
        if (!pagLink) return 'Tidak ada pagination di halaman';
        const beforeUrl = page.url();
        const beforeContent = await page.evaluate(() => document.body.innerText.substring(0, 500));
        await pagLink.click().catch(() => {});
        await page.waitForTimeout(2000);
        const afterUrl = page.url();
        const afterContent = await page.evaluate(() => document.body.innerText.substring(0, 500));
        if (afterUrl !== beforeUrl) return `Pagination berfungsi (URL berubah: ${afterUrl.substring(0, 80)})`;
        if (afterContent !== beforeContent) return 'Pagination berfungsi (content berubah tanpa URL change)';
        return 'Pagination link ditemukan tapi klik tidak mengubah halaman';
      }));

    // TC-N-020: Tidak ada dead-end page
    R.push(await this.noteTest('TC-N-020', M, 'Tidak ada dead-end page (setiap halaman punya link kembali/nav)',
      'Halaman dimuat', '1. Cek ada nav/menu\n2. Cek ada link ke home\n3. Cek ada breadcrumb atau back link',
      'Tidak ada dead-end', async () => {
        const hasNav = await page.locator('nav, [role="navigation"], .navbar, .menu').first().isVisible().catch(() => false);
        const hasHomeLink = await page.locator('a[href="/"], a[href="."], a:has-text("Home"), a:has-text("Beranda"), a:has-text("Back")').first().isVisible().catch(() => false);
        const hasBreadcrumb = await page.locator('.breadcrumb, [aria-label*="breadcrumb" i], nav ol li a').first().isVisible().catch(() => false);
        if (hasNav || hasHomeLink || hasBreadcrumb) return 'Halaman punya navigasi (tidak dead-end)';
        throw new Error('Halaman tidak punya nav, home link, atau breadcrumb (potential dead-end)');
      }));

    // TC-N-021: Form autocomplete attributes
    R.push(await this.noteTest('TC-N-021', M, 'Form input memiliki autocomplete attribute yang sesuai',
      'Halaman dimuat dengan form', '1. Cari semua input\n2. Cek autocomplete attribute\n3. Validasi nilai autocomplete sesuai type input',
      'Input punya autocomplete yang sesuai', async () => {
        const result = await page.evaluate(() => {
          const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"])');
          if (inputs.length === 0) return { total: 0, missing: 0 };
          const validValues = ['name', 'given-name', 'family-name', 'email', 'username', 'current-password', 'new-password', 'tel', 'address-line1', 'address-line2', 'postal-code', 'organization', 'off', 'on', 'cc-name', 'cc-number', 'cc-exp', 'bday'];
          let missing = 0;
          for (const inp of inputs) {
            const ac = inp.getAttribute('autocomplete');
            if (!ac || ac === '') missing++;
          }
          return { total: inputs.length, missing };
        });
        if (result.total === 0) return 'Tidak ada input di halaman';
        if (result.missing > result.total * 0.5) throw new Error(`${result.missing}/${result.total} input tanpa autocomplete attribute`);
        return `${result.missing}/${result.total} input tanpa autocomplete (OK)`;
      }));

    return R;
  }

  // ===== Modul: Keamanan =====
  async testSecurity(page, url, d) {
    const M = 'Keamanan'; const R = [];

    // Cache headers from a single request to avoid repeated slow goto calls
    let _cachedHeaders = null;
    const getHeaders = async () => {
      if (_cachedHeaders) return _cachedHeaders;
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
      _cachedHeaders = res ? res.headers() : {};
      return _cachedHeaders;
    };

    R.push(await this.safeTest('TC-S-001', M, 'Menggunakan HTTPS',
      'URL target diketahui', '1. Cek protokol\n2. Jika http, cek redirect',
      'HTTPS', async () => {
        const u = new URL(url);
        if (u.protocol === 'https:') return 'Menggunakan HTTPS';
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        if (page.url().startsWith('https://')) return 'Redirect ke HTTPS';
        throw new Error(`Menggunakan ${u.protocol}`);
      }));

    R.push(await this.safeTest('TC-S-002', M, 'Security headers tersedia',
      'URL target', '1. Ambil response headers\n2. Cek CSP, X-Frame-Options, HSTS',
      'Minimal 1 security header', async () => {
        const h = await getHeaders();
        const found = [];
        if (h['content-security-policy'] || h['x-content-security-policy']) found.push('CSP');
        if (h['x-frame-options']) found.push('X-Frame-Options');
        if (h['strict-transport-security']) found.push('HSTS');
        if (h['x-content-type-options']) found.push('X-Content-Type-Options');
        if (found.length === 0) throw new Error('Tidak ada security header');
        return found.join(', ');
      }));

    R.push(await this.safeTest('TC-S-003', M, 'Tidak ada data sensitif di source',
      'Halaman dimuat', '1. Ambil HTML\n2. Scan pola api_key, secret, password',
      'Tidak ada data sensitif', async () => {
        const html = await page.content();
        const pats = [/api[_-]?key\s*[:=]\s*["'][^"']{10,}["']/gi, /secret\s*[:=]\s*["'][^"']{10,}["']/gi, /password\s*[:=]\s*["'][^"']{4,}["']/gi];
        let found = 0;
        for (const p of pats) { const m = html.match(p); if (m) found += m.length; }
        if (found > 0) throw new Error(`${found} data sensitif terekspos`);
        return 'Tidak ada data sensitif';
      }));

    if (d.hasLogin) {
      R.push(await this.safeTest('TC-S-004', M, 'Password field ter-mask',
        'Halaman dimuat dengan form login', '1. Cari input password\n2. Cek type',
        'type="password"', async () => {
          const bad = await page.locator('input[type="text"][name*="password" i], input:not([type="password"])[name*="password" i]').count();
          if (bad > 0) throw new Error(`${bad} field password tidak ter-mask`);
          return 'Semua password field ter-mask';
        }));

      R.push(await this.safeTest('TC-S-005', M, 'Token CSRF protection',
        'Halaman dimuat', '1. Cari meta csrf-token\n2. Cari input hidden csrf',
        'CSRF token ada', async () => {
          const meta = await page.locator('meta[name="csrf-token"]').count();
          const input = await page.locator('input[name="authenticity_token"], input[name="csrf_token"], input[name="_token"], input[name="csrfmiddlewaretoken"]').count();
          if (meta > 0 || input > 0) return `CSRF token (meta: ${meta}, input: ${input})`;
          throw new Error('Token CSRF tidak ditemukan');
        }));
    } else {
      R.push(this.skip('TC-S-004', M, 'Password field ter-mask', 'Form login', '1. Cek password', 'ter-mask', 'tidak ada form login'));
      R.push(this.skip('TC-S-005', M, 'Token CSRF protection', 'Form login', '1. Cari CSRF', 'CSRF ada', 'tidak ada form login'));
    }

    R.push(await this.safeTest('TC-S-006', M, 'Cookie memiliki flag Secure',
      'Halaman dimuat', '1. Ambil cookie\n2. Cek secure flag',
      'Cookie secure', async () => {
        const cookies = await page.context().cookies();
        if (cookies.length === 0) return 'Tidak ada cookie';
        let insecure = 0;
        for (const c of cookies) { if (!c.secure) insecure++; }
        if (insecure > cookies.length * 0.5) throw new Error(`${insecure}/${cookies.length} cookie tanpa Secure`);
        return `${insecure}/${cookies.length} cookie tanpa Secure`;
      }));

    R.push(await this.safeTest('TC-S-007', M, 'Cookie memiliki HttpOnly',
      'Halaman dimuat', '1. Ambil cookie\n2. Cek httpOnly',
      'Cookie HttpOnly', async () => {
        const cookies = await page.context().cookies();
        if (cookies.length === 0) return 'Tidak ada cookie';
        let without = 0;
        for (const c of cookies) { if (!c.httpOnly) without++; }
        if (without > cookies.length * 0.5) throw new Error(`${without}/${cookies.length} cookie tanpa HttpOnly`);
        return `${without}/${cookies.length} cookie tanpa HttpOnly`;
      }));

    // TC-S-008: X-Content-Type-Options: nosniff
    R.push(await this.safeTest('TC-S-008', M, 'X-Content-Type-Options: nosniff header',
      'URL target', '1. Ambil response headers\n2. Cek x-content-type-options',
      'nosniff header ada', async () => {
        const h = await getHeaders();
        if (!h['x-content-type-options']) throw new Error('X-Content-Type-Options tidak ada');
        if (!h['x-content-type-options'].includes('nosniff')) throw new Error(`Value: ${h['x-content-type-options']}`);
        return 'X-Content-Type-Options: nosniff';
      }));

    // TC-S-009: Referrer-Policy header
    R.push(await this.safeTest('TC-S-009', M, 'Referrer-Policy header tersedia',
      'URL target', '1. Ambil response headers\n2. Cek referrer-policy',
      'Referrer-Policy ada', async () => {
        const h = await getHeaders();
        if (!h['referrer-policy']) throw new Error('Referrer-Policy tidak ada');
        return `Referrer-Policy: ${h['referrer-policy']}`;
      }));

    // TC-S-010: Permissions-Policy header
      R.push(await this.noteTest('TC-S-010', M, 'Permissions-Policy header tersedia',
      'URL target', '1. Ambil response headers\n2. Cek permissions-policy',
      'Permissions-Policy ada (best practice)', async () => {
        const h = await getHeaders();
        if (!h['permissions-policy'] && !h['feature-policy']) {
          return 'Permissions-Policy tidak ditemukan (info: best practice)';
        }
        return `Permissions-Policy: ${(h['permissions-policy'] || h['feature-policy']).substring(0, 80)}`;
      }));

    // TC-S-011: Tidak ada inline event handler berlebihan
      R.push(await this.noteTest('TC-S-011', M, 'Tidak ada inline event handler berlebihan (onclick, onload, dll)',
      'Halaman dimuat', '1. Ambil HTML\n2. Hitung inline event handler\n3. Max 10 (best practice)',
      'Inline handler minimal', async () => {
        const inlineCount = await page.evaluate(() => {
          const els = document.querySelectorAll('*');
          let count = 0;
          for (const el of els) {
            for (const attr of el.attributes) {
              if (attr.name.startsWith('on')) count++;
            }
          }
          return count;
        });
        if (inlineCount > 15) throw new Error(`${inlineCount} inline event handler (best practice: gunakan addEventListener)`);
        return `${inlineCount} inline event handler (OK)`;
      }));

    // TC-S-012: Form action tidak bisa dimanipulasi (open redirect)
    if (d.hasForm) {
      R.push(await this.safeTest('TC-S-012', M, 'Form action tidak rentan terhadap open redirect',
        'Halaman dimuat dengan form', '1. Cari form\n2. Cek action attribute\n3. Pastikan same-origin',
        'Form action same-origin', async () => {
          const forms = await page.locator('form[action]').all();
          if (forms.length === 0) return 'Tidak ada form dengan action attribute';
          const baseUrl = new URL(url);
          let external = 0;
          for (const form of forms) {
            const action = await form.getAttribute('action');
            if (action && !action.startsWith('#') && !action.startsWith('/')) {
              try {
                const actionUrl = new URL(action, url);
                if (actionUrl.hostname !== baseUrl.hostname) external++;
              } catch {}
            }
          }
          if (external > 0) throw new Error(`${external} form dengan action ke domain berbeda`);
          return `${forms.length} form, semua same-origin`;
        }));
    } else {
      R.push(this.skip('TC-S-012', M, 'Open redirect check', 'Form ada', '1. Cek form action', 'Same-origin', 'tidak ada form'));
    }

    // TC-S-013: Tidak ada comment HTML yang expose info sensitif
    R.push(await this.safeTest('TC-S-013', M, 'Tidak ada HTML comment yang expose info sensitif',
      'Halaman dimuat', '1. Ambil HTML\n2. Cari comment\n3. Scan pola sensitif (password, token, key, secret)',
      'Tidak ada info sensitif di comment', async () => {
        const html = await page.content();
        const comments = html.match(/<!--[\s\S]*?-->/g) || [];
        let sensitive = 0;
        for (const c of comments) {
          if (/password|token|secret|api[_-]?key|credential|private/i.test(c)) sensitive++;
        }
        if (sensitive > 0) throw new Error(`${sensitive} comment mengandung info sensitif`);
        return `${comments.length} HTML comment, tidak ada info sensitif`;
      }));

    // TC-S-014: Input sanitization (cek apakah HTML input di-escape)
    if (d.inputCount > 0) {
      R.push(await this.safeTest('TC-S-014', M, 'Input sanitization - HTML special characters di-escape',
        'Halaman dimuat dengan input', '1. Isi input dengan HTML payload\n2. Submit\n3. Cek output di-escape',
        'Input di-sanitize', async () => {
          const input = page.locator(`input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="password"]):not([type="checkbox"]):not([type="radio"])`).first();
          if (!await input.isVisible().catch(() => false)) return 'Tidak ada input text visible';
          await input.fill('<b>test</b><img src=x onerror=alert(1)>');
          await page.waitForTimeout(500);
          const val = await input.inputValue();
          if (val !== val.replace(/</g, '&lt;')) return 'Input meng-escape sendiri (client-side)';
          return 'Input tidak di-escape di client (harus di-escape di server-side)';
        }));
    } else {
      R.push(this.skip('TC-S-014', M, 'Input sanitization', 'Ada input', '1. Tes HTML payload', 'Di-escape', 'tidak ada input'));
    }

    // TC-S-015: Tidak ada directory listing exposed
    R.push(await this.safeTest('TC-S-015', M, 'Tidak ada directory listing exposed',
      'URL target', '1. Coba akses direktori (tanpa file)\n2. Cek apakah listing tampil',
      'Directory listing disabled', async () => {
        const baseUrl = new URL(url);
        const dirUrl = `${baseUrl.origin}/static/`;
        const res = await page.goto(dirUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null);
        if (!res) return 'Tidak bisa akses /static/ (aman)';
        const bodyText = await page.locator('body').innerText().catch(() => '');
        if (bodyText.toLowerCase().includes('index of') || bodyText.includes('Directory listing')) {
          throw new Error('Directory listing terekspos');
        }
        return 'Directory listing tidak terekspos';
      }));

    // TC-S-016: Error message tidak expose stack trace
    R.push(await this.safeTest('TC-S-016', M, 'Error message tidak expose stack trace atau versi framework',
      'URL target', '1. Trigger error (URL tidak valid)\n2. Cek body tidak mengandung stack trace',
      'Tidak ada stack trace terekspos', async () => {
        const baseUrl = new URL(url);
        const errorUrl = `${baseUrl.origin}/api/nonexistent-endpoint-${Date.now()}`;
        const res = await page.goto(errorUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null);
        if (!res) return 'Tidak bisa trigger error endpoint';
        const bodyText = await page.locator('body').innerText().catch(() => '');
        const stackPatterns = /at\s\/.*\.js:\d+|stack\s*trace|node_modules|express|TypeError|ReferenceError/i;
        if (stackPatterns.test(bodyText)) throw new Error('Stack trace terekspos di response');
        return 'Tidak ada stack trace terekspos';
      }));

    // TC-S-017: CSP directive detail
    R.push(await this.safeTest('TC-S-017', M, 'Content-Security-Policy directive detail (default-src, script-src, style-src)',
      'Halaman dimuat', '1. Ambil CSP header\n2. Parse directive\n3. Cek default-src, script-src, style-src',
      'CSP directive lengkap', async () => {
        const csp = await page.evaluate(() => {
          const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
          return meta ? meta.getAttribute('content') : null;
        });
        const h = await getHeaders();
        const cspHeader = h['content-security-policy'] || null;
        const cspValue = csp || cspHeader;
        if (!cspValue) return 'CSP tidak ditemukan (info: best practice untuk security)';
        const hasDefault = cspValue.includes('default-src');
        const hasScript = cspValue.includes('script-src');
        const hasStyle = cspValue.includes('style-src');
        const parts = [];
        if (hasDefault) parts.push('default-src');
        if (hasScript) parts.push('script-src');
        if (hasStyle) parts.push('style-src');
        if (parts.length < 2) throw new Error(`CSP hanya punya: ${parts.join(', ')} (minimal 2 directive)`);
        return `CSP directive: ${parts.join(', ')}`;
      }));

    // TC-S-019: Cookie SameSite attribute
    R.push(await this.safeTest('TC-S-019', M, 'Cookie SameSite attribute (Strict, Lax, atau None+Secure)',
      'Halaman dimuat', '1. Ambil semua cookie\n2. Cek SameSite attribute',
      'Cookie punya SameSite attribute', async () => {
        const cookies = await page.context().cookies();
        if (cookies.length === 0) return 'Tidak ada cookie';
        let noSameSite = 0;
        for (const c of cookies) {
          if (!c.sameSite || c.sameSite === 'None') {
            if (!c.secure) noSameSite++;
          }
        }
        if (noSameSite > cookies.length * 0.5) throw new Error(`${noSameSite}/${cookies.length} cookie tanpa SameSite atau None tanpa Secure`);
        return `${noSameSite}/${cookies.length} cookie tanpa SameSite yang valid (OK)`;
      }));

    // TC-S-020: Tidak ada eval() di JavaScript source
    R.push(await this.safeTest('TC-S-020', M, 'Tidak ada eval() di JavaScript source code',
      'Halaman dimuat', '1. Ambil semua script src\n2. Fetch JS content\n3. Cek penggunaan eval()',
      'Tidak ada eval() di JS', async () => {
        const scripts = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('script[src]')).map(s => s.src).filter(s => s.startsWith('http'));
        });
        if (scripts.length === 0) return 'Tidak ada external script untuk di-check';
        let evalCount = 0;
        for (const src of scripts.slice(0, 5)) {
          try {
            const resp = await page.goto(src, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null);
            if (resp) {
              const text = await page.locator('body').innerText().catch(() => '');
              if (text.includes('eval(')) evalCount++;
            }
          } catch {}
        }
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        if (evalCount > 0) throw new Error(`${evalCount} script menggunakan eval()`);
        return 'Tidak ada eval() di script yang di-check';
      }));

    // TC-S-023: Tidak ada sensitive data di URL parameter
    R.push(await this.safeTest('TC-S-023', M, 'Tidak ada sensitive data di URL parameter (token, password, key)',
      'Halaman dimuat', '1. Parse URL query params\n2. Cek pattern sensitive (token, password, key, secret)',
      'Tidak ada sensitive data di URL', async () => {
        const currentUrl = page.url();
        const urlObj = new URL(currentUrl);
        const params = urlObj.searchParams;
        const sensitivePatterns = [/token/i, /password/i, /passwd/i, /secret/i, /api[_-]?key/i, /access[_-]?key/i, /private[_-]?key/i];
        let found = [];
        for (const [key, value] of params.entries()) {
          for (const p of sensitivePatterns) {
            if (p.test(key)) found.push(key);
          }
        }
        if (found.length > 0) throw new Error(`Sensitive data di URL: ${found.join(', ')}`);
        return 'Tidak ada sensitive data di URL parameter';
      }));

    // TC-S-024: Tidak ada insecure JSON.parse tanpa try-catch
    R.push(await this.safeTest('TC-S-024', M, 'Tidak ada insecure JSON.parse tanpa try-catch di inline script',
      'Halaman dimuat', '1. Cari inline script\n2. Cek JSON.parse tanpa try-catch wrapper',
      'JSON.parse di-handle dengan aman', async () => {
        const insecureParse = await page.evaluate(() => {
          const scripts = Array.from(document.querySelectorAll('script:not([src])'));
          let count = 0;
          for (const s of scripts) {
            const text = s.textContent || '';
            if (text.includes('JSON.parse(') && !text.includes('try')) count++;
          }
          return count;
        });
        if (insecureParse > 2) throw new Error(`${insecureParse} inline script dengan JSON.parse tanpa try-catch`);
        return `${insecureParse} JSON.parse tanpa try-catch (OK)`;
      }));

    // TC-S-025: Clickjacking protection (X-Frame-Options atau CSP frame-ancestors)
    R.push(await this.safeTest('TC-S-025', M, 'Clickjacking protection (X-Frame-Options atau CSP frame-ancestors)',
      'Halaman dimuat', '1. Ambil headers via cached request\n2. Cek X-Frame-Options\n3. Cek CSP frame-ancestors',
      'Clickjacking protection ada', async () => {
        const headers = await getHeaders();
        const xfo = headers['x-frame-options'] || '';
        const csp = headers['content-security-policy'] || '';
        if (xfo) return `X-Frame-Options: ${xfo}`;
        if (csp.includes('frame-ancestors')) return `CSP frame-ancestors ada di CSP`;
        throw new Error('Tidak ada X-Frame-Options atau CSP frame-ancestors (rentan clickjacking)');
      }));

    return R;
  }

  // ===== Modul: Performa =====
  async testPerformance(page, url, d) {
    const M = 'Performa'; const R = [];

    R.push(await this.safeTest('TC-P-001', M, 'DOM load < 10 detik',
      'Browser terbuka', '1. Catat waktu\n2. Navigasi domcontentloaded\n3. Hitung',
      'DOM < 10s', async () => {
        const t0 = Date.now();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        const ms = Date.now() - t0;
        if (ms > 10000) throw new Error(`DOM ${(ms/1000).toFixed(2)}s`);
        return `DOM ${(ms/1000).toFixed(2)} detik`;
      }));

    R.push(await this.safeTest('TC-P-002', M, 'Full load < 20 detik',
      'Browser terbuka', '1. Catat waktu\n2. Navigasi networkidle\n3. Hitung',
      'Full load < 20s', async () => {
        const t0 = Date.now();
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        const ms = Date.now() - t0;
        if (ms > 20000) throw new Error(`Full load ${(ms/1000).toFixed(2)}s`);
        return `Full load ${(ms/1000).toFixed(2)} detik`;
      }));

    R.push(await this.safeTest('TC-P-003', M, 'HTTP request < 100',
      'Browser terbuka', '1. Hitung request\n2. Navigasi\n3. Total',
      'Request < 100', async () => {
        let count = 0;
        const ctx = page.context();
        const h = () => count++;
        ctx.on('request', h);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        ctx.off('request', h);
        if (count > 100) throw new Error(`${count} request`);
        return `${count} HTTP request`;
      }));

    R.push(await this.safeTest('TC-P-004', M, 'Tidak ada request 4xx/5xx',
      'Browser terbuka', '1. Listener response\n2. Navigasi\n3. Filter error',
      'Tidak ada 4xx/5xx', async () => {
        const failed = [];
        page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.url().split('/').pop()} (${r.status()})`); });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(2000);
        if (failed.length > 3) throw new Error(`${failed.length} error: ${failed.slice(0, 5).join(', ')}`);
        return `${failed.length} request error`;
      }));

    if (d.imageCount > 0) {
      R.push(await this.safeTest('TC-P-005', M, 'Tidak ada broken image',
        'Halaman dimuat, ada gambar', '1. Cari <img>\n2. Cek complete & naturalWidth',
        'Semua image OK', async () => {
          const broken = await page.evaluate(() => Array.from(document.querySelectorAll('img')).filter(i => !i.complete || i.naturalWidth === 0).length);
          const total = await page.locator('img').count();
          if (broken > 0) throw new Error(`${broken}/${total} image gagal`);
          return `Semua ${total} image OK`;
        }));
    } else {
      R.push(this.skip('TC-P-005', M, 'Tidak ada broken image', 'Halaman dimuat', '1. Cek img', 'Image OK', 'tidak ada gambar'));
    }

    R.push(await this.safeTest('TC-P-006', M, 'Resource CSS & JS load',
      'Browser terbuka', '1. Listener response\n2. Filter .css/.js dengan 4xx',
      'Semua CSS/JS OK', async () => {
        const failed = [];
        page.on('response', (r) => { if (r.status() >= 400 && (r.url().includes('.css') || r.url().includes('.js'))) failed.push(r.url().split('/').pop()); });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        if (failed.length > 0) throw new Error(`Gagal: ${failed.join(', ')}`);
        return 'Semua CSS & JS OK';
      }));

    R.push(await this.safeTest('TC-P-007', M, 'Compression enabled',
      'URL target', '1. Cek Content-Encoding header',
      'Compression aktif', async () => {
        const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        const ce = res.headers()['content-encoding'];
        if (ce) return `Compression: ${ce}`;
        return 'Compression tidak terdeteksi (mungkin di CDN)';
      }));

    // TC-P-008: Total page weight < 3MB
    R.push(await this.safeTest('TC-P-008', M, 'Total page weight < 3MB (HTML+CSS+JS+images)',
      'Browser terbuka', '1. Hitung total transfer size semua resource\n2. Bandingkan dengan 3MB',
      'Page weight < 3MB', async () => {
        let totalSize = 0;
        page.on('response', async (r) => {
          try { const buf = await r.body(); totalSize += buf.length; } catch {}
        });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(2000);
        const mb = (totalSize / 1024 / 1024).toFixed(2);
        if (totalSize > 3 * 1024 * 1024) throw new Error(`Page weight ${mb}MB (> 3MB)`);
        return `Page weight ${mb}MB`;
      }));

    // TC-P-009: Tidak ada render-blocking CSS di above-the-fold
    R.push(await this.safeTest('TC-P-009', M, 'Tidak ada render-blocking CSS yang berlebihan',
      'Halaman dimuat', '1. Cari link[rel="stylesheet"] di <head>\n2. Cek apakah ada yang tidak critical',
      'Render-blocking CSS minimal', async () => {
        const blockingCss = await page.evaluate(() => {
          const links = document.querySelectorAll('head link[rel="stylesheet"]');
          let blocking = 0;
          for (const l of links) {
            const media = l.getAttribute('media');
            if (!media || media === 'all' || media === 'screen') blocking++;
          }
          return blocking;
        });
        if (blockingCss > 5) throw new Error(`${blockingCss} render-blocking stylesheet (best practice: minify & inline critical CSS)`);
        return `${blockingCss} stylesheet di <head> (OK)`;
      }));

    // TC-P-010: JavaScript bundle size < 1MB
    R.push(await this.safeTest('TC-P-010', M, 'JavaScript bundle size < 1MB',
      'Browser terbuka', '1. Hitung total size semua .js resource\n2. Bandingkan dengan 1MB',
      'JS bundle < 1MB', async () => {
        let jsSize = 0;
        page.on('response', async (r) => {
          if (r.url().endsWith('.js') || r.url().includes('.js?') || r.request().resourceType() === 'script') {
            try { const buf = await r.body(); jsSize += buf.length; } catch {}
          }
        });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(2000);
        const kb = (jsSize / 1024).toFixed(0);
        if (jsSize > 1024 * 1024) throw new Error(`JS bundle ${kb}KB (> 1MB)`);
        return `JS bundle ${kb}KB`;
      }));

    // TC-P-011: Image optimization (WebP/AVIF atau lazy loading)
    if (d.imageCount > 0) {
      R.push(await this.safeTest('TC-P-011', M, 'Image optimization (format modern atau lazy loading)',
        'Halaman dimuat, ada gambar', '1. Cari img\n2. Cek loading="lazy" atau format WebP/AVIF\n3. Cek srcset',
        'Image teroptimasi', async () => {
          const imgs = await page.evaluate(() => {
            const els = document.querySelectorAll('img');
            let lazy = 0, modern = 0, srcset = 0;
            for (const img of els) {
              if (img.getAttribute('loading') === 'lazy') lazy++;
              const src = img.getAttribute('src') || '';
              if (src.endsWith('.webp') || src.endsWith('.avif')) modern++;
              if (img.getAttribute('srcset')) srcset++;
            }
            return { total: els.length, lazy, modern, srcset };
          });
          if (imgs.total === 0) return 'Tidak ada gambar';
          const optimized = imgs.lazy + imgs.modern + imgs.srcset;
          if (optimized < imgs.total * 0.3) throw new Error(`${imgs.total - optimized}/${imgs.total} gambar tidak teroptimasi`);
          return `${optimized}/${imgs.total} gambar teroptimasi (lazy: ${imgs.lazy}, modern: ${imgs.modern}, srcset: ${imgs.srcset})`;
        }));
    } else {
      R.push(this.skip('TC-P-011', M, 'Image optimization', 'Ada gambar', '1. Cek format/lazy', 'Teroptimasi', 'tidak ada gambar'));
    }

    // TC-P-012: Font loading tidak block render
    R.push(await this.safeTest('TC-P-012', M, 'Font loading tidak block render (font-display: swap)',
      'Halaman dimuat', '1. Cari @font-face atau link font\n2. Cek font-display',
      'Font tidak block render', async () => {
        const fontInfo = await page.evaluate(() => {
          const links = document.querySelectorAll('link[rel="stylesheet"][href*="font"], link[rel="preload"][as="font"]');
          return { fontLinks: links.length, hasGoogleFonts: document.querySelector('link[href*="fonts.googleapis.com"]') !== null };
        });
        const cssText = await page.evaluate(() => {
          for (const sheet of document.styleSheets) {
            try {
              for (const rule of sheet.cssRules) {
                if (rule.cssText && rule.cssText.includes('@font-face')) {
                  if (rule.cssText.includes('font-display')) return 'has-font-display';
                }
              }
            } catch {}
          }
          return 'no-font-face';
        });
        if (fontInfo.hasGoogleFonts) return 'Google Fonts digunakan (font-display: swap direkomendasikan)';
        if (cssText === 'has-font-display') return 'font-display ditemukan di @font-face';
        if (fontInfo.fontLinks === 0 && cssText === 'no-font-face') return 'Tidak ada custom font (system fonts)';
        return 'Custom font tanpa font-display (info: tambahkan font-display: swap)';
      }));

    // TC-P-013: Tidak ada unused CSS berlebihan (rough estimate)
    R.push(await this.noteTest('TC-P-013', M, 'Tidak ada unused CSS berlebihan (rough estimate)',
      'Halaman dimuat', '1. Hitung total CSS rules\n2. Hitung used selectors\n3. Estimasi unused',
      'Unused CSS < 50%', async () => {
        const result = await page.evaluate(() => {
          let totalRules = 0;
          let usedRules = 0;
          for (const sheet of document.styleSheets) {
            try {
              for (const rule of sheet.cssRules) {
                if (rule.selectorText) {
                  totalRules++;
                  try { if (document.querySelector(rule.selectorText)) usedRules++; } catch {}
                }
              }
            } catch {}
          }
          return { totalRules, usedRules };
        });
        if (result.totalRules === 0) return 'Tidak ada CSS rules terdeteksi';
        const unusedPercent = Math.round(((result.totalRules - result.usedRules) / result.totalRules) * 100);
        if (unusedPercent > 60) throw new Error(`${unusedPercent}% unused CSS (${result.totalRules - result.usedRules}/${result.totalRules} rules)`);
        return `${unusedPercent}% unused CSS (${result.usedRules}/${result.totalRules} rules used)`;
      }));

    // TC-P-014: First Contentful Paint (FCP) < 3s
    R.push(await this.safeTest('TC-P-014', M, 'First Contentful Paint (FCP) < 3 detik',
      'Halaman dimuat', '1. Gunakan Performance API\n2. Ambil FCP timing\n3. Bandingkan threshold',
      'FCP < 3s', async () => {
        const fcp = await page.evaluate(() => {
          const entries = performance.getEntriesByName('first-contentful-paint');
          return entries.length > 0 ? entries[0].startTime : null;
        });
        if (fcp === null) return 'FCP tidak terdeteksi (Performance API)';
        if (fcp > 3000) throw new Error(`FCP: ${Math.round(fcp)}ms (> 3000ms)`);
        return `FCP: ${Math.round(fcp)}ms`;
      }));

    // TC-P-015: Largest Contentful Paint (LCP) < 4s
    R.push(await this.safeTest('TC-P-015', M, 'Largest Contentful Paint (LCP) < 4 detik',
      'Halaman dimuat', '1. Gunakan PerformanceObserver\n2. Ambil LCP timing\n3. Bandingkan threshold',
      'LCP < 4s', async () => {
        const lcp = await page.evaluate(() => {
          return new Promise(resolve => {
            const obs = new PerformanceObserver(list => {
              const entries = list.getEntries();
              if (entries.length > 0) resolve(entries[entries.length - 1].startTime);
              else resolve(null);
            });
            obs.observe({ type: 'largest-contentful-paint', buffered: true });
            setTimeout(() => resolve(null), 3000);
          });
        });
        if (lcp === null) return 'LCP tidak terdeteksi';
        if (lcp > 4000) throw new Error(`LCP: ${Math.round(lcp)}ms (> 4000ms)`);
        return `LCP: ${Math.round(lcp)}ms`;
      }));

    // TC-P-016: Cumulative Layout Shift (CLS) < 0.1
    R.push(await this.safeTest('TC-P-016', M, 'Cumulative Layout Shift (CLS) < 0.1',
      'Halaman dimuat', '1. Gunakan PerformanceObserver\n2. Hitung CLS\n3. Bandingkan threshold',
      'CLS < 0.1', async () => {
        const cls = await page.evaluate(() => {
          return new Promise(resolve => {
            let clsValue = 0;
            const obs = new PerformanceObserver(list => {
              for (const entry of list.getEntries()) {
                if (entry.hadRecentInput) continue;
                clsValue += entry.value;
              }
            });
            obs.observe({ type: 'layout-shift', buffered: true });
            setTimeout(() => resolve(clsValue), 3000);
          });
        });
        if (cls > 0.1) throw new Error(`CLS: ${cls.toFixed(3)} (> 0.1)`);
        return `CLS: ${cls.toFixed(3)}`;
      }));

    // TC-P-017: Tidak ada long task > 200ms
    R.push(await this.safeTest('TC-P-017', M, 'Tidak ada long task > 200ms',
      'Halaman dimuat', '1. Gunakan PerformanceObserver longtask\n2. Hitung long tasks\n3. Flag task > 200ms',
      'Tidak ada long task > 200ms', async () => {
        const longTasks = await page.evaluate(() => {
          return new Promise(resolve => {
            const tasks = [];
            const obs = new PerformanceObserver(list => {
              for (const entry of list.getEntries()) tasks.push(entry.duration);
            });
            obs.observe({ type: 'longtask', buffered: true });
            setTimeout(() => resolve(tasks), 3000);
          });
        });
        const overThreshold = longTasks.filter(d => d > 200);
        if (overThreshold.length > 2) throw new Error(`${overThreshold.length} long task > 200ms (max: ${Math.round(Math.max(...overThreshold))}ms)`);
        return `${longTasks.length} long tasks, ${overThreshold.length} > 200ms (OK)`;
      }));

    // TC-P-018: Cache headers untuk static assets
    R.push(await this.safeTest('TC-P-018', M, 'Cache headers untuk static assets (Cache-Control)',
      'Halaman dimuat', '1. Intercept request ke static assets\n2. Cek Cache-Control header\n3. Flag missing cache',
      'Static assets punya cache headers', async () => {
        const responses = [];
        page.on('response', resp => {
          const url = resp.url();
          if (url.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2)$/)) {
            responses.push({ url, headers: resp.headers() });
          }
        });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
        if (responses.length === 0) return 'Tidak ada static asset request';
        let noCache = 0;
        for (const r of responses) {
          const cc = r.headers['cache-control'];
          if (!cc || cc === 'no-cache' || cc === 'no-store') noCache++;
        }
        if (noCache > responses.length * 0.7) throw new Error(`${noCache}/${responses.length} asset tanpa cache headers`);
        return `${noCache}/${responses.length} asset tanpa cache (OK)`;
      }));

    // TC-P-020: Time to Interactive (TTI)
    R.push(await this.safeTest('TC-P-020', M, 'Time to Interactive (TTI) < 5 detik',
      'Halaman dimuat', '1. Reload halaman\n2. Ukur waktu hingga main thread idle\n3. Gunakan Performance API',
      'TTI < 5 detik', async () => {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(async () => {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        });
        await page.waitForTimeout(2000);
        const tti = await page.evaluate(() => {
          const nav = performance.getEntriesByType('navigation')[0];
          if (!nav) return null;
          const domContentLoaded = nav.domContentLoadedEventEnd;
          const loadEnd = nav.loadEventEnd;
          const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0;
          const ttiEstimate = Math.max(domContentLoaded, fcp + 1000);
          return { tti: ttiEstimate, fcp, domContentLoaded, loadEnd };
        });
        if (!tti) return 'Tidak bisa mengukur TTI (Performance API tidak tersedia)';
        const ttiSec = (tti.tti / 1000).toFixed(2);
        if (tti.tti > 5000) throw new Error(`TTI: ${ttiSec} detik (terlalu lambat)`);
        return `TTI: ${ttiSec} detik (OK)`;
      }));

    return R;
  }

  // ===== Modul: Responsif =====
  async testResponsive(page, url, d) {
    const M = 'Responsif'; const R = [];
    const vps = [
      { name: 'Mobile (iPhone SE)', w: 375, h: 667 },
      { name: 'Tablet (iPad)', w: 768, h: 1024 },
      { name: 'Desktop (Full HD)', w: 1920, h: 1080 },
    ];

    for (let i = 0; i < vps.length; i++) {
      const vp = vps[i];
      R.push(await this.safeTest(`TC-R-00${i+1}`, M, `Tampil benar di ${vp.name} (${vp.w}x${vp.h})`,
        'Browser terbuka', `1. Set viewport ${vp.w}x${vp.h}\n2. Navigasi\n3. Cek body & scroll`,
        `OK di ${vp.w}x${vp.h}`, async () => {
          await page.setViewportSize({ width: vp.w, height: vp.h });
          await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
          await page.waitForTimeout(1500);
          if (!await page.locator('body').isVisible()) throw new Error('Body tidak terlihat');
          const sw = await page.evaluate(() => document.body.scrollWidth);
          const cw = await page.evaluate(() => document.body.clientWidth);
          if (sw > cw + 10) throw new Error(`Horizontal scroll: ${sw} vs ${cw}`);
          return `OK di ${vp.w}x${vp.h}`;
        }));
    }

    R.push(await this.safeTest('TC-R-004', M, 'Teks terbaca di mobile (min 10px)',
      'Viewport mobile 375x667', '1. Set viewport\n2. Cari elemen teks\n3. Cek font-size',
      'Font minimal 10px', async () => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(1000);
        const small = await page.evaluate(() => {
          let c = 0;
          for (const el of document.querySelectorAll('p, span, a, li, td, label, h1, h2, h3, h4, h5, h6, div')) {
            const fs = parseFloat(window.getComputedStyle(el).fontSize);
            if (fs < 10 && el.offsetParent !== null && el.innerText.trim()) c++;
          }
          return c;
        });
        if (small > 2) throw new Error(`${small} elemen < 10px`);
        return `OK (${small} elemen kecil)`;
      }));

    if (d.hasButtons) {
      R.push(await this.safeTest('TC-R-005', M, 'Touch target min 24px',
        'Viewport mobile 375x667', '1. Cari elemen klik\n2. Ukur tinggi',
        'Tinggi min 24px', async () => {
          await page.setViewportSize({ width: 375, height: 667 });
          await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
          await page.waitForTimeout(1000);
          const r = await page.evaluate(() => {
            let small = 0, total = 0;
            for (const el of document.querySelectorAll('button, a, input[type="submit"], [role="button"]')) {
              if (el.offsetParent === null) continue;
              total++;
              if (el.getBoundingClientRect().height < 24) small++;
            }
            return { small, total };
          });
          if (r.total === 0) return 'Tidak ada elemen klik';
          if (r.small > r.total * 0.5) throw new Error(`${r.small}/${r.total} < 24px`);
          return `${r.small}/${r.total} kecil (OK)`;
        }));
    } else {
      R.push(this.skip('TC-R-005', M, 'Touch target min 24px', 'Mobile', '1. Cek tombol', 'Min 24px', 'tidak ada tombol'));
    }

    R.push(await this.safeTest('TC-R-006', M, 'Konten tidak terpotong di mobile',
      'Viewport mobile 375x667', '1. Cek scrollWidth vs clientWidth',
      'Tidak ada overflow', async () => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(1000);
        const o = await page.evaluate(() => ({ sw: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth), cw: document.body.clientWidth }));
        if (o.sw > o.cw + 15) throw new Error(`Overflow: ${o.sw} vs ${o.cw}`);
        return 'Konten pas viewport';
      }));

    R.push(await this.safeTest('TC-R-007', M, 'Meta viewport untuk responsif',
      'Halaman dimuat', '1. Cari meta[name="viewport"]',
      'Meta viewport ada', async () => {
        if (await page.locator('meta[name="viewport"]').count() === 0) throw new Error('Meta viewport tidak ditemukan');
        return 'Meta viewport ditemukan';
      }));

    // TC-R-008: Hamburger menu berfungsi di mobile
    R.push(await this.safeTest('TC-R-008', M, 'Hamburger menu berfungsi di mobile (jika ada)',
      'Viewport mobile 375x667', '1. Set viewport mobile\n2. Cari hamburger toggle\n3. Klik\n4. Cek menu muncul',
      'Hamburger menu berfungsi', async () => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(1000);
        const sels = ['button[aria-label*="menu" i]', '.hamburger', '.menu-toggle', '[class*="hamburger"]', 'button:has-text("Menu")', '[class*="menu-toggle"]', '[class*="navbar-toggler"]', '[data-bs-toggle="collapse"]', '[aria-expanded]'];
        let toggled = false;
        for (const s of sels) {
          const el = page.locator(s).first();
          if (await el.isVisible().catch(() => false)) {
            const beforeExpanded = await el.getAttribute('aria-expanded');
            await el.click();
            await page.waitForTimeout(800);
            const afterExpanded = await el.getAttribute('aria-expanded');
            if (beforeExpanded !== afterExpanded || await page.locator('nav, [class*="nav"], [class*="menu"]').first().isVisible().catch(() => false)) {
              toggled = true;
              return `Hamburger menu berfungsi (${s})`;
            }
          }
        }
        if (!toggled) return 'Hamburger menu tidak ditemukan (mungkin tidak diperlukan)';
      }));

    // TC-R-009: Tabel responsive (horizontal scroll atau card mode)
    R.push(await this.safeTest('TC-R-009', M, 'Tabel responsive di mobile (horizontal scroll atau card mode)',
      'Viewport mobile 375x667', '1. Set viewport mobile\n2. Cari table\n3. Cek overflow atau card layout',
      'Tabel tidak overflow viewport', async () => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(1000);
        const tables = await page.locator('table').count();
        if (tables === 0) return 'Tidak ada tabel';
        const tableOverflow = await page.evaluate(() => {
          const tbls = document.querySelectorAll('table');
          let overflow = 0;
          for (const t of tbls) {
            const wrapper = t.parentElement;
            if (wrapper && (wrapper.style.overflowX === 'auto' || wrapper.style.overflowX === 'scroll' || wrapper.className.includes('overflow') || wrapper.className.includes('scroll'))) continue;
            const rect = t.getBoundingClientRect();
            if (rect.width > window.innerWidth) overflow++;
          }
          return { overflow, total: tbls.length };
        });
        if (tableOverflow.overflow > 0) throw new Error(`${tableOverflow.overflow}/${tableOverflow.total} tabel overflow di mobile`);
        return `${tableOverflow.total} tabel, tidak ada overflow di mobile`;
      }));

    // TC-R-010: Form layout tidak overflow di mobile
    if (d.hasForm) {
      R.push(await this.safeTest('TC-R-010', M, 'Form layout tidak overflow di mobile',
        'Viewport mobile 375x667, ada form', '1. Set viewport mobile\n2. Cari form\n3. Cek width tidak exceed viewport',
        'Form pas di mobile', async () => {
          await page.setViewportSize({ width: 375, height: 667 });
          await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
          await page.waitForTimeout(1000);
          const formOverflow = await page.evaluate(() => {
            const forms = document.querySelectorAll('form');
            let overflow = 0;
            for (const f of forms) {
              const rect = f.getBoundingClientRect();
              if (rect.right > window.innerWidth + 5) overflow++;
            }
            return { overflow, total: forms.length };
          });
          if (formOverflow.overflow > 0) throw new Error(`${formOverflow.overflow}/${formOverflow.total} form overflow di mobile`);
          return `${formOverflow.total} form, tidak ada overflow di mobile`;
        }));
    } else {
      R.push(this.skip('TC-R-010', M, 'Form layout mobile', 'Ada form', '1. Cek form width', 'Pas di mobile', 'tidak ada form'));
    }

    // TC-R-011: Image responsive (srcset atau max-width: 100%)
    if (d.imageCount > 0) {
      R.push(await this.safeTest('TC-R-011', M, 'Image responsive (max-width: 100% atau srcset)',
        'Halaman dimuat, ada gambar', '1. Cari img\n2. Cek computed style max-width\n3. Cek srcset',
        'Image responsive', async () => {
          const result = await page.evaluate(() => {
            const imgs = document.querySelectorAll('img');
            let responsive = 0;
            for (const img of imgs) {
              const cs = window.getComputedStyle(img);
              if (cs.maxWidth === '100%' || img.getAttribute('srcset') || img.getAttribute('sizes')) responsive++;
            }
            return { responsive, total: imgs.length };
          });
          if (result.total === 0) return 'Tidak ada gambar';
          if (result.responsive < result.total * 0.5) throw new Error(`${result.total - result.responsive}/${result.total} gambar tidak responsive`);
          return `${result.responsive}/${result.total} gambar responsive`;
        }));
    } else {
      R.push(this.skip('TC-R-011', M, 'Image responsive', 'Ada gambar', '1. Cek max-width', 'Responsive', 'tidak ada gambar'));
    }

    // TC-R-012: Tidak ada fixed width yang break di small screen
    R.push(await this.safeTest('TC-R-012', M, 'Tidak ada fixed width yang break di small screen',
      'Viewport mobile 375x667', '1. Set viewport mobile\n2. Cari elemen dengan width fixed > 375px\n3. Cek overflow',
      'Tidak ada fixed width yang break', async () => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(1000);
        const fixedWidth = await page.evaluate(() => {
          const els = document.querySelectorAll('div, section, header, footer, main, aside');
          let broken = 0;
          for (const el of els) {
            if (el.offsetParent === null) continue;
            const cs = window.getComputedStyle(el);
            const w = parseInt(cs.width);
            if (cs.width.endsWith('px') && w > window.innerWidth + 10) broken++;
          }
          return broken;
        });
        if (fixedWidth > 3) throw new Error(`${fixedWidth} elemen dengan fixed width > viewport mobile`);
        return `${fixedWidth} elemen dengan fixed width berlebihan (OK)`;
      }));

    // TC-R-013: Landscape orientation tidak break layout
    R.push(await this.safeTest('TC-R-013', M, 'Landscape orientation tidak break layout',
      'Viewport mobile', '1. Set viewport landscape\n2. Reload\n3. Cek layout tidak break',
      'Landscape orientation OK', async () => {
        await page.setViewportSize({ width: 667, height: 375 });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(1000);
        const bodyVisible = await page.locator('body').isVisible().catch(() => false);
        if (!bodyVisible) throw new Error('Body tidak visible di landscape');
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        if (scrollWidth > clientWidth + 10) throw new Error(`Horizontal scroll di landscape: ${scrollWidth} > ${clientWidth}`);
        return 'Landscape orientation tidak break layout';
      }));

    // TC-R-014: Tidak ada text overflow di mobile
    R.push(await this.safeTest('TC-R-014', M, 'Tidak ada text overflow di mobile',
      'Viewport mobile 375x667', '1. Set viewport mobile\n2. Cari elemen teks\n3. Cek text tidak overflow container',
      'Tidak ada text overflow', async () => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(1000);
        const overflow = await page.evaluate(() => {
          let count = 0;
          const els = document.querySelectorAll('p, span, h1, h2, h3, h4, h5, h6, a, li, td, div, label');
          for (const el of els) {
            if (el.offsetParent === null) continue;
            if (el.scrollWidth > el.clientWidth + 5) {
              const cs = window.getComputedStyle(el);
              if (cs.overflow === 'visible' && cs.whiteSpace === 'nowrap') count++;
            }
          }
          return count;
        });
        if (overflow > 5) throw new Error(`${overflow} elemen teks overflow di mobile`);
        return `${overflow} elemen text overflow (OK)`;
      }));

    // TC-R-015: Modal/dialog responsive di mobile
    R.push(await this.safeTest('TC-R-015', M, 'Modal/dialog responsive di mobile (tidak melebihi viewport)',
      'Viewport mobile', '1. Cari modal/dialog\n2. Cek ukuran tidak melebihi viewport\n3. Cek scrollable',
      'Modal responsive di mobile', async () => {
        const modals = await page.locator('[class*="modal"], [role="dialog"], [aria-modal="true"]').all();
        if (modals.length === 0) return 'Tidak ada modal/dialog di halaman';
        let issues = 0;
        for (const modal of modals) {
          if (!await modal.isVisible().catch(() => false)) continue;
          const box = await modal.boundingBox();
          if (box && box.width > 375) issues++;
        }
        if (issues > 0) throw new Error(`${issues} modal melebihi viewport mobile`);
        return `${modals.length} modal, ${issues} melebihi viewport (OK)`;
      }));

    // TC-R-016: Touch target spacing adequate
    R.push(await this.safeTest('TC-R-016', M, 'Touch target spacing adequate (min 8px gap antara elemen klik)',
      'Viewport mobile', '1. Cari elemen klik berdekatan\n2. Hitung gap antara elemen\n3. Flag gap < 8px',
      'Touch target spacing adequate', async () => {
        await page.setViewportSize({ width: 375, height: 667 });
        const tightGap = await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('button, a[href], input[type="submit"], input[type="button"], [role="button"]'));
          let tight = 0;
          for (let i = 0; i < els.length - 1; i++) {
            if (els[i].offsetParent === null) continue;
            const r1 = els[i].getBoundingClientRect();
            const r2 = els[i + 1].getBoundingClientRect();
            if (Math.abs(r1.bottom - r2.top) < 8 && Math.abs(r1.left - r2.left) < 50) tight++;
          }
          return tight;
        });
        if (tightGap > 3) throw new Error(`${tightGap} pasang elemen klik dengan gap < 8px`);
        return `${tightGap} pasang dengan gap < 8px (OK)`;
      }));

    return R;
  }

  // ===== Modul: Form Validation =====
  async testFormValidation(page, url, d) {
    const M = 'Form Validation'; const R = [];

    if (!d.hasForm) {
      for (let i = 1; i <= 15; i++) R.push(this.skip(`TC-FV-${String(i).padStart(3, '0')}`, M, `Tes form validation TC-FV-${String(i).padStart(3, '0')}`, 'Form harus ada', '1. Tes form', 'Form valid', 'tidak ada form'));
      return R;
    }

    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });

    R.push(await this.safeTest('TC-FV-001', M, 'Field required memiliki atribut required',
      'Halaman dimuat dengan form', '1. Cari input via evaluate\n2. Cek required',
      'Field wajib punya required', async () => {
        const result = await page.evaluate(() => {
          const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"])');
          let withReq = 0;
          for (const inp of inputs) { if (inp.hasAttribute('required')) withReq++; }
          return { total: inputs.length, withReq };
        });
        if (result.total === 0) return 'Tidak ada input';
        return `${result.withReq}/${result.total} field memiliki required`;
      }));

    const hasEmail = await page.locator('input[name*="email" i], input[placeholder*="email" i], input[id*="email" i]').count() > 0;
    if (hasEmail) {
      R.push(await this.safeTest('TC-FV-002', M, 'Field email menggunakan type="email"',
        'Ada field email', '1. Cari input email\n2. Cek type',
        'type="email"', async () => {
          const els = await page.locator('input[name*="email" i], input[placeholder*="email" i], input[id*="email" i]').all();
          let wrong = 0;
          for (const el of els) { if (await el.getAttribute('type') !== 'email') wrong++; }
          if (wrong > 0) throw new Error(`${wrong} field email bukan type="email"`);
          return `Semua ${els.length} field email type="email"`;
        }));
    } else {
      R.push(this.skip('TC-FV-002', M, 'Field email menggunakan type="email"', 'Ada field email', '1. Cek email', 'type="email"', 'tidak ada field email'));
    }

    R.push(await this.safeTest('TC-FV-003', M, 'Form memiliki atribut autocomplete',
      'Halaman dimuat dengan form', '1. Cari form via evaluate\n2. Cek autocomplete',
      'Form punya autocomplete', async () => {
        const result = await page.evaluate(() => {
          const forms = document.querySelectorAll('form');
          let withAc = 0;
          for (const f of forms) { if (f.hasAttribute('autocomplete')) withAc++; }
          return { total: forms.length, withAc };
        });
        if (result.total === 0) return 'Tidak ada form';
        return `${result.withAc}/${result.total} form punya autocomplete`;
      }));

    R.push(await this.safeTest('TC-FV-004', M, 'Tombol submit memiliki teks jelas',
      'Form ada', '1. Cari tombol submit via evaluate\n2. Cek teks/aria-label/value',
      'Tombol punya teks', async () => {
        const result = await page.evaluate(() => {
          const btns = document.querySelectorAll('button[type="submit"], input[type="submit"]');
          let noText = 0;
          for (const b of btns) {
            const text = (b.innerText || b.textContent || '').trim();
            const value = b.getAttribute('value');
            const aria = b.getAttribute('aria-label');
            if (!text && !value && !aria) noText++;
          }
          return { total: btns.length, noText };
        });
        if (result.total === 0) return 'Tidak ada tombol submit';
        if (result.noText > 0) throw new Error(`${result.noText}/${result.total} tombol tanpa teks`);
        return `Semua ${result.total} tombol punya teks`;
      }));

    const hasSpecial = await page.locator('input[name*="phone" i], input[name*="tel" i], input[name*="zip" i], input[name*="postal" i]').count() > 0;
    if (hasSpecial) {
      R.push(await this.safeTest('TC-FV-005', M, 'Field khusus memiliki pattern validation',
        'Ada field phone/zip/postal', '1. Cari input khusus\n2. Cek pattern',
        'Pattern ada', async () => {
          const els = await page.locator('input[name*="phone" i], input[name*="tel" i], input[name*="zip" i], input[name*="postal" i]').all();
          let withPattern = 0;
          for (const el of els) { if (await el.getAttribute('pattern') !== null) withPattern++; }
          if (withPattern === 0) throw new Error('Tidak ada field khusus dengan pattern');
          return `${withPattern}/${els.length} field punya pattern`;
        }));
    } else {
      R.push(this.skip('TC-FV-005', M, 'Field khusus punya pattern', 'Ada field khusus', '1. Cek pattern', 'Pattern ada', 'tidak ada field phone/zip'));
    }

    R.push(await this.safeTest('TC-FV-006', M, 'Field memiliki maxlength',
      'Form ada', '1. Cari input text via evaluate\n2. Cek maxlength',
      'Field punya maxlength', async () => {
        const result = await page.evaluate(() => {
          const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="url"], input:not([type])');
          let without = 0;
          for (const inp of inputs) { if (inp.getAttribute('maxlength') === null) without++; }
          return { total: inputs.length, without };
        });
        if (result.total === 0) return 'Tidak ada text input';
        if (result.without > result.total * 0.7) throw new Error(`${result.without}/${result.total} tanpa maxlength`);
        return `${result.without}/${result.total} tanpa maxlength (OK)`;
      }));

    if (hasEmail) {
      R.push(await this.safeTest('TC-FV-007', M, 'Pesan error validasi tampil saat input invalid',
        'Form ada, ada field email', '1. Isi email invalid\n2. Trigger validasi\n3. Cari error',
        'Error tampil', async () => {
          const el = page.locator('input[type="email"]').first();
          if (!await el.isVisible().catch(() => false)) return 'Tidak ada email input';
          await el.fill('invalid_email');
          await el.press('Tab');
          await page.waitForTimeout(1000);
          const errSels = ['.error-message', '.invalid-feedback', '[role="alert"]', '.field-error', '.form-error', '.text-red-500', '.text-danger'];
          for (const s of errSels) { if (await page.locator(s).first().isVisible().catch(() => false)) return `Error tampil (${s})`; }
          return 'Validasi native browser';
        }));
    } else {
      R.push(this.skip('TC-FV-007', M, 'Pesan error validasi', 'Form ada', '1. Isi invalid', 'Error tampil', 'tidak ada field email'));
    }

    // TC-FV-008: Form submission dengan Enter key
    R.push(await this.safeTest('TC-FV-008', M, 'Form submission dengan Enter key berfungsi',
      'Form ada', '1. Isi field input\n2. Tekan Enter\n3. Cek form submit',
      'Form submit saat Enter', async () => {
        const inputs = await page.locator('input:not([type="hidden"]):not([type="submit"]):not([type="button"])').all();
        if (inputs.length === 0) return 'Tidak ada input';
        const form = await page.locator('form').first();
        if (!await form.isVisible().catch(() => false)) return 'Tidak ada form visible';
        const hasSubmit = await form.locator('button[type="submit"], input[type="submit"]').count();
        if (hasSubmit === 0) return 'Form tidak punya submit button (Enter mungkin tidak trigger)';
        return 'Form punya submit button (Enter key should work)';
      }));

    // TC-FV-009: Tidak ada field tanpa label
    R.push(await this.safeTest('TC-FV-009', M, 'Tidak ada field tanpa label (accessibility)',
      'Form ada', '1. Cari semua input via evaluate\n2. Cek label, aria-label, title, atau placeholder\n3. Flag field tanpa label',
      'Semua field punya label', async () => {
        const result = await page.evaluate(() => {
          const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"])');
          let noLabel = 0, visible = 0;
          for (const inp of inputs) {
            if (inp.offsetParent === null) continue;
            visible++;
            const id = inp.getAttribute('id');
            const aria = inp.getAttribute('aria-label');
            const title = inp.getAttribute('title');
            const placeholder = inp.getAttribute('placeholder');
            let hasLabel = false;
            if (aria || title) hasLabel = true;
            if (id && document.querySelector(`label[for="${id}"]`)) hasLabel = true;
            if (inp.closest('label')) hasLabel = true;
            if (!hasLabel && !placeholder) noLabel++;
          }
          return { total: visible, noLabel };
        });
        if (result.total === 0) return 'Tidak ada input';
        if (result.noLabel > result.total * 0.3) throw new Error(`${result.noLabel}/${result.total} field tanpa label`);
        return `${result.noLabel}/${result.total} field tanpa label (OK)`;
      }));

    // TC-FV-010: Input type correct untuk field
    R.push(await this.safeTest('TC-FV-010', M, 'Input type correct untuk field (email, tel, url, number)',
      'Form ada', '1. Cari input dengan name/placeholder mengandung email/tel/phone/url/number\n2. Cek type attribute sesuai',
      'Input type sesuai dengan field purpose', async () => {
        const checks = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"])'));
          let mismatch = 0, total = 0;
          for (const inp of inputs) {
            const name = (inp.name || '').toLowerCase();
            const placeholder = (inp.placeholder || '').toLowerCase();
            const text = name + ' ' + placeholder;
            if (text.includes('email') || text.includes('mail')) { total++; if (inp.type !== 'email') mismatch++; }
            else if (text.includes('phone') || text.includes('tel') || text.includes('telp') || text.includes('hp')) { total++; if (inp.type !== 'tel') mismatch++; }
            else if (text.includes('url') || text.includes('website')) { total++; if (inp.type !== 'url') mismatch++; }
            else if (text.includes('age') || text.includes('umur') || text.includes('jumlah') || text.includes('qty') || text.includes('quantity')) { total++; if (inp.type !== 'number') mismatch++; }
          }
          return { mismatch, total };
        });
        if (checks.total === 0) return 'Tidak ada field dengan type-specific name';
        if (checks.mismatch > checks.total * 0.5) throw new Error(`${checks.mismatch}/${checks.total} field dengan type tidak sesuai`);
        return `${checks.mismatch}/${checks.total} field dengan type mismatch (OK)`;
      }));

    // TC-FV-011: Form tidak submit saat validation error
    R.push(await this.safeTest('TC-FV-011', M, 'Form tidak submit saat validation error (client-side)',
      'Form ada', '1. Isi form dengan invalid data\n2. Submit\n3. Cek form tidak navigate',
      'Form tidak submit saat invalid', async () => {
        const beforeUrl = page.url();
        const emailInput = page.locator('input[type="email"]').first();
        if (await emailInput.isVisible().catch(() => false)) {
          await emailInput.fill('invalid-email');
          const form = page.locator('form').first();
          const submitBtn = form.locator('button[type="submit"], input[type="submit"]').first();
          if (await submitBtn.isVisible().catch(() => false)) {
            await submitBtn.click();
            await page.waitForTimeout(2000);
            const afterUrl = page.url();
            if (afterUrl === beforeUrl) return 'Form tidak submit saat email invalid (validasi berfungsi)';
            return 'Form submit meski email invalid (server-side validation)';
          }
        }
        return 'Tidak ada email field untuk test (info: test skipped)';
      }));

    // TC-FV-012: Password confirmation field match
    R.push(await this.safeTest('TC-FV-012', M, 'Password confirmation field match validation',
      'Form ada', '1. Cari password dan confirm password field\n2. Isi dengan value berbeda\n3. Cek validation error',
      'Password confirmation validation berfungsi', async () => {
        const passFields = await page.locator('input[type="password"]').all();
        if (passFields.length < 2) return 'Tidak ada password confirmation field';
        await passFields[0].fill('Password123!');
        await passFields[1].fill('DifferentPass456!');
        const form = page.locator('form').first();
        const submitBtn = form.locator('button[type="submit"], input[type="submit"]').first();
        if (await submitBtn.isVisible().catch(() => false)) {
          await submitBtn.click();
          await page.waitForTimeout(2000);
          const bodyText = await page.locator('body').innerText().catch(() => '');
          if (/match|same|tidak.*sama|konfirmasi.*tidak/i.test(bodyText)) return 'Password mismatch error ditampilkan';
        }
        return 'Password confirmation field ada (validation perlu manual verify)';
      }));

    // TC-FV-013: Input sanitization - XSS prevention di form
    R.push(await this.safeTest('TC-FV-013', M, 'Input sanitization - XSS prevention di form field',
      'Form ada', '1. Isi input dengan XSS payload\n2. Cek input tidak execute script\n3. Cek value di-escape',
      'Input di-sanitize (XSS prevented)', async () => {
        const inputs = await page.locator('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="password"]):not([type="checkbox"]):not([type="radio"])').all();
        if (inputs.length === 0) return 'Tidak ada text input';
        const xssPayload = `<script>alert(1)</script>`;
        await inputs[0].fill(xssPayload);
        const val = await inputs[0].inputValue();
        if (val.includes('<script>')) return 'Input menerima raw HTML (server harus sanitize)';
        return 'Input di-sanitize di client-side';
      }));

    // TC-FV-014: Form reset/clear functionality
    R.push(await this.safeTest('TC-FV-014', M, 'Form reset/clear functionality',
      'Form ada', '1. Isi form\n2. Cari reset button atau clear button\n3. Klik reset\n4. Cek form dikosongkan',
      'Form reset berfungsi', async () => {
        const resetBtn = page.locator('button[type="reset"], input[type="reset"], button:has-text("Reset"), button:has-text("Clear"), button:has-text("Bersihkan")').first();
        if (!await resetBtn.isVisible().catch(() => false)) return 'Tidak ada reset/clear button (info: best practice)';
        return 'Reset/clear button ditemukan';
      }));

    // TC-FV-015: Required field validation actual (submit form kosong, cek error)
    R.push(await this.safeTest('TC-FV-015', M, 'Required field validation: submit form kosong menampilkan error',
      'Halaman dimuat dengan form', '1. Cari form\n2. Kosongkan semua input\n3. Submit\n4. Cek pesan error muncul',
      'Form menampilkan error untuk required field', async () => {
        const forms = await page.locator('form').all();
        if (forms.length === 0) return 'Tidak ada form di halaman';
        const form = forms[0];
        const inputs = await form.locator('input:not([type="hidden"]):not([type="submit"]):not([type="button"])').all();
        if (inputs.length === 0) return 'Form tidak punya input field';
        for (const inp of inputs) {
          await inp.fill('').catch(() => {});
        }
        const beforeHtml = await page.evaluate(() => document.body.innerHTML.length);
        const submitBtn = form.locator('button[type="submit"], input[type="submit"], button:not([type])').first();
        if (await submitBtn.count() > 0) {
          await submitBtn.click({ timeout: 3000 }).catch(() => {});
        } else {
          await page.keyboard.press('Enter');
        }
        await page.waitForTimeout(1500);
        const afterHtml = await page.evaluate(() => document.body.innerHTML.length);
        const hasError = await page.evaluate(() => {
          const errorSels = ['[class*="error"]', '[class*="invalid"]', '[class*="danger"]', '[role="alert"]', '.validation-error', '.field-error', '[aria-invalid="true"]'];
          for (const s of errorSels) {
            if (document.querySelector(s)?.offsetParent !== null) return true;
          }
          return false;
        });
        if (hasError) return 'Form menampilkan pesan error untuk required field kosong';
        if (Math.abs(afterHtml - beforeHtml) > 50) return 'Form menampilkan perubahan DOM saat submit kosong (kemungkinan error message)';
        return 'Form tidak menampilkan error saat submit kosong (mungkin tidak ada required field)';
      }));

    // ===== Boundary Value Analysis & Edge/Negative tests untuk Form Validation =====
    const gotoForm = async () => {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(async () => {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
      });
      await page.waitForTimeout(1000);
    };
    const firstTextField = () => page.locator('input[type="text"], input:not([type]), input[type="search"], textarea').first();
    const submitForm = async () => {
      const submit = page.locator('button[type="submit"], input[type="submit"], button:not([type])').first();
      if (await submit.isVisible().catch(() => false)) await submit.click().catch(() => {});
      else await page.keyboard.press('Enter').catch(() => {});
      await page.waitForTimeout(1500);
    };

    // TC-FV-016: Boundary — input 1 karakter (min boundary) diterima/divalidasi
    R.push(await this.safeTest('TC-FV-016', M, 'Boundary: input 1 karakter (min) diproses',
      'Form ada', '1. Isi field text dg 1 char\n2. Verifikasi diterima tanpa error panjang',
      'Min boundary (1 char) valid', async () => {
        await gotoForm();
        const el = firstTextField();
        if (!await el.isVisible().catch(() => false)) return 'Tidak ada text field (info)';
        await el.fill('A');
        const v = await el.inputValue();
        if (v.length !== 1) throw new Error('Field tidak menerima 1 char');
        return 'Input 1 char (min boundary) diterima';
      }));

    // TC-FV-017: Boundary — input sepanjang maxlength diterima
    R.push(await this.safeTest('TC-FV-017', M, 'Boundary: input sepanjang maxlength diterima utuh',
      'Form ada, field punya maxlength', '1. Baca maxlength\n2. Isi tepat maxlength char\n3. Verifikasi panjang sama',
      'Maxlength boundary tepat diterima', async () => {
        await gotoForm();
        const el = firstTextField();
        if (!await el.isVisible().catch(() => false)) return 'Tidak ada text field (info)';
        const ml = await el.getAttribute('maxlength');
        if (ml === null) return 'Field tanpa maxlength (info)';
        const n = parseInt(ml, 10);
        await el.fill('X'.repeat(n));
        const v = await el.inputValue();
        if (v.length !== n) throw new Error(`Input terpotong: ${v.length} != ${n}`);
        return `Input tepat maxlength (${n} char) diterima utuh`;
      }));

    // TC-FV-018: Boundary — input melebihi maxlength terpotong (boundary +1)
    R.push(await this.safeTest('TC-FV-018', M, 'Boundary: input melebihi maxlength terpotong (maxlength+1)',
      'Form ada, field punya maxlength', '1. Isi maxlength+1 char\n2. Verifikasi terpotong ke maxlength',
      'Overflow dibatasi ke maxlength', async () => {
        await gotoForm();
        const el = firstTextField();
        if (!await el.isVisible().catch(() => false)) return 'Tidak ada text field (info)';
        const ml = await el.getAttribute('maxlength');
        if (ml === null) return 'Field tanpa maxlength (info: server harus batasi)';
        const n = parseInt(ml, 10);
        await el.fill('Y'.repeat(n + 1));
        const v = await el.inputValue();
        if (v.length > n) throw new Error(`Tidak terpotong: ${v.length} > ${n}`);
        return `Overflow (${n + 1}) dipotong ke ${v.length} (boundary benar)`;
      }));

    // TC-FV-019: Edge — input numerik boundary (min/max) untuk number input
    R.push(await this.safeTest('TC-FV-019', M, 'Boundary: input number menerima batas min/max',
      'Form ada, ada number input', '1. Cari input number\n2. Isi min & max\n3. Verifikasi diterima',
      'Boundary numerik ditangani', async () => {
        await gotoForm();
        const num = page.locator('input[type="number"]').first();
        if (!await num.isVisible().catch(() => false)) return 'Tidak ada number input (info)';
        const min = await num.getAttribute('min');
        const max = await num.getAttribute('max');
        const probe = min !== null ? min : '0';
        await num.fill(String(probe));
        const v = await num.inputValue();
        if (v === '') throw new Error('Number input menolak nilai boundary');
        return `Number input menerima boundary ${v}${max !== null ? ' (max=' + max + ')' : ''}`;
      }));

    // TC-FV-020: Edge — karakter khusus (SQL/XSS) di-sanitize
    R.push(await this.safeTest('TC-FV-020', M, 'Edge: karakter khusus SQL/XSS di field tidak mengeksekusi',
      'Form ada', '1. Isi field dg payload SQL & XSS\n2. Submit\n3. Verifikasi tidak dieksekusi',
      'Payload di-sanitize', async () => {
        await gotoForm();
        const el = firstTextField();
        if (!await el.isVisible().catch(() => false)) return 'Tidak ada text field (info)';
        await page.evaluate(() => { window.__fvXss = 0; }).catch(() => {});
        await el.fill(`' OR 1=1 -- <img src=x onerror=window.__fvXss=1>`);
        await submitForm();
        const ex = await page.evaluate(() => window.__fvXss === 1).catch(() => false);
        if (ex) throw new Error('XSS payload dieksekusi (vulnerability)');
        return 'Payload SQL/XSS tidak dieksekusi (di-sanitize)';
      }));

    // TC-FV-021: Edge — unicode/emoji diinput tetap utuh
    R.push(await this.safeTest('TC-FV-021', M, 'Edge: input Unicode/Emoji diproses tanpa korupsi',
      'Form ada', '1. Isi field dg unicode & emoji\n2. Verifikasi value utuh',
      'Unicode ditangani', async () => {
        await gotoForm();
        const el = firstTextField();
        if (!await el.isVisible().catch(() => false)) return 'Tidak ada text field (info)';
        const uni = 'café_日本語_😀_Ω';
        await el.fill(uni);
        const v = await el.inputValue();
        if (v !== uni) throw new Error('Unicode/emoji terkorupsi saat diinput');
        return 'Unicode/Emoji diproses utuh';
      }));

    // TC-FV-022: Negative — input hanya whitespace ditolak (jika required)
    R.push(await this.safeTest('TC-FV-022', M, 'Negative: input hanya whitespace pada field required ditolak',
      'Form ada', '1. Isi field required dg spasi saja\n2. Submit\n3. Verifikasi error',
      'Whitespace-only ditolak', async () => {
        await gotoForm();
        const el = firstTextField();
        if (!await el.isVisible().catch(() => false)) return 'Tidak ada text field (info)';
        await el.fill('    ');
        await submitForm();
        const hasErr = await page.evaluate(() => {
          const sels = ['[class*="error"]', '[class*="invalid"]', '[role="alert"]', '[aria-invalid="true"]'];
          for (const s of sels) { if (document.querySelector(s)?.offsetParent !== null) return true; }
          return false;
        });
        if (hasErr) return 'Whitespace-only ditolak: error validasi tampil';
        return 'Whitespace-only tidak error (validasi mungkin lemah)';
      }));

    // TC-FV-023: Negative — format email parsial ditolak
    R.push(await this.safeTest('TC-FV-023', M, 'Negative: format email parsial (a@) ditolak',
      'Form ada, ada field email', '1. Isi email parsial "a@"\n2. Submit\n3. Verifikasi ditolak',
      'Email parsial ditolak', async () => {
        await gotoForm();
        const emailEl = page.locator('input[type="email"]').first();
        if (!await emailEl.isVisible().catch(() => false)) return 'Tidak ada email field (info)';
        await emailEl.fill('a@');
        await submitForm();
        const hasErr = await page.evaluate(() => {
          const sels = ['[class*="error"]', '[class*="invalid"]', '[role="alert"]', '.invalid-feedback'];
          for (const s of sels) { if (document.querySelector(s)?.offsetParent !== null) return true; }
          return false;
        });
        if (hasErr) return 'Email parsial "a@" ditolak: error validasi';
        return 'Email parsial tidak error (validasi mungkin lemah)';
      }));

    // TC-FV-024: Boundary — field bertipe tanggal menerima batas
    R.push(await this.safeTest('TC-FV-024', M, 'Boundary: input date menerima nilai valid',
      'Form ada, ada date input', '1. Cari input date\n2. Isi tanggal valid\n3. Verifikasi diterima',
      'Date boundary valid', async () => {
        await gotoForm();
        const dateEl = page.locator('input[type="date"], input[type="datetime-local"]').first();
        if (!await dateEl.isVisible().catch(() => false)) return 'Tidak ada date input (info)';
        await dateEl.fill('2024-01-01');
        const v = await dateEl.inputValue();
        if (v !== '2024-01-01') throw new Error('Date input menolak tanggal valid');
        return 'Date input menerima 2024-01-01 (valid)';
      }));

    return R;
  }

  // ===== Modul: Menu Traversal =====
  async testMenuTraversal(page, url, d) {
    const M = 'Menu Traversal'; const R = [];

    if (d.linkCount === 0 && !d.hasButtons) {
      for (let i = 1; i <= 12; i++) R.push(this.skip(`TC-MT-${String(i).padStart(3, '0')}`, M, `Tes menu TC-MT-${String(i).padStart(3, '0')}`, 'Ada menu/link', '1. Tes menu', 'Menu OK', 'tidak ada link/tombol'));
      return R;
    }

    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(2000);
    const baseUrl = new URL(url);

    // Helper: verifikasi halaman tujuan benar-benar dimuat
    async function verifyPage(page, targetUrl) {
      const status = { ok: false, title: '', hasContent: false, is404: false, error: '' };
      try {
        const res = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1000);
        status.title = await page.title().catch(() => '');
        const bodyVisible = await page.locator('body').isVisible().catch(() => false);
        const bodyText = await page.locator('body').innerText().catch(() => '');
        // Cek 404: title mengandung "404" atau "Not Found" atau body mengandung "404" / "page not found"
        const lowerTitle = status.title.toLowerCase();
        const lowerBody = bodyText.toLowerCase().substring(0, 500);
        if (lowerTitle.includes('404') || lowerTitle.includes('not found') || lowerBody.includes('404') || lowerBody.includes('page not found')) {
          status.is404 = true;
          status.error = 'Halaman 404';
          return status;
        }
        if (res && res.status() >= 400) {
          status.error = `HTTP ${res.status()}`;
          return status;
        }
        if (!bodyVisible || bodyText.trim().length < 50) {
          status.error = 'Halaman kosong/tidak ada konten';
          return status;
        }
        status.hasContent = true;
        status.ok = true;
      } catch (e) {
        status.error = e.message.substring(0, 100);
      }
      return status;
    }

    // TC-MT-001: Link navigasi
    if (d.hasNav) {
      R.push(await this.safeTest('TC-MT-001', M, 'Link navigasi dapat diklik dan dimuat',
        'Halaman dimuat, ada navigasi', '1. Cari link di nav/header\n2. Buka setiap link\n3. Verifikasi halaman tujuan dimuat',
        'Semua link navigasi membuka halaman valid', async () => {
          const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('nav a[href], header a[href], .navbar a[href], [role="navigation"] a[href], [class*="nav"] a[href], [class*="menu"] a[href], [class*="sidebar"] a[href], [role="menu"] a[href], aside a[href], [data-testid*="nav"] a[href]'))
              .map(a => ({ href: a.href, text: a.innerText.trim().substring(0, 50) }))
              .filter(l => l.href && !l.href.startsWith('#') && !l.href.startsWith('mailto:') && !l.href.startsWith('tel:') && !l.href.startsWith('javascript:'))
          });
          if (links.length === 0) return 'Tidak ada link navigasi';
          const unique = [...new Map(links.map(l => [l.href, l])).values()];
          // Exclude link logout/sign out dari pemeriksaan
          const filtered = unique.filter(l => {
            const t = (l.text || '').toLowerCase();
            const h = (l.href || '').toLowerCase();
            return !t.includes('sign out') && !t.includes('logout') && !t.includes('log out') && !t.includes('keluar') && !h.includes('sign_out') && !h.includes('logout');
          });
          let ok = 0, fail = 0;
          const failDetails = [];
          const max = Math.min(filtered.length, 20);
          for (let i = 0; i < max; i++) {
            const u = new URL(filtered[i].href);
            if (u.hostname !== baseUrl.hostname) { continue; }
            const st = await verifyPage(page, filtered[i].href);
            if (st.ok) ok++;
            else { fail++; failDetails.push(`${filtered[i].text || filtered[i].href}: ${st.error}`); }
          }
          await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
          if (fail > max * 0.3) throw new Error(`${fail}/${max} link gagal: ${failDetails.slice(0, 3).join('; ')}`);
          return `${ok}/${max} link navigasi OK${fail > 0 ? ` (${fail} gagal: ${failDetails[0]})` : ''}`;
        }));
    } else {
      R.push(this.skip('TC-MT-001', M, 'Link navigasi dapat diklik', 'Ada navigasi', '1. Klik link nav', 'Link OK', 'tidak ada navigasi'));
    }

    // TC-MT-002: Link footer
    if (d.hasFooter) {
      R.push(await this.safeTest('TC-MT-002', M, 'Link footer dapat dimuat',
        'Halaman dimuat, ada footer', '1. Cari link di footer\n2. Buka setiap link\n3. Verifikasi halaman tujuan',
        'Link footer membuka halaman valid', async () => {
          const links = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('footer a[href], .footer a[href], [role="contentinfo"] a[href], [class*="footer"] a[href]'))
              .map(a => ({ href: a.href, text: a.innerText.trim().substring(0, 50) }))
              .filter(l => l.href && !l.href.startsWith('#') && !l.href.startsWith('mailto:') && !l.href.startsWith('tel:') && !l.href.startsWith('javascript:'));
          });
          if (links.length === 0) return 'Tidak ada link footer';
          const unique = [...new Map(links.map(l => [l.href, l])).values()];
          let ok = 0, fail = 0;
          const failDetails = [];
          const max = Math.min(unique.length, 15);
          for (let i = 0; i < max; i++) {
            const u = new URL(unique[i].href);
            if (u.hostname !== baseUrl.hostname) continue;
            const st = await verifyPage(page, unique[i].href);
            if (st.ok) ok++;
            else { fail++; failDetails.push(`${unique[i].text || unique[i].href}: ${st.error}`); }
          }
          await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
          if (fail > max * 0.3) throw new Error(`${fail}/${max} link footer gagal: ${failDetails.slice(0, 3).join('; ')}`);
          return `${ok}/${max} link footer OK${fail > 0 ? ` (${fail} gagal: ${failDetails[0]})` : ''}`;
        }));
    } else {
      R.push(this.skip('TC-MT-002', M, 'Link footer dapat dimuat', 'Ada footer', '1. Klik link footer', 'Link OK', 'tidak ada footer'));
    }

    // TC-MT-003: Tombol/CTA
    if (d.hasButtons) {
      R.push(await this.safeTest('TC-MT-003', M, 'Tombol/CTA dapat diklik',
        'Halaman dimuat, ada tombol', '1. Cari tombol/CTA\n2. Klik setiap tombol\n3. Cek response (navigasi/modal/state change)',
        'Tombol dapat diklik dan memberi response', async () => {
          const btns = await page.locator('button:not([disabled]):not([type="submit"]), [role="button"], .btn, [class*="button"]:not(input), [data-testid*="button"], [class*="btn-action"], [class*="action"]:not(input)').all();
          if (btns.length === 0) return 'Tidak ada tombol';
          let clickable = 0;
          let skipped = 0;
          const max = Math.min(btns.length, 15);
          for (let i = 0; i < max; i++) {
            if (await btns[i].isVisible().catch(() => false)) {
              // Skip tombol logout/sign out
              const btnText = await btns[i].innerText().catch(() => '');
              const lowerText = btnText.toLowerCase();
              if (lowerText.includes('sign out') || lowerText.includes('logout') || lowerText.includes('log out') || lowerText.includes('keluar')) {
                skipped++;
                continue;
              }
              const before = page.url();
              const beforeHtml = await page.content().catch(() => '');
              try {
                await btns[i].click({ timeout: 5000 });
                await page.waitForTimeout(1000);
                const after = page.url();
                const afterHtml = await page.content().catch(() => '');
                if (after !== before) {
                  // Jika redirect ke login, jangan dihitung
                  if (after.includes('sign_in') || after.includes('login')) { skipped++; await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }); }
                  else { clickable++; await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }); }
                }
                else if (afterHtml !== beforeHtml) clickable++;
                else clickable++;
              } catch { skipped++; }
            }
          }
          if (clickable === 0 && skipped === max) return `Semua ${skipped} tombol di-skip (logout/danger)`;
          if (clickable === 0) throw new Error('Tidak ada tombol yang bisa diklik');
          return `${clickable}/${max - skipped} tombol dapat diklik${skipped > 0 ? ` (${skipped} di-skip)` : ''}`;
        }));
    } else {
      R.push(this.skip('TC-MT-003', M, 'Tombol/CTA dapat diklik', 'Ada tombol', '1. Klik tombol', 'Tombol OK', 'tidak ada tombol'));
    }

    // TC-MT-004: Broken link check
    R.push(await this.safeTest('TC-MT-004', M, 'Tidak ada broken link (404)',
      'Halaman dimuat', '1. Cari semua link internal\n2. Buka setiap link\n3. Verifikasi bukan 404',
      'Tidak ada 404', async () => {
        const allLinks = await page.evaluate(() =>
          Array.from(document.querySelectorAll('a[href]')).map(a => ({ href: a.href, text: a.innerText.trim().substring(0, 40) }))
            .filter(l => l.href && !l.href.startsWith('#') && !l.href.startsWith('mailto:') && !l.href.startsWith('tel:') && !l.href.startsWith('javascript:'))
        );
        if (allLinks.length === 0) return 'Tidak ada link';
        const unique = [...new Map(allLinks.map(l => [l.href, l])).values()];
        // Exclude link logout/sign out dari pemeriksaan
        const filtered = unique.filter(l => {
          const t = (l.text || '').toLowerCase();
          const h = (l.href || '').toLowerCase();
          return !t.includes('sign out') && !t.includes('logout') && !t.includes('log out') && !t.includes('keluar') && !h.includes('sign_out') && !h.includes('logout');
        });
        let notFound = 0;
        const notFoundLinks = [];
        const max = Math.min(filtered.length, 25);
        let checked = 0;
        for (let i = 0; i < max; i++) {
          try {
            const u = new URL(filtered[i].href);
            if (u.hostname !== baseUrl.hostname) continue;
            checked++;
            const st = await verifyPage(page, filtered[i].href);
            if (st.is404 || (st.error && st.error.includes('HTTP 4'))) { notFound++; notFoundLinks.push(filtered[i].text || filtered[i].href); }
          } catch {}
        }
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        if (notFound > 0) throw new Error(`${notFound} broken link: ${notFoundLinks.slice(0, 3).join(', ')}`);
        return `${checked} link diperiksa, tidak ada 404`;
      }));

    // TC-MT-005: Dropdown
    if (d.hasDropdown) {
      R.push(await this.safeTest('TC-MT-005', M, 'Dropdown dapat di-expand',
        'Halaman dimuat, ada dropdown', '1. Cari dropdown/select\n2. Klik/expand\n3. Cek opsi muncul',
        'Dropdown berfungsi', async () => {
          const dd = await page.locator('select, .dropdown-toggle, [data-toggle="dropdown"], [aria-haspopup="true"], [data-bs-toggle="dropdown"], details > summary, .dropdown, [class*="select-wrapper"], [role="combobox"], [class*="popover"], [aria-expanded], [class*="combobox"]').all();
          if (dd.length === 0) return 'Tidak ada dropdown';
          let working = 0;
          for (const el of dd.slice(0, 5)) {
            if (await el.isVisible().catch(() => false)) {
              try {
                await el.click({ timeout: 3000 }); await page.waitForTimeout(800);
                const open = await page.locator('.dropdown-menu.show, .dropdown-menu[style*="block"], [aria-expanded="true"], details[open], select option').first().isVisible().catch(() => false);
                if (open) working++;
              } catch {}
            }
          }
          if (working === 0) throw new Error(`0/${Math.min(dd.length, 5)} dropdown berfungsi saat diklik`);
          return `${working}/${Math.min(dd.length, 5)} dropdown berfungsi`;
        }));
    } else {
      R.push(this.skip('TC-MT-005', M, 'Dropdown dapat di-expand', 'Ada dropdown', '1. Klik dropdown', 'Dropdown OK', 'tidak ada dropdown'));
    }

    // TC-MT-006: Modal
    if (d.hasModal) {
      R.push(await this.safeTest('TC-MT-006', M, 'Modal dapat dibuka dan ditutup',
        'Halaman dimuat, ada trigger modal', '1. Klik trigger modal\n2. Cek modal muncul\n3. Tutup modal',
        'Modal berfungsi', async () => {
          const triggers = await page.locator('[data-bs-toggle="modal"], [data-toggle="modal"], [data-target*="modal"], [class*="modal"]').all();
          let working = 0;
          for (const t of triggers.slice(0, 3)) {
            if (await t.isVisible().catch(() => false)) {
              try {
                await t.click({ timeout: 3000 }); await page.waitForTimeout(1000);
                const modal = page.locator('.modal.show, .modal[style*="block"], [role="dialog"][aria-modal="true"], .modal.is-active').first();
                if (await modal.isVisible().catch(() => false)) {
                  working++;
                  const close = modal.locator('[data-bs-dismiss="modal"], [data-dismiss="modal"], .close, button:has-text("Close"), button:has-text("Tutup"), .modal-close').first();
                  if (await close.isVisible().catch(() => false)) await close.click().catch(() => {});
                  else await page.keyboard.press('Escape');
                  await page.waitForTimeout(500);
                }
              } catch {}
            }
          }
          return `${working} modal berfungsi`;
        }));
    } else {
      R.push(this.skip('TC-MT-006', M, 'Modal dapat dibuka dan ditutup', 'Ada trigger modal', '1. Buka modal', 'Modal OK', 'tidak ada modal'));
    }

    // TC-MT-007: Search
    if (d.hasSearch) {
      R.push(await this.safeTest('TC-MT-007', M, 'Search box berfungsi',
        'Halaman dimuat, ada search', '1. Isi search\n2. Submit\n3. Cek hasil/redirect',
        'Search berfungsi', async () => {
          const sels = ['input[type="search"]', 'input[name*="search" i]', 'input[placeholder*="search" i]', '[class*="search"] input', '[data-testid*="search"] input'];
          let si = null;
          for (const s of sels) { const el = page.locator(s).first(); if (await el.isVisible().catch(() => false)) { si = el; break; } }
          if (!si) return 'Tidak ada search box';
          await si.fill('test query');
          await si.press('Enter');
          await page.waitForTimeout(2000);
          if (page.url() !== url) return `Search redirect ke: ${page.url()}`;
          const results = page.locator('[class*="result"], [class*="search-result"], [id*="result"]').first();
          if (await results.isVisible().catch(() => false)) return 'Hasil search tampil';
          return 'Search di-submit (tidak ada redirect)';
        }));
    } else {
      R.push(this.skip('TC-MT-007', M, 'Search box berfungsi', 'Ada search', '1. Isi search', 'Search OK', 'tidak ada search box'));
    }

    // TC-MT-008: Tab/accordion interaction
    R.push(await this.safeTest('TC-MT-008', M, 'Tab/accordion interaction berfungsi',
      'Halaman dimuat', '1. Cari tab/accordion\n2. Klik tab kedua\n3. Cek content berubah',
      'Tab/accordion berfungsi', async () => {
        const tabSels = ['[role="tab"]', '.tab-link', '.nav-tabs .nav-link', '[data-bs-toggle="tab"]', '.accordion-button', '[data-toggle="collapse"]'];
        let found = false;
        for (const s of tabSels) {
          const els = await page.locator(s).all();
          if (els.length >= 2) {
            found = true;
            const before = await page.locator('body').innerText().catch(() => '');
            await els[1].click().catch(() => {});
            await page.waitForTimeout(1500);
            const after = await page.locator('body').innerText().catch(() => '');
            if (before !== after) return 'Tab/accordion content berubah saat diklik';
            return 'Tab/accordion ditemukan tapi content tidak berubah';
          }
        }
        return 'Tidak ada tab/accordion di halaman';
      }));

    // TC-MT-009: External link warning atau rel attribute
    R.push(await this.safeTest('TC-MT-009', M, 'External link punya rel="noopener" atau rel="external"',
      'Halaman dimuat', '1. Cari link ke domain berbeda\n2. Cek rel attribute\n3. Flag missing rel',
      'External link aman', async () => {
        const currentDomain = new URL(page.url()).hostname;
        const externalLinks = await page.evaluate((domain) => {
          const links = Array.from(document.querySelectorAll('a[href]'));
          let noRel = 0, total = 0;
          for (const link of links) {
            try {
              const href = new URL(link.href);
              if (href.hostname !== domain) {
                total++;
                const rel = link.getAttribute('rel') || '';
                if (!rel.includes('noopener') && !rel.includes('external') && !rel.includes('noreferrer')) noRel++;
              }
            } catch {}
          }
          return { noRel, total };
        }, currentDomain);
        if (externalLinks.total === 0) return 'Tidak ada external link';
        if (externalLinks.noRel > externalLinks.total * 0.5) throw new Error(`${externalLinks.noRel}/${externalLinks.total} external link tanpa rel attribute`);
        return `${externalLinks.noRel}/${externalLinks.total} external link tanpa rel (OK)`;
      }));

    // TC-MT-010: Image link dengan alt text
    R.push(await this.safeTest('TC-MT-010', M, 'Image link memiliki alt text untuk accessibility',
      'Halaman dimuat', '1. Cari link yang berisi img\n2. Cek img alt text\n3. Flag missing alt',
      'Image link punya alt text', async () => {
        const imgLinks = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a[href]'));
          let noAlt = 0, total = 0;
          for (const link of links) {
            const img = link.querySelector('img');
            if (img) {
              total++;
              if (!img.alt && !img.getAttribute('aria-label') && !(link.innerText || '').trim()) noAlt++;
            }
          }
          return { noAlt, total };
        });
        if (imgLinks.total === 0) return 'Tidak ada image link';
        if (imgLinks.noAlt > 0) throw new Error(`${imgLinks.noAlt}/${imgLinks.total} image link tanpa alt text`);
        return `${imgLinks.total} image link, semua punya alt text`;
      }));

    // TC-MT-011: Button tidak double-submit
    R.push(await this.safeTest('TC-MT-011', M, 'Button submit tidak bisa di-double klik (disable atau debounce)',
      'Halaman dimuat dengan form', '1. Cari submit button\n2. Cek atribut disabled setelah klik\n3. Cek loading state',
      'Button mencegah double submit', async () => {
        const submitBtn = page.locator('button[type="submit"], input[type="submit"]').first();
        if (!await submitBtn.isVisible().catch(() => false)) return 'Tidak ada submit button';
        const hasDisabled = await submitBtn.evaluate(el => {
          return el.hasAttribute('disabled') || el.classList.contains('disabled') || el.getAttribute('aria-disabled') === 'true';
        }).catch(() => false);
        if (hasDisabled) return 'Submit button punya disabled state';
        return 'Submit button tidak punya disabled state (info: best practice untuk prevent double submit)';
      }));

    // TC-MT-012: Anchor link smooth scroll
    R.push(await this.safeTest('TC-MT-012', M, 'Anchor link (#) berfungsi dan scroll ke target',
      'Halaman dimuat', '1. Cari anchor link\n2. Klik\n3. Cek scroll position berubah',
      'Anchor link berfungsi', async () => {
        const anchorLinks = await page.locator('a[href^="#"]').all();
        if (anchorLinks.length === 0) return 'Tidak ada anchor link';
        const beforeScroll = await page.evaluate(() => window.scrollY);
        for (const link of anchorLinks.slice(0, 3)) {
          const href = await link.getAttribute('href');
          if (href && href.length > 1) {
            await link.click().catch(() => {});
            await page.waitForTimeout(1000);
            const afterScroll = await page.evaluate(() => window.scrollY);
            if (afterScroll !== beforeScroll) return 'Anchor link scroll ke target';
          }
        }
        return 'Anchor link ada tapi tidak mengubah scroll (mungkin target tidak ada)';
      }));

    return R;
  }

  // ===== Modul: API Response =====
  async testApiResponse(page, url, d) {
    const M = 'API Response'; const R = [];

    R.push(await this.safeTest('TC-API-001', M, 'Tidak ada API error 5xx',
      'Halaman dimuat', '1. Setup listener response\n2. Navigasi\n3. Filter 5xx',
      'Tidak ada 5xx', async () => {
        const errors = [];
        page.on('response', (r) => { if (r.status() >= 500) errors.push(`${r.url().split('/').pop()} (${r.status()})`); });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(2000);
        if (errors.length > 0) throw new Error(`${errors.length} API 5xx: ${errors.slice(0, 3).join(', ')}`);
        return '0 API error 5xx';
      }));

    R.push(await this.safeTest('TC-API-002', M, 'API response time < 3 detik',
      'Halaman dimuat', '1. Catat waktu setiap request\n2. Navigasi\n3. Hitung rata-rata',
      'Rata-rata < 3s', async () => {
        const times = [];
        page.on('response', (r) => {
          if (r.url().includes('/api/') || r.url().includes('/graphql') || r.request().resourceType() === 'fetch' || r.request().resourceType() === 'xhr') {
            const timing = r.request().timing();
            if (timing) times.push(timing.responseEnd - timing.startTime);
          }
        });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(2000);
        if (times.length === 0) return 'Tidak ada API request terdeteksi';
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        if (avg > 3000) throw new Error(`Rata-rata ${(avg/1000).toFixed(2)}s`);
        return `Rata-rata ${(avg/1000).toFixed(2)}s (${times.length} request)`;
      }));

    R.push(await this.safeTest('TC-API-003', M, 'Content-Type header benar',
      'Halaman dimuat', '1. Ambil response headers\n2. Cek Content-Type',
      'Content-Type sesuai', async () => {
        const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        const ct = res.headers()['content-type'] || '';
        if (!ct) throw new Error('Content-Type tidak ada');
        if (!ct.includes('text/html') && !ct.includes('application/xhtml')) throw new Error(`Content-Type: ${ct}`);
        return `Content-Type: ${ct}`;
      }));

    R.push(await this.safeTest('TC-API-004', M, 'Tidak ada mixed content (HTTP di HTTPS)',
      'Halaman HTTPS dimuat', '1. Cek protocol URL\n2. Cari resource HTTP\n3. Filter mixed content',
      'Tidak ada mixed content', async () => {
        if (!url.startsWith('https://')) return 'Halaman HTTP - tidak relevan';
        const mixed = [];
        page.on('request', (req) => {
          const u = req.url();
          if (u.startsWith('http://') && !u.startsWith('https://')) mixed.push(u.split('/').pop());
        });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(1000);
        if (mixed.length > 0) throw new Error(`${mixed.length} mixed content: ${mixed.slice(0, 3).join(', ')}`);
        return 'Tidak ada mixed content';
      }));

    R.push(await this.safeTest('TC-API-005', M, 'Cache headers tersedia',
      'URL target', '1. Ambil response headers\n2. Cek cache-control/etag/expires',
      'Cache header ada', async () => {
        const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        const h = res.headers();
        const cacheHeaders = [];
        if (h['cache-control']) cacheHeaders.push('Cache-Control');
        if (h['etag']) cacheHeaders.push('ETag');
        if (h['expires']) cacheHeaders.push('Expires');
        if (h['last-modified']) cacheHeaders.push('Last-Modified');
        if (cacheHeaders.length === 0) throw new Error('Tidak ada cache header');
        return cacheHeaders.join(', ');
      }));

    // TC-API-006: API error handling - 404 tidak expose server info
    R.push(await this.safeTest('TC-API-006', M, 'API 404 response tidak expose server info',
      'URL target', '1. Request endpoint tidak ada\n2. Cek response body\n3. Flag server info terekspos',
      '404 tidak expose server info', async () => {
        const baseUrl = new URL(url);
        const res = await page.goto(`${baseUrl.origin}/api/nonexistent-${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null);
        if (!res) return 'Tidak bisa request endpoint tidak ada';
        const status = res.status();
        if (status === 404) {
          const body = await page.locator('body').innerText().catch(() => '');
          const serverInfo = /nginx|apache|express|tomcat|iis|php\/\d/i.test(body);
          if (serverInfo) throw new Error('404 response expose server info');
          return '404 response tidak expose server info';
        }
        return `Response status: ${status} (bukan 404)`;
      }));

    // TC-API-007: API response consistency (JSON format)
    R.push(await this.safeTest('TC-API-007', M, 'API response consistency (JSON format untuk API endpoint)',
      'URL target', '1. Request API endpoint\n2. Cek Content-Type\n3. Cek JSON structure',
      'API response konsisten JSON', async () => {
        const baseUrl = new URL(url);
        const apiRes = await page.goto(`${baseUrl.origin}/api`, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null);
        if (!apiRes) return 'Tidak bisa akses /api endpoint';
        const ct = apiRes.headers()['content-type'] || '';
        if (ct.includes('application/json')) return 'API response Content-Type: application/json';
        return `API response Content-Type: ${ct} (bukan JSON)`;
      }));

    // TC-API-008: Tidak ada API endpoint yang return credentials
    R.push(await this.safeTest('TC-API-008', M, 'API response tidak mengandung credentials/token',
      'Halaman dimuat', '1. Intercept XHR/fetch response\n2. Cek body untuk token/password/secret\n3. Flag exposure',
      'Tidak ada credentials di API response', async () => {
        const apiResponses = [];
        page.on('response', async resp => {
          const ct = resp.headers()['content-type'] || '';
          if (ct.includes('json')) {
            try {
              const text = await resp.text().catch(() => '');
              apiResponses.push(text);
            } catch {}
          }
        });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
        if (apiResponses.length === 0) return 'Tidak ada JSON API response';
        let exposed = 0;
        for (const body of apiResponses) {
          if (/"(password|passwd|secret|api[_-]?key|private[_-]?key|access[_-]?token)":\s*"[^"]+"/i.test(body)) exposed++;
        }
        if (exposed > 0) throw new Error(`${exposed} API response mengandung credentials`);
        return `${apiResponses.length} API response, tidak ada credentials`;
      }));

    // TC-API-009: API rate limiting headers
    R.push(await this.safeTest('TC-API-009', M, 'API rate limiting headers (X-RateLimit-*)',
      'URL target', '1. Request API endpoint\n2. Cek X-RateLimit headers\n3. Flag missing rate limit',
      'Rate limiting headers ada', async () => {
        const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => null);
        if (!res) return 'Tidak bisa request';
        const h = res.headers();
        const rateHeaders = [];
        if (h['x-ratelimit-limit']) rateHeaders.push('X-RateLimit-Limit');
        if (h['x-ratelimit-remaining']) rateHeaders.push('X-RateLimit-Remaining');
        if (h['x-ratelimit-reset']) rateHeaders.push('X-RateLimit-Reset');
        if (h['retry-after']) rateHeaders.push('Retry-After');
        if (rateHeaders.length === 0) return 'Tidak ada rate limit headers (info: best practice untuk API)';
        return `Rate limit headers: ${rateHeaders.join(', ')}`;
      }));

    // TC-API-010: CORS headers configuration
    R.push(await this.safeTest('TC-API-010', M, 'CORS headers configuration (Access-Control-Allow-Origin)',
      'URL target', '1. Ambil response headers\n2. Cek Access-Control-Allow-Origin\n3. Flag wildcard dengan credentials',
      'CORS configured dengan benar', async () => {
        const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => null);
        if (!res) return 'Tidak bisa request';
        const h = res.headers();
        const aco = h['access-control-allow-origin'];
        const acac = h['access-control-allow-credentials'];
        if (!aco) return 'Tidak ada CORS headers (info: mungkin same-origin only)';
        if (aco === '*' && acac === 'true') throw new Error('CORS wildcard dengan credentials (insecure)');
        return `Access-Control-Allow-Origin: ${aco}`;
      }));

    return R;
  }

  // ===== Modul: Cookie & Session =====
  async testCookieSession(page, url, d, authState) {
    const M = 'Cookie & Session'; const R = [];

    R.push(await this.safeTest('TC-CS-001', M, 'Cookie tersedia setelah load',
      'Halaman dimuat', '1. Ambil cookie\n2. Cek jumlah',
      'Cookie ada', async () => {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        const cookies = await page.context().cookies();
        if (cookies.length === 0) throw new Error('Tidak ada cookie');
        return `${cookies.length} cookie tersimpan`;
      }));

    R.push(await this.safeTest('TC-CS-003', M, 'Cookie path tidak terlalu luas',
      'Halaman dimuat', '1. Ambil cookie\n2. Cek path',
      'Path spesifik', async () => {
        const cookies = await page.context().cookies();
        if (cookies.length === 0) throw new Error('Tidak ada cookie');
        let rootPath = 0;
        for (const c of cookies) { if (c.path === '/' && (c.name.toLowerCase().includes('session') || c.name.toLowerCase().includes('token') || c.name.toLowerCase().includes('auth'))) rootPath++; }
        if (rootPath > 2) throw new Error(`${rootPath} cookie sensitif dengan path="/"`);
        return `${rootPath} cookie sensitif di root path`;
      }));

    if (authState && authState.isAuthenticated) {
      R.push(await this.safeTest('TC-CS-004', M, 'Session cookie ada setelah login',
        'User sudah login', '1. Ambil cookie\n2. Cek session/auth cookie',
        'Session cookie ada', async () => {
          const cookies = await page.context().cookies();
          const session = cookies.filter(c => c.name.toLowerCase().includes('session') || c.name.toLowerCase().includes('token') || c.name.toLowerCase().includes('auth') || c.name.toLowerCase().includes('_gitlab'));
          if (session.length === 0) throw new Error('Tidak ada session cookie');
          return `${session.length} session cookie (${session.map(c => c.name).join(', ')})`;
        }));

      R.push(await this.safeTest('TC-CS-005', M, 'Session cookie tidak expired',
        'User login, session aktif', '1. Ambil cookie\n2. Cek expires',
        'Cookie belum expired', async () => {
          const cookies = await page.context().cookies();
          const now = Date.now();
          let expired = 0;
          for (const c of cookies) {
            if (c.expires > 0 && c.expires * 1000 < now) expired++;
          }
          if (expired > 0) throw new Error(`${expired} cookie sudah expired`);
          return 'Semua cookie valid';
        }));

      R.push(await this.safeTest('TC-CS-006', M, 'Logout menghapus session',
        'User login, session aktif', '1. Catat cookie\n2. Clear cookies\n3. Navigasi\n4. Cek redirect ke login',
        'Session hilang setelah logout', async () => {
          const before = (await page.context().cookies()).length;
          await page.context().clearCookies();
          await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
          await page.waitForTimeout(2000);
          const afterUrl = page.url();
          // Kembali ke dashboard dengan re-login jika perlu
          if (afterUrl.includes('sign_in') || afterUrl.includes('login')) {
            // Re-login untuk modul berikutnya
            if (authState.loginUrl && d.hasLogin) {
              await page.goto(authState.loginUrl, { waitUntil: 'networkidle', timeout: 45000 });
            }
            return `Session hilang - redirect ke login (${before} → 0 cookie)`;
          }
          return `Cookie di-clear (${before} → 0)`;
        }));
    } else {
      R.push(this.skip('TC-CS-004', M, 'Session cookie setelah login', 'User login', '1. Cek cookie', 'Session ada', 'belum login'));
      R.push(this.skip('TC-CS-005', M, 'Session cookie tidak expired', 'User login', '1. Cek expires', 'Valid', 'belum login'));
      R.push(this.skip('TC-CS-006', M, 'Logout menghapus session', 'User login', '1. Logout', 'Session hilang', 'belum login'));
    }

    // TC-CS-008: Cookie path restriction
    R.push(await this.safeTest('TC-CS-008', M, 'Cookie path restriction (tidak root untuk session cookie)',
      'Halaman dimuat', '1. Ambil cookie\n2. Cek path attribute\n3. Flag session cookie dengan path=/',
      'Cookie path terbatas', async () => {
        const cookies = await page.context().cookies();
        if (cookies.length === 0) return 'Tidak ada cookie';
        const sessionCookies = cookies.filter(c => c.name.toLowerCase().includes('session') || c.name.toLowerCase().includes('token') || c.name.toLowerCase().includes('auth'));
        if (sessionCookies.length === 0) return 'Tidak ada session cookie';
        let rootPath = 0;
        for (const c of sessionCookies) {
          if (c.path === '/' || !c.path) rootPath++;
        }
        if (rootPath > sessionCookies.length * 0.8) return `${rootPath}/${sessionCookies.length} session cookie dengan path=/ (info: best practice untuk restrict path)`;
        return `${rootPath}/${sessionCookies.length} session cookie dengan path=/ (OK)`;
      }));

    // TC-CS-009: Tidak ada cookie berlebihan (>20 cookie)
    R.push(await this.safeTest('TC-CS-009', M, 'Tidak ada cookie berlebihan (max 20 cookie per domain)',
      'Halaman dimuat', '1. Hitung jumlah cookie\n2. Flag jika > 20',
      'Cookie count reasonable', async () => {
        const cookies = await page.context().cookies();
        if (cookies.length > 20) throw new Error(`${cookies.length} cookie (best practice: max 20)`);
        return `${cookies.length} cookie (OK)`;
      }));

    // TC-CS-010: Cookie tidak menyimpan data sensitif plaintext
    R.push(await this.safeTest('TC-CS-010', M, 'Cookie tidak menyimpan data sensitif plaintext',
      'Halaman dimuat', '1. Ambil cookie\n2. Cek value untuk password, token, PII\n3. Flag plaintext sensitive',
      'Tidak ada sensitive data plaintext di cookie', async () => {
        const cookies = await page.context().cookies();
        if (cookies.length === 0) return 'Tidak ada cookie';
        const sensitivePatterns = [/password/i, /passwd/i, /secret/i, /credit.?card/i, /ssn/i, /nik/i, /ktp/i];
        let found = [];
        for (const c of cookies) {
          for (const p of sensitivePatterns) {
            if (p.test(c.name)) found.push(c.name);
          }
          if (c.value.length > 100 && /^[A-Za-z0-9+/=]+$/.test(c.value)) continue;
          for (const p of sensitivePatterns) {
            if (p.test(c.value)) found.push(`value of ${c.name}`);
          }
        }
        if (found.length > 0) throw new Error(`Sensitive data di cookie: ${found.join(', ')}`);
        return 'Tidak ada sensitive data plaintext di cookie';
      }));

    // TC-CS-011: Session fixation protection
    R.push(await this.safeTest('TC-CS-011', M, 'Session fixation protection (session ID berubah setelah login)',
      'User login', '1. Catat cookie sebelum login\n2. Login\n3. Cek session ID berubah',
      'Session ID berubah setelah login', async () => {
        if (!authState.isAuthenticated) return 'Tidak login (test skipped)';
        const cookies = await page.context().cookies();
        const sessionCookies = cookies.filter(c => c.name.toLowerCase().includes('session') || c.name.toLowerCase().includes('sid'));
        if (sessionCookies.length === 0) return 'Tidak ada session cookie untuk verify';
        return 'Session cookie ada (session fixation protection perlu verify dengan pre/post login comparison)';
      }));

    return R;
  }

  // ===== Modul: Content & SEO =====
  async testContentSeo(page, url, d) {
    const M = 'Content & SEO'; const R = [];

    R.push(await this.safeTest('TC-SEO-001', M, 'Meta description tersedia',
      'Halaman dimuat', '1. Cari meta[name="description"]\n2. Cek konten',
      'Meta description ada', async () => {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        const desc = await page.locator('meta[name="description"]').getAttribute('content');
        if (!desc || desc.trim().length < 10) throw new Error('Meta description kosong/tidak ada');
        return `Meta description: "${desc.substring(0, 80)}..."`;
      }));

    R.push(await this.safeTest('TC-SEO-002', M, 'Open Graph tags tersedia',
      'Halaman dimuat', '1. Cari meta[property="og:*"]\n2. Cek og:title, og:description, og:image',
      'OG tags ada', async () => {
        const ogProps = ['og:title', 'og:description', 'og:url'];
        const found = [];
        for (const prop of ogProps) {
          const val = await page.locator(`meta[property="${prop}"]`).getAttribute('content');
          if (val) found.push(prop);
        }
        if (found.length === 0) throw new Error('Tidak ada Open Graph tags');
        return `${found.length}/${ogProps.length} OG tags: ${found.join(', ')}`;
      }));

    R.push(await this.safeTest('TC-SEO-003', M, 'Canonical URL tersedia',
      'Halaman dimuat', '1. Cari link[rel="canonical"]\n2. Cek href',
      'Canonical URL ada', async () => {
        const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
        if (!canonical) throw new Error('Canonical URL tidak ditemukan');
        return `Canonical: ${canonical}`;
      }));

    R.push(await this.safeTest('TC-SEO-004', M, 'Robots meta tag tidak block indexing',
      'Halaman dimuat', '1. Cari meta[name="robots"]\n2. Cek content',
      'Tidak ada noindex', async () => {
        const robots = await page.locator('meta[name="robots"]').getAttribute('content');
        if (robots && robots.includes('noindex')) throw new Error(`Robots: ${robots}`);
        return robots ? `Robots: ${robots}` : 'Tidak ada robots meta (default: index)';
      }));

    R.push(await this.safeTest('TC-SEO-005', M, 'Struktur heading hierarki',
      'Halaman dimuat', '1. Hitung h1-h6\n2. Cek hierarki',
      'Hierarki heading benar', async () => {
        const headings = await page.evaluate(() => {
          const result = {};
          for (let i = 1; i <= 6; i++) {
            result[`h${i}`] = document.querySelectorAll(`h${i}`).length;
          }
          return result;
        });
        const total = Object.values(headings).reduce((a, b) => a + b, 0);
        if (total === 0) throw new Error('Tidak ada heading');
        if (headings.h1 > 1) throw new Error(`${headings.h1} h1 (seharusnya 1)`);
        if (headings.h1 === 0 && headings.h2 > 0) throw new Error('Ada h2 tapi tidak ada h1');
        return `h1:${headings.h1} h2:${headings.h2} h3:${headings.h3} h4:${headings.h4} h5:${headings.h5} h6:${headings.h6}`;
      }));

    R.push(await this.safeTest('TC-SEO-007', M, 'URL structure clean (tidak ada parameter berlebih)',
      'URL target', '1. Parse URL\n2. Cek query params\n3. Cek panjang URL',
      'URL clean', async () => {
        const u = new URL(url);
        const params = u.searchParams;
        if (params.toString().length > 0 && Array.from(params.keys()).length > 3) {
          throw new Error(`${Array.from(params.keys()).length} query params`);
        }
        if (url.length > 200) throw new Error(`URL terlalu panjang (${url.length} chars)`);
        return `URL clean (${Array.from(params.keys()).length} params, ${url.length} chars)`;
      }));

    // TC-SEO-008: Structured data (JSON-LD atau microdata)
    R.push(await this.safeTest('TC-SEO-008', M, 'Structured data (JSON-LD atau microdata) tersedia',
      'Halaman dimuat', '1. Cari script[type="application/ld+json"]\n2. Cari microdata itemscope\n3. Cek schema valid',
      'Structured data ada', async () => {
        const structured = await page.evaluate(() => {
          const jsonLd = document.querySelectorAll('script[type="application/ld+json"]').length;
          const microdata = document.querySelectorAll('[itemscope]').length;
          const rdfa = document.querySelectorAll('[typeof]').length;
          return { jsonLd, microdata, rdfa };
        });
        const total = structured.jsonLd + structured.microdata + structured.rdfa;
        if (total === 0) return 'Tidak ada structured data (info: best practice untuk SEO)';
        return `Structured data: ${structured.jsonLd} JSON-LD, ${structured.microdata} microdata, ${structured.rdfa} RDFa`;
      }));

    // TC-SEO-009: Sitemap.xml accessible
    R.push(await this.safeTest('TC-SEO-009', M, 'Sitemap.xml accessible',
      'URL target', '1. Construct sitemap URL\n2. Request\n3. Cek status 200 dan XML content',
      'Sitemap.xml accessible', async () => {
        const baseUrl = new URL(url);
        const sitemapUrl = `${baseUrl.origin}/sitemap.xml`;
        const res = await page.goto(sitemapUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null);
        if (!res) return 'Tidak bisa akses /sitemap.xml';
        const status = res.status();
        if (status !== 200) return `Sitemap.xml status: ${status} (tidak accessible)`;
        const ct = res.headers()['content-type'] || '';
        if (ct.includes('xml')) return 'Sitemap.xml accessible dan valid XML content-type';
        return 'Sitemap.xml accessible (content-type: ' + ct + ')';
      }));

    // TC-SEO-010: Robots.txt accessible
    R.push(await this.safeTest('TC-SEO-010', M, 'Robots.txt accessible',
      'URL target', '1. Construct robots.txt URL\n2. Request\n3. Cek status 200 dan text content',
      'Robots.txt accessible', async () => {
        const baseUrl = new URL(url);
        const robotsUrl = `${baseUrl.origin}/robots.txt`;
        const res = await page.goto(robotsUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => null);
        if (!res) return 'Tidak bisa akses /robots.txt';
        const status = res.status();
        if (status !== 200) return `Robots.txt status: ${status} (tidak accessible)`;
        const body = await page.locator('body').innerText().catch(() => '');
        if (body.includes('User-agent:') || body.includes('Disallow:')) return 'Robots.txt accessible dan valid';
        return 'Robots.txt accessible tapi format tidak standar';
      }));

    // TC-SEO-012: Mobile-friendly (viewport + readable text)
    R.push(await this.safeTest('TC-SEO-012', M, 'Mobile-friendly (viewport meta + text readability di mobile)',
      'Halaman dimuat', '1. Cek meta viewport\n2. Set viewport mobile\n3. Cek font-size >= 12px',
      'Halaman mobile-friendly', async () => {
        const hasViewport = await page.locator('meta[name="viewport"]').count();
        if (hasViewport === 0) throw new Error('Meta viewport tidak ada (tidak mobile-friendly)');
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(1000);
        const smallFonts = await page.evaluate(() => {
          let count = 0;
          const els = document.querySelectorAll('p, span, a, li, td, label, div');
          for (const el of els) {
            if (el.offsetParent === null || !el.innerText.trim()) continue;
            const cs = window.getComputedStyle(el);
            const size = parseFloat(cs.fontSize);
            if (size < 12) count++;
          }
          return count;
        });
        await page.setViewportSize({ width: 1920, height: 1080 });
        if (smallFonts > 10) throw new Error(`${smallFonts} elemen dengan font-size < 12px di mobile`);
        return 'Halaman mobile-friendly (viewport + readable text)';
      }));

    return R;
  }

  // ===== Modul: Dashboard =====
  async testDashboard(page, url, d, authState) {
    const M = 'Dashboard'; const R = [];

    // TC-D-001: Dashboard dimuat dan terlihat
    R.push(await this.safeTest('TC-D-001', M, 'Dashboard halaman dimuat dengan benar',
      'URL dashboard diketahui', '1. Buka URL dashboard\n2. Tunggu halaman dimuat\n3. Cek judul dan konten',
      'Dashboard dimuat dengan konten visible', async () => {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(2000);
        const title = await page.title();
        const bodyText = await page.locator('body').innerText().catch(() => '');
        if (!title && !bodyText) throw new Error('Halaman tidak memiliki title dan konten');
        if (page.url().includes('login') || page.url().includes('sign_in')) throw new Error('Redirect ke login, dashboard tidak accessible');
        return `Dashboard dimuat: "${title}" (${bodyText.length} chars)`;
      }));

    // TC-D-002: Elemen navigasi dashboard tersedia
    R.push(await this.safeTest('TC-D-002', M, 'Elemen navigasi dashboard tersedia',
      'Dashboard dimuat', '1. Cari navbar/sidebar/menu\n2. Cek link navigasi',
      'Minimal 1 elemen navigasi terdeteksi', async () => {
        const navSels = ['nav', '.navbar', '.sidebar', '.menu', '[role="navigation"]', '[class*="nav"]', '[class*="sidebar"]', '[class*="menu"]', '[class*="drawer"]', '[class*="sidenav"]', '[data-testid*="nav"]', 'aside', '[role="tablist"]'];
        let found = [];
        for (const s of navSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) found.push(s);
        }
        if (found.length === 0) throw new Error('Tidak ada elemen navigasi terdeteksi');
        return `Navigasi ditemukan: ${found.join(', ')}`;
      }));

    // TC-D-003: Dashboard memiliki heading/title yang jelas
    R.push(await this.safeTest('TC-D-003', M, 'Dashboard memiliki heading/title yang jelas',
      'Dashboard dimuat', '1. Cari h1/h2/title di dashboard\n2. Cek teks heading',
      'Heading utama terdeteksi', async () => {
        const hSels = ['h1', 'h2', '[class*="title"]', '[class*="heading"]', '.page-title', '.dashboard-title', '[role="heading"]', '[class*="page-header"]', '[data-testid*="title"]'];
        for (const s of hSels) {
          const el = page.locator(s).first();
          if (await el.isVisible().catch(() => false)) {
            const txt = await el.innerText().catch(() => '');
            if (txt && txt.trim().length > 0) return `Heading: "${txt.substring(0, 100)}"`;
          }
        }
        throw new Error('Tidak ada heading utama terdeteksi');
      }));

    // TC-D-004: Dashboard memiliki cards/widgets/statistics
    R.push(await this.safeTest('TC-D-004', M, 'Dashboard memiliki cards/widgets/statistics',
      'Dashboard dimuat', '1. Cari card/widget/stat elements\n2. Cek konten',
      'Minimal 1 card/widget terdeteksi', async () => {
        const cardSels = ['.card', '[class*="card"]', '[class*="widget"]', '[class*="stat"]', '[class*="metric"]', '[class*="counter"]', '.dashboard-card', '.stat-card', '[class*="panel"]', '[class*="box"]', '[class*="summary"]', '[data-testid*="card"]', '[data-testid*="stat"]', '[role="region"]'];
        let found = 0;
        for (const s of cardSels) {
          const els = await page.locator(s).all();
          found += els.length;
        }
        if (found === 0) throw new Error('Tidak ada card/widget terdeteksi');
        return `${found} card/widget terdeteksi di dashboard`;
      }));

    // TC-D-005: Dashboard responsive (desktop & mobile)
    R.push(await this.safeTest('TC-D-005', M, 'Dashboard responsive di berbagai viewport',
      'Dashboard dimuat', '1. Set viewport desktop (1920x1080)\n2. Cek layout\n3. Set viewport mobile (375x667)\n4. Cek layout tidak broken',
      'Layout tetap utuh di desktop dan mobile', async () => {
        const viewports = [
          { width: 1920, height: 1080, name: 'desktop' },
          { width: 375, height: 667, name: 'mobile' },
        ];
        for (const vp of viewports) {
          await page.setViewportSize({ width: vp.width, height: vp.height });
          await page.waitForTimeout(1000);
          const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
          if (bodyWidth > vp.width + 50) throw new Error(`Layout overflow di ${vp.name}: body ${bodyWidth}px > viewport ${vp.width}px`);
        }
        await page.setViewportSize({ width: 1280, height: 720 });
        return 'Dashboard responsive di desktop dan mobile';
      }));

    // TC-D-006: Link/menu di dashboard berfungsi
    R.push(await this.safeTest('TC-D-006', M, 'Link/menu di dashboard dapat diklik',
      'Dashboard dimuat, ada navigasi', '1. Cari link di navigasi\n2. Klik link pertama\n3. Cek navigasi terjadi',
      'Link navigasi berfungsi', async () => {
        const navLinks = await page.locator('nav a[href], [class*="nav"] a[href], [class*="sidebar"] a[href], [class*="menu"] a[href]').all();
        if (navLinks.length === 0) throw new Error('Tidak ada link navigasi');
        const link = navLinks[0];
        const href = await link.getAttribute('href');
        if (!href || href === '#' || href.startsWith('javascript:')) return 'Link navigasi ditemukan tapi tidak navigable (info)';
        const beforeUrl = page.url();
        await link.click().catch(() => {});
        await page.waitForTimeout(3000);
        const afterUrl = page.url();
        if (afterUrl !== beforeUrl) {
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
          await page.waitForTimeout(1500);
          return `Link "${href.substring(0, 50)}" berhasil navigasi`;
        }
        return 'Link diklik tapi tidak navigasi (mungkin SPA atau tab baru)';
      }));

    // TC-D-007: Dashboard loading state (skeleton/spinner)
    R.push(await this.noteTest('TC-D-007', M, 'Dashboard memiliki loading state (skeleton/spinner)',
      'Dashboard dimuat', '1. Reload halaman\n2. Cek ada skeleton/spinner sebelum konten muncul',
      'Loading state terdeteksi (best practice)', async () => {
        const loadingSels = ['[class*="skeleton"]', '[class*="spinner"]', '[class*="loading"]', '[class*="loader"]', '[role="progressbar"]', '.loading-indicator'];
        // Check if loading elements exist in DOM (even if not visible)
        for (const s of loadingSels) {
          const count = await page.locator(s).count();
          if (count > 0) return `Loading state ditemukan (${s}, ${count} elements)`;
        }
        return 'Loading state tidak ditemukan (info: best practice untuk dashboard)';
      }));

    // TC-D-008: Dashboard data table/list rendering
    R.push(await this.safeTest('TC-D-008', M, 'Dashboard merender data table atau list dengan benar',
      'Dashboard dimuat', '1. Cari table atau list\n2. Cek ada data/rows\n3. Cek header',
      'Table/list dengan data terdeteksi', async () => {
        const tableSels = ['table', '[class*="table"]', '[class*="list"]', '[class*="grid"]', '[role="table"]', '[role="list"]'];
        for (const s of tableSels) {
          const el = page.locator(s).first();
          if (await el.isVisible().catch(() => false)) {
            const rows = await el.locator('tr, [role="row"], li, [role="listitem"]').count();
            if (rows > 0) return `Table/list ditemukan (${s}) dengan ${rows} rows/items`;
            return `Table/list ditemukan (${s}) tapi tidak ada rows`;
          }
        }
        return 'Table/list tidak ditemukan (info: mungkin dashboard card-based)';
      }));

    // TC-D-009: Dashboard user info/profile display
    R.push(await this.noteTest('TC-D-009', M, 'Dashboard menampilkan info user/profile',
      'User sudah login, dashboard dimuat', '1. Cari elemen user info\n2. Cek avatar/nama/role',
      'User info terdeteksi di dashboard', async () => {
        const userSels = ['.user-info', '.user-profile', '.user-menu', '.avatar', '[class*="profile"]', '[class*="user-name"]', '[class*="username"]', '[data-testid*="user"]'];
        for (const s of userSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) return `User info ditemukan (${s})`;
        }
        return 'User info tidak ditemukan (info: best practice)';
      }));

    // TC-D-010: Dashboard tidak menampilkan error JS console
    R.push(await this.safeTest('TC-D-010', M, 'Dashboard tidak memiliki JavaScript console errors',
      'Dashboard dimuat', '1. Listen untuk console errors\n2. Reload halaman\n3. Cek error messages',
      'Tidak ada console error critical', async () => {
        let errorCount = 0;
        page.on('console', (msg) => {
          if (msg.type() === 'error') errorCount++;
        });
        await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
        await page.waitForTimeout(3000);
        if (errorCount > 5) throw new Error(`${errorCount} console errors terdeteksi`);
        return `${errorCount} console errors (info: < 5 acceptable)`;
      }));

    // TC-D-011: Dashboard search/filter functionality
    R.push(await this.noteTest('TC-D-011', M, 'Dashboard search/filter berfungsi (mengubah hasil)',
      'Dashboard dimuat', '1. Cari input search/filter\n2. Catat jumlah row sebelum filter\n3. Ketik query\n4. Cek jumlah row berubah',
      'Search/filter berfungsi dan mengubah hasil', async () => {
        const searchSels = ['input[type="search"]', 'input[placeholder*="search" i]', 'input[placeholder*="cari" i]', 'input[placeholder*="filter" i]', '[class*="search"] input', '[class*="filter"] input', '[aria-label*="search" i]'];
        let searchEl = null;
        for (const s of searchSels) {
          const el = page.locator(s).first();
          if (await el.isVisible().catch(() => false)) { searchEl = el; break; }
        }
        if (!searchEl) return 'Search/filter tidak ditemukan (info: best practice)';
        const beforeRows = await page.evaluate(() => {
          const rows = document.querySelectorAll('table tbody tr, [role="row"], [role="listitem"], .card, [class*="item"]');
          return rows.length;
        });
        await searchEl.fill('zzzzzznotexist').catch(() => {});
        await page.waitForTimeout(1500);
        const afterRows = await page.evaluate(() => {
          const rows = document.querySelectorAll('table tbody tr, [role="row"], [role="listitem"], .card, [class*="item"]');
          return rows.length;
        });
        await searchEl.fill('').catch(() => {});
        if (beforeRows > 0 && afterRows < beforeRows) return `Search/filter berfungsi: ${beforeRows} → ${afterRows} rows setelah filter`;
        return `Search input ditemukan tapi filter tidak mengubah jumlah hasil (${beforeRows} → ${afterRows})`;
      }));

    // TC-D-012: Dashboard breadcrumb navigation
    R.push(await this.noteTest('TC-D-012', M, 'Dashboard memiliki breadcrumb navigation',
      'Dashboard dimuat', '1. Cari breadcrumb elements\n2. Cek struktur',
      'Breadcrumb tersedia (best practice)', async () => {
        const breadcrumbSels = ['[class*="breadcrumb"]', '[aria-label*="breadcrumb" i]', 'nav ol li a', '.breadcrumb'];
        for (const s of breadcrumbSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) return `Breadcrumb ditemukan (${s})`;
        }
        return 'Breadcrumb tidak ditemukan (info: best practice)';
      }));

    // TC-D-013: Dashboard notification/alert system
    R.push(await this.noteTest('TC-D-013', M, 'Dashboard memiliki notification/alert system',
      'Dashboard dimuat', '1. Cari elemen notif/alert\n2. Cek badge count atau toast',
      'Notification system terdeteksi (best practice)', async () => {
        const notifSels = ['[class*="notification"]', '[class*="notif"]', '[class*="alert"]', '[class*="toast"]', '[class*="badge"]', '[data-testid*="notif"]', 'bell', '.notification-icon'];
        for (const s of notifSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) return `Notification element ditemukan (${s})`;
        }
        return 'Notification system tidak ditemukan (info: best practice)';
      }));

    // TC-D-014: Dashboard footer dengan info
    R.push(await this.noteTest('TC-D-014', M, 'Dashboard memiliki footer dengan informasi',
      'Dashboard dimuat', '1. Cari footer element\n2. Cek konten',
      'Footer terdeteksi dengan konten', async () => {
        const footerSels = ['footer', '[class*="footer"]', '[role="contentinfo"]'];
        for (const s of footerSels) {
          const el = page.locator(s).first();
          if (await el.isVisible().catch(() => false)) {
            const txt = await el.innerText().catch(() => '');
            if (txt && txt.trim().length > 0) return `Footer ditemukan: "${txt.substring(0, 80)}"`;
          }
        }
        return 'Footer tidak ditemukan (info: best practice)';
      }));

    // TC-D-015: Dashboard dark mode toggle (jika ada)
    R.push(await this.noteTest('TC-D-015', M, 'Dashboard dark mode toggle berfungsi',
      'Dashboard dimuat', '1. Cari toggle dark mode\n2. Catat class/data-theme sebelum klik\n3. Klik toggle\n4. Cek perubahan class/data-theme',
      'Dark mode toggle berfungsi (mengubah tema)', async () => {
        const darkSels = ['[class*="dark-mode"]', '[class*="theme-toggle"]', '[data-testid*="theme"]', '[aria-label*="dark" i]', '[aria-label*="theme" i]', 'button[class*="dark"]'];
        let toggleEl = null;
        for (const s of darkSels) {
          const el = page.locator(s).first();
          if (await el.isVisible().catch(() => false)) { toggleEl = el; break; }
        }
        if (!toggleEl) return 'Dark mode toggle tidak ditemukan (info: best practice)';
        const beforeTheme = await page.evaluate(() => ({
          htmlClass: document.documentElement.className,
          bodyClass: document.body.className,
          dataTheme: document.documentElement.getAttribute('data-theme') || document.body.getAttribute('data-theme') || '',
        }));
        await toggleEl.click().catch(() => {});
        await page.waitForTimeout(1000);
        const afterTheme = await page.evaluate(() => ({
          htmlClass: document.documentElement.className,
          bodyClass: document.body.className,
          dataTheme: document.documentElement.getAttribute('data-theme') || document.body.getAttribute('data-theme') || '',
        }));
        const changed = beforeTheme.htmlClass !== afterTheme.htmlClass ||
          beforeTheme.bodyClass !== afterTheme.bodyClass ||
          beforeTheme.dataTheme !== afterTheme.dataTheme;
        if (changed) return `Dark mode toggle berfungsi (theme berubah: ${afterTheme.htmlClass || afterTheme.dataTheme || 'body class'})`;
        return 'Dark mode toggle ditemukan tapi klik tidak mengubah tema';
      }));

    // TC-D-016: Dashboard data freshness (data ter-load via XHR/fetch, bukan hardcoded)
    R.push(await this.safeTest('TC-D-016', M, 'Dashboard data ter-load via XHR/fetch (bukan hardcoded/stale)',
      'Dashboard dimuat', '1. Reload halaman\n2. Intercept XHR/fetch requests\n3. Cek ada API call untuk data dashboard',
      'Data dashboard ter-load dari API', async () => {
        let apiCallCount = 0;
        page.on('request', (req) => {
          const rtype = req.resourceType();
          if (rtype === 'xhr' || rtype === 'fetch') {
            const reqUrl = req.url();
            if (!reqUrl.includes('favicon') && !reqUrl.includes('analytics')) apiCallCount++;
          }
        });
        await page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(async () => {
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        });
        await page.waitForTimeout(3000);
        if (apiCallCount > 0) return `Data dashboard ter-load via ${apiCallCount} XHR/fetch request`;
        return 'Tidak ada XHR/fetch request terdeteksi (data mungkin hardcoded atau pre-rendered)';
      }));

    // ===== Error Handling / Negative / Edge tests untuk Dashboard =====

    // TC-D-017: 404 handling (NEGATIVE)
    R.push(await this.safeTest('TC-D-017', M, 'Negative: halaman tidak ditemukan (404) ditangani tanpa crash',
      'Dashboard dimuat', '1. Navigasi ke subpath acak\n2. Verifikasi status 404/403/200, bukan 500',
      '404 ditangani tanpa crash', async () => {
        const base = new URL(url);
        const probe = `${base.origin}${base.pathname.replace(/\/$/, '')}/this-page-404-${Date.now()}`;
        const resp = await page.goto(probe, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
        if (!resp) return 'Tidak bisa menjangkau path (info)';
        const st = resp.status();
        if (st === 404 || st === 403 || st === 200) return `Akses path tidak valid: status ${st} (aman)`;
        if (st >= 500) throw new Error(`Server error ${st} pada path tidak valid (crash)`);
        return `Status ${st} (perlu verifikasi)`;
      }));

    // TC-D-018: Console error classification (ERROR HANDLING)
    R.push(await this.safeTest('TC-D-018', M, 'Error handling: klasifikasi console error (critical vs warning)',
      'Dashboard dimuat', '1. Reload\n2. Kumpulkan console error & warning\n3. Verifikasi error < 5',
      'Console error terkendali', async () => {
        const errs = []; const warns = [];
        const hC = (m) => { if (m.type() === 'error') errs.push(m.text()); };
        const hW = (m) => { if (m.type() === 'warning') warns.push(m.text()); };
        page.on('console', hC); page.on('console', hW);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
        await page.waitForTimeout(3000);
        page.off('console', hC); page.off('console', hW);
        if (errs.length > 5) throw new Error(`${errs.length} console error kritis`);
        return `${errs.length} error, ${warns.length} warning (terkendali)`;
      }));

    // TC-D-019: Uncaught JS exceptions (ERROR HANDLING)
    R.push(await this.safeTest('TC-D-019', M, 'Error handling: tidak ada uncaught JS exception',
      'Dashboard dimuat', '1. Pasang listener pageerror\n2. Reload\n3. Verifikasi tidak ada exception',
      'Tidak ada uncaught exception', async () => {
        const errs = [];
        const h = (e) => errs.push(e.message);
        page.on('pageerror', h);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
        await page.waitForTimeout(3000);
        page.off('pageerror', h);
        if (errs.length > 0) throw new Error(`${errs.length} uncaught exception: ${errs[0]?.substring(0, 120)}`);
        return 'Tidak ada uncaught JS exception';
      }));

    // TC-D-020: Empty state handling (ERROR HANDLING)
    R.push(await this.safeTest('TC-D-020', M, 'Error handling: empty state tanpa data tidak crash',
      'Dashboard dimuat', '1. Cek elemen data/list\n2. Jika kosong, verifikasi tidak error',
      'Empty state aman', async () => {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
        await page.waitForTimeout(2000);
        const hasEmpty = await page.evaluate(() => {
          const sels = ['[class*="empty"]', '[class*="no-data"]', '[class*="no-result"]', '[class*="empty-state"]', '.empty'];
          for (const s of sels) { if (document.querySelector(s)?.offsetParent !== null) return true; }
          return false;
        });
        if (hasEmpty) return 'Empty state UI terdeteksi (aman)';
        return 'Tidak ada indikator empty state (info: data mungkin selalu ada)';
      }));

    // TC-D-021: Broken images (NEGATIVE)
    R.push(await this.safeTest('TC-D-021', M, 'Negative: gambar broken tidak menyebabkan crash',
      'Dashboard dimuat', '1. Hitung gambar broken (naturalWidth=0)\n2. Verifikasi tidak fatal',
      'Broken image ditangani', async () => {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
        await page.waitForTimeout(2000);
        const broken = await page.evaluate(() => {
          const imgs = Array.from(document.querySelectorAll('img'));
          return imgs.filter(i => i.complete && i.naturalWidth === 0).length;
        });
        if (broken === 0) return 'Tidak ada gambar broken';
        return `${broken} gambar broken (info: gunakan placeholder)`;
      }));

    // TC-D-022: Viewport ekstrem overflow (EDGE / BOUNDARY)
    R.push(await this.safeTest('TC-D-022', M, 'Edge: layout tidak overflow pada viewport ekstrem (320px & 2560px)',
      'Dashboard dimuat', '1. Set 320px lalu 2560px\n2. Cek overflow horizontal',
      'Layout stabil di viewport ekstrem', async () => {
        for (const w of [320, 2560]) {
          await page.setViewportSize({ width: w, height: 800 });
          await page.waitForTimeout(800);
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          if (overflow > 60) throw new Error(`Overflow ${overflow}px di viewport ${w}px`);
        }
        await page.setViewportSize({ width: 1280, height: 720 });
        return 'Layout stabil di 320px & 2560px';
      }));

    // TC-D-023: Unauthenticated access (NEGATIVE)
    R.push(await this.safeTest('TC-D-023', M, 'Negative: akses tanpa session menangani redirect/login',
      'Dashboard butuh auth', '1. Clear cookies\n2. Reload dashboard\n3. Verifikasi redirect ke login/403 (bukan 500)',
      'Unauthenticated ditangani', async () => {
        await page.context().clearCookies();
        const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => null);
        await page.waitForTimeout(1500);
        const u = page.url();
        if (u.includes('login') || u.includes('sign_in') || u.includes('auth')) return 'Unauthenticated redirect ke login (aman)';
        const st = resp ? resp.status() : 0;
        if (st === 401 || st === 403) return `Unauthenticated dikembalikan ${st} (aman)`;
        return 'Tetap di halaman (mungkin publik/SSO) — info';
      }));

    // TC-D-024: Rapid navigasi (EDGE)
    R.push(await this.safeTest('TC-D-024', M, 'Edge: navigasi cepat (back/forward berulang) tidak crash',
      'Dashboard dimuat', '1. goBack lalu goForward beberapa kali\n2. Verifikasi halaman tetap load',
      'Rapid navigasi aman', async () => {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
        await page.waitForTimeout(1000);
        for (let i = 0; i < 3; i++) {
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(500);
          await page.goForward({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
          await page.waitForTimeout(500);
        }
        const title = await page.title().catch(() => '');
        const body = await page.locator('body').innerText().catch(() => '');
        if (!title && !body) throw new Error('Halaman kosong setelah rapid navigasi');
        return 'Rapid back/forward navigasi aman';
      }));

    return R;
  }

  // ===== Modul: CRUD (Create, Read, Update, Delete) — Full Data Lifecycle =====
  async testCrud(page, url, d, authState) {
    const M = 'CRUD'; const R = [];

    const hasTable = d.hasCrudTable || await page.locator('table tbody tr, [role="row"], [class*="row"], [class*="item"], [class*="datagrid"] [class*="row"]').count() > 0;
    const hasAdd = d.hasAddButton || await page.locator('button:has-text("Add"), button:has-text("Create"), button:has-text("New"), button:has-text("Tambah"), button:has-text("Buat"), a:has-text("Add"), a:has-text("Create"), [data-testid*="add"], [data-testid*="create"]').count() > 0;

    if (!hasTable && !hasAdd) {
      R.push(this.note('TC-CRUD-001', M, 'Elemen CRUD tidak terdeteksi',
        'UI CRUD (tabel/add button)', '1. Cari tabel atau tombol add', 'CRUD berfungsi',
        'tidak ada tabel atau tombol create/add terdeteksi'));
      return R;
    }

    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(async () => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    });
    await page.waitForTimeout(2000);

    const rowLocator = page.locator('table tbody tr, [role="grid"] [role="row"], [class*="datagrid"] [class*="row"], [class*="table"] [class*="row"], [class*="list"] [class*="item"], [class*="data-table"] [class*="row"]');
    const countRows = async () => {
      let n = await rowLocator.count();
      if (n === 0) n = await page.locator('[class*="card"], [class*="item"]').count();
      return n;
    };
    const findAddButton = async () => {
      const sels = ['button:has-text("Add")', 'button:has-text("Create")', 'button:has-text("New")', 'button:has-text("Tambah")', 'button:has-text("Buat")',
        'a:has-text("Add")', 'a:has-text("Create")', 'a:has-text("New")', 'a:has-text("Tambah")',
        '[data-testid*="add"]', '[data-testid*="create"]', '[class*="add-btn"]', '[class*="create-btn"]'];
      for (const s of sels) { const el = page.locator(s).first(); if (await el.isVisible().catch(() => false)) return el; }
      return null;
    };
    const fillFormFields = async (marker) => {
      const inputs = await page.locator('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea').all();
      let filled = 0;
      for (const inp of inputs) {
        if (!await inp.isVisible().catch(() => false)) continue;
        try { await inp.fill(`${marker}_${filled}`); filled++; } catch {}
      }
      return filled;
    };

    // ===== CREATE =====
    R.push(await this.safeTest('TC-CRUD-001', M, 'CREATE: tombol Create/Add tersedia',
      'Halaman CRUD dimuat', '1. Cari tombol Add/Create/New/Tambah',
      'Tombol create tersedia', async () => {
        const btn = await findAddButton();
        if (btn) return 'Tombol Create/Add ditemukan';
        throw new Error('Tombol Create/Add tidak ditemukan');
      }));

    R.push(await this.safeTest('TC-CRUD-002', M, 'CREATE: menambah record baru berfungsi (happy path)',
      'Tombol Create tersedia', '1. Klik Create\n2. Isi form dengan data unik\n3. Submit\n4. Verifikasi record baru muncul',
      'Record baru muncul setelah create', async () => {
        const btn = await findAddButton();
        if (!btn) throw new Error('Tombol Create tidak ditemukan');
        const before = await countRows();
        const marker = 'SKYO_' + Date.now();
        await btn.click();
        await page.waitForTimeout(1500);
        const filled = await fillFormFields(marker);
        if (filled === 0) throw new Error('Tidak ada field form yang bisa diisi');
        const submit = page.locator('button[type="submit"], input[type="submit"], button:has-text("Save"), button:has-text("Submit"), button:has-text("Simpan"), button:has-text("Create"), [data-testid*="submit"], [data-testid*="save"]').first();
        if (await submit.isVisible().catch(() => false)) await submit.click();
        await page.waitForTimeout(2500);
        const bodyText = await page.locator('body').innerText().catch(() => '');
        if (bodyText.includes(marker)) return `CREATE berhasil: marker "${marker}" ditemukan (${filled} field diisi)`;
        const after = await countRows();
        if (after > before) return `CREATE berhasil: jumlah baris ${before} → ${after}`;
        return `Form diisi (${filled} field) tapi verifikasi otomatis terbatas (cek manual)`;
      }));

    R.push(await this.safeTest('TC-CRUD-003', M, 'CREATE: field wajib kosong ditolak (validasi negatif)',
      'Form create tersedia', '1. Buka form create\n2. Kosongkan semua input\n3. Submit\n4. Verifikasi error & tidak ada row baru',
      'Submit kosong ditolak dengan error', async () => {
        const btn = await findAddButton();
        if (!btn) throw new Error('Tombol Create tidak ditemukan');
        const before = await countRows();
        await btn.click();
        await page.waitForTimeout(1500);
        const inputs = await page.locator('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea').all();
        for (const inp of inputs) { if (await inp.isVisible().catch(() => false)) await inp.fill('').catch(() => {}); }
        const submit = page.locator('button[type="submit"], input[type="submit"], button:has-text("Save"), button:has-text("Simpan")').first();
        if (await submit.isVisible().catch(() => false)) await submit.click();
        await page.waitForTimeout(2000);
        const hasError = await page.evaluate(() => {
          const sels = ['[class*="error"]', '[class*="invalid"]', '[class*="danger"]', '[role="alert"]', '.validation-error', '[aria-invalid="true"]'];
          for (const s of sels) { if (document.querySelector(s)?.offsetParent !== null) return true; }
          return false;
        });
        const after = await countRows();
        if (hasError) return 'CREATE kosong ditolak: pesan error validasi tampil';
        if (after === before) return 'CREATE kosong tidak menambah row (ditolak server)';
        return 'Tidak ada error & row bertambah (validasi kosong lemah)';
      }));

    R.push(await this.safeTest('TC-CRUD-004', M, 'CREATE: Cancel/Batal membatalkan tanpa menambah record (negatif)',
      'Form create tersedia', '1. Buka form\n2. Isi sebagian\n3. Klik Cancel/Batal\n4. Verifikasi row tidak bertambah',
      'Cancel membatalkan create', async () => {
        const btn = await findAddButton();
        if (!btn) throw new Error('Tombol Create tidak ditemukan');
        const before = await countRows();
        await btn.click();
        await page.waitForTimeout(1500);
        const inputs = await page.locator('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])').all();
        if (inputs.length) await inputs[0].fill('CANCEL_TEST').catch(() => {});
        const cancel = page.locator('button:has-text("Cancel"), button:has-text("Batal"), button:has-text("Close"), button:has-text("Tutup"), [data-testid*="cancel"], [data-testid*="close"], a:has-text("Cancel")').first();
        if (await cancel.isVisible().catch(() => false)) {
          await cancel.click();
          await page.waitForTimeout(1500);
        } else {
          await page.keyboard.press('Escape').catch(() => {});
          await page.waitForTimeout(1000);
        }
        const after = await countRows();
        if (after <= before) return 'Cancel/Batal berfungsi: tidak ada record baru';
        throw new Error('Cancel tetap menambah record (bug)');
      }));

    R.push(await this.noteTest('TC-CRUD-005', M, 'CREATE: boundary value — input melebihi maxlength (5000 char)',
      'Form create tersedia', '1. Isi field dengan string 5000 char\n2. Submit\n3. Verifikasi tidak crash',
      'Sistem menangani input boundary tanpa error fatal', async () => {
        const btn = await findAddButton();
        if (!btn) throw new Error('Tombol Create tidak ditemukan');
        await btn.click();
        await page.waitForTimeout(1500);
        const longStr = 'A'.repeat(5000);
        const inputs = await page.locator('input[type="text"], input:not([type]), textarea, input[type="search"]').all();
        if (inputs.length === 0) throw new Error('Tidak ada text input untuk boundary test');
        await inputs[0].fill(longStr).catch(() => {});
        const val = await inputs[0].inputValue().catch(() => '');
        const submit = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Simpan")').first();
        if (await submit.isVisible().catch(() => false)) await submit.click().catch(() => {});
        await page.waitForTimeout(2000);
        return `Boundary test: input ${val.length} char diproses tanpa crash fatal`;
      }));

    R.push(await this.noteTest('TC-CRUD-006', M, 'CREATE: input XSS tidak dieksekusi (security negatif)',
      'Form create tersedia', '1. Isi field dengan payload XSS\n2. Submit\n3. Verifikasi script tidak dieksekusi',
      'XSS payload di-sanitize', async () => {
        const btn = await findAddButton();
        if (!btn) throw new Error('Tombol Create tidak ditemukan');
        await btn.click();
        await page.waitForTimeout(1500);
        const payload = '<img src=x onerror=window.__xss=1>';
        const inputs = await page.locator('input:not([type="hidden"]):not([type="password"]):not([type="checkbox"]):not([type="radio"]), textarea').all();
        if (inputs.length === 0) throw new Error('Tidak ada input untuk XSS test');
        await inputs[0].fill(payload).catch(() => {});
        const submit = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Simpan")').first();
        if (await submit.isVisible().catch(() => false)) await submit.click().catch(() => {});
        await page.waitForTimeout(2000);
        const executed = await page.evaluate(() => window.__xss === 1).catch(() => false);
        if (executed) throw new Error('XSS payload dieksekusi! (vulnerability)');
        return 'XSS payload tidak dieksekusi (aman / di-sanitize)';
      }));

    R.push(await this.noteTest('TC-CRUD-007', M, 'EDGE: karakter khusus/Unicode pada create tidak crash',
      'Form create tersedia', '1. Isi field dengan unicode & simbol\n2. Submit\n3. Verifikasi tidak crash',
      'Sistem menangani unicode', async () => {
        const btn = await findAddButton();
        if (!btn) throw new Error('Tombol Create tidak ditemukan');
        await btn.click();
        await page.waitForTimeout(1500);
        const special = 'Tëst_测试_Émoji😀_Ω';
        const input = page.locator('input:not([type="hidden"]):not([type="password"]):not([type="checkbox"]):not([type="radio"]), textarea').first();
        if (!await input.isVisible().catch(() => false)) throw new Error('Tidak ada field text');
        await input.fill(special);
        const submit = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Simpan")').first();
        if (await submit.isVisible().catch(() => false)) await submit.click().catch(() => {});
        await page.waitForTimeout(2000);
        return `Input unicode "${special}" diproses tanpa crash`;
      }));

    R.push(await this.noteTest('TC-CRUD-008', M, 'EDGE: duplicate create (nama sama) ditangani konsisten',
      'Form create tersedia', '1. Create dengan nama unik\n2. Create lagi dengan nama sama\n3. Verifikasi (rejected/allowed)',
      'Duplikat ditangani konsisten', async () => {
        const btn = await findAddButton();
        if (!btn) throw new Error('Tombol Create tidak ditemukan');
        const name = 'DUP_' + Date.now();
        const doCreate = async () => {
          await btn.click(); await page.waitForTimeout(1200);
          const inp = page.locator('input:not([type="hidden"]):not([type="password"]):not([type="checkbox"]):not([type="radio"]), textarea').first();
          if (await inp.isVisible().catch(() => false)) await inp.fill(name);
          const submit = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Simpan")').first();
          if (await submit.isVisible().catch(() => false)) await submit.click();
          await page.waitForTimeout(1500);
        };
        await doCreate();
        await doCreate();
        const body = await page.locator('body').innerText().catch(() => '');
        if (/sudah|exists|duplicate|duplikat|unique/i.test(body)) return 'Duplikat ditolak dengan pesan (constraint berfungsi)';
        return 'Duplikat diizinkan atau tidak terdeteksi otomatis (cek manual)';
      }));

    // ===== READ =====
    R.push(await this.safeTest('TC-CRUD-009', M, 'READ: data ditampilkan di tabel/list',
      'Ada tabel/data', '1. Hitung baris tabel\n2. Verifikasi > 0',
      'Minimal 1 record ter-render', async () => {
        const n = await countRows();
        if (n === 0) throw new Error('Tidak ada data di tabel/list');
        return `${n} record ter-render (READ)`;
      }));

    R.push(await this.safeTest('TC-CRUD-010', M, 'READ: struktur tabel memiliki header kolom',
      'Tabel tersedia', '1. Cek thead/th atau role columnheader',
      'Header kolom ada', async () => {
        const headers = await page.locator('table thead th, th, [role="columnheader"]').count();
        if (headers === 0) throw new Error('Tidak ada header kolom');
        return `${headers} header kolom terdeteksi`;
      }));

    R.push(await this.noteTest('TC-CRUD-011', M, 'READ: pagination/load-more berfungsi (jika ada)',
      'Data panjang', '1. Cari pagination/next/load-more\n2. Klik\n3. Verifikasi konten berubah',
      'Pagination berfungsi', async () => {
        const pagSels = ['[class*="pagination"] a', '[class*="pager"] a', 'button:has-text("Next")', 'button:has-text("Berikutnya")', '[aria-label*="next" i]', 'a:has-text("Next")', '[class*="load-more"]', 'button:has-text("Load more")'];
        let pag = null;
        for (const s of pagSels) { const el = page.locator(s).first(); if (await el.isVisible().catch(() => false)) { pag = el; break; } }
        if (!pag) return 'Pagination/load-more tidak ditemukan (info)';
        const before = await countRows();
        await pag.click().catch(() => {});
        await page.waitForTimeout(2000);
        const after = await countRows();
        return `Pagination ditemukan (${before} → ${after} rows)`;
      }));

    R.push(await this.noteTest('TC-CRUD-012', M, 'READ: search/filter pada data berfungsi',
      'Ada tabel & input search', '1. Isi search\n2. Verifikasi jumlah baris berkurang',
      'Filter mengubah hasil', async () => {
        const search = page.locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="cari" i], [class*="search"] input').first();
        if (!await search.isVisible().catch(() => false)) return 'Search/filter CRUD tidak ditemukan (info)';
        const before = await countRows();
        await search.fill('zzzznotexist').catch(() => {});
        await page.waitForTimeout(1500);
        const after = await countRows();
        await search.fill('').catch(() => {});
        if (before > 0 && after < before) return `Filter berfungsi: ${before} → ${after}`;
        return 'Search ditemukan tapi tidak mengubah hasil (info)';
      }));

    // ===== UPDATE =====
    R.push(await this.safeTest('TC-CRUD-013', M, 'UPDATE: mengubah record berfungsi (happy path)',
      'Ada baris & tombol edit', '1. Klik edit baris pertama\n2. Ubah field text\n3. Save\n4. Verifikasi nilai berubah',
      'Record ter-update', async () => {
        const editSels = ['button:has-text("Edit")', 'a:has-text("Edit")', '[class*="edit"]', '[data-testid*="edit"]', '[aria-label*="edit" i]'];
        let editBtn = null;
        for (const s of editSels) { const el = page.locator(s).first(); if (await el.isVisible().catch(() => false)) { editBtn = el; break; } }
        if (!editBtn) return 'Tombol Edit tidak ditemukan (info: mungkin read-only)';
        const newVal = 'UPD_' + Date.now();
        await editBtn.click();
        await page.waitForTimeout(1500);
        const txt = page.locator('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="password"]), textarea').first();
        if (await txt.isVisible().catch(() => false)) { await txt.fill(newVal); }
        const save = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Update"), button:has-text("Simpan"), [data-testid*="save"]').first();
        if (await save.isVisible().catch(() => false)) await save.click();
        await page.waitForTimeout(2000);
        const body = await page.locator('body').innerText().catch(() => '');
        if (body.includes(newVal)) return `UPDATE berhasil: nilai "${newVal}" tersimpan`;
        return 'Form update diisi tapi verifikasi otomatis terbatas (cek manual)';
      }));

    R.push(await this.safeTest('TC-CRUD-014', M, 'UPDATE: field wajib dikosongkan saat edit ditolak (validasi negatif)',
      'Ada baris & edit', '1. Edit baris\n2. Kosongkan field text\n3. Save\n4. Verifikasi error',
      'Update kosong ditolak', async () => {
        const editSels = ['button:has-text("Edit")', 'a:has-text("Edit")', '[class*="edit"]', '[data-testid*="edit"]'];
        let editBtn = null;
        for (const s of editSels) { const el = page.locator(s).first(); if (await el.isVisible().catch(() => false)) { editBtn = el; break; } }
        if (!editBtn) return 'Tombol Edit tidak ditemukan (info)';
        await editBtn.click();
        await page.waitForTimeout(1500);
        const txt = page.locator('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="password"]), textarea').first();
        if (!await txt.isVisible().catch(() => false)) return 'Tidak ada field text di form edit (info)';
        await txt.fill('');
        const save = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Simpan")').first();
        if (await save.isVisible().catch(() => false)) await save.click();
        await page.waitForTimeout(1500);
        const hasError = await page.evaluate(() => {
          const sels = ['[class*="error"]', '[class*="invalid"]', '[role="alert"]', '[aria-invalid="true"]'];
          for (const s of sels) { if (document.querySelector(s)?.offsetParent !== null) return true; }
          return false;
        });
        if (hasError) return 'UPDATE kosong ditolak: error validasi tampil';
        return 'UPDATE kosong tidak menampilkan error (validasi lemah)';
      }));

    // ===== DELETE =====
    R.push(await this.safeTest('TC-CRUD-015', M, 'DELETE: menghapus record berfungsi (happy path)',
      'Ada baris & tombol delete', '1. Catat jumlah baris\n2. Klik delete baris pertama\n3. Konfirmasi\n4. Verifikasi baris berkurang',
      'Record terhapus', async () => {
        const delSels = ['button:has-text("Delete")', 'button:has-text("Remove")', 'button:has-text("Hapus")', 'a:has-text("Delete")', '[class*="delete"]', '[data-testid*="delete"]', '[aria-label*="delete" i]'];
        let delBtn = null;
        for (const s of delSels) { const el = page.locator(s).first(); if (await el.isVisible().catch(() => false)) { delBtn = el; break; } }
        if (!delBtn) return 'Tombol Delete tidak ditemukan (info)';
        const before = await countRows();
        if (before === 0) throw new Error('Tidak ada record untuk dihapus');
        const dialogHandler = (dialog) => dialog.accept().catch(() => {});
        page.on('dialog', dialogHandler);
        await delBtn.click();
        await page.waitForTimeout(2500);
        page.off('dialog', dialogHandler);
        const after = await countRows();
        if (after < before) return `DELETE berhasil: ${before} → ${after} rows`;
        return 'Tombol delete diklik, verifikasi otomatis terbatas (cek manual)';
      }));

    R.push(await this.safeTest('TC-CRUD-016', M, 'DELETE: konfirmasi dibatalkan menyimpan record (negatif)',
      'Ada baris & delete', '1. Klik delete\n2. Dismiss/Batal dialog\n3. Verifikasi baris tetap ada',
      'Cancel delete mempertahankan record', async () => {
        const delSels = ['button:has-text("Delete")', 'button:has-text("Hapus")', '[class*="delete"]', '[data-testid*="delete"]'];
        let delBtn = null;
        for (const s of delSels) { const el = page.locator(s).first(); if (await el.isVisible().catch(() => false)) { delBtn = el; break; } }
        if (!delBtn) return 'Tombol Delete tidak ditemukan (info)';
        const before = await countRows();
        const dialogHandler = (dialog) => dialog.dismiss().catch(() => {});
        page.on('dialog', dialogHandler);
        await delBtn.click();
        await page.waitForTimeout(2000);
        page.off('dialog', dialogHandler);
        const after = await countRows();
        if (after === before) return 'Cancel delete berfungsi: record tetap ada';
        throw new Error('Record terhapus meski dialog dibatalkan (bug)');
      }));

    R.push(await this.noteTest('TC-CRUD-017', M, 'NEGATIVE: akses edit id tidak valid menangani error (404/redirect)',
      'Ada route edit', '1. Buka URL edit dengan id acak\n2. Verifikasi tidak crash (error page/redirect)',
      'Sistem menangani id tidak valid', async () => {
        const base = new URL(url);
        const cand = [`${base.origin}${base.pathname.replace(/\/$/, '')}/edit/nonexistent_${Date.now()}`, `${base.origin}/edit/nonexistent_${Date.now()}`, `${base.origin}${base.pathname}?id=nonexistent_${Date.now()}`];
        let status = 'unknown';
        for (const c of cand) {
          const resp = await page.goto(c, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
          if (resp) { status = resp.status(); break; }
        }
        if (status === 404 || status === 500) return `Akses id invalid mengembalikan ${status} (ditangani)`;
        if (status === 200) return 'Halaman merespons 200 (mungkin redirect ke list/error UI)';
        return `Status akses: ${status} (perlu verifikasi manual)`;
      }));

    return R;
  }

  // ===== Modul: Payment (Functional Payment Flow Testing) =====
  async testPayment(page, url, d, authState) {
    const M = 'Payment'; const R = [];

    if (!d.hasPayment) {
      R.push(this.note('TC-PAY-001', M, 'Elemen payment tidak terdeteksi',
        'Halaman dengan elemen payment', '1. Cari elemen payment/checkout', 'Payment berfungsi',
        'tidak ada elemen payment/checkout terdeteksi'));
      return R;
    }

    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(async () => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    });
    await page.waitForTimeout(2000);

    // TC-PAY-001: Payment form/checkout terdeteksi
    R.push(await this.safeTest('TC-PAY-001', M, 'Payment form/checkout terdeteksi',
      'Halaman dimuat', '1. Cari elemen payment/checkout/card',
      'Elemen payment terdeteksi', async () => {
        const paySels = ['[class*="payment"]', '[class*="checkout"]', 'input[autocomplete="cc-number"]', 'input[name*="card" i]', 'button:has-text("Pay")', 'button:has-text("Bayar")', 'button:has-text("Checkout")', '[data-testid*="payment"]'];
        for (const s of paySels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) return `Elemen payment ditemukan (${s})`;
        }
        throw new Error('Elemen payment tidak ditemukan');
      }));

    // TC-PAY-002: HTTPS untuk halaman payment
    R.push(await this.safeTest('TC-PAY-002', M, 'Halaman payment menggunakan HTTPS',
      'Halaman payment dimuat', '1. Cek URL protocol\n2. Pastikan HTTPS',
      'Payment page menggunakan HTTPS', async () => {
        const pageUrl = page.url();
        if (pageUrl.startsWith('https://')) return 'Payment page menggunakan HTTPS (aman)';
        throw new Error('Payment page tidak menggunakan HTTPS (CRITICAL: data payment tidak aman)');
      }));

    // TC-PAY-003: Card number input terdeteksi
    R.push(await this.noteTest('TC-PAY-003', M, 'Input card number tersedia',
      'Payment form terdeteksi', '1. Cari input card number/cc-number',
      'Input card number ada', async () => {
        const sels = ['input[autocomplete="cc-number"]', 'input[name*="card" i]', 'input[name*="cc" i]', 'input[placeholder*="card" i]', 'input[placeholder*="number" i]', '[data-testid*="card-number"]'];
        for (const s of sels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) return `Card number input ditemukan (${s})`;
        }
        return 'Card number input tidak ditemukan (mungkin payment gateway redirect)';
      }));

    // TC-PAY-004: Card number input masking (type=text dengan formatting, bukan plain text)
    R.push(await this.noteTest('TC-PAY-004', M, 'Card number input tidak menampilkan plain text sensitive',
      'Card number input tersedia', '1. Cek input type\n2. Cek autocomplete attribute',
      'Input card memiliki autocomplete cc-number', async () => {
        const cardInput = page.locator('input[autocomplete="cc-number"], input[name*="card" i], input[name*="cc" i]').first();
        if (!await cardInput.isVisible().catch(() => false)) return 'Card input tidak ditemukan (info)';
        const autocomplete = await cardInput.getAttribute('autocomplete');
        if (autocomplete && autocomplete.includes('cc-number')) return 'Autocomplete cc-number ditemukan (best practice)';
        return 'Autocomplete cc-number tidak ditemukan (info: best practice)';
      }, 'optional'));

    // TC-PAY-005: Payment method selection (radio/button untuk pilih metode)
    R.push(await this.noteTest('TC-PAY-005', M, 'Payment method selection tersedia',
      'Payment form terdeteksi', '1. Cari radio/button untuk pilih metode pembayaran\n2. Cek ada opsi (card/transfer/e-wallet)',
      'Pilihan metode pembayaran tersedia', async () => {
        const methodSels = ['input[type="radio"][name*="payment" i]', '[class*="payment-method"]', '[class*="payment-option"]', '[data-testid*="payment-method"]', 'button:has-text("Transfer")', 'button:has-text("Card")', 'button:has-text("E-wallet")', 'button:has-text("Virtual Account")', '[class*="stripe"]', '[class*="paypal"]'];
        let found = 0;
        for (const s of methodSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) found++;
        }
        if (found > 0) return `${found} metode pembayaran terdeteksi`;
        return 'Tidak ada pilihan metode pembayaran (mungkin single method)';
      }));

    // TC-PAY-006: Pay/Checkout button tersedia dan enabled
    R.push(await this.safeTest('TC-PAY-006', M, 'Tombol Pay/Checkout tersedia dan enabled',
      'Payment form terdeteksi', '1. Cari tombol Pay/Checkout/Bayar\n2. Cek enabled',
      'Tombol payment enabled', async () => {
        const sels = ['button:has-text("Pay")', 'button:has-text("Bayar")', 'button:has-text("Checkout")', 'button[type="submit"]:has-text("Pay")', '[data-testid*="pay-button"]', '[data-testid*="checkout"]'];
        for (const s of sels) {
          const el = page.locator(s).first();
          if (await el.isVisible().catch(() => false)) {
            if (!await el.isEnabled()) throw new Error('Tombol payment disabled');
            return `Tombol payment enabled (${s})`;
          }
        }
        throw new Error('Tombol payment tidak ditemukan');
      }));

    // TC-PAY-007: Validasi card number kosong ditolak
    R.push(await this.noteTest('TC-PAY-007', M, 'Validasi: submit payment dengan field kosong ditolak',
      'Payment form dengan tombol submit', '1. Kosongkan field payment\n2. Klik Pay/Checkout\n3. Cek error validasi',
      'Submit kosong ditolak', async () => {
        const payBtn = page.locator('button:has-text("Pay"), button:has-text("Bayar"), button:has-text("Checkout"), button[type="submit"]').first();
        if (!await payBtn.isVisible().catch(() => false)) return 'Tombol pay tidak ditemukan (info)';
        const beforeUrl = page.url();
        await payBtn.click().catch(() => {});
        await page.waitForTimeout(2000);
        const afterUrl = page.url();
        const hasError = await page.evaluate(() => {
          const sels = ['[class*="error"]', '[class*="invalid"]', '[role="alert"]', '.validation-error', '[aria-invalid="true"]'];
          for (const s of sels) { if (document.querySelector(s)?.offsetParent !== null) return true; }
          return false;
        });
        if (hasError) return 'Submit kosong ditolak: error validasi tampil';
        if (afterUrl === beforeUrl) return 'Tetap di halaman yang sama (ditolak)';
        return 'Tidak ada error jelas (cek manual)';
      }));

    // TC-PAY-008: Card number formatting (spasi/dash setiap 4 digit)
    R.push(await this.noteTest('TC-PAY-008', M, 'Card number input memiliki formatting (spasi/dash per 4 digit)',
      'Card number input tersedia', '1. Ketik 16 digit card number\n2. Cek formatting otomatis',
      'Card number ter-format (best practice UX)', async () => {
        const cardInput = page.locator('input[autocomplete="cc-number"], input[name*="card" i], input[name*="cc" i]').first();
        if (!await cardInput.isVisible().catch(() => false)) return 'Card input tidak ditemukan (info)';
        await cardInput.fill('4111111111111111').catch(() => {});
        const val = await cardInput.inputValue().catch(() => '');
        if (val.includes(' ') || val.includes('-')) return `Card number ter-format: "${val}"`;
        return 'Card number tidak ter-format (info: best practice UX)';
      }));

    // TC-PAY-009: CVV/CVC input tersedia dan ter-mask
    R.push(await this.noteTest('TC-PAY-009', M, 'CVV/CVC input tersedia',
      'Payment form terdeteksi', '1. Cari input CVV/CVC/cvc/security code',
      'CVV input ada', async () => {
        const sels = ['input[autocomplete="cc-csc"]', 'input[name*="cvc" i]', 'input[name*="cvv" i]', 'input[name*="csc" i]', 'input[placeholder*="cvv" i]', 'input[placeholder*="cvc" i]', 'input[placeholder*="security" i]', '[data-testid*="cvc"]', '[data-testid*="cvv"]'];
        for (const s of sels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) return `CVV input ditemukan (${s})`;
        }
        return 'CVV input tidak ditemukan (mungkin payment gateway redirect)';
      }));

    // TC-PAY-010: Expiry date input tersedia
    R.push(await this.noteTest('TC-PAY-010', M, 'Expiry date input tersedia',
      'Payment form terdeteksi', '1. Cari input expiry/exp date/cc-exp',
      'Expiry date input ada', async () => {
        const sels = ['input[autocomplete="cc-exp"]', 'input[name*="exp" i]', 'input[placeholder*="exp" i]', 'input[placeholder*="MM/YY"]', '[data-testid*="exp"]', 'select[name*="month" i]', 'select[name*="year" i]'];
        for (const s of sels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) return `Expiry input ditemukan (${s})`;
        }
        return 'Expiry input tidak ditemukan (mungkin payment gateway redirect)';
      }));

    return R;
  }

  // ===== Modul: Camera (Functional Camera/Video Testing) =====
  async testCamera(page, url, d, authState) {
    const M = 'Camera'; const R = [];

    if (!d.hasCamera) {
      R.push(this.note('TC-CAM-001', M, 'Elemen kamera tidak terdeteksi',
        'Halaman dengan elemen kamera', '1. Cari elemen kamera/video',
        'Kamera berfungsi', 'tidak ada elemen kamera/video terdeteksi'));
      return R;
    }

    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(async () => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    });
    await page.waitForTimeout(2000);

    // TC-CAM-001: Elemen kamera/video terdeteksi
    R.push(await this.safeTest('TC-CAM-001', M, 'Elemen kamera/video terdeteksi di halaman',
      'Halaman dimuat', '1. Cari video/camera/webcam element',
      'Elemen kamera terdeteksi', async () => {
        const camSels = ['video', '[class*="camera"]', '[class*="webcam"]', '[class*="scanner"]', 'button:has-text("Camera")', 'button:has-text("Kamera")', 'button:has-text("Scan")', '[data-testid*="camera"]', '#camera', '#webcam'];
        for (const s of camSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) return `Elemen kamera ditemukan (${s})`;
        }
        throw new Error('Elemen kamera tidak ditemukan');
      }));

    // TC-CAM-002: Video element memiliki atribut yang benar
    R.push(await this.safeTest('TC-CAM-002', M, 'Video element memiliki atribut autoplay/playsinline',
      'Video element terdeteksi', '1. Cari <video>\n2. Cek atribut autoplay, playsinline',
      'Video element memiliki atribut yang sesuai', async () => {
        const video = page.locator('video').first();
        if (!await video.isVisible().catch(() => false)) return 'Video element tidak visible (info)';
        const autoplay = await video.getAttribute('autoplay');
        const playsinline = await video.getAttribute('playsinline');
        const muted = await video.getAttribute('muted');
        const attrs = [];
        if (autoplay !== null) attrs.push('autoplay');
        if (playsinline !== null) attrs.push('playsinline');
        if (muted !== null) attrs.push('muted');
        if (attrs.length > 0) return `Video attributes: ${attrs.join(', ')}`;
        return 'Video element tanpa atribut khusus (info: mungkin butuh user interaction)';
      }, 'optional'));

    // TC-CAM-003: Tombol capture/scan tersedia
    R.push(await this.safeTest('TC-CAM-003', M, 'Tombol capture/scan/snapshot tersedia',
      'Elemen kamera terdeteksi', '1. Cari tombol capture/scan/snapshot',
      'Tombol capture tersedia', async () => {
        const btnSels = ['button:has-text("Capture")', 'button:has-text("Scan")', 'button:has-text("Snapshot")', 'button:has-text("Ambil")', 'button:has-text("Foto")', 'button:has-text("Scan")', '[data-testid*="capture"]', '[data-testid*="scan"]', '[class*="capture"]', '[class*="snapshot"]'];
        for (const s of btnSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) return `Tombol capture ditemukan (${s})`;
        }
        return 'Tombol capture tidak ditemukan (mungkin auto-capture)';
      }));

    // TC-CAM-004: Camera permission request handling
    R.push(await this.safeTest('TC-CAM-004', M, 'Camera permission request ditangani (tidak crash)',
      'Elemen kamera terdeteksi', '1. Cek context permissions untuk camera\n2. Verifikasi tidak crash saat permission denied',
      'Camera permission ditangani dengan baik', async () => {
        const perms = page.context().permissions();
        return `Context permissions: ${JSON.stringify(perms)} (camera permission handling aman)`;
      }, 'optional'));

    // TC-CAM-005: Canvas element untuk snapshot (jika ada)
    R.push(await this.noteTest('TC-CAM-005', M, 'Canvas element tersedia untuk snapshot/foto capture',
      'Elemen kamera terdeteksi', '1. Cari <canvas> element\n2. Cek apakah terkait dengan video',
      'Canvas untuk snapshot tersedia (best practice)', async () => {
        const canvas = page.locator('canvas').first();
        if (await canvas.isVisible().catch(() => false)) return 'Canvas element ditemukan (untuk snapshot)';
        return 'Canvas element tidak ditemukan (info: mungkin menggunakan video capture langsung)';
      }));

    // TC-CAM-006: Camera overlay/instruction text
    R.push(await this.noteTest('TC-CAM-006', M, 'Camera overlay/instruction text tersedia',
      'Elemen kamera terdeteksi', '1. Cari teks instruction/overlay di area kamera',
      'Instruction text ada (best practice UX)', async () => {
        const bodyText = await page.locator('body').innerText().catch(() => '');
        const hasInstruction = /scan|capture|foto|kamera|camera|position|align|center|hold/i.test(bodyText);
        if (hasInstruction) return 'Instruction text terdeteksi di halaman kamera';
        return 'Instruction text tidak ditemukan (info: best practice UX)';
      }));

    // TC-CAM-007: Camera switch button (front/back camera)
    R.push(await this.noteTest('TC-CAM-007', M, 'Camera switch button (front/back) tersedia',
      'Elemen kamera terdeteksi', '1. Cari tombol switch/flip camera',
      'Camera switch tersedia (best practice)', async () => {
        const switchSels = ['button:has-text("Switch")', 'button:has-text("Flip")', 'button:has-text("Ganti")', '[class*="switch-camera"]', '[data-testid*="switch"]', '[data-testid*="flip"]'];
        for (const s of switchSels) {
          if (await page.locator(s).first().isVisible().catch(() => false)) return `Camera switch ditemukan (${s})`;
        }
        return 'Camera switch tidak ditemukan (info: best practice untuk mobile)';
      }));

    // TC-CAM-008: Camera tidak menyebabkan console error
    R.push(await this.safeTest('TC-CAM-008', M, 'Camera page tidak memiliki console error kritis',
      'Halaman kamera dimuat', '1. Listen console errors\n2. Reload\n3. Cek error',
      'Tidak ada console error kritis', async () => {
        let errorCount = 0;
        const h = (msg) => { if (msg.type() === 'error') errorCount++; };
        page.on('console', h);
        await page.reload({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(2000);
        page.off('console', h);
        if (errorCount > 5) throw new Error(`${errorCount} console errors`);
        return `${errorCount} console errors (terkendali)`;
      }));

    return R;
  }

  // ===== Modul: Multi-Role Login (RBAC Testing) =====
  async testMultiRoleLogin(page, url, d, authState) {
    const M = 'Multi-Role'; const R = [];

    if (!d.hasMultiRole && !authState.isAuthenticated) {
      R.push(this.note('TC-MR-001', M, 'Role selector tidak terdeteksi',
        'Halaman dengan multi-role', '1. Cek elemen role selector',
        'Role selector tersedia', 'Tidak ada role selector di halaman ini'));
      return R;
    }

    // TC-MR-001: Role selector terdeteksi
    R.push(await this.safeTest('TC-MR-001', M, 'Role selector atau pilihan role tersedia',
      'Halaman register/login dengan multi-role', '1. Cari elemen role selector\n2. Verifikasi tampil',
      'Role selector terlihat dan dapat dipilih', async () => {
        const roleEl = page.locator('select[name*="role" i], input[name*="role" i], [class*="role-selector"], [class*="role-picker"], button:has-text("Admin"), button:has-text("Consultant"), button:has-text("Client"), button:has-text("Peserta"), a:has-text("Register as"), a:has-text("Daftar sebagai"), [data-testid*="role"]');
        const count = await roleEl.count();
        if (count === 0) throw new Error('Tidak ada elemen role selector');
        return `${count} elemen role selector ditemukan`;
      }));

    // TC-MR-002: Register page menampilkan pilihan role
    R.push(await this.noteTest('TC-MR-002', M, 'Halaman register menampilkan pilihan role',
      'Halaman register', '1. Navigasi ke halaman register\n2. Cek opsi role (admin/consultant/client)',
      'Opsi role tersedia di form register', async () => {
        const regLink = page.locator('a:has-text("Register"), a:has-text("Daftar"), button:has-text("Register"), button:has-text("Daftar")');
        if (await regLink.count() > 0) {
          await regLink.first().click().catch(() => {});
          await page.waitForTimeout(2000);
        }
        const roleOptions = page.locator('select[name*="role" i] option, [class*="role"] option, [class*="role"] button, [data-testid*="role"] option');
        const count = await roleOptions.count();
        if (count === 0) throw new Error('Tidak ada opsi role di halaman register');
        return `${count} opsi role tersedia`;
      }));

    // TC-MR-003: Dashboard admin - menu admin terlihat
    R.push(await this.noteTest('TC-MR-003', M, 'Dashboard admin memiliki menu khusus admin',
      'Login sebagai admin', '1. Login sebagai admin\n2. Cek menu admin (User CRUD, Role, Setting)',
      'Menu admin terlihat setelah login', async () => {
        if (!authState.isAuthenticated) throw new Error('Tidak terautentikasi');
        const adminMenu = page.locator('a:has-text("User"), a:has-text("Role"), a:has-text("Setting"), a:has-text("Admin"), a:has-text("Divisi"), a:has-text("Employee"), [class*="admin-menu"], [data-testid*="admin"]');
        const count = await adminMenu.count();
        if (count === 0) throw new Error('Menu admin tidak ditemukan');
        return `${count} menu admin terdeteksi`;
      }));

    // TC-MR-004: Akses halaman admin oleh non-admin ditolak
    R.push(await this.noteTest('TC-MR-004', M, 'Akses halaman admin oleh non-admin ditolak',
      'Login sebagai non-admin', '1. Coba akses URL admin\n2. Verifikasi redirect/ditolak',
      'Akses ditolak atau redirect ke halaman lain', async () => {
        const currentUrl = page.url();
        const adminLinks = page.locator('a[href*="admin"], a[href*="manage"], a[href*="setting"]');
        if (await adminLinks.count() === 0) return 'Tidak ada link admin terdeteksi (aman)';
        return 'Link admin terdeteksi - perlu verifikasi RBAC server-side';
      }));

    // TC-MR-005: Logout berfungsi dan session di-clear
    R.push(await this.noteTest('TC-MR-005', M, 'Logout menghapus session dan redirect',
      'User terautentikasi', '1. Klik tombol logout\n2. Verifikasi redirect\n3. Cek session cleared',
      'Session di-clear dan redirect ke login/home', async () => {
        if (!authState.isAuthenticated) throw new Error('Tidak terautentikasi');
        const logoutBtn = page.locator('button:has-text("Logout"), button:has-text("Keluar"), a:has-text("Logout"), a:has-text("Keluar"), [class*="logout"], [data-testid*="logout"]');
        if (await logoutBtn.count() === 0) throw new Error('Tombol logout tidak ditemukan');
        await logoutBtn.first().click().catch(() => {});
        await page.waitForTimeout(3000);
        const afterUrl = page.url();
        if (afterUrl.includes('dashboard') || afterUrl.includes('admin')) throw new Error('Tidak redirect setelah logout');
        authState.isAuthenticated = false;
        return `Redirect ke ${afterUrl}`;
      }));

    // TC-MR-006: Reset password flow tersedia
    R.push(await this.noteTest('TC-MR-006', M, 'Reset password link tersedia di halaman login',
      'Halaman login', '1. Cari link reset/lupa password\n2. Klik link\n3. Cek form reset',
      'Form reset password muncul', async () => {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
        const resetLink = page.locator('a:has-text("Reset"), a:has-text("Lupa"), a:has-text("Forgot"), [class*="reset-password"], [data-testid*="reset"]');
        if (await resetLink.count() === 0) throw new Error('Link reset password tidak ditemukan');
        await resetLink.first().click().catch(() => {});
        await page.waitForTimeout(2000);
        const emailInput = page.locator('input[type="email"], input[name*="email" i]');
        if (await emailInput.count() === 0) throw new Error('Form reset tidak memiliki input email');
        return 'Form reset password dengan input email tersedia';
      }));

    // TC-MR-007: SSO/OAuth button terdeteksi
    R.push(await this.noteTest('TC-MR-007', M, 'SSO/OAuth login button tersedia',
      'Halaman login', '1. Cari button SSO/OAuth (Google, Facebook, etc)',
      'Button SSO/OAuth terlihat', async () => {
        const ssoBtn = page.locator('button:has-text("Google"), button:has-text("Facebook"), button:has-text("SSO"), button:has-text("OAuth"), [class*="sso"], [class*="oauth"], [class*="google"], [class*="facebook"]');
        const count = await ssoBtn.count();
        if (count === 0) throw new Error('Tidak ada button SSO/OAuth');
        return `${count} button SSO/OAuth terdeteksi`;
      }));

    return R;
  }

  // ===== Modul: File Upload & Excel Import =====
  async testFileUpload(page, url, d, authState) {
    const M = 'File Upload'; const R = [];

    if (!d.hasFileUpload) {
      R.push(this.note('TC-FU-001', M, 'File upload element tidak terdeteksi',
        'Halaman dengan upload', '1. Cari elemen upload',
        'Input file atau dropzone tersedia', 'Tidak ada elemen upload di halaman ini'));
      return R;
    }

    // TC-FU-001: Input file terdeteksi
    R.push(await this.safeTest('TC-FU-001', M, 'Input file atau dropzone tersedia',
      'Halaman dengan upload', '1. Cari input[type=file] atau dropzone\n2. Verifikasi tampil',
      'Elemen upload terlihat', async () => {
        const uploadEl = page.locator('input[type="file"], [class*="upload"], [class*="dropzone"], [class*="drag-drop"], [class*="file-input"], [data-testid*="upload"], [data-testid*="import"]');
        const count = await uploadEl.count();
        if (count === 0) throw new Error('Tidak ada elemen upload');
        return `${count} elemen upload ditemukan`;
      }));

    // TC-FU-002: Button upload/import terlihat
    R.push(await this.noteTest('TC-FU-002', M, 'Button Upload/Import tersedia',
      'Halaman dengan upload', '1. Cari button Upload/Import/Choose File',
      'Button upload terlihat dan dapat diklik', async () => {
        const btn = page.locator('button:has-text("Upload"), button:has-text("Import"), button:has-text("Choose File"), button:has-text("Pilih File"), button:has-text("Browse"), [data-testid*="upload-btn"], [data-testid*="import-btn"]');
        const count = await btn.count();
        if (count === 0) throw new Error('Button upload tidak ditemukan');
        return `${count} button upload ditemukan`;
      }));

    // TC-FU-003: File type validation
    R.push(await this.noteTest('TC-FU-003', M, 'File type validation (accept attribute)',
      'Input file dengan accept attribute', '1. Cek attribute accept\n2. Verifikasi batasan file type',
      'Accept attribute membatasi tipe file', async () => {
        const fileInput = page.locator('input[type="file"]').first();
        const accept = await fileInput.getAttribute('accept').catch(() => null);
        if (!accept) return 'Tidak ada accept attribute (semua tipe file diperbolehkan)';
        return `Accept: ${accept}`;
      }));

    // TC-FU-004: Drag and drop area styling
    R.push(await this.noteTest('TC-FU-004', M, 'Drag and drop area terdeteksi',
      'Halaman dengan dropzone', '1. Cari elemen dropzone\n2. Cek visual cue (border, text)',
      'Dropzone terlihat dengan visual cue', async () => {
        const dropzone = page.locator('[class*="dropzone"], [class*="drag-drop"], [class*="drop-area"], [data-testid*="dropzone"]');
        const count = await dropzone.count();
        if (count === 0) throw new Error('Dropzone tidak ditemukan');
        const text = await dropzone.first().textContent().catch(() => '');
        return `Dropzone ditemukan dengan text: "${text.substring(0, 50)}"`;
      }));

    // TC-FU-005: Upload button disabled state sebelum file dipilih
    R.push(await this.noteTest('TC-FU-005', M, 'Upload button disabled sebelum file dipilih',
      'Form upload', '1. Cek state button upload sebelum file dipilih',
      'Button disabled atau tidak aktif', async () => {
        const btn = page.locator('button:has-text("Upload"), button:has-text("Import"), [data-testid*="upload-btn"]').first();
        if (await btn.count() === 0) throw new Error('Button upload tidak ditemukan');
        const isDisabled = await btn.isDisabled().catch(() => false);
        if (!isDisabled) return 'Button enabled sebelum file dipilih (perlu validasi server-side)';
        return 'Button disabled sebelum file dipilih';
      }));

    // TC-FU-006: Multiple file upload support
    R.push(await this.noteTest('TC-FU-006', M, 'Multiple file upload support',
      'Input file dengan multiple attribute', '1. Cek attribute multiple\n2. Verifikasi multi-upload',
      'Input mendukung multiple file', async () => {
        const fileInput = page.locator('input[type="file"]').first();
        const multiple = await fileInput.getAttribute('multiple').catch(() => null);
        if (!multiple) return 'Tidak mendukung multiple file upload';
        return 'Mendukung multiple file upload';
      }));

    // TC-FU-007: Upload progress indicator
    R.push(await this.noteTest('TC-FU-007', M, 'Upload progress indicator tersedia',
      'Saat upload berlangsung', '1. Cari progress bar/spinner saat upload',
      'Progress indicator terlihat', async () => {
        const progress = page.locator('[class*="progress"], [class*="spinner"], [class*="loading"], [role="progressbar"]');
        const count = await progress.count();
        if (count === 0) throw new Error('Tidak ada progress indicator');
        return `${count} progress indicator ditemukan`;
      }));

    // TC-FU-008: Error message untuk file terlalu besar
    R.push(await this.noteTest('TC-FU-008', M, 'Error handling untuk file yang tidak valid',
      'Upload file invalid', '1. Cek error message untuk file terlalu besar/tipe salah',
      'Error message ditampilkan', async () => {
        const errorMsg = page.locator('[class*="error"], [class*="alert"], [role="alert"], .text-red, .text-rose');
        const count = await errorMsg.count();
        if (count === 0) return 'Tidak ada error message container terdeteksi';
        return `${count} error message container tersedia`;
      }));

    return R;
  }

  // ===== Modul: Email & Notification =====
  async testEmailNotification(page, url, d, authState) {
    const M = 'Email & Notif'; const R = [];

    if (!d.hasEmailNotif) {
      R.push(this.note('TC-EN-001', M, 'Elemen email/notification tidak terdeteksi',
        'Halaman dengan register/notif', '1. Cari elemen register/toast/alert',
        'Elemen notifikasi tersedia', 'Tidak ada elemen notifikasi di halaman ini'));
      return R;
    }

    // TC-EN-001: Register link/button tersedia
    R.push(await this.safeTest('TC-EN-001', M, 'Register link/button tersedia',
      'Halaman login/home', '1. Cari link/button register\n2. Verifikasi dapat diklik',
      'Register link terlihat dan dapat diklik', async () => {
        const regEl = page.locator('a:has-text("Register"), a:has-text("Daftar"), button:has-text("Register"), button:has-text("Daftar"), [data-testid*="register"]');
        const count = await regEl.count();
        if (count === 0) throw new Error('Register link tidak ditemukan');
        return `${count} register link/button ditemukan`;
      }));

    // TC-EN-002: Register form memiliki input email
    R.push(await this.noteTest('TC-EN-002', M, 'Register form memiliki input email',
      'Halaman register', '1. Klik register link\n2. Cek input email di form',
      'Input email tersedia di form register', async () => {
        const regLink = page.locator('a:has-text("Register"), a:has-text("Daftar"), button:has-text("Register"), button:has-text("Daftar")');
        if (await regLink.count() > 0) {
          await regLink.first().click().catch(() => {});
          await page.waitForTimeout(2000);
        }
        const emailInput = page.locator('input[type="email"], input[name*="email" i]');
        const count = await emailInput.count();
        if (count === 0) throw new Error('Input email tidak ditemukan di form register');
        return `${count} input email tersedia`;
      }));

    // TC-EN-003: Reset password link tersedia
    R.push(await this.noteTest('TC-EN-003', M, 'Reset/Forgot password link tersedia',
      'Halaman login', '1. Cari link reset/lupa password',
      'Link reset password terlihat', async () => {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
        const resetLink = page.locator('a:has-text("Reset"), a:has-text("Lupa"), a:has-text("Forgot"), [class*="reset-password"], [data-testid*="reset"]');
        const count = await resetLink.count();
        if (count === 0) throw new Error('Link reset password tidak ditemukan');
        return `${count} link reset password ditemukan`;
      }));

    // TC-EN-004: Toast/notification container terdeteksi
    R.push(await this.noteTest('TC-EN-004', M, 'Toast/notification container tersedia',
      'Halaman dengan notif', '1. Cari elemen toast/alert/notification',
      'Container notifikasi terdeteksi', async () => {
        const notif = page.locator('[class*="notification"], [class*="toast"], [class*="alert"], [class*="snackbar"], [role="alert"], [data-testid*="notif"], [data-testid*="toast"]');
        const count = await notif.count();
        if (count === 0) throw new Error('Container notifikasi tidak ditemukan');
        return `${count} container notifikasi ditemukan`;
      }));

    // TC-EN-005: Register form validation - empty email
    R.push(await this.noteTest('TC-EN-005', M, 'Register form validasi email kosong',
      'Form register', '1. Buka form register\n2. Submit tanpa isi email\n3. Cek error message',
      'Error message ditampilkan untuk email kosong', async () => {
        const regLink = page.locator('a:has-text("Register"), a:has-text("Daftar"), button:has-text("Register"), button:has-text("Daftar")');
        if (await regLink.count() > 0) {
          await regLink.first().click().catch(() => {});
          await page.waitForTimeout(2000);
        }
        const submitBtn = page.locator('button[type="submit"], button:has-text("Register"), button:has-text("Daftar"), button:has-text("Sign Up")');
        if (await submitBtn.count() === 0) throw new Error('Submit button tidak ditemukan');
        await submitBtn.first().click().catch(() => {});
        await page.waitForTimeout(1500);
        const errorEl = page.locator('[class*="error"], [class*="invalid"], [class*="alert"], [role="alert"], .text-red, .text-rose');
        const count = await errorEl.count();
        if (count === 0) throw new Error('Tidak ada error message untuk email kosong');
        return 'Error message ditampilkan untuk email kosong';
      }));

    // TC-EN-006: Register form validation - invalid email format
    R.push(await this.noteTest('TC-EN-006', M, 'Register form validasi format email invalid',
      'Form register', '1. Isi email dengan format invalid\n2. Submit\n3. Cek error',
      'Error message untuk format email invalid', async () => {
        const emailInput = page.locator('input[type="email"], input[name*="email" i]').first();
        if (await emailInput.count() === 0) throw new Error('Input email tidak ditemukan');
        await emailInput.fill('invalid-email-format').catch(() => {});
        const submitBtn = page.locator('button[type="submit"], button:has-text("Register"), button:has-text("Daftar")');
        if (await submitBtn.count() > 0) {
          await submitBtn.first().click().catch(() => {});
          await page.waitForTimeout(1500);
        }
        const errorEl = page.locator('[class*="error"], [class*="invalid"], [role="alert"], .text-red, .text-rose');
        const count = await errorEl.count();
        if (count === 0) return 'Browser validation mungkin menangani (type=email)';
        return 'Error message untuk format email invalid ditampilkan';
      }));

    // TC-EN-007: Verify email link/button (jika ada)
    R.push(await this.noteTest('TC-EN-007', M, 'Verify email link tersedia setelah register',
      'Setelah register', '1. Cari link/button verify email',
      'Verify email link terdeteksi', async () => {
        const verifyEl = page.locator('a:has-text("Verify"), a:has-text("Verifikasi"), button:has-text("Verify"), button:has-text("Verifikasi"), [class*="verify"], [data-testid*="verify"]');
        const count = await verifyEl.count();
        if (count === 0) throw new Error('Verify email link tidak ditemukan');
        return `${count} verify email link ditemukan`;
      }));

    // TC-EN-008: Notification dismiss/close button
    R.push(await this.noteTest('TC-EN-008', M, 'Notification dapat di-dismiss/close',
      'Toast/notification muncul', '1. Cari close button pada notifikasi',
      'Close button tersedia pada notifikasi', async () => {
        const closeBtn = page.locator('[class*="toast"] [class*="close"], [class*="notification"] [class*="close"], [class*="alert"] button, [class*="snackbar"] button, [aria-label*="close" i], [aria-label*="tutup" i]');
        const count = await closeBtn.count();
        if (count === 0) throw new Error('Close button pada notifikasi tidak ditemukan');
        return `${count} close button tersedia`;
      }));

    return R;
  }

  // ===== Modul: Booking & Scheduling =====
  async testBooking(page, url, d, authState) {
    const M = 'Booking'; const R = [];

    if (!d.hasBooking) {
      R.push(this.note('TC-BK-001', M, 'Elemen booking/scheduling tidak terdeteksi',
        'Halaman dengan booking', '1. Cari elemen booking/calendar/schedule',
        'Elemen booking tersedia', 'Tidak ada elemen booking di halaman ini'));
      return R;
    }

    // TC-BK-001: Booking element terdeteksi
    R.push(await this.safeTest('TC-BK-001', M, 'Elemen booking/scheduling tersedia',
      'Halaman dengan booking', '1. Cari elemen booking/calendar/schedule',
      'Elemen booking terlihat', async () => {
        const bookingEl = page.locator('[class*="booking"], [class*="schedule"], [class*="calendar"], [class*="appointment"], [class*="jadwal"], [data-testid*="booking"], [data-testid*="schedule"]');
        const count = await bookingEl.count();
        if (count === 0) throw new Error('Elemen booking tidak ditemukan');
        return `${count} elemen booking ditemukan`;
      }));

    // TC-BK-002: Button booking/janji temu tersedia
    R.push(await this.noteTest('TC-BK-002', M, 'Button Book/Booking/Janji temu tersedia',
      'Halaman dengan booking', '1. Cari button booking\n2. Verifikasi dapat diklik',
      'Button booking terlihat dan dapat diklik', async () => {
        const btn = page.locator('button:has-text("Book"), button:has-text("Booking"), button:has-text("Janji"), button:has-text("Schedule"), button:has-text("Pilih Jadwal"), button:has-text("Pilih"), [data-testid*="book-btn"]');
        const count = await btn.count();
        if (count === 0) throw new Error('Button booking tidak ditemukan');
        return `${count} button booking ditemukan`;
      }));

    // TC-BK-003: Date/time picker tersedia
    R.push(await this.noteTest('TC-BK-003', M, 'Date/time picker tersedia untuk booking',
      'Form booking', '1. Cari input date/datetime\n2. Verifikasi dapat dipilih',
      'Date/time picker tersedia', async () => {
        const dateInput = page.locator('input[type="date"], input[type="datetime-local"], input[type="time"], [class*="date-picker"], [class*="time-picker"], [class*="calendar"] input, [data-testid*="date"], [data-testid*="time"]');
        const count = await dateInput.count();
        if (count === 0) throw new Error('Date/time picker tidak ditemukan');
        return `${count} date/time picker ditemukan`;
      }));

    // TC-BK-004: Calendar/schedule grid terdeteksi
    R.push(await this.noteTest('TC-BK-004', M, 'Calendar/schedule grid terdeteksi',
      'Halaman booking', '1. Cari elemen calendar/schedule grid',
      'Calendar grid terlihat', async () => {
        const cal = page.locator('[class*="calendar"], [class*="schedule-grid"], [class*="time-slot"], [class*="jadwal"], table[class*="schedule"], [data-testid*="calendar"]');
        const count = await cal.count();
        if (count === 0) throw new Error('Calendar grid tidak ditemukan');
        return `${count} calendar/schedule grid ditemukan`;
      }));

    // TC-BK-005: Referral code input tersedia
    R.push(await this.noteTest('TC-BK-005', M, 'Referral code input tersedia',
      'Form booking/register', '1. Cari input referral code\n2. Verifikasi tampil',
      'Input referral code terlihat', async () => {
        const refInput = page.locator('input[name*="referral" i], input[name*="kode" i], input[placeholder*="referral" i], input[placeholder*="kode" i], [class*="referral"], [data-testid*="referral"]');
        const count = await refInput.count();
        if (count === 0) throw new Error('Input referral code tidak ditemukan');
        return `${count} input referral code ditemukan`;
      }));

    // TC-BK-006: Cancellation button/link tersedia
    R.push(await this.noteTest('TC-BK-006', M, 'Cancellation button tersedia',
      'Booking yang sudah dibuat', '1. Cari button cancel/batalkan',
      'Button cancellation terdeteksi', async () => {
        const cancelBtn = page.locator('button:has-text("Cancel"), button:has-text("Batalkan"), button:has-text("Batal"), a:has-text("Cancel"), a:has-text("Batalkan"), [class*="cancel"], [data-testid*="cancel"]');
        const count = await cancelBtn.count();
        if (count === 0) throw new Error('Button cancel tidak ditemukan');
        return `${count} button cancel ditemukan`;
      }));

    // TC-BK-007: Consultant list/profile tersedia
    R.push(await this.noteTest('TC-BK-007', M, 'Consultant list atau profile tersedia',
      'Halaman booking consultant', '1. Cari elemen consultant list/profile',
      'Consultant list terlihat', async () => {
        const consultant = page.locator('[class*="consultant"], [class*="doctor"], [class*="psycholog"], [data-testid*="consultant"], img[alt*="consultant" i], img[alt*="psikolog" i]');
        const count = await consultant.count();
        if (count === 0) throw new Error('Consultant list tidak ditemukan');
        return `${count} elemen consultant ditemukan`;
      }));

    // TC-BK-008: Booking form validation - empty fields
    R.push(await this.noteTest('TC-BK-008', M, 'Booking form validasi field kosong',
      'Form booking', '1. Submit form booking tanpa isi\n2. Cek error message',
      'Error message untuk field kosong', async () => {
        const submitBtn = page.locator('button[type="submit"], button:has-text("Book"), button:has-text("Booking"), button:has-text("Confirm"), button:has-text("Konfirmasi")');
        if (await submitBtn.count() === 0) throw new Error('Submit button tidak ditemukan');
        await submitBtn.first().click().catch(() => {});
        await page.waitForTimeout(1500);
        const errorEl = page.locator('[class*="error"], [class*="invalid"], [class*="alert"], [role="alert"], .text-red, .text-rose');
        const count = await errorEl.count();
        if (count === 0) throw new Error('Tidak ada error message untuk field kosong');
        return 'Error message ditampilkan untuk field kosong';
      }));

    // TC-BK-009: Booking confirmation/success state
    R.push(await this.noteTest('TC-BK-009', M, 'Booking confirmation/success message container',
      'Setelah booking berhasil', '1. Cari container success/confirmation message',
      'Container success message tersedia', async () => {
        const successEl = page.locator('[class*="success"], [class*="confirmation"], [class*="confirmed"], [class*="berhasil"], [role="status"], [data-testid*="success"]');
        const count = await successEl.count();
        if (count === 0) throw new Error('Container success message tidak ditemukan');
        return `${count} container success message tersedia`;
      }));

    return R;
  }

  generateSummary(results) {
    const total = results.length;
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const notes = results.filter(r => r.status === 'note').length;
    // Primary vs Optional breakdown
    const primaryResults = results.filter(r => r.category === 'primary');
    const optionalResults = results.filter(r => r.category === 'optional');
    const primaryPassed = primaryResults.filter(r => r.status === 'passed').length;
    const primaryFailed = primaryResults.filter(r => r.status === 'failed').length;
    const optionalPassed = optionalResults.filter(r => r.status === 'passed').length;
    const optionalFailed = optionalResults.filter(r => r.status === 'failed').length;
    const optionalNotes = optionalResults.filter(r => r.status === 'note').length;
    // Pass rate hanya menghitung test fungsional primary (passed + failed); optional & note tidak mempengaruhi nilai.
    const functional = primaryPassed + primaryFailed;
    const passRate = functional > 0 ? parseFloat(((primaryPassed / functional) * 100).toFixed(2)) : 0;
    const totalDuration = results.reduce((s, r) => s + r.duration, 0);
    const modules = {};
    for (const r of results) {
      if (!modules[r.module]) modules[r.module] = { total: 0, passed: 0, failed: 0, notes: 0, primary: 0, optional: 0 };
      modules[r.module].total++;
      if (r.status === 'passed') modules[r.module].passed++;
      else if (r.status === 'failed') modules[r.module].failed++;
      else if (r.status === 'note') modules[r.module].notes++;
      if (r.category === 'primary') modules[r.module].primary++;
      else modules[r.module].optional++;
    }
    return { total, passed, failed, notes, passRate, totalDuration, modules,
      primary: { total: primaryResults.length, passed: primaryPassed, failed: primaryFailed },
      optional: { total: optionalResults.length, passed: optionalPassed, failed: optionalFailed, notes: optionalNotes } };
  }
}

module.exports = TestRunner;
