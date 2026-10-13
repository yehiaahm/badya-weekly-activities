import { ClipboardCheck, Copy, Pencil, Ticket, Trash } from 'lucide-react';
import { Link } from 'react-router';
import { formatDeadline, formatFullDate, formatTimeRange } from '@shared/format.ts';
import type { AdminActivityDTO } from '@shared/types.ts';
import { Dialog } from '../../components/Dialog.tsx';
import { SeatMeter, StatusBadge } from '../../components/ui.tsx';
import { CategoryPill } from '../../lib/categories.tsx';
import { useToday } from '../../lib/time.ts';
import { statusActions, useActivityActions } from './activityActions.tsx';

interface Props {
  activity: AdminActivityDTO | null;
  onClose: () => void;
  onEdit: (activity: AdminActivityDTO) => void;
  onDuplicate: (activity: AdminActivityDTO) => void;
}

export function ActivityDrawer({ activity, onClose, onEdit, onDuplicate }: Props) {
  return (
    <Dialog variant="drawer" open={activity !== null} onClose={onClose} title={activity?.name ?? ''}>
      {activity && <DrawerBody activity={activity} onClose={onClose} onEdit={onEdit} onDuplicate={onDuplicate} />}
    </Dialog>
  );
}

function DrawerBody({ activity, onClose, onEdit, onDuplicate }: Props & { activity: AdminActivityDTO }) {
  const today = useToday();
  const { changeStatus, deleteActivity, busy } = useActivityActions();
  const month = activity.date.slice(0, 7);

  return (
    <div>
      <div className="row row-wrap">
        <CategoryPill category={activity.category} />
        <StatusBadge status={activity.status} />
      </div>

      <section className="drawer-section">
        <dl className="kv">
          <dt>Date</dt>
          <dd>{formatFullDate(activity.date)}</dd>
          <dt>Time</dt>
          <dd>{formatTimeRange(activity.startTime, activity.endTime)}</dd>
          <dt>Location</dt>
          <dd>{activity.location}</dd>
          <dt>Coach / staff</dt>
          <dd>{activity.coach}</dd>
          <dt>Registration deadline</dt>
          <dd>{formatDeadline(activity.registrationDeadline)}</dd>
        </dl>
      </section>

      <section className="drawer-section">
        <h3>Registrations</h3>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8, fontSize: '0.9rem' }}>
          <span>
            <strong className="tabular">{activity.registeredCount}</strong> of {activity.capacity} registered
          </span>
          <span className="muted">{activity.availableSeats} seats available</span>
        </div>
        <SeatMeter registered={activity.registeredCount} capacity={activity.capacity} />
        {(activity.presentCount > 0 || activity.absentCount > 0) && (
          <p className="muted" style={{ marginTop: 8, fontSize: '0.85rem' }}>
            Attendance: {activity.presentCount} present · {activity.absentCount} absent
          </p>
        )}
      </section>

      {activity.description && (
        <section className="drawer-section">
          <h3>Description</h3>
          <p style={{ whiteSpace: 'pre-line', color: 'var(--text-2)' }}>{activity.description}</p>
        </section>
      )}

      <section className="drawer-section">
        <h3>Manage</h3>
        <div className="action-grid">
          <button type="button" className="btn" onClick={() => onEdit(activity)}>
            <Pencil size={16} /> Edit / move
          </button>
          <button type="button" className="btn" onClick={() => onDuplicate(activity)}>
            <Copy size={16} /> Duplicate
          </button>
          <Link to={`/admin/activities/${activity.id}/reservations?month=${month}`} className="btn">
            <Ticket size={16} /> Reservations
          </Link>
          <Link to={`/admin/activities/${activity.id}/attendance?month=${month}`} className="btn">
            <ClipboardCheck size={16} /> Attendance
          </Link>
        </div>
      </section>

      <section className="drawer-section">
        <h3>Status</h3>
        <div className="action-grid">
          {statusActions(activity, today).map((action) => (
            <button
              key={action.status}
              type="button"
              className={`btn ${action.danger ? 'btn-danger-soft' : action.status === 'published' ? 'btn-primary' : ''}`}
              onClick={() => changeStatus(activity, action.status)}
              disabled={busy}
            >
              <action.icon size={16} /> {action.label}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-danger-soft"
            onClick={() => deleteActivity(activity, onClose)}
            disabled={busy || activity.registeredCount > 0}
            title={activity.registeredCount > 0 ? 'Activities with registered students can be cancelled, not deleted' : undefined}
          >
            <Trash size={16} /> Delete
          </button>
        </div>
      </section>
    </div>
  );
}
