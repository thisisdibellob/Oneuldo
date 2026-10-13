import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { busArt } from '../../game/busArt';
import type { BusWorldDirection } from '../../game/busWorld';
import { fonts } from '../../theme';
import { useMarketReducedMotion } from './MarketPanelTransition';

export const BUS_ARRIVAL_DURATION = 1100;
export const BUS_DEPARTURE_DURATION = 760;
export type ArrivalBus = { number: string | number; destination: string; id?: string };
type Props = { bus: ArrivalBus | null; direction?: BusWorldDirection; reduceMotion?: boolean; onReadyChange?: (ready: boolean) => void; compact?: boolean };
// Intrinsic PNG dimensions: the passenger-side canvas includes more vertical
// transparent margin than the driver's side. Never assume the same 3:1 frame.
export const BUS_EXTERIOR_DIMENSIONS = {
  outbound: { width: 1983, height: 793 }, inbound: { width: 2172, height: 724 },
} as const;
export function busExteriorFrame(width: number, direction: BusWorldDirection, maxHeight = Infinity) {
  const image = BUS_EXTERIOR_DIMENSIONS[direction];
  const height = Math.min(width * image.height / image.width, maxHeight);
  return { width, height, imageWidth: height * image.width / image.height };
}
export function busArrivalPreviewLayout(width: number, compact: boolean) {
  const tallestRatio = Math.max(...Object.values(BUS_EXTERIOR_DIMENSIONS).map(size => size.height / size.width));
  // Reserve 18px above the full PNG and 24px below it, including suspension sway.
  const height = Math.min(compact ? 220 : 270, Math.max(compact ? 142 : 176, (width - 24) * tallestRatio + 42));
  const vehicleWidth = Math.max(0, Math.min(width - 24, (height - 42) / tallestRatio));
  return { height, vehicleWidth, left: (width - vehicleWidth) / 2, bottom: 24 };
}

/** Keeps the old vehicle mounted until it has left, then brings the new one in. */
export function BusArrivalVehicle({ bus, direction = 'outbound', reduceMotion = false, onReadyChange, width = 640, maxHeight, children }: Props & { width?: number; maxHeight?: number; children?: React.ReactNode }) {
  const [shown, setShown] = useState(bus);
  const [shownDirection, setShownDirection] = useState(direction);
  const directionRef = useRef(shownDirection); directionRef.current = shownDirection;
  const shownRef = useRef(shown); shownRef.current = shown;
  const latest = useRef({ bus, onReadyChange }); latest.current = { bus, onReadyChange };
  const offset = useRef(new Animated.Value(reduceMotion ? 0 : -1)).current;
  const suspension = useRef(new Animated.Value(0)).current;
  const identity = bus ? `${bus.id ?? ''}:${bus.number}:${bus.destination}` : '';
  useEffect(() => {
    let cancelled = false;
    offset.stopAnimation(); suspension.stopAnimation(); latest.current.onReadyChange?.(false);
    const settle = () => Animated.sequence([
      Animated.timing(suspension, { toValue: 1, duration: 100, useNativeDriver: true }),
      Animated.spring(suspension, { toValue: 0, speed: 18, bounciness: 5, useNativeDriver: true }),
    ]).start();
    const arrive = () => {
      if (cancelled) return;
      const next = latest.current.bus;
      setShown(next); shownRef.current = next; setShownDirection(direction); directionRef.current = direction;
      if (!next) { offset.setValue(0); return; }
      offset.setValue(reduceMotion ? 0 : -1);
      if (reduceMotion) { latest.current.onReadyChange?.(true); return; }
      Animated.timing(offset, { toValue: 0, duration: BUS_ARRIVAL_DURATION, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
        if (!finished || cancelled) return;
        settle(); latest.current.onReadyChange?.(true);
      });
    };
    const previous = shownRef.current;
    const previousIdentity = previous ? `${previous.id ?? ''}:${previous.number}:${previous.destination}` : '';
    if (previous && (previousIdentity !== identity || directionRef.current !== direction) && !reduceMotion) {
      settle();
      Animated.timing(offset, { toValue: 1, duration: BUS_DEPARTURE_DURATION, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => { if (finished) arrive(); });
    } else arrive();
    return () => { cancelled = true; offset.stopAnimation(); suspension.stopAnimation(); };
  }, [identity, direction, reduceMotion, offset, suspension]);
  if (!shown) return null;
  const sign = shownDirection === 'outbound' ? 1 : -1;
  const frame = busExteriorFrame(width, shownDirection, maxHeight);
  return <Animated.View testID="bus-arrival-vehicle" style={{ width, height: frame.height, transform: [
    { translateX: offset.interpolate({ inputRange: [-1, 0, 1], outputRange: [-width * 1.8 * sign, 0, width * 1.8 * sign] }) },
    { translateY: suspension.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) },
    { rotate: suspension.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${-0.65 * sign}deg`] }) },
  ] }}>
    <Image source={shownDirection === 'inbound' ? busArt.busLeft : busArt.busRight} fadeDuration={0} resizeMode="contain" style={{ alignSelf: 'center', width: frame.imageWidth, height: frame.height }} />
    <View pointerEvents="none" style={[s.plate, { left: shownDirection === 'inbound' ? '13%' : '68%', top: '19%', minWidth: width * 0.1, paddingHorizontal: width * 0.014 }]}><Text style={[s.plateNumber, { fontSize: Math.max(14, width * 0.04) }]}>{shown.number}</Text></View>
    {children}
  </Animated.View>;
}

export function BusArrivalPreview({ compact = false, ...props }: Props) {
  const prefersReducedMotion = useMarketReducedMotion();
  const [width, setWidth] = useState(320);
  const layout = busArrivalPreviewLayout(width, compact);
  return <View testID="bus-arrival-preview" style={[s.preview, { height: layout.height }]} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <View style={s.pavement} /><View style={s.road} />
    <View pointerEvents="none" style={s.lane}>{[0, 1, 2, 3, 4].map(i => <View key={i} style={s.dash} />)}</View>
    <View testID="bus-arrival-preview-frame" style={{ position: 'absolute', bottom: layout.bottom, left: layout.left }}><BusArrivalVehicle {...props} width={layout.vehicleWidth} reduceMotion={props.reduceMotion ?? prefersReducedMotion} /></View>
  </View>;
}
const s = StyleSheet.create({
  preview: { width: '100%', overflow: 'hidden', borderRadius: 20, backgroundColor: '#DFE5D7', marginVertical: 12 },
  pavement: { position: 'absolute', left: 0, right: 0, bottom: 56, height: 20, backgroundColor: '#EDE8DA', borderBottomWidth: 4, borderColor: '#CDC8B9' },
  road: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 56, backgroundColor: '#B9B6AE' },
  lane: { position: 'absolute', left: 0, right: 0, bottom: 13, flexDirection: 'row', justifyContent: 'space-around' },
  dash: { width: 28, height: 3, borderRadius: 2, backgroundColor: '#F4F0DF' },
  plate: { position: 'absolute', backgroundColor: '#3B4943', borderRadius: 3, alignItems: 'center' },
  plateNumber: { color: '#F8EBAF', fontFamily: fonts.bold },
});
