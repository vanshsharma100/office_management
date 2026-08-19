import { useState } from 'react';
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { LogoMark } from '../components/Logo';
import api from '../lib/api';

export default function Login() {
  const { login } = useAuth();
  const [form, setForm] = useState({ username: '', password: '' });
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  /**
   * Ask for a reset link. The reply is the same whether or not the account
   * exists or has a recovery address, so this screen cannot be used to find
   * out who works here.
   */
  const forgot = async () => {
    const username = form.username.trim();
    if (!username) return setError('Type your username first, then press this');
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/forgot', { username });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

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
    <div className="grid min-h-screen bg-white px-5 py-10 dark:bg-black">
      <div className="flex w-full items-center justify-center">
        <div className="w-full max-w-md animate-fade-up">
          <div className="mb-8 flex items-center justify-center gap-3">
            <LogoMark size={44} />
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

            <div className="mt-6 text-center text-xs leading-relaxed text-ink-500 dark:text-ink-400">
              {sent ? (
                <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                  If that account has a recovery email, a reset link is on its way. It expires in 30
                  minutes.
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={forgot}
                    disabled={busy}
                    className="font-semibold text-brand-600 hover:underline disabled:opacity-50 dark:text-brand-300"
                  >
                    Forgot your password?
                  </button>
                  <p className="mt-1">
                    Type your username above first. An Admin can also reset it for you.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
