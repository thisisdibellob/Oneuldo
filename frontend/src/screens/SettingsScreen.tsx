import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressScale } from '../components/PressScale';
import { useGamePreferences } from '../game/gamePreferences';
import { colors, fonts } from '../theme';

/** app.json의 expo.version과 맞춘다. */
export const APP_VERSION = '1.0.0';

type Page = 'settings' | 'account' | 'credits';

const TEAM = [
  { name: '이진욱', role: 'Frontend' },
  { name: '최정우', role: 'Backend' },
  { name: '박재현', role: 'Backend' },
];

// 제작사·라이선스 문구는 확인한 뒤 sublabel로 덧붙인다(추측해서 적지 않음).
const FONT_CREDITS = ['Pretendard', 'Laundry Gothic', '교보 손글씨', 'Griun InaDoongdoong', 'Cafe24 Ssurround'];

/**
 * 사용자 탭의 설정. 음향은 게임과 같은 설정(배경음악·효과음 음량)을 켜고 끈다.
 * 구분선 없이 묶음 제목과 여백으로만 나눈다.
 */
export function SettingsScreen({ accessToken, onBack, onLogout }: {
  accessToken: string | null;
  onBack: () => void;
  onLogout?: () => void;
}) {
  const [page, setPage] = useState<Page>('settings');
  const { preferences, updatePreferences } = useGamePreferences();

  if (page === 'account') {
    return <Page title="내 계정" onBack={() => setPage('settings')}>
      <Section title="정보">
        <Row label="로그인 상태" value={accessToken ? '로그인됨' : '게스트'} />
      </Section>
      <Section title="기타">
        <Row label="로그아웃" onPress={onLogout} chevron />
      </Section>
    </Page>;
  }

  if (page === 'credits') {
    return <Page title="제작자 크레딧" onBack={() => setPage('settings')}>
      <Section title="만든 사람들">
        {/* docs/README.md 팀원 표 기준 */}
        {TEAM.map((member) => <Row key={member.name} label={member.name} value={member.role} />)}
      </Section>
      <Section title="사용한 글꼴">
        {FONT_CREDITS.map((font) => <Row key={font} label={font} />)}
      </Section>
      <Section title="아이콘">
        <Row label="Ionicons" sublabel="MIT License" />
      </Section>
    </Page>;
  }

  return <Page title="설정" onBack={onBack}>
    <Row icon="person-circle-outline" label="내 계정" sublabel={accessToken ? '로그인 정보, 로그아웃' : '게스트로 이용 중'}
      onPress={() => setPage('account')} chevron />
    <Section title="음향">
      <SoundSetting icon="musical-notes-outline" label="배경음악" volume={preferences.musicVolume}
        onChange={(musicVolume) => updatePreferences({ musicVolume })} />
      <SoundSetting icon="volume-high-outline" label="효과음" volume={preferences.effectsVolume}
        onChange={(effectsVolume) => updatePreferences({ effectsVolume })} />
    </Section>
    <Section title="앱 정보">
      <Row icon="information-circle-outline" label="버전 정보" value={APP_VERSION} />
      <Row icon="people-outline" label="제작자 크레딧" onPress={() => setPage('credits')} chevron />
    </Section>
  </Page>;
}

function Page({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return <View style={styles.root}>
    <View style={styles.header}>
      <PressScale accessibilityRole="button" accessibilityLabel="뒤로" hitSlop={10} onPress={onBack} style={styles.back}>
        <Ionicons color={colors.ink} name="chevron-back" size={28} />
      </PressScale>
      <Text accessibilityRole="header" style={styles.headerTitle}>{title}</Text>
      <View style={styles.back} />
    </View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>{children}</ScrollView>
  </View>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>;
}

function Row({ icon, label, sublabel, value, right, chevron = false, onPress }: {
  icon?: keyof typeof Ionicons.glyphMap; label: string; sublabel?: string; value?: string;
  right?: ReactNode; chevron?: boolean; onPress?: () => void;
}) {
  const body = <>
    {icon ? <Ionicons color={colors.ink} name={icon} size={26} style={styles.rowIcon} /> : null}
    <View style={styles.rowCopy}>
      <Text style={styles.rowLabel}>{label}</Text>
      {sublabel ? <Text style={styles.rowSublabel}>{sublabel}</Text> : null}
    </View>
    {value ? <Text style={styles.rowValue}>{value}</Text> : null}
    {right}
    {chevron ? <Ionicons color="#8A8F99" name="chevron-forward" size={22} /> : null}
  </>;
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>{body}</Pressable>;
}

/** 켜기·끄기 스위치와 음량 막대. 껐다 켜면 직전 음량으로 돌아간다. */
function SoundSetting({ icon, label, volume, onChange }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; volume: number; onChange: (volume: number) => void;
}) {
  const lastVolume = useRef(volume > 0 ? volume : 1);
  if (volume > 0) lastVolume.current = volume;
  return <View>
    <Row icon={icon} label={label} value={`${Math.round(volume * 100)}%`}
      right={<Toggle label={label} value={volume > 0} onChange={(on) => onChange(on ? lastVolume.current : 0)} />} />
    <View style={styles.sliderRow}>
      <VolumeSlider label={label} value={volume} onChange={onChange} />
    </View>
  </View>;
}

