import { ClipboardCheck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { formatShortDate, formatTimeRange } from '@shared/format.ts';
import type { AdminActivityDTO } from '@shared/types.ts';
import { EmptyState, ErrorState, LoadingState, MonthSwitcher, StatusBadge } from '../../components/ui.tsx';
import { CategoryAvatar } from '../../lib/categories.tsx';
import { useToday } from '../../lib/time.ts';
import { PageHeader } from '../AdminLayout.tsx';
import { useAdminActivities } from '../queries.ts';
import { useAdminMonth } from '../useAdminMonth.ts';

const marked = (a: AdminActivityDTO) => a.presentCount + a.absentCount;

export function AttendanceIndexPage() {
  const [month, setMonth] = useAdminMonth();
  const activitiesQuery = useAdminActivities(month);
  const navigate = useNavigate();
  const today = useToday();
  const [pendingOnly, setPendingOnly] = useState(false);

  // Attendance opens on the day of the activity.
  const rows = (activitiesQuery.data?.activities ?? [])
    .filter((a) => a.date <= today && a.status !== 'draft' && a.status !== 'cancelled')
    .filter((a) => !pendingOnly || marked(a) < a.registeredCount)
    .sort((a, b) => `${b.date}${b.startTime}`.localeCompare(`${a.date}${a.startTime}`));

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Mark registered students as present or absent once an activity takes place."
        actions={<MonthSwitcher month={month} onChange={setMonth} />}
      />
      <section className="card">
        <div className="toolbar">
          <div className="tabs" role="tablist" aria-label="Filter">
            <button type="button" role="tab" className="tab" aria-selected={!pendingOnly} onClick={() => setPendingOnly(false)}>
              All held activities
            </button>
            <button type="button" role="tab" className="tab" aria-selected={pendingOnly} onClick={() => setPendingOnly(true)}>
              Needs attendance
            </button>
          </div>
        </div>
        {activitiesQuery.isPending ? (
          <LoadingState />
        ) : activitiesQuery.error ? (
          <ErrorState error={activitiesQuery.error} onRetry={() => void activitiesQuery.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title={pendingOnly ? 'All attendance is recorded' : 'No activities held yet this month'}>
            Activities show up here from the day they take place.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>Date & time</th>
                  <th className="num">Registered</th>
                  <th className="num">Present</th>
                  <th className="num">Absent</th>
                  <th>Progress</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((activity) => {
                  const done = marked(activity);
                  const complete = activity.registeredCount > 0 && done >= activity.registeredCount;
                  return (
                    <tr
                      key={activity.id}
                      className="is-clickable"
                      onClick={() => navigate(`/admin/activities/${activity.id}/attendance?month=${month}`)}
                    >
                      <td>
                        <div className="row">
                          <CategoryAvatar category={activity.category} size={34} />
                          <div>
                            <div className="cell-title">{activity.name}</div>
                            <div className="cell-sub">{activity.location}</div>
                          </div>
                        </div>
                      </td>
                      <td className="nowrap">
                        <div className="cell-title">{formatShortDate(activity.date)}</div>
                        <div className="cell-sub">{formatTimeRange(activity.startTime, activity.endTime)}</div>
                      </td>
                      <td className="num">{activity.registeredCount}</td>
                      <td className="num">{activity.presentCount}</td>
                      <td className="num">{activity.absentCount}</td>
                      <td>
                        {activity.registeredCount === 0 ? (
                          <span className="muted">No students</span>
                        ) : complete ? (
                          <span className="badge badge-success">Recorded</span>
                        ) : (
                          <span className="badge badge-warning">
                            {done}/{activity.registeredCount} marked
                          </span>
                        )}
                      </td>
                      <td>
                        <StatusBadge status={activity.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
