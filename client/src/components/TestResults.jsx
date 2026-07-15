import { useState } from 'react';
import { Download, Plus, CheckCircle2, XCircle, Clock, Globe, Chrome, Globe2, Monitor, ChevronDown, ChevronRight, FileText, AlertCircle, ArrowLeft, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';

const BROWSER_ICONS = { chromium: Chrome, firefox: Globe2, webkit: Monitor };
const STATUS_ICONS = { passed: CheckCircle2, failed: XCircle, note: AlertCircle, skipped: ChevronDown };
const STATUS_COLORS = {
  passed: { bg: 'bg-teal-50/60 dark:bg-teal-900/20', text: 'text-teal-700 dark:text-teal-400', icon: 'text-teal-500', badge: 'badge-pass', label: 'LULUS' },
  failed: { bg: 'bg-rose-50/60 dark:bg-rose-900/20', text: 'text-rose-700 dark:text-rose-400', icon: 'text-rose-500', badge: 'badge-fail', label: 'GAGAL' },
  note: { bg: 'bg-amber-50/60 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-400', icon: 'text-amber-500', badge: 'badge-note', label: 'CATATAN' },
  skipped: { bg: 'bg-slate-50/60 dark:bg-slate-800/20', text: 'text-slate-600 dark:text-slate-400', icon: 'text-slate-400', badge: 'badge-skip', label: 'SKIP' },
};
const MODUL_NAMES = {
    login: 'Login & Auth', dashboard: 'Dashboard Layout', navigation: 'Navigation & Menu',
  structure: 'Structure & Layout', security: 'Security & Hack', form_validation: 'Form & Input',
  responsive: 'Responsive & Mobile', performance: 'Performance & Network',
  crud: 'CRUD & Interaction', api_data: 'API & Data',
};

function PassRateRing({ rate, passed, failed, total }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const passedOffset = circumference - (passed / total) * circumference;
  const failedOffset = circumference - (failed / total) * circumference;
  const color = rate >= 90 ? '#2dd4bf' : rate >= 70 ? '#fbbf24' : '#fb7185';
  return (
    <div className="relative w-36 h-36 flex-shrink-0">
      <svg className="progress-ring w-36 h-36" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-blue-200/40 dark:text-blue-900/30" />
        <circle
          cx="60" cy="60" r={radius} fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={passedOffset}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color }}>{rate}%</span>
        <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Pass Rate</span>
      </div>
    </div>
  );
}

