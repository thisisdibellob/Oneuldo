import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';
import { fonts } from '../../theme';

export type PhoneAppIconName = 'phone' | 'calculator' | 'bus' | 'travel' | 'settings' | 'wallet' | 'emergency' | 'exit' | 'photos' | 'messages';
const palettes: Record<PhoneAppIconName, readonly [string, string]> = {
  phone: ['#9AC79B', '#668F70'], calculator: ['#718177', '#40584C'], bus: ['#93B7BC', '#648A9E'],
  travel: ['#F2E9CA', '#DDDEBD'], settings: ['#E1E5DE', '#B7C1B4'], wallet: ['#BEAC8F', '#8C836D'],
  emergency: ['#E5C898', '#C69C64'], exit: ['#DFAF99', '#B88574'], photos: ['#FFFFFB', '#F0F0E4'],
  messages: ['#AFCEA0', '#7EAA78'],
};
const ordinaryIcons = { phone: 'call', bus: 'bus', settings: 'settings', wallet: 'wallet', emergency: 'shield-checkmark', exit: 'log-out', messages: 'chatbubbles' } as const;

/** Layered, quiet app illustrations that stay crisp without downloading icon bitmaps. */
export function PhoneAppIcon({ name }: { name: PhoneAppIconName }) {
  return <View style={[s.iconFrame, { backgroundColor: palettes[name][0] }]}>
    <View style={s.iconClip}>
      <LinearGradient colors={palettes[name]} start={{ x: 0.12, y: 0 }} end={{ x: 0.88, y: 1 }} style={s.iconFill}>
        <View style={s.sheen} />
        {name === 'photos' ? <View style={s.flower}>{['#DC8F8C', '#E7AD78', '#E1C67E', '#9FBD8B', '#82B9AB', '#86ACC5', '#AAA1C4', '#C899AF'].map((color, index) => <View key={color} style={[s.petalOrbit, { transform: [{ rotate: `${index * 45}deg` }] }]}><View style={[s.petal, { backgroundColor: color }]} /></View>)}<View style={s.flowerCenter} /></View>
          : name === 'calculator' ? <View style={s.calculator}><View style={s.calculatorDisplay} /><View style={s.calculatorKeys}>{['+', '−', '×', '='].map((symbol, index) => <View key={symbol} style={[s.calculatorKey, index === 3 && { backgroundColor: '#CFB07B' }]}><Text style={s.calculatorGlyph}>{symbol}</Text></View>)}</View></View>
            : name === 'travel' ? <><View style={[s.mapBlock, { left: 3, top: 5, backgroundColor: '#B2C7A2' }]} /><View style={[s.mapBlock, { right: 3, bottom: 3, backgroundColor: '#ADCBD1' }]} /><View style={s.mapRoad} /><View style={s.mapRoadAcross} /><Ionicons name="location" size={34} color="#C37C64" style={{ marginTop: -4 }} /><View style={s.pinCenter} /></>
              : <><Ionicons name={ordinaryIcons[name]} size={name === 'settings' ? 43 : name === 'phone' ? 35 : 33} color={name === 'settings' ? '#728170' : '#FFFCEE'} />{name === 'settings' ? <View style={s.gearCenter} /> : name === 'bus' ? <View style={s.busRoad} /> : name === 'wallet' ? <View style={s.walletDot} /> : null}</>}
      </LinearGradient>
    </View>
  </View>;
}

const s = StyleSheet.create({
  iconFrame: { width: 61, height: 61, borderRadius: 17, boxShadow: '0 3px 5px rgba(57,70,47,0.11)' },
  iconClip: { flex: 1, borderRadius: 17, overflow: 'hidden' },
  iconFill: { flex: 1, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  sheen: { position: 'absolute', left: 0, right: 0, top: 0, height: 29, backgroundColor: '#FFFFFF0C' },
  flower: { width: 49, height: 49, alignItems: 'center', justifyContent: 'center' },
  petalOrbit: { position: 'absolute', width: 49, height: 49, alignItems: 'center' },
  petal: { width: 17, height: 26, borderRadius: 10, opacity: 0.87 },
  flowerCenter: { width: 10, height: 10, borderRadius: 6, backgroundColor: '#FAECCE' },
  calculator: { width: 34, gap: 5 }, calculatorDisplay: { height: 9, borderRadius: 3, backgroundColor: '#DAE3CE' },
  calculatorKeys: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, calculatorKey: { width: 15, height: 14, borderRadius: 4, backgroundColor: '#A6B5A4', alignItems: 'center', justifyContent: 'center' },
  calculatorGlyph: { fontFamily: fonts.bold, color: '#F9FBF2', fontSize: 12, lineHeight: 14 },
  mapBlock: { position: 'absolute', width: 27, height: 34, borderRadius: 5, transform: [{ rotate: '-18deg' }] },
  mapRoad: { position: 'absolute', width: 8, height: 79, backgroundColor: '#FFFCED', transform: [{ rotate: '29deg' }] },
  mapRoadAcross: { position: 'absolute', width: 79, height: 7, backgroundColor: '#FFFCED', transform: [{ rotate: '15deg' }], top: 37 },
  pinCenter: { position: 'absolute', width: 7, height: 7, backgroundColor: '#F9E6CE', borderRadius: 4, top: 19 },
  gearCenter: { position: 'absolute', width: 17, height: 17, borderRadius: 10, borderWidth: 3, borderColor: '#CED6C9', backgroundColor: '#7D8B78' },
  busRoad: { position: 'absolute', bottom: 8, width: 29, height: 2, borderRadius: 2, backgroundColor: '#D8ECE660' },
  walletDot: { position: 'absolute', width: 3, height: 3, borderRadius: 2, backgroundColor: '#A79576', right: 17, top: 31 },
});
