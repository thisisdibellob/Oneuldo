import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Image, PanResponder, ScrollView, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
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
  const [message, setMessage] = useState('상품을 스캐너로 끌어오세요.');
  const [dragged, setDragged] = useState<MarketProduct | null>(null);
  const [overScanner, setOverScanner] = useState(false);
  const scannerRef = useRef<View>(null);
  const rootRef = useRef<View>(null);
  const scannerBounds = useRef<Bounds>({ x: 0, y: 0, width: 0, height: 0 });
  const origin = useRef<Point>({ x: 0, y: 0 });
  const ghost = useRef(new Animated.ValueXY()).current;
  const entrance = useRef(new Animated.Value(0)).current;
  const reducedMotion = useMarketReducedMotion();
  const submitting = useRef(false);
  const current = useRef({ cart, scanned, stage });
  current.current = { cart, scanned, stage };
  const entries = Object.entries(cart).filter(([, count]) => count > 0);
  const count = entries.reduce((sum, [, quantity]) => sum + quantity, 0);
  const scannedCount = Object.values(scanned).reduce((sum, quantity) => sum + quantity, 0);
  const complete = entries.every(([id, quantity]) => scanned[id] === quantity)
    && Object.entries(scanned).every(([id, quantity]) => quantity === (cart[id] ?? 0));

  useEffect(() => {
    if (reducedMotion) { entrance.setValue(1); return; }
    Animated.timing(entrance, { toValue: 1, duration: reducedMotion ? 0 : 200, useNativeDriver: true }).start();
  }, [entrance, reducedMotion]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stage === 'review') setStage('scan'); else onCancel();
      return true;
    });
    return () => subscription.remove();
  }, [onCancel, stage]);
  const measure = useCallback(() => {
    scannerRef.current?.measureInWindow((x, y, width, height) => { scannerBounds.current = { x, y, width, height }; });
    rootRef.current?.measureInWindow((x, y) => { origin.current = { x, y }; });
  }, []);
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
  return <View ref={rootRef} onLayout={measure} style={s.overlay} accessibilityViewIsModal testID="market-kiosk-checkout">
    <Animated.View style={[s.machine, { opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [reducedMotion ? 0 : 14, 0] }) }] }]}>
      <View style={s.header}>
        <View style={s.headerSpacer} />
        <Text accessibilityRole="header" style={s.title}>{kioskLabel}</Text>
        <PressScale accessibilityRole="button" accessibilityLabel="셀프 계산 닫기" onPress={onCancel} style={s.close}><Ionicons name="close" size={22} color="#304B54" /></PressScale>
      </View>
      <View style={s.screen}>
        <View style={s.screenHeading}><Text style={s.screenTitle}>{stage === 'scan' ? '스캔한 상품' : '결제할 상품 확인'}</Text>
          <Text style={s.count}>{scannedCount}개</Text></View>
        <ScrollView style={s.receipt} showsVerticalScrollIndicator={false} contentContainerStyle={s.receiptContent}>
          {Object.entries(scanned).filter(([, quantity]) => quantity > 0).map(([id, quantity]) => {
            const product = getMarketProduct(id)!;
            return <View key={id} style={s.receiptRow} testID={`kiosk-scanned-${id}`}>
              <ProductArt product={product} size={36} />
              <View style={s.productText}><Text style={s.itemName}>{product.name}</Text><Text style={s.itemPrice}>{quantity}개 · {won(product.price * quantity)}</Text></View>
              <PressScale accessibilityRole="button" onPress={() => remove(id)} accessibilityLabel={`${product.name} 스캔 한 개 취소`} style={s.remove}>
                <Ionicons name="remove-circle-outline" size={22} color="#826D56" />
              </PressScale>
            </View>;
          })}
          {!scannedCount ? <Text style={s.empty}>스캔한 상품이 여기에 보여요.</Text> : null}
        </ScrollView>
        <View style={s.total}><Text style={s.totalLabel}>결제 금액</Text><Text style={s.totalAmount}>{won(getMarketCartTotal(scanned))}</Text></View>
      </View>
      {stage === 'scan' ? <>
        <View ref={scannerRef} onLayout={measure} collapsable={false} testID="kiosk-scanner-zone"
          style={[s.scanner, overScanner && s.scannerActive]}>
          <Ionicons name="scan-outline" size={34} color={overScanner ? '#FFFDF6' : '#6D9782'} />
          <View style={s.scannerBeam} /><Text style={[s.scannerText, overScanner && s.scannerTextActive]}>스캐너</Text>
        </View>
        <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>
        <ScrollView style={s.basket} scrollEnabled={!dragged} showsVerticalScrollIndicator={false} contentContainerStyle={s.basketContent}>
          {entries.map(([id, quantity]) => {
            const product = getMarketProduct(id); const remaining = quantity - (scanned[id] ?? 0);
            return product && remaining > 0 ? <DraggableProduct key={id} product={product} remaining={remaining}
              onScan={scan} onStart={dragStart} onMove={dragMove} onEnd={dragEnd} /> : null;
          })}
          {complete ? <Text style={s.empty}>{count ? '모든 상품을 스캔했어요.' : '장바구니가 비어 있어요.'}</Text> : null}
        </ScrollView>
        <PressScale accessibilityRole="button" style={[s.primary, !complete && s.disabled]} accessibilityLabel="스캔 화면 확인하기"
          disabled={!complete} accessibilityState={{ disabled: !complete }} onPress={() => setStage('review')}>
          <Text style={s.primaryText}>화면 확인하기</Text>
        </PressScale>
      </> : <>
        <View style={s.paymentCard}><Ionicons name="card-outline" size={34} color="#587565" />
          <Text style={s.paymentText}>상품과 금액을 확인한 뒤 결제해 주세요.</Text></View>
        <PressScale accessibilityRole="button" style={s.primary} accessibilityLabel="셀프 계산 결제하기" onPress={() => {
          if (!complete || submitting.current) return;
          submitting.current = true; onConfirm({ ...scanned });
        }}><Text style={s.primaryText}>결제하기</Text></PressScale>
        <PressScale accessibilityRole="button" style={s.secondary} accessibilityLabel="스캔 화면으로 돌아가기" onPress={() => setStage('scan')}>
          <Text style={s.secondaryText}>스캔 화면으로 돌아가기</Text></PressScale>
      </>}
    </Animated.View>
    {dragged ? <Animated.View pointerEvents="none" style={[s.ghost, { transform: ghost.getTranslateTransform() }]}>
      <ProductArt product={dragged} size={70} /></Animated.View> : null}
  </View>;
}

