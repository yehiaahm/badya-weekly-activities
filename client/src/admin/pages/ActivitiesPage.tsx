import { Ban, ClipboardCheck, Copy, EyeOff, ListChecks, Lock, Pencil, Plus, Search, Send, Ticket, Trash } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { formatDeadline, formatShortDate, formatTimeRange } from '@shared/format.ts';
import { ACTIVITY_STATUSES, ADMIN_STATUS_LABELS, type ActivityStatus } from '@shared/status.ts';
import type { AdminActivityDTO } from '@shared/types.ts';
import { ActionMenu, EmptyState, ErrorState, LoadingState, MonthSwitcher, SeatMeter, StatusBadge } from '../../components/ui.tsx';
import { CategoryAvatar } from '../../lib/categories.tsx';
import { useToday } from '../../lib/time.ts';
import { PageHeader } from '../AdminLayout.tsx';
import { statusActions, useActivityActions } from '../components/activityActions.tsx';
import { ActivityFormDialog } from '../components/ActivityFormDialog.tsx';
import { DuplicateDialog } from '../components/DuplicateDialog.tsx';
import { useAdminActivities } from '../queries.ts';
import { useAdminMonth } from '../useAdminMonth.ts';

export function ActivitiesPage() {
  const [month, setMonth] = useAdminMonth();
  const activitiesQuery = useAdminActivities(month);
  const navigate = useNavigate();
  const today = useToday();
  const { changeStatus, bulkStatus, deleteActivity, busy } = useActivityActions();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<ActivityStatus | ''>('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [form, setForm] = useState<{ activity?: AdminActivityDTO } | null>(null);
  const [duplicating, setDuplicating] = useState<AdminActivityDTO | null>(null);

  const all = useMemo(() => activitiesQuery.data?.activities ?? [], [activitiesQuery.data]);
  const categories = useMemo(() => [...new Set(all.map((a) => a.category))].sort(), [all]);
  const rows = all.filter((activity) => {
    const q = search.trim().toLowerCase();
    const matches =
      !q || [activity.name, activity.location, activity.coach, activity.category].some((value) => value.toLowerCase().includes(q));
    return matches && (!category || activity.category === category) && (!status || activity.status === status);
  });

  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)));
  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clear = () => setSelected(new Set());

  return (
    <>
      <PageHeader
        title="Activities"
        description="Every activity in the month with its registrations, deadline and status."
        actions={
          <>
            <MonthSwitcher
              month={month}
              onChange={(value) => {
                clear();
                setMonth(value);
              }}
            />
            <button type="button" className="btn btn-primary" onClick={() => setForm({})}>
              <Plus size={17} /> New activity
            </button>
          </>
        }
      />

      <section className="card">
        <div className="toolbar">
          <div className="search-input">
            <Search size={16} />
            <input
              className="input"
              placeholder="Search name, location or coach"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search activities"
            />
          </div>
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by sport">
            <option value="">All sports</option>
            {categories.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={status}
            onChange={(e) => setStatus(e.target.value as ActivityStatus | '')}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {ACTIVITY_STATUSES.map((value) => (
              <option key={value} value={value}>
                {ADMIN_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        {selected.size > 0 && (
          <div className="selection-bar">
            <span>{selected.size} selected</span>
            <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => bulkStatus([...selected], 'published', clear)}>
              <Send size={14} /> Publish
            </button>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => bulkStatus([...selected], 'draft', clear)}>
              <EyeOff size={14} /> Unpublish
            </button>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => bulkStatus([...selected], 'registration_closed', clear)}>
              <Lock size={14} /> Close registration
            </button>
            <button type="button" className="btn btn-sm btn-danger-soft" disabled={busy} onClick={() => bulkStatus([...selected], 'cancelled', clear)}>
              <Ban size={14} /> Cancel
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={clear}>
              Clear
            </button>
          </div>
        )}

        {activitiesQuery.isPending ? (
          <LoadingState />
        ) : activitiesQuery.error ? (
          <ErrorState error={activitiesQuery.error} onRetry={() => void activitiesQuery.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState icon={ListChecks} title={all.length ? 'No activities match your filters' : 'No activities this month'}>
            {all.length ? 'Try clearing the search or filters.' : 'Create one, or copy last month from the Monthly Calendar.'}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
                  </th>
                  <th>Activity</th>
                  <th>Date & time</th>
                  <th>Location / coach</th>
                  <th>Registered</th>
                  <th>Deadline</th>
                  <th>Status</th>
                  <th className="actions">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((activity) => (
                  <tr key={activity.id} className={activity.status === 'cancelled' ? 'is-muted' : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(activity.id)}
                        onChange={() => toggle(activity.id)}
                        aria-label={`Select ${activity.name} on ${activity.date}`}
                      />
                    </td>
                    <td>
                      <div className="row">
                        <CategoryAvatar category={activity.category} size={34} />
                        <div>
                          <div className="cell-title">{activity.name}</div>
                          <div className="cell-sub">{activity.category}</div>
                        </div>
                      </div>
                    </td>
                    <td className="nowrap">
                      <div className="cell-title">{formatShortDate(activity.date)}</div>
                      <div className="cell-sub">{formatTimeRange(activity.startTime, activity.endTime)}</div>
                    </td>
                    <td>
                      <div>{activity.location}</div>
                      <div className="cell-sub">{activity.coach}</div>
                    </td>
                    <td>
                      <div className="mini-meter">
                        <SeatMeter registered={activity.registeredCount} capacity={activity.capacity} />
                        <span className="count">
                          {activity.registeredCount}/{activity.capacity}
                        </span>
                      </div>
                    </td>
                    <td className="nowrap cell-sub">{formatDeadline(activity.registrationDeadline)}</td>
                    <td>
                      <StatusBadge status={activity.status} />
                    </td>
                    <td className="actions">
                      <ActionMenu
                        label={`Actions for ${activity.name}`}
                        items={[
                          { label: 'Edit / move', icon: Pencil, onSelect: () => setForm({ activity }) },
                          { label: 'Duplicate', icon: Copy, onSelect: () => setDuplicating(activity) },
                          {
                            label: 'Reservations',
                            icon: Ticket,
                            onSelect: () => navigate(`/admin/activities/${activity.id}/reservations?month=${month}`),
                          },
                          {
                            label: 'Attendance',
                            icon: ClipboardCheck,
                            onSelect: () => navigate(`/admin/activities/${activity.id}/attendance?month=${month}`),
                          },
                          ...statusActions(activity, today).map((action, index) => ({
                            label: action.label,
                            icon: action.icon,
                            danger: action.danger,
                            separatorBefore: index === 0,
                            onSelect: () => void changeStatus(activity, action.status),
                          })),
                          {
                            label: 'Delete',
                            icon: Trash,
                            danger: true,
                            separatorBefore: true,
                            disabled: activity.registeredCount > 0,
                            onSelect: () => void deleteActivity(activity),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ActivityFormDialog open={form !== null} onClose={() => setForm(null)} activity={form?.activity} />
      <DuplicateDialog activity={duplicating} onClose={() => setDuplicating(null)} />
    </>
  );
}
