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
import { colors, fonts } from '../theme';

const menus = [
  { label: '가계부', icon: icons.money },
  { label: '목표', icon: icons.goal },
  { label: '일기', icon: icons.diary },
  { label: '시간표', icon: icons.timetable },
  { label: '행운 룰렛', icon: icons.clover },
  { label: '가족', icon: icons.parents },
  { label: '사전', icon: icons.dict },
  { label: 'SOS', icon: icons.sos },
  { label: '설정', icon: icons.settings },
  { label: '꾸미기', icon: icons.custom },
  { label: '랭킹', icon: icons.ranking },
  { label: '나만의 지도', icon: icons.map },
];

export function ProfileScreen() {
  const { height, width } = useWindowDimensions();
  const expandedY = 168;
  const collapsedY = Math.max(430, height * 0.57);
  const drawerWidth = Math.min(Math.max(0, width - 40), 680);
  const drawerLeft = Math.max(20, (width - drawerWidth) / 2);
  const sheetY = useRef(new Animated.Value(collapsedY)).current;
  const currentY = useRef(collapsedY);
  const gestureStart = useRef(collapsedY);
  const [reduceMotion, setReduceMotion] = useState(false);

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
        <View pointerEvents="none" style={styles.characterLayer}>
          <View style={styles.ellipse} />
          <Image resizeMode="contain" source={icons.user} style={styles.character} />
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
          {menus.map((menu) => (
            <PressScale key={menu.label} style={styles.menu}>
              <Image resizeMode="contain" source={menu.icon} style={styles.menuIcon} />
              <Text style={styles.menuLabel}>{menu.label}</Text>
            </PressScale>
          ))}
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
  characterLayer: { alignItems: 'center', left: 0, position: 'absolute', right: 0, top: 116 },
  ellipse: { backgroundColor: '#F5F5F5', borderRadius: 130, height: 260, position: 'absolute', width: 260 },
  character: { height: 230, width: 230 },
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
  menuIcon: { height: 56, width: 56 },
  menuLabel: { color: '#181725', fontFamily: fonts.handwriting, fontSize: 15, lineHeight: 19, marginTop: 3, textAlign: 'center' },
  pageDots: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 20, marginTop: 46 },
  pageDot: { backgroundColor: '#E6E6E6', borderRadius: 2, height: 3, width: 3 },
  pageDotActive: { backgroundColor: '#D0D0D0', borderRadius: 2, height: 3, width: 3 },
});
