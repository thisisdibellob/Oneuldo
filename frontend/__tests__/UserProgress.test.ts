import fs from 'fs';
import path from 'path';

import type { ActivityRecord } from '../src/game/activityAlbum';
import {
  ACTIVITY_XP,
  countStreak,
  createUserProgressStore,
  creditActivities,
  creditedXpFor,
  summarizeProgress,
  SUCCESS_BONUS_XP,
  USER_PROGRESS_STORAGE_KEY,
  type UserProgressState,
} from '../src/progress/userProgress';

const at = (day: number, hour = 10) => new Date(2026, 10, day, hour).getTime();
const record = (id: string, kind: ActivityRecord['kind'], completedAt: number): ActivityRecord => ({
  id, kind, sessionId: id, completedAt, title: '완료', place: '마을', summary: '요약', metrics: [], facts: [], favorite: false,
});
const empty: UserProgressState = { totalXp: 0, bestStreak: 0, activeDays: [], entries: [] };

describe('개인 레벨·연속 학습', () => {
  it('활동을 끝까지 마친 기록마다 정해진 XP를 한 번만 준다', () => {
    const records = [record('a', 'shopping', at(20)), record('b', 'bus', at(20, 11))];
    const once = creditActivities(empty, records);
    expect(once.totalXp).toBe(ACTIVITY_XP.shopping + ACTIVITY_XP.bus);
    expect(creditActivities(once, records)).toBe(once);
  });

  it('같은 종류는 하루 3번까지만 XP를 주고 기록과 활동일은 남긴다', () => {
    const records = [1, 2, 3, 4].map((n) => record(`s${n}`, 'shopping', at(20, 8 + n)));
    const state = creditActivities(empty, records);
    expect(state.totalXp).toBe(ACTIVITY_XP.shopping * 3);
    expect(state.entries).toHaveLength(4);
    expect(state.entries[3].xp).toBe(0);
    expect(state.activeDays).toEqual(['2026-11-20']);
  });

  it('목록까지 다 맞춘 장보기는 +10 보너스, 아쉬운 장보기도 기본 XP는 그대로 받는다', () => {
    const success = { ...record('ok', 'shopping', at(21)), outcome: 'success' as const };
    const retry = { ...record('retry', 'shopping', at(21, 11)), outcome: 'retry' as const };
    const state = creditActivities(empty, [success, retry]);
    expect(state.totalXp).toBe(ACTIVITY_XP.shopping + SUCCESS_BONUS_XP + ACTIVITY_XP.shopping);
    expect(state.activeDays).toEqual(['2026-11-21']);
  });

  it('결과 화면용으로 한 활동에 받은 XP를 기본·보너스·하루 한도로 나눠 읽는다', () => {
    const records = [1, 2, 3, 4].map((n) => ({ ...record(`m${n}`, 'shopping', at(22, 8 + n)), outcome: 'success' as const }));
    const state = creditActivities(empty, records);
    expect(creditedXpFor(state, 'm1')).toEqual({ total: 40, base: 30, bonus: 10, capped: false });
    expect(creditedXpFor(state, 'm4')).toEqual({ total: 0, base: 0, bonus: 0, capped: true });
    expect(creditedXpFor(state, 'none')).toBeNull();
  });

  it('100 XP마다 레벨이 오른다', () => {
    expect(summarizeProgress({ ...empty, totalXp: 99 }).level).toBe(1);
    expect(summarizeProgress({ ...empty, totalXp: 100 })).toMatchObject({ level: 2, levelXp: 0, xpToNextLevel: 100 });
    expect(summarizeProgress({ ...empty, totalXp: 230 })).toMatchObject({ level: 3, levelXp: 30, xpToNextLevel: 70 });
  });

  it('연속 학습은 오늘 기록이 없어도 어제까지 이어진 날을 세고, 최고 기록을 남긴다', () => {
    const state = creditActivities(empty, [record('1', 'bus', at(10)), record('2', 'bus', at(11)), record('3', 'bus', at(12)),
      record('4', 'bus', at(25)), record('5', 'bus', at(26))]);
    expect(countStreak(state.activeDays, at(26, 20))).toBe(2);
    expect(countStreak(state.activeDays, at(27, 8))).toBe(2);
    expect(countStreak(state.activeDays, at(28, 8))).toBe(0);
    expect(state.bestStreak).toBe(3);
  });

  it('앨범에서 오래된 기록이 빠져도 이미 받은 XP는 줄지 않는다', () => {
    const first = creditActivities(empty, [record('old', 'cafe', at(1)), record('new', 'cafe', at(2))]);
    expect(creditActivities(first, [record('new', 'cafe', at(2))]).totalXp).toBe(ACTIVITY_XP.cafe * 2);
  });

  it('자동화 실행(페르소나 재생·에이전트)에서는 기록을 쌓지 않는다', () => {
    const saved: Record<string, string> = {};
    const store = createUserProgressStore(() => ({ getItem: (key) => saved[key] ?? null, setItem: (key, value) => { saved[key] = value; } }));
    expect(store.sync([record('a', 'shopping', at(20))], true)).toBe(false);
    expect(store.getSnapshot().totalXp).toBe(0);
    expect(saved[USER_PROGRESS_STORAGE_KEY]).toBeUndefined();

    expect(store.sync([record('a', 'shopping', at(20))], false)).toBe(true);
    expect(JSON.parse(saved[USER_PROGRESS_STORAGE_KEY]).totalXp).toBe(ACTIVITY_XP.shopping);
  });

  it('저장소가 막혀 있어도 앱을 멈추지 않는다', () => {
    const store = createUserProgressStore(() => ({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } }));
    expect(() => store.sync([record('a', 'bus', at(20))], false)).not.toThrow();
    expect(store.getSnapshot().totalXp).toBe(ACTIVITY_XP.bus);
  });
});

