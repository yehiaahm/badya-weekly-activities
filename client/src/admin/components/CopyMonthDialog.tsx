import { CircleCheck, CopyPlus } from 'lucide-react';
import { addMonths } from '@shared/dates.ts';
import { formatMonth } from '@shared/format.ts';
import type { CopyMonthResult } from '@shared/types.ts';
import { Dialog } from '../../components/Dialog.tsx';
import { useToast } from '../../components/feedback.tsx';
import { LoadingState } from '../../components/ui.tsx';
import { errorMessage } from '../../lib/api.ts';
import { useAdminActivities, useCopyPreviousMonth } from '../queries.ts';

interface Props {
  month: string;
  open: boolean;
  onClose: () => void;
  existingCount: number;
}

export function CopyMonthDialog({ month, open, onClose, existingCount }: Props) {
  const source = addMonths(month, -1);
  return (
    <Dialog open={open} onClose={onClose} title="Copy previous month" description={`${formatMonth(source)} → ${formatMonth(month)}`}>
      <CopyMonthBody month={month} source={source} existingCount={existingCount} onClose={onClose} />
    </Dialog>
  );
}

function CopyMonthBody({ month, source, existingCount, onClose }: { month: string; source: string; existingCount: number; onClose: () => void }) {
  const sourceQuery = useAdminActivities(source);
  const copy = useCopyPreviousMonth();
  const toast = useToast();
  const result: CopyMonthResult | undefined = copy.data;

  if (result) {
    return (
      <div className="stack">
        <div className="alert alert-success">
          <CircleCheck size={20} />
          <div>
            <div className="alert-title">
              {result.created} draft activit{result.created === 1 ? 'y' : 'ies'} added to {formatMonth(month)}
            </div>
            Review dates, times, locations and capacity, then publish them from the calendar.
          </div>
        </div>
        <dl className="kv">
          <dt>Already scheduled (skipped)</dt>
          <dd>{result.skippedExisting}</dd>
          <dt>Dates already passed (skipped)</dt>
          <dd>{result.skippedPast}</dd>
          <dt>No matching week this month</dt>
          <dd>{result.unmapped}</dd>
        </dl>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  }

  if (sourceQuery.isPending) return <LoadingState />;
  const sourceActivities = sourceQuery.data?.activities ?? [];
  const copyable = sourceActivities.filter((a) => a.status !== 'cancelled').length;

  return (
    <div className="stack">
      <p>
        {formatMonth(source)} has <strong>{sourceActivities.length}</strong> activities
        {sourceActivities.length !== copyable && ` (${sourceActivities.length - copyable} cancelled won't be copied)`}.
      </p>
      <ul className="muted" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
        <li>Activities keep their weekday and week: the 1st Sunday maps to the 1st Sunday, and so on. If this month has an extra week, it repeats the last week.</li>
        <li>Copies are created as <strong>drafts</strong> with fresh registration deadlines — students can't see them until you publish.</li>
        <li>Student reservations are never copied. Sessions that already exist, or whose date has passed, are skipped.</li>
      </ul>
      {existingCount > 0 && (
        <div className="alert alert-warning">
          <span>
            {formatMonth(month)} already has {existingCount} activit{existingCount === 1 ? 'y' : 'ies'}. New sessions will be added
            alongside them; identical ones are skipped.
          </span>
        </div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={copyable === 0 || copy.isPending}
          onClick={() => copy.mutate(month, { onError: (error) => toast.error(errorMessage(error)) })}
        >
          {copy.isPending ? <span className="spinner" aria-hidden /> : <CopyPlus size={17} />} Copy {copyable} activities
        </button>
      </div>
    </div>
  );
}
