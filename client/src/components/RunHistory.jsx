import { useState } from 'react';
import { History, Download, Trash2, Eye, Globe, CheckCircle2, XCircle, FileText, Search, Filter } from 'lucide-react';

const MODUL_NAMES = {
    login: 'Login & Auth', dashboard: 'Dashboard Layout', navigation: 'Navigation & Menu',
  structure: 'Structure & Layout', security: 'Security & Hack', form_validation: 'Form & Input',
  responsive: 'Responsive & Mobile', performance: 'Performance & Network',
  crud: 'CRUD & Interaction', api_data: 'API & Data',
};

function RunHistory({ runs, onView, onDelete, onDownloadReport, onDownloadPdf }) {
  const [searchUrl, setSearchUrl] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredRuns = runs.filter(run => {
    const matchesSearch = !searchUrl || run.url.toLowerCase().includes(searchUrl.toLowerCase());
    const matchesStatus = statusFilter === 'all' || run.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (runs.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="glass-card p-12 text-center animate-slide-up">
          <div className="w-16 h-16 bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <History className="w-8 h-8 text-slate-400 dark:text-slate-500" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Belum Ada Riwayat Tes</h3>
          <p className="text-slate-500 dark:text-slate-400">Mulai tes QC pertama Anda untuk melihat hasil di sini.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 animate-slide-up">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center shadow-lg shadow-primary-500/30 flex-shrink-0">
            <History className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Riwayat Tes</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">{runs.length} tes telah dijalankan</p>
          </div>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3 animate-slide-up">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchUrl}
            onChange={(e) => setSearchUrl(e.target.value)}
            placeholder="Cari berdasarkan URL..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl glass text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
          />
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {[
            { id: 'all', label: 'Semua' },
            { id: 'completed', label: 'Selesai' },
            { id: 'error', label: 'Error' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                statusFilter === f.id ? 'bg-gradient-to-r from-primary-600 to-primary-700 text-white shadow-lg shadow-primary-500/20' : 'glass text-slate-600 dark:text-slate-300 hover:scale-105'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {filteredRuns.length === 0 ? (
        <div className="glass-card p-8 text-center animate-slide-up">
          <p className="text-slate-500 dark:text-slate-400">Tidak ada tes yang cocok dengan filter.</p>
        </div>
      ) : (
      <div className="space-y-3">
        {filteredRuns.map((run, idx) => {
          const summary = run.summary;
          return (
            <div key={run.id} className="glass-card p-4 sm:p-5 animate-slide-up">
              <div className="flex items-start sm:items-center justify-between gap-3 sm:gap-4 flex-col sm:flex-row">
                <div className="flex-1 min-w-0 w-full">
                  <div className="flex items-center gap-2 mb-2">
                    <Globe className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{run.url}</span>
                    <span className={`badge ${
                      run.status === 'completed' ? 'badge-pass' :
                      run.status === 'running' ? 'badge-running' : 'badge-fail'
                    }`}>
                      {run.status === 'completed' ? 'SELESAI' : run.status === 'running' ? 'BERJALAN' : 'ERROR'}
                    </span>
                    {run.triggeredBy === 'webhook' && (
                      <span className="badge badge-running">Webhook</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                    <span>{new Date(run.startTime).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}</span>
                    <span className="capitalize">{run.browser}</span>
                    {summary && (
                      <>
                        <span className="flex items-center gap-1 text-teal-600 dark:text-teal-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> {summary.passed} lulus
                        </span>
                        {summary.failed > 0 && (
                          <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                            <XCircle className="w-3.5 h-3.5" /> {summary.failed} gagal
                          </span>
                        )}
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{summary.passRate}% lulus</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0 self-end sm:self-center">
                  {run.status === 'completed' && (
                    <button
                      onClick={() => onDownloadReport(run.id)}
                      className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50/60 dark:hover:bg-primary-900/20 rounded-xl transition-all hover:scale-110"
                      title="Unduh Laporan Excel"
                    >
                      <Download className="w-5 h-5" />
                    </button>
                  )}
                  {run.status === 'completed' && (
                    <button
                      onClick={() => onDownloadPdf(run.id)}
                      className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50/60 dark:hover:bg-primary-900/20 rounded-xl transition-all hover:scale-110"
                      title="Unduh Laporan PDF"
                    >
                      <FileText className="w-5 h-5" />
                    </button>
                  )}
                  <button
                    onClick={() => onView(run)}
                    className="p-2 text-slate-400 hover:text-primary-600 hover:bg-primary-50/60 dark:hover:bg-primary-900/20 rounded-xl transition-all hover:scale-110"
                    title="Lihat Hasil"
                  >
                    <Eye className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => onDelete(run.id)}
                    className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50/60 dark:hover:bg-rose-900/20 rounded-xl transition-all hover:scale-110"
                    title="Hapus"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {summary && (
                <div className="mt-3 w-full bg-slate-200/50 dark:bg-slate-700/50 rounded-full h-1.5 overflow-hidden flex">
                  <div className="bg-gradient-to-r from-teal-400 to-teal-500 h-full transition-all duration-700" style={{ width: `${(summary.passed / summary.total) * 100}%` }} />
                  <div className="bg-gradient-to-r from-rose-400 to-rose-500 h-full transition-all duration-700" style={{ width: `${(summary.failed / summary.total) * 100}%` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

export default RunHistory;
