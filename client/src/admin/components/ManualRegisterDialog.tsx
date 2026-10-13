import { CircleAlert, Search, UserPlus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { AdminActivityDTO, StudentProfileDTO } from '@shared/types.ts';
import { fieldErrors, studentDetailsSchema, type StudentDetailsInput } from '@shared/validation.ts';
import { Dialog } from '../../components/Dialog.tsx';
import { useToast } from '../../components/feedback.tsx';
import { SelectField, TextField } from '../../components/ui.tsx';
import { ApiError, errorMessage } from '../../lib/api.ts';
import { useConfig } from '../../lib/queries.ts';
import { searchStudents, useManualRegister } from '../queries.ts';

type FormValues = { [K in keyof StudentDetailsInput]: string };
const EMPTY: FormValues = { fullName: '', studentId: '', major: '', academicLevel: '', phone: '', email: '' };

export function ManualRegisterDialog({ activity, open, onClose }: { activity: AdminActivityDTO; open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={false}
      size="lg"
      title="Register a student"
      description={`Manually add a student to ${activity.name}. Capacity and duplicate checks still apply.`}
    >
      <ManualRegisterForm activity={activity} onDone={onClose} />
    </Dialog>
  );
}

function ManualRegisterForm({ activity, onDone }: { activity: AdminActivityDTO; onDone: () => void }) {
  const config = useConfig().data;
  const register = useManualRegister(activity.id);
  const toast = useToast();
  const [values, setValues] = useState<FormValues>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string>();
  const [override, setOverride] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<StudentProfileDTO[]>([]);

  const deadlinePassed = activity.status === 'registration_closed';
  const full = activity.registeredCount >= activity.capacity;
  const blocked = activity.status === 'cancelled' || activity.status === 'completed' || activity.status === 'draft';

  useEffect(() => {
    if (search.trim().length < 2) {
      setResults([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      searchStudents(search.trim())
        .then((data) => active && setResults(data.students))
        .catch(() => active && setResults([]));
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [search]);

  const pick = (student: StudentProfileDTO) => {
    setValues({
      fullName: student.name,
      studentId: student.studentId,
      major: student.major,
      academicLevel: student.academicLevel,
      phone: student.phone,
      email: student.email,
    });
    setErrors({});
    setSearch('');
    setResults([]);
  };

  const set = (field: keyof FormValues) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors(({ [field]: _removed, ...rest }) => rest);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setServerError(undefined);
    const parsed = studentDetailsSchema(config?.emailDomains ?? []).safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error.issues));
      return;
    }
    register.mutate(
      { ...parsed.data, overrideDeadline: override },
      {
        onSuccess: (result) => {
          toast.success(`${result.student.name} registered · ${result.reservation.code}`);
          onDone();
        },
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') setErrors(error.fields);
          else setServerError(errorMessage(error));
        },
      },
    );
  };

  return (
    <form className="stack" onSubmit={submit} noValidate>
      {blocked && (
        <div className="alert alert-danger">
          <CircleAlert size={18} />
          <span>This activity is {activity.status}; it can't accept reservations.</span>
        </div>
      )}
      {full && !blocked && (
        <div className="alert alert-warning">
          <CircleAlert size={18} />
          <span>All {activity.capacity} seats are taken. Increase the capacity (Edit activity) before adding more students.</span>
        </div>
      )}
      {serverError && (
        <div className="alert alert-danger" role="alert">
          <CircleAlert size={18} />
          <span>{serverError}</span>
        </div>
      )}

      <div className="field" style={{ position: 'relative' }}>
        <label className="field-label" htmlFor="student-search">
          Find an existing student
        </label>
        <div className="search-input">
          <Search size={16} />
          <input
            id="student-search"
            className="input"
            placeholder="Search by name, Student ID or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
          />
        </div>
        {results.length > 0 && (
          <div className="menu-list" style={{ left: 0, right: 0, maxHeight: 240, overflowY: 'auto' }}>
            {results.map((student) => (
              <button key={student.id} type="button" className="menu-item" onClick={() => pick(student)}>
                <span>
                  <strong>{student.name}</strong>
                  <span className="muted"> · {student.studentId} · {student.email}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        <span className="field-hint">Picking a student fills in their details. New students can be typed in directly.</span>
      </div>

      <div className="form-grid form-grid-2">
        <TextField label="Full Name" required value={values.fullName} onChange={(e) => set('fullName')(e.target.value)} error={errors.fullName} />
        <TextField label="Student ID" required value={values.studentId} onChange={(e) => set('studentId')(e.target.value)} error={errors.studentId} />
        <TextField label="Major" required value={values.major} onChange={(e) => set('major')(e.target.value)} error={errors.major} />
        <SelectField
          label="Academic Level"
          required
          value={values.academicLevel}
          onChange={(e) => set('academicLevel')(e.target.value)}
          error={errors.academicLevel}
        >
          <option value="" disabled>
            Select level
          </option>
          {(config?.academicLevels ?? []).map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </SelectField>
        <TextField label="Phone Number" required type="tel" value={values.phone} onChange={(e) => set('phone')(e.target.value)} error={errors.phone} />
        <TextField label="University Email" required type="email" value={values.email} onChange={(e) => set('email')(e.target.value)} error={errors.email} />
      </div>

      {deadlinePassed && !blocked && (
        <label className="checkbox">
          <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
          <span>
            <strong>Override the registration deadline.</strong> Registration has closed for students; staff may still add a student
            (for example a walk-in).
          </span>
        </label>
      )}

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={register.isPending || blocked || full || (deadlinePassed && !override)}
        >
          {register.isPending ? <span className="spinner" aria-hidden /> : <UserPlus size={17} />} Register student
        </button>
      </div>
    </form>
  );
}