function eventPoint(event: GestureResponderEvent): Point { return { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY }; }
function DraggableProduct({ product, remaining, onScan, onStart, onMove, onEnd }: {
  product: MarketProduct; remaining: number; onScan: (product: MarketProduct) => void;
  onStart: (product: MarketProduct, point: Point) => void; onMove: (point: Point) => void;
  onEnd: (product: MarketProduct, point: Point, cancelled?: boolean) => void;
}) {
  const latest = useRef({ product, onStart, onMove, onEnd }); latest.current = { product, onStart, onMove, onEnd };
  const responder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.hypot(gesture.dx, gesture.dy) > 6,
    onPanResponderGrant: event => latest.current.onStart(latest.current.product, eventPoint(event)),
    onPanResponderMove: event => latest.current.onMove(eventPoint(event)),
    onPanResponderRelease: event => latest.current.onEnd(latest.current.product, eventPoint(event)),
    onPanResponderTerminate: event => latest.current.onEnd(latest.current.product, eventPoint(event), true),
    onPanResponderTerminationRequest: () => false,
  })).current;
  return <View {...responder.panHandlers} style={s.basketItem} testID={`kiosk-drag-${product.id}`}>
    <ProductArt product={product} size={54} />
    <Text numberOfLines={2} style={s.basketName}>{product.name}</Text>
    <Text style={s.remaining}>{remaining}개</Text>
    <PressScale accessibilityRole="button" accessibilityLabel={`${product.name} 한 개 스캔`} accessibilityHint="스캐너로 끌어오는 대신 눌러서 스캔합니다"
      onPress={() => onScan(product)} style={s.scanButton}><Text style={s.scanButtonText}>스캔</Text></PressScale>
  </View>;
}
function ProductArt({ product, size }: { product: MarketProduct; size: number }) {
  const source = getMarketProductImage(product.id);
  return source ? <Image accessible={false} source={source} resizeMode="contain" style={{ width: size, height: size }} />
    : <Ionicons accessible={false} name={product.icon} size={size * 0.7} color={product.color} />;
}

