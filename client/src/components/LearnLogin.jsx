import { useState } from 'react';
import { Lock, User, X, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import Logo from './Logo';

export default function LearnLogin({ onAuth, onClose }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    setTimeout(() => {
      if (username === 'Skyo' && password === '132123') {
        localStorage.setItem('skyo_learn_auth', 'true');
        onAuth(true);
      } else {
        setError('Username atau password salah');
        setLoading(false);
      }
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="glass-card p-8 rounded-3xl max-w-sm w-full animate-slide-up relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <div className="inline-flex mb-4">
            <Logo size="lg" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Learn & Understand</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Masuk untuk mengakses halaman pembelajaran</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
              <User className="w-4 h-4" /> Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              placeholder="Username"
              className="input-field"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
              <Lock className="w-4 h-4" /> Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Password"
                className="input-field pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-rose-500 text-center animate-fade-in">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full gap-2 justify-center py-3"
          >
            {loading ? (
              <>
                <ShieldCheck className="w-4 h-4 animate-pulse" /> Memverifikasi...
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" /> Masuk
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
