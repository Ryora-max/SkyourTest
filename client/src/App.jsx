import { useState, useEffect, useCallback, useRef } from 'react';
import TestConfigForm from './components/TestConfigForm';
import TestProgress from './components/TestProgress';
import TestResults from './components/TestResults';
import RunHistory from './components/RunHistory';
import CompareRuns from './components/CompareRuns';
import LiveTestPage from './components/LiveTestPage';
import Header from './components/Header';
import ParticleBackground from './components/ParticleBackground';
import LandingPage from './components/LandingPage';
import LoadingScreen from './components/LoadingScreen';
import LearnLogin from './components/LearnLogin';
import LearnPage from './components/LearnPage';
import { ToastProvider, useToast } from './components/ToastContext';

const API_BASE = '';

const RUN_CACHE_KEY = 'skyo_current_run';

function AppContent() {
  const { toast } = useToast();
  const [view, setView] = useState('landing');
  const [currentRun, setCurrentRun] = useState(() => {
    try {
      const cached = localStorage.getItem(RUN_CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });
  const [runs, setRuns] = useState([]);
  const [pollInterval, setPollInterval] = useState(null);
  const [appLoading, setAppLoading] = useState(true);
  const [showLearnLogin, setShowLearnLogin] = useState(false);
  const [learnAuthed, setLearnAuthed] = useState(() => localStorage.getItem('skyo_learn_auth') === 'true');
  const [activeRunExists, setActiveRunExists] = useState(false);
  const pollIntervalRef = useRef(null);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('skyourtest-dark');
    if (saved !== null) return saved === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('skyourtest-dark', darkMode);
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(prev => !prev);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/runs`);
      const data = await res.json();
      setRuns(data);
    } catch (err) {
      console.error('Gagal mengambil riwayat:', err);
    }
  }, []);

  // Sync currentRun to localStorage whenever it changes (cross-tab sync)
  useEffect(() => {
    if (currentRun && currentRun.status === 'running') {
      localStorage.setItem(RUN_CACHE_KEY, JSON.stringify(currentRun));
    } else {
      localStorage.removeItem(RUN_CACHE_KEY);
    }
  }, [currentRun]);

  // Listen for localStorage changes from other tabs/devices
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === RUN_CACHE_KEY) {
        if (e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue);
            if (parsed.status === 'running') {
              setCurrentRun(parsed);
              setActiveRunExists(true);
              setView('live');
            }
          } catch {}
        } else {
          // Run cache cleared by another tab
          if (currentRun && currentRun.status === 'running') {
            setCurrentRun(null);
            setActiveRunExists(false);
          }
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [currentRun]);

  useEffect(() => {
    fetchRuns();
    // Check for active run on load (reload recovery)
    fetch(`${API_BASE}/api/active-run`)
      .then(res => res.json())
      .then(activeRun => {
        if (activeRun && activeRun.status === 'running') {
          setCurrentRun(activeRun);
          setActiveRunExists(true);
          setView('live');
          // Resume polling for the active run
          let pollErrors = 0;
          const interval = setInterval(async () => {
            try {
              const statusRes = await fetch(`${API_BASE}/api/runs/${activeRun.id}/status`);
              const status = await statusRes.json();
              pollErrors = 0;
              setCurrentRun(status);
              if (status.status === 'completed' || status.status === 'error' || status.status === 'cancelled') {
                clearInterval(interval);
                setPollInterval(null);
                pollIntervalRef.current = null;
                setActiveRunExists(false);
                localStorage.removeItem(RUN_CACHE_KEY);
                fetchRuns();
              }
            } catch (err) {
              pollErrors++;
              if (pollErrors >= 3) {
                clearInterval(interval);
                setPollInterval(null);
                pollIntervalRef.current = null;
              }
            }
          }, 2000);
          setPollInterval(interval);
          pollIntervalRef.current = interval;
        } else {
          // No active run — clear stale cache
          localStorage.removeItem(RUN_CACHE_KEY);
          if (currentRun && currentRun.status === 'running') {
            setCurrentRun(null);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        setTimeout(() => setAppLoading(false), 1800);
      });
  }, [fetchRuns]);

  // Hidden learn page trigger: Ctrl+Shift+L or URL hash #learn
  useEffect(() => {
    const handleKey = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        if (learnAuthed) setView('learn');
        else setShowLearnLogin(true);
      }
    };
    window.addEventListener('keydown', handleKey);
    if (window.location.hash === '#learn') {
      if (learnAuthed) setView('learn');
      else setShowLearnLogin(true);
    }
    return () => window.removeEventListener('keydown', handleKey);
  }, [learnAuthed]);

  const startTest = async (config) => {
    try {
      const res = await fetch(`${API_BASE}/api/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.status === 409) {
        const errData = await res.json();
        toast(errData.error || 'Tes sedang berjalan. Tunggu tes selesai.', 'error');
        return;
      }
      const run = await res.json();
      setCurrentRun(run);
      setActiveRunExists(true);
      setView('live');

      let pollErrors = 0;
      const interval = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API_BASE}/api/runs/${run.id}/status`);
          const status = await statusRes.json();
          pollErrors = 0;
          setCurrentRun(status);

          if (status.status === 'completed' || status.status === 'error' || status.status === 'cancelled') {
            clearInterval(interval);
            setPollInterval(null);
            pollIntervalRef.current = null;
            setActiveRunExists(false);
            localStorage.removeItem(RUN_CACHE_KEY);
            fetchRuns();

            if (status.status === 'completed') {
              try {
                const pdfRes = await fetch(`${API_BASE}/api/runs/${run.id}/report/pdf`);
                if (pdfRes.ok) {
                  const blob = await pdfRes.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `SkyourTest-${run.id}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  window.URL.revokeObjectURL(url);
                }
              } catch (e) {
                console.error('Auto-download PDF failed:', e);
              }
            }
          }
        } catch (err) {
          pollErrors++;
          console.error('Poll error:', err);
          if (pollErrors >= 3) {
            clearInterval(interval);
            setPollInterval(null);
            pollIntervalRef.current = null;
          }
        }
      }, 2000);

      setPollInterval(interval);
      pollIntervalRef.current = interval;
    } catch (err) {
      console.error('Gagal memulai tes:', err);
      toast('Gagal memulai tes. Pastikan server berjalan!', 'error');
    }
  };

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setPollInterval(null);
  };

  const cancelTest = async (runId) => {
    stopPolling();
    try {
      await fetch(`${API_BASE}/api/runs/${runId}/cancel`, { method: 'POST' });
    } catch (err) {
      console.error('Gagal membatalkan tes:', err);
    }
    setActiveRunExists(false);
    setCurrentRun(null);
    localStorage.removeItem(RUN_CACHE_KEY);
    setView('new');
    fetchRuns();
  };

  useEffect(() => () => {
    stopPolling();
  }, []);

  const downloadReport = (runId) => {
    window.open(`${API_BASE}/api/runs/${runId}/report`, '_blank');
  };

  const downloadPdfReport = async (runId) => {
    try {
      const res = await fetch(`${API_BASE}/api/runs/${runId}/report/pdf`);
      if (!res.ok) throw new Error('Failed to download PDF');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SkyourTest-${runId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error('PDF download failed:', e);
      window.open(`${API_BASE}/api/runs/${runId}/report/pdf`, '_blank');
    }
  };

  const viewRun = (run) => {
    setCurrentRun(run);
    setView('results');
  };

  const handleLearnAuth = (success) => {
    if (success) {
      setLearnAuthed(true);
      setShowLearnLogin(false);
      setView('learn');
    }
  };

  const deleteRun = async (runId) => {
    try {
      await fetch(`${API_BASE}/api/runs/${runId}`, { method: 'DELETE' });
      fetchRuns();
      if (currentRun?.id === runId) {
        setCurrentRun(null);
        setView('new');
      }
    } catch (err) {
      console.error('Gagal menghapus:', err);
    }
  };

  const handleSetView = (newView) => {
    if (newView === view) return;
    setView(newView);
  };

  if (appLoading) return <LoadingScreen />;

  if (view === 'landing') {
    return (
      <>
        <LandingPage onEnterApp={() => handleSetView('new')} darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
        {showLearnLogin && <LearnLogin onAuth={handleLearnAuth} onClose={() => setShowLearnLogin(false)} />}
      </>
    );
  }

  if (view === 'learn' && learnAuthed) {
    return (
      <>
        <LearnPage onExit={() => handleSetView('landing')} darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
        {showLearnLogin && <LearnLogin onAuth={handleLearnAuth} onClose={() => setShowLearnLogin(false)} />}
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row relative">
      {view !== 'live' && <ParticleBackground darkMode={darkMode} />}
      {view !== 'live' && <div className="deco-orb deco-orb-1" />}
      {view !== 'live' && <div className="deco-orb deco-orb-2" />}
      {view !== 'live' && <div className="deco-orb deco-orb-3" />}
      <Header view={view} setView={handleSetView} darkMode={darkMode} toggleDarkMode={toggleDarkMode} hasActiveRun={!!currentRun} onLogoSecretClick={() => { if (learnAuthed) handleSetView('learn'); else setShowLearnLogin(true); }} onGoHome={() => handleSetView('landing')} />

      <main className="flex-1 px-4 sm:px-6 lg:px-8 pt-4 lg:pt-8 pb-8 min-w-0 relative" style={{ zIndex: 1 }}>
        <div key={view} className="animate-fade-in">
          {view === 'new' && (
            <TestConfigForm onStart={startTest} disabled={activeRunExists} />
          )}

          {view === 'live' && currentRun && (
            <LiveTestPage
              key={currentRun.id}
              run={currentRun}
              darkMode={darkMode}
              onViewResults={() => handleSetView('results')}
              onExit={() => handleSetView('progress')}
              onCancel={() => cancelTest(currentRun.id)}
            />
          )}

          {view === 'progress' && currentRun && (
            <TestProgress run={currentRun} onLiveScreen={() => handleSetView('live')} darkMode={darkMode} />
          )}

          {view === 'results' && currentRun && (
            <TestResults run={currentRun} onDownloadReport={downloadReport} onDownloadPdf={downloadPdfReport} onNewTest={() => { setCurrentRun(null); handleSetView('new'); }} onBack={() => handleSetView('history')} />
          )}

          {view === 'history' && (
            <RunHistory runs={runs} onView={viewRun} onDelete={deleteRun} onDownloadReport={downloadReport} onDownloadPdf={downloadPdfReport} />
          )}

          {view === 'compare' && (
            <CompareRuns runs={runs} onBack={() => handleSetView('history')} />
          )}
        </div>
      </main>
      {showLearnLogin && <LearnLogin onAuth={handleLearnAuth} onClose={() => setShowLearnLogin(false)} />}
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

export default App;
