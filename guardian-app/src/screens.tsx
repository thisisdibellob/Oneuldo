import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { actionLabel, dateLabel, gameLabel, time, type Child, type Report } from './domain';
import { AlertMessage, Button, Card, Empty, Icon, Pill, SectionTitle, type IconName, u } from './ui';
import { c, f } from './theme';
import { RouteReview } from './RouteReview';

export function Brand({ small = false }: { small?: boolean }) { return <View style={[u.row, { gap: 10 }]}><View style={{ width: small ? 32 : 42, height: small ? 32 : 42, backgroundColor: c.green, borderRadius: small ? 11 : 14, alignItems: 'center', justifyContent: 'center' }}><Icon name="leaf-outline" color="#fff" size={small ? 19 : 25} /></View><View><Text style={{ fontFamily: f.bold, color: c.ink, fontSize: small ? 18 : 23 }}>오늘도 <Text style={{ color: c.green }}>함께</Text></Text>{!small && <Text style={[u.small, { fontSize: 10, letterSpacing: 1.2 }]}>보호자를 위한 성장 기록</Text>}</View></View>; }

export function LoginScreen({ onLogin, onDemo, busy, error, wide }: { onLogin: (email: string, password: string) => void; onDemo: () => void; busy: boolean; error: string; wide: boolean }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [visible, setVisible] = useState(false);
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: wide ? 64 : 24 }}>
    <View style={{ width: '100%', maxWidth: 1040, flexDirection: wide ? 'row' : 'column', gap: wide ? 88 : 40, alignItems: wide ? 'center' : 'stretch' }}>
      <View style={{ flex: wide ? 1 : undefined, gap: 30 }}><Brand /><View><Text style={{ color: c.ink, fontFamily: f.bold, fontSize: wide ? 44 : 31, lineHeight: wide ? 60 : 43, letterSpacing: -1.5 }}>작은 연습을,{ '\n' }함께 알아가는 시간.</Text><Text style={[u.body, { marginTop: 18, fontSize: 16, lineHeight: 27 }]}>오늘은 무엇을 해냈을까요?{ '\n' }기록 속 행동을 살펴보고{ '\n' }다음 연습을 함께 준비해 주세요.</Text></View>
        {wide && <View style={{ gap: 17, marginTop: 10 }}>{[['footsteps-outline', '어디로 움직였는지'], ['chatbubble-outline', '어떤 도움을 사용했는지'], ['leaf-outline', '다음엔 무엇을 연습하면 좋을지']].map(([icon, label]) => <View key={label} style={[u.row, { gap: 12 }]}><View style={u.iconTile}><Icon name={icon as IconName} /></View><Text style={u.body}>{label}</Text></View>)}</View>}
      </View>
      <Card style={{ flex: wide ? 1 : undefined, padding: wide ? 36 : 24, maxWidth: 440, width: '100%', alignSelf: 'center' }}><Text style={[u.section, { fontSize: 24 }]}>보호자 로그인</Text><Text style={[u.body, { marginTop: 8, marginBottom: 26 }]}>연결된 자녀의 훈련 기록을 확인해요.</Text>
        <Text style={s.label}>이메일</Text><TextInput accessibilityLabel="보호자 이메일" placeholder="name@example.com" placeholderTextColor={c.muted} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="username" value={email} onChangeText={setEmail} editable={!busy} style={[u.input, { marginBottom: 18 }]} />
        <Text style={s.label}>비밀번호</Text><View style={{ position: 'relative', marginBottom: 20 }}><TextInput accessibilityLabel="보호자 비밀번호" placeholder="비밀번호를 입력해 주세요" placeholderTextColor={c.muted} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" value={password} onChangeText={setPassword} editable={!busy} onSubmitEditing={() => { if (email.trim() && password && !busy) onLogin(email, password); }} style={[u.input, { paddingRight: 50 }]} /><Pressable accessibilityRole="button" accessibilityLabel={visible ? '비밀번호 숨기기' : '비밀번호 보기'} onPress={() => setVisible(v => !v)} style={{ position: 'absolute', right: 4, top: 2, width: 44, height: 46, alignItems: 'center', justifyContent: 'center' }}><Icon name={visible ? 'eye-off-outline' : 'eye-outline'} color={c.sub} /></Pressable></View>
        {!!error && <View style={{ marginBottom: 16 }}><AlertMessage message={error} /></View>}
        <Button label="로그인" icon="arrow-forward" onPress={() => { onLogin(email, password); setPassword(''); }} busy={busy} disabled={!email.trim() || !password} />
        <View style={{ height: 1, backgroundColor: c.line, marginVertical: 24 }} />
        <Text style={[u.small, { marginBottom: 12, textAlign: 'center' }]}>먼저 화면과 기능을 살펴보고 싶으신가요?</Text><Button label="시연 화면 둘러보기" tone="light" onPress={onDemo} disabled={busy} />
        <Text style={[u.small, { textAlign: 'center', marginTop: 14, fontSize: 11 }]}>시연에는 가상의 인물과 예시 기록을 사용해요.</Text>
      </Card>
    </View><Text style={[u.small, { marginTop: 48 }]}>오늘도 · 생활 속 자립을 향한 작은 연습</Text>
  </ScrollView></KeyboardAvoidingView>;
}

