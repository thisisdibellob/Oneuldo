import { useState } from 'react';
import { Image, ImageSourcePropType, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { icons } from '../assets';
import { PressScale } from '../components/PressScale';
import { StickyBrandHeader } from '../components/ui';
import { colors, fonts } from '../theme';
import { DAY_JOURNEY_GUIDANCE, dayJourneyStep, useDayJourney } from '../game/dayJourney';
import { getShoppingErrandStatus, useShoppingErrand } from '../game/shoppingErrandStore';
import { laundryArt } from '../game/laundryArt';

type CalendarCell = {
  day: string;
  muted?: boolean;
  dot?: string;
  color?: string;
  event?: string;
  event2?: string;
  eventColor?: string;
  event2Color?: string;
  wide?: boolean;
};

const weeks: CalendarCell[][] = [
  [{ day: '26', muted: true }, { day: '27', muted: true }, { day: '28', muted: true }, { day: '29', muted: true }, { day: '30', muted: true }, { day: '31', muted: true }, { day: '1', dot: '#18C339' }],
  [{ day: '2', dot: '#36BFEA' }, { day: '3', dot: '#18C339' }, { day: '4', color: '#FF7B00', dot: '#18C339' }, { day: '5' }, { day: '6', event: '가족 여행' }, { day: '7' }, { day: '8' }],
  [{ day: '9' }, { day: '10' }, { day: '11' }, { day: '12', event: '상담 예약', eventColor: '#D9EFFF' }, { day: '13' }, { day: '14' }, { day: '15' }],
  [{ day: '16' }, { day: '17', event: '주민센터 봉사활동 - 쓰레기 줍기', event2: '저녁 산책', event2Color: '#E7D9FF', wide: true }, { day: '18' }, { day: '19' }, { day: '20' }, { day: '21' }, { day: '22' }],
  [{ day: '23' }, { day: '24' }, { day: '25', event: '장보기 연습', eventColor: '#FFD8CE' }, { day: '26' }, { day: '27' }, { day: '28', event: '이번 주 복습', eventColor: '#D7F5E1' }, { day: '29' }],
  [{ day: '30' }, { day: '31', event: '월간 목표 확인', eventColor: '#FFF0B7' }, { day: '1', muted: true }, { day: '2', muted: true }, { day: '3', muted: true }, { day: '4', muted: true }, { day: '5', muted: true }],
];
const categories = ['전체', '대중교통', '생활 훈련', '경제생활', '안전'];
const quests = [
  { category: '대중교통', color: '#57ABD8', icon: icons.bus, title: '혼자 버스 타기', description: '목적지까지 가는 버스를 찾고,\n안전하게 이용해봐요!' },
  { category: '일상생활', color: '#B58A63', icon: icons.cashier, title: '카페 첫 근무', description: '주문을 받고 음료를 만들어요.\n손님 세 명과 함께하는 작은 카페' },
  { category: '일상생활', color: '#7A9B86', icon: laundryArt.basket, title: '동네 빨래방', description: '빨래를 나누고 세탁한 뒤,\n집 옷장에 차곡차곡 정리해요.' },
  { category: '경제생활', color: '#33BB5B', icon: icons.money, title: '마트에서 장보기', description: '예산 안에서 필요한 물건을\n직접 골라 계산해요.' },
  { category: '안전', color: '#779383', icon: icons.gamePhone, title: '수상한 연락 확인하기', description: '민수에게 온 연락, 직접 확인해요.\n한 이야기 3~5분' },
];

export function QuestScreen({ onPractice, onGameQuest }: { onPractice: () => void; onGameQuest?: (activity: 'day' | 'bus' | 'market' | 'errand' | 'phishing' | 'cafe' | 'laundry') => void }) {
  const journey = useDayJourney();
  const errand = useShoppingErrand();
  const [selected, setSelected] = useState('전체');
  const visible = selected === '전체'
    ? quests
    : quests.filter((item) => item.category === selected || (selected === '생활 훈련' && item.category === '일상생활'));

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} stickyHeaderIndices={[0]}>
      <StickyBrandHeader horizontalPadding={18} />
      {onGameQuest ? <PressScale accessibilityRole="button" accessibilityLabel="도서관 다녀오기 퀘스트 열기" onPress={() => onGameQuest('day')} style={styles.dayCard}>
        <View style={styles.dayCardIcon}><Ionicons name="book" size={32} color="#66826C" /></View>
        <View style={{ flex: 1 }}><Text style={styles.dayEyebrow}>{journey.stage === 'available' ? '새로운 부탁' : journey.stage === 'completed' ? '완료한 이야기' : '진행 중인 이야기'}</Text><Text style={styles.dayTitle}>도서관 다녀오기</Text><Text style={styles.dayCopy}>{DAY_JOURNEY_GUIDANCE[journey.stage]}</Text><Text style={styles.dayAction}>{journey.stage === 'available' ? '부탁 확인하기' : journey.stage === 'completed' ? '기록 보기' : `이어서 하기 · ${dayJourneyStep(journey.stage)}/4`}</Text></View>
        <Ionicons name="chevron-forward" color="#819178" size={23} />
      </PressScale> : null}
      {errand && onGameQuest ? <PressScale accessibilityRole="button" accessibilityLabel="퇴근길 장보기 퀘스트 열기" onPress={() => onGameQuest('errand')} style={[styles.dayCard, { backgroundColor: '#F1EAD8', marginTop: 12 }]}><View style={styles.dayCardIcon}><Ionicons name="basket-outline" size={32} color="#78815C" /></View><View style={{ flex: 1 }}><Text style={styles.dayEyebrow}>민수의 부탁</Text><Text style={styles.dayTitle}>퇴근길 장보기</Text><Text style={styles.dayCopy}>{getShoppingErrandStatus(errand)}</Text><Text style={styles.dayAction}>{errand.phase === 'delivered' ? '전달한 물건 보기' : '부탁 확인하기'}</Text></View><Ionicons name="chevron-forward" color="#819178" size={23} /></PressScale> : null}
      <View style={styles.monthHeader}>
        <Text style={styles.month}>8월</Text>
        <View style={styles.streak}>
          <Ionicons color="#FF6C64" name="flame" size={20} />
          <Text style={styles.streakText}>177</Text>
        </View>
      </View>
      <View style={styles.calendar}>
        <View style={styles.weekHeader}>
          {['일', '월', '화', '수', '목', '금', '토'].map((day) => <Text key={day} style={styles.weekLabel}>{day}</Text>)}
        </View>
        {weeks.map((week, row) => (
          <View key={row} style={styles.week}>
            {week.map((cell, column) => (
              <View key={`${row}-${column}`} style={styles.dayCell}>
                <View style={styles.dayLine}>
                  <Text style={[styles.day, cell.muted && styles.mutedDay, cell.color ? { color: cell.color } : null]}>{cell.day}</Text>
                  {cell.dot ? <View style={[styles.dot, { backgroundColor: cell.dot }]} /> : null}
                </View>
                {cell.event ? (
                  <View style={[styles.event, cell.wide && styles.wideEvent, cell.eventColor ? { backgroundColor: cell.eventColor } : null]}>
                    <Text numberOfLines={1} style={styles.eventText}>{cell.event}</Text>
                  </View>
                ) : null}
                {cell.event2 ? (
                  <View style={[styles.event, styles.secondEvent, cell.event2Color ? { backgroundColor: cell.event2Color } : null]}>
                    <Text numberOfLines={1} style={styles.eventText}>{cell.event2}</Text>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ))}
      </View>

      <View style={styles.stats}>
        <Stat background="#FFF0EB" color="#FF745C" icon="flame" label="연속 학습" value="7일" />
        <Stat background="#E8F8FF" color="#31AEE8" icon="flash" label="이번 주 경험치" value="240" />
        <Stat background="#FFF6D7" color="#F1B921" icon="ribbon" label="완료 뱃지" value="18" />
      </View>

      <Text style={styles.sectionTitle}>추천 퀘스트</Text>
      <ScrollView contentContainerStyle={styles.filters} horizontal showsHorizontalScrollIndicator={false} style={styles.edgeScroll}>
        {categories.map((category) => (
          <PressScale key={category} onPress={() => setSelected(category)} style={[styles.filter, selected === category && styles.filterSelected]}>
            <Text style={[styles.filterText, selected === category && styles.filterTextSelected]}>{category}</Text>
          </PressScale>
        ))}
      </ScrollView>

      <View style={styles.questList}>
        {visible.map((quest) => <QuestCard key={quest.title} {...quest} inGame={!!onGameQuest && ['혼자 버스 타기', '마트에서 장보기', '수상한 연락 확인하기', '카페 첫 근무', '동네 빨래방'].includes(quest.title)} onPress={() => {
          if (onGameQuest && quest.title === '혼자 버스 타기') onGameQuest('bus');
          else if (onGameQuest && quest.title === '마트에서 장보기') onGameQuest('market');
          else if (onGameQuest && quest.title === '수상한 연락 확인하기') onGameQuest('phishing');
          else if (onGameQuest && quest.title === '카페 첫 근무') onGameQuest('cafe');
          else if (onGameQuest && quest.title === '동네 빨래방') onGameQuest('laundry');
          else onPractice();
        }} />)}
      </View>
      <View style={styles.bottomSpace} />
    </ScrollView>
  );
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

function QuestCard({ category, color, icon, title, description, onPress, inGame = false }: { category: string; color: string; icon: ImageSourcePropType; title: string; description: string; onPress: () => void; inGame?: boolean }) {
  return (
    <PressScale accessibilityRole="button" accessibilityLabel={`${title} 퀘스트 열기`} onPress={onPress} style={styles.questCard}>
      <Image resizeMode="contain" source={icon} style={styles.questIcon} />
      <View style={styles.questCopy}>
        <Text style={[styles.questCategory, { color }]}>{category}</Text>
        <Text style={styles.questTitle}>{title}</Text>
        <Text style={styles.questDescription}>{description}</Text>
      </View>
      <View style={styles.questProgress}>
        {inGame ? <Ionicons name="chevron-forward" color={color} size={24} /> : <><View style={[styles.xpPill, { backgroundColor: color }]}><Text style={styles.xpText}>+20 XP</Text></View><Text style={[styles.stepText, { color }]}>2/4</Text></>}
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
  month: { color: colors.ink, fontFamily: fonts.laundryBold, fontSize: 20 },
  streak: { alignItems: 'center', flexDirection: 'row', gap: 3 },
  streakText: { color: colors.ink, fontFamily: fonts.laundry, fontSize: 20 },
  calendar: { borderBottomColor: '#E0E0E0', borderBottomWidth: 1, marginTop: 8 },
  weekHeader: { borderTopColor: '#E0E0E0', borderTopWidth: 1, flexDirection: 'row', height: 31 },
  weekLabel: { color: '#666666', flex: 1, fontFamily: fonts.laundry, fontSize: 11, paddingTop: 8, textAlign: 'center' },
  week: { borderTopColor: '#E0E0E0', borderTopWidth: 1, flexDirection: 'row', height: 66 },
  dayCell: { alignItems: 'center', flex: 1, paddingBottom: 7, paddingTop: 6 },
  dayLine: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
  day: { color: '#333333', fontFamily: fonts.laundryBold, fontSize: 14 },
  mutedDay: { color: '#AAAAAA' },
  dot: { borderRadius: 5, height: 8, marginLeft: 3, width: 8 },
  event: { backgroundColor: '#FFE084', borderRadius: 4, height: 16, marginTop: 2, paddingHorizontal: 4, width: 66, zIndex: 3 },
  secondEvent: { backgroundColor: '#E7D9FF', marginTop: 1 },
  wideEvent: { backgroundColor: '#CFFF87', width: 150 },
  eventText: { color: 'rgba(0,0,0,0.55)', fontFamily: fonts.laundry, fontSize: 8, lineHeight: 16 },
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
  questList: { gap: 10, marginTop: 14 },
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
