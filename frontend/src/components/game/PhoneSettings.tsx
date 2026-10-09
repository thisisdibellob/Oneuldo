import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { useGamePreferences } from '../../game/gamePreferences';
import { fonts } from '../../theme';
import { PressScale } from '../PressScale';

const wallpaperChoices = [
  { label: '크림', color: '#F2F0E5' },
  { label: '세이지', color: '#E1E9DA' },
  { label: '복숭아', color: '#F1DFD4' },
  { label: '하늘', color: '#DFE9EE' },
  { label: '라벤더', color: '#E9E2EE' },
] as const;

export function PhoneSettings({ controlMode, onControlModeChange, reduceMotion }: {
  controlMode: 'joystick' | 'touch';
  onControlModeChange: (mode: 'joystick' | 'touch') => void;
  reduceMotion: boolean;
}) {
  const { preferences, updatePreferences } = useGamePreferences();
  const pressScale = reduceMotion ? 1 : 0.98;
  return <View style={styles.root} testID="phone-settings">
    <View style={styles.section}>
      <Text style={styles.heading}>조작 방식</Text>
      <View accessibilityRole="radiogroup" style={styles.controlRow}>
        {([{ value: 'joystick', label: '슬라이드 패드', icon: 'game-controller-outline' }, { value: 'touch', label: '터치 이동', icon: 'hand-left-outline' }] as const).map(({ value, label, icon }) => <PressScale
          key={value} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: controlMode === value }}
          aria-checked={controlMode === value}
          onPress={() => onControlModeChange(value)} scaleTo={pressScale} style={[styles.control, controlMode === value && styles.controlSelected]}>
          <Ionicons name={icon} size={22} color="#4F6854" /><Text style={styles.controlText}>{label}</Text>
        </PressScale>)}
      </View>
    </View>
    <View style={styles.section}>
      <Text style={styles.heading}>배경화면 색상</Text>
      <View accessibilityRole="radiogroup" style={styles.wallpapers}>
        {wallpaperChoices.map(({ color, label }) => <PressScale
          accessibilityLabel={`${label} 배경화면`} accessibilityRole="radio" accessibilityState={{ checked: preferences.wallpaperColor === color }}
          aria-checked={preferences.wallpaperColor === color}
          key={color} onPress={() => updatePreferences({ wallpaperColor: color })} scaleTo={pressScale}
          style={[styles.swatch, { backgroundColor: color }, preferences.wallpaperColor === color && styles.swatchSelected]}>
          {preferences.wallpaperColor === color ? <Ionicons name="checkmark" color="#3E6149" size={22} /> : null}
        </PressScale>)}
      </View>
    </View>
    <View style={styles.section}>
      <Text style={styles.heading}>소리</Text>
      <VolumeControl label="배경음악" volume={preferences.musicVolume} onChange={(musicVolume) => updatePreferences({ musicVolume })} reduceMotion={reduceMotion} />
      <View style={styles.divider} />
      <VolumeControl label="효과음" volume={preferences.effectsVolume} onChange={(effectsVolume) => updatePreferences({ effectsVolume })} reduceMotion={reduceMotion} />
    </View>
  </View>;
}

function VolumeControl({ label, volume, onChange, reduceMotion }: {
  label: string; volume: number; onChange: (volume: number) => void; reduceMotion: boolean;
}) {
  const change = (amount: number) => onChange(Math.max(0, Math.min(1, Math.round((volume + amount) * 100) / 100)));
  return <View>
    <Text style={styles.volumeLabel}>{label}</Text>
    <View style={styles.volumeRow}>
      <PressScale accessibilityRole="button" accessibilityLabel={`${label} ${volume === 0 ? '음소거 해제' : '음소거'}`}
        onPress={() => onChange(volume === 0 ? 1 : 0)} scaleTo={reduceMotion ? 1 : 0.96} style={styles.volumeButton}>
        <Ionicons name={volume === 0 ? 'volume-mute-outline' : 'volume-medium-outline'} color="#516F58" size={22} />
      </PressScale>
      <PressScale accessibilityRole="button" accessibilityLabel={`${label} 음량 줄이기`} accessibilityState={{ disabled: volume === 0 }} disabled={volume === 0}
        onPress={() => change(-0.25)} scaleTo={reduceMotion ? 1 : 0.96} style={[styles.volumeButton, volume === 0 && styles.disabled]}>
        <Ionicons name="remove" color="#516F58" size={23} />
      </PressScale>
      <View accessible accessibilityRole="adjustable" accessibilityLabel={`${label} 음량`}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(volume * 100), text: `${Math.round(volume * 100)}퍼센트` }}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(volume * 100)} aria-valuetext={`${Math.round(volume * 100)}퍼센트`}
        accessibilityActions={[{ name: 'increment', label: '음량 키우기' }, { name: 'decrement', label: '음량 줄이기' }]}
        onAccessibilityAction={({ nativeEvent }) => change(nativeEvent.actionName === 'increment' ? 0.25 : -0.25)} style={styles.volumeValue}>
        <Text style={styles.volumeText}>{Math.round(volume * 100)}%</Text>
      </View>
      <PressScale accessibilityRole="button" accessibilityLabel={`${label} 음량 키우기`} accessibilityState={{ disabled: volume === 1 }} disabled={volume === 1}
        onPress={() => change(0.25)} scaleTo={reduceMotion ? 1 : 0.96} style={[styles.volumeButton, volume === 1 && styles.disabled]}>
        <Ionicons name="add" color="#516F58" size={23} />
      </PressScale>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  section: { backgroundColor: 'rgba(255,252,245,0.78)', borderRadius: 16, padding: 10 },
  heading: { color: '#455C4B', fontFamily: fonts.semibold, fontSize: 15, marginBottom: 8 },
  controlRow: { flexDirection: 'row', gap: 8 },
  control: { alignItems: 'center', justifyContent: 'center', gap: 5, flex: 1, minHeight: 52, borderRadius: 13, borderColor: '#DDDCCD', borderWidth: 1, backgroundColor: '#F5F3EA' },
  controlSelected: { backgroundColor: '#E1E9D9', borderColor: '#7F987B', borderWidth: 2 },
  controlText: { color: '#455C4B', fontFamily: fonts.medium, fontSize: 12 },
  wallpapers: { flexDirection: 'row', justifyContent: 'space-between', gap: 3 },
  swatch: { alignItems: 'center', justifyContent: 'center', borderColor: '#D9D8CA', borderWidth: 1, borderRadius: 14, height: 44, flex: 1, maxWidth: 44 },
  swatchSelected: { borderColor: '#6C8B6E', borderWidth: 2 },
  volumeLabel: { color: '#5C6E59', fontFamily: fonts.medium, fontSize: 13, marginBottom: 5 },
  volumeRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  volumeButton: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8EDDF', borderRadius: 12, minHeight: 44, width: 44 },
  volumeValue: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  volumeText: { color: '#455C4B', fontFamily: fonts.semibold, fontSize: 16 },
  disabled: { opacity: 0.38 },
  divider: { height: 1, backgroundColor: '#DFE3D5', marginVertical: 7 },
});
