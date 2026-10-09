import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useEffect, useRef } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { CalculatorKey, CalculatorState } from '../../game/calculator';
import { useGamePreferences } from '../../game/gamePreferences';
import { fonts } from '../../theme';
import { PressScale } from '../PressScale';
import { PhoneCalculator } from './PhoneCalculator';
import { PhoneSettings } from './PhoneSettings';

export type PhoneAction = 'calculator' | 'settings' | 'contacts' | 'exit' | 'emergency' | null;
export type PhoneContact = 'jiyoung' | 'minsu';

export function GamePhonePanel({ action, calculator, controlMode, onAction, onCalculatorKey, onClose, onCallContact, onControlModeChange, onEmergencyExit, onExit, reduceMotion }: {
  action: PhoneAction;
  calculator: CalculatorState;
  onAction: (action: PhoneAction) => void;
  onCalculatorKey: (key: CalculatorKey) => void;
  onClose: () => void;
  onCallContact: (contact: PhoneContact) => void;
  controlMode: 'joystick' | 'touch';
  onControlModeChange: (mode: 'joystick' | 'touch') => void;
  onEmergencyExit: () => void;
  onExit: () => void;
  reduceMotion: boolean;
}) {
  const progress = useRef(new Animated.Value(1)).current;
  const { preferences } = useGamePreferences();
  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(reduceMotion ? 1 : 0);
    if (reduceMotion) return;
    const transition = Animated.timing(progress, { duration: 180, easing: Easing.out(Easing.cubic), toValue: 1, useNativeDriver: true });
    transition.start();
    return () => transition.stop();
  }, [action, progress, reduceMotion]);

  const exiting = action === 'exit';
  return (
    <View style={[styles.screen, { backgroundColor: preferences.wallpaperColor }]} testID="phone-screen">
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.statusBar}>
        <Text style={styles.statusTime}>11:45</Text>
        <View style={styles.speaker}><View style={styles.camera} /></View>
        <View style={styles.statusIcons}><Ionicons color="#3D5143" name="cellular" size={12} /><Ionicons color="#3D5143" name="battery-full" size={17} /></View>
      </View>
      <View style={styles.appHeader}>
        {action ? <PressScale accessibilityLabel="휴대폰 홈으로" accessibilityRole="button" onPress={() => onAction(null)} scaleTo={reduceMotion ? 1 : 0.96} style={styles.headerButton}><Ionicons color="#455C4B" name="chevron-back" size={23} /></PressScale> : <View style={styles.headerButton} />}
        <Text style={styles.headerTitle}>{action === 'calculator' ? '계산기' : action === 'settings' ? '설정' : action === 'contacts' ? '전화' : '내 휴대폰'}</Text>
        <PressScale accessibilityLabel="휴대폰 닫기" accessibilityRole="button" onPress={() => onClose()} scaleTo={reduceMotion ? 1 : 0.96} style={styles.headerButton}><Ionicons color="#455C4B" name="close" size={23} /></PressScale>
      </View>
      <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.scrollContent} testID="phone-content-scroll">
        <Animated.View style={{ opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [7, 0] }) }] }}>
          {action === 'calculator' ? <PhoneCalculator state={calculator} onKey={onCalculatorKey} reduceMotion={reduceMotion} />
            : action === 'settings' ? <PhoneSettings controlMode={controlMode} onControlModeChange={onControlModeChange} reduceMotion={reduceMotion} />
            : action === 'contacts' ? <View style={styles.contacts} testID="phone-contacts">
              {([{ id: 'jiyoung', name: '지영', color: '#DDE7D5' }, { id: 'minsu', name: '민수', color: '#E6DFD2' }] as const).map(contact => <PressScale
                key={contact.id} accessibilityLabel={`${contact.name}에게 전화`} accessibilityRole="button"
                onPress={() => onCallContact(contact.id)} scaleTo={reduceMotion ? 1 : 0.98} style={styles.contact}>
                <View style={[styles.contactAvatar, { backgroundColor: contact.color }]}><Text style={styles.contactInitial}>{contact.name[0]}</Text></View>
                <Text style={styles.contactName}>{contact.name}</Text><Ionicons name="call-outline" color="#5F7E64" size={24} />
              </PressScale>)}
            </View> : action ? (
            <View style={styles.confirm}>
              <View style={styles.confirmIcon}><Ionicons color="#59745F" name={exiting ? 'log-out-outline' : 'shield-checkmark-outline'} size={32} /></View>
              <Text style={styles.confirmTitle}>{exiting ? '게임에서 나갈까요?' : '안전한 곳으로 이동할까요?'}</Text>
              <Text style={styles.confirmDescription}>{exiting ? '현재 게임 화면을 닫고 메뉴로 돌아갑니다.' : '길을 잃었을 때 시작 위치로 바로 이동합니다.'}</Text>
              <PressScale accessibilityRole="button" onPress={exiting ? onExit : onEmergencyExit} scaleTo={reduceMotion ? 1 : 0.98} style={styles.confirmButton} testID={exiting ? 'game-exit' : 'emergency-exit'}><Text style={styles.confirmButtonText}>{exiting ? '나가기' : '이동하기'}</Text></PressScale>
              <PressScale accessibilityRole="button" onPress={() => onAction(null)} scaleTo={reduceMotion ? 1 : 0.98} style={styles.cancelButton}><Text style={styles.cancelText}>취소</Text></PressScale>
            </View>
          ) : (
            <View style={styles.home}>
              <View style={styles.clockWidget}><Text style={styles.clock}>11:45</Text></View>
              <View style={styles.apps}>
                <PhoneApp color="#D8E5DB" icon="call-outline" label="전화" onPress={() => onAction('contacts')} reduceMotion={reduceMotion} />
                <PhoneApp color="#E4EAD5" icon="calculator-outline" label="계산기" onPress={() => onAction('calculator')} reduceMotion={reduceMotion} />
                <PhoneApp color="#E4DDD0" icon="options-outline" label="설정" onPress={() => onAction('settings')} reduceMotion={reduceMotion} />
                <PhoneApp color="#E5E1D7" icon="wallet-outline" label="금융" disabled reduceMotion={reduceMotion} />
                <PhoneApp color="#EEE1CA" icon="shield-checkmark-outline" label="비상 탈출" onPress={() => onAction('emergency')} reduceMotion={reduceMotion} />
                <PhoneApp color="#EBD7CF" icon="log-out-outline" label="게임 나가기" onPress={() => onAction('exit')} reduceMotion={reduceMotion} />
              </View>
            </View>
          )}
        </Animated.View>
      </ScrollView>
      <PressScale accessibilityLabel={action ? '휴대폰 홈으로' : '휴대폰 닫기'} accessibilityRole="button" onPress={() => action ? onAction(null) : onClose()} scaleTo={1} style={styles.homeButton}><View style={styles.homeIndicator} /></PressScale>
    </View>
  );
}

