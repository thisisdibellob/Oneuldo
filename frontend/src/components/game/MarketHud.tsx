import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { PressScale } from '../PressScale';
import { fonts } from '../../theme';
import { getMarketHudActionsRect, MARKET_HUD_LAYOUT as layout } from '../../game/marketHudLayout';

export type MarketHudControlMode = 'joystick' | 'touch';
export type MarketHudProps = {
  objectives: readonly { id: string; label: string; quantity: number; quantityUnit?: string }[];
  score?: number;
  budget?: number;
  topInset?: number;
  bottomSafeArea?: number;
  controlMode?: MarketHudControlMode;
  onControlModeChange?: (mode: MarketHudControlMode) => void;
  onGiveUp: () => void;
  onOpenCart: () => void;
  onOpenHelp: () => void;
  replayListRef?: { current: ((fraction: number) => void) | null };
  replayListVisibilityRef?: { current: ((open: boolean) => void) | null };
  onContactRequester?: () => void;
  onListVisibilityChange?: (open: boolean) => void;
  /**
   * 사람이 플레이할 때의 간단한 HUD: 위쪽 긴 박스를 없애고(소지금·예산은 게임 HUD 오른쪽 위에 표시),
   * 이용 방법·이동 방식·전화·포기 버튼은 보여 주지 않는다(포기는 따로 정할 예정). 페르소나 재생·에이전트는 기존 HUD를 그대로 쓴다.
   */
  compact?: boolean;
};

