import { Ionicons } from '@expo/vector-icons';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, BackHandler, Easing, Image, PanResponder,
  Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { PressScale } from '../PressScale';
import { useMarketReducedMotion } from './MarketPanelTransition';
import { getMarketProductImage } from '../../game/marketProductImages';
import { getMarketShelfLayout } from '../../game/marketShelfLayout';
import {
  getCartQuantity, getMarketCartTotal, MarketCart, MarketCategory, MarketProduct,
  marketCategories, marketProducts,
} from '../../game/scenarios';
import { fonts } from '../../theme';

type Point = { x: number; y: number };
type Bounds = Point & { width: number; height: number };
export type MarketShelfSceneProps = {
  slots?: string[];
  stock?: Record<string, number>;
  onGiveUp?: () => void;
  onCartVisibilityChange?: (open: boolean) => void;
  cart: MarketCart;
  category: MarketCategory;
  onChangeQuantity: (productId: string, change: number) => void;
  onClose: () => void;
  onDropProduct: (productId: string) => boolean;
};

const price = (value: number) => `${value.toLocaleString('ko-KR')}원`;
// This is an empty bay: all products, stock, labels and controls remain real UI.
const shelfBay = require('../../../assets/images/game/market/interior/shelf_bay_v2.png');
const backdropColors = { fresh: '#EAF0E9', produce: '#F3EBDD', meal: '#F4EEE4', drink: '#E7EEF0', household: '#F0ECE4' };

function ProductArt({ product, size }: { product: MarketProduct; size: number }) {
  const source = getMarketProductImage(product.id);
  const [failed, setFailed] = useState(false);
  return source && !failed ? (
    <Image accessible={false} onError={() => setFailed(true)} resizeMode="contain" source={source} style={{ width: size, height: size }} />
  ) : <Ionicons accessible={false} color={product.color} name={product.icon} size={size * 0.6} />;
}

