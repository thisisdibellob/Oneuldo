export type PhishingScenarioId = 'friend-scam' | 'friend-real' | 'authority' | 'parcel';
export type PhishingVerificationMethod = 'saved-contact' | 'in-person' | 'official-contact' | 'order-history';
export type PhishingVerdict = 'scam' | 'genuine';
export type PhishingScenario = Readonly<{
  id: PhishingScenarioId;
  title: string;
  subtitle: string;
  sender: string;
  channel: 'message' | 'call';
  initialMessages: readonly string[];
  followUp: string;
  verificationText: string;
  helpText: string;
  verificationMethods: readonly PhishingVerificationMethod[];
  verdict: PhishingVerdict;
}>;

/** These are fictional contacts inside the game, never telephone numbers, live URLs or payment requests. */
export const PHISHING_SCENARIOS: Readonly<Record<PhishingScenarioId, PhishingScenario>> = {
  'friend-scam': {
    id: 'friend-scam', title: '민수에게 온 연락', subtitle: '낯선 번호의 메시지', sender: '민수라고 하는 사람', channel: 'message',
    initialMessages: ['나 민수야. 휴대폰이 고장 나서 다른 번호로 연락해.', '급하게 돈을 보내야 하는데, 나 대신 보내 줄 수 있어?'],
    followUp: '통화는 지금 어려워. 내가 알려 주는 계좌로 먼저 보내 줘.',
    verificationText: '민수: 나는 돈을 보내 달라고 한 적 없어. 내 휴대폰도 괜찮아. 그 메시지는 내가 보낸 게 아니야.',
    helpText: '지영: 답장을 잠깐 멈추자. 원래 저장해 둔 민수 번호로 전화하거나, 민수를 직접 만나 확인해 보자.',
    verificationMethods: ['saved-contact', 'in-person'], verdict: 'scam',
  },
  'friend-real': {
    id: 'friend-real', title: '민수의 새 연락', subtitle: '약속을 정하는 메시지', sender: '민수라고 하는 사람', channel: 'message',
    initialMessages: ['나 민수야. 오늘은 다른 번호로 연락해.', '도서관 일이 끝나면 마을 광장에서 잠깐 만날래?'],
    followUp: '괜찮은 시간에 알려 줘. 오늘이 어려우면 다음에 만나도 돼.',
    verificationText: '민수: 맞아, 내가 보낸 메시지야. 광장에서 만나자고 했어. 네가 편할 때 만나면 돼.',
    helpText: '지영: 낯선 번호라고 모두 사기는 아니야. 저장해 둔 민수 연락처나 직접 만나서 확인한 뒤 네가 결정하면 돼.',
    verificationMethods: ['saved-contact', 'in-person'], verdict: 'genuine',
  },
  authority: {
    id: 'authority', title: '갑자기 걸려 온 전화', subtitle: '기관이라고 말하는 전화', sender: '수사기관이라고 하는 사람', channel: 'call',
    initialMessages: ['수사기관입니다. 본인 이름의 계좌가 사건에 쓰였습니다.', '확인을 위해 돈을 안전한 계좌로 옮기세요. 다른 사람에게 알리지 마세요.'],
    followUp: '지금 통화를 끊으면 해결이 어렵습니다. 안내하는 대로 바로 송금하세요.',
    verificationText: '공식 상담: 전화로 안전한 계좌에 돈을 옮기라는 요구는 사기 수법이에요. 상대가 내 이름을 알고 있어도 믿을 근거가 되지 않아요.',
    helpText: '지영: 겁이 나도 지금 돈을 보내지 않아도 돼. 먼저 끊고, 상대가 알려 준 번호 대신 직접 찾은 공식 연락처로 확인하자.',
    verificationMethods: ['official-contact'], verdict: 'scam',
  },
  parcel: {
    id: 'parcel', title: '택배 문자가 도착했어요', subtitle: '배송 주소를 확인해 달라는 문자', sender: '택배 안내 문자', channel: 'message',
    initialMessages: ['[배송 안내] 주소를 확인하지 못해 배송이 멈췄습니다.', '문자에 있는 주소로 들어가 본인 정보와 재배송 비용을 입력해 주세요.'],
    followUp: '오늘 안에 확인해야 배송할 수 있습니다. 문자 속 안내를 먼저 진행해 주세요.',
    verificationText: '공식 배송 확인: 배송은 정상 진행 중이고 추가 비용도 없어요. 이 문자는 해당 택배사가 보낸 안내가 아니에요.',
    helpText: '지영: 문자 속 주소는 열지 말고, 평소 쓰는 쇼핑 앱의 주문 내역이나 택배사 공식 연락처에서 확인해 보자.',
    verificationMethods: ['order-history', 'official-contact'], verdict: 'scam',
  },
};

