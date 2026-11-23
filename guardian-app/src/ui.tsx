import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { c, f, softShadow } from './theme';
export type IconName = ComponentProps<typeof Ionicons>['name'];
export function Icon({ name, size = 20, color = c.green }: { name: IconName; size?: number; color?: string }) { return <Ionicons name={name} size={size} color={color} />; }
export function Button({ label, onPress, icon, tone = 'green', disabled = false, busy = false, compact = false }: { label: string; onPress: () => void; icon?: IconName; tone?: 'green' | 'light' | 'plain' | 'danger'; disabled?: boolean; busy?: boolean; compact?: boolean }) {
  const foreground = tone === 'green' ? '#fff' : tone === 'danger' ? c.red : c.green;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy, busy }} disabled={disabled || busy}
    onPress={onPress} style={({ pressed }) => [u.button, compact && { minHeight: 40, paddingVertical: 8 }, tone === 'green' ? { backgroundColor: c.green } : tone === 'light' ? { backgroundColor: c.pale } : tone === 'danger' ? { backgroundColor: '#F8EDE9' } : { backgroundColor: 'transparent' }, (disabled || busy) && { opacity: .5 }, pressed && { opacity: .8 }]}>
    {busy ? <ActivityIndicator color={foreground} size="small" /> : icon ? <Icon name={icon} size={18} color={foreground} /> : null}
    <Text style={{ fontFamily: f.bold, fontSize: 14, color: foreground }}>{label}</Text>
  </Pressable>;
}
export function Card({ children, style, testID }: { children: ReactNode; style?: ComponentProps<typeof View>['style']; testID?: string }) { return <View testID={testID} style={[u.card, style]}>{children}</View>; }
export function Pill({ children, tone = 'green' }: { children: ReactNode; tone?: 'green' | 'amber' | 'gray' }) { return <View style={[u.pill, { backgroundColor: tone === 'amber' ? c.peach : tone === 'gray' ? '#EEF0ED' : c.pale }]}><Text style={{ fontFamily: f.medium, color: tone === 'amber' ? c.amber : c.green, fontSize: 11, lineHeight: 16 }}>{children}</Text></View>; }
export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) { return <View style={[u.row, { marginBottom: 18, justifyContent: 'space-between', gap: 10 }]}><View style={{ flex: 1 }}><Text style={u.section}>{title}</Text>{subtitle && <Text style={[u.body, { marginTop: 5, fontSize: 12 }]}>{subtitle}</Text>}</View>{action}</View>; }
export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) { return <View style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 16, gap: 12 }}><View style={u.iconTile}><Icon name="leaf-outline" size={26} /></View><Text style={[u.section, { textAlign: 'center' }]}>{title}</Text><Text style={[u.body, { textAlign: 'center' }]}>{body}</Text>{action}</View>; }
export function AlertMessage({ message }: { message: string }) { return <View accessibilityRole="alert" style={u.alert}><Icon name="information-circle-outline" color={c.amber} /><Text style={[u.body, { color: c.amber, flex: 1 }]}>{message}</Text></View>; }
export const u = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  card: { backgroundColor: c.paper, borderRadius: 20, borderWidth: 1, borderColor: c.line, padding: 24, ...softShadow },
  section: { fontFamily: f.bold, fontSize: 18, color: c.ink, lineHeight: 26 },
  body: { fontFamily: f.regular, fontSize: 14, color: c.sub, lineHeight: 22 },
  small: { fontFamily: f.regular, fontSize: 12, color: c.muted, lineHeight: 18 },
  button: { minHeight: 46, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  pill: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  iconTile: { width: 44, height: 44, borderRadius: 14, backgroundColor: c.pale, alignItems: 'center', justifyContent: 'center' },
  alert: { backgroundColor: '#F8F1E6', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 9 },
  input: { minHeight: 50, borderWidth: 1, borderColor: '#D8E0D5', borderRadius: 12, paddingHorizontal: 14, backgroundColor: '#FCFDFA', fontFamily: f.regular, color: c.ink, fontSize: 15 },
});
