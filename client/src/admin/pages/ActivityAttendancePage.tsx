import { Check, CircleAlert, ClipboardCheck, Search, UserCheck, Users, UserX, X } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import type { AttendanceStatus } from '@shared/status.ts';
import { useToast } from '../../components/feedback.tsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui.tsx';
import { errorMessage } from '../../lib/api.ts';
import { ActivityHeader } from '../components/ActivityHeader.tsx';
import { useAttendance, useRecordAttendance } from '../queries.ts';

export function ActivityAttendancePage() {
  const id = Number(useParams().id);
  const attendanceQuery = useAttendance(id);
  const record = useRecordAttendance(id);
  const toast = useToast();
  const [search, setSearch] = useState('');

  if (attendanceQuery.isPending) return <LoadingState />;
  if (attendanceQuery.error) return <ErrorState error={attendanceQuery.error} onRetry={() => void attendanceQuery.refetch()} />;

  const { activity, rows, canRecord, reason } = attendanceQuery.data;
  const present = rows.filter((r) => r.attendance === 'present').length;
  const absent = rows.filter((r) => r.attendance === 'absent').length;
  const unmarked = rows.length - present - absent;
  const q = search.trim().toLowerCase();
  const shown = rows.filter((r) => !q || r.name.toLowerCase().includes(q) || r.universityId.toLowerCase().includes(q));

  const mark = (entries: { studentId: number; status: AttendanceStatus | null }[], message?: string) => {
    if (!entries.length) return;
    record.mutate(entries, {
      onSuccess: () => message && toast.success(message),
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  return (
    <>
      <ActivityHeader activity={activity} back={{ to: '/admin/attendance', label: 'All attendance' }} />

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat">
          <span className="stat-label">
            <Users size={16} /> Registered
          </span>
          <span className="stat-value">{rows.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label" style={{ color: 'var(--success)' }}>
            <UserCheck size={16} /> Present
          </span>
          <span className="stat-value">{present}</span>
        </div>
        <div className="stat">
          <span className="stat-label" style={{ color: 'var(--danger)' }}>
            <UserX size={16} /> Absent
          </span>
          <span className="stat-value">{absent}</span>
        </div>
        <div className="stat">
          <span className="stat-label">
            <ClipboardCheck size={16} /> Not marked
          </span>
          <span className="stat-value">{unmarked}</span>
          <span className="stat-sub">{present + absent ? `${Math.round((present / (present + absent)) * 100)}% attendance rate` : '—'}</span>
        </div>
      </div>

      {!canRecord && (
        <div className="alert alert-warning" style={{ marginBottom: 16 }}>
          <CircleAlert size={18} />
          <span>{reason}</span>
        </div>
      )}

      <section className="card">
        <div className="toolbar">
          <div className="search-input">
            <Search size={16} />
            <input className="input" placeholder="Search students" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search students" />
          </div>
          <span className="spacer" />
          <button
            type="button"
            className="btn"
            disabled={!canRecord || record.isPending || present === rows.length}
            onClick={() => mark(rows.map((r) => ({ studentId: r.studentId, status: 'present' })), 'Everyone marked present')}
          >
            <Check size={16} /> Mark all present
          </button>
          <button
            type="button"
            className="btn"
            disabled={!canRecord || record.isPending || unmarked === 0}
            onClick={() =>
              mark(
                rows.filter((r) => !r.attendance).map((r) => ({ studentId: r.studentId, status: 'absent' })),
                `${unmarked} marked absent`,
              )
            }
          >
            <X size={16} /> Mark remaining absent
          </button>
        </div>

        {rows.length === 0 ? (
          <EmptyState icon={Users} title="No registered students">
            Only students with a confirmed reservation appear on the attendance sheet.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Student ID</th>
                  <th>Reservation</th>
                  <th>Attendance</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.studentId}>
                    <td>
                      <div className="cell-title">{row.name}</div>
                      <div className="cell-sub">{row.major}</div>
                    </td>
                    <td className="mono">{row.universityId}</td>
                    <td>
                      <span className="badge badge-success">Confirmed</span>
                      <div className="cell-sub mono">{row.reservationCode}</div>
                    </td>
                    <td>
                      <div className="segmented" role="group" aria-label={`Attendance for ${row.name}`}>
                        <button
                          type="button"
                          className="is-present"
                          aria-pressed={row.attendance === 'present'}
                          disabled={!canRecord}
                          onClick={() => mark([{ studentId: row.studentId, status: row.attendance === 'present' ? null : 'present' }])}
                        >
                          <Check size={14} /> Present
                        </button>
                        <button
                          type="button"
                          className="is-absent"
                          aria-pressed={row.attendance === 'absent'}
                          disabled={!canRecord}
                          onClick={() => mark([{ studentId: row.studentId, status: row.attendance === 'absent' ? null : 'absent' }])}
                        >
                          <X size={14} /> Absent
                        </button>
                      </div>
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
