import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { icons } from '../assets';
import { PressScale } from '../components/PressScale';
import { BrandHeader } from '../components/ui';
import { DirectionalAvatar } from '../components/game/DirectionalAvatar';
// 마을·마트·실내 게임의 플레이어와 같은 매니페스트. 프레임 속도는 DirectionalAvatar의 게임 타이밍을 그대로 쓴다.
import { chibiPlayerAvatar } from '../game/chibiPlayerAvatar';
import { colors, fonts } from '../theme';
import { useUserProgress, XP_PER_LEVEL } from '../progress/userProgress';

// 쓸 수 있는 메뉴(설정·가족)를 앞에 두고, 준비 중인 메뉴는 뒤로 민다.
const menus = [
  { label: '설정', icon: icons.settings },
  { label: '가족', icon: icons.parents },
  { label: '가계부', icon: icons.money },
  { label: '목표', icon: icons.goal },
  { label: '일기', icon: icons.diary },
  { label: '시간표', icon: icons.timetable },
  { label: '행운 룰렛', icon: icons.clover },
  { label: '사전', icon: icons.dict },
  { label: 'SOS', icon: icons.sos },
  { label: '꾸미기', icon: icons.custom },
  { label: '랭킹', icon: icons.ranking },
  { label: '나만의 지도', icon: icons.map },
];

const PROFILE_AVATAR_SCALE = 1.1;
const ACTIVE_MENUS = new Set(['설정', '가족']);

