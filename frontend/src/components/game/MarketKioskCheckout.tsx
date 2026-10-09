import { Ionicons } from '@expo/vector-icons';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Image, PanResponder, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent, type PointerEvent as ReactNativePointerEvent } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { PressScale } from '../PressScale';
import { getMarketProduct, getMarketCartTotal, type MarketCart, type MarketProduct } from '../../game/scenarios';
import { getMarketProductImage } from '../../game/marketProductImages';
import { useMarketReducedMotion } from './MarketPanelTransition';
import { fonts } from '../../theme';

type Bounds = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
export type MarketKioskCheckoutProps = {
  cart: MarketCart;
  kioskLabel?: string;
  onConfirm: (scannedCart: MarketCart) => void;
  onCancel: () => void;
};
const won = (amount: number) => `${amount.toLocaleString('ko-KR')}원`;

/** A checkout only checks its scans against the physical basket, never the shopping assignment. */
export function MarketKioskCheckout({ cart, kioskLabel = '셀프 계산대', onConfirm, onCancel }: MarketKioskCheckoutProps) {
  const [scanned, setScanned] = useState<MarketCart>({});
  const [stage, setStage] = useState<'scan' | 'review'>('scan');
  const [message, setMessage] = useState('상품 그림을 끌어오세요.');
  const [dragged, setDragged] = useState<MarketProduct | null>(null);
  const [overScanner, setOverScanner] = useState(false);
  const scannerRef = useRef<View>(null);
  const rootRef = useRef<View>(null);
  const scannerBounds = useRef<Bounds>({ x: 0, y: 0, width: 0, height: 0 });
  const origin = useRef<Point>({ x: 0, y: 0 });
  const ghost = useRef(new Animated.ValueXY()).current;
  const entrance = useRef(new Animated.Value(0)).current;
  const reducedMotion = useMarketReducedMotion();
  const insets = useContext(SafeAreaInsetsContext);
  const window = useWindowDimensions();
  const [layoutHeight, setLayoutHeight] = useState<number | null>(null);
  const top = Math.max(12, insets?.top ?? 0), bottom = Math.max(12, insets?.bottom ?? 0);
  const usableHeight = Math.max(0, (layoutHeight ?? window.height) - top - bottom);
  const compact = usableHeight < 560;
  const deckHeight = compact ? Math.min(270, Math.max(176, usableHeight - 188)) : 320;
  const submitting = useRef(false);
  const current = useRef({ cart, scanned, stage });
  current.current = { cart, scanned, stage };
  const entries = Object.entries(cart).filter(([, count]) => count > 0);
  const count = entries.reduce((sum, [, quantity]) => sum + quantity, 0);
  const scannedCount = Object.values(scanned).reduce((sum, quantity) => sum + quantity, 0);
  const complete = entries.every(([id, quantity]) => scanned[id] === quantity)
    && Object.entries(scanned).every(([id, quantity]) => quantity === (cart[id] ?? 0));

  const measure = useCallback(() => {
    scannerRef.current?.measureInWindow((x, y, width, height) => { scannerBounds.current = { x, y, width, height }; });
    rootRef.current?.measureInWindow((x, y) => { origin.current = { x, y }; });
  }, []);
  useEffect(() => {
    if (reducedMotion) { entrance.setValue(1); measure(); return; }
    const animation = Animated.timing(entrance, { toValue: 1, duration: 200, useNativeDriver: true });
    animation.start(({ finished }) => { if (finished) measure(); });
    return () => animation.stop();
  }, [entrance, reducedMotion, measure]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stage === 'review') setStage('scan'); else onCancel();
      return true;
    });
    return () => subscription.remove();
  }, [onCancel, stage]);
  const scan = useCallback((product: MarketProduct) => {
    if (current.current.stage !== 'scan') return;
    if ((current.current.scanned[product.id] ?? 0) >= (current.current.cart[product.id] ?? 0)) return;
    const next = { ...current.current.scanned, [product.id]: (current.current.scanned[product.id] ?? 0) + 1 };
    current.current.scanned = next;
    setScanned(next);
    setMessage(`${product.name} 한 개를 스캔했어요.`);
  }, []);
  const withinScanner = (point: Point) => {
    const box = scannerBounds.current;
    return box.width > 0 && box.height > 0 && point.x >= box.x && point.x <= box.x + box.width
      && point.y >= box.y && point.y <= box.y + box.height;
  };
  const dragStart = (product: MarketProduct, point: Point) => {
    measure();
    setDragged(product);
    ghost.setValue({ x: point.x - origin.current.x - 35, y: point.y - origin.current.y - 35 });
  };
  const dragMove = (point: Point) => {
    ghost.setValue({ x: point.x - origin.current.x - 35, y: point.y - origin.current.y - 35 });
    setOverScanner(withinScanner(point));
  };
  const dragEnd = (product: MarketProduct, point: Point, cancelled = false) => {
    if (!cancelled && withinScanner(point)) scan(product);
    setDragged(null); setOverScanner(false);
  };
  const remove = (id: string) => {
    const next = { ...current.current.scanned };
    if (next[id] > 1) next[id] -= 1; else delete next[id];
    current.current.scanned = next; setScanned(next);
    setStage('scan'); setMessage('취소한 상품은 다시 스캔할 수 있어요.');
  };
  return <View ref={rootRef} onLayout={event => { setLayoutHeight(event.nativeEvent.layout.height); measure(); }}
    style={[s.overlay, { paddingTop: top, paddingBottom: bottom }]} accessibilityViewIsModal testID="market-kiosk-checkout">
    <Animated.View testID="kiosk-machine" style={[s.machine, { height: Math.min(720, usableHeight), opacity: entrance,
      transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [reducedMotion ? 0 : 14, 0] }) }] }]}>
      <View testID="kiosk-monitor" style={s.monitor}>
      <View style={s.screen}>
        <View style={[s.header, compact && s.headerCompact]}>
          <View style={s.headingCopy}><Text style={s.storeName}>하늘마트</Text>
            <Text accessibilityRole="header" style={s.title}>{kioskLabel}</Text></View>
          <PressScale accessibilityRole="button" accessibilityLabel="셀프 계산 닫기" onPress={onCancel} style={s.close}>
            <Ionicons name="close" size={22} color="#405C4E" /></PressScale>
        </View>
        {!compact ? <View style={s.screenHeading}><Text style={s.screenTitle}>{stage === 'scan' ? '스캔한 상품' : '결제할 상품 확인'}</Text>
          <Text style={s.count}>{scannedCount}개</Text></View> : null}
        <View style={s.columns}>
          <Text style={[s.columnLabel, s.productColumn]}>상품</Text><Text style={[s.columnLabel, s.countColumn]}>수량</Text>
          <Text style={[s.columnLabel, s.amountColumn]}>금액</Text><Text style={[s.columnLabel, s.cancelColumn]}>취소</Text>
        </View>
        <ScrollView testID="kiosk-receipt-scroll" style={s.receipt} showsVerticalScrollIndicator={false}
          contentContainerStyle={s.receiptContent} keyboardShouldPersistTaps="handled" bounces={false}>
          {Object.entries(scanned).filter(([, quantity]) => quantity > 0).map(([id, quantity]) => {
            const product = getMarketProduct(id)!;
            return <View key={id} style={[s.receiptRow, compact && s.receiptRowCompact]} testID={`kiosk-scanned-${id}`}>
              <View style={[s.productColumn, s.productInfo]}><ProductArt product={product} size={26} />
                <Text style={s.itemName}>{product.name}</Text></View>
              <Text style={[s.itemQuantity, s.countColumn]}>{quantity}</Text>
              <Text style={[s.itemPrice, s.amountColumn]}>{won(product.price * quantity)}</Text>
              <PressScale accessibilityRole="button" onPress={() => remove(id)} accessibilityLabel={`${product.name} 스캔 한 개 취소`} style={s.remove}>
                <Ionicons name="remove-circle-outline" size={22} color="#826D56" />
              </PressScale>
            </View>;
          })}
          {!scannedCount ? <Text style={s.empty}>스캔한 상품이 여기에 보여요.</Text> : null}
        </ScrollView>
        <View style={[s.total, compact && s.totalCompact]}><Text style={s.totalLabel}>결제 금액</Text>
          <Text testID="kiosk-scanned-total" style={[s.totalAmount, compact && s.totalAmountCompact]}>{won(getMarketCartTotal(scanned))}</Text></View>
      </View>
      {!compact ? <View accessible={false} style={s.monitorLip}><View style={s.powerLight} /></View> : null}
      </View>
      {!compact ? <View accessible={false} testID="kiosk-monitor-stand" style={s.monitorStand}>
        <View style={s.standStem} /><View style={s.standFoot} /></View> : null}
      <View testID="kiosk-countertop" style={[s.countertop, compact && s.countertopCompact, { height: deckHeight }]}>
        <View ref={scannerRef} onLayout={measure} collapsable={false} testID="kiosk-scanner-zone"
          style={[s.scanner, compact && s.scannerCompact, overScanner && s.scannerActive]}>
          <Ionicons name={stage === 'scan' ? 'scan-outline' : 'card-outline'} size={30} color="#B9CEBD" />
          <View style={s.scannerCopy}>
            {!compact ? <Text style={s.scannerText}>{stage === 'scan' ? '스캐너' : '결제 확인'}</Text> : null}
            <Text accessibilityLiveRegion="polite" numberOfLines={1} style={s.message}>
              {stage === 'scan' ? message : '상품과 금액을 확인해 주세요.'}
            </Text>
          </View>
        </View>
      {stage === 'scan' ? <>
        <ScrollView testID="kiosk-basket-scroll" horizontal directionalLockEnabled style={s.basket}
          scrollEnabled={!dragged} showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.basketContent} keyboardShouldPersistTaps="handled" bounces={false}>
          {entries.map(([id, quantity]) => {
            const product = getMarketProduct(id); const remaining = quantity - (scanned[id] ?? 0);
            return product && remaining > 0 ? <DraggableProduct key={id} product={product} remaining={remaining} compact={compact}
              onScan={scan} onStart={dragStart} onMove={dragMove} onEnd={dragEnd} /> : null;
          })}
          {complete ? <Text style={s.empty}>{count ? '모든 상품을 스캔했어요.' : '장바구니가 비어 있어요.'}</Text> : null}
        </ScrollView>
        <PressScale accessibilityRole="button" style={[s.primary, compact && s.primaryCompact, !complete && s.disabled]} accessibilityLabel="스캔 화면 확인하기"
          disabled={!complete} accessibilityState={{ disabled: !complete }} onPress={() => setStage('review')}>
          <Text style={s.primaryText}>화면 확인하기</Text>
        </PressScale>
      </> : <>
        <View style={s.paymentCard}><Ionicons name="card-outline" size={compact ? 32 : 52} color="#587565" />
          <Text style={s.paymentText}>확인했다면 결제해 주세요.</Text></View>
        <View style={s.paymentActions}>
        <PressScale accessibilityRole="button" style={[s.secondary, s.paymentAction, compact && s.primaryCompact]} accessibilityLabel="스캔 화면으로 돌아가기" onPress={() => setStage('scan')}>
          <Text style={s.secondaryText}>다시 스캔하기</Text></PressScale>
        <PressScale accessibilityRole="button" style={[s.primary, s.paymentAction, compact && s.primaryCompact]} accessibilityLabel="셀프 계산 결제하기" onPress={() => {
          if (!complete || submitting.current) return;
          submitting.current = true; onConfirm({ ...scanned });
        }}><Text style={s.primaryText}>결제하기</Text></PressScale>
        </View>
      </>}
      </View>
    </Animated.View>
    {dragged ? <Animated.View testID="kiosk-drag-ghost" pointerEvents="none" style={[s.ghost, { transform: ghost.getTranslateTransform() }]}>
      <ProductArt product={dragged} size={70} /></Animated.View> : null}
  </View>;
}

