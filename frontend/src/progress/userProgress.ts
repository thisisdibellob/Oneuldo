/**
 * 개인 성장 기록(레벨·연속 학습).
 *
 * 격리 규칙 — 반드시 지킨다:
 * - 이 모듈은 사용자에게 보여 주는 개인 기록일 뿐이다. 게임 퀘스트, 난이도, 장보기 미션, 행동 로그,
 *   AI 분석·추천, 페르소나 trace/재생, 서버 API 어디에도 값을 전달하지 않는다.
 * - 게임 규칙·AI·행동·재생·API 코드는 이 모듈을 import하지 않는다(`__tests__/UserProgress.test.ts`가 검사).
 *   게임 안에서는 결과 카드·휴대폰 같은 표시용 UI 컴포넌트만 읽기 전용으로 쓴다.
 * - 활동 앨범은 읽기만 한다. 앨범·게임 상태를 바꾸지 않는다.
 * - 자동화 실행(페르소나 재생, 에이전트, 개발용 실험 화면)에서는 기록을 쌓지 않는다.
 * - 네트워크 호출이 없다. 저장은 이 모듈 전용 키 하나뿐이다.
 */
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

import type { ActivityKind, ActivityRecord } from '../game/activityAlbum';
import { activityDateKey } from '../game/activityCalendar';

export const USER_PROGRESS_STORAGE_KEY = 'oneuldo.user-progress.v1';
export const XP_PER_LEVEL = 100;
export const DAILY_XP_LIMIT_PER_KIND = 3;
export const ACTIVITY_XP: Readonly<Record<ActivityKind, number>> = {
  shopping: 30,
  library: 30,
  cafe: 30,
  bus: 20,
  laundry: 20,
  safety: 20,
  delivery: 10,
};
/** 목록까지 모두 맞춘 활동(현재는 장보기)에 얹는 보너스. 실패해도 기본 XP는 그대로다. */
export const SUCCESS_BONUS_XP = 10;

const ENTRY_LIMIT = 1000;
const DAY_LIMIT = 800;
const MAX_BYTES = 200_000;
const DAY_MS = 86_400_000;
const KINDS = Object.keys(ACTIVITY_XP);

export type ProgressEntry = Readonly<{ id: string; kind: ActivityKind; day: string; xp: number }>;
export type UserProgressState = Readonly<{
  totalXp: number;
  bestStreak: number;
  activeDays: readonly string[];
  entries: readonly ProgressEntry[];
}>;
export type UserProgressSummary = Readonly<{
  level: number;
  totalXp: number;
  levelXp: number;
  xpToNextLevel: number;
  streak: number;
  bestStreak: number;
}>;
export type ProgressStorage = Pick<Storage, 'getItem' | 'setItem'>;

const EMPTY: UserProgressState = Object.freeze({ totalXp: 0, bestStreak: 0, activeDays: Object.freeze([]), entries: Object.freeze([]) });
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True while the app is driven by persona replay, the market agent, or a dev-only preview/lab entry. */
export function isAutomatedRun(): boolean {
  if (typeof __DEV__ !== 'undefined' && !__DEV__) return false;
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.location) return false;
  if (process.env.EXPO_PUBLIC_MARKET_AGENT_ENABLED === 'true') return true;
  const query = new URLSearchParams(window.location.search);
  return ['marketReplay', 'marketAgent', 'marketLab', 'libraryPreview', 'busPreview', 'phishingPreview', 'cafePreview', 'laundryPreview']
    .some((key) => query.get(key) === '1');
}

