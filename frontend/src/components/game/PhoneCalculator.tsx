import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import type { CalculatorKey, CalculatorState } from '../../game/calculator';
import { fonts } from '../../theme';
import { PressScale } from '../PressScale';

type Key = { key: CalculatorKey; label: string; spoken?: string; utility?: boolean; wide?: boolean };
const rows: readonly (readonly Key[])[] = [
  [{ key: 'AC', label: 'AC', spoken: '모두 지우기', utility: true }, { key: 'sign', label: '+/−', spoken: '양수 음수 바꾸기', utility: true }, { key: 'backspace', label: '⌫', spoken: '한 자리 지우기', utility: true }, { key: '÷', label: '÷', spoken: '나누기' }],
  [{ key: '7', label: '7' }, { key: '8', label: '8' }, { key: '9', label: '9' }, { key: '×', label: '×', spoken: '곱하기' }],
  [{ key: '4', label: '4' }, { key: '5', label: '5' }, { key: '6', label: '6' }, { key: '−', label: '−', spoken: '빼기' }],
  [{ key: '1', label: '1' }, { key: '2', label: '2' }, { key: '3', label: '3' }, { key: '+', label: '+', spoken: '더하기' }],
  [{ key: '0', label: '0' }, { key: '.', label: '.', spoken: '소수점' }, { key: '=', label: '=', spoken: '계산하기', wide: true }],
];

export function PhoneCalculator({ state, onKey, reduceMotion = false }: {
  state: CalculatorState;
  onKey: (key: CalculatorKey) => void;
  reduceMotion?: boolean;
}) {
  return (
    <View style={styles.root} testID="phone-calculator">
      <View style={styles.display}>
        <Text numberOfLines={1} style={styles.expression}>{state.expression || '계산할 숫자를 눌러 주세요'}</Text>
        {state.error ? <Text accessibilityRole="alert" style={styles.error}>{state.error}</Text> : (
          <Text accessibilityLabel={`계산 결과 ${state.input}`} accessibilityLiveRegion="polite" adjustsFontSizeToFit minimumFontScale={0.5} numberOfLines={1} style={styles.result} testID="calculator-result">{state.input}</Text>
        )}
      </View>
      <View style={styles.keypad}>
        {rows.map((row, index) => <View key={index} style={styles.row}>
          {row.map(({ key, label, spoken, utility, wide }) => {
            const operation = ['+', '−', '×', '÷'].includes(key);
            const selected = operation && state.operator === key;
            return <PressScale
              accessibilityLabel={spoken ?? `숫자 ${label}`}
              accessibilityRole="button"
              accessibilityState={operation ? { selected } : undefined}
              key={key}
              onPress={(event) => { event?.stopPropagation?.(); onKey(key); }}
              scaleTo={reduceMotion ? 1 : 0.96}
              style={[styles.key, utility && styles.utilityKey, operation && styles.operatorKey, selected && styles.selectedKey, wide && styles.equalsKey]}
            >
              {key === 'backspace' ? <Ionicons color="#405348" name="backspace-outline" size={23} /> : <Text style={[styles.keyText, utility && styles.utilityText, (selected || wide) && styles.lightText]}>{label}</Text>}
            </PressScale>;
          })}
        </View>)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 12, paddingBottom: 8 },
  display: { backgroundColor: '#E6ECD9', borderColor: '#C6CEBC', borderRadius: 16, borderWidth: 1, minHeight: 91, justifyContent: 'center', marginBottom: 14, paddingHorizontal: 16, paddingVertical: 10 },
  expression: { color: '#657160', fontFamily: fonts.regular, fontSize: 12, minHeight: 18, textAlign: 'right' },
  result: { color: '#30463B', fontFamily: fonts.semibold, fontSize: 38, lineHeight: 48, textAlign: 'right' },
  error: { color: '#975548', fontFamily: fonts.semibold, fontSize: 18, minHeight: 48, paddingTop: 12, textAlign: 'right' },
  keypad: { gap: 7 },
  row: { flexDirection: 'row', gap: 7 },
  key: { alignItems: 'center', backgroundColor: '#FFFCF5', borderBottomWidth: 3, borderColor: '#DED8CA', borderRadius: 15, flex: 1, minHeight: 48, justifyContent: 'center' },
  utilityKey: { backgroundColor: '#E7E4D9', borderColor: '#D0CDBF' },
  operatorKey: { backgroundColor: '#DBE7D9', borderColor: '#BCCCBD' },
  selectedKey: { backgroundColor: '#637F6B', borderColor: '#48614E' },
  equalsKey: { backgroundColor: '#58775F', borderColor: '#405E46', flex: 2.13 },
  keyText: { color: '#405348', fontFamily: fonts.semibold, fontSize: 24 },
  utilityText: { fontSize: 18 },
  lightText: { color: '#FFFCF5' },
});
