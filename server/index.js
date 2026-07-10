const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { v4: uuidv4 } = require('uuid');
const { WebSocketServer } = require('ws');
const TestRunner = require('./test-runner');
const ReportGenerator = require('./report-generator');
const PdfGenerator = require('./pdf-generator');

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.SKYOURTEST_API_KEY || 'skyourtest-default-key-2024';
const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'runs.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));

const testRunner = new TestRunner();
const reportGenerator = new ReportGenerator();
const pdfGenerator = new PdfGenerator();

const runs = new Map();

function loadRuns() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      for (const run of data) {
        runs.set(run.id, run);
      }
      console.log(`  Loaded ${runs.size} runs from disk`);
    }
  } catch (err) {
    console.error('  Failed to load runs:', err.message);
  }
}

function saveRuns() {
  try {
    const data = Array.from(runs.values());
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('  Failed to save runs:', err.message);
  }
}

loadRuns();

function requireApiKey(req, res, next) {
  const authHeader = req.headers['authorization'];
  const apiKey = req.headers['x-api-key'];
  const queryKey = req.query.api_key;
  const providedKey = (authHeader && authHeader.replace('Bearer ', '')) || apiKey || queryKey;
  if (providedKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized - invalid or missing API key' });
  }
  next();
}

app.get('/api/runs', (req, res) => {
  const allRuns = Array.from(runs.values()).sort((a, b) =>
    new Date(b.startTime) - new Date(a.startTime)
  );
  res.json(allRuns);
});

app.get('/api/runs/:id', (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json(run);
});

function getActiveRun() {
  for (const [id, run] of runs) {
    if (run.status === 'running') return run;
  }
  return null;
}

app.get('/api/active-run', (req, res) => {
  const active = getActiveRun();
  if (active) {
    res.json({
      id: active.id,
      status: active.status,
      progress: active.progress || 0,
      currentTest: active.currentTest || '',
      url: active.url,
      browser: active.browser,
      testMode: active.testMode,
      startTime: active.startTime,
      results: active.results,
      summary: active.summary,
    });
  } else {
    res.json(null);
  }
});

app.post('/api/runs', async (req, res) => {
  const { url, username, password, browser, testModules, testMode } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const activeRun = getActiveRun();
  if (activeRun) {
    return res.status(409).json({
      error: 'Tes sedang berjalan. Tunggu tes selesai sebelum memulai tes baru.',
      activeRunId: activeRun.id,
      activeRunUrl: activeRun.url,
    });
  }

  const runId = uuidv4();
  const run = {
    id: runId,
    url,
    username: username || '',
    password: password || '',
    browser: browser || 'chromium',
    testMode: testMode || 'login_dashboard',
    testModules: testModules || ['all'],
    status: 'running',
    startTime: new Date().toISOString(),
    endTime: null,
    results: [],
    summary: null,
    progress: 0,
    currentTest: 'Inisialisasi...',
  };

  runs.set(runId, run);
  saveRuns();

  testRunner.run(run).then((results) => {
    if (run.status === 'cancelled') return;
    run.results = results;
    run.summary = testRunner.generateSummary(results);
    run.status = 'completed';
    run.progress = 100;
    run.currentTest = 'Selesai';
    run.endTime = new Date().toISOString();
    runs.set(runId, run);
    saveRuns();
  }).catch((err) => {
    run.status = 'error';
    run.error = err.message;
    run.endTime = new Date().toISOString();
    runs.set(runId, run);
    saveRuns();
  });

  res.json(run);
});

app.get('/api/runs/:id/status', (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json({
    id: run.id,
    status: run.status,
    progress: run.progress || 0,
    currentTest: run.currentTest || '',
    results: run.results,
    summary: run.summary,
    url: run.url,
    browser: run.browser,
    testMode: run.testMode,
    startTime: run.startTime,
    endTime: run.endTime,
  });
});

