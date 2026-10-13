import {
  CalendarDays,
  ChartColumn,
  ClipboardCheck,
  Gauge,
  ListChecks,
  Send,
  Ticket,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { Link } from 'react-router';
import { formatMonth, formatShortDate, formatTimeRange } from '@shared/format.ts';
import type { AdminActivityDTO } from '@shared/types.ts';
import { EmptyState, ErrorState, LoadingState, MonthSwitcher, SeatMeter, StatusBadge } from '../../components/ui.tsx';
import { CategoryAvatar } from '../../lib/categories.tsx';
import { PageHeader } from '../AdminLayout.tsx';
import { useDashboard } from '../queries.ts';
import { useAdminMonth } from '../useAdminMonth.ts';

export function DashboardPage() {
  const [month, setMonth] = useAdminMonth();
  const dashboard = useDashboard(month);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Overview of ${formatMonth(month)}`}
        actions={
          <>
            <MonthSwitcher month={month} onChange={setMonth} />
            <Link to={`/admin/calendar?month=${month}`} className="btn btn-primary">
              <CalendarDays size={17} /> Monthly calendar
            </Link>
          </>
        }
      />
      {dashboard.isPending ? (
        <LoadingState />
      ) : dashboard.error ? (
        <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
      ) : (
        <DashboardBody data={dashboard.data} month={month} />
      )}
    </>
  );
}

function DashboardBody({ data, month }: { data: NonNullable<ReturnType<typeof useDashboard>['data']>; month: string }) {
  const { counts, workflow, attention } = data;
  const fill = data.capacity ? Math.round((data.reservations / data.capacity) * 100) : 0;

  const steps = [
    { title: 'Select month', detail: formatMonth(month), done: true },
    { title: 'Create calendar', detail: `${workflow.created} activities`, done: workflow.created > 0 },
    {
      title: 'Publish',
      detail: counts.draft ? `${counts.draft} draft${counts.draft === 1 ? '' : 's'} left` : `${workflow.published} published`,
      done: workflow.created > 0 && counts.draft === 0,
    },
    { title: 'Students reserve', detail: `${workflow.reservations} reservations`, done: workflow.reservations > 0 },
    { title: 'Monitor', detail: `${counts.full} full · ${attention.closingSoonLowFill.length} low`, done: workflow.reservations > 0 },
    {
      title: 'Record attendance',
      detail: `${workflow.attendanceRecorded}/${workflow.pastActivities} recorded`,
      done: workflow.pastActivities > 0 && workflow.attendanceRecorded === workflow.pastActivities,
    },
    { title: 'Reports', detail: 'Update automatically', done: workflow.attendanceRecorded > 0 },
  ];
  const activeIndex = steps.findIndex((step) => !step.done);

  return (
    <div className="stack stack-lg">
      <div className="stat-grid">
        <Stat icon={ListChecks} label="Activities" value={counts.total} sub={`${workflow.published} published · ${counts.draft} drafts`} />
        <Stat icon={Ticket} label="Reservations" value={data.reservations} sub={`${fill}% of ${data.capacity} seats filled`} />
        <Stat icon={Users} label="Full activities" value={counts.full} sub={`${counts.registration_closed} closed for registration`} />
        <Stat
          icon={ClipboardCheck}
          label="Attendance recorded"
          value={`${workflow.attendanceRecorded}/${workflow.pastActivities}`}
          sub="finished activities with students"
        />
      </div>

      <section className="card">
        <div className="card-header">
          <h2>Monthly workflow</h2>
          <Link to={`/admin/reports?month=${month}`} className="btn btn-sm">
            <ChartColumn size={15} /> Reports
          </Link>
        </div>
        <ol className="workflow" style={{ margin: 0, listStyle: 'none' }}>
          {steps.map((step, index) => (
            <li
              key={step.title}
              className={`workflow-step ${step.done ? 'is-done' : ''} ${index === activeIndex ? 'is-active' : ''}`}
            >
              <span className="step-index">{step.done ? '✓' : index + 1}</span>
              <strong>{step.title}</strong>
              <span className="detail">{step.detail}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="section-grid section-grid-2">
        <div className="stack">
          <ActivityList title="Today" empty="No activities today." activities={data.todayActivities} month={month} showAttendance />
          <ActivityList title="Coming up (next 7 days)" empty="Nothing scheduled in the next 7 days." activities={data.upcoming} month={month} />
        </div>

        <section className="card">
          <div className="card-header">
            <h2>Needs attention</h2>
          </div>
          <ul className="list">
            {attention.drafts > 0 && (
              <li>
                <Link to={`/admin/calendar?month=${month}`} className="list-item">
                  <span className="cat-avatar" style={{ ['--cat' as string]: 'var(--violet)' }}>
                    <Send size={18} />
                  </span>
                  <span className="list-item-main">
                    <span className="list-item-title">
                      {attention.drafts} draft{attention.drafts === 1 ? '' : 's'} not published
                    </span>
                    <span className="list-item-sub">Students can't see drafts yet</span>
                  </span>
                </Link>
              </li>
            )}
            {attention.attendancePending.map((activity) => (
              <li key={`att-${activity.id}`}>
                <Link to={`/admin/activities/${activity.id}/attendance?month=${month}`} className="list-item">
                  <span className="cat-avatar" style={{ ['--cat' as string]: 'var(--warning)' }}>
                    <ClipboardCheck size={18} />
                  </span>
                  <span className="list-item-main">
                    <span className="list-item-title">Record attendance · {activity.name}</span>
                    <span className="list-item-sub">
                      {formatShortDate(activity.date)} · {activity.registeredCount - activity.presentCount - activity.absentCount} not marked
                    </span>
                  </span>
                </Link>
              </li>
            ))}
            {attention.closingSoonLowFill.map((activity) => (
              <li key={`low-${activity.id}`}>
                <Link to={`/admin/activities/${activity.id}/reservations?month=${month}`} className="list-item">
                  <span className="cat-avatar" style={{ ['--cat' as string]: 'var(--danger)' }}>
                    <TriangleAlert size={18} />
                  </span>
                  <span className="list-item-main">
                    <span className="list-item-title">Low registration · {activity.name}</span>
                    <span className="list-item-sub">
                      {formatShortDate(activity.date)} · {activity.registeredCount}/{activity.capacity} registered, closes soon
                    </span>
                  </span>
                </Link>
              </li>
            ))}
            {attention.drafts === 0 && attention.attendancePending.length === 0 && attention.closingSoonLowFill.length === 0 && (
              <li>
                <EmptyState icon={Gauge} title="All caught up">
                  Nothing needs your attention right now.
                </EmptyState>
              </li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Ticket; label: string; value: number | string; sub: string }) {
  return (
    <div className="stat">
      <span className="stat-label">
        <Icon size={16} /> {label}
      </span>
      <span className="stat-value">{value}</span>
      <span className="stat-sub">{sub}</span>
    </div>
  );
}

function ActivityList({
  title,
  empty,
  activities,
  month,
  showAttendance = false,
}: {
  title: string;
  empty: string;
  activities: AdminActivityDTO[];
  month: string;
  showAttendance?: boolean;
}) {
  return (
    <section className="card">
      <div className="card-header">
        <h2>{title}</h2>
      </div>
      {activities.length === 0 ? (
        <p className="muted" style={{ padding: '16px 20px' }}>
          {empty}
        </p>
      ) : (
        <ul className="list">
          {activities.map((activity) => (
            <li key={activity.id}>
              <Link
                to={`/admin/activities/${activity.id}/${showAttendance && activity.status === 'completed' ? 'attendance' : 'reservations'}?month=${month}`}
                className="list-item"
              >
                <CategoryAvatar category={activity.category} size={36} />
                <span className="list-item-main">
                  <span className="list-item-title">{activity.name}</span>
                  <span className="list-item-sub">
                    {formatShortDate(activity.date)} · {formatTimeRange(activity.startTime, activity.endTime)} · {activity.location}
                  </span>
                </span>
                <span className="mini-meter desktop-only">
                  <SeatMeter registered={activity.registeredCount} capacity={activity.capacity} />
                  <span className="count">
                    {activity.registeredCount}/{activity.capacity}
                  </span>
                </span>
                <StatusBadge status={activity.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
