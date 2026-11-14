import { View } from 'react-native';
import { MarketStaffDialogue, MarketStaffDialogueChoice } from './MarketStaffDialogue';
import type { BusDriverQuizState } from '../../game/busDriverQuiz';

export function BusDriverQuizPanel({ state, onAnswer, onSkip, onClose }: {
  state: BusDriverQuizState;
  onAnswer: (choiceId: string) => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const answered = state.status === 'answered';
  const response = answered ? `${state.correct ? '맞아요! ' : ''}${state.quiz.explanation}\n편하게 가요.` : undefined;
  return <View testID="bus-driver-quiz" style={{ position: 'absolute', inset: 0 }}>
    <MarketStaffDialogue name="버스 기사" message={state.quiz.question} response={response}>
      {answered ? <MarketStaffDialogueChoice text="네, 고마워요" onPress={onClose} /> : <>
        {state.quiz.choices.map(choice => <MarketStaffDialogueChoice key={choice.id} text={choice.text} onPress={() => onAnswer(choice.id)} />)}
        <MarketStaffDialogueChoice text="이번엔 그냥 갈게요" onPress={onSkip} />
      </>}
    </MarketStaffDialogue>
  </View>;
}
