import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { actionLabel, clippedRoute, routePointAt, time, type RouteSnapshot } from './domain';
import { Button, Icon, Pill, u } from './ui';
import { c, f } from './theme';

export function RouteReview({ route }: { route: RouteSnapshot }) {
  const [width, setWidth] = useState(300), [seconds, setSeconds] = useState(route.durationSeconds), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(2), [selected, setSelected] = useState<string | null>(null);
  const reduced = useRef(false), current = useRef(seconds); current.current = seconds;
  useEffect(() => { let alive = true; void AccessibilityInfo.isReduceMotionEnabled().then(v => { if (alive) reduced.current = v; }); const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', v => { reduced.current = v; if (v) setPlaying(false); }); return () => { alive = false; sub.remove(); }; }, []);
  useEffect(() => { const sub = AppState.addEventListener('change', state => { if (state !== 'active') setPlaying(false); }); return () => sub.remove(); }, []);
  useEffect(() => {
    if (!playing) return;
    let frame = 0, started: number | null = null, last = 0; const from = current.current;
    const tick = (stamp: number) => { if (started === null) started = stamp; const next = Math.min(route.durationSeconds, from + (stamp - started) / 1000 * speed); if (stamp - last >= (reduced.current ? 200 : 33) || next === route.durationSeconds) { setSeconds(next); last = stamp; } if (next < route.durationSeconds) frame = requestAnimationFrame(tick); else setPlaying(false); };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  }, [playing, speed, route.durationSeconds]);
  const scale = width / route.width, points = clippedRoute(route.points, seconds), position = route.actions.find(a => a.id === selected) ?? routePointAt(route.points, seconds);
  const choose = (id: string, elapsedSeconds: number) => { setPlaying(false); setSelected(id); setSeconds(elapsedSeconds); };
  return <View testID="route-review" style={{ gap: 16 }}>
    <View style={[u.row, { justifyContent: 'space-between' }]}><Text style={u.body}>어디서 무엇을 했을까요?</Text><Text style={{ fontFamily: f.bold, fontSize: 14, color: c.green }}>{time(seconds)} / {time(route.durationSeconds)}</Text></View>
    <View onLayout={e => setWidth(Math.max(1, e.nativeEvent.layout.width - 16))} testID="route-map" style={{ width: '100%', maxWidth: 520, alignSelf: 'center', aspectRatio: route.width / route.height, borderRadius: 18, backgroundColor: '#F3F2E9', borderWidth: 8, borderColor: '#D4DACB', overflow: 'hidden' }}>
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height: route.height * scale }}>
        {route.fixtures.map(rect => <View key={rect.id} style={{ position: 'absolute', left: rect.x * scale, top: rect.y * scale, width: rect.width * scale, height: rect.height * scale, borderRadius: 5, backgroundColor: rect.kind === 'entrance' ? '#5B8B6B' : rect.kind === 'exit' ? '#B78362' : rect.kind === 'checkout' ? '#CAB392' : '#C6CEB9', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontFamily: f.bold, fontSize: Math.max(10, Math.min(14, 20 * scale)), color: rect.kind === 'entrance' || rect.kind === 'exit' ? '#FFFFFF' : '#455443', textAlign: 'center' }}>{rect.label}</Text></View>)}
        {points.slice(1).map((b, i) => { const a = points[i]; if (a.segment !== b.segment) return null; const length = Math.hypot(b.x - a.x, b.y - a.y) * scale; if (length < .1) return null; return <View key={i} style={{ position: 'absolute', left: (a.x + b.x) / 2 * scale - length / 2, top: (a.y + b.y) / 2 * scale - 3, width: length, height: 6, borderRadius: 4, backgroundColor: '#FFFFFF', borderWidth: 1.2, borderColor: '#6E9A82', transform: [{ rotate: `${Math.atan2(b.y - a.y, b.x - a.x)}rad` }] }} />; })}
        {position && <View testID="route-position" style={{ position: 'absolute', left: position.x * scale - 6, top: position.y * scale - 6, width: 12, height: 12, borderRadius: 6, backgroundColor: '#28765A', borderWidth: 2, borderColor: '#fff' }} />}
      </View>
      {route.actions.filter(a => a.elapsedSeconds <= seconds).map((a, i) => <Pressable key={a.id} accessibilityRole="button" accessibilityLabel={`${i + 1}. ${a.label} ${time(a.elapsedSeconds)}`} onPress={() => choose(a.id, a.elapsedSeconds)} style={{ position: 'absolute', left: a.x * scale - 9 + (i % 3 - 1) * 12, top: a.y * scale - 20 - Math.floor(i % 3 / 2) * 8, width: 22, height: 22, borderRadius: 11, backgroundColor: selected === a.id ? '#234D3A' : '#51846B', borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}><Text style={{ color: '#fff', fontFamily: f.bold, fontSize: 10 }}>{i + 1}</Text></Pressable>)}
    </View>
    <View style={[u.row, { gap: 8, flexWrap: 'wrap' }]}>
      <Button compact label={playing ? '경로 일시정지' : '경로 재생'} icon={playing ? 'pause' : 'play'} onPress={() => { setSelected(null); if (!playing && seconds >= route.durationSeconds) setSeconds(0); setPlaying(v => !v); }} disabled={!route.points.length} />
      <Button compact label="처음" tone="light" onPress={() => { setPlaying(false); setSeconds(0); setSelected(null); }} />
      <Button compact label="전체" tone="light" onPress={() => { setPlaying(false); setSeconds(route.durationSeconds); setSelected(null); }} />
      <Button compact label={`${speed}배속`} tone="plain" onPress={() => setSpeed(v => v === 2 ? 1 : 2)} />
    </View>
    <Text style={u.small}>선은 이동 경로, 번호는 행동 위치예요. 재생하면 이동 순서대로 이어져요.</Text>
    <View style={{ gap: 6 }}>
      {route.actions.map((a, i) => <Pressable key={a.id} accessibilityRole="button" accessibilityLabel={`${a.label} 위치 보기`} onPress={() => choose(a.id, a.elapsedSeconds)} style={[s.event, selected === a.id && { backgroundColor: c.pale, borderColor: '#BAD0B8' }]}>
        <View style={s.number}><Text style={{ fontFamily: f.bold, color: c.green, fontSize: 12 }}>{i + 1}</Text></View>
        <View style={{ flex: 1, gap: 3 }}><Text style={{ fontFamily: f.medium, fontSize: 13, color: c.ink, lineHeight: 20 }}>{a.label}</Text><Text style={u.small}>{actionLabel[a.kind]}{a.positionSource === 'last-known' ? ' · 마지막 확인 위치' : ''}</Text></View><Pill tone="gray">{time(a.elapsedSeconds)}</Pill>
      </Pressable>)}
      {!route.actions.length && <Text style={u.body}>이 기록에는 행동 위치 표시가 없어요.</Text>}
    </View>
  </View>;
}
const s = StyleSheet.create({ event: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderWidth: 1, borderColor: 'transparent', borderRadius: 12 }, number: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#E7EEDF', alignItems: 'center', justifyContent: 'center' } });
