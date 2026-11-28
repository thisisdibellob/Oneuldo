import { act, fireEvent, render } from '@testing-library/react-native';

import { resetActivityAlbumForTests, type ActivityRecord } from '../src/game/activityAlbum';
import {
  activityDateKey,
  buildActivityMonth,
  countActivitiesThisWeek,
  countActivityStreak,
  groupActivitiesByDay,
} from '../src/game/activityCalendar';
import { QuestScreen } from '../src/screens/QuestScreen';
import { resetUserProgressForTests, syncUserProgress } from '../src/progress/userProgress';

const at = (year: number, month: number, day: number, hour = 10, minute = 0) => new Date(year, month, day, hour, minute).getTime();
const record = (id: string, kind: ActivityRecord['kind'], completedAt: number, title = '장보기 완료'): ActivityRecord => ({
  id, kind, sessionId: id, completedAt, title, place: '하늘마트', summary: '2개 · 4,500원', metrics: [], facts: [], favorite: false,
});

afterEach(() => { resetActivityAlbumForTests(); resetUserProgressForTests(); });

describe('activityCalendar', () => {
  it('11월 2026년을 일요일부터 시작하는 주로 나누고 이웃 달 날짜를 구분한다', () => {
    const weeks = buildActivityMonth(2026, 10, [], at(2026, 10, 27));
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toMatchObject({ day: 1, inMonth: true });
    expect(weeks[4][6]).toMatchObject({ day: 5, month: 11, inMonth: false });
    expect(weeks.flat().find((cell) => cell.isToday)?.key).toBe('2026-11-27');
  });

  it('완료한 활동을 그날 칸에 완료 순서대로 넣는다', () => {
    const records = [record('b', 'bus', at(2026, 10, 27, 15)), record('a', 'shopping', at(2026, 10, 27, 9)), record('c', 'cafe', at(2026, 10, 26))];
    const cell = buildActivityMonth(2026, 10, records, at(2026, 10, 27)).flat().find((day) => day.key === '2026-11-27');
    expect(cell?.records.map((item) => item.id)).toEqual(['a', 'b']);
    expect(groupActivitiesByDay(records).get('2026-11-26')).toHaveLength(1);
  });

  it('연속 학습은 오늘 기록이 아직 없어도 어제까지 이어진 날을 센다', () => {
    const records = [record('1', 'bus', at(2026, 10, 24)), record('2', 'bus', at(2026, 10, 25)), record('3', 'bus', at(2026, 10, 26))];
    expect(countActivityStreak(records, at(2026, 10, 26, 20))).toBe(3);
    expect(countActivityStreak(records, at(2026, 10, 27, 8))).toBe(3);
    expect(countActivityStreak(records, at(2026, 10, 28, 8))).toBe(0);
    expect(countActivityStreak([], at(2026, 10, 28))).toBe(0);
  });

  it('이번 주 완료는 일요일 0시부터 센다', () => {
    const records = [record('1', 'bus', at(2026, 10, 21, 23)), record('2', 'bus', at(2026, 10, 22, 0, 1)), record('3', 'bus', at(2026, 10, 27))];
    expect(countActivitiesThisWeek(records, at(2026, 10, 27, 12))).toBe(2);
  });

  it('날짜 키는 기기 현지 날짜를 쓴다', () => {
    expect(activityDateKey(at(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('퀘스트 탭 달력', () => {
  it('실제 활동 기록으로 오늘 칸과 통계, 날짜별 상세를 보여준다', () => {
    const now = new Date();
    const today = at(now.getFullYear(), now.getMonth(), now.getDate(), 0, 1);
    const todayRecords = [record('today-1', 'shopping', today), record('today-2', 'bus', today + 60_000, '도서관까지 버스 타기')];
    act(() => { resetActivityAlbumForTests(todayRecords); syncUserProgress(todayRecords, false); });
    const screen = render(<QuestScreen />);

    expect(screen.getAllByTestId('calendar-day-check')).toHaveLength(1);
    expect(screen.queryByText('버스 타기')).toBeNull();
    expect(screen.getByText('장보기 완료')).toBeTruthy();
    expect(screen.getByText('도서관까지 버스 타기')).toBeTruthy();
    expect(screen.getByText('00:01 · 하늘마트')).toBeTruthy();
    expect(screen.getAllByText('1일')).toHaveLength(2);
    expect(screen.getByText('2회')).toBeTruthy();
    expect(screen.getByLabelText('연속 학습 1일')).toBeTruthy();
  });

  it('월 제목을 누르면 연·월을 골라 원하는 달로 바로 간다', () => {
    const screen = render(<QuestScreen />);
    const now = new Date();
    fireEvent.press(screen.getByRole('button', { name: `${now.getMonth() + 1}월, 다른 달 고르기` }));
    expect(screen.getByTestId('month-picker')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '이전 해' }));
    fireEvent.press(screen.getByRole('button', { name: `${now.getFullYear() - 1}년 3월로 이동` }));
    expect(screen.queryByTestId('month-picker')).toBeNull();
    expect(screen.getByText(`${now.getFullYear() - 1}년 3월`)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: '오늘로 이동' }));
    expect(screen.getByText(`${now.getMonth() + 1}월`)).toBeTruthy();
  });

  it('달을 넘기고 오늘로 돌아오며, 기록 없는 날은 빈 상태를 보여준다', () => {
    const screen = render(<QuestScreen />);
    const now = new Date();
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    fireEvent.press(screen.getByRole('button', { name: '이전 달' }));
    const previousLabel = previous.getFullYear() === now.getFullYear() ? `${previous.getMonth() + 1}월` : `${previous.getFullYear()}년 ${previous.getMonth() + 1}월`;
    expect(screen.getByText(previousLabel)).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: new RegExp(`^${previous.getMonth() + 1}월 1일,`) }));
    expect(screen.getByText('이날 완료한 활동이 없어요.')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: '오늘로 이동' }));
    expect(screen.getByText(`${now.getMonth() + 1}월`)).toBeTruthy();
    expect(screen.getByText('오늘 마을에서 활동을 마치면 여기에 기록돼요.')).toBeTruthy();
  });
});
