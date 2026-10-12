import { Ionicons } from '@expo/vector-icons';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, BackHandler, Easing, Image, Modal, PanResponder,
  Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
  type GestureResponderEvent, type PointerEvent as ReactNativePointerEvent,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { PressScale } from '../PressScale';
import { useMarketReducedMotion } from './MarketPanelTransition';
import { getMarketProductImage } from '../../game/marketProductImages';
import { getMarketShelfLayout } from '../../game/marketShelfLayout';
import {
  getCartQuantity, MarketCart, MarketCategory, MarketProduct,
  marketCategories, marketProducts,
} from '../../game/scenarios';
import { fonts } from '../../theme';
import type { ReplayShelfPort, ReplayBounds } from '../../replay/ports';

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
  replayPortRef?: { current: ReplayShelfPort | null };
};

const price = (value: number) => `${value.toLocaleString('ko-KR')}원`;
// This is an empty bay: all products, stock, labels and controls remain real UI.
const shelfBay = require('../../../assets/images/game/market/interior/shelf_bay_v2.png');
const SHELF_MATERIAL = '#FBF5E9';

function ProductArt({ product, size }: { product: MarketProduct; size: number }) {
  const source = getMarketProductImage(product.id);
  const [failed, setFailed] = useState(false);
  return source && !failed ? (
    <Image accessible={false} onError={() => setFailed(true)} resizeMode="contain" source={source} style={{ width: size, height: size }} />
  ) : <Ionicons accessible={false} color={product.color} name={product.icon} size={size * 0.6} />;
}

