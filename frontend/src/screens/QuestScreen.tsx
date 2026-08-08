import { useState } from 'react';
import { Image, ImageSourcePropType, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { icons } from '../assets';
import { PressScale } from '../components/PressScale';
import { BrandHeader } from '../components/ui';
import { colors, fonts } from '../theme';

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
  { category: '일상생활', color: '#EFAC2B', icon: icons.cashier, title: '카페에서 주문하기', description: '원하는 메뉴를 고르고,\n직원에게 또박또박 말해봐요.' },
  { category: '경제생활', color: '#33BB5B', icon: icons.money, title: '마트에서 장보기', description: '예산 안에서 필요한 물건을\n직접 골라 계산해요.' },
  { category: '안전', color: '#E04173', icon: icons.sos, title: '도움을 요청하는 법', description: '곤란한 상황에서 믿을 수 있는\n사람들에게 도움을 요청해요.' },
];

export function QuestScreen({ onPractice }: { onPractice: () => void }) {
  const [selected, setSelected] = useState('전체');
  const visible = selected === '전체'
    ? quests
    : quests.filter((item) => item.category === selected || (selected === '생활 훈련' && item.category === '일상생활'));

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <BrandHeader />
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
        {visible.map((quest) => <QuestCard key={quest.title} {...quest} onPress={onPractice} />)}
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

function QuestCard({ category, color, icon, title, description, onPress }: { category: string; color: string; icon: ImageSourcePropType; title: string; description: string; onPress: () => void }) {
  return (
    <PressScale onPress={onPress} style={styles.questCard}>
      <Image resizeMode="contain" source={icon} style={styles.questIcon} />
      <View style={styles.questCopy}>
        <Text style={[styles.questCategory, { color }]}>{category}</Text>
        <Text style={styles.questTitle}>{title}</Text>
        <Text style={styles.questDescription}>{description}</Text>
      </View>
      <View style={styles.questProgress}>
        <View style={[styles.xpPill, { backgroundColor: color }]}><Text style={styles.xpText}>+20 XP</Text></View>
        <Text style={[styles.stepText, { color }]}>2/4</Text>
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
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
  questCategory: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 16 },
  questTitle: { color: '#222222', fontFamily: fonts.bold, fontSize: 18, lineHeight: 24, marginTop: 4 },
  questDescription: { color: '#888888', fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, marginTop: 4 },
  questProgress: { alignItems: 'center', alignSelf: 'stretch', justifyContent: 'space-around', marginLeft: 6 },
  xpPill: { borderRadius: 22, paddingHorizontal: 12, paddingVertical: 8 },
  xpText: { color: colors.white, fontFamily: fonts.bold, fontSize: 14, lineHeight: 18 },
  stepText: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 24 },
  bottomSpace: { height: 112 },
});