const gameIcon = { market: 'basket-outline', bus: 'bus-outline', library: 'book-outline' } as const;
export function ReportRow({ report, onPress }: { report: Report; onPress: () => void }) {
  const label = report.status === 'stopped' ? '중단 기록' : report.analysisStatus === 'pending' ? '분석 중' : report.analysisStatus === 'failed' ? '분석 확인 필요' : report.result === 'achieved' ? '목표 수행' : report.result === 'partial' ? '부분 수행' : '판단 보류';
  return <Pressable accessibilityRole="button" accessibilityLabel={`${dateLabel(report.completedAt)} ${report.title} 상세 보기`} onPress={onPress} style={({ pressed }) => [s.reportRow, pressed && { backgroundColor: '#F5F7F0' }]}>
    <View style={[u.iconTile, { backgroundColor: report.game === 'bus' ? '#EAF0F4' : c.pale }]}><Icon name={gameIcon[report.game]} color={report.game === 'bus' ? c.blue : c.green} /></View>
    <View style={{ flex: 1, gap: 5 }}><Text style={{ color: c.ink, fontFamily: f.bold, fontSize: 14, lineHeight: 21 }}>{report.title}</Text><Text style={u.small}>{dateLabel(report.completedAt)} · {gameLabel[report.game]} · {time(report.durationSeconds)}</Text></View><Pill tone={report.result === 'achieved' && report.analysisStatus === 'ready' ? 'green' : 'amber'}>{label}</Pill><Icon name="chevron-forward" color={c.muted} size={16} />
  </Pressable>;
}

