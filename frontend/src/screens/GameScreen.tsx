import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { DirectionalAvatar } from '../components/game/DirectionalAvatar';
import { LibraryButton } from '../components/game/LibraryWorkPanel';
import { PressScale } from '../components/PressScale';
import { StickyBrandHeader } from '../components/ui';
import { type ActivityRecord, useActivityAlbum } from '../game/activityAlbum';
import { ACTIVITY_KIND_VISUALS, activityDateKey } from '../game/activityCalendar';
// 사용자 탭과 같은 인게임 캐릭터(idle). 프레임 속도는 DirectionalAvatar의 게임 타이밍을 그대로 쓴다.
import { chibiPlayerAvatar } from '../game/chibiPlayerAvatar';
import { useUserProgress, XP_PER_LEVEL } from '../progress/userProgress';
import { colors, fonts } from '../theme';

type GameScreenProps = { onEnter: () => void };

/** 게임 탭 배경. AppShell이 위쪽 노치(안전 영역)도 같은 색으로 칠한다. */
export const GAME_TAB_BACKGROUND = '#EEF5E9';
const GREEN = GAME_TAB_BACKGROUND;
/** 하단 플로팅 바(아래 16 + 높이 62) 바로 위에 고정한다. */
const NAV_CLEARANCE = 90;

export function GameScreen({ onEnter }: GameScreenProps) {
  const records = useActivityAlbum();
  const progress = useUserProgress();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => undefined); }, []);
  const todayKey = activityDateKey(Date.now());
  const todayCount = records.filter((record) => activityDateKey(record.completedAt) === todayKey).length;
  const latest = records[0];

  return (
    // 이 탭은 위아래로 스크롤하지 않는다. 기록 전체는 '최근 기록'을 눌러 여는 창에서 본다.
    <View style={styles.root}>
      <View style={styles.content}>
        <StickyBrandHeader backgroundColor={GREEN} horizontalPadding={20} />
        <Text style={styles.todayLine}>오늘 완료한 활동 {todayCount}개</Text>
        <View style={styles.titleRow}>
          <Text style={styles.title}>마을에서{'\n'}하루를 보내요</Text>
          {/* 홈·퀘스트 탭과 같은 연속 학습 불꽃 표시 */}
          <View accessibilityLabel={`연속 학습 ${progress.streak}일`} style={styles.streak} testID="game-streak">
            <Ionicons color={progress.streak > 0 ? '#FF6C64' : '#BFCBB8'} name="flame" size={20} />
            <Text style={styles.streakText}>{progress.streak}</Text>
          </View>
        </View>

        <View pointerEvents="none" style={styles.scene}>
          <DirectionalAvatar facing="front" manifest={chibiPlayerAvatar} motion="idle" reduceMotion={reduceMotion}
            scale={1} testID="game-player-avatar" />
        </View>

        <View accessible accessibilityLabel={`레벨 ${progress.level}, 다음 레벨까지 ${progress.xpToNextLevel} XP`} style={styles.levelPanel}>
          <View style={styles.levelRow}>
            <Text style={styles.levelText}>Lv.{progress.level}</Text>
            <Text style={styles.levelMeta}>{progress.levelXp} / {XP_PER_LEVEL} XP</Text>
          </View>
          <View style={styles.levelTrack}>
            <View style={[styles.levelFill, { width: `${(progress.levelXp / XP_PER_LEVEL) * 100}%` }]} />
          </View>
        </View>
      </View>

      {/* 플로팅 바 위에 고정: 레벨·경험치, 그 아래 마을 들어가기 */}
      <View pointerEvents="box-none" style={styles.dock}>
        <View style={styles.dockInner}>
          <PressScale accessibilityRole="button" accessibilityLabel="최근 기록 전체 보기"
            onPress={() => setHistoryOpen(true)} style={styles.recentCard}>
            <View style={styles.recentHeader}>
              <Text style={styles.sectionTitle}>최근 기록</Text>
              {records.length > 1 ? <Text style={styles.recentMore}>전체 {records.length}개</Text> : null}
            </View>
            {latest ? <RecordRow record={latest} todayKey={todayKey} />
              : <Text style={styles.emptyText}>마을에서 활동을 마치면 여기에 기록돼요.</Text>}
          </PressScale>
          <PressScale accessibilityRole="button" accessibilityLabel="오늘도 마을 들어가기"
            accessibilityHint="마을을 걸으며 집과 하늘마트로 이동합니다"
            onPress={() => onEnter()} style={styles.enterButton}>
            <Text style={styles.enterText}>마을 들어가기</Text>
          </PressScale>
        </View>
      </View>

      <HistorySheet open={historyOpen} records={records} todayKey={todayKey} reduceMotion={reduceMotion} onClose={() => setHistoryOpen(false)} />
    </View>
  );
}

