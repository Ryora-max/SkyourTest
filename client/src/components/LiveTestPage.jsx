import { useState, useEffect, useRef, useMemo } from 'react';
import { Radio, Loader2, Eye, Monitor, Globe, Chrome, Globe2, X, CheckCircle2, XCircle, Clock, Square, ChevronDown, Terminal, Zap, Activity } from 'lucide-react';

const BROWSER_ICONS = { chromium: Chrome, firefox: Globe2, webkit: Monitor };

const MODUL_NAMES = {
  login: 'Login & Auth', dashboard: 'Dashboard Layout', navigation: 'Navigation & Menu',
  structure: 'Structure & Layout', security: 'Security & Hack', form_validation: 'Form & Input',
  responsive: 'Responsive & Mobile', performance: 'Performance & Network',
  crud: 'CRUD & Interaction', api_data: 'API & Data',
};

const ALL_MODULES = ['login', 'dashboard', 'navigation', 'structure', 'security', 'form_validation', 'responsive', 'performance', 'crud', 'api_data'];

const STATUS_COLORS = {
  passed: { text: 'text-green-400', bg: 'bg-green-500/10', dot: 'bg-green-500', label: 'PASS' },
  failed: { text: 'text-red-400', bg: 'bg-red-500/10', dot: 'bg-red-500', label: 'FAIL' },
  running: { text: 'text-blue-400', bg: 'bg-blue-500/10', dot: 'bg-blue-500', label: 'RUN' },
  note: { text: 'text-amber-400', bg: 'bg-amber-500/10', dot: 'bg-amber-500', label: 'NOTE' },
  skipped: { text: 'text-slate-400', bg: 'bg-slate-500/10', dot: 'bg-slate-500', label: 'SKIP' },
};

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('id-ID', { hour12: false });
}

