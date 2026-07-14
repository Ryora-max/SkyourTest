import { Loader2, Globe, Chrome, Globe2, Monitor, Maximize2, CheckCircle2, AlertCircle, Circle, Play } from 'lucide-react';
import LiveBrowserView from './LiveBrowserView';

const BROWSER_ICONS = { chromium: Chrome, firefox: Globe2, webkit: Monitor };

const MODUL_NAMES = {
    login: 'Login & Auth', dashboard: 'Dashboard Layout', navigation: 'Navigation & Menu',
  structure: 'Structure & Layout', security: 'Security & Hack', form_validation: 'Form & Input',
  responsive: 'Responsive & Mobile', performance: 'Performance & Network',
  crud: 'CRUD & Interaction', api_data: 'API & Data',
};

function ProgressRing({ progress }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;
  return (
    <div className="relative w-28 h-28 flex-shrink-0">
      <svg className="progress-ring w-28 h-28" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="6" className="text-blue-200/40 dark:text-blue-900/30" />
        <circle
          cx="50" cy="50" r={radius} fill="none" stroke="url(#progressGrad)" strokeWidth="6"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        <defs>
          <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{progress}%</span>
      </div>
    </div>
  );
}

function TestProgress({ run, onLiveScreen, darkMode }) {
  const progress = run.progress || 0;
  const BrowserIcon = BROWSER_ICONS[run.browser] || Chrome;
  const results = run.results || [];
  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const isDone = run.status === 'completed' || run.status === 'error';
  const isError = run.status === 'error';

  const completedModules = [...new Set(results.map(r => r.module))];
  const moduleStats = {};
  completedModules.forEach(mod => {
    const modResults = results.filter(r => r.module === mod);
    moduleStats[mod] = {
      passed: modResults.filter(r => r.status === 'passed').length,
      failed: modResults.filter(r => r.status === 'failed').length,
      notes: modResults.filter(r => r.status === 'note').length,
      total: modResults.length,
    };
  });
  const currentModuleName = run.currentTest?.replace('Menjalankan modul: ', '') || '';
  const isCurrentInResults = completedModules.includes(currentModuleName);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 sm:mb-8 animate-slide-up">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-500/30 flex-shrink-0">
            {isError ? <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 text-white" /> : isDone ? <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6 text-white" /> : <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 text-white animate-spin" />}
          </div>
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">{isError ? 'Tes Error' : isDone ? 'Tes Selesai' : 'Tes Berjalan...'}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">{isError ? 'Terjadi kesalahan saat eksekusi tes.' : isDone ? 'Semua tes telah selesai dieksekusi.' : 'Tes otomatis sedang dieksekusi. Mohon tunggu.'}</p>
          </div>
        </div>
      </div>

      <div className="mb-6 relative animate-slide-up">
        <LiveBrowserView runId={run.id} runStatus={run.status} darkMode={darkMode} />
        {onLiveScreen && (
          <button
            onClick={onLiveScreen}
            className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 text-slate-200 text-xs font-medium hover:bg-slate-700 transition-colors"
          >
            <Maximize2 size={14} />
            Full Screen Live
          </button>
        )}
      </div>

      <div className="mb-6 animate-slide-up">
        <div className="glass-card p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
            <ProgressRing progress={progress} />
            <div className="flex-1 min-w-0 w-full text-center sm:text-left">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Sedang Mengeksekusi</p>
              <p className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">{run.currentTest || 'Inisialisasi...'}</p>
              <div className="mt-3 w-full bg-slate-200/50 dark:bg-slate-700/50 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-primary-500 to-primary-700 h-full rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6 animate-slide-up">
        <div className="glass-card p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-100/60 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                <Globe className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400">URL Target</p>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{run.url}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-100/60 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                <BrowserIcon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Browser</p>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 capitalize">{run.browser}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100/60 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Status</p>
                <p className="text-sm font-medium text-blue-600 dark:text-blue-400">{isError ? 'Error' : isDone ? 'Selesai' : 'Berjalan'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {completedModules.length > 0 && (
        <div className="mb-6 animate-slide-up">
          <div className="glass-card p-4 sm:p-6">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Progress Modul</h3>
            <div className="flex flex-wrap gap-2">
              {completedModules.map((mod, i) => {
                const stats = moduleStats[mod];
                const hasFailed = stats.failed > 0;
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      hasFailed
                        ? 'bg-rose-50/60 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400'
                        : 'bg-teal-50/60 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400'
                    }`}
                  >
                    {hasFailed ? <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />}
                    <span>{mod}</span>
                    <span className="opacity-70">({stats.passed}/{stats.total})</span>
                  </div>
                );
              })}
              {!isDone && currentModuleName && !isCurrentInResults && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50/60 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">
                  <Loader2 className="w-3.5 h-3.5 flex-shrink-0 animate-spin" />
                  <span>{currentModuleName}</span>
                </div>
              )}
              {!isDone && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100/60 dark:bg-slate-800/40 text-slate-400">
                  <Circle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Modul selanjutnya...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="animate-slide-up">
          <div className="glass-card p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Hasil Live</h3>
            <div className="flex gap-2 text-sm">
              <span className="badge badge-pass">{passed} Lulus</span>
              <span className="badge badge-fail">{failed} Gagal</span>
            </div>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {results.map((r, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                  r.status === 'passed' ? 'bg-teal-50/60 dark:bg-teal-900/20' :
                  r.status === 'failed' ? 'bg-rose-50/60 dark:bg-rose-900/20' : 'bg-slate-50/60 dark:bg-slate-800/40'
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  r.status === 'passed' ? 'bg-teal-500' :
                  r.status === 'failed' ? 'bg-rose-500' : 'bg-slate-400'
                }`} />
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400 flex-shrink-0">{r.testId}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0 hidden sm:inline">{MODUL_NAMES[r.module] || r.module}</span>
                <span className="text-sm text-slate-700 dark:text-slate-300 truncate flex-1">{r.title}</span>
                <span className="text-xs text-slate-400 flex-shrink-0">{r.duration}ms</span>
              </div>
            ))}
          </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TestProgress;
