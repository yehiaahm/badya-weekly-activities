import { useIsMutating } from '@tanstack/react-query';
import { CalendarClock, TriangleAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { computeRegistrationDeadline, WORKDAY_END, WORKDAY_START } from '@shared/calendar.ts';
import { isValidISODate, isValidTime, minutesToTime, timeToMinutes } from '@shared/dates.ts';
import { formatDeadline, formatTime } from '@shared/format.ts';
import { ADMIN_STATUS_LABELS, STORED_STATUSES, type StoredStatus } from '@shared/status.ts';
import type { AdminActivityDTO } from '@shared/types.ts';
import { activityFieldsSchema, fieldErrors, scheduleIssues } from '@shared/validation.ts';
import { Dialog } from '../../components/Dialog.tsx';
import { useToast } from '../../components/feedback.tsx';
import { SelectField, StatusBadge, TextAreaField, TextField } from '../../components/ui.tsx';
import { ApiError, errorMessage } from '../../lib/api.ts';
import { useConfig } from '../../lib/queries.ts';
import { SAVE_ACTIVITY_KEY, useLookups, useSaveActivity, type ActivityInput } from '../queries.ts';

const TIME_OPTIONS = (() => {
  const options: string[] = [];
  for (let m = timeToMinutes(WORKDAY_START); m <= timeToMinutes(WORKDAY_END); m += 15) options.push(minutesToTime(m));
  return options;
})();

type FormValues = Omit<ActivityInput, 'capacity' | 'status'> & { capacity: string; status: StoredStatus };

function initialValues(activity: AdminActivityDTO | null | undefined, date: string | undefined): FormValues {
  if (activity) {
    return {
      name: activity.name,
      category: activity.category,
      description: activity.description,
      date: activity.date,
      startTime: activity.startTime,
      endTime: activity.endTime,
      location: activity.location,
      coach: activity.coach,
      capacity: String(activity.capacity),
      status: activity.storedStatus,
    };
  }
  return {
    name: '',
    category: '',
    description: '',
    date: date ?? '',
    startTime: '10:00',
    endTime: '11:00',
    location: '',
    coach: '',
    capacity: '20',
    status: 'draft',
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  activity?: AdminActivityDTO | null;
  defaultDate?: string;
}

export function ActivityFormDialog({ open, onClose, activity, defaultDate }: Props) {
  const saving = useIsMutating({ mutationKey: SAVE_ACTIVITY_KEY }) > 0;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      dismissible={false}
      title={activity ? 'Edit activity' : 'New activity'}
      description={activity ? `${activity.name} · ${activity.registeredCount} registered` : 'Schedule a session on a working day (Sunday–Thursday, 9:00 AM – 2:00 PM).'}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="activity-form" className="btn btn-primary" disabled={saving}>
            {saving && <span className="spinner" aria-hidden />}
            {activity ? 'Save changes' : 'Create activity'}
          </button>
        </>
      }
    >
      <ActivityForm activity={activity} defaultDate={defaultDate} onDone={onClose} />
    </Dialog>
  );
}

