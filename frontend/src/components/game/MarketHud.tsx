import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PressScale } from '../PressScale';
import { fonts } from '../../theme';

export type MarketHudControlMode = 'joystick' | 'touch';
export type MarketHudProps = {
  objectives: readonly { id: string; label: string; quantity: number; quantityUnit?: string }[];
  score?: number;
  budget?: number;
  topInset?: number;
  controlMode?: MarketHudControlMode;
  onControlModeChange?: (mode: MarketHudControlMode) => void;
  onGiveUp: () => void;
  onOpenCart: () => void;
  onOpenHelp: () => void;
  replayListRef?: { current: ((fraction: number) => void) | null };
  onContactRequester?: () => void;
  onListVisibilityChange?: (open: boolean) => void;
};

/** A quiet shopping note: only the required quantities and explicit cart access. */
export function MarketHud({
  objectives, score, budget, topInset = 12, controlMode, onControlModeChange,
  onGiveUp, onOpenCart, onOpenHelp, replayListRef, onContactRequester, onListVisibilityChange,
}: MarketHudProps) {
  const list = useRef<ScrollView>(null);
  const extent = useRef({ viewport: 0, content: 0 });
  const [expanded, setExpanded] = useState(false);
  const [scroll, setScroll] = useState({ offset: 0, maximum: 0 });
  const expandedRef = useRef(false);
  const visibilityCallback = useRef(onListVisibilityChange);
  visibilityCallback.current = onListVisibilityChange;
  const showList = (open: boolean) => {
    expandedRef.current = open;
    setExpanded(open);
    visibilityCallback.current?.(open);
  };
  useEffect(() => () => { if (expandedRef.current) visibilityCallback.current?.(false); }, []);
  const updateExtent = () => setScroll(value => ({ ...value, maximum: Math.max(0, extent.current.content - extent.current.viewport) }));
  if (__DEV__ && replayListRef) replayListRef.current = fraction => {
    if (!list.current || !extent.current.viewport) throw new Error('Shopping list layout is not ready');
    list.current.scrollTo({ x: Math.max(0, extent.current.content - extent.current.viewport) * Math.max(0, Math.min(1, fraction)), animated: true });
  };
  useEffect(() => () => { if (replayListRef) replayListRef.current = null; }, [replayListRef]);
  return <View pointerEvents="box-none" style={[s.anchor, { top: topInset }]} testID="market-hud">
    <View style={s.card} testID="market-hud-card">
      <View style={s.header}>
        <Text style={s.title} numberOfLines={1}>하늘마트</Text>
        {budget !== undefined && <Text style={s.budget}>예산 {budget.toLocaleString('ko-KR')}원</Text>}
        {score !== undefined && <Text accessibilityLabel={'현재 점수 ' + score + '점'} style={[s.score, score < 100 && s.penalty]}>{score}점</Text>}
        {controlMode && onControlModeChange ? <PressScale accessibilityRole="button"
          accessibilityLabel={controlMode === 'joystick' ? '터치 이동으로 변경' : '조이스틱 이동으로 변경'}
          onPress={() => onControlModeChange(controlMode === 'joystick' ? 'touch' : 'joystick')}
          style={s.iconButton}>
          <Ionicons name={controlMode === 'joystick' ? 'hand-left-outline' : 'game-controller-outline'} color="#587565" size={20} />
        </PressScale> : null}
        {onContactRequester ? <PressScale accessibilityRole="button" accessibilityLabel="지영에게 전화" onPress={onContactRequester} style={s.iconButton}>
          <Ionicons name="call-outline" color="#587565" size={21} />
        </PressScale> : null}
        <PressScale accessibilityRole="button" accessibilityLabel="이용 방법" onPress={onOpenHelp} style={s.iconButton}>
          <Ionicons name="help-circle-outline" color="#68796D" size={22} />
        </PressScale>
        <PressScale accessibilityRole="button" accessibilityLabel="장보기 포기" onPress={onGiveUp} style={s.iconButton}>
          <Ionicons name="close" color="#68796D" size={21} />
        </PressScale>
      </View>
      <View style={s.noteRow}>
        <View style={s.note} testID="market-shopping-list">
          <ScrollView ref={list} horizontal showsHorizontalScrollIndicator style={s.itemsScroll}
            onLayout={event => { extent.current.viewport = event.nativeEvent.layout.width; updateExtent(); }}
            onContentSizeChange={width => { extent.current.content = width; updateExtent(); }}
            onScroll={event => setScroll(value => ({ ...value, offset: event.nativeEvent.contentOffset.x }))} scrollEventThrottle={32}
            contentContainerStyle={s.items} accessibilityLabel="사야 할 물품과 개수" keyboardShouldPersistTaps="handled">
            {objectives.map(objective => <View key={objective.id} style={s.item}>
              <Text style={s.itemName} numberOfLines={2}>{objective.label}</Text>
              <Text style={s.itemQuantity}>{objective.quantity}{objective.quantityUnit ?? '개'}</Text>
            </View>)}
          </ScrollView>
          {scroll.maximum > 1 ? <PressScale accessibilityRole="button"
            accessibilityLabel={scroll.offset >= scroll.maximum - 1 ? '처음 물품 보기' : '다음 물품 보기'}
            onPress={() => list.current?.scrollTo({ x: scroll.offset >= scroll.maximum - 1 ? 0 : Math.min(scroll.maximum, scroll.offset + extent.current.viewport * .8), animated: true })}
            style={s.nextItem}>
            <Ionicons name={scroll.offset >= scroll.maximum - 1 ? 'chevron-back' : 'chevron-forward'} color="#405D50" size={22} />
          </PressScale> : null}
        </View>
        <PressScale accessibilityRole="button" accessibilityLabel="구매 목록 전체 보기"
          accessibilityHint={`사야 할 물품 ${objectives.length}종의 이름과 개수를 모두 확인해요`}
          onPress={() => showList(true)} style={s.listButton}>
          <Ionicons name="list-outline" color="#405D50" size={24} />
          <Text style={s.cartLabel}>전체 목록</Text>
        </PressScale>
        <PressScale accessibilityRole="button" accessibilityLabel="장바구니 열기"
          accessibilityHint="내가 담은 물건과 개수를 확인해요" onPress={onOpenCart} style={s.cart}>
          <Ionicons name="basket-outline" color="#4C6758" size={24} />
          <Text style={s.cartLabel}>장바구니</Text>
        </PressScale>
      </View>
    </View>
    <Modal visible={expanded} transparent animationType="fade" onRequestClose={() => showList(false)}>
      <View style={s.listBackdrop}>
        <View style={s.fullList} accessibilityViewIsModal testID="market-shopping-list-expanded">
          <View style={s.fullListHeader}>
            <Text style={s.fullListTitle}>사야 할 물품 {objectives.length}종</Text>
            <PressScale accessibilityRole="button" accessibilityLabel="구매 목록 닫기" onPress={() => showList(false)} style={s.iconButton}>
              <Ionicons name="close" color="#405D50" size={24} />
            </PressScale>
          </View>
          <ScrollView style={s.fullListScroll} showsVerticalScrollIndicator contentContainerStyle={s.fullListItems}>
            {objectives.map(objective => <View key={objective.id} style={s.fullListItem}>
              <Text style={s.fullItemName}>{objective.label}</Text>
              <Text style={s.fullItemQuantity}>{objective.quantity}{objective.quantityUnit ?? '개'}</Text>
            </View>)}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
}