function RecordRow({ record, todayKey, divider = false }: { record: ActivityRecord; todayKey: string; divider?: boolean }) {
  return <View style={[styles.recentRow, divider && styles.recentDivider]}>
    <View style={[styles.kindBadge, { backgroundColor: ACTIVITY_KIND_VISUALS[record.kind].chip }]}>
      <Text style={styles.kindText}>{ACTIVITY_KIND_VISUALS[record.kind].label}</Text>
    </View>
    <View style={styles.recentCopy}>
      <Text numberOfLines={1} style={styles.recentTitle}>{record.title}</Text>
      <Text numberOfLines={1} style={styles.recentMeta}>{formatRecordTime(record.completedAt, todayKey)} · {record.summary}</Text>
    </View>
  </View>;
}

/** 아래에서 부드럽게 올라와 화면 대부분을 덮는 기록 창. 바깥을 누르거나 '확인'으로 닫는다. */
function HistorySheet({ open, records, todayKey, reduceMotion, onClose }: {
  open: boolean; records: readonly ActivityRecord[]; todayKey: string; reduceMotion: boolean; onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) setVisible(true);
    const animation = Animated.timing(progress, {
      toValue: open ? 1 : 0, duration: reduceMotion ? 0 : open ? 320 : 220,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic), useNativeDriver: true,
    });
    animation.start(({ finished }) => { if (finished && !open) setVisible(false); });
    return () => animation.stop();
  }, [open, progress, reduceMotion]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [height * 0.4, 0] });
  return <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
    <Animated.View style={[styles.backdrop, { opacity: progress }]}>
      <Pressable accessibilityLabel="기록 창 닫기" onPress={onClose} style={StyleSheet.absoluteFill} />
    </Animated.View>
    <Animated.View accessibilityViewIsModal style={[styles.sheet, { height: height * 0.75, opacity: progress, transform: [{ translateY }] }]} testID="game-history-sheet">
      <Text accessibilityRole="header" style={styles.sheetTitle}>활동 기록</Text>
      {records.length === 0 ? <View style={styles.sheetEmpty}>
        <Ionicons color="#8A8A8A" name="alert-circle-outline" size={26} />
        <Text style={styles.sheetEmptyText}>최근 기록이 없어요</Text>
      </View> : <ScrollView style={styles.sheetList} showsVerticalScrollIndicator={false}>
        {records.map((record, index) => <RecordRow divider={index > 0} key={record.id} record={record} todayKey={todayKey} />)}
      </ScrollView>}
      <View style={styles.sheetFooter}><LibraryButton onPress={onClose}>확인</LibraryButton></View>
    </Animated.View>
  </Modal>;
}