function eventPoint(event: GestureResponderEvent): Point { return { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }; }
function DraggableProduct({ product, remaining, compact, onScan, onStart, onMove, onEnd }: {
  product: MarketProduct; remaining: number; compact: boolean; onScan: (product: MarketProduct) => void;
  onStart: (product: MarketProduct, point: Point) => void; onMove: (point: Point) => void;
  onEnd: (product: MarketProduct, point: Point, cancelled?: boolean) => void;
}) {
  const latest = useRef({ product, onStart, onMove, onEnd }); latest.current = { product, onStart, onMove, onEnd };
  const active = useRef(false);
  const lastPoint = useRef<Point>({ x: 0, y: 0 });
  const cleanWeb = useRef<(() => void) | null>(null);
  const start = (point: Point) => {
    if (active.current) return;
    active.current = true; lastPoint.current = point;
    latest.current.onStart(latest.current.product, point);
  };
  const move = (point: Point) => {
    if (!active.current) return;
    lastPoint.current = point; latest.current.onMove(point);
  };
  const end = (point: Point, cancelled = false) => {
    cleanWeb.current?.(); cleanWeb.current = null;
    if (!active.current) return;
    active.current = false;
    latest.current.onEnd(latest.current.product, point, cancelled);
  };
  useEffect(() => () => end(lastPoint.current, true), []);
  const responder = useRef(PanResponder.create({
    // Claim the artwork at touch-down, before a native ScrollView can take the gesture.
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: event => start(eventPoint(event)),
    onPanResponderMove: event => move(eventPoint(event)),
    onPanResponderRelease: event => end(eventPoint(event)),
    onPanResponderTerminate: event => end(eventPoint(event), true),
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
  })).current;
  const pointerDown = (event: ReactNativePointerEvent) => {
    const pointer = event.nativeEvent;
    if (pointer.button !== 0 || active.current) return;
    event.preventDefault();
    const target = event.currentTarget as unknown as { setPointerCapture?: (id: number) => void; releasePointerCapture?: (id: number) => void };
    try { target.setPointerCapture?.(pointer.pointerId); } catch {}
    start({ x: pointer.clientX, y: pointer.clientY });
    const pointerMove = (next: PointerEvent) => {
      if (next.pointerId !== pointer.pointerId) return;
      if (next.cancelable) next.preventDefault();
      move({ x: next.clientX, y: next.clientY });
    };
    const pointerEnd = (next: PointerEvent) => {
      if (next.pointerId === pointer.pointerId) end({ x: next.clientX, y: next.clientY }, next.type !== 'pointerup');
    };
    const cancel = () => end(lastPoint.current, true);
    window.addEventListener('pointermove', pointerMove, { passive: false });
    window.addEventListener('pointerup', pointerEnd);
    window.addEventListener('pointercancel', pointerEnd);
    window.addEventListener('blur', cancel);
    cleanWeb.current = () => {
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', pointerEnd);
      window.removeEventListener('pointercancel', pointerEnd);
      window.removeEventListener('blur', cancel);
      try { target.releasePointerCapture?.(pointer.pointerId); } catch {}
    };
  };
  const webOnly = Platform.OS === 'web' ? {
    onPointerDown: pointerDown,
    onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
    onDragStart: (event: { preventDefault: () => void }) => event.preventDefault(),
  } : {};
  return <View style={[s.basketItem, compact && s.basketItemCompact]} testID={`kiosk-drag-${product.id}`}>
    {/* Artwork drags immediately; the name and tray gutter remain horizontal scroll surfaces. */}
    <View {...(Platform.OS === 'web' ? {} : responder.panHandlers)} {...webOnly}
      style={[s.dragHandle, compact && s.dragHandleCompact]} testID={`kiosk-grab-${product.id}`}>
      <View pointerEvents="none"><ProductArt product={product} size={compact ? 40 : 78} /></View>
      <View pointerEvents="none" style={s.remainingBadge}><Text style={s.remaining}>{remaining}</Text></View>
    </View>
    <PressScale accessibilityRole="button" accessibilityLabel={`${product.name} 한 개 스캔`} accessibilityHint="스캐너로 끌어오는 대신 눌러서 스캔합니다"
      onPress={() => onScan(product)} style={s.scanButton}>
      <Text numberOfLines={2} style={s.basketName}>{product.name}</Text>
    </PressScale>
  </View>;
}
function ProductArt({ product, size }: { product: MarketProduct; size: number }) {
  const source = getMarketProductImage(product.id);
  return source ? <Image accessible={false} source={source} resizeMode="contain" style={{ width: size, height: size }} />
    : <Ionicons accessible={false} name={product.icon} size={size * 0.7} color={product.color} />;
}