app.get('/api/runs/:id/report', async (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  try {
    const filePath = await reportGenerator.generateExcel(run);
    res.download(filePath, path.basename(filePath));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/runs/:id/report/pdf', async (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  try {
    const pdfBuffer = await pdfGenerator.generateReport(run);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="skyourtest-report-${run.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/runs/:id', (req, res) => {
  runs.delete(req.params.id);
  saveRuns();
  res.json({ success: true });
});

app.post('/api/runs/:id/cancel', (req, res) => {
  const run = runs.get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  if (run.status !== 'running') return res.status(400).json({ error: 'Run is not running' });

  try {
    testRunner.cancel();
  } catch (e) {
    console.error('  Cancel failed:', e.message);
  }

  run.status = 'cancelled';
  run.endTime = new Date().toISOString();
  run.currentTest = 'Dibatalkan';
  run.progress = run.progress || 0;
  runs.set(run.id, run);
  saveRuns();
  res.json({ success: true, runId: run.id, status: 'cancelled' });
});

// ===== CI/CD Webhook =====

app.post('/api/webhook/trigger', requireApiKey, async (req, res) => {
  const { url, username, password, browser, testModules, testMode, webhookCallback } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  const activeRun = getActiveRun();
  if (activeRun) {
    return res.status(409).json({
      error: 'Tes sedang berjalan. Tunggu tes selesai sebelum memulai tes baru.',
      activeRunId: activeRun.id,
    });
  }

  const runId = uuidv4();
  const run = {
    id: runId,
    url,
    username: username || '',
    password: password || '',
    browser: browser || 'chromium',
    testMode: testMode || 'login_dashboard',
    testModules: testModules || ['all'],
    status: 'running',
    startTime: new Date().toISOString(),
    endTime: null,
    results: [],
    summary: null,
    progress: 0,
    currentTest: 'Inisialisasi...',
    triggeredBy: 'webhook',
  };

  runs.set(runId, run);
  saveRuns();

  testRunner.run(run).then(async (results) => {
    if (run.status === 'cancelled') return;
    run.results = results;
    run.summary = testRunner.generateSummary(results);
    run.status = 'completed';
    run.endTime = new Date().toISOString();
    runs.set(runId, run);
    saveRuns();

    if (webhookCallback) {
      try {
        const httpModule = webhookCallback.startsWith('https:') ? require('https') : require('http');
        const callbackData = JSON.stringify({
          runId: run.id,
          url: run.url,
          status: 'completed',
          summary: run.summary,
          reportUrl: `http://localhost:${PORT}/api/runs/${run.id}/report`,
        });
        const urlObj = new URL(webhookCallback);
        const options = {
          hostname: urlObj.hostname,
          port: urlObj.port || (webhookCallback.startsWith('https:') ? 443 : 80),
          path: urlObj.pathname + urlObj.search,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(callbackData) },
        };
        const req = httpModule.request(options);
        req.write(callbackData);
        req.end();
      } catch (e) {
        console.error('  Webhook callback failed:', e.message);
      }
    }
  }).catch((err) => {
    run.status = 'error';
    run.error = err.message;
    run.endTime = new Date().toISOString();
    runs.set(runId, run);
    saveRuns();
  });

  res.json({
    runId,
    status: 'running',
    message: 'Test started via webhook. Poll /api/runs/{runId}/status for updates.',
    pollUrl: `http://localhost:${PORT}/api/runs/${runId}/status`,
    reportUrl: `http://localhost:${PORT}/api/runs/${runId}/report`,
  });
});

app.get('/api/info', (req, res) => {
  res.json({
    name: 'SkyourTest',
    version: '3.0.0',
    description: 'QC Automation Testing Platform',
    endpoints: {
      triggerTest: 'POST /api/runs',
      webhookTrigger: 'POST /api/webhook/trigger (requires API key)',
      getStatus: 'GET /api/runs/:id/status',
      getReport: 'GET /api/runs/:id/report',
      getPdfReport: 'GET /api/runs/:id/report/pdf',
      listRuns: 'GET /api/runs',
    },
    modules: [
      'dashboard', 'accessibility', 'login', 'navigation', 'security', 'performance',
      'responsive', 'form_validation', 'menu_traversal',
      'api_response', 'cookie_session', 'content_seo',
      'crud', 'payment', 'camera',
      'multi_role', 'file_upload', 'email_notif', 'booking',
    ],
    testModes: ['login_dashboard', 'direct_dashboard', 'login_only', 'dashboard_with_login'],
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
});

// ===== WebSocket Server for Live Browser Streaming =====
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/live' });

const wsClients = new Set();
global.wsClients = wsClients;

function broadcastWs(message) {
  const data = JSON.stringify(message);
  const targetRunId = message.runId;
  for (const ws of wsClients) {
    if (ws.readyState === 1 && ws.runId === targetRunId) {
      ws.send(data);
    }
  }
}

global.broadcastWs = broadcastWs;

function broadcastFrame(runId, frameData) {
  const msg = JSON.stringify({ type: 'frame', data: frameData, runId });
  for (const ws of wsClients) {
    if (ws.readyState === 1 && ws.runId === runId) {
      ws.send(msg);
    }
  }
}

global.broadcastFrame = broadcastFrame;

wss.on('connection', (ws, req) => {
  wsClients.add(ws);
  console.log(`  WebSocket client connected (total: ${wsClients.size})`);

  ws.on('message', (msg) => {
    try {
      const parsed = JSON.parse(msg);
      if (parsed.type === 'subscribe' && parsed.runId) {
        ws.runId = parsed.runId;
      }
    } catch {}
  });

  ws.on('close', () => {
    wsClients.delete(ws);
    console.log(`  WebSocket client disconnected (total: ${wsClients.size})`);
  });

  ws.on('error', () => {
    wsClients.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  SkyourTest - QC Automation Server`);
  console.log(`  Running on http://localhost:${PORT}`);
  console.log(`  WebSocket: ws://localhost:${PORT}/ws/live`);
  console.log(`  API Key: ${API_KEY}`);
  console.log(`  Webhook: POST /api/webhook/trigger`);
  console.log(`========================================\n`);
});
