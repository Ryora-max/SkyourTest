import { useState } from 'react';
import { Globe, User, Lock, Chrome, Rocket, CheckCircle2, LogIn, LayoutDashboard, Loader2, AlertCircle, ChevronRight, ChevronLeft, Database } from 'lucide-react';

const ALL_MODULES = [
  { id: 'login', label: 'Login & Auth', desc: 'Form login, validasi, SQL injection, XSS, session, logout, back-button security (12 tes)' },
  { id: 'dashboard', label: 'Dashboard Layout', desc: 'Load, heading, cards/widgets, nav, sidebar, breadcrumb, user info, empty state (10 tes)' },
  { id: 'navigation', label: 'Navigation & Menu', desc: 'Nav links, hamburger menu, footer, scroll, dropdown, tabs, breadcrumb, deep link (10 tes)' },
  { id: 'structure', label: 'Structure & Layout', desc: 'HTML lang, viewport, heading hierarchy, semantic HTML, layout shift, overflow, z-index (10 tes)' },
  { id: 'security', label: 'Security & Hack', desc: 'HTTPS, headers, CSRF, XSS, SQL injection, IDOR, cookie flags, clickjacking, path traversal, SSRF (15 tes)' },
  { id: 'form_validation', label: 'Form & Input', desc: 'Required fields, email validation, maxlength, edge cases, XSS in form, label association (10 tes)' },
  { id: 'responsive', label: 'Responsive & Mobile', desc: 'Mobile viewport, tablet, desktop, landscape, hamburger menu mobile, touch target, text overflow (8 tes)' },
  { id: 'performance', label: 'Performance & Network', desc: 'DOM load, full load, request count, page weight, console errors, network 4xx/5xx, cache, compression (8 tes)' },
  { id: 'crud', label: 'CRUD & Interaction', desc: 'Table detected, create button, form create, read data, edit, delete, cancel, search/filter, pagination, notification (10 tes)' },
  { id: 'api_data', label: 'API & Data', desc: 'API 5xx, response time, content-type, sensitive data leak, cookie/session, rate limit, verbose error (7 tes)' },
];

const TEST_MODES = [
  { id: 'login_dashboard', label: 'Login > Dashboard > Cek All', icon: LogIn, desc: 'URL = halaman login. Sistem login dengan akun, lalu scan semua modul di dashboard setelah login.' },
  { id: 'direct_dashboard', label: 'Dashboard > Cek All', icon: LayoutDashboard, desc: 'URL = dashboard langsung. Tidak perlu login, scan semua modul langsung di halaman dashboard.' },
];