/** The shopping note is opened explicitly; the world HUD only keeps its buttons. */
export function MarketHud({
  objectives, score, budget, topInset = 12, bottomSafeArea = 0, controlMode, onControlModeChange,
  onGiveUp, onOpenCart, onOpenHelp, replayListRef, replayListVisibilityRef, onContactRequester, onListVisibilityChange,
  compact = false,
}: MarketHudProps) {
  const list = useRef<ScrollView>(null);
  const viewport = useWindowDimensions();
  const actions = getMarketHudActionsRect({ viewport, fontScale: viewport.fontScale, safeArea: { top: 0, bottom: bottomSafeArea } });
  const extent = useRef({ viewport: 0, content: 0 });
  const [expanded, setExpanded] = useState(false);
  const expandedRef = useRef(false);
  const visibilityCallback = useRef(onListVisibilityChange);
  visibilityCallback.current = onListVisibilityChange;
  const showList = (open: boolean) => {
    if (expandedRef.current === open) return;
    expandedRef.current = open;
    setExpanded(open);
    if (!open) extent.current = { viewport: 0, content: 0 };
    visibilityCallback.current?.(open);
  };
  useEffect(() => () => { if (expandedRef.current) visibilityCallback.current?.(false); }, []);
  if (__DEV__ && replayListRef) replayListRef.current = fraction => {
    if (!expandedRef.current || !list.current) throw new Error('Open the shopping list before scrolling');
    list.current.scrollTo({ y: Math.max(0, extent.current.content - extent.current.viewport) * Math.max(0, Math.min(1, fraction)), animated: true });
  };
  if (__DEV__ && replayListVisibilityRef) replayListVisibilityRef.current = showList;
  useEffect(() => () => { if (replayListRef) replayListRef.current = null; }, [replayListRef]);
  useEffect(() => () => { if (replayListVisibilityRef) replayListVisibilityRef.current = null; }, [replayListVisibilityRef]);
  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill} testID="market-hud">
    {compact ? null : <View pointerEvents="box-none" style={[s.anchor, { top: topInset }]} testID="market-hud-header">
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
    </View>
    </View>}
      <View pointerEvents="box-none" testID="market-hud-actions" style={[s.noteRow, {
        left: actions.left, bottom: viewport.height - actions.bottom, width: actions.right - actions.left,
        height: actions.bottom - actions.top,
      }]}>
        <PressScale accessibilityRole="button" accessibilityLabel="구매 목록 전체 보기"
          accessibilityState={{ expanded }}
          accessibilityHint="사야 할 물품의 이름과 개수를 확인해요"
          onPress={() => showList(true)} style={s.actionButton}>
          <Ionicons name="reader" color="#405D50" size={layout.cartIconSize} />
          <Text style={s.cartLabel}>목록 보기</Text>
        </PressScale>
        <PressScale accessibilityRole="button" accessibilityLabel="장바구니 열기"
          accessibilityHint="내가 담은 물건과 개수를 확인해요" onPress={onOpenCart} style={s.actionButton}>
          <Ionicons name="basket" color="#4C6758" size={layout.cartIconSize} />
          <Text style={s.cartLabel}>장바구니</Text>
        </PressScale>
      </View>
    <Modal visible={expanded} transparent animationType="fade" onRequestClose={() => showList(false)}>
      <View style={s.listBackdrop}>
        <View style={s.fullList} accessibilityViewIsModal testID="market-shopping-list-expanded">
          <View style={s.fullListHeader}>
            <Text style={s.fullListTitle}>사야 할 물품</Text>
            <PressScale accessibilityRole="button" accessibilityLabel="구매 목록 닫기" onPress={() => showList(false)} style={s.iconButton}>
              <Ionicons name="close" color="#405D50" size={24} />
            </PressScale>
          </View>
          <ScrollView ref={list} style={s.fullListScroll} showsVerticalScrollIndicator
            accessibilityLabel="사야 할 물품과 개수" keyboardShouldPersistTaps="handled"
            onLayout={event => { extent.current.viewport = event.nativeEvent.layout.height; }}
            onContentSizeChange={(_width, height) => { extent.current.content = height; }}
            contentContainerStyle={s.fullListItems}>
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
  anchor: { position: 'absolute', left: 0, right: 0, paddingHorizontal: layout.horizontalPadding, alignItems: 'center', zIndex: 30 },
  card: {
    width: '100%', maxWidth: layout.maxWidth, borderRadius: 16, backgroundColor: '#F9F7F0',
    borderWidth: 0, overflow: 'hidden',
  },
  header: { minHeight: layout.headerMinHeight, paddingLeft: 14, paddingRight: 2, flexDirection: 'row', alignItems: 'center', gap: 2 },
  title: { flex: 1, color: '#405D50', fontFamily: fonts.laundryBold, fontSize: 17, lineHeight: layout.titleLineHeight },
  budget: { color: '#536457', fontFamily: fonts.medium, fontSize: 12, lineHeight: 18, marginRight: 4 },
  score: { color: '#647668', fontFamily: fonts.semibold, fontSize: 13, lineHeight: 20, fontVariant: ['tabular-nums'], marginRight: 4 },
  penalty: { color: '#9A604E' },
  iconButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  noteRow: { position: 'absolute', flexDirection: 'row', alignItems: 'stretch', gap: 8, zIndex: 30 },
  // Both buttons share the lower rect used by replay perception.
  actionButton: {
    flex: 1, minWidth: 44, minHeight: layout.cartMinHeight, borderRadius: 12,
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', gap: layout.cartGap,
    ...Platform.select({
      web: { boxShadow: '0 3px 12px rgba(35,48,40,0.12)' },
      default: { shadowColor: '#233028', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3 },
    }),
  },
  cartLabel: { color: '#4C6758', fontFamily: fonts.medium, fontSize: layout.cartLabelFontSize, lineHeight: layout.cartLabelLineHeight },
  listBackdrop: { flex: 1, backgroundColor: 'rgba(35, 48, 40, .35)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  fullList: { width: '100%', maxWidth: 440, maxHeight: '80%', borderRadius: 18, backgroundColor: '#F9F7F0', padding: 16 },
  fullListHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  fullListTitle: { flex: 1, color: '#405D50', fontFamily: fonts.bold, fontSize: 18 },
  fullListScroll: { flexGrow: 0 },
  fullListItems: { gap: 12, paddingBottom: 4 },
  fullListItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  fullItemName: { flex: 1, color: '#405D50', fontFamily: fonts.medium, fontSize: 15, lineHeight: 23 },
  fullItemQuantity: { color: '#405D50', fontFamily: fonts.bold, fontSize: 18 },
});