/** Consecutive active days ending today; a day without activity yet today does not break it. */
export function countStreak(activeDays: readonly string[], now: number = Date.now()): number {
  const active = new Set(activeDays);
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

function longestRun(activeDays: readonly string[]): number {
  const sorted = [...new Set(activeDays)].sort();
  let best = 0;
  let run = 0;
  let previous: number | null = null;
  for (const key of sorted) {
    const [y, m, d] = key.split('-').map(Number);
    const noon = new Date(y, m - 1, d, 12).getTime();
    run = previous !== null && Math.round((noon - previous) / DAY_MS) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = noon;
  }
  return best;
}

/** Pure: credit album records that were not credited before. Returns the same object when nothing changes. */
export function creditActivities(state: UserProgressState, records: readonly ActivityRecord[]): UserProgressState {
  const credited = new Set(state.entries.map((entry) => entry.id));
  const fresh = records.filter((record) => !credited.has(record.id) && KINDS.includes(record.kind) && Number.isFinite(record.completedAt))
    .sort((a, b) => a.completedAt - b.completedAt);
  if (fresh.length === 0) return state;
  const entries = [...state.entries];
  const days = new Set(state.activeDays);
  let totalXp = state.totalXp;
  for (const record of fresh) {
    const day = activityDateKey(record.completedAt);
    const sameKindToday = entries.filter((entry) => entry.day === day && entry.kind === record.kind && entry.xp > 0).length;
    const xp = sameKindToday < DAILY_XP_LIMIT_PER_KIND
      ? ACTIVITY_XP[record.kind] + (record.outcome === 'success' ? SUCCESS_BONUS_XP : 0) : 0;
    entries.push({ id: record.id, kind: record.kind, day, xp });
    days.add(day);
    totalXp += xp;
  }
  const activeDays = [...days].sort().slice(-DAY_LIMIT);
  return Object.freeze({
    totalXp,
    bestStreak: Math.max(state.bestStreak, longestRun(activeDays)),
    activeDays: Object.freeze(activeDays),
    entries: Object.freeze(entries.slice(-ENTRY_LIMIT)),
  });
}

export function summarizeProgress(state: UserProgressState, now: number = Date.now()): UserProgressSummary {
  const levelXp = state.totalXp % XP_PER_LEVEL;
  return {
    level: Math.floor(state.totalXp / XP_PER_LEVEL) + 1,
    totalXp: state.totalXp,
    levelXp,
    xpToNextLevel: XP_PER_LEVEL - levelXp,
    streak: countStreak(state.activeDays, now),
    bestStreak: state.bestStreak,
  };
}

function parseState(value: unknown): UserProgressState | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as { version?: unknown } & Partial<UserProgressState>;
  if (row.version !== 1 || !Number.isSafeInteger(row.totalXp) || (row.totalXp as number) < 0
    || !Number.isSafeInteger(row.bestStreak) || (row.bestStreak as number) < 0
    || !Array.isArray(row.activeDays) || !Array.isArray(row.entries)) return null;
  const activeDays = row.activeDays.filter((day): day is string => typeof day === 'string' && DAY_PATTERN.test(day)).slice(-DAY_LIMIT);
  const entries = row.entries.filter((entry): entry is ProgressEntry => !!entry && typeof entry.id === 'string' && entry.id.length <= 700
    && KINDS.includes(entry.kind) && typeof entry.day === 'string' && DAY_PATTERN.test(entry.day)
    && Number.isSafeInteger(entry.xp) && entry.xp >= 0).slice(-ENTRY_LIMIT);
  return Object.freeze({ totalXp: row.totalXp as number, bestStreak: row.bestStreak as number,
    activeDays: Object.freeze(activeDays), entries: Object.freeze(entries) });
}

function browserStorage(): ProgressStorage | null {
  try { return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage; } catch { return null; }
}

export function createUserProgressStore(storageProvider: () => ProgressStorage | null = browserStorage) {
  let initialized = false;
  let current: UserProgressState = EMPTY;
  const listeners = new Set<() => void>();
  const initialize = () => {
    if (initialized) return;
    initialized = true;
    try {
      const raw = storageProvider()?.getItem(USER_PROGRESS_STORAGE_KEY);
      if (!raw || raw.length > MAX_BYTES) return;
      current = parseState(JSON.parse(raw)) ?? EMPTY;
    } catch { /* A corrupt or blocked progress record must never block the app. */ }
  };
  const persist = () => {
    try { storageProvider()?.setItem(USER_PROGRESS_STORAGE_KEY, JSON.stringify({ version: 1, ...current })); } catch { /* keep in memory */ }
  };
  const getSnapshot = () => { initialize(); return current; };
  return {
    getSnapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    sync(records: readonly ActivityRecord[], automated: boolean = isAutomatedRun()) {
      initialize();
      if (automated) return false;
      const next = creditActivities(current, records);
      if (next === current) return false;
      current = next;
      persist();
      listeners.forEach((listener) => listener());
      return true;
    },
    resetForTests(state: UserProgressState = EMPTY) {
      initialized = true; current = state; listeners.forEach((listener) => listener());
    },
  };
}

const store = createUserProgressStore();
export const getUserProgress = store.getSnapshot;
export const syncUserProgress = store.sync;
export const resetUserProgressForTests = store.resetForTests;

export function useUserProgress(now: number = Date.now()): UserProgressSummary {
  const state = useSyncExternalStore(store.subscribe, getUserProgress, () => EMPTY);
  return summarizeProgress(state, now);
}

export type CreditedXp = Readonly<{ total: number; base: number; bonus: number; capped: boolean }>;

/** XP already credited for one activity record, or null while it is not credited (or in automated runs). Display only. */
export function creditedXpFor(state: UserProgressState, recordId: string): CreditedXp | null {
  const entry = state.entries.find((item) => item.id === recordId);
  if (!entry) return null;
  if (entry.xp === 0) return { total: 0, base: 0, bonus: 0, capped: true };
  const base = Math.min(entry.xp, ACTIVITY_XP[entry.kind]);
  return { total: entry.xp, base, bonus: entry.xp - base, capped: false };
}

export function useCreditedXp(recordId: string | null): CreditedXp | null {
  const state = useSyncExternalStore(store.subscribe, getUserProgress, () => EMPTY);
  return recordId ? creditedXpFor(state, recordId) : null;
}
