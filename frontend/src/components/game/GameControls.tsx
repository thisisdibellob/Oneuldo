import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, StyleSheet, Text, View } from 'react-native';
import type { ComponentProps } from 'react';
import { useGamePreferences } from '../../game/gamePreferences';
import { getJoystickMovement, JOYSTICK_RADIUS, type GameMovementInput } from '../../game/movementControls';
import { fonts } from '../../theme';
import { PressScale } from '../PressScale';
import { GAME_ACTION_BUTTON_LAYOUT } from '../../game/gameControlLayout';
export { GAME_ACTION_BUTTON_LAYOUT } from '../../game/gameControlLayout';

type Action = {
  label: string;
  accessibilityLabel?: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  available: boolean;
  onPress: () => void;
};
type Props = {
  bottomOffset?: number;
  controlMode: 'joystick' | 'touch';
  locked: boolean;
  /** Keeps the shared action button usable while a vehicle is moving. */
  movementDisabled?: boolean;
  action: Action;
  onMove: (input: GameMovementInput) => void;
  onMoveStart?: () => void;
  onMoveEnd: () => void;
  /** Opt-in tap-through for world actions hidden under the floating stick zone. */
  onWorldTap?: (point: { x: number; y: number }) => void;
  onAccessibilityMove?: (name: string) => void;
  runEnabled: boolean;
  onRunEnabledChange: (enabled: boolean) => void;
  reduceMotion?: boolean;
};
const PAD_SIZE = 110;
const ZONE_HEIGHT = 270;
const REST_CENTER = { x: 76, y: 198 };
const ACTION_LAYOUT = GAME_ACTION_BUTTON_LAYOUT;
const SHORTCUT_SIZE = 58;

/** A smaller companion circle, aligned to the left of the shared world action. */
export function GameControlShortcut({ label, accessibilityLabel, onPress, bottomOffset = 0 }: {
  label: string; accessibilityLabel: string; onPress: () => void; bottomOffset?: number;
}) {
  return <PressScale testID="game-control-shortcut" accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    onPress={event => { event?.stopPropagation?.(); onPress(); }} style={[s.shortcut, { bottom: ACTION_LAYOUT.bottom + (ACTION_LAYOUT.size - SHORTCUT_SIZE) / 2 + bottomOffset }]}>
    <Text style={s.actionText}>{label}</Text>
  </PressScale>;
}

export function GameActionButton({ action, reduceMotion = false }: { action: Action; reduceMotion?: boolean }) {
  return <PressScale accessibilityRole="button" accessibilityLabel={action.accessibilityLabel ?? action.label}
    accessibilityState={{ disabled: !action.available }} disabled={!action.available}
    onPress={event => { event?.stopPropagation?.(); action.onPress(); }} scaleTo={reduceMotion ? 1 : 0.94}
    style={[s.action, !action.available && s.disabled]}>
    <Ionicons name={action.icon} size={26} color="#FFFDF6" /><Text numberOfLines={1} style={s.actionText}>{action.label}</Text>
  </PressScale>;
}

