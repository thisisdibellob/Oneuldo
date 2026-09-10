import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { PressScale } from '../components/PressScale';
import { getMarketProduct, MarketProduct } from '../game/scenarios';
import { fonts } from '../theme';

type CashierMode = 'practice' | 'challenge';
type CashierPhase = 'mode' | 'briefing' | 'scan' | 'receipt' | 'payment' | 'handoff' | 'result';
type TimedCashierPhase = Extract<CashierPhase, 'scan' | 'receipt' | 'payment'>;

type ShiftItem = {
  lineId: string;
  productId: string;
};

type ShiftCustomer = {
  id: string;
  name: string;
  request: string;
  items: ShiftItem[];
  paid: number;
  receiptIssue?: {
    duplicatedProductId: string;
  };
};

const PRACTICE_CUSTOMERS: ShiftCustomer[] = [
  {
    id: 'practice-1',
    name: '첫 손님',
    request: '상품을 하나씩 스캔하고 거스름돈을 정확히 건네 드려요.',
    items: [
      { lineId: 'practice-milk', productId: 'milk' },
      { lineId: 'practice-apple', productId: 'apple' },
    ],
    paid: 5000,
  },
];

const CHALLENGE_CUSTOMERS: ShiftCustomer[] = [
  {
    id: 'challenge-1',
    name: '점심 손님',
    request: '상품 세 개를 빠뜨리지 않고 계산해요.',
    items: [
      { lineId: 'challenge-eggs', productId: 'eggs' },
      { lineId: 'challenge-curry', productId: 'curry' },
      { lineId: 'challenge-water', productId: 'water' },
    ],
    paid: 10000,
  },
  {
    id: 'challenge-2',
    name: '마지막 손님',
    request: '영수증의 중복 계산도 확인해요.',
    items: [
      { lineId: 'challenge-juice', productId: 'juice' },
      { lineId: 'challenge-banana', productId: 'banana' },
    ],
    paid: 10000,
    receiptIssue: { duplicatedProductId: 'juice' },
  },
];

const CHALLENGE_STEP_SECONDS: Record<TimedCashierPhase, number> = {
  scan: 35,
  receipt: 25,
  payment: 25,
};

function isTimedPhase(phase: CashierPhase): phase is TimedCashierPhase {
  return phase === 'scan' || phase === 'receipt' || phase === 'payment';
}

const formatWon = (value: number) => `${value.toLocaleString('ko-KR')}원`;

function getCustomerTotal(customer: ShiftCustomer) {
  return customer.items.reduce(
    (sum, item) => sum + (getMarketProduct(item.productId)?.price ?? 0),
    0,
  );
}

function getChangeChoices(change: number) {
  const candidates = [change, Math.max(0, change - 500), change + 500];
  return [...new Set(candidates)].sort((a, b) => a - b);
}

type CashierSimulationScreenProps = {
  onExit: () => void;
};

