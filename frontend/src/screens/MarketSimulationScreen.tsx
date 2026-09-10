import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  GestureResponderEvent,
  Image,
  LayoutChangeEvent,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { icons } from '../assets';
import { PressScale } from '../components/PressScale';
import { MarketShelfScene } from '../components/game/MarketShelfScene';
import {
  MarketCategoryFixture,
  MarketCheckoutFixture,
  MarketExitMarker,
  MarketInteriorBackdrop,
} from '../components/game/MarketInteriorLayer';
import {
  evaluateMarketCart,
  getCartQuantity,
  getMarketCartTotal,
  getMarketProduct,
  MarketCart,
  MarketCategoryId,
  MarketEvaluation,
  MarketProduct,
  marketCategories,
  marketMission,
  marketProducts,
} from '../game/scenarios';
import { getMarketProductImage } from '../game/marketProductImages';
import { MARKET_CASHIER_COLLIDER, MARKET_CHECKOUT_POINT, MARKET_CHECKOUT_RECT } from '../game/prototypeWorld';
import { colors, fonts } from '../theme';

type MarketPhase = 'briefing' | 'shopping' | 'checkout' | 'result' | 'exit';
type MarketMode = 'practice' | 'challenge';
type MarketBriefingView = 'picture' | 'text';
type IoniconName = ComponentProps<typeof Ionicons>['name'];
export type MarketStationId = MarketCategoryId | 'checkout';
export type MarketInteractionRequest = { id: number; station: MarketStationId };
type MarketPoint = { x: number; y: number };
type MarketControlMode = 'joystick' | 'touch';
type MarketNoticeTone = 'success' | 'warning' | 'info';
type MarketNotice = { message: string; tone: MarketNoticeTone };
export type MarketProductDropDecision = {
  accepted: boolean;
  reason?: 'unavailable';
};
type MarketObjectiveProgress = (typeof marketMission.objectives)[number] & {
  current: number;
  product: MarketProduct | undefined;
};
type MarketSessionEvaluation = MarketEvaluation & {
  quantityOverages: Array<{ productId: string; quantity: number }>;
};

const MARKET_WORLD_WIDTH = 900;
const MARKET_WORLD_HEIGHT = 1000;
const MARKET_PLAYER_RADIUS = 22;
const MARKET_MOVE_SPEED = 190;
const MARKET_ACCESSIBILITY_STEP = 58;
const MARKET_INTERACTION_DISTANCE = 105;
const MARKET_JOYSTICK_RADIUS = 34;
const MARKET_JOYSTICK_SIZE = 110;
const MARKET_JOYSTICK_ZONE_HEIGHT = 250;
const MARKET_PLAYER_START: MarketPoint = { x: 450, y: 860 };
const MARKET_RECEIPT_SURCHARGE = 1200;
const MARKET_STOCKOUT_PRODUCT_ID = 'curry';
const MARKET_SUBSTITUTE_PRODUCT_ID = 'brand-curry';
const MARKET_MODE_COPY: Record<MarketMode, { description: string; icon: IoniconName; label: string }> = {
  practice: {
    description: '목록 표시와 단계별 도움을 보며 천천히 연습해요.',
    icon: 'sparkles-outline',
    label: '연습 모드',
  },
  challenge: {
    description: '진열대 단서를 줄이고 영수증 문제까지 해결해요.',
    icon: 'game-controller-outline',
    label: '도전 모드',
  },
};
const MARKET_STATIONS: Record<MarketStationId, MarketPoint> = {
  checkout: MARKET_CHECKOUT_POINT,
  fresh: { x: 350, y: 400 },
  produce: { x: 550, y: 400 },
  meal: { x: 350, y: 680 },
  drink: { x: 550, y: 680 },
};

const MARKET_SHELVES: Record<MarketCategoryId, { height: number; width: number; x: number; y: number }> = {
  fresh: { height: 128, width: 220, x: 90, y: 310 },
  produce: { height: 128, width: 220, x: 590, y: 310 },
  meal: { height: 128, width: 220, x: 90, y: 590 },
  drink: { height: 128, width: 220, x: 590, y: 590 },
};

const MARKET_OBSTACLES = [
  MARKET_CHECKOUT_RECT,
  MARKET_CASHIER_COLLIDER,
  ...Object.values(MARKET_SHELVES),
];

function isMarketBlocked(point: MarketPoint) {
  return MARKET_OBSTACLES.some(
    (obstacle) =>
      point.x + MARKET_PLAYER_RADIUS > obstacle.x &&
      point.x - MARKET_PLAYER_RADIUS < obstacle.x + obstacle.width &&
      point.y + MARKET_PLAYER_RADIUS > obstacle.y &&
      point.y - MARKET_PLAYER_RADIUS < obstacle.y + obstacle.height,
  );
}

function clampMarketPoint(point: MarketPoint): MarketPoint {
  return {
    x: Math.max(MARKET_PLAYER_RADIUS, Math.min(point.x, MARKET_WORLD_WIDTH - MARKET_PLAYER_RADIUS)),
    y: Math.max(MARKET_PLAYER_RADIUS, Math.min(point.y, MARKET_WORLD_HEIGHT - MARKET_PLAYER_RADIUS)),
  };
}

function findMarketReachableTarget(current: MarketPoint, desired: MarketPoint): MarketPoint {
  const clamped = clampMarketPoint(desired);
  for (let step = 12; step >= 0; step -= 1) {
    const ratio = step / 12;
    const candidate = {
      x: current.x + (clamped.x - current.x) * ratio,
      y: current.y + (clamped.y - current.y) * ratio,
    };
    if (!isMarketBlocked(candidate)) return candidate;
  }
  return current;
}

const formatPrice = (price: number) => `${price.toLocaleString('ko-KR')}원`;

function MarketProductArtwork({ product, size }: { product: MarketProduct; size: number }) {
  const [imageFailed, setImageFailed] = useState(false);
  const source = getMarketProductImage(product.id);

  useEffect(() => {
    setImageFailed(false);
  }, [product.id, source]);

  if (source && !imageFailed) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        accessible={false}
        onError={() => setImageFailed(true)}
        resizeMode="contain"
        source={source}
        style={{ height: size, width: size }}
      />
    );
  }

  return <Ionicons color={product.color} name={product.icon as IoniconName} size={Math.round(size * 0.62)} />;
}

function getObjectiveCartQuantity(cart: MarketCart, productId: string, mode: MarketMode) {
  const directQuantity = getCartQuantity(cart, productId);
  if (mode === 'challenge' && productId === MARKET_STOCKOUT_PRODUCT_ID) {
    return directQuantity + getCartQuantity(cart, MARKET_SUBSTITUTE_PRODUCT_ID);
  }
  return directQuantity;
}

export function evaluateMarketProductDrop(
  _cart: MarketCart,
  productId: string,
  mode: MarketMode,
): MarketProductDropDecision {
  const product = getMarketProduct(productId);
  if (!product) return { accepted: false, reason: 'unavailable' };
  if (mode === 'challenge' && productId === MARKET_STOCKOUT_PRODUCT_ID) {
    return { accepted: false, reason: 'unavailable' };
  }

  // Choosing a product is not a correctness check. Review the finished cart at checkout.
  return { accepted: true };
}

function evaluateMarketSessionCart(cart: MarketCart, mode: MarketMode): MarketSessionEvaluation {
  const normalizedCart = { ...cart };
  if (mode === 'challenge') {
    const substituteQuantity = getCartQuantity(cart, MARKET_SUBSTITUTE_PRODUCT_ID);
    if (substituteQuantity > 0) {
      normalizedCart[MARKET_STOCKOUT_PRODUCT_ID] =
        getCartQuantity(cart, MARKET_STOCKOUT_PRODUCT_ID) + substituteQuantity;
      delete normalizedCart[MARKET_SUBSTITUTE_PRODUCT_ID];
    }
  }
  const normalizedEvaluation = evaluateMarketCart(normalizedCart);
  const total = getMarketCartTotal(cart);
  const overBudget = Math.max(0, total - marketMission.budget);
  const quantityOverages = marketMission.objectives
    .map((objective) => ({
      productId: objective.productId,
      quantity: Math.max(0, getObjectiveCartQuantity(cart, objective.productId, mode) - objective.quantity),
    }))
    .filter((objective) => objective.quantity > 0);

  return {
    ...normalizedEvaluation,
    overBudget,
    quantityOverages,
    success: normalizedEvaluation.missing.length === 0 &&
      normalizedEvaluation.extra.length === 0 &&
      overBudget === 0 &&
      quantityOverages.length === 0,
    total,
  };
}

type MarketSimulationScreenProps = {
  embedded?: boolean;
  interactionRequest?: MarketInteractionRequest | null;
  onExit: () => void;
  onLockChange?: (locked: boolean) => void;
  onMissionComplete?: () => void;
};