/** All world controls share the same placement, appearance and floating-stick behaviour. */
export function GameControls(props: Props) {
  const { preferences } = useGamePreferences();
  const live = useRef({ ...props, runMode: preferences.runMode });
  live.current = { ...props, runMode: preferences.runMode };
  const size = useRef({ width: 220, height: ZONE_HEIGHT });
  const knob = useRef(new Animated.ValueXY()).current;
  const active = useRef(false);
  const running = useRef(false);
  const delta = useRef({ x: 0, y: 0 });
  const worldTap = useRef<{ x: number; y: number; started: number; distance: number } | null>(null);
  const [engaged, setEngaged] = useState(false);
  const [center, setCenter] = useState(REST_CENTER);
  const [autoRunning, setAutoRunning] = useState(false);
  const finish = useRef(() => {});
  finish.current = () => {
    const wasActive = active.current;
    worldTap.current = null;
    active.current = false; running.current = false; delta.current = { x: 0, y: 0 };
    setEngaged(false); setAutoRunning(false); setCenter(REST_CENTER);
    knob.stopAnimation();
    if (!wasActive || live.current.locked || live.current.controlMode !== 'joystick' || live.current.reduceMotion) knob.setValue({ x: 0, y: 0 });
    else Animated.spring(knob, { toValue: { x: 0, y: 0 }, damping: 19, stiffness: 250, mass: 0.7, useNativeDriver: true }).start();
    if (wasActive) live.current.onMoveEnd();
  };
  const emit = useRef(() => {});
  emit.current = () => {
    const p = live.current;
    const input = getJoystickMovement(delta.current.x, delta.current.y, p.runMode, p.runEnabled, running.current);
    running.current = input.running; setAutoRunning(input.running); p.onMove(input);
  };
  useEffect(() => {
    if (props.locked || props.movementDisabled || props.controlMode !== 'joystick') finish.current();
  }, [props.locked, props.movementDisabled, props.controlMode]);
  useEffect(() => { if (active.current) emit.current(); }, [props.runEnabled, preferences.runMode]);
  useEffect(() => () => { if (active.current) live.current.onMoveEnd(); }, []);

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !live.current.locked && !live.current.movementDisabled && live.current.controlMode === 'joystick',
    onMoveShouldSetPanResponder: () => !live.current.locked && !live.current.movementDisabled && live.current.controlMode === 'joystick',
    onPanResponderGrant: event => {
      if (live.current.locked || live.current.movementDisabled) return;
      event.stopPropagation?.();
      const { locationX, locationY, pageX, pageY } = event.nativeEvent;
      worldTap.current = live.current.onWorldTap && Number.isFinite(pageX) && Number.isFinite(pageY)
        ? { x: pageX, y: pageY, started: Date.now(), distance: 0 } : null;
      const half = PAD_SIZE / 2;
      setCenter({ x: Math.max(half, Math.min(locationX, size.current.width - half)), y: Math.max(half, Math.min(locationY, size.current.height - half)) });
      active.current = true; running.current = false; delta.current = { x: 0, y: 0 };
      setEngaged(true); knob.stopAnimation(); knob.setValue({ x: 0, y: 0 });
      live.current.onMoveStart?.(); emit.current();
    },
    onPanResponderMove: (_event, gesture) => {
      if (!active.current || live.current.locked || live.current.movementDisabled) return;
      if (worldTap.current) worldTap.current.distance = Math.max(worldTap.current.distance, gesture.numberActiveTouches > 1 ? Infinity : Math.hypot(gesture.dx, gesture.dy));
      delta.current = { x: gesture.dx, y: gesture.dy };
      const ratio = JOYSTICK_RADIUS / Math.max(JOYSTICK_RADIUS, Math.hypot(gesture.dx, gesture.dy));
      knob.setValue({ x: gesture.dx * ratio, y: gesture.dy * ratio }); emit.current();
    },
    onPanResponderRelease: (_event, gesture) => {
      const tap = worldTap.current;
      const endDistance = Math.hypot(gesture.dx ?? 0, gesture.dy ?? 0);
      const shouldTap = active.current && tap && Math.max(tap.distance, endDistance) <= 7 && Date.now() - tap.started <= 350 && !live.current.locked && !live.current.movementDisabled;
      // Stop locomotion first so onMoveEnd cannot cancel the newly chosen route.
      finish.current();
      if (shouldTap && tap) live.current.onWorldTap?.({ x: tap.x, y: tap.y });
    },
    onPanResponderTerminate: () => finish.current(),
    onPanResponderTerminationRequest: () => true,
  }), [knob]);

  if (props.locked) return null;
  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill} testID="game-controls">
    {props.controlMode === 'joystick' && <View pointerEvents={props.movementDisabled && props.onWorldTap ? 'none' : 'auto'} accessibilityRole="adjustable" accessibilityLabel="이동 조이스틱"
      accessibilityHint={preferences.runMode === 'distance' ? '패드를 조금 밀면 걷고 멀리 밀면 달립니다' : '패드를 밀어 이동합니다'}
      accessibilityActions={[
        { name: 'moveUp', label: '위로 이동' }, { name: 'moveDown', label: '아래로 이동' },
        { name: 'moveLeft', label: '왼쪽으로 이동' }, { name: 'moveRight', label: '오른쪽으로 이동' },
      ]}
      accessibilityState={{ disabled: props.movementDisabled }}
      onAccessibilityAction={event => { if (!props.movementDisabled) props.onAccessibilityMove?.(event.nativeEvent.actionName); }}
      onLayout={event => { size.current = event.nativeEvent.layout; }} style={[s.zone, { bottom: 104 + (props.bottomOffset ?? 0) }]} {...responder.panHandlers}>
      <View pointerEvents="none" testID="game-joystick-pad" style={[s.pad, { left: center.x - PAD_SIZE / 2, top: center.y - PAD_SIZE / 2, opacity: props.movementDisabled ? 0.25 : engaged ? 1 : 0.8 }]}>
        <View style={s.crossH} /><View style={s.crossV} />
        <Animated.View testID="game-joystick-knob" style={[s.knob, { transform: knob.getTranslateTransform() }]} />
        {preferences.runMode === 'distance' && autoRunning && <View style={s.runningBadge}><Ionicons name="footsteps" size={17} color="#FCF9EF" /></View>}
      </View>
    </View>}
    <View pointerEvents="box-none" style={[s.actions, { bottom: ACTION_LAYOUT.bottom + (props.bottomOffset ?? 0) }]}>
      {preferences.runMode === 'toggle' && !props.movementDisabled && <PressScale accessibilityRole="button" accessibilityLabel={props.runEnabled ? '달리기 끄기' : '달리기 켜기'}
        accessibilityHint="한 번 누르면 달리기를 켜고 다시 누르면 끕니다" accessibilityState={{ selected: props.runEnabled }}
        onPress={event => { event?.stopPropagation?.(); props.onRunEnabledChange(!props.runEnabled); }} scaleTo={props.reduceMotion ? 1 : 0.94}
        style={[s.run, props.runEnabled && s.runActive]}>
        <Ionicons name="footsteps" size={25} color={props.runEnabled ? '#FFFCF2' : '#59715B'} />
      </PressScale>}
      <GameActionButton action={props.action} reduceMotion={props.reduceMotion} />
    </View>
  </View>;
}

