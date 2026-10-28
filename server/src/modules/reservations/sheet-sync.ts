import type { AppContext } from '../../context.ts';
import { RECORD_HEADERS, toRecord } from './reservation-records.ts';
import type { ReservationRepository } from './reservations.repository.ts';

const BATCH_SIZE = 20;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 60 * 60_000;

/**
 * Pushes reservation changes to a Google Sheet through an Apps Script web app.
 *
 * A row is queued (`sheet_outbox`) in the same transaction as the reservation change, so nothing is
 * lost when the sheet is unreachable. The queue stores only the reservation id: what is sent is the
 * reservation's *current* state, and the script upserts by Reservation ID, so retries are harmless.
 */
export class SheetSync {
  private readonly ctx: AppContext;
  private readonly repo: ReservationRepository;
  private running: Promise<void> | null = null;

  constructor(ctx: AppContext, repo: ReservationRepository) {
    this.ctx = ctx;
    this.repo = repo;
  }

  get enabled(): boolean {
    return Boolean(this.ctx.config.sheet.webhookUrl);
  }

  /** True while updates are queued for the sheet (sent, failed and waiting for a retry, or not yet sent). */
  hasPending(): boolean {
    return this.enabled && this.repo.pendingSheetSyncCount() > 0;
  }

  /** Call inside the reservation's transaction. */
  enqueue(reservationId: number): void {
    if (!this.enabled) return;
    this.repo.enqueueSheetSync(reservationId, this.ctx.clock.now().toISOString());
  }

  /** Sends everything that is due, one flush at a time. Never throws. */
  flush(): Promise<void> {
    if (!this.enabled) return Promise.resolve();
    this.running ??= this.drain()
      .catch((error: unknown) => this.ctx.log.error('Google Sheet sync failed', { error: String(error) }))
      .finally(() => {
        this.running = null;
        const next = this.repo.nextSheetSyncAt();
        if (next) this.ctx.scheduleRetry?.(new Date(next));
      });
    return this.running;
  }

  private async drain(): Promise<void> {
    for (let round = 0; round < 10; round++) {
      const due = this.repo.dueSheetSync(this.ctx.clock.now().toISOString(), BATCH_SIZE);
      if (due.length === 0) return;

      const byReservation = new Map<number, typeof due>();
      for (const item of due) byReservation.set(item.reservation_id, [...(byReservation.get(item.reservation_id) ?? []), item]);

      for (const [reservationId, items] of byReservation) {
        const ids = items.map((item) => item.id);
        const detail = this.repo.listDetailed(reservationId)[0];
        if (!detail) {
          this.repo.deleteSheetSync(ids);
          continue;
        }
        try {
          await this.post(toRecord(detail, this.ctx.config.timeZone));
          this.repo.deleteSheetSync(ids);
        } catch (error) {
          const attempts = Math.max(...items.map((item) => item.attempts)) + 1;
          const delay = Math.min(60_000 * 2 ** (attempts - 1), MAX_BACKOFF_MS);
          const message = error instanceof Error ? error.message : String(error);
          this.repo.failSheetSync(ids, attempts, new Date(this.ctx.clock.now().getTime() + delay).toISOString(), message);
          this.ctx.log.warn(`Google Sheet sync failed for reservation ${reservationId} (attempt ${attempts}): ${message}`);
        }
      }
    }
  }

  private async post(row: string[]): Promise<void> {
    const { webhookUrl, secret } = this.ctx.config.sheet;
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Apps Script web apps reject preflighted JSON types
      body: JSON.stringify({ secret, action: 'upsert', headers: RECORD_HEADERS, row }),
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Sheet webhook answered HTTP ${response.status}`);
    const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!result?.ok) throw new Error(`Sheet webhook refused the update: ${result?.error ?? 'unexpected response'}`);
  }
}
