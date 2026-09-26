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
  const cursor = new Date(from);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);
  for (let minute = 0; minute < 8 * 24 * 60; minute += 1) {
    if (isScheduledAt(periods, cursor)) return new Date(cursor);
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return null;
}
