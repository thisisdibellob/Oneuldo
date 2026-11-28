import type { GuardianData, Report, RouteSnapshot } from './domain';

export function createDemoData(now = new Date()): GuardianData {
  const at = (daysAgo: number, hour = 16) => { const d = new Date(now); d.setDate(d.getDate() - daysAgo); d.setHours(hour, 20, 0, 0); if (d > now) d.setDate(d.getDate() - 1); return d.toISOString(); };
  const route: RouteSnapshot = {
    width: 600, height: 650, durationSeconds: 148,
    fixtures: [
      { id: 'produce', x: 48, y: 70, width: 205, height: 70, label: '과일 / 채소', kind: 'shelf' },
      { id: 'fresh', x: 345, y: 70, width: 205, height: 70, label: '냉장 식품', kind: 'shelf' },
      { id: 'household', x: 48, y: 245, width: 110, height: 160, label: '생활용품', kind: 'shelf' },
      { id: 'meal', x: 245, y: 245, width: 110, height: 160, label: '간편 식품', kind: 'shelf' },
      { id: 'drink', x: 440, y: 245, width: 110, height: 160, label: '음료', kind: 'shelf' },
      { id: 'checkout', x: 395, y: 495, width: 130, height: 60, label: '계산대', kind: 'checkout' },
      { id: 'entrance', x: 150, y: 604, width: 90, height: 32, label: '입구', kind: 'entrance' },
      { id: 'exit', x: 350, y: 604, width: 90, height: 32, label: '출구', kind: 'exit' },
    ],
    points: [
      [195, 590, 0], [195, 470, 12], [200, 190, 33], [145, 175, 41], [145, 175, 52],
      [300, 185, 65], [385, 185, 79], [445, 178, 88], [445, 178, 103], [393, 205, 110],
      [390, 450, 125], [455, 470, 133], [455, 470, 141], [395, 590, 148],
    ].map(([x, y, elapsedSeconds]) => ({ x, y, elapsedSeconds, segment: 0 })),
    actions: [
      { id: 'a1', x: 145, y: 175, elapsedSeconds: 41, kind: 'shelf-opened', label: '과일 / 채소 매대를 열었어요' },
      { id: 'a2', x: 145, y: 175, elapsedSeconds: 47, kind: 'item-added', label: '사과 2개를 담았어요' },
      { id: 'a3', x: 145, y: 175, elapsedSeconds: 52, kind: 'shelf-closed', label: '매대를 닫았어요' },
      { id: 'a4', x: 385, y: 185, elapsedSeconds: 79, kind: 'staff-talked', label: '직원에게 우유 위치를 물었어요' },
      { id: 'a5', x: 445, y: 178, elapsedSeconds: 88, kind: 'shelf-opened', label: '냉장 식품 매대를 열었어요' },
      { id: 'a6', x: 445, y: 178, elapsedSeconds: 97, kind: 'item-added', label: '흰 우유 1개를 담았어요' },
      { id: 'a7', x: 445, y: 178, elapsedSeconds: 103, kind: 'shelf-closed', label: '매대를 닫았어요' },
    ].map(a => ({ ...a, kind: a.kind as RouteSnapshot['actions'][number]['kind'], segment: 0, positionSource: 'recorded' as const })),
  };
  const base: Report = {
    id: 'demo-market-1', childId: 'demo-hayun', game: 'market', title: '부탁받은 물건을 찾아 장보기', completedAt: at(0),
    durationSeconds: 148, status: 'completed', analysisStatus: 'ready', result: 'achieved', source: 'demo',
    summary: '사과와 우유를 찾아 계산을 마쳤어요. 우유의 위치가 헷갈렸을 때 직원에게 물어보고 다시 찾아갔어요.',
    conditions: '물품 2종 · 지도 없음 · 위치 화살표 없음 · 예산 5,000원', supportCount: 1,
    objectives: [{ label: '사과', quantity: 2, unit: '개', achieved: true }, { label: '흰 우유', quantity: 1, unit: '개', achieved: true }],
    findings: [
      { id: 'finding-1', observation: '필요할 때 직원에게 도움을 요청했어요.', interpretation: '이번 과제에서는 말로 위치를 확인한 뒤 목표 매대로 이동했어요.', evidence: '1:19에 직원과 대화한 뒤 냉장 식품 매대를 열었어요.', evidenceEventIds: ['a4', 'a5'], suggestedSupport: '바로 위치를 알려 주기보다 “누구에게 물어볼 수 있을까?” 하고 기다려 주세요.', alternativeExplanations: ['상품 위치를 기억했거나 직원의 안내를 함께 참고했을 수 있어요.'] },
      { id: 'finding-2', observation: '부탁받은 수량에 맞춰 물건을 담았어요.', interpretation: '이 과제의 사과 2개와 우유 1개를 목록과 일치하게 골랐어요.', evidence: '0:47 사과 2개, 1:37 우유 1개 담기 기록이 있어요.', evidenceEventIds: ['a2', 'a6'], suggestedSupport: '다음에도 담은 뒤 목록과 한 번 비교할 시간을 주세요.', alternativeExplanations: ['같은 물품에 익숙해진 영향이 있을 수 있어요.'] },
    ],
    nextPractice: '같은 배치와 물품으로 한 번 더 연습하며 스스로 확인하는 과정을 살펴봐요.',
    uncertainties: ['게임 안의 한 번의 수행이며 실제 생활에서의 수행을 보장하지 않아요.', '조건이 다른 과제의 점수와 직접 비교하지 않았어요.'],
    analysisCreatedAt: at(0), route,
  };
  const reports: Report[] = [base,
    { ...base, id: 'demo-market-2', completedAt: at(2), result: 'partial', summary: '물품 위치를 찾아갔지만 우유 수량을 확인하는 데 도움이 필요했어요.', supportCount: 2, durationSeconds: 205, route: undefined, objectives: [{ label: '사과', quantity: 2, unit: '개', achieved: true }, { label: '흰 우유', quantity: 1, unit: '개', achieved: false }] },
    { ...base, id: 'demo-bus-1', game: 'bus', title: '목적지에 맞는 버스 찾기', completedAt: at(3), durationSeconds: 192, summary: '안내판에서 목적지를 확인하고 알맞은 버스를 선택했어요.', conditions: '목적지 1개 · 노선 2개 · 짧은 문장 안내', supportCount: 1, route: undefined, findings: [], objectives: [{ label: '목적지에 맞는 버스 선택', quantity: 1, unit: '회', achieved: true }], nextPractice: '같은 목적지로 다시 연습하며 노선 확인 과정을 살펴봐요.' },
    { ...base, id: 'demo-market-3', completedAt: at(5), durationSeconds: 225, supportCount: 2, result: 'partial', route: undefined, summary: '부탁받은 물건을 찾은 뒤 계산을 확인하는 연습을 했어요.' },
    { ...base, id: 'demo-market-4', completedAt: at(8), durationSeconds: 250, supportCount: 3, result: 'partial', route: undefined },
    { ...base, id: 'demo-doyun-1', childId: 'demo-doyun', title: '사과 한 개 사 오기', completedAt: at(1), durationSeconds: 180, conditions: '물품 1종 · 지도 제공 · 예산 3,000원', objectives: [{ label: '사과', quantity: 1, unit: '개', achieved: true }], summary: '지도를 참고해서 과일 코너를 찾고 사과 한 개를 구매했어요.', findings: [], route: undefined, supportCount: 1 },
  ];
  // Only the first scenario has a grounded action/route bundle. Do not reuse its
  // evidence or analysis timestamp for another illustrative report.
  for (const report of reports.slice(1)) { report.findings = []; report.analysisCreatedAt = report.completedAt; report.uncertainties = ['화면 설명용으로 만든 가상 기록이에요.']; }
  return { children: [
    { id: 'demo-hayun', name: '하윤', initials: '하', color: '#E7ECDD', linkedAt: at(20) },
    { id: 'demo-doyun', name: '도윤', initials: '도', color: '#F1E6D9', linkedAt: at(12) },
  ], reports, updatedAt: now.toISOString() };
}
