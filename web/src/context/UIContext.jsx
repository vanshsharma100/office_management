import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('ftech_theme') || 'dark');
  // Section 16.3 — Hindi labels alongside English, toggled per device.
  const [hindi, setHindi] = useState(() => localStorage.getItem('ftech_hindi') === 'true');
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('ftech_theme', theme);
  }, [theme]);

  useEffect(() => localStorage.setItem('ftech_hindi', String(hindi)), [hindi]);

  const toast = useCallback((message, tone = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const value = useMemo(
    () => ({
      theme,
      toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
      hindi,
      toggleHindi: () => setHindi((h) => !h),
      /** Picks the Hindi label when the toggle is on and one exists. */
      t: (en, hi) => (hindi && hi ? hi : en),
      toast,
    }),
    [theme, hindi, toast]
  );

  return (
    <UIContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {toasts.map((t) => (
          <Toast key={t.id} {...t} onClose={() => setToasts((x) => x.filter((i) => i.id !== t.id))} />
        ))}
      </div>
    </UIContext.Provider>
  );
}

function Toast({ message, tone, onClose }) {
  const Icon = tone === 'error' ? AlertTriangle : tone === 'info' ? Info : CheckCircle2;
  const colors = {
    success: 'border-emerald-500/30 bg-emerald-500/12 text-emerald-100',
    error: 'border-rose-500/30 bg-rose-500/12 text-rose-100',
    info: 'border-brand-500/30 bg-brand-500/12 text-brand-100',
  }[tone];

  return (
    <div
      role="status"
      className={`pointer-events-auto flex w-full max-w-md animate-fade-up items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-medium shadow-glow backdrop-blur-xl ${colors} bg-ink-900/90`}
    >
      <Icon size={18} className="mt-px shrink-0" />
      <span className="flex-1 text-white/90">{message}</span>
      <button onClick={onClose} className="shrink-0 text-white/50 transition hover:text-white">
        <X size={16} />
      </button>
    </div>
  );
}

export const useUI = () => {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used inside UIProvider');
  return ctx;
};