/** A camera-like close-up over the existing map. Closing never changes world position. */
export function MarketShelfScene({ slots, stock, onCartVisibilityChange, cart, category, onChangeQuantity,
  onClose, onDropProduct, replayPortRef }: MarketShelfSceneProps) {
  const viewport = useWindowDimensions();
  const insets = useContext(SafeAreaInsetsContext);
  const [size, setSize] = useState({ width: viewport.width, height: viewport.height });
  const reducedMotion = useMarketReducedMotion();
  const [dragged, setDragged] = useState<MarketProduct | null>(null);
  const [overBasket, setOverBasket] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [gridHeight, setGridHeight] = useState<number>();
  const [measuredContentHeight, setMeasuredContentHeight] = useState<number>();
  const [basketExpanded, setBasketExpanded] = useState(false);
  const [basketPresent, setBasketPresent] = useState(false);
  const basketOpenRef = useRef(false);
  const [closing, setClosing] = useState(false);
  const scene = useRef(new Animated.Value(0)).current;
  const ghostPosition = useRef(new Animated.ValueXY()).current;
  const ghostScale = useRef(new Animated.Value(1)).current;
  const ghostOpacity = useRef(new Animated.Value(1)).current;
  const basketPulse = useRef(new Animated.Value(1)).current;
  const basketReveal = useRef(new Animated.Value(0)).current;
  const rootRef = useRef<View>(null);
  const basketRef = useRef<View>(null);
  const replayProducts = useRef(new Map<string, View>());
  const replayProductRows = useRef(new Map<string, View>());
  const shelfScroll = useRef<ScrollView>(null);
  const rootBounds = useRef<Bounds>({ x: 0, y: 0, width: size.width, height: size.height });
  const basketBounds = useRef<Bounds | null>(null);
  const closingRef = useRef(false);
  const mounted = useRef(true);
  const currentDrag = useRef<MarketProduct | null>(null);
  const dragOrigin = useRef<Point>({ x: 0, y: 0 });
  const callbacks = useRef({ onClose, onDropProduct, onCartVisibilityChange });
  callbacks.current = { onClose, onDropProduct, onCartVisibilityChange };
  const products = useMemo(() => slots ? slots.map(id => marketProducts.find(p => p.id === id)!).filter(Boolean) : marketProducts.filter(p => p.categoryId === category.id).slice(0,12), [category.id, slots]);
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const basketVisible = basketExpanded;
  const compactDock = size.width < 360;
  const { bayWidth, columns, rowHeight, surfaceY, imageHeight, imageTop, sideInset, itemWidth, artworkSize,
    compactRows, tagHeight, buttonHeight, contentHeight, availableHeight } =
    getMarketShelfLayout(size.width, size.height, products.length, (insets?.top ?? 0) + (insets?.bottom ?? 0), viewport.fontScale, gridHeight);
  const canScroll = (measuredContentHeight ?? contentHeight) > availableHeight + 1;
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
  const changeBasketVisibility = useCallback((open: boolean) => {
    if (basketOpenRef.current === open || (open && currentDrag.current)) return;
    basketOpenRef.current = open;
    if (open) setBasketPresent(true);
    setBasketExpanded(open);
    callbacks.current.onCartVisibilityChange?.(open);
  }, []);
  useEffect(() => {
    let active = true;
    basketReveal.stopAnimation();
    if (reducedMotion) {
      basketReveal.setValue(basketVisible ? 1 : 0);
      if (!basketVisible) setBasketPresent(false);
      return;
    }
    const reveal = Animated.timing(basketReveal, {
      toValue: basketVisible ? 1 : 0, duration: 220,
      easing: Easing.inOut(Easing.cubic), useNativeDriver: true,
    });
    reveal.start(({ finished }) => { if (active && finished && !basketVisible) setBasketPresent(false); });
    return () => { active = false; reveal.stop(); };
  }, [basketReveal, basketVisible, reducedMotion]);
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
    setDragActive(false);
    setClosing(true);
    if (reducedMotion) { callbacks.current.onClose(); return; }
    Animated.timing(scene, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true })
      .start(({ finished }) => { if (finished && mounted.current) callbacks.current.onClose(); });
  }, [reducedMotion, scene]);
  const goBack = useCallback(() => {
    if (basketPresent) { changeBasketVisibility(false); return; }
    close();
  }, [basketPresent, changeBasketVisibility, close]);
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => { goBack(); return true; });
    if (Platform.OS !== 'web') return () => back.remove();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); goBack(); }
    };
    window.addEventListener('keydown', escape, true);
    return () => { back.remove(); window.removeEventListener('keydown', escape, true); };
  }, [goBack]);

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
    setDragActive(true);
    moveDrag(point);
  }, [ghostOpacity, ghostPosition, ghostScale, measure, moveDrag]);
  const finishDrag = useCallback((point: Point, cancelled = false) => {
    if (!mounted.current) return;
    setDragActive(false);
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
      ]).start(({ finished }) => { if (finished && mounted.current && !currentDrag.current) setDragged(null); });
      return;
    }
    const animations = [Animated.timing(ghostOpacity, { toValue: 0, duration: reducedMotion ? 0 : 150, useNativeDriver: false })];
    if (accepted && b) {
      animations.push(Animated.timing(ghostPosition, { toValue: { x: b.x + b.width / 2 - rootBounds.current.x - 48, y: b.y - rootBounds.current.y - 30 }, duration: reducedMotion ? 0 : 150, useNativeDriver: false }));
      animations.push(Animated.timing(ghostScale, { toValue: 0.45, duration: reducedMotion ? 0 : 150, useNativeDriver: false }));
    }
    Animated.parallel(animations).start(({ finished }) => { if (finished && mounted.current && !currentDrag.current) setDragged(null); });
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

  if (__DEV__ && replayPortRef) {
    const measured = (view: View | null): Promise<ReplayBounds> => new Promise((resolve, reject) => {
      if (!view) { reject(new Error('Replay target is not mounted')); return; }
      const timeout = setTimeout(() => reject(new Error('Replay target measurement timed out')), 1500);
      view.measureInWindow((x, y, width, height) => {
        clearTimeout(timeout);
        if (width <= 0 || height <= 0) reject(new Error('Replay target has no visible bounds'));
        else resolve({ x, y, width, height });
      });
    });
    replayPortRef.current = {
      measure: async (productId, options) => {
        const productIndex = products.findIndex(p => p.id === productId);
        if (productIndex < 0) throw new Error('Product is not on this shelf');
        if (basketOpenRef.current) throw new Error('Close the cart before dragging');
        if (!options?.visibleOnly) {
          const row = Math.floor(productIndex / columns);
          shelfScroll.current?.scrollTo({ y: Math.max(0, row * rowHeight - 20), animated: true });
          await new Promise(resolve => setTimeout(resolve, 420));
        }
        const [product, basket, root, grid, productRow] = await Promise.all([
          measured(replayProducts.current.get(productId) ?? null), measured(basketRef.current), measured(rootRef.current),
          options?.visibleOnly ? measured(shelfScroll.current as unknown as View | null) : Promise.resolve(null),
          options?.visibleOnly ? measured(replayProductRows.current.get(productId) ?? null) : Promise.resolve(null),
        ]);
        const center = { x: product.x + product.width / 2, y: product.y + product.height / 2 };
        if (center.x < root.x || center.x > root.x + root.width || center.y < root.y || center.y >= basket.y) {
          throw new Error('Product is outside the visible shelf; no hidden drag allowed');
        }
        if (grid && productRow && (productRow.y < grid.y - 1 || productRow.y + productRow.height > grid.y + grid.height + 1
          || productRow.x < grid.x - 1 || productRow.x + productRow.width > grid.x + grid.width + 1)) {
          throw new Error('Read the visible product row before dragging; explicit browsing is required');
        }
        return { product, basket };
      },
      scroll: fraction => shelfScroll.current?.scrollTo({ y: Math.max(0, contentHeight - availableHeight) * fraction, animated: true }),
      start: (productId, point) => {
        const product = products.find(p => p.id === productId);
        if (!product || (stock && (stock[productId] ?? 0) <= getCartQuantity(cart, productId))) throw new Error('Product is unavailable');
        startDrag(product, point);
      },
      move: moveDrag, finish: finishDrag, close, viewCart: changeBasketVisibility,
      remove: productId => {
        if (!basketOpenRef.current || !products.some(p => p.id === productId) || getCartQuantity(cart, productId) < 1) {
          throw new Error('Return requires an open cart at the product shelf');
        }
        onChangeQuantity(productId, -1);
      },
    };
  }
  useEffect(() => () => { if (replayPortRef) replayPortRef.current = null; }, [replayPortRef]);

  return (
    <View accessibilityViewIsModal onAccessibilityEscape={goBack} ref={rootRef} testID="market-shelf-scene"
      onLayout={event => { const { width, height } = event.nativeEvent.layout; setSize({ width, height }); measure(); }}
      style={s.root}>
      <Animated.View testID="market-shelf-surface" pointerEvents={closing || basketPresent ? 'none' : 'auto'}
        accessibilityElementsHidden={basketPresent} importantForAccessibility={basketPresent ? 'no-hide-descendants' : 'auto'}
        style={[s.scene, { opacity: scene, transform: [{ scale: scene.interpolate({ inputRange: [0, 1], outputRange: [1.035, 1] }) }] }]}>
        <View pointerEvents="none" testID="market-shelf-material" style={[s.material, { width: bayWidth }]}>
          <View style={[s.materialRail, { left: 0, width: Math.max(6, bayWidth * 32 / 1536) }]} />
          <View style={[s.materialRail, { right: 0, width: Math.max(6, bayWidth * 32 / 1536) }]} />
        </View>
        <View testID="market-shelf-header" style={[s.header, { paddingTop: Math.max(10, insets?.top ?? 0) }]}>
          <PressScale accessibilityLabel="진열대 닫기" accessibilityRole="button" onPress={close} style={s.back}>
            <Ionicons color="#405C50" name="arrow-back" size={21} /><Text style={s.backText}>매장</Text>
          </PressScale>
          <View style={s.heading}>
            <Text accessibilityRole="header" style={s.title}>{category.label}</Text>
          </View>
          <View pointerEvents="none" style={s.headerBalance} />
        </View>
        <ScrollView ref={shelfScroll} testID="market-shelf-scroll" scrollEnabled={canScroll && !dragActive}
          onLayout={event => setGridHeight(event.nativeEvent.layout.height)}
          onContentSizeChange={(_width, height) => setMeasuredContentHeight(height)}
          showsVerticalScrollIndicator={canScroll} bounces={canScroll} overScrollMode={canScroll ? 'auto' : 'never'}
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
                    tagHeight={tagHeight} buttonHeight={buttonHeight} compactRows={compactRows}
                    quantity={getCartQuantity(cart, product.id)} unavailable={unavailable}
                    dragging={dragged?.id === product.id}
                    replayMeasureRef={__DEV__ && replayPortRef ? node => { if (node) replayProducts.current.set(product.id, node); else replayProducts.current.delete(product.id); } : undefined}
                    replayRowMeasureRef={__DEV__ && replayPortRef ? node => { if (node) replayProductRows.current.set(product.id, node); else replayProductRows.current.delete(product.id); } : undefined}
                    onAdd={() => onChangeQuantity(product.id, 1)}
                    onDragStart={startDrag} onDragMove={moveDrag} onDragEnd={finishDrag} />;
                })}
              </View>
            </View>
          ))}
        </ScrollView>
        <Animated.View style={[s.dock, { paddingBottom: Math.max(10, insets?.bottom ?? 0), transform: [{ scale: basketPulse }] }]}>
          <View ref={basketRef} collapsable={false} onLayout={measure} testID="market-shelf-basket-dock"
            accessibilityLabel="상품을 놓을 장바구니" style={[s.basketTarget, compactDock && s.basketTargetCompact, overBasket && s.basketTargetActive]}>
            <View style={[s.basketDrawing, compactDock && s.basketDrawingCompact]}><Ionicons color={overBasket ? '#FFFFFF' : '#527463'} name="basket" size={compactDock ? 34 : 42}/></View>
            <Pressable accessibilityRole="button" accessibilityLabel="진열대 장바구니 보기" disabled={dragActive} onPress={() => changeBasketVisibility(true)} style={s.basketCopy}>
              <Text style={[s.basketTitle, compactDock && s.basketTitleCompact, overBasket && s.white]}>{overBasket ? '여기에 놓아요!' : basketExpanded ? `장바구니 · ${count}개` : '장바구니'}</Text>
              <Text style={[s.basketSubtitle, overBasket && s.white]}>{dragged ? '상품을 아래로 끌어 놓아요' : compactDock ? '보기' : '담은 상품 보기'}</Text>
            </Pressable>
            <PressScale accessibilityLabel="진열대에서 매장으로 돌아가기" accessibilityRole="button" onPress={close} style={s.leave}>
              <Text style={s.leaveText}>다 골랐어요</Text>{!compactDock ? <Ionicons color="#FFFFFF" name="checkmark" size={18}/> : null}
            </PressScale>
          </View>
        </Animated.View>
      </Animated.View>
      <Modal visible={basketPresent} transparent animationType="none" statusBarTranslucent
        onRequestClose={() => changeBasketVisibility(false)}>
        <Animated.View testID="market-shelf-cart-reveal" style={[s.cartOverlay, { opacity: basketReveal }]}
          accessibilityElementsHidden={!basketVisible} importantForAccessibility={basketVisible ? 'auto' : 'no-hide-descendants'}>
          <Pressable accessible={false} testID="market-shelf-cart-backdrop" style={s.cartScrim}
            onPress={() => changeBasketVisibility(false)} />
          <View pointerEvents="box-none" style={[s.cartSafeArea, {
            paddingTop: Math.max(16, insets?.top ?? 0), paddingBottom: Math.max(16, insets?.bottom ?? 0),
          }]}>
            <Animated.View testID="market-shelf-cart-popup" accessibilityViewIsModal
              accessibilityLabel="담은 상품 장바구니" onAccessibilityEscape={() => changeBasketVisibility(false)}
              pointerEvents={basketVisible ? 'auto' : 'none'}
              style={[s.cartPopup, { maxHeight: Math.max(1, size.height - Math.max(16, insets?.top ?? 0) - Math.max(16, insets?.bottom ?? 0)),
                transform: [{ translateY: basketReveal.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) },
                  { scale: basketReveal.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }] }]}>
              <View style={s.cartHeader}>
                <View style={s.cartHeaderBalance} />
                <Text accessibilityRole="header" style={s.cartTitle}>장바구니</Text>
                <PressScale accessibilityRole="button" accessibilityLabel="진열대 장바구니 닫기"
                  onPress={() => changeBasketVisibility(false)} style={s.cartClose}>
                  <Ionicons color="#304B54" name="close" size={23} />
                </PressScale>
              </View>
              <ScrollView testID="market-shelf-cart-body" style={s.cartBody} bounces={false} nestedScrollEnabled>
                <Text style={s.basketHelp}>물건은 해당 진열대에서 한 개씩 내려놓아요. 종업원에게 도움을 요청해도 돼요.</Text>
                <ScrollView horizontal testID="market-shelf-cart-items" style={s.basketItems}
                  contentContainerStyle={s.basketItemList} showsHorizontalScrollIndicator nestedScrollEnabled
                  directionalLockEnabled bounces={false}>
                  {Object.entries(cart).filter(([, q]) => q > 0).map(([id, quantity]) => {
                    const product = marketProducts.find(p => p.id === id);
                    if (!product) return null;
                    const canReturnHere = product.categoryId === category.id;
                    const returnCategory = marketCategories.find(item => item.id === product.categoryId)!;
                    return <View key={id} testID={'market-shelf-cart-product-' + id} style={s.basketItem}>
                      <View style={s.basketItemArt}><ProductArt product={product} size={size.height < 500 ? 64 : 88}/></View>
                      <Text style={s.basketItemName}>{product.name}</Text>
                      <Text style={s.basketItemPrice}>개당 {price(product.price)}</Text>
                      <Text style={s.basketItemCount}>담은 수량 {quantity}개</Text>
                      {canReturnHere ? <PressScale accessibilityLabel={product.name + ' ' + product.detail + ' ' + price(product.price) + ' ' + category.label + ' 진열대에 1개 내려놓기'}
                        accessibilityRole="button" onPress={() => onChangeQuantity(id, -1)} style={s.basketRemove}>
                        <Ionicons color="#405D50" name="remove" size={15} />
                        <Text style={s.basketRemoveText}>1개 내려놓기</Text>
                      </PressScale> : <Text style={s.basketReturnLocation}>{returnCategory.label} 진열대에서 내려놓기</Text>}
                    </View>;
                  })}
                  {count === 0 ? <View style={s.emptyBasket}>
                    <Ionicons name="basket-outline" color="#809282" size={38} />
                    <Text style={s.emptyBasketText}>아직 담은 상품이 없어요</Text>
                  </View> : null}
                </ScrollView>
              </ScrollView>
            </Animated.View>
          </View>
        </Animated.View>
      </Modal>
      {dragged ? <Animated.View pointerEvents="none" style={[s.ghost, { opacity: ghostOpacity, transform: [...ghostPosition.getTranslateTransform(), { scale: ghostScale }] }]}>
        <ProductArt product={dragged} size={96}/>
      </Animated.View> : null}
    </View>
  );
}

