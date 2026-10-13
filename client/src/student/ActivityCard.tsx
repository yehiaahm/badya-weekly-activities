import { ArrowRight, CalendarDays, CircleCheck, Clock, Hourglass, MapPin } from 'lucide-react';
import { Link } from 'react-router';
import { formatDayDate, formatShortDate, formatTime, formatTimeRange } from '@shared/format.ts';
import { STUDENT_STATUS_LABELS } from '@shared/status.ts';
import type { ActivityDTO } from '@shared/types.ts';
import { StatusBadge, SeatMeter } from '../components/ui.tsx';
import { CategoryPill, categoryVars } from '../lib/categories.tsx';

export function seatsText(activity: ActivityDTO): { text: string; tone: '' | 'is-low' | 'is-full' } {
  switch (activity.status) {
    case 'published': {
      const seats = activity.availableSeats;
      if (seats <= 3) return { text: seats === 1 ? 'Only 1 seat left' : `Only ${seats} seats left`, tone: 'is-low' };
      return { text: `${seats} seats available`, tone: '' };
    }
    case 'full':
      return { text: 'Fully Booked', tone: 'is-full' };
    default:
      return { text: STUDENT_STATUS_LABELS[activity.status], tone: '' };
  }
}

export function ActivityCard({ activity, registered }: { activity: ActivityDTO; registered: boolean }) {
  const seats = seatsText(activity);
  const inactive = activity.status === 'completed' || activity.status === 'cancelled';
  const deadline = activity.registrationDeadline;

  return (
    <article className={`activity-card is-${activity.status}`} style={categoryVars(activity.category)}>
      <div className="activity-card-top">
        <CategoryPill category={activity.category} />
        <StatusBadge status={activity.status} audience="student" />
      </div>

      <h3>
        <Link to={`/activities/${activity.id}`} className="stretched-link">
          {activity.name}
        </Link>
      </h3>

      <ul className="activity-facts">
        <li>
          <CalendarDays size={16} /> {formatDayDate(activity.date)}
        </li>
        <li>
          <Clock size={16} /> {formatTimeRange(activity.startTime, activity.endTime)}
        </li>
        <li>
          <MapPin size={16} /> {activity.location}
        </li>
      </ul>

      <div className="seats">
        <SeatMeter registered={activity.registeredCount} capacity={activity.capacity} muted={inactive} />
        <div className={`seats-label ${seats.tone}`}>
          <span>{seats.text}</span>
          <span className="muted tabular">
            {activity.registeredCount}/{activity.capacity}
          </span>
        </div>
        {activity.status === 'published' && (
          <span className="card-deadline">
            <Hourglass size={13} /> Registration closes {formatShortDate(deadline.slice(0, 10))}, {formatTime(deadline.slice(11))}
          </span>
        )}
      </div>

      <div className="card-cta">
        {registered ? (
          <div className="registered-note">
            <CircleCheck size={18} /> You're registered
          </div>
        ) : activity.canReserve ? (
          <Link to={`/activities/${activity.id}/reserve`} className="btn btn-primary btn-block">
            Reserve Your Spot <ArrowRight size={17} />
          </Link>
        ) : (
          <button type="button" className="btn btn-block" disabled>
            {activity.status === 'full' ? 'Fully Booked' : STUDENT_STATUS_LABELS[activity.status]}
          </button>
        )}
      </div>
    </article>
  );
}
