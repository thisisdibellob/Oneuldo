import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { MARKET_INTERIOR_THEME_OPTIONS } from '../../game/marketInteriorThemes';
import { useGamePreferences } from '../../game/gamePreferences';
import { fonts } from '../../theme';
import { PressScale } from '../PressScale';

/** Cosmetic preference only: a theme never replaces the current game session. */
export function MarketThemeSelector({ reduceMotion = false }: { reduceMotion?: boolean }) {
  const { preferences, updatePreferences } = useGamePreferences();
  return <View accessibilityRole="radiogroup" accessibilityLabel="마트 인테리어" style={styles.options}>
    {MARKET_INTERIOR_THEME_OPTIONS.map(theme => <PressScale key={theme.id}
      accessibilityRole="radio" accessibilityLabel={theme.label}
      accessibilityState={{ checked: preferences.marketInteriorTheme === theme.id }}
      aria-checked={preferences.marketInteriorTheme === theme.id}
      onPress={() => updatePreferences({ marketInteriorTheme: theme.id })} scaleTo={reduceMotion ? 1 : 0.98}
      style={[styles.option, preferences.marketInteriorTheme === theme.id && styles.selected]}>
      <View style={styles.palette}>{theme.colors.map(color => <View key={color} style={[styles.color, { backgroundColor: color }]} />)}</View>
      <Text style={styles.label}>{theme.label}</Text>
      <Ionicons name={preferences.marketInteriorTheme === theme.id ? 'checkmark-circle' : 'ellipse-outline'} size={19} color="#617A5E" />
    </PressScale>)}
  </View>;
}
const styles = StyleSheet.create({
  options: { gap: 5 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 48, paddingHorizontal: 8, borderRadius: 12 },
  selected: { backgroundColor: '#E1E9D9' },
  palette: { flexDirection: 'row', overflow: 'hidden', width: 51, height: 28, borderRadius: 8 },
  color: { flex: 1 },
  label: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: '#455C4B' },
});