export const MARKET_PRODUCT_HOLD_MS = 350;
const DRAG_SLOP = 8;

function ShelfProduct({ product, quantity, width, artworkSize, surfaceY, tagHeight, buttonHeight, compactRows, unavailable, dragging,
  onAdd, onDragStart, onDragMove, onDragEnd, replayMeasureRef, replayRowMeasureRef }: {
  product: MarketProduct; quantity: number; width: number; artworkSize: number; surfaceY: number;
  tagHeight: number; buttonHeight: number; compactRows: boolean; unavailable: boolean;
  dragging: boolean; onAdd: () => void;
  onDragStart: (product: MarketProduct, point: Point) => void; onDragMove: (point: Point) => void;
  onDragEnd: (point: Point, cancelled?: boolean) => void;
  replayMeasureRef?: (view: View | null) => void;
  replayRowMeasureRef?: (view: View | null) => void;
}) {
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(false);
  const origin = useRef<Point | null>(null);
  const lastPoint = useRef<Point>({ x: 0, y: 0 });
  const cleanWeb = useRef<(() => void) | null>(null);
  const latest = useRef({ product, onDragStart, onDragMove, onDragEnd, unavailable });
  latest.current = { product, onDragStart, onDragMove, onDragEnd, unavailable };
  const clearHold = () => { if (hold.current !== null) clearTimeout(hold.current); hold.current = null; };
  const end = (point: Point, cancelled = false) => {
    clearHold();
    origin.current = null;
    cleanWeb.current?.();
    cleanWeb.current = null;
    if (!active.current) return;
    active.current = false;
    latest.current.onDragEnd(point, cancelled);
  };
  const begin = (point: Point, capture?: () => void) => {
    end(lastPoint.current, true);
    if (latest.current.unavailable) return;
    origin.current = point;
    lastPoint.current = point;
    hold.current = setTimeout(() => {
      hold.current = null;
      if (!origin.current || latest.current.unavailable) return;
      active.current = true;
      capture?.();
      latest.current.onDragStart(latest.current.product, lastPoint.current);
    }, MARKET_PRODUCT_HOLD_MS);
  };
  const move = (point: Point) => {
    lastPoint.current = point;
    if (active.current) {
      latest.current.onDragMove(point);
    } else if (origin.current && Math.hypot(point.x - origin.current.x, point.y - origin.current.y) > DRAG_SLOP) {
      end(point, true);
    }
  };
  useEffect(() => () => end(lastPoint.current, true), []);
  useEffect(() => { if (unavailable) end(lastPoint.current, true); }, [unavailable]);

  const pointOf = (event: GestureResponderEvent): Point => ({
    x: event.nativeEvent.pageX, y: event.nativeEvent.pageY,
  });
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_event, gesture) => {
      if (latest.current.unavailable) return false;
      if (!active.current && Math.hypot(gesture.dx, gesture.dy) > DRAG_SLOP) end(lastPoint.current, true);
      return active.current;
    },
    onMoveShouldSetPanResponderCapture: () => active.current,
    onPanResponderGrant: () => {},
    onPanResponderMove: event => move(pointOf(event)),
    onPanResponderRelease: event => end(pointOf(event)),
    onPanResponderTerminate: event => end(pointOf(event), true),
    onPanResponderTerminationRequest: () => !active.current,
  }), []);

  const webPointerDown = (event: ReactNativePointerEvent) => {
    if (event.nativeEvent.button !== 0 || latest.current.unavailable) return;
    const pointer = event.nativeEvent;
    const target = event.currentTarget as unknown as {
      setPointerCapture?: (id: number) => void; releasePointerCapture?: (id: number) => void;
    };
    begin({ x: pointer.clientX, y: pointer.clientY }, () => {
      try { target.setPointerCapture?.(pointer.pointerId); } catch {}
    });
    const pointerMove = (next: PointerEvent) => {
      if (next.pointerId !== pointer.pointerId) return;
      if (active.current && next.cancelable) next.preventDefault();
      move({ x: next.clientX, y: next.clientY });
    };
    const pointerEnd = (next: PointerEvent) => {
      if (next.pointerId === pointer.pointerId) end({ x: next.clientX, y: next.clientY }, next.type !== 'pointerup');
    };
    const cancel = () => end(lastPoint.current, true);
    const preventActiveTouchScroll = (next: TouchEvent) => {
      // touch-action is fixed at pointerdown; prevent scrolling only after hold.
      if (active.current && next.cancelable) next.preventDefault();
    };
    window.addEventListener('pointermove', pointerMove, { passive: false });
    window.addEventListener('pointerup', pointerEnd);
    window.addEventListener('pointercancel', pointerEnd);
    window.addEventListener('blur', cancel);
    window.addEventListener('touchmove', preventActiveTouchScroll, { passive: false, capture: true });
    cleanWeb.current = () => {
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', pointerEnd);
      window.removeEventListener('pointercancel', pointerEnd);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('touchmove', preventActiveTouchScroll, true);
      try { target.releasePointerCapture?.(pointer.pointerId); } catch {}
    };
  };
  const webOnly = Platform.OS === 'web' ? {
    onPointerDown: webPointerDown,
    onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
    onDragStart: (event: { preventDefault: () => void }) => event.preventDefault(),
  } : {};
  return <View ref={replayRowMeasureRef} testID={'market-product-row-' + product.id} style={[s.product, { width }, compactRows && s.productCompact]}>
    <View ref={replayMeasureRef} {...(Platform.OS === 'web' ? {} : responder.panHandlers)} {...webOnly}
      testID={'market-product-drag-' + product.id} accessibilityLabel={product.name + ' 상품'}
      onTouchStart={Platform.OS === 'web' ? undefined : event => begin(pointOf(event))}
      onTouchMove={Platform.OS === 'web' ? undefined : event => move(pointOf(event))}
      onTouchEnd={Platform.OS === 'web' ? undefined : event => end(pointOf(event))}
      onTouchCancel={Platform.OS === 'web' ? undefined : event => end(pointOf(event), true)}
      style={[s.artStage, {
        height: compactRows ? '100%' : surfaceY - 6,
        width: compactRows ? artworkSize + 2 : '100%',
        opacity: unavailable ? 0.23 : dragging ? 0.25 : 1,
      }]}>
      {!unavailable ? <View pointerEvents="none" style={s.productShadow}/> : null}
      <ProductArt product={product} size={artworkSize}/>
    </View>
    <View style={[s.priceTag, { height: tagHeight }, compactRows && s.priceTagCompact]} testID={'market-product-label-' + product.id}>
      <View pointerEvents="none" style={s.tagPin}/>
      <Text numberOfLines={2} style={[s.productName, compactRows && s.productNameCompact]}>{product.name}</Text>
      <Text numberOfLines={1} style={[s.productDetail, compactRows && s.productDetailCompact]}>{product.detail}</Text>
      <Text style={s.price}>{price(product.price)}</Text>
    </View>
    {unavailable ? <View accessibilityLabel={product.name + ' 품절'} style={[s.soldOut, { minHeight: buttonHeight }, compactRows && s.addCompact]}><Text style={s.soldOutText}>품절</Text></View>
      : <PressScale accessibilityLabel={product.name + ' ' + product.detail + ' ' + price(product.price) + ' 담기'}
        accessibilityHint={'현재 담은 수량 ' + quantity + '개. 상품을 0.35초 동안 누른 다음 장바구니로 끌어 담을 수도 있어요'}
        accessibilityRole="button" onPress={onAdd} style={[s.add, { minHeight: buttonHeight }, compactRows && s.addCompact]}>
        <Ionicons color="#456A55" name="add" size={17}/>{!compactRows ? <Text style={s.addText}>담기</Text> : null}
      </PressScale>}
  </View>;
}

