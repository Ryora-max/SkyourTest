import Logo from './Logo';

export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Animated gradient orbs */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl animate-float-slow" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-sky-500/15 rounded-full blur-3xl animate-float-slower" />

      {/* Logo with pulse */}
      <div className="relative mb-8 animate-logo-entrance">
        <div className="absolute inset-0 bg-blue-500/30 rounded-2xl blur-xl animate-glow-pulse" />
        <div className="relative">
          <Logo size="xl" className="animate-logo-pulse" />
        </div>
      </div>

      {/* Brand name */}
      <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 mb-1 animate-fade-in-up">
        SkyourTest
      </h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 animate-fade-in-up-delay">
        QC Automation Testing Platform
      </p>

      {/* Loading bar */}
      <div className="w-48 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-blue-500 to-sky-500 rounded-full animate-loading-bar" />
      </div>

      {/* Loading text */}
      <p className="mt-4 text-xs text-slate-400 dark:text-slate-500 animate-pulse">
        Memuat aplikasi...
      </p>
    </div>
  );
}
