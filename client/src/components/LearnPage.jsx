import { useState } from 'react';
import {
  ArrowLeft, Moon, Sun, BookOpen, Layers, FolderTree, Server, TestTube,
  Workflow, Radio, FileText, Lightbulb, ChevronDown, ChevronRight,
  CheckCircle2, XCircle, Globe, Code2, Database, Zap
} from 'lucide-react';
import Logo from './Logo';
import ParticleBackground from './ParticleBackground';

const TABS = [
  { id: 'overview', label: 'Overview', icon: BookOpen },
  { id: 'techstack', label: 'Tech Stack', icon: Layers },
  { id: 'structure', label: 'File Structure', icon: FolderTree },
  { id: 'api', label: 'API Endpoints', icon: Server },
  { id: 'modules', label: 'Test Modules', icon: TestTube },
  { id: 'dataflow', label: 'Data Flow', icon: Workflow },
  { id: 'websocket', label: 'WebSocket', icon: Radio },
  { id: 'reports', label: 'Report Generation', icon: FileText },
  { id: 'tips', label: 'Tips & Customization', icon: Lightbulb },
];

export default function LearnPage({ onExit, darkMode, toggleDarkMode }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedSections, setExpandedSections] = useState({});

  const toggleSection = (id) => {
    setExpandedSections(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      <ParticleBackground darkMode={darkMode} />

      {/* Top nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-4 border-b border-slate-200/50 dark:border-slate-700/50 glass-sidebar">
        <div className="flex items-center gap-3">
          <button onClick={onExit} className="p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Logo size="sm" />
          <div>
            <h1 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">Learn & Understand</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">SkyourTest Documentation</p>
          </div>
        </div>
        <button onClick={toggleDarkMode} className="p-2.5 rounded-xl glass-card hover:scale-105 transition-transform">
          {darkMode ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-blue-600" />}
        </button>
      </nav>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6">
        <div className="grid lg:grid-cols-[220px_1fr] gap-6">
          {/* Sidebar tabs */}
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="glass-card p-3 rounded-2xl space-y-1">
              {TABS.map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      active
                        ? 'bg-gradient-to-r from-primary-500 to-blue-500 text-white shadow-lg shadow-primary-500/30'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-blue-100/60 dark:hover:bg-blue-900/20'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Content */}
          <main className="min-w-0">
            <div key={activeTab} className="animate-view-enter space-y-4">
              {activeTab === 'overview' && <OverviewTab />}
              {activeTab === 'techstack' && <TechStackTab />}
              {activeTab === 'structure' && <StructureTab expandedSections={expandedSections} toggleSection={toggleSection} />}
              {activeTab === 'api' && <ApiTab />}
              {activeTab === 'modules' && <ModulesTab />}
              {activeTab === 'dataflow' && <DataFlowTab />}
              {activeTab === 'websocket' && <WebSocketTab />}
              {activeTab === 'reports' && <ReportsTab />}
              {activeTab === 'tips' && <TipsTab />}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children, icon: Icon }) {
  return (
    <div className="glass-card p-5 sm:p-6 rounded-2xl">
      {title && (
        <h3 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100 mb-3">
          {Icon && <Icon className="w-5 h-5 text-primary-500" />}
          {title}
        </h3>
      )}
      <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

function CodeBlock({ children }) {
  return (
    <pre className="bg-slate-900 dark:bg-slate-950 text-slate-100 rounded-xl p-4 text-xs font-mono overflow-x-auto border border-slate-700/50">
      <code>{children}</code>
    </pre>
  );
}

function Tag({ children, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-100/60 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    teal: 'bg-teal-100/60 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400',
    rose: 'bg-rose-100/60 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400',
    amber: 'bg-amber-100/60 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  };
  return <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${colors[color]}`}>{children}</span>;
}

function OverviewTab() {
  return (
    <>
      <Card title="Apa itu SkyourTest?" icon={BookOpen}>
        <p>SkyourTest adalah platform <strong>Quality Assurance (QA) Automation</strong> yang menjalankan pengujian otomatis terhadap website target. Platform ini menggunakan <strong>Playwright</strong> untuk mengotomatiskan browser, menjalankan 100 test case kritis across 10 modul, dan menghasilkan laporan profesional dalam format Excel dan PDF.</p>
        <p>Aplikasi ini terdiri dari <strong>frontend React</strong> (Vite + Tailwind CSS) dan <strong>backend Express.js</strong> yang menjalankan Playwright, mengelola WebSocket untuk live streaming, dan menyimpan riwayat tes.</p>
      </Card>

      <Card title="Fitur Utama" icon={Zap}>
        <ul className="space-y-2">
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-teal-500 flex-shrink-0 mt-0.5" /> <span><strong>10 Modul Tes:</strong> Login & Auth, Dashboard Layout, Navigation & Menu, Structure & Layout, Security & Hack, Form & Input, Responsive & Mobile, Performance & Network, CRUD & Interaction, API & Data</span></li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-teal-500 flex-shrink-0 mt-0.5" /> <span><strong>2 Mode Pengujian:</strong> Login {'>'} Dashboard {'>'} Cek All, Dashboard {'>'} Cek All</span></li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-teal-500 flex-shrink-0 mt-0.5" /> <span><strong>Live Browser Streaming:</strong> Pantau tes real-time via WebSocket</span></li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-teal-500 flex-shrink-0 mt-0.5" /> <span><strong>Laporan Excel & PDF:</strong> Detail test case, summary per modul, dan dev fixing recommendations</span></li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-teal-500 flex-shrink-0 mt-0.5" /> <span><strong>Riwayat & Compare:</strong> Simpan riwayat tes dan bandingkan hasil antar run</span></li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-teal-500 flex-shrink-0 mt-0.5" /> <span><strong>Dark Mode:</strong> Toggle tema gelap/terang dengan particle background adaptif</span></li>
        </ul>
      </Card>

      <Card title="Cara Mengakses Halaman Ini" icon={Lightbulb}>
        <p>Halaman Learn & Understand ini bersifat <strong>hidden</strong> dan dapat diakses melalui 3 cara:</p>
        <ul className="space-y-1">
          <li>1. Klik logo <strong>5 kali</strong> dengan cepat di sidebar/header</li>
          <li>2. Keyboard shortcut <Tag color="blue">Ctrl + Shift + L</Tag></li>
          <li>3. URL hash <CodeBlock>{'https://app-url/#learn'}</CodeBlock></li>
        </ul>
        <p>Credentials: <Tag color="teal">User: Skyo</Tag> <Tag color="amber">Pass: 132123</Tag></p>
      </Card>
    </>
  );
}

function TechStackTab() {
  const stack = [
    { category: 'Frontend', items: [
      { name: 'React 18', desc: 'Functional components dengan hooks untuk UI' },
      { name: 'Vite', desc: 'Build tool dan dev server yang cepat' },
      { name: 'Tailwind CSS', desc: 'Utility-first CSS framework untuk styling' },
      { name: 'Lucide Icons', desc: 'Icon library untuk UI components' },
    ]},
    { category: 'Backend', items: [
      { name: 'Node.js + Express', desc: 'REST API server di port 3000' },
      { name: 'Playwright', desc: 'Browser automation engine (Chromium)' },
      { name: 'WebSocket (ws)', desc: 'Real-time browser streaming di port 3001' },
      { name: 'ExcelJS', desc: 'Generate laporan Excel (.xlsx)' },
      { name: 'PDFKit', desc: 'Generate laporan PDF' },
    ]},
    { category: 'Data & Storage', items: [
      { name: 'In-memory Map', desc: 'Runs disimpan dalam Map() di server memory' },
      { name: 'JSON persistence', desc: 'Riwayat disimpan ke runs.json' },
      { name: 'localStorage', desc: 'Dark mode preference dan learn page auth' },
    ]},
  ];

  return (
    <>
      {stack.map((cat, i) => (
        <Card key={i} title={cat.category} icon={cat.category === 'Frontend' ? Code2 : cat.category === 'Backend' ? Server : Database}>
          <div className="space-y-3">
            {cat.items.map((item, j) => (
              <div key={j} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 pb-3 border-b border-slate-200/50 dark:border-slate-700/50 last:border-0 last:pb-0">
                <Tag color={cat.category === 'Frontend' ? 'blue' : cat.category === 'Backend' ? 'blue' : 'teal'}>{item.name}</Tag>
                <span className="text-sm text-slate-600 dark:text-slate-400">{item.desc}</span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </>
  );
}

function StructureTab({ expandedSections, toggleSection }) {
  const sections = [
    {
      id: 'root',
      name: 'Root Directory',
      files: [
        { path: 'package.json', desc: 'Dependencies dan scripts untuk server' },
        { path: 'runs.json', desc: 'Persistent storage untuk riwayat tes' },
      ],
    },
    {
      id: 'client',
      name: 'client/ — Frontend React',
      files: [
        { path: 'client/src/App.jsx', desc: 'Komponen utama: routing, state management, polling, dark mode, learn page trigger' },
        { path: 'client/src/index.css', desc: 'Global styles: Tailwind, glassmorphism, animations, scanline, dark mode' },
        { path: 'client/src/components/Header.jsx', desc: 'Sidebar navigasi dengan logo secret click trigger' },
        { path: 'client/src/components/Logo.jsx', desc: 'Komponen logo monogram "S" dengan gradient' },
        { path: 'client/src/components/LoadingScreen.jsx', desc: 'Loading screen dengan animasi saat app pertama dimuat' },
        { path: 'client/src/components/LandingPage.jsx', desc: 'Landing page dengan hero, features, tech stack, dan CTA' },
        { path: 'client/src/components/TestConfigForm.jsx', desc: 'Form konfigurasi tes: URL, mode, kredensial, modul selection' },
        { path: 'client/src/components/LiveTestPage.jsx', desc: 'Full-screen live test view dengan WebSocket dan step timeline' },
        { path: 'client/src/components/TestProgress.jsx', desc: 'Progress view dengan progress ring dan live browser' },
        { path: 'client/src/components/LiveBrowserView.jsx', desc: 'WebSocket live browser stream display' },
        { path: 'client/src/components/TestResults.jsx', desc: 'Hasil tes dengan grouping per modul, filter, dan download' },
        { path: 'client/src/components/RunHistory.jsx', desc: 'Riwayat tes dengan delete dan download' },
        { path: 'client/src/components/CompareRuns.jsx', desc: 'Perbandingan hasil antar run' },
        { path: 'client/src/components/ParticleBackground.jsx', desc: 'Canvas wave animation dengan dark mode support' },
        { path: 'client/src/components/LearnLogin.jsx', desc: 'Login gate untuk hidden learn page' },
        { path: 'client/src/components/LearnPage.jsx', desc: 'Halaman dokumentasi dengan 9 tabs (this page!)' },
      ],
    },
    {
      id: 'server',
      name: 'server/ — Backend Express',
      files: [
        { path: 'server/index.js', desc: 'Express server: REST API, WebSocket server, run management, report endpoints' },
        { path: 'server/test-runner.js', desc: 'Core test runner: 10 modul tes, 100 test case kritis, Playwright automation, detect website' },
        { path: 'server/report-generator.js', desc: 'Excel report generator dengan 4 sheets: Cover, Detail, Failed, Module Summary' },
        { path: 'server/pdf-generator.js', desc: 'PDF report generator dengan cover, summary cards, module breakdown, failed detail' },
      ],
    },
  ];

  return (
    <>
      {sections.map(section => (
        <Card key={section.id} title={section.name} icon={FolderTree}>
          <div className="space-y-1">
            {section.files.map((file, i) => (
              <div key={i} className="flex flex-col gap-1 py-2 px-3 rounded-lg hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors">
                <code className="text-xs font-mono text-primary-600 dark:text-primary-400 font-semibold">{file.path}</code>
                <span className="text-xs text-slate-500 dark:text-slate-400">{file.desc}</span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </>
  );
}

function ApiTab() {
  const endpoints = [
    { method: 'POST', path: '/api/runs', desc: 'Memulai tes baru. Body: { url, username, password, browser, testMode, testModules }', color: 'teal' },
    { method: 'GET', path: '/api/runs', desc: 'Mendapatkan semua riwayat tes', color: 'blue' },
    { method: 'GET', path: '/api/runs/:id/status', desc: 'Mendapatkan status dan progress tes berjalan', color: 'blue' },
    { method: 'GET', path: '/api/runs/:id', desc: 'Mendapatkan detail run dengan results dan summary', color: 'blue' },
    { method: 'DELETE', path: '/api/runs/:id', desc: 'Menghapus run dari riwayat', color: 'rose' },
    { method: 'GET', path: '/api/runs/:id/report', desc: 'Download laporan Excel (.xlsx)', color: 'amber' },
    { method: 'GET', path: '/api/runs/:id/report/pdf', desc: 'Download laporan PDF', color: 'amber' },
    { method: 'WS', path: '/ws/live', desc: 'WebSocket untuk live browser streaming. Message: { type: "subscribe", runId }', color: 'blue' },
  ];

  return (
    <>
      <Card title="REST API Endpoints" icon={Server}>
        <div className="space-y-3">
          {endpoints.map((ep, i) => (
            <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 py-3 border-b border-slate-200/50 dark:border-slate-700/50 last:border-0">
              <Tag color={ep.color}>{ep.method}</Tag>
              <code className="text-xs font-mono text-slate-700 dark:text-slate-300 font-semibold min-w-0">{ep.path}</code>
              <span className="text-xs text-slate-500 dark:text-slate-400 flex-1">{ep.desc}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Contoh Request" icon={Code2}>
        <p className="mb-2">POST /api/runs:</p>
        <CodeBlock>{`{
  "url": "https://example.com",
  "username": "admin",
  "password": "secret",
  "browser": "chromium",
  "testMode": "login_dashboard",
  "testModules": ["all"]
}`}</CodeBlock>
        <p className="mt-3 mb-2">Response:</p>
        <CodeBlock>{`{
  "id": "run-1234567890",
  "url": "https://example.com",
  "status": "running",
  "progress": 0,
  "results": [],
  "summary": null
}`}</CodeBlock>
      </Card>
    </>
  );
}

function ModulesTab() {
  const modules = [
    { id: 'login', name: 'Login & Auth', count: 12, tests: ['TC-L-001: Form login terdeteksi', 'TC-L-002: Field username/email', 'TC-L-003: Password masking', 'TC-L-004: Submit button', 'TC-L-005: Empty field validation', 'TC-L-006: Invalid login rejected', 'TC-L-007: SQL injection blocked', 'TC-L-008: XSS payload blocked', 'TC-L-009: Valid login → dashboard', 'TC-L-010: Session persist', 'TC-L-011: Back button security', 'TC-L-012: Logout clears session'] },
    { id: 'dashboard', name: 'Dashboard Layout', count: 10, tests: ['TC-D-001: Dashboard dimuat', 'TC-D-002: Heading/title jelas', 'TC-D-003: Cards/widgets', 'TC-D-004: Navigasi/sidebar/header', 'TC-D-005: User info/profile', 'TC-D-006: Breadcrumb', 'TC-D-007: Notification container', 'TC-D-008: Footer', 'TC-D-009: Empty state handling', 'TC-D-010: No layout broken'] },
    { id: 'navigation', name: 'Navigation & Menu', count: 10, tests: ['TC-N-001: Internal links', 'TC-N-002: Menu structure', 'TC-N-003: Hamburger menu mobile', 'TC-N-004: Footer links', 'TC-N-005: Scroll behavior', 'TC-N-006: Dropdown menu', 'TC-N-007: Tabs/accordion', 'TC-N-008: Deep linking', 'TC-N-009: Back/forward nav', 'TC-N-010: Search function'] },
    { id: 'structure', name: 'Structure & Layout', count: 10, tests: ['TC-S-001: HTML lang attribute', 'TC-S-002: Meta viewport', 'TC-S-003: Heading hierarchy', 'TC-S-004: Semantic HTML', 'TC-S-005: Alt text images', 'TC-S-006: Input label association', 'TC-S-007: Favicon', 'TC-S-008: Focus indicator', 'TC-S-009: Color contrast WCAG AA', 'TC-S-010: Lang sesuai konten'] },
    { id: 'security', name: 'Security & Hack', count: 15, tests: ['TC-SEC-001: HTTPS enabled', 'TC-SEC-002: Security headers', 'TC-SEC-003: CSRF token', 'TC-SEC-004: Cookie flags', 'TC-SEC-005: XSS injection', 'TC-SEC-006: SQL injection URL', 'TC-SEC-007: IDOR/access control', 'TC-SEC-008: Clickjacking protection', 'TC-SEC-009: Path traversal', 'TC-SEC-010: SSRF', 'TC-SEC-011: Sensitive data leak', 'TC-SEC-012: Eval usage', 'TC-SEC-013: CORS policy', 'TC-SEC-014: Mixed content', 'TC-SEC-015: Server header leak'] },
    { id: 'form_validation', name: 'Form & Input', count: 10, tests: ['TC-FV-001: Required fields', 'TC-FV-002: Email validation', 'TC-FV-003: Maxlength', 'TC-FV-004: Autocomplete', 'TC-FV-005: XSS in form', 'TC-FV-006: Label association', 'TC-FV-007: Form reset', 'TC-FV-008: Edge case inputs', 'TC-FV-009: Double submit race', 'TC-FV-010: Pattern validation'] },
    { id: 'responsive', name: 'Responsive & Mobile', count: 8, tests: ['TC-R-001: Mobile 375x667', 'TC-R-002: Tablet 768x1024', 'TC-R-003: Desktop 1920x1080', 'TC-R-004: Landscape', 'TC-R-005: Hamburger mobile', 'TC-R-006: Touch target 24px', 'TC-R-007: Text readability 10px', 'TC-R-008: No text overflow'] },
    { id: 'performance', name: 'Performance & Network', count: 8, tests: ['TC-P-001: DOM load < 10s', 'TC-P-002: Full load < 20s', 'TC-P-003: Request count < 100', 'TC-P-004: No 4xx/5xx', 'TC-P-005: Cache headers', 'TC-P-006: Compression', 'TC-P-007: Console errors', 'TC-P-008: Network errors'] },
    { id: 'crud', name: 'CRUD & Interaction', count: 10, tests: ['TC-CRUD-001: Table/data list', 'TC-CRUD-002: Create button', 'TC-CRUD-003: Create form opens', 'TC-CRUD-004: Read header columns', 'TC-CRUD-005: Edit button', 'TC-CRUD-006: Delete button', 'TC-CRUD-007: Cancel/close', 'TC-CRUD-008: Search/filter', 'TC-CRUD-009: Pagination', 'TC-CRUD-010: Notification container'] },
    { id: 'api_data', name: 'API & Data', count: 7, tests: ['TC-API-001: No 5xx errors', 'TC-API-002: Response time < 3s', 'TC-API-003: Content-Type header', 'TC-API-004: Sensitive data leak', 'TC-API-005: Cookie/session security', 'TC-API-006: Rate limiting', 'TC-API-007: Verbose error messages'] },
  ];

  return (
    <>
      <Card title="10 Modul Tes — 100 Test Case Kritis" icon={TestTube}>
        <p>Setiap modul berisi test case fungsional kritis yang dijalankan secara berurutan. Modul <strong>Login & Auth</strong> dijalankan pertama (untuk autentikasi), diikuti <strong>Dashboard Layout</strong>, lalu modul lainnya. Standar Senior QC/QA dengan deteksi hacker-style (SQL injection, XSS, IDOR, path traversal, SSRF).</p>
      </Card>

      {modules.map(mod => (
        <Card key={mod.id} title={`${mod.name} — ${mod.count} tes`} icon={ChevronRight}>
          <div className="flex flex-wrap gap-2">
            {mod.tests.map((test, i) => (
              <span key={i} className="text-xs px-2.5 py-1 rounded-lg bg-slate-100/60 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400">
                {test}
              </span>
            ))}
          </div>
        </Card>
      ))}
    </>
  );
}

function DataFlowTab() {
  return (
    <>
      <Card title="Alur Data: Memulai Tes" icon={Workflow}>
        <ol className="space-y-3">
          <li><strong>1. User input</strong> — User memasukkan URL, mode, kredensial, dan modul di <code>TestConfigForm</code></li>
          <li><strong>2. POST /api/runs</strong> — <code>App.jsx</code> mengirim request ke server, mendapat <code>run.id</code></li>
          <li><strong>3. View berubah</strong> — App berpindah ke view <code>live</code> (LiveTestPage) atau <code>progress</code></li>
          <li><strong>4. Polling dimulai</strong> — <code>setInterval</code> setiap 2 detik ke <code>GET /api/runs/:id/status</code></li>
          <li><strong>5. WebSocket connect</strong> — <code>LiveBrowserView</code> subscribe ke <code>ws://host/ws/live</code> dengan runId</li>
          <li><strong>6. Server menjalankan Playwright</strong> — <code>test-runner.js</code> membuka browser, deteksi website, jalankan modul</li>
          <li><strong>7. Screencast</strong> — Browser frames dikirim via WebSocket ke client</li>
          <li><strong>8. Test results</strong> — Hasil setiap test case dikumpulkan di <code>runConfig.results</code></li>
          <li><strong>9. Selesai</strong> — <code>run.status = 'completed'</code>, summary di-generate, polling berhenti</li>
          <li><strong>10. Laporan</strong> — User dapat download Excel/PDF via <code>GET /api/runs/:id/report</code></li>
        </ol>
      </Card>

      <Card title="State Management" icon={Database}>
        <p><strong>Server-side:</strong></p>
        <ul className="space-y-1">
          <li><code>runs = new Map()</code> — In-memory storage untuk semua runs</li>
          <li><code>runs.json</code> — Persistent storage, di-load saat server start dan di-save setiap perubahan</li>
          <li><code>runConfig</code> — Object yang di-pass ke test-runner, menyimpan progress, results, currentTest</li>
        </ul>
        <p className="mt-3"><strong>Client-side:</strong></p>
        <ul className="space-y-1">
          <li><code>view</code> — 'landing' | 'new' | 'live' | 'progress' | 'results' | 'history' | 'compare' | 'learn'</li>
          <li><code>currentRun</code> — Object run yang sedang aktif/dipilih</li>
          <li><code>runs</code> — Array semua riwayat runs</li>
          <li><code>darkMode</code> — Boolean, disimpan di localStorage</li>
          <li><code>learnAuthed</code> — Boolean, disimpan di localStorage</li>
        </ul>
      </Card>

      <Card title="Polling vs WebSocket" icon={Radio}>
        <p><strong>Polling (HTTP):</strong> Setiap 2 detik, client fetch status run untuk update progress dan results. Berhenti otomatis saat status = completed/error, atau setelah 3 error berturut-turut.</p>
        <p><strong>WebSocket:</strong> Untuk live browser streaming. Client subscribe dengan runId, server mengirim frame (base64 JPEG) dan step info. Auto-reconnect dengan backoff jika koneksi terputus.</p>
      </Card>
    </>
  );
}

function WebSocketTab() {
  return (
    <>
      <Card title="WebSocket Live Streaming" icon={Radio}>
        <p>WebSocket server berjalan di <strong>port 3001</strong> (atau port yang sama dengan HTTP jika di-production). Protocol ditentukan otomatis: <code>wss://</code> untuk HTTPS, <code>ws://</code> untuk HTTP.</p>
      </Card>

      <Card title="Cara Kerja" icon={Workflow}>
        <ol className="space-y-2">
          <li><strong>1.</strong> Client connect ke <code>ws://hostname:port/ws/live</code></li>
          <li><strong>2.</strong> Client kirim <code>{'{ type: "subscribe", runId: "run-xxx" }'}</code></li>
          <li><strong>3.</strong> Server mulai screencast via Playwright <code>page.screencast()</code></li>
          <li><strong>4.</strong> Setiap frame (JPEG base64) dikirim ke semua subscriber</li>
          <li><strong>5.</strong> Step info (test name, status) juga dikirim sebagai message</li>
          <li><strong>6.</strong> Saat tes selesai, server kirim <code>{'{ type: "done" }'}</code></li>
          <li><strong>7.</strong> Client menampilkan overlay "Tes Selesai"</li>
        </ol>
      </Card>

      <Card title="Message Types" icon={Code2}>
        <div className="space-y-2">
          <div><Tag color="blue">subscribe</Tag> — Client → Server: daftar untuk menerima frame dari run tertentu</div>
          <div><Tag color="teal">frame</Tag> — Server → Client: browser frame (base64 JPEG image)</div>
          <div><Tag color="blue">step</Tag> — Server → Client: info test step yang sedang berjalan</div>
          <div><Tag color="amber">done</Tag> — Server → Client: tes selesai</div>
        </div>
      </Card>

      <Card title="Auto-Reconnect" icon={Zap}>
        <p>Jika koneksi WebSocket terputus, client akan mencoba reconnect dengan delay 2 detik. Reconnect berhenti setelah 10 percobaan gagal. Saat reconnect, client otomatis subscribe kembali ke runId yang sama.</p>
      </Card>
    </>
  );
}

function ReportsTab() {
  return (
    <>
      <Card title="Excel Report (.xlsx)" icon={FileText}>
        <p>Generated oleh <code>report-generator.js</code> menggunakan <strong>ExcelJS</strong>. Terdiri dari 4 sheets:</p>
        <ul className="space-y-2 mt-2">
          <li><strong>Sheet 1: Cover</strong> — Info tes (URL, browser, tanggal), ringkasan eksekusi, visual bar pass rate, hasil per modul</li>
          <li><strong>Sheet 2: Detail Test Cases</strong> — Semua test case dengan kolom: No, Modul, Scenario, Pre-Conditions, Test Steps, Expected, Actual, Test Date, Status, Remark, Development Fixing</li>
          <li><strong>Sheet 3: Test Gagal</strong> — Hanya test case yang gagal, dengan detail error dan rekomendasi perbaikan</li>
          <li><strong>Sheet 4: Ringkasan Modul</strong> — Total, lulus, gagal, dan pass rate per modul</li>
        </ul>
      </Card>

      <Card title="PDF Report" icon={FileText}>
        <p>Generated oleh <code>pdf-generator.js</code> menggunakan <strong>PDFKit</strong>. Terdiri dari:</p>
        <ul className="space-y-2 mt-2">
          <li><strong>Cover Page</strong> — Logo, info pengujian, mode, tanggal</li>
          <li><strong>Summary Cards</strong> — Total, lulus, gagal, pass rate dalam card visual</li>
          <li><strong>Module Breakdown</strong> — Table per modul dengan visual progress bar</li>
          <li><strong>Failed Tests Detail</strong> — Detail test gagal dengan error message</li>
          <li><strong>All Results Table</strong> — Semua hasil dalam table kompak</li>
          <li><strong>Footer</strong> — Branding dan nomor halaman di setiap page</li>
        </ul>
      </Card>

      <Card title="Sinkronisasi Excel & PDF" icon={CheckCircle2}>
        <p>Kedua format laporan menggunakan data yang sama dari <code>run.summary</code> dan <code>run.results</code>. Module names di-mapping menggunakan <code>modNames</code> object yang sudah include <strong>Dashboard</strong> module. Jika <code>summary</code> tidak ada (edge case), client akan generate summary on-the-fly dari results.</p>
      </Card>
    </>
  );
}

function TipsTab() {
  return (
    <>
      <Card title="Tips Kustomisasi" icon={Lightbulb}>
        <ul className="space-y-3">
          <li><strong>Menambah modul tes baru:</strong>
            <ul className="ml-4 mt-1 space-y-1">
              <li>1. Tambah case di <code>runModule()</code> switch di <code>test-runner.js</code></li>
              <li>2. Buat method <code>testXxx()</code> baru di class <code>TestRunner</code></li>
              <li>3. Tambah ke <code>allModules</code> array</li>
              <li>4. Tambah ke <code>TEST_MODULES</code> di <code>TestConfigForm.jsx</code></li>
              <li>5. Tambah ke <code>MODUL_NAMES</code> di <code>TestProgress.jsx</code>, <code>LiveTestPage.jsx</code>, <code>TestResults.jsx</code></li>
              <li>6. Tambah ke <code>modNames</code> di <code>report-generator.js</code> dan <code>pdf-generator.js</code></li>
            </ul>
          </li>
          <li><strong>Mengubah credentials learn page:</strong> Edit di <code>LearnLogin.jsx</code> line dengan <code>{`username === 'Skyo' && password === '132123'`}</code></li>
          <li><strong>Mengubah warna tema:</strong> Edit <code>tailwind.config.js</code> bagian <code>primary</code> color palette</li>
          <li><strong>Mengubah loading screen duration:</strong> Edit <code>setTimeout</code> di <code>App.jsx</code> (default 1800ms)</li>
          <li><strong>Menambah test case di modul existing:</strong> Tambah <code>R.push(await this.safeTest(...))</code> di method modul terkait</li>
        </ul>
      </Card>

      <Card title="Best Practices" icon={CheckCircle2}>
        <ul className="space-y-2">
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-teal-500 flex-shrink-0 mt-0.5" /> Selalu gunakan <code>safeTest()</code> wrapper agar error tidak menghentikan seluruh tes</li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-teal-500 flex-shrink-0 mt-0.5" /> Gunakan <code>{'.catch(() => false)'}</code> pada Playwright locator checks untuk graceful handling</li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-teal-500 flex-shrink-0 mt-0.5" /> Tambahkan <code>ensureAuthenticated()</code> setelah test yang mengganggu session</li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-teal-500 flex-shrink-0 mt-0.5" /> Selalu set <code>runConfig.progress</code> dan <code>runConfig.currentTest</code> untuk UI update</li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-teal-500 flex-shrink-0 mt-0.5" /> Gunakan <code>this.broadcastStep()</code> untuk update live timeline</li>
        </ul>
      </Card>

      <Card title="Troubleshooting" icon={XCircle}>
        <ul className="space-y-2">
          <li><strong>WebSocket tidak connect:</strong> Pastikan port 3001 tersedia, atau gunakan port yang sama dengan HTTP server</li>
          <li><strong>Tes stuck di progress:</strong> Cek console untuk poll errors, pastikan server berjalan</li>
          <li><strong>Playwright error:</strong> Jalankan <code>npx playwright install chromium</code> untuk install browser</li>
          <li><strong>Laporan kosong:</strong> Pastikan <code>run.summary</code> ter-generate (cek <code>generateSummary()</code> di test-runner)</li>
        </ul>
      </Card>
    </>
  );
}
