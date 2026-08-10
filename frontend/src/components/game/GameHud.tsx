import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { icons } from '../../assets';
import { PressScale } from '../PressScale';
import { colors, fonts } from '../../theme';

type ControlMode = 'joystick' | 'touch';
type MenuKey = 'bag' | 'diary' | 'phone' | 'settings';
type PhoneAction = 'exit' | 'emergency' | null;

const toolbarItems = [
  { key: 'bag' as const, label: '가방', source: icons.gameBag },
  { key: 'diary' as const, label: '일기', source: icons.gameDiary },
  { key: 'phone' as const, label: '휴대폰', source: icons.gamePhone },
  { key: 'settings' as const, label: '설정', source: icons.gameSettings },
];

const hudOutlineOffsets = [
  { x: -2, y: -2 },
  { x: 0, y: -2 },
  { x: 2, y: -2 },
  { x: -2, y: 0 },
  { x: 2, y: 0 },
  { x: -2, y: 2 },
  { x: 0, y: 2 },
  { x: 2, y: 2 },
];

export function GameHud({
  controlMode,
  onControlModeChange,
  onEmergencyExit,
  onExit,
  onMenuVisibilityChange,
}: {
  controlMode: ControlMode;
  onControlModeChange: (mode: ControlMode) => void;
  onEmergencyExit: () => void;
  onExit: () => void;
  onMenuVisibilityChange: (open: boolean) => void;
}) {
  const [menu, setMenu] = useState<MenuKey | null>(null);
  const [phoneAction, setPhoneAction] = useState<PhoneAction>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const panelProgress = useRef(new Animated.Value(0)).current;
  const wobble = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!menu) return undefined;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(wobble, {
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(wobble, {
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [menu, wobble]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 1800);
    return () => clearTimeout(timer);
  }, [notice]);

  const openMenu = (next: MenuKey) => {
    setPhoneAction(null);
    setMenu(next);
    onMenuVisibilityChange(true);
    panelProgress.stopAnimation();
    panelProgress.setValue(0);
    Animated.spring(panelProgress, {
      damping: 18,
      mass: 0.78,
      stiffness: 145,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const closeMenu = () => {
    panelProgress.stopAnimation();
    Animated.timing(panelProgress, {
      duration: 190,
      easing: Easing.in(Easing.cubic),
      toValue: 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setPhoneAction(null);
      setMenu(null);
      onMenuVisibilityChange(false);
    });
  };

  const handleEmergencyExit = () => {
    onEmergencyExit();
    setNotice('안전한 위치로 이동했어요');
    closeMenu();
  };

  const panelMotion = {
    opacity: panelProgress,
    transform: [
      {
        translateY: panelProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [32, 0],
        }),
      },
      {
        scale: panelProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.92, 1],
        }),
      },
      {
        translateX: wobble.interpolate({
          inputRange: [0, 1],
          outputRange: [-1.5, 1.5],
        }),
      },
      {
        rotate: wobble.interpolate({
          inputRange: [0, 1],
          outputRange: ['-0.22deg', '0.22deg'],
        }),
      },
    ],
  };

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, menu && styles.menuRoot]}>
      <View pointerEvents="none" style={styles.topHud}>
        <OutlinedHudText>11:45</OutlinedHudText>
        <View style={styles.coinCounter}>
          <OutlinedHudText>515</OutlinedHudText>
          <Image resizeMode="contain" source={icons.gameCoin} style={styles.coinIcon} />
        </View>
      </View>

      <View pointerEvents="box-none" style={styles.toolbar}>
        {toolbarItems.map((item) => (
          <PressScale
            accessibilityLabel={`${item.label} 열기`}
            accessibilityRole="button"
            key={item.key}
            onPress={(event) => {
              event?.stopPropagation?.();
              openMenu(item.key);
            }}
            scaleTo={0.9}
            style={styles.toolbarButton}
          >
            <Image resizeMode="contain" source={item.source} style={styles.toolbarIcon} />
          </PressScale>
        ))}
      </View>

      {notice ? (
        <View pointerEvents="none" style={styles.notice}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      {menu ? (
        <View style={styles.overlay}>
          <Pressable
            accessibilityLabel="게임 메뉴 닫기"
            accessibilityRole="button"
            onPress={(event) => {
              event.stopPropagation();
              closeMenu();
            }}
            style={styles.backdrop}
          />
          <Animated.View style={[styles.blobPanel, panelMotion]}>
            <View pointerEvents="none" style={styles.blobPatternOne} />
            <View pointerEvents="none" style={styles.blobPatternTwo} />
            <PressScale
              accessibilityLabel="게임 메뉴 닫기"
              accessibilityRole="button"
              hitSlop={8}
              onPress={(event) => {
                event?.stopPropagation?.();
                closeMenu();
              }}
              scaleTo={0.9}
              style={styles.closeButton}
            >
              <Ionicons color="#6F6758" name="close" size={27} />
            </PressScale>

            {menu === 'bag' ? <BagPanel /> : null}
            {menu === 'diary' ? <DiaryPanel /> : null}
            {menu === 'settings' ? (
              <SettingsPanel
                controlMode={controlMode}
                onControlModeChange={(mode) => {
                  onControlModeChange(mode);
                  closeMenu();
                }}
              />
            ) : null}
            {menu === 'phone' ? (
              <PhonePanel
                action={phoneAction}
                onAction={setPhoneAction}
                onCancel={() => setPhoneAction(null)}
                onEmergencyExit={handleEmergencyExit}
                onExit={onExit}
                onOpenSettings={() => openMenu('settings')}
              />
            ) : null}
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

function OutlinedHudText({ children }: { children: string }) {
  return (
    <View style={styles.hudTextWrap}>
      {hudOutlineOffsets.map(({ x, y }) => (
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          key={`${x}-${y}`}
          style={[styles.hudTextOutline, { left: x, top: y }]}
        >
          {children}
        </Text>
      ))}
      <Text style={styles.hudText}>{children}</Text>
    </View>
  );
}

function PanelTitle({ children, icon }: { children: string; icon: number }) {
  return (
    <View style={styles.panelTitleRow}>
      <Image resizeMode="contain" source={icon} style={styles.panelTitleIcon} />
      <Text style={styles.panelTitle}>{children}</Text>
    </View>
  );
}

function BagPanel() {
  return (
    <View>
      <PanelTitle icon={icons.gameBag}>가방</PanelTitle>
      <View style={styles.walletCard}>
        <View style={styles.walletItem}>
          <Image resizeMode="contain" source={icons.gameMoney} style={styles.walletIcon} />
          <View>
            <Text style={styles.walletLabel}>용돈</Text>
            <Text style={styles.walletValue}>12,000원</Text>
          </View>
        </View>
        <View style={styles.walletDivider} />
        <View style={styles.walletItem}>
          <Image resizeMode="contain" source={icons.gameCoinWon} style={styles.walletIcon} />
          <View>
            <Text style={styles.walletLabel}>생활 코인</Text>
            <Text style={styles.walletValue}>515</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function DiaryPanel() {
  return (
    <View>
      <PanelTitle icon={icons.gameDiary}>오늘의 기록</PanelTitle>
      <View style={styles.diaryCard}>
        <View style={styles.diaryDot} />
        <View style={styles.diaryCopy}>
          <Text style={styles.diaryTitle}>민수와 안전 퀴즈 풀기</Text>
          <Text style={styles.diaryDescription}>가까이 다가가 대화를 시작해요.</Text>
        </View>
      </View>
    </View>
  );
}

function SettingsPanel({
  controlMode,
  onControlModeChange,
}: {
  controlMode: ControlMode;
  onControlModeChange: (mode: ControlMode) => void;
}) {
  return (
    <View>
      <PanelTitle icon={icons.gameSettings}>설정</PanelTitle>
      <Text style={styles.settingSectionTitle}>조작법 변경</Text>
      <ControlOption
        checked={controlMode === 'joystick'}
        icon="game-controller"
        label="슬라이드 패드"
        onPress={() => onControlModeChange('joystick')}
      />
      <ControlOption
        checked={controlMode === 'touch'}
        icon="hand-left"
        label="터치 이동"
        onPress={() => onControlModeChange('touch')}
      />
    </View>
  );
}

function ControlOption({
  checked,
  icon,
  label,
  onPress,
}: {
  checked: boolean;
  icon: 'game-controller' | 'hand-left';
  label: string;
  onPress: () => void;
}) {
  return (
    <PressScale
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      onPress={(event) => {
        event?.stopPropagation?.();
        onPress();
      }}
      style={[styles.controlOption, checked && styles.controlOptionSelected]}
    >
      <Ionicons color="#4D5F53" name={icon} size={22} />
      <Text style={styles.controlOptionText}>{label}</Text>
      {checked ? <Ionicons color={colors.mint} name="checkmark-circle" size={23} /> : null}
    </PressScale>
  );
}

function PhonePanel({
  action,
  onAction,
  onCancel,
  onEmergencyExit,
  onExit,
  onOpenSettings,
}: {
  action: PhoneAction;
  onAction: (action: PhoneAction) => void;
  onCancel: () => void;
  onEmergencyExit: () => void;
  onExit: () => void;
  onOpenSettings: () => void;
}) {
  if (action) {
    const exiting = action === 'exit';
    return (
      <View style={styles.confirmPanel}>
        <Image resizeMode="contain" source={icons.gamePhone} style={styles.confirmPhoneIcon} />
        <Text style={styles.confirmTitle}>{exiting ? '게임에서 나갈까요?' : '안전한 곳으로 이동할까요?'}</Text>
        <Text style={styles.confirmDescription}>
          {exiting ? '현재 게임 화면을 닫고 메뉴로 돌아갑니다.' : '길을 잃었을 때 시작 위치로 바로 이동합니다.'}
        </Text>
        <View style={styles.confirmActions}>
          <PressScale accessibilityRole="button" onPress={onCancel} style={styles.cancelButton}>
            <Text style={styles.cancelButtonText}>취소</Text>
          </PressScale>
          <PressScale
            accessibilityRole="button"
            onPress={exiting ? onExit : onEmergencyExit}
            style={[styles.confirmButton, exiting && styles.exitConfirmButton]}
            testID={exiting ? 'game-exit' : 'emergency-exit'}
          >
            <Text style={styles.confirmButtonText}>{exiting ? '나가기' : '이동하기'}</Text>
          </PressScale>
        </View>
      </View>
    );
  }

  return (
    <View>
      <PanelTitle icon={icons.gamePhone}>내 휴대폰</PanelTitle>
      <View style={styles.phoneGrid}>
        <PhoneApp color="#FFE1D8" icon="log-out-outline" label="게임 나가기" onPress={() => onAction('exit')} />
        <PhoneApp color="#FFF0B9" icon="shield-checkmark-outline" label="비상 탈출" onPress={() => onAction('emergency')} />
        <PhoneApp color="#DBF4E7" icon="options-outline" label="조작 설정" onPress={onOpenSettings} />
      </View>
    </View>
  );
}

function PhoneApp({
  color,
  icon,
  label,
  onPress,
}: {
  color: string;
  icon: 'log-out-outline' | 'shield-checkmark-outline' | 'options-outline';
  label: string;
  onPress: () => void;
}) {
  return (
    <PressScale
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={(event) => {
        event?.stopPropagation?.();
        onPress();
      }}
      scaleTo={0.92}
      style={styles.phoneApp}
    >
      <View style={[styles.phoneAppIcon, { backgroundColor: color }]}>
        <Ionicons color="#4E554F" name={icon} size={30} />
      </View>
      <Text style={styles.phoneAppLabel}>{label}</Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  menuRoot: { zIndex: 50 },
  topHud: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 30,
    position: 'absolute',
    right: 20,
    top: 58,
    zIndex: 24,
  },
  hudTextWrap: { position: 'relative' },
  hudText: {
    color: '#FFFFFF',
    fontFamily: fonts.gameHud,
    fontSize: 24,
    lineHeight: 30,
  },
  coinCounter: { alignItems: 'center', flexDirection: 'row', gap: 2, marginTop: -11 },
  hudTextOutline: {
    color: '#777777',
    fontFamily: fonts.gameHud,
    fontSize: 24,
    lineHeight: 30,
    position: 'absolute',
  },
  coinIcon: { height: 52, width: 52 },
  toolbar: {
    alignSelf: 'center',
    bottom: 24,
    flexDirection: 'row',
    gap: 10,
    position: 'absolute',
    width: 334,
    zIndex: 24,
  },
  toolbarButton: { height: 76, width: 76 },
  toolbarIcon: { height: 76, width: 76 },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(26,31,27,0.38)' },
  blobPanel: {
    backgroundColor: '#FFF7DC',
    borderColor: 'rgba(255,255,255,0.90)',
    borderRadius: 68,
    borderWidth: 2,
    elevation: 14,
    maxWidth: 370,
    minHeight: 354,
    overflow: 'hidden',
    paddingBottom: 34,
    paddingHorizontal: 30,
    paddingTop: 34,
    shadowColor: '#2C352E',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    width: '90%',
    zIndex: 1,
  },
  blobPatternOne: {
    backgroundColor: 'rgba(242,201,99,0.10)',
    borderRadius: 90,
    height: 180,
    left: -70,
    position: 'absolute',
    top: 80,
    width: 180,
  },
  blobPatternTwo: {
    backgroundColor: 'rgba(255,255,255,0.24)',
    borderRadius: 75,
    bottom: -54,
    height: 150,
    position: 'absolute',
    right: -35,
    width: 150,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.52)',
    borderColor: 'rgba(112,103,88,0.12)',
    borderRadius: 21,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    position: 'absolute',
    right: 22,
    top: 18,
    width: 42,
    zIndex: 4,
  },
  panelTitleRow: { alignItems: 'center', flexDirection: 'row', marginBottom: 24, paddingRight: 40 },
  panelTitleIcon: { height: 52, marginRight: 9, width: 52 },
  panelTitle: {
    color: '#403B33',
    fontFamily: fonts.laundryBold,
    fontSize: 24,
    letterSpacing: -0.6,
    textShadowColor: 'rgba(255,255,255,0.72)',
    textShadowOffset: { height: 1, width: 0 },
    textShadowRadius: 1,
  },
  walletCard: { backgroundColor: 'rgba(255,255,255,0.64)', borderRadius: 28, padding: 18 },
  walletItem: { alignItems: 'center', flexDirection: 'row' },
  walletIcon: { height: 66, marginRight: 14, width: 66 },
  walletLabel: { color: '#81796B', fontFamily: fonts.medium, fontSize: 13 },
  walletValue: { color: '#3F3B34', fontFamily: fonts.bold, fontSize: 20, marginTop: 3 },
  walletDivider: { backgroundColor: 'rgba(89,80,61,0.10)', height: 1, marginVertical: 10 },
  diaryCard: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.64)', borderRadius: 28, flexDirection: 'row', padding: 20 },
  diaryDot: { backgroundColor: colors.mint, borderRadius: 9, height: 18, marginRight: 13, width: 18 },
  diaryCopy: { flex: 1 },
  diaryTitle: { color: '#413D35', fontFamily: fonts.bold, fontSize: 17 },
  diaryDescription: { color: '#7F786C', fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, marginTop: 5 },
  settingSectionTitle: { color: '#6F685B', fontFamily: fonts.semibold, fontSize: 14, marginBottom: 10, marginLeft: 4 },
  controlOption: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.50)',
    borderColor: 'transparent',
    borderRadius: 22,
    borderWidth: 2,
    flexDirection: 'row',
    height: 58,
    marginBottom: 9,
    paddingHorizontal: 16,
  },
  controlOptionSelected: { backgroundColor: 'rgba(228,251,238,0.88)', borderColor: '#A9DFC1' },
  controlOptionText: { color: '#465248', flex: 1, fontFamily: fonts.semibold, fontSize: 16, marginLeft: 11 },
  phoneGrid: { flexDirection: 'row', gap: 14, justifyContent: 'center', paddingTop: 8 },
  phoneApp: { alignItems: 'center', width: 82 },
  phoneAppIcon: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.86)',
    borderRadius: 24,
    borderWidth: 2,
    elevation: 3,
    height: 70,
    justifyContent: 'center',
    shadowColor: '#574F40',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.10,
    shadowRadius: 7,
    width: 70,
  },
  phoneAppLabel: { color: '#49453E', fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, marginTop: 8, textAlign: 'center' },
  confirmPanel: { alignItems: 'center', paddingTop: 8 },
  confirmPhoneIcon: { height: 68, width: 68 },
  confirmTitle: { color: '#403B33', fontFamily: fonts.laundryBold, fontSize: 24, marginTop: 8, textAlign: 'center' },
  confirmDescription: { color: '#746D61', fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, marginTop: 10, textAlign: 'center' },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 25 },
  cancelButton: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.68)', borderRadius: 22, height: 52, justifyContent: 'center', width: 112 },
  cancelButtonText: { color: '#625D54', fontFamily: fonts.semibold, fontSize: 16 },
  confirmButton: { alignItems: 'center', backgroundColor: '#E7B945', borderRadius: 22, height: 52, justifyContent: 'center', width: 128 },
  exitConfirmButton: { backgroundColor: '#E97A67' },
  confirmButtonText: { color: colors.white, fontFamily: fonts.bold, fontSize: 16 },
  notice: {
    alignSelf: 'center',
    backgroundColor: 'rgba(35,45,38,0.86)',
    borderRadius: 22,
    bottom: 150,
    paddingHorizontal: 18,
    paddingVertical: 11,
    position: 'absolute',
    zIndex: 45,
  },
  noticeText: { color: colors.white, fontFamily: fonts.semibold, fontSize: 14 },
});