function TestResults({ run, onDownloadReport, onDownloadPdf, onNewTest, onBack }) {
  const [expandedModules, setExpandedModules] = useState({});
  const [filter, setFilter] = useState('all');

  const results = run.results || [];
  let summary = run.summary;
  const BrowserIcon = BROWSER_ICONS[run.browser] || Chrome;

  // If no summary but we have results, generate one on-the-fly
  if (!summary && results.length > 0) {
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const notes = results.filter(r => r.status === 'note').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
    const moduleSummary = {};
    results.forEach(r => {
      if (!moduleSummary[r.module]) moduleSummary[r.module] = { passed: 0, failed: 0, notes: 0, skipped: 0, total: 0 };
      moduleSummary[r.module].total++;
      if (r.status === 'passed') moduleSummary[r.module].passed++;
      else if (r.status === 'failed') moduleSummary[r.module].failed++;
      else if (r.status === 'note') moduleSummary[r.module].notes++;
      else if (r.status === 'skipped') moduleSummary[r.module].skipped++;
    });
    const functional = passed + failed;
    const passRate = functional > 0 ? Math.round((passed / functional) * 100) : 0;
    summary = { passed, failed, notes, skipped, total: results.length, passRate, totalDuration, modules: moduleSummary };
  }

  // Handle error state
  if (run.status === 'error' && !summary) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="glass-card p-12 text-center animate-slide-up">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Tes Error</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-2">Terjadi kesalahan saat menjalankan tes:</p>
          {run.error && <p className="text-sm font-mono text-rose-600 dark:text-rose-400 bg-rose-50/60 dark:bg-rose-900/20 rounded-lg p-3 mb-4">{run.error}</p>}
          <div className="flex gap-2 justify-center">
            {onBack && <button onClick={onBack} className="btn-secondary gap-2"><ArrowLeft className="w-4 h-4" /> Kembali ke Riwayat</button>}
            <button onClick={onNewTest} className="btn-primary gap-2"><Plus className="w-4 h-4" /> Tes Baru</button>
          </div>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="glass-card p-12 text-center animate-slide-up">
          <p className="text-slate-500 dark:text-slate-400">Run ini tidak memiliki data hasil.</p>
          <div className="flex gap-2 justify-center mt-4">
            {onBack && <button onClick={onBack} className="btn-secondary gap-2"><ArrowLeft className="w-4 h-4" /> Kembali ke Riwayat</button>}
            <button onClick={onNewTest} className="btn-primary gap-2"><Plus className="w-4 h-4" /> Tes Baru</button>
          </div>
        </div>
      </div>
    );
  }

  const moduleGroups = {};
  results.forEach(r => {
    if (!moduleGroups[r.module]) moduleGroups[r.module] = [];
    moduleGroups[r.module].push(r);
  });

  const toggleModule = (mod) => {
    setExpandedModules(prev => ({ ...prev, [mod]: !prev[mod] }));
  };

  const allExpanded = Object.keys(moduleGroups).every(mod => expandedModules[mod] !== false);
  const toggleAllModules = () => {
    if (allExpanded) {
      const collapsed = {};
      Object.keys(moduleGroups).forEach(mod => { collapsed[mod] = false; });
      setExpandedModules(collapsed);
    } else {
      setExpandedModules({});
    }
  };

  const filteredResults = (items) => {
    if (filter === 'all') return items;
    return items.filter(r => r.status === filter);
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 animate-slide-up">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mb-1">Hasil Tes</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">Eksekusi selesai pada {new Date(run.startTime).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}</p>
        </div>
        <div className="flex gap-2 flex-wrap flex-shrink-0">
          <button onClick={() => onDownloadReport(run.id)} className="btn-primary gap-2">
            <Download className="w-4 h-4" /> Excel
          </button>
          <button onClick={() => onDownloadPdf(run.id)} className="btn-secondary gap-2">
            <FileText className="w-4 h-4" /> PDF
          </button>
          <button onClick={onNewTest} className="btn-secondary gap-2">
            <Plus className="w-4 h-4" /> Tes Baru
          </button>
        </div>
      </div>

      {/* Stats + Progress Ring */}
      <div className="mb-6 animate-slide-up">
        <div className="glass-card p-4 sm:p-6">
          <div className="flex flex-col lg:flex-row items-center gap-4 sm:gap-6">
            <PassRateRing rate={summary.passRate} passed={summary.passed} failed={summary.failed} total={summary.total} />
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 flex-1 w-full">
              <div className="stat-card">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Total Tes</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{summary.total}</p>
              </div>
              <div className="stat-card-green">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-4 h-4 text-teal-500" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">Lulus</p>
                </div>
                <p className="text-2xl font-bold text-teal-600 dark:text-teal-400">{summary.passed}</p>
              </div>
              <div className="stat-card-red">
                <div className="flex items-center gap-2 mb-1">
                  <XCircle className="w-4 h-4 text-rose-500" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">Gagal</p>
                </div>
                <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">{summary.failed}</p>
              </div>
              <div className="stat-card-amber">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">Catatan</p>
                </div>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{summary.notes || 0}</p>
              </div>
              <div className="stat-card">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <p className="text-xs text-slate-500 dark:text-slate-400">Durasi</p>
                </div>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{(summary.totalDuration / 1000).toFixed(1)}s</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Run info */}
      <div className="glass p-3 sm:p-4 mb-6 animate-slide-up">
        <div className="grid sm:grid-cols-3 gap-2 sm:gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-slate-400" />
            <span className="text-slate-500 dark:text-slate-400">Web:</span>
            <span className="font-medium text-slate-900 dark:text-slate-100 truncate">{run.webTarget || run.url}</span>
          </div>
          <div className="flex items-center gap-2">
            <BrowserIcon className="w-4 h-4 text-slate-400" />
            <span className="text-slate-500 dark:text-slate-400">Role:</span>
            <span className="font-medium text-slate-900 dark:text-slate-100 capitalize">{run.role || 'all'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <span className="text-slate-500 dark:text-slate-400">Dieksekusi:</span>
            <span className="font-medium text-slate-900 dark:text-slate-100">{new Date(run.startTime).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}</span>
          </div>
        </div>
      </div>

      {/* Filters + Collapse/Expand */}
      <div className="flex gap-2 mb-4 animate-slide-up flex-wrap items-center">
        {[
          { id: 'all', label: 'Semua' },
          { id: 'passed', label: 'Lulus' },
          { id: 'failed', label: 'Gagal' },
          { id: 'note', label: 'Catatan' },
          { id: 'skipped', label: 'Skip' },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === f.id ? 'bg-gradient-to-r from-primary-600 to-primary-700 text-white shadow-lg shadow-primary-500/20' : 'glass text-slate-600 dark:text-slate-300 hover:scale-105'
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={toggleAllModules}
          className="px-3 py-2 rounded-xl text-xs font-medium glass text-slate-600 dark:text-slate-300 hover:scale-105 transition-all flex items-center gap-1.5"
        >
          {allExpanded ? <><ChevronsDownUp className="w-3.5 h-3.5" /> Collapse All</> : <><ChevronsUpDown className="w-3.5 h-3.5" /> Expand All</>}
        </button>
      </div>

      {/* Module groups */}
      <div className="space-y-4">
        {Object.entries(moduleGroups).map(([mod, items], modIdx) => {
          const modStats = summary.modules[mod];
          const isExpanded = expandedModules[mod] !== false;
          const filtered = filteredResults(items);
          if (filtered.length === 0) return null;

          return (
            <div key={mod} className="animate-slide-up">
              <div className="glass-card overflow-hidden">
              <button
                onClick={() => toggleModule(mod)}
                className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-slate-50/40 dark:hover:bg-slate-800/40 transition-colors gap-2"
              >
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  {isExpanded ? <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" /> : <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0" />}
                  <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">{MODUL_NAMES[mod] || mod}</span>
                   <div className="flex gap-1.5 flex-shrink-0">
                     <span className="badge badge-pass">{modStats.passed} lulus</span>
                     {modStats.failed > 0 && <span className="badge badge-fail">{modStats.failed} gagal</span>}
                     {modStats.notes > 0 && <span className="badge badge-note">{modStats.notes} catatan</span>}
                     {modStats.skipped > 0 && <span className="badge badge-skip">{modStats.skipped} skip</span>}
                   </div>
                </div>
                <span className="text-sm text-slate-400 flex-shrink-0">{modStats.total} tes</span>
              </button>

              {isExpanded && (
                <div className="divide-y divide-slate-100/60 dark:divide-slate-700/50">
                  {filtered.map((r, i) => {
                    const StatusIcon = STATUS_ICONS[r.status];
                    const colors = STATUS_COLORS[r.status];
                    return (
                      <div key={i} className={`p-3 sm:p-4 ${colors.bg}`}>
                        <div className="flex items-start gap-3">
                          <StatusIcon className={`w-5 h-5 ${colors.icon} flex-shrink-0 mt-0.5`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{r.testId}</span>
                              <span className={`badge ${colors.badge}`}>{colors.label}</span>
                              {r.category === 'optional' && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-medium">Opsional</span>
                              )}
                              <span className="text-xs text-slate-400">{r.duration}ms</span>
                            </div>
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-2">{r.title}</p>

                            <div className="grid sm:grid-cols-2 gap-2 sm:gap-3 mb-2">
                              <div className="bg-white/40 dark:bg-slate-800/40 rounded-lg p-2">
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">Pre-Conditions:</p>
                                <p className="text-xs text-slate-600 dark:text-slate-300">{r.preConditions || '-'}</p>
                              </div>
                              <div className="bg-white/40 dark:bg-slate-800/40 rounded-lg p-2">
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-1">Test Steps:</p>
                                <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line">{r.testSteps || '-'}</p>
                              </div>
                            </div>

                            <div className="grid sm:grid-cols-2 gap-2 mt-2">
                              <div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Expected Result:</p>
                                <p className="text-xs text-slate-600 dark:text-slate-300">{r.expected}</p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Actual Result:</p>
                                <p className={`text-xs ${r.status === 'failed' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-600 dark:text-slate-300'}`}>{r.actual}</p>
                              </div>
                            </div>

                            {r.error && r.status === 'failed' && (
                              <div className="mt-2 p-2 bg-rose-50/60 dark:bg-rose-900/20 rounded-lg text-xs text-rose-600 dark:text-rose-400 font-mono overflow-x-auto">
                                {r.error}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}

export default TestResults;
