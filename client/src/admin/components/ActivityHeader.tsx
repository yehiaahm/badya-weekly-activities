import { ArrowLeft, CalendarDays, Clock, MapPin, UserRound } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { formatFullDate, formatTimeRange } from '@shared/format.ts';
import type { AdminActivityDTO } from '@shared/types.ts';
import { StatusBadge } from '../../components/ui.tsx';
import { CategoryAvatar, CategoryPill } from '../../lib/categories.tsx';

export function ActivityHeader({ activity, back }: { activity: AdminActivityDTO; back: { to: string; label: string } }) {
  const month = activity.date.slice(0, 7);
  return (
    <div className="stack" style={{ marginBottom: 20 }}>
      <Link to={`${back.to}?month=${month}`} className="back-link" style={{ marginBottom: 0 }}>
        <ArrowLeft size={16} /> {back.label}
      </Link>
      <div className="card">
        <div className="activity-header">
          <CategoryAvatar category={activity.category} size={48} />
          <div className="activity-header-main">
            <div className="row row-wrap">
              <h1 style={{ fontSize: '1.45rem' }}>{activity.name}</h1>
              <StatusBadge status={activity.status} />
            </div>
            <div className="meta">
              <span>
                <CalendarDays size={15} /> {formatFullDate(activity.date)}
              </span>
              <span>
                <Clock size={15} /> {formatTimeRange(activity.startTime, activity.endTime)}
              </span>
              <span>
                <MapPin size={15} /> {activity.location}
              </span>
              <span>
                <UserRound size={15} /> {activity.coach}
              </span>
            </div>
          </div>
          <CategoryPill category={activity.category} />
        </div>
        <nav className="subnav" aria-label="Activity sections">
          <NavLink to={`/admin/activities/${activity.id}/reservations?month=${month}`}>Reservations</NavLink>
          <NavLink to={`/admin/activities/${activity.id}/attendance?month=${month}`}>Attendance</NavLink>
        </nav>
      </div>
    </div>
  );
}
