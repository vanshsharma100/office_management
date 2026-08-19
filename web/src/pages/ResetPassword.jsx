import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { LogoMark } from '../components/Logo';

/**
 * Where an emailed reset link lands. Public — the whole point is that the
 * person cannot sign in, so nothing here may require a session.
 */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setError('The two passwords do not match');
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/reset', { token, newPassword: form.password });
      setDone(true);
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
            {done ? (
              <div className="text-center">
                <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
                <h2 className="mt-4 font-display text-2xl font-bold tracking-tightest">Password changed</h2>
                <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
                  You can sign in with your new password now.
                </p>
                <button onClick={() => navigate('/login')} className="btn-primary mt-6 w-full py-3">
                  Go to sign in
                </button>
              </div>
            ) : !token ? (
              <>
                <h2 className="font-display text-2xl font-bold tracking-tightest">Link not valid</h2>
                <p className="mt-2 text-sm text-ink-500 dark:text-ink-400">
                  Open the link from your email exactly as it was sent. If it has expired, ask for a
                  new one from the sign-in screen.
                </p>
                <button onClick={() => navigate('/login')} className="btn-ghost mt-6 w-full">
                  Back to sign in
                </button>
              </>
            ) : (
              <>
                <h2 className="font-display text-2xl font-bold tracking-tightest">Set a new password</h2>
                <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-400">
                  This link works once. Choose something you will remember.
                </p>

                <form onSubmit={submit} className="mt-7 space-y-4">
                  <div>
                    <label className="label">New password</label>
                    <input
                      type="password"
                      className="input"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      minLength={6}
                      required
                      autoFocus
                      autoComplete="new-password"
                    />
                  </div>
                  <div>
                    <label className="label">Confirm new password</label>
                    <input
                      type="password"
                      className="input"
                      value={form.confirm}
                      onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                      minLength={6}
                      required
                      autoComplete="new-password"
                    />
                  </div>

                  {error && (
                    <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-600 dark:text-rose-300">
                      {error}
                    </div>
                  )}

                  <button type="submit" disabled={busy} className="btn-primary w-full py-3 text-base">
                    {busy ? <Loader2 size={18} className="animate-spin" /> : <KeyRound size={18} />}
                    {busy ? 'Saving…' : 'Save new password'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