export function Overview({ child, reports, onReport, onRecords, wide }: { child: Child; reports: Report[]; onReport: (report: Report) => void; onRecords: () => void; wide: boolean }) {
  const totalMinutes = Math.round(reports.reduce((sum, r) => sum + r.durationSeconds, 0) / 60), ready = reports.filter(r => r.analysisStatus === 'ready'), latest = reports[0];
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); const items = reports.filter(r => new Date(r.completedAt).toDateString() === d.toDateString()); return { label: ['일', '월', '화', '수', '목', '금', '토'][d.getDay()], count: items.length, day: d.getDate() }; });
  const max = Math.max(2, ...week.map(d => d.count));
  return <View style={{ gap: 22 }}>
    <View style={[s.hero, { flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'flex-start' }]}><View style={{ flex: 1, gap: 12 }}><Pill>작은 경험이 쌓이는 중</Pill><Text style={{ color: c.ink, fontFamily: f.bold, fontSize: wide ? 30 : 24, lineHeight: wide ? 42 : 35, letterSpacing: -.7 }}>{child.name}님의 오늘을,{ '\n' }함께 살펴볼까요?</Text><Text style={u.body}>잘한 순간과 도움이 필요했던 순간을{ '\n' }기록에 근거해 차근차근 알아가요.</Text></View><View style={{ width: wide ? 180 : '100%', flexDirection: wide ? 'column' : 'row', alignItems: 'center', gap: wide ? 9 : 12 }}><View style={[s.plantCircle, !wide && { width: 44, height: 44, borderRadius: 22 }]}><Icon name="leaf-outline" size={wide ? 56 : 24} color="#5A805A" /></View>{latest && <Text style={u.small}>최근 연습 · {dateLabel(latest.completedAt)}</Text>}</View></View>
    <View style={{ flexDirection: 'row', gap: 10 }}>{[
      ['완료한 연습', `${reports.filter(r => r.status === 'completed').length}`, '회', 'checkmark-circle-outline'],
      ['연습한 시간', `${totalMinutes}`, '분', 'time-outline'],
      ['분석된 기록', `${ready.length}`, '건', 'document-text-outline'],
    ].map(([label, number, unit, icon]) => <Card key={label} style={{ flex: 1, padding: wide ? 20 : 14 }}><Icon name={icon as IconName} size={20} /><Text style={[u.small, { marginTop: 14, fontSize: wide ? 12 : 11 }]}>{label}</Text><Text style={{ fontFamily: f.bold, fontSize: wide ? 30 : 25, color: c.ink, marginTop: 5 }}>{number}<Text style={{ fontFamily: f.medium, fontSize: 13, color: c.sub }}> {unit}</Text></Text></Card>)}</View>
    <View style={{ flexDirection: wide ? 'row' : 'column', gap: 22 }}>
      <Card style={{ flex: wide ? 1.15 : undefined }}><SectionTitle title="이번 주 연습" subtitle="수행 횟수예요. 능력 점수를 뜻하지 않아요." /><View accessibilityLabel={`최근 7일 연습 횟수 ${week.map(d => `${d.day}일 ${d.count}회`).join(', ')}`} style={{ flexDirection: 'row', gap: 10, height: 145, alignItems: 'flex-end' }}>{week.map((d, i) => <View key={i} style={{ flex: 1, alignItems: 'center', gap: 8 }}><Text style={[u.small, { color: c.green }]}>{d.count || '·'}</Text><View style={{ width: '72%', maxWidth: 36, height: Math.max(6, d.count / max * 82), backgroundColor: i === 6 ? c.green : '#C7D8BA', borderRadius: 5 }} /><Text style={{ fontFamily: i === 6 ? f.bold : f.regular, fontSize: 12, color: i === 6 ? c.green : c.sub }}>{d.label}</Text></View>)}</View></Card>
      <Card style={{ flex: wide ? 1 : undefined, backgroundColor: '#FAF6EE', borderColor: '#EEE6D9' }}><View style={[u.row, { gap: 8, marginBottom: 14 }]}><Icon name="chatbubble-ellipses-outline" color={c.amber} /><Text style={[u.section, { fontSize: 16 }]}>함께 해볼 한 가지</Text></View><Text style={{ fontFamily: f.bold, fontSize: 18, lineHeight: 29, color: c.ink }}>{ready[0]?.nextPractice ?? '첫 연습을 마치면 다음에 도울 방법을 함께 확인해요.'}</Text><Text style={[u.small, { marginTop: 14 }]}>가장 최근의 분석을 바탕으로 한 연습 제안이에요.</Text></Card>
    </View>
    <Card><SectionTitle title="최근 훈련 기록" action={<Button compact tone="plain" label="모두 보기" onPress={onRecords} />} />{reports.length ? reports.slice(0, 3).map(r => <ReportRow key={r.id} report={r} onPress={() => onReport(r)} />) : <Empty title="아직 연습 기록이 없어요" body="자녀가 게임에서 연습을 마치면 이곳에 기록이 쌓여요." />}</Card>
  </View>;
}

