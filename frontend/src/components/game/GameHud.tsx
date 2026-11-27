import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Easing, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import { icons } from '../../assets';
import { HUD_WALLET_WON } from '../../game/hudWallet';
import { createCalculatorState, pressCalculatorKey } from '../../game/calculator';
import type {
  DailyQuestId,
  DailyQuestItem,
} from '../../game/dailyQuests';
import { PressScale } from '../PressScale';
import { colors, fonts } from '../../theme';
import { GamePhonePanel } from './GamePhonePanel';
import type { PhoneAction, PhoneContact, PhoneTravelDestination } from './GamePhonePanel';
import type { BusRouteContext } from './BusRouteMap';
import { getGamePhoneLayout, PHONE_CASE_BORDER, PHONE_SCREEN_INSET } from '../../game/phoneLayout';
import { useDayJourney, dayJourneyStep } from '../../game/dayJourney';
import { getShoppingErrandStatus, useShoppingErrand } from '../../game/shoppingErrandStore';
import { usePhishingSession } from '../../game/phishingStore';
import { getPhishingGoal } from '../../game/phishingSession';
import { recordCompletedPhishingActivity } from '../../game/activityAlbum';
import { useCafeDraft } from '../../game/cafeStore';
import { getCafeObjective } from '../../game/cafeSession';
import { useLaundryDraft } from '../../game/laundryStore';
import { getLaundryObjective } from '../../game/laundrySession';

export type { DailyQuestItem } from '../../game/dailyQuests';

type ControlMode = 'joystick' | 'touch';
type MenuKey = 'bag' | 'diary' | 'phone' | 'settings';
type InventoryFilter = 'search' | 'recent' | 'alphabetical';

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

