import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { fonts } from '../../theme';
import { DAY_JOURNEY_GUIDANCE, DAY_JOURNEY_STEPS, dayJourneyStep, type DayJourney } from '../../game/dayJourney';
import { LibraryButton, LibraryPanel } from './LibraryWorkPanel';
import { getShoppingErrandStatus, useShoppingErrand } from '../../game/shoppingErrandStore';

export function DayJourneyPanel({ journey, onClose, onStart, canStart = true, onOpenErrand }: { journey: DayJourney; onClose: () => void; onStart: () => void; canStart?: boolean; onOpenErrand?: () => void }) {
  const errand = useShoppingErrand();
  useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; }); return () => sub.remove(); }, [onClose]);
  const step = dayJourneyStep(journey.stage);
  const finished = journey.stage === 'completed';
  return <LibraryPanel title={finished ? '도서관 다녀왔어요' : '도서관 다녀오기'} subtitle={finished ? '하루 기록' : '마을 · 버스 · 도서관 · 우리 집'} onClose={onClose} testID="day-journey-panel"
    footer={<><LibraryButton onPress={journey.stage === 'available' && canStart ? onStart : onClose}>{journey.stage === 'available' ? canStart ? '부탁받기' : '확인' : finished ? '계속하기' : '계속하기'}</LibraryButton>{finished && canStart ? <LibraryButton secondary onPress={onStart}>새 하루 시작하기</LibraryButton> : null}</>}>
    <View style={s.note}><Ionicons name={finished ? 'checkmark-circle' : 'mail-open-outline'} size={28} color="#64816B" /><Text style={s.description}>{journey.stage === 'available' && !canStart ? '마을 수첩에서 부탁을 받은 뒤 출발해요.' : DAY_JOURNEY_GUIDANCE[journey.stage]}</Text></View>
    {DAY_JOURNEY_STEPS.map((label, index) => <View key={label} style={[s.row, index === step && s.current]}>
      <View style={[s.number, index < step && s.done]}>{index < step ? <Ionicons name="checkmark" color="#FFFDF5" size={20} /> : <Text style={s.numberText}>{index + 1}</Text>}</View>
      <Text style={[s.label, index === step && { color: '#405E48' }]}>{label}</Text>
      {index === step && <Text style={s.now}>지금</Text>}
    </View>)}
    {finished && <View style={s.results}><Text style={s.result}>정리한 책  {journey.booksSorted}권</Text><Text style={s.result}>응대한 손님  {journey.visitorsHelped}명</Text><Text style={s.result}>출근 · 귀가 버스 이용 완료</Text><Text style={s.result}>완료 보고 후 귀가</Text>{journey.askedForHelp > 0 ? <Text style={s.result}>도움을 요청해 해결  {journey.askedForHelp}회</Text> : null}{journey.recoveredTrips > 0 ? <Text style={s.result}>경로를 다시 찾아 도착  {journey.recoveredTrips}회</Text> : null}</View>}
    {errand && onOpenErrand ? <View style={{ marginTop: 18, gap: 8 }}><LibraryButton secondary icon="basket-outline" onPress={onOpenErrand}>퇴근길 장보기</LibraryButton><Text style={s.description}>{getShoppingErrandStatus(errand)}</Text></View> : null}
  </LibraryPanel>;
}
const s = StyleSheet.create({
  note: { backgroundColor: '#EAEBDD', borderRadius: 20, padding: 18, flexDirection: 'row', gap: 13, alignItems: 'center', marginBottom: 16 },
  description: { flex: 1, color: '#56614F', fontFamily: fonts.medium, fontSize: 17, lineHeight: 26 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 15, marginBottom: 5 }, current: { backgroundColor: '#F1E8D6' },
  number: { backgroundColor: '#E8E6D9', borderRadius: 18, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }, done: { backgroundColor: '#759079' },
  numberText: { color: '#79816E', fontFamily: fonts.bold, fontSize: 17 }, label: { flex: 1, fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24, color: '#777D6E' },
  now: { color: '#7C7656', fontFamily: fonts.semibold, fontSize: 14 }, results: { padding: 20, gap: 13, backgroundColor: '#E9EEDD', borderRadius: 18, marginTop: 18 }, result: { color: '#536B51', fontFamily: fonts.semibold, fontSize: 18 },
});