export function CashierSimulationScreen({ onExit }: CashierSimulationScreenProps) {
  const { height: windowHeight } = useWindowDimensions();
  const [phase, setPhase] = useState<CashierPhase>('mode');
  const [mode, setMode] = useState<CashierMode>('practice');
  const [customerIndex, setCustomerIndex] = useState(0);
  const [scannedLineIds, setScannedLineIds] = useState<string[]>([]);
  const [hintLevel, setHintLevel] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [receiptCorrected, setReceiptCorrected] = useState(false);
  const [completedCustomers, setCompletedCustomers] = useState(0);
  const [stepTimeLeft, setStepTimeLeft] = useState<number | null>(null);
  const [stepTimedOut, setStepTimedOut] = useState(false);

  const compact = windowHeight < 700;

  const customers = mode === 'practice' ? PRACTICE_CUSTOMERS : CHALLENGE_CUSTOMERS;
  const customer = customers[customerIndex];
  const total = getCustomerTotal(customer);
  const scannedTotal = customer.items
    .filter((item) => scannedLineIds.includes(item.lineId))
    .reduce((sum, item) => sum + (getMarketProduct(item.productId)?.price ?? 0), 0);
  const allScanned = scannedLineIds.length === customer.items.length;
  const change = customer.paid - total;
  const changeChoices = useMemo(() => getChangeChoices(change), [change]);

  useEffect(() => {
    if (mode !== 'challenge' || !isTimedPhase(phase)) {
      setStepTimeLeft(null);
      setStepTimedOut(false);
      return;
    }

    setStepTimeLeft(CHALLENGE_STEP_SECONDS[phase]);
    setStepTimedOut(false);
  }, [customerIndex, mode, phase]);

  useEffect(() => {
    if (stepTimeLeft === null || stepTimeLeft <= 0 || stepTimedOut) return undefined;

    const timer = setInterval(() => {
      setStepTimeLeft((current) => current === null ? null : Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [stepTimeLeft === null, stepTimedOut]);

  useEffect(() => {
    if (mode !== 'challenge' || !isTimedPhase(phase) || stepTimeLeft !== 0 || stepTimedOut) return;
    setStepTimedOut(true);
    setFeedback('시간이 다 되었어요. 숨을 고른 뒤 이 단계부터 다시 이어가요.');
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
  }, [mode, phase, stepTimeLeft, stepTimedOut]);

  const resumeTimedStep = () => {
    if (!isTimedPhase(phase)) return;
    setStepTimeLeft(CHALLENGE_STEP_SECONDS[phase]);
    setStepTimedOut(false);
    setFeedback(null);
  };

  const startMode = (nextMode: CashierMode) => {
    setMode(nextMode);
    setCustomerIndex(0);
    setScannedLineIds([]);
    setHintLevel(nextMode === 'practice' ? 1 : 0);
    setFeedback(null);
    setReceiptCorrected(false);
    setCompletedCustomers(0);
    setPhase('briefing');
  };

  const scanItem = (lineId: string) => {
    if (scannedLineIds.includes(lineId)) return;
    setScannedLineIds((current) => [...current, lineId]);
    setFeedback('삑! 상품이 계산대에 등록됐어요.');
    void Haptics.selectionAsync().catch(() => undefined);
  };

  const continueAfterScan = () => {
    if (!allScanned) {
      setFeedback('아직 스캔하지 않은 상품이 있어요.');
      return;
    }
    setFeedback(null);
    setPhase(customer.receiptIssue ? 'receipt' : 'payment');
  };

  const reviewReceipt = (answer: 'correct' | 'duplicate') => {
    if (answer === 'duplicate') {
      setReceiptCorrected(true);
      setFeedback('맞아요. 같은 상품이 두 번 찍힌 줄을 취소했어요.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      return;
    }
    setFeedback('상품 수와 영수증 줄 수를 다시 비교해 보세요.');
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
  };

  const continueAfterReceipt = () => {
    if (!receiptCorrected) {
      setFeedback('중복 계산된 상품을 먼저 찾아보세요.');
      return;
    }
    setFeedback(null);
    setPhase('payment');
  };

  const chooseChange = (amount: number) => {
    if (amount !== change) {
      const difference = Math.abs(amount - change);
      setFeedback(
        amount > change
          ? `${formatWon(difference)}을 더 건네고 있어요. 받은 돈에서 결제 금액을 다시 빼 볼까요?`
          : `${formatWon(difference)}이 부족해요. 지폐와 동전을 다시 확인해 보세요.`,
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
      return;
    }

    const nextCompleted = completedCustomers + 1;
    setCompletedCustomers(nextCompleted);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setFeedback(null);
    setPhase('handoff');
  };

  const handReceiptToCustomer = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    if (customerIndex < customers.length - 1) {
      setCustomerIndex((current) => current + 1);
      setScannedLineIds([]);
      setReceiptCorrected(false);
      setFeedback('정확해요. 다음 손님을 맞이해 볼까요?');
      setPhase('briefing');
      return;
    }
    setFeedback(null);
    setPhase('result');
  };

  const restart = () => {
    startMode(mode);
  };

  const hintMessage =
    hintLevel === 0
      ? null
      : phase === 'scan'
        ? hintLevel === 1
          ? '상품을 잡아 위쪽 스캐너로 밀어 보세요.'
          : hintLevel === 2
            ? '아직 아래 진열대에 남아 있는 상품부터 확인해요.'
            : '상품 카드를 위로 크게 드래그하면 스캔돼요.'
        : phase === 'receipt'
          ? hintLevel < 3
            ? '손님이 올린 상품 수와 영수증 줄 수를 비교해요.'
            : '같은 상품이 두 줄인지 찾아보세요.'
          : phase === 'payment'
            ? hintLevel < 3
              ? '받은 돈에서 결제 금액을 빼면 거스름돈이에요.'
              : `${formatWon(customer.paid)} - ${formatWon(total)}를 계산해요.`
            : null;

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.wallGlow} />
      <CashierHeader
        compact={compact}
        current={phase === 'mode' ? 0 : Math.min(3, phase === 'scan' ? 1 : phase === 'receipt' || phase === 'payment' ? 2 : 3)}
        mode={phase === 'mode' ? null : mode}
        onExit={onExit}
      />

      {phase === 'mode' ? <ModeStage onSelect={startMode} /> : null}
      {phase === 'briefing' ? (
        <BriefingStage
          customer={customer}
          customerIndex={customerIndex}
          customerTotal={customers.length}
          mode={mode}
          onStart={() => {
            setFeedback(null);
            setPhase('scan');
          }}
        />
      ) : null}
      {phase === 'scan' ? (
        <ScanStage
          allScanned={allScanned}
          compact={compact}
          customer={customer}
          feedback={feedback}
          hint={hintMessage}
          onContinue={continueAfterScan}
          onHint={() => setHintLevel((level) => Math.min(3, level + 1))}
          onResume={resumeTimedStep}
          onScan={scanItem}
          scannedLineIds={scannedLineIds}
          scannedTotal={scannedTotal}
          timeLeft={stepTimeLeft}
          timedOut={stepTimedOut}
        />
      ) : null}
      {phase === 'receipt' ? (
        <ReceiptStage
          customer={customer}
          feedback={feedback}
          hint={hintMessage}
          onAnswer={reviewReceipt}
          onContinue={continueAfterReceipt}
          onHint={() => setHintLevel((level) => Math.min(3, level + 1))}
          onResume={resumeTimedStep}
          receiptCorrected={receiptCorrected}
          timeLeft={stepTimeLeft}
          timedOut={stepTimedOut}
          total={total}
        />
      ) : null}
      {phase === 'payment' ? (
        <PaymentStage
          choices={changeChoices}
          customer={customer}
          feedback={feedback}
          hint={hintMessage}
          onChoose={chooseChange}
          onHint={() => setHintLevel((level) => Math.min(3, level + 1))}
          onResume={resumeTimedStep}
          timeLeft={stepTimeLeft}
          timedOut={stepTimedOut}
          total={total}
        />
      ) : null}
      {phase === 'handoff' ? (
        <ReceiptHandoffStage
          customer={customer}
          customerNumber={customerIndex + 1}
          onHandoff={handReceiptToCustomer}
          receiptCorrected={receiptCorrected}
        />
      ) : null}
      {phase === 'result' ? (
        <ResultStage
          completedCustomers={completedCustomers}
          mode={mode}
          onExit={onExit}
          onRestart={restart}
        />
      ) : null}
    </View>
  );
}

function CashierHeader({
  compact,
  current,
  mode,
  onExit,
}: {
  compact: boolean;
  current: number;
  mode: CashierMode | null;
  onExit: () => void;
}) {
  return (
    <View style={[styles.header, compact && styles.headerCompact]}>
      <PressScale accessibilityLabel="계산 알바 나가기" accessibilityRole="button" onPress={onExit} style={styles.closeButton}>
        <Ionicons color="#355044" name="close" size={23} />
      </PressScale>
      <View style={styles.headerCopy}>
        <Text style={styles.headerEyebrow}>{mode ? (mode === 'practice' ? '연습 근무' : '도전 근무') : '하늘마트'}</Text>
        <Text style={styles.headerTitle}>오늘의 계산 알바</Text>
      </View>
      <View style={styles.stepDots}>
        {[1, 2, 3].map((step) => (
          <View key={step} style={[styles.stepDot, current >= step && styles.stepDotActive]} />
        ))}
      </View>
    </View>
  );
}

function ModeStage({ onSelect }: { onSelect: (mode: CashierMode) => void }) {
  return (
    <ScrollView
      contentContainerStyle={styles.modeStage}
      showsVerticalScrollIndicator={false}
      style={styles.stageScroll}
    >
      <View style={styles.storeIllustration}>
        <View style={styles.storeAwning}>
          {[0, 1, 2, 3, 4].map((stripe) => (
            <View key={stripe} style={[styles.awningStripe, stripe % 2 === 1 && styles.awningStripeLight]} />
          ))}
        </View>
        <View style={styles.counterPreview}>
          <Ionicons color="#FFF9E9" name="storefront" size={54} />
          <View style={styles.scannerPreview} />
        </View>
      </View>
      <Text style={styles.modeTitle}>어떤 근무로 시작할까요?</Text>
      <Text style={styles.modeDescription}>상품을 직접 스캔하고, 받은 돈과 거스름돈을 확인해요.</Text>
      <View style={styles.modeOptions}>
        <PressScale
          accessibilityLabel="천천히 연습, 그림 안내와 힌트를 보며 손님 한 명 계산하기"
          accessibilityRole="button"
          onPress={() => onSelect('practice')}
          style={[styles.modeCard, styles.practiceCard]}
        >
          <View style={[styles.modeIcon, styles.practiceIcon]}>
            <Ionicons color="#3E8568" name="sparkles" size={23} />
          </View>
          <View style={styles.modeCardCopy}>
            <Text style={styles.modeCardTitle}>천천히 연습</Text>
            <Text style={styles.modeCardBody}>그림 안내와 힌트를 보며 손님 한 명을 계산해요.</Text>
          </View>
          <Ionicons color="#4F7A68" name="chevron-forward" size={21} />
        </PressScale>
        <PressScale
          accessibilityLabel="도전 근무, 두 손님 계산과 영수증 오류 확인하기"
          accessibilityRole="button"
          onPress={() => onSelect('challenge')}
          style={[styles.modeCard, styles.challengeCard]}
        >
          <View style={[styles.modeIcon, styles.challengeIcon]}>
            <Ionicons color="#B46B39" name="receipt" size={23} />
          </View>
          <View style={styles.modeCardCopy}>
            <Text style={styles.modeCardTitle}>도전 근무</Text>
            <Text style={styles.modeCardBody}>두 손님을 계산하고 영수증 오류까지 찾아요.</Text>
          </View>
          <Ionicons color="#8C6247" name="chevron-forward" size={21} />
        </PressScale>
      </View>
    </ScrollView>
  );
}

function BriefingStage({
  customer,
  customerIndex,
  customerTotal,
  mode,
  onStart,
}: {
  customer: ShiftCustomer;
  customerIndex: number;
  customerTotal: number;
  mode: CashierMode;
  onStart: () => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.briefingStage}
      showsVerticalScrollIndicator={false}
      style={styles.stageScroll}
    >
      <View style={styles.customerPortrait}>
        <View style={styles.customerHair} />
        <View style={styles.customerHead}>
          <View style={styles.customerEyes}>
            <View style={styles.customerEye} />
            <View style={styles.customerEye} />
          </View>
          <View style={styles.customerSmile} />
        </View>
        <View style={styles.customerBody} />
      </View>
      <Text style={styles.briefingNumber}>{customerIndex + 1}/{customerTotal}번째 손님</Text>
      <Text style={styles.briefingTitle}>{customer.name}이 계산을 기다리고 있어요</Text>
      <Text style={styles.briefingBody}>{customer.request}</Text>
      <View style={styles.briefingItems}>
        {customer.items.map((item) => {
          const product = getMarketProduct(item.productId);
          if (!product) return null;
          return (
            <View key={item.lineId} style={styles.briefingItem}>
              <View style={[styles.smallProductIcon, { backgroundColor: product.packageColor }]}>
                <Ionicons color={product.color} name={product.icon} size={19} />
              </View>
              <Text style={styles.briefingItemName}>{product.name}</Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.briefingSupport}>
        {mode === 'practice' ? '막히면 도움 버튼을 눌러도 괜찮아요.' : '정확하게 확인한 뒤 다음 단계로 넘어가요.'}
      </Text>
      <PressScale accessibilityRole="button" onPress={onStart} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>계산 시작</Text>
        <Ionicons color="#FFFFFF" name="arrow-forward" size={20} />
      </PressScale>
    </ScrollView>
  );
}

function ScanStage({
  allScanned,
  compact,
  customer,
  feedback,
  hint,
  onContinue,
  onHint,
  onResume,
  onScan,
  scannedLineIds,
  scannedTotal,
  timeLeft,
  timedOut,
}: {
  allScanned: boolean;
  compact: boolean;
  customer: ShiftCustomer;
  feedback: string | null;
  hint: string | null;
  onContinue: () => void;
  onHint: () => void;
  onResume: () => void;
  onScan: (lineId: string) => void;
  scannedLineIds: string[];
  scannedTotal: number;
  timeLeft: number | null;
  timedOut: boolean;
}) {
  return (
    <View style={[styles.playStage, compact && styles.playStageCompact]}>
      <View style={styles.instructionRow}>
        <View style={styles.instructionCopy}>
          <Text style={styles.instructionEyebrow}>1 · 상품 스캔</Text>
          <Text numberOfLines={2} style={[styles.instructionTitle, compact && styles.instructionTitleCompact]}>상품을 위로 밀어 스캔해요</Text>
        </View>
        <View style={styles.instructionActions}>
          <StepTimer seconds={timeLeft} />
          <HelpButton onPress={onHint} />
        </View>
      </View>

      <View style={[styles.registerScene, compact && styles.registerSceneCompact]}>
        <View style={styles.priceDisplay}>
          <Text style={styles.priceDisplayLabel}>현재 합계</Text>
          <Text style={styles.priceDisplayValue}>{formatWon(scannedTotal)}</Text>
        </View>
        <View style={[styles.scanner, compact && styles.scannerCompact, allScanned && styles.scannerComplete]}>
          <Ionicons color={allScanned ? '#FFFFFF' : '#D8F0E2'} name={allScanned ? 'checkmark' : 'barcode-outline'} size={38} />
          <View style={styles.scannerBeam} />
        </View>
        <Text style={styles.scannerLabel}>{allScanned ? '모두 스캔했어요' : '여기로 상품을 옮겨요'}</Text>
      </View>

      <View style={[styles.productTray, compact && styles.productTrayCompact]}>
        {customer.items.map((item) => {
          const product = getMarketProduct(item.productId);
          if (!product) return null;
          const scanned = scannedLineIds.includes(item.lineId);
          return (
            <DraggableScanItem
              compact={compact}
              disabled={scanned || timedOut}
              key={item.lineId}
              onScan={() => onScan(item.lineId)}
              product={product}
            />
          );
        })}
      </View>

      {timedOut ? <TimeoutPrompt onResume={onResume} /> : null}
      {!timedOut ? <FeedbackBar feedback={feedback} hint={hint} /> : null}
      <PressScale
        accessibilityRole="button"
        disabled={!allScanned || timedOut}
        onPress={onContinue}
        style={[styles.primaryButton, compact && styles.primaryButtonCompact, (!allScanned || timedOut) && styles.disabledButton]}
      >
        <Text style={styles.primaryButtonText}>금액 확인하기</Text>
        <Ionicons color="#FFFFFF" name="chevron-forward" size={20} />
      </PressScale>
    </View>
  );
}

function DraggableScanItem({
  compact,
  disabled,
  onScan,
  product,
}: {
  compact: boolean;
  disabled: boolean;
  onScan: () => void;
  product: MarketProduct;
}) {
  const drag = useRef(new Animated.ValueXY()).current;
  const scale = useRef(new Animated.Value(1)).current;
  const activate = () => {
    if (!disabled) onScan();
  };
  const panResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => !disabled && Math.abs(gesture.dy) > 4,
      onPanResponderGrant: () => {
        Animated.spring(scale, { friction: 7, toValue: 1.06, useNativeDriver: false }).start();
      },
      onPanResponderMove: (_, gesture) => {
        drag.setValue({ x: gesture.dx * 0.65, y: Math.min(14, gesture.dy) });
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy < -64) {
          Animated.parallel([
            Animated.timing(drag, { duration: 180, toValue: { x: 0, y: -92 }, useNativeDriver: false }),
            Animated.timing(scale, { duration: 150, toValue: 0.86, useNativeDriver: false }),
          ]).start(({ finished }) => {
            if (finished) onScan();
            drag.setValue({ x: 0, y: 0 });
            scale.setValue(1);
          });
          return;
        }
        Animated.parallel([
          Animated.spring(drag, { friction: 7, toValue: { x: 0, y: 0 }, useNativeDriver: false }),
          Animated.spring(scale, { friction: 7, toValue: 1, useNativeDriver: false }),
        ]).start();
      },
      onPanResponderTerminate: () => {
        drag.setValue({ x: 0, y: 0 });
        scale.setValue(1);
      },
    }),
    [disabled, drag, onScan, scale],
  );

  return (
    <Animated.View
      accessibilityHint="위로 드래그하거나 두 번 탭하면 상품을 스캔합니다"
      accessibilityLabel={`${product.name}, ${formatWon(product.price)}`}
      accessibilityRole="button"
      accessibilityActions={[{ label: '상품 스캔', name: 'activate' }]}
      accessibilityState={{ disabled }}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'activate') activate();
      }}
      onAccessibilityTap={activate}
      style={[
        styles.productCard,
        compact && styles.productCardCompact,
        disabled && styles.productCardScanned,
        { transform: [...drag.getTranslateTransform(), { scale }] },
      ]}
      {...panResponder.panHandlers}
    >
      <View style={[styles.productPackage, compact && styles.productPackageCompact, { backgroundColor: product.packageColor }]}>
        <Ionicons color={product.color} name={product.icon} size={28} />
      </View>
      <Text numberOfLines={1} style={styles.productName}>{product.name}</Text>
      <Text style={styles.productPrice}>{disabled ? '스캔 완료' : formatWon(product.price)}</Text>
    </Animated.View>
  );
}

