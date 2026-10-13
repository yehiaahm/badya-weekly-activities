import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { readJson, STORAGE_KEYS, writeJson } from '../lib/storage.ts';
import { useToday } from '../lib/time.ts';
import { validMonth } from '../lib/weeks.ts';

/**
 * The month an admin is working on. Lives in the URL (?month=YYYY-MM) so
 * views are shareable, and is remembered for the tab so moving between
 * admin pages keeps the same month.
 */
export function useAdminMonth(): [string, (month: string) => void] {
  const [params, setParams] = useSearchParams();
  const today = useToday();
  const fromUrl = params.get('month');
  const month = validMonth(fromUrl, validMonth(readJson<string>(STORAGE_KEYS.adminMonth, 'session'), today.slice(0, 7)));

  useEffect(() => {
    writeJson(STORAGE_KEYS.adminMonth, month, 'session');
  }, [month]);

  const setMonth = (value: string) => {
    const next = new URLSearchParams(params);
    next.set('month', value);
    setParams(next, { replace: true });
  };
  return [month, setMonth];
}
