import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import { icons } from '../../assets';
import { PressScale } from '../PressScale';
import { colors, fonts } from '../../theme';

type ControlMode = 'joystick' | 'touch';
type MenuKey = 'bag' | 'diary' | 'phone' | 'settings';
type PhoneAction = 'exit' | 'emergency' | null;
type IoniconName = ComponentProps<typeof Ionicons>['name'];
type InventoryFilter = 'search' | 'recent' | 'alphabetical';

export type DailyQuestItem = {
  completed: boolean;
  description: string;
  id: string;
  rewardXp: number;
  title: string;
};

type InventoryItem = {
  filters: readonly InventoryFilter[];
  id: string;
  label: string;
  source: ImageSourcePropType;
};

const toolbarItems = [
  { key: 'bag' as const, label: '가방', source: icons.gameBag },
  { key: 'diary' as const, label: '수첩', source: icons.gameDiary },
  { key: 'phone' as const, label: '휴대폰', source: icons.gamePhone },
  { key: 'settings' as const, label: '설정', source: icons.gameSettings },
];

const inventoryFilters: ReadonlyArray<{
  iconOffset: { x: number; y: number };
  key: InventoryFilter;
  label: string;
  source: ImageSourcePropType;
}> = [
  { iconOffset: { x: -1, y: -0.5 }, key: 'search', label: '물건 검색', source: icons.gameUiSearch },
  { iconOffset: { x: 0.5, y: 0.5 }, key: 'recent', label: '최근 순', source: icons.gameUiClock },
  { iconOffset: { x: -0.5, y: -1 }, key: 'alphabetical', label: '가나다 순', source: icons.gameUiSort },
];

