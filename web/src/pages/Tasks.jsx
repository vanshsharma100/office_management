import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ListTodo, MessageSquare, Plus, XCircle } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { prettyDate, timeAgo } from '../lib/format';
import { Avatar, Badge, Card, Empty, Field, Modal, SectionTitle, Spinner, StatusBadge, Tabs } from '../components/ui';

export default function Tasks() {
  const { can } = useAuth();
  const { toast } = useUI();
  const [scope, setScope] = useState('mine');
  const [tasks, setTasks] = useState(null);
  const [creating, setCreating] = useState(false);
  const [responding, setResponding] = useState(null);

  const load = useCallback(() => {
    api
      .get('/tasks', { params: { scope } })
      .then((r) => setTasks(r.data.tasks))
      .catch((e) => toast(e.message, 'error'));
  }, [scope, toast]);

  useEffect(() => {
    setTasks(null);
    load();
  }, [load]);

  const reviewResponse = async (responseId, decision) => {
    try {
      await api.post(`/tasks/responses/${responseId}/review`, { decision });
      toast(decision === 'APPROVE' ? 'Task completion approved.' : 'Sent back.');
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Tasks"
        subtitle="Respond before or after the deadline — either way it is recorded."
        icon={ListTodo}
        action={
          can('tasks.manage') && (
            <button onClick={() => setCreating(true)} className="btn-primary btn-sm">
              <Plus size={15} /> Assign task
            </button>
          )
        }
      />

      {can('tasks.manage') && (
        <Tabs
          tabs={[
            { value: 'mine', label: 'My tasks' },
            { value: 'all', label: 'Everyone' },
          ]}
          active={scope}
          onChange={setScope}
        />
      )}

      {!tasks ? (
        <Spinner label="Loading tasks" />
      ) : tasks.length === 0 ? (
        <Card>
          <Empty title="No tasks" hint="Nothing has been assigned yet." icon={ListTodo} />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {tasks.map((task) => (
            <Card key={task.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-display font-semibold">{task.title}</p>
                <div className="flex shrink-0 gap-1.5">
                  <Badge tone={task.priority === 'HIGH' ? 'red' : task.priority === 'LOW' ? 'neutral' : 'brand'}>
                    {task.priority.toLowerCase()}
                  </Badge>
                  {task.overdue && task.isOpen && <Badge tone="red">overdue</Badge>}
                </div>
              </div>

              {task.description && (
                <p className="mt-1.5 text-sm text-ink-600 dark:text-ink-300">{task.description}</p>
              )}

              <p className="mt-2 text-xs text-ink-500 dark:text-ink-400">
                {task.assignee?.name ?? task.department?.name ?? 'Everyone'} · by {task.createdBy.name}
                {task.dueDate ? ` · due ${prettyDate(task.dueDate)}` : ' · no deadline'}
              </p>

              {/* My own response */}
              {task.myResponse ? (
                <div className="mt-3 rounded-xl bg-ink-100/60 p-3 dark:bg-white/5">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={task.myResponse.response} />
                    <StatusBadge status={task.myResponse.status} />
                    {!task.myResponse.onTime && <Badge tone="red">after deadline</Badge>}
                    <button
                      onClick={() => setResponding(task)}
                      className="ml-auto text-xs font-semibold text-brand-600 dark:text-brand-300"
                    >
                      Change
                    </button>
                  </div>
                  {task.myResponse.note && (
                    <p className="mt-2 text-sm text-ink-600 dark:text-ink-300">{task.myResponse.note}</p>
                  )}
                </div>
              ) : (
                task.isOpen && (
                  <button onClick={() => setResponding(task)} className="btn-primary btn-sm mt-3 w-full">
                    Respond
                  </button>
                )
              )}

              {/* Responses from others, when viewing everyone's tasks */}
              {scope === 'all' && task.responses.length > 0 && (
                <ul className="mt-3 space-y-2 border-t border-ink-200/70 pt-3 dark:border-white/10">
                  {task.responses.map((r) => (
                    <li key={r.id} className="flex items-center gap-2">
                      <Avatar name={r.user.name} size={28} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.user.name}</p>
                        <p className="truncate text-xs text-ink-500">{r.note || timeAgo(r.createdAt)}</p>
                      </div>
                      <StatusBadge status={r.response} />
                      {can('tasks.approve') && r.status === 'PENDING' && (
                        <span className="flex gap-1">
                          <button
                            onClick={() => reviewResponse(r.id, 'APPROVE')}
                            className="rounded-lg p-1.5 text-emerald-500 transition hover:bg-emerald-500/10"
                          >
                            <CheckCircle2 size={16} />
                          </button>
                          <button
                            onClick={() => reviewResponse(r.id, 'REJECT')}
                            className="rounded-lg p-1.5 text-rose-500 transition hover:bg-rose-500/10"
                          >
                            <XCircle size={16} />
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}

      {creating && <CreateTaskModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {responding && (
        <RespondModal
          task={responding}
          onClose={() => setResponding(null)}
          onSaved={() => {
            setResponding(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function RespondModal({ task, onClose, onSaved }) {
  const { toast } = useUI();
  const [response, setResponse] = useState(task.myResponse?.response ?? 'COMPLETE');
  const [note, setNote] = useState(task.myResponse?.note ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.post(`/tasks/${task.id}/respond`, { response, note: note || null });
      toast('Response recorded.');
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
      size="sm"
      title={task.title}
      subtitle={task.dueDate ? `Due ${prettyDate(task.dueDate)}` : 'No deadline'}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={save} disabled={busy} className="btn-primary">
            Save response
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-2">
          {[
            { value: 'COMPLETE', label: 'Complete', icon: CheckCircle2, tone: 'text-emerald-500' },
            { value: 'NOT_COMPLETE', label: 'Not complete', icon: XCircle, tone: 'text-rose-500' },
            { value: 'NOTE', label: 'Add a note — explain what happened', icon: MessageSquare, tone: 'text-sky-500' },
          ].map((o) => (
            <button
              key={o.value}
              onClick={() => setResponse(o.value)}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${
                response === o.value ? 'border-brand-400 bg-brand-500/12' : 'border-ink-200 dark:border-white/10'
              }`}
            >
              <o.icon size={18} className={o.tone} />
              {o.label}
            </button>
          ))}
        </div>

        <Field label="Note" hint="Describe an issue or explain what happened">
          <textarea className="input min-h-24" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function CreateTaskModal({ onClose, onSaved }) {
  const { toast } = useUI();
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    target: 'DEPARTMENT',
    departmentId: '',
    assigneeId: '',
    dueDate: '',
    priority: 'NORMAL',
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/departments').then((r) => setDepartments(r.data.departments)).catch(() => {});
    api.get('/users', { params: { status: 'active' } }).then((r) => setUsers(r.data.users)).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      await api.post('/tasks', {
        title: form.title,
        description: form.description || null,
        departmentId: form.target === 'DEPARTMENT' ? form.departmentId : null,
        assigneeId: form.target === 'USER' ? form.assigneeId : null,
        dueDate: form.dueDate || null,
        priority: form.priority,
      });
      toast('Task assigned.');
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
      title="Assign a task"
      subtitle="To a whole department, or to one specific employee."
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={save} disabled={busy || form.title.length < 3} className="btn-primary">
            Assign
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title">
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
        </Field>
        <Field label="Description">
          <textarea
            className="input min-h-24"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>

        <Field label="Assign to">
          <div className="mb-2 flex gap-2">
            {[
              { value: 'DEPARTMENT', label: 'A department' },
              { value: 'USER', label: 'One employee' },
            ].map((o) => (
              <button
                key={o.value}
                onClick={() => setForm({ ...form, target: o.value })}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  form.target === o.value ? 'border-brand-400 bg-brand-500/12' : 'border-ink-200 dark:border-white/10'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          {form.target === 'DEPARTMENT' ? (
            <select
              className="input"
              value={form.departmentId}
              onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
            >
              <option value="">Choose a department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          ) : (
            <select className="input" value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
              <option value="">Choose an employee</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.employeeId})
                </option>
              ))}
            </select>
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Deadline">
            <input
              type="datetime-local"
              className="input"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
          </Field>
          <Field label="Priority">
            <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
            </select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}