function ReceiptStage({
  customer,
  feedback,
  hint,
  onAnswer,
  onContinue,
  onHint,
  onResume,
  receiptCorrected,
  timeLeft,
  timedOut,
  total,
}: {
  customer: ShiftCustomer;
  feedback: string | null;
  hint: string | null;
  onAnswer: (answer: 'correct' | 'duplicate') => void;
  onContinue: () => void;
  onHint: () => void;
  onResume: () => void;
  receiptCorrected: boolean;
  timeLeft: number | null;
  timedOut: boolean;
  total: number;
}) {
  const duplicate = customer.receiptIssue
    ? getMarketProduct(customer.receiptIssue.duplicatedProductId)
    : null;
  const shownTotal = total + (receiptCorrected ? 0 : duplicate?.price ?? 0);
  return (
    <View style={styles.playStage}>
      <View style={styles.instructionRow}>
        <View style={styles.instructionCopy}>
          <Text style={styles.instructionEyebrow}>2 · 영수증 확인</Text>
          <Text style={styles.instructionTitle}>상품이 정확히 찍혔을까요?</Text>
        </View>
        <View style={styles.instructionActions}>
          <StepTimer seconds={timeLeft} />
          <HelpButton onPress={onHint} />
        </View>
      </View>
      <ScrollView
        contentContainerStyle={styles.receipt}
        showsVerticalScrollIndicator={false}
        style={styles.receiptScroll}
      >
        <Text style={styles.receiptStore}>하늘마트</Text>
        <Text style={styles.receiptCaption}>계산 중 영수증</Text>
        <View style={styles.receiptDivider} />
        {customer.items.map((item) => {
          const product = getMarketProduct(item.productId);
          if (!product) return null;
          return (
            <View key={item.lineId} style={styles.receiptLine}>
              <Text style={styles.receiptName}>{product.name}</Text>
              <Text style={styles.receiptPrice}>{formatWon(product.price)}</Text>
            </View>
          );
        })}
        {!receiptCorrected && duplicate ? (
          <View style={[styles.receiptLine, styles.receiptSuspiciousLine]}>
            <Text style={styles.receiptName}>{duplicate.name}</Text>
            <Text style={styles.receiptPrice}>{formatWon(duplicate.price)}</Text>
          </View>
        ) : null}
        <View style={styles.receiptDivider} />
        <View style={styles.receiptLine}>
          <Text style={styles.receiptTotalLabel}>합계</Text>
          <Text style={styles.receiptTotalValue}>{formatWon(shownTotal)}</Text>
        </View>
      </ScrollView>
      {!receiptCorrected ? (
        <View style={styles.answerRow}>
          <PressScale accessibilityRole="button" disabled={timedOut} onPress={() => onAnswer('correct')} style={[styles.answerButton, timedOut && styles.disabledButton]}>
            <Text style={styles.answerText}>금액이 맞아요</Text>
          </PressScale>
          <PressScale accessibilityRole="button" disabled={timedOut} onPress={() => onAnswer('duplicate')} style={[styles.answerButton, styles.answerButtonAccent, timedOut && styles.disabledButton]}>
            <Text style={[styles.answerText, styles.answerTextAccent]}>중복 계산됐어요</Text>
          </PressScale>
        </View>
      ) : null}
      {timedOut ? <TimeoutPrompt onResume={onResume} /> : null}
      {!timedOut ? <FeedbackBar feedback={feedback} hint={hint} /> : null}
      <PressScale
        accessibilityRole="button"
        disabled={!receiptCorrected || timedOut}
        onPress={onContinue}
        style={[styles.primaryButton, (!receiptCorrected || timedOut) && styles.disabledButton]}
      >
        <Text style={styles.primaryButtonText}>수정된 금액 받기</Text>
        <Ionicons color="#FFFFFF" name="chevron-forward" size={20} />
      </PressScale>
    </View>
  );
}

