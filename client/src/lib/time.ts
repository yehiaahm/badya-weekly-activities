import { useEffect, useState } from 'react';
import { nowIn, type LocalDateTime } from '@shared/dates.ts';
import { useConfig } from './queries.ts';

export const DEFAULT_TIME_ZONE = 'Africa/Cairo';

/** Wall-clock "now" at the university, re-evaluated every 30 seconds. */
export function useUniversityNow(): LocalDateTime {
  const timeZone = useConfig().data?.timeZone ?? DEFAULT_TIME_ZONE;
  const [now, setNow] = useState(() => nowIn(timeZone));
  useEffect(() => {
    setNow(nowIn(timeZone));
    const timer = window.setInterval(() => setNow(nowIn(timeZone)), 30_000);
    return () => window.clearInterval(timer);
  }, [timeZone]);
  return now;
}

export function useToday(): string {
  return useUniversityNow().slice(0, 10);
}
