import { useState } from 'react';
import { MarketStaffDialogue, MarketStaffDialogueChoice } from './MarketStaffDialogue';
import { getAvailableSubstitutions, type MarketAction, type MarketSession } from '../../game/marketSession';
import { getMarketProduct } from '../../game/scenarios';

/** The requester changes the shopping agreement only after an explicit conversation. */
export function MarketRequesterCall({ session, onAction, onClose, bottomInset }: {
  session: MarketSession;
  onAction: (action: MarketAction) => MarketSession;
  onClose: () => void;
  bottomInset?: number;
}) {
  const [response, setResponse] = useState('');
  const stockout = session.learning.stockout;
  const product = stockout ? getMarketProduct(stockout.requestedProductId) : undefined;
  const approvedProduct = stockout?.approvedProductId ? getMarketProduct(stockout.approvedProductId) : undefined;
  const alternatives = getAvailableSubstitutions(session);
  const canResolve = stockout?.staffChecked && stockout.status === 'unresolved';
  const substitutionAllowed = session.config.learning?.allowSubstitution !== false;
  const message = !stockout?.shelfVisited
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
  return <MarketStaffDialogue name="지영 · 전화" message={message} response={response} bottomInset={bottomInset}>
    {canResolve && substitutionAllowed ? alternatives.map(alternative => <MarketStaffDialogueChoice
      key={alternative.id} text={`${alternative.name}로 바꿔도 될까요?`}
      onPress={() => resolve({ type: 'requestSubstitution', productId: alternative.id })} />) : null}
    {canResolve && (!substitutionAllowed || !alternatives.length) ? <MarketStaffDialogueChoice
      text={!substitutionAllowed ? '재고가 없어서 부탁한 상품을 사지 못했어요.' : '재고가 없고, 대신 살 상품도 없어요.'}
      onPress={() => resolve({ type: 'reportUnavailable', reason: substitutionAllowed ? 'no-substitute-in-stock' : 'replacement-not-allowed' })} /> : null}
    <MarketStaffDialogueChoice text="통화 마치기" onPress={onClose} />
  </MarketStaffDialogue>;
}