function PaymentStage({
  choices,
  customer,
  feedback,
  hint,
  onChoose,
  onHint,
  onResume,
  timeLeft,
  timedOut,
  total,
}: {
  choices: number[];
  customer: ShiftCustomer;
  feedback: string | null;
  hint: string | null;
  onChoose: (amount: number) => void;
  onHint: () => void;
  onResume: () => void;
  timeLeft: number | null;
  timedOut: boolean;
  total: number;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.playStageScrollContent}
      showsVerticalScrollIndicator={false}
      style={styles.playStageScroll}
    >
      <View style={styles.instructionRow}>
        <View style={styles.instructionCopy}>
          <Text style={styles.instructionEyebrow}>3 · 거스름돈</Text>
          <Text style={styles.instructionTitle}>얼마를 돌려드릴까요?</Text>
        </View>
        <View style={styles.instructionActions}>
          <StepTimer seconds={timeLeft} />
          <HelpButton onPress={onHint} />
        </View>
      </View>
      <View style={styles.paymentBoard}>
        <View style={styles.paymentSummary}>
          <View>
            <Text style={styles.paymentLabel}>결제 금액</Text>
            <Text style={styles.paymentValue}>{formatWon(total)}</Text>
          </View>
          <Ionicons color="#89A99A" name="remove" size={24} />
          <View>
            <Text style={styles.paymentLabel}>받은 돈</Text>
            <Text style={styles.paymentValue}>{formatWon(customer.paid)}</Text>
          </View>
        </View>
        <View style={styles.cashVisual}>
          <Ionicons color="#E8F7DF" name="cash-outline" size={48} />
          <Text style={styles.cashVisualText}>손님이 건넨 돈</Text>
        </View>
      </View>
      <View style={styles.changeGrid}>
        {choices.map((amount) => (
          <PressScale
            accessibilityLabel={`${formatWon(amount)} 거스름돈 건네기`}
            accessibilityRole="button"
            disabled={timedOut}
            key={amount}
            onPress={() => onChoose(amount)}
            style={[styles.changeButton, timedOut && styles.disabledButton]}
          >
            <View style={styles.coinStack}>
              <View style={styles.coinBack} />
              <View style={styles.coinFront} />
            </View>
            <Text style={styles.changeAmount}>{formatWon(amount)}</Text>
          </PressScale>
        ))}
      </View>
      {timedOut ? <TimeoutPrompt onResume={onResume} /> : null}
      {!timedOut ? <FeedbackBar feedback={feedback} hint={hint} /> : null}
    </ScrollView>
  );
}

