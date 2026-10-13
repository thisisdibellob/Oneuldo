import { useEffect } from 'react';
import { useAudioPlayerStatus, type AudioPlayer } from 'expo-audio';

const BACKGROUND_MUSIC_VOLUME = 0.5;
const BACKGROUND_MUSIC_DUCKED_VOLUME = 0.25;
const BACKGROUND_MUSIC_GAIN = 0.75;

type Props = {
  player: AudioPlayer;
  audioModeReady: boolean;
  muted: boolean;
  musicVolume: number;
  ducked: boolean;
};

/** Playback position changes every 500ms; keep that subscription out of the world. */
export function GameBackgroundMusic({ player, audioModeReady, muted, musicVolume, ducked }: Props) {
  const status = useAudioPlayerStatus(player);
  // downloadFirst can report a loaded status before the real web player is ready.
  // Re-read the player after replacement, then set its volume before starting it.
  const loaded = status.isLoaded && player.isLoaded;

  useEffect(() => {
    const volume = muted ? 0 : musicVolume;
    player.volume = volume * BACKGROUND_MUSIC_GAIN * (ducked
      ? BACKGROUND_MUSIC_DUCKED_VOLUME : BACKGROUND_MUSIC_VOLUME);
    if (volume === 0) { player.pause(); return; }
    if (!audioModeReady || !loaded) return;
    player.loop = true;
    player.play();
  }, [audioModeReady, player, loaded, muted, musicVolume, ducked]);

  return null;
}
