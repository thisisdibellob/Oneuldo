import type { QuestDetail } from '../api/quest';

export type TransportMode = 'BUS' | 'SUBWAY';

export type TransportIncident = {
  id: string;
  mode: TransportMode;
  title: string;
  situationConstraint: string;
  requiredActions: string[];
  situationAnchors: string[];
  responseAnchors: string[];
};

const create = (
  mode: TransportMode,
  id: string,
  title: string,
  situationConstraint: string,
  requiredActions: string[],
  situationAnchors: string[],
  responseAnchors: string[],
): TransportIncident => ({ mode, id, title, situationConstraint, requiredActions, situationAnchors, responseAnchors });

// 서버 JSON과 ID를 맞춘 네이티브 모델용 최소 미러다. 클라우드 생성에서는 서버 JSON이 최종 권위다.
export const transportIncidents: Record<TransportMode, TransportIncident[]> = {
  BUS: [
    create('BUS', 'BUS_DISPLAY_UNAVAILABLE', '정류장 안내 화면을 볼 수 없음', '정류장 전광판이나 안내 화면을 바로 확인할 수 없다.', ['버스 앞·옆의 번호와 행선지를 직접 확인한다', '확실하지 않으면 기사나 보호자에게 묻는다'], ['화면', '전광판', '꺼져', '안 보여'], ['번호', '행선지', '확인', '묻']),
    create('BUS', 'BUS_CROWDED_STOP', '혼잡한 정류장', '사람이 많아 안내판이나 승차 위치가 가려진다.', ['차도에서 떨어진 안전한 곳에서 차례를 지킨다', '사람 사이로 밀지 않고 공식 안내를 확인한다'], ['사람', '붐비', '혼잡', '가려'], ['안전', '차례', '기다', '확인']),
    create('BUS', 'BUS_SIMILAR_ROUTE_NUMBER', '비슷한 번호의 버스', '비슷한 번호나 비슷한 행선지의 버스가 연달아 도착한다.', ['번호뿐 아니라 행선지와 운행 방향을 함께 확인한다'], ['비슷한', '두 대', '연달아', '번호'], ['번호', '행선지', '방향', '확인']),
    create('BUS', 'BUS_ANNOUNCEMENT_UNCLEAR', '안내 방송을 듣기 어려움', '주변 소리 때문에 안내 방송을 정확히 듣기 어렵다.', ['안내 화면과 정류장 표지를 함께 확인한다', '필요하면 다시 물어본다'], ['방송', '소리', '잘 안 들', '시끄'], ['화면', '표지', '확인', '묻']),
    create('BUS', 'BUS_TEMPORARY_STOP_CHANGE', '임시 정류장 변경', '공식 안내에 평소 승차 위치가 임시로 바뀌었다고 표시된다.', ['공식 표지와 안전한 보행로를 따라 임시 위치를 확인한다'], ['임시', '바뀌', '변경', '공사'], ['공식', '표지', '안전', '확인']),
    create('BUS', 'BUS_DELAYED_ARRIVAL', '버스 도착 지연', '기다리던 버스의 도착이 늦어진다는 공식 안내가 나온다.', ['안전한 곳에서 새 도착 정보를 확인한다', '급해도 뛰거나 임의의 버스를 타지 않는다'], ['늦', '지연', '도착 정보', '기다'], ['안전', '확인', '기다', '묻']),
    create('BUS', 'BUS_WRONG_DIRECTION_NEARBY', '반대 방향 버스가 먼저 도착', '같은 번호지만 반대 방향으로 가는 버스가 먼저 보인다.', ['정류장 방향과 버스 행선지를 다시 확인한다'], ['반대', '방향', '건너편', '같은 번호'], ['방향', '행선지', '확인']),
    create('BUS', 'BUS_COMPANION_GUESSES', '동행자가 확인 없이 재촉', '함께 있는 사람이 공식 안내를 확인하지 않고 빨리 움직이자고 한다.', ['재촉을 받아도 번호·행선지·안전 여부를 직접 확인한다'], ['함께', '친구', '재촉', '빨리'], ['직접', '확인', '번호', '안전']),
    create('BUS', 'BUS_PHONE_UNAVAILABLE', '휴대전화 정보를 사용할 수 없음', '휴대전화의 배터리나 네트워크 문제로 검색 정보를 볼 수 없다.', ['정류장 공식 안내를 확인하거나 기사·보호자에게 도움을 요청한다'], ['휴대전화', '배터리', '검색', '인터넷'], ['공식', '안내', '도움', '묻']),
    create('BUS', 'BUS_WEATHER_VISIBILITY', '날씨 때문에 확인이 어려움', '비나 눈 때문에 버스 번호 또는 정류장 표지가 잘 보이지 않는다.', ['안전한 위치에서 가까이 온 버스의 번호와 행선지를 차분히 확인한다'], ['비', '눈', '우산', '잘 안 보'], ['안전', '번호', '행선지', '확인']),
  ],
  SUBWAY: [
    create('SUBWAY', 'SUBWAY_DISPLAY_UNAVAILABLE', '역 안내 화면을 볼 수 없음', '노선 또는 도착 안내 화면을 바로 확인할 수 없다.', ['노선도·역 이름·방면 표지를 함께 확인한다', '확실하지 않으면 역 직원에게 묻는다'], ['화면', '전광판', '꺼져', '안 보여'], ['노선', '역 이름', '방면', '확인', '묻']),
    create('SUBWAY', 'SUBWAY_CROWDED_PLATFORM', '혼잡한 승강장', '사람이 많아 승강장 표지나 안전선이 잘 보이지 않는다.', ['사람을 밀지 않고 안전선 안쪽에서 차례를 지킨다'], ['사람', '붐비', '혼잡', '가려'], ['안전선', '차례', '기다', '안전']),
    create('SUBWAY', 'SUBWAY_SIMILAR_LINE_COLOR', '비슷한 노선색이나 이름', '비슷한 색이나 이름의 노선 안내가 함께 보여 헷갈린다.', ['노선 색만 보지 않고 번호·역 이름·방면을 함께 확인한다'], ['비슷한', '색', '노선', '헷갈'], ['번호', '역 이름', '방면', '확인']),
    create('SUBWAY', 'SUBWAY_ANNOUNCEMENT_UNCLEAR', '방송을 듣기 어려움', '주변 소리 때문에 열차나 역 안내 방송을 정확히 듣기 어렵다.', ['안내 화면과 역 이름 표지를 함께 확인한다'], ['방송', '소리', '잘 안 들', '시끄'], ['화면', '역 이름', '표지', '확인']),
    create('SUBWAY', 'SUBWAY_PLATFORM_CHANGED', '승강장 변경', '공식 안내에 이용할 승강장이 임시로 바뀌었다고 나온다.', ['공식 표지의 노선과 방면을 확인하고 안전한 통로로 이동한다'], ['승강장', '바뀌', '변경', '임시'], ['공식', '방면', '표지', '안전']),
    create('SUBWAY', 'SUBWAY_TRAIN_DELAYED', '열차 운행 지연', '이용하려던 열차가 늦어진다는 공식 안내가 나온다.', ['안전한 곳에서 변경된 도착 정보를 확인한다'], ['늦', '지연', '운행', '기다'], ['안전', '도착', '방면', '확인']),
    create('SUBWAY', 'SUBWAY_WRONG_DIRECTION_PLATFORM', '반대 방면 승강장 혼동', '같은 노선의 반대 방면 승강장이 가까이 있어 헷갈린다.', ['목적지 역이 표시된 방면인지 확인한다'], ['반대', '방면', '승강장', '같은 노선'], ['목적지', '방면', '역', '확인']),
    create('SUBWAY', 'SUBWAY_COMPANION_GUESSES', '동행자가 확인 없이 재촉', '함께 있는 사람이 표지를 확인하지 않고 빨리 이동하자고 한다.', ['재촉을 받아도 노선·방면·안전 여부를 직접 확인한다'], ['함께', '친구', '재촉', '빨리'], ['직접', '노선', '방면', '확인']),
    create('SUBWAY', 'SUBWAY_PHONE_UNAVAILABLE', '휴대전화 정보를 사용할 수 없음', '휴대전화의 배터리나 네트워크 문제로 경로 검색을 볼 수 없다.', ['역의 공식 노선도와 표지를 확인하거나 역 직원에게 도움을 요청한다'], ['휴대전화', '배터리', '검색', '인터넷'], ['공식', '노선도', '표지', '도움']),
    create('SUBWAY', 'SUBWAY_EXIT_SIGN_UNCLEAR', '출구 안내를 구분하기 어려움', '비슷한 출구 번호와 목적지 안내가 여러 방향에 표시된다.', ['출구 번호와 목적 장소를 함께 확인하고 안전한 통로를 이용한다'], ['출구', '여러', '비슷한', '방향'], ['출구 번호', '목적', '확인', '안전']),
  ],
};

export function detectTransportMode(quest: Pick<QuestDetail, 'title' | 'goal'> & Partial<Pick<QuestDetail, 'code' | 'summary'>>): TransportMode {
  const text = [quest.code ?? '', quest.title, quest.summary ?? '', quest.goal].join(' ');
  return /지하철|전철|개찰구|승강장|역무원|노선도/u.test(text) ? 'SUBWAY' : 'BUS';
}

export function selectTransportIncident(
  quest: Pick<QuestDetail, 'title' | 'goal'> & Partial<Pick<QuestDetail, 'code' | 'summary'>>,
  sequence: number,
): TransportIncident {
  const templates = transportIncidents[detectTransportMode(quest)];
  return templates[sequence % templates.length];
}

export function buildIncidentPromptBlock(incident: TransportIncident): string {
  return [
    `돌발상황 ID: ${incident.id}`,
    `돌발상황: ${incident.title}`,
    `반드시 섞을 조건: ${incident.situationConstraint}`,
    '정답에 반영할 대처 행동:',
    ...incident.requiredActions.map((action) => `- ${action}`),
  ].join('\n');
}
