import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

const UIContext = createContext(null);

/** Must stay in step with the `:root` / `.dark` blocks in index.css. */
const THEME_TOKENS = {
  light: { '--accent': '0 0 0', '--accent-contrast': '255 255 255' },
  dark: { '--accent': '255 255 255', '--accent-contrast': '0 0 0' },
};

export function UIProvider({ children }) {
  // White is the default look; dark mode is opt-in from the header toggle.
  const [theme, setTheme] = useState(() => localStorage.getItem('ftech_theme') || 'light');
  // Section 16.3 — Hindi labels alongside English, toggled per device.
  const [hindi, setHindi] = useState(() => localStorage.getItem('ftech_hindi') === 'true');
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const root = document.documentElement;

    // Suppress transitions for the swap. An element that transitions
    // background-color does not repaint when the custom property behind that
    // colour changes, so cards and nav rows would otherwise keep the previous
    // theme until a reload. See the note in index.css.
    root.classList.add('theme-switching');
    root.classList.toggle('dark', theme === 'dark');

    // Writing the tokens inline on the root guarantees every descendant
    // re-resolves them. The `:root` / `.dark` blocks in index.css supply the
    // same values for first paint.
    for (const [key, value] of Object.entries(THEME_TOKENS[theme] ?? THEME_TOKENS.light)) {
      root.style.setProperty(key, value);
    }

    localStorage.setItem('ftech_theme', theme);

    // Chrome keeps stale computed colours on some elements after the `dark`
    // class flips — cards and nav rows repainted only after a reload. Detaching
    // the root for a single frame forces a full style recalculation, so every
    // surface picks up the new theme at once.
    root.style.display = 'none';
    void root.offsetHeight;
    root.style.display = '';

    const restore = window.setTimeout(() => root.classList.remove('theme-switching'), 80);
    return () => window.clearTimeout(restore);
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
  const iconTone = {
    success: 'text-emerald-400',
    error: 'text-rose-400',
    info: 'text-white/70 dark:text-black/70',
  }[tone];

  // The toast is the inverse of the page — black on white, white on black.
  return (
    <div
      role="status"
      className="slab pointer-events-auto flex w-full max-w-md animate-fade-up items-start gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-lift"
    >
      <Icon size={18} className={`mt-px shrink-0 ${iconTone}`} />
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="slab-muted shrink-0 transition hover:opacity-100">
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
