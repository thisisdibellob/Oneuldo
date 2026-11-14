import { useState } from 'react';
import { MarketStaffDialogue, MarketStaffDialogueChoice } from './MarketStaffDialogue';
import { getAvailableSubstitutions, type MarketAction, type MarketSession } from '../../game/marketSession';
import { getMarketCartTotal, getMarketProduct } from '../../game/scenarios';

/** The requester changes the shopping agreement only after an explicit conversation. */
export function MarketRequesterCall({ session, onAction, onClose, bottomInset, requesterName = '지영', spendingLimit, onBudgetRequest }: {
  session: MarketSession;
  onAction: (action: MarketAction) => MarketSession;
  onClose: () => void;
  bottomInset?: number;
  requesterName?: string;
  spendingLimit?: number;
  onBudgetRequest?: (amount: number) => void;
}) {
  const [response, setResponse] = useState('');
  const [pendingReplacement, setPendingReplacement] = useState<{ id: string; total: number } | null>(null);
  const stockout = session.learning.stockout;
  const product = stockout ? getMarketProduct(stockout.requestedProductId) : undefined;
  const approvedProduct = stockout?.approvedProductId ? getMarketProduct(stockout.approvedProductId) : undefined;
  const alternatives = getAvailableSubstitutions(session);
  const canResolve = stockout?.staffChecked && stockout.status === 'unresolved';
  const substitutionAllowed = session.config.learning?.allowSubstitution !== false;
  const cartTotal = getMarketCartTotal(session.cart);
  const overBudget = spendingLimit !== undefined && cartTotal > spendingLimit;
  const budgetTotal = pendingReplacement?.total ?? cartTotal;
  const message = pendingReplacement
    ? `${getMarketProduct(pendingReplacement.id)?.name}로 바꾸면 부탁한 물건이 모두 ${pendingReplacement.total.toLocaleString('ko-KR')}원이구나. 예산도 함께 확인해 줄래?`
    : overBudget ? `담은 물건이 ${cartTotal.toLocaleString('ko-KR')}원이구나. 부탁한 수량인지 확인하고, 얼마가 더 필요한지 말해 줘.`
    : !stockout?.shelfVisited
    ? '전화했구나. 목록에 적힌 물건을 부탁해. 물건이 보이지 않으면 직원에게 물어봐도 좋아.'
    : !stockout.staffChecked
      ? `${product?.name}가 진열대에 없구나. 직원에게 창고에 재고가 있는지 먼저 물어봐 줄래?`
      : stockout.status === 'replacement-approved'
        ? `응, ${approvedProduct?.name} ${stockout.requestedQuantity}개로 바꿔서 부탁할게. 목록에도 바꿔 적었어.`
        : stockout.status === 'waived'
          ? '못 산 이유를 잘 들었어. 그 물건은 이번에 사지 않아도 괜찮아. 나머지 장보기를 마무리해 줘.'
          : !substitutionAllowed
            ? `이번에는 ${product?.name}가 필요해서 다른 상품으로 바꾸기는 어려워. 구할 수 없는 이유를 알려 줄래?`
            : alternatives.length
              ? `${product?.name}가 창고에도 없구나. 어떤 상품으로 바꿀지 이야기해 줄래?`
              : '대신 살 만한 같은 종류의 상품도 없구나. 구할 수 없는 이유를 알려 줄래?';
  const resolve = (action: MarketAction) => {
    const next = onAction(action);
    setResponse(next.lastActionError ?? '');
  };
  const requestReplacement = (id: string) => {
    const total = session.objectives.reduce((sum, objective) => sum + (getMarketProduct(objective.productId === stockout?.requestedProductId ? id : objective.productId)?.price ?? 0) * objective.quantity, 0);
    if (spendingLimit !== undefined && onBudgetRequest && total > spendingLimit) {
      setPendingReplacement({ id, total }); setResponse('');
    } else resolve({ type: 'requestSubstitution', productId: id });
  };
  return <MarketStaffDialogue name={`${requesterName} · 전화`} message={message} response={response} bottomInset={bottomInset}>
    {(pendingReplacement || overBudget) && onBudgetRequest ? <>
      <MarketStaffDialogueChoice text={`총 ${budgetTotal.toLocaleString('ko-KR')}원까지 써도 될까요?`} onPress={() => {
        if (budgetTotal > 10000) { setResponse('금액이 너무 커졌네. 부탁한 물건과 수량을 다시 확인해 줘.'); return; }
        onBudgetRequest(budgetTotal);
        if (pendingReplacement) resolve({ type: 'requestSubstitution', productId: pendingReplacement.id });
        setPendingReplacement(null); setResponse(`응, ${budgetTotal.toLocaleString('ko-KR')}원까지 괜찮아. 확인해 줘서 고마워.`);
      }} />
      {pendingReplacement ? <MarketStaffDialogueChoice text="다른 상품을 알아볼게요." onPress={() => setPendingReplacement(null)} /> : null}
    </> : null}
    {!pendingReplacement && canResolve && substitutionAllowed ? alternatives.map(alternative => <MarketStaffDialogueChoice
      key={alternative.id} text={`${alternative.name}로 바꿔도 될까요?`}
      onPress={() => requestReplacement(alternative.id)} />) : null}
    {canResolve && (!substitutionAllowed || !alternatives.length) ? <MarketStaffDialogueChoice
      text={!substitutionAllowed ? '재고가 없어서 부탁한 상품을 사지 못했어요.' : '재고가 없고, 대신 살 상품도 없어요.'}
      onPress={() => resolve({ type: 'reportUnavailable', reason: substitutionAllowed ? 'no-substitute-in-stock' : 'replacement-not-allowed' })} /> : null}
    <MarketStaffDialogueChoice text="통화 마치기" onPress={onClose} />
  </MarketStaffDialogue>;
}