const inventoryItems: readonly InventoryItem[] = [
  { filters: ['search', 'recent', 'alphabetical'], id: 'phone-1', label: '휴대폰', source: icons.gamePhone },
  { filters: ['search', 'recent', 'alphabetical'], id: 'phone-2', label: '휴대폰', source: icons.gamePhone },
  { filters: ['search', 'recent', 'alphabetical'], id: 'phone-3', label: '휴대폰', source: icons.gamePhone },
  { filters: ['search', 'recent', 'alphabetical'], id: 'phone-4', label: '휴대폰', source: icons.gamePhone },
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
  dailyQuests,
  onControlModeChange,
  onEmergencyExit,
  onExit,
  onMenuVisibilityChange,
}: {
  controlMode: ControlMode;
  dailyQuests: readonly DailyQuestItem[];
  onControlModeChange: (mode: ControlMode) => void;
  onEmergencyExit: () => void;
  onExit: () => void;
  onMenuVisibilityChange: (open: boolean) => void;
}) {
  const [menu, setMenu] = useState<MenuKey | null>(null);
  const [phoneAction, setPhoneAction] = useState<PhoneAction>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const panelProgress = useRef(new Animated.Value(0)).current;
  const wobble = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotionEnabled(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotionEnabled);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!menu || reduceMotionEnabled) {
      wobble.stopAnimation();
      wobble.setValue(0);
      if (reduceMotionEnabled) {
        panelProgress.stopAnimation();
        panelProgress.setValue(menu ? 1 : 0);
      }
      return undefined;
    }
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
  }, [menu, panelProgress, reduceMotionEnabled, wobble]);

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
    if (reduceMotionEnabled) {
      panelProgress.setValue(1);
      return;
    }
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
    if (reduceMotionEnabled) {
      panelProgress.setValue(0);
      setPhoneAction(null);
      setMenu(null);
      onMenuVisibilityChange(false);
      return;
    }
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

  const toggleMenu = (next: MenuKey) => {
    if (menu === next) {
      closeMenu();
      return;
    }
    openMenu(next);
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

  const inventoryPanelMotion = {
    opacity: panelProgress,
    transform: [
      {
        translateY: panelProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [44, 0],
        }),
      },
      {
        scale: panelProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.97, 1],
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
              toggleMenu(item.key);
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
        <View style={[styles.overlay, (menu === 'bag' || menu === 'diary') && styles.referenceOverlay]}>
          <Pressable
            accessibilityLabel="게임 메뉴 닫기"
            accessibilityRole="button"
            onPress={(event) => {
              event.stopPropagation();
              closeMenu();
            }}
            style={[styles.backdrop, (menu === 'bag' || menu === 'diary') && styles.referenceBackdrop]}
          />
          <Animated.View
            accessibilityViewIsModal={menu !== 'bag' && menu !== 'diary'}
            style={[
              styles.blobPanel,
              menu === 'bag' && styles.inventoryPanel,
              menu === 'diary' && styles.questPanel,
              menu === 'bag' || menu === 'diary' ? inventoryPanelMotion : panelMotion,
            ]}
          >
            {menu !== 'bag' && menu !== 'diary' ? <View pointerEvents="none" style={styles.blobPatternOne} /> : null}
            {menu !== 'bag' && menu !== 'diary' ? <View pointerEvents="none" style={styles.blobPatternTwo} /> : null}
            {menu !== 'bag' && menu !== 'diary' ? (
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
            ) : null}

            {menu === 'bag' ? <BagPanel /> : null}
            {menu === 'diary' ? <DiaryPanel quests={dailyQuests} /> : null}
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
  const [filter, setFilter] = useState<InventoryFilter>('search');
  const visibleItems = inventoryItems.filter((item) => item.filters.includes(filter));
  const slots = Array.from({ length: 10 }, (_, index) => visibleItems[index] ?? null);

  return (
    <View style={styles.inventoryContent}>
      <View style={styles.inventoryHeader}>
        <View accessibilityRole="tablist" style={styles.inventoryTabs}>
          {inventoryFilters.map((item) => {
            const selected = item.key === filter;
            return (
              <PressScale
                accessibilityLabel={item.label}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                key={item.key}
                onPress={() => setFilter(item.key)}
                scaleTo={0.92}
                style={[styles.inventoryTab, selected && styles.inventoryTabSelected]}
              >
                <Image
                  resizeMode="contain"
                  source={item.source}
                  style={[
                    styles.inventoryToolIcon,
                    { transform: [{ translateX: item.iconOffset.x }, { translateY: item.iconOffset.y }] },
                  ]}
                />
              </PressScale>
            );
          })}
        </View>

        <View accessibilityLabel="보유 금액 12,000" style={styles.inventoryMoney}>
          <Text style={styles.inventoryMoneyText}>12,000</Text>
          <Image resizeMode="contain" source={icons.gameMoney} style={styles.inventoryMoneyIcon} />
        </View>
      </View>

      <View style={styles.inventorySheet}>
        <View pointerEvents="none" style={styles.inventoryDashedOutline} />
        <View style={styles.inventoryGrid}>
          {slots.map((item, index) =>
            item ? (
              <PressScale
                accessibilityLabel={item.label}
                accessibilityRole="button"
                key={item.id}
                scaleTo={0.94}
                style={styles.inventorySlot}
                testID="inventory-item-slot"
              >
                <View pointerEvents="none" style={styles.inventoryItemCircle} />
                <Image resizeMode="contain" source={item.source} style={styles.inventoryItemIcon} />
              </PressScale>
            ) : (
              <View
                accessibilityLabel="빈 가방 칸"
                key={`empty-${filter}-${index}`}
                style={styles.inventorySlot}
                testID="inventory-empty-slot"
              >
                <View style={styles.inventoryEmptyDot} />
              </View>
            ),
          )}
        </View>
        <Text accessibilityLabel="가방 용량 4개 중 30칸" style={styles.inventoryCount}>
          4/30
        </Text>
      </View>
      <PanelTail fill="#C0B5A3" placement="bag" />
    </View>
  );
}

