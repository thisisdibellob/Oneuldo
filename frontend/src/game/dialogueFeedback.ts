import { Platform } from 'react-native';

export const DIALOGUE_CHARACTER_DELAY = 17;
export const DIALOGUE_ENTER_SPRING = { damping: 16, mass: 0.72, stiffness: 175 };
export const DIALOGUE_CHOICE_DURATION = 200;
export const DIALOGUE_TONE_VOLUME = 0.30;
export const DIALOGUE_TONE_MIN_GAP = 110;
export const DIALOGUE_CLEAR_VOLUME = 0.24;
export const DIALOGUE_TONE_SOURCES = [
  require('../../assets/audio/dialogue-soft-1.wav'),
  require('../../assets/audio/dialogue-soft-2.wav'),
  require('../../assets/audio/dialogue-soft-3.wav'),
] as const;

export const DIALOGUE_AUDIO_MODE = {
  allowsRecording: false,
  interruptionMode: 'mixWithOthers' as const,
  playsInSilentMode: false,
  shouldPlayInBackground: false,
  shouldRouteThroughEarpiece: false,
};

/** Evaluate at hook render so silent previews never resolve an audio source. */
export function isSilentGamePreview() {
  return __DEV__ && Platform.OS === 'web' && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('muteAudio') === '1';
}
