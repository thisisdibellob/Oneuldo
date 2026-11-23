import { memo, useEffect, useMemo, useState } from 'react';
import { Animated, Platform, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { MarketEnvironment } from '../../game/marketEnvironment';
import { marketCategories } from '../../game/scenarios';
import {
  marketRoutePauseMarkers,
  marketRoutePointAt,
  type MarketRouteAction,
  type MarketRouteActionKind,
  type MarketTrajectory,
} from '../../game/marketTrajectory';
import { fonts } from '../../theme';
import { PressScale } from '../PressScale';
import type { MarketRoutePoint } from '../../game/marketTrajectory';
import { MARKET_ROUTE_REPLAY_RATE, useMarketRoutePlayback } from '../../game/useMarketRoutePlayback';

const actionStyle = {
  'shelf-opened': { color: '#267E79', tint: '#E0EFEB', icon: 'grid', short: '매대 열기' },
  'shelf-closed': { color: '#657480', tint: '#E9EDF0', icon: 'x', short: '매대 닫기' },
  'item-added': { color: '#947025', tint: '#F6ECD1', icon: 'plus', short: '상품 담기' },
  'item-removed': { color: '#AD6654', tint: '#F7E8E1', icon: 'minus', short: '내려놓기' },
  'staff-talked': { color: '#796A9E', tint: '#EEE8F5', icon: 'message-circle', short: '종업원 대화' },
} as const;
const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const ROUTE_LINE_WIDTH = 3;
const ROUTE_OUTLINE_WIDTH = 5;
const ROUTE_OUTLINE = 'rgba(76,104,89,0.4)';
const ROUTE_CURSOR_RADIUS = 6;

function actionGroups(actions: MarketRouteAction[], scale: number) {
  const groups: { anchor: MarketRouteAction; items: MarketRouteAction[] }[] = [];
  for (const action of actions) {
    const group = groups.find(g => g.anchor.segment === action.segment &&
      Math.hypot(g.anchor.x - action.x, g.anchor.y - action.y) * scale < 28);
    if (group) group.items.push(action);
    else groups.push({ anchor: action, items: [action] });
  }
  return groups;
}

function shelfName(id: string, width: number) {
  const name =
    marketCategories.find((category) => category.id === id)?.label ?? '매대';
  return width < 60
    ? name
        .replace(' ', '\n')
        .replace('생활용품', '생활\n용품')
        .replace('과일/채소', '과일/\n채소')
    : name;
}

function mapDoors(environment: MarketEnvironment) {
  return (['entrance', 'exit'] as const).map((id) => {
    const gate = environment.alarmGates?.find((item) => item.id === id)?.gate;
    return {
      id,
      label: id === 'entrance' ? '입구' : '출구',
      color: id === 'entrance' ? '#4C8563' : '#A96D50',
      point: gate
        ? { x: gate.x + gate.width / 2, y: gate.y + gate.height / 2 }
        : environment.stations[id],
    };
  });
}

function routeLabels(points: MarketRoutePoint[], scale: number) {
  const stride = Math.max(1, Math.ceil(points.length / 20));
  const groups: { point: MarketRoutePoint; count: number }[] = [];
  points
    .filter((_, i) => i % stride === 0)
    .forEach((point) => {
      const group = groups.find(
        (g) =>
          Math.abs(g.point.x - point.x) * scale < 35 &&
          Math.abs(g.point.y - point.y) * scale < 14
      );
      if (group) group.count++;
      else groups.push({ point, count: 1 });
    });
  return groups.map((g) => ({
    ...g.point,
    label:
      Math.round(g.point.elapsedSeconds) +
      's' +
      (g.count > 1 ? ' +' + (g.count - 1) : ''),
  }));
}

/** Static geometry and native transforms keep the route smooth without rebuilding every line per frame. */
const AnimatedRoute = memo(function AnimatedRoute({ trajectory, scale, progress }: {
  trajectory: MarketTrajectory; scale: number; progress: Animated.Value;
}) {
  const lines = useMemo(() => {
    const stride = Math.max(1, Math.ceil(trajectory.points.length / 2000));
    const points = trajectory.points.filter((p, i, all) => i % stride === 0 || i === all.length - 1 ||
      p.segment !== all[i - 1]?.segment || p.segment !== all[i + 1]?.segment);
    return points.slice(1).flatMap((b, i) => {
      const a = points[i];
      if (a.segment !== b.segment) return [];
      const dx = (b.x - a.x) * scale, dy = (b.y - a.y) * scale, length = Math.hypot(dx, dy);
      if (length < 0.01) return [];
      const start = Math.min(a.elapsedSeconds, b.elapsedSeconds - 0.0001);
      return [{ key: i, length, x: (a.x + b.x) * scale / 2 - length / 2,
        y: (a.y + b.y) * scale / 2 - ROUTE_OUTLINE_WIDTH / 2, angle: `${Math.atan2(dy, dx)}rad`,
        reveal: progress.interpolate({ inputRange: [start, b.elapsedSeconds], outputRange: [0, 1], extrapolate: 'clamp' }) }];
    });
  }, [trajectory, scale, progress]);
  return <View testID="market-route-drawn-path" pointerEvents="none" style={StyleSheet.absoluteFill}>{lines.map(line => (
    <View key={line.key} style={{ position: 'absolute', left: line.x, top: line.y,
      width: line.length, height: ROUTE_OUTLINE_WIDTH, transform: [{ rotate: line.angle }] }}>
      <Animated.View style={{ width: line.length, height: ROUTE_OUTLINE_WIDTH, borderRadius: ROUTE_OUTLINE_WIDTH / 2, backgroundColor: ROUTE_OUTLINE,
        transform: [{ translateX: -line.length / 2 }, { scaleX: line.reveal }, { translateX: line.length / 2 }] }}>
        <View style={{ position: 'absolute', top: (ROUTE_OUTLINE_WIDTH - ROUTE_LINE_WIDTH) / 2,
          width: '100%', height: ROUTE_LINE_WIDTH, borderRadius: ROUTE_LINE_WIDTH / 2, backgroundColor: '#FFFFFF' }} />
      </Animated.View>
    </View>
  ))}</View>;
});

const AnimatedRoutePosition = memo(function AnimatedRoutePosition({ trajectory, scale, progress }: {
  trajectory: MarketTrajectory; scale: number; progress: Animated.Value;
}) {
  const transform = useMemo(() => {
    const times: number[] = [], xs: number[] = [], ys: number[] = [];
    const append = (time: number, point: MarketRoutePoint) => {
      if (times.at(-1) === time) { xs[xs.length - 1] = point.x * scale - ROUTE_CURSOR_RADIUS; ys[ys.length - 1] = point.y * scale - ROUTE_CURSOR_RADIUS; }
      else { times.push(time); xs.push(point.x * scale - ROUTE_CURSOR_RADIUS); ys.push(point.y * scale - ROUTE_CURSOR_RADIUS); }
    };
    trajectory.points.forEach((p, i, all) => {
      const previous = all[i - 1];
      if (previous && p.segment !== previous.segment && p.elapsedSeconds - 0.0001 > times[times.length - 1]) {
        append(p.elapsedSeconds - 0.0001, previous);
      }
      append(p.elapsedSeconds, p);
    });
    if (!times.length) { times.push(0); xs.push(-ROUTE_CURSOR_RADIUS); ys.push(-ROUTE_CURSOR_RADIUS); }
    if (times.length === 1) { times.push(times[0] + 0.0001); xs.push(xs[0]); ys.push(ys[0]); }
    return [
      { translateX: progress.interpolate({ inputRange: times, outputRange: xs, extrapolate: 'clamp' }) },
      { translateY: progress.interpolate({ inputRange: times, outputRange: ys, extrapolate: 'clamp' }) },
    ];
  }, [trajectory, scale, progress]);
  return <Animated.View testID="market-route-current-position" pointerEvents="none" style={[s.current, { left: 0, top: 0, transform }]} />;
});

export function MarketMiniMap({
  environment,
  trajectory,
  until,
  player,
  actions,
  selectedActionId,
  onSelectAction,
  playhead,
}: {
  environment: MarketEnvironment;
  trajectory?: MarketTrajectory;
  until?: number;
  player?: { x: number; y: number };
  actions?: MarketRouteAction[];
  selectedActionId?: string;
  onSelectAction?: (action: MarketRouteAction) => void;
  playhead?: Animated.Value;
}) {
  const [width, setWidth] = useState(280);
  const scale = width / environment.world.width,
    height = environment.world.height * scale;
  const all =
    (playhead ? [] : trajectory?.points.filter(
      (p) => until === undefined || p.elapsedSeconds <= until
    )) ?? [];
  const selected =
    until === undefined
      ? undefined
      : trajectory && marketRoutePointAt(trajectory, until);
  if (!playhead && selected && all.at(-1) !== selected) all.push(selected);
  const stride = Math.max(1, Math.ceil(all.length / 2000));
  const points = all.filter((_, i) => i % stride === 0 || i === all.length - 1);
  const markers = (trajectory?.markers ?? []).filter(
    (p) => until === undefined || p.elapsedSeconds <= until
  );
  const labelStride = Math.max(1, Math.ceil(markers.length / 20));
  const visibleActions = (actions ?? trajectory?.actions ?? []).filter(a => until === undefined || a.elapsedSeconds <= until);
  const rect = (r: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => ({
    left: r.x * scale,
    top: r.y * scale,
    width: r.width * scale,
    height: r.height * scale,
  });
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ width: '100%' }}
    >
      <View
        testID="market-route-map"
        accessibilityLabel="마트 지도와 실제 이동 경로"
        style={{
          height,
          backgroundColor: '#A6AB99',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {environment.walkableAreas.map((a) => (
          <View
            key={a.id}
            style={[s.rect, rect(a), { backgroundColor: '#E1DCC9' }]}
          />
        ))}
        {environment.walls.map((r, i) => (
          <View
            key={'w' + i}
            style={[s.rect, rect(r), { backgroundColor: '#696B5C' }]}
          />
        ))}
        {Object.entries(environment.shelves).map(([id, r]) => (
          <View
            key={id}
            style={[
              s.rect,
              rect(r),
              {
                backgroundColor: '#8A9275',
                borderRadius: 3,
                alignItems: 'center',
                justifyContent: 'center',
              },
            ]}
          >
            <Text numberOfLines={2} style={s.shelfName}>
              {shelfName(id, r.width * scale)}
            </Text>
          </View>
        ))}
        {environment.checkouts.map((c) => (
          <View
            key={c.id}
            style={[s.rect, rect(c.rect), { backgroundColor: '#B6A181' }]}
          />
        ))}
        {playhead && trajectory ? <AnimatedRoute trajectory={trajectory} scale={scale} progress={playhead} /> : points.slice(1).map((p, i) => {
          const a = points[i];
          if (a.segment !== p.segment) return null;
          const dx = (p.x - a.x) * scale,
            dy = (p.y - a.y) * scale,
            l = Math.hypot(dx, dy);
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: ((a.x + p.x) * scale) / 2 - l / 2,
                top: ((a.y + p.y) * scale) / 2 - ROUTE_OUTLINE_WIDTH / 2,
                width: l,
                height: ROUTE_OUTLINE_WIDTH,
                borderRadius: ROUTE_OUTLINE_WIDTH / 2,
                backgroundColor: ROUTE_OUTLINE,
                transform: [{ rotate: Math.atan2(dy, dx) + 'rad' }],
              }}
            ><View style={{ position: 'absolute', top: (ROUTE_OUTLINE_WIDTH - ROUTE_LINE_WIDTH) / 2,
              width: '100%', height: ROUTE_LINE_WIDTH, borderRadius: ROUTE_LINE_WIDTH / 2, backgroundColor: '#FFFFFF' }} /></View>
          );
        })}
        {routeLabels(markers, scale).map((p, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: p.x * scale - 3,
              top: p.y * scale - 3,
            }}
          >
            <View style={s.dot} />
            <Text style={s.time}>{p.label}</Text>
          </View>
        ))}
        {(trajectory ? marketRoutePauseMarkers(trajectory) : [])
          .filter((p) => until === undefined || p.elapsedSeconds <= until)
          .filter((_, i) => i % labelStride === 0)
          .map((p, i) => (
            <View
              key={'pause' + i}
              style={[s.pause, { left: p.x * scale - 3, top: p.y * scale - 3 }]}
            />
          ))}
        {playhead && trajectory && !player ? <AnimatedRoutePosition trajectory={trajectory} scale={scale} progress={playhead} /> : (player ?? points.at(-1)) ? (
          <View
            testID="market-route-current-position"
            style={[
              s.current,
              {
                left: (player ?? points.at(-1))!.x * scale - ROUTE_CURSOR_RADIUS,
                top: (player ?? points.at(-1))!.y * scale - ROUTE_CURSOR_RADIUS,
              },
            ]}
          />
        ) : null}
        {mapDoors(environment).map((door) => (
          <View
            key={door.id}
            style={[
              s.door,
              {
                left: Math.max(
                  0,
                  Math.min(width - 40, door.point.x * scale - 20)
                ),
                top: Math.max(
                  0,
                  Math.min(height - 20, door.point.y * scale - 10)
                ),
                backgroundColor: door.color,
              },
            ]}
          >
            <Text style={s.doorText}>{door.label}</Text>
          </View>
        ))}
        {onSelectAction ? actionGroups(visibleActions, scale).map(group => {
          const selected = group.items.find(a => a.id === selectedActionId);
          const action = selected ?? group.anchor;
          const number = (trajectory?.actions ?? []).findIndex(a => a.id === action.id) + 1;
          return (
            <PressScale key={group.anchor.id} accessibilityRole="button"
              hitSlop={7}
              accessibilityLabel={`경로 행동 ${number}: ${action.label}${group.items.length > 1 ? ` 외 ${group.items.length - 1}건` : ''}`}
              accessibilityState={{ selected: !!selected }}
              onPress={() => onSelectAction(action)}
              style={[s.actionPin, { left: Math.max(2, Math.min(width - 38, action.x * scale - 14)),
                top: Math.max(2, Math.min(height - 30, action.y * scale - 14)),
                backgroundColor: actionStyle[action.kind].color }, selected ? s.selectedPin : null]}>
              <Text style={s.pinText}>{number}</Text>
              {group.items.length > 1 ? <View style={s.pinCount}><Text style={s.pinCountText}>+{group.items.length - 1}</Text></View> : null}
            </PressScale>
          );
        }) : null}
      </View>
    </View>
  );
}

