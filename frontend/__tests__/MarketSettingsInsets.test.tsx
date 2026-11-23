import { render } from '@testing-library/react-native';
import { KeyboardAvoidingView, Platform, StyleSheet, Text } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { SettingsSurface } from '../src/components/game/MarketSettingsUi';

it('preserves 54dp below the footer when iOS keyboard avoidance overrides its own padding to zero', () => {
  const platform = jest.replaceProperty(Platform, 'OS', 'ios');
  const view = render(<SafeAreaInsetsContext.Provider value={{ top: 59, bottom: 34, left: 0, right: 0 }}>
    <SettingsSurface footer={<Text>적용</Text>}><Text>설정 내용</Text></SettingsSurface>
  </SafeAreaInsetsContext.Provider>);
  try {
    expect(view.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('padding');
    const clearance = view.getByTestId('market-settings-insets');
    expect(StyleSheet.flatten(clearance.props.style).paddingBottom).toBe(54);
    // Assert against the actual native KeyboardAvoidingView output, not just its props.
    expect(StyleSheet.flatten(view.getByTestId('market-settings-backdrop').props.style).paddingBottom).toBe(0);
    expect(StyleSheet.flatten(clearance.props.style).flex).toBe(1);
  } finally { view.unmount(); platform.restore(); }
});
