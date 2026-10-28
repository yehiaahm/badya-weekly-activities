import { ArrowLeft, CalendarDays, CircleCheck, Clock, Hourglass, MapPin, SearchX, UserRound } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { formatDeadline, formatFullDate, formatTimeRange } from '@shared/format.ts';
import { STUDENT_STATUS_LABELS } from '@shared/status.ts';
import type { ActivityDTO } from '@shared/types.ts';
import { EmptyState, ErrorState, LoadingState, SeatMeter, StatusBadge } from '../components/ui.tsx';
import { ApiError } from '../lib/api.ts';
import { CategoryAvatar, CategoryPill, categoryVars } from '../lib/categories.tsx';
import { useConfig, useMyReservations, usePublicActivity, useSession } from '../lib/queries.ts';
import { currentWeekStart } from '../lib/weeks.ts';
import { seatsText } from './ActivityCard.tsx';

export function browseLink(activity: Pick<ActivityDTO, 'date'>): string {
  return `/?month=${activity.date.slice(0, 7)}&week=${currentWeekStart(activity.date)}`;
}

export function ActivityDetailPage() {
  const id = Number(useParams().id);
  const activityQuery = usePublicActivity(id);
  const config = useConfig().data;
  const session = useSession();
  const mine = useMyReservations(Boolean(session.data?.student?.student));

  if (activityQuery.isPending) return <LoadingState label="Loading activity…" />;
  if (activityQuery.error) {
    const missing = activityQuery.error instanceof ApiError && activityQuery.error.status === 404;
    return (
      <div className="container page">
        {missing ? (
          <EmptyState
            icon={SearchX}
            title="Activity not found"
            action={
              <Link to="/" className="btn btn-primary">
                Browse activities
              </Link>
            }
          >
            It may have been removed or is not published yet.
          </EmptyState>
        ) : (
          <ErrorState error={activityQuery.error} onRetry={() => void activityQuery.refetch()} />
        )}
      </div>
    );
  }

  const activity = activityQuery.data;
  const registered = (mine.data?.reservations ?? []).some((r) => r.activity.id === activity.id && r.status === 'confirmed');
  const seats = seatsText(activity);
  const leadHours = config?.registrationLeadHours ?? 24;

  const cta = registered ? (
    <Link to="/my-reservations" className="btn btn-lg btn-block">
      <CircleCheck size={18} /> You're registered
    </Link>
  ) : activity.canReserve ? (
    <Link to={`/activities/${activity.id}/reserve`} className="btn btn-primary btn-lg btn-block">
      Reserve Your Spot
    </Link>
  ) : (
    <button type="button" className="btn btn-lg btn-block" disabled>
      {activity.status === 'full' ? 'Fully Booked' : STUDENT_STATUS_LABELS[activity.status]}
    </button>
  );

  return (
    <div className="container page has-sticky-cta">
      <Link to={browseLink(activity)} className="back-link">
        <ArrowLeft size={16} /> All activities
      </Link>

      <div className="detail-layout">
        <article className="card" style={categoryVars(activity.category)}>
          <div className="detail-hero">
            <div className="row row-wrap">
              <CategoryAvatar category={activity.category} size={44} />
              <CategoryPill category={activity.category} />
              <StatusBadge status={activity.status} audience="student" />
            </div>
            <h1>{activity.name}</h1>
          </div>

          <div className="detail-facts">
            <Fact icon={CalendarDays} label="Date" value={formatFullDate(activity.date)} />
            <Fact icon={Clock} label="Time" value={formatTimeRange(activity.startTime, activity.endTime)} />
            <Fact icon={MapPin} label="Location" value={activity.location} />
            <Fact icon={UserRound} label="Coach / staff" value={activity.coach} />
          </div>

          {activity.description && <p className="detail-description">{activity.description}</p>}
        </article>

        <aside className="detail-aside">
          <div className="card card-pad stack cta-panel">
            <div>
              <div className="seats-big">
                <strong className="tabular">{activity.availableSeats}</strong>
                <span className="muted">of {activity.capacity} seats available</span>
              </div>
              {(activity.status !== 'published' || seats.tone) && (
                <div className={`seats-label ${seats.tone}`} style={{ marginBottom: 8 }}>
                  {seats.text}
                </div>
              )}
              <SeatMeter
                registered={activity.registeredCount}
                capacity={activity.capacity}
                muted={activity.status === 'completed' || activity.status === 'cancelled'}
              />
            </div>

            <div className="deadline-note">
              <Hourglass size={16} />
              <span>
                {activity.status === 'published' || activity.status === 'full' ? (
                  <>
                    Registration closes <strong>{formatDeadline(activity.registrationDeadline)}</strong>.
                  </>
                ) : activity.status === 'registration_closed' ? (
                  <>
                    <strong>Registration Closed.</strong> The deadline was {formatDeadline(activity.registrationDeadline)}.
                  </>
                ) : activity.status === 'cancelled' ? (
                  <strong>This activity has been cancelled.</strong>
                ) : (
                  <strong>This event has ended. Registration is closed.</strong>
                )}
                {activity.status !== 'completed' && activity.status !== 'cancelled' && (
                  <> Reservations close {leadHours} working hours before the start — Fridays and Saturdays don't count.</>
                )}
              </span>
            </div>

            <div className="aside-cta">{cta}</div>
          </div>
        </aside>
      </div>

      <div className="sticky-cta">{cta}</div>
    </div>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return (
    <div className="fact">
      <span className="fact-icon" aria-hidden>
        <Icon size={18} />
      </span>
      <div>
        <div className="fact-label">{label}</div>
        <div className="fact-value">{value}</div>
      </div>
    </div>
  );
}
