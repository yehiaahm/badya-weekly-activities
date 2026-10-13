import {
  ArrowLeft,
  Ban,
  CalendarDays,
  CircleAlert,
  CircleCheck,
  Clock,
  Hourglass,
  Lock,
  MapPin,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { formatDeadline, formatFullDate, formatTimeRange } from '@shared/format.ts';
import type { ActivityDTO } from '@shared/types.ts';
import { fieldErrors, studentDetailsSchema, type StudentDetailsInput } from '@shared/validation.ts';
import { ErrorState, LoadingState, SelectField, TextField } from '../components/ui.tsx';
import { ApiError } from '../lib/api.ts';
import { CategoryPill } from '../lib/categories.tsx';
import { useConfig, useMyReservations, usePublicActivity, useReserve, useSession, useStudentLogout } from '../lib/queries.ts';
import { readJson, removeItem, STORAGE_KEYS, writeJson } from '../lib/storage.ts';
import { browseLink } from './ActivityDetailPage.tsx';

/** The form holds plain strings; the shared schema turns them into validated details. */
type FormValues = { [K in keyof StudentDetailsInput]: string };

const EMPTY: FormValues = { fullName: '', studentId: '', major: '', academicLevel: '', phone: '', email: '' };

/** Server refusals that no change to the form can fix. */
const FINAL_CODES = new Set(['FULLY_BOOKED', 'REGISTRATION_CLOSED', 'ALREADY_REGISTERED', 'ACTIVITY_CANCELLED', 'ACTIVITY_COMPLETED', 'ACTIVITY_NOT_FOUND']);

const BLOCKER_TITLES: Record<string, string> = {
  FULLY_BOOKED: 'Fully Booked',
  REGISTRATION_CLOSED: 'Registration Closed',
  ALREADY_REGISTERED: 'You are already registered for this activity.',
  ACTIVITY_CANCELLED: 'Activity cancelled',
  ACTIVITY_COMPLETED: 'Activity completed',
  IDENTITY_MISMATCH: 'Please check your details',
  RATE_LIMITED: 'Too many attempts',
};

export function ReservePage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const activityQuery = usePublicActivity(id);
  const config = useConfig().data;
  const session = useSession();
  const profile = session.data?.student?.student ?? null;
  const mine = useMyReservations(Boolean(profile));
  const logout = useStudentLogout();
  const reserve = useReserve(id);

  const [values, setValues] = useState<FormValues>(() => ({
    ...EMPTY,
    ...(readJson<Partial<FormValues>>(STORAGE_KEYS.rememberedDetails) ?? {}),
  }));
  const [remember, setRemember] = useState(() => readJson(STORAGE_KEYS.rememberedDetails) !== null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<ApiError | null>(null);

  // A verified student reserves as themselves: identity comes from their profile.
  useEffect(() => {
    if (!profile) return;
    setValues((current) => ({
      fullName: profile.name,
      studentId: profile.studentId,
      email: profile.email,
      major: current.major || profile.major,
      academicLevel: current.academicLevel || profile.academicLevel,
      phone: current.phone || profile.phone,
    }));
  }, [profile]);

  if (activityQuery.isPending) return <LoadingState label="Loading activity…" />;
  if (activityQuery.error) {
    return (
      <div className="container page">
        <ErrorState error={activityQuery.error} onRetry={() => void activityQuery.refetch()} />
      </div>
    );
  }

  const activity = activityQuery.data;
  const domains = config?.emailDomains ?? [];
  const alreadyMine = (mine.data?.reservations ?? []).some((r) => r.activity.id === activity.id && r.status === 'confirmed');
  const finalError = serverError && FINAL_CODES.has(serverError.code);

  const set = (field: keyof FormValues) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors(({ [field]: _removed, ...rest }) => rest);
    if (serverError && !FINAL_CODES.has(serverError.code)) setServerError(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setServerError(null);
    const result = studentDetailsSchema(domains).safeParse(values);
    if (!result.success) {
      const next = fieldErrors(result.error.issues);
      setErrors(next);
      document.getElementById(`field-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    reserve.mutate(result.data, {
      onSuccess: (confirmation) => {
        if (remember) writeJson(STORAGE_KEYS.rememberedDetails, values);
        else removeItem(STORAGE_KEYS.rememberedDetails);
        writeJson(STORAGE_KEYS.lastConfirmation, confirmation, 'session');
        writeJson(STORAGE_KEYS.lastEmail, confirmation.student.email, 'session');
        navigate('/reservations/confirmed', { state: confirmation, replace: true });
      },
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') setErrors(error.fields);
        else if (error instanceof ApiError) setServerError(error);
        else setServerError(new ApiError(0, 'UNKNOWN', 'Something went wrong. Please try again.'));
      },
    });
  };

  return (
    <div className="container page">
      <Link to={`/activities/${activity.id}`} className="back-link">
        <ArrowLeft size={16} /> Activity details
      </Link>

      <div className="reserve-layout">
        <aside className="card card-pad stack reserve-summary">
          <div className="stack stack-sm" style={{ alignItems: 'flex-start' }}>
            <CategoryPill category={activity.category} />
            <h2>{activity.name}</h2>
          </div>
          <ul className="summary-list">
            <SummaryItem icon={CalendarDays} label="Date" value={formatFullDate(activity.date)} />
            <SummaryItem icon={Clock} label="Time" value={formatTimeRange(activity.startTime, activity.endTime)} />
            <SummaryItem icon={MapPin} label="Location" value={activity.location} />
            <SummaryItem
              icon={Users}
              label="Seats"
              value={activity.status === 'full' ? 'Fully Booked' : `${activity.availableSeats} of ${activity.capacity} available`}
            />
          </ul>
          {activity.canReserve && (
            <div className="deadline-note">
              <Hourglass size={16} />
              <span>
                Registration closes <strong>{formatDeadline(activity.registrationDeadline)}</strong>.
              </span>
            </div>
          )}
        </aside>

        <section className="card card-pad">
          {alreadyMine ? (
            <Blocker
              icon={CircleCheck}
              tone="success"
              title="You are already registered for this activity."
              body="Your reservation is confirmed. You can see or cancel it from My Reservations."
              action={
                <Link to="/my-reservations" className="btn btn-primary">
                  My Reservations
                </Link>
              }
            />
          ) : !activity.canReserve ? (
            <UnavailablePanel activity={activity} />
          ) : (
            <form className="stack" onSubmit={submit} noValidate>
              <div>
                <h1>Reserve Your Spot</h1>
                <p className="muted" style={{ marginTop: 4 }}>
                  Enter your academic information. All fields are required.
                </p>
              </div>

              {profile && (
                <div className="signed-in-note">
                  <Lock size={15} />
                  <span>
                    Reserving as <strong>{profile.name}</strong> ({profile.studentId})
                  </span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => logout.mutate()}>
                    Not you? Sign out
                  </button>
                </div>
              )}

              {serverError && (
                <div className={`alert ${finalError ? 'alert-warning' : 'alert-danger'}`} role="alert">
                  <CircleAlert size={20} />
                  <div>
                    <div className="alert-title">{BLOCKER_TITLES[serverError.code] ?? 'Reservation not completed'}</div>
                    <ErrorDetail title={BLOCKER_TITLES[serverError.code]} message={serverError.message} />
                    {serverError.code === 'ALREADY_REGISTERED' && (
                      <Link to="/my-reservations" style={{ fontWeight: 650 }}>
                        Go to My Reservations
                      </Link>
                    )}
                  </div>
                </div>
              )}

              <div className="form-grid form-grid-2">
                <TextField
                  id="field-fullName"
                  label="Full Name"
                  required
                  autoComplete="name"
                  value={values.fullName}
                  onChange={(e) => set('fullName')(e.target.value)}
                  error={errors.fullName}
                  readOnly={Boolean(profile)}
                  className="span-2"
                />
                <TextField
                  id="field-studentId"
                  label="Student ID"
                  required
                  autoComplete="off"
                  placeholder="e.g. 20231045"
                  value={values.studentId}
                  onChange={(e) => set('studentId')(e.target.value)}
                  error={errors.studentId}
                  readOnly={Boolean(profile)}
                />
                <TextField
                  id="field-major"
                  label="Major"
                  required
                  list="major-suggestions"
                  autoComplete="off"
                  placeholder="e.g. Computer Science"
                  value={values.major}
                  onChange={(e) => set('major')(e.target.value)}
                  error={errors.major}
                />
                <datalist id="major-suggestions">
                  {(config?.majorSuggestions ?? []).map((major) => (
                    <option key={major} value={major} />
                  ))}
                </datalist>
                <SelectField
                  id="field-academicLevel"
                  label="Academic Level"
                  required
                  value={values.academicLevel}
                  onChange={(e) => set('academicLevel')(e.target.value)}
                  error={errors.academicLevel}
                >
                  <option value="" disabled>
                    Select your level
                  </option>
                  {(config?.academicLevels ?? []).map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </SelectField>
                <TextField
                  id="field-phone"
                  label="Phone Number"
                  required
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="01X XXXX XXXX"
                  value={values.phone}
                  onChange={(e) => set('phone')(e.target.value)}
                  error={errors.phone}
                />
                <TextField
                  id="field-email"
                  label="University Email"
                  required
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder={domains[0] ? `name@${domains[0]}` : 'name@university.edu'}
                  value={values.email}
                  onChange={(e) => set('email')(e.target.value)}
                  error={errors.email}
                  hint={domains[0] ? `Use your @${domains[0]} address.` : undefined}
                  readOnly={Boolean(profile)}
                  className="span-2"
                />
              </div>

              {!profile && (
                <label className="checkbox">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                  <span>Remember my details on this device</span>
                </label>
              )}

              <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={reserve.isPending || Boolean(finalError)}>
                {reserve.isPending ? (
                  <>
                    <span className="spinner" aria-hidden /> Submitting…
                  </>
                ) : (
                  'Submit Reservation'
                )}
              </button>
              <p className="muted" style={{ fontSize: '0.8rem', textAlign: 'center' }}>
                Can't make it after all? Cancel from My Reservations before the activity starts so someone else can take your seat.
              </p>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

/** The API message often starts with the same headline ("Fully Booked: …"); show only the extra detail. */
function ErrorDetail({ title, message }: { title?: string; message: string }) {
  const detail = title && message.startsWith(title) ? message.slice(title.length).replace(/^[:.\s]+/, '') : message;
  return detail ? <div>{detail}</div> : null;
}

function SummaryItem({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <li>
      <Icon size={17} />
      <span>
        <span className="label">{label}</span>
        <span className="value">{value}</span>
      </span>
    </li>
  );
}

function Blocker({
  icon: Icon,
  tone,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  tone: 'success' | 'warning' | 'danger' | 'info';
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="blocker" role="status">
      <span className="blocker-icon" style={{ background: `var(--${tone}-bg)`, color: `var(--${tone})` }}>
        <Icon size={30} />
      </span>
      <h2>{title}</h2>
      <p className="muted">{body}</p>
      {action}
    </div>
  );
}

function UnavailablePanel({ activity }: { activity: ActivityDTO }) {
  const browse = (
    <Link to={browseLink(activity)} className="btn btn-primary">
      Browse other activities
    </Link>
  );
  switch (activity.status) {
    case 'full':
      return (
        <Blocker
          icon={Users}
          tone="warning"
          title="Fully Booked"
          body={`All ${activity.capacity} seats are taken. Seats can free up if someone cancels, so check back before registration closes.`}
          action={browse}
        />
      );
    case 'registration_closed':
      return (
        <Blocker
          icon={Hourglass}
          tone="info"
          title="Registration Closed"
          body={`Registration for this activity closed ${formatDeadline(activity.registrationDeadline)}.`}
          action={browse}
        />
      );
    case 'cancelled':
      return <Blocker icon={Ban} tone="danger" title="Activity cancelled" body="This activity has been cancelled." action={browse} />;
    default:
      return (
        <Blocker icon={CalendarDays} tone="info" title="Activity completed" body="This activity has already taken place." action={browse} />
      );
  }
}