export function Insights({ reports, onReport }: { reports: Report[]; onReport: (r: Report) => void }) {
  const latest = reports.find(r => r.analysisStatus === 'ready');
  return <View style={{ gap: 22 }}><Card><SectionTitle title="기록에서 발견한 모습" subtitle="최근 분석의 관찰과 근거를 함께 보여 드려요." />{latest ? <><Text style={[u.section, { fontSize: 21, lineHeight: 33, marginBottom: 18 }]}>{latest.summary}</Text><Text style={u.small}>분석 대상 · {latest.title} · {dateLabel(latest.completedAt)}</Text><View style={{ marginTop: 18 }}><Button label="근거와 상세 기록 보기" tone="light" onPress={() => onReport(latest)} /></View></> : <Empty title="완료된 분석을 기다리고 있어요" body="분석 준비 중인 기록은 훈련 기록에서 확인할 수 있어요." />}</Card>
    {latest?.findings.map(finding => <Card key={finding.id}><Pill>관찰된 행동</Pill><Text style={[u.section, { marginTop: 14 }]}>{finding.observation}</Text><Text style={[u.body, { marginTop: 10 }]}>{finding.interpretation}</Text><View style={s.evidence}><Icon name="document-text-outline" size={17} /><Text style={[u.body, { flex: 1, fontSize: 13 }]}>{finding.evidence}</Text></View><Text style={[u.small, { marginBottom: 6 }]}>도와줄 방법</Text><Text style={u.body}>{finding.suggestedSupport}</Text></Card>)}
    <AlertMessage message="게임 안에서 관찰된 행동에 대한 분석이에요. 의료적 진단이나 장애 정도를 판단하는 결과가 아니에요." />
  </View>;
}

export function ReportDetail({ report, onClose }: { report: Report; onClose: () => void }) {
  const [tab, setTab] = useState<'summary' | 'route'>('summary');
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}><View style={s.backdrop}><View accessibilityViewIsModal style={s.dialog}>
    <View style={[u.row, { padding: 22, borderBottomWidth: 1, borderColor: c.line, justifyContent: 'space-between' }]}><View style={{ flex: 1, gap: 4 }}><Text style={u.small}>{dateLabel(report.completedAt, true)} · {gameLabel[report.game]}</Text><Text accessibilityRole="header" style={u.section}>{report.title}</Text></View><Button compact label="상세 닫기" icon="close" tone="plain" onPress={onClose} /></View>
    <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }} keyboardShouldPersistTaps="handled">
      {report.source === 'demo' && <Pill tone="amber">가상 시연 기록 · 실제 이용자 분석 아님</Pill>}
      <View style={[u.row, { gap: 8 }]}>{(['summary', 'route'] as const).map(t => <Button key={t} compact label={t === 'summary' ? '수행 요약' : '이동 경로'} tone={tab === t ? 'green' : 'light'} onPress={() => setTab(t)} />)}</View>
      {tab === 'route' ? report.route ? <RouteReview route={report.route} /> : <Empty title="이 기록에는 이동 경로가 없어요" body="경로가 저장된 장보기 기록에서 이동과 행동 위치를 볼 수 있어요." /> : <>
        <View style={[u.row, { gap: 8, flexWrap: 'wrap' }]}><Pill>{time(report.durationSeconds)} 연습</Pill><Pill tone="gray">도움 사용 {report.supportCount}회</Pill><Pill tone={report.analysisStatus === 'ready' ? 'green' : 'amber'}>{report.analysisStatus === 'ready' ? '분석 완료' : report.analysisStatus === 'pending' ? '분석 준비 중' : '분석 확인 필요'}</Pill></View>
        <Text style={[u.section, { fontSize: 21, lineHeight: 33 }]}>{report.summary || '아직 분석 요약이 준비되지 않았어요.'}</Text><Text style={u.body}>{report.conditions}</Text>
        <View style={{ gap: 12 }}><Text style={u.section}>연습 목표</Text>{report.objectives.map((o, i) => <View key={i} style={[u.row, { gap: 10 }]}><Icon name={o.achieved ? 'checkmark-circle' : 'ellipse-outline'} size={19} color={o.achieved ? c.green : c.muted} /><Text style={u.body}>{o.label} {o.quantity}{o.unit}</Text></View>)}</View>
        {report.findings.map(finding => <View key={finding.id} style={s.finding}><Text style={u.section}>{finding.observation}</Text><Text style={u.body}>{finding.interpretation}</Text><View style={s.evidence}><Icon name="document-text-outline" size={17} /><Text style={[u.body, { flex: 1 }]}>{finding.evidence}</Text></View><Text style={{ fontFamily: f.bold, color: c.green, fontSize: 13 }}>이렇게 도와주세요</Text><Text style={u.body}>{finding.suggestedSupport}</Text>{finding.alternativeExplanations.map((explanation, i) => <Text key={i} style={u.small}>함께 고려할 점 · {explanation}</Text>)}</View>)}
        {report.nextPractice && <View style={s.practice}><Text style={u.section}>다음 연습 제안</Text><Text style={u.body}>{report.nextPractice}</Text></View>}
        {!!report.uncertainties.length && <View style={{ gap: 6 }}><Text style={[u.small, { fontFamily: f.bold }]}>분석을 읽을 때 참고해 주세요</Text>{report.uncertainties.map((v, i) => <Text key={i} style={u.small}>· {v}</Text>)}</View>}
        {report.analysisCreatedAt && <Text style={u.small}>분석 시각 · {dateLabel(report.analysisCreatedAt, true)}</Text>}
      </>}
    </ScrollView>
  </View></View></Modal>;
}

