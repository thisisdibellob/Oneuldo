import { createHash } from 'node:crypto';
import { ACTOR_PERSONA_INSTRUCTIONS } from './actorInstructions';
import type { Persona, PersonaTraitProfile } from './types';
import { VALIDATION_CONTROL_PERSONA_ID } from './personas';
import { buildWholeTraceCognitionProfile, type WholeTraceCognitionProfile } from './wholeTraceCognition';

export type WholeTracePersonaInput = {
  source: { personaId: string; version: string; promptHash: string };
  individualInstructions: string;
  behavioralContext: { goalMemoryCapacity?: number };
  cognition: WholeTraceCognitionProfile;
  cognitionSourceHash: string;
  timingBaseline: Pick<Persona['parameters'], 'reactionMedianMs' | 'reactionSigma' | 'walkSpeed'>;
  /** Present only for composed profiles; common traits are separate from unchanged context. */
  traitProfile?: PersonaTraitProfile;
  instruction: string;
};

/** Preserve the selected individual's rules from the single canonical profile.
 * The shared reference documents and stochastic implementation association are
 * deliberately not instructions for the whole-trace actor. Fail on a missing
 * boundary rather than quietly giving it the full reference or no individual.
 */
function individualInstructions(persona: Persona): string {
  const boundary = /^## 공통 전제[^\r\n]*$/m.exec(persona.prompt);
  if (!boundary) throw new Error(`Missing individual/common persona prompt boundary: ${persona.id}@${persona.version}`);
  let individual = persona.prompt.slice(0, boundary.index);
  const association = /^## 자료와 구조화된 설정의 연결[^\r\n]*$/m.exec(individual);
  if (association) {
    const remainder = individual.slice(association.index + association[0].length);
    const nextSection = /^## /m.exec(remainder);
    individual = individual.slice(0, association.index)
      + (nextSection ? remainder.slice(nextSection.index) : '');
  }
  if (!individual.trim()) throw new Error(`Empty individual persona instructions: ${persona.id}@${persona.version}`);
  return individual.trim();
}

const WHOLE_PERSONA_INTERPRETATION = `이 입력은 허구의 성인 한 사람을 위한 합성 설계 설정이며 실존 인물의 진단·기억검사·임상 척도나 장애 집단의 실측 행동 확률이 아니다. 선택된 어려움만 개인 성격·취향·강점과 함께 유지한다. 다른 진단이나 원자료의 모든 특성을 추가하지 않는다.
처음 방문인지와 실제로 연습한 조작은 전달된 확인 경험에서 구분한다. 관련 경험이 없거나 배치·조작이 낯설면 시작할 곳을 정하기 전에 보이는 표지·통로·현재 단계의 설명을 살피거나 잠시 멈출 수 있다. 익숙한 상품을 안다는 사실은 새 위치·재고를 안다는 뜻이 아니다. 반복 방문의 익숙한 전략은 활용하고, 불확실하거나 바뀐 단서는 다시 살핀다. 둘러보기·되돌아가기 횟수나 초회 관찰 횟수를 채우지 않는다.
현재 관심 활동은 개인의 선택·관찰에 따라 이어질 수 있다. 관심이 옮겨간 동안 하던 목표의 세부를 놓칠 수 있지만 매 행동마다 무작위로 잊거나 즉시 구매 목표로 복귀하지 않는다. 선택한 개인의 습관에 따라 충분히 살핀 뒤 스스로 기억하는 목표로 돌아오거나 실제 목록·장바구니 단서로 하던 항목을 회복한다. 관심 구매를 자동 반품하지 않는다.
behavioralContext.goalMemoryCapacity는 동시에 다루는 작은 작업 목표 묶음의 설계 한도다. candidate 6에서는 이 한도가 실제 작업기억과 선언한 기억 사용에도 적용된다. 원장은 표시된 사실의 검증 기록이고 현재 정확히 떠올릴 수 있는 기억이 아니다. 비활성 항목은 실제 목록을 다시 읽거나 selfRecall로 자신의 믿는 값을 구성해야 한다. selfRecall은 외부 확인이 아니며 확실한 원문 기억으로 승격되지 않는다. cognition의 상황별 부담 규칙은 작업기억의 접근 가능성과 확신도를 계산하지만 상품·수량·경로를 대신 선택하거나 오답 횟수를 채우지 않는다. 그 밖의 항목이 필요하면 목록을 다시 읽어 이어 갈 수 있으며, 이 수치로 의무적인 망각·실수나 기억 원장의 무작위 삭제를 만들지 않는다. 알려진 단서를 기록해 두었다는 사실만으로 모든 이름·수량·규격을 동시에 완벽하게 활용한다고 가정하지 않는다. 현재 불확실성·미확인 선택·여러 조건의 부담이 있는지 살피고, 확인·도움·구체적인 피드백을 이용해 필요한 부분을 수정할 수 있다. 도움을 보고 읽었다는 사실만으로 이해·숙달·회차 향상을 부여하지 않는다.
timingBaseline의 reactionMedianMs·reactionSigma·walkSpeed는 원본 생성기의 반응·보행 기준 설계값이다. delayMs는 익숙함, 새 설명, 여러 조건의 부하, 확인된 실패·시간 압박과 실제 지원에 따라 모델이 정하는 행동 전 대기시간이다. 느린 반응은 곧 이해 실패가 아니고 빠른 반응은 완전한 이해가 아니다. 매 행동에 확률 추첨·자동 잡음·고정 지연을 적용하거나 망설임·실수·확인 횟수를 채우지 않는다. 이동·관찰 동작에 드는 시간과 행동 전 반응 대기는 구분한다.`;

