import { z } from 'zod'

export const SchedulePeriodSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  enabled: z.boolean(),
}).refine((period) => period.start !== period.end, {
  message: 'O início e o fim não podem ser iguais.',
  path: ['end'],
})

export type SchedulePeriod = z.infer<typeof SchedulePeriodSchema>

export function crossesMidnight(period: SchedulePeriod): boolean {
  return period.end < period.start
}

export function isScheduledAt(periods: SchedulePeriod[], date: Date): boolean {
  const weekday = date.getDay()
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  const previousWeekday = (weekday + 6) % 7
  return periods.some((period) => {
    if (!period.enabled) return false
    if (!crossesMidnight(period)) return period.weekday === weekday && time >= period.start && time < period.end
    return (period.weekday === weekday && time >= period.start) || (period.weekday === previousWeekday && time < period.end)
  })
}

/** Returns the first minute at which a future configured period is active. */
export function nextScheduledAt(periods: SchedulePeriod[], from: Date): Date | null {
  // Compile once: status queries otherwise format a time string and inspect
  // every period for each of the 11,520 minutes in the search window.
  const windows: Array<Array<{ start: number; end: number }>> = Array.from(
    { length: 7 }, () => [],
  );
  const toMinutes = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  let enabled = false;
  for (const period of periods) {
    if (!period.enabled) continue;
    enabled = true;
    const start = toMinutes(period.start);
    const end = toMinutes(period.end);
    if (crossesMidnight(period)) {
      windows[period.weekday]!.push({ start, end: 1_440 });
      windows[(period.weekday + 1) % 7]!.push({ start: 0, end });
    } else {
      windows[period.weekday]!.push({ start, end });
    }
  }
  if (!enabled || !Number.isFinite(from.getTime())) return null;
  const cursor = new Date(from);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);
  for (let minute = 0; minute < 8 * 24 * 60; minute += 1) {
    const time = cursor.getHours() * 60 + cursor.getMinutes();
    if (windows[cursor.getDay()]!.some(({ start, end }) => time >= start && time < end)) {
      return new Date(cursor);
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return null;
}
