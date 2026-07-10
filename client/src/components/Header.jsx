import { useState, useRef } from 'react';
import { Plus, History, Moon, Sun, GitCompare, ChevronLeft, ChevronRight, Monitor, Home } from 'lucide-react';
import Logo from './Logo';

function Header({ view, setView, darkMode, toggleDarkMode, hasActiveRun, onLogoSecretClick, onGoHome }) {
  const [collapsed, setCollapsed] = useState(false);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef(null);

  const handleLogoClick = () => {
    clickCountRef.current++;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      if (clickCountRef.current >= 5) {
        onLogoSecretClick?.();
      }
      clickCountRef.current = 0;
    }, 800);
  };

  const navItems = [
    { id: 'new', label: 'Tes Baru', icon: Plus },
    { id: 'history', label: 'Riwayat', icon: History },
    { id: 'compare', label: 'Bandingkan', icon: GitCompare },
  ];

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-50 glass-sidebar border-b flex items-center justify-between px-3 sm:px-4 h-14 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0 cursor-pointer select-none" onClick={handleLogoClick}>
          <Logo size="sm" />
          <span className="font-bold text-slate-900 dark:text-slate-100 truncate">SkyourTest</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={toggleDarkMode} className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-blue-100/60 dark:hover:bg-blue-900/20 transition-colors">
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <div className="flex gap-0.5 sm:gap-1">
            {hasActiveRun && (
              <button
                onClick={() => setView('live')}
                className={`p-2 rounded-lg transition-colors ${
                  view === 'live' ? 'bg-red-100/60 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'
                }`}
                title="Live Screen"
              >
                <Monitor className="w-5 h-5" />
              </button>
            )}
            {navItems.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={`p-2 rounded-lg transition-colors ${
                    view === item.id ? 'bg-blue-100/60 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <aside className={`hidden lg:flex flex-col fixed left-0 top-0 bottom-0 z-40 glass-sidebar border-r transition-all duration-300 ${collapsed ? 'w-20' : 'w-64'}`}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 h-16 border-b border-slate-200/50 dark:border-slate-700/50 flex-shrink-0 cursor-pointer select-none" onClick={handleLogoClick}>
          <Logo size="md" />
          {!collapsed && (
            <div className="animate-fade-in">
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight">SkyourTest</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">QC Automation</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-6 space-y-2">
          {hasActiveRun && (
            <button
              onClick={() => setView('live')}
              className={`nav-item w-full ${view === 'live' ? 'active' : ''} ${collapsed ? 'justify-center' : ''}`}
              title={collapsed ? 'Live Screen' : ''}
            >
              <Monitor className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span className="animate-fade-in">Live Screen</span>}
            </button>
          )}
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`nav-item w-full ${isActive ? 'active' : ''} ${collapsed ? 'justify-center' : ''}`}
                title={collapsed ? item.label : ''}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="animate-fade-in">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Bottom controls */}
        <div className="px-3 py-4 border-t border-slate-200/50 dark:border-slate-700/50 space-y-2 flex-shrink-0">
          {onGoHome && (
            <button
              onClick={onGoHome}
              className={`nav-item w-full ${collapsed ? 'justify-center' : ''}`}
              title={collapsed ? 'Beranda' : ''}
            >
              <Home className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span className="animate-fade-in">Beranda</span>}
            </button>
          )}
          <button
            onClick={toggleDarkMode}
            className={`nav-item w-full ${collapsed ? 'justify-center' : ''}`}
            title={collapsed ? (darkMode ? 'Mode Terang' : 'Mode Gelap') : ''}
          >
            {darkMode ? <Sun className="w-5 h-5 flex-shrink-0" /> : <Moon className="w-5 h-5 flex-shrink-0" />}
            {!collapsed && <span className="animate-fade-in">{darkMode ? 'Mode Terang' : 'Mode Gelap'}</span>}
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`nav-item w-full ${collapsed ? 'justify-center' : ''}`}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronRight className="w-5 h-5 flex-shrink-0" /> : <ChevronLeft className="w-5 h-5 flex-shrink-0" />}
            {!collapsed && <span className="animate-fade-in text-xs">Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Spacer for desktop */}
      <div className={`hidden lg:block transition-all duration-300 flex-shrink-0 ${collapsed ? 'w-20' : 'w-64'}`} />
    </>
  );
}

export default Header;