export function MarketSimulationScreen({
  embedded = false,
  interactionRequest = null,
  onExit,
  onLockChange,
  onMissionComplete,
}: MarketSimulationScreenProps) {
  const [phase, setPhase] = useState<MarketPhase>('briefing');
  const [briefingIndex, setBriefingIndex] = useState(0);
  const [briefingView, setBriefingView] = useState<MarketBriefingView>('text');
  const [mode, setMode] = useState<MarketMode>('practice');
  const [activeCategory, setActiveCategory] = useState<MarketCategoryId | null>(null);
  const [cart, setCart] = useState<MarketCart>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [evaluation, setEvaluation] = useState<MarketSessionEvaluation | null>(null);
  const [notice, setNotice] = useState<MarketNotice | null>(null);
  const [nearbyStation, setNearbyStation] = useState<MarketStationId | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [hintOpen, setHintOpen] = useState(false);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [correctionCount, setCorrectionCount] = useState(0);
  const [receiptProblemSolved, setReceiptProblemSolved] = useState(false);
  const [receiptAttemptedWrong, setReceiptAttemptedWrong] = useState(false);
  const [stockoutStaffHelpUsed, setStockoutStaffHelpUsed] = useState(false);
  const [stockoutSubstitutionUsed, setStockoutSubstitutionUsed] = useState(false);
  const noticeOpacity = useRef(new Animated.Value(0)).current;
  const noticeAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const handledInteractionId = useRef<number | null>(null);

  const total = getMarketCartTotal(cart);
  const cartCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
  const remainingBudget = marketMission.budget - total;

  const objectiveProgress = useMemo<MarketObjectiveProgress[]>(
    () => marketMission.objectives.map((objective) => ({
      ...objective,
      product: getMarketProduct(objective.productId),
      current: getObjectiveCartQuantity(cart, objective.productId, mode),
    })),
    [cart, mode],
  );
  const nextObjective = objectiveProgress.find(({ current, quantity }) => current < quantity);
  const nextObjectiveCategory = nextObjective?.product
    ? marketCategories.find((category) => category.id === nextObjective.product?.categoryId)
    : undefined;
  const hintedStation: MarketStationId | null = nextObjective?.product?.categoryId ?? 'checkout';

  const hintMessage = useMemo(() => {
    if (!nextObjective || !nextObjective.product) {
      return '목록을 모두 채웠어요. 위쪽 계산대로 이동해 영수증까지 확인해 보세요.';
    }
    const remaining = Math.max(0, nextObjective.quantity - nextObjective.current);
    if (hintLevel <= 1) {
      return `${nextObjectiveCategory?.label ?? '알맞은'} 진열대를 먼저 찾아보세요.`;
    }
    if (mode === 'challenge' && nextObjective.productId === MARKET_STOCKOUT_PRODUCT_ID) {
      if (hintLevel === 2) {
        return '순한 카레 자리가 비어 있어요. 품절 안내를 확인해 보세요.';
      }
      if (hintLevel >= 3) {
        return '같은 순한맛·4인분 상품을 비교하거나 매장 직원에게 물어보세요.';
      }
    }
    if (hintLevel === 2) {
      return `${nextObjective.product.name}은 ${nextObjectiveCategory?.label ?? '진열대'}에 있어요.`;
    }
    return `${nextObjective.product.name} ${remaining}개가 더 필요해요. 빛나는 진열대로 이동해 담아 보세요.`;
  }, [hintLevel, mode, nextObjective, nextObjectiveCategory]);

  const showNotice = (message: string, tone: MarketNoticeTone = 'success') => {
    setNotice({ message, tone });
    noticeAnimation.current?.stop();
    noticeOpacity.stopAnimation();
    noticeOpacity.setValue(0);
    const animation = Animated.sequence([
      Animated.timing(noticeOpacity, { duration: 160, toValue: 1, useNativeDriver: true }),
      Animated.delay(tone === 'warning' ? 1750 : 1200),
      Animated.timing(noticeOpacity, { duration: 180, toValue: 0, useNativeDriver: true }),
    ]);
    noticeAnimation.current = animation;
    animation.start(({ finished }) => {
      if (finished) setNotice(null);
    });
  };

  const changeQuantity = (productId: string, change: number) => {
    const product = getMarketProduct(productId);
    if (!product) return;
    if (change > 0 && !evaluateMarketProductDrop(cart, productId, mode).accepted) return;
    const currentQuantity = getCartQuantity(cart, productId);
    const nextQuantity = Math.max(0, currentQuantity + change);
    if (nextQuantity === currentQuantity) return;

    const nextCart = { ...cart };
    if (nextQuantity === 0) delete nextCart[productId];
    else nextCart[productId] = nextQuantity;

    const objectiveProductId = mode === 'challenge' && productId === MARKET_SUBSTITUTE_PRODUCT_ID
      ? MARKET_STOCKOUT_PRODUCT_ID
      : productId;
    const objective = marketMission.objectives.find((item) => item.productId === objectiveProductId);
    const currentTotal = getMarketCartTotal(cart);
    const nextTotal = getMarketCartTotal(nextCart);

    if (change > 0) {
      if (mode === 'challenge' && productId === MARKET_SUBSTITUTE_PRODUCT_ID) {
        setStockoutSubstitutionUsed(true);
      } else if (!objective) {
        setMistakeCount((count) => count + 1);
      } else if (nextQuantity > objective.quantity) {
        setMistakeCount((count) => count + 1);
      } else if (nextTotal > marketMission.budget) {
        setMistakeCount((count) => count + 1);
      }
    } else {
      const correctedWrongItem = !objective && nextQuantity === 0;
      const correctedQuantity = Boolean(objective && currentQuantity > objective.quantity && nextQuantity === objective.quantity);
      const correctedBudget = currentTotal > marketMission.budget && nextTotal <= marketMission.budget;
      if (correctedWrongItem || correctedQuantity || correctedBudget) {
        setCorrectionCount((count) => count + 1);
      }
    }

    setCart(nextCart);
  };

  const dropProductIntoCart = (productId: string) => {
    const product = getMarketProduct(productId);
    if (!product) return false;
    const decision = evaluateMarketProductDrop(cart, productId, mode);
    if (decision.accepted) {
      changeQuantity(productId, 1);
      return true;
    }

    return false;
  };

  const selectMode = (nextMode: MarketMode) => {
    setMode(nextMode);
    setHintLevel(0);
    setHintOpen(false);
    setReceiptProblemSolved(false);
    setReceiptAttemptedWrong(false);
    setStockoutStaffHelpUsed(false);
    setStockoutSubstitutionUsed(false);
  };

  const askStockoutStaffForHelp = () => {
    setStockoutStaffHelpUsed(true);
    setHintLevel((level) => Math.max(3, level));
    showNotice('직원이 같은 순한맛·4인분인 오늘카레를 알려줬어요.', 'info');
  };

  const openHint = () => {
    setHintLevel((level) => Math.max(1, level));
    setHintOpen(true);
  };

  const revealNextHint = () => {
    setHintLevel((level) => Math.min(3, Math.max(1, level + 1)));
  };

  const continueBriefing = () => {
    if (briefingIndex < marketMission.briefing.length - 1) {
      setBriefingIndex((index) => index + 1);
      return;
    }
    setPhase('shopping');
  };

  const goToCheckout = () => {
    setCartOpen(false);
    setActiveCategory(null);
    setEvaluation(null);
    setHintOpen(false);
    setReceiptProblemSolved(false);
    setReceiptAttemptedWrong(false);
    setPhase('checkout');
  };

  const useNearbyStation = () => {
    if (!nearbyStation) return;
    if (nearbyStation === 'checkout') {
      if (cartCount === 0) {
        showNotice('가방이 비어 있어요. 먼저 목록의 물건을 담아 보세요.', 'warning');
        return;
      }
      goToCheckout();
      return;
    }
    setActiveCategory(nearbyStation);
  };

  useEffect(() => {
    if (!embedded || !interactionRequest || phase !== 'shopping') return;
    if (handledInteractionId.current === interactionRequest.id) return;
    handledInteractionId.current = interactionRequest.id;
    if (interactionRequest.station === 'checkout') {
      if (cartCount === 0) {
        showNotice('장바구니가 비어 있어요. 먼저 목록의 물건을 담아 보세요.', 'warning');
        return;
      }
      goToCheckout();
      return;
    }
    setActiveCategory(interactionRequest.station);
  }, [cartCount, embedded, interactionRequest, phase]);

  useEffect(() => {
    if (!embedded || !onLockChange) return;
    onLockChange(phase !== 'shopping' || activeCategory !== null || cartOpen || hintOpen);
  }, [activeCategory, cartOpen, embedded, hintOpen, onLockChange, phase]);

  useEffect(() => {
    if (!embedded || !onLockChange) return undefined;
    return () => onLockChange(false);
  }, [embedded, onLockChange]);

  useEffect(() => () => noticeAnimation.current?.stop(), []);

  const exitMarket = useCallback(() => {
    onLockChange?.(false);
    onExit();
  }, [onExit, onLockChange]);

  const handleReceiptDecision = (decision: 'matches' | 'report') => {
    if (decision === 'report') {
      if (receiptAttemptedWrong) setCorrectionCount((count) => count + 1);
      setReceiptProblemSolved(true);
      setReceiptAttemptedWrong(false);
      showNotice('영수증의 중복 계산을 찾아 직원에게 알렸어요!');
      return;
    }
    setReceiptProblemSolved(false);
    setReceiptAttemptedWrong(true);
    setMistakeCount((count) => count + 1);
    showNotice('장바구니 합계와 영수증 합계를 한 번 더 비교해 보세요.', 'warning');
  };

  const checkCart = () => {
    if (mode === 'challenge' && !receiptProblemSolved) {
      showNotice('도전 모드에서는 영수증 문제를 먼저 해결해 주세요.', 'warning');
      return;
    }
    const nextEvaluation = evaluateMarketSessionCart(cart, mode);
    setEvaluation(nextEvaluation);
    if (nextEvaluation.success) onMissionComplete?.();
    setPhase('result');
  };

  const retryShopping = () => {
    setEvaluation(null);
    setReceiptProblemSolved(false);
    setReceiptAttemptedWrong(false);
    setPhase('shopping');
  };

  return (
    <View pointerEvents={embedded ? 'box-none' : 'auto'} style={embedded ? styles.embeddedRoot : styles.root}>
      {!embedded ? <StatusBar style="dark" /> : null}

      {!embedded ? <MarketTopBar
        cartCount={cartCount}
        mode={mode}
        objectiveProgress={objectiveProgress}
        onExit={exitMarket}
        remainingBudget={remainingBudget}
      /> : null}

      {!embedded && (phase === 'shopping' || phase === 'briefing') ? (
        <MarketMap
          hintedStation={hintLevel >= 2 ? hintedStation : null}
          interactive={phase === 'shopping' && activeCategory === null && !cartOpen && !hintOpen}
          nearbyStation={nearbyStation}
          onNearbyStationChange={setNearbyStation}
        />
      ) : !embedded ? (
        <CheckoutScene cart={cart} mode={mode} />
      ) : null}

      {phase === 'shopping' ? (
        <MarketObjectiveHud
          cartCount={cartCount}
          embedded={embedded}
          mode={mode}
          objectiveProgress={objectiveProgress}
          onOpenCart={() => setCartOpen(true)}
          onOpenHint={openHint}
          remainingBudget={remainingBudget}
        />
      ) : null}

      {phase === 'shopping' && hintOpen ? (
        <MarketHintPanel
          hintLevel={hintLevel}
          message={hintMessage}
          onClose={() => setHintOpen(false)}
          onNext={revealNextHint}
        />
      ) : null}

      {!embedded && phase === 'shopping' && nearbyStation ? (
        <PressScale
          accessibilityLabel={
            nearbyStation === 'checkout'
              ? '계산대에서 계산하기'
              : `${marketCategories.find((category) => category.id === nearbyStation)?.label} 살펴보기`
          }
          accessibilityRole="button"
          onPress={useNearbyStation}
          scaleTo={0.94}
          style={styles.stationActionButton}
        >
          <Ionicons
            color="#FFF8E8"
            name={nearbyStation === 'checkout' ? 'card-outline' : 'search'}
            size={23}
          />
          <Text style={styles.stationActionText}>
            {nearbyStation === 'checkout' ? '계산하기' : '살펴보기'}
          </Text>
        </PressScale>
      ) : null}

      {phase === 'briefing' ? (
        <NpcDialogueCard
          buttonLabel={briefingIndex === marketMission.briefing.length - 1 ? '장보기 시작' : '다음'}
          briefingView={briefingView}
          message={marketMission.briefing[briefingIndex]}
          mode={mode}
          onContinue={continueBriefing}
          onSelectMode={selectMode}
          onSelectView={setBriefingView}
          progress={`${briefingIndex + 1}/${marketMission.briefing.length}`}
        />
      ) : null}

      {phase === 'checkout' ? (
        embedded ? (
          <View style={styles.embeddedCheckoutOverlay}>
            <View style={styles.embeddedCheckoutBackdrop} />
            <CheckoutPanel
              cart={cart}
              mode={mode}
              onBack={retryShopping}
              onCheck={checkCart}
              onReceiptDecision={handleReceiptDecision}
              receiptAttemptedWrong={receiptAttemptedWrong}
              receiptProblemSolved={receiptProblemSolved}
              total={total}
            />
          </View>
        ) : (
          <CheckoutPanel
            cart={cart}
            mode={mode}
            onBack={retryShopping}
            onCheck={checkCart}
            onReceiptDecision={handleReceiptDecision}
            receiptAttemptedWrong={receiptAttemptedWrong}
            receiptProblemSolved={receiptProblemSolved}
            total={total}
          />
        )
      ) : null}

      {phase === 'result' && evaluation ? (
        <ResultPanel
          correctionCount={correctionCount}
          evaluation={evaluation}
          hintLevel={hintLevel}
          mistakeCount={mistakeCount}
          mode={mode}
          onExit={() => setPhase('exit')}
          onRetry={retryShopping}
          receiptProblemSolved={receiptProblemSolved}
          stockoutStaffHelpUsed={stockoutStaffHelpUsed}
          stockoutSubstitutionUsed={stockoutSubstitutionUsed}
        />
      ) : null}

      {activeCategory && phase === 'shopping' ? (
        <MarketShelfScene
          cart={cart}
          category={marketCategories.find((category) => category.id === activeCategory)!}
          highlightedProductId={hintLevel >= 3 ? nextObjective?.productId ?? null : null}
          mode={mode}
          onChangeQuantity={changeQuantity}
          onClose={() => setActiveCategory(null)}
          onDropProduct={dropProductIntoCart}
          onStockoutStaffHelp={askStockoutStaffForHelp}
          stockoutStaffHelpUsed={stockoutStaffHelpUsed}
        />
      ) : null}

      {cartOpen && phase === 'shopping' ? (
        <CartSheet
          budget={marketMission.budget}
          cart={cart}
          onChangeQuantity={changeQuantity}
          onCheckout={() => {
            setCartOpen(false);
            showNotice('가방을 확인했어요. 매장 위쪽 계산대로 이동해 주세요.', 'info');
          }}
          onClose={() => setCartOpen(false)}
          total={total}
        />
      ) : null}

      {notice ? (
        <Animated.View
          accessibilityLiveRegion="polite"
          pointerEvents="none"
          style={[
            styles.notice,
            notice.tone === 'warning' && styles.noticeWarning,
            notice.tone === 'info' && styles.noticeInfo,
            { opacity: noticeOpacity },
          ]}
        >
          <Ionicons
            color="#FFFFFF"
            name={notice.tone === 'warning' ? 'alert-circle' : notice.tone === 'info' ? 'information-circle' : 'checkmark-circle'}
            size={18}
          />
          <Text style={styles.noticeText}>{notice.message}</Text>
        </Animated.View>
      ) : null}
      {phase === 'exit' ? <MarketExitTransition onComplete={exitMarket} /> : null}
    </View>
  );
}

function MarketTopBar({
  cartCount,
  mode,
  objectiveProgress,
  onExit,
  remainingBudget,
}: {
  cartCount: number;
  mode: MarketMode;
  objectiveProgress: MarketObjectiveProgress[];
  onExit: () => void;
  remainingBudget: number;
}) {
  const completed = objectiveProgress.filter(({ current, quantity }) => current === quantity).length;
  return (
    <View style={styles.topBar}>
      <PressScale accessibilityLabel="장보기 나가기" accessibilityRole="button" hitSlop={8} onPress={onExit} style={styles.topIconButton}>
        <Ionicons color="#FFFFFF" name="close" size={24} />
      </PressScale>
      <View style={styles.locationHeading}>
        <Text style={styles.locationEyebrow}>장보기 · {MARKET_MODE_COPY[mode].label}</Text>
        <Text style={styles.locationTitle}>하늘마트</Text>
      </View>
      <View style={styles.topStats}>
        <View style={styles.progressPill}>
          <Ionicons color="#3A785A" name="checkmark-circle" size={17} />
          <Text style={styles.progressPillText}>{completed}/{objectiveProgress.length}</Text>
        </View>
        <View style={styles.budgetPill}>
          <Text style={styles.budgetPillLabel}>남은 돈</Text>
          <Text style={styles.budgetPillValue}>{formatPrice(remainingBudget)}</Text>
        </View>
      </View>
      {cartCount > 0 ? <View style={styles.topCartDot} /> : null}
    </View>
  );
}

