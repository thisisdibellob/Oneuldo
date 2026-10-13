import type { BusSession } from './busSession';

export const BUS_DRIVER_QUIZ_IDS = ['bus-number', 'route-board', 'stop-bell', 'standing', 'library-voice', 'book-return', 'park-snack', 'meeting-friend'] as const;
export type BusDriverQuizId = typeof BUS_DRIVER_QUIZ_IDS[number];
export type BusDriverQuiz = {
  id: BusDriverQuizId;
  question: string;
  choices: readonly { id: string; text: string }[];
  correctChoiceId: string;
  explanation: string;
};
export type BusDriverQuizState = {
  quiz: BusDriverQuiz;
  status: 'available' | 'asked' | 'answered' | 'skipped';
  correct: boolean | null;
  choiceId: string | null;
};

export function getBusDriverQuizDefinition(id: string, route: string | null): BusDriverQuiz | null {
  const definitions: Record<BusDriverQuizId, Omit<BusDriverQuiz, 'id'>> = {
    'bus-number': { question: '어서 와요! 방금 탄 버스는 몇 번일까요?', choices: [{ id: '201', text: '201번이요' }, { id: '305', text: '305번이요' }], correctChoiceId: route ?? '201', explanation: `지금 탄 버스는 ${route ?? '201'}번이에요. 앞에 적힌 번호로 확인할 수 있죠.` },
    'route-board': { question: '이 버스가 어디로 가는지 궁금하면 뭘 보면 좋을까요?', choices: [{ id: 'seat', text: '좌석의 무늬요' }, { id: 'route', text: '노선 안내판이요' }], correctChoiceId: 'route', explanation: '노선 안내판에 버스가 지나가는 정류장이 이어져 있어요.' },
    'stop-bell': { question: '내릴 곳이 다가오면 어떤 버튼을 누를까요?', choices: [{ id: 'bell', text: '하차벨이요' }, { id: 'phone', text: '휴대폰 전원 버튼이요' }], correctChoiceId: 'bell', explanation: '하차벨을 누르면 다음 정류장에서 내린다는 걸 알릴 수 있어요.' },
    standing: { question: '오늘은 서서 가고 싶다면, 무엇을 잡으면 좋을까요?', choices: [{ id: 'bag', text: '가방만 들고 있을래요' }, { id: 'rail', text: '손잡이를 잡을래요' }], correctChoiceId: 'rail', explanation: '손잡이를 잡으면 버스가 움직여도 몸을 지탱하기 좋아요.' },
    'library-voice': { question: '도서관에서 친구를 만나면 어떻게 인사할까요?', choices: [{ id: 'quiet', text: '작은 목소리로 인사해요' }, { id: 'loud', text: '멀리서 크게 불러요' }], correctChoiceId: 'quiet', explanation: '작은 목소리로 인사하면 책을 읽는 사람도 편안하겠죠.' },
    'book-return': { question: '다 읽은 도서관 책은 어디에 돌려주면 좋을까요?', choices: [{ id: 'window', text: '창가에 놓아둘래요' }, { id: 'return', text: '책 반납하는 곳이요' }], correctChoiceId: 'return', explanation: '반납하는 곳에 두면 다음 사람이 책을 찾아 읽기 좋아요.' },
    'park-snack': { question: '공원에서 먹은 간식 포장지는 어떻게 할까요?', choices: [{ id: 'bin', text: '쓰레기통에 버릴래요' }, { id: 'bench', text: '벤치에 두고 갈래요' }], correctChoiceId: 'bin', explanation: '쓰레기통에 버리면 다음에 쉬러 온 사람도 기분 좋겠죠.' },
    'meeting-friend': { question: '친구와 만나기로 한 곳이 헷갈리면 어떻게 할까요?', choices: [{ id: 'silent', text: '아무 말 없이 돌아갈래요' }, { id: 'call', text: '전화해서 장소를 물어봐요' }], correctChoiceId: 'call', explanation: '친구에게 전화해 지금 있는 곳과 만날 장소를 확인하면 돼요.' },
  };
  if (!(BUS_DRIVER_QUIZ_IDS as readonly string[]).includes(id)) return null;
  return { id: id as BusDriverQuizId, ...definitions[id as BusDriverQuizId] };
}

/** Stable for saved sessions; successive boardings rotate, with a different return-trip starting point. */
export function selectBusDriverQuiz(session: BusSession, rideNumber: number): BusDriverQuizId {
  const offset = session.destination === 'village' ? 4 : 0;
  const recent = new Set(session.events.filter(event => event.type === 'boarded').slice(-(BUS_DRIVER_QUIZ_IDS.length - 1)).map(event => event.payload.quizId));
  const outing = Math.floor(session.startedAt / 1000) % 4;
  const start = (offset + outing + rideNumber - 1) % BUS_DRIVER_QUIZ_IDS.length;
  for (let step = 0; step < BUS_DRIVER_QUIZ_IDS.length; step++) {
    const id = BUS_DRIVER_QUIZ_IDS[(start + step) % BUS_DRIVER_QUIZ_IDS.length];
    if (!recent.has(id)) return id;
  }
  return BUS_DRIVER_QUIZ_IDS[start];
}

/** Old saves without quiz events remain playable and do not suddenly open an extra conversation. */
export function getBusDriverQuiz(session: BusSession): BusDriverQuizState | null {
  if (!session.rideId) return null;
  const events = session.events.filter(event => event.payload.rideId === session.rideId);
  const boarded = events.find(event => event.type === 'boarded');
  const quiz = typeof boarded?.payload.quizId === 'string' ? getBusDriverQuizDefinition(boarded.payload.quizId, session.route) : null;
  if (!quiz) return null;
  const answered = events.find(event => event.type === 'driver_quiz_answered' && event.payload.quizId === quiz.id);
  if (answered) return { quiz, status: 'answered', correct: answered.payload.correct === true, choiceId: String(answered.payload.choiceId) };
  if (events.some(event => event.type === 'driver_quiz_skipped' && event.payload.quizId === quiz.id)) return { quiz, status: 'skipped', correct: null, choiceId: null };
  return { quiz, status: events.some(event => event.type === 'driver_quiz_opened' && event.payload.quizId === quiz.id) ? 'asked' : 'available', correct: null, choiceId: null };
}
