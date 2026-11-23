import { clippedRoute, reportsFor, routePointAt, type RoutePoint } from '../src/domain';
import { createDemoData } from '../src/demo';

test('child and calendar-period filters never mix siblings, future sessions or old records', () => {
  const now = new Date(2026, 10, 20, 19), data = createDemoData(now);
  expect(reportsFor(data, 'demo-hayun', 7, +now)).toHaveLength(4);
  expect(reportsFor(data, 'demo-hayun', 30, +now)).toHaveLength(5);
  expect(reportsFor(data, 'demo-doyun', 7, +now).map(r => r.childId)).toEqual(['demo-doyun']);
  data.reports.push({ ...data.reports[0], id: 'future', completedAt: new Date(+now + 10000).toISOString() });
  expect(reportsFor(data, 'demo-hayun', 7, +now).some(r => r.id === 'future')).toBe(false);
});
test('route drawing interpolates continuously, retains pauses and never joins teleports', () => {
  const points: RoutePoint[] = [
    { x: 0, y: 0, elapsedSeconds: 0, segment: 0 }, { x: 100, y: 0, elapsedSeconds: 10, segment: 0 },
    { x: 100, y: 0, elapsedSeconds: 20, segment: 0 }, { x: 500, y: 500, elapsedSeconds: 30, segment: 1 },
  ];
  expect(routePointAt(points, 5)).toMatchObject({ x: 50, y: 0 });
  expect(routePointAt(points, 15)).toMatchObject({ x: 100, y: 0 });
  expect(routePointAt(points, 25)).toMatchObject({ x: 100, y: 0, segment: 0 });
  expect(routePointAt(points, 30)).toMatchObject({ x: 500, y: 500, segment: 1 });
  expect(clippedRoute(points, 5).at(-1)).toMatchObject({ x: 50, elapsedSeconds: 5 });
});
test('demo evidence is explicitly fictional and route evidence is not reused for other sessions', () => {
  const data = createDemoData();
  expect(data.reports.every(r => r.source === 'demo')).toBe(true);
  expect(data.reports.slice(1).every(r => !r.route && !r.findings.length)).toBe(true);
  expect(data.reports[0].route?.actions.some(a => a.kind === 'staff-talked')).toBe(true);
});