function MarketObjectiveHud({
  cartCount,
  embedded,
  mode,
  objectiveProgress,
  onOpenCart,
  onOpenHint,
  remainingBudget,
}: {
  cartCount: number;
  embedded: boolean;
  mode: MarketMode;
  objectiveProgress: MarketObjectiveProgress[];
  onOpenCart: () => void;
  onOpenHint: () => void;
  remainingBudget: number;
}) {
  return (
    <View
      pointerEvents="box-none"
      style={[styles.shoppingFooter, embedded && styles.embeddedShoppingFooter]}
    >
      <View
        accessibilityLabel={`오늘의 목록, ${objectiveProgress
          .map(({ current, product, quantity }) => `${product?.name ?? '물건'} ${current}/${quantity}`)
          .join(', ')}, 남은 예산 ${formatPrice(remainingBudget)}`}
        accessible
        pointerEvents="none"
        style={styles.missionStrip}
      >
        <View style={styles.missionStripHeading}>
          <View style={styles.missionHeadingLeft}>
            <Ionicons color="#806B53" name="receipt-outline" size={13} />
            <Text style={styles.missionStripLabel}>오늘의 목록</Text>
            <View style={[styles.modeMiniBadge, mode === 'challenge' && styles.modeMiniBadgeChallenge]}>
              <Text style={[styles.modeMiniBadgeText, mode === 'challenge' && styles.modeMiniBadgeTextChallenge]}>
                {mode === 'practice' ? '연습' : '도전'}
              </Text>
            </View>
          </View>
          <View style={styles.hudBudget}>
            <Text style={styles.hudBudgetLabel}>남은 돈</Text>
            <Text style={styles.hudBudgetValue}>
              {formatPrice(remainingBudget)}
            </Text>
          </View>
        </View>
        <View style={styles.missionChecklist}>
          {objectiveProgress.map(({ current, product, productId, quantity }) => {
            const completed = current === quantity;
            return (
              <View key={productId} style={styles.missionChecklistItem}>
                <View style={styles.missionItemHeading}>
                  <View
                    style={[
                      styles.missionCheckbox,
                      completed && styles.missionCheckboxComplete,
                    ]}
                  >
                    {completed ? <Ionicons color="#FFFFFF" name="checkmark" size={9} /> : null}
                  </View>
                  <Text
                    ellipsizeMode="tail"
                    numberOfLines={1}
                    style={[
                      styles.missionItemName,
                      completed && styles.missionItemNameComplete,
                    ]}
                  >
                    {product?.name ?? '물건'}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.missionItemCount,
                    completed && styles.missionItemCountComplete,
                  ]}
                >
                  {current}/{quantity}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
      <PressScale
        accessibilityLabel="장보기 도움 보기"
        accessibilityRole="button"
        onPress={onOpenHint}
        scaleTo={0.94}
        style={styles.hintButton}
      >
        <Ionicons color="#77583E" name="bulb-outline" size={21} />
        <Text style={styles.hintButtonText}>도움</Text>
      </PressScale>
      <PressScale
        accessibilityLabel={`장바구니 ${cartCount}개`}
        accessibilityRole="button"
        onPress={onOpenCart}
        style={styles.cartButton}
      >
        <Ionicons color={colors.white} name="basket" size={23} />
        <Text style={styles.cartButtonText}>가방</Text>
        <View style={styles.cartCountBadge}>
          <Text style={styles.cartCountText}>{cartCount}</Text>
        </View>
      </PressScale>
    </View>
  );
}

function MarketHintPanel({
  hintLevel,
  message,
  onClose,
  onNext,
}: {
  hintLevel: number;
  message: string;
  onClose: () => void;
  onNext: () => void;
}) {
  return (
    <View accessibilityViewIsModal pointerEvents="box-none" style={styles.hintOverlay}>
      <View style={styles.hintPanel}>
        <View style={styles.hintPanelHeader}>
          <View style={styles.hintGuideIcon}>
            <Ionicons color="#87683E" name="bulb" size={20} />
          </View>
          <View style={styles.hintPanelHeading}>
            <Text style={styles.hintPanelEyebrow}>단계별 도움</Text>
            <Text style={styles.hintPanelTitle}>힌트 {hintLevel}/3</Text>
          </View>
          <PressScale accessibilityLabel="도움 닫기" hitSlop={8} onPress={onClose} style={styles.hintCloseButton}>
            <Ionicons color="#6C645A" name="close" size={20} />
          </PressScale>
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.hintMessage}>{message}</Text>
        <View style={styles.hintFooter}>
          <View style={styles.hintDots}>
            {[1, 2, 3].map((level) => (
              <View key={level} style={[styles.hintDot, level <= hintLevel && styles.hintDotActive]} />
            ))}
          </View>
          {hintLevel < 3 ? (
            <PressScale accessibilityRole="button" onPress={onNext} style={styles.nextHintButton}>
              <Text style={styles.nextHintButtonText}>조금 더 알려줘요</Text>
              <Ionicons color="#FFFFFF" name="chevron-forward" size={16} />
            </PressScale>
          ) : (
            <PressScale accessibilityRole="button" onPress={onClose} style={styles.nextHintButton}>
              <Text style={styles.nextHintButtonText}>찾아볼게요</Text>
              <Ionicons color="#FFFFFF" name="checkmark" size={16} />
            </PressScale>
          )}
        </View>
      </View>
    </View>
  );
}

function MarketMap({
  hintedStation,
  interactive,
  nearbyStation,
  onNearbyStationChange,
}: {
  hintedStation: MarketStationId | null;
  interactive: boolean;
  nearbyStation: MarketStationId | null;
  onNearbyStationChange: (station: MarketStationId | null) => void;
}) {
  const viewportNode = useRef<View | null>(null);
  const camera = useRef(new Animated.ValueXY()).current;
  const joystickKnob = useRef(new Animated.ValueXY()).current;
  const playerPoint = useRef<MarketPoint>({ ...MARKET_PLAYER_START });
  const viewport = useRef({ height: 0, width: 0 });
  const viewportOrigin = useRef({ x: 0, y: 0 });
  const direction = useRef<MarketPoint>({ x: 0, y: 0 });
  const speedMultiplier = useRef(1);
  const tapTarget = useRef<MarketPoint | null>(null);
  const joystickEngaged = useRef(false);
  const touchHoldActivated = useRef(false);
  const animationFrame = useRef<number | null>(null);
  const previousFrame = useRef<number | null>(null);
  const nearbyStationRef = useRef<MarketStationId | null>(null);
  const controlsLockedRef = useRef(!interactive);
  const joystickZoneSize = useRef({ height: MARKET_JOYSTICK_ZONE_HEIGHT, width: 220 });

  const [controlMode, setControlMode] = useState<MarketControlMode>('joystick');
  const [runEnabled, setRunEnabled] = useState(false);
  const [tapTargetMarker, setTapTargetMarker] = useState<MarketPoint | null>(null);
  const [joystickActive, setJoystickActive] = useState(false);
  const [joystickCenter, setJoystickCenter] = useState({ x: 76, y: 174 });
  controlsLockedRef.current = !interactive;

  const updateCamera = useCallback((point: MarketPoint) => {
    camera.setValue({
      x: viewport.current.width / 2 - point.x,
      y: viewport.current.height / 2 - point.y,
    });
  }, [camera]);

  const updateStationProximity = useCallback((point: MarketPoint) => {
    let closest: MarketStationId | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    (Object.entries(MARKET_STATIONS) as Array<[MarketStationId, MarketPoint]>).forEach(([station, stationPoint]) => {
      const distance = Math.hypot(point.x - stationPoint.x, point.y - stationPoint.y);
      if (distance <= MARKET_INTERACTION_DISTANCE && distance < closestDistance) {
        closest = station;
        closestDistance = distance;
      }
    });
    if (closest !== nearbyStationRef.current) {
      nearbyStationRef.current = closest;
      onNearbyStationChange(closest);
    }
  }, [onNearbyStationChange]);

  const movePlayer = useCallback((dx: number, dy: number) => {
    const current = playerPoint.current;
    let next = current;
    const xCandidate = clampMarketPoint({ x: current.x + dx, y: current.y });
    if (!isMarketBlocked(xCandidate)) next = xCandidate;
    const yCandidate = clampMarketPoint({ x: next.x, y: next.y + dy });
    if (!isMarketBlocked(yCandidate)) next = yCandidate;
    playerPoint.current = next;
    updateCamera(next);
    updateStationProximity(next);
    return next;
  }, [updateCamera, updateStationProximity]);

  const stopMovement = useCallback(() => {
    direction.current = { x: 0, y: 0 };
    joystickEngaged.current = false;
    tapTarget.current = null;
    previousFrame.current = null;
    setJoystickActive(false);
    setTapTargetMarker(null);
    if (animationFrame.current !== null) {
      cancelAnimationFrame(animationFrame.current);
      animationFrame.current = null;
    }
    Animated.spring(joystickKnob, {
      damping: 16,
      mass: 0.7,
      stiffness: 240,
      toValue: { x: 0, y: 0 },
      useNativeDriver: true,
    }).start();
  }, [joystickKnob]);

  const runMovement = useCallback((timestamp: number) => {
    const last = previousFrame.current ?? timestamp;
    const elapsedSeconds = Math.min(timestamp - last, 32) / 1000;
    previousFrame.current = timestamp;
    const target = tapTarget.current;

    if (target) {
      const current = playerPoint.current;
      const dx = target.x - current.x;
      const dy = target.y - current.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 3) {
        tapTarget.current = null;
        previousFrame.current = null;
        animationFrame.current = null;
        setTapTargetMarker(null);
        return;
      }
      const step = Math.min(distance, MARKET_MOVE_SPEED * speedMultiplier.current * elapsedSeconds);
      const next = movePlayer((dx / distance) * step, (dy / distance) * step);
      if (step > 0 && Math.hypot(next.x - current.x, next.y - current.y) < 0.05) {
        tapTarget.current = null;
        previousFrame.current = null;
        animationFrame.current = null;
        setTapTargetMarker(null);
        return;
      }
      animationFrame.current = requestAnimationFrame(runMovement);
      return;
    }

    movePlayer(
      direction.current.x * MARKET_MOVE_SPEED * speedMultiplier.current * elapsedSeconds,
      direction.current.y * MARKET_MOVE_SPEED * speedMultiplier.current * elapsedSeconds,
    );
    if (joystickEngaged.current) animationFrame.current = requestAnimationFrame(runMovement);
    else {
      previousFrame.current = null;
      animationFrame.current = null;
    }
  }, [movePlayer]);

  const beginMovement = useCallback(() => {
    if (animationFrame.current === null) animationFrame.current = requestAnimationFrame(runMovement);
  }, [runMovement]);

  const joystickResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !controlsLockedRef.current,
    onMoveShouldSetPanResponder: () => !controlsLockedRef.current,
    onPanResponderGrant: (event) => {
      const half = MARKET_JOYSTICK_SIZE / 2;
      const { height, width } = joystickZoneSize.current;
      setJoystickCenter({
        x: Math.max(half, Math.min(event.nativeEvent.locationX, width - half)),
        y: Math.max(half, Math.min(event.nativeEvent.locationY, height - half)),
      });
      setJoystickActive(true);
      joystickEngaged.current = true;
      joystickKnob.stopAnimation();
      joystickKnob.setValue({ x: 0, y: 0 });
      direction.current = { x: 0, y: 0 };
      beginMovement();
    },
    onPanResponderMove: (_event, gesture) => {
      const distance = Math.hypot(gesture.dx, gesture.dy);
      const scale = distance > MARKET_JOYSTICK_RADIUS ? MARKET_JOYSTICK_RADIUS / distance : 1;
      const x = gesture.dx * scale;
      const y = gesture.dy * scale;
      joystickKnob.setValue({ x, y });
      direction.current = { x: x / MARKET_JOYSTICK_RADIUS, y: y / MARKET_JOYSTICK_RADIUS };
    },
    onPanResponderRelease: stopMovement,
    onPanResponderTerminate: stopMovement,
  })).current;

  useEffect(() => () => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
  }, []);

  useEffect(() => {
    if (!interactive) stopMovement();
  }, [interactive, stopMovement]);

  const handleViewportLayout = (event: LayoutChangeEvent) => {
    viewport.current = event.nativeEvent.layout;
    viewportNode.current?.measureInWindow((x, y) => {
      viewportOrigin.current = { x, y };
    });
    updateCamera(playerPoint.current);
    updateStationProximity(playerPoint.current);
  };

  const handleAccessibilityMove = (actionName: string) => {
    if (controlsLockedRef.current) return;
    if (actionName === 'moveUp') movePlayer(0, -MARKET_ACCESSIBILITY_STEP);
    if (actionName === 'moveDown') movePlayer(0, MARKET_ACCESSIBILITY_STEP);
    if (actionName === 'moveLeft') movePlayer(-MARKET_ACCESSIBILITY_STEP, 0);
    if (actionName === 'moveRight') movePlayer(MARKET_ACCESSIBILITY_STEP, 0);
  };

  const startTapMovement = (desired: MarketPoint) => {
    if (controlsLockedRef.current) return;
    stopMovement();
    const target = findMarketReachableTarget(playerPoint.current, desired);
    if (Math.hypot(target.x - playerPoint.current.x, target.y - playerPoint.current.y) < 2) return;
    tapTarget.current = target;
    setTapTargetMarker(target);
    beginMovement();
  };

  const getTouchedWorldPoint = (event: GestureResponderEvent) => {
    const current = playerPoint.current;
    const { locationX, locationY, pageX, pageY } = event.nativeEvent;
    const localX = Number.isFinite(pageX) ? pageX - viewportOrigin.current.x : locationX;
    const localY = Number.isFinite(pageY) ? pageY - viewportOrigin.current.y : locationY;
    const safeX = Math.max(0, Math.min(localX, viewport.current.width));
    const safeY = Math.max(0, Math.min(localY, viewport.current.height));
    return {
      x: current.x + safeX - viewport.current.width / 2,
      y: current.y + safeY - viewport.current.height / 2,
    };
  };

  const handleWorldLongPress = (event: GestureResponderEvent) => {
    if (controlMode !== 'touch' || controlsLockedRef.current) return;
    const current = playerPoint.current;
    const desired = getTouchedWorldPoint(event);
    const dx = desired.x - current.x;
    const dy = desired.y - current.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 8) return;
    stopMovement();
    touchHoldActivated.current = true;
    direction.current = { x: dx / distance, y: dy / distance };
    joystickEngaged.current = true;
    setTapTargetMarker(desired);
    beginMovement();
  };

  const handleWorldPress = (event: GestureResponderEvent) => {
    if (controlMode !== 'touch' || controlsLockedRef.current) return;
    if (touchHoldActivated.current) {
      touchHoldActivated.current = false;
      return;
    }
    startTapMovement(getTouchedWorldPoint(event));
  };

  const handleStationPress = (event: GestureResponderEvent, station: MarketStationId) => {
    event?.stopPropagation?.();
    startTapMovement(MARKET_STATIONS[station]);
  };

  const selectControlMode = (mode: MarketControlMode) => {
    stopMovement();
    speedMultiplier.current = 1;
    setRunEnabled(false);
    setControlMode(mode);
  };

  return (
    <Pressable
      accessibilityActions={[
        { label: '위로 이동', name: 'moveUp' },
        { label: '아래로 이동', name: 'moveDown' },
        { label: '왼쪽으로 이동', name: 'moveLeft' },
        { label: '오른쪽으로 이동', name: 'moveRight' },
      ]}
      accessibilityHint={interactive ? '바깥 마을과 같은 방식으로 캐릭터를 움직입니다' : undefined}
      accessibilityLabel="하늘마트 매장"
      accessibilityState={{ disabled: !interactive }}
      delayLongPress={260}
      disabled={!interactive}
      onAccessibilityAction={(event) => handleAccessibilityMove(event.nativeEvent.actionName)}
      onLayout={handleViewportLayout}
      onLongPress={handleWorldLongPress}
      onPress={handleWorldPress}
      onPressIn={() => {
        if (controlMode === 'touch' && interactive) touchHoldActivated.current = false;
      }}
      onPressOut={() => {
        if (touchHoldActivated.current) stopMovement();
      }}
      ref={viewportNode}
      style={styles.map}
    >
      <Animated.View style={[styles.marketWorld, { transform: camera.getTranslateTransform() }]}>
        <MarketInteriorBackdrop />

        {tapTargetMarker && controlMode === 'touch' ? (
          <View pointerEvents="none" style={[styles.marketTapTarget, { left: tapTargetMarker.x - 12, top: tapTargetMarker.y - 12 }]} />
        ) : null}

        <PressScale
          accessibilityHint="가까이 이동하면 계산할 수 있습니다"
          accessibilityLabel="계산대로 이동"
          accessibilityRole="button"
          disabled={!interactive}
          hitSlop={{ bottom: 28, left: 24, right: 24, top: 84 }}
          onPress={(event) => handleStationPress(event, 'checkout')}
          scaleTo={0.98}
          style={[
            styles.counterArea,
            { backgroundColor: 'transparent', borderWidth: 0, overflow: 'visible' },
          ]}
        >
          <MarketCheckoutFixture active={nearbyStation === 'checkout' || hintedStation === 'checkout'} />
        </PressScale>

        {marketCategories.map((category) => {
          const shelf = MARKET_SHELVES[category.id];
          return (
            <PressScale
              accessibilityLabel={`${category.label} 진열대`}
              accessibilityHint="가까이 이동한 뒤 살펴보기 버튼을 누릅니다"
              accessibilityRole="button"
              accessibilityState={{ disabled: !interactive }}
              disabled={!interactive}
              hitSlop={{ bottom: 30, left: 30, right: 30, top: 64 }}
              key={category.id}
              onPress={(event) => handleStationPress(event, category.id)}
              scaleTo={0.98}
              style={{ height: shelf.height, left: shelf.x, top: shelf.y, width: shelf.width, position: 'absolute', overflow: 'visible' }}
            >
              <MarketCategoryFixture active={nearbyStation === category.id || hintedStation === category.id} category={category} />
            </PressScale>
          );
        })}

        <View pointerEvents="none" style={[styles.marketEntranceInterior, { borderWidth: 0, backgroundColor: 'transparent' }]}>
          <MarketExitMarker active={false} />
        </View>
      </Animated.View>

      <View accessibilityLabel="마트 안 내 캐릭터" pointerEvents="none" style={styles.marketPlayerFixed}>
        <View style={styles.playerShadow} />
        <View style={styles.playerMoveRing} />
        <View style={styles.playerHead} />
        <View style={styles.playerBody}><Image resizeMode="contain" source={icons.user} style={styles.playerBadgeImage} /></View>
        <View style={styles.playerBasket}><Ionicons color="#FFFFFF" name="basket" size={15} /></View>
      </View>

      {interactive ? (
        <PressScale
          accessibilityLabel={controlMode === 'joystick' ? '터치 이동으로 변경' : '조이스틱 이동으로 변경'}
          accessibilityRole="button"
          onPress={(event) => {
            event?.stopPropagation?.();
            selectControlMode(controlMode === 'joystick' ? 'touch' : 'joystick');
          }}
          style={styles.marketControlToggle}
        >
          <Ionicons color="#FFF8E8" name={controlMode === 'joystick' ? 'hand-left-outline' : 'game-controller-outline'} size={17} />
          <Text style={styles.marketControlToggleText}>{controlMode === 'joystick' ? '터치' : '조이스틱'}</Text>
        </PressScale>
      ) : null}

      {interactive ? (
        <PressScale
          accessibilityHint="한 번 누르면 달리기를 켜고 다시 누르면 끕니다"
          accessibilityLabel={runEnabled ? '마트에서 달리기 끄기' : '마트에서 달리기 켜기'}
          accessibilityRole="button"
          accessibilityState={{ selected: runEnabled }}
          onPress={(event) => {
            event?.stopPropagation?.();
            setRunEnabled((enabled) => {
              const next = !enabled;
              speedMultiplier.current = next ? 1.55 : 1;
              return next;
            });
          }}
          style={[styles.marketRunButton, runEnabled && styles.marketRunButtonActive]}
        >
          <Ionicons color={runEnabled ? '#FFFFFF' : '#39493F'} name="walk" size={22} />
        </PressScale>
      ) : null}

      {controlMode === 'joystick' && interactive ? (
        <View
          accessibilityActions={[
            { label: '위로 이동', name: 'moveUp' },
            { label: '아래로 이동', name: 'moveDown' },
            { label: '왼쪽으로 이동', name: 'moveLeft' },
            { label: '오른쪽으로 이동', name: 'moveRight' },
          ]}
          accessibilityLabel="마트 이동 조이스틱"
          accessibilityRole="adjustable"
          onAccessibilityAction={(event) => handleAccessibilityMove(event.nativeEvent.actionName)}
          onLayout={(event) => { joystickZoneSize.current = event.nativeEvent.layout; }}
          style={styles.marketJoystickZone}
          {...joystickResponder.panHandlers}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.marketJoystick,
              {
                left: joystickCenter.x - MARKET_JOYSTICK_SIZE / 2,
                opacity: joystickActive ? 1 : 0.42,
                top: joystickCenter.y - MARKET_JOYSTICK_SIZE / 2,
              },
            ]}
          >
            <View style={styles.marketJoystickGuideHorizontal} />
            <View style={styles.marketJoystickGuideVertical} />
            <Animated.View style={[styles.marketJoystickKnob, { transform: joystickKnob.getTranslateTransform() }]} />
          </Animated.View>
        </View>
      ) : null}

      {controlMode === 'touch' && interactive ? (
        <View pointerEvents="none" style={styles.marketTouchHint}>
          <Ionicons color="#FFFFFF" name="finger-print" size={15} />
          <Text style={styles.marketTouchHintText}>누르거나 길게 눌러 이동</Text>
        </View>
      ) : null}
    </Pressable>
  );
}