function ReceiptHandoffStage({
  customer,
  customerNumber,
  onHandoff,
  receiptCorrected,
}: {
  customer: ShiftCustomer;
  customerNumber: number;
  onHandoff: () => void;
  receiptCorrected: boolean;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.handoffStage}
      showsVerticalScrollIndicator={false}
      style={styles.stageScroll}
    >
      <View style={styles.customerCompleteIcon}>
        <Ionicons color="#FFFFFF" name="checkmark" size={30} />
      </View>
      <Text style={styles.handoffEyebrow}>{customerNumber}번째 손님 계산 완료</Text>
      <Text style={styles.handoffTitle}>영수증을 손님께 건네요</Text>
      <Text style={styles.handoffBody}>
        상품과 거스름돈을 확인했어요. 마지막으로 영수증을 직접 전달해 주세요.
      </Text>
      <View style={styles.handoffScene}>
        <DraggableReceipt onHandoff={onHandoff} />
        <View style={styles.handoffArrow}>
          <Ionicons color="#7B9688" name="arrow-forward" size={28} />
          <Text style={styles.handoffArrowText}>오른쪽으로</Text>
        </View>
        <View style={styles.handoffCustomer}>
          <View style={styles.handoffCustomerHead} />
          <View style={styles.handoffCustomerBody} />
          <Text style={styles.handoffCustomerName}>{customer.name}</Text>
        </View>
      </View>
      <View style={styles.customerObservationRow}>
        <View style={styles.customerObservation}>
          <Ionicons color="#4F8269" name="barcode-outline" size={17} />
          <Text style={styles.customerObservationText}>누락 없이 스캔</Text>
        </View>
        <View style={styles.customerObservation}>
          <Ionicons color="#4F8269" name="cash-outline" size={17} />
          <Text style={styles.customerObservationText}>거스름돈 확인</Text>
        </View>
        {receiptCorrected ? (
          <View style={styles.customerObservation}>
            <Ionicons color="#4F8269" name="receipt-outline" size={17} />
            <Text style={styles.customerObservationText}>중복 수정</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.handoffHint}>영수증을 잡아 손님 쪽으로 밀어 보세요.</Text>
    </ScrollView>
  );
}

function DraggableReceipt({ onHandoff }: { onHandoff: () => void }) {
  const drag = useRef(new Animated.ValueXY()).current;
  const scale = useRef(new Animated.Value(1)).current;
  const delivered = useRef(false);
  const deliver = () => {
    if (delivered.current) return;
    delivered.current = true;
    onHandoff();
  };
  const panResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 4,
      onPanResponderGrant: () => {
        Animated.spring(scale, { friction: 7, toValue: 1.05, useNativeDriver: false }).start();
      },
      onPanResponderMove: (_, gesture) => {
        drag.setValue({ x: Math.max(-8, gesture.dx), y: gesture.dy * 0.25 });
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > 58) {
          Animated.parallel([
            Animated.timing(drag, { duration: 180, toValue: { x: 118, y: 0 }, useNativeDriver: false }),
            Animated.timing(scale, { duration: 160, toValue: 0.88, useNativeDriver: false }),
          ]).start(({ finished }) => {
            if (finished) deliver();
          });
          return;
        }
        Animated.parallel([
          Animated.spring(drag, { friction: 7, toValue: { x: 0, y: 0 }, useNativeDriver: false }),
          Animated.spring(scale, { friction: 7, toValue: 1, useNativeDriver: false }),
        ]).start();
      },
      onPanResponderTerminate: () => {
        drag.setValue({ x: 0, y: 0 });
        scale.setValue(1);
      },
    }),
    [drag, scale],
  );

  return (
    <Animated.View
      accessibilityHint="오른쪽으로 드래그하거나 두 번 탭해 손님에게 전달합니다"
      accessibilityLabel="영수증 손님에게 전달하기"
      accessibilityRole="button"
      onAccessibilityTap={deliver}
      style={[styles.draggableReceipt, { transform: [...drag.getTranslateTransform(), { scale }] }]}
      {...panResponder.panHandlers}
    >
      <Ionicons color="#4E6E5E" name="receipt-outline" size={34} />
      <Text style={styles.draggableReceiptTitle}>하늘마트</Text>
      <View style={styles.receiptMiniLine} />
      <View style={styles.receiptMiniLine} />
      <View style={[styles.receiptMiniLine, styles.receiptMiniLineShort]} />
    </Animated.View>
  );
}

function ResultStage({
  completedCustomers,
  mode,
  onExit,
  onRestart,
}: {
  completedCustomers: number;
  mode: CashierMode;
  onExit: () => void;
  onRestart: () => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.resultStage}
      showsVerticalScrollIndicator={false}
      style={styles.stageScroll}
    >
      <View style={styles.resultBurst}>
        <View style={styles.resultSeal}>
          <Ionicons color="#FFFFFF" name="checkmark" size={31} />
          <Text style={styles.resultSealText}>업무 완료</Text>
        </View>
      </View>
      <Text style={styles.resultEyebrow}>오늘의 근무 완료</Text>
      <Text style={styles.resultTitle}>상품과 금액을 정확하게 확인했어요!</Text>
      <Text style={styles.resultBody}>
        {completedCustomers}명의 상품과 금액을 확인하고 손님에게 거스름돈을 건넸어요.
      </Text>
      <View style={styles.badgeRow}>
        <ResultBadge icon="barcode-outline" label="상품 스캔" />
        <ResultBadge icon="calculator-outline" label="금액 확인" />
        <ResultBadge icon={mode === 'challenge' ? 'receipt-outline' : 'cash-outline'} label={mode === 'challenge' ? '오류 수정' : '거스름돈'} />
      </View>
      <PressScale accessibilityRole="button" onPress={onExit} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>마을로 돌아가기</Text>
        <Ionicons color="#FFFFFF" name="map-outline" size={20} />
      </PressScale>
      <Pressable accessibilityRole="button" onPress={onRestart} style={styles.restartButton}>
        <Ionicons color="#65766D" name="refresh" size={18} />
        <Text style={styles.restartText}>다시 근무하기</Text>
      </Pressable>
    </ScrollView>
  );
}

function ResultBadge({ icon, label }: { icon: 'barcode-outline' | 'calculator-outline' | 'receipt-outline' | 'cash-outline'; label: string }) {
  return (
    <View style={styles.resultBadge}>
      <View style={styles.resultBadgeIcon}>
        <Ionicons color="#438466" name={icon} size={21} />
      </View>
      <Text style={styles.resultBadgeText}>{label}</Text>
    </View>
  );
}

