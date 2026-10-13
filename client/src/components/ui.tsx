import { ChevronLeft, ChevronRight, CircleAlert, Ellipsis, Inbox, RefreshCw, type LucideIcon } from 'lucide-react';
import { addMonths } from '@shared/dates.ts';
import { formatMonth } from '@shared/format.ts';
import {
  ADMIN_STATUS_LABELS,
  STUDENT_STATUS_LABELS,
  type ActivityStatus,
  type AttendanceStatus,
  type ReservationStatus,
} from '@shared/status.ts';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { errorMessage } from '../lib/api.ts';

// ----------------------------------------------------------------- badges

const STATUS_TONE: Record<ActivityStatus, string> = {
  draft: 'badge-violet',
  published: 'badge-success',
  full: 'badge-warning',
  registration_closed: 'badge-info',
  completed: 'badge-neutral',
  cancelled: 'badge-danger',
};

export function StatusBadge({ status, audience = 'admin' }: { status: ActivityStatus; audience?: 'admin' | 'student' }) {
  const label = audience === 'admin' ? ADMIN_STATUS_LABELS[status] : STUDENT_STATUS_LABELS[status];
  return <span className={`badge badge-dot ${STATUS_TONE[status]}`}>{label}</span>;
}

export function ReservationBadge({ status }: { status: ReservationStatus }) {
  return status === 'confirmed' ? (
    <span className="badge badge-success">Confirmed</span>
  ) : (
    <span className="badge badge-neutral">Cancelled</span>
  );
}

export function AttendanceBadge({ status }: { status: AttendanceStatus | null }) {
  if (status === 'present') return <span className="badge badge-success">Present</span>;
  if (status === 'absent') return <span className="badge badge-danger">Absent</span>;
  return <span className="badge badge-outline">Not marked</span>;
}

// ------------------------------------------------------------ seat meter

export function SeatMeter({ registered, capacity, muted = false }: { registered: number; capacity: number; muted?: boolean }) {
  const ratio = capacity ? Math.min(registered / capacity, 1) : 0;
  const tone = muted ? 'is-muted' : ratio >= 1 ? 'is-full' : ratio >= 0.75 ? 'is-warning' : '';
  return (
    <div
      className={`meter ${tone}`}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={capacity}
      aria-valuenow={registered}
      aria-label={`${registered} of ${capacity} seats taken`}
    >
      <span style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}

// ---------------------------------------------------------- month switcher

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => formatMonth(`2026-${String(i + 1).padStart(2, '0')}`).split(' ')[0]);

/** Previous / next arrows plus month and year pickers. */
export function MonthSwitcher({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const [year, monthNumber] = month.split('-').map(Number);
  const years = Array.from({ length: 7 }, (_, i) => year - 3 + i);
  const set = (y: number, m: number) => onChange(`${y}-${String(m).padStart(2, '0')}`);
  return (
    <div className="month-switcher" role="group" aria-label={`Selected month: ${formatMonth(month)}`}>
      <button type="button" className="icon-btn" onClick={() => onChange(addMonths(month, -1))} aria-label="Previous month">
        <ChevronLeft size={18} />
      </button>
      <select
        className="month-select"
        value={monthNumber}
        onChange={(event) => set(year, Number(event.target.value))}
        aria-label="Month"
      >
        {MONTH_NAMES.map((name, index) => (
          <option key={name} value={index + 1}>
            {name}
          </option>
        ))}
      </select>
      <select className="month-select" value={year} onChange={(event) => set(Number(event.target.value), monthNumber)} aria-label="Year">
        {years.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      <button type="button" className="icon-btn" onClick={() => onChange(addMonths(month, 1))} aria-label="Next month">
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ fields

interface FieldShellProps {
  label: string;
  id?: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}

export function Field({ label, id: providedId, error, hint, required, className, children }: FieldShellProps) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field ${className ?? ''}`}>
      <label className="field-label" htmlFor={id}>
        {label}
        {required && (
          <span className="req" aria-hidden>
            *
          </span>
        )}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <span className="field-hint" id={hintId}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field-error" id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

type Base = { label: string; error?: string; hint?: ReactNode; className?: string };

export function TextField({ label, id, error, hint, className, required, ...input }: Base & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} id={id} error={error} hint={hint} required={required} className={className}>
      {(field) => (
        <input
          {...input}
          id={field.id}
          className="input"
          aria-invalid={field.invalid}
          aria-describedby={field.describedBy}
          required={required}
        />
      )}
    </Field>
  );
}

export function SelectField({
  label,
  id,
  error,
  hint,
  className,
  required,
  children,
  ...select
}: Base & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} id={id} error={error} hint={hint} required={required} className={className}>
      {(field) => (
        <select
          {...select}
          id={field.id}
          className="select"
          aria-invalid={field.invalid}
          aria-describedby={field.describedBy}
          required={required}
        >
          {children}
        </select>
      )}
    </Field>
  );
}

export function TextAreaField({ label, id, error, hint, className, required, ...area }: Base & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} id={id} error={error} hint={hint} required={required} className={className}>
      {(field) => (
        <textarea
          {...area}
          id={field.id}
          className="textarea"
          aria-invalid={field.invalid}
          aria-describedby={field.describedBy}
          required={required}
        />
      )}
    </Field>
  );
}

// ------------------------------------------------------------------ states

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <span className="spinner" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  children,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden>
        <Icon size={24} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="empty-state" role="alert">
      <span className="empty-icon" aria-hidden style={{ color: 'var(--danger)', background: 'var(--danger-bg)' }}>
        <CircleAlert size={24} />
      </span>
      <h3>Something went wrong</h3>
      <p>{errorMessage(error)}</p>
      {onRetry && (
        <button type="button" className="btn btn-sm" onClick={onRetry}>
          <RefreshCw size={15} /> Try again
        </button>
      )}
    </div>
  );
}

// -------------------------------------------------------------------- menu

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  separatorBefore?: boolean;
}

export function ActionMenu({ items, label = 'More actions' }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <Ellipsis size={18} />
      </button>
      {open && (
        <div className="menu-list" role="menu" onClick={(event) => event.stopPropagation()}>
          {items
            .filter((item) => !item.hidden)
            .map((item) => (
              <div key={item.label}>
                {item.separatorBefore && <div className="menu-sep" />}
                <button
                  type="button"
                  role="menuitem"
                  className={`menu-item ${item.danger ? 'is-danger' : ''}`}
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                >
                  {item.icon && <item.icon size={16} />}
                  {item.label}
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
