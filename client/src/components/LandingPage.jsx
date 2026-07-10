import { ShieldCheck, Rocket, Globe, Monitor, FileText, Zap, Code2, Database, ArrowRight, Moon, Sun, CheckCircle2 } from 'lucide-react';
import Logo from './Logo';
import ParticleBackground from './ParticleBackground';

export default function LandingPage({ onEnterApp, darkMode, toggleDarkMode }) {
  const features = [
    { icon: Rocket, title: '19 Modul Tes Otomatis', desc: 'Dashboard, Aksesibilitas, Login, Navigasi, Keamanan, Performa, Responsif, Form, Menu, API, Cookie, SEO, CRUD, Payment, Camera, Multi-Role, File Upload, Email, Booking' },
    { icon: Monitor, title: 'Live Browser Streaming', desc: 'Pantau tes berjalan secara real-time via WebSocket dengan live browser view' },
    { icon: FileText, title: 'Laporan Excel & PDF', desc: 'Generate laporan profesional dalam format Excel dan PDF dengan detail lengkap' },
    { icon: Zap, title: '300+ Test Case', desc: 'Setiap modul memiliki test case komprehensif yang menutupi berbagai skenario' },
    { icon: Globe, title: 'Multi-Mode Pengujian', desc: 'Login Dashboard, Direct Dashboard, Login Only, atau Dashboard + Menu Login' },
    { icon: Code2, title: 'Playwright Engine', desc: 'Didukung oleh Playwright untuk pengujian browser otomatis yang andal' },
  ];

  const stats = [
    { value: '19', label: 'Modul Tes' },
    { value: '300+', label: 'Test Case' },
    { value: '4', label: 'Mode Pengujian' },
    { value: '2', label: 'Format Laporan' },
  ];

  return (
    <div className="min-h-screen relative overflow-hidden">
      <ParticleBackground darkMode={darkMode} />

      {/* Top nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-5">
        <div className="flex items-center gap-3">
          <Logo size="md" />
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight">SkyourTest</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">QC Automation</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleDarkMode} className="p-2.5 rounded-xl glass-card hover:scale-105 transition-transform">
            {darkMode ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-blue-600" />}
          </button>
          <button onClick={onEnterApp} className="btn-primary gap-2 text-sm px-5 py-2.5">
            Mulai <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 sm:px-10 pt-12 sm:pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-card mb-6 animate-fade-in">
          <ShieldCheck className="w-4 h-4 text-teal-500" />
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Quality Assurance Automation</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-black text-slate-900 dark:text-slate-100 mb-6 animate-fade-in-up leading-tight">
          Tes Kualitas Website<br />
          <span className="bg-gradient-to-r from-blue-500 via-sky-500 to-cyan-500 bg-clip-text text-transparent">Secara Otomatis</span>
        </h1>

        <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-10 animate-fade-in-up-delay">
          Platform otomatisasi pengujian kualitas website dengan 19 modul tes, 300+ test case,
          live browser streaming, dan laporan profesional Excel & PDF.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-up-delay-2">
          <button onClick={onEnterApp} className="btn-primary gap-2 text-base px-8 py-3.5">
            <Rocket className="w-5 h-5" /> Mulai Tes Sekarang
          </button>
          <a href="#features" className="btn-secondary gap-2 text-base px-8 py-3.5">
            Pelajari Fitur <ArrowRight className="w-5 h-5" />
          </a>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-16 animate-slide-up">
          {stats.map((stat, i) => (
            <div key={i} className="glass-card p-5 rounded-2xl text-center">
              <p className="text-3xl font-black bg-gradient-to-br from-blue-500 to-sky-500 bg-clip-text text-transparent">{stat.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 max-w-5xl mx-auto px-6 sm:px-10 py-16">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100 text-center mb-4 animate-slide-up">Fitur Unggulan</h2>
        <p className="text-slate-500 dark:text-slate-400 text-center mb-12 max-w-xl mx-auto">Semua yang Anda butuhkan untuk pengujian kualitas website otomatis</p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feat, i) => {
            const Icon = feat.icon;
            return (
              <div key={i} className="glass-card p-6 rounded-2xl hover:scale-[1.02] transition-transform animate-slide-up" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500/20 to-sky-500/20 rounded-xl flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-2">{feat.title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{feat.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Tech Stack */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 sm:px-10 py-16">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100 text-center mb-12 animate-slide-up">Tech Stack</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { name: 'React 18', desc: 'Frontend UI' },
            { name: 'Express', desc: 'Backend API' },
            { name: 'Playwright', desc: 'Browser Automation' },
            { name: 'WebSocket', desc: 'Live Streaming' },
            { name: 'Tailwind CSS', desc: 'Styling' },
            { name: 'ExcelJS', desc: 'Excel Reports' },
            { name: 'PDFKit', desc: 'PDF Reports' },
            { name: 'Vite', desc: 'Build Tool' },
          ].map((tech, i) => (
            <div key={i} className="glass-card p-4 rounded-xl text-center animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{tech.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{tech.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 sm:px-10 py-20 text-center">
        <div className="glass-card p-10 sm:p-12 rounded-3xl animate-slide-up">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 mb-4">Siap memulai pengujian?</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-8">Jalankan tes otomatis dan dapatkan laporan profesional dalam hitungan menit</p>
          <button onClick={onEnterApp} className="btn-primary gap-2 text-base px-8 py-3.5">
            <Rocket className="w-5 h-5" /> Buka Dashboard
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-8 text-center">
        <p className="text-xs text-slate-400 dark:text-slate-500">SkyourTest QC Automation Platform</p>
      </footer>
    </div>
  );
}
