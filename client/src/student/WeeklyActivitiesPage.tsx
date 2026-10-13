import { CalendarSearch } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { formatDayDate, formatMonth } from '@shared/format.ts';
import type { ActivityDTO } from '@shared/types.ts';
import { EmptyState, ErrorState, MonthSwitcher } from '../components/ui.tsx';
import { categoryVars } from '../lib/categories.tsx';
import { useMyReservations, usePublicActivities, usePublicActivitiesForMonths, useSession } from '../lib/queries.ts';
import { useToday } from '../lib/time.ts';
import { currentWeekStart, defaultMonth, defaultWeek, monthsOfWeek, validMonth, workingWeeksOf } from '../lib/weeks.ts';
import { ActivityCard } from './ActivityCard.tsx';

export function WeeklyActivitiesPage() {
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const month = validMonth(params.get('month'), defaultMonth(today));
  const category = params.get('category');
  const availableOnly = params.get('available') === '1';

  const weeks = useMemo(() => workingWeeksOf(month), [month]);
  const week = weeks.find((w) => w.start === params.get('week')) ?? defaultWeek(weeks, today);

  const monthQuery = usePublicActivities(month);
  const weekQuery = usePublicActivitiesForMonths(monthsOfWeek(week));

  const session = useSession();
  const mine = useMyReservations(Boolean(session.data?.student?.student));
  const registeredIds = useMemo(
    () =>
      new Set(
        (mine.data?.reservations ?? []).filter((r) => r.status === 'confirmed').map((reservation) => reservation.activity.id),
      ),
    [mine.data],
  );

  const categories = useMemo(
    () => [...new Set((monthQuery.data?.activities ?? []).map((a) => a.category))].sort((a, b) => a.localeCompare(b)),
    [monthQuery.data],
  );

  const weekCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const activity of monthQuery.data?.activities ?? []) {
      const owner = weeks.find((w) => w.days.includes(activity.date));
      if (owner) counts.set(owner.start, (counts.get(owner.start) ?? 0) + 1);
    }
    return counts;
  }, [monthQuery.data, weeks]);

  const visible = (activity: ActivityDTO) =>
    (!category || activity.category === category) && (!availableOnly || activity.canReserve);
  const byDay = week.days.map((day) => ({
    day,
    activities: weekQuery.activities
      .filter((activity) => activity.date === day && visible(activity))
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
  }));
  const shownCount = byDay.reduce((total, group) => total + group.activities.length, 0);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  const thisWeekStart = currentWeekStart(today);
  const viewingThisWeek = week.start === thisWeekStart;
  const monthActivities = monthQuery.data?.activities;
  const openCount = monthActivities?.filter((activity) => activity.canReserve).length ?? 0;

  // Keep the selected week tab visible when the tab strip scrolls (phones).
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabsScrolled = useRef(false);
  useEffect(() => {
    const container = tabsRef.current;
    const active = container?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (container && active) {
      container.scrollTo({
        left: active.offsetLeft - (container.clientWidth - active.clientWidth) / 2,
        behavior: tabsScrolled.current ? 'smooth' : 'instant',
      });
      tabsScrolled.current = true;
    }
  }, [week.start, month]);

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <div className="hero-copy">
            <span className="hero-eyebrow">Play · Unite · Inspire</span>
            <h1>Weekly Activities</h1>
            <p>Browse what's on across campus this week, open an activity for details and reserve your spot in seconds.</p>
            {monthActivities && (
              <div className="hero-stats" aria-live="polite">
                <span>
                  <strong>{monthActivities.length}</strong> {monthActivities.length === 1 ? 'activity' : 'activities'} in{' '}
                  {formatMonth(month).split(' ')[0]}
                </span>
                <span>
                  <strong>{openCount}</strong> open for registration
                </span>
              </div>
            )}
          </div>
          <MonthSwitcher month={month} onChange={(value) => update({ month: value, week: null })} />
        </div>
      </section>

      <div className="container">
        <div className="browse-toolbar">
          <div className="stack">
            <div className="row">
              <div ref={tabsRef} className="tabs week-tabs" role="tablist" aria-label="Weeks" style={{ flex: 1, minWidth: 0 }}>
                {weeks.map((w) => (
                  <button
                    key={w.start}
                    type="button"
                    role="tab"
                    className={`tab ${w.start === thisWeekStart ? 'is-current' : ''}`}
                    aria-selected={w.start === week.start}
                    onClick={() => update({ week: w.start })}
                  >
                    {w.label}
                    <small>
                      {w.start === thisWeekStart ? 'This week · ' : ''}
                      {weekCounts.get(w.start) ?? 0} activities
                    </small>
                  </button>
                ))}
              </div>
              {!viewingThisWeek && (
                <button
                  type="button"
                  className="btn btn-sm desktop-only"
                  onClick={() => update({ month: defaultMonth(today), week: thisWeekStart })}
                >
                  This week
                </button>
              )}
            </div>
            <div className="filter-row">
              <div className="chip-row" role="group" aria-label="Filter by sport">
                <button type="button" className="chip" aria-pressed={!category} onClick={() => update({ category: null })}>
                  All sports
                </button>
                {categories.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="chip"
                    style={categoryVars(name)}
                    aria-pressed={category === name}
                    onClick={() => update({ category: category === name ? null : name })}
                  >
                    <span className="chip-dot" aria-hidden />
                    {name}
                  </button>
                ))}
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={availableOnly}
                  onChange={(event) => update({ available: event.target.checked ? '1' : null })}
                />
                Open only
              </label>
            </div>
          </div>
        </div>

        {weekQuery.error ? (
          <ErrorState error={weekQuery.error} onRetry={weekQuery.refetch} />
        ) : weekQuery.isPending ? (
          <div className="activity-grid" style={{ marginTop: 26 }} aria-busy="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton" style={{ height: 250 }} />
            ))}
          </div>
        ) : shownCount === 0 ? (
          <EmptyState icon={CalendarSearch} title="No activities match">
            {category || availableOnly
              ? 'Try another sport or turn off "Open only".'
              : 'Nothing is scheduled for this week yet. Check another week or month.'}
          </EmptyState>
        ) : (
          byDay.map(({ day, activities }) => (
            <section key={day} className="day-group" aria-labelledby={`day-${day}`}>
              <h2 id={`day-${day}`} className={`day-heading ${day < today ? 'is-past' : ''}`}>
                {formatDayDate(day)}
                {day === today && <span className="badge badge-today">Today</span>}
                <span className="day-count">
                  {activities.length} {activities.length === 1 ? 'activity' : 'activities'}
                </span>
              </h2>
              {activities.length === 0 ? (
                <div className="day-empty">No activities scheduled.</div>
              ) : (
                <div className="activity-grid">
                  {activities.map((activity) => (
                    <ActivityCard key={activity.id} activity={activity} registered={registeredIds.has(activity.id)} />
                  ))}
                </div>
              )}
            </section>
          ))
        )}
      </div>
    </>
  );
}