const questIconById: Record<DailyQuestId, ImageSourcePropType> = {
  'bus-route': icons.bus,
  'home-fridge': icons.home,
  'market-shopping': icons.mart,
  'minsu-safety': icons.userMale,
};

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
  marketBudget,
  controlMode,
  dailyQuests,
  onControlModeChange,
  onEmergencyExit,
  emergencyNotice = '안전한 위치로 이동했어요',
  onExit,
  onMenuVisibilityChange,
  onContactRequester,
  onCallContact,
  onOpenInventory,
  onOpenNotebook,
  onTravel,
  busRouteContext,
  onRouteViewed,
  onOpenJourney,
  onOpenErrand,
  onOpenCafe,
  onOpenLaundry,
  onEditMarketLayout,
  phoneRequest,
  onPhoneRequestHandled,
  onVisitMinsu,
}: {
  controlMode: ControlMode;
  dailyQuests: readonly DailyQuestItem[];
  onControlModeChange: (mode: ControlMode) => void;
  onEmergencyExit: () => void;
  emergencyNotice?: string | null;
  onExit: () => void;
  onMenuVisibilityChange: (open: boolean) => void;
  onContactRequester?: () => void;
  requesterLabel?: string;
  onCallContact?: (contact: PhoneContact) => void;
  onOpenInventory?: () => void;
  onOpenNotebook?: () => void;
  onTravel?: (destination: PhoneTravelDestination) => void;
  busRouteContext?: BusRouteContext;
  onRouteViewed?: () => void;
  onOpenJourney?: () => void;
  onOpenErrand?: () => void;
  onOpenCafe?: () => void;
  onOpenLaundry?: () => void;
  onEditMarketLayout?: () => void;
  phoneRequest?: { key: number; action: PhoneAction } | null;
  onPhoneRequestHandled?: () => void;
  onVisitMinsu?: () => void;
  /** 장보기 중일 때 코인 아래에 돈 아이콘과 함께 보여 줄 예산. */
  marketBudget?: number;
}) {
  const [menu, setMenu] = useState<MenuKey | null>(null);
  const [phoneAction, setPhoneAction] = useState<PhoneAction>(null);
  const [calculator, setCalculator] = useState(createCalculatorState);
  const [notice, setNotice] = useState<string | null>(null);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const panelProgress = useRef(new Animated.Value(0)).current;
  const viewport = useWindowDimensions();
  const phoneLayout = getGamePhoneLayout(viewport.width, viewport.height);
  const safetySession = usePhishingSession();
  const handledPhoneRequest = useRef<number | null>(null);

  useEffect(() => {
    if (safetySession?.status === 'completed') recordCompletedPhishingActivity(safetySession);
  }, [safetySession]);

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
    if (reduceMotionEnabled) {
      panelProgress.stopAnimation();
      panelProgress.setValue(menu ? 1 : 0);
    }
  }, [menu, panelProgress, reduceMotionEnabled]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 1800);
    return () => clearTimeout(timer);
  }, [notice]);

  const openMenu = useCallback((next: MenuKey) => {
    setPhoneAction(next === 'settings' ? 'settings' : null);
    setMenu(next === 'settings' ? 'phone' : next);
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
  }, [onMenuVisibilityChange, panelProgress, reduceMotionEnabled]);

  useEffect(() => {
    if (!phoneRequest || handledPhoneRequest.current === phoneRequest.key) return;
    handledPhoneRequest.current = phoneRequest.key;
    openMenu('phone');
    setPhoneAction(phoneRequest.action);
    onPhoneRequestHandled?.();
  }, [phoneRequest, openMenu, onPhoneRequestHandled]);

  const closeMenu = useCallback((afterClose?: () => void) => {
    // Press events must never become an after-close callback, even at an untyped UI boundary.
    const complete = typeof afterClose === 'function' ? afterClose : undefined;
    panelProgress.stopAnimation();
    if (reduceMotionEnabled) {
      panelProgress.setValue(0);
      setPhoneAction(null);
      setMenu(null);
      onMenuVisibilityChange(false);
      complete?.();
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
      complete?.();
    });
  }, [onMenuVisibilityChange, panelProgress, reduceMotionEnabled]);

  useEffect(() => {
    if (!menu) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phoneAction) setPhoneAction(null);
      else closeMenu();
      return true;
    });
    return () => subscription.remove();
  }, [closeMenu, menu, phoneAction]);

  const toggleMenu = (next: MenuKey) => {
    if (menu === (next === 'settings' ? 'phone' : next) && (next !== 'settings' || phoneAction === 'settings')) {
      closeMenu();
      return;
    }
    openMenu(next);
  };

  const handleEmergencyExit = () => {
    onEmergencyExit();
    setNotice(emergencyNotice);
    closeMenu();
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
    <View pointerEvents="box-none" testID="game-hud" style={[StyleSheet.absoluteFill, menu && styles.menuRoot]}>
      <View pointerEvents="none" testID="game-top-hud" style={styles.topHud}>
        <OutlinedHudText>11:45</OutlinedHudText>
        <View accessible accessibilityLabel={`현재 소지금 ${HUD_WALLET_WON.toLocaleString('ko-KR')}원`} style={styles.coinCounter}>
          <OutlinedHudText>{HUD_WALLET_WON.toLocaleString('ko-KR')}</OutlinedHudText>
          <Image resizeMode="contain" source={icons.gameCoinWon} style={styles.coinIcon} />
        </View>
      </View>
      {marketBudget !== undefined ? <View accessible accessibilityLabel={`장보기 예산 ${marketBudget.toLocaleString('ko-KR')}원`}
        pointerEvents="none" style={styles.budgetCounter} testID="game-market-budget">
        <View style={styles.budgetTag}><Text style={styles.budgetTagText}>예산</Text></View>
        <OutlinedHudText>{marketBudget.toLocaleString('ko-KR')}</OutlinedHudText>
        <Image resizeMode="contain" source={icons.gameMoney} style={styles.coinIcon} />
      </View> : null}

      <View pointerEvents="box-none" testID="game-toolbar" style={styles.toolbar}>
        {toolbarItems.map((item) => (
          <PressScale
            accessibilityLabel={`${item.label} 열기`}
            accessibilityRole="button"
            key={item.key}
            onPress={(event) => {
              event?.stopPropagation?.();
              if (item.key === 'bag' && onOpenInventory) { onOpenInventory(); return; }
              if (item.key === 'diary' && onOpenNotebook) { onOpenNotebook(); return; }
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
            testID={menu === 'phone' ? 'phone-case' : undefined}
            style={[
              styles.blobPanel,
              menu === 'bag' && styles.inventoryPanel,
              menu === 'diary' && styles.questPanel,
              menu === 'phone' && [styles.phonePanel, { width: phoneLayout.width, height: phoneLayout.height, borderRadius: phoneLayout.caseRadius }],
              inventoryPanelMotion,
            ]}
          >
            {menu === 'bag' ? <BagPanel /> : null}
            {menu === 'diary' ? <DiaryPanel quests={dailyQuests} onOpenSafety={() => { openMenu('phone'); setPhoneAction('messages'); }} onOpenJourney={onOpenJourney ? () => closeMenu(onOpenJourney) : undefined} onOpenErrand={onOpenErrand ? () => closeMenu(onOpenErrand) : undefined} onOpenCafe={onOpenCafe ? () => closeMenu(onOpenCafe) : undefined} onOpenLaundry={onOpenLaundry ? () => closeMenu(onOpenLaundry) : undefined} /> : null}
            {menu === 'phone' ? (
              <View testID="phone-screen-clip" style={{ flex: 1, minHeight: 0, overflow: 'hidden', borderRadius: phoneLayout.screenRadius }}>
                <View style={{ position: 'absolute', width: phoneLayout.contentWidth, height: phoneLayout.contentHeight,
                  left: phoneLayout.contentLeft, top: phoneLayout.contentTop, transform: [{ scale: phoneLayout.contentScale }] }}>
              <GamePhonePanel
                action={phoneAction}
                calculator={calculator}
                onAction={setPhoneAction}
                busRouteContext={busRouteContext}
                onRouteViewed={onRouteViewed}
                onOpenErrand={onOpenErrand ? () => closeMenu(onOpenErrand) : undefined}
                onEditMarketLayout={onEditMarketLayout ? () => closeMenu(onEditMarketLayout) : undefined}
                onVisitMinsu={onVisitMinsu ? () => closeMenu(onVisitMinsu) : undefined}
                onTravel={onTravel ? destination => closeMenu(() => onTravel(destination)) : undefined}
                onCalculatorKey={(key) => setCalculator((current) => pressCalculatorKey(current, key))}
                onClose={() => closeMenu()}
                onCallContact={(contact) => closeMenu(() => {
                  if (onCallContact) onCallContact(contact);
                  else if (contact === 'jiyoung' && onContactRequester) onContactRequester();
                  else setNotice('지금은 통화를 연결할 수 없어요');
                })}
                controlMode={controlMode}
                onControlModeChange={onControlModeChange}
                reduceMotion={reduceMotionEnabled}
                onEmergencyExit={handleEmergencyExit}
                onExit={() => {
                  closeMenu();
                  onExit();
                }}
              />
                </View>
              </View>
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

function getQuestDetail(quest: DailyQuestItem) {
  if (quest.status === 'available') {
    return quest.discoveryHint;
  }
  return `${quest.region} · ${quest.description}`;
}

function DiaryPanel({ quests, onOpenJourney, onOpenErrand, onOpenSafety, onOpenCafe, onOpenLaundry }: { quests: readonly DailyQuestItem[]; onOpenJourney?: () => void; onOpenErrand?: () => void; onOpenSafety: () => void; onOpenCafe?: () => void; onOpenLaundry?: () => void }) {
  const journey = useDayJourney();
  const errand = useShoppingErrand();
  const safetySession = usePhishingSession();
  const cafeSession = useCafeDraft();
  const laundrySession = useLaundryDraft();
  const completedCount = quests.filter(({ status }) => status === 'completed').length;
  const questCount = quests.length;

  return (
    <View style={styles.questContent}>
      <View style={styles.questHeader}>
        <Text style={styles.questHeaderTitle}>오늘의 이야기</Text>
        <Text style={styles.visuallyHidden}>오늘의 퀘스트</Text>
        <View
          accessibilityLabel={`오늘 ${completedCount}/${questCount} 완료`}
          accessibilityLiveRegion="polite"
          style={styles.questHeaderSummary}
        >
          <Text style={styles.questHeaderSummaryText}>{completedCount}/{questCount} 완료</Text>
        </View>
      </View>

      <View style={styles.questSheet}>
        {onOpenJourney ? <PressScale accessibilityRole="button" accessibilityLabel="도서관 다녀오기 일정 열기" onPress={onOpenJourney} style={{ position: 'absolute', top: 10, left: 14, right: 14, height: 49, backgroundColor: '#E3E8D8', borderRadius: 15, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="book" size={24} color="#627D64" /><Text style={{ flex: 1, color: '#4E6352', fontFamily: fonts.bold, fontSize: 17 }}>도서관 다녀오기</Text><Text style={{ color: '#78826F', fontFamily: fonts.semibold, fontSize: 14 }}>{journey.stage === 'available' ? '새 부탁' : `${dayJourneyStep(journey.stage)}/4`}</Text><Ionicons name="chevron-forward" size={18} color="#7B8C73" />
        </PressScale> : null}
        <View pointerEvents="none" style={styles.questDashedOutline} />
        <ScrollView style={[styles.questList, { top: onOpenJourney ? 65 : 8, height: onOpenJourney ? 198 : 264 }]} contentContainerStyle={{ gap: 2 }} showsVerticalScrollIndicator={!!onOpenJourney || !!onOpenCafe || !!onOpenLaundry}>
          {onOpenLaundry ? <PressScale accessibilityRole="button" accessibilityLabel="동네 빨래방 열기" onPress={onOpenLaundry} style={{ minHeight: 76, padding: 12, borderRadius: 15, backgroundColor: '#E3EBDD', marginBottom: 7, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="shirt-outline" size={26} color="#789383" /><View style={{ flex: 1 }}><Text style={{ color: '#4F6658', fontFamily: fonts.bold, fontSize: 17 }}>동네 빨래방</Text><Text style={{ color: '#718475', fontFamily: fonts.medium, fontSize: 14, lineHeight: 21 }}>{laundrySession ? getLaundryObjective(laundrySession) : '빨래 챙기기 · 세탁하기 · 옷장 정리'}</Text></View><Ionicons name={laundrySession?.phase === 'finished' ? 'checkmark-circle' : 'chevron-forward'} size={20} color="#789383" />
          </PressScale> : null}
          {onOpenCafe ? <PressScale accessibilityRole="button" accessibilityLabel="카페 첫 근무 열기" onPress={onOpenCafe} style={{ minHeight: 76, padding: 12, borderRadius: 15, backgroundColor: '#EEE4D3', marginBottom: 7, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="cafe-outline" size={26} color="#977456" /><View style={{ flex: 1 }}><Text style={{ color: '#625345', fontFamily: fonts.bold, fontSize: 17 }}>카페 첫 근무</Text><Text style={{ color: '#817260', fontFamily: fonts.medium, fontSize: 14, lineHeight: 21 }}>{cafeSession ? getCafeObjective(cafeSession) : '주문받기 · 음료 만들기 · 자리 정리'}</Text></View><Ionicons name={cafeSession?.phase === 'finished' ? 'checkmark-circle' : 'chevron-forward'} size={20} color="#977456" />
          </PressScale> : null}
          <PressScale accessibilityRole="button" accessibilityLabel="수상한 연락 확인하기" onPress={onOpenSafety} style={{ minHeight: 76, padding: 12, borderRadius: 15, backgroundColor: '#E3EADD', marginBottom: 7, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="chatbubbles-outline" size={25} color="#617B67" /><View style={{ flex: 1 }}><Text style={{ color: '#4E6352', fontFamily: fonts.bold, fontSize: 17 }}>수상한 연락 확인하기</Text><Text style={{ color: '#677660', fontFamily: fonts.medium, fontSize: 14, lineHeight: 21 }}>{safetySession ? getPhishingGoal(safetySession) : '민수에게 온 연락 · 3–5분'}</Text></View><Ionicons name={safetySession?.status === 'completed' ? 'checkmark-circle' : 'chevron-forward'} size={20} color="#6C846D" />
          </PressScale>
          {errand && onOpenErrand ? <PressScale accessibilityRole="button" accessibilityLabel="퇴근길 장보기 부탁 확인" onPress={onOpenErrand} style={{ minHeight: 72, padding: 12, borderRadius: 15, backgroundColor: '#E8E7D5', marginBottom: 7, flexDirection: 'row', alignItems: 'center', gap: 10 }}><Ionicons name="basket-outline" size={25} color="#6C8064" /><View style={{ flex: 1 }}><Text style={{ color: '#4E6352', fontFamily: fonts.bold, fontSize: 17 }}>퇴근길 장보기</Text><Text style={{ color: '#78826F', fontFamily: fonts.medium, fontSize: 14, lineHeight: 21 }}>{getShoppingErrandStatus(errand)}</Text></View><Ionicons name="chevron-forward" size={18} color="#7B8C73" /></PressScale> : null}
          {quests.slice(0, 4).map((quest) => {
            const source = questIconById[quest.id];
            const isUndiscovered = quest.status === 'available';
            const detail = getQuestDetail(quest);
            const accessibleLabel = isUndiscovered
              ? detail
              : `${quest.title}, ${quest.status === 'completed' ? '완료' : '진행 중'}, ${detail}`;
            return (
              <View
                accessible
                accessibilityLabel={accessibleLabel}
                key={quest.id}
                style={[styles.questRow, quest.status === 'completed' && styles.questRowComplete]}
                testID="daily-quest-row"
              >
                <View style={styles.questRowInner} testID={`quest-row-${quest.id}`}>
                  {!isUndiscovered ? (
                    <View style={styles.questIconCanvas}>
                      <View style={styles.questIconCircle} />
                      <Image resizeMode="contain" source={source} style={styles.questIcon} />
                      {quest.status === 'completed' ? (
                        <View style={styles.questCompleteBadge}>
                          <Ionicons color="#FFFFFF" name="checkmark" size={11} />
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                  <View style={[styles.questCopy, isUndiscovered && styles.questCopyUndiscovered]}>
                    {!isUndiscovered ? (
                      <>
                        <View style={styles.questTitleLine}>
                          <Text numberOfLines={1} style={styles.questTitle}>
                            {quest.title}
                          </Text>
                        </View>
                        <Text numberOfLines={1} style={styles.questDescription}>
                          {detail}
                        </Text>
                      </>
                    ) : (
                      <Text numberOfLines={2} style={styles.questUndiscoveredDescription}>
                        {detail}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </ScrollView>
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
  budgetCounter: { alignItems: 'center', flexDirection: 'row', gap: 2, position: 'absolute', right: 20, top: 98, zIndex: 24 },
  budgetTag: { backgroundColor: '#4C6758', borderColor: '#FFFFFF', borderRadius: 10, borderWidth: 2, marginRight: 4, paddingHorizontal: 8, paddingVertical: 1 },
  budgetTagText: { color: '#FFFFFF', fontFamily: fonts.gameHud, fontSize: 15, lineHeight: 20 },
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
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  referenceOverlay: { justifyContent: 'flex-end', paddingBottom: 108, zIndex: 23 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(26,31,27,0.38)' },
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
  phonePanel: {
    backgroundColor: '#576A5B',
    borderColor: '#8B9A84',
    borderWidth: PHONE_CASE_BORDER,
    maxWidth: 360,
    minHeight: 0,
    padding: PHONE_SCREEN_INSET - PHONE_CASE_BORDER,
    paddingBottom: PHONE_SCREEN_INSET - PHONE_CASE_BORDER,
    paddingHorizontal: PHONE_SCREEN_INSET - PHONE_CASE_BORDER,
    paddingTop: PHONE_SCREEN_INSET - PHONE_CASE_BORDER,
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
    ...StyleSheet.absoluteFill,
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
  questHeaderSummary: {
    alignItems: 'center',
    bottom: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    position: 'absolute',
  },
  questHeaderSummaryText: {
    color: '#BEB6AA',
    fontFamily: fonts.cafe24SsurroundAir,
    fontSize: 8.5,
    letterSpacing: -0.15,
    lineHeight: 11,
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
    ...StyleSheet.absoluteFill,
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
  questRowInner: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    minWidth: 0,
  },
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
  questCopyUndiscovered: {
    justifyContent: 'center',
    marginLeft: 0,
    paddingHorizontal: 12,
  },
  questTitleLine: {
    alignItems: 'center',
    flexDirection: 'row',
    minWidth: 0,
  },
  questTitle: {
    color: '#333333',
    flex: 1,
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
  questUndiscoveredDescription: {
    color: '#56514A',
    fontFamily: fonts.cafe24Ssurround,
    fontSize: 14,
    letterSpacing: -0.35,
    lineHeight: 20,
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
