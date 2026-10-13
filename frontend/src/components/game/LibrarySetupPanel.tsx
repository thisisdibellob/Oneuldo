import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { LibrarySessionConfig } from '../../game/librarySession';
import { fonts } from '../../theme';
import { PressScale } from '../PressScale';
import { useMarketReducedMotion } from './MarketPanelTransition';
import { LIBRARY_COLORS, LibraryButton, LibraryPanel } from './LibraryWorkPanel';

export function LibrarySetupPanel({ config, onChange, onClose, onStart }: {
  config: LibrarySessionConfig;
  onChange: (config: LibrarySessionConfig) => void;
  onClose: () => void;
  onStart: () => void;
}) {
  const { width } = useWindowDimensions();
  const visitorCount = config.visitorCount ?? 1;
  const change = (patch: Partial<LibrarySessionConfig>) => onChange({ ...config, ...patch });

  return <LibraryPanel title="근무 설정" onClose={onClose} testID="library-setup-panel" fixedHeight={720}
    footer={<LibraryButton icon="checkmark" onPress={onStart}>이 설정으로 시작</LibraryButton>}>
    <View style={styles.fields}>
      <ChoiceGroup title="손님 수" icon="people-outline" value={visitorCount}
        options={[{ value: 0, label: '0명' }, { value: 1, label: '1명' }, { value: 2, label: '2명' }] as const}
        optionLabel={label => `손님 ${label}`} onSelect={value => change({ visitorCount: value })} />
      <ChoiceGroup title="부탁 종류" icon="chatbubble-ellipses-outline" value={config.requestMode ?? 'mixed'}
        options={[{ value: 'mixed', label: '섞어서' }, { value: 'find', label: '위치 안내' }, { value: 'shelve', label: '책 꽂기' }] as const}
        disabled={visitorCount === 0} vertical={width < 360} onSelect={value => change({ requestMode: value })} />
      <ChoiceGroup title="정리할 책" icon="book-outline" value={config.bookCount ?? 12}
        options={[{ value: 6, label: '6권' }, { value: 12, label: '12권' }, { value: 18, label: '18권' }] as const}
        optionLabel={label => `정리할 책 ${label}`} onSelect={value => change({ bookCount: value })} />
      <ChoiceGroup title="라벨 훼손" icon="pricetag-outline" value={config.damagedBookCount ?? 1}
        options={[{ value: 0, label: '0권' }, { value: 1, label: '1권' }, { value: 2, label: '2권' }] as const}
        optionLabel={label => `라벨 훼손 ${label}`} onSelect={value => change({ damagedBookCount: value })} />
      <ChoiceGroup title="진행 방식" icon="compass-outline" value={config.supportMode ?? 'guided'}
        options={[{ value: 'guided', label: '안내와 함께' }, { value: 'independent', label: '혼자 해보기' }] as const}
        onSelect={value => change({ supportMode: value })} />
    </View>
  </LibraryPanel>;
}

function ChoiceGroup<T extends string | number>({ title, icon, value, options, onSelect, disabled = false, vertical = false, optionLabel }: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onSelect: (value: T) => void;
  disabled?: boolean;
  vertical?: boolean;
  optionLabel?: (label: string) => string;
}) {
  const reducedMotion = useMarketReducedMotion();
  return <View accessibilityRole="radiogroup" accessibilityLabel={title} accessibilityState={{ disabled }}
    accessibilityHint={disabled ? '손님이 있을 때 선택할 수 있어요.' : undefined} style={[styles.field, disabled && styles.disabled]}>
    <View style={styles.heading}>
      <Ionicons name={icon} size={21} color={LIBRARY_COLORS.green} />
      <Text style={styles.label}>{title}</Text>
    </View>
    <View style={[styles.options, vertical && styles.verticalOptions]}>
      {options.map(option => <PressScale key={option.value} accessibilityRole="radio"
        accessibilityLabel={optionLabel?.(option.label) ?? option.label}
        accessibilityHint={disabled ? '손님이 있을 때 선택할 수 있어요.' : undefined}
        accessibilityState={{ checked: value === option.value, disabled }} aria-checked={value === option.value} aria-disabled={disabled} disabled={disabled}
        onPress={() => onSelect(option.value)} scaleTo={reducedMotion ? 1 : 0.98}
        style={[styles.option, vertical && styles.verticalOption, value === option.value && styles.selected]}>
        <Text style={[styles.optionText, value === option.value && styles.selectedText]}>{option.label}</Text>
      </PressScale>)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  fields: { gap: 23, paddingTop: 2 },
  field: { gap: 10 },
  heading: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  label: { color: LIBRARY_COLORS.ink, fontFamily: fonts.semibold, fontSize: 18, lineHeight: 25 },
  options: { flexDirection: 'row', gap: 8 },
  verticalOptions: { flexDirection: 'column' },
  option: { flex: 1, minWidth: 0, minHeight: 54, borderRadius: 15, backgroundColor: '#ECEDE2', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7, paddingVertical: 12 },
  verticalOption: { flex: 0 },
  optionText: { color: '#61715E', fontFamily: fonts.semibold, fontSize: 16, lineHeight: 23, textAlign: 'center' },
  selected: { backgroundColor: LIBRARY_COLORS.green },
  selectedText: { color: '#FFFCF3' },
  disabled: { opacity: 0.45 },
});