function VolumeSlider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const track = useRef<View>(null);
  const bounds = useRef({ x: 0, width: 1 });
  const setFromPage = (pageX: number) => {
    const ratio = (pageX - bounds.current.x) / Math.max(1, bounds.current.width);
    onChange(Math.round(Math.max(0, Math.min(1, ratio)) * 20) / 20);
  };
  const measure = (then?: () => void) => track.current?.measureInWindow((x, _y, width) => { bounds.current = { x, width }; then?.(); });
  const step = (delta: number) => onChange(Math.round(Math.max(0, Math.min(1, value + delta)) * 10) / 10);
  return <View
    accessible accessibilityRole="adjustable" accessibilityLabel={`${label} 음량`}
    accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100), text: `${Math.round(value * 100)}%` }}
    accessibilityActions={[{ name: 'increment', label: '음량 키우기' }, { name: 'decrement', label: '음량 줄이기' }]}
    onAccessibilityAction={(event) => step(event.nativeEvent.actionName === 'increment' ? 0.1 : -0.1)}
    hitSlop={{ top: 12, bottom: 12 }} onLayout={() => measure()} ref={track}
    onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true}
    onResponderGrant={(event) => { const pageX = event.nativeEvent.pageX; measure(() => setFromPage(pageX)); }}
    onResponderMove={(event) => setFromPage(event.nativeEvent.pageX)}
    style={styles.slider} testID={`${label}-volume`}>
    <View style={styles.sliderTrack}><View style={[styles.sliderFill, { width: `${value * 100}%` }]} /></View>
    <View pointerEvents="none" style={[styles.sliderKnob, { left: `${value * 100}%` }]} />
  </View>;
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }}
    hitSlop={8} onPress={() => onChange(!value)} style={[styles.toggle, value && styles.toggleOn]}>
    <View style={[styles.knob, value && styles.knobOn]} />
  </Pressable>;
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.white, flex: 1 },
  header: { alignItems: 'center', alignSelf: 'center', flexDirection: 'row', height: 56, maxWidth: 720, paddingHorizontal: 12, width: '100%' },
  back: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  headerTitle: { color: colors.ink, flex: 1, fontFamily: fonts.bold, fontSize: 18, textAlign: 'center' },
  content: { alignSelf: 'center', maxWidth: 720, paddingBottom: 40, paddingTop: 8, width: '100%' },
  section: { marginTop: 22 },
  sectionTitle: { color: '#8A8F99', fontFamily: fonts.medium, fontSize: 13, paddingHorizontal: 20, paddingVertical: 6 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 14, minHeight: 56, paddingHorizontal: 20, paddingVertical: 10 },
  rowPressed: { backgroundColor: '#F6F6F6' },
  rowIcon: { width: 26 },
  rowCopy: { flex: 1 },
  rowLabel: { color: colors.ink, fontFamily: fonts.regular, fontSize: 16, lineHeight: 22 },
  rowSublabel: { color: '#8A8F99', fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, marginTop: 2 },
  rowValue: { color: '#8A8F99', fontFamily: fonts.regular, fontSize: 15 },
  toggle: { backgroundColor: '#C9CCD1', borderRadius: 16, height: 32, justifyContent: 'center', paddingHorizontal: 3, width: 52 },
  toggleOn: { backgroundColor: colors.mint },
  knob: { backgroundColor: colors.white, borderRadius: 13, height: 26, width: 26 },
  knobOn: { alignSelf: 'flex-end' },
  sliderRow: { paddingBottom: 10, paddingLeft: 60, paddingRight: 28 },
  slider: { height: 28, justifyContent: 'center' },
  sliderTrack: { backgroundColor: '#E3E5E8', borderRadius: 3, height: 6, overflow: 'hidden' },
  sliderFill: { backgroundColor: colors.mint, height: 6 },
  sliderKnob: { backgroundColor: colors.white, borderColor: '#D5D8DC', borderRadius: 11, borderWidth: 1, height: 22, marginLeft: -11, position: 'absolute', top: 3, width: 22, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 2 },
});
