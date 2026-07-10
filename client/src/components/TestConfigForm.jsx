import { useState } from 'react';
import { Globe, User, Lock, Chrome, Rocket, CheckCircle2, LogIn, LayoutDashboard, ShieldX, DoorOpen, Loader2, AlertCircle } from 'lucide-react';

const TEST_MODULES = [
  { id: 'dashboard', label: 'Dashboard Testing', desc: 'Layout, cards/widgets, navigasi, heading, responsive, search/filter, loading state, user info, console errors, data freshness (24 tes)' },
  { id: 'accessibility', label: 'Aksesibilitas & UI', desc: 'Judul, meta tags, favicon, alt text, atribut lang, keyboard nav, contrast, ARIA, modal focus trap (23 tes)' },
  { id: 'login', label: 'Login & Autentikasi', desc: 'Form login, validasi, kredensial invalid/valid, lupa password, logout, session, case sensitivity, boundary (30 tes)' },
  { id: 'navigation', label: 'Navigasi & Struktur', desc: 'Waktu load, link, menu, footer, heading, back/forward, deep link, search, pagination, autocomplete (20 tes)' },
  { id: 'security', label: 'Keamanan', desc: 'HTTPS, CSRF, CSP, security headers, cookie flags, eval, XSS, CORS, clickjacking protection (22 tes)' },
  { id: 'performance', label: 'Performa', desc: 'Waktu load, FCP, LCP, CLS, long task, cache headers, TTI, page weight (19 tes)' },
  { id: 'responsive', label: 'Desain Responsif', desc: 'Mobile, tablet, desktop, landscape, text overflow, modal responsive, touch spacing (16 tes)' },
  { id: 'form_validation', label: 'Validasi Form', desc: 'Required field, type email, maxlength, autocomplete, pattern, XSS prevention, label, reset, required validation (15 tes)' },
  { id: 'menu_traversal', label: 'Menu Traversal', desc: 'Klik link navigasi/footer, CTA, dropdown, modal, search, tab/accordion, external link (12 tes)' },
  { id: 'api_response', label: 'API Response', desc: 'API error 5xx, response time, content-type, mixed content, cache, CORS, rate limit, credentials (10 tes)' },
  { id: 'cookie_session', label: 'Cookie & Session', desc: 'Cookie flags, path, session, fixation, sensitive data, logout cleanup (9 tes)' },
  { id: 'content_seo', label: 'Content & SEO', desc: 'Meta description, Open Graph, canonical, robots, sitemap, structured data, mobile-friendly (10 tes)' },
  { id: 'crud', label: 'CRUD Operations', desc: 'Create, Read, Update, Delete, validasi negatif, boundary, XSS, unicode, duplicate, pagination, search (17 tes)' },
  { id: 'payment', label: 'Payment Flow', desc: 'Deteksi payment form, HTTPS, card input, CVV, expiry, metode pembayaran, validasi, formatting (10 tes)' },
  { id: 'camera', label: 'Camera & Video', desc: 'Deteksi kamera, video element, capture button, permission, canvas snapshot, instruction, switch camera (8 tes)' },
  { id: 'multi_role', label: 'Multi-Role Login', desc: 'Role selector, register dengan role, dashboard admin, RBAC, logout, reset password, SSO/OAuth (7 tes)' },
  { id: 'file_upload', label: 'File Upload & Excel', desc: 'Input file, dropzone, file type validation, upload button, multiple file, progress indicator, error handling (8 tes)' },
  { id: 'email_notif', label: 'Email & Notification', desc: 'Register form, email validation, reset password, toast/notification, verify email, dismiss button (8 tes)' },
  { id: 'booking', label: 'Booking & Scheduling', desc: 'Booking element, date/time picker, calendar grid, referral code, cancellation, consultant list, form validation (9 tes)' },
];


const TEST_MODES = [
  { id: 'login_dashboard', label: 'Login ke Dashboard', icon: LogIn, desc: 'URL = halaman login. Sistem login dengan akun, lalu tes dashboard setelah login.' },
  { id: 'direct_dashboard', label: 'Langsung Dashboard', icon: LayoutDashboard, desc: 'URL = dashboard langsung. Tidak perlu login, tes langsung di halaman dashboard.' },
  { id: 'login_only', label: 'Halaman Login Saja', icon: ShieldX, desc: 'URL = halaman login. Tes form login tanpa kredensial (validasi, masking, error handling).' },
  { id: 'dashboard_with_login', label: 'Dashboard + Menu Login', icon: DoorOpen, desc: 'URL = dashboard yang punya menu/link login. Tes dashboard + verifikasi link login, lalu login dengan kredensial.' },
];

