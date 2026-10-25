import type { AppContext } from '../context.ts';
import { localToday } from '../context.ts';
import type { ActivityService } from '../modules/activities/activities.service.ts';

/**
 * The SAC kick-off activity (also shown on the /fitness page).
 * Capacity and end time are planning values: staff can change them in /admin.
 */
const FEATURED_EVENT = {
  name: 'Aerobics & Fitness',
  category: 'Fitness',
  description:
    'SAC community activity #1. Burn, move and enjoy: an aerobics and fitness session for all Badya students. ' +
    'A new fitness theme every week. Wear comfortable sports clothes and bring water.',
  date: '2026-10-28',
  startTime: '11:30',
  endTime: '12:30',
  location: 'Fitness / Activity Area',
  coach: 'Student Athlete Committee',
  capacity: 100,
  status: 'published',
} as const;

/**
 * Hosts without a persistent disk start with an empty database after every
 * restart. When FEATURED_EVENT is on, this puts the kick-off activity back so
 * the site always shows it. It only adds the activity when it is missing and
 * the day has not passed, so it never duplicates or resurrects an old event.
 */
export function ensureFeaturedEvent(ctx: AppContext, activities: ActivityService): void {
  if (!ctx.config.featuredEvent) return;
  if (FEATURED_EVENT.date < localToday(ctx)) return;
  const exists = activities.repo.existsIdentical({
    name: FEATURED_EVENT.name,
    date: FEATURED_EVENT.date,
    startTime: FEATURED_EVENT.startTime,
    location: FEATURED_EVENT.location,
  });
  if (exists) return;
  activities.create(FEATURED_EVENT, null);
  ctx.log.info(`Added the featured activity "${FEATURED_EVENT.name}" on ${FEATURED_EVENT.date}.`);
}
