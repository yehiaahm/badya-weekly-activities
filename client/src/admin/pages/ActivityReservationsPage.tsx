import { CalendarClock, Download, Search, Ticket, UserPlus, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { formatDeadline } from '@shared/format.ts';
import { STUDENT_STATUS_LABELS } from '@shared/status.ts';
import type { AdminReservationDTO } from '@shared/types.ts';
import { useConfirm, useToast } from '../../components/feedback.tsx';
import { EmptyState, ErrorState, LoadingState, ReservationBadge, StatusBadge } from '../../components/ui.tsx';
import { errorMessage } from '../../lib/api.ts';
import { ActivityHeader } from '../components/ActivityHeader.tsx';
import { ManualRegisterDialog } from '../components/ManualRegisterDialog.tsx';
import { useActivityReservations, useAdminCancelReservation } from '../queries.ts';

export function ActivityReservationsPage() {
  const id = Number(useParams().id);
  const reservationsQuery = useActivityReservations(id);
  const cancel = useAdminCancelReservation();
  const confirm = useConfirm();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'confirmed' | 'cancelled' | ''>('confirmed');
  const [level, setLevel] = useState('');
  const [major, setMajor] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);

  const reservations = useMemo(() => reservationsQuery.data?.reservations ?? [], [reservationsQuery.data]);
  const levels = useMemo(() => [...new Set(reservations.map((r) => r.student.academicLevel))].sort(), [reservations]);
  const majors = useMemo(() => [...new Set(reservations.map((r) => r.student.major))].sort(), [reservations]);

  if (reservationsQuery.isPending) return <LoadingState />;
  if (reservationsQuery.error) return <ErrorState error={reservationsQuery.error} onRetry={() => void reservationsQuery.refetch()} />;

  const { activity } = reservationsQuery.data;
  const q = search.trim().toLowerCase();
  const rows = reservations.filter(
    (r) =>
      (!status || r.status === status) &&
      (!level || r.student.academicLevel === level) &&
      (!major || r.student.major === major) &&
      (!q ||
        [r.student.name, r.student.studentId, r.student.email, r.student.phone, r.code].some((value) =>
          value.toLowerCase().includes(q),
        )),
  );

  const onCancel = async (reservation: AdminReservationDTO) => {
    const ok = await confirm({
      title: `Cancel ${reservation.student.name}'s reservation?`,
      message: `Reservation ${reservation.code} for ${activity.name}. The seat becomes available again.`,
      confirmLabel: 'Cancel reservation',
      cancelLabel: 'Keep it',
      tone: 'danger',
    });
    if (!ok) return;
    cancel.mutate(reservation.id, {
      onSuccess: () => toast.success(`Reservation ${reservation.code} cancelled`),
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  return (
    <>
      <ActivityHeader activity={activity} back={{ to: '/admin/reservations', label: 'All reservations' }} />

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat">
          <span className="stat-label">
            <Users size={16} /> Maximum capacity
          </span>
          <span className="stat-value">{activity.capacity}</span>
        </div>
        <div className="stat">
          <span className="stat-label">
            <Ticket size={16} /> Registered
          </span>
          <span className="stat-value">{activity.registeredCount}</span>
        </div>
        <div className="stat">
          <span className="stat-label">
            <Users size={16} /> Available seats
          </span>
          <span className="stat-value">{activity.availableSeats}</span>
        </div>
        <div className="stat">
          <span className="stat-label">
            <CalendarClock size={16} /> Registration deadline
          </span>
          <span className="stat-value is-text">{formatDeadline(activity.registrationDeadline)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Registration status</span>
          <span>
            <StatusBadge status={activity.status} />
          </span>
          <span className="stat-sub">Students see: {STUDENT_STATUS_LABELS[activity.status]}</span>
        </div>
      </div>

      <section className="card">
        <div className="toolbar">
          <div className="search-input">
            <Search size={16} />
            <input
              className="input"
              placeholder="Search name, Student ID, email, phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search students"
            />
          </div>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Reservation status">
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
            <option value="">All reservations</option>
          </select>
          <select className="select" value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Academic level">
            <option value="">All levels</option>
            {levels.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select className="select" value={major} onChange={(e) => setMajor(e.target.value)} aria-label="Major">
            <option value="">All majors</option>
            {majors.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <span className="spacer" />
          <a className="btn" href={`/api/admin/activities/${activity.id}/reservations/export`} download>
            <Download size={16} /> Export CSV
          </a>
          <button type="button" className="btn btn-primary" onClick={() => setRegisterOpen(true)}>
            <UserPlus size={16} /> Add student
          </button>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={Ticket} title={reservations.length ? 'No students match' : 'No reservations yet'}>
            {reservations.length ? 'Try clearing the search or filters.' : 'Students who reserve a spot will appear here.'}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Student ID</th>
                  <th>Major</th>
                  <th>Level</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Reservation ID</th>
                  <th className="actions">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((reservation) => (
                  <tr key={reservation.id} className={reservation.status === 'cancelled' ? 'is-muted' : undefined}>
                    <td className="cell-title">
                      {reservation.student.name}
                      {reservation.source === 'admin' && <div className="cell-sub">Added by staff</div>}
                    </td>
                    <td className="mono">{reservation.student.studentId}</td>
                    <td>{reservation.student.major}</td>
                    <td className="nowrap">{reservation.student.academicLevel}</td>
                    <td className="nowrap tabular">{reservation.student.phone}</td>
                    <td>{reservation.student.email}</td>
                    <td>
                      <ReservationBadge status={reservation.status} />
                    </td>
                    <td className="mono nowrap">{reservation.code}</td>
                    <td className="actions">
                      {reservation.status === 'confirmed' && (
                        <button type="button" className="btn btn-sm btn-danger-soft" onClick={() => onCancel(reservation)} disabled={cancel.isPending}>
                          <X size={14} /> Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="toolbar" style={{ borderTop: '1px solid var(--border)', borderBottom: 'none', color: 'var(--muted)', fontSize: '0.85rem' }}>
          Showing {rows.length} of {reservations.length} reservation{reservations.length === 1 ? '' : 's'}
        </div>
      </section>

      <ManualRegisterDialog activity={activity} open={registerOpen} onClose={() => setRegisterOpen(false)} />
    </>
  );
}
