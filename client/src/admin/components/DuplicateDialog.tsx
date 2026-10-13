import { useState } from 'react';
import { isWorkingDay } from '@shared/calendar.ts';
import { addDays, isValidISODate } from '@shared/dates.ts';
import { formatFullDate, formatShortDate, formatTimeRange } from '@shared/format.ts';
import type { AdminActivityDTO } from '@shared/types.ts';
import { Dialog } from '../../components/Dialog.tsx';
import { useToast } from '../../components/feedback.tsx';
import { TextField } from '../../components/ui.tsx';
import { errorMessage } from '../../lib/api.ts';
import { useDuplicateActivity } from '../queries.ts';

export function DuplicateDialog({ activity, onClose }: { activity: AdminActivityDTO | null; onClose: () => void }) {
  return (
    <Dialog
      open={activity !== null}
      onClose={onClose}
      title="Duplicate activity"
      description={activity ? `${activity.name} · ${formatTimeRange(activity.startTime, activity.endTime)} · ${activity.location}` : ''}
    >
      {activity && <DuplicateForm activity={activity} onDone={onClose} />}
    </Dialog>
  );
}

function DuplicateForm({ activity, onDone }: { activity: AdminActivityDTO; onDone: () => void }) {
  // Same weekday for the next 8 weeks; the rest of the current month is pre-selected.
  const suggestions = Array.from({ length: 8 }, (_, i) => addDays(activity.date, 7 * (i + 1)));
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(suggestions.filter((date) => date.slice(0, 7) === activity.date.slice(0, 7))),
  );
  const [custom, setCustom] = useState('');
  const [customError, setCustomError] = useState<string>();
  const duplicate = useDuplicateActivity();
  const toast = useToast();

  const toggle = (date: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  const addCustom = () => {
    if (!isValidISODate(custom)) return setCustomError('Choose a date');
    if (!isWorkingDay(custom)) return setCustomError('Pick a working day (Sunday–Thursday)');
    setCustomError(undefined);
    setSelected((current) => new Set(current).add(custom));
    setCustom('');
  };

  const submit = () => {
    duplicate.mutate(
      { id: activity.id, dates: [...selected] },
      {
        onSuccess: ({ created, skipped }) => {
          if (created.length) toast.success(`Created ${created.length} draft cop${created.length === 1 ? 'y' : 'ies'} — publish when ready`);
          if (skipped.length) toast.info(`Skipped ${skipped.length}: ${skipped.map((s) => `${formatShortDate(s.date)} (${s.reason})`).join(', ')}`);
          onDone();
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  const extra = [...selected].filter((date) => !suggestions.includes(date)).sort();

  return (
    <div className="stack">
      <p className="muted">
        Copies are created as drafts with the same time, place, coach and capacity. Reservations are never copied.
      </p>
      <div>
        <div className="field-label" style={{ marginBottom: 8 }}>
          Every {formatFullDate(activity.date).split(',')[0]} after {formatShortDate(activity.date)}
        </div>
        <div className="date-options">
          {[...suggestions, ...extra].map((date) => (
            <label key={date} className="date-option">
              <input type="checkbox" checked={selected.has(date)} onChange={() => toggle(date)} />
              {formatShortDate(date)}
            </label>
          ))}
        </div>
      </div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <TextField
          label="Add another date"
          type="date"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          error={customError}
          className="spacer"
        />
        <button type="button" className="btn" onClick={addCustom} style={{ marginBottom: customError ? 26 : 0 }}>
          Add
        </button>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={!selected.size || duplicate.isPending}>
          {duplicate.isPending && <span className="spinner" aria-hidden />}
          Create {selected.size || ''} cop{selected.size === 1 ? 'y' : 'ies'}
        </button>
      </div>
    </div>
  );
}