export type PhishingSession = Readonly<{
  id: string;
  scenarioId: PhishingScenarioId;
  startedAt: number;
  completedAt: number | null;
  status: 'active' | 'completed';
  replied: boolean;
  contactEnded: boolean;
  verification: Readonly<{ method: PhishingVerificationMethod; verdict: PhishingVerdict; text: string }> | null;
  askedForHelp: boolean;
  blocked: boolean;
  reported: boolean;
  bankContacted: boolean;
  exposure: 'none' | 'information' | 'money';
  genuineDecision: 'accept' | 'decline' | null;
}>;

export type PhishingAction =
  | { type: 'REPLY' | 'STOP' | 'ASK_HELP' | 'BLOCK' | 'REPORT' | 'CONTACT_BANK' }
  | { type: 'VERIFY'; method: PhishingVerificationMethod }
  | { type: 'SIMULATE_EXPOSURE'; exposure: 'information' | 'money' }
  | { type: 'GENUINE_DECISION'; decision: 'accept' | 'decline' }
  | { type: 'FINISH'; now?: number };

let sessionSequence = 0;
export function createPhishingSession(scenarioId: PhishingScenarioId, id?: string, now = Date.now()): PhishingSession {
  return {
    id: id ?? `phishing-${now}-${++sessionSequence}`, scenarioId, startedAt: now,
    completedAt: null, status: 'active', replied: false, contactEnded: false, verification: null,
    askedForHelp: false, blocked: false, reported: false, bankContacted: false, exposure: 'none', genuineDecision: null,
  };
}

export function canCompletePhishingSession(state: PhishingSession): boolean {
  const scenario = PHISHING_SCENARIOS[state.scenarioId];
  if (!state.contactEnded || !state.verification || state.verification.verdict !== scenario.verdict
    || !scenario.verificationMethods.includes(state.verification.method)) return false;
  if (scenario.verdict === 'genuine') return state.genuineDecision !== null;
  return state.blocked && (state.exposure === 'none' || (state.reported && state.bankContacted));
}

/** No request here ever opens a URL, contacts a person or transfers money. */
export function reducePhishingSession(state: PhishingSession, action: PhishingAction): PhishingSession {
  if (state.status === 'completed') return state;
  const scenario = PHISHING_SCENARIOS[state.scenarioId];
  switch (action.type) {
    case 'REPLY':
      return state.contactEnded || state.replied ? state : { ...state, replied: true };
    case 'STOP':
      return state.contactEnded ? state : { ...state, contactEnded: true };
    case 'ASK_HELP':
      return state.askedForHelp ? state : { ...state, askedForHelp: true };
    case 'VERIFY':
      if (!state.contactEnded || state.verification || !scenario.verificationMethods.includes(action.method)) return state;
      return { ...state, verification: { method: action.method, verdict: scenario.verdict, text: scenario.verificationText } };
    case 'SIMULATE_EXPOSURE':
      if (scenario.verdict !== 'scam' || state.contactEnded || state.verification
        || state.exposure === 'money' || state.exposure === action.exposure) return state;
      return { ...state, replied: true, exposure: action.exposure };
    case 'BLOCK':
      return state.blocked && state.contactEnded ? state : { ...state, blocked: true, contactEnded: true };
    case 'REPORT':
      if (!state.contactEnded || state.reported || scenario.verdict !== 'scam'
        || (!state.verification && state.exposure === 'none')) return state;
      return { ...state, reported: true };
    case 'CONTACT_BANK':
      if (!state.contactEnded || state.bankContacted || state.exposure === 'none' || scenario.verdict !== 'scam') return state;
      return { ...state, bankContacted: true };
    case 'GENUINE_DECISION':
      if (!state.contactEnded || state.verification?.verdict !== 'genuine' || state.genuineDecision === action.decision) return state;
      return { ...state, genuineDecision: action.decision };
    case 'FINISH': {
      const now = action.now ?? Date.now();
      if (!canCompletePhishingSession(state) || !Number.isFinite(now) || now < state.startedAt) return state;
      return { ...state, status: 'completed', completedAt: now };
    }
  }
}