export function ChildPicker({ children, selectedId, onSelect, onClose }: { children: Child[]; selectedId: string; onSelect: (id: string) => void; onClose: () => void }) {
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}><View style={s.backdrop}><View accessibilityViewIsModal style={[s.dialog, { maxWidth: 420, padding: 24, gap: 16 }]}><Text accessibilityRole="header" style={u.section}>누구의 기록을 볼까요?</Text><ScrollView contentContainerStyle={{ gap: 10 }}>{children.map(child => <Pressable key={child.id} accessibilityRole="button" accessibilityLabel={`${child.name} 기록 선택`} accessibilityState={{ selected: child.id === selectedId }} onPress={() => onSelect(child.id)} style={[u.row, { gap: 12, padding: 16, borderRadius: 14, backgroundColor: child.id === selectedId ? c.pale : '#F7F8F4' }]}><View style={[u.iconTile, { backgroundColor: child.color }]}><Text style={{ fontFamily: f.bold, fontSize: 19, color: c.green }}>{child.initials}</Text></View><Text style={[u.section, { flex: 1, fontSize: 16 }]}>{child.name}</Text>{child.id === selectedId && <Icon name="checkmark-circle" />}</Pressable>)}</ScrollView><Button label="선택 창 닫기" tone="plain" onPress={onClose} /></View></View></Modal>;
}
const s = StyleSheet.create({
  label: { fontFamily: f.medium, fontSize: 13, color: c.ink, marginBottom: 8 },
  hero: { backgroundColor: '#EDF1E6', borderRadius: 22, padding: 28, gap: 20, overflow: 'hidden' },
  plantCircle: { width: 112, height: 112, borderRadius: 56, backgroundColor: '#E1E9D8', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#D4DFC8' },
  reportRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 17, borderBottomWidth: 1, borderBottomColor: '#EDF0E8', borderRadius: 4 },
  evidence: { marginVertical: 14, backgroundColor: '#F3F6EF', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  backdrop: { flex: 1, backgroundColor: 'rgba(27,43,34,.4)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  dialog: { width: '100%', maxWidth: 800, maxHeight: '92%', borderRadius: 24, backgroundColor: c.paper, overflow: 'hidden' },
  finding: { paddingTop: 20, borderTopWidth: 1, borderColor: c.line, gap: 10 },
  practice: { backgroundColor: c.pale, borderRadius: 16, padding: 18, gap: 10 },
});