function ActivityForm({ activity, defaultDate, onDone }: { activity?: AdminActivityDTO | null; defaultDate?: string; onDone: () => void }) {
  const [values, setValues] = useState<FormValues>(() => initialValues(activity, defaultDate));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const lookups = useLookups().data;
  const leadHours = useConfig().data?.registrationLeadHours ?? 24;
  const save = useSaveActivity();
  const toast = useToast();

  const set = (field: keyof FormValues) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors(({ [field]: _removed, ...rest }) => rest);
  };

  const scheduleValid = isValidISODate(values.date) && isValidTime(values.startTime);
  const liveIssues = scheduleValid ? scheduleIssues(values) : [];
  const deadline = scheduleValid && !liveIssues.some((i) => i.path === 'date') ? computeRegistrationDeadline(values.date, values.startTime, leadHours) : null;
  const moved = activity && (values.date !== activity.date || values.startTime !== activity.startTime || values.endTime !== activity.endTime);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = activityFieldsSchema.safeParse(values);
    const issues = [...(parsed.success ? [] : parsed.error.issues), ...scheduleIssues(values).map((i) => ({ path: [i.path], message: i.message }))];
    if (issues.length) {
      setErrors(fieldErrors(issues));
      return;
    }
    const payload = { ...values, capacity: Number(values.capacity) };
    save.mutate(
      { id: activity?.id, values: activity ? payload : { ...payload, status: values.status === 'published' ? 'published' : 'draft' } },
      {
        onSuccess: (saved) => {
          toast.success(activity ? `${saved.name} updated` : `${saved.name} created as ${ADMIN_STATUS_LABELS[saved.storedStatus].toLowerCase()}`);
          onDone();
        },
        onError: (error) => {
          if (error instanceof ApiError && Object.keys(error.fields).length) setErrors(error.fields);
          else toast.error(errorMessage(error));
        },
      },
    );
  };

  return (
    <form id="activity-form" className="stack" onSubmit={submit} noValidate>
      <div className="form-grid form-grid-2">
        <TextField
          label="Activity name"
          required
          list="lookup-names"
          value={values.name}
          onChange={(e) => set('name')(e.target.value)}
          error={errors.name}
          placeholder="e.g. Tennis"
          autoFocus
        />
        <TextField
          label="Sport / category"
          required
          list="lookup-categories"
          value={values.category}
          onChange={(e) => set('category')(e.target.value)}
          error={errors.category}
          placeholder="e.g. Tennis"
        />
        <TextField
          label="Date"
          required
          type="date"
          value={values.date}
          onChange={(e) => set('date')(e.target.value)}
          error={errors.date ?? liveIssues.find((i) => i.path === 'date')?.message}
          hint="Sunday to Thursday only"
        />
        <div className="form-grid form-grid-2" style={{ gap: 12 }}>
          <SelectField label="Start time" required value={values.startTime} onChange={(e) => set('startTime')(e.target.value)} error={errors.startTime}>
            {TIME_OPTIONS.slice(0, -1).map((time) => (
              <option key={time} value={time}>
                {formatTime(time)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="End time"
            required
            value={values.endTime}
            onChange={(e) => set('endTime')(e.target.value)}
            error={errors.endTime ?? liveIssues.find((i) => i.path === 'endTime')?.message}
          >
            {TIME_OPTIONS.slice(1).map((time) => (
              <option key={time} value={time}>
                {formatTime(time)}
              </option>
            ))}
          </SelectField>
        </div>
        <TextField
          label="Location"
          required
          list="lookup-locations"
          value={values.location}
          onChange={(e) => set('location')(e.target.value)}
          error={errors.location}
          placeholder="e.g. Sports Court"
        />
        <TextField
          label="Coach / staff member"
          required
          list="lookup-coaches"
          value={values.coach}
          onChange={(e) => set('coach')(e.target.value)}
          error={errors.coach}
          placeholder="e.g. Coach Karim Adel"
        />
        <TextField
          label="Maximum capacity"
          required
          type="number"
          inputMode="numeric"
          min={Math.max(1, activity?.registeredCount ?? 1)}
          value={values.capacity}
          onChange={(e) => set('capacity')(e.target.value)}
          error={errors.capacity}
          hint={activity?.registeredCount ? `At least ${activity.registeredCount} (already registered)` : undefined}
        />
        {activity ? (
          <SelectField
            label="Status"
            value={values.status}
            onChange={(e) => set('status')(e.target.value)}
            error={errors.status}
            hint={
              <span className="row" style={{ gap: 6 }}>
                Currently shown as <StatusBadge status={activity.status} />
              </span>
            }
          >
            {STORED_STATUSES.map((status) => (
              <option key={status} value={status} disabled={status === 'draft' && activity.registeredCount > 0}>
                {ADMIN_STATUS_LABELS[status]}
              </option>
            ))}
          </SelectField>
        ) : (
          <SelectField label="Visibility" value={values.status} onChange={(e) => set('status')(e.target.value)}>
            <option value="draft">Save as draft (hidden from students)</option>
            <option value="published">Publish now</option>
          </SelectField>
        )}
        <TextAreaField
          label="Description"
          className="span-2"
          rows={3}
          value={values.description}
          onChange={(e) => set('description')(e.target.value)}
          error={errors.description}
          placeholder="What to expect, what to bring…"
        />
      </div>

      {deadline && (
        <div className="deadline-preview">
          <CalendarClock size={18} />
          <span>
            Registration deadline: <strong>{formatDeadline(deadline)}</strong> — calculated automatically ({leadHours} working hours before
            the start; Fridays and Saturdays are skipped).
          </span>
        </div>
      )}
      {moved && activity.registeredCount > 0 && (
        <div className="alert alert-warning">
          <TriangleAlert size={18} />
          <span>
            {activity.registeredCount} student(s) are registered. They will see the new date and time in My Reservations.
          </span>
        </div>
      )}

      <datalist id="lookup-names">{lookups?.activityNames.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="lookup-categories">{lookups?.categories.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="lookup-locations">{lookups?.locations.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="lookup-coaches">{lookups?.coaches.map((v) => <option key={v} value={v} />)}</datalist>
    </form>
  );
}