export function getPhishingGoal(state: PhishingSession): string {
  if (state.status === 'completed') return '연락 확인을 마쳤어요';
  if (!state.contactEnded) return PHISHING_SCENARIOS[state.scenarioId].channel === 'call' ? '통화를 멈추고 확인하기' : '대화를 멈추고 확인하기';
  if (state.exposure !== 'none' && !state.reported) return '112에 상황을 알리기';
  if (state.exposure !== 'none' && !state.bankContacted) return state.exposure === 'money' ? '금융회사에 지급정지 요청하기' : '금융회사에 정보 노출을 알리기';
  if (!state.verification) {
    if (state.scenarioId.startsWith('friend')) return '저장된 연락처나 직접 만나서 확인하기';
    return state.scenarioId === 'parcel' ? '공식 주문 내역에서 확인하기' : '직접 찾은 공식 연락처로 확인하기';
  }
  if (state.verification.verdict === 'genuine' && !state.genuineDecision) return '약속을 어떻게 할지 정하기';
  if (state.verification.verdict === 'scam' && !state.blocked) return '확인한 사칭 연락 차단하기';
  return '확인한 내용 정리하기';
}

/** Describes actions actually chosen, not a diagnostic score or claims of learning efficacy. */
export function getPhishingFacts(state: PhishingSession): readonly string[] {
  const facts: string[] = [];
  if (state.contactEnded) facts.push('연락을 멈추고 확인했어요.');
  if (state.askedForHelp) facts.push('지영에게 도움을 요청했어요.');
  if (state.verification) {
    const methods: Record<PhishingVerificationMethod, string> = {
      'saved-contact': '원래 저장된 민수의 연락처로 확인했어요.',
      'in-person': '민수를 직접 만나 사실을 확인했어요.',
      'official-contact': '상대가 보낸 번호 대신 공식 연락처로 확인했어요.',
      'order-history': '문자 속 주소 대신 공식 주문 내역으로 확인했어요.',
    };
    facts.push(methods[state.verification.method]);
  }
  if (state.exposure === 'information') facts.push('정보를 이미 알려 준 상황에서 대처를 연습했어요.');
  if (state.exposure === 'money') facts.push('돈을 이미 보낸 상황에서 대처를 연습했어요.');
  if (state.reported) facts.push('112에 상황과 연락 내용을 알리는 연습을 했어요.');
  if (state.bankContacted) facts.push(state.exposure === 'money'
    ? '금융회사에 지급정지를 요청하는 연습을 했어요.'
    : '금융회사에 정보 노출을 알리고 보호 조치를 문의했어요.');
  if (state.blocked && state.verification?.verdict === 'scam') facts.push('확인한 사칭 연락을 차단했어요.');
  if (state.genuineDecision) facts.push(state.genuineDecision === 'accept'
    ? '민수의 연락임을 확인한 뒤 약속을 정했어요.'
    : '민수의 연락임을 확인한 뒤 이번 약속은 사양했어요.');
  return facts;
}
