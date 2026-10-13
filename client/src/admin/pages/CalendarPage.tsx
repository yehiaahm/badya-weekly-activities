import { CopyPlus, Plus, Send } from 'lucide-react';
import { useMemo, useState, type DragEvent } from 'react';
import { isWorkingDay, WEEKDAY_NAMES } from '@shared/calendar.ts';
import { monthOf, weeksOfMonth } from '@shared/dates.ts';
import { formatDayDate, formatFullDate, formatMonth, formatShortDate, formatTime } from '@shared/format.ts';
import { ADMIN_STATUS_LABELS } from '@shared/status.ts';
import type { AdminActivityDTO } from '@shared/types.ts';
import { useConfirm, useToast } from '../../components/feedback.tsx';
import { ErrorState, LoadingState, MonthSwitcher } from '../../components/ui.tsx';
import { errorMessage } from '../../lib/api.ts';
import { categoryVars } from '../../lib/categories.tsx';
import { useToday } from '../../lib/time.ts';
import { PageHeader } from '../AdminLayout.tsx';
import { ActivityDrawer } from '../components/ActivityDrawer.tsx';
import { ActivityFormDialog } from '../components/ActivityFormDialog.tsx';
import { CopyMonthDialog } from '../components/CopyMonthDialog.tsx';
import { DuplicateDialog } from '../components/DuplicateDialog.tsx';
import { useAdminActivities, usePublishMonth, useSaveActivity } from '../queries.ts';
import { useAdminMonth } from '../useAdminMonth.ts';

const LEGEND = [
  { label: 'Draft', style: { outline: '1.5px dashed var(--violet)', outlineOffset: -1.5, background: '#fff' } },
  { label: 'Published', style: { background: 'var(--success)' } },
  { label: 'Full', style: { background: 'var(--warning)' } },
  { label: 'Registration closed', style: { background: 'var(--info)' } },
  { label: 'Completed', style: { background: 'var(--faint)' } },
  { label: 'Cancelled', style: { background: 'var(--danger)' } },
];

const STATUS_DOT: Record<string, string> = {
  draft: 'var(--violet)',
  published: 'var(--success)',
  full: 'var(--warning)',
  registration_closed: 'var(--info)',
  completed: 'var(--faint)',
  cancelled: 'var(--danger)',
};

