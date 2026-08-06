import { useCallback, useEffect, useState } from 'react';
import { MessageCircleQuestion, Plus, Send } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { timeAgo } from '../lib/format';
import { Avatar, Badge, Card, Empty, Field, Modal, SectionTitle, Spinner, StatusBadge, Tabs } from '../components/ui';

/** Section 13.5 — questions go straight to the Super Admin and Admin, kept forever. */
export default function Queries() {
  const { can, isEmployee } = useAuth();
  const { toast } = useUI();
  const [scope, setScope] = useState(can('queries.answer') ? 'all' : 'mine');
  const [queries, setQueries] = useState(null);
  const [asking, setAsking] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [reply, setReply] = useState('');

  const load = useCallback(() => {
    api
      .get('/queries', { params: { scope } })
      .then((r) => setQueries(r.data.queries))
      .catch((e) => toast(e.message, 'error'));
  }, [scope, toast]);

  useEffect(() => {
    setQueries(null);
    load();
  }, [load]);

  const sendReply = async (queryId) => {
    if (!reply.trim()) return;
    try {
      await api.post(`/queries/${queryId}/reply`, { message: reply });
      setReply('');
      load();
      toast('Reply sent.');
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  const setStatus = async (queryId, status) => {
    try {
      await api.post(`/queries/${queryId}/status`, { status });
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Questions & issues"
        subtitle="Everything is stored with the date and time, and kept permanently."
        icon={MessageCircleQuestion}
        action={
          <button onClick={() => setAsking(true)} className="btn-primary btn-sm">
            <Plus size={15} /> Ask a question
          </button>
        }
      />

      {can('queries.answer') && (
        <Tabs
          tabs={[
            { value: 'all', label: 'Everyone' },
            { value: 'mine', label: 'Mine' },
          ]}
          active={scope}
          onChange={setScope}
        />
      )}

      {!queries ? (
        <Spinner label="Loading questions" />
      ) : queries.length === 0 ? (
        <Card>
          <Empty
            title="No questions yet"
            hint="Anything unclear? Ask directly — it goes to the Super Admin and Admins."
            icon={MessageCircleQuestion}
            action={
              <button onClick={() => setAsking(true)} className="btn-primary btn-sm">
                Ask a question
              </button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {queries.map((q) => {
            const open = openId === q.id;
            return (
              <Card key={q.id} className="p-5">
                <button onClick={() => setOpenId(open ? null : q.id)} className="w-full text-left">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <Avatar name={q.user.name} size={38} />
                      <div className="min-w-0">
                        <p className="font-display font-semibold">{q.subject}</p>
                        <p className="text-xs text-ink-500 dark:text-ink-400">
                          {q.user.name} · {q.user.department?.name ?? '—'} · {timeAgo(q.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <StatusBadge status={q.status} />
                      {q.replies.length > 0 && <Badge>{q.replies.length} reply</Badge>}
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-line text-sm text-ink-600 dark:text-ink-300">{q.message}</p>
                </button>

                {open && (
                  <div className="mt-4 space-y-3 border-t border-ink-200/70 pt-4 dark:border-white/10">
                    {q.replies.map((r) => (
                      <div key={r.id} className="flex items-start gap-3">
                        <Avatar name={r.user.name} size={30} />
                        <div className="min-w-0 flex-1 rounded-xl bg-ink-100/60 px-3 py-2 dark:bg-white/5">
                          <p className="text-xs font-semibold">
                            {r.user.name}
                            <span className="ml-1.5 font-normal text-ink-500">
                              {r.user.role.replace('_', ' ').toLowerCase()} · {timeAgo(r.createdAt)}
                            </span>
                          </p>
                          <p className="mt-1 whitespace-pre-line text-sm">{r.message}</p>
                        </div>
                      </div>
                    ))}

                    <div className="flex gap-2">
                      <input
                        className="input flex-1"
                        placeholder="Write a reply…"
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && sendReply(q.id)}
                      />
                      <button onClick={() => sendReply(q.id)} className="btn-primary">
                        <Send size={16} />
                      </button>
                    </div>

                    {can('queries.answer') && (
                      <div className="flex gap-2">
                        {['OPEN', 'ANSWERED', 'CLOSED'].map((s) => (
                          <button
                            key={s}
                            onClick={() => setStatus(q.id, s)}
                            className={`btn-ghost btn-sm ${q.status === s ? 'border-brand-400 text-brand-600' : ''}`}
                          >
                            {s.toLowerCase()}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {asking && <AskModal onClose={() => setAsking(false)} onSaved={() => { setAsking(false); load(); }} />}
    </div>
  );
}

function AskModal({ onClose, onSaved }) {
  const { toast } = useUI();
  const [form, setForm] = useState({ subject: '', message: '' });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.post('/queries', form);
      toast('Sent. You will get a reply here.');
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
      title="Ask a question"
      subtitle="Goes directly to the Super Admin and Admins."
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={save} disabled={busy || form.subject.length < 3 || form.message.length < 3} className="btn-primary">
            Send
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Subject">
          <input
            className="input"
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            placeholder="e.g. Yesterday's cloning count not showing"
            autoFocus
          />
        </Field>
        <Field label="Details">
          <textarea
            className="input min-h-32"
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            placeholder="Describe the problem or question."
          />
        </Field>
      </div>
    </Modal>
  );
}