function PhoneApp({ color, icon, label, onPress, reduceMotion, disabled = false }: {
  color: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress?: () => void;
  reduceMotion: boolean;
  disabled?: boolean;
}) {
  return <PressScale accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={(event) => { event?.stopPropagation?.(); onPress?.(); }} scaleTo={reduceMotion ? 1 : 0.94} style={styles.app} testID="phone-home-app">
    <View style={[styles.appIcon, { backgroundColor: color }]}><Ionicons color="#4E6453" name={icon} size={31} /></View>
    <Text style={styles.appLabel}>{label}</Text>
  </PressScale>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#F2F0E5', borderColor: '#B3BBA8', borderRadius: 29, borderWidth: 1, flex: 1, minHeight: 0, overflow: 'hidden' },
  statusBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', height: 32, paddingHorizontal: 20 },
  statusTime: { color: '#3D5143', fontFamily: fonts.semibold, fontSize: 11 },
  speaker: { alignItems: 'flex-end', backgroundColor: '#475B4D', borderRadius: 10, height: 13, padding: 4, width: 61 },
  camera: { backgroundColor: '#8A9D8C', borderRadius: 3, height: 5, width: 5 },
  statusIcons: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  appHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 5 },
  headerButton: { alignItems: 'center', justifyContent: 'center', height: 44, width: 44 },
  headerTitle: { color: '#455C4B', fontFamily: fonts.laundryBold, fontSize: 20 },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: { flexGrow: 1 },
  home: { minHeight: 316, paddingHorizontal: 23, paddingBottom: 8 },
  clockWidget: { alignItems: 'center', justifyContent: 'center', minHeight: 98, marginBottom: 12, paddingVertical: 20 },
  clock: { color: '#506952', fontFamily: fonts.laundryBold, fontSize: 38, lineHeight: 45 },
  apps: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', rowGap: 18 },
  app: { alignItems: 'center', width: '45%' },
  appIcon: { alignItems: 'center', borderColor: '#FFFCF3', borderRadius: 18, borderWidth: 2, height: 60, justifyContent: 'center', width: 60 },
  appLabel: { color: '#4C594A', fontFamily: fonts.medium, fontSize: 13, marginTop: 7, textAlign: 'center' },
  homeButton: { alignItems: 'center', height: 32, justifyContent: 'center' },
  homeIndicator: { backgroundColor: '#7C8B76', borderRadius: 3, height: 4, width: 88 },
  contacts: { paddingHorizontal: 14, gap: 12 },
  contact: { alignItems: 'center', flexDirection: 'row', gap: 12, backgroundColor: 'rgba(255,252,245,0.82)', borderColor: '#D8DFD0', borderWidth: 1, borderRadius: 17, padding: 13, minHeight: 75 },
  contactAvatar: { alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 16 },
  contactInitial: { color: '#60745C', fontFamily: fonts.laundryBold, fontSize: 20 },
  contactName: { color: '#405A46', fontFamily: fonts.semibold, fontSize: 18, flex: 1 },
  confirm: { alignItems: 'center', minHeight: 316, paddingHorizontal: 22, paddingVertical: 18 },
  confirmIcon: { alignItems: 'center', backgroundColor: '#E2E8D8', borderRadius: 21, height: 62, justifyContent: 'center', width: 62 },
  confirmTitle: { color: '#405442', fontFamily: fonts.laundryBold, fontSize: 22, marginTop: 18, textAlign: 'center' },
  confirmDescription: { color: '#737B6C', fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, marginTop: 12, textAlign: 'center' },
  confirmButton: { alignItems: 'center', backgroundColor: '#617F66', borderRadius: 15, justifyContent: 'center', minHeight: 48, marginTop: 24, width: '100%' },
  confirmButtonText: { color: '#FFFCF2', fontFamily: fonts.semibold, fontSize: 16 },
  cancelButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, width: '100%' },
  cancelText: { color: '#64725C', fontFamily: fonts.medium, fontSize: 15 },
});