function TestConfigForm({ onStart, disabled = false }) {
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [browser, setBrowser] = useState('chromium');
  const [testMode, setTestMode] = useState('login_dashboard');
  const [selectedModules, setSelectedModules] = useState(['all']);

  const toggleModule = (id) => {
    if (id === 'all') {
      setSelectedModules(['all']);
    } else {
      setSelectedModules(prev => {
        const withoutAll = prev.filter(m => m !== 'all');
        if (withoutAll.includes(id)) {
          const next = withoutAll.filter(m => m !== id);
          return next.length === 0 ? ['all'] : next;
        }
        return [...withoutAll, id];
      });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!url) return;
    onStart({ url, username, password, browser, testMode, testModules: selectedModules });
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6 sm:mb-8 animate-slide-up">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-500/30 flex-shrink-0">
            <Rocket className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Tes Baru</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">19 modul tes, 300+ test case otomatis</p>
          </div>
        </div>
      </div>

      {disabled && (
        <div className="glass-card p-4 mb-4 rounded-2xl border-2 border-amber-400/60 bg-amber-50/80 dark:bg-amber-900/20 animate-slide-up">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Tes sedang berjalan</p>
              <p className="text-xs text-amber-600 dark:text-amber-500">Tunggu tes saat ini selesai sebelum memulai tes baru. Buka <strong>Live Screen</strong> untuk memantau tes yang berjalan.</p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        <div className="glass-card p-4 sm:p-6 animate-slide-up">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
            <Globe className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            URL Website Target
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            placeholder="https://contoh-website.com"
            className="input-field text-base"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Masukkan URL lengkap termasuk https:// atau http://</p>
        </div>

        <div className="glass-card p-4 sm:p-6 animate-slide-up">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Mode Pengujian</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Pilih mode sesuai jenis halaman yang akan dites agar tes berjalan akurat.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TEST_MODES.map(mode => {
              const Icon = mode.icon;
              const active = testMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setTestMode(mode.id)}
                  className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                    active
                      ? 'border-primary-500 bg-primary-50/80 dark:bg-primary-900/30 shadow-lg shadow-primary-500/10'
                      : 'border-slate-200/60 hover:border-slate-300 dark:border-slate-600/50 dark:hover:border-slate-500'
                  }`}
                >
                  <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${active ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400 dark:text-slate-500'}`} />
                  <div>
                    <p className={`text-sm font-semibold ${active ? 'text-primary-700 dark:text-primary-400' : 'text-slate-900 dark:text-slate-100'}`}>{mode.label}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{mode.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {testMode !== 'direct_dashboard' && (
        <div key={`creds-${testMode}`} className="glass-card p-4 sm:p-6 animate-slide-up">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Kredensial Login</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Isi kredensial untuk login. Tes akan memvalidasi login dengan kredensial invalid dan valid. Untuk mode Halaman Login Saja, kredensial opsional (tes form login).</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                <User className="w-4 h-4" /> Username / Email
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username_anda"
                className="input-field"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                <Lock className="w-4 h-4" /> Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-field"
              />
            </div>
          </div>
        </div>
        )}

        <div className="glass-card p-4 sm:p-6 animate-slide-up">
          <div className="flex items-center gap-3 mb-1">
            <Chrome className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Browser Engine: Chromium</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Menggunakan Chromium engine untuk pengujian otomatis.</p>
        </div>

        <div className="glass-card p-4 sm:p-6 animate-slide-up">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Modul Tes (19 Modul Tersedia)</h3>
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => toggleModule('all')}
              className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                selectedModules.includes('all')
                  ? 'border-primary-500 bg-primary-50/80 dark:bg-primary-900/30 shadow-lg shadow-primary-500/10'
                  : 'border-slate-200/60 hover:border-slate-300 dark:border-slate-600/50 dark:hover:border-slate-500'
              }`}
            >
              <div className="flex items-center gap-3">
                <CheckCircle2 className={`w-5 h-5 ${selectedModules.includes('all') ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400'}`} />
                <div className="text-left">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Semua Modul</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Jalankan semua modul tes yang relevan dengan mode terpilih (300+ test case)</p>
                </div>
              </div>
            </button>

            <div className="grid sm:grid-cols-2 gap-3">
              {TEST_MODULES.map(mod => {
                const selected = selectedModules.includes(mod.id);
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => toggleModule(mod.id)}
                    className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                      selected
                        ? 'border-primary-500 bg-primary-50/80 dark:bg-primary-900/30 shadow-lg shadow-primary-500/10'
                        : 'border-slate-200/60 hover:border-slate-300 dark:border-slate-600/50 dark:hover:border-slate-500'
                    }`}
                  >
                    <CheckCircle2 className={`w-5 h-5 mt-0.5 flex-shrink-0 ${selected ? 'text-primary-600 dark:text-primary-400' : 'text-slate-300 dark:text-slate-600'}`} />
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{mod.label}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{mod.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-end animate-slide-up">
          <button
            type="submit"
            disabled={disabled}
            className={`btn-primary gap-2 text-base px-6 sm:px-8 py-3 w-full sm:w-auto ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {disabled ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Tes Berjalan...</>
            ) : (
              <><Rocket className="w-5 h-5" /> Mulai Tes</>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export default TestConfigForm;
