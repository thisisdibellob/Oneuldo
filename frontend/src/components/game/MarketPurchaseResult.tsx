import { useContext, useEffect, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { getMarketProductImage } from '../../game/marketProductImages';
import { getMarketCartTotal, getMarketProduct, type MarketCart } from '../../game/scenarios';
import { useCreditedXp } from '../../progress/userProgress';
import { fonts } from '../../theme';

export type MarketResultKind = 'success' | 'complete' | 'gave-up';

type Props = {
  kind: MarketResultKind;
  details?: readonly string[];
  /** 포기 카드의 안내 문구(중도 포기·빈 장바구니 계산). */
  note?: string;
  cart: MarketCart;
  budget?: number;
  /** AI 분석 접수 상태 문구. 결과 판정과 별개로 작게 보여 준다. */
  analysisStatus?: string | null;
  /** 이 장보기의 활동 기록 id. 개인 경험치를 읽어 보여 주기만 한다. */
  xpRecordId?: string | null;
  children?: ReactNode;
};

const won = (value: number) => value.toLocaleString('ko-KR') + '원';

/** 장보기 결과 카드. 목록 비교 결과와 받은 경험치를 보여 주며, 어떤 기록도 남기지 않는다. */
export function MarketPurchaseResult({ kind, details = [], note, cart, budget, analysisStatus, xpRecordId = null, children }: Props) {
  const insets = useContext(SafeAreaInsetsContext);
  const pop = useRef(new Animated.Value(0)).current;
  const gaveUp = kind === 'gave-up';
  const success = kind === 'success';
  const xp = useCreditedXp(gaveUp ? null : xpRecordId);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!alive) return;
      if (reduce) { pop.setValue(1); return; }
      Animated.timing(pop, { toValue: 1, duration: 420, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }).start();
    }).catch(() => pop.setValue(1));
    return () => { alive = false; };
  }, [pop]);

  const items = Object.entries(cart).filter(([, quantity]) => quantity > 0);
  const total = getMarketCartTotal(cart);

  return <View accessibilityViewIsModal style={[styles.overlay, { paddingTop: Math.max(16, insets?.top ?? 0), paddingBottom: Math.max(16, insets?.bottom ?? 0) }]}>
    <ScrollView style={styles.card} contentContainerStyle={styles.content} testID="market-purchase-result">
      <Animated.View style={[styles.badge, success ? styles.badgeSuccess : gaveUp ? styles.badgeGaveUp : styles.badgeRetry,
        { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }], opacity: pop }]}>
        <View style={[styles.badgeInner, success ? styles.badgeInnerSuccess : gaveUp ? styles.badgeInnerGaveUp : styles.badgeInnerRetry]}>
          <Ionicons color="#FFFFFF" name={success ? 'checkmark' : gaveUp ? 'flag' : 'basket'} size={success ? 38 : 32} />
        </View>
      </Animated.View>

      <Text accessibilityRole="header" style={[styles.title, gaveUp && styles.titleGaveUp]}>{success ? '장보기 성공!' : gaveUp ? '장보기 포기' : '장보기 완료!'}</Text>
      <Text style={styles.subtitle}>{success ? '목록에 있는 물건을 모두 맞게 샀어요.' : gaveUp ? note ?? '괜찮아요. 다음에 다시 도전해 봐요.' : '끝까지 해냈어요. 다음엔 이것만 같이 확인해 봐요.'}</Text>

      {gaveUp ? <View accessibilityLabel="이번 장보기는 경험치가 없어요" style={[styles.xp, styles.xpNone]}>
        <View style={[styles.xpBadge, styles.xpBadgeNone]}><Text style={styles.xpBadgeText}>XP</Text></View>
        <Text style={styles.xpNoneText}>이번 장보기는 경험치가 없어요</Text>
      </View> : xp ?<View accessibilityLabel={xp.capped ? '오늘은 장보기 경험치를 모두 받았어요' : `경험치 ${xp.total} 받음`} style={styles.xp}>
        <View style={styles.xpBadge}><Text style={styles.xpBadgeText}>XP</Text></View>
        {xp.capped ? <Text style={styles.xpCapped}>오늘은 장보기 경험치를 모두 받았어요</Text> : <>
          <Text style={styles.xpTotal}>+{xp.total}</Text>
          <View style={styles.xpBreakdown}>
            <Text style={styles.xpLine}>끝까지 함 +{xp.base}</Text>
            {xp.bonus ? <Text style={styles.xpBonus}>목록 다 맞춤 +{xp.bonus}</Text> : null}
          </View>
        </>}
      </View> : null}

      {!success && details.length ? <View style={styles.panel}>
        <Text style={styles.panelTitle}>다시 확인할 것</Text>
        {details.map((line) => <View key={line} style={styles.checkRow}>
          <View style={styles.checkDot} />
          <Text style={styles.checkText}>{line}</Text>
        </View>)}
      </View> : null}

      <View style={styles.panel}>
        <View style={styles.basketHeader}>
          <Text style={styles.panelTitle}>{gaveUp ? '담았던 물건' : '산 물건'}</Text>
          <Text style={styles.basketTotal}>{won(total)}{budget ? <Text style={styles.basketBudget}> / 예산 {won(budget)}</Text> : null}</Text>
        </View>
        {items.length ? <View style={styles.items}>
          {items.map(([id, quantity]) => {
            const product = getMarketProduct(id);
            if (!product) return null;
            return <View key={id} accessibilityLabel={`${product.name} ${quantity}개`} style={styles.item}>
              <Image resizeMode="contain" source={getMarketProductImage(id)} style={styles.itemArt} />
              <Text numberOfLines={1} style={styles.itemName}>{product.name}</Text>
              <View style={styles.itemCount}><Text style={styles.itemCountText}>×{quantity}</Text></View>
            </View>;
          })}
        </View> : <Text style={styles.emptyBasket}>장바구니가 비어 있었어요.</Text>}
      </View>

      {analysisStatus ? <View style={styles.analysis}>
        <Ionicons color="#6F8478" name="document-text-outline" size={16} />
        <Text accessibilityLiveRegion="polite" style={styles.analysisText}>{analysisStatus}</Text>
      </View> : null}

      <View style={styles.actions}>{children}</View>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(29,45,51,0.58)', justifyContent: 'center', padding: 16, zIndex: 80 },
  card: {
    alignSelf: 'center', backgroundColor: '#FFFBF2', borderColor: '#EADFC9', borderRadius: 28, borderWidth: 2, flexGrow: 0, maxHeight: '100%', maxWidth: 440, width: '100%',
    ...Platform.select({ web: { boxShadow: '0 18px 60px rgba(22,39,44,0.25)' }, default: { elevation: 10 } }),
  },
  content: { alignItems: 'center', gap: 12, paddingBottom: 20, paddingHorizontal: 20, paddingTop: 26 },
  badge: { alignItems: 'center', borderRadius: 48, height: 96, justifyContent: 'center', width: 96 },
  badgeSuccess: { backgroundColor: '#DDF2E3' },
  badgeRetry: { backgroundColor: '#E6EEDC' },
  badgeInner: { alignItems: 'center', borderRadius: 34, height: 68, justifyContent: 'center', width: 68 },
  badgeInnerSuccess: { backgroundColor: '#3FA36B' },
  badgeInnerRetry: { backgroundColor: '#7FA37A' },
  badgeGaveUp: { backgroundColor: '#ECE8DF' },
  badgeInnerGaveUp: { backgroundColor: '#A39C8C' },
  titleGaveUp: { color: '#6B6457' },
  xpNone: { backgroundColor: '#F1EEE7' },
  xpBadgeNone: { backgroundColor: '#C2BCAF' },
  xpNoneText: { color: '#7D776B', flex: 1, fontFamily: fonts.medium, fontSize: 13, lineHeight: 19 },
  title: { color: '#2F5B42', fontFamily: fonts.cafe24Ssurround, fontSize: 28, lineHeight: 36, marginTop: 4, textAlign: 'center' },
  subtitle: { color: '#6A7368', fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  xp: { alignItems: 'center', alignSelf: 'stretch', backgroundColor: '#FFF4D6', borderRadius: 18, flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  xpBadge: { alignItems: 'center', backgroundColor: '#F2B53A', borderRadius: 12, height: 32, justifyContent: 'center', width: 40 },
  xpBadgeText: { color: '#FFFFFF', fontFamily: fonts.cafe24Ssurround, fontSize: 14 },
  xpTotal: { color: '#A86B00', fontFamily: fonts.cafe24Ssurround, fontSize: 24 },
  xpBreakdown: { flex: 1, alignItems: 'flex-end' },
  xpLine: { color: '#8C6A2A', fontFamily: fonts.medium, fontSize: 12, lineHeight: 17 },
  xpBonus: { color: '#3FA36B', fontFamily: fonts.semibold, fontSize: 12, lineHeight: 17 },
  xpCapped: { color: '#8C6A2A', flex: 1, fontFamily: fonts.medium, fontSize: 13, lineHeight: 19 },
  panel: { alignSelf: 'stretch', backgroundColor: '#F4EEE1', borderRadius: 18, gap: 8, padding: 14 },
  panelTitle: { color: '#4F5D50', fontFamily: fonts.cafe24Ssurround, fontSize: 15 },
  checkRow: { flexDirection: 'row', gap: 10 },
  checkDot: { backgroundColor: '#7FA37A', borderRadius: 4, height: 8, marginTop: 8, width: 8 },
  checkText: { color: '#4A5148', flex: 1, fontFamily: fonts.medium, fontSize: 14, lineHeight: 21 },
  basketHeader: { alignItems: 'baseline', flexDirection: 'row', justifyContent: 'space-between' },
  basketTotal: { color: '#3E4B40', fontFamily: fonts.bold, fontSize: 14 },
  basketBudget: { color: '#8B8F82', fontFamily: fonts.medium, fontSize: 12 },
  items: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, paddingBottom: 8, paddingHorizontal: 6, paddingTop: 6, width: 86 },
  itemArt: { height: 52, width: 52 },
  itemName: { color: '#4A5148', fontFamily: fonts.medium, fontSize: 11, marginTop: 4, maxWidth: 76 },
  itemCount: { backgroundColor: '#EDE6D6', borderRadius: 8, marginTop: 4, paddingHorizontal: 7, paddingVertical: 1 },
  itemCountText: { color: '#5D6A5C', fontFamily: fonts.bold, fontSize: 11 },
  emptyBasket: { color: '#8B8F82', fontFamily: fonts.medium, fontSize: 13, textAlign: 'center' },
  analysis: { alignItems: 'center', alignSelf: 'stretch', flexDirection: 'row', gap: 6, paddingHorizontal: 4 },
  analysisText: { color: '#6F8478', flex: 1, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  actions: { alignSelf: 'stretch', gap: 8, marginTop: 4 },
});
