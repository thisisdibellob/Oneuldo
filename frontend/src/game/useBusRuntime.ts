import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Platform } from 'react-native';
import * as Speech from 'expo-speech';
import { useGamePreferences } from './gamePreferences';

/** A paused clock preserves the current leg and gives time to reorient after reading. */
export function useBusClock(key: string, duration: number, paused: boolean, onElapsed: () => void, resumeGrace = 5000, progress?: Animated.Value) {
  const callback = useRef(onElapsed); callback.current = onElapsed;
  const clock = useRef({ key, remaining: duration, ran: false, fired: false });
  useEffect(() => {
    if (clock.current.key !== key) {
      clock.current = { key, remaining: duration, ran: false, fired: false };
      progress?.setValue(0);
    }
    if (paused || clock.current.fired || duration <= 0) return;
    const current = clock.current;
    if (current.ran) current.remaining = Math.max(current.remaining, resumeGrace);
    current.ran = true;
    const start = Date.now();
    // The moving bus marker uses this very same clock; opening menus freezes both.
    // Native animation avoids re-rendering the world at every progress tick.
    progress?.setValue(Math.max(0, 1 - current.remaining / duration));
    const animation = progress ? Animated.timing(progress, { toValue: 1, duration: current.remaining, easing: Easing.linear, useNativeDriver: true }) : null;
    animation?.start();
    const timer = setTimeout(() => { current.fired = true; progress?.setValue(1); callback.current(); }, current.remaining);
    return () => { clearTimeout(timer); animation?.stop(); current.remaining = Math.max(0, current.remaining - (Date.now() - start)); };
  }, [key, duration, paused, resumeGrace, progress]);
}

export function useBusAppActive() {
  const [active, setActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => setActive(next === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}

/** Device speech is optional; the same announcement is always rendered as text. */
export function useBusSpeech(enabled: boolean) {
  const { preferences } = useGamePreferences();
  const [speaking, setSpeaking] = useState(false);
  const token = useRef(0); const mounted = useRef(true);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volume = preferences.effectsVolume;
  const muted = Platform.OS === 'web' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('muteAudio') === '1';
  const stop = useCallback(() => {
    token.current++;
    if (fallback.current) clearTimeout(fallback.current);
    fallback.current = null;
    if (mounted.current) setSpeaking(false);
    try { void Speech.stop().catch(() => {}); } catch { /* Captions remain available without a speech engine. */ }
  }, []);
  const speak = useCallback((text: string, explicit = false) => {
    stop();
    if ((!enabled && !explicit) || muted || volume === 0) return;
    const own = ++token.current;
    const finish = () => { if (mounted.current && token.current === own) { setSpeaking(false); if (fallback.current) clearTimeout(fallback.current); } };
    setSpeaking(true);
    // A missing native callback must not strand the bus in its speaking state.
    fallback.current = setTimeout(finish, 22000);
    try { Speech.speak(text, { language: 'ko-KR', rate: 0.9, pitch: 1, volume, onDone: finish, onStopped: finish, onError: finish }); }
    catch { finish(); }
  }, [enabled, muted, stop, volume]);
  useEffect(() => { if (!enabled || volume === 0) stop(); }, [enabled, volume, stop]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop(); }; }, [stop]);
  return { speaking, speak, stop };
}
