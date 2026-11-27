import type { ActivityKind, ActivityRecord } from './activityAlbum';

/** Shared colours for activity kinds on the quest calendar and the game tab's recent records. */
export const ACTIVITY_KIND_VISUALS: Readonly<Record<ActivityKind, { chip: string; dot: string; label: string }>> = {
  bus: { chip: '#D9EFFF', dot: '#36BFEA', label: '버스 타기' },
  library: { chip: '#D7F5E1', dot: '#18C339', label: '도서관' },
  shopping: { chip: '#FFD8CE', dot: '#FF7B5C', label: '장보기' },
  delivery: { chip: '#FFF0B7', dot: '#F1B921', label: '물품 전달' },
  safety: { chip: '#FFDDE7', dot: '#E04173', label: '연락 확인' },
  cafe: { chip: '#F2E5D5', dot: '#B9875A', label: '카페 근무' },
  laundry: { chip: '#E7D9FF', dot: '#9A7BE0', label: '빨래' },
};

export type ActivityCalendarDay = Readonly<{
  key: string;
  year: number;
  month: number;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  records: readonly ActivityRecord[];
}>;

const DAY_MS = 86_400_000;

/** Local calendar date key (YYYY-MM-DD) so records land on the day the player saw on their device. */
export function activityDateKey(time: number | Date): string {
  const date = typeof time === 'number' ? new Date(time) : time;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Records grouped per local day, each day in the order the activities were completed. */
export function groupActivitiesByDay(records: readonly ActivityRecord[]): ReadonlyMap<string, readonly ActivityRecord[]> {
  const days = new Map<string, ActivityRecord[]>();
  for (const record of records) {
    const key = activityDateKey(record.completedAt);
    const list = days.get(key);
    if (list) list.push(record);
    else days.set(key, [record]);
  }
  days.forEach((list) => list.sort((a, b) => a.completedAt - b.completedAt));
  return days;
}

/** Sunday-first weeks covering the month. Leading/trailing days of the neighbouring months are marked. */
export function buildActivityMonth(
  year: number,
  month: number,
  records: readonly ActivityRecord[],
  now: number = Date.now(),
): readonly (readonly ActivityCalendarDay[])[] {
  const byDay = groupActivitiesByDay(records);
  const todayKey = activityDateKey(now);
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const rows = Math.ceil((first.getDay() + daysInMonth) / 7);
  const weeks: ActivityCalendarDay[][] = [];
  for (let row = 0; row < rows; row += 1) {
    const week: ActivityCalendarDay[] = [];
    for (let column = 0; column < 7; column += 1) {
      const date = new Date(year, month, 1 - first.getDay() + row * 7 + column);
      const key = activityDateKey(date);
      week.push({
        key,
        year: date.getFullYear(),
        month: date.getMonth(),
        day: date.getDate(),
        inMonth: date.getMonth() === month,
        isToday: key === todayKey,
        records: byDay.get(key) ?? [],
      });
    }
    weeks.push(week);
  }
  return weeks;
}

/** Consecutive days with at least one completed activity. A day without activity yet today does not break it. */
export function countActivityStreak(records: readonly ActivityRecord[], now: number = Date.now()): number {
  if (records.length === 0) return 0;
  const active = new Set(records.map((record) => activityDateKey(record.completedAt)));
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  if (!active.has(activityDateKey(cursor))) cursor.setTime(cursor.getTime() - DAY_MS);
  let streak = 0;
  while (active.has(activityDateKey(cursor))) {
    streak += 1;
    cursor.setTime(cursor.getTime() - DAY_MS);
  }
  return streak;
}

/** Activities completed since this week's Sunday 00:00 (local time). */
export function countActivitiesThisWeek(records: readonly ActivityRecord[], now: number = Date.now()): number {
  const today = new Date(now);
  const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay()).getTime();
  return records.filter((record) => record.completedAt >= weekStart && record.completedAt <= now).length;
}