const s = StyleSheet.create({
  anchor: { position: 'absolute', left: 0, right: 0, paddingHorizontal: 12, alignItems: 'center', zIndex: 30 },
  card: {
    width: '100%', maxWidth: 420, borderRadius: 16, backgroundColor: '#F9F7F0',
    borderWidth: 1, borderColor: '#DFE2D7', overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 4px 16px rgba(47, 67, 52, 0.10)' },
      default: { shadowColor: '#2F4334', shadowOpacity: 0.10, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
    }),
  },
  header: { minHeight: 44, paddingLeft: 14, paddingRight: 2, flexDirection: 'row', alignItems: 'center', gap: 2 },
  listButton: { width: 70, minHeight: 52, borderRadius: 12, backgroundColor: '#E8EDDF', alignItems: 'center', justifyContent: 'center', gap: 2, marginRight: 6 },
  title: { flex: 1, color: '#405D50', fontFamily: fonts.laundryBold, fontSize: 17, lineHeight: 24 },
  budget: { color: '#536457', fontFamily: fonts.medium, fontSize: 12, lineHeight: 18, marginRight: 4 },
  score: { color: '#647668', fontFamily: fonts.semibold, fontSize: 13, lineHeight: 20, fontVariant: ['tabular-nums'], marginRight: 4 },
  penalty: { color: '#9A604E' },
  iconButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  noteRow: { flexDirection: 'row', minHeight: 62, paddingBottom: 10, paddingRight: 10, alignItems: 'center' },
  note: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  itemsScroll: { flex: 1, minWidth: 0 },
  nextItem: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  items: { alignItems: 'center', paddingHorizontal: 14, gap: 18 },
  item: { minWidth: 48, maxWidth: 128, gap: 3 },
  itemName: { color: '#536457', fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  itemQuantity: { color: '#405D50', fontFamily: fonts.bold, fontSize: 16, lineHeight: 20, fontVariant: ['tabular-nums'] },
  cart: { width: 70, minHeight: 52, borderRadius: 12, backgroundColor: '#E8EDDF', alignItems: 'center', justifyContent: 'center', gap: 2 },
  cartLabel: { color: '#4C6758', fontFamily: fonts.medium, fontSize: 11, lineHeight: 15 },
  listBackdrop: { flex: 1, backgroundColor: 'rgba(35, 48, 40, .35)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  fullList: { width: '100%', maxWidth: 440, maxHeight: '80%', borderRadius: 18, backgroundColor: '#F9F7F0', padding: 16 },
  fullListHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  fullListTitle: { flex: 1, color: '#405D50', fontFamily: fonts.bold, fontSize: 18 },
  fullListScroll: { flexGrow: 0 },
  fullListItems: { gap: 12, paddingBottom: 4 },
  fullListItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#DFE2D7' },
  fullItemName: { flex: 1, color: '#405D50', fontFamily: fonts.medium, fontSize: 15, lineHeight: 23 },
  fullItemQuantity: { color: '#405D50', fontFamily: fonts.bold, fontSize: 18 },
});
