import { CalendarPlus, Check, Copy, Mail, Ticket } from 'lucide-react';
import { Link, Navigate, useLocation } from 'react-router';
import { formatFullDate, formatTimeRange } from '@shared/format.ts';
import type { ReservationConfirmationDTO } from '@shared/types.ts';
import { useToast } from '../components/feedback.tsx';
import { downloadCalendarEvent } from '../lib/ics.ts';
import { useConfig } from '../lib/queries.ts';
import { readJson, STORAGE_KEYS } from '../lib/storage.ts';
import { DEFAULT_TIME_ZONE } from '../lib/time.ts';
import { browseLink } from './ActivityDetailPage.tsx';

export function ConfirmationPage() {
  const location = useLocation();
  const toast = useToast();
  const timeZone = useConfig().data?.timeZone ?? DEFAULT_TIME_ZONE;
  const confirmation =
    (location.state as ReservationConfirmationDTO | null) ??
    readJson<ReservationConfirmationDTO>(STORAGE_KEYS.lastConfirmation, 'session');

  if (!confirmation) return <Navigate to="/my-reservations" replace />;
  const { reservation, activity, student } = confirmation;
  const firstName = student.name.split(' ')[0];

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(reservation.code);
      toast.success('Reservation ID copied');
    } catch {
      toast.info(`Your Reservation ID is ${reservation.code}`);
    }
  };

  return (
    <div className="container page">
      <div className="confirm-wrap card">
        <div className="confirm-hero">
          <span className="confirm-check" aria-hidden>
            <Check size={36} strokeWidth={3} />
          </span>
          <h1>Reservation Confirmed ✓</h1>
          <p className="muted">
            You're all set, {firstName}! Your spot for <strong>{activity.name}</strong> is reserved.
          </p>
        </div>

        <div className="confirm-details">
          <dl className="kv">
            <dt>Student name</dt>
            <dd>{student.name}</dd>
            <dt>Activity</dt>
            <dd>{activity.name}</dd>
            <dt>Date</dt>
            <dd>{formatFullDate(activity.date)}</dd>
            <dt>Time</dt>
            <dd>{formatTimeRange(activity.startTime, activity.endTime)}</dd>
            <dt>Location</dt>
            <dd>{activity.location}</dd>
          </dl>

          <div className="stack stack-sm" style={{ alignItems: 'center', padding: '6px 0 18px' }}>
            <span className="muted" style={{ fontSize: '0.8rem', fontWeight: 650 }}>
              Reservation ID
            </span>
            <button type="button" className="code-box" onClick={copyCode} title="Copy Reservation ID">
              {reservation.code} <Copy size={16} />
            </button>
          </div>

          <div className="alert alert-success" style={{ marginBottom: 18 }}>
            <Mail size={20} />
            <div>
              <div className="alert-title">What happens next</div>
              A confirmation has been sent to <strong>{student.email}</strong>. Please arrive 10 minutes early and show your
              Reservation ID to the coach. If your plans change, cancel from My Reservations before the activity starts so
              another student can take your seat.
            </div>
          </div>

          <div className="confirm-actions">
            <button type="button" className="btn" onClick={() => downloadCalendarEvent(activity, reservation.code, timeZone)}>
              <CalendarPlus size={17} /> Add to calendar
            </button>
            <Link to="/my-reservations" className="btn">
              <Ticket size={17} /> My Reservations
            </Link>
            <Link to={browseLink(activity)} className="btn btn-primary">
              Browse more activities
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
