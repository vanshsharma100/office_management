import { useState } from 'react';
import { Eye, EyeOff, Loader2, LogIn, ShieldCheck, Smartphone, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [form, setForm] = useState({ username: '', password: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(form.username.trim(), form.password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-2 dark:bg-black">
      {/* Left: the pitch, on a black slab. Hidden on phones, where the form is
          all that matters. */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-black p-12 text-white lg:flex dark:bg-white dark:text-black">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white font-display text-xl font-bold text-black dark:bg-black dark:text-white">
            F
          </span>
          <div>
            <p className="font-display text-lg font-bold tracking-tightest">Ftech Computers</p>
            <p className="text-sm opacity-60">Office Management System</p>
          </div>
        </div>

        <div className="max-w-lg">
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tightest">
            One place for attendance, daily work, salary and everything in between.
          </h1>
          <p className="mt-4 text-lg opacity-70">
            Three panels. Real approvals. Nothing ever thrown away.
          </p>

          <div className="mt-10 space-y-4">
            {[
              { icon: Smartphone, title: 'Built for the floor', text: 'Steppers, zero defaults, works on any phone.' },
              { icon: ShieldCheck, title: 'Approved before it counts', text: 'Work is reviewed, or waved through with Autopilot.' },
              { icon: TrendingUp, title: 'Targets, not just totals', text: 'Every department shows pending against target.' },
            ].map((f) => (
              <div
                key={f.title}
                className="flex items-start gap-4 rounded-2xl border border-white/15 bg-white/[.06] p-4 transition hover:border-white/40 dark:border-black/15 dark:bg-black/[.06] dark:hover:border-black/40"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 dark:bg-black/10">
                  <f.icon size={19} />
                </span>
                <div>
                  <p className="font-semibold">{f.title}</p>
                  <p className="text-sm opacity-60">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-sm opacity-50">
          Accounts are created by a Super Admin or an authorised Admin. There is no public signup.
        </p>
      </div>

      {/* Right: the form */}
      <div className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md animate-fade-up">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-black font-display text-xl font-bold text-white shadow-lift dark:bg-white dark:text-black">
              F
            </span>
            <div>
              <p className="font-display text-lg font-bold tracking-tightest">Ftech Computers</p>
              <p className="text-sm text-ink-500 dark:text-ink-400">Office Management</p>
            </div>
          </div>

          <div className="card p-7 sm:p-8">
            <h2 className="font-display text-2xl font-bold tracking-tightest">Sign in</h2>
            <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-400">
              Use the username and password you were given.
            </p>

            <form onSubmit={submit} className="mt-7 space-y-4">
              <div>
                <label className="label">Username</label>
                <input
                  className="input"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="e.g. rahul"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input
                    className="input pr-11"
                    type={show ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 transition hover:text-black dark:hover:text-white"
                    aria-label={show ? 'Hide password' : 'Show password'}
                  >
                    {show ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-600 dark:text-rose-300">
                  {error}
                </div>
              )}

              <button type="submit" disabled={busy} className="btn-primary w-full py-3 text-base">
                {busy ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <p className="mt-6 text-center text-xs leading-relaxed text-ink-500 dark:text-ink-400">
              Forgot your password? Ask an Admin — they can reset it for you.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