const s = StyleSheet.create({
  zone: { position: 'absolute', left: 0, bottom: 104, width: '58%', maxWidth: 320, height: ZONE_HEIGHT, zIndex: 20,
    ...Platform.select({ web: { touchAction: 'none', userSelect: 'none' } as never, default: {} }) },
  pad: { position: 'absolute', width: PAD_SIZE, height: PAD_SIZE, borderRadius: 60, backgroundColor: 'rgba(255,253,240,0.55)', alignItems: 'center', justifyContent: 'center' },
  knob: { width: 49, height: 49, borderRadius: 26, backgroundColor: 'rgba(108,119,97,0.60)' },
  crossH: { position: 'absolute', width: 81, height: 1, backgroundColor: '#D8D3BD' },
  crossV: { position: 'absolute', width: 1, height: 81, backgroundColor: '#D8D3BD' },
  runningBadge: { position: 'absolute', right: -3, top: -3, borderRadius: 16, backgroundColor: '#6D8A69', padding: 6 },
  actions: { position: 'absolute', right: ACTION_LAYOUT.right, bottom: ACTION_LAYOUT.bottom, zIndex: 22, alignItems: 'flex-end', gap: 10 },
  action: { width: ACTION_LAYOUT.size, height: ACTION_LAYOUT.size, borderRadius: 45, backgroundColor: '#537960', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 3, borderColor: '#FCF6E7' },
  shortcut: { position: 'absolute', right: ACTION_LAYOUT.right + ACTION_LAYOUT.size + 12,
    bottom: ACTION_LAYOUT.bottom + (ACTION_LAYOUT.size - SHORTCUT_SIZE) / 2,
    width: SHORTCUT_SIZE, height: SHORTCUT_SIZE, borderRadius: SHORTCUT_SIZE / 2,
    backgroundColor: '#537960', borderWidth: 3, borderColor: '#FCF6E7', alignItems: 'center', justifyContent: 'center', zIndex: 40 },
  actionText: { fontFamily: fonts.laundryBold, fontSize: 15, color: '#FFFCF2' },
  run: { width: 52, height: 52, borderRadius: 28, backgroundColor: '#F7F3E5', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  runActive: { backgroundColor: '#6B8765' }, disabled: { opacity: 0.38 },
});