function formatRecordTime(time: number, todayKey: string) {
  const date = new Date(time);
  const clock = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return activityDateKey(date) === todayKey ? `오늘 ${clock}` : `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

const styles = StyleSheet.create({
  root: { backgroundColor: GREEN, flex: 1 },
  // 아래 고정 영역(레벨 패널 + 버튼)만큼 비워 두고 남은 높이 안에 모두 들어가게 한다.
  content: { alignSelf: 'center', flex: 1, maxWidth: 720, paddingBottom: NAV_CLEARANCE + 154, paddingHorizontal: 20, width: '100%' },
  todayLine: { color: 'rgb(119, 167, 133)', fontFamily: fonts.semibold, fontSize: 12, marginTop: 12 },
  titleRow: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  title: { color: '#3E5C4B', flex: 1, fontFamily: fonts.laundryBold, fontSize: 24, letterSpacing: -0.8, lineHeight: 32, marginTop: 4 },
  streak: { alignItems: 'center', flexDirection: 'row', gap: 3, marginLeft: 12, marginTop: 6 },
  streakText: { color: '#3E5C4B', fontFamily: fonts.laundry, fontSize: 20 },
  scene: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 140 },
  recentCard: { backgroundColor: colors.white, borderRadius: 18, paddingBottom: 4, paddingHorizontal: 16, paddingTop: 14 },
  recentHeader: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 17, letterSpacing: -0.45 },
  recentMore: { color: '#999999', fontFamily: fonts.medium, fontSize: 12 },
  emptyText: { color: '#999999', fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, paddingBottom: 12, paddingTop: 10, textAlign: 'center' },
  recentRow: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 12 },
  recentDivider: { borderTopColor: '#F2F2F2', borderTopWidth: 1 },
  kindBadge: { alignItems: 'center', borderRadius: 10, justifyContent: 'center', minWidth: 62, paddingHorizontal: 8, paddingVertical: 6 },
  kindText: { color: 'rgba(0,0,0,0.6)', fontFamily: fonts.laundry, fontSize: 11, lineHeight: 14 },
  recentCopy: { flex: 1 },
  recentTitle: { color: '#222222', fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  recentMeta: { color: '#999999', fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, marginTop: 2 },
  dock: { bottom: NAV_CLEARANCE, left: 0, paddingHorizontal: 20, position: 'absolute', right: 0 },
  dockInner: { alignSelf: 'center', gap: 12, maxWidth: 680, width: '100%' },
  // 레벨은 배경 박스 없이 캐릭터 아래에 둔다.
  levelPanel: { marginBottom: 6, paddingHorizontal: 4 },
  levelRow: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between' },
  levelText: { color: '#3E5C4B', fontFamily: fonts.laundryBold, fontSize: 18, letterSpacing: -0.4 },
  levelMeta: { color: 'rgb(119, 167, 133)', fontFamily: fonts.semibold, fontSize: 12 },
  levelTrack: { backgroundColor: '#DCEAD2', borderRadius: 4, height: 8, marginTop: 8, overflow: 'hidden' },
  levelFill: { backgroundColor: colors.mint, borderRadius: 4, height: 8 },
  enterButton: { alignItems: 'center', backgroundColor: colors.mint, borderRadius: 20, justifyContent: 'center', minHeight: 56, paddingVertical: 6 },
  enterText: { color: colors.white, fontFamily: fonts.cafe24Ssurround, fontSize: 17 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(30, 40, 32, 0.38)' },
  sheet: { alignSelf: 'center', backgroundColor: colors.white, borderTopLeftRadius: 26, borderTopRightRadius: 26, bottom: 0, maxWidth: 720, paddingHorizontal: 20, paddingTop: 22, position: 'absolute', width: '100%' },
  sheetTitle: { color: '#3E5C4B', fontFamily: fonts.bold, fontSize: 20, marginBottom: 6 },
  sheetList: { flex: 1 },
  sheetEmpty: { alignItems: 'center', flex: 1, gap: 6, justifyContent: 'center', paddingBottom: 24 },
  sheetEmptyText: { color: '#8A8A8A', fontFamily: fonts.semibold, fontSize: 14 },
  sheetFooter: { paddingBottom: 24, paddingTop: 12 },
});
