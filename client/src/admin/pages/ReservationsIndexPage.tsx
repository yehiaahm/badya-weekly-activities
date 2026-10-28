import { Download, Search, Ticket } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toLocalDateTime } from '@shared/dates.ts';
import { formatDeadline, formatShortDate, formatTimeRange } from '@shared/format.ts';
import { EmptyState, ErrorState, LoadingState, MonthSwitcher, SeatMeter, StatusBadge } from '../../components/ui.tsx';
import { CategoryAvatar } from '../../lib/categories.tsx';
import { useUniversityNow } from '../../lib/time.ts';
import { PageHeader } from '../AdminLayout.tsx';
import { useAdminActivities } from '../queries.ts';
import { useAdminMonth } from '../useAdminMonth.ts';

type Scope = 'upcoming' | 'past' | 'all';

export function ReservationsIndexPage() {
  const [month, setMonth] = useAdminMonth();
  const activitiesQuery = useAdminActivities(month);
  const navigate = useNavigate();
  const now = useUniversityNow();
  const [scope, setScope] = useState<Scope>('upcoming');
  const [search, setSearch] = useState('');

  const rows = (activitiesQuery.data?.activities ?? [])
    .filter((activity) => activity.status !== 'draft')
    .filter((activity) => {
      const ended = toLocalDateTime(activity.date, activity.endTime) <= now;
      return scope === 'all' || (scope === 'past' ? ended : !ended);
    })
    .filter((activity) => !search || activity.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <>
      <PageHeader
        title="Reservations"
        description="Choose an activity to see who registered, cancel reservations, add students or export the list."
        actions={
          <>
            <a className="btn" href="/api/admin/reservations/export.xlsx" download>
              <Download size={16} /> Download Excel (all bookings)
            </a>
            <MonthSwitcher month={month} onChange={setMonth} />
          </>
        }
      />
      <section className="card">
        <div className="toolbar">
          <div className="tabs" role="tablist" aria-label="Which activities">
            {(['upcoming', 'past', 'all'] as const).map((value) => (
              <button key={value} type="button" role="tab" className="tab" aria-selected={scope === value} onClick={() => setScope(value)}>
                {value === 'upcoming' ? 'Upcoming' : value === 'past' ? 'Past' : 'All'}
              </button>
            ))}
          </div>
          <div className="search-input">
            <Search size={16} />
            <input className="input" placeholder="Search activities" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search activities" />
          </div>
        </div>
        {activitiesQuery.isPending ? (
          <LoadingState />
        ) : activitiesQuery.error ? (
          <ErrorState error={activitiesQuery.error} onRetry={() => void activitiesQuery.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Ticket} title="No activities here">
            Published activities for this month will appear here.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>Date & time</th>
                  <th className="num">Capacity</th>
                  <th className="num">Registered</th>
                  <th className="num">Available</th>
                  <th>Registration deadline</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((activity) => (
                  <tr
                    key={activity.id}
                    className="is-clickable"
                    onClick={() => navigate(`/admin/activities/${activity.id}/reservations?month=${month}`)}
                  >
                    <td>
                      <div className="row">
                        <CategoryAvatar category={activity.category} size={34} />
                        <div>
                          <a
                            href={`/admin/activities/${activity.id}/reservations?month=${month}`}
                            className="cell-title"
                            onClick={(event) => event.preventDefault()}
                          >
                            {activity.name}
                          </a>
                          <div className="cell-sub">{activity.location}</div>
                        </div>
                      </div>
                    </td>
                    <td className="nowrap">
                      <div className="cell-title">{formatShortDate(activity.date)}</div>
                      <div className="cell-sub">{formatTimeRange(activity.startTime, activity.endTime)}</div>
                    </td>
                    <td className="num">{activity.capacity}</td>
                    <td className="num">
                      <div className="mini-meter" style={{ justifyContent: 'flex-end', minWidth: 110 }}>
                        <SeatMeter registered={activity.registeredCount} capacity={activity.capacity} />
                        <span className="count">{activity.registeredCount}</span>
                      </div>
                    </td>
                    <td className="num">{activity.availableSeats}</td>
                    <td className="nowrap cell-sub">{formatDeadline(activity.registrationDeadline)}</td>
                    <td>
                      <StatusBadge status={activity.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