/** A camera-like close-up over the existing map. Closing never changes world position. */
export function MarketShelfScene({ slots, stock, onGiveUp, onCartVisibilityChange, cart, category, onChangeQuantity,
  onClose, onDropProduct }: MarketShelfSceneProps) {
  const viewport = useWindowDimensions();
  const insets = useContext(SafeAreaInsetsContext);
  const [size, setSize] = useState({ width: viewport.width, height: viewport.height });
  const reducedMotion = useMarketReducedMotion();
  const [dragged, setDragged] = useState<MarketProduct | null>(null);
  const [overBasket, setOverBasket] = useState(false);
  const [basketExpanded, setBasketExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const scene = useRef(new Animated.Value(0)).current;
  const ghostPosition = useRef(new Animated.ValueXY()).current;
  const ghostScale = useRef(new Animated.Value(1)).current;
  const ghostOpacity = useRef(new Animated.Value(1)).current;
  const basketPulse = useRef(new Animated.Value(1)).current;
  const basketReveal = useRef(new Animated.Value(0)).current;
  const rootRef = useRef<View>(null);
  const basketRef = useRef<View>(null);
  const rootBounds = useRef<Bounds>({ x: 0, y: 0, width: size.width, height: size.height });
  const basketBounds = useRef<Bounds | null>(null);
  const closingRef = useRef(false);
  const mounted = useRef(true);
  const currentDrag = useRef<MarketProduct | null>(null);
  const dragOrigin = useRef<Point>({ x: 0, y: 0 });
  const callbacks = useRef({ onClose, onDropProduct });
  callbacks.current = { onClose, onDropProduct };
  const products = useMemo(() => slots ? slots.map(id => marketProducts.find(p => p.id === id)!).filter(Boolean) : marketProducts.filter(p => p.categoryId === category.id).slice(0,12), [category.id, slots]);
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const basketVisible = basketExpanded && !dragged;
  const total = getMarketCartTotal(cart);
  const compactDock = size.width < 360;
  const { bayWidth, columns, rowHeight, surfaceY, imageHeight, imageTop, sideInset, itemWidth, artworkSize } =
    getMarketShelfLayout(size.width, size.height, products.length, (insets?.top ?? 0) + (insets?.bottom ?? 0));
  const rows = Array.from({ length: Math.ceil(products.length / columns) }, (_, i) => products.slice(i * columns, (i + 1) * columns));

  const measure = useCallback(() => {
    rootRef.current?.measureInWindow((x, y, width, height) => { rootBounds.current = { x, y, width, height }; });
    basketRef.current?.measureInWindow((x, y, width, height) => { basketBounds.current = { x, y, width, height }; });
  }, []);
  useEffect(() => {
    if (closingRef.current) return;
    const enter = Animated.timing(scene, { toValue: 1, duration: reducedMotion ? 0 : 220, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    enter.start(({ finished }) => { if (finished) measure(); });
    // A late motion-preference response must not stop the closing animation
    // on this shared value; closing owns it until onClose releases the map.
    return () => { if (!closingRef.current) enter.stop(); };
  }, [measure, reducedMotion, scene]);
  useEffect(() => { measure(); }, [measure, size.width, size.height, basketExpanded]);
  useEffect(() => {
    const reveal = Animated.timing(basketReveal, {
      toValue: basketVisible ? 1 : 0,
      duration: reducedMotion ? 0 : 220,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    });
    reveal.start(({ finished }) => { if (finished) measure(); });
    return () => reveal.stop();
  }, [basketReveal, basketVisible, measure, reducedMotion]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      scene.stopAnimation(); ghostPosition.stopAnimation(); ghostOpacity.stopAnimation(); ghostScale.stopAnimation(); basketPulse.stopAnimation();
    };
  }, [basketPulse, ghostOpacity, ghostPosition, ghostScale, scene]);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    currentDrag.current = null;
    setDragged(null);
    setClosing(true);
    if (reducedMotion) { callbacks.current.onClose(); return; }
    Animated.timing(scene, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true })
      .start(({ finished }) => { if (finished && mounted.current) callbacks.current.onClose(); });
  }, [reducedMotion, scene]);
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    if (Platform.OS !== 'web') return () => back.remove();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    };
    window.addEventListener('keydown', escape, true);
    return () => { back.remove(); window.removeEventListener('keydown', escape, true); };
  }, [close]);

  const isOverBasket = useCallback((point: Point) => {
    const b = basketBounds.current;
    return !!b && point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + b.height;
  }, []);
  const moveDrag = useCallback((point: Point) => {
    ghostPosition.setValue({ x: point.x - rootBounds.current.x - 48, y: point.y - rootBounds.current.y - 64 });
    setOverBasket(isOverBasket(point));
  }, [ghostPosition, isOverBasket]);
  const startDrag = useCallback((product: MarketProduct, point: Point) => {
    if (closingRef.current) return;
    measure();
    currentDrag.current = product;
    ghostPosition.stopAnimation(); ghostScale.stopAnimation(); ghostOpacity.stopAnimation();
    ghostScale.setValue(1.08); ghostOpacity.setValue(1);
    dragOrigin.current = { x: point.x - rootBounds.current.x - 48, y: point.y - rootBounds.current.y - 64 };
    setDragged(product);
    moveDrag(point);
  }, [ghostOpacity, ghostPosition, ghostScale, measure, moveDrag]);
  const finishDrag = useCallback((point: Point, cancelled = false) => {
    const product = currentDrag.current;
    currentDrag.current = null;
    setOverBasket(false);
    if (!product || closingRef.current) return;
    const accepted = !cancelled && isOverBasket(point) && callbacks.current.onDropProduct(product.id);
    const b = basketBounds.current;
    if (!accepted) {
      // Keep the original place visible, and return the lifted copy to that place.
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ghostPosition, { toValue: dragOrigin.current, duration: reducedMotion ? 0 : 180, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
          Animated.timing(ghostScale, { toValue: 1, duration: reducedMotion ? 0 : 180, useNativeDriver: false }),
        ]),
        Animated.timing(ghostOpacity, { toValue: 0, duration: reducedMotion ? 0 : 50, useNativeDriver: false }),
      ]).start(() => { if (mounted.current) setDragged(null); });
      return;
    }
    const animations = [Animated.timing(ghostOpacity, { toValue: 0, duration: reducedMotion ? 0 : 150, useNativeDriver: false })];
    if (accepted && b) {
      animations.push(Animated.timing(ghostPosition, { toValue: { x: b.x + b.width / 2 - rootBounds.current.x - 48, y: b.y - rootBounds.current.y - 30 }, duration: reducedMotion ? 0 : 150, useNativeDriver: false }));
      animations.push(Animated.timing(ghostScale, { toValue: 0.45, duration: reducedMotion ? 0 : 150, useNativeDriver: false }));
    }
    Animated.parallel(animations).start(() => { if (mounted.current) setDragged(null); });
  }, [ghostOpacity, ghostPosition, ghostScale, isOverBasket, reducedMotion]);
  const previousCount = useRef(count);
  useEffect(() => {
    if (previousCount.current !== count && !reducedMotion) {
      Animated.sequence([
        Animated.timing(basketPulse, { toValue: 1.035, duration: 90, useNativeDriver: true }),
        Animated.spring(basketPulse, { toValue: 1, damping: 17, stiffness: 250, useNativeDriver: true }),
      ]).start();
    }
    previousCount.current = count;
  }, [basketPulse, count, reducedMotion]);

  return (
    <View accessibilityViewIsModal onAccessibilityEscape={close} ref={rootRef} testID="market-shelf-scene"
      onLayout={event => { const { width, height } = event.nativeEvent.layout; setSize({ width, height }); measure(); }}
      style={s.root}>
      <Animated.View pointerEvents={closing ? 'none' : 'auto'} style={[s.scene, { backgroundColor: backdropColors[category.id], opacity: scene,
        transform: [{ scale: scene.interpolate({ inputRange: [0, 1], outputRange: [1.035, 1] }) }] }]}>
        <View style={[s.header, { paddingTop: Math.max(14, insets?.top ?? 0) }]}>
          <PressScale accessibilityLabel="진열대 닫기" accessibilityRole="button" onPress={close} style={s.back}>
            <Ionicons color="#405C50" name="arrow-back" size={21} /><Text style={s.backText}>매장</Text>
          </PressScale>
          <View style={s.heading}>
            <Text style={s.eyebrow}>하늘마트</Text>
            <Text accessibilityRole="header" style={s.title}>{category.label}</Text>
          </View>
          <View style={s.budget}><Text style={s.budgetLabel}>담은 금액</Text>
            <Text style={s.budgetValue}>{price(total)}</Text>
          </View>
        </View>
        <View style={s.instruction}>{onGiveUp ? <PressScale accessibilityRole="button" accessibilityLabel="장보기 포기" onPress={onGiveUp} style={{minHeight:44,justifyContent:"center",paddingRight:8}}><Text style={s.instructionText}>포기</Text></PressScale> : null}<Ionicons color="#688171" name="hand-left-outline" size={15} />
          <Text style={s.instructionText}>{Platform.OS === 'web' ? '상품을 담거나, 손잡이를 잡아 바구니로 옮겨요' : '상품을 담거나, 길게 잡아 장바구니로 옮겨요'}</Text>
        </View>
        <ScrollView testID="market-shelf-scroll" scrollEnabled={!dragged} showsVerticalScrollIndicator={false}
          contentContainerStyle={s.shelfContent} style={s.scroll} removeClippedSubviews={false}>
          {rows.map((row, index) => (
            <View key={index} style={[s.bay, { width: bayWidth, height: rowHeight }]} testID={`market-shelf-row-${index}`}>
              <View pointerEvents="none" style={s.bayArt}>
                <Image accessible={false} source={shelfBay} resizeMode="contain" testID={`market-shelf-backdrop-${index}`}
                  style={{ position: 'absolute', left: 0, top: imageTop, width: bayWidth, height: imageHeight }} />
              </View>
              <View style={[s.productRow, { paddingHorizontal: sideInset }]}>
                {row.map((product, slotIndex) => {
                  const unavailable = stock ? (stock[product.id] ?? 0) <= getCartQuantity(cart,product.id) : false;
                  return <ShelfProduct key={`${product.id}-${slotIndex}`} product={product} width={itemWidth} artworkSize={artworkSize} surfaceY={surfaceY}
                    quantity={getCartQuantity(cart, product.id)} unavailable={unavailable}
                    dragging={dragged?.id === product.id}
                    onAdd={() => onChangeQuantity(product.id, 1)}
                    onDragStart={startDrag} onDragMove={moveDrag} onDragEnd={finishDrag} />;
                })}
              </View>
            </View>
          ))}
          <Text style={s.endNote}>천천히 비교해도 괜찮아요</Text>
        </ScrollView>
        <Animated.View style={[s.dock, { paddingBottom: Math.max(14, insets?.bottom ?? 0), transform: [{ scale: basketPulse }] }]}>
          <Animated.View
            testID="market-shelf-cart-reveal"
            pointerEvents={basketVisible ? 'auto' : 'none'}
            accessibilityElementsHidden={!basketVisible}
            importantForAccessibility={basketVisible ? 'auto' : 'no-hide-descendants'}
            style={{ overflow: 'hidden', opacity: basketReveal, maxHeight: basketReveal.interpolate({ inputRange: [0, 1], outputRange: [0, 156] }) }}
          >
          <ScrollView testID="market-shelf-cart-items" style={s.basketItems}>
            <Text style={s.basketHelp}>물건은 해당 진열대에서 한 개씩 내려놓아요. 종업원에게 도움을 요청해도 돼요.</Text>
            {Object.entries(cart).filter(([, q]) => q > 0).map(([id, quantity]) => {
              const product = marketProducts.find(p => p.id === id);
              if (!product) return null;
              const canReturnHere = product.categoryId === category.id;
              const returnCategory = marketCategories.find(item => item.id === product.categoryId)!;
              return <View key={id} style={s.basketItem}><ProductArt product={product} size={40}/>
                <View style={s.basketItemCopy}>
                  <Text style={s.basketItemName}>{product.name}</Text>
                  {!canReturnHere ? <Text style={s.basketReturnLocation}>{returnCategory.label} 진열대에서 내려놓기</Text> : null}
                </View>
                <Text style={s.basketItemCount}>{quantity}개</Text>
                {canReturnHere ? <PressScale accessibilityLabel={`${product.name} ${category.label} 진열대에 1개 내려놓기`} accessibilityRole="button" onPress={() => onChangeQuantity(id, -1)} style={s.basketRemove}>
                  <Text style={s.basketRemoveText}>내려놓기</Text>
                </PressScale> : null}</View>;
            })}
            {count === 0 ? <Text style={s.emptyBasket}>아직 담은 상품이 없어요</Text> : null}
          </ScrollView>
          </Animated.View>
          <View ref={basketRef} collapsable={false} onLayout={measure} testID="market-shelf-basket-dock"
            accessibilityLabel="상품을 놓을 장바구니" style={[s.basketTarget, compactDock && s.basketTargetCompact, overBasket && s.basketTargetActive]}>
            <View style={[s.basketDrawing, compactDock && s.basketDrawingCompact]}><Ionicons color={overBasket ? '#FFFFFF' : '#527463'} name="basket" size={compactDock ? 34 : 42}/></View>
            <Pressable accessibilityRole="button" accessibilityLabel="진열대 장바구니 보기" onPress={() => {const open=!basketExpanded;setBasketExpanded(open);onCartVisibilityChange?.(open);}} style={s.basketCopy}>
              <Text style={[s.basketTitle, compactDock && s.basketTitleCompact, overBasket && s.white]}>{overBasket ? '여기에 놓아요!' : basketExpanded ? `장바구니 · ${count}개` : '장바구니'}</Text>
              <Text style={[s.basketSubtitle, overBasket && s.white]}>{dragged ? '상품을 아래로 끌어 놓아요' : `${price(total)} · ${basketExpanded ? '접기' : compactDock ? '보기' : '담은 상품 보기'}`}</Text>
            </Pressable>
            <PressScale accessibilityLabel="진열대에서 매장으로 돌아가기" accessibilityRole="button" onPress={close} style={s.leave}>
              <Text style={s.leaveText}>다 골랐어요</Text>{!compactDock ? <Ionicons color="#FFFFFF" name="checkmark" size={18}/> : null}
            </PressScale>
          </View>
        </Animated.View>
      </Animated.View>
      {dragged ? <Animated.View pointerEvents="none" style={[s.ghost, { opacity: ghostOpacity, transform: [...ghostPosition.getTranslateTransform(), { scale: ghostScale }] }]}>
        <ProductArt product={dragged} size={96}/>
      </Animated.View> : null}
    </View>
  );
}