function HelpButton({ onPress }: { onPress: () => void }) {
  return (
    <PressScale accessibilityLabel="도움 보기" accessibilityRole="button" onPress={onPress} style={styles.helpButton}>
      <Ionicons color="#4E7564" name="bulb-outline" size={20} />
      <Text style={styles.helpText}>도움</Text>
    </PressScale>
  );
}

function StepTimer({ seconds }: { seconds: number | null }) {
  if (seconds === null) return null;
  const urgent = seconds <= 10;
  return (
    <View
      accessibilityLabel={`${seconds}초 남음`}
      style={[styles.timerPill, urgent && styles.timerPillUrgent]}
    >
      <Ionicons color={urgent ? '#A6533D' : '#4E7564'} name="time-outline" size={17} />
      <Text style={[styles.timerText, urgent && styles.timerTextUrgent]}>{seconds}</Text>
    </View>
  );
}

function TimeoutPrompt({ onResume }: { onResume: () => void }) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.timeoutPrompt}>
      <Text style={styles.timeoutText}>이 단계의 시간이 끝났어요.</Text>
      <PressScale
        accessibilityLabel="시간을 다시 받고 현재 단계 이어서 하기"
        accessibilityRole="button"
        onPress={onResume}
        style={styles.timeoutButton}
      >
        <Ionicons color="#FFFFFF" name="refresh" size={17} />
        <Text style={styles.timeoutButtonText}>다시 이어서 하기</Text>
      </PressScale>
    </View>
  );
}

