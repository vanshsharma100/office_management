import { useCallback, useEffect, useState } from 'react';
import { CheckCheck, Eye, Megaphone, Pin, Plus } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { prettyDateTime, timeAgo } from '../lib/format';
import { Avatar, Badge, Card, Empty, Field, Modal, SectionTitle, Spinner, Tabs } from '../components/ui';

export default function Notices() {
  const { can } = useAuth();
  const { toast } = useUI();
  const [scope, setScope] = useState('mine');
  const [notices, setNotices] = useState(null);
  const [creating, setCreating] = useState(false);
  const [readsFor, setReadsFor] = useState(null);

  const load = useCallback(() => {
    api
      .get('/notices', { params: { scope } })
      .then((r) => setNotices(r.data.notices))
      .catch((e) => toast(e.message, 'error'));
  }, [scope, toast]);

  useEffect(() => {
    setNotices(null);
    load();
  }, [load]);

  // Section 13.2 — opening a notice records who read it and when.
  const markRead = async (notice) => {
    if (notice.readByMe) return;
    try {
      await api.post(`/notices/${notice.id}/read`);
      setNotices((prev) => prev.map((n) => (n.id === notice.id ? { ...n, readByMe: true } : n)));
    } catch {
      /* a failed read receipt should not interrupt reading */
    }
  };

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Notices"
        subtitle="The system records who has opened each notice, and when."
        icon={Megaphone}
        action={
          can('notices.manage') && (
            <button onClick={() => setCreating(true)} className="btn-primary btn-sm">
              <Plus size={15} /> Publish notice
            </button>
          )
        }
      />

      {can('notices.manage') && (
        <Tabs
          tabs={[
            { value: 'mine', label: 'For me' },
            { value: 'all', label: 'All published' },
          ]}
          active={scope}
          onChange={setScope}
        />
      )}

      {!notices ? (
        <Spinner label="Loading notices" />
      ) : notices.length === 0 ? (
        <Card>
          <Empty title="No notices" hint="Nothing has been published yet." icon={Megaphone} />
        </Card>
      ) : (
        <div className="space-y-3">
          {notices.map((n) => (
            <Card
              key={n.id}
              onClick={() => markRead(n)}
              className={`cursor-pointer p-5 transition ${
                !n.readByMe ? 'border-brand-400/40 bg-brand-500/[.04]' : ''
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display font-semibold">{n.title}</h3>
                    {n.pinned && (
                      <Badge tone="amber">
                        <Pin size={11} /> pinned
                      </Badge>
                    )}
                    {!n.readByMe && <Badge tone="brand">new</Badge>}
                    {n.audience === 'DEPARTMENT' && <Badge tone="sky">{n.department?.name}</Badge>}
                    {n.audience === 'USER' && <Badge tone="violet">for {n.targetUser?.name}</Badge>}
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm text-ink-600 dark:text-ink-300">{n.body}</p>
                  <p className="mt-3 text-xs text-ink-500 dark:text-ink-400">
                    {n.createdBy.name} · {timeAgo(n.createdAt)}
                    {n.readByMe && n.readAt ? ` · you read it ${timeAgo(n.readAt)}` : ''}
                  </p>
                </div>

                {can('notices.readReceipts') && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setReadsFor(n);
                    }}
                    className="btn-ghost btn-sm shrink-0"
                  >
                    <Eye size={14} /> {n.readCount} read
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {creating && <CreateNoticeModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {readsFor && <ReadReceiptsModal notice={readsFor} onClose={() => setReadsFor(null)} />}
    </div>
  );
}

/** Section 13.2 — settles the "I never saw that notice" problem. */
function ReadReceiptsModal({ notice, onClose }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/notices/${notice.id}/reads`).then((r) => setData(r.data)).catch(() => setData({ read: [], unread: [] }));
  }, [notice.id]);

  return (
    <Modal open onClose={onClose} title="Who has read this" subtitle={notice.title}>
      {!data ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-500">
              <CheckCheck size={14} /> Read ({data.read.length})
            </p>
            {data.read.length === 0 ? (
              <p className="text-sm text-ink-500">Nobody has opened it yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.read.map((u) => (
                  <li key={u.id} className="flex items-center gap-2.5">
                    <Avatar name={u.name} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{u.name}</p>
                      <p className="text-xs text-ink-500">{prettyDateTime(u.readAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-500">
              Not read yet ({data.unread.length})
            </p>
            {data.unread.length === 0 ? (
              <p className="text-sm text-ink-500">Everyone has read it.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {data.unread.map((u) => (
                  <li key={u.id}>
                    <Badge>{u.name}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function CreateNoticeModal({ onClose, onSaved }) {
  const { toast } = useUI();
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({
    title: '',
    body: '',
    audience: 'ALL',
    departmentId: '',
    targetUserId: '',
    pinned: false,
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/departments').then((r) => setDepartments(r.data.departments)).catch(() => {});
    api.get('/users', { params: { status: 'active' } }).then((r) => setUsers(r.data.users)).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      await api.post('/notices', {
        ...form,
        departmentId: form.audience === 'DEPARTMENT' ? form.departmentId : null,
        targetUserId: form.audience === 'USER' ? form.targetUserId : null,
      });
      toast('Notice published.');
      onSaved();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Publish a notice"
      subtitle="To everyone, one department, or one specific employee."
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={save} disabled={busy || form.title.length < 3 || form.body.length < 3} className="btn-primary">
            Publish
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title">
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
        </Field>
        <Field label="Message">
          <textarea className="input min-h-32" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        </Field>

        <Field label="Audience">
          <div className="mb-2 grid grid-cols-3 gap-2">
            {[
              { value: 'ALL', label: 'Everyone' },
              { value: 'DEPARTMENT', label: 'Department' },
              { value: 'USER', label: 'One person' },
            ].map((o) => (
              <button
                key={o.value}
                onClick={() => setForm({ ...form, audience: o.value })}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  form.audience === o.value ? 'border-brand-400 bg-brand-500/12' : 'border-ink-200 dark:border-white/10'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {form.audience === 'DEPARTMENT' && (
            <select className="input" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
              <option value="">Choose a department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          {form.audience === 'USER' && (
            <select className="input" value={form.targetUserId} onChange={(e) => setForm({ ...form, targetUserId: e.target.value })}>
              <option value="">Choose an employee</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.employeeId})
                </option>
              ))}
            </select>
          )}
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-500"
            checked={form.pinned}
            onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
          />
          Pin to the top
        </label>
      </div>
    </Modal>
  );
}
