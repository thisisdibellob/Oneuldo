import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Animated, AppState, StyleSheet, Text, View } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import type { MarketEnvironment } from '../../game/marketEnvironment';
import type { MarketIncident } from '../../game/marketTraining';
import type { MarketCategoryId } from '../../game/scenarios';
import { marketCategories } from '../../game/scenarios';
import { useMarketReducedMotion } from './MarketPanelTransition';
import { MarketPersonFixture } from './MarketInteriorLayer';
import { useGamePreferences } from '../../game/gamePreferences';
import { isSilentGamePreview } from '../../game/dialogueFeedback';
import { fonts } from '../../theme';
import { getMarketPlayerGuidePose, isNearMarketConstruction, MARKET_CONSTRUCTION_NOTICE, type MarketViewFrame } from '../../game/marketWayfinding';
import type { Point } from '../../game/prototypeWorld';
export type { MarketViewFrame } from '../../game/marketWayfinding';

export function MarketWorldGuidance({
  frameRef,
  playerPositionRef,
  environment,
  target,
  requestKey,
  incidents,
  elapsedSeconds,
  visible = true,
  topInset = 160,
}: {
  frameRef: { current: MarketViewFrame | null };
  playerPositionRef?: { current: Point };
  environment: MarketEnvironment;
  target: MarketCategoryId | null;
  requestKey: string;
  incidents: MarketIncident[];
  elapsedSeconds: number;
  visible?: boolean;
  topInset?: number;
}) {
  const [frame, setFrame] = useState<MarketViewFrame | null>(() =>
      frameRef.current
        ? { ...frameRef.current, center: { ...frameRef.current.center } }
        : null
    ),
    [dismissed, setDismissed] = useState(false);
  const defaultPlayer = useRef(environment.spawn);
  const player = playerPositionRef ?? defaultPlayer;
  const [constructionNear, setConstructionNear] = useState(() => isNearMarketConstruction(environment, player.current));
  const constructionNearRef = useRef(constructionNear);
  const opacity = useRef(new Animated.Value(1)).current,
    seenAt = useRef<number | null>(null);
  const reduced = useMarketReducedMotion();
  const { preferences } = useGamePreferences();
  const sound = useAudioPlayer(
    isSilentGamePreview()
      ? null
      : require('../../../assets/audio/market-thud.wav')
  );
  const played = useRef(new Set<string>()),
    fading = useRef(false);
  useEffect(() => {
    const sample = () => {
      const near = isNearMarketConstruction(environment, player.current, constructionNearRef.current);
      if (near !== constructionNearRef.current) { constructionNearRef.current = near; setConstructionNear(near); }
      const f = frameRef.current;
      if (f) setFrame(previous => previous && previous.width === f.width && previous.height === f.height && previous.zoom === f.zoom && previous.center.x === f.center.x && previous.center.y === f.center.y ? previous : { ...f, center: { ...f.center } });
    };
    sample();
    if (!visible || ((!target || dismissed) && !incidents.length && !environment.constructionZones?.length)) return;
    const timer = setInterval(sample, 80);
    return () => clearInterval(timer);
  }, [frameRef, visible, target, incidents.length, dismissed, environment, player]);
  useEffect(() => {
    seenAt.current = null;
    fading.current = false;
    setDismissed(false);
    opacity.setValue(1);
    return () => opacity.stopAnimation();
  }, [requestKey, opacity]);
  const shelf = target ? environment.shelves[target] : null;
  const project = (p: { x: number; y: number }) => ({
    x: frame!.width / 2 + (p.x - frame!.center.x) * frame!.zoom,
    y: frame!.height / 2 + (p.y - frame!.center.y) * frame!.zoom,
  });
  useEffect(() => {
    if (!visible || !frame || !shelf || dismissed || fading.current) return;
    const x = frame.width / 2 + (shelf.x - frame.center.x) * frame.zoom,
      y = frame.height / 2 + (shelf.y - frame.center.y) * frame.zoom;
    const shelfVisible =
      x < frame.width &&
      x + shelf.width * frame.zoom > 0 &&
      y < frame.height - 100 &&
      y + shelf.height * frame.zoom > topInset;
    if (!shelfVisible) return;
    if (seenAt.current === null) seenAt.current = Date.now();
    const timer = setTimeout(
      () => {
        if (fading.current) return;
        fading.current = true;
        Animated.timing(opacity, {
          toValue: 0,
          duration: reduced ? 0 : 650,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) setDismissed(true);
        });
      },
      Math.max(0, 3000 - (Date.now() - seenAt.current))
    );
    return () => clearTimeout(timer);
  }, [frame, shelf, dismissed, opacity, reduced, topInset, visible]);
  // Once first seen, the 3-second countdown continues even if the player looks away.
  useEffect(() => {
    if (!target || dismissed) return;
    const timer = setInterval(() => {
      if (
        !fading.current &&
        seenAt.current !== null &&
        Date.now() - seenAt.current >= 3000
      ) {
        fading.current = true;
        Animated.timing(opacity, {
          toValue: 0,
          duration: reduced ? 0 : 650,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) setDismissed(true);
        });
      }
    }, 150);
    return () => clearInterval(timer);
  }, [target, dismissed, opacity, reduced]);
  useEffect(() => {
    for (const incident of incidents) {
      if (incident.kind !== 'sound-light' || played.current.has(incident.id))
        continue;
      played.current.add(incident.id);
      if (!isSilentGamePreview() && AppState.currentState === 'active') {
        sound.volume = preferences.effectsVolume;
        void sound
          .seekTo(0)
          .then(() => sound.play())
          .catch(() => {});
      }
    }
  }, [incidents, sound, preferences.effectsVolume]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') sound.pause();
    });
    return () => sub.remove();
  }, [sound]);
  if (!frame || !visible) return null;
  const point = shelf
    ? project({ x: shelf.x + shelf.width / 2, y: shelf.y + shelf.height / 2 })
    : null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {point && !dismissed ? (
        <PlayerDirectionArrow frameRef={frameRef} playerRef={player}
          target={{ x: shelf!.x + shelf!.width / 2, y: shelf!.y + shelf!.height / 2 }}
          label={`${marketCategories.find(c => c.id === target)?.label} 방향`} opacity={opacity} />
      ) : null}
      {constructionNear ? <View testID="market-construction-notice" accessibilityRole="alert" accessibilityLiveRegion="polite"
        style={[s.constructionNotice, { top: Math.max(topInset + 16, frame.height * .22) }]}><Ionicons name="construct" size={20} color="#F0CD8E" />
        <Text style={s.constructionNoticeText}>{MARKET_CONSTRUCTION_NOTICE}</Text></View> : null}
      {incidents.map((incident) => {
        const p = project(incident.point);
        if (
          p.x < -100 ||
          p.x > frame.width + 100 ||
          p.y < -100 ||
          p.y > frame.height + 100
        )
          return null;
        return incident.kind === 'crowd' ? (
          <View
            key={incident.id}
            testID="market-crowd-incident"
            style={{
              position: 'absolute',
              left: p.x - 65,
              top: p.y - 85,
              width: 130,
              height: 100,
            }}
          >
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  left: i * 30,
                  top: (i % 2) * 14,
                  width: 60,
                  height: 90,
                }}
              >
                <MarketPersonFixture
                  person={{
                    id: 'incident-customer-' + i,
                    kind: 'customer',
                    label: '손님',
                    slotId: 'incident',
                    collider: {
                      x: incident.point.x,
                      y: incident.point.y,
                      width: 0,
                      height: 0,
                    },
                    point: incident.point,
                    appearance:
                      environment.customers[
                        i % Math.max(1, environment.customers.length)
                      ]?.appearance ?? i,
                  }}
                />
              </View>
            ))}
          </View>
        ) : (
          <View
            key={incident.id}
            testID="market-sound-light-incident"
            style={[
              s.glow,
              {
                left: p.x - 42,
                top: p.y - 42,
                opacity: Math.max(
                  0.15,
                  1 -
                    (elapsedSeconds - incident.elapsedSeconds) /
                      incident.durationSeconds
                ),
              },
            ]}
          >
            <View style={s.light} />
            <Text style={s.soundLabel}>쿵</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Update one transform from the existing world refs, without re-rendering the
 * scene/player on every frame or allocating a new position in React state. */
function PlayerDirectionArrow({ frameRef, playerRef, target, label, opacity }: {
  frameRef: { current: MarketViewFrame | null }; playerRef: { current: Point }; target: Point; label: string; opacity: Animated.Value;
}) {
  const initial = frameRef.current ? getMarketPlayerGuidePose(frameRef.current, playerRef.current, target) : { x: 0, y: 0, rotation: 0 };
  const xy = useRef(new Animated.ValueXY({ x: initial.x - 17, y: initial.y - 17 })).current;
  const rotation = useRef(new Animated.Value(initial.rotation)).current;
  useEffect(() => {
    let raf = 0, previous = initial;
    xy.setValue({ x: initial.x - 17, y: initial.y - 17 }); rotation.setValue(initial.rotation);
    const update = () => {
      const frame = frameRef.current;
      if (frame && AppState.currentState === 'active') {
        const next = getMarketPlayerGuidePose(frame, playerRef.current, target);
        if (next.x !== previous.x || next.y !== previous.y) xy.setValue({ x: next.x - 17, y: next.y - 17 });
        if (next.rotation !== previous.rotation) rotation.setValue(next.rotation);
        previous = next;
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [frameRef, playerRef, target.x, target.y, xy, rotation]);
  return <Animated.View testID="market-shelf-direction-hint" accessibilityLabel={label}
    style={{ position: 'absolute', top: 0, left: 0, width: 34, height: 34, opacity, transform: [...xy.getTranslateTransform(), { rotate: rotation.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] }) }] }}>
    <Ionicons name="navigate" size={34} color="#3977DD" />
  </Animated.View>;
}
const s = StyleSheet.create({
  constructionNotice: { position: 'absolute', left: 24, right: 24, maxWidth: 440,
    alignSelf: 'center', marginHorizontal: 'auto', flexDirection: 'row', gap: 10, alignItems: 'center',
    borderRadius: 14, backgroundColor: 'rgba(42,48,40,0.9)', paddingHorizontal: 16, paddingVertical: 13 },
  constructionNoticeText: { flex: 1, color: '#FFFFFF', fontFamily: fonts.medium, fontSize: 14, lineHeight: 21 },
  glow: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#FFECA766',
    alignItems: 'center',
    justifyContent: 'center',
  },
  light: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFF2BA99',
  },
  soundLabel: {
    position: 'absolute',
    fontFamily: fonts.cafe24Ssurround,
    fontSize: 17,
    color: '#FFFFFF',
  },
});
