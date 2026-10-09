import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { PressScale } from '../PressScale';
import { MarketStaffDialogue, MarketStaffDialogueChoice } from './MarketStaffDialogue';
import { useMarketReducedMotion } from './MarketPanelTransition';
import { getMarketProductImage } from '../../game/marketProductImages';
import { getMarketProduct, type MarketCart } from '../../game/scenarios';
import { fonts } from '../../theme';

type Review = { chargedCart: MarketCart; total: number; response: string | null };
type Stage = 'receipt' | 'cart' | 'product' | 'quantity' | 'reply';
const price = (value: number) => value.toLocaleString('ko-KR') + '원';

/** The customer display shows the cashier's bill, without identifying any injected error. */
export function MarketStaffedCheckout({ review, cart, counterNumber, dialogueBottomInset = 24, onCorrect, onSubmit, onCancel, onInspectCart, onBackHandlerChange }: {
  review: Review; cart: MarketCart; counterNumber: number;
  dialogueBottomInset?: number;
  onCorrect: (productId: string, quantity: number) => string;
  onSubmit: () => void; onCancel: () => void;
  onInspectCart?: () => void;
  onBackHandlerChange?: (handler: (() => boolean) | null) => void;
}) {
  const [stage, setStage] = useState<Stage>('receipt');
  const [cartReturn, setCartReturn] = useState<Stage>('receipt');
  const [quantityReturn, setQuantityReturn] = useState<'receipt' | 'product'>('product');
  const [productId, setProductId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [reply, setReply] = useState('');
  const [receiptScroll, setReceiptScroll] = useState({ content: 0, viewport: 0, offset: 0 });
  const insets = useContext(SafeAreaInsetsContext);
  const window = useWindowDimensions();
  const [layoutHeight, setLayoutHeight] = useState<number | null>(null);
  const height = layoutHeight ?? window.height;
  const top = Math.max(12, insets?.top ?? 0), bottom = Math.max(12, insets?.bottom ?? 0);
  const usableHeight = height - top - bottom;
  const compact = usableHeight < 500;
  const [layoutWidth, setLayoutWidth] = useState<number | null>(null);
  const wide = (layoutWidth ?? window.width) >= 600;
  const reducedMotion = useMarketReducedMotion();
  const entrance = useRef(new Animated.Value(1)).current;
  const selected = productId ? getMarketProduct(productId) : null;
  const lines = Object.entries(stage === 'cart' ? cart : review.chargedCart).filter(([, count]) => count > 0);
  const openCart = () => { onInspectCart?.(); setCartReturn(stage); setStage('cart'); };
  const chooseProduct = (id: string, from: 'receipt' | 'product') => {
    setProductId(id); setQuantity(1); setQuantityReturn(from); setStage('quantity');
  };
  const back = () => {
    if (stage === 'receipt') return false;
    setStage(stage === 'cart' ? cartReturn : stage === 'quantity' ? quantityReturn : 'receipt');
    return true;
  };
  useEffect(() => {
    onBackHandlerChange?.(back);
    return () => onBackHandlerChange?.(null);
  }, [onBackHandlerChange, stage, cartReturn, quantityReturn]);
  useEffect(() => {
    entrance.stopAnimation();
    entrance.setValue(reducedMotion ? 1 : 0);
    if (reducedMotion) return;
    const animation = Animated.timing(entrance, { toValue: 1, duration: 180,
      easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [entrance, reducedMotion, stage]);

  if (stage === 'product' || stage === 'reply') {
    return <MarketStaffDialogue name={`${counterNumber}번 계산원`} bottomInset={dialogueBottomInset}
      message={stage === 'reply' ? reply : '어떤 상품의 수량을 확인해 드릴까요?'}>
      {stage === 'product' ? lines.map(([id]) => {
        const product = getMarketProduct(id);
        return product ? <MarketStaffDialogueChoice key={id} text={product.name}
          label={`${product.name} 계산 수량 확인`} onPress={() => chooseProduct(id, 'product')} /> : null;
      }) : null}
      <MarketStaffDialogueChoice text={stage === 'reply' ? '계산 내역 다시 보기' : '뒤로가기'} onPress={() => setStage('receipt')} />
    </MarketStaffDialogue>;
  }

  const motion = { opacity: entrance, transform: [{ translateY: entrance.interpolate({
    inputRange: [0, 1], outputRange: [8, 0],
  }) }] };
  return <View accessibilityViewIsModal testID="market-staffed-checkout"
    onLayout={event => { setLayoutHeight(event.nativeEvent.layout.height); setLayoutWidth(event.nativeEvent.layout.width); }}
    style={[s.overlay, { paddingTop: top, paddingBottom: bottom }]}>
    {stage === 'receipt' ? <Animated.View testID="checkout-pos" style={[s.checkout,
      { height: Math.min(680, Math.max(280, usableHeight)) }, motion]}>
      <View style={s.monitor}>
        <View style={s.display}>
          <LinearGradient colors={['#477BA7', '#25527A']} style={[s.displayHeader, compact && s.headerCompact]}>
            <Text style={s.storeName}>하늘마트</Text>
            <Text style={s.counterLabel}>계산대 {String(counterNumber).padStart(2, '0')}</Text>
          </LinearGradient>
          <View style={[s.saleToolbar, compact && s.toolbarCompact]}>
            <Text accessibilityRole="header" style={s.title}>계산 내역</Text>
            <Text style={[s.saleStatus, compact && s.saleStatusCompact]}>판매</Text>
          </View>
          <LinearGradient colors={['#DCE7F3', '#B7CADE']} style={s.columns}>
            {wide ? <Text style={[s.columnLabel, s.indexColumn]}>번호</Text> : null}
            <Text style={[s.columnLabel, s.productColumn, s.nameCell]}>상품명</Text>
            <Text style={[s.columnLabel, s.unitColumn]}>단가</Text>
            <Text style={[s.columnLabel, s.countColumn]}>수량</Text>
            <Text style={[s.columnLabel, s.amountColumn]}>금액</Text>
          </LinearGradient>
          <ScrollView testID="checkout-receipt" style={s.receiptScroll} contentContainerStyle={s.receiptContent}
            onContentSizeChange={(_, content) => setReceiptScroll(current => ({ ...current, content }))}
            onLayout={event => { const viewport = event.nativeEvent.layout.height; setReceiptScroll(current => ({ ...current, viewport })); }}
            onScroll={event => { const offset = event.nativeEvent.contentOffset.y; setReceiptScroll(current => ({ ...current, offset })); }}
            scrollEventThrottle={32}
            showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" bounces={false}>
            {lines.map(([id, count], index) => {
              const product = getMarketProduct(id);
              if (!product) return null;
              return <View key={id} testID={`checkout-receipt-row-${id}`}>
                <PressScale accessibilityRole="button" accessibilityLabel={`${product.name} 계산 수량 확인`}
                  accessibilityHint={`${count}개, ${price(product.price * count)}. 누르면 직원에게 수량 확인을 요청해요.`}
                  onPress={() => chooseProduct(id, 'receipt')} style={[s.line, index % 2 === 1 && s.alternateLine,
                    id === (productId ?? lines.at(-1)?.[0]) && s.selectedLine]}>
                  {wide ? <Text style={[s.rowIndex, s.indexColumn]}>{index + 1}</Text> : null}
                  <Text style={[s.productName, s.productColumn, s.nameCell]}>{product.name}</Text>
                  <Text style={[s.linePrice, s.unitColumn]}>{product.price.toLocaleString('ko-KR')}</Text>
                  <Text style={[s.lineCount, s.countColumn]}>{count}개</Text>
                  <Text style={[s.linePrice, s.amountColumn]}>{(product.price * count).toLocaleString('ko-KR')}</Text>
                </PressScale>
              </View>;
            })}
            {!lines.length ? <Text style={s.empty}>아직 담은 물건이 없어요.</Text> : null}
          </ScrollView>
          <View style={s.displayFooter}>
            <Text style={[s.touchHint, compact && s.touchHintCompact]}>{receiptScroll.content > receiptScroll.viewport + receiptScroll.offset + 8
              ? '상품을 눌러 확인 · 아래로 내려 더 보기' : '확인하고 싶은 상품을 누르세요'}</Text>
            <View style={[s.total, compact && s.totalCompact]}><Text style={s.totalLabel}>합계금액</Text>
              <Text testID="checkout-charged-total" style={[s.totalAmount, compact && s.totalAmountCompact]}>{price(review.total)}</Text></View>
          </View>
        </View>
      </View>
      <View style={s.countertop}>
        <View style={s.actions}>
          <Action label="장바구니 확인" onPress={openCart} grow>
            <Ionicons name="basket-outline" size={22} color="#405C4E" /><Text style={s.actionText}>장바구니 확인</Text>
          </Action>
          <Action label="개수가 잘못된 것 같아요" onPress={() => setStage('product')} disabled={!lines.length} grow>
            <Ionicons name="chatbubble-ellipses-outline" size={21} color="#405C4E" /><Text style={s.actionText}>{wide ? '개수가 잘못된 것 같아요' : '개수가 잘못된\n것 같아요'}</Text>
          </Action>
        </View>
        <Action label="구매 확정" onPress={onSubmit} primary>
          <Ionicons name="card-outline" size={22} color="#FFFFFF" /><Text style={s.primaryText}>이대로 결제하기</Text>
        </Action>
        <Action label="다시 고르기" onPress={onCancel} secondary>
          <Ionicons name="arrow-undo-outline" size={22} color="#344E68" /><Text style={s.secondaryText}>다시 고르기</Text>
        </Action>
      </View>
    </Animated.View> : <Animated.View style={[s.card, motion]}>
      <View style={s.popupHeading}>
        <Ionicons name={stage === 'cart' ? 'basket-outline' : 'chatbubble-ellipses-outline'} size={22} color="#587565" />
        <Text accessibilityRole="header" style={s.popupTitle}>{stage === 'cart' ? '내 장바구니' : '수량 확인 부탁하기'}</Text>
      </View>
      <ScrollView style={s.popupScroll} contentContainerStyle={s.popupContent} showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled" bounces={false}>
        {stage === 'quantity' && selected ? <View style={s.quantityContent}>
          <View style={s.selectedProduct}>
            <Image accessible={false} source={getMarketProductImage(selected.id)} resizeMode="contain" style={s.largeArt} />
            <View style={s.productText}><Text style={s.selectedName}>{selected.name}</Text>
              <Text style={s.billedQuantity}>계산 화면에는 {review.chargedCart[selected.id] ?? 0}개</Text></View>
          </View>
          <Text style={s.question}>실제로 몇 개 담았나요?</Text>
          <View style={s.stepper}>
            <Action label="정정 요청 수량 줄이기" disabled={quantity <= 1} onPress={() => setQuantity(value => Math.max(1, value - 1))} compact>
              <Ionicons name="remove" size={24} color="#304B54" />
            </Action>
            <Text testID="checkout-claimed-quantity" accessibilityLiveRegion="polite" style={s.quantity}>{quantity}개</Text>
            <Action label="정정 요청 수량 늘리기" disabled={quantity >= 99} onPress={() => setQuantity(value => Math.min(99, value + 1))} compact>
              <Ionicons name="add" size={24} color="#304B54" />
            </Action>
          </View>
          <Text style={s.claim}>“{selected.name} {quantity}개를 담았어요.{ '\n' }확인해 주세요.”</Text>
        </View> : <View testID="checkout-basket" style={s.basket}>
          {lines.map(([id, count]) => {
            const product = getMarketProduct(id);
            return product ? <View key={id} testID={`checkout-cart-row-${id}`} style={s.basketItem}>
              <Image accessible={false} source={getMarketProductImage(id)} resizeMode="contain" style={s.basketArt} />
              <Text style={s.basketName}>{product.name}</Text><Text style={s.basketCount}>{count}개</Text>
            </View> : null;
          })}
          {!lines.length ? <Text style={s.empty}>아직 담은 물건이 없어요.</Text> : null}
        </View>}
      </ScrollView>
      <View style={s.popupFooter}>
        {stage === 'quantity' && selected ? <>
          <Action label="장바구니 확인" onPress={openCart}><Ionicons name="basket-outline" size={20} color="#405C4E" /><Text style={s.actionText}>장바구니 확인</Text></Action>
          <Action label="수량 확인 부탁하기" onPress={() => {
            setReply(onCorrect(selected.id, quantity)); setStage('reply');
          }} primary><Text style={s.primaryText}>확인 부탁드려요</Text></Action>
          <Action label={quantityReturn === 'receipt' ? '계산 내역으로 돌아가기' : '다른 상품 선택'} onPress={() => setStage(quantityReturn)}>
            <Text style={s.actionText}>{quantityReturn === 'receipt' ? '계산 화면으로 돌아가기' : '다른 상품 선택'}</Text>
          </Action>
        </> : <Action label={cartReturn === 'quantity' ? '수량 선택으로 돌아가기' : '계산 내역으로 돌아가기'} onPress={() => setStage(cartReturn)} primary>
          <Text style={s.primaryText}>{cartReturn === 'quantity' ? '수량 선택으로 돌아가기' : '계산 화면으로 돌아가기'}</Text>
        </Action>}
      </View>
    </Animated.View>}
  </View>;
}

function Action({ label, onPress, children, primary, compact, secondary, grow, disabled = false }: {
  label: string; onPress: () => void; children: ReactNode; primary?: boolean; compact?: boolean; secondary?: boolean; grow?: boolean; disabled?: boolean;
}) {
  return <PressScale accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress} style={[s.action, grow && s.grow,
      (primary || secondary) && s.decisionButton, primary && s.primary, secondary && s.secondary,
      compact && s.compact, disabled && s.disabled]}>{children}</PressScale>;
}

const s = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 80, paddingHorizontal: 12,
    backgroundColor: 'rgba(29,41,37,0.76)', justifyContent: 'center', alignItems: 'center' },
  checkout: { width: '100%', maxWidth: 780, maxHeight: '100%', minHeight: 0, padding: 6,
    borderRadius: 10, backgroundColor: '#738393', borderWidth: 1, borderColor: '#A9B4BE' },
  monitor: { flex: 1, minHeight: 0, padding: 3, backgroundColor: '#33434F', borderRadius: 5 },
  display: { flex: 1, minHeight: 0, borderRadius: 3, backgroundColor: '#E8EDF3', overflow: 'hidden' },
  displayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10,
    minHeight: 32, gap: 12 },
  headerCompact: { minHeight: 26 },
  storeName: { fontFamily: fonts.bold, fontSize: 14, color: '#FFFFFF' },
  counterLabel: { fontFamily: fonts.medium, fontSize: 12, color: '#F0F5FA' },
  saleToolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#D6DFE8', borderBottomWidth: 1, borderBottomColor: '#9EAFBF' },
  toolbarCompact: { paddingVertical: 2 },
  title: { fontFamily: fonts.bold, fontSize: 19, color: '#273E53' },
  saleStatus: { fontFamily: fonts.semibold, fontSize: 12, color: '#2E526C', backgroundColor: '#EEF3F7',
    paddingHorizontal: 16, paddingVertical: 5, borderRadius: 3, borderWidth: 1, borderColor: '#A3B5C6' },
  saleStatusCompact: { paddingVertical: 3 },
  columns: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, borderBottomColor: '#9BAEC1' },
  columnLabel: { fontFamily: fonts.semibold, fontSize: 12, color: '#3C5873', paddingVertical: 8 },
  productColumn: { flex: 1, minWidth: 0 },
  nameCell: { paddingHorizontal: 7, textAlign: 'left' },
  indexColumn: { width: 38, textAlign: 'center', borderRightWidth: 1, borderRightColor: '#B5C3D0' },
  unitColumn: { width: 61, textAlign: 'right', paddingHorizontal: 5, borderLeftWidth: 1, borderLeftColor: '#B5C3D0' },
  countColumn: { width: 41, textAlign: 'center', borderLeftWidth: 1, borderLeftColor: '#B5C3D0' },
  amountColumn: { width: 70, textAlign: 'right', paddingHorizontal: 5, borderLeftWidth: 1, borderLeftColor: '#B5C3D0' },
  receiptScroll: { flex: 1, flexShrink: 1, minHeight: 0 }, receiptContent: { flexGrow: 1 },
  line: { minHeight: 48, flexDirection: 'row', alignItems: 'stretch', backgroundColor: '#EFF3F7',
    borderBottomWidth: 1, borderBottomColor: '#B5C3D0' },
  alternateLine: { backgroundColor: '#DFE6EF' }, selectedLine: { backgroundColor: '#F2C44E' },
  rowIndex: { fontFamily: fonts.regular, fontSize: 14, color: '#42607C', paddingVertical: 14 },
  productText: { flex: 1, minWidth: 0, gap: 4 },
  productName: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, color: '#263746', paddingVertical: 14 },
  lineCount: { fontFamily: fonts.bold, fontSize: 15, color: '#263746', fontVariant: ['tabular-nums'], paddingVertical: 14 },
  linePrice: { fontFamily: fonts.medium, fontSize: 13, color: '#263746', fontVariant: ['tabular-nums'], paddingVertical: 14 },
  displayFooter: { flexShrink: 0 }, touchHint: { fontFamily: fonts.regular, fontSize: 11, textAlign: 'center',
    color: '#536778', paddingVertical: 6, backgroundColor: '#DCE4EC', borderTopWidth: 1, borderTopColor: '#AFBDCA' },
  touchHintCompact: { paddingVertical: 4 },
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 11,
    paddingVertical: 12, backgroundColor: '#41474E', gap: 8, flexWrap: 'wrap' },
  totalLabel: { fontFamily: fonts.bold, fontSize: 14, color: '#E6EAF0' },
  totalAmount: { fontFamily: fonts.bold, fontSize: 34, color: '#F4EA73', fontVariant: ['tabular-nums'] },
  totalCompact: { paddingVertical: 6 }, totalAmountCompact: { fontSize: 28 },
  countertop: { gap: 8, paddingTop: 8, flexShrink: 0 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flexShrink: 0, minHeight: 46, borderRadius: 10, flexDirection: 'row', gap: 7,
    backgroundColor: '#F1F4F6', paddingHorizontal: 10, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1, minWidth: 0 }, actionText: { fontFamily: fonts.semibold, fontSize: 13, color: '#405C4E', textAlign: 'center', flexShrink: 1 },
  decisionButton: { minHeight: 52, borderWidth: 1, borderBottomWidth: 3, paddingVertical: 12 },
  primary: { backgroundColor: '#315D83', borderColor: '#234664', borderBottomColor: '#18354D' },
  secondary: { backgroundColor: '#E7EEF5', borderColor: '#C1CFDD', borderBottomColor: '#9CACBD' },
  primaryText: { fontFamily: fonts.bold, fontSize: 17, color: '#FFFFFF', textAlign: 'center', flexShrink: 1 },
  secondaryText: { fontFamily: fonts.bold, fontSize: 17, color: '#344E68', textAlign: 'center', flexShrink: 1 },
  compact: { width: 48, minHeight: 48, paddingHorizontal: 0 },
  disabled: { opacity: 0.4 },
  empty: { fontFamily: fonts.regular, fontSize: 15, color: '#66776A', textAlign: 'center', paddingVertical: 24 },
  card: { width: '100%', maxWidth: 430, maxHeight: '100%', minHeight: 0, backgroundColor: '#F7F4EC',
    borderRadius: 22, overflow: 'hidden', padding: 18 },
  popupHeading: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9, paddingBottom: 16 },
  popupTitle: { fontFamily: fonts.cafe24Ssurround, fontSize: 21, color: '#304B42', flexShrink: 1 },
  popupScroll: { flexShrink: 1, minHeight: 0 }, popupContent: { paddingBottom: 14 }, popupFooter: { gap: 8, flexShrink: 0 },
  quantityContent: { alignItems: 'center', gap: 15 }, selectedProduct: { width: '100%', flexDirection: 'row',
    alignItems: 'center', gap: 16, padding: 14, borderRadius: 12, backgroundColor: '#EEEEE3' },
  largeArt: { width: 48, height: 58 }, selectedName: { fontFamily: fonts.bold, fontSize: 18, color: '#304B42' },
  billedQuantity: { fontFamily: fonts.medium, fontSize: 14, color: '#6C7969' },
  question: { fontFamily: fonts.semibold, fontSize: 17, color: '#405C4E', textAlign: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 22 }, quantity: { minWidth: 62, textAlign: 'center',
    fontFamily: fonts.bold, fontSize: 28, color: '#304B54', fontVariant: ['tabular-nums'] },
  claim: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 24, color: '#405C4E', textAlign: 'center' },
  basket: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  basketItem: { width: 128, alignItems: 'center', borderRadius: 14, padding: 12, gap: 7, backgroundColor: '#EEEDE1' },
  basketArt: { width: 64, height: 72 }, basketName: { fontFamily: fonts.semibold, fontSize: 14, color: '#405C4E', textAlign: 'center' },
  basketCount: { fontFamily: fonts.bold, fontSize: 21, color: '#304B42' },
});
