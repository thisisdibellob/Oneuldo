import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useGamePreferences } from '../../game/gamePreferences';
import {
  DIALOGUE_AUDIO_MODE, DIALOGUE_TONE_MIN_GAP, DIALOGUE_TONE_SOURCES, DIALOGUE_TONE_VOLUME,
  isSilentGamePreview,
} from '../../game/dialogueFeedback';

/** One cancellable, rate-limited tone path shared by village and employee dialogue. */
export function useDialogueAudio({ active, ready, turnKey }: {
  active: boolean;
  ready?: boolean;
  turnKey?: string | number | null;
}) {
  const muted = isSilentGamePreview();
  const { preferences } = useGamePreferences();
  const effectsVolume = preferences.effectsVolume;
  const effectsMuted = effectsVolume === 0;
  const one = useAudioPlayer(muted ? null : DIALOGUE_TONE_SOURCES[0], { downloadFirst: true, keepAudioSessionActive: true });
  const two = useAudioPlayer(muted ? null : DIALOGUE_TONE_SOURCES[1], { downloadFirst: true, keepAudioSessionActive: true });
  const three = useAudioPlayer(muted ? null : DIALOGUE_TONE_SOURCES[2], { downloadFirst: true, keepAudioSessionActive: true });
  const oneStatus = useAudioPlayerStatus(one);
  const twoStatus = useAudioPlayerStatus(two);
  const threeStatus = useAudioPlayerStatus(three);
  const voices = useMemo(() => [
    { player: one, isLoaded: oneStatus.isLoaded },
    { player: two, isLoaded: twoStatus.isLoaded },
    { player: three, isLoaded: threeStatus.isLoaded },
  ] as const, [one, oneStatus.isLoaded, two, twoStatus.isLoaded, three, threeStatus.isLoaded]);
  const [localReady, setLocalReady] = useState(false);
  const current = useRef({ active, muted, effectsVolume, ready: ready ?? localReady, voices });
  current.current = { active, muted, effectsVolume, ready: ready ?? localReady, voices };
  const mounted = useRef(true);
  const request = useRef(0);
  const cursor = useRef(0);
  const lastPlayedAt = useRef(-Infinity);

  const stop = useCallback(() => {
    request.current += 1;
    lastPlayedAt.current = -Infinity;
    current.current.voices.forEach(({ player }) => {
      try { player.pause(); } catch { /* The native player may already be released. */ }
    });
  }, []);

  useEffect(() => {
    if (muted || ready !== undefined) return;
    let alive = true;
    void setAudioModeAsync(DIALOGUE_AUDIO_MODE).then(() => {
      if (alive) setLocalReady(true);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [muted, ready]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stop(); };
  }, [stop]);
  useEffect(() => { stop(); }, [turnKey, stop]);
  useEffect(() => { if (!active || muted || effectsMuted) stop(); }, [active, muted, effectsMuted, stop]);
  useEffect(() => {
    if (!active) return;
    voices.forEach(({ player }) => { try { player.volume = muted ? 0 : DIALOGUE_TONE_VOLUME * effectsVolume; } catch { /* Released native player. */ } });
  }, [active, effectsVolume, muted, voices]);

  const playCharacter = useCallback((character: string) => {
    const state = current.current;
    if (!mounted.current || !state.active || state.muted || state.effectsVolume === 0 || !state.ready
      || !character || /[\s.,!?…。，！？:;·\-–—()]/.test(character)) return;
    const now = Date.now();
    if (now - lastPlayedAt.current < DIALOGUE_TONE_MIN_GAP) return;
    const index = (cursor.current++ + character.charCodeAt(0)) % state.voices.length;
    const { player, isLoaded } = state.voices[index];
    if (!isLoaded) return;
    lastPlayedAt.current = now;
    const token = ++request.current;
    player.volume = DIALOGUE_TONE_VOLUME * state.effectsVolume;
    player.shouldCorrectPitch = false;
    player.setPlaybackRate(1);
    void player.seekTo(0).then(() => {
      const latest = current.current;
      if (mounted.current && token === request.current && latest.active && latest.ready && !latest.muted && latest.effectsVolume > 0) player.play();
    }).catch(() => undefined);
  }, []);

  return { playCharacter, stop, voices };
}