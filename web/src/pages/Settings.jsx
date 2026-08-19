import { useCallback, useEffect, useState } from 'react';
import {
  ClipboardList,
  Download,
  Image as ImageIcon,
  KeyRound,
  Languages,
  Moon,
  RotateCcw,
  ShieldCheck,
  Sun,
  Trash2,
  UserCircle,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { fileToLogoDataUrl, useBranding } from '../context/BrandingContext';
import { prettyDate, prettyDateTime } from '../lib/format';
import { Avatar, Badge, Card, Field, Modal, SectionTitle, Spinner } from '../components/ui';

export default function SettingsPage() {
  const { user, isSuperAdmin, refresh } = useAuth();
  const { theme, toggleTheme, hindi, toggleHindi, toast } = useUI();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState(null);

  const initialProfile = {
    name: user.name ?? '',
    phone: user.phone ?? '',
    email: user.email ?? '',
    address: user.address ?? '',
    emergencyContact: user.emergencyContact ?? '',
    recoveryEmail: user.recoveryEmail ?? '',
  };
  const [profile, setProfile] = useState(initialProfile);
  const [savingProfile, setSavingProfile] = useState(false);
  const profileChanged =
    profile.name.trim().length >= 2 &&
    Object.keys(initialProfile).some((k) => profile[k] !== initialProfile[k]);

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.patch('/users/me', {
        name: profile.name.trim(),
        phone: profile.phone.trim() || null,
        email: profile.email.trim() || null,
        address: profile.address.trim() || null,
        emergencyContact: profile.emergencyContact.trim() || null,
        recoveryEmail: profile.recoveryEmail.trim() || null,
      });
      // Refresh the session so the greeting and sidebar show the new name at once.
      await refresh();
      toast('Profile updated.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

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

          <form onSubmit={saveProfile} className="mt-5 space-y-3 border-t border-ink-200/70 pt-4 dark:border-white/10">
            <Field label="Your name" hint="This is the name shown in your greeting and across the app">
              <input
                className="input"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Phone">
                <input
                  className="input"
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  className="input"
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Address">
              <textarea
                className="input min-h-16"
                value={profile.address}
                onChange={(e) => setProfile({ ...profile, address: e.target.value })}
              />
            </Field>
            <Field label="Emergency contact" hint="Name and number of someone to call if needed">
              <input
                className="input"
                value={profile.emergencyContact}
                onChange={(e) => setProfile({ ...profile, emergencyContact: e.target.value })}
                placeholder="e.g. Sunita (wife) 98765 43210"
              />
            </Field>
            <Field
              label="Recovery email"
              hint="Where a reset link is sent if you forget your password. Only you can set this."
            >
              <input
                type="email"
                className="input"
                value={profile.recoveryEmail}
                onChange={(e) => setProfile({ ...profile, recoveryEmail: e.target.value })}
                placeholder="you@example.com"
              />
            </Field>
            <button type="submit" className="btn-primary" disabled={savingProfile || !profileChanged}>
              {savingProfile ? 'Saving…' : 'Save profile'}
            </button>
          </form>

          <dl className="mt-5 space-y-2.5 border-t border-ink-200/70 pt-4 text-sm dark:border-white/10">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">Joined</dt>
              <dd className="font-medium">{prettyDate(user.joinDate)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-500">Last sign in</dt>
              <dd className="font-medium">{prettyDateTime(user.lastLoginAt)}</dd>
            </div>
          </dl>

          <p className="mt-4 text-xs text-ink-500">
            Your employee ID, username, department, job role and pay are set by an Admin. Name
            changes are recorded in the history log.
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

      {isSuperAdmin && <WeeklyReportCard />}
      {isSuperAdmin && <BrandingCard />}
      {isSuperAdmin && <ResetCard />}

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

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Start a fresh year: clear the record, keep the people.
 *
 * Everything removed is archived first and stays downloadable, and the wipe
 * itself needs the Super Admin's own password — a menu click should not be
 * able to erase a year of attendance.
 */
function ResetCard() {
  const { toast } = useUI();
  const [preview, setPreview] = useState(null);
  const [archives, setArchives] = useState([]);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get('/admin/reset/preview').then((r) => setPreview(r.data)).catch(() => {});
    api.get('/admin/archives').then((r) => setArchives(r.data.archives)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/admin/reset', { password, confirm });
      toast(`Done — ${data.archived} records archived and cleared.`);
      setOpen(false);
      setPassword('');
      setConfirm('');
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const download = async (a) => {
    try {
      const res = await api.get(`/admin/archives/${a.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ftech-archive-${a.createdAt.slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const rows = Object.values(preview?.counts ?? {}).filter((c) => c.count > 0);

  return (
    <Card className="border-rose-500/30 p-5">
      <SectionTitle
        title="Start a new year"
        subtitle="Clears the record and keeps the people. Everything removed is archived first."
        icon={RotateCcw}
      />

      <div className="rounded-xl border border-rose-400/30 bg-rose-500/[.06] p-4">
        <p className="text-sm">
          <strong>Kept:</strong> every employee, their password, role, department, job roles, pay
          setup, questions and settings.
        </p>
        <p className="mt-1.5 text-sm">
          <strong>Cleared:</strong> attendance, machine punches, daily work, weekly reports, leave,
          tasks, notices, questions raised, pay lines and holidays.
        </p>
        <p className="mt-1.5 text-xs text-ink-500 dark:text-ink-400">
          The history log is kept on purpose — it is the record of who did what, including this
          reset.
        </p>
      </div>

      {rows.length > 0 && (
        <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
          {rows.map((c) => (
            <li key={c.label} className="flex justify-between gap-3 text-sm">
              <span className="truncate text-ink-500 dark:text-ink-400">{c.label}</span>
              <span className="shrink-0 font-bold tabular-nums">{c.count}</span>
            </li>
          ))}
        </ul>
      )}

      <button
        onClick={() => setOpen(true)}
        disabled={!preview || preview.total === 0}
        className="btn-danger mt-5"
      >
        <RotateCcw size={16} />
        {preview?.total ? `Reset ${preview.total} records` : 'Nothing to reset'}
      </button>

      {archives.length > 0 && (
        <>
          <p className="mb-2 mt-6 text-xs font-bold uppercase tracking-wide text-ink-500">
            Past resets
          </p>
          <ul className="space-y-2">
            {archives.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center gap-3 rounded-xl bg-ink-100/60 px-4 py-3 dark:bg-white/5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.label}</p>
                  <p className="text-xs text-ink-500">
                    {a.total} records · by {a.createdByName}
                  </p>
                </div>
                <button onClick={() => download(a)} className="btn-ghost btn-sm ml-auto">
                  <Download size={14} /> Download
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title="This cannot be undone"
        subtitle={`${preview?.total ?? 0} records will be archived, then cleared`}
        footer={
          <>
            <button onClick={() => setOpen(false)} className="btn-ghost">
              Cancel
            </button>
            <button
              onClick={run}
              disabled={busy || confirm !== 'RESET' || !password}
              className="btn-danger"
            >
              {busy ? 'Working…' : 'Reset everything'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Your password" hint="The reset will not run without it">
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          <Field label="Type RESET to confirm">
            <input
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.toUpperCase())}
              placeholder="RESET"
            />
          </Field>
          <p className="text-xs text-ink-500 dark:text-ink-400">
            An archive of everything removed is created first, and stays downloadable from this
            screen.
          </p>
        </div>
      </Modal>
    </Card>
  );
}

/**
 * When the weekly report opens. It then stays open until the week ends, so
 * somebody off sick on the chosen day is not marked missing for a form they
 * had no chance to fill.
 */
function WeeklyReportCard() {
  const { toast } = useUI();
  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/weekly/config').then((r) => setConfig(r.data.config)).catch(() => {});
  }, []);

  const save = async (next) => {
    setBusy(true);
    try {
      const { data } = await api.put('/weekly/config', next);
      setConfig(data.config);
      toast(
        next.enabled
          ? `Weekly report opens every ${DAYS[next.openDay]}.`
          : 'Weekly report turned off.'
      );
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <SectionTitle
        title="Weekly report"
        subtitle="Every employee fills one each week. A week nobody filled shows as Missing."
        icon={ClipboardList}
      />
      {!config ? (
        <Spinner />
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-500"
              checked={config.enabled}
              disabled={busy}
              onChange={(e) => save({ ...config, enabled: e.target.checked })}
            />
            Ask every employee for a weekly report
          </label>

          <div className={config.enabled ? 'mt-5' : 'mt-5 pointer-events-none opacity-40'}>
            <p className="label">Opens on</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {DAYS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={config.openDay === i}
                  disabled={busy}
                  onClick={() => save({ ...config, openDay: i })}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    config.openDay === i
                      ? 'border-ink-900 bg-ink-900 text-white dark:border-white dark:bg-white dark:text-ink-900'
                      : 'border-ink-200 dark:border-ink-700'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-500 dark:text-ink-400">
              The form opens on {DAYS[config.openDay]} and stays open until Sunday night. You can
              see who has and has not filled it on each employee's page.
            </p>
          </div>
        </>
      )}
    </Card>
  );
}

/**
 * The company logo, for the whole office rather than this device — it appears
 * on the sign-in screen, in the sidebar and in the browser tab, for everyone.
 * Super Admin only, which is why it lives behind that check upstairs.
 */
function BrandingCard() {
  const { toast } = useUI();
  const { logo, setLogo } = useBranding();
  const [busy, setBusy] = useState(false);

  const save = async (next) => {
    setBusy(true);
    try {
      await api.put('/branding', { logo: next });
      setLogo(next);
      toast(next ? 'Logo updated — it now shows everywhere.' : 'Logo removed.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // so picking the same file twice still fires
    if (!file) return;
    try {
      save(await fileToLogoDataUrl(file));
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <Card className="p-5">
      <SectionTitle
        title="Company logo"
        subtitle="Shown on the sign-in screen, the sidebar and the browser tab — for everyone."
        icon={ImageIcon}
      />
      <div className="flex flex-wrap items-center gap-5">
        <span className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl border border-ink-200 bg-white dark:border-white/10">
          {logo ? (
            <img src={logo} alt="Company logo" className="h-[78%] w-[78%] object-contain" />
          ) : (
            <span className="font-display text-3xl font-bold text-ink-300">F</span>
          )}
        </span>

        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <label className={`btn-primary ${busy ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}>
              <ImageIcon size={16} /> {logo ? 'Replace logo' : 'Upload logo'}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pick} />
            </label>
            {logo && (
              <button onClick={() => save(null)} disabled={busy} className="btn-ghost">
                <Trash2 size={16} /> Remove
              </button>
            )}
          </div>
          <p className="mt-3 max-w-md text-xs text-ink-500 dark:text-ink-400">
            PNG, JPG or WebP. A square image with a transparent background looks best. The picture
            is shrunk before it is saved, so a large file is fine. Until a logo is uploaded the
            plain monogram is used.
          </p>
        </div>
      </div>
    </Card>
  );
}
