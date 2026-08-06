import { useEffect, useState } from 'react';
import { KeyRound, Languages, Moon, ShieldCheck, Sun, UserCircle } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { prettyDate, prettyDateTime } from '../lib/format';
import { Avatar, Badge, Card, Field, SectionTitle, Spinner } from '../components/ui';

export default function SettingsPage() {
  const { user, isSuperAdmin } = useAuth();
  const { theme, toggleTheme, hindi, toggleHindi, toast } = useUI();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState(null);

  useEffect(() => {
    api.get('/users/permission-catalog').then((r) => setCatalog(r.data)).catch(() => {});
  }, []);

  const changePassword = async (e) => {
    e.preventDefault();
    if (form.newPassword !== form.confirm) return toast('The two new passwords do not match', 'error');
    setBusy(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      toast('Password changed.');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionTitle title="Settings" subtitle="Your profile, your password, and how this device looks." icon={UserCircle} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle title="Profile" icon={UserCircle} />
          <div className="flex items-start gap-4">
            <Avatar name={user.name} size={64} />
            <div className="min-w-0">
              <p className="font-display text-lg font-semibold">{user.name}</p>
              <p className="text-sm text-ink-500 dark:text-ink-400">
                {user.employeeId} · @{user.username}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone={user.role === 'SUPER_ADMIN' ? 'violet' : user.role === 'ADMIN' ? 'brand' : 'neutral'}>
                  {user.role.replace('_', ' ').toLowerCase()}
                </Badge>
                {user.department && <Badge tone="sky">{user.department.name}</Badge>}
                {user.jobRoles?.map((j) => (
                  <Badge key={j.id}>{j.name}</Badge>
                ))}
              </div>
            </div>
          </div>

          <dl className="mt-5 space-y-2.5 border-t border-ink-200/70 pt-4 text-sm dark:border-white/10">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">Joined</dt>
              <dd className="font-medium">{prettyDate(user.joinDate)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">Last sign in</dt>
              <dd className="font-medium">{prettyDateTime(user.lastLoginAt)}</dd>
            </div>
            {user.phone && (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-500">Phone</dt>
                <dd className="font-medium">{user.phone}</dd>
              </div>
            )}
          </dl>

          <p className="mt-4 text-xs text-ink-500">
            Your department and job role are set by an Admin and cannot be changed here.
          </p>
        </Card>

        <Card className="p-5">
          <SectionTitle title="Change password" subtitle="If you forget it, an Admin can reset it." icon={KeyRound} />
          <form onSubmit={changePassword} className="space-y-4">
            <Field label="Current password">
              <input
                type="password"
                className="input"
                value={form.currentPassword}
                onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
                required
                autoComplete="current-password"
              />
            </Field>
            <Field label="New password" hint="At least 6 characters">
              <input
                type="password"
                className="input"
                value={form.newPassword}
                onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Confirm new password">
              <input
                type="password"
                className="input"
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                required
                autoComplete="new-password"
              />
            </Field>
            <button type="submit" disabled={busy} className="btn-primary w-full">
              <KeyRound size={16} /> {busy ? 'Saving…' : 'Change password'}
            </button>
          </form>
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle title="This device" subtitle="Saved on this phone or computer only." icon={Languages} />
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={toggleTheme}
            className="flex items-center justify-between gap-3 rounded-xl border border-ink-200 px-4 py-3.5 text-left transition hover:border-brand-400 dark:border-white/10"
          >
            <span>
              <span className="block text-sm font-semibold">Appearance</span>
              <span className="block text-xs text-ink-500">{theme === 'dark' ? 'Dark' : 'Light'}</span>
            </span>
            {theme === 'dark' ? <Moon size={18} className="text-brand-400" /> : <Sun size={18} className="text-amber-500" />}
          </button>

          <button
            onClick={toggleHindi}
            className="flex items-center justify-between gap-3 rounded-xl border border-ink-200 px-4 py-3.5 text-left transition hover:border-brand-400 dark:border-white/10"
          >
            <span>
              <span className="block text-sm font-semibold">Hindi labels · हिंदी</span>
              <span className="block text-xs text-ink-500">{hindi ? 'On — showing Hindi where available' : 'Off — English only'}</span>
            </span>
            <Languages size={18} className={hindi ? 'text-brand-400' : 'text-ink-400'} />
          </button>
        </div>
      </Card>

      {/* What this account can actually do — mirrors the server's rules. */}
      <Card className="p-5">
        <SectionTitle title="My access" subtitle="What this account is allowed to do." icon={ShieldCheck} />
        {isSuperAdmin ? (
          <p className="text-sm text-ink-600 dark:text-ink-300">
            Super Admin — full access with no restrictions.
          </p>
        ) : user.role === 'ADMIN' ? (
          !catalog ? (
            <Spinner />
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {catalog.permissions
                  .filter((p) => user.permissions.includes(p.key))
                  .map((p) => (
                    <Badge key={p.key} tone="green">
                      {p.label}
                    </Badge>
                  ))}
                {user.permissions.length === 0 && (
                  <p className="text-sm text-ink-500">No sections granted yet — ask the Super Admin.</p>
                )}
              </div>
              <div className="mt-5 rounded-xl border border-amber-400/30 bg-amber-500/[.07] p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-300">
                  Always applies to every Admin
                </p>
                <ul className="mt-2 space-y-1 text-sm text-ink-600 dark:text-ink-300">
                  {catalog.hardLimits.map((h) => (
                    <li key={h}>• {h}</li>
                  ))}
                </ul>
              </div>
            </>
          )
        ) : (
          <p className="text-sm text-ink-600 dark:text-ink-300">
            Employee — you see only your own data: attendance, work, salary, leave, tasks and notices.
          </p>
        )}
      </Card>
    </div>
  );
}