const s = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 120, backgroundColor: 'rgba(35,48,42,0.62)', alignItems: 'center', justifyContent: 'center', padding: 12 },
  machine: { width: '100%', maxWidth: 560, maxHeight: '100%', backgroundColor: '#F6F1E6', borderRadius: 25, borderWidth: 2, borderColor: '#B7C4B9', padding: 14, gap: 9 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 },
  headerSpacer: { width: 40 }, title: { flex: 1, fontFamily: fonts.cafe24Ssurround, fontSize: 21, color: '#304B54', textAlign: 'center' },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  screen: { flexShrink: 1, minHeight: 130, backgroundColor: '#FEFDF8', borderRadius: 14, borderWidth: 5, borderColor: '#718C7B', padding: 10, gap: 6 },
  screenHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  screenTitle: { fontFamily: fonts.bold, fontSize: 15, color: '#304B54' }, count: { fontFamily: fonts.semibold, fontSize: 13, color: '#587565' },
  receipt: { flexGrow: 0, maxHeight: 200 }, receiptContent: { gap: 5 },
  receiptRow: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#E7E9DF' },
  productText: { flex: 1 }, itemName: { fontFamily: fonts.semibold, color: '#344C43', fontSize: 13 }, itemPrice: { fontFamily: fonts.regular, color: '#687B70', fontSize: 12, marginTop: 3 },
  remove: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  empty: { fontFamily: fonts.regular, fontSize: 13, color: '#778176', paddingVertical: 15, textAlign: 'center', flexGrow: 1 },
  total: { borderTopWidth: 1, borderTopColor: '#D5DDD0', paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontFamily: fonts.medium, fontSize: 13, color: '#4B6455' }, totalAmount: { fontFamily: fonts.bold, fontSize: 20, color: '#304B54' },
  scanner: { height: 67, width: '100%', borderRadius: 13, backgroundColor: '#293F38', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 14, borderWidth: 3, borderColor: '#9AADA0' },
  scannerActive: { backgroundColor: '#527B61', borderColor: '#C1DDBA' }, scannerBeam: { width: 85, height: 2, backgroundColor: '#C79272', opacity: 0.8 },
  scannerText: { fontFamily: fonts.bold, fontSize: 13, color: '#B9CEBD' }, scannerTextActive: { color: '#FFFDF6' },
  message: { fontFamily: fonts.medium, fontSize: 12, color: '#587565', textAlign: 'center', minHeight: 19 },
  basket: { flexGrow: 0, flexShrink: 1, maxHeight: 220, minHeight: 60 }, basketContent: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  basketItem: { width: 92, backgroundColor: '#FFFCF5', borderWidth: 1, borderColor: '#DFD6C4', borderRadius: 12, padding: 7, alignItems: 'center', gap: 3 },
  basketName: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 15, color: '#40584B', textAlign: 'center', minHeight: 30 },
  remaining: { fontFamily: fonts.semibold, fontSize: 11, color: '#7C786B' },
  scanButton: { minHeight: 36, width: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: '#E6EDD9', borderRadius: 8 },
  scanButtonText: { fontFamily: fonts.bold, fontSize: 12, color: '#4E7158' },
  primary: { minHeight: 48, backgroundColor: '#587565', borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  disabled: { backgroundColor: '#B8C3B7' }, primaryText: { fontFamily: fonts.bold, fontSize: 16, color: '#FFFDF6' },
  secondary: { minHeight: 42, alignItems: 'center', justifyContent: 'center' }, secondaryText: { fontFamily: fonts.semibold, fontSize: 13, color: '#687465' },
  paymentCard: { paddingVertical: 18, gap: 10, alignItems: 'center' }, paymentText: { fontFamily: fonts.medium, fontSize: 14, color: '#4E6755', lineHeight: 21, textAlign: 'center' },
  ghost: { position: 'absolute', left: 0, top: 0, height: 70, width: 70, zIndex: 130, opacity: 0.94 },
});
