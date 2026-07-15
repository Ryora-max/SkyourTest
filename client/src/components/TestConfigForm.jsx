import { useState } from 'react';
import { Globe, User, Lock, Chrome, Rocket, CheckCircle2, LogIn, Loader2, AlertCircle, ChevronRight, ChevronLeft, Database, Briefcase, Brain, Users, Shield } from 'lucide-react';

const WEB_PROFILES = [
  {
    id: 'competency',
    name: 'Competency Management',
    url: 'https://192.168.1.77:30052',
    icon: Briefcase,
    color: 'blue',
    description: 'Platform manajemen kompetensi dengan AI generate, assessment, dan reporting',
    roles: [
      { id: 'all', label: 'Semua Role', email: '', password: '' },
      { id: 'admin', label: 'Admin (Oki)', email: 'oki@beone-solution.com', password: '12345678' },
      { id: 'user', label: 'User (Irfan)', email: 'irfan@beone-solution.com', password: '12345678' },
    ],
    modules: [
      { id: 'login', label: 'Login & Auth', desc: 'Login per role, SSO, JWT, OAuth, register, reset password, session, logout, permission boundary' },
      { id: 'dashboard', label: 'Dashboard', desc: 'Dashboard admin/peserta, cards, widgets, report, user info' },
      { id: 'navigation', label: 'Navigation & Menu', desc: 'Nav links, sidebar, breadcrumb, deep link, footer' },
      { id: 'structure', label: 'Structure & Layout', desc: 'HTML lang, viewport, heading hierarchy, semantic HTML' },
      { id: 'security', label: 'Security & Hack', desc: 'Headers, CSRF, XSS, SQL injection, IDOR, cookie, permission boundary' },
      { id: 'form_validation', label: 'Form & Input', desc: 'Required fields, email validation, edge cases, label association' },
      { id: 'responsive', label: 'Responsive & Mobile', desc: 'Mobile, tablet, desktop, touch targets, overflow' },
      { id: 'performance', label: 'Performance & Network', desc: 'Load time, network errors, console errors, API response' },
      { id: 'crud_employee', label: 'CRUD Employee/Divisi/Role', desc: 'Create, read, update, delete employee, divisi, role, user' },
      { id: 'crud_kompetensi', label: 'CRUD Kompetensi', desc: 'Master kompetensi, form kompetensi, AI generate, result, norm group/table' },
      { id: 'test_assessment', label: 'Test & Assessment', desc: 'Test+dimensi, bank soal, import excel, navigasi, kamera, recording/zoom' },
      { id: 'payment_booking', label: 'Payment & Booking', desc: 'Setting price, payment gateway, kode referal, booking, cancellation, reschedule' },
      { id: 'notification_integration', label: 'Notification & Integration', desc: 'Email notif, OSS upload, foto profile, recording/zoom, AI integration' },
      { id: 'report_export', label: 'Report & Export', desc: 'Report PDF, logo+PT dinamis, layout report, dashboard report' },
    ],
  },
  {
    id: 'psikotest',
    name: 'Psikotest Platform',
    url: 'https://192.168.1.77:30055/login',
    icon: Brain,
    color: 'purple',
    description: 'Platform asesmen psikologi dengan multi-role, AI generate, dan booking consultant',
    roles: [
      { id: 'all', label: 'Semua Role', email: '', password: '' },
      { id: 'admin', label: 'Admin', email: 'admin@psikotest.id', password: 'admin123' },
      { id: 'useradmin', label: 'User Admin', email: 'useradmin@gmail.com', password: '12345678' },
      { id: 'user', label: 'User', email: 'user@gmail.com', password: '12345678' },
      { id: 'psikolog', label: 'Psikolog', email: 'psikolog@psikotest.id', password: 'psikolog123' },
    ],
    modules: [
      { id: 'login', label: 'Login & Auth', desc: 'Login per role (4 roles), permission boundary, session, logout' },
      { id: 'dashboard', label: 'Dashboard', desc: 'Dashboard admin/peserta, cards, widgets, report' },
      { id: 'navigation', label: 'Navigation & Menu', desc: 'Nav links, sidebar, breadcrumb, deep link, footer' },
      { id: 'structure', label: 'Structure & Layout', desc: 'HTML lang, viewport, heading hierarchy, semantic HTML' },
      { id: 'security', label: 'Security & Hack', desc: 'Headers, CSRF, XSS, SQL injection, IDOR, cookie, permission boundary' },
      { id: 'form_validation', label: 'Form & Input', desc: 'Required fields, email validation, edge cases, label association' },
      { id: 'responsive', label: 'Responsive & Mobile', desc: 'Mobile, tablet, desktop, touch targets, overflow' },
      { id: 'performance', label: 'Performance & Network', desc: 'Load time, network errors, console errors, API response' },
      { id: 'crud_master', label: 'CRUD Master Data', desc: 'Master kompetensi, bank soal, dimensi, norm group/table' },
      { id: 'test_assessment', label: 'Test & Assessment', desc: 'Test+dimensi, mulai ujian, navigasi test, kamera' },
      { id: 'ai_integration', label: 'AI Integration', desc: 'AI generate kompetensi, AI generate soal, integrasi AI' },
      { id: 'booking_consultant', label: 'Booking Consultant', desc: 'Booking, set jadwal, update done, result halaman' },
      { id: 'result_report', label: 'Result & Report', desc: 'Result kompetensi, form kompetensi user, dashboard report' },
    ],
  },
  {
    id: 'consultant',
    name: 'Consultant Platform',
    url: 'https://192.168.1.77:30056/',
    icon: Users,
    color: 'green',
    description: 'Platform konsultasi dengan booking, payment, dan multi-role (admin, client, consultant)',
    roles: [
      { id: 'all', label: 'Semua Role', email: '', password: '' },
      { id: 'admin', label: 'Admin', email: 'admin@konsulta.id', password: 'admin123' },
      { id: 'client', label: 'Client (Budi)', email: 'budi@konsulta.id', password: 'client123' },
      { id: 'consultant', label: 'Consultant (Andi)', email: 'andi@konsulta.id', password: 'consultant123' },
    ],
    modules: [
      { id: 'login', label: 'Login & Auth', desc: 'Login per role (3 roles), register, reset password, OAuth, permission boundary' },
      { id: 'landing_page', label: 'Landing Page', desc: 'Landing page content, CTA, FAQ, home page navigation' },
      { id: 'dashboard', label: 'Dashboard', desc: 'Dashboard admin/client/consultant, cards, widgets' },
      { id: 'navigation', label: 'Navigation & Menu', desc: 'Nav links, sidebar, breadcrumb, deep link, footer' },
      { id: 'structure', label: 'Structure & Layout', desc: 'HTML lang, viewport, heading hierarchy, semantic HTML' },
      { id: 'security', label: 'Security & Hack', desc: 'Headers, CSRF, XSS, SQL injection, IDOR, cookie, permission boundary' },
      { id: 'form_validation', label: 'Form & Input', desc: 'Required fields, email validation, edge cases, label association' },
      { id: 'responsive', label: 'Responsive & Mobile', desc: 'Mobile, tablet, desktop, touch targets, overflow' },
      { id: 'performance', label: 'Performance & Network', desc: 'Load time, network errors, console errors, API response' },
      { id: 'profile_management', label: 'Profile Management', desc: 'Profile consultant, profil client, register consultant, foto profile' },
      { id: 'booking_schedule', label: 'Booking & Schedule', desc: 'Booking, set jadwal, update done, cancellation, reschedule' },
      { id: 'payment_referal', label: 'Payment & Referal', desc: 'Payment gateway, kode referal, booking dengan referal' },
      { id: 'notification', label: 'Notification', desc: 'Email notif, notif system, notification settings' },
      { id: 'report_export', label: 'Report & Export', desc: 'Dashboard report, export data' },
    ],
  },
];

