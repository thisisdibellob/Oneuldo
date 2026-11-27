import { useMemo, useState } from 'react';
import { Image, ImageSourcePropType, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { icons } from '../assets';
import { QuestDifficulty, QuestSummary } from '../api/quest';
import { PressScale } from '../components/PressScale';
import { StickyBrandHeader } from '../components/ui';
import { colors, fonts } from '../theme';
import { getShoppingErrandStatus, useShoppingErrand } from '../game/shoppingErrandStore';
import { laundryArt } from '../game/laundryArt';
import { useActivityAlbum } from '../game/activityAlbum';
import {
  ACTIVITY_KIND_VISUALS as activityVisuals,
  activityDateKey,
  buildActivityMonth,
  countActivitiesThisWeek,
  groupActivitiesByDay,
  type ActivityCalendarDay,
} from '../game/activityCalendar';
import { useUserProgress } from '../progress/userProgress';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const categories = ['전체', '대중교통', '생활 훈련', '경제생활', '안전'];
const localGameQuests = [
  {id:'market',category:'경제생활',icon:icons.money,title:'마트에서 장보기',description:'예산 안에서 필요한 물건을\n직접 골라 계산해요.'},
  {id:'cafe',category:'생활 훈련',icon:icons.cashier,title:'카페 첫 근무',description:'주문을 받고 음료를 만들어요.\n손님 세 명과 함께하는 작은 카페'},
  {id:'laundry',category:'생활 훈련',icon:laundryArt.basket,title:'동네 빨래방',description:'빨래를 나누고 세탁한 뒤,\n집 옷장에 차곡차곡 정리해요.'},
  {id:'phishing',category:'안전',icon:icons.gamePhone,title:'수상한 연락 확인하기',description:'민수에게 온 연락, 직접 확인해요.\n한 이야기 3~5분'},
] as const;
const categoryVisuals: Record<string, { color: string; icon: ImageSourcePropType }> = {
  ECONOMIC_LIFE: { color: '#33BB5B', icon: icons.money },
  PUBLIC_TRANSPORT: { color: '#57ABD8', icon: icons.bus },
  DAILY_LIFE: { color: '#EFAC2B', icon: icons.cashier },
  SAFETY: { color: '#E04173', icon: icons.sos },
};
const difficultyLabels: Record<QuestDifficulty, string> = {
  VERY_EASY: '매우 쉬움',
  EASY: '쉬움',
  NORMAL: '보통',
  HARD: '어려움',
  VERY_HARD: '매우 어려움',
};

export function QuestScreen({
  onPractice,
  error,
  loading,
  onGameQuest,
  onQuest,
  quests = [],
  showPersonalDifficulty,
}: {
  error?: string | null;
  onPractice?: () => void;
  loading?: boolean;
  /** Village story quests (library day, errand). Server quest cards always open practice via onQuest. */
  onGameQuest?: (activity: 'day' | 'errand' | 'market' | 'cafe' | 'laundry' | 'phishing') => void;
  onQuest?: (uuid: string) => void;
  quests?: QuestSummary[];
  showPersonalDifficulty?: boolean;
}) {
  const errand = useShoppingErrand();
  const [selected, setSelected] = useState('전체');
  const visible = selected === '전체'
    ? quests
    : quests.filter((item) => item.categoryName === selected);
  const transportQuest = quests.find((quest) => quest.categoryCode === 'PUBLIC_TRANSPORT');
  const showTransportDifficulty = showPersonalDifficulty
    && transportQuest !== undefined
    && (selected === '전체' || selected === '대중교통');

  const records = useActivityAlbum();
  const [viewMonth, setViewMonth] = useState(() => {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() };
  });
  const [selectedDay, setSelectedDay] = useState(() => activityDateKey(Date.now()));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const now = Date.now();
  const todayKey = activityDateKey(now);
  const weeks = useMemo(() => buildActivityMonth(viewMonth.year, viewMonth.month, records), [records, viewMonth]);
  const byDay = useMemo(() => groupActivitiesByDay(records), [records]);
  const selectedRecords = byDay.get(selectedDay) ?? [];
  const { streak } = useUserProgress(now);
  const weekCount = countActivitiesThisWeek(records, now);
  const activeDaysInMonth = weeks.flat().filter((cell) => cell.inMonth && cell.records.length > 0).length;
  const monthLabel = viewMonth.year === new Date(now).getFullYear()
    ? `${viewMonth.month + 1}월`
    : `${viewMonth.year}년 ${viewMonth.month + 1}월`;
  const viewingToday = viewMonth.year === new Date(now).getFullYear()
    && viewMonth.month === new Date(now).getMonth()
    && selectedDay === todayKey;

  const shiftMonth = (delta: number) => setViewMonth((current) => {
    const next = new Date(current.year, current.month + delta, 1);
    return { year: next.getFullYear(), month: next.getMonth() };
  });
  const selectCell = (cell: ActivityCalendarDay) => {
    setSelectedDay(cell.key);
    if (!cell.inMonth) setViewMonth({ year: cell.year, month: cell.month });
  };
  const goToday = () => {
    const today = new Date();
    setViewMonth({ year: today.getFullYear(), month: today.getMonth() });
    setSelectedDay(activityDateKey(today));
  };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} stickyHeaderIndices={[0]}>
      <StickyBrandHeader horizontalPadding={18} />
      {errand && onGameQuest ? <PressScale accessibilityRole="button" accessibilityLabel="퇴근길 장보기 퀘스트 열기" onPress={() => onGameQuest('errand')} style={[styles.dayCard, { backgroundColor: '#F1EAD8' }]}><View style={styles.dayCardIcon}><Ionicons name="basket-outline" size={32} color="#78815C" /></View><View style={{ flex: 1 }}><Text style={styles.dayEyebrow}>민수의 부탁</Text><Text style={styles.dayTitle}>퇴근길 장보기</Text><Text style={styles.dayCopy}>{getShoppingErrandStatus(errand)}</Text><Text style={styles.dayAction}>{errand.phase === 'delivered' ? '전달한 물건 보기' : '부탁 확인하기'}</Text></View><Ionicons name="chevron-forward" color="#819178" size={23} /></PressScale> : null}
      <View style={styles.monthHeader}>
        <View style={styles.monthNav}>
          <Pressable accessibilityRole="button" accessibilityLabel="이전 달" hitSlop={10} onPress={() => shiftMonth(-1)} style={styles.monthArrow}>
            <Ionicons color="#999999" name="chevron-back" size={18} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`${monthLabel}, 다른 달 고르기`} accessibilityState={{ expanded: pickerOpen }}
            hitSlop={6} onPress={() => { setPickerYear(viewMonth.year); setPickerOpen((open) => !open); }} style={styles.monthButton}>
            <Text accessibilityRole="header" style={styles.month}>{monthLabel}</Text>
            <Ionicons color="#BBBBBB" name={pickerOpen ? 'caret-up' : 'caret-down'} size={12} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="다음 달" hitSlop={10} onPress={() => shiftMonth(1)} style={styles.monthArrow}>
            <Ionicons color="#999999" name="chevron-forward" size={18} />
          </Pressable>
          {!viewingToday ? (
            <Pressable accessibilityRole="button" accessibilityLabel="오늘로 이동" hitSlop={8} onPress={goToday} style={styles.todayButton}>
              <Text style={styles.todayButtonText}>오늘</Text>
            </Pressable>
          ) : null}
        </View>
        <View accessibilityLabel={`연속 학습 ${streak}일`} style={styles.streak}>
          <Ionicons color={streak > 0 ? '#FF6C64' : '#CCCCCC'} name="flame" size={20} />
          <Text style={styles.streakText}>{streak}</Text>
        </View>
      </View>
      {pickerOpen ? (
        <View style={styles.picker} testID="month-picker">
          <View style={styles.pickerYearRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="이전 해" hitSlop={10} onPress={() => setPickerYear((year) => year - 1)} style={styles.monthArrow}>
              <Ionicons color="#999999" name="chevron-back" size={18} />
            </Pressable>
            <Text style={styles.pickerYear}>{pickerYear}년</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="다음 해" hitSlop={10} onPress={() => setPickerYear((year) => year + 1)} style={styles.monthArrow}>
              <Ionicons color="#999999" name="chevron-forward" size={18} />
            </Pressable>
          </View>
          <View style={styles.pickerGrid}>
            {Array.from({ length: 12 }, (_, month) => {
              const current = pickerYear === viewMonth.year && month === viewMonth.month;
              const isThisMonth = pickerYear === new Date(now).getFullYear() && month === new Date(now).getMonth();
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${pickerYear}년 ${month + 1}월로 이동`}
                  accessibilityState={{ selected: current }}
                  key={month}
                  onPress={() => { setViewMonth({ year: pickerYear, month }); setPickerOpen(false); }}
                  style={[styles.pickerMonth, current && styles.pickerMonthCurrent]}
                >
                  <Text style={[styles.pickerMonthText, isThisMonth && styles.pickerMonthToday, current && styles.pickerMonthTextCurrent]}>{month + 1}월</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      <View style={styles.calendar}>
        <View style={styles.weekHeader}>
          {WEEKDAYS.map((day) => <Text key={day} style={styles.weekLabel}>{day}</Text>)}
        </View>
        {weeks.map((week) => (
          <View key={week[0].key} style={styles.week}>
            {week.map((cell) => {
              const done = cell.records.length > 0;
              const isSelected = cell.key === selectedDay;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${cell.month + 1}월 ${cell.day}일${cell.isToday ? ', 오늘' : ''}, 완료한 활동 ${cell.records.length}개`}
                  accessibilityState={{ selected: isSelected }}
                  key={cell.key}
                  onPress={() => selectCell(cell)}
                  style={[styles.dayCell, isSelected && styles.dayCellSelected]}
                >
                  <View style={[styles.dayNumber, cell.isToday && styles.todayNumber]}>
                    <Text style={[styles.day, !cell.inMonth && styles.mutedDay, cell.isToday && styles.todayText]}>{cell.day}</Text>
                  </View>
                  {done ? (
                    <View testID="calendar-day-check" style={[styles.check, !cell.inMonth && styles.mutedEvent]}>
                      <Ionicons color={colors.white} name="checkmark" size={16} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.dayDetail}>
        <Text style={styles.dayDetailTitle}>{formatSelectedDay(selectedDay, todayKey)}</Text>
        {selectedRecords.length === 0 ? (
          <Text style={styles.dayDetailEmpty}>
            {selectedDay === todayKey ? '오늘 마을에서 활동을 마치면 여기에 기록돼요.' : selectedDay > todayKey ? '아직 오지 않은 날이에요.' : '이날 완료한 활동이 없어요.'}
          </Text>
        ) : selectedRecords.map((record) => (
          <View key={record.id} style={styles.recordRow}>
            <View style={[styles.recordDot, { backgroundColor: activityVisuals[record.kind].dot }]} />
            <View style={styles.recordCopy}>
              <Text style={styles.recordTitle}>
                {record.title}
                {record.outcome ? <Text style={record.outcome === 'success' ? styles.outcomeSuccess : styles.outcomeRetry}>
                  {record.outcome === 'success' ? '  · 성공' : '  · 다시 해 보기'}
                </Text> : null}
              </Text>
              <Text style={styles.recordMeta}>{formatTime(record.completedAt)} · {record.place}</Text>
              <Text style={styles.recordSummary}>{record.summary}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.stats}>
        <Stat background="#FFF0EB" color="#FF745C" icon="flame" label="연속 학습" value={`${streak}일`} />
        <Stat background="#E8F8FF" color="#31AEE8" icon="flash" label="이번 주 완료" value={`${weekCount}회`} />
        <Stat background="#FFF6D7" color="#F1B921" icon="ribbon" label={`${viewMonth.month + 1}월 활동일`} value={`${activeDaysInMonth}일`} />
      </View>

      <Text style={styles.sectionTitle}>추천 퀘스트</Text>
      <ScrollView contentContainerStyle={styles.filters} horizontal showsHorizontalScrollIndicator={false} style={styles.edgeScroll}>
        {categories.map((category) => (
          <PressScale key={category} onPress={() => setSelected(category)} style={[styles.filter, selected === category && styles.filterSelected]}>
            <Text style={[styles.filterText, selected === category && styles.filterTextSelected]}>{category}</Text>
          </PressScale>
        ))}
      </ScrollView>

      {showTransportDifficulty ? (
        <View style={styles.difficultyBanner}>
          <View>
            <Text style={styles.difficultyEyebrow}>나의 대중교통 난이도</Text>
            <Text style={styles.difficultyDescription}>최근 퀘스트 수행 결과에 따라 자동으로 조정돼요.</Text>
          </View>
          <View style={styles.difficultyBadge}>
            <Text style={styles.difficultyBadgeText}>
              {difficultyLabels[transportQuest.difficulty]}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.questList}>
        {localGameQuests.filter(q=>selected==='전체'||q.category===selected).map(quest=><PressScale key={quest.id} accessibilityRole="button" accessibilityLabel={quest.title+' 퀘스트 열기'} onPress={()=>onGameQuest?onGameQuest(quest.id):onPractice?.()} style={styles.questCard}>
          <Image source={quest.icon} style={styles.questIcon}/><View style={styles.questCopy}><Text style={styles.questCategory}>{quest.category==='생활 훈련'?'일상생활':quest.category}</Text><Text style={styles.questTitle}>{quest.title}</Text><Text style={styles.questDescription}>{quest.description}</Text></View>
        </PressScale>)}
        {loading ? <Text style={styles.questState}>퀘스트를 불러오고 있어요.</Text> : null}
        {!loading && error ? (
          <View accessible accessibilityLabel="퀘스트를 불러올 수 없어요" style={styles.unavailableCard} testID="quest-unavailable">
            <Ionicons color="#8A8A8A" name="alert-circle-outline" size={28} />
            <Text style={styles.unavailableText}>불러올 수 없어요.</Text>
          </View>
        ) : null}
        {!loading && !error && visible.length === 0 ? <Text style={styles.questState}>표시할 퀘스트가 없어요.</Text> : null}
        {visible.map((quest) => <QuestCard key={quest.id} onPress={() => onQuest?.(quest.id)} quest={quest} />)}
      </View>
      <View style={styles.bottomSpace} />
    </ScrollView>
  );
}

function formatSelectedDay(key: string, todayKey: string) {
  const [year, month, day] = key.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()];
  return `${key === todayKey ? '오늘 · ' : ''}${month}월 ${day}일 (${weekday})`;
}

function formatTime(time: number) {
  const date = new Date(time);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function Stat({ background, color, icon, label, value }: { background: string; color: string; icon: 'flame' | 'flash' | 'ribbon'; label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: background }]}><Ionicons color={color} name={icon} size={18} /></View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function QuestCard({ quest, onPress }: { quest: QuestSummary; onPress: () => void }) {
  const visual = categoryVisuals[quest.categoryCode] ?? categoryVisuals.DAILY_LIFE;
  const difficultyLabel = difficultyLabels[quest.difficulty];
  return (
    <PressScale onPress={onPress} style={styles.questCard}>
      <Image resizeMode="contain" source={visual.icon} style={styles.questIcon} />
      <View style={styles.questCopy}>
        <Text style={[styles.questCategory, { color: visual.color }]}>{quest.categoryName}</Text>
        <Text style={styles.questTitle}>{quest.title}</Text>
        <Text style={styles.questDescription}>{quest.summary}</Text>
      </View>
      <View style={styles.questProgress}>
        <View style={[styles.xpPill, { backgroundColor: visual.color }]}><Text style={styles.xpText}>+{quest.rewardPoints} XP</Text></View>
        <Text style={[styles.stepText, { color: visual.color }]}>{difficultyLabel}</Text>
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  dayCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 20, marginTop: 20, backgroundColor: '#EFF0E4', borderRadius: 24 },
  dayCardIcon: { width: 58, height: 68, backgroundColor: '#E1E7D3', borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dayEyebrow: { color: '#879075', fontFamily: fonts.semibold, fontSize: 13 },
  dayTitle: { color: '#445E4C', fontFamily: fonts.laundryBold, fontSize: 22, lineHeight: 30, marginTop: 4 },
  dayCopy: { color: '#717D68', fontFamily: fonts.medium, fontSize: 15, lineHeight: 23, marginTop: 7 },
  dayAction: { color: '#4E7656', fontFamily: fonts.bold, fontSize: 15, marginTop: 12 },
  content: { alignSelf: 'center', maxWidth: 720, paddingHorizontal: 18, width: '100%' },
  monthHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  monthNav: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  monthButton: { alignItems: 'center', flexDirection: 'row', gap: 3 },
  picker: { backgroundColor: '#FAFAFA', borderRadius: 18, marginTop: 10, paddingBottom: 12, paddingHorizontal: 12, paddingTop: 8 },
  pickerYearRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 12 },
  pickerYear: { color: colors.ink, fontFamily: fonts.laundryBold, fontSize: 17 },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6, rowGap: 6 },
  pickerMonth: { alignItems: 'center', borderRadius: 12, paddingVertical: 10, width: '25%' },
  pickerMonthCurrent: { backgroundColor: '#222222' },
  pickerMonthText: { color: '#555555', fontFamily: fonts.semibold, fontSize: 15 },
  pickerMonthToday: { color: '#FF7B00' },
  pickerMonthTextCurrent: { color: colors.white },
  monthArrow: { alignItems: 'center', height: 28, justifyContent: 'center', width: 24 },
  month: { color: colors.ink, fontFamily: fonts.laundryBold, fontSize: 20, minWidth: 44, textAlign: 'center' },
  todayButton: { backgroundColor: '#F5F5F5', borderRadius: 12, marginLeft: 6, paddingHorizontal: 10, paddingVertical: 5 },
  todayButtonText: { color: '#666666', fontFamily: fonts.semibold, fontSize: 12, lineHeight: 15 },
  streak: { alignItems: 'center', flexDirection: 'row', gap: 3 },
  streakText: { color: colors.ink, fontFamily: fonts.laundry, fontSize: 20 },
  calendar: { borderBottomColor: '#E0E0E0', borderBottomWidth: 1, marginTop: 8 },
  weekHeader: { borderTopColor: '#E0E0E0', borderTopWidth: 1, flexDirection: 'row', height: 31 },
  weekLabel: { color: '#666666', flex: 1, fontFamily: fonts.laundry, fontSize: 11, paddingTop: 8, textAlign: 'center' },
  week: { borderTopColor: '#E0E0E0', borderTopWidth: 1, flexDirection: 'row', height: 66 },
  dayCell: { alignItems: 'center', borderRadius: 10, flex: 1, paddingBottom: 5, paddingHorizontal: 2, paddingTop: 5 },
  dayCellSelected: { backgroundColor: '#F4F4F4' },
  dayNumber: { alignItems: 'center', borderRadius: 11, height: 22, justifyContent: 'center', minWidth: 22, paddingHorizontal: 3 },
  todayNumber: { backgroundColor: '#FF7B00' },
  day: { color: '#333333', fontFamily: fonts.laundryBold, fontSize: 14 },
  mutedDay: { color: '#AAAAAA' },
  todayText: { color: colors.white },
  check: { alignItems: 'center', backgroundColor: colors.mint, borderRadius: 13, height: 26, justifyContent: 'center', marginTop: 5, width: 26 },
  mutedEvent: { opacity: 0.45 },
  dayDetail: { backgroundColor: '#FAFAFA', borderRadius: 18, marginTop: 14, paddingHorizontal: 16, paddingVertical: 14 },
  dayDetailTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
  dayDetailEmpty: { color: '#999999', fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, marginTop: 6 },
  recordRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  recordDot: { borderRadius: 4, height: 8, marginTop: 6, width: 8 },
  recordCopy: { flex: 1 },
  recordTitle: { color: '#222222', fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  outcomeSuccess: { color: '#3FA36B', fontFamily: fonts.semibold, fontSize: 13 },
  outcomeRetry: { color: '#E58A4E', fontFamily: fonts.semibold, fontSize: 13 },
  recordMeta: { color: '#999999', fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, marginTop: 2 },
  recordSummary: { color: '#666666', fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, marginTop: 2 },
  stats: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 22 },
  stat: { alignItems: 'center', flex: 1 },
  statIcon: { alignItems: 'center', borderRadius: 15, height: 30, justifyContent: 'center', width: 30 },
  statValue: { color: '#222222', fontFamily: fonts.laundryBold, fontSize: 15, lineHeight: 19, marginTop: 6 },
  statLabel: { color: '#999999', fontFamily: fonts.laundry, fontSize: 10, lineHeight: 14, marginTop: 3 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 18, marginBottom: 10 },
  edgeScroll: { marginHorizontal: -18 },
  filters: { gap: 8, paddingHorizontal: 18 },
  filter: { backgroundColor: '#F5F5F5', borderRadius: 22, paddingHorizontal: 17, paddingVertical: 9 },
  filterSelected: { backgroundColor: '#222222' },
  filterText: { color: '#999999', fontFamily: fonts.semibold, fontSize: 14, lineHeight: 18 },
  filterTextSelected: { color: colors.white },
  difficultyBanner: { alignItems: 'center', backgroundColor: '#EFF8FC', borderColor: '#CFE8F3', borderRadius: 16, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingHorizontal: 16, paddingVertical: 13 },
  difficultyEyebrow: { color: '#2D7699', fontFamily: fonts.bold, fontSize: 14, lineHeight: 19 },
  difficultyDescription: { color: '#7193A3', fontFamily: fonts.regular, fontSize: 11, lineHeight: 16, marginTop: 2 },
  difficultyBadge: { alignItems: 'center', backgroundColor: '#57ABD8', borderRadius: 18, justifyContent: 'center', marginLeft: 12, minWidth: 54, paddingHorizontal: 13, paddingVertical: 8 },
  difficultyBadgeText: { color: colors.white, fontFamily: fonts.bold, fontSize: 15, lineHeight: 19 },
  questList: { gap: 10, marginTop: 14 },
  questState: { color: '#777777', fontFamily: fonts.medium, paddingVertical: 20, textAlign: 'center' },
  unavailableCard: { alignItems: 'center', backgroundColor: '#F2F2F2', borderRadius: 18, gap: 6, justifyContent: 'center', minHeight: 120, paddingTop: 12 },
  unavailableText: { color: '#8A8A8A', fontFamily: fonts.semibold, fontSize: 14 },
  questCard: { alignItems: 'center', backgroundColor: colors.white, borderRadius: 18, flexDirection: 'row', minHeight: 120, padding: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  questIcon: { height: 72, width: 72 },
  questCopy: { flex: 1, marginLeft: 10 },
  questCategory: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 17 },
  questTitle: { color: '#222222', fontFamily: fonts.bold, fontSize: 19, lineHeight: 25, marginTop: 4 },
  questDescription: { color: '#888888', fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, marginTop: 4 },
  questProgress: { alignItems: 'center', alignSelf: 'stretch', justifyContent: 'space-around', marginLeft: 6 },
  xpPill: { borderRadius: 22, paddingHorizontal: 12, paddingVertical: 8 },
  xpText: { color: colors.white, fontFamily: fonts.bold, fontSize: 15, lineHeight: 19 },
  stepText: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 24 },
  bottomSpace: { height: 112 },
});
