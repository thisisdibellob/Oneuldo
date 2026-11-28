import { ApiError, createGuardianApi, parseReport } from '../src/api';
import { createDemoData } from '../src/demo';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; jest.restoreAllMocks(); });
const response = (value: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value }) as Response;
test('login uses existing email auth, sends credentials only in the body and refuses child accounts', async () => {
  const request = jest.fn().mockResolvedValue(response({ role: 'CHILD' })); globalThis.fetch = request;
  await expect(createGuardianApi('https://example.com').login(' parent@example.com ', 'secret')).rejects.toMatchObject({ status: 403 });
  expect(request).toHaveBeenCalledWith('https://example.com/api/auth/login', expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'parent@example.com', password: 'secret' }) }));
});
test('guardian reports only use relationship-scoped endpoints, never the parent own-analysis endpoint', async () => {
  const sample = { ...createDemoData().reports[0], childId: 'child/a', source: 'human' };
  const request = jest.fn().mockResolvedValueOnce(response([{ id: 'child/a', name: '자녀', linkedAt: new Date().toISOString() }])).mockResolvedValueOnce(response([sample])); globalThis.fetch = request;
  const data = await createGuardianApi('https://example.com/').load('token');
  expect(data.reports[0].childId).toBe('child/a');
  expect(request.mock.calls.map(c => c[0])).toEqual(['https://example.com/api/guardians/me/children', 'https://example.com/api/guardians/me/children/child%2Fa/reports']);
  expect(request.mock.calls[1][1].headers.Authorization).toBe('Bearer token');
});
test.each([401, 403, 404, 500])('server %s is an error, never a demo-data fallback', async status => {
  globalThis.fetch = jest.fn().mockResolvedValue(response({}, status));
  await expect(createGuardianApi('https://example.com').load('token')).rejects.toMatchObject({ status });
});
test('live reports reject sibling records, synthetic fixtures and malformed movement positions', () => {
  const report = { ...createDemoData().reports[0], source: 'human' };
  expect(() => parseReport(report, 'other-child')).toThrow(ApiError);
  expect(() => parseReport({ ...report, source: 'demo' }, report.childId)).toThrow(ApiError);
  expect(() => parseReport({ ...report, route: { ...report.route, points: [{ x: Infinity, y: 0, elapsedSeconds: 0, segment: 0 }] } }, report.childId)).toThrow(ApiError);
});
test('missing server config and insecure remote URL fail before sending credentials', async () => {
  globalThis.fetch = jest.fn();
  await expect(createGuardianApi('').login('a', 'b')).rejects.toThrow('서버 연결');
  await expect(createGuardianApi('http://untrusted.example.com').login('a', 'b')).rejects.toThrow('보안 연결');
  expect(globalThis.fetch).not.toHaveBeenCalled();
});
