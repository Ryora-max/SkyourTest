import { useState, useEffect, useRef } from 'react';
import { Radio, Loader2, Eye, Monitor } from 'lucide-react';

export default function LiveBrowserView({ runId, fullscreen = false, runStatus, darkMode = false }) {
  const [hasFrame, setHasFrame] = useState(false);
  const [stepInfo, setStepInfo] = useState(null);
  const [connected, setConnected] = useState(false);
  const [done, setDone] = useState(false);
  const [frameSize, setFrameSize] = useState({ w: 1920, h: 1080 });
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const canvasRef = useRef(null);
  const latestFrameRef = useRef(null);
  const rafRef = useRef(null);

  // Fallback: if runStatus prop is completed/error, set done
  useEffect(() => {
    if (runStatus === 'completed' || runStatus === 'error') {
      setDone(true);
    }
  }, [runStatus]);

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
          if (runId) {
            ws.send(JSON.stringify({ type: 'subscribe', runId }));
          }
        };

        ws.onmessage = (event) => {
          if (!mounted) return;
          if (event.data instanceof ArrayBuffer) {
            const buf = new Uint8Array(event.data);
            if (buf[0] === 0x01) {
              const runIdLen = buf[1];
              const frameRunId = new TextDecoder().decode(buf.slice(2, 2 + runIdLen));
              if (runIdLen > 0 && frameRunId !== runId) return;
              const jpegData = buf.slice(2 + runIdLen);
              const blob = new Blob([jpegData], { type: 'image/jpeg' });
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
          try {
            const msg = JSON.parse(event.data);
            if (msg.runId && msg.runId !== runId) return;
            if (msg.type === 'test_step') {
              setStepInfo(msg.data);
            } else if (msg.type === 'test_done') {
              setDone(true);
            }
          } catch {}
        };

        ws.onclose = () => {
          if (!mounted) return;
          setConnected(false);
          if (reconnectRef.current) clearTimeout(reconnectRef.current);
          reconnectRef.current = setTimeout(() => {
            if (mounted) connect();
          }, 2000);
        };

        ws.onerror = () => {
          setConnected(false);
        };
      } catch {
        if (reconnectRef.current) clearTimeout(reconnectRef.current);
        reconnectRef.current = setTimeout(() => {
          if (mounted) connect();
        }, 2000);
      }
    }

    connect();

    // Sync done state from runStatus prop
    if (runStatus === 'completed' || runStatus === 'error' || runStatus === 'cancelled') {
      setDone(true);
    }

    return () => {
      mounted = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [runId]);

  return (
    <div className={`overflow-hidden shadow-lg transition-colors ${fullscreen ? 'flex flex-col h-full' : 'rounded-xl border'} ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-2.5 border-b transition-colors ${fullscreen ? 'flex-shrink-0' : ''} ${darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-50/80 border-slate-200'}`}>
        <div className="flex items-center gap-2">
          <Monitor size={18} className={darkMode ? 'text-blue-400' : 'text-blue-600'} />
          <span className={`text-sm font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>Live Browser View</span>
        </div>
        <div className="flex items-center gap-2">
          {done ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-green-500">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Selesai
            </span>
          ) : connected ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-red-500">
              <Radio size={12} className="animate-pulse" />
              LIVE
            </span>
          ) : (
            <span className={`flex items-center gap-1.5 text-xs font-medium ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
              <span className={`w-2 h-2 rounded-full ${darkMode ? 'bg-slate-500' : 'bg-slate-400'}`} />
              Connecting...
            </span>
          )}
        </div>
      </div>

      {/* Browser Frame */}
      <div className={`relative bg-black overflow-hidden ${fullscreen ? 'flex-1 min-h-0' : ''}`} style={fullscreen ? {} : { minHeight: '300px' }}>
        {hasFrame ? (
          <div className={`flex items-center justify-center w-full h-full ${fullscreen ? 'min-h-0' : ''}`} style={fullscreen ? {} : { minHeight: '300px' }}>
            <canvas
              ref={canvasRef}
              width={frameSize.w}
              height={frameSize.h}
              className="block"
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
        ) : (
          <div className={`flex flex-col items-center justify-center ${darkMode ? 'text-slate-500' : 'text-slate-400'} ${fullscreen ? 'h-full' : 'h-[300px]'}`}>
            <Loader2 size={32} className="animate-spin mb-2" />
            <span className="text-sm">Menunggu browser stream...</span>
          </div>
        )}

        {/* Overlay: Test Step Info */}
        {stepInfo && !done && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-3">
            <div className="flex items-center gap-2 text-xs">
              {stepInfo.action === 'error' ? (
                <span className="px-1.5 py-0.5 rounded bg-red-500/30 text-red-300 font-mono font-bold">FAIL</span>
              ) : stepInfo.action === 'done' ? (
                <span className="px-1.5 py-0.5 rounded bg-green-500/30 text-green-300 font-mono font-bold">PASS</span>
              ) : stepInfo.action === 'start' ? (
                <span className="px-1.5 py-0.5 rounded bg-blue-500/30 text-blue-300 font-mono font-bold animate-pulse">RUN</span>
              ) : null}
              {stepInfo.testId && stepInfo.testId !== 'DETECT' && (
                <span className="font-mono text-slate-400">{stepInfo.testId}</span>
              )}
              {stepInfo.module && (
                <span className="text-slate-400">| {stepInfo.module}</span>
              )}
              <span className="text-slate-200 font-medium truncate">{stepInfo.title}</span>
            </div>
          </div>
        )}

        {/* Done overlay */}
        {done && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <div className="text-center">
              <Eye size={36} className="text-green-400 mx-auto mb-2" />
              <span className="text-green-400 font-semibold text-lg">Tes Selesai</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