describe('게임과의 격리', () => {
  const srcRoot = path.join(__dirname, '..', 'src');
  const files = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });

  it('개인 성장 기록은 탭 화면과 표시용 UI(결과 카드·휴대폰)에서만 읽는다', () => {
    const allowed = ['screens/AppShell.tsx', 'screens/HomeScreen.tsx', 'screens/QuestScreen.tsx', 'screens/ProfileScreen.tsx', 'screens/GameScreen.tsx',
      'components/game/MarketPurchaseResult.tsx', 'components/game/GamePhonePanel.tsx', 'progress/userProgress.ts'];
    const importers = files(srcRoot)
      .filter((file) => /progress\/userProgress/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(srcRoot, file).split(path.sep).join('/'));
    expect(importers.filter((file) => !allowed.includes(file))).toEqual([]);
    // 게임 규칙·AI·행동 로그·재생·에이전트·서버 코드는 절대 읽지 않는다.
    expect(importers.filter((file) => /^(game|ai|behavior|replay|agent|api)\//.test(file))).toEqual([]);
  });

  it('표시용 UI는 개인 기록을 읽기만 한다', () => {
    for (const file of ['components/game/MarketPurchaseResult.tsx', 'components/game/GamePhonePanel.tsx']) {
      const source = fs.readFileSync(path.join(srcRoot, file), 'utf8');
      expect(source).not.toMatch(/syncUserProgress|resetUserProgressForTests|creditActivities/);
    }
  });

  it('개인 성장 기록 모듈은 게임·AI·행동 로그·재생·서버 코드에 의존하지 않는다', () => {
    const source = fs.readFileSync(path.join(srcRoot, 'progress', 'userProgress.ts'), 'utf8');
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
    expect(imports.sort()).toEqual(['../game/activityAlbum', '../game/activityCalendar', 'react', 'react-native'].sort());
    expect(source).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket/);
  });
});
