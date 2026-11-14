import { useEffect, useState } from 'react';
import { BackHandler, Platform } from 'react-native';
import { MarketStaffDialogue, MarketStaffDialogueChoice } from './MarketStaffDialogue';

/** Remote conversation has its own close action; it never depends on NPC distance. */
export function GameContactCall({ contact, inMarket, onClose, onOpenErrand }: {
  contact: 'jiyoung' | 'minsu';
  inMarket: boolean;
  onClose: () => void;
  onOpenErrand?: () => void;
}) {
  const [response, setResponse] = useState('');
  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
    };
    if (Platform.OS === 'web') window.addEventListener('keydown', escape, true);
    return () => {
      back.remove();
      if (Platform.OS === 'web') window.removeEventListener('keydown', escape, true);
    };
  }, [onClose]);
  const minsu = contact === 'minsu';
  return <MarketStaffDialogue name={`${minsu ? '민수' : '지영'} · 전화`}
    message={minsu ? '여보세요, 나 민수야. 무슨 일이야?' : '전화했구나. 장보기 부탁을 확인하고 싶니?'} response={response}>
    {!response ? <MarketStaffDialogueChoice
      text={minsu ? (inMarket ? '지금 장보기를 하고 있어.' : '어떻게 지내?') : '어디에서 장을 보면 될까요?'}
      onPress={() => setResponse(minsu
        ? (inMarket ? '그렇구나! 물건이 없으면 직원에게 물어봐. 지영이 부탁한 물건을 바꾸려면 지영에게 확인하고.' : '마을에서 산책하고 있어. 나중에 만나면 같이 이야기하자.')
        : '하늘마트에서 부탁할게. 마트에 들어가면 사야 할 목록을 확인할 수 있어.')} /> : null}
    {minsu && onOpenErrand ? <MarketStaffDialogueChoice text="부탁한 장보기 목록 확인하기" onPress={onOpenErrand} /> : null}
    <MarketStaffDialogueChoice text="통화 마치기" onPress={onClose} />
  </MarketStaffDialogue>;
}
