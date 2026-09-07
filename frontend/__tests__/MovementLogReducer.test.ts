import { MovementLogReducer, type MovementReading, type MovementSpan } from '../src/behavior/movementLogReducer';

type Sample = MovementReading & { span?: MovementSpan };
const point = (time: number, x: number, y = 0): Sample => ({ time, x, y, blocked: false, controlMode: 'joystick' });
function reduce(points: Sample[]) {
  const reducer = new MovementLogReducer<Sample>((event, span) => ({ ...event, span }));
  return [...points.flatMap(p => reducer.push(p, p)), ...reducer.flush()];
}

test('constant speed retains bounded endpoints and measured distance', () => {
  const source = Array.from({ length: 301 }, (_, i) => point(i * 20, i));
  const kept = reduce(source);
  expect(kept).toHaveLength(7);
  expect(kept[0].time).toBe(0); expect(kept.at(-1)?.time).toBe(6000);
  expect(kept.slice(1).reduce((sum, p) => sum + p.span!.observedDistance, 0)).toBe(300);
  for (const p of source) {
    const end = kept.findIndex(k => k.time >= p.time);
    if (end < 1) continue;
    const a = kept[end - 1], b = kept[end];
    expect(Math.abs(p.x - a.x - (b.x - a.x) * (p.time - a.time) / (b.time - a.time))).toBeLessThanOrEqual(0.5);
  }
});

test('short reversals, corners, pauses and speed changes retain their boundaries', () => {
  const source = [point(0, 0), point(100, 1), point(200, 2), point(220, 1.9),
    point(240, 2), point(300, 2), point(400, 2), point(500, 20), point(600, 20, 10)];
  const times = reduce(source).map(p => p.time);
  expect(times).toEqual(expect.arrayContaining([0, 200, 220, 240, 400, 500, 600]));
});

test('blocked/control transitions, invalid times and observation gaps are not bridged', () => {
  const source = [point(0, 0), point(100, 1), { ...point(200, 2), blocked: true },
    point(300, 3), { ...point(400, 4), controlMode: 'touch' }, point(2000, 5), point(2000, 6)];
  expect(reduce(source).map(p => p.time)).toEqual(source.map(p => p.time));
});

test('interactions and explicit flush keep the final pending coordinate exactly once', () => {
  const reducer = new MovementLogReducer<Sample>((event, span) => ({ ...event, span }));
  const first = point(0, 0), last = point(400, 4), action = point(450, -1);
  expect(reducer.push(first, first)).toEqual([first]);
  reducer.push(point(200, 2), point(200, 2));
  expect(reducer.push(last, last)).toEqual([]);
  expect(reducer.push(action, null).map(p => p.time)).toEqual([400, 450]);
  expect(reducer.flush()).toEqual([]);
  expect(reducer.push(point(500, 5), point(500, 5))).toHaveLength(1);
});

test('curved random paths respect the timed reconstruction bound', () => {
  let seed = 47;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const source = Array.from({ length: 800 }, (_, i) => point(i * 16, i + random() * 0.3, Math.sin(i / 18) * 10));
  const kept = reduce(source);
  for (const p of source.slice(1)) {
    const end = kept.findIndex(k => k.time >= p.time), a = kept[end - 1], b = kept[end];
    const f = (p.time - a.time) / (b.time - a.time);
    expect(Math.hypot(p.x - a.x - (b.x - a.x) * f, p.y - a.y - (b.y - a.y) * f)).toBeLessThanOrEqual(0.500001);
    expect(b.time - a.time).toBeLessThanOrEqual(1000);
  }
});
