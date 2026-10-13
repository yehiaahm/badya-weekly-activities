import { CalendarX2, ChartColumn, ClipboardCheck, Download, ListChecks, RotateCcw, Ticket, UserX, Users } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { firstDayOfMonth, lastDayOfMonth } from '@shared/dates.ts';
import { formatMonth, formatShortDate, formatTimeRange } from '@shared/format.ts';
import type { ReportActivityRow, ReportResponse } from '@shared/types.ts';
import { EmptyState, ErrorState, LoadingState, MonthSwitcher, SeatMeter, StatusBadge } from '../../components/ui.tsx';
import { query } from '../../lib/api.ts';
import { PageHeader } from '../AdminLayout.tsx';
import { BarChart } from '../components/BarChart.tsx';
import { useAdminActivities, useReport } from '../queries.ts';
import { useAdminMonth } from '../useAdminMonth.ts';

const pct = (value: number) => `${Math.round(value * 100)}%`;

export function ReportsPage() {
  const [month] = useAdminMonth();
  const [params, setParams] = useSearchParams();
  const activity = params.get('activity') ?? '';
  const category = params.get('category') ?? '';
  const date = params.get('date') ?? '';
  const filters = { month, activity: activity || undefined, category: category || undefined, date: date || undefined };
  const report = useReport(filters);
  const monthActivities = useAdminActivities(month);

  const options = useMemo(() => {
    const offered = (monthActivities.data?.activities ?? []).filter((a) => a.status !== 'draft');
    return {
      names: [...new Set(offered.map((a) => a.name))].sort((a, b) => a.localeCompare(b)),
      categories: [...new Set(offered.map((a) => a.category))].sort((a, b) => a.localeCompare(b)),
    };
  }, [monthActivities.data]);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };
  const filtered = Boolean(activity || category || date);

  return (
    <>
      <PageHeader
        title="Reports"
        description="Live numbers straight from reservations and attendance — they update automatically."
      />

      <section className="card" style={{ marginBottom: 20 }}>
        <div className="filters-grid">
          <div className="field">
            <span className="field-label">Month</span>
            <MonthSwitcher month={month} onChange={(value) => update({ month: value, date: null })} />
          </div>
          <label className="field">
            <span className="field-label">Activity</span>
            <select className="select" value={activity} onChange={(e) => update({ activity: e.target.value })}>
              <option value="">All activities</option>
              {options.names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Sport / category</span>
            <select className="select" value={category} onChange={(e) => update({ category: e.target.value })}>
              <option value="">All sports</option>
              {options.categories.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Date</span>
            <input
              className="input"
              type="date"
              value={date}
              min={firstDayOfMonth(month)}
              max={lastDayOfMonth(month)}
              onChange={(e) => update({ date: e.target.value })}
            />
          </label>
          <div className="row" style={{ alignSelf: 'end' }}>
            <button
              type="button"
              className="btn"
              onClick={() => update({ activity: null, category: null, date: null })}
              disabled={!filtered}
            >
              <RotateCcw size={16} /> Reset
            </button>
            <a className="btn" href={`/api/admin/reports/export${query(filters)}`} download>
              <Download size={16} /> Export CSV
            </a>
          </div>
        </div>
      </section>

      {report.isPending ? (
        <LoadingState label="Building report…" />
      ) : report.error ? (
        <ErrorState error={report.error} onRetry={() => void report.refetch()} />
      ) : (
        <div className={report.isPlaceholderData ? 'is-refreshing' : undefined}>
          <ReportBody report={report.data} />
        </div>
      )}
    </>
  );
}

function ReportBody({ report }: { report: ReportResponse }) {
  const navigate = useNavigate();
  const { totals } = report;
  const month = report.filters.month;

  if (report.activities.length === 0) {
    return (
      <div className="card">
        <EmptyState icon={ChartColumn} title="No published activities match these filters">
          Reports include published, full, closed, completed and cancelled activities for {formatMonth(month)}. Drafts are left out.
        </EmptyState>
      </div>
    );
  }

  const lowShown = report.lowRegistration.slice(0, 8);

  return (
    <div className="stack stack-lg">
      <div className="stat-grid">
        <Tile
          icon={ListChecks}
          label="Total activities"
          value={totals.activities}
          sub={totals.cancelledActivities ? `${totals.cancelledActivities} cancelled not counted` : 'Published in this period'}
        />
        <Tile icon={Ticket} label="Total reservations" value={totals.reservations} sub={`${pct(totals.fillRate)} of seats filled`} />
        <Tile icon={Users} label="Total available seats" value={totals.availableSeats} sub={`of ${totals.capacity} seats offered`} />
        <Tile
          icon={ClipboardCheck}
          label="Total attendance"
          value={totals.present}
          sub={totals.attendanceRate === null ? 'No attendance recorded yet' : `${pct(totals.attendanceRate)} attendance rate`}
        />
        <Tile
          icon={UserX}
          label="Total absences"
          value={totals.absent}
          sub={totals.attendancePending ? `${totals.attendancePending} not marked yet` : 'Every finished activity is marked'}
        />
      </div>

      <div className="section-grid section-grid-halves">
        <section className="card">
          <div className="card-header">
            <h2>Most reserved activities</h2>
            <span className="muted" style={{ fontSize: '0.82rem' }}>
              Confirmed reservations
            </span>
          </div>
          {report.mostReserved.length ? (
            <BarChart
              unit="reservations"
              data={report.mostReserved.map((row) => ({
                key: String(row.id),
                label: row.name,
                sublabel: `${formatShortDate(row.date)} · ${formatTimeRange(row.startTime, row.endTime)}`,
                value: row.registeredCount,
                detail: `${row.registeredCount} of ${row.capacity} seats (${pct(row.fillRate)})`,
              }))}
            />
          ) : (
            <p className="muted" style={{ padding: '16px 20px' }}>
              No reservations yet.
            </p>
          )}
        </section>

        <section className="card">
          <div className="card-header">
            <h2>Reservations by sport</h2>
            <span className="muted" style={{ fontSize: '0.82rem' }}>
              Confirmed reservations
            </span>
          </div>
          <BarChart
            unit="reservations"
            data={report.byCategory.map((row) => ({
              key: row.category,
              label: row.category,
              sublabel: `${row.activities} activit${row.activities === 1 ? 'y' : 'ies'}`,
              value: row.reservations,
              detail: `${row.reservations} of ${row.capacity} seats (${pct(row.capacity ? row.reservations / row.capacity : 0)}) · ${row.present} present, ${row.absent} absent`,
            }))}
          />
        </section>
      </div>

      <div className="section-grid section-grid-halves">
        <section className="card">
          <div className="card-header">
            <h2>Low registration</h2>
            <span className="badge badge-warning">Under {pct(report.lowRegistrationThreshold)} full</span>
          </div>
          <ActivityRows rows={lowShown} month={month} empty="Every activity is at least 30% full." />
          {report.lowRegistration.length > lowShown.length && (
            <p className="muted" style={{ padding: '0 20px 14px', fontSize: '0.84rem' }}>
              + {report.lowRegistration.length - lowShown.length} more in the table below
            </p>
          )}
        </section>
        <section className="card">
          <div className="card-header">
            <h2>Reached full capacity</h2>
            <span className="badge badge-success">{report.fullCapacity.length}</span>
          </div>
          <ActivityRows rows={report.fullCapacity} month={month} empty="No activity has filled up yet." />
        </section>
      </div>

      <section className="card">
        <div className="card-header">
          <h2>All activities</h2>
          <span className="muted" style={{ fontSize: '0.82rem' }}>
            {report.activities.length} in this report
          </span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Activity</th>
                <th>Sport</th>
                <th>Date</th>
                <th className="num">Registered</th>
                <th className="num">Capacity</th>
                <th className="num">Fill</th>
                <th className="num">Present</th>
                <th className="num">Absent</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {report.activities.map((row) => (
                <tr
                  key={row.id}
                  className={`is-clickable ${row.status === 'cancelled' ? 'is-muted' : ''}`}
                  onClick={() => navigate(`/admin/activities/${row.id}/reservations?month=${month}`)}
                >
                  <td className="cell-title">{row.name}</td>
                  <td>{row.category}</td>
                  <td className="nowrap">{formatShortDate(row.date)}</td>
                  <td className="num">{row.registeredCount}</td>
                  <td className="num">{row.capacity}</td>
                  <td className="num">{pct(row.fillRate)}</td>
                  <td className="num">{row.presentCount}</td>
                  <td className="num">{row.absentCount}</td>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Tile({ icon: Icon, label, value, sub }: { icon: typeof Ticket; label: string; value: number; sub: string }) {
  return (
    <div className="stat">
      <span className="stat-label">
        <Icon size={16} /> {label}
      </span>
      <span className="stat-value">{value.toLocaleString('en-US')}</span>
      <span className="stat-sub">{sub}</span>
    </div>
  );
}

function ActivityRows({ rows, month, empty }: { rows: ReportActivityRow[]; month: string; empty: string }) {
  if (!rows.length) {
    return (
      <div className="empty-state" style={{ padding: '24px 20px' }}>
        <span className="empty-icon" aria-hidden>
          <CalendarX2 size={22} />
        </span>
        <p>{empty}</p>
      </div>
    );
  }
  return (
    <ul className="list">
      {rows.map((row) => (
        <li key={row.id}>
          <Link to={`/admin/activities/${row.id}/reservations?month=${month}`} className="list-item">
            <span className="list-item-main">
              <span className="list-item-title">{row.name}</span>
              <span className="list-item-sub">
                {formatShortDate(row.date)} · {formatTimeRange(row.startTime, row.endTime)}
              </span>
            </span>
            <span className="mini-meter">
              <SeatMeter registered={row.registeredCount} capacity={row.capacity} />
              <span className="count">
                {row.registeredCount}/{row.capacity}
              </span>
            </span>
            <span className="pct" style={{ minWidth: 42, textAlign: 'right' }}>
              {pct(row.fillRate)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