const s = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 120, backgroundColor: 'rgba(29,41,37,0.76)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  machine: { width: '100%', maxWidth: 620, maxHeight: '100%', minHeight: 0 },
  monitor: { flex: 1, minHeight: 0, padding: 9, paddingBottom: 5, backgroundColor: '#3B4D46', borderRadius: 20,
    borderWidth: 2, borderColor: '#718078', borderBottomColor: '#253B30' },
  screen: { flex: 1, minHeight: 0, borderRadius: 10, backgroundColor: '#FFFDF7', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14,
    paddingVertical: 10, backgroundColor: '#EBF0E6', gap: 8, flexShrink: 0 },
  headerCompact: { paddingVertical: 5 }, headingCopy: { flex: 1, minWidth: 0 },
  storeName: { fontFamily: fonts.bold, fontSize: 11, color: '#587565', marginBottom: 2 },
  title: { fontFamily: fonts.cafe24Ssurround, fontSize: 21, color: '#304B42' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#F7F5EB' },
  screenHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10,
    paddingTop: 7, paddingBottom: 5, flexShrink: 0 },
  screenTitle: { fontFamily: fonts.semibold, fontSize: 12, color: '#536C5B' }, count: { fontFamily: fonts.semibold, fontSize: 12, color: '#587565' },
  columns: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: '#F4F5EF', borderBottomWidth: 1, borderBottomColor: '#D9E1D5', flexShrink: 0 },
  columnLabel: { fontFamily: fonts.semibold, fontSize: 11, color: '#647365' },
  productColumn: { flex: 1, minWidth: 0 }, productInfo: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  countColumn: { width: 36, textAlign: 'center' }, amountColumn: { width: 80, textAlign: 'right' },
  cancelColumn: { width: 44, textAlign: 'center' },
  receipt: { flex: 1, flexShrink: 1, minHeight: 0 }, receiptContent: { paddingHorizontal: 10 },
  receiptRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#DDE2D7' },
  receiptRowCompact: { minHeight: 48, paddingVertical: 2 },
  itemName: { flex: 1, minWidth: 0, fontFamily: fonts.semibold, color: '#344C43', fontSize: 12, lineHeight: 17 },
  itemQuantity: { fontFamily: fonts.bold, color: '#344C43', fontSize: 14, fontVariant: ['tabular-nums'] },
  itemPrice: { fontFamily: fonts.semibold, color: '#344C43', fontSize: 12, fontVariant: ['tabular-nums'] },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  empty: { fontFamily: fonts.regular, fontSize: 12, color: '#778176', paddingVertical: 14, textAlign: 'center', flexGrow: 1 },
  total: { flexShrink: 0, paddingHorizontal: 12, paddingVertical: 12, gap: 8, backgroundColor: '#E4EEDB',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' },
  totalCompact: { paddingVertical: 7 }, totalLabel: { fontFamily: fonts.bold, fontSize: 14, color: '#3C573E' },
  totalAmount: { fontFamily: fonts.bold, fontSize: 25, color: '#2F4D36', fontVariant: ['tabular-nums'] },
  totalAmountCompact: { fontSize: 22 },
  monitorLip: { height: 10, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 12 },
  powerLight: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#A7CF91' },
  monitorStand: { height: 22, alignItems: 'center', justifyContent: 'flex-end' },
  standStem: { width: 58, height: 17, backgroundColor: '#596A60', borderLeftWidth: 5, borderLeftColor: '#738275' },
  standFoot: { width: 146, height: 5, backgroundColor: '#879485', borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  countertop: { flexShrink: 0, minHeight: 0, gap: 8, padding: 12, backgroundColor: '#DED2BA', borderRadius: 14,
    borderTopWidth: 3, borderTopColor: '#F4E9D3', borderBottomWidth: 4, borderBottomColor: '#BAA990' },
  countertopCompact: { marginTop: 6, padding: 8, gap: 6 },
  scanner: { flexShrink: 0, height: 56, width: '100%', borderRadius: 11, backgroundColor: '#293F38', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 14,
    paddingHorizontal: 12, borderWidth: 3, borderColor: '#9AADA0' },
  scannerCompact: { height: 44 },
  scannerActive: { backgroundColor: '#527B61', borderColor: '#C1DDBA' },
  scannerCopy: { flexShrink: 1, gap: 2 }, scannerText: { fontFamily: fonts.bold, fontSize: 11, color: '#B9CEBD' },
  message: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 18, color: '#F4F4E7' },
  basket: { flex: 1, flexShrink: 1, minHeight: 0 }, basketContent: { gap: 12, paddingHorizontal: 2, alignItems: 'center', flexGrow: 1 },
  basketItem: { width: 108, flexShrink: 0, backgroundColor: '#FFFCF5', borderWidth: 1, borderColor: '#DFD6C4',
    borderRadius: 12, paddingTop: 6, alignItems: 'center', overflow: 'hidden' },
  basketItemCompact: { width: 90, paddingTop: 0 },
  dragHandle: { width: '100%', height: 86, alignItems: 'center', justifyContent: 'center',
    ...Platform.select({ web: { touchAction: 'none', userSelect: 'none', cursor: 'pointer' } as const }) },
  dragHandleCompact: { height: 44 },
  basketName: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: '#40584B', textAlign: 'center' },
  remainingBadge: { position: 'absolute', right: 5, top: 3, backgroundColor: '#E5EDD9', borderRadius: 10,
    minWidth: 20, height: 20, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  remaining: { fontFamily: fonts.bold, fontSize: 11, color: '#4E6755' },
  scanButton: { minHeight: 44, width: '100%', paddingHorizontal: 5, paddingVertical: 4,
    justifyContent: 'center', alignItems: 'center', backgroundColor: '#F2F0E5' },
  primary: { flexShrink: 0, minHeight: 50, backgroundColor: '#54725B', borderRadius: 10, borderBottomWidth: 3,
    borderBottomColor: '#3B5942', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  primaryCompact: { minHeight: 46 },
  disabled: { backgroundColor: '#B8C3B7' }, primaryText: { fontFamily: fonts.bold, fontSize: 16, color: '#FFFDF6' },
  secondary: { flexShrink: 0, minHeight: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F5EB',
    borderRadius: 10, borderBottomWidth: 3, borderBottomColor: '#C6BAA4' }, secondaryText: { fontFamily: fonts.semibold, fontSize: 13, color: '#687465' },
  paymentActions: { flexDirection: 'row', gap: 8, flexShrink: 0 }, paymentAction: { flex: 1 },
  paymentCard: { flex: 1, minHeight: 0, paddingVertical: 4, gap: 8, alignItems: 'center', justifyContent: 'center' },
  paymentText: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 13, color: '#4E6755', lineHeight: 19, textAlign: 'center' },
  ghost: { position: 'absolute', left: 0, top: 0, height: 70, width: 70, zIndex: 130, opacity: 0.94 },
});