function ShelfProduct({ product, quantity, width, artworkSize, surfaceY, unavailable, dragging,
  onAdd, onDragStart, onDragMove, onDragEnd }: {
  product: MarketProduct; quantity: number; width: number; artworkSize: number; surfaceY: number; unavailable: boolean;
  dragging: boolean; onAdd: () => void;
  onDragStart: (product: MarketProduct, point: Point) => void; onDragMove: (point: Point) => void;
  onDragEnd: (point: Point, cancelled?: boolean) => void;
}) {
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armed = useRef(false);
  const active = useRef(false);
  const latest = useRef({ product, onDragStart, onDragMove, onDragEnd, unavailable });
  latest.current = { product, onDragStart, onDragMove, onDragEnd, unavailable };
  const clearHold = () => { if (hold.current) clearTimeout(hold.current); hold.current = null; };
  useEffect(() => () => clearHold(), []);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_e, g) => {
      if (latest.current.unavailable) return false;
      const moved = Math.hypot(g.dx, g.dy) > 8;
      if (moved && !armed.current && Platform.OS !== 'web' && Math.abs(g.dy) > Math.abs(g.dx)) {
        clearHold(); return false;
      }
      return moved && (armed.current || Platform.OS === 'web' || Math.abs(g.dx) > Math.abs(g.dy) * 1.3);
    },
    onPanResponderGrant: (e, g) => {
      clearHold(); active.current = true;
      latest.current.onDragStart(latest.current.product, { x: g.moveX || e.nativeEvent.pageX, y: g.moveY || e.nativeEvent.pageY });
    },
    onPanResponderMove: (e, g) => latest.current.onDragMove({ x: g.moveX || e.nativeEvent.pageX, y: g.moveY || e.nativeEvent.pageY }),
    onPanResponderRelease: (e, g) => {
      active.current = false; armed.current = false;
      latest.current.onDragEnd({ x: g.moveX || e.nativeEvent.pageX, y: g.moveY || e.nativeEvent.pageY });
    },
    onPanResponderTerminate: () => { active.current = false; armed.current = false; latest.current.onDragEnd({ x: 0, y: 0 }, true); },
    onPanResponderTerminationRequest: () => !active.current,
  }), []);
  return <View style={[s.product, { width }]}>
    <View {...responder.panHandlers} testID={`market-product-drag-${product.id}`} accessibilityLabel={`${product.name} 상품`}
      onTouchStart={() => { armed.current = false; clearHold(); hold.current = setTimeout(() => { armed.current = true; }, 180); }}
      onTouchEnd={() => { clearHold(); armed.current = false; }}
      style={[s.artStage, { height: surfaceY - 22, opacity: unavailable ? 0.23 : dragging ? 0.25 : 1 }]}>
      {!unavailable ? <View pointerEvents="none" style={s.productShadow}/> : null}
      <ProductArt product={product} size={artworkSize}/>
    </View>
    {Platform.OS === 'web' && !unavailable ? (
      <View {...responder.panHandlers} accessibilityLabel={`${product.name} 옮기기 손잡이`}
        onTouchStart={() => { clearHold(); armed.current = true; }}
        onTouchEnd={() => { clearHold(); armed.current = false; }} style={s.dragHandle}>
        <Ionicons accessible={false} name="hand-left-outline" size={14} color="#70816E"/>
      </View>
    ) : null}
    <View style={s.priceTag}>
      <Text numberOfLines={2} style={s.productName}>{product.name}</Text>
      <Text numberOfLines={1} style={s.productDetail}>{product.detail}</Text>
      <Text style={s.price}>{price(product.price)}</Text>
    </View>
    {unavailable ? <View accessibilityLabel={`${product.name} 품절`} style={s.soldOut}><Text style={s.soldOutText}>품절</Text></View>
      : <PressScale accessibilityLabel={quantity === 0 ? `${product.name} 담기` : `${product.name} 한 개 더 담기`} accessibilityRole="button" onPress={onAdd} style={s.add}>
        <Ionicons color="#456A55" name="add" size={17}/><Text style={s.addText}>담기</Text>
      </PressScale>}

  </View>;
}

