import type { AuthSession, Child, GuardianData, Report } from './domain';

export class ApiError extends Error { constructor(message: string, readonly status = 0) { super(message); } }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string';
export function parseChild(value: unknown): Child {
  if (!object(value) || !text(value.id) || !text(value.name) || !text(value.linkedAt) || !Number.isFinite(Date.parse(value.linkedAt))) throw new ApiError('자녀 정보의 형식을 확인할 수 없어요.');
  return { id: value.id, name: value.name, linkedAt: value.linkedAt, initials: value.name.slice(0, 1), color: '#E7ECDD' };
}
export function parseReport(value: unknown, childId: string): Report {
  if (!object(value) || value.childId !== childId || !text(value.id) || !text(value.title) || !text(value.completedAt) || !Number.isFinite(Date.parse(value.completedAt))
    || !['market', 'bus', 'library'].includes(String(value.game)) || !['completed', 'stopped'].includes(String(value.status))
    || !['ready', 'pending', 'failed'].includes(String(value.analysisStatus)) || !['achieved', 'partial', 'undetermined'].includes(String(value.result))
    || !Number.isFinite(value.durationSeconds) || Number(value.durationSeconds) < 0 || !Number.isFinite(value.supportCount)
    || !text(value.summary) || !text(value.conditions) || !text(value.nextPractice)
    || !Array.isArray(value.objectives) || !Array.isArray(value.findings) || !Array.isArray(value.uncertainties) || value.source !== 'human') {
    throw new ApiError('분석 자료의 형식을 확인할 수 없어요. 새로고침 후 다시 확인해 주세요.');
  }
  for (const o of value.objectives) if (!object(o) || !text(o.label) || !Number.isFinite(o.quantity) || !text(o.unit) || typeof o.achieved !== 'boolean') throw new ApiError('물품 기록 형식이 올바르지 않아요.');
  for (const f of value.findings) if (!object(f) || !['id', 'observation', 'interpretation', 'evidence', 'suggestedSupport'].every(k => text(f[k])) || !Array.isArray(f.evidenceEventIds) || !f.evidenceEventIds.every(text) || !Array.isArray(f.alternativeExplanations) || !f.alternativeExplanations.every(text)) throw new ApiError('분석 근거 형식이 올바르지 않아요.');
  if (!value.uncertainties.every(text)) throw new ApiError('분석 안내 형식이 올바르지 않아요.');
  if (value.route !== undefined && value.route !== null) {
    const r = value.route;
    if (!object(r) || !Number.isFinite(r.width) || Number(r.width) <= 0 || !Number.isFinite(r.height) || Number(r.height) <= 0 || !Number.isFinite(r.durationSeconds) || Number(r.durationSeconds) < 0 || !Array.isArray(r.points) || !Array.isArray(r.actions) || !Array.isArray(r.fixtures)) throw new ApiError('경로 자료 형식이 올바르지 않아요.');
    let previous = -1;
    for (const p of [...r.points, ...r.actions]) {
      if (!object(p) || !['x', 'y', 'elapsedSeconds', 'segment'].every(k => Number.isFinite(p[k])) || Number(p.elapsedSeconds) < 0 || Number(p.elapsedSeconds) > Number(r.durationSeconds)) throw new ApiError('경로 위치 형식이 올바르지 않아요.');
    }
    for (const p of r.points) { if (p.elapsedSeconds < previous) throw new ApiError('경로 시간 순서가 올바르지 않아요.'); previous = p.elapsedSeconds; }
    for (const a of r.actions) if (!text(a.id) || !text(a.label) || !['shelf-opened', 'shelf-closed', 'item-added', 'item-removed', 'staff-talked'].includes(a.kind) || !['recorded', 'last-known'].includes(a.positionSource)) throw new ApiError('행동 위치 형식이 올바르지 않아요.');
    for (const f of r.fixtures) if (!object(f) || !['x', 'y', 'width', 'height'].every(k => Number.isFinite(f[k])) || !text(f.id) || !text(f.label) || !['shelf', 'checkout', 'entrance', 'exit'].includes(String(f.kind))) throw new ApiError('지도 배치 형식이 올바르지 않아요.');
  }
  return value as unknown as Report;
}

