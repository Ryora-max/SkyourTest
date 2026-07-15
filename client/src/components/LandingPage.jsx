import { ShieldCheck, Rocket, Globe, Monitor, FileText, Zap, Code2, ArrowRight, Moon, Sun } from 'lucide-react';
import Logo from './Logo';
import ParticleBackground from './ParticleBackground';

export default function LandingPage({ onEnterApp, darkMode, toggleDarkMode }) {
  const features = [
    { icon: Rocket, title: '10 Modul Tes Kritis', desc: 'Login & Auth, Dashboard Layout, Navigation & Menu, Structure & Layout, Security & Hack, Form & Input, Responsive & Mobile, Performance & Network, CRUD & Interaction, API & Data' },
    { icon: Monitor, title: 'Live Browser Streaming', desc: 'Pantau tes berjalan secara real-time via WebSocket dengan live browser view' },
    { icon: FileText, title: 'Laporan Excel & PDF', desc: 'Generate laporan profesional dalam format Excel dan PDF dengan detail lengkap' },
    { icon: Zap, title: '100+ Test Case Kritis', desc: 'Setiap modul berisi test case fungsional kritis dengan standar Senior QC/QA' },
    { icon: Globe, title: 'Multi-Mode Pengujian', desc: 'Login Dashboard atau Direct Dashboard — pilih mode sesuai kebutuhan' },
    { icon: Code2, title: 'Playwright Engine', desc: 'Didukung oleh Playwright untuk pengujian browser otomatis yang andal' },
  ];

  const stats = [
    { value: '10', label: 'Modul Tes' },
    { value: '100+', label: 'Test Case' },
    { value: '2', label: 'Mode Pengujian' },
    { value: '2', label: 'Format Laporan' },
  ];

  const techStack = [
    { name: 'React 18', desc: 'Frontend UI' },
    { name: 'Express', desc: 'Backend API' },
    { name: 'Playwright', desc: 'Browser Automation' },
    { name: 'WebSocket', desc: 'Live Streaming' },
    { name: 'Tailwind CSS', desc: 'Styling' },
    { name: 'ExcelJS', desc: 'Excel Reports' },
    { name: 'PDFKit', desc: 'PDF Reports' },
    { name: 'Vite', desc: 'Build Tool' },
  ];

  return (
    <div className="min-h-screen relative overflow-hidden font-body">
      <ParticleBackground darkMode={darkMode} />

      {/* Top nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <Logo size="md" />
          <div>
            <h1 className="text-lg font-heading font-bold text-primary-700 dark:text-primary-300 leading-tight">SkyourTest</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">QC Automation Platform</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleDarkMode} className="p-2.5 rounded-2xl glass-card hover:scale-105 transition-transform">
            {darkMode ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-primary-600" />}
          </button>
          <button onClick={onEnterApp} className="btn-primary gap-2 text-sm px-5 py-2.5">
            Mulai <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 sm:px-10 pt-12 sm:pt-24 pb-16 text-center animate-fade-in">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card mb-8" style={{ animation: 'float 6s ease-in-out infinite' }}>
          <ShieldCheck className="w-4 h-4 text-primary-500" />
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Quality Assurance Automation</span>
        </div>

        <h1 className="font-heading text-4xl sm:text-6xl font-extrabold text-slate-900 dark:text-slate-100 mb-6 leading-tight tracking-tight">
          <span className="block">Tes Kualitas Website</span>
          <span className="block bg-gradient-to-r from-primary-500 to-sky-500 bg-clip-text text-transparent">Secara Otomatis</span>
        </h1>

        <p className="font-body text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Platform otomatisasi pengujian kualitas website dengan 10 modul tes, 100+ test case,
          live browser streaming, dan laporan profesional Excel &amp; PDF.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button onClick={onEnterApp} className="btn-primary gap-2 text-base px-8 py-3.5">
            <Rocket className="w-5 h-5" /> Mulai Tes Sekarang
          </button>
          <a href="#features" className="btn-secondary gap-2 text-base px-8 py-3.5">
            Pelajari Fitur <ArrowRight className="w-5 h-5" />
          </a>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-20">
          {stats.map((stat, i) => (
            <div key={i} className="glass-card p-6 rounded-3xl text-center animate-slide-up" style={{ animationDelay: `${i * 0.1}s` }}>
              <p className="font-heading text-3xl font-extrabold bg-gradient-to-br from-primary-500 to-sky-500 bg-clip-text text-transparent">{stat.value}</p>
              <p className="font-body text-xs text-slate-500 dark:text-slate-400 mt-2">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 max-w-5xl mx-auto px-6 sm:px-10 py-20">
        <div className="text-center mb-14 animate-slide-up">
          <h2 className="font-heading text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 mb-4">Fitur Unggulan</h2>
          <p className="font-body text-slate-500 dark:text-slate-400 max-w-xl mx-auto">Semua yang Anda butuhkan untuk pengujian kualitas website otomatis</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feat, i) => {
            const Icon = feat.icon;
            return (
              <div key={i} className="glass-card p-6 rounded-3xl animate-slide-up" style={{ animationDelay: `${i * 0.08}s` }}>
                <div className="w-12 h-12 bg-gradient-to-br from-primary-500/15 to-sky-500/15 rounded-2xl flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                </div>
                <h3 className="font-heading text-base font-bold text-slate-900 dark:text-slate-100 mb-2">{feat.title}</h3>
                <p className="font-body text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{feat.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Tech Stack */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 sm:px-10 py-20">
        <div className="text-center mb-14 animate-slide-up">
          <h2 className="font-heading text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100">Tech Stack</h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {techStack.map((tech, i) => (
            <div key={i} className="glass-card p-4 rounded-2xl text-center animate-slide-up" style={{ animationDelay: `${i * 0.05}s` }}>
              <p className="font-heading text-sm font-bold text-slate-900 dark:text-slate-100">{tech.name}</p>
              <p className="font-body text-xs text-slate-500 dark:text-slate-400 mt-1">{tech.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 sm:px-10 py-24 text-center">
        <div className="glass-card p-10 sm:p-14 rounded-3xl animate-scale-in">
          <h2 className="font-heading text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 mb-4">Siap memulai pengujian?</h2>
          <p className="font-body text-slate-500 dark:text-slate-400 mb-8 max-w-lg mx-auto">Jalankan tes otomatis dan dapatkan laporan profesional dalam hitungan menit</p>
          <button onClick={onEnterApp} className="btn-primary gap-2 text-base px-8 py-3.5">
            <Rocket className="w-5 h-5" /> Buka Dashboard
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-10 text-center border-t border-primary-700/10 dark:border-primary-700/20">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Logo size="sm" />
          <span className="font-heading font-bold text-primary-700 dark:text-primary-300">SkyourTest</span>
        </div>
        <p className="font-body text-xs text-slate-500 dark:text-slate-500">QC Automation Platform</p>
        <p className="font-body text-xs text-slate-400/60 dark:text-slate-600 mt-2">&copy; 2026 SkyourTest. All rights reserved.</p>
      </footer>
    </div>
  );
}
