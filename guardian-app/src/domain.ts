export type Child = { id: string; name: string; initials: string; color: string; linkedAt: string };
export type RoutePoint = { x: number; y: number; elapsedSeconds: number; segment: number };
export type RouteAction = RoutePoint & { id: string; kind: 'shelf-opened' | 'shelf-closed' | 'item-added' | 'item-removed' | 'staff-talked'; label: string; positionSource: 'recorded' | 'last-known' };
export type MapRect = { id: string; x: number; y: number; width: number; height: number; label: string; kind: 'shelf' | 'entrance' | 'exit' | 'checkout' };
export type RouteSnapshot = { width: number; height: number; fixtures: MapRect[]; points: RoutePoint[]; actions: RouteAction[]; durationSeconds: number };
export type Finding = { id: string; observation: string; interpretation: string; evidence: string; evidenceEventIds: string[]; suggestedSupport: string; alternativeExplanations: string[] };
export type Report = {
  id: string; childId: string; game: 'market' | 'bus' | 'library'; title: string; completedAt: string;
  durationSeconds: number; status: 'completed' | 'stopped'; analysisStatus: 'ready' | 'pending' | 'failed';
  result: 'achieved' | 'partial' | 'undetermined'; summary: string; conditions: string; supportCount: number;
  objectives: { label: string; quantity: number; unit: string; achieved: boolean }[];
  findings: Finding[]; nextPractice: string; uncertainties: string[]; route?: RouteSnapshot;
  analysisCreatedAt?: string; source: 'demo' | 'human';
};
export type GuardianData = { children: Child[]; reports: Report[]; updatedAt: string };
export type AuthSession = { accessToken: string; refreshToken: string; name: string; memberId: string; expiresAt: number };
export const gameLabel = { market: '장보기', bus: '버스 이용', library: '도서관' };
export const actionLabel = { 'shelf-opened': '매대 열기', 'shelf-closed': '매대 닫기', 'item-added': '상품 담기', 'item-removed': '상품 내려놓기', 'staff-talked': '직원과 대화' };
export function time(seconds: number) { const n = Math.max(0, Math.floor(seconds)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; }
export function dateLabel(date: string, withTime = false) { const d = new Date(date); return `${d.getMonth() + 1}월 ${d.getDate()}일${withTime ? ` ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''}`; }
export function reportsFor(data: GuardianData, childId: string, days: number, now = Date.now()) {
  const cut = new Date(now); cut.setHours(0, 0, 0, 0); cut.setDate(cut.getDate() - days + 1);
  return data.reports.filter(r => r.childId === childId && Date.parse(r.completedAt) >= cut.getTime() && Date.parse(r.completedAt) <= now).sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt));
}
export function routePointAt(points: RoutePoint[], seconds: number): RoutePoint | undefined {
  if (!points.length) return undefined;
  let i = 0; while (i + 1 < points.length && points[i + 1].elapsedSeconds <= seconds) i++;
  const a = points[i], b = points[i + 1];
  const ratio = b && a.segment === b.segment && b.elapsedSeconds > a.elapsedSeconds ? Math.max(0, Math.min(1, (seconds - a.elapsedSeconds) / (b.elapsedSeconds - a.elapsedSeconds))) : 0;
  return { x: a.x + (b ? b.x - a.x : 0) * ratio, y: a.y + (b ? b.y - a.y : 0) * ratio, segment: a.segment, elapsedSeconds: seconds };
}
export function clippedRoute(points: RoutePoint[], seconds: number) {
  const shown = points.filter(p => p.elapsedSeconds <= seconds);
  const point = routePointAt(points, seconds);
  if (point && shown.length && point.elapsedSeconds > shown[shown.length - 1].elapsedSeconds) shown.push(point);
  return shown;
}