const COLOR_MAP = {
  blue: { bg: 'from-blue-500 to-blue-700', ring: 'border-blue-500 bg-blue-50/80 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400', shadow: 'shadow-blue-500/30' },
  purple: { bg: 'from-purple-500 to-purple-700', ring: 'border-purple-500 bg-purple-50/80 dark:bg-purple-900/30', text: 'text-purple-600 dark:text-purple-400', shadow: 'shadow-purple-500/30' },
  green: { bg: 'from-green-500 to-green-700', ring: 'border-green-500 bg-green-50/80 dark:bg-green-900/30', text: 'text-green-600 dark:text-green-400', shadow: 'shadow-green-500/30' },
};

function TestConfigForm({ onStart, disabled = false }) {
  const [step, setStep] = useState(1);
  const [webTarget, setWebTarget] = useState('');
  const [selectedRole, setSelectedRole] = useState('all');
  const [browser] = useState('chromium');
  const [selectedModules, setSelectedModules] = useState(['all']);
  const [isStarting, setIsStarting] = useState(false);

  const profile = WEB_PROFILES.find(p => p.id === webTarget);
  const currentModules = profile?.modules || [];

  const handleSelectWeb = (id) => {
    setWebTarget(id);
    setSelectedRole('all');
    setSelectedModules(['all']);
  };

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

  const canProceedStep1 = webTarget.length > 0;
  const canProceedStep2 = selectedModules.length > 0;

  const handleSubmit = async () => {
    if (!profile) return;
    setIsStarting(true);
    try {
      await onStart({
        url: profile.url,
        webTarget: profile.id,
        role: selectedRole,
        browser,
        testMode: 'login_dashboard',
        testModules: selectedModules,
      });
    } finally {
      setIsStarting(false);
    }
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
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">QC Test — Multi-Web</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">3 web target · Multi-role deep testing · Senior QC/QA standard</p>
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
          {/* Web Target Selector */}
          <div className="glass-card p-4 sm:p-6">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
              <Globe className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              Pilih Web Target
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {WEB_PROFILES.map(wp => {
                const Icon = wp.icon;
                const active = webTarget === wp.id;
                const colors = COLOR_MAP[wp.color] || COLOR_MAP.blue;
                return (
                  <button
                    key={wp.id}
                    type="button"
                    onClick={() => handleSelectWeb(wp.id)}
                    className={`flex flex-col items-start gap-2 p-4 rounded-xl border-2 transition-all text-left ${
                      active
                        ? `${colors.ring} shadow-lg ${colors.shadow}`
                        : 'border-slate-200/60 hover:border-slate-300 dark:border-slate-600/50 dark:hover:border-slate-500'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors.bg} flex items-center justify-center shadow-lg ${colors.shadow} flex-shrink-0`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${active ? colors.text : 'text-slate-900 dark:text-slate-100'}`}>{wp.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{wp.description}</p>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <Shield className="w-3 h-3 text-slate-400" />
                      <span className="text-xs text-slate-400">{wp.roles.length - 1} roles · {wp.modules.length} modul</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Role Selector */}
          {profile && (
            <div className="glass-card p-4 sm:p-6 animate-fade-in" key={`role-${webTarget}`}>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                <User className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                Pilih Role
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Pilih role untuk testing. "Semua Role" akan test setiap role secara berurutan.</p>
              <div className="flex flex-wrap gap-2">
                {profile.roles.map(r => {
                  const active = selectedRole === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedRole(r.id)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all text-sm font-medium ${
                        active
                          ? 'border-primary-500 bg-primary-50/80 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 shadow-lg shadow-primary-500/10'
                          : 'border-slate-200/60 hover:border-slate-300 dark:border-slate-600/50 dark:hover:border-slate-500 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {r.id === 'all' && <CheckCircle2 className="w-4 h-4" />}
                      {r.label}
                    </button>
                  );
                })}
              </div>
              {selectedRole !== 'all' && (
                <div className="mt-4 p-3 rounded-xl bg-slate-50/60 dark:bg-slate-800/40">
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Email: {profile.roles.find(r => r.id === selectedRole)?.email}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Browser info */}
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
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{currentModules.length} Modul Tes — {profile?.name || 'Web'}</h3>
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
                    <p className="text-xs text-slate-500 dark:text-slate-400">Jalankan semua {currentModules.length} modul</p>
                  </div>
                </div>
              </button>

              <div className="grid sm:grid-cols-2 gap-3">
                {currentModules.map(mod => {
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
                  <p className="text-xs text-slate-500 dark:text-slate-400">Web Target</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{profile?.name || '-'}</p>
                  <p className="text-xs text-slate-400">{profile?.url}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/60 dark:bg-slate-800/40">
                <User className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Role</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{profile?.roles.find(r => r.id === selectedRole)?.label || '-'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/60 dark:bg-slate-800/40">
                <Chrome className="w-5 h-5 text-slate-400 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Browser</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 capitalize">{browser}</p>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50/60 dark:bg-slate-800/40">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Modul Terpilih ({selectedModules.includes('all') ? currentModules.length : selectedModules.length})</p>
                <div className="flex flex-wrap gap-2">
                  {selectedModules.includes('all') ? (
                    <span className="badge badge-pass">Semua Modul ({currentModules.length})</span>
                  ) : (
                    selectedModules.map(modId => {
                      const mod = currentModules.find(m => m.id === modId);
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
              disabled={disabled || isStarting}
              className={`btn-primary gap-2 text-base px-6 sm:px-8 py-3 ${disabled || isStarting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {disabled || isStarting ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Memulai...</>
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
