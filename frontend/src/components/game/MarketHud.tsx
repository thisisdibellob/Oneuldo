import { Ionicons } from '@expo/vector-icons';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PressScale } from '../PressScale';
import { fonts } from '../../theme';

export type MarketHudControlMode = 'joystick' | 'touch';
export type MarketHudProps = {
  objectives: readonly { id: string; label: string; quantity: number }[];
  score: number;
  topInset?: number;
  controlMode?: MarketHudControlMode;
  onControlModeChange?: (mode: MarketHudControlMode) => void;
  onGiveUp: () => void;
  onOpenCart: () => void;
  onOpenHelp: () => void;
  onContactRequester?: () => void;
};

/** A quiet shopping note: only the required quantities and explicit cart access. */
export function MarketHud({
  objectives, score, topInset = 12, controlMode, onControlModeChange,
  onGiveUp, onOpenCart, onOpenHelp, onContactRequester,
}: MarketHudProps) {
  return <View pointerEvents="box-none" style={[s.anchor, { top: topInset }]} testID="market-hud">
    <View style={s.card} testID="market-hud-card">
      <View style={s.header}>
        <Text style={s.title} numberOfLines={1}>하늘마트</Text>
        <Text accessibilityLabel={'현재 점수 ' + score + '점'} style={[s.score, score < 100 && s.penalty]}>{score}점</Text>
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.itemsScroll}
            contentContainerStyle={s.items} accessibilityLabel="사야 할 물품과 개수" keyboardShouldPersistTaps="handled">
            {objectives.map(objective => <View key={objective.id} style={s.item}>
              <Text style={s.itemName} numberOfLines={2}>{objective.label}</Text>
              <Text style={s.itemQuantity}>{objective.quantity}개</Text>
            </View>)}
          </ScrollView>
        </View>
        <PressScale accessibilityRole="button" accessibilityLabel="장바구니 열기"
          accessibilityHint="내가 담은 물건과 개수를 확인해요" onPress={onOpenCart} style={s.cart}>
          <Ionicons name="basket-outline" color="#4C6758" size={24} />
          <Text style={s.cartLabel}>장바구니</Text>
        </PressScale>
      </View>
    </View>
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
  title: { flex: 1, color: '#405D50', fontFamily: fonts.laundryBold, fontSize: 17, lineHeight: 24 },
  score: { color: '#647668', fontFamily: fonts.semibold, fontSize: 13, lineHeight: 20, fontVariant: ['tabular-nums'], marginRight: 4 },
  penalty: { color: '#9A604E' },
  iconButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  noteRow: { flexDirection: 'row', minHeight: 62, paddingBottom: 10, paddingRight: 10, alignItems: 'center' },
  note: { flex: 1, minWidth: 0 },
  itemsScroll: { flexGrow: 0 },
  items: { alignItems: 'center', paddingHorizontal: 14, gap: 18 },
  item: { minWidth: 48, maxWidth: 128, gap: 3 },
  itemName: { color: '#536457', fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  itemQuantity: { color: '#405D50', fontFamily: fonts.bold, fontSize: 16, lineHeight: 20, fontVariant: ['tabular-nums'] },
  cart: { width: 70, minHeight: 52, borderRadius: 12, backgroundColor: '#E8EDDF', alignItems: 'center', justifyContent: 'center', gap: 2 },
  cartLabel: { color: '#4C6758', fontFamily: fonts.medium, fontSize: 11, lineHeight: 15 },
});