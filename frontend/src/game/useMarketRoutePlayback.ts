import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Platform } from 'react-native';
import type { MarketTrajectory } from './marketTrajectory';

export const MARKET_ROUTE_REPLAY_RATE = 2;

/** One continuous clock drives the drawn path; text/markers refresh at most every 80 ms. */
export function useMarketRoutePlayback(trajectory: MarketTrajectory) {
  const duration = trajectory.durationSeconds;
  const progress = useRef(new Animated.Value(duration)).current;
  const position = useRef(duration);
  const full = useRef(true);
  const lastUpdate = useRef(0);
  const mounted = useRef(true);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const seek = useCallback((seconds: number | null) => {
    progress.stopAnimation();
    full.current = seconds === null;
    const value = Math.max(0, Math.min(duration, seconds ?? duration));
    position.current = value;
    progress.setValue(value);
    setElapsed(seconds === null ? null : value);
    setPlaying(false);
  }, [duration, progress]);

  const pause = useCallback(() => {
    setPlaying(false);
    progress.stopAnimation(value => {
      position.current = value;
      if (mounted.current && !full.current) setElapsed(value);
    });
  }, [progress]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; progress.stopAnimation(); };
  }, [progress]);

  useEffect(() => { seek(null); }, [trajectory, seek]);

  useEffect(() => {
    const id = progress.addListener(({ value }) => {
      position.current = value;
      if (!full.current && mounted.current && (Date.now() - lastUpdate.current >= 80 || value >= duration)) {
        lastUpdate.current = Date.now();
        setElapsed(value);
      }
    });
    const subscription = AppState.addEventListener('change', next => { if (next !== 'active') pause(); });
    return () => { progress.removeListener(id); subscription.remove(); };
  }, [duration, pause, progress]);

  useEffect(() => {
    if (!playing || full.current) return;
    let active = true;
    const animation = Animated.timing(progress, {
      toValue: duration,
      duration: Math.max(0, (duration - position.current) * 1000 / MARKET_ROUTE_REPLAY_RATE),
      easing: Easing.linear,
      useNativeDriver: Platform.OS !== 'web',
      isInteraction: false,
    });
    animation.start(({ finished }) => {
      if (!active || !finished || !mounted.current) return;
      position.current = duration;
      setElapsed(duration);
      setPlaying(false);
    });
    return () => { active = false; animation.stop(); };
  }, [duration, playing, progress]);

  const toggle = useCallback(() => {
    if (playing) { pause(); return; }
    if (duration <= 0) return;
    const start = full.current || position.current >= duration ? 0 : position.current;
    full.current = false;
    position.current = start;
    progress.setValue(start);
    setElapsed(start);
    setPlaying(true);
  }, [duration, pause, playing, progress]);

  return { progress, elapsed, playing, seek, pause, toggle };
}
