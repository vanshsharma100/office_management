import { useState } from 'react';
import api from '../lib/api';
import { useUI } from '../context/UIContext';
import { prettyDate } from '../lib/format';
import { Field, Modal } from './ui';

/**
 * Correct a submission's numbers rather than bouncing it back.
 *
 * An approver who can see the count is wrong by two usually knows the right
 * answer, and a round trip through the employee costs a day. The change is
 * recorded against the approver's name, so a corrected figure is never
 * mistaken for what the employee originally claimed.
 */
export default function EditSubmission({ submission, onClose, onSaved }) {
  const { toast } = useUI();
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      submission.entries.map((e) => [e.questionId, { value: e.value, failedValue: e.failedValue }])
    )
  );
  const [note, setNote] = useState(submission.note ?? '');
  const [busy, setBusy] = useState(false);

  const set = (questionId, field, raw) => {
    const n = Math.max(0, Number(raw) || 0);
    setValues((prev) => ({ ...prev, [questionId]: { ...prev[questionId], [field]: n } }));
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.post('/work/submit', {
        userId: submission.user.id,
        date: submission.date,
        note: note.trim() || null,
        entries: Object.entries(values).map(([questionId, v]) => ({ questionId, ...v })),
      });
      toast('Saved. The correction is recorded against your name.');
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
      title={`Correct ${submission.user.name}'s work`}
      subtitle={prettyDate(submission.date)}
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={save} disabled={busy} className="btn-primary">
            {busy ? 'Saving…' : 'Save correction'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {submission.entries.map((e) => (
          <div key={e.questionId} className="grid grid-cols-[1fr_auto] items-center gap-3">
            <span className="text-sm">{e.question.label}</span>
            <div className="flex gap-2">
              <input
                type="number"
                min={0}
                className="input w-24 text-right tabular-nums"
                value={values[e.questionId].value}
                onChange={(ev) => set(e.questionId, 'value', ev.target.value)}
              />
              {e.question.type === 'CHECK_FAIL' && (
                <input
                  type="number"
                  min={0}
                  className="input w-24 text-right tabular-nums"
                  value={values[e.questionId].failedValue}
                  onChange={(ev) => set(e.questionId, 'failedValue', ev.target.value)}
                  title="Failed count"
                />
              )}
            </div>
          </div>
        ))}
        <Field label="Note" className="pt-2">
          <textarea className="input min-h-20" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
