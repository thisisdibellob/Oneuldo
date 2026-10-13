import { useEffect } from 'react';
import { BackHandler, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { LibraryButton, LibraryPanel } from './LibraryWorkPanel';
import { getMarketProductImage } from '../../game/marketProductImages';
import { getMarketProduct } from '../../game/scenarios';
import { getShoppingErrandDeliveryText, type ShoppingErrand, type ShoppingErrandAction } from '../../game/shoppingErrand';
import { fonts } from '../../theme';

export function ShoppingErrandPanel({ errand, onAction, onClose, onGoMarket, canDeliver = false }: {
  errand: ShoppingErrand; onAction: (action: ShoppingErrandAction) => void; onClose: () => void;
  onGoMarket?: () => void; canDeliver?: boolean;
}) {
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopImmediatePropagation(); onClose(); } };
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('keydown', key, true);
    return () => { sub.remove(); if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('keydown', key, true); };
  }, [onClose]);
  const offer = errand.phase === 'offered' || errand.phase === 'deferred';
  const delivered = errand.phase === 'delivered';
  const receipt = errand.purchase;
  const items = receipt?.cart ?? { milk: 1, apple: 2 };
  return <LibraryPanel title={delivered ? '민수에게 전달했어요' : '민수의 장보기 부탁'} subtitle={delivered ? '퇴근길 장보기 완료' : '퇴근길 장보기'} onClose={onClose} testID="shopping-errand-panel" footer={<>
    {offer ? <><LibraryButton onPress={() => onAction({ type: 'accept', at: Date.now() })}>내가 사 올게</LibraryButton><LibraryButton secondary onPress={() => { onAction({ type: 'defer', at: Date.now() }); onClose(); }}>나중에 할게</LibraryButton></>
      : errand.phase === 'ready' ? <LibraryButton onPress={canDeliver ? () => onAction({ type: 'deliver', at: Date.now() }) : onClose}>{canDeliver ? '물건을 건네고 이야기하기' : '민수에게 가져가기'}</LibraryButton>
        : errand.phase === 'budget-review' && receipt ? <LibraryButton onPress={() => onAction({ type: 'approve-budget', amount: receipt.total })}>예산을 넘긴 금액을 이야기하기</LibraryButton>
          : <LibraryButton onPress={delivered ? onClose : onGoMarket ?? onClose}>{delivered ? '확인' : '부탁 확인했어'}</LibraryButton>}
  </>}>
    <View style={s.note}><Text style={s.message}>{offer ? '집에 오는 길에 흰 우유 1개랑 사과 2개 사다 줄래? 4,600원 안에서 부탁해.'
      : delivered ? receipt?.unavailableReason ? '사과 잘 받았어. 우유를 못 산 이유도 알려 줘서 고마워.' : '부탁한 물건 잘 받았어. 고마워!'
        : receipt ? getShoppingErrandDeliveryText(errand) : '흰 우유 1개, 사과 2개. 품절이면 직원에게 재고를 물어보고 민수에게 전화해요.'}</Text></View>
    <View style={s.items}>{Object.entries(items).map(([id, quantity]) => <View style={s.item} key={id}>
      <Image source={getMarketProductImage(id)} resizeMode="contain" style={s.image} />
      <View style={s.itemCopy}><Text style={s.name}>{getMarketProduct(id)?.name ?? id}</Text><Text style={s.unit}>{(getMarketProduct(id)?.price ?? 0).toLocaleString('ko-KR')}원</Text></View><Text style={s.quantity}>{quantity}개</Text>
    </View>)}</View>
    <View style={s.budget}><Text style={s.budgetLabel}>{receipt ? '결제 금액' : '민수와 정한 예산'}</Text><Text style={s.amount}>{(receipt?.total ?? errand.approvedBudget).toLocaleString('ko-KR')}원</Text></View>
    {errand.phase === 'budget-review' && receipt ? <Text style={s.notice}>약속한 예산보다 {(receipt.total - errand.approvedBudget).toLocaleString('ko-KR')}원을 더 썼어요. 전달하기 전에 민수에게 알려요.</Text> : null}
    {errand.phase === 'ready' && !canDeliver ? <Text style={s.notice}>마을에 있는 민수에게 가까이 가서 물건을 건네요.</Text> : null}
    {!receipt && !offer ? <Text style={s.notice}>다른 우유로 바꿀 때도 수량은 1개예요. 예산이 모자라면 결제 전에 민수에게 확인해요.</Text> : null}
    {!receipt && !errand.allowSubstitution ? <Text style={s.notice}>이번에는 흰 우유가 필요해요. 없으면 사지 못한 이유를 민수에게 알려요.</Text> : null}
    {errand.error ? <Text accessibilityLiveRegion="polite" style={s.notice}>{errand.error}</Text> : null}
  </LibraryPanel>;
}
const s = StyleSheet.create({
  note: { backgroundColor: '#EAEBDD', padding: 18, borderRadius: 20, marginBottom: 16 }, message: { fontFamily: fonts.medium, color: '#495A49', fontSize: 18, lineHeight: 28 },
  items: { gap: 10 }, item: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F0EADA', padding: 12, borderRadius: 18 },
  image: { width: 58, height: 68 }, itemCopy: { flex: 1, gap: 6 }, name: { fontFamily: fonts.bold, fontSize: 19, color: '#45584B' }, unit: { fontFamily: fonts.regular, fontSize: 16, color: '#7A7D6E' }, quantity: { fontFamily: fonts.bold, fontSize: 21, color: '#506B54' },
  budget: { paddingVertical: 20, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, budgetLabel: { fontFamily: fonts.medium, fontSize: 17, color: '#6F7463' }, amount: { fontFamily: fonts.bold, fontSize: 25, color: '#496650' },
  notice: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 25, color: '#7D6446', marginBottom: 10 },
});