function ConfettiBurst() {
  const pieces = useMemo(() => {
    const colors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
    return Array.from({ length: 40 }, (_, i) => {
      const angle = (i / 40) * Math.PI * 2;
      const dist = 100 + Math.random() * 200;
      return {
        id: i,
        tx: Math.cos(angle) * dist,
        ty: Math.sin(angle) * dist,
        rot: Math.random() * 360,
        color: colors[i % colors.length],
        delay: Math.random() * 0.3,
      };
    });
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center">
      {pieces.map(p => (
        <div
          key={p.id}
          className="confetti-piece absolute w-2 h-2 rounded-sm"
          style={{
            '--tx': `${p.tx}px`,
            '--ty': `${p.ty}px`,
            '--rot': `${p.rot}deg`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function ModuleGrid({ steps, darkMode, completedModules }) {
  const moduleStatus = useMemo(() => {
    const status = {};
    for (const mod of ALL_MODULES) {
      status[mod] = { state: 'pending', count: 0, passed: 0, failed: 0, notes: 0 };
    }
    // Apply completed modules from server broadcast
    if (completedModules) {
      for (const [modName, modData] of Object.entries(completedModules)) {
        // Map display name to key
        const modKey = Object.entries(MODUL_NAMES).find(([k, v]) => v === modName)?.[0];
        if (modKey) {
          status[modKey].state = modData.failed > 0 ? 'failed' : 'done';
          status[modKey].passed = modData.passed;
          status[modKey].failed = modData.failed;
          status[modKey].notes = modData.notes;
        }
      }
    }
    // Update from live steps
    for (const s of steps) {
      if (!s.module) continue;
      // Map display name back to module key
      const modKey = Object.entries(MODUL_NAMES).find(([k, v]) => v === s.module)?.[0] || s.module;
      if (!status[modKey]) status[modKey] = { state: 'pending', count: 0, passed: 0, failed: 0, notes: 0 };
      status[modKey].count++;
      // Don't override completed module state from server
      if (status[modKey].state === 'done' || status[modKey].state === 'failed') continue;
      if (s.status === 'running') status[modKey].state = 'running';
      else if (s.status === 'failed') status[modKey].state = 'failed';
      else if (s.status === 'passed' || s.status === 'note' || s.status === 'skipped') {
        if (status[modKey].state === 'pending') status[modKey].state = 'running'; // Still running until module_done
      }
    }
    return status;
  }, [steps, completedModules]);

  return (
    <div className={`grid grid-cols-5 gap-1.5 p-2 flex-shrink-0 ${darkMode ? 'bg-slate-900' : 'bg-slate-50'}`}>
      {ALL_MODULES.map(mod => {
        const st = moduleStatus[mod] || { state: 'pending', count: 0 };
        const isActive = st.state === 'running';
        const isDone = st.state === 'done';
        const isFailed = st.state === 'failed';
        return (
          <div
            key={mod}
            className={`relative rounded-lg p-1.5 text-center transition-all ${
              isActive ? 'glow-pulse border border-blue-500/50' : ''
            } ${
              isDone ? 'bg-green-500/10' :
              isFailed ? 'bg-red-500/10' :
              isActive ? 'bg-blue-500/10' :
              darkMode ? 'bg-slate-800/50' : 'bg-slate-100'
            }`}
          >
            <div className={`text-[9px] font-medium truncate ${
              isDone ? 'text-green-500' :
              isFailed ? 'text-red-500' :
              isActive ? 'text-blue-400' :
              darkMode ? 'text-slate-500' : 'text-slate-400'
            }`}>
              {MODUL_NAMES[mod].split(' ')[0]}
            </div>
            <div className={`mt-0.5 flex items-center justify-center gap-0.5`}>
              {st.state === 'pending' && <div className={`w-1.5 h-1.5 rounded-full ${darkMode ? 'bg-slate-700' : 'bg-slate-300'}`} />}
              {st.state === 'running' && <Loader2 size={8} className="text-blue-400 animate-spin" />}
              {st.state === 'done' && <CheckCircle2 size={10} className="text-green-500" />}
              {st.state === 'failed' && <XCircle size={10} className="text-red-500" />}
            </div>
            {st.state === 'done' && st.count > 0 && (
              <div className="text-[8px] font-mono text-green-500/60 mt-0.5">{st.passed || st.count}p</div>
            )}
            {st.state === 'failed' && st.count > 0 && (
              <div className="text-[8px] font-mono text-red-500/60 mt-0.5">{st.failed || 0}f</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TelemetryStrip({ passed, failed, skipped, running, elapsed, progress, darkMode }) {
  const items = [
    { label: 'PASS', value: passed, color: 'text-green-400', icon: CheckCircle2 },
    { label: 'FAIL', value: failed, color: 'text-red-400', icon: XCircle },
    { label: 'SKIP', value: skipped, color: 'text-slate-400', icon: ChevronDown },
    { label: 'RUN', value: running, color: 'text-blue-400', icon: Activity },
  ];

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <div className={`flex items-center justify-between px-3 py-2 border-y flex-shrink-0 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
      <div className="flex items-center gap-3 sm:gap-4">
        {items.map(item => (
          <div key={item.label} className="flex items-center gap-1.5">
            <item.icon size={14} className={item.color} />
            <span className={`text-sm font-bold tabular-nums ${item.color} animate-count-up`} key={item.value}>
              {item.value}
            </span>
            <span className={`text-[10px] font-medium ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>{item.label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Clock size={14} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />
          <span className={`text-sm font-mono tabular-nums ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`relative w-7 h-7`}>
            <svg className="w-7 h-7 -rotate-90" viewBox="0 0 28 28">
              <circle cx="14" cy="14" r="11" fill="none" stroke={darkMode ? '#1e293b' : '#e2e8f0'} strokeWidth="3" />
              <circle
                cx="14" cy="14" r="11" fill="none" stroke="#3b82f6" strokeWidth="3"
                strokeDasharray={`${(progress / 100) * 69.1} 69.1`}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            </svg>
            <span className={`absolute inset-0 flex items-center justify-center text-[9px] font-bold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              {progress}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LiveTestPage({ run, onExit, onViewResults, onCancel, darkMode = false }) {
  const [hasFrame, setHasFrame] = useState(false);
  const [stepInfo, setStepInfo] = useState(null);
  const [steps, setSteps] = useState([]);
  const [connected, setConnected] = useState(false);
  const [done, setDone] = useState(false);
  const [localProgress, setLocalProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [completedModules, setCompletedModules] = useState({});
  const [frameSize, setFrameSize] = useState({ w: 1920, h: 1080 });
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const stepsRef = useRef(null);
  const startTimeRef = useRef(null);
  const canvasRef = useRef(null);
  const latestFrameRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (run?.status === 'completed' || run?.status === 'error' || run?.status === 'cancelled') {
      setLocalProgress(100);
      setDone(true);
    }
  }, [run?.status]);

  useEffect(() => {
    if (done) return;
    const handleKey = (e) => {
      if (e.key === 'Escape' && onCancel && run?.status === 'running') {
        if (window.confirm('Batalkan tes yang sedang berjalan?')) {
          onCancel();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [done, onCancel, run?.status]);

  const progress = Math.max(localProgress, run?.progress || 0);
  const results = run?.results || [];
  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const BrowserIcon = BROWSER_ICONS[run?.browser] || Chrome;

  useEffect(() => {
    if (done) return;
    if (!startTimeRef.current) startTimeRef.current = Date.now();
    const interval = setInterval(() => {
      if (startTimeRef.current) {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [done]);

  useEffect(() => {
    let mounted = true;

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsPort = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
      const wsUrl = `${protocol}//${window.location.hostname}:${wsPort}/ws/live`;

      try {
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => {
          if (!mounted) return;
          setConnected(true);
          reconnectAttemptsRef.current = 0;
          if (run?.id) ws.send(JSON.stringify({ type: 'subscribe', runId: run.id }));
        };

        ws.onmessage = (event) => {
          if (!mounted) return;
          // Binary frame: 1 byte type (0x01) + 1 byte runIdLen + runId + JPEG data
          if (event.data instanceof ArrayBuffer) {
            const buf = new Uint8Array(event.data);
            if (buf[0] === 0x01) {
              const runIdLen = buf[1];
              const frameRunId = new TextDecoder().decode(buf.slice(2, 2 + runIdLen));
              if (runIdLen > 0 && frameRunId !== run?.id) return;
              const jpegData = buf.slice(2 + runIdLen);
              const blob = new Blob([jpegData], { type: 'image/jpeg' });
              // Latest-frame buffer: store blob, render in rAF
              if (latestFrameRef.current) URL.revokeObjectURL(latestFrameRef.current.url);
              const frameUrl = URL.createObjectURL(blob);
              latestFrameRef.current = { url: frameUrl };
              if (!rafRef.current) {
                rafRef.current = requestAnimationFrame(() => {
                  rafRef.current = null;
                  const frame = latestFrameRef.current;
                  if (!frame) return;
                  createImageBitmap(new Blob([jpegData], { type: 'image/jpeg' })).then(bmp => {
                    const canvas = canvasRef.current;
                    if (canvas) {
                      if (canvas.width !== bmp.width || canvas.height !== bmp.height) {
                        canvas.width = bmp.width;
                        canvas.height = bmp.height;
                        setFrameSize({ w: bmp.width, h: bmp.height });
                      }
                      const ctx = canvas.getContext('2d');
                      ctx.imageSmoothingEnabled = true;
                      ctx.imageSmoothingQuality = 'high';
                      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
                      bmp.close();
                    }
                    setHasFrame(true);
                  }).catch(() => {});
                });
              }
            }
            return;
          }
          // Text frame: JSON for test steps
          try {
            const msg = JSON.parse(event.data);
            if (msg.runId && msg.runId !== run?.id) return;
            if (msg.type === 'test_step') {
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
                setSteps(prev => prev.map(s => s.testId === msg.data.testId && s.status === 'running' ? { ...s, status: 'failed', error: msg.data.title } : s));
              } else if (msg.data.action === 'note') {
                const isSkip = (msg.data.selector || '').includes('no ') || (msg.data.selector || '').includes('not ') || (msg.data.selector || '').includes('skipped');
                setSteps(prev => prev.map(s => s.testId === msg.data.testId && s.status === 'running' ? { ...s, status: isSkip ? 'skipped' : 'note' } : s));
              }
            } else if (msg.type === 'test_done') {
              setLocalProgress(100);
              setDone(true);
            } else if (msg.type === 'module_done') {
              if (msg.data && msg.data.module) {
                setCompletedModules(prev => ({
                  ...prev,
                  [msg.data.module]: { passed: msg.data.passed, failed: msg.data.failed, notes: msg.data.notes }
                }));
              }
            }
          } catch {}
        };

        ws.onclose = () => {
          if (!mounted) return;
          setConnected(false);
          if (reconnectRef.current) clearTimeout(reconnectRef.current);
          // Exponential backoff: 2s, 4s, 8s, max 10s
          const delay = Math.min(2000 * Math.pow(2, reconnectAttemptsRef.current || 0), 10000);
          reconnectAttemptsRef.current = (reconnectAttemptsRef.current || 0) + 1;
          reconnectRef.current = setTimeout(() => { if (mounted) connect(); }, delay);
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
  const skippedSteps = steps.filter(s => s.status === 'skipped').length;

  const recentSteps = steps.slice(-40);

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
            <span className={`text-xs truncate block font-mono ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{run?.url || ''}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
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

          <div className={`hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-colors ${darkMode ? 'text-slate-400 bg-slate-800' : 'text-slate-500 bg-slate-100'}`}>
            <BrowserIcon size={14} /> <span className="capitalize">{run?.browser || 'chromium'}</span>
          </div>

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

      {/* Telemetry Strip */}
      <TelemetryStrip
        passed={passedSteps}
        failed={failedSteps}
        skipped={skippedSteps}
        running={runningSteps}
        elapsed={elapsed}
        progress={progress}
        darkMode={darkMode}
      />

      {/* Main content - split layout */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Left: Live browser stream with HUD */}
        <div className="flex-1 flex flex-col min-h-0 bg-black relative">
          <div className="absolute inset-0 hud-corners pointer-events-none" />

          {!done && (
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded px-2 py-1">
              <div className="w-2 h-2 rounded-full bg-red-500 blink-rec" />
              <span className="text-red-400 text-[10px] font-mono font-bold">REC</span>
              <span className="text-slate-400 text-[10px] font-mono tabular-nums">{String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</span>
            </div>
          )}

          {hasFrame ? (
            <div className="flex-1 flex items-center justify-center p-2 overflow-hidden min-h-0">
              <div className="relative w-full h-full flex items-center justify-center">
                <canvas
                  ref={canvasRef}
                  width={frameSize.w}
                  height={frameSize.h}
                  className="rounded-lg shadow-2xl"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    width: 'auto',
                    height: 'auto',
                    aspectRatio: `${frameSize.w} / ${frameSize.h}`,
                    objectFit: 'contain',
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
              <Terminal size={40} className="mb-3 text-primary-500/50" />
              <span className="text-sm font-mono">Initializing browser...</span>
              <span className="text-xs font-mono text-slate-700 mt-1">await page.goto(url)</span>
            </div>
          )}

          {stepInfo && !done && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent px-4 py-4">
              <div className="flex items-center gap-2 text-sm flex-wrap">
                {stepInfo.action === 'error' ? (
                  <span className="px-2 py-0.5 rounded bg-red-500/40 text-red-200 font-mono font-bold text-xs">FAIL</span>
                ) : stepInfo.action === 'done' ? (
                  <span className="px-2 py-0.5 rounded bg-green-500/40 text-green-200 font-mono font-bold text-xs">PASS</span>
                ) : stepInfo.action === 'start' ? (
                  <span className="px-2 py-0.5 rounded bg-blue-500/40 text-blue-200 font-mono font-bold text-xs animate-pulse">RUN</span>
                ) : stepInfo.action === 'note' ? (
                  <span className="px-2 py-0.5 rounded bg-amber-500/40 text-amber-200 font-mono font-bold text-xs">NOTE</span>
                ) : null}
                {stepInfo.testId && stepInfo.testId !== 'DETECT' && stepInfo.testId !== 'PROGRESS' && (
                  <span className="font-mono text-slate-400 text-xs">{stepInfo.testId}</span>
                )}
                {stepInfo.module && (
                  <span className="text-slate-400 text-xs">| {MODUL_NAMES[stepInfo.module] || stepInfo.module}</span>
                )}
                <span className="text-slate-100 font-medium">{stepInfo.title}</span>
              </div>
            </div>
          )}

          {done && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
              <ConfettiBurst />
              <div className="text-center relative z-10">
                <div className="flex items-center justify-center gap-6 mb-4">
                  <div className="flex flex-col items-center">
                    <CheckCircle2 size={36} className="text-green-400 mb-1 mission-glow" />
                    <span className="text-green-400 text-3xl font-bold mission-glow">{passed}</span>
                    <span className="text-slate-400 text-xs mt-0.5">Lulus</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <XCircle size={36} className="text-red-400 mb-1 mission-glow" />
                    <span className="text-red-400 text-3xl font-bold mission-glow">{failed}</span>
                    <span className="text-slate-400 text-xs mt-0.5">Gagal</span>
                  </div>
                  {skipped > 0 && (
                    <div className="flex flex-col items-center">
                      <ChevronDown size={36} className="text-slate-400 mb-1" />
                      <span className="text-slate-400 text-3xl font-bold">{skipped}</span>
                      <span className="text-slate-500 text-xs mt-0.5">Skip</span>
                    </div>
                  )}
                </div>
                <p className="text-slate-300 text-sm font-mono mb-4 mission-glow">Mission Complete</p>
                <button
                  onClick={onViewResults}
                  className="flex items-center gap-2 mx-auto text-white bg-gradient-to-r from-primary-500 to-primary-700 px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity font-medium animate-pulse"
                >
                  <Eye size={18} /> Lihat Hasil Lengkap
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Terminal log + Module grid */}
        <div className={`w-full lg:w-96 xl:w-[420px] flex flex-col border-t lg:border-t-0 lg:border-l min-h-0 flex-shrink-0 max-h-[40vh] lg:max-h-none transition-colors ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
          <ModuleGrid steps={steps} darkMode={darkMode} completedModules={completedModules} />

          {stepInfo && !done && (
            <div className={`px-3 py-2 border-b flex-shrink-0 transition-colors ${darkMode ? 'bg-slate-800/50 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <Zap size={12} className="text-blue-400" />
                <p className={`text-[10px] font-mono uppercase tracking-wider ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Executing</p>
              </div>
              <p className={`text-sm font-medium truncate ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>{stepInfo.title}</p>
              <div className="flex items-center gap-2 mt-1">
                {stepInfo.testId && stepInfo.testId !== 'DETECT' && stepInfo.testId !== 'PROGRESS' && (
                  <span className={`text-xs font-mono ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{stepInfo.testId}</span>
                )}
                {stepInfo.module && (
                  <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{MODUL_NAMES[stepInfo.module] || stepInfo.module}</span>
                )}
              </div>
            </div>
          )}

          <div ref={stepsRef} className="flex-1 overflow-y-auto p-2 min-h-0 terminal-log">
            {steps.length === 0 && (
              <div className={`flex items-center gap-2 h-full text-xs font-mono ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                <Terminal size={14} />
                <span>Waiting for test execution...</span>
              </div>
            )}
            {recentSteps.map((s, i) => {
              const sc = STATUS_COLORS[s.status] || STATUS_COLORS.running;
              return (
                <div key={i} className={`log-entry flex items-start gap-1.5 px-1.5 py-1 rounded ${sc.bg}`}>
                  <span className="text-slate-600 flex-shrink-0 tabular-nums">{formatTime(s.time)}</span>
                  <span className={`flex-shrink-0 font-bold ${sc.text}`}>[{sc.label}]</span>
                  {s.testId && s.testId !== 'DETECT' && (
                    <span className={`font-mono flex-shrink-0 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{s.testId}</span>
                  )}
                  <span className={`truncate flex-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>{s.title}</span>
                </div>
              );
            })}
          </div>

          {results.length > 0 && (
            <div className={`border-t p-2 max-h-24 overflow-y-auto flex-shrink-0 transition-colors ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
              <p className={`text-[10px] mb-1 px-1 font-mono uppercase tracking-wider ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>Results ({results.length})</p>
              <div className="space-y-0.5">
                {results.slice(-5).map((r, i) => {
                  const sc = STATUS_COLORS[r.status] || STATUS_COLORS.failed;
                  return (
                    <div key={i} className="flex items-center gap-1.5 px-1 py-0.5 rounded text-[10px] font-mono">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sc.dot}`} />
                      <span className="text-slate-500 flex-shrink-0">{r.testId}</span>
                      <span className={`truncate flex-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{r.title}</span>
                      <span className="text-slate-600 flex-shrink-0 tabular-nums">{r.duration}ms</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