const s = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, zIndex: 70 },
  scene: { flex: 1, overflow: 'hidden', backgroundColor: SHELF_MATERIAL },
  material: { position: 'absolute', top: 0, bottom: 0, alignSelf: 'center', backgroundColor: SHELF_MATERIAL },
  materialRail: { position: 'absolute', top: 0, bottom: 0, backgroundColor: '#E7DAC6', borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#B6A18D' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, backgroundColor: 'transparent' },
  back: { width: 72, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 10 },
  backText: { fontFamily: fonts.semibold, fontSize: 14, color: '#405C50' },
  heading: { flex: 1, alignItems: 'center' },
  headerBalance: { width: 72 },
  title: { fontFamily: fonts.laundryBold, fontSize: 23, textAlign: 'center', color: '#304B54' },
  scroll: { flex: 1 },
  shelfContent: { width: '100%', maxWidth: 1240, alignSelf: 'center', paddingVertical: 4, gap: 4 },
  bay: { alignSelf: 'center', overflow: 'hidden', backgroundColor: 'transparent' },
  bayArt: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  productRow: { flex: 1, flexDirection: 'row', justifyContent: 'flex-start' },
  product: { alignItems: 'center', paddingHorizontal: 3, paddingTop: 6, paddingBottom: 4 },
  productCompact: { flexDirection: 'row', justifyContent: 'center', gap: 3, paddingTop: 4, paddingBottom: 4 },
  artStage: { flexShrink: 0, width: '100%', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 2, ...Platform.select({ web: { cursor: 'grab', touchAction: 'pan-y', userSelect: 'none' } as never, default: {} }) },
  productShadow: { width: '60%', height: 9, borderRadius: 100, backgroundColor: 'rgba(86,65,42,0.10)', position: 'absolute', bottom: 3 },
  priceTag: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, paddingVertical: 3, width: '96%', maxWidth: 160, flexShrink: 0, backgroundColor: '#FFFBEF', borderRadius: 8, borderWidth: 1, borderColor: '#D9CCB1', borderBottomWidth: 3, borderBottomColor: '#C8BB9B', transform: [{ rotate: '-0.8deg' }] },
  priceTagCompact: { flex: 1, flexShrink: 1, width: 'auto', transform: [{ rotate: '-0.8deg' }] },
  tagPin: { width: 14, height: 2, borderRadius: 1, backgroundColor: '#CBBF9B', position: 'absolute', top: 1 },
  productName: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, textAlign: 'center', color: '#304B54' },
  productNameCompact: { fontSize: 11, lineHeight: 14 },
  productDetail: { fontFamily: fonts.medium, fontSize: 9, lineHeight: 12, color: '#70776F' },
  productDetailCompact: { fontSize: 9, lineHeight: 12 },
  price: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: '#304B54' },
  add: { flexDirection: 'row', minHeight: 44, marginTop: 4, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: '#E5EDDF', borderRadius: 12, borderWidth: 1, borderColor: '#CFDBC8' },
  addText: { fontFamily: fonts.semibold, fontSize: 11, color: '#405D50' },
  addCompact: { width: 44, marginTop: 0, paddingHorizontal: 0 },
  soldOut: { minHeight: 44, marginTop: 4, justifyContent: 'center' }, soldOutText: { fontFamily: fonts.semibold, color: '#9C7163', fontSize: 12 },
  dock: { backgroundColor: 'transparent', paddingTop: 8, paddingHorizontal: 14 },
  basketTarget: { maxWidth: 1212, width: '100%', alignSelf: 'center', minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, borderRadius: 16, backgroundColor: '#E7EEDF' },
  basketTargetCompact: { gap: 6, paddingHorizontal: 0 },
  basketDrawingCompact: { width: 36 },
  basketTitleCompact: { fontSize: 14 },
  basketTargetActive: { backgroundColor: '#587565' }, basketDrawing: { width: 48, alignItems: 'center' },
  basketCopy: { flex: 1, minHeight: 48, justifyContent: 'center' },
  basketTitle: { fontFamily: fonts.laundryBold, color: '#304B54', fontSize: 16 },
  basketSubtitle: { fontFamily: fonts.medium, color: '#667278', fontSize: 10, marginTop: 5 },
  white: { color: '#FFFFFF' },
  leave: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 46, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#587565' },
  leaveText: { fontFamily: fonts.bold, fontSize: 12, color: '#FFFFFF' },
  cartOverlay: { flex: 1 },
  cartScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(32,44,39,0.42)' },
  cartSafeArea: { flex: 1, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  cartPopup: { width: '100%', maxWidth: 920, borderRadius: 24, backgroundColor: '#FBF5E9', borderWidth: 1, borderColor: '#D3C5AD', overflow: 'hidden' },
  cartHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  cartHeaderBalance: { width: 44 },
  cartTitle: { flex: 1, textAlign: 'center', fontFamily: fonts.laundryBold, fontSize: 23, color: '#304B54' },
  cartClose: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#EFE8D9' },
  cartBody: { flexShrink: 1 },
  basketItems: { width: '100%', flexGrow: 0 },
  basketItemList: { paddingHorizontal: 16, paddingBottom: 20, paddingTop: 4, gap: 12, alignItems: 'stretch' },
  basketHelp: { fontFamily: fonts.medium, color: '#667278', fontSize: 11, lineHeight: 16, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12, textAlign: 'center' },
  basketItem: { width: 164, alignItems: 'center', padding: 12, gap: 8, backgroundColor: '#FFFCF4', borderRadius: 16, borderWidth: 1, borderColor: '#E0D5C0' },
  basketItemArt: { alignItems: 'center', justifyContent: 'center', width: '100%', paddingVertical: 4 },
  basketItemName: { fontFamily: fonts.semibold, color: '#304B54', fontSize: 14, lineHeight: 19, textAlign: 'center' },
  basketItemPrice: { fontFamily: fonts.medium, color: '#667278', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  basketReturnLocation: { fontFamily: fonts.medium, color: '#667278', fontSize: 11, lineHeight: 16, textAlign: 'center', paddingVertical: 8, marginTop: 'auto' },
  basketItemCount: { fontFamily: fonts.bold, color: '#304B54', fontSize: 13, lineHeight: 18, backgroundColor: '#EEE8D8', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 10 },
  basketRemove: { width: '100%', minHeight: 44, paddingHorizontal: 8, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#E5EDDF', marginTop: 'auto' },
  basketRemoveText: { fontFamily: fonts.semibold, color: '#405D50', fontSize: 12 },
  emptyBasket: { width: '100%', minWidth: 240, alignItems: 'center', gap: 12, padding: 28 },
  emptyBasketText: { textAlign: 'center', fontFamily: fonts.medium, fontSize: 14, color: '#667278' },
  ghost: { position: 'absolute', left: 0, top: 0, width: 96, height: 96, zIndex: 100 },
});
