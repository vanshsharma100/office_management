import { useEffect, useRef } from 'react';
import clsx from 'clsx';
import { X, Inbox, Loader2, Minus, Plus } from 'lucide-react';

export function Card({ className, children, ...rest }) {
  return (
    <div className={clsx('card', className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ title, subtitle, action, icon: Icon }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        {Icon && (
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500/12 text-brand-600 dark:text-brand-300">
            <Icon size={19} />
          </span>
        )}
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="text-sm text-ink-500 dark:text-ink-400">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

const TONES = {
  neutral: 'bg-ink-100 text-ink-600 dark:bg-white/10 dark:text-ink-200',
  brand: 'bg-brand-500/12 text-brand-700 dark:text-brand-300',
  green: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  red: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
  violet: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
  sky: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
};

export function Badge({ tone = 'neutral', children, className }) {
  return <span className={clsx('badge', TONES[tone] ?? TONES.neutral, className)}>{children}</span>;
}

/** Shared status → colour mapping so a PENDING chip looks the same everywhere. */
export const STATUS_TONE = {
  PENDING: 'amber',
  APPROVED: 'green',
  REJECTED: 'red',
  PRESENT: 'green',
  ABSENT: 'red',
  LEAVE: 'amber',
  HALF_DAY: 'violet',
  WFH: 'sky',
  HOLIDAY: 'brand',
  NOT_MARKED: 'neutral',
  OPEN: 'amber',
  ANSWERED: 'green',
  CLOSED: 'neutral',
  ACTIVE: 'green',
  COMING_SOON: 'amber',
  COMPLETE: 'green',
  NOT_COMPLETE: 'red',
  NOTE: 'sky',
  HIGH: 'red',
  NORMAL: 'brand',
  LOW: 'neutral',
};

export function StatusBadge({ status, className }) {
  if (!status) return null;
  return (
    <Badge tone={STATUS_TONE[status] ?? 'neutral'} className={className}>
      {String(status).replace(/_/g, ' ').toLowerCase()}
    </Badge>
  );
}

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center overflow-y-auto bg-ink-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className={clsx(
          'relative z-10 max-h-[92vh] w-full animate-fade-up overflow-y-auto rounded-t-3xl border border-ink-200/70 bg-white shadow-2xl sm:rounded-2xl',
          'dark:border-white/10 dark:bg-ink-900',
          width
        )}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-ink-200/70 bg-white/95 px-5 py-4 backdrop-blur dark:border-white/10 dark:bg-ink-900/95">
          <div>
            <h3 className="font-display text-base font-semibold">{title}</h3>
            {subtitle && <p className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-ink-200/70 bg-white/95 px-5 py-4 backdrop-blur dark:border-white/10 dark:bg-ink-900/95">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Empty({ title = 'Nothing here yet', hint, icon: Icon = Inbox, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-ink-100 text-ink-400 dark:bg-white/5">
        <Icon size={24} />
      </span>
      <div>
        <p className="font-semibold">{title}</p>
        {hint && <p className="mt-1 max-w-sm text-sm text-ink-500 dark:text-ink-400">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ label = 'Loading', className }) {
  return (
    <div className={clsx('flex items-center justify-center gap-2 py-12 text-sm text-ink-500', className)}>
      <Loader2 size={18} className="animate-spin" />
      {label}
    </div>
  );
}

export function SkeletonCard({ className }) {
  return <div className={clsx('skeleton h-28 w-full', className)} />;
}

/**
 * Section 16.1 — plus / minus steppers, so nobody has to open a keyboard on
 * the floor. The field still accepts typed input for big numbers.
 */
export function Stepper({ value, onChange, disabled, step = 1, min = 0, max = 9999, label }) {
  const timer = useRef(null);
  const bump = (delta) => onChange(Math.min(max, Math.max(min, (Number(value) || 0) + delta)));

  const holdStart = (delta) => {
    bump(delta);
    timer.current = setTimeout(function repeat() {
      bump(delta);
      timer.current = setTimeout(repeat, 90);
    }, 420);
  };
  const holdEnd = () => clearTimeout(timer.current);

  return (
    <div className="flex items-stretch gap-2" aria-label={label}>
      <button
        type="button"
        disabled={disabled || Number(value) <= min}
        onPointerDown={() => holdStart(-step)}
        onPointerUp={holdEnd}
        onPointerLeave={holdEnd}
        className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-ink-200 bg-white text-ink-600 transition active:scale-95 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-ink-200"
      >
        <Minus size={18} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        min={min}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const next = e.target.value === '' ? 0 : Number(e.target.value);
          if (!Number.isNaN(next)) onChange(Math.min(max, Math.max(min, next)));
        }}
        className="input h-12 flex-1 text-center text-lg font-bold tabular-nums"
      />
      <button
        type="button"
        disabled={disabled || Number(value) >= max}
        onPointerDown={() => holdStart(step)}
        onPointerUp={holdEnd}
        onPointerLeave={holdEnd}
        className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-lift transition active:scale-95 disabled:opacity-40"
      >
        <Plus size={18} />
      </button>
    </div>
  );
}

export function Field({ label, hint, error, children, className }) {
  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-ink-500 dark:text-ink-400">{hint}</p>}
      {error && <p className="mt-1.5 text-xs font-medium text-rose-500">{error}</p>}
    </div>
  );
}

export function Progress({ value = 0, tone = 'brand' }) {
  const bar = {
    brand: 'from-brand-500 to-violet-500',
    green: 'from-emerald-500 to-teal-400',
    amber: 'from-amber-500 to-orange-400',
    red: 'from-rose-500 to-red-400',
  }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-200/70 dark:bg-white/10">
      <div
        className={clsx('h-full rounded-full bg-gradient-to-r transition-all duration-500', bar)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function Avatar({ name = '', size = 40, className }) {
  const text = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();

  // Stable colour per person so faces are recognisable in long lists.
  const palette = [
    'from-brand-500 to-violet-500',
    'from-emerald-500 to-teal-500',
    'from-amber-500 to-orange-500',
    'from-rose-500 to-pink-500',
    'from-sky-500 to-cyan-500',
    'from-fuchsia-500 to-purple-500',
  ];
  const hue = palette[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length];

  return (
    <span
      className={clsx(
        'grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-bold text-white',
        hue,
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {text || '?'}
    </span>
  );
}

export function Tabs({ tabs, active, onChange, className }) {
  return (
    <div className={clsx('flex gap-1 overflow-x-auto rounded-xl bg-ink-100 p-1 dark:bg-white/5', className)}>
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={clsx(
            'flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition',
            active === t.value
              ? 'bg-white text-ink-900 shadow-sm dark:bg-white/12 dark:text-white'
              : 'text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-white'
          )}
        >
          {t.label}
          {t.count > 0 && (
            <span className="ml-1.5 rounded-full bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-bold text-brand-600 dark:text-brand-300">
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