function MarketModeOption({
  mode,
  onSelect,
  reduceMotion,
  selected,
}: {
  mode: MarketMode;
  onSelect: (mode: MarketMode) => void;
  reduceMotion: boolean;
  selected: boolean;
}) {
  const selection = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const copy = MARKET_MODE_COPY[mode];

  useEffect(() => {
    selection.stopAnimation();
    if (reduceMotion) {
      selection.setValue(selected ? 1 : 0);
      return undefined;
    }
    const animation = Animated.timing(selection, {
      duration: 210,
      easing: Easing.out(Easing.cubic),
      toValue: selected ? 1 : 0,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, selected, selection]);

  return (
    <PressScale
      accessibilityLabel={`${copy.label}, ${copy.description}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={() => onSelect(mode)}
      scaleTo={reduceMotion ? 1 : 0.98}
      style={styles.modeOption}
    >
      <Animated.View
        pointerEvents="none"
        testID={`market-mode-${mode}-highlight`}
        style={[styles.modeOptionHighlight, { opacity: selection }]}
      />
      <View style={styles.modeOptionIcon}>
        <Animated.View pointerEvents="none" style={[styles.modeOptionIconHighlight, { opacity: selection }]} />
        <Ionicons color="#FFFFFF" name={copy.icon} size={18} />
      </View>
      <View style={styles.modeOptionCopy}>
        <Text style={styles.modeOptionLabel}>{copy.label}</Text>
        <Text numberOfLines={2} style={styles.modeOptionDescription}>{copy.description}</Text>
      </View>
      <Animated.View
        accessible={false}
        pointerEvents="none"
        style={{
          opacity: selection,
          transform: [{ scale: selection.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
        }}
      >
        <Ionicons color="#F3D98B" name="checkmark-circle" size={19} />
      </Animated.View>
    </PressScale>
  );
}

function NpcDialogueCard({
  briefingView,
  buttonLabel,
  message,
  mode,
  onContinue,
  onSelectMode,
  onSelectView,
  progress,
}: {
  briefingView: MarketBriefingView;
  buttonLabel: string;
  message: string;
  mode: MarketMode;
  onContinue: () => void;
  onSelectMode: (mode: MarketMode) => void;
  onSelectView: (view: MarketBriefingView) => void;
  progress: string;
}) {
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => {
    let mounted = true;
    let preferenceChanged = false;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted && !preferenceChanged) setReduceMotion(enabled);
    }).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      preferenceChanged = true;
      if (mounted) setReduceMotion(enabled);
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return (
    <View accessibilityViewIsModal style={styles.dialogueOverlay}>
      <View style={styles.dialogueCard}>
        <View style={styles.dialogueHeader}>
          <View style={styles.dialogueAvatar}>
            <View style={styles.dialogueAvatarHair} />
            <View style={styles.dialogueAvatarFace} />
          </View>
          <View style={styles.dialogueHeaderCopy}>
            <Text style={styles.dialogueName}>수진</Text>
            <Text style={styles.dialogueRole}>하늘마트 직원</Text>
          </View>
          <Text style={styles.dialogueProgress}>{progress}</Text>
        </View>
        <View accessibilityLabel="장보기 안내 보기 방식" accessibilityRole="radiogroup" style={styles.briefingViewSelector}>
          <PressScale
            accessibilityRole="radio"
            accessibilityState={{ checked: briefingView === 'text' }}
            onPress={() => onSelectView('text')}
            style={[styles.briefingViewOption, briefingView === 'text' && styles.briefingViewOptionSelected]}
          >
            <Ionicons color={briefingView === 'text' ? '#FFFFFF' : '#746C61'} name="text-outline" size={15} />
            <Text style={[styles.briefingViewText, briefingView === 'text' && styles.briefingViewTextSelected]}>쉬운 글</Text>
          </PressScale>
          <PressScale
            accessibilityRole="radio"
            accessibilityState={{ checked: briefingView === 'picture' }}
            onPress={() => onSelectView('picture')}
            style={[styles.briefingViewOption, briefingView === 'picture' && styles.briefingViewOptionSelected]}
          >
            <Ionicons color={briefingView === 'picture' ? '#FFFFFF' : '#746C61'} name="images-outline" size={15} />
            <Text style={[styles.briefingViewText, briefingView === 'picture' && styles.briefingViewTextSelected]}>그림 보기</Text>
          </PressScale>
        </View>
        {briefingView === 'text' ? (
          <Text accessibilityLiveRegion="polite" style={styles.dialogueMessage}>{message}</Text>
        ) : (
          <View accessibilityLabel="완성해야 할 장바구니 예시" style={styles.briefingPictureList}>
            {marketMission.objectives.map((objective) => {
              const product = getMarketProduct(objective.productId);
              if (!product) return null;
              return (
                <View key={objective.productId} style={styles.briefingPictureItem}>
                  <View style={[styles.briefingPictureIcon, { backgroundColor: product.packageColor }]}>
                    <MarketProductArtwork product={product} size={30} />
                  </View>
                  <Text style={styles.briefingPictureName}>{product.name}</Text>
                  <Text style={styles.briefingPictureQuantity}>{objective.quantity}개</Text>
                </View>
              );
            })}
          </View>
        )}
        <View accessibilityLabel="장보기 모드" accessibilityRole="radiogroup" style={styles.modeSelector}>
          {(['practice', 'challenge'] as MarketMode[]).map((option) => (
            <MarketModeOption
              key={option}
              mode={option}
              onSelect={onSelectMode}
              reduceMotion={reduceMotion}
              selected={mode === option}
            />
          ))}
        </View>
        <PressScale accessibilityRole="button" onPress={onContinue} style={styles.dialogueButton}>
          <Text style={styles.dialogueButtonText}>{buttonLabel}</Text>
          <Ionicons color="#FFFFFF" name="arrow-forward" size={20} />
        </PressScale>
      </View>
    </View>
  );
}

function CartSheet({
  budget,
  cart,
  onChangeQuantity,
  onCheckout,
  onClose,
  total,
}: {
  budget: number;
  cart: MarketCart;
  onChangeQuantity: (productId: string, change: number) => void;
  onCheckout: () => void;
  onClose: () => void;
  total: number;
}) {
  const lines = Object.entries(cart)
    .map(([productId, quantity]) => ({ product: getMarketProduct(productId), quantity }))
    .filter((line): line is { product: MarketProduct; quantity: number } => Boolean(line.product));
  return (
    <View accessibilityViewIsModal style={styles.sheetOverlay}>
      <Pressable accessibilityLabel="장바구니 닫기" accessibilityRole="button" onPress={onClose} style={styles.sheetBackdrop} />
      <View style={styles.cartSheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.cartSheetHeader}>
          <View>
            <Text style={styles.sheetEyebrow}>INVENTORY · 선택한 물건</Text>
            <Text style={styles.sheetTitle}>내 가방</Text>
          </View>
          <PressScale accessibilityLabel="장바구니 닫기" onPress={onClose} style={styles.sheetCloseButton}>
            <Ionicons color="#666A67" name="close" size={23} />
          </PressScale>
        </View>
        {lines.length === 0 ? (
          <View style={styles.emptyCart}>
            <View style={styles.emptyCartIcon}><Ionicons color="#87A395" name="basket-outline" size={34} /></View>
            <Text style={styles.emptyCartTitle}>아직 담은 물건이 없어요</Text>
            <Text style={styles.emptyCartDescription}>진열대를 눌러 필요한 물건을 찾아보세요.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.cartList} style={styles.cartListScroll}>
            {lines.map(({ product, quantity }) => (
              <View key={product.id} style={styles.cartLine}>
                <View style={[styles.cartLineIcon, { backgroundColor: product.packageColor }]}>
                  <MarketProductArtwork product={product} size={36} />
                </View>
                <View style={styles.cartLineCopy}>
                  <Text style={styles.cartLineName}>{product.name}</Text>
                  <Text style={styles.cartLinePrice}>{formatPrice(product.price * quantity)}</Text>
                </View>
                <View style={styles.cartQuantity}>
                  <PressScale accessibilityLabel={`${product.name} 한 개 빼기`} onPress={() => onChangeQuantity(product.id, -1)} style={styles.cartQuantityButton}>
                    <Ionicons color="#4D5751" name="remove" size={16} />
                  </PressScale>
                  <Text style={styles.cartQuantityText}>{quantity}</Text>
                  <PressScale accessibilityLabel={`${product.name} 한 개 더 담기`} onPress={() => onChangeQuantity(product.id, 1)} style={styles.cartQuantityButton}>
                    <Ionicons color="#4D5751" name="add" size={16} />
                  </PressScale>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
        <View style={styles.cartTotalRow}>
          <View>
            <Text style={styles.cartTotalLabel}>예상 금액</Text>
            <Text style={styles.cartBudgetCaption}>
              예산 {formatPrice(budget)} · 남은 돈 {formatPrice(budget - total)}
            </Text>
          </View>
          <Text style={styles.cartTotalValue}>{formatPrice(total)}</Text>
        </View>
        <PressScale
          accessibilityRole="button"
          disabled={lines.length === 0}
          onPress={onCheckout}
          style={[styles.checkoutButton, lines.length === 0 && styles.buttonDisabled]}
        >
          <Text style={styles.checkoutButtonText}>가방 닫기</Text>
          <Ionicons color="#FFFFFF" name="close" size={20} />
        </PressScale>
      </View>
    </View>
  );
}

function CheckoutScene({ cart, mode }: { cart: MarketCart; mode: MarketMode }) {
  return (
    <View style={styles.checkoutScene}>
      <View style={styles.checkoutWall}>
        <Text style={styles.checkoutWallText}>CHECKOUT</Text>
      </View>
      <View style={styles.checkoutCounterLarge}>
        <View style={styles.checkoutScanner}>
          <View style={styles.checkoutScannerLight} />
        </View>
        <View style={styles.checkoutBelt}>
          {Object.entries(cart).slice(0, 4).map(([productId], index) => {
            const product = getMarketProduct(productId);
            return product ? (
              <View key={productId} style={[styles.beltProduct, { backgroundColor: product.packageColor, left: 20 + index * 48 }]}>
                <MarketProductArtwork product={product} size={32} />
              </View>
            ) : null;
          })}
        </View>
      </View>
      <View style={styles.checkoutCashierLarge}>
        <View style={styles.checkoutCashierHair} />
        <View style={styles.checkoutCashierHead} />
        <View style={styles.checkoutCashierBody}><View style={styles.checkoutCashierApron} /></View>
      </View>
      <View style={styles.checkoutSpeech}>
        <Text style={styles.checkoutSpeechName}>수진</Text>
        <Text style={styles.checkoutSpeechText}>
          {mode === 'challenge'
            ? '계산이 끝났어요. 장바구니 합계와 영수증이 같은지 직접 확인해 주세요.'
            : marketMission.checkoutDialogue[0]}
        </Text>
      </View>
    </View>
  );
}

function CheckoutPanel({
  cart,
  mode,
  onBack,
  onCheck,
  onReceiptDecision,
  receiptAttemptedWrong,
  receiptProblemSolved,
  total,
}: {
  cart: MarketCart;
  mode: MarketMode;
  onBack: () => void;
  onCheck: () => void;
  onReceiptDecision: (decision: 'matches' | 'report') => void;
  receiptAttemptedWrong: boolean;
  receiptProblemSolved: boolean;
  total: number;
}) {
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash'>('card');
  const lines = Object.entries(cart)
    .map(([productId, quantity]) => ({ product: getMarketProduct(productId), quantity }))
    .filter((line): line is { product: MarketProduct; quantity: number } => Boolean(line.product));
  const displayedTotal = mode === 'challenge' ? total + MARKET_RECEIPT_SURCHARGE : total;
  const checkoutReady = mode === 'practice' || receiptProblemSolved;

  return (
    <View accessibilityViewIsModal style={styles.checkoutPanel}>
      <View style={styles.receiptHeader}>
        <View>
          <Text style={styles.receiptEyebrow}>하늘마트 계산대</Text>
          <Text style={styles.receiptTitle}>장바구니 확인</Text>
        </View>
        <View style={styles.receiptTotalBox}>
          <Text style={styles.receiptTotalLabel}>영수증 합계</Text>
          <Text style={[styles.receiptTotalValue, mode === 'challenge' && styles.receiptTotalValueProblem]}>
            {formatPrice(displayedTotal)}
          </Text>
        </View>
      </View>
      <ScrollView
        contentContainerStyle={styles.receiptLinesContent}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        style={styles.receiptLines}
      >
        {lines.map(({ product, quantity }) => (
          <View key={product.id} style={styles.receiptLine}>
            <View style={[styles.receiptLineIcon, { backgroundColor: product.packageColor }]}>
              <MarketProductArtwork product={product} size={21} />
            </View>
            <Text numberOfLines={1} style={styles.receiptLineName}>{product.name} × {quantity}</Text>
            <Text style={styles.receiptLinePrice}>{formatPrice(product.price * quantity)}</Text>
          </View>
        ))}
        {mode === 'challenge' ? (
          <View style={[styles.receiptLine, styles.receiptProblemLine]}>
            <View style={styles.receiptLineIcon}>
              <Ionicons color="#B45D47" name="help" size={15} />
            </View>
            <Text style={styles.receiptLineName}>확인 필요한 추가 금액</Text>
            <Text style={styles.receiptProblemPrice}>+{formatPrice(MARKET_RECEIPT_SURCHARGE)}</Text>
          </View>
        ) : null}
      </ScrollView>
      <View style={styles.checkoutHint}>
        <Ionicons color="#7A654F" name={mode === 'challenge' ? 'search' : 'information-circle'} size={19} />
        <Text style={styles.checkoutHintText}>
          {mode === 'challenge'
            ? `내 가방 합계 ${formatPrice(total)}와 영수증 합계를 비교해 보세요.`
            : marketMission.checkoutDialogue[1]}
        </Text>
      </View>
      {mode === 'challenge' ? (
        <View style={[styles.receiptChallenge, receiptProblemSolved && styles.receiptChallengeSolved]}>
          <View style={styles.receiptChallengeHeading}>
            <View style={[styles.problemTag, receiptProblemSolved && styles.problemTagSolved]}>
              <Text style={styles.problemTagText}>{receiptProblemSolved ? '해결' : '문제 상황'}</Text>
            </View>
            <Text style={styles.receiptChallengeTitle}>
              {receiptProblemSolved ? '중복 계산을 바로잡았어요' : '이 영수증대로 결제해도 될까요?'}
            </Text>
          </View>
          {receiptProblemSolved ? (
            <View style={styles.receiptSolvedRow}>
              <Ionicons color="#3E815F" name="checkmark-circle" size={20} />
              <Text style={styles.receiptSolvedText}>직원에게 알려 올바른 금액으로 바꿨어요.</Text>
            </View>
          ) : (
            <View style={styles.receiptDecisionRow}>
              <PressScale
                accessibilityLabel="영수증 금액이 맞아요"
                accessibilityRole="button"
                onPress={() => onReceiptDecision('matches')}
                style={styles.receiptDecisionButton}
              >
                <Ionicons color="#6E665C" name="checkmark" size={17} />
                <Text style={styles.receiptDecisionText}>금액이 맞아요</Text>
              </PressScale>
              <PressScale
                accessibilityLabel="영수증 문제를 직원에게 알려요"
                accessibilityRole="button"
                onPress={() => onReceiptDecision('report')}
                style={[styles.receiptDecisionButton, styles.receiptReportButton]}
              >
                <Ionicons color="#FFFFFF" name="chatbubble-ellipses" size={17} />
                <Text style={styles.receiptReportText}>직원에게 알려요</Text>
              </PressScale>
            </View>
          )}
          {receiptAttemptedWrong ? (
            <Text accessibilityLiveRegion="polite" style={styles.receiptTryAgainText}>
              두 합계가 달라요. 추가된 금액을 다시 확인해 보세요.
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.paymentMethodRow}>
        <Text style={styles.paymentMethodLabel}>결제 방법</Text>
        <View accessibilityLabel="결제 방법 선택" accessibilityRole="radiogroup" style={styles.paymentMethodOptions}>
          {([
            { icon: 'card-outline' as IoniconName, id: 'card' as const, label: '카드' },
            { icon: 'cash-outline' as IoniconName, id: 'cash' as const, label: '현금' },
          ]).map((option) => {
            const selected = paymentMethod === option.id;
            return (
              <PressScale
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                key={option.id}
                onPress={() => setPaymentMethod(option.id)}
                style={[styles.paymentMethodOption, selected && styles.paymentMethodOptionSelected]}
              >
                <Ionicons color={selected ? '#FFFFFF' : '#766C60'} name={option.icon} size={15} />
                <Text style={[styles.paymentMethodText, selected && styles.paymentMethodTextSelected]}>{option.label}</Text>
              </PressScale>
            );
          })}
        </View>
      </View>
      <View style={styles.checkoutActions}>
        <PressScale accessibilityRole="button" onPress={onBack} style={styles.checkoutBackButton}>
          <Text style={styles.checkoutBackText}>다시 보기</Text>
        </PressScale>
        <PressScale
          accessibilityRole="button"
          accessibilityState={{ disabled: !checkoutReady }}
          disabled={!checkoutReady}
          onPress={onCheck}
          style={[styles.checkoutCheckButton, !checkoutReady && styles.buttonDisabled]}
        >
          <Text style={styles.checkoutCheckText}>목록 확인</Text>
          <Ionicons color="#FFFFFF" name="checkmark" size={20} />
        </PressScale>
      </View>
    </View>
  );
}

function MarketExitTransition({ onComplete }: { onComplete: () => void }) {
  const walkProgress = useRef(new Animated.Value(0)).current;
  const sceneOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const exitAnimation = Animated.sequence([
      Animated.timing(walkProgress, {
        duration: 820,
        easing: Easing.inOut(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(sceneOpacity, {
        duration: 180,
        toValue: 0,
        useNativeDriver: true,
      }),
    ]);
    exitAnimation.start(({ finished }) => {
      if (finished) onComplete();
    });
    return () => exitAnimation.stop();
  }, [onComplete, sceneOpacity, walkProgress]);

  return (
    <Animated.View
      accessibilityLabel="장보기를 마치고 출구로 이동 중"
      accessibilityLiveRegion="polite"
      style={[styles.exitOverlay, { opacity: sceneOpacity }]}
    >
      <View style={styles.exitDoorStage}>
        <View style={styles.exitSign}>
          <Ionicons color="#FFFFFF" name="exit-outline" size={16} />
          <Text style={styles.exitSignText}>출구</Text>
        </View>
        <View style={styles.exitDoor}>
          <View style={styles.exitDoorGlass} />
          <View style={styles.exitDoorDivider} />
        </View>
      </View>
      <View style={styles.exitFloorPath} />
      <Animated.View
        style={[
          styles.exitPlayer,
          {
            transform: [
              { translateY: walkProgress.interpolate({ inputRange: [0, 1], outputRange: [92, -118] }) },
              { scale: walkProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.78] }) },
            ],
          },
        ]}
      >
        <View style={styles.exitPlayerHead} />
        <View style={styles.exitPlayerBody}>
          <Image resizeMode="contain" source={icons.user} style={styles.exitPlayerBadge} />
        </View>
        <View style={styles.exitPlayerShadow} />
      </Animated.View>
      <View style={styles.exitCaption}>
        <Ionicons color="#3F7459" name="bag-check-outline" size={18} />
        <Text style={styles.exitCaptionText}>장바구니를 챙겨 마을로 돌아가요</Text>
      </View>
    </Animated.View>
  );
}

function ResultPanel({
  correctionCount,
  evaluation,
  hintLevel,
  mistakeCount,
  mode,
  onExit,
  onRetry,
  receiptProblemSolved,
  stockoutStaffHelpUsed,
  stockoutSubstitutionUsed,
}: {
  correctionCount: number;
  evaluation: MarketSessionEvaluation;
  hintLevel: number;
  mistakeCount: number;
  mode: MarketMode;
  onExit: () => void;
  onRetry: () => void;
  receiptProblemSolved: boolean;
  stockoutStaffHelpUsed: boolean;
  stockoutSubstitutionUsed: boolean;
}) {
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState<boolean | null>(null);
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardProgress = useRef(new Animated.Value(0)).current;
  const heroProgress = useRef(new Animated.Value(0)).current;
  const detailsProgress = useRef(new Animated.Value(0)).current;

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
    if (reduceMotionEnabled === null) return undefined;

    const values = [overlayOpacity, cardOpacity, cardProgress, heroProgress, detailsProgress];
    values.forEach((value) => value.stopAnimation());

    if (reduceMotionEnabled) {
      values.forEach((value) => value.setValue(1));
      return undefined;
    }

    values.forEach((value) => value.setValue(0));
    const entrance = Animated.parallel([
      Animated.timing(overlayOpacity, {
        duration: 180,
        easing: Easing.out(Easing.quad),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(cardOpacity, {
          duration: 260,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(cardProgress, {
          duration: 360,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(120),
        Animated.spring(heroProgress, {
          damping: 13,
          mass: 0.65,
          stiffness: 190,
          toValue: 1,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(210),
        Animated.timing(detailsProgress, {
          duration: 280,
          easing: Easing.out(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
      ]),
    ]);
    entrance.start();

    return () => entrance.stop();
  }, [cardOpacity, cardProgress, detailsProgress, heroProgress, overlayOpacity, reduceMotionEnabled]);

  const overlayAnimationStyle = { opacity: overlayOpacity };
  const cardAnimationStyle = {
    opacity: cardOpacity,
    transform: [
      { translateY: cardProgress.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
      { scale: cardProgress.interpolate({ inputRange: [0, 1], outputRange: [0.975, 1] }) },
    ],
  };
  const heroAnimationStyle = {
    opacity: heroProgress,
    transform: [{ scale: heroProgress.interpolate({ inputRange: [0, 1], outputRange: [0.84, 1] }) }],
  };
  const detailsAnimationStyle = {
    opacity: detailsProgress,
    transform: [{ translateY: detailsProgress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
  };

  const resultBadges: Array<{ icon: IoniconName; label: string }> = [
    { icon: 'list', label: '목록 정확' },
    { icon: 'wallet', label: '예산 지킴' },
    {
      icon: hintLevel === 0 ? 'compass' : 'bulb',
      label: hintLevel === 0 ? '스스로 탐색' : '도움 활용',
    },
  ];
  if (mode === 'challenge' && receiptProblemSolved) {
    resultBadges.push({ icon: 'receipt', label: '영수증 해결' });
  } else if (correctionCount > 0) {
    resultBadges.push({ icon: 'refresh', label: '스스로 수정' });
  }
  if (mode === 'challenge' && stockoutSubstitutionUsed) {
    resultBadges.push({
      icon: stockoutStaffHelpUsed ? 'people' : 'git-compare-outline',
      label: stockoutStaffHelpUsed ? '직원 도움 활용' : '대체 상품 비교',
    });
  }

  if (evaluation.success) {
    return (
      <Animated.View accessibilityViewIsModal style={[styles.resultOverlay, overlayAnimationStyle]}>
        <Animated.View style={[styles.resultCard, cardAnimationStyle]}>
          <Animated.View style={heroAnimationStyle}>
            <View style={styles.successIconStage}>
              <View style={styles.successRing} />
              <Ionicons color="#FFFFFF" name="checkmark" size={40} />
            </View>
          </Animated.View>
          <View style={styles.resultStamp}>
            <Ionicons color="#FFFFFF" name="star" size={14} />
            <Text style={styles.resultStampText}>MISSION CLEAR</Text>
          </View>
          <Text style={styles.resultEyebrow}>장보기 의뢰 완료</Text>
          <Text style={styles.resultTitle}>{marketMission.successMessage}</Text>
          <Text style={styles.resultDescription}>
            {correctionCount > 0
              ? '고른 물건을 스스로 바로잡고 끝까지 완성했어요.'
              : mistakeCount > 0
                ? '중간에 다시 확인하며 필요한 물건과 예산을 모두 맞췄어요.'
                : '필요한 물건을 빠뜨리지 않고 예산도 지켰어요.'}
          </Text>
          <Animated.View style={[styles.resultStats, detailsAnimationStyle]}>
            <View style={styles.resultStat}>
              <Text style={styles.resultStatValue}>{marketMission.objectives.length}</Text>
              <Text style={styles.resultStatLabel}>목록 완료</Text>
            </View>
            <View style={styles.resultStatDivider} />
            <View style={styles.resultStat}>
              <Text style={styles.resultStatValue}>{formatPrice(evaluation.total)}</Text>
              <Text style={styles.resultStatLabel}>사용 금액</Text>
            </View>
          </Animated.View>
          <Animated.View style={[styles.resultBadges, detailsAnimationStyle]}>
            {resultBadges.map((badge) => (
              <View key={badge.label} style={styles.resultBadge}>
                <View style={styles.resultBadgeIcon}>
                  <Ionicons color="#3F7D5E" name={badge.icon} size={15} />
                </View>
                <Text style={styles.resultBadgeText}>{badge.label}</Text>
              </View>
            ))}
          </Animated.View>
          <PressScale accessibilityRole="button" onPress={onExit} style={styles.resultPrimaryButton}>
            <Text style={styles.resultPrimaryButtonText}>출구로 이동하기</Text>
          </PressScale>
        </Animated.View>
      </Animated.View>
    );
  }

  return (
    <Animated.View accessibilityViewIsModal style={[styles.resultOverlay, overlayAnimationStyle]}>
      <Animated.View style={[styles.resultCard, cardAnimationStyle]}>
        <Animated.View style={heroAnimationStyle}>
          <View style={styles.retryIconStage}><Ionicons color="#9A7045" name="basket-outline" size={34} /></View>
        </Animated.View>
        <Text style={styles.resultEyebrow}>한 번 더 확인해요</Text>
        <Text style={styles.resultTitle}>조금만 고치면 완성할 수 있어요</Text>
        <Animated.View style={[styles.feedbackList, detailsAnimationStyle]}>
          {evaluation.missing.length > 0 ? (
            <FeedbackRow
              icon="list-outline"
              text={`${evaluation.missing
                .map((item) => `${getMarketProduct(item.productId)?.name ?? '물건'} ${item.quantity}개`)
                .join(', ')}가 더 필요해요.`}
            />
          ) : null}
          {evaluation.extra.length > 0 ? (
            <FeedbackRow
              icon="remove-circle-outline"
              text={`${evaluation.extra
                .map((item) => `${getMarketProduct(item.productId)?.name ?? '물건'} ${item.quantity}개`)
                .join(', ')}는 오늘 목록에 없어요.`}
            />
          ) : null}
          {evaluation.quantityOverages.length > 0 ? (
            <FeedbackRow
              icon="swap-vertical-outline"
              text={`${evaluation.quantityOverages
                .map((item) => `${getMarketProduct(item.productId)?.name ?? '물건'} ${item.quantity}개`)
                .join(', ')}를 너무 많이 담았어요.`}
            />
          ) : null}
          {evaluation.overBudget > 0 ? (
            <FeedbackRow icon="wallet-outline" text={`예산보다 ${formatPrice(evaluation.overBudget)} 많아요.`} />
          ) : null}
        </Animated.View>
        <PressScale accessibilityRole="button" onPress={onRetry} style={styles.resultPrimaryButton}>
          <Text style={styles.resultPrimaryButtonText}>장바구니 고치기</Text>
        </PressScale>
      </Animated.View>
    </Animated.View>
  );
}

function FeedbackRow({ icon, text }: { icon: IoniconName; text: string }) {
  return (
    <View style={styles.feedbackRow}>
      <View style={styles.feedbackIcon}><Ionicons color="#9A7045" name={icon} size={19} /></View>
      <Text style={styles.feedbackText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#D8D1C2', flex: 1 },
  embeddedRoot: { ...StyleSheet.absoluteFillObject, zIndex: 28 },
  embeddedShoppingFooter: { bottom: undefined, height: 72, top: 110 },
  embeddedCheckoutOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 52,
  },
  embeddedCheckoutBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(24,30,26,0.52)',
  },
  topBar: { alignItems: 'center', flexDirection: 'row', left: 0, paddingHorizontal: 14, paddingTop: 34, position: 'absolute', right: 0, top: 0, zIndex: 20 },
  topIconButton: { alignItems: 'center', backgroundColor: 'rgba(34,44,38,0.84)', borderColor: 'rgba(255,255,255,0.28)', borderRadius: 18, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 },
  locationHeading: { backgroundColor: 'rgba(34,44,38,0.84)', borderColor: 'rgba(255,255,255,0.2)', borderRadius: 13, borderWidth: 1, flex: 1, marginLeft: 8, paddingHorizontal: 11, paddingVertical: 7 },
  locationEyebrow: { color: 'rgba(255,255,255,0.62)', fontFamily: fonts.bold, fontSize: 8, letterSpacing: 0.7 },
  locationTitle: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 15, letterSpacing: -0.3, marginTop: 1 },
  topStats: { alignItems: 'flex-end', gap: 5, marginLeft: 7 },
  progressPill: { alignItems: 'center', backgroundColor: '#F5EBD4', borderColor: '#D9C49A', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  progressPillText: { color: '#466B55', fontFamily: fonts.bold, fontSize: 11 },
  budgetPill: { alignItems: 'flex-end', backgroundColor: 'rgba(34,44,38,0.84)', borderRadius: 8, flexDirection: 'row', gap: 5, paddingHorizontal: 7, paddingVertical: 4 },
  budgetPillLabel: { color: 'rgba(255,255,255,0.58)', fontFamily: fonts.medium, fontSize: 8 },
  budgetPillValue: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 11 },
  topCartDot: { backgroundColor: '#E46D4E', borderColor: '#FFFFFF', borderRadius: 5, borderWidth: 2, height: 10, position: 'absolute', right: 10, top: 28, width: 10 },
  map: { cursor: 'auto', flex: 1, minHeight: 520, overflow: 'hidden', position: 'relative' },
  marketWorld: { height: MARKET_WORLD_HEIGHT, left: 0, position: 'absolute', top: 0, width: MARKET_WORLD_WIDTH },
  marketWorldGround: { ...StyleSheet.absoluteFillObject, backgroundColor: '#DED6C8', borderColor: '#B8AB98', borderWidth: 12 },
  marketBackWall: { backgroundColor: '#F3E6D6', borderBottomColor: '#CFBBA6', borderBottomWidth: 4, height: 120, left: 0, position: 'absolute', top: 0, width: MARKET_WORLD_WIDTH },
  marketAisle: { backgroundColor: 'rgba(250,244,230,0.54)', borderColor: 'rgba(145,125,99,0.16)', borderRadius: 26, borderWidth: 2, position: 'absolute' },
  marketAisleMain: { height: 720, left: 365, top: 205, width: 170 },
  marketAisleCrossTop: { height: 100, left: 245, top: 350, width: 410 },
  marketAisleCrossBottom: { height: 100, left: 245, top: 630, width: 410 },
  marketTapTarget: { borderColor: 'rgba(52,91,68,0.72)', borderRadius: 12, borderWidth: 3, height: 24, position: 'absolute', width: 24, zIndex: 4 },
  backWall: { backgroundColor: '#F3E6D6', borderBottomColor: '#CFBBA6', borderBottomWidth: 3, height: 94, left: 0, position: 'absolute', right: 0, top: 0 },
  wallStripe: { backgroundColor: '#D4775B', bottom: 11, height: 7, left: 0, opacity: 0.8, position: 'absolute', right: 0 },
  storeLogo: { alignItems: 'center', alignSelf: 'center', backgroundColor: '#C95D46', borderRadius: 8, flexDirection: 'row', gap: 7, marginTop: 13, paddingHorizontal: 14, paddingVertical: 8 },
  storeLogoText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.1 },
  wallMessage: { bottom: 16, color: '#8B715E', fontFamily: fonts.medium, fontSize: 9, left: 17, position: 'absolute' },
  mapFloor: { backgroundColor: '#E5DED1', bottom: 0, left: 0, position: 'absolute', right: 0, top: 94 },
  floorTileRow: { backgroundColor: 'rgba(255,255,255,0.45)', height: 1, left: 0, position: 'absolute', right: 0 },
  floorTileColumn: { backgroundColor: 'rgba(255,255,255,0.38)', bottom: 0, position: 'absolute', top: 0, transform: [{ rotate: '8deg' }], width: 1 },
  counterArea: { height: MARKET_CHECKOUT_RECT.height, left: MARKET_CHECKOUT_RECT.x, position: 'absolute', top: MARKET_CHECKOUT_RECT.y, width: MARKET_CHECKOUT_RECT.width },
  counterAreaActive: { borderColor: '#F3CE62', borderWidth: 3 },
  counterRegister: { left: 12, position: 'absolute', top: -15 },
  registerScreen: { backgroundColor: '#52605C', borderColor: '#36403D', borderRadius: 3, borderWidth: 1, height: 17, width: 28 },
  registerBase: { backgroundColor: '#707B77', height: 6, marginLeft: 9, width: 10 },
  cashierCharacter: { alignItems: 'center', position: 'absolute', right: 15, top: -37 },
  cashierHair: { backgroundColor: '#5B4437', borderRadius: 12, height: 24, position: 'absolute', top: -2, width: 27 },
  cashierHead: { backgroundColor: '#E2B592', borderColor: '#6A4D3D', borderRadius: 11, borderWidth: 1, height: 22, width: 22 },
  cashierBody: { alignItems: 'center', backgroundColor: '#5D8C6B', borderColor: '#456550', borderRadius: 5, borderWidth: 1, height: 31, marginTop: -1, overflow: 'hidden', width: 24 },
  cashierApron: { backgroundColor: '#E7E1CE', height: 21, marginTop: 8, width: 17 },
  cashierNameTag: { backgroundColor: '#FFFFFF', borderRadius: 8, bottom: -19, paddingHorizontal: 8, paddingVertical: 3, position: 'absolute', right: 8 },
  cashierNameText: { color: '#60574F', fontFamily: fonts.semibold, fontSize: 9 },
  counterSign: { color: '#FFF4DE', fontFamily: fonts.bold, fontSize: 15, left: 24, letterSpacing: 1, position: 'absolute', top: 56 },
  shelfGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'center', left: 14, position: 'absolute', right: 14, top: 176 },
  shelfZoneOffset: { transform: [{ translateY: 10 }] },
  playerCharacter: { alignItems: 'center', left: 0, position: 'absolute', top: 0, zIndex: 12 },
  marketPlayerFixed: { alignItems: 'center', height: 78, justifyContent: 'flex-start', left: '50%', marginLeft: -25, marginTop: -39, position: 'absolute', top: '50%', width: 50, zIndex: 16 },
  playerShadow: { backgroundColor: 'rgba(69,70,61,0.25)', borderRadius: 18, bottom: -8, height: 12, position: 'absolute', width: 42 },
  playerMoveRing: { borderColor: 'rgba(255,244,184,0.64)', borderRadius: 23, borderWidth: 2, bottom: -13, height: 46, position: 'absolute', width: 46 },
  playerHead: { backgroundColor: '#E4B894', borderColor: '#604639', borderRadius: 14, borderWidth: 1.5, height: 29, width: 29, zIndex: 2 },
  playerBody: { alignItems: 'center', backgroundColor: '#E39344', borderColor: '#704D2B', borderRadius: 8, borderWidth: 1.5, height: 42, marginTop: -2, overflow: 'hidden', width: 33 },
  playerBadgeImage: { height: 22, marginTop: 10, width: 22 },
  playerBasket: { alignItems: 'center', backgroundColor: '#C95D46', borderColor: '#FFFFFF', borderRadius: 11, borderWidth: 1, height: 25, justifyContent: 'center', position: 'absolute', right: -19, top: 37, width: 25 },
  marketEntranceInterior: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.7)', borderColor: '#B9B0A2', borderRadius: 16, borderStyle: 'dashed', borderWidth: 2, flexDirection: 'row', gap: 7, height: 58, justifyContent: 'center', left: 375, position: 'absolute', top: 900, width: 150 },
  marketEntranceInteriorText: { color: '#647168', fontFamily: fonts.bold, fontSize: 13 },
  marketControlToggle: { alignItems: 'center', backgroundColor: 'rgba(35,47,39,0.86)', borderColor: 'rgba(255,255,255,0.24)', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 8, position: 'absolute', right: 14, top: 112, zIndex: 26 },
  marketControlToggleText: { color: '#FFF8E8', fontFamily: fonts.bold, fontSize: 9 },
  marketRunButton: { alignItems: 'center', backgroundColor: 'rgba(255,250,236,0.88)', borderColor: 'rgba(75,64,46,0.28)', borderRadius: 25, borderWidth: 2, bottom: 162, height: 50, justifyContent: 'center', position: 'absolute', right: 92, width: 50, zIndex: 24 },
  marketRunButtonActive: { backgroundColor: '#4C6E5A', borderColor: 'rgba(255,255,255,0.75)' },
  marketJoystickZone: { bottom: 72, height: MARKET_JOYSTICK_ZONE_HEIGHT, left: 0, position: 'absolute', width: '58%', zIndex: 22 },
  marketJoystick: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.52)', borderColor: 'rgba(49,61,52,0.22)', borderRadius: 55, borderWidth: 2, height: MARKET_JOYSTICK_SIZE, justifyContent: 'center', position: 'absolute', width: MARKET_JOYSTICK_SIZE },
  marketJoystickGuideHorizontal: { backgroundColor: 'rgba(62,78,67,0.12)', height: 2, position: 'absolute', width: 70 },
  marketJoystickGuideVertical: { backgroundColor: 'rgba(62,78,67,0.12)', height: 70, position: 'absolute', width: 2 },
  marketJoystickKnob: { backgroundColor: 'rgba(60,76,65,0.82)', borderColor: 'rgba(255,255,255,0.7)', borderRadius: 24, borderWidth: 2, height: 48, width: 48 },
  marketTouchHint: { alignItems: 'center', alignSelf: 'center', backgroundColor: 'rgba(38,50,42,0.84)', borderColor: 'rgba(255,255,255,0.2)', borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 8, position: 'absolute', top: 122, zIndex: 24 },
  marketTouchHintText: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 10 },
  mapInstruction: { alignItems: 'center', alignSelf: 'center', backgroundColor: 'rgba(38,50,42,0.84)', borderColor: 'rgba(255,255,255,0.2)', borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 8, position: 'absolute', top: 128 },
  mapInstructionText: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 10 },
  stationActionButton: { alignItems: 'center', backgroundColor: '#317A5B', borderColor: '#F5E8C8', borderRadius: 32, borderWidth: 3, bottom: 91, height: 64, justifyContent: 'center', position: 'absolute', right: 18, shadowColor: '#23352C', shadowOffset: { height: 4, width: 0 }, shadowOpacity: 0.24, shadowRadius: 6, width: 64, zIndex: 25 },
  stationActionText: { color: '#FFF8E8', fontFamily: fonts.bold, fontSize: 9, marginTop: 2 },
  shoppingFooter: { alignItems: 'stretch', bottom: 14, flexDirection: 'row', gap: 7, left: 13, position: 'absolute', right: 13, zIndex: 24 },
  missionStrip: { backgroundColor: '#FFF9EA', borderColor: '#D8C6A5', borderRadius: 13, borderWidth: 1, elevation: 3, flex: 1, height: 72, justifyContent: 'center', paddingBottom: 7, paddingHorizontal: 9, paddingTop: 7, position: 'relative', shadowColor: '#5D4A34', shadowOffset: { height: 2, width: 0 }, shadowOpacity: 0.14, shadowRadius: 4 },
  missionTape: { alignSelf: 'center', backgroundColor: 'rgba(224,204,163,0.62)', borderRadius: 2, height: 8, position: 'absolute', top: -4, transform: [{ rotate: '-1deg' }], width: 36 },
  missionStripHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 19 },
  missionHeadingLeft: { alignItems: 'center', flexDirection: 'row', gap: 4, minWidth: 0 },
  missionStripLabel: { color: '#806B53', fontFamily: fonts.handwriting, fontSize: 10, letterSpacing: 0.15 },
  modeMiniBadge: { backgroundColor: '#E4F0E6', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  modeMiniBadgeChallenge: { backgroundColor: '#F6E5D7' },
  modeMiniBadgeText: { color: '#3E7658', fontFamily: fonts.bold, fontSize: 7 },
  modeMiniBadgeTextChallenge: { color: '#A45942' },
  hudBudget: { alignItems: 'center', backgroundColor: '#ECF3EA', borderRadius: 7, flexDirection: 'row', gap: 3, paddingHorizontal: 5, paddingVertical: 3 },
  hudBudgetLabel: { color: '#738275', fontFamily: fonts.medium, fontSize: 7 },
  hudBudgetValue: { color: '#3C5D49', fontFamily: fonts.bold, fontSize: 9 },
  missionChecklist: { alignItems: 'flex-start', flexDirection: 'row', gap: 7, marginTop: 4, minWidth: 0 },
  missionChecklistItem: { flex: 1, flexBasis: 0, minWidth: 0 },
  missionItemHeading: { alignItems: 'center', flexDirection: 'row', gap: 3, minWidth: 0 },
  missionCheckbox: { alignItems: 'center', backgroundColor: '#FFFCF3', borderColor: '#BBAA89', borderRadius: 6, borderWidth: 1, height: 11, justifyContent: 'center', width: 11 },
  missionCheckboxComplete: { backgroundColor: '#4E916B', borderColor: '#4E916B' },
  missionItemName: { color: '#4D4338', flex: 1, fontFamily: fonts.handwriting, fontSize: 12, lineHeight: 15, minWidth: 0 },
  missionItemNameComplete: { color: '#718074', textDecorationLine: 'line-through' },
  missionItemCount: { color: '#8C7559', fontFamily: fonts.bold, fontSize: 9, lineHeight: 10, marginLeft: 14 },
  missionItemCountComplete: { color: '#4E7D60' },
  hintButton: { alignItems: 'center', backgroundColor: '#F5E8C8', borderColor: '#9E815B', borderRadius: 15, borderWidth: 2, height: 72, justifyContent: 'center', width: 50 },
  hintButtonText: { color: '#77583E', fontFamily: fonts.bold, fontSize: 8, marginTop: 2 },
  cartButton: { alignItems: 'center', backgroundColor: '#367A5A', borderColor: '#F5E8C8', borderRadius: 15, borderWidth: 2, height: 72, justifyContent: 'center', position: 'relative', width: 54 },
  cartButtonText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 9, marginTop: 1 },
  cartCountBadge: { alignItems: 'center', backgroundColor: '#F0C95B', borderColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, height: 20, justifyContent: 'center', minWidth: 20, paddingHorizontal: 5, position: 'absolute', right: -4, top: -5 },
  cartCountText: { color: '#317A5B', fontFamily: fonts.bold, fontSize: 11 },
  hintOverlay: { left: 0, paddingHorizontal: 13, position: 'absolute', right: 0, top: 194, zIndex: 48 },
  hintPanel: { backgroundColor: '#FFF8E9', borderColor: '#8A6B45', borderRadius: 15, borderWidth: 2, elevation: 6, padding: 13, shadowColor: '#3B3026', shadowOffset: { height: 4, width: 0 }, shadowOpacity: 0.22, shadowRadius: 8 },
  hintPanelHeader: { alignItems: 'center', flexDirection: 'row' },
  hintGuideIcon: { alignItems: 'center', backgroundColor: '#F4E5BD', borderRadius: 11, height: 36, justifyContent: 'center', width: 36 },
  hintPanelHeading: { flex: 1, marginLeft: 9 },
  hintPanelEyebrow: { color: '#A0896C', fontFamily: fonts.bold, fontSize: 8, letterSpacing: 0.4 },
  hintPanelTitle: { color: '#4D4033', fontFamily: fonts.bold, fontSize: 14, marginTop: 1 },
  hintCloseButton: { alignItems: 'center', backgroundColor: '#EEE2CC', borderRadius: 9, height: 34, justifyContent: 'center', width: 34 },
  hintMessage: { color: '#544B42', fontFamily: fonts.medium, fontSize: 13, lineHeight: 20, marginTop: 11 },
  hintFooter: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  hintDots: { flexDirection: 'row', gap: 5 },
  hintDot: { backgroundColor: '#D9CDB8', borderRadius: 4, height: 7, width: 7 },
  hintDotActive: { backgroundColor: '#B08B47', width: 15 },
  nextHintButton: { alignItems: 'center', backgroundColor: '#4B7D62', borderRadius: 9, flexDirection: 'row', gap: 3, height: 36, justifyContent: 'center', paddingHorizontal: 11 },
  nextHintButtonText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 10 },
  dialogueOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(25,31,27,0.28)', justifyContent: 'flex-end', padding: 14, zIndex: 30 },
  dialogueCard: { backgroundColor: 'rgba(35,43,38,0.96)', borderColor: '#EED9A8', borderRadius: 16, borderWidth: 3, padding: 17 },
  dialogueHeader: { alignItems: 'center', flexDirection: 'row' },
  dialogueAvatar: { alignItems: 'center', backgroundColor: '#EAF2E9', borderColor: '#EED9A8', borderRadius: 22, borderWidth: 2, height: 44, justifyContent: 'center', marginRight: 10, overflow: 'hidden', width: 44 },
  dialogueAvatarHair: { backgroundColor: '#5B4437', borderRadius: 11, height: 22, position: 'absolute', top: 8, width: 25 },
  dialogueAvatarFace: { backgroundColor: '#E2B592', borderColor: '#6A4D3D', borderRadius: 10, borderWidth: 1, height: 20, marginTop: -3, width: 20 },
  dialogueHeaderCopy: { flex: 1 },
  dialogueName: { color: '#F5D895', fontFamily: fonts.cafe24Ssurround, fontSize: 15 },
  dialogueRole: { color: 'rgba(255,255,255,0.58)', fontFamily: fonts.cafe24SsurroundAir, fontSize: 10, marginTop: 2 },
  dialogueProgress: { color: 'rgba(255,255,255,0.54)', fontFamily: fonts.cafe24Ssurround, fontSize: 10 },
  dialogueMessage: { color: '#FFFFFF', fontFamily: fonts.cafe24Ssurround, fontSize: 18, letterSpacing: -0.4, lineHeight: 27, marginTop: 16, minHeight: 58 },
  briefingViewSelector: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 15, flexDirection: 'row', gap: 4, marginTop: 14, padding: 4 },
  briefingViewOption: { alignItems: 'center', borderRadius: 11, flexDirection: 'row', gap: 5, minHeight: 32, paddingHorizontal: 10 },
  briefingViewOptionSelected: { backgroundColor: '#6C8D78' },
  briefingViewText: { color: '#D9D5CE', fontFamily: fonts.semibold, fontSize: 11 },
  briefingViewTextSelected: { color: '#FFFFFF' },
  briefingPictureList: { flexDirection: 'row', gap: 7, justifyContent: 'center', marginTop: 13, minHeight: 61 },
  briefingPictureItem: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 12, flex: 1, maxWidth: 112, paddingHorizontal: 6, paddingVertical: 7 },
  briefingPictureIcon: { alignItems: 'center', borderRadius: 10, height: 30, justifyContent: 'center', width: 34 },
  briefingPictureName: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 9, marginTop: 4, textAlign: 'center' },
  briefingPictureQuantity: { color: '#F2D886', fontFamily: fonts.bold, fontSize: 9, marginTop: 1 },
  modeSelector: { gap: 7, marginTop: 2 },
  modeOption: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.16)', borderRadius: 11, borderWidth: 1, flexDirection: 'row', minHeight: 54, padding: 8 },
  modeOptionHighlight: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(78,132,98,0.36)', borderColor: '#F0D58E', borderRadius: 10, borderWidth: 1 },
  modeOptionIcon: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 9, height: 34, justifyContent: 'center', width: 34 },
  modeOptionIconHighlight: { ...StyleSheet.absoluteFillObject, backgroundColor: '#4B7D62', borderRadius: 9 },
  modeOptionCopy: { flex: 1, marginHorizontal: 9 },
  modeOptionLabel: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 12 },
  modeOptionDescription: { color: 'rgba(255,255,255,0.55)', fontFamily: fonts.regular, fontSize: 9, lineHeight: 13, marginTop: 2 },
  dialogueButton: { alignItems: 'center', alignSelf: 'flex-end', backgroundColor: '#B85C43', borderColor: '#E9A082', borderRadius: 11, borderWidth: 2, flexDirection: 'row', gap: 7, height: 45, justifyContent: 'center', marginTop: 13, paddingHorizontal: 18 },
  dialogueButtonText: { color: '#FFFFFF', fontFamily: fonts.cafe24Ssurround, fontSize: 14 },
  sheetOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 50 },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(21,27,23,0.56)' },
  cartSheet: { backgroundColor: '#F5E7C8', borderColor: '#77583E', borderRadius: 18, borderWidth: 4, margin: 10, maxHeight: '82%', minHeight: 420, paddingBottom: 15, paddingHorizontal: 14, paddingTop: 13 },
  sheetHandle: { alignSelf: 'center', backgroundColor: '#A88962', borderRadius: 3, height: 4, marginBottom: 12, opacity: 0.5, width: 38 },
  cartSheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sheetEyebrow: { color: '#93734F', fontFamily: fonts.bold, fontSize: 9, letterSpacing: 0.45 },
  sheetTitle: { color: '#423326', fontFamily: fonts.laundryBold, fontSize: 21, letterSpacing: -0.4, marginTop: 2 },
  sheetCloseButton: { alignItems: 'center', backgroundColor: '#E2D0AA', borderColor: '#B39468', borderRadius: 10, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  emptyCart: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 210 },
  emptyCartIcon: { alignItems: 'center', backgroundColor: '#EDF4EF', borderRadius: 28, height: 58, justifyContent: 'center', width: 58 },
  emptyCartTitle: { color: '#404641', fontFamily: fonts.bold, fontSize: 16, marginTop: 13 },
  emptyCartDescription: { color: '#8E918D', fontFamily: fonts.regular, fontSize: 12, marginTop: 5 },
  cartListScroll: { flexGrow: 0, marginTop: 12, maxHeight: 275 },
  cartList: { gap: 8, paddingBottom: 5 },
  cartLine: { alignItems: 'center', backgroundColor: '#FFF7E6', borderColor: '#D1BD98', borderRadius: 10, borderWidth: 1, flexDirection: 'row', padding: 9 },
  cartLineIcon: { alignItems: 'center', borderRadius: 11, height: 42, justifyContent: 'center', marginRight: 10, width: 42 },
  cartLineCopy: { flex: 1 },
  cartLineName: { color: '#343936', fontFamily: fonts.semibold, fontSize: 13 },
  cartLinePrice: { color: '#88847F', fontFamily: fonts.medium, fontSize: 11, marginTop: 3 },
  cartQuantity: { alignItems: 'center', backgroundColor: '#E9DFC8', borderColor: '#CBB792', borderRadius: 8, borderWidth: 1, flexDirection: 'row', padding: 3 },
  cartQuantityButton: { alignItems: 'center', height: 29, justifyContent: 'center', width: 29 },
  cartQuantityText: { color: '#39453E', fontFamily: fonts.bold, fontSize: 12, minWidth: 20, textAlign: 'center' },
  cartTotalRow: { alignItems: 'center', borderStyle: 'dashed', borderTopColor: '#C7AF86', borderTopWidth: 1.5, flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 13 },
  cartTotalLabel: { color: '#77736E', fontFamily: fonts.medium, fontSize: 13 },
  cartBudgetCaption: { color: '#7A857D', fontFamily: fonts.medium, fontSize: 9, marginTop: 3 },
  cartTotalValue: { color: '#2F3933', fontFamily: fonts.bold, fontSize: 20 },
  checkoutButton: { alignItems: 'center', backgroundColor: '#39795A', borderColor: '#285D43', borderRadius: 10, borderWidth: 2, flexDirection: 'row', gap: 7, height: 50, justifyContent: 'center', marginTop: 12 },
  checkoutButtonText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 16 },
  buttonDisabled: { opacity: 0.38 },
  checkoutScene: { backgroundColor: '#E5DED1', flex: 1, minHeight: 240, overflow: 'hidden', position: 'relative' },
  checkoutWall: { alignItems: 'center', backgroundColor: '#F2E5D4', borderBottomColor: '#C9B39B', borderBottomWidth: 3, height: 76, paddingTop: 22 },
  checkoutWallText: { color: '#B2634D', fontFamily: fonts.bold, fontSize: 15, letterSpacing: 2 },
  checkoutCounterLarge: { backgroundColor: '#A97C59', borderColor: '#6D4E39', borderRadius: 12, borderWidth: 2, height: 110, left: '9%', position: 'absolute', right: '9%', top: 160 },
  checkoutScanner: { backgroundColor: '#57625F', borderColor: '#37403E', borderRadius: 7, borderWidth: 1, height: 32, position: 'absolute', right: 34, top: -22, width: 54 },
  checkoutScannerLight: { backgroundColor: '#F16955', borderRadius: 2, bottom: 5, height: 3, left: 8, position: 'absolute', right: 8, shadowColor: '#FF6D57', shadowOpacity: 0.8, shadowRadius: 4 },
  checkoutBelt: { backgroundColor: '#575C5B', borderRadius: 6, height: 54, left: 18, overflow: 'hidden', position: 'absolute', right: 108, top: 17 },
  beltProduct: { alignItems: 'center', borderRadius: 6, height: 38, justifyContent: 'center', position: 'absolute', top: 8, width: 36 },
  checkoutCashierLarge: { alignItems: 'center', position: 'absolute', right: 48, top: 90 },
  checkoutCashierHair: { backgroundColor: '#594337', borderRadius: 25, height: 47, position: 'absolute', top: -4, width: 54 },
  checkoutCashierHead: { backgroundColor: '#E2B592', borderColor: '#664A3B', borderRadius: 22, borderWidth: 2, height: 44, width: 44 },
  checkoutCashierBody: { alignItems: 'center', backgroundColor: '#5D8C6B', borderColor: '#456550', borderRadius: 10, borderWidth: 2, height: 72, marginTop: -2, overflow: 'hidden', width: 58 },
  checkoutCashierApron: { backgroundColor: '#EAE4D4', borderRadius: 5, height: 46, marginTop: 18, width: 38 },
  checkoutSpeech: { backgroundColor: '#FFFFFF', borderColor: '#DED9D1', borderRadius: 18, borderWidth: 1, left: 24, padding: 12, position: 'absolute', right: 135, top: 82 },
  checkoutSpeechName: { color: '#3A6D54', fontFamily: fonts.bold, fontSize: 11 },
  checkoutSpeechText: { color: '#393D3A', fontFamily: fonts.semibold, fontSize: 13, lineHeight: 19, marginTop: 5 },
  checkoutPanel: { backgroundColor: '#F5E7C8', borderColor: '#77583E', borderLeftWidth: 4, borderRightWidth: 4, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderTopWidth: 4, maxHeight: '88%', paddingBottom: 17, paddingHorizontal: 16, paddingTop: 16 },
  receiptHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  receiptEyebrow: { color: '#91887F', fontFamily: fonts.medium, fontSize: 10 },
  receiptTitle: { color: '#2F3531', fontFamily: fonts.bold, fontSize: 19, marginTop: 3 },
  receiptTotalBox: { alignItems: 'flex-end' },
  receiptTotalLabel: { color: '#91887F', fontFamily: fonts.medium, fontSize: 10 },
  receiptTotalValue: { color: '#2F3C35', fontFamily: fonts.bold, fontSize: 19, marginTop: 2 },
  receiptTotalValueProblem: { color: '#B34F3E' },
  receiptLines: { flexGrow: 0, marginTop: 10, maxHeight: 112 },
  receiptLinesContent: { gap: 5 },
  receiptLine: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.52)', borderRadius: 8, flexDirection: 'row', minHeight: 34, paddingHorizontal: 8, paddingVertical: 5 },
  receiptLineIcon: { alignItems: 'center', backgroundColor: '#F2E7D4', borderRadius: 7, height: 24, justifyContent: 'center', marginRight: 7, width: 24 },
  receiptLineName: { color: '#5A544D', flex: 1, fontFamily: fonts.medium, fontSize: 10 },
  receiptLinePrice: { color: '#373D39', fontFamily: fonts.bold, fontSize: 10 },
  receiptProblemLine: { backgroundColor: '#FFF0EB', borderColor: '#D99383', borderWidth: 1 },
  receiptProblemPrice: { color: '#B44D3B', fontFamily: fonts.bold, fontSize: 10 },
  checkoutHint: { alignItems: 'flex-start', backgroundColor: '#FFF6E2', borderColor: '#D2BD94', borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 7, marginTop: 13, padding: 11 },
  checkoutHintText: { color: '#6E6257', flex: 1, fontFamily: fonts.regular, fontSize: 11, lineHeight: 17 },
  receiptChallenge: { backgroundColor: '#FFF5E5', borderColor: '#D9B277', borderRadius: 11, borderWidth: 1.5, marginTop: 9, padding: 10 },
  receiptChallengeSolved: { backgroundColor: '#EDF6EF', borderColor: '#78A789' },
  receiptChallengeHeading: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  problemTag: { backgroundColor: '#B95B44', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3 },
  problemTagSolved: { backgroundColor: '#438061' },
  problemTagText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 7 },
  receiptChallengeTitle: { color: '#56493D', flex: 1, fontFamily: fonts.bold, fontSize: 11 },
  receiptDecisionRow: { flexDirection: 'row', gap: 7, marginTop: 9 },
  receiptDecisionButton: { alignItems: 'center', backgroundColor: '#EEE2CC', borderColor: '#C7AF8A', borderRadius: 8, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 4, height: 38, justifyContent: 'center' },
  receiptDecisionText: { color: '#6E665C', fontFamily: fonts.semibold, fontSize: 9 },
  receiptReportButton: { backgroundColor: '#B85B43', borderColor: '#974432' },
  receiptReportText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 9 },
  receiptTryAgainText: { color: '#AF4E3E', fontFamily: fonts.medium, fontSize: 9, lineHeight: 13, marginTop: 7 },
  receiptSolvedRow: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 8 },
  receiptSolvedText: { color: '#4F6D59', flex: 1, fontFamily: fonts.medium, fontSize: 10, lineHeight: 14 },
  paymentMethodRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  paymentMethodLabel: { color: '#6F675E', fontFamily: fonts.semibold, fontSize: 10 },
  paymentMethodOptions: { backgroundColor: '#EEE7DA', borderRadius: 10, flexDirection: 'row', gap: 3, padding: 3 },
  paymentMethodOption: { alignItems: 'center', borderRadius: 8, flexDirection: 'row', gap: 4, height: 30, justifyContent: 'center', minWidth: 62, paddingHorizontal: 8 },
  paymentMethodOptionSelected: { backgroundColor: '#4B7D62' },
  paymentMethodText: { color: '#766C60', fontFamily: fonts.semibold, fontSize: 9 },
  paymentMethodTextSelected: { color: '#FFFFFF' },
  checkoutActions: { flexDirection: 'row', gap: 9, marginTop: 10 },
  checkoutBackButton: { alignItems: 'center', backgroundColor: '#E0CEA9', borderColor: '#B3966B', borderRadius: 10, borderWidth: 1.5, height: 50, justifyContent: 'center', width: 108 },
  checkoutBackText: { color: '#5F6963', fontFamily: fonts.semibold, fontSize: 14 },
  checkoutCheckButton: { alignItems: 'center', backgroundColor: '#39795A', borderColor: '#285D43', borderRadius: 10, borderWidth: 2, flex: 1, flexDirection: 'row', gap: 6, height: 50, justifyContent: 'center' },
  checkoutCheckText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 15 },
  exitOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', backgroundColor: '#EAE4D8', justifyContent: 'center', overflow: 'hidden', zIndex: 90 },
  exitDoorStage: { alignItems: 'center', position: 'absolute', top: 52 },
  exitSign: { alignItems: 'center', backgroundColor: '#4B7D62', borderRadius: 8, flexDirection: 'row', gap: 5, paddingHorizontal: 12, paddingVertical: 6, zIndex: 2 },
  exitSignText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 11 },
  exitDoor: { backgroundColor: '#BBD4D4', borderColor: '#788F8B', borderRadius: 8, borderWidth: 3, flexDirection: 'row', height: 116, marginTop: -2, overflow: 'hidden', width: 126 },
  exitDoorGlass: { backgroundColor: 'rgba(235,250,248,0.42)', flex: 1 },
  exitDoorDivider: { backgroundColor: '#788F8B', height: '100%', left: '50%', marginLeft: -2, position: 'absolute', width: 4 },
  exitFloorPath: { backgroundColor: '#D7CDBC', height: 320, position: 'absolute', top: 164, transform: [{ perspective: 240 }, { rotateX: '56deg' }], width: 150 },
  exitPlayer: { alignItems: 'center', marginTop: 160, zIndex: 2 },
  exitPlayerHead: { backgroundColor: '#DDB28F', borderColor: '#715443', borderRadius: 17, borderWidth: 2, height: 34, width: 34 },
  exitPlayerBody: { alignItems: 'center', backgroundColor: '#E5A64A', borderColor: '#77583B', borderRadius: 9, borderWidth: 2, height: 52, justifyContent: 'center', marginTop: -2, width: 40 },
  exitPlayerBadge: { height: 25, width: 25 },
  exitPlayerShadow: { backgroundColor: 'rgba(55,65,57,0.22)', borderRadius: 13, height: 9, marginTop: 5, width: 42 },
  exitCaption: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 18, bottom: 42, flexDirection: 'row', gap: 7, minHeight: 42, paddingHorizontal: 15, position: 'absolute' },
  exitCaptionText: { color: '#496153', fontFamily: fonts.semibold, fontSize: 11 },
  resultOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', backgroundColor: 'rgba(26,32,28,0.64)', justifyContent: 'center', padding: 18, zIndex: 60 },
  resultCard: { alignItems: 'center', backgroundColor: '#F8EACB', borderColor: '#74543A', borderRadius: 18, borderWidth: 4, maxWidth: 420, padding: 22, width: '100%' },
  successIconStage: { alignItems: 'center', backgroundColor: '#3B8A65', borderRadius: 33, height: 66, justifyContent: 'center', overflow: 'hidden', width: 66 },
  successRing: { borderColor: 'rgba(255,255,255,0.35)', borderRadius: 25, borderWidth: 2, height: 50, position: 'absolute', width: 50 },
  retryIconStage: { alignItems: 'center', backgroundColor: '#F6E9D8', borderRadius: 31, height: 62, justifyContent: 'center', width: 62 },
  resultStamp: { alignItems: 'center', backgroundColor: '#B85641', borderColor: '#D98C72', borderRadius: 8, borderWidth: 2, flexDirection: 'row', gap: 5, marginTop: 14, paddingHorizontal: 10, paddingVertical: 6, transform: [{ rotate: '-2deg' }] },
  resultStampText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.8 },
  resultEyebrow: { color: '#448166', fontFamily: fonts.bold, fontSize: 11, marginTop: 12 },
  resultTitle: { color: '#252A27', fontFamily: fonts.laundryBold, fontSize: 23, letterSpacing: -0.6, lineHeight: 31, marginTop: 5, textAlign: 'center' },
  resultDescription: { color: '#7A7D79', fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, marginTop: 8, textAlign: 'center' },
  resultStats: { backgroundColor: '#FFF6E3', borderColor: '#D0B98D', borderRadius: 10, borderWidth: 1, flexDirection: 'row', marginTop: 18, paddingVertical: 13, width: '100%' },
  resultStat: { alignItems: 'center', flex: 1 },
  resultStatValue: { color: '#34433B', fontFamily: fonts.bold, fontSize: 14 },
  resultStatLabel: { color: '#8A8E8A', fontFamily: fonts.regular, fontSize: 9, marginTop: 4 },
  resultStatDivider: { backgroundColor: '#DDDFDB', height: 30, width: 1 },
  resultBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12, width: '100%' },
  resultBadge: { alignItems: 'center', backgroundColor: '#EEF5ED', borderColor: '#BFD3C3', borderRadius: 10, borderWidth: 1, flexBasis: '47%', flexDirection: 'row', flexGrow: 1, gap: 6, minHeight: 38, paddingHorizontal: 8, paddingVertical: 6 },
  resultBadgeIcon: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 8, height: 26, justifyContent: 'center', width: 26 },
  resultBadgeText: { color: '#42634F', flex: 1, fontFamily: fonts.bold, fontSize: 9 },
  feedbackList: { gap: 8, marginTop: 18, width: '100%' },
  feedbackRow: { alignItems: 'center', backgroundColor: '#F8F1E7', borderRadius: 13, flexDirection: 'row', padding: 10 },
  feedbackIcon: { alignItems: 'center', backgroundColor: '#FFF9F0', borderRadius: 10, height: 34, justifyContent: 'center', marginRight: 9, width: 34 },
  feedbackText: { color: '#665C52', flex: 1, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  resultPrimaryButton: { alignItems: 'center', backgroundColor: '#39795A', borderColor: '#285D43', borderRadius: 10, borderWidth: 2, height: 50, justifyContent: 'center', marginTop: 18, width: '100%' },
  resultPrimaryButtonText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 16 },
  notice: { alignItems: 'center', alignSelf: 'center', backgroundColor: 'rgba(37,74,52,0.95)', borderRadius: 18, bottom: 100, flexDirection: 'row', gap: 7, maxWidth: '90%', minHeight: 38, paddingHorizontal: 14, paddingVertical: 9, position: 'absolute', zIndex: 70 },
  noticeWarning: { backgroundColor: 'rgba(163,72,52,0.96)' },
  noticeInfo: { backgroundColor: 'rgba(54,75,91,0.96)' },
  noticeText: { color: '#FFFFFF', flexShrink: 1, fontFamily: fonts.semibold, fontSize: 11, lineHeight: 16 },
});
