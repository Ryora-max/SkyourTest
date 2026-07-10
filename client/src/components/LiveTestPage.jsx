import { useState, useEffect, useRef } from 'react';
import { Radio, Loader2, Eye, Monitor, Globe, Chrome, Globe2, Maximize2, X, CheckCircle2, XCircle, Clock, Square, ChevronDown } from 'lucide-react';

const BROWSER_ICONS = { chromium: Chrome, firefox: Globe2, webkit: Monitor };

const MODUL_NAMES = {
  accessibility: 'Aksesibilitas', login: 'Login', navigation: 'Navigasi',
  security: 'Keamanan', performance: 'Performa', responsive: 'Responsif',
  form_validation: 'Validasi Form', menu_traversal: 'Menu Traversal',
  api_response: 'API Response', cookie_session: 'Cookie & Session', content_seo: 'Content & SEO',
  dashboard: 'Dashboard', crud: 'CRUD', payment: 'Payment', camera: 'Camera',
  multi_role: 'Multi-Role', file_upload: 'File Upload', email_notif: 'Email & Notif', booking: 'Booking',
};

export default function LiveTestPage({ run, onExit, onViewResults, onCancel, darkMode = false }) {
  const [frame, setFrame] = useState(null);
  const [stepInfo, setStepInfo] = useState(null);
  const [steps, setSteps] = useState([]);
  const [connected, setConnected] = useState(false);
  const [done, setDone] = useState(false);
  const [localProgress, setLocalProgress] = useState(0);
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const stepsRef = useRef(null);

  // Fallback: if run.status is completed/error/cancelled from polling, set done
  useEffect(() => {
    if (run?.status === 'completed' || run?.status === 'error' || run?.status === 'cancelled') {
      setLocalProgress(100);
      setDone(true);
    }
  }, [run?.status]);

  const progress = Math.max(localProgress, run?.progress || 0);
  const results = run?.results || [];
  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const BrowserIcon = BROWSER_ICONS[run?.browser] || Chrome;

  useEffect(() => {
    let mounted = true;

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsPort = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
      const wsUrl = `${protocol}//${window.location.hostname}:${wsPort}/ws/live`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!mounted) return;
          setConnected(true);
          if (run?.id) ws.send(JSON.stringify({ type: 'subscribe', runId: run.id }));
        };

        ws.onmessage = (event) => {
          if (!mounted) return;
          try {
            const msg = JSON.parse(event.data);
            if (msg.runId && msg.runId !== run?.id) return;
            if (msg.type === 'frame') {
              setFrame(msg.data);
            } else if (msg.type === 'test_step') {
              setStepInfo(msg.data);
              if (msg.data.action === 'progress') {
                const p = parseInt(msg.data.selector, 10);
                if (!isNaN(p)) setLocalProgress(p);
              } else if (msg.data.action === 'start') {
                setSteps(prev => [...prev, { ...msg.data, status: 'running', time: Date.now() }]);
              } else if (msg.data.action === 'done') {
                if (msg.data.testId === 'DONE') {
                  setLocalProgress(100);
                } else if (msg.data.testId === 'CANCEL') {
                  setDone(true);
                } else {
                  setSteps(prev => prev.map(s => s.testId === msg.data.testId && s.status === 'running' ? { ...s, status: 'passed' } : s));
                }
              } else if (msg.data.action === 'error') {
                setSteps(prev => prev.map(s => s.testId === msg.data.testId && s.status === 'running' ? { ...s, status: 'failed', error: msg.data.action } : s));
              } else if (msg.data.action === 'note') {
                setSteps(prev => prev.map(s => s.testId === msg.data.testId && s.status === 'running' ? { ...s, status: 'note' } : s));
              }
            } else if (msg.type === 'test_done') {
              setLocalProgress(100);
              setDone(true);
            }
          } catch {}
        };

        ws.onclose = () => {
          if (!mounted) return;
          setConnected(false);
          if (reconnectRef.current) clearTimeout(reconnectRef.current);
          reconnectRef.current = setTimeout(() => { if (mounted) connect(); }, 2000);
        };

        ws.onerror = () => setConnected(false);
      } catch {
        if (reconnectRef.current) clearTimeout(reconnectRef.current);
        reconnectRef.current = setTimeout(() => { if (mounted) connect(); }, 2000);
      }
    }

    connect();
    return () => {
      mounted = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    };
  }, [run?.id]);

  useEffect(() => {
    if (stepsRef.current) stepsRef.current.scrollTop = stepsRef.current.scrollHeight;
  }, [steps]);

  const runningSteps = steps.filter(s => s.status === 'running').length;
  const passedSteps = steps.filter(s => s.status === 'passed').length;
  const failedSteps = steps.filter(s => s.status === 'failed').length;

  return (
    <div className={`relative w-full h-[75vh] sm:h-[80vh] rounded-2xl overflow-hidden border flex flex-col shadow-xl transition-colors ${darkMode ? 'border-slate-700/50 bg-slate-950' : 'border-slate-200 bg-slate-50'}`}>
      {/* Top Bar */}
      <div className={`flex items-center justify-between px-3 sm:px-4 py-2.5 border-b flex-shrink-0 transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center flex-shrink-0">
            <Monitor className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <span className={`text-sm font-bold block truncate ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>Live Test Screen</span>
            <span className={`text-xs truncate block ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{run?.url || ''}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {/* Status badge */}
          {done ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-green-400 bg-green-500/10 px-2.5 py-1 rounded-lg">
              <CheckCircle2 size={14} /> Selesai
            </span>
          ) : connected ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-red-400 bg-red-500/10 px-2.5 py-1 rounded-lg">
              <Radio size={12} className="animate-pulse" /> LIVE
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-500/10 px-2.5 py-1 rounded-lg">
              <Loader2 size={12} className="animate-spin" /> Connecting...
            </span>
          )}

          {/* Browser icon */}
          <div className={`hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-colors ${darkMode ? 'text-slate-400 bg-slate-800' : 'text-slate-500 bg-slate-100'}`}>
            <BrowserIcon size={14} /> <span className="capitalize">{run?.browser || 'chromium'}</span>
          </div>

          {/* Action buttons */}
          {done ? (
            <button
              onClick={onViewResults}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-gradient-to-r from-primary-500 to-primary-700 px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
            >
              <Eye size={14} /> Lihat Hasil
            </button>
          ) : (
            <button
              onClick={onCancel}
              className="flex items-center gap-1.5 text-xs font-medium text-white bg-gradient-to-r from-red-500 to-rose-600 px-2.5 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
              title="Batalkan tes"
            >
              <Square size={12} /> Batalkan
            </button>
          )}
          <button
            onClick={onExit}
            className={`p-2 rounded-lg transition-colors ${darkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
            title="Minimize (tes tetap berjalan)"
          >
            <ChevronDown size={18} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className={`h-1 flex-shrink-0 transition-colors ${darkMode ? 'bg-slate-800' : 'bg-slate-200'}`}>
        <div
          className="h-full bg-gradient-to-r from-primary-500 to-primary-700 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Main content - split layout */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Left: Live browser stream */}
        <div className="flex-1 flex flex-col min-h-0 bg-black relative">
          {frame ? (
            <div className="flex-1 flex items-center justify-center p-2 overflow-hidden">
              <img
                src={`data:image/jpeg;base64,${frame}`}
                alt="Live browser"
                className="max-w-full max-h-full object-contain rounded-lg"
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
              <Loader2 size={40} className="animate-spin mb-3" />
              <span className="text-sm">Menunggu browser stream...</span>
            </div>
          )}

          {/* Overlay: Current step info */}
          {stepInfo && !done && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent px-4 py-4">
              <div className="flex items-center gap-2 text-sm flex-wrap">
                {stepInfo.action === 'error' ? (
                  <span className="px-2 py-0.5 rounded bg-red-500/40 text-red-200 font-mono font-bold text-xs">FAIL</span>
                ) : stepInfo.action === 'done' ? (
                  <span className="px-2 py-0.5 rounded bg-green-500/40 text-green-200 font-mono font-bold text-xs">PASS</span>
                ) : stepInfo.action === 'start' ? (
                  <span className="px-2 py-0.5 rounded bg-blue-500/40 text-blue-200 font-mono font-bold text-xs animate-pulse">RUN</span>
                ) : null}
                {stepInfo.testId && stepInfo.testId !== 'DETECT' && (
                  <span className="font-mono text-slate-400 text-xs">{stepInfo.testId}</span>
                )}
                {stepInfo.module && (
                  <span className="text-slate-400 text-xs">| {stepInfo.module}</span>
                )}
                <span className="text-slate-100 font-medium">{stepInfo.title}</span>
              </div>
            </div>
          )}

          {/* Done overlay */}
          {done && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
              <div className="text-center">
                <div className="flex items-center justify-center gap-4 mb-4">
                  <div className="flex flex-col items-center">
                    <CheckCircle2 size={32} className="text-green-400 mb-1" />
                    <span className="text-green-400 text-2xl font-bold">{passed}</span>
                    <span className="text-slate-400 text-xs">Lulus</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <XCircle size={32} className="text-red-400 mb-1" />
                    <span className="text-red-400 text-2xl font-bold">{failed}</span>
                    <span className="text-slate-400 text-xs">Gagal</span>
                  </div>
                </div>
                <button
                  onClick={onViewResults}
                  className="flex items-center gap-2 mx-auto text-white bg-gradient-to-r from-primary-500 to-primary-700 px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity font-medium"
                >
                  <Eye size={18} /> Lihat Hasil Lengkap
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Test info panel */}
        <div className={`w-full lg:w-96 xl:w-[420px] flex flex-col border-t lg:border-t-0 lg:border-l min-h-0 flex-shrink-0 max-h-[40vh] lg:max-h-none transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
          {/* Stats */}
          <div className={`grid grid-cols-3 gap-px flex-shrink-0 transition-colors ${darkMode ? 'bg-slate-800' : 'bg-slate-200'}`}>
            <div className={`px-3 py-3 text-center transition-colors ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
              <div className="flex items-center justify-center gap-1.5 mb-0.5">
                <CheckCircle2 size={14} className="text-green-500" />
                <span className="text-lg font-bold text-green-500">{passedSteps}</span>
              </div>
              <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Lulus</span>
            </div>
            <div className={`px-3 py-3 text-center transition-colors ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
              <div className="flex items-center justify-center gap-1.5 mb-0.5">
                <XCircle size={14} className="text-red-500" />
                <span className="text-lg font-bold text-red-500">{failedSteps}</span>
              </div>
              <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Gagal</span>
            </div>
            <div className={`px-3 py-3 text-center transition-colors ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
              <div className="flex items-center justify-center gap-1.5 mb-0.5">
                <Clock size={14} className="text-blue-500" />
                <span className="text-lg font-bold text-blue-500">{runningSteps}</span>
              </div>
              <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Running</span>
            </div>
          </div>

          {/* Current step highlight */}
          {stepInfo && !done && (
            <div className={`px-3 py-2.5 border-b flex-shrink-0 transition-colors ${darkMode ? 'bg-slate-800/50 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <p className={`text-xs mb-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Sedang Mengeksekusi</p>
              <p className={`text-sm font-medium truncate ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>{stepInfo.title}</p>
              <div className="flex items-center gap-2 mt-1">
                {stepInfo.testId && stepInfo.testId !== 'DETECT' && (
                  <span className={`text-xs font-mono ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{stepInfo.testId}</span>
                )}
                {stepInfo.module && (
                  <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{MODUL_NAMES[stepInfo.module] || stepInfo.module}</span>
                )}
              </div>
            </div>
          )}

          {/* Steps timeline */}
          <div ref={stepsRef} className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
            {steps.length === 0 && (
              <div className={`flex items-center justify-center h-full text-sm ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                Menunggu test dimulai...
              </div>
            )}
            {steps.map((s, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-all ${
                  s.status === 'passed' ? 'bg-green-500/10' :
                  s.status === 'failed' ? 'bg-red-500/10' :
                  'bg-blue-500/10'
                }`}
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  s.status === 'passed' ? 'bg-green-500' :
                  s.status === 'failed' ? 'bg-red-500' :
                  'bg-blue-500 animate-pulse'
                }`} />
                {s.testId && s.testId !== 'DETECT' && (
                  <span className={`font-mono flex-shrink-0 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{s.testId}</span>
                )}
                <span className={`truncate flex-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{s.title}</span>
                {s.module && (
                  <span className={`flex-shrink-0 hidden xl:inline ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>{MODUL_NAMES[s.module] || s.module}</span>
                )}
              </div>
            ))}
          </div>

          {/* Results from polling */}
          {results.length > 0 && (
            <div className={`border-t p-2 max-h-32 overflow-y-auto flex-shrink-0 transition-colors ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
              <p className={`text-xs mb-1.5 px-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Hasil Selesai ({results.length})</p>
              <div className="space-y-1">
                {results.slice(-5).map((r, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1 rounded text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      r.status === 'passed' ? 'bg-green-500' : 'bg-red-500'
                    }`} />
                    <span className="font-mono text-slate-500 flex-shrink-0">{r.testId}</span>
                    <span className="text-slate-400 truncate flex-1">{r.title}</span>
                    <span className="text-slate-600 flex-shrink-0">{r.duration}ms</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