function DiaryPanel({ quests }: { quests: readonly DailyQuestItem[] }) {
  const completedCount = quests.filter(({ completed }) => completed).length;
  const questCount = quests.length;
  const questIcons: ReadonlyArray<ImageSourcePropType | null> = [
    icons.gamePhone,
    icons.gameBag,
    icons.gameDiary,
    null,
  ];

  return (
    <View style={styles.questContent}>
      <View style={styles.questHeader}>
        <Text style={styles.questHeaderTitle}>오늘의 이야기</Text>
        <Text style={styles.visuallyHidden}>오늘의 퀘스트</Text>
        <Text accessibilityLiveRegion="polite" style={styles.visuallyHidden}>
          {completedCount}/{questCount} 완료
        </Text>
      </View>

      <View style={styles.questSheet}>
        <View pointerEvents="none" style={styles.questDashedOutline} />
        <View style={styles.questList}>
          {quests.slice(0, 4).map((quest, index) => {
            const source = questIcons[index] ?? null;
            return (
              <View
                accessibilityLabel={`${quest.title}, ${quest.completed ? '완료' : '진행 전'}`}
                key={quest.id}
                style={[styles.questRow, quest.completed && styles.questRowComplete]}
                testID="daily-quest-row"
              >
                <View style={styles.questIconCanvas}>
                  <View style={styles.questIconCircle} />
                  {source ? <Image resizeMode="contain" source={source} style={styles.questIcon} /> : null}
                  {quest.completed ? (
                    <View style={styles.questCompleteBadge}>
                      <Ionicons color="#FFFFFF" name="checkmark" size={11} />
                    </View>
                  ) : null}
                </View>
                <View style={styles.questCopy}>
                  <Text numberOfLines={1} style={styles.questTitle}>
                    {quest.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.questDescription}>
                    {quest.description}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
        <Text style={styles.questFooter}>퀘스트는 매일 아침 7시에 초기화돼요.</Text>
      </View>
      <PanelTail fill="#EFECE8" placement="diary" />
    </View>
  );
}

function PanelTail({ fill, placement }: { fill: string; placement: 'bag' | 'diary' }) {
  return (
    <View
      pointerEvents="none"
      style={[styles.panelTail, placement === 'diary' && styles.diaryPanelTail]}
      testID={placement + '-panel-tail'}
    >
      <View style={[styles.panelTailInner, { backgroundColor: fill }]} />
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
  referenceOverlay: { justifyContent: 'flex-end', paddingBottom: 108, zIndex: 23 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(26,31,27,0.38)' },
  referenceBackdrop: { backgroundColor: 'transparent' },
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
  inventoryPanel: {
    backgroundColor: '#4B4B4B',
    borderColor: '#4B4B4B',
    borderRadius: 7,
    borderWidth: 3,
    elevation: 0,
    height: 229,
    maxWidth: 356,
    minHeight: 229,
    overflow: 'visible',
    paddingBottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
    shadowOpacity: 0,
    width: 356,
  },
  questPanel: {
    backgroundColor: '#4B4B4B',
    borderColor: '#4B4B4B',
    borderRadius: 7,
    borderWidth: 3,
    elevation: 0,
    height: 373,
    maxWidth: 356,
    minHeight: 373,
    overflow: 'visible',
    paddingBottom: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
    shadowOpacity: 0,
    width: 356,
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
  inventoryCloseButton: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderColor: 'rgba(255,255,255,0.16)',
    right: 12,
    top: 10,
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
  inventoryContent: { flex: 1, overflow: 'visible' },
  inventoryHeader: {
    height: 47,
    position: 'relative',
  },
  inventoryTabs: {
    flexDirection: 'row',
    gap: 4,
    height: 40,
    left: 10,
    position: 'absolute',
    top: 0,
  },
  inventoryTab: {
    alignItems: 'center',
    borderRadius: 7,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  inventoryTabSelected: { backgroundColor: 'transparent' },
  inventoryToolIcon: { height: 40, width: 40 },
  inventoryMoney: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 40,
    position: 'absolute',
    right: 11,
    top: 3,
  },
  inventoryMoneyText: {
    color: '#AAAAAA',
    fontFamily: fonts.gameHud,
    fontSize: 16,
    lineHeight: 22,
    marginRight: 2,
  },
  inventoryMoneyIcon: { height: 40, width: 40 },
  inventorySheet: {
    backgroundColor: '#C0B5A3',
    borderRadius: 4,
    bottom: 0,
    height: 179,
    left: 0,
    overflow: 'visible',
    position: 'absolute',
    right: 0,
  },
  inventoryDashedOutline: {
    ...StyleSheet.absoluteFillObject,
    borderColor: 'rgba(75,75,75,0.25)',
    borderRadius: 4,
    borderStyle: 'dashed',
    borderWidth: 2.5,
    bottom: 5,
    left: 5,
    right: 5,
    top: 5,
  },
  inventoryGrid: {
    columnGap: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    height: 132,
    left: 19,
    position: 'absolute',
    rowGap: 20,
    top: 19,
    width: 312,
  },
  inventorySlot: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    height: 56,
    justifyContent: 'center',
    position: 'relative',
    width: 56,
  },
  inventoryItemCircle: {
    backgroundColor: 'rgba(255,255,255,0.76)',
    borderRadius: 21,
    height: 42,
    position: 'absolute',
    width: 42,
  },
  inventoryEmptyDot: {
    backgroundColor: 'rgba(244,247,246,0.88)',
    borderRadius: 9,
    height: 18,
    width: 18,
  },
  inventoryItemIcon: { height: 56, width: 56 },
  inventoryCount: {
    backgroundColor: '#4B4B4B',
    borderRadius: 6,
    bottom: -2,
    color: '#FFFFFF',
    fontFamily: fonts.laundryBold,
    fontSize: 10,
    height: 19,
    lineHeight: 19,
    overflow: 'hidden',
    position: 'absolute',
    right: -2,
    textAlign: 'center',
    width: 38,
  },
  panelTail: {
    backgroundColor: '#4B4B4B',
    bottom: -11,
    height: 22,
    left: 37,
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
    width: 22,
    zIndex: -1,
  },
  diaryPanelTail: { left: 124 },
  panelTailInner: {
    height: 16,
    left: 3,
    position: 'absolute',
    top: 3,
    width: 16,
  },
  questContent: { flex: 1, overflow: 'visible' },
  questHeader: {
    alignItems: 'center',
    height: 47,
    justifyContent: 'center',
  },
  questHeaderTitle: {
    color: '#C7BFB3',
    fontFamily: fonts.cafe24Ssurround,
    fontSize: 18,
    letterSpacing: -0.45,
    lineHeight: 24,
    transform: [{ translateY: -3 }],
  },
  questSheet: {
    backgroundColor: '#EFECE8',
    borderRadius: 4,
    bottom: 0,
    height: 323,
    left: 0,
    overflow: 'visible',
    position: 'absolute',
    right: 0,
  },
  questDashedOutline: {
    ...StyleSheet.absoluteFillObject,
    borderColor: 'rgba(75,75,75,0.25)',
    borderRadius: 4,
    borderStyle: 'dashed',
    borderWidth: 2.5,
    bottom: 5,
    left: 5,
    right: 5,
    top: 5,
  },
  questList: {
    gap: 2,
    left: 26,
    position: 'absolute',
    top: 8,
    width: 298,
  },
  questRow: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 64,
    width: 298,
  },
  questRowComplete: { opacity: 0.58 },
  questIconCanvas: {
    alignItems: 'center',
    height: 64,
    justifyContent: 'center',
    position: 'relative',
    width: 64,
  },
  questIconCircle: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 24,
    height: 48,
    position: 'absolute',
    width: 48,
  },
  questIcon: { height: 64, width: 64 },
  questCompleteBadge: {
    alignItems: 'center',
    backgroundColor: '#68A77E',
    borderColor: '#EFECE8',
    borderRadius: 8,
    borderWidth: 1.5,
    bottom: 5,
    height: 16,
    justifyContent: 'center',
    position: 'absolute',
    right: 4,
    width: 16,
  },
  questCopy: { flex: 1, marginLeft: 14, minWidth: 0 },
  questTitle: {
    color: '#333333',
    fontFamily: fonts.cafe24Ssurround,
    fontSize: 16,
    letterSpacing: -0.4,
    lineHeight: 21,
  },
  questDescription: {
    color: '#333333',
    fontFamily: fonts.cafe24SsurroundAir,
    fontSize: 12,
    letterSpacing: -0.3,
    lineHeight: 16,
  },
  questFooter: {
    bottom: 27,
    color: '#888888',
    fontFamily: fonts.cafe24Ssurround,
    fontSize: 10,
    left: 0,
    letterSpacing: -0.25,
    lineHeight: 14,
    position: 'absolute',
    right: 0,
    textAlign: 'center',
  },
  visuallyHidden: {
    height: 1,
    opacity: 0,
    overflow: 'hidden',
    position: 'absolute',
    width: 1,
  },
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