const s = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 70 },
  scene: { flex: 1, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, backgroundColor: '#FAF8F0' },
  back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 10 },
  backText: { fontFamily: fonts.cafe24Ssurround, fontSize: 14, color: '#405C50' },
  heading: { flex: 1, alignItems: 'center' },
  eyebrow: { fontFamily: fonts.medium, fontSize: 10, color: '#839084', marginBottom: 3 },
  title: { fontFamily: fonts.cafe24Ssurround, fontSize: 23, color: '#334A3B' },
  budget: { minWidth: 75, alignItems: 'flex-end' },
  budgetLabel: { color: '#7C877A', fontFamily: fonts.medium, fontSize: 10 },
  budgetValue: { color: '#3B5D48', fontFamily: fonts.bold, fontSize: 14, marginTop: 4 },
  instruction: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 11, paddingHorizontal: 12 },
  instructionText: { fontFamily: fonts.medium, color: '#657565', fontSize: 11, flexShrink: 1 },
  scroll: { flex: 1 },
  shelfContent: { flexGrow: 1, width: '100%', maxWidth: 1240, alignSelf: 'center', paddingTop: 2, paddingBottom: 14 },
  bay: { alignSelf: 'center', marginBottom: 6, overflow: 'hidden', backgroundColor: '#FBF5E9' },
  bayArt: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  productRow: { flex: 1, flexDirection: 'row', justifyContent: 'flex-start' },
  product: { alignItems: 'center', paddingHorizontal: 3, paddingTop: 22, paddingBottom: 6 },
  artStage: { flexShrink: 0, width: '100%', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 2, ...Platform.select({ web: { cursor: 'grab', touchAction: 'pan-y', userSelect: 'none' } as never, default: {} }) },
  dragHandle: { position: 'absolute', right: 5, top: 29, width: 34, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#F8F7EC', ...Platform.select({ web: { cursor: 'grab', touchAction: 'none', userSelect: 'none' } as never, default: {} }) },
  productShadow: { width: '60%', height: 9, borderRadius: 100, backgroundColor: 'rgba(86,65,42,0.10)', position: 'absolute', bottom: 3 },
  priceTag: { alignItems: 'center', paddingHorizontal: 3, paddingTop: 5, paddingBottom: 3, width: '94%', maxWidth: 132, height: 78, flexShrink: 0, backgroundColor: '#FFFCF2', borderRadius: 3 },
  productName: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, textAlign: 'center', color: '#3F483D', height: 32 },
  productDetail: { fontFamily: fonts.medium, fontSize: 9, lineHeight: 14, color: '#7B796C' },
  price: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 19, color: '#344D3C' },
  add: { flexDirection: 'row', height: 44, marginTop: 4, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: '#F9F8F0', borderRadius: 22 },
  addText: { fontFamily: fonts.semibold, fontSize: 11, color: '#456A55' },
  soldOut: { height: 44, marginTop: 4, justifyContent: 'center' }, soldOutText: { fontFamily: fonts.semibold, color: '#9C7163', fontSize: 12 },
  endNote: { textAlign: 'center', fontFamily: fonts.medium, fontSize: 11, color: '#879080', paddingTop: 7 },
  dock: { backgroundColor: '#FAF8EF', paddingTop: 8, paddingHorizontal: 14 },
  basketTarget: { maxWidth: 1212, width: '100%', alignSelf: 'center', minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, borderRadius: 20 },
  basketTargetCompact: { gap: 6, paddingHorizontal: 0 },
  basketDrawingCompact: { width: 36 },
  basketTitleCompact: { fontSize: 14 },
  basketTargetActive: { backgroundColor: '#618B6D' }, basketDrawing: { width: 48, alignItems: 'center' },
  basketCopy: { flex: 1, minHeight: 48, justifyContent: 'center' },
  basketTitle: { fontFamily: fonts.cafe24Ssurround, color: '#3F6049', fontSize: 16 },
  basketSubtitle: { fontFamily: fonts.medium, color: '#7B8675', fontSize: 10, marginTop: 5 },
  white: { color: '#FFFFFF' },
  leave: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 46, paddingHorizontal: 14, borderRadius: 24, backgroundColor: '#567E62' },
  leaveText: { fontFamily: fonts.cafe24Ssurround, fontSize: 12, color: '#FFFFFF' },
  basketItems: { maxHeight: 156, maxWidth: 1212, width: '100%', alignSelf: 'center' },
  basketHelp: { fontFamily: fonts.medium, color: '#667461', fontSize: 11, lineHeight: 16, paddingBottom: 6 },
  basketItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  basketItemCopy: { flex: 1 },
  basketItemName: { fontFamily: fonts.medium, color: '#4C5B49', fontSize: 12 },
  basketReturnLocation: { fontFamily: fonts.medium, color: '#667461', fontSize: 10, lineHeight: 14, marginTop: 3 },
  basketItemCount: { fontFamily: fonts.semibold, color: '#4C5B49', fontSize: 12 },
  basketRemove: { minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  basketRemoveText: { fontFamily: fonts.semibold, color: '#476052', fontSize: 12 },
  emptyBasket: { padding: 16, textAlign: 'center', fontFamily: fonts.medium, color: '#7B8675' },
  ghost: { position: 'absolute', left: 0, top: 0, width: 96, height: 96, zIndex: 100 },
});
