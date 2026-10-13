import { Ban, CircleCheck, EyeOff, Lock, LockOpen, RotateCcw, Send, type LucideIcon } from 'lucide-react';
import { formatFullDate } from '@shared/format.ts';
import type { StoredStatus } from '@shared/status.ts';
import type { AdminActivityDTO } from '@shared/types.ts';
import { useConfirm, useToast } from '../../components/feedback.tsx';
import { errorMessage } from '../../lib/api.ts';
import { useDeleteActivity, useSetStatus } from '../queries.ts';

export interface StatusAction {
  status: StoredStatus;
  label: string;
  icon: LucideIcon;
  danger?: boolean;
}

/** Lifecycle moves that make sense from the activity's current state. */
export function statusActions(activity: AdminActivityDTO, today: string): StatusAction[] {
  const actions: StatusAction[] = [];
  const hasStarted = activity.date <= today;
  switch (activity.storedStatus) {
    case 'draft':
      actions.push({ status: 'published', label: 'Publish', icon: Send });
      break;
    case 'published':
      if (activity.status !== 'completed') actions.push({ status: 'registration_closed', label: 'Close registration', icon: Lock });
      if (activity.registeredCount === 0) actions.push({ status: 'draft', label: 'Unpublish', icon: EyeOff });
      break;
    case 'registration_closed':
      actions.push({ status: 'published', label: 'Reopen registration', icon: LockOpen });
      break;
    case 'completed':
      actions.push({ status: 'published', label: 'Reopen activity', icon: RotateCcw });
      break;
    case 'cancelled':
      actions.push({ status: 'published', label: 'Restore activity', icon: RotateCcw });
      break;
  }
  if (hasStarted && activity.storedStatus !== 'completed' && activity.storedStatus !== 'cancelled' && activity.storedStatus !== 'draft') {
    actions.push({ status: 'completed', label: 'Mark as completed', icon: CircleCheck });
  }
  if (activity.storedStatus !== 'cancelled' && activity.storedStatus !== 'draft') {
    actions.push({ status: 'cancelled', label: 'Cancel activity', icon: Ban, danger: true });
  }
  return actions;
}

const SUCCESS: Record<StoredStatus, string> = {
  draft: 'moved back to draft',
  published: 'published',
  registration_closed: 'registration closed',
  completed: 'marked as completed',
  cancelled: 'cancelled',
};

export function useActivityActions() {
  const confirm = useConfirm();
  const toast = useToast();
  const setStatus = useSetStatus();
  const remove = useDeleteActivity();

  const changeStatus = async (activity: AdminActivityDTO, status: StoredStatus) => {
    if (status === 'cancelled') {
      const ok = await confirm({
        title: `Cancel ${activity.name}?`,
        message: `${formatFullDate(activity.date)}. It stays visible to students as "Cancelled" and stops accepting reservations.${
          activity.registeredCount ? ` ${activity.registeredCount} registered student(s) will see it cancelled in My Reservations.` : ''
        }`,
        confirmLabel: 'Cancel activity',
        cancelLabel: 'Keep it',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setStatus.mutate(
      { ids: [activity.id], status },
      {
        onSuccess: (result) =>
          result.failed.length ? toast.error(result.failed[0].message) : toast.success(`${activity.name} ${SUCCESS[status]}`),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  const bulkStatus = (ids: number[], status: StoredStatus, done?: () => void) => {
    setStatus.mutate(
      { ids, status },
      {
        onSuccess: (result) => {
          if (result.updated) toast.success(`${result.updated} activit${result.updated === 1 ? 'y' : 'ies'} ${SUCCESS[status]}`);
          if (result.failed.length) toast.error(`${result.failed.length} not changed: ${result.failed[0].message}`);
          if (!result.updated && !result.failed.length) toast.info('Nothing to change.');
          done?.();
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  const deleteActivity = async (activity: AdminActivityDTO, done?: () => void) => {
    if (activity.registeredCount > 0) {
      toast.error(`${activity.name} has registered students — cancel it instead so the history is kept.`);
      return;
    }
    const ok = await confirm({
      title: `Delete ${activity.name}?`,
      message: `${formatFullDate(activity.date)}. This permanently removes the activity. This can't be undone.`,
      confirmLabel: 'Delete activity',
      tone: 'danger',
    });
    if (!ok) return;
    remove.mutate(activity.id, {
      onSuccess: () => {
        toast.success(`${activity.name} deleted`);
        done?.();
      },
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  return { changeStatus, bulkStatus, deleteActivity, busy: setStatus.isPending || remove.isPending };
}