export function ProfileScreen({ onOpenSettings }: { onOpenSettings?: () => void } = {}) {
  const { height, width } = useWindowDimensions();
  const expandedY = 168;
  const collapsedY = Math.max(430, height * 0.57);
  const drawerWidth = Math.min(Math.max(0, width - 40), 680);
  const drawerLeft = Math.max(20, (width - drawerWidth) / 2);
  const sheetY = useRef(new Animated.Value(collapsedY)).current;
  const currentY = useRef(collapsedY);
  const gestureStart = useRef(collapsedY);
  const [reduceMotion, setReduceMotion] = useState(false);
  const progress = useUserProgress();

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    currentY.current = collapsedY;
    sheetY.setValue(collapsedY);
  }, [collapsedY, sheetY]);

  const hapticAtEdge = () => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }
  };

  const settle = (target: number, velocity = 0) => {
    currentY.current = target;
    if (reduceMotion) {
      sheetY.setValue(target);
      hapticAtEdge();
      return;
    }
    Animated.spring(sheetY, {
      damping: 13.5,
      mass: 0.95,
      overshootClamping: false,
      restDisplacementThreshold: 0.25,
      restSpeedThreshold: 0.25,
      stiffness: 158,
      toValue: target,
      useNativeDriver: true,
      velocity,
    }).start(({ finished }) => {
      if (finished) hapticAtEdge();
    });
  };

  const panResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 4,
      onPanResponderGrant: () => {
        gestureStart.current = currentY.current;
        sheetY.stopAnimation();
      },
      onPanResponderMove: (_, gesture) => {
        const next = Math.max(expandedY - 30, Math.min(collapsedY + 28, gestureStart.current + gesture.dy));
        currentY.current = next;
        sheetY.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        const midpoint = (expandedY + collapsedY) / 2;
        const target = gesture.vy < -0.35
          ? expandedY
          : gesture.vy > 0.35
            ? collapsedY
            : currentY.current < midpoint
              ? expandedY
              : collapsedY;
        settle(target, gesture.vy * 0.9);
      },
      onPanResponderTerminate: () => settle(
        currentY.current < (expandedY + collapsedY) / 2 ? expandedY : collapsedY,
      ),
    }),
    [collapsedY, reduceMotion, sheetY],
  );

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <BrandHeader />
        <View
          accessible
          accessibilityLabel={`레벨 ${progress.level}, 다음 레벨까지 ${progress.xpToNextLevel} XP, 연속 학습 ${progress.streak}일, 최고 ${progress.bestStreak}일`}
          style={styles.levelCard}
        >
          <View style={styles.levelRow}>
            <Text style={styles.levelText}>Lv.{progress.level}</Text>
            <Text style={styles.levelMeta}>다음 레벨까지 {progress.xpToNextLevel} XP</Text>
          </View>
          <View style={styles.levelTrack}>
            <View style={[styles.levelFill, { width: `${(progress.levelXp / XP_PER_LEVEL) * 100}%` }]} />
          </View>
          <Text style={styles.streakMeta}>연속 학습 {progress.streak}일 · 최고 {progress.bestStreak}일</Text>
        </View>
        <View pointerEvents="none" style={styles.characterLayer}>
          <DirectionalAvatar
            accessibilityLabel="내 캐릭터"
            facing="front"
            manifest={chibiPlayerAvatar}
            motion="idle"
            reduceMotion={reduceMotion}
            scale={PROFILE_AVATAR_SCALE}
            style={styles.avatar}
            testID="profile-player-avatar"
          />
        </View>
      </View>

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.drawer,
          {
            left: drawerLeft,
            width: drawerWidth,
            transform: [{ translateY: sheetY }],
          },
        ]}
      >
        <View style={styles.handle} />
        <View style={styles.menuGrid}>
          {menus.map((menu) => {
            const content = <>
              <Image resizeMode="contain" source={menu.icon} style={styles.menuIcon} />
              <Text style={styles.menuLabel}>{menu.label}</Text>
            </>;
            // 설정·가족만 쓸 수 있다. 나머지는 흐리게 두고 눌러도 반응하지 않는다(가족 화면은 나중에 채운다).
            if (!ACTIVE_MENUS.has(menu.label)) {
              return <View accessibilityLabel={`${menu.label}, 준비 중`} accessibilityState={{ disabled: true }} key={menu.label}
                style={[styles.menu, styles.menuDisabled]}>{content}</View>;
            }
            return <PressScale accessibilityRole="button" accessibilityLabel={menu.label} key={menu.label}
              onPress={menu.label === '설정' ? onOpenSettings : undefined} style={styles.menu}>{content}</PressScale>;
          })}
        </View>
        <View style={styles.pageDots}>
          <View style={styles.pageDotActive} />
          <View style={styles.pageDot} />
          <View style={styles.pageDot} />
          <View style={styles.pageDot} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.white, flex: 1, overflow: 'hidden' },
  content: { alignSelf: 'center', flex: 1, maxWidth: 720, paddingHorizontal: 20, width: '100%' },
  levelCard: { marginTop: 6, paddingHorizontal: 4 },
  levelRow: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between' },
  levelText: { color: colors.ink, fontFamily: fonts.laundryBold, fontSize: 22, letterSpacing: -0.6 },
  levelMeta: { color: '#999999', fontFamily: fonts.medium, fontSize: 12 },
  levelTrack: { backgroundColor: '#F0F0F0', borderRadius: 4, height: 8, marginTop: 8, overflow: 'hidden' },
  levelFill: { backgroundColor: colors.mint, borderRadius: 4, height: 8 },
  streakMeta: { color: colors.mint, fontFamily: fonts.semibold, fontSize: 12, marginTop: 8 },
  characterLayer: { alignItems: 'center', left: 0, position: 'absolute', right: 0, top: 150 },
  avatar: { marginTop: 10 },
  drawer: {
    backgroundColor: colors.white,
    borderColor: '#EAEAEA',
    borderRadius: 20,
    borderWidth: 1,
    height: 620,
    paddingHorizontal: 20,
    paddingTop: 12,
    position: 'absolute',
    top: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  handle: { alignSelf: 'center', backgroundColor: '#E6E6E6', borderRadius: 2, height: 4, marginBottom: 20, width: 96 },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 19 },
  menu: { alignItems: 'center', flexBasis: '25%' },
  menuDisabled: { opacity: 0.3 },
  menuIcon: { height: 56, width: 56 },
  menuLabel: { color: '#181725', fontFamily: fonts.handwriting, fontSize: 15, lineHeight: 19, marginTop: 3, textAlign: 'center' },
  pageDots: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 20, marginTop: 46 },
  pageDot: { backgroundColor: '#E6E6E6', borderRadius: 2, height: 3, width: 3 },
  pageDotActive: { backgroundColor: '#D0D0D0', borderRadius: 2, height: 3, width: 3 },
});