const WHOLE_CONTROL_INTERPRETATION = `이 입력은 허구의 성인 한 사람을 위한 페르소나 충실도 대조 설정이다. 실제 성인 집단의 행동 기준, 인지검사 결과나 임상 척도가 아니다. 개인 취향·강점·선택권은 유지하고 별도의 인지·적응 어려움을 추가하지 않는다. 같은 이름의 단계별 확인형 인물에 적용되는 항목마다 목록 재확인과 관심 전환 뒤 기억 부담을 이 대조군에 적용하지 않는다.
익숙한 상품을 아는 것과 이번 매장의 배치·재고·조작을 아는 것은 구분한다. 실제 표시된 사실만 관찰 기억으로 사용할 수 있으며 확인·도움·자기수정은 현재 상황에 따라 선택한다. 관심을 얼마나 살필지와 언제 장보기를 이어갈지는 개인이 결정한다. 정해진 실수·망설임·확인·관심 이탈 횟수나 완벽한 장바구니를 요구하지 않는다.
behavioralContext.goalMemoryCapacity=5는 이번 고부하 조건의 목표 수에 맞춘 설계 상한이다. cognition의 관심 전환·유사 이름·수량 추적 추가 부담 원본값은 0이며, 기존 공통 규칙의 시간 계수와 관찰·작업기억 일관성 검사는 유지한다. 표시되지 않은 목표값을 알고 있다고 선언할 수 없고 selfRecall은 외부 확인이 아니다. 상한과 시간 계수를 사람의 기억 능력 측정으로 해석하지 않는다.
timingBaseline은 합성 반응·보행 기준이다. delayMs는 실제 활동, 새로운 설명, 비교와 지원에 따라 모델이 선택하는 행동 전 대기시간이다. 읽기·이동·드래그의 소요 시간과 구분하며 고정 지연이나 자동 잡음을 추가하지 않는다. 느리거나 빠른 반응만으로 이해 정도를 판단하지 않는다.`;

const WHOLE_TRAITS_INTERPRETATION = `이 입력은 공통 성향 축으로 구성한 허구의 성인 한 사람이다. traitProfile.traits는 행동 선택의 경향이고 traitProfile.context는 성향과 분리된 수행 기준·취향·경험이다. 원본 인물의 이름이나 예전 성격을 추론해 덧붙이지 않는다. 같은 성향이라도 취향·수행 기준·현재 상황에 따라 다른 행동을 할 수 있다. 낮은 확인·숙고·도움 활용 성향이 낮은 인지 능력, 잘못된 선택, 도움 거부를 뜻하지 않는다. 도움 활용은 선택권을 유지하는 방식일 수 있다.
behavioralContext.goalMemoryCapacity와 cognition은 유지 가능한 목표 묶음과 상황별 부담의 합성 설계값이다. 실제 기억검사나 진단이 아니다. 실제 표시된 사실과 현재 접근 가능한 기억을 구분하고, selfRecall은 외부 확인으로 승격하지 않는다. 관심·시간·조건 부담은 제공된 cognition 규칙만 따른다. 기억 부담과 개인 성향을 표현하려고 일부러 잊거나 틀리거나 정해진 확인·이탈·포기 횟수를 만들지 않는다. 정보가 부족하거나 조건이 바뀌면 자신의 성향에 맞게 확인·전략 변경·도움·중단을 선택할 수 있다.
익숙한 상품 경험과 현재 매장의 배치·재고·조작 경험은 별개다. 방문·연습 경험은 실제 전달된 attentionExperience만 따른다. timingBaseline의 반응·보행 기준은 기본 맥락에서 보존한 설계값이다. delayMs는 실제 정보와 활동에 맞게 정하며 성향을 드러내려고 모든 행동에 고정 지연이나 자동 잡음을 추가하지 않는다. 느림과 빠름만으로 이해 정도를 판단하지 않는다.`;

export function buildWholeTracePersonaInput(persona: Persona): WholeTracePersonaInput {
  const individual = individualInstructions(persona);
  const { reactionMedianMs, reactionSigma, walkSpeed } = persona.parameters;
  const cognition = buildWholeTraceCognitionProfile(persona);
  return {
    source: { personaId: persona.id, version: persona.version,
      promptHash: createHash('sha256').update(persona.prompt).digest('hex') },
    individualInstructions: individual,
    behavioralContext: persona.attention?.goalMemoryCapacity === undefined
      ? {} : { goalMemoryCapacity: persona.attention.goalMemoryCapacity },
    timingBaseline: { reactionMedianMs, reactionSigma, walkSpeed },
    cognition,
    cognitionSourceHash: createHash('sha256').update(JSON.stringify(cognition)).digest('hex'),
    ...(persona.traitProfile ? { traitProfile: structuredClone(persona.traitProfile) } : {}),
    instruction: `${ACTOR_PERSONA_INSTRUCTIONS}\n\n${individual}\n\n${persona.traitProfile ? WHOLE_TRAITS_INTERPRETATION : persona.id === VALIDATION_CONTROL_PERSONA_ID ? WHOLE_CONTROL_INTERPRETATION : WHOLE_PERSONA_INTERPRETATION}`,
  };
}