export function CalendarPage() {
  const [month, setMonth] = useAdminMonth();
  const activitiesQuery = useAdminActivities(month);
  const today = useToday();
  const confirm = useConfirm();
  const toast = useToast();
  const save = useSaveActivity();
  const publishMonth = usePublishMonth();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [form, setForm] = useState<{ activity?: AdminActivityDTO; date?: string } | null>(null);
  const [duplicating, setDuplicating] = useState<AdminActivityDTO | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropDate, setDropDate] = useState<string | null>(null);

  const activities = activitiesQuery.data?.activities ?? [];
  const byDate = useMemo(() => {
    const map = new Map<string, AdminActivityDTO[]>();
    for (const activity of activities) map.set(activity.date, [...(map.get(activity.date) ?? []), activity]);
    return map;
  }, [activities]);
  const weeks = useMemo(() => weeksOfMonth(month), [month]);
  const drafts = activities.filter((a) => a.status === 'draft').length;
  const selected = activities.find((a) => a.id === selectedId) ?? null;

  const move = async (activity: AdminActivityDTO, date: string) => {
    if (activity.date === date) return;
    if (activity.registeredCount > 0) {
      const ok = await confirm({
        title: `Move ${activity.name}?`,
        message: `${activity.registeredCount} student(s) registered for ${formatFullDate(activity.date)} will see the new date, ${formatFullDate(date)}. The registration deadline is recalculated.`,
        confirmLabel: 'Move activity',
      });
      if (!ok) return;
    }
    save.mutate(
      { id: activity.id, values: { date } },
      {
        onSuccess: () => toast.success(`${activity.name} moved to ${formatShortDate(date)}`),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  const onDrop = (event: DragEvent, date: string) => {
    event.preventDefault();
    const id = Number(event.dataTransfer.getData('text/plain'));
    setDragId(null);
    setDropDate(null);
    const activity = activities.find((a) => a.id === id);
    if (activity) void move(activity, date);
  };

  const publishAll = async () => {
    const ok = await confirm({
      title: `Publish ${drafts} draft${drafts === 1 ? '' : 's'}?`,
      message: `All draft activities in ${formatMonth(month)} become visible to students and open for reservations.`,
      confirmLabel: 'Publish all',
    });
    if (!ok) return;
    publishMonth.mutate(month, {
      onSuccess: (result) => toast.success(`${result.updated} activit${result.updated === 1 ? 'y' : 'ies'} published`),
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  const chip = (activity: AdminActivityDTO, agenda = false) => (
    <button
      key={activity.id}
      type="button"
      className={`cal-chip is-${activity.status} ${dragId === activity.id ? 'is-dragging' : ''}`}
      style={categoryVars(activity.category)}
      draggable={!agenda}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', String(activity.id));
        event.dataTransfer.effectAllowed = 'move';
        setDragId(activity.id);
      }}
      onDragEnd={() => {
        setDragId(null);
        setDropDate(null);
      }}
      onClick={() => setSelectedId(activity.id)}
      title={`${activity.name} · ${ADMIN_STATUS_LABELS[activity.status]} · drag to move`}
    >
      <span className="chip-row1">
        <span className="chip-time">{formatTime(activity.startTime)}</span>
        <span className="chip-count">
          {activity.registeredCount}/{activity.capacity}
        </span>
      </span>
      <span className="chip-name">{activity.name}</span>
      <span className="chip-status" style={{ color: STATUS_DOT[activity.status] }}>
        ● {ADMIN_STATUS_LABELS[activity.status]}
      </span>
    </button>
  );

  return (
    <>
      <PageHeader
        title="Monthly Calendar"
        description="Plan the month: click a day to add an activity, drag to move it, click an activity to manage it."
        actions={
          <>
            <MonthSwitcher month={month} onChange={setMonth} />
            <button type="button" className="btn" onClick={() => setCopyOpen(true)}>
              <CopyPlus size={17} /> Copy previous month
            </button>
            <button type="button" className="btn" onClick={publishAll} disabled={!drafts || publishMonth.isPending}>
              <Send size={17} /> Publish drafts{drafts ? ` (${drafts})` : ''}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setForm({})}>
              <Plus size={17} /> New activity
            </button>
          </>
        }
      />

      <div className="calendar-legend" style={{ marginBottom: 12 }}>
        {LEGEND.map((item) => (
          <span key={item.label}>
            <span className="legend-swatch" style={item.style} /> {item.label}
          </span>
        ))}
        <span>· Fridays & Saturdays are non-working days</span>
      </div>

      {activitiesQuery.isPending ? (
        <LoadingState />
      ) : activitiesQuery.error ? (
        <ErrorState error={activitiesQuery.error} onRetry={() => void activitiesQuery.refetch()} />
      ) : (
        <>
          <div className="card cal" role="grid" aria-label={`Activities in ${formatMonth(month)}`}>
            <div className="cal-head" role="row">
              {WEEKDAY_NAMES.map((name, index) => (
                <div key={name} role="columnheader" className={index >= 5 ? 'is-off' : undefined}>
                  {index >= 5 ? name.slice(0, 3) : name}
                </div>
              ))}
            </div>
            {weeks.map((week) => (
              <div key={week[0]} className="cal-week" role="row">
                {week.map((date) => {
                  const working = isWorkingDay(date);
                  const outside = monthOf(date) !== month;
                  const dayActivities = outside ? [] : (byDate.get(date) ?? []);
                  if (!working) {
                    return (
                      <div key={date} className="cal-day is-off" role="gridcell" aria-label={`${formatDayDate(date)}, non-working day`}>
                        <span className="cal-date" style={{ color: 'var(--faint)' }}>
                          {Number(date.slice(8))}
                        </span>
                        {!outside && <span className="cal-off-label">Off</span>}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={date}
                      role="gridcell"
                      className={`cal-day ${outside ? 'is-outside' : ''} ${date === today ? 'is-today' : ''} ${dropDate === date ? 'is-drop-target' : ''}`}
                      onDragOver={(event) => {
                        if (outside || dragId === null) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                        if (dropDate !== date) setDropDate(date);
                      }}
                      onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropDate(null);
                      }}
                      onDrop={(event) => !outside && onDrop(event, date)}
                    >
                      <div className="cal-day-top">
                        <span className="cal-date">{Number(date.slice(8))}</span>
                        {!outside && (
                          <button
                            type="button"
                            className="icon-btn icon-btn-sm cal-add"
                            onClick={() => setForm({ date })}
                            aria-label={`Add activity on ${formatDayDate(date)}`}
                          >
                            <Plus size={15} />
                          </button>
                        )}
                      </div>
                      {dayActivities.map((activity) => chip(activity))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="agenda">
            {weeks
              .flat()
              .filter((date) => monthOf(date) === month && isWorkingDay(date))
              .map((date) => (
                <div key={date} className="card agenda-day">
                  <div className="agenda-day-head">
                    <span>
                      {formatDayDate(date)} {date === today && <span className="badge badge-info">Today</span>}
                    </span>
                    <button type="button" className="btn btn-sm" onClick={() => setForm({ date })}>
                      <Plus size={14} /> Add
                    </button>
                  </div>
                  {(byDate.get(date) ?? []).map((activity) => chip(activity, true))}
                  {!(byDate.get(date) ?? []).length && (
                    <p className="muted" style={{ padding: '10px 14px', fontSize: '0.85rem' }}>
                      No activities — {WEEKDAY_NAMES[new Date(`${date}T00:00:00Z`).getUTCDay()]} is free.
                    </p>
                  )}
                </div>
              ))}
          </div>
        </>
      )}

      <ActivityDrawer
        activity={selected}
        onClose={() => setSelectedId(null)}
        onEdit={(activity) => {
          setSelectedId(null);
          setForm({ activity });
        }}
        onDuplicate={(activity) => {
          setSelectedId(null);
          setDuplicating(activity);
        }}
      />
      <ActivityFormDialog open={form !== null} onClose={() => setForm(null)} activity={form?.activity} defaultDate={form?.date} />
      <DuplicateDialog activity={duplicating} onClose={() => setDuplicating(null)} />
      <CopyMonthDialog month={month} open={copyOpen} onClose={() => setCopyOpen(false)} existingCount={activities.length} />
    </>
  );
}