export function createGuardianApi(baseUrl: string) {
  const base = baseUrl.trim().replace(/\/+$/, '');
  async function request(path: string, token?: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
    if (!base) throw new ApiError('서버 연결이 아직 준비되지 않았어요. 시연 화면으로 먼저 둘러볼 수 있어요.');
    let address: URL;
    try { address = new URL(base); } catch { throw new ApiError('서버 주소를 확인해 주세요.'); }
    const octets = address.hostname.split('.').map(Number);
    const privateIp = octets.length === 4 && octets.every(n => Number.isInteger(n) && n >= 0 && n <= 255)
      && (octets[0] === 10 || (octets[0] === 192 && octets[1] === 168));
    const localDev = __DEV__ && address.protocol === 'http:' && (address.hostname === 'localhost' || address.hostname === '127.0.0.1' || privateIp);
    if (address.username || address.password || (address.protocol !== 'https:' && !localDev)) throw new ApiError('보안 연결이 가능한 서버 주소가 필요해요.');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(base + path, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal });
      if (response.status === 401) throw new ApiError(token ? '로그인 시간이 만료됐어요. 다시 로그인해 주세요.' : '이메일과 비밀번호를 확인해 주세요.', 401);
      if (response.status === 403) throw new ApiError('이 자녀의 기록을 볼 권한이 없어요. 연결 상태를 확인해 주세요.', 403);
      if (response.status === 404 || response.status === 501) throw new ApiError('보호자 서비스 연결이 아직 준비되지 않았어요.', response.status);
      if (response.status === 409) throw new ApiError('이미 연결됐거나 사용할 수 없는 연결 코드예요.', 409);
      if (response.status === 400 || response.status === 410) throw new ApiError('연결 코드를 확인해 주세요. 만료됐다면 새 코드를 받아 주세요.', response.status);
      if (!response.ok) throw new ApiError('서버에서 정보를 가져오지 못했어요. 잠시 뒤 다시 시도해 주세요.', response.status);
      return response.status === 204 ? null : await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError('서버에 연결하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.');
    } finally { clearTimeout(timer); }
  }
  return {
    async login(email: string, password: string): Promise<AuthSession> {
      const value = await request('/api/auth/login', undefined, { email: email.trim(), password });
      if (!object(value) || value.role !== 'PARENT') throw new ApiError('보호자 계정으로 로그인해 주세요.', 403);
      if (!text(value.accessToken) || !text(value.refreshToken) || !text(value.memberId) || !text(value.name) || !Number.isFinite(value.expiresIn) || Number(value.expiresIn) <= 0) throw new ApiError('로그인 응답을 확인할 수 없어요.');
      return { accessToken: value.accessToken, refreshToken: value.refreshToken, memberId: value.memberId, name: value.name, expiresAt: Date.now() + Number(value.expiresIn) * 1000 };
    },
    async load(token: string): Promise<GuardianData> {
      const value = await request('/api/guardians/me/children', token);
      if (!Array.isArray(value)) throw new ApiError('자녀 목록의 형식을 확인할 수 없어요.');
      const children = value.map(parseChild);
      // Never fall back to /behavior-analyses/latest: that endpoint belongs to
      // the signed-in parent and is not a child's report.
      const reports = (await Promise.all(children.map(async child => {
        const result = await request(`/api/guardians/me/children/${encodeURIComponent(child.id)}/reports`, token);
        if (!Array.isArray(result)) throw new ApiError('훈련 기록을 확인할 수 없어요.');
        return result.map(r => parseReport(r, child.id));
      }))).flat();
      return { children, reports, updatedAt: new Date().toISOString() };
    },
    async link(token: string, code: string): Promise<void> { await request('/api/guardians/me/children/link', token, { code }); },
    async unlink(token: string, childId: string): Promise<void> { await request(`/api/guardians/me/children/${encodeURIComponent(childId)}`, token, undefined, 'DELETE'); },
    async logout(token: string): Promise<void> { await request('/api/auth/logout', token, undefined, 'POST'); },
  };
}
