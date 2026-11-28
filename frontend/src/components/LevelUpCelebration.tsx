import { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { fonts } from '../theme';

/**
 * 레벨이 올랐을 때 화면 위쪽에 잠깐 뜨는 축하 효과.
 * 화면만 그린다. 터치를 막지 않고(pointerEvents none) 게임·퀘스트·기록 값에는 손대지 않는다.
 */
const COLORS = ['#7BD3B0', '#FFD66B', '#FF9F8A', '#8EC9F5', '#B6E07A'];
const PARTICLES_PER_BURST = 14;
const HOLD_MS = 1500;

type Particle = { angle: number; distance: number; color: string; streak: boolean; size: number };

function makeBurst(seed: number): Particle[] {
  return Array.from({ length: PARTICLES_PER_BURST }, (_, index) => {
    const angle = (index / PARTICLES_PER_BURST) * Math.PI * 2 + seed * 0.37;
    return {
      angle,
      distance: 54 + ((index * 17 + seed * 11) % 5) * 9,
      color: COLORS[(index + seed) % COLORS.length],
      streak: index % 2 === 0,
      size: index % 3 === 0 ? 9 : 7,
    };
  });
}

function Burst({ x, y, delay, scale, seed, onReady }: { x: number; y: number; delay: number; scale: number; seed: number; onReady: (anim: Animated.CompositeAnimation) => void }) {
  const progress = useRef(new Animated.Value(0)).current;
  const particles = useMemo(() => makeBurst(seed), [seed]);
  useEffect(() => {
    onReady(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(progress, { toValue: 1, duration: 950, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]));
  }, [delay, onReady, progress]);
  const opacity = progress.interpolate({ inputRange: [0, 0.05, 0.6, 1], outputRange: [0, 1, 1, 0] });
  return <View pointerEvents="none" style={[styles.burst, { left: x, top: y }]}>
    {particles.map((p, index) => {
      const dx = Math.cos(p.angle) * p.distance * scale;
      const dy = Math.sin(p.angle) * p.distance * scale;
      const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, dx] });
      // 끝으로 갈수록 살짝 아래로 떨어진다.
      const translateY = progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, dy * 0.95, dy + 10] });
      const particleScale = progress.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.3, 1, 0.6] });
      return <Animated.View key={index} style={[
        p.streak ? { width: p.size + 5, height: 3.5, borderRadius: 2 } : { width: p.size, height: p.size, borderRadius: p.size / 2 },
        styles.particle,
        {
          backgroundColor: p.color,
          opacity,
          transform: [{ translateX }, { translateY }, { rotate: `${p.angle}rad` }, { scale: particleScale }],
        },
      ]} />;
    })}
  </View>;
}

export function LevelUpCelebration({ level, reduceMotion = false, onDone }: { level: number; reduceMotion?: boolean; onDone: () => void }) {
  const { width } = useWindowDimensions();
  const banner = useRef(new Animated.Value(0)).current;
  const bursts = useRef<Animated.CompositeAnimation[]>([]);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility?.(`레벨 업! 레벨 ${level}이 되었어요.`);
    const show = reduceMotion
      ? Animated.timing(banner, { toValue: 1, duration: 200, useNativeDriver: true })
      : Animated.spring(banner, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true });
    const animation = Animated.sequence([
      Animated.parallel([show, ...(reduceMotion ? [] : bursts.current)]),
      Animated.delay(HOLD_MS),
      Animated.timing(banner, { toValue: 2, duration: 420, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]);
    animation.start(({ finished }) => { if (finished) doneRef.current(); });
    return () => animation.stop();
  }, [banner, level, reduceMotion]);

  const collect = (anim: Animated.CompositeAnimation) => { bursts.current.push(anim); };
  const opacity = banner.interpolate({ inputRange: [0, 0.6, 1, 2], outputRange: [0, 1, 1, 0], extrapolate: 'clamp' });
  const translateY = banner.interpolate({ inputRange: [0, 1, 2], outputRange: [-18, 0, -14] });
  const scale = banner.interpolate({ inputRange: [0, 1, 2], outputRange: [0.85, 1, 0.96] });
  // 폭죽은 문구 양옆에 붙여 둔다(PC처럼 넓은 화면에서도 가장자리로 멀어지지 않게).
  const spread = Math.min(width * 0.32, 150);
  const left = width / 2 - spread;
  const right = width / 2 + spread;

  return <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="level-up-celebration">
    {reduceMotion ? null : <>
      <Burst x={left} y={104} delay={0} scale={1} seed={1} onReady={collect} />
      <Burst x={right} y={104} delay={140} scale={1} seed={2} onReady={collect} />
      <Burst x={left + 30} y={150} delay={420} scale={0.7} seed={3} onReady={collect} />
      <Burst x={right - 30} y={150} delay={560} scale={0.7} seed={4} onReady={collect} />
    </>}
    <Animated.View accessible accessibilityLabel={`레벨 업! 레벨 ${level}`} style={[styles.banner, { opacity, transform: [{ translateY }, { scale }] }]}>
      <Text style={styles.title}>레벨 업!</Text>
      <View style={styles.levelPill}><Text style={styles.levelText}>Lv.{level}</Text></View>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  burst: { height: 0, position: 'absolute', width: 0 },
  particle: { left: -4, position: 'absolute', top: -2 },
  banner: {
    alignItems: 'center', alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 22,
    paddingBottom: 12, paddingHorizontal: 26, paddingTop: 10, position: 'absolute', top: 84,
    boxShadow: '0 6px 18px rgba(47,107,79,0.14)',
  },
  title: {
    color: '#2F6B4F',
    fontFamily: fonts.cafe24Ssurround,
    fontSize: 34,
    letterSpacing: 1,
    textShadowColor: '#FFFFFF',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 0,
  },
  levelPill: { backgroundColor: '#2F6B4F', borderRadius: 999, marginTop: 6, paddingHorizontal: 14, paddingVertical: 4 },
  levelText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 15 },
});