export function MarketRouteReview({
  environment,
  trajectory,
}: {
  environment: MarketEnvironment;
  trajectory: MarketTrajectory;
}) {
  const [open, setOpen] = useState(false),
    [message, setMessage] = useState(''),
    [filter, setFilter] = useState<MarketRouteActionKind | 'all'>('all'),
    [selectedId, setSelectedId] = useState<string>();
  const { progress, elapsed, playing, seek, pause, toggle } = useMarketRoutePlayback(trajectory);
  const actions = useMemo(() => trajectory.actions ?? [], [trajectory]);
  const times = useMemo(() => Array.from(new Set([
    ...trajectory.markers.map(p => p.elapsedSeconds), ...actions.map(a => a.elapsedSeconds),
  ])).sort((a, b) => a - b), [trajectory]);
  const filtered = useMemo(() => actions.filter(a => filter === 'all' || a.kind === filter), [actions, filter]);
  const until = elapsed ?? undefined;
  const selected = actions.find(a => a.id === selectedId && (until === undefined || a.elapsedSeconds <= until));
  const currentPoint = until === undefined ? undefined : marketRoutePointAt(trajectory, until);
  const chooseAction = (action: MarketRouteAction) => {
    seek(action.elapsedSeconds); setSelectedId(action.id);
  };
  useEffect(() => { setSelectedId(undefined); }, [trajectory]);
  const svg = useMemo(
    () => trajectorySvg(environment, trajectory),
    [environment, trajectory]
  );
  const share = async () => {
    try {
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(
          new Blob([svg], { type: 'image/svg+xml' })
        );
        const a = document.createElement('a');
        a.href = url;
        a.download = 'market-trajectory.svg';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else await Share.share({ message: svg, title: '장보기 이동 경로' });
      setMessage('이동 경로 그림을 내보냈어요.');
    } catch {
      setMessage('그림을 저장하지 못했어요. 다시 시도해 주세요.');
    }
  };
  return (
    <View style={s.review}>
      <PressScale
        accessibilityRole="button"
        accessibilityLabel="이동 경로·시간 확인"
        accessibilityState={{ expanded: open }}
        onPress={() => { if (open) pause(); setOpen(!open); }}
        style={s.button}
      >
        <Feather name="map" size={18} color="#50624F" />
        <Text style={s.label}>이동 경로·시간 확인</Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#50624F" />
      </PressScale>
      {open ? (
        <>
          <View style={s.summary}>
            {[['기록 시간', clock(trajectory.durationSeconds)], ['행동 기록', `${actions.length}건`], ['이동 거리', `${Math.round(trajectory.distance)}`]].map(([label, value]) => (
              <View key={label} style={s.stat}><Text style={s.statValue}>{value}</Text><Text style={s.caption}>{label}{label === '이동 거리' ? ' · 월드 단위' : ''}</Text></View>
            ))}
          </View>
          <View style={s.mapCard}>
            <View style={s.mapHeading}><Text style={s.label}>어디서 무엇을 했을까요?</Text><Text style={s.caption}>{until === undefined ? '전체 경로' : clock(until)}</Text></View>
            <MarketMiniMap environment={environment} trajectory={trajectory} until={until}
              actions={filtered} selectedActionId={selected?.id} onSelectAction={chooseAction}
              playhead={progress} player={selected && !playing ? selected : undefined} />
            <Text style={s.caption}>흰 선 이동 · 흰 점 {trajectory.intervalSeconds}초 간격 · 빨간 원 머무름</Text>
            <Text style={s.caption}>번호를 누르면 행동을 확인해요. 가까운 행동은 +숫자로 묶었어요.</Text>
            <Text style={s.caption}>재생은 {MARKET_ROUTE_REPLAY_RATE}배속 · 머무른 시간도 그대로 반영해요.</Text>
          </View>
          {selected ? <View testID="market-route-action-detail" style={[s.detail, { borderColor: actionStyle[selected.kind].color }]}>
            <View style={[s.actionIcon, { backgroundColor: actionStyle[selected.kind].tint }]}><Feather name={actionStyle[selected.kind].icon} color={actionStyle[selected.kind].color} size={18} /></View>
            <View style={s.detailCopy}><Text style={s.actionTitle}>{selected.label}</Text><Text style={s.note}>{clock(selected.elapsedSeconds)} · x {Math.round(selected.x)}, y {Math.round(selected.y)}</Text>
              {selected.method === 'employee' ? <Text style={s.caption}>종업원에게 반환 도움 요청</Text> : null}
              {selected.positionSource === 'last-known' ? <Text style={s.caption}>이전 기록 · 마지막 확인 위치 기준</Text> : null}</View>
          </View> : null}
          <View style={s.controls}>
            {[
              [
                '처음',
                () => {
                  seek(0); setSelectedId(undefined);
                },
              ],
              [
                '이전',
                () => {
                  seek(times.filter(t => t < (elapsed ?? trajectory.durationSeconds) - 0.0001).at(-1) ?? 0); setSelectedId(undefined);
                },
              ],
              [
                playing ? '멈춤' : '재생',
                () => {
                  setSelectedId(undefined);
                  toggle();
                },
              ],
              [
                '다음',
                () => {
                  seek(times.find(t => t > (elapsed ?? 0) + 0.0001) ?? trajectory.durationSeconds); setSelectedId(undefined);
                },
              ],
              [
                '전체',
                () => {
                  seek(null); setSelectedId(undefined);
                },
              ],
            ].map(([text, press]) => (
              <PressScale
                key={String(text)}
                accessibilityRole="button"
                accessibilityLabel={'이동 경로 ' + text}
                onPress={press as () => void}
                style={s.small}
              >
                <Text style={s.note}>{text as string}</Text>
              </PressScale>
            ))}
          </View>
          <Text style={s.label}>
            {elapsed === null
              ? '전체 경로'
              : `${Math.round(until ?? 0)}초 · x ${Math.round(currentPoint?.x ?? 0)}, y ${Math.round(currentPoint?.y ?? 0)}`}
          </Text>
          <View style={s.listHeading}><Text style={s.label}>행동 타임라인</Text><Text style={s.caption}>{filtered.length}건</Text></View>
          <View style={s.filters}>
            {(['all', 'shelf-opened', 'shelf-closed', 'item-added', 'item-removed', 'staff-talked'] as const).map(kind => (
              <PressScale key={kind} accessibilityRole="button" accessibilityLabel={`행동 필터 ${kind === 'all' ? '전체' : actionStyle[kind].short}`}
                accessibilityState={{ selected: filter === kind }}
                onPress={() => { setFilter(kind); seek(null); setSelectedId(undefined); }}
                style={[s.filter, filter === kind ? s.activeFilter : null]}>
                {kind !== 'all' ? <Feather name={actionStyle[kind].icon} size={12} color={filter === kind ? '#FFFFFF' : actionStyle[kind].color} /> : null}
                <Text style={[s.filterText, filter === kind ? { color: '#FFFFFF' } : null]}>{kind === 'all' ? '전체' : actionStyle[kind].short}</Text>
              </PressScale>
            ))}
          </View>
          {filtered.length ? <ScrollView nestedScrollEnabled style={s.timeline} contentContainerStyle={s.timelineContent}>
            {filtered.map(action => {
              const meta = actionStyle[action.kind];
              const number = actions.indexOf(action) + 1;
              return <PressScale key={action.id} accessibilityRole="button"
                accessibilityLabel={`행동 ${number}: ${clock(action.elapsedSeconds)} ${action.label}`}
                accessibilityState={{ selected: selected?.id === action.id }} onPress={() => chooseAction(action)}
                style={[s.timelineRow, selected?.id === action.id ? { backgroundColor: meta.tint, borderColor: meta.color } : null]}>
                <View style={[s.timelineNumber, { backgroundColor: meta.color }]}><Text style={s.pinText}>{number}</Text></View>
                <View style={s.detailCopy}><Text style={s.actionTitle}>{action.label}</Text><Text style={s.caption}>{clock(action.elapsedSeconds)}{action.positionSource === 'last-known' ? ' · 마지막 확인 위치' : ''}</Text></View>
                <Feather name={meta.icon} color={meta.color} size={17} />
              </PressScale>;
            })}
          </ScrollView> : <Text style={s.empty}>{actions.length ? '이 종류의 행동은 없어요.' : '기록된 매대·상품·종업원 대화 행동이 없어요. 이동 경로는 위에서 확인할 수 있어요.'}</Text>}
          <PressScale
            accessibilityRole="button"
            onPress={() => {
              void share();
            }}
            style={s.button}
          >
            <Text style={s.label}>경로 그림 저장</Text>
          </PressScale>
          {message ? <Text style={s.note}>{message}</Text> : null}
        </>
      ) : null}
    </View>
  );
}