function TestConfigForm({ onStart, disabled = false }) {
  const [step, setStep] = useState(1);
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [browser] = useState('chromium');
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
          return next.length === 0 ? ['login'] : next;
        }
        return [...withoutAll, id];
      });
    }
  };

  const canProceedStep1 = url.trim().length > 0;
  const canProceedStep2 = selectedModules.length > 0;

  const handleSubmit = () => {
    if (!url) return;
    onStart({ url, username, password, browser, testMode, testModules: selectedModules });
  };

  const stepLabels = ['Konfigurasi', 'Pilih Modul', 'Review & Mulai'];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6 sm:mb-8 animate-slide-up">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-500/30 flex-shrink-0">
            <Rocket className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Tes Baru</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">10 modul tes, 100 test case kritis fungsional</p>
          </div>
        </div>
      </div>

      {/* Disabled warning */}
      {disabled && (
        <div className="mb-4 animate-slide-up">
          <div className="glass-card p-4 rounded-2xl border-2 border-amber-400/60 bg-amber-50/80 dark:bg-amber-900/20">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Tes sedang berjalan</p>
                <p className="text-xs text-amber-600 dark:text-amber-500">Tunggu tes saat ini selesai sebelum memulai tes baru. Buka <strong>Live Screen</strong> untuk memantau tes yang berjalan.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 sm:gap-4 mb-6 animate-fade-in">
        {stepLabels.map((label, i) => {
          const stepNum = i + 1;
          const isActive = step === stepNum;
          const isDone = step > stepNum;
          return (
            <div key={i} className="flex items-center gap-2 sm:gap-4">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  isActive ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/30' :
                  isDone ? 'bg-teal-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                }`}>
                  {isDone ? <CheckCircle2 className="w-5 h-5" /> : stepNum}
                </div>
                <span className={`text-xs sm:text-sm font-medium hidden sm:inline ${isActive ? 'text-primary-700 dark:text-primary-400' : 'text-slate-400'}`}>{label}</span>
              </div>
              {i < stepLabels.length - 1 && (
                <div className={`w-8 sm:w-16 h-0.5 rounded-full ${isDone ? 'bg-teal-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step 1: Configuration */}
      {step === 1 && (
        <div className="space-y-4 sm:space-y-6 animate-slide-right">
          <div className="glass-card p-4 sm:p-6">
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

          <div className="glass-card p-4 sm:p-6">
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
            <div className="glass-card p-4 sm:p-6" key={`creds-${testMode}`}>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Kredensial Login</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Isi kredensial untuk login. Tes akan memvalidasi login dengan kredensial invalid dan valid.</p>
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

          <div className="glass-card p-4 sm:p-6">
            <div className="flex items-center gap-3 mb-1">
              <Chrome className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Browser Engine: Chromium</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Menggunakan Chromium engine untuk pengujian otomatis.</p>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!canProceedStep1}
              className={`btn-primary gap-2 text-base px-6 sm:px-8 py-3 ${!canProceedStep1 ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Lanjut <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Module Selection */}
      {step === 2 && (
        <div className="space-y-4 sm:space-y-6 animate-slide-right">
          <div className="glass-card p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">10 Modul Tes — 100 Test Case Kritis</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Pilih modul untuk pengujian. Setiap modul berisi tes fungsional kritis (Senior QC/QA Standard).</p>
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
                    <p className="text-xs text-slate-500 dark:text-slate-400">Jalankan semua 10 modul (100 test case kritis)</p>
                  </div>
                </div>
              </button>

              <div className="grid sm:grid-cols-2 gap-3">
                {ALL_MODULES.map(mod => {
                  const selected = selectedModules.includes(mod.id) || selectedModules.includes('all');
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

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="btn-secondary gap-2 text-base px-6 py-3"
            >
              <ChevronLeft className="w-5 h-5" /> Kembali
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={!canProceedStep2}
              className={`btn-primary gap-2 text-base px-6 sm:px-8 py-3 ${!canProceedStep2 ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Lanjut <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review & Start */}
      {step === 3 && (
        <div className="space-y-4 sm:space-y-6 animate-slide-right">
          <div className="glass-card p-4 sm:p-6">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">Review Konfigurasi</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/60 dark:bg-slate-800/40">
                <Globe className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">URL Target</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{url}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/60 dark:bg-slate-800/40">
                {(() => { const Icon = TEST_MODES.find(m => m.id === testMode)?.icon || LogIn; return <Icon className="w-5 h-5 text-slate-400 flex-shrink-0" />; })()}
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Mode Pengujian</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{TEST_MODES.find(m => m.id === testMode)?.label || '-'}</p>
                </div>
              </div>
              {testMode !== 'direct_dashboard' && (username || password) && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/60 dark:bg-slate-800/40">
                  <User className="w-5 h-5 text-slate-400 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Kredensial</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{username ? `${username} / ${'•'.repeat(password.length || 0)}` : 'Tidak diisi'}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/60 dark:bg-slate-800/40">
                <Chrome className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Browser</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 capitalize">{browser}</p>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50/60 dark:bg-slate-800/40">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Modul Terpilih ({selectedModules.includes('all') ? ALL_MODULES.length : selectedModules.length})</p>
                <div className="flex flex-wrap gap-2">
                  {selectedModules.includes('all') ? (
                    <span className="badge badge-pass">Semua Modul ({ALL_MODULES.length})</span>
                  ) : (
                    selectedModules.map(modId => {
                      const mod = ALL_MODULES.find(m => m.id === modId);
                      return mod ? <span key={modId} className="badge badge-pass">{mod.label}</span> : null;
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="btn-secondary gap-2 text-base px-6 py-3"
            >
              <ChevronLeft className="w-5 h-5" /> Kembali
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={disabled}
              className={`btn-primary gap-2 text-base px-6 sm:px-8 py-3 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {disabled ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Tes Berjalan...</>
              ) : (
                <><Rocket className="w-5 h-5" /> Mulai Tes</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TestConfigForm;
