import { CalendarDays, CalendarPlus, Clock, KeyRound, LogOut, Mail, MapPin, Ticket, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { formatFullDate, formatTimeRange } from '@shared/format.ts';
import type { MyReservationDTO } from '@shared/types.ts';
import { emailSchema } from '@shared/validation.ts';
import { useConfirm, useToast } from '../components/feedback.tsx';
import { AttendanceBadge, EmptyState, ErrorState, LoadingState, StatusBadge, TextField } from '../components/ui.tsx';
import { errorMessage } from '../lib/api.ts';
import { CategoryAvatar } from '../lib/categories.tsx';
import { downloadCalendarEvent } from '../lib/ics.ts';
import {
  useCancelMyReservation,
  useConfig,
  useMyReservations,
  useRequestCode,
  useSession,
  useStudentLogout,
  useVerifyCode,
} from '../lib/queries.ts';
import { readJson, STORAGE_KEYS } from '../lib/storage.ts';
import { DEFAULT_TIME_ZONE } from '../lib/time.ts';

export function MyReservationsPage() {
  const session = useSession();
  if (session.isPending) return <LoadingState />;
  if (session.error) {
    return (
      <div className="container page">
        <ErrorState error={session.error} onRetry={() => void session.refetch()} />
      </div>
    );
  }
  return (
    <div className="container page narrow">
      {session.data?.student?.student ? <ReservationList /> : <VerifyEmail />}
    </div>
  );
}

// ----------------------------------------------------------------- verify

function VerifyEmail() {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(() => readJson<string>(STORAGE_KEYS.lastEmail, 'session') ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [devCode, setDevCode] = useState<string | undefined>();
  const requestCode = useRequestCode();
  const verify = useVerifyCode();

  const sendCode = (event?: FormEvent) => {
    event?.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    requestCode.mutate(parsed.data, {
      onSuccess: (result) => {
        setEmail(parsed.data);
        setDevCode(result.devCode);
        setCode('');
        setStep('code');
      },
      onError: (err) => setError(errorMessage(err)),
    });
  };

  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setError(undefined);
    verify.mutate({ email, code }, { onError: (err) => setError(errorMessage(err)) });
  };

  return (
    <div className="card card-pad verify-card stack">
      <span className="blocker-icon" style={{ background: 'var(--brand-50)', color: 'var(--brand-700)' }} aria-hidden>
        {step === 'email' ? <Ticket size={28} /> : <KeyRound size={28} />}
      </span>
      {step === 'email' ? (
        <form className="stack" onSubmit={sendCode} noValidate>
          <div>
            <h1>My Reservations</h1>
            <p className="muted" style={{ marginTop: 6 }}>
              To keep your reservations private, we'll email a one-time code to the university email you reserved with.
            </p>
          </div>
          <TextField
            label="University Email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error}
            required
          />
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={requestCode.isPending}>
            {requestCode.isPending ? <span className="spinner" aria-hidden /> : <Mail size={18} />} Email me a code
          </button>
        </form>
      ) : (
        <form className="stack" onSubmit={submitCode} noValidate>
          <div>
            <h1>Check your email</h1>
            <p className="muted" style={{ marginTop: 6 }}>
              If <strong>{email}</strong> has reservations, a 6-digit code is on its way. It expires in 10 minutes.
            </p>
          </div>
          {devCode && (
            <div className="dev-code">
              <span>
                Development mode — your code is <span className="mono">{devCode}</span>
              </span>
              <button type="button" className="btn btn-sm" onClick={() => setCode(devCode)}>
                Use code
              </button>
            </div>
          )}
          <TextField
            label="6-digit code"
            className="code-field"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            error={error}
            required
            style={{ fontFamily: 'var(--font-mono)', fontSize: '1.4rem', letterSpacing: '0.4em', textAlign: 'center' }}
          />
          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={verify.isPending}>
            {verify.isPending && <span className="spinner" aria-hidden />} Verify & continue
          </button>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('email')}>
              Use a different email
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => sendCode()} disabled={requestCode.isPending}>
              Resend code
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- list

function ReservationList() {
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming');
  const reservations = useMyReservations(true);
  const logout = useStudentLogout();

  if (reservations.isPending) return <LoadingState label="Loading your reservations…" />;
  if (reservations.error) return <ErrorState error={reservations.error} onRetry={() => void reservations.refetch()} />;

  const { student } = reservations.data;
  const all = reservations.data.reservations;
  const upcoming = all
    .filter((r) => r.status === 'confirmed' && r.activity.status !== 'completed' && r.activity.status !== 'cancelled')
    .sort((a, b) => `${a.activity.date}${a.activity.startTime}`.localeCompare(`${b.activity.date}${b.activity.startTime}`));
  const history = all.filter((r) => !upcoming.includes(r));
  const shown = tab === 'upcoming' ? upcoming : history;
  const initials = student.name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('');

  return (
    <div className="stack">
      <h1>My Reservations</h1>
      <div className="card profile-bar">
        <span className="avatar" aria-hidden>
          {initials}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 750 }}>{student.name}</div>
          <div className="muted" style={{ fontSize: '0.85rem', overflowWrap: 'anywhere' }}>
            {student.studentId} · {student.email}
          </div>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
          <LogOut size={15} /> Sign out
        </button>
      </div>

      <div className="tabs" role="tablist" aria-label="Reservations">
        <button type="button" role="tab" className="tab" aria-selected={tab === 'upcoming'} onClick={() => setTab('upcoming')}>
          Upcoming ({upcoming.length})
        </button>
        <button type="button" role="tab" className="tab" aria-selected={tab === 'history'} onClick={() => setTab('history')}>
          Past & cancelled ({history.length})
        </button>
      </div>

      <div className="card">
        {shown.length === 0 ? (
          <EmptyState
            icon={Ticket}
            title={tab === 'upcoming' ? 'No upcoming reservations' : 'Nothing here yet'}
            action={
              tab === 'upcoming' && (
                <Link to="/" className="btn btn-primary">
                  Browse activities
                </Link>
              )
            }
          >
            {tab === 'upcoming' ? 'Find an activity you like and reserve your spot.' : 'Past and cancelled reservations will show up here.'}
          </EmptyState>
        ) : (
          shown.map((reservation) => <ReservationItem key={reservation.id} reservation={reservation} />)
        )}
      </div>
    </div>
  );
}

function ReservationItem({ reservation }: { reservation: MyReservationDTO }) {
  const { activity } = reservation;
  const confirm = useConfirm();
  const toast = useToast();
  const cancel = useCancelMyReservation();
  const timeZone = useConfig().data?.timeZone ?? DEFAULT_TIME_ZONE;
  const isPast = activity.status === 'completed';

  const onCancel = async () => {
    const ok = await confirm({
      title: 'Cancel this reservation?',
      message: `${activity.name} on ${formatFullDate(activity.date)}. Your seat will be released for other students.`,
      confirmLabel: 'Cancel reservation',
      cancelLabel: 'Keep it',
      tone: 'danger',
    });
    if (!ok) return;
    cancel.mutate(reservation.id, {
      onSuccess: () => toast.success('Reservation cancelled'),
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  return (
    <article className="reservation-item">
      <CategoryAvatar category={activity.category} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row row-wrap" style={{ justifyContent: 'space-between' }}>
          <h3>
            <Link to={`/activities/${activity.id}`} style={{ color: 'inherit' }}>
              {activity.name}
            </Link>
          </h3>
          <div className="row">
            {reservation.status === 'cancelled' ? (
              <span className="badge badge-neutral">Reservation cancelled</span>
            ) : activity.status === 'cancelled' ? (
              <StatusBadge status="cancelled" audience="student" />
            ) : isPast ? (
              <AttendanceBadge status={reservation.attendance} />
            ) : (
              <span className="badge badge-success badge-dot">Confirmed</span>
            )}
          </div>
        </div>
        <div className="meta">
          <span>
            <CalendarDays size={14} /> {formatFullDate(activity.date)}
          </span>
          <span>
            <Clock size={14} /> {formatTimeRange(activity.startTime, activity.endTime)}
          </span>
          <span>
            <MapPin size={14} /> {activity.location}
          </span>
          <span>
            <Ticket size={14} /> <span className="mono">{reservation.code}</span>
          </span>
        </div>
        {reservation.status === 'confirmed' && !isPast && activity.status !== 'cancelled' && (
          <div className="reservation-item-actions">
            <button type="button" className="btn btn-sm" onClick={() => downloadCalendarEvent(activity, reservation.code, timeZone)}>
              <CalendarPlus size={15} /> Add to calendar
            </button>
            {reservation.canCancel && (
              <button type="button" className="btn btn-sm btn-danger-soft" onClick={onCancel} disabled={cancel.isPending}>
                <X size={15} /> Cancel reservation
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