function FeedbackBar({ feedback, hint }: { feedback: string | null; hint: string | null }) {
  if (!feedback && !hint) return <View style={styles.feedbackSpacer} />;
  const isFeedback = Boolean(feedback);
  return (
    <View accessibilityLiveRegion="polite" style={[styles.feedbackBar, isFeedback && styles.feedbackBarActive]}>
      <Ionicons color={isFeedback ? '#B86540' : '#4E8069'} name={isFeedback ? 'information-circle' : 'bulb-outline'} size={19} />
      <Text style={[styles.feedbackText, isFeedback && styles.feedbackTextActive]}>{feedback ?? hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#F4EEDC', flex: 1, overflow: 'hidden' },
  wallGlow: { backgroundColor: 'rgba(255,255,255,0.38)', borderRadius: 280, height: 420, left: -90, position: 'absolute', top: 90, width: 560 },
  header: { alignItems: 'center', flexDirection: 'row', minHeight: 82, paddingHorizontal: 18, paddingTop: 10, zIndex: 3 },
  headerCompact: { minHeight: 70, paddingTop: 4 },
  closeButton: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.76)', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  headerCopy: { flex: 1, marginLeft: 12 },
  headerEyebrow: { color: '#7A826F', fontFamily: fonts.semibold, fontSize: 11 },
  headerTitle: { color: '#263B31', fontFamily: fonts.laundryBold, fontSize: 20, marginTop: 1 },
  stepDots: { flexDirection: 'row', gap: 5 },
  stepDot: { backgroundColor: '#D5CDB9', borderRadius: 4, height: 7, width: 16 },
  stepDotActive: { backgroundColor: '#4B8A6D', width: 23 },
  stageScroll: { flex: 1, width: '100%' },
  modeStage: { alignItems: 'center', flexGrow: 1, paddingBottom: 22, paddingHorizontal: 20 },
  storeIllustration: { alignItems: 'center', height: 138, justifyContent: 'flex-end', marginTop: 4, width: 220 },
  storeAwning: { borderRadius: 14, flexDirection: 'row', height: 42, overflow: 'hidden', width: 190, zIndex: 2 },
  awningStripe: { backgroundColor: '#D56D50', flex: 1 },
  awningStripeLight: { backgroundColor: '#FFF1D3' },
  counterPreview: { alignItems: 'center', backgroundColor: '#5D8C75', borderRadius: 24, height: 90, justifyContent: 'center', marginTop: -8, width: 220 },
  scannerPreview: { backgroundColor: '#253A31', borderRadius: 4, height: 7, marginTop: 4, width: 46 },
  modeTitle: { color: '#26372F', fontFamily: fonts.laundryBold, fontSize: 25, marginTop: 18, textAlign: 'center' },
  modeDescription: { color: '#70796F', fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, marginTop: 7, maxWidth: 340, textAlign: 'center' },
  modeOptions: { gap: 11, marginTop: 22, maxWidth: 520, width: '100%' },
  modeCard: { alignItems: 'center', borderRadius: 24, flexDirection: 'row', minHeight: 82, paddingHorizontal: 15, paddingVertical: 13 },
  practiceCard: { backgroundColor: '#E5F2E9' },
  challengeCard: { backgroundColor: '#F7E7D3' },
  modeIcon: { alignItems: 'center', borderRadius: 23, height: 46, justifyContent: 'center', width: 46 },
  practiceIcon: { backgroundColor: '#CDE6D5' },
  challengeIcon: { backgroundColor: '#F0D3B1' },
  modeCardCopy: { flex: 1, marginHorizontal: 12 },
  modeCardTitle: { color: '#2C4438', fontFamily: fonts.laundryBold, fontSize: 17 },
  modeCardBody: { color: '#68776E', fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, marginTop: 3 },
  briefingStage: { alignItems: 'center', flexGrow: 1, paddingBottom: 24, paddingHorizontal: 22 },
  customerPortrait: { alignItems: 'center', height: 130, justifyContent: 'flex-end', marginTop: 4, width: 120 },
  customerHair: { backgroundColor: '#5A4B43', borderRadius: 36, height: 58, position: 'absolute', top: 9, width: 72 },
  customerHead: { alignItems: 'center', backgroundColor: '#F1C9A8', borderRadius: 31, height: 62, justifyContent: 'center', position: 'absolute', top: 20, width: 62, zIndex: 2 },
  customerEyes: { flexDirection: 'row', gap: 17, marginTop: 2 },
  customerEye: { backgroundColor: '#4F4038', borderRadius: 3, height: 6, width: 6 },
  customerSmile: { borderBottomColor: '#A45D54', borderBottomWidth: 2, borderRadius: 5, height: 7, marginTop: 8, width: 12 },
  customerBody: { backgroundColor: '#7897A0', borderTopLeftRadius: 30, borderTopRightRadius: 30, height: 55, width: 100 },
  briefingNumber: { color: '#738177', fontFamily: fonts.semibold, fontSize: 11, marginTop: 10 },
  briefingTitle: { color: '#273A31', fontFamily: fonts.laundryBold, fontSize: 22, marginTop: 4, textAlign: 'center' },
  briefingBody: { color: '#6E786F', fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, marginTop: 7, textAlign: 'center' },
  briefingItems: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 18 },
  briefingItem: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.72)', borderRadius: 17, flexDirection: 'row', paddingHorizontal: 9, paddingVertical: 7 },
  smallProductIcon: { alignItems: 'center', borderRadius: 13, height: 26, justifyContent: 'center', width: 26 },
  briefingItemName: { color: '#43554B', fontFamily: fonts.semibold, fontSize: 12, marginLeft: 6 },
  briefingSupport: { color: '#778177', fontFamily: fonts.regular, fontSize: 12, marginTop: 18, textAlign: 'center' },
  primaryButton: { alignItems: 'center', alignSelf: 'center', backgroundColor: '#3E8566', borderRadius: 23, flexDirection: 'row', gap: 8, height: 52, justifyContent: 'center', marginTop: 18, maxWidth: 360, paddingHorizontal: 27, width: '100%' },
  primaryButtonText: { color: '#FFFFFF', fontFamily: fonts.cafe24Ssurround, fontSize: 16 },
  disabledButton: { opacity: 0.32 },
  playStage: { alignSelf: 'center', flex: 1, maxWidth: 720, paddingBottom: 20, paddingHorizontal: 18, width: '100%' },
  playStageCompact: { paddingBottom: 9 },
  playStageScroll: { flex: 1, width: '100%' },
  playStageScrollContent: { alignSelf: 'center', flexGrow: 1, maxWidth: 720, paddingBottom: 20, paddingHorizontal: 18, width: '100%' },
  instructionRow: { alignItems: 'center', flexDirection: 'row', marginTop: 4 },
  instructionCopy: { flex: 1 },
  instructionActions: { alignItems: 'center', flexDirection: 'row', gap: 7, marginLeft: 8 },
  instructionEyebrow: { color: '#65806F', fontFamily: fonts.semibold, fontSize: 11 },
  instructionTitle: { color: '#253A31', fontFamily: fonts.laundryBold, fontSize: 21, marginTop: 2 },
  instructionTitleCompact: { fontSize: 18, lineHeight: 21 },
  helpButton: { alignItems: 'center', backgroundColor: '#E3ECE3', borderRadius: 18, flexDirection: 'row', gap: 4, height: 38, justifyContent: 'center', paddingHorizontal: 12 },
  helpText: { color: '#4E7564', fontFamily: fonts.semibold, fontSize: 12 },
  registerScene: { alignItems: 'center', backgroundColor: '#A57C56', borderRadius: 28, height: 190, justifyContent: 'center', marginTop: 16, maxWidth: 620, overflow: 'hidden', width: '100%' },
  registerSceneCompact: { alignSelf: 'center', borderRadius: 23, height: 150, marginTop: 8 },
  priceDisplay: { alignItems: 'flex-end', backgroundColor: '#2C3D35', borderRadius: 13, minWidth: 150, paddingHorizontal: 15, paddingVertical: 9, position: 'absolute', right: 17, top: 14 },
  priceDisplayLabel: { color: '#BFD7C7', fontFamily: fonts.semibold, fontSize: 9 },
  priceDisplayValue: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 19, marginTop: 1 },
  scanner: { alignItems: 'center', backgroundColor: '#355D4D', borderRadius: 23, height: 88, justifyContent: 'center', marginTop: 14, overflow: 'hidden', width: 132 },
  scannerCompact: { height: 70, marginTop: 17, width: 116 },
  scannerComplete: { backgroundColor: '#4A9A73' },
  scannerBeam: { backgroundColor: '#EE7970', borderRadius: 2, height: 3, marginTop: 7, width: 76 },
  scannerLabel: { color: '#FFF7E8', fontFamily: fonts.semibold, fontSize: 12, marginTop: 8 },
  productTray: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: 13, minHeight: 108 },
  productTrayCompact: { marginTop: 8, minHeight: 88 },
  productCard: { alignItems: 'center', backgroundColor: '#FFFDF7', borderRadius: 19, elevation: 3, height: 103, justifyContent: 'center', maxWidth: 116, paddingHorizontal: 8, shadowColor: '#5C4936', shadowOffset: { height: 5, width: 0 }, shadowOpacity: 0.12, shadowRadius: 8, width: '30%' },
  productCardCompact: { borderRadius: 16, height: 84 },
  productCardScanned: { opacity: 0.18 },
  productPackage: { alignItems: 'center', borderRadius: 15, height: 42, justifyContent: 'center', width: 48 },
  productPackageCompact: { height: 34, width: 41 },
  productName: { color: '#3C4B43', fontFamily: fonts.semibold, fontSize: 11, marginTop: 6, maxWidth: '100%' },
  productPrice: { color: '#859087', fontFamily: fonts.regular, fontSize: 9, marginTop: 2 },
  feedbackSpacer: { height: 49 },
  feedbackBar: { alignItems: 'center', alignSelf: 'center', backgroundColor: '#E5EFE6', borderRadius: 18, flexDirection: 'row', gap: 7, marginTop: 10, minHeight: 39, paddingHorizontal: 12, paddingVertical: 9, width: '100%' },
  feedbackBarActive: { backgroundColor: '#F7E4D9' },
  feedbackText: { color: '#4E6F5F', flex: 1, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  feedbackTextActive: { color: '#845743' },
  receiptScroll: { alignSelf: 'center', flex: 1, marginTop: 12, maxWidth: 370, width: '90%' },
  receipt: { backgroundColor: '#FFFEF7', borderRadius: 4, padding: 20 },
  receiptStore: { color: '#33473E', fontFamily: fonts.laundryBold, fontSize: 21, textAlign: 'center' },
  receiptCaption: { color: '#8B918C', fontFamily: fonts.regular, fontSize: 10, marginTop: 2, textAlign: 'center' },
  receiptDivider: { backgroundColor: '#DAD8CF', height: 1, marginVertical: 12 },
  receiptLine: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 26 },
  receiptSuspiciousLine: { backgroundColor: '#FFF0E5', borderRadius: 7, marginHorizontal: -6, paddingHorizontal: 6 },
  receiptName: { color: '#505952', fontFamily: fonts.regular, fontSize: 12 },
  receiptPrice: { color: '#505952', fontFamily: fonts.semibold, fontSize: 12 },
  receiptTotalLabel: { color: '#2D4037', fontFamily: fonts.bold, fontSize: 14 },
  receiptTotalValue: { color: '#2D4037', fontFamily: fonts.bold, fontSize: 16 },
  answerRow: { flexDirection: 'row', gap: 9, marginTop: 12 },
  answerButton: { alignItems: 'center', backgroundColor: '#E8E6DE', borderRadius: 18, flex: 1, height: 48, justifyContent: 'center', paddingHorizontal: 8 },
  answerButtonAccent: { backgroundColor: '#E2F0E6' },
  answerText: { color: '#687168', fontFamily: fonts.semibold, fontSize: 12, textAlign: 'center' },
  answerTextAccent: { color: '#3F765E' },
  paymentBoard: { backgroundColor: '#FFF9EB', borderRadius: 28, marginTop: 18, padding: 18 },
  paymentSummary: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-around' },
  paymentLabel: { color: '#7C857D', fontFamily: fonts.regular, fontSize: 11, textAlign: 'center' },
  paymentValue: { color: '#2C4037', fontFamily: fonts.bold, fontSize: 21, marginTop: 3, textAlign: 'center' },
  cashVisual: { alignItems: 'center', alignSelf: 'center', backgroundColor: '#5C9775', borderRadius: 19, marginTop: 18, paddingHorizontal: 25, paddingVertical: 13 },
  cashVisualText: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 10, marginTop: 2 },
  changeGrid: { flexDirection: 'row', gap: 9, justifyContent: 'center', marginTop: 17 },
  changeButton: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.78)', borderRadius: 21, flex: 1, height: 96, justifyContent: 'center', maxWidth: 170 },
  coinStack: { height: 30, width: 41 },
  coinBack: { backgroundColor: '#E6B84D', borderRadius: 15, height: 30, left: 0, position: 'absolute', top: 0, width: 30 },
  coinFront: { backgroundColor: '#F2CD68', borderRadius: 15, height: 30, position: 'absolute', right: 0, top: 0, width: 30 },
  changeAmount: { color: '#4B574F', fontFamily: fonts.bold, fontSize: 13, marginTop: 8 },
  handoffStage: { alignItems: 'center', flexGrow: 1, justifyContent: 'center', paddingBottom: 24, paddingHorizontal: 20 },
  customerCompleteIcon: { alignItems: 'center', backgroundColor: '#4B9872', borderRadius: 27, height: 54, justifyContent: 'center', width: 54 },
  handoffEyebrow: { color: '#5C816C', fontFamily: fonts.semibold, fontSize: 12, marginTop: 13 },
  handoffTitle: { color: '#263B31', fontFamily: fonts.laundryBold, fontSize: 24, marginTop: 4, textAlign: 'center' },
  handoffBody: { color: '#6E7870', fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, marginTop: 7, maxWidth: 380, textAlign: 'center' },
  handoffScene: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.62)', borderRadius: 26, flexDirection: 'row', justifyContent: 'center', marginTop: 18, minHeight: 170, paddingHorizontal: 20, width: '100%' },
  draggableReceipt: { alignItems: 'center', backgroundColor: '#FFFDF4', borderRadius: 8, elevation: 3, height: 118, justifyContent: 'center', paddingHorizontal: 12, shadowColor: '#5E5141', shadowOffset: { height: 5, width: 0 }, shadowOpacity: 0.13, shadowRadius: 8, width: 88, zIndex: 2 },
  draggableReceiptTitle: { color: '#4E6257', fontFamily: fonts.bold, fontSize: 10, marginBottom: 6, marginTop: 3 },
  receiptMiniLine: { backgroundColor: '#D9D8CF', borderRadius: 2, height: 3, marginTop: 5, width: 51 },
  receiptMiniLineShort: { width: 34 },
  handoffArrow: { alignItems: 'center', marginHorizontal: 17 },
  handoffArrowText: { color: '#7B887F', fontFamily: fonts.semibold, fontSize: 9, marginTop: 3 },
  handoffCustomer: { alignItems: 'center', height: 125, justifyContent: 'flex-end', width: 78 },
  handoffCustomerHead: { backgroundColor: '#EFC5A2', borderRadius: 23, height: 46, position: 'absolute', top: 7, width: 46, zIndex: 2 },
  handoffCustomerBody: { backgroundColor: '#7897A0', borderTopLeftRadius: 25, borderTopRightRadius: 25, height: 66, width: 70 },
  handoffCustomerName: { backgroundColor: '#FFFFFF', borderRadius: 10, bottom: 0, color: '#55625A', fontFamily: fonts.semibold, fontSize: 9, paddingHorizontal: 7, paddingVertical: 3, position: 'absolute' },
  customerObservationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, justifyContent: 'center', marginTop: 15 },
  customerObservation: { alignItems: 'center', backgroundColor: '#E6F0E6', borderRadius: 15, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 7 },
  customerObservationText: { color: '#4D695A', fontFamily: fonts.semibold, fontSize: 10 },
  handoffHint: { color: '#788279', fontFamily: fonts.regular, fontSize: 11, marginTop: 13, textAlign: 'center' },
  resultStage: { alignItems: 'center', flexGrow: 1, justifyContent: 'center', paddingBottom: 24, paddingHorizontal: 22 },
  resultBurst: { alignItems: 'center', backgroundColor: '#DDEEDB', borderRadius: 58, height: 116, justifyContent: 'center', width: 116 },
  resultSeal: { alignItems: 'center', backgroundColor: '#4B9872', borderRadius: 47, height: 94, justifyContent: 'center', shadowColor: '#355A48', shadowOffset: { height: 8, width: 0 }, shadowOpacity: 0.22, shadowRadius: 12, width: 94 },
  resultSealText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 10, marginTop: 1 },
  resultEyebrow: { color: '#5C816C', fontFamily: fonts.semibold, fontSize: 12, marginTop: 18 },
  resultTitle: { color: '#263B31', fontFamily: fonts.laundryBold, fontSize: 25, marginTop: 5, textAlign: 'center' },
  resultBody: { color: '#6E7870', fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, marginTop: 8, maxWidth: 390, textAlign: 'center' },
  badgeRow: { flexDirection: 'row', gap: 9, marginTop: 22 },
  resultBadge: { alignItems: 'center', backgroundColor: '#EBF3E9', borderRadius: 18, minWidth: 86, paddingHorizontal: 10, paddingVertical: 11 },
  resultBadgeIcon: { alignItems: 'center', backgroundColor: '#D4E9D8', borderRadius: 16, height: 32, justifyContent: 'center', width: 32 },
  resultBadgeText: { color: '#4B6758', fontFamily: fonts.semibold, fontSize: 10, marginTop: 5 },
  restartButton: { alignItems: 'center', flexDirection: 'row', gap: 5, justifyContent: 'center', marginTop: 12, padding: 8 },
  restartText: { color: '#65766D', fontFamily: fonts.semibold, fontSize: 13 },
  timerPill: { alignItems: 'center', backgroundColor: '#E3ECE3', borderRadius: 17, flexDirection: 'row', gap: 3, height: 34, justifyContent: 'center', minWidth: 50, paddingHorizontal: 8 },
  timerPillUrgent: { backgroundColor: '#F6DFD5' },
  timerText: { color: '#4E7564', fontFamily: fonts.bold, fontSize: 12 },
  timerTextUrgent: { color: '#A6533D' },
  timeoutPrompt: { alignItems: 'center', alignSelf: 'center', backgroundColor: '#F5E4D8', borderRadius: 18, flexDirection: 'row', gap: 10, justifyContent: 'space-between', marginTop: 9, minHeight: 48, paddingHorizontal: 12, paddingVertical: 7, width: '100%' },
  timeoutText: { color: '#765847', flex: 1, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16 },
  timeoutButton: { alignItems: 'center', backgroundColor: '#B86E4A', borderRadius: 15, flexDirection: 'row', gap: 4, minHeight: 34, paddingHorizontal: 10 },
  timeoutButtonText: { color: '#FFFFFF', fontFamily: fonts.semibold, fontSize: 10 },
  primaryButtonCompact: { height: 47, marginTop: 8 },
});