/** Standalone export for research result viewers. */
export function trajectorySvg(
  environment: MarketEnvironment,
  trajectory: MarketTrajectory
) {
  const box = (
    r: { x: number; y: number; width: number; height: number },
    color: string
  ) =>
    `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="${color}"/>`;
  const paths: string[] = [];
  const mapScale = 280 / environment.world.width;
  for (const p of trajectory.points) {
    if (!paths[p.segment]) paths[p.segment] = 'M' + p.x + ' ' + p.y;
    else paths[p.segment] += ' L' + p.x + ' ' + p.y;
  }
  const labelledMarkers = routeLabels(trajectory.markers, 0.25);
  const pauses = marketRoutePauseMarkers(trajectory)
    .map((p) => `<circle cx="${p.x}" cy="${p.y}" r="${6 / mapScale}" fill="none" stroke="#D24C45" stroke-width="${2 / mapScale}"/>`)
    .join('');
  const last = trajectory.points.at(-1);
  const endpoint = last
    ? `<circle cx="${last.x}" cy="${last.y}" r="${(ROUTE_CURSOR_RADIUS - 1) / mapScale}" fill="#00A97D" stroke="white" stroke-width="${2 / mapScale}"/>`
    : '';
  const mapFont = 12 / mapScale;
  const shelfLabels = Object.entries(environment.shelves)
    .map(([id, r]) => {
      const lines = shelfName(id, r.width * mapScale).split('\n');
      return lines
        .map(
          (line, index) =>
            `<text x="${r.x + r.width / 2}" y="${r.y + r.height / 2 + (index - (lines.length - 1) / 2) * mapFont * 1.35}" text-anchor="middle" dominant-baseline="middle" font-family="${fonts.bold},sans-serif" font-size="${mapFont}" fill="white">${line}</text>`
        )
        .join('');
    })
    .join('');
  const doorLabels = mapDoors(environment)
    .map((door) => {
      const width = 40 / mapScale,
        height = 20 / mapScale;
      const x = Math.max(
        0,
        Math.min(environment.world.width - width, door.point.x - width / 2)
      );
      const y = Math.max(
        0,
        Math.min(environment.world.height - height, door.point.y - height / 2)
      );
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${6 / mapScale}" fill="${door.color}"/><text x="${x + width / 2}" y="${y + height / 2}" text-anchor="middle" dominant-baseline="middle" font-family="${fonts.bold},sans-serif" font-size="${mapFont}" fill="white">${door.label}</text>`;
    })
    .join('');
  const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
  const actions = trajectory.actions ?? [];
  const actionPins = actionGroups(actions, mapScale).map(group => {
    const a = group.anchor, number = actions.indexOf(a) + 1;
    return `<g><title>${escape(group.items.map(item => `${clock(item.elapsedSeconds)} ${item.label}`).join(' / '))}</title><circle cx="${a.x}" cy="${a.y}" r="${13 / mapScale}" fill="${actionStyle[a.kind].color}" stroke="white" stroke-width="${2 / mapScale}"/><text x="${a.x}" y="${a.y}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="${11 / mapScale}" fill="white">${number}</text>${group.items.length > 1 ? `<text x="${a.x + 12 / mapScale}" y="${a.y - 10 / mapScale}" font-family="sans-serif" font-size="${9 / mapScale}" font-weight="bold" fill="#253C30">+${group.items.length - 1}</text>` : ''}</g>`;
  }).join('');
  const rowHeight = 28 / mapScale, footerY = environment.world.height;
  const footerHeight = actions.length ? (actions.length + 2) * rowHeight : 0;
  const actionList = actions.length ? `<rect y="${footerY}" width="100%" height="${footerHeight}" fill="#F7F6EF"/><text x="${12 / mapScale}" y="${footerY + rowHeight}" font-family="sans-serif" font-size="${13 / mapScale}" fill="#344C43">행동 타임라인 · ${actions.length}건</text>${actions.map((a, i) => `<text x="${12 / mapScale}" y="${footerY + (i + 2) * rowHeight}" font-family="sans-serif" font-size="${10 / mapScale}" fill="${actionStyle[a.kind].color}">${i + 1}. ${clock(a.elapsedSeconds)} ${escape(a.label)}${a.positionSource === 'last-known' ? ' (마지막 확인 위치)' : ''}</text>`).join('')}` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${environment.world.width} ${environment.world.height + footerHeight}"><rect width="100%" height="100%" fill="#A6AB99"/>${environment.walkableAreas.map((r) => box(r, '#E1DCC9')).join('')}${environment.walls.map((r) => box(r, '#696B5C')).join('')}${Object.values(
    environment.shelves
  )
    .map((r) => box(r, '#8A9275'))
    .join(
      ''
    )}${paths.map((d) => `<path d="${d}" fill="none" stroke="#4C6859" stroke-opacity="0.4" stroke-width="${ROUTE_OUTLINE_WIDTH / mapScale}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="white" stroke-width="${ROUTE_LINE_WIDTH / mapScale}" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}${labelledMarkers
    .map(
      (p) =>
        `<circle cx="${p.x}" cy="${p.y}" r="${3 / mapScale}" fill="white"/><text x="${p.x + 12}" y="${p.y}" font-family="sans-serif" font-size="${9 / mapScale}" fill="#263C32">${p.label}</text>`
    )
    .join('')}${pauses}${endpoint}${shelfLabels}${doorLabels}${actionPins}${actionList}</svg>`;
  return svg.replaceAll('font-family="sans-serif"', 'font-family="Pretendard,sans-serif"');
}
const s = StyleSheet.create({
  rect: { position: 'absolute' },
  shelfName: {
    fontFamily: fonts.bold,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    color: '#FFFFFF',
  },
  door: {
    position: 'absolute',
    width: 40,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doorText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    lineHeight: 16,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' },
  time: {
    fontFamily: fonts.bold,
    fontSize: 9,
    lineHeight: 12,
    color: '#253C30',
    backgroundColor: '#FFFFFFCC',
  },
  pause: {
    position: 'absolute',
    width: 14,
    height: 14,
    marginLeft: -4,
    marginTop: -4,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#D24C45',
  },
  current: {
    position: 'absolute',
    width: ROUTE_CURSOR_RADIUS * 2,
    height: ROUTE_CURSOR_RADIUS * 2,
    borderRadius: ROUTE_CURSOR_RADIUS,
    backgroundColor: '#00A97D',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  review: { gap: 12, marginVertical: 8 },
  button: {
    padding: 12,
    backgroundColor: '#E2E6D8',
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  label: { fontFamily: fonts.bold, fontSize: 14, color: '#50624F' },
  note: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 18,
    color: '#586652',
  },
  controls: { flexDirection: 'row', gap: 5, flexWrap: 'wrap' },
  small: { padding: 10, backgroundColor: '#E2E6D8', borderRadius: 8 },
  summary: { flexDirection: 'row', backgroundColor: '#F4F4EC', borderRadius: 16, paddingVertical: 15, borderWidth: 1, borderColor: '#E0E5D7' },
  stat: { flex: 1, alignItems: 'center', gap: 5 },
  statValue: { fontFamily: fonts.bold, fontSize: 21, color: '#36594E' },
  caption: { fontFamily: fonts.medium, fontSize: 10, lineHeight: 16, color: '#68786A' },
  mapCard: { padding: 10, gap: 8, backgroundColor: '#F7F6EF', borderRadius: 16, borderWidth: 1, borderColor: '#DDE3D6' },
  mapHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6, paddingVertical: 2 },
  actionPin: { position: 'absolute', minWidth: 28, height: 28, paddingHorizontal: 5, borderRadius: 14, borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  selectedPin: { borderColor: '#253E36', borderWidth: 3, zIndex: 4 },
  pinText: { fontFamily: fonts.bold, color: '#FFFFFF', fontSize: 12 },
  pinCount: { position: 'absolute', left: 17, top: -7, paddingHorizontal: 4, minWidth: 19, height: 16, borderRadius: 8, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  pinCountText: { fontFamily: fonts.bold, fontSize: 10, color: '#354F43' },
  detail: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, borderRadius: 14, borderWidth: 1, backgroundColor: '#FFFFFF' },
  detailCopy: { flex: 1, gap: 3 },
  actionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 18, color: '#354B40' },
  listHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filter: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 20, backgroundColor: '#EBEEE3' },
  activeFilter: { backgroundColor: '#416C5B' },
  filterText: { fontFamily: fonts.bold, fontSize: 10, color: '#526751' },
  timeline: { maxHeight: 260 },
  timelineContent: { gap: 6, paddingBottom: 8 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10, borderRadius: 12, backgroundColor: '#F6F5EE', borderWidth: 1, borderColor: '#E4E7DB' },
  timelineNumber: { width: 25, height: 25, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  empty: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 19, color: '#68786A', padding: 16, backgroundColor: '#F4F4EC', borderRadius: 12 },
});
