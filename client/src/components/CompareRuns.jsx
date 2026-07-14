import { useState } from 'react';
import { GitCompare, X, CheckCircle2, XCircle, ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';

const MODUL_NAMES = {
    login: 'Login & Auth', dashboard: 'Dashboard Layout', navigation: 'Navigation & Menu',
  structure: 'Structure & Layout', security: 'Security & Hack', form_validation: 'Form & Input',
  responsive: 'Responsive & Mobile', performance: 'Performance & Network',
  crud: 'CRUD & Interaction', api_data: 'API & Data',
};

function CompareRuns({ runs, onBack }) {
  const [runAId, setRunAId] = useState('');
  const [runBId, setRunBId] = useState('');
  const [compared, setCompared] = useState(false);

  const completedRuns = runs.filter(r => r.status === 'completed' && r.summary);

  const runA = completedRuns.find(r => r.id === runAId);
  const runB = completedRuns.find(r => r.id === runBId);

  const handleCompare = () => {
    if (runAId && runBId && runAId !== runBId) {
      setCompared(true);
    }
  };

  const getTestMap = (run) => {
    const map = {};
    for (const r of (run?.results || [])) {
      map[r.testId] = r;
    }
    return map;
  };

  const allTestIds = compared && runA && runB
    ? [...new Set([...Object.keys(getTestMap(runA)), ...Object.keys(getTestMap(runB))])]
    : [];

  const mapA = compared ? getTestMap(runA) : {};
  const mapB = compared ? getTestMap(runB) : {};

  const regressions = allTestIds.filter(id => mapA[id]?.status === 'passed' && mapB[id]?.status === 'failed');
  const improvements = allTestIds.filter(id => mapA[id]?.status === 'failed' && mapB[id]?.status === 'passed');
  const newTests = allTestIds.filter(id => !mapA[id] && mapB[id]);
  const removedTests = allTestIds.filter(id => mapA[id] && !mapB[id]);

  const rateA = runA?.summary?.passRate || 0;
  const rateB = runB?.summary?.passRate || 0;
  const rateDiff = (rateB - rateA).toFixed(2);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 animate-slide-up">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-500/30 flex-shrink-0">
            <GitCompare className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Bandingkan Run</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 hidden sm:block">Bandingkan hasil 2 test run untuk melihat perubahan dan regression</p>
          </div>
        </div>
        <button onClick={onBack} className="btn-secondary gap-2 flex-shrink-0">
          <X className="w-4 h-4" /> Tutup
        </button>
      </div>

      {completedRuns.length < 2 ? (
        <div className="glass-card p-12 text-center animate-slide-up">
          <p className="text-slate-500 dark:text-slate-400">Butuh minimal 2 run yang sudah selesai untuk dibandingkan.</p>
        </div>
      ) : (
        <>
          <div className="glass-card p-4 sm:p-6 mb-6 animate-slide-up">
            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 block">Run A (sebelum)</label>
                <select
                  value={runAId}
                  onChange={(e) => { setRunAId(e.target.value); setCompared(false); }}
                  className="input-field"
                >
                  <option value="">Pilih run...</option>
                  {completedRuns.map(r => (
                    <option key={r.id} value={r.id}>
                      {new Date(r.startTime).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} - {r.summary?.passRate || 0}% - {r.url?.substring(0, 40)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 block">Run B (sesudah)</label>
                <select
                  value={runBId}
                  onChange={(e) => { setRunBId(e.target.value); setCompared(false); }}
                  className="input-field"
                >
                  <option value="">Pilih run...</option>
                  {completedRuns.map(r => (
                    <option key={r.id} value={r.id}>
                      {new Date(r.startTime).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} - {r.summary?.passRate || 0}% - {r.url?.substring(0, 40)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={handleCompare}
              disabled={!runAId || !runBId || runAId === runBId}
              className="btn-primary gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <GitCompare className="w-4 h-4" /> Bandingkan
            </button>
          </div>

          {compared && runA && runB && (
            <>
              {/* Summary comparison */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
                <div className="stat-card">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Pass Rate A</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{rateA}%</p>
                </div>
                <div className="stat-card">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Pass Rate B</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{rateB}%</p>
                </div>
                <div className="stat-card">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Perubahan</p>
                  <div className="flex items-center gap-2">
                    <p className={`text-2xl font-bold ${parseFloat(rateDiff) > 0 ? 'text-teal-600 dark:text-teal-400' : parseFloat(rateDiff) < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}`}>
                      {parseFloat(rateDiff) > 0 ? '+' : ''}{rateDiff}%
                    </p>
                    {parseFloat(rateDiff) > 0 ? <TrendingUp className="w-5 h-5 text-teal-500" /> : parseFloat(rateDiff) < 0 ? <TrendingDown className="w-5 h-5 text-rose-500" /> : <Minus className="w-5 h-5 text-slate-400" />}
                  </div>
                </div>
                <div className="stat-card">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Total Tes</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{runA.summary?.total || 0} → {runB.summary?.total || 0}</p>
                </div>
              </div>

              {/* Changes summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
                <div className="stat-card stat-card-red">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingDown className="w-4 h-4 text-rose-500" />
                    <p className="text-xs font-semibold text-rose-700 dark:text-rose-400">Regression</p>
                  </div>
                  <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">{regressions.length}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Lulus → Gagal</p>
                </div>
                <div className="stat-card stat-card-green">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-teal-500" />
                    <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">Improvement</p>
                  </div>
                  <p className="text-2xl font-bold text-teal-600 dark:text-teal-400">{improvements.length}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Gagal → Lulus</p>
                </div>
                <div className="stat-card" style={{ borderColor: 'rgba(59, 130, 246, 0.3)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <ArrowRight className="w-4 h-4 text-blue-500" />
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Tes Baru</p>
                  </div>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{newTests.length}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Hanya di Run B</p>
                </div>
                <div className="stat-card">
                  <div className="flex items-center gap-2 mb-1">
                    <X className="w-4 h-4 text-slate-400" />
                    <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">Dihapus</p>
                  </div>
                  <p className="text-2xl font-bold text-slate-600 dark:text-slate-400">{removedTests.length}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Hanya di Run A</p>
                </div>
              </div>

              {/* Module comparison */}
              <div className="glass-card p-4 sm:p-6 mb-6 animate-slide-up">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Perbandingan Per Modul</h3>
                <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                  <table className="w-full text-sm min-w-[400px]">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700">
                        <th className="text-left py-2 px-3 text-xs font-semibold text-slate-600 dark:text-slate-400">Modul</th>
                        <th className="text-center py-2 px-3 text-xs font-semibold text-slate-600 dark:text-slate-400">Run A</th>
                        <th className="text-center py-2 px-3 text-xs font-semibold text-slate-600 dark:text-slate-400">Run B</th>
                        <th className="text-center py-2 px-3 text-xs font-semibold text-slate-600 dark:text-slate-400">Perubahan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const allMods = [...new Set([
                          ...Object.keys(runA.summary?.modules || {}),
                          ...Object.keys(runB.summary?.modules || {}),
                        ])];
                        return allMods.map(mod => {
                          const dataA = runA.summary?.modules?.[mod] || { total: 0, passed: 0, failed: 0 };
                          const dataB = runB.summary?.modules?.[mod] || { total: 0, passed: 0, failed: 0 };
                          const rateA = dataA.total > 0 ? (dataA.passed / dataA.total * 100).toFixed(0) : '-';
                          const rateB = dataB.total > 0 ? (dataB.passed / dataB.total * 100).toFixed(0) : '-';
                          const diff = (rateA !== '-' && rateB !== '-') ? parseInt(rateB) - parseInt(rateA) : 0;
                          return (
                            <tr key={mod} className="border-b border-slate-100 dark:border-slate-800">
                              <td className="py-2 px-3 text-slate-700 dark:text-slate-300 font-medium">{MODUL_NAMES[mod] || mod}</td>
                              <td className="py-2 px-3 text-center text-slate-600 dark:text-slate-400">{dataA.passed}/{dataA.total} ({rateA}%)</td>
                              <td className="py-2 px-3 text-center text-slate-600 dark:text-slate-400">{dataB.passed}/{dataB.total} ({rateB}%)</td>
                              <td className="py-2 px-3 text-center">
                                {diff > 0 ? <span className="text-teal-600 dark:text-teal-400 font-semibold">+{diff}%</span> :
                                 diff < 0 ? <span className="text-rose-600 dark:text-rose-400 font-semibold">{diff}%</span> :
                                 <span className="text-slate-400">-</span>}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Detailed changes */}
              {(regressions.length > 0 || improvements.length > 0) && (
                <div className="glass-card p-4 sm:p-6 mb-6 animate-slide-up">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Perubahan Detail</h3>
                  <div className="space-y-2">
                    {regressions.map(id => (
                      <div key={id} className="flex items-center gap-2 sm:gap-3 p-3 rounded-xl bg-rose-50/60 dark:bg-rose-900/20">
                        <CheckCircle2 className="w-4 h-4 text-teal-500 flex-shrink-0" />
                        <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <XCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                        <span className="text-xs font-mono text-slate-500 dark:text-slate-400 flex-shrink-0 hidden sm:inline">{id}</span>
                        <span className="text-sm text-slate-700 dark:text-slate-300 truncate flex-1 min-w-0">{mapB[id]?.title}</span>
                        <span className="text-xs text-rose-600 dark:text-rose-400 flex-shrink-0">Regression</span>
                      </div>
                    ))}
                    {improvements.map(id => (
                      <div key={id} className="flex items-center gap-2 sm:gap-3 p-3 rounded-xl bg-teal-50/60 dark:bg-teal-900/20">
                        <XCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                        <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <CheckCircle2 className="w-4 h-4 text-teal-500 flex-shrink-0" />
                        <span className="text-xs font-mono text-slate-500 dark:text-slate-400 flex-shrink-0 hidden sm:inline">{id}</span>
                        <span className="text-sm text-slate-700 dark:text-slate-300 truncate flex-1 min-w-0">{mapB[id]?.title}</span>
                        <span className="text-xs text-teal-600 dark:text-teal-400 flex-shrink-0">Improvement</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default CompareRuns;
