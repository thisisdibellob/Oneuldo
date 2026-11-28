import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { ApiError, createGuardianApi } from './src/api';
import { createDemoData } from './src/demo';
import { dateLabel, gameLabel, reportsFor, type AuthSession, type GuardianData, type Report } from './src/domain';
import { Brand, ChildPicker, Insights, LoginScreen, Overview, ReportDetail, ReportRow } from './src/screens';
import { AlertMessage, Button, Card, Empty, Icon, Pill, SectionTitle, type IconName, u } from './src/ui';
import { c, f } from './src/theme';

const tabs = [
  { id: 'home', label: '대시보드', icon: 'grid-outline' },
  { id: 'records', label: '훈련 기록', icon: 'calendar-outline' },
  { id: 'insights', label: '분석 보기', icon: 'bar-chart-outline' },
  { id: 'settings', label: '가족 · 설정', icon: 'people-outline' },
] as const;
type Tab = typeof tabs[number]['id'];
const blank: GuardianData = { children: [], reports: [], updatedAt: '' };

export default function App() {
  const [loaded, error] = useFonts({
    Pretendard: require('./assets/fonts/Pretendard-Regular.otf'),
    'Pretendard-Medium': require('./assets/fonts/Pretendard-Medium.otf'),
    'Pretendard-Bold': require('./assets/fonts/Pretendard-Bold.otf'),
  });
  return <SafeAreaProvider><StatusBar style="dark" />{loaded || error ? <GuardianApp /> : <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={c.green} /><Text style={{ color: c.green, marginTop: 12 }}>오늘도 함께 준비하고 있어요</Text></View>}</SafeAreaProvider>;
}

export function GuardianApp() {
  const { width } = useWindowDimensions(), wide = width >= 1024, inset = useSafeAreaInsets();
  const api = useMemo(() => createGuardianApi(process.env.EXPO_PUBLIC_GUARDIAN_API_URL ?? ''), []);
  const [mode, setMode] = useState<'demo' | 'live' | null>(null), [auth, setAuth] = useState<AuthSession | null>(null), [data, setData] = useState<GuardianData | null>(null);
  const [tab, setTab] = useState<Tab>('home'), [childId, setChildId] = useState(''), [period, setPeriod] = useState(7), [game, setGame] = useState('all');
  const [report, setReport] = useState<Report | null>(null), [picker, setPicker] = useState(false), [privacy, setPrivacy] = useState(false), [unlinkId, setUnlinkId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [code, setCode] = useState('');
  const requestVersion = useRef(0), scrollRef = useRef<ScrollView>(null), authRef = useRef(auth); authRef.current = auth;
  const resetViews = () => { setReport(null); setPicker(false); setPrivacy(false); setUnlinkId(null); setCode(''); setNotice(''); setGame('all'); };
  const store = (next: GuardianData) => { setData(next); setChildId(old => next.children.some(c => c.id === old) ? old : next.children[0]?.id ?? ''); };
  const logout = () => {
    const previous = authRef.current; requestVersion.current++; setAuth(null); setMode(null); setData(null); setBusy(false); setError(''); setTab('home'); setChildId(''); resetViews();
    if (previous) void api.logout(previous.accessToken).catch(() => { /* Local credentials have already been discarded. */ });
  };
  useEffect(() => { if (!auth) return; const expiry = setTimeout(logout, Math.max(0, auth.expiresAt - Date.now())); return () => clearTimeout(expiry); }, [auth]);
  useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (report) { setReport(null); return true; } if (picker) { setPicker(false); return true; } if (tab !== 'home') { setTab('home'); return true; } return false; }); return () => sub.remove(); }, [report, picker, tab]);
  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [tab, childId]);

  const load = async (session: AuthSession) => {
    const version = ++requestVersion.current; setBusy(true); setError(''); setData(null); setReport(null);
    try { const next = await api.load(session.accessToken); if (requestVersion.current === version) store(next); }
    catch (e) { if (requestVersion.current !== version) return; if (e instanceof ApiError && e.status === 401) { logout(); setError(e.message); } else setError(e instanceof Error ? e.message : '기록을 가져오지 못했어요.'); }
    finally { if (requestVersion.current === version) setBusy(false); }
  };
  const login = async (email: string, password: string) => {
    if (busy) return; const version = ++requestVersion.current; setBusy(true); setError('');
    try { const session = await api.login(email, password); if (version !== requestVersion.current) return; setAuth(session); setMode('live'); setBusy(false); await load(session); }
    catch (e) { if (version === requestVersion.current) { setError(e instanceof Error ? e.message : '로그인하지 못했어요.'); setBusy(false); } }
  };
  const demo = () => { requestVersion.current++; setMode('demo'); setAuth(null); store(createDemoData()); setTab('home'); setError(''); resetViews(); };
  const refresh = () => { if (mode === 'demo') { setData(d => d ? { ...d, updatedAt: new Date().toISOString() } : d); setNotice('시연 기록을 확인했어요. 실제 서버에 요청하지 않았어요.'); } else if (auth) void load(auth); };
  const link = async () => {
    const normalized = code.trim().toUpperCase(); if (!/^[A-Z0-9]{8}$/.test(normalized)) { setError('영문과 숫자로 된 8자리 연결 코드를 입력해 주세요.'); return; }
    setBusy(true); setError(''); setNotice(''); const version = ++requestVersion.current;
    try {
      if (mode === 'demo') {
        if (normalized !== 'DEMO2026') throw new ApiError('시연에서는 DEMO2026 코드를 사용해 주세요.');
        if (data?.children.some(c => c.id === 'demo-seojun')) throw new ApiError('시연 자녀가 이미 연결되어 있어요.');
        setData(d => d && { ...d, children: [...d.children, { id: 'demo-seojun', name: '서준', initials: '서', color: '#E3EBF0', linkedAt: new Date().toISOString() }] });
      } else if (auth) { await api.link(auth.accessToken, normalized); const next = await api.load(auth.accessToken); if (version !== requestVersion.current) return; store(next); }
      if (version === requestVersion.current) { setCode(''); setNotice(mode === 'demo' ? '가상의 시연 자녀를 연결했어요. 실제 계정은 변경하지 않았어요.' : '자녀가 연결됐어요.'); }
    } catch (e) { if (version === requestVersion.current) { if (e instanceof ApiError && e.status === 401) { logout(); } setError(e instanceof Error ? e.message : '연결하지 못했어요.'); } }
    finally { if (version === requestVersion.current) setBusy(false); }
  };
  const unlink = async () => {
    if (!unlinkId) return; setBusy(true); setError(''); const id = unlinkId, version = ++requestVersion.current;
    try { if (mode === 'live' && auth) await api.unlink(auth.accessToken, id); if (version !== requestVersion.current) return; const next = { ...(data ?? blank), children: (data?.children ?? []).filter(c => c.id !== id), reports: (data?.reports ?? []).filter(r => r.childId !== id) }; store(next); setReport(null); setUnlinkId(null); setNotice('보호자 연결을 해제했어요. 게임의 원본 기록은 삭제하지 않았어요.'); }
    catch (e) { if (version === requestVersion.current) { if (e instanceof ApiError && e.status === 401) logout(); setError(e instanceof Error ? e.message : '연결을 해제하지 못했어요.'); } }
    finally { if (version === requestVersion.current) setBusy(false); }
  };
  if (!mode) return <LoginScreen onLogin={login} onDemo={demo} busy={busy} error={error} wide={wide} />;
  const currentData = data ?? blank, child = currentData.children.find(c => c.id === childId), all = reportsFor(currentData, childId, period), shown = game === 'all' ? all : all.filter(r => r.game === game);
  const navigate = (next: Tab) => { setTab(next); setNotice(''); setError(''); };
  return <View style={{ flex: 1, backgroundColor: c.bg, flexDirection: 'row', paddingTop: inset.top }}>
    {wide && <View style={s.sidebar}><Brand small /><View style={{ height: 40 }} /><Text style={[u.small, { paddingLeft: 14, marginBottom: 12 }]}>우리 가족의 연습</Text>{tabs.map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: tab === item.id }} onPress={() => navigate(item.id)} style={[s.sideTab, tab === item.id && { backgroundColor: c.pale }]}><Icon name={item.icon} color={tab === item.id ? c.green : c.muted} /><Text style={{ fontFamily: tab === item.id ? f.bold : f.medium, fontSize: 14, color: tab === item.id ? c.green : c.sub }}>{item.label}</Text></Pressable>)}<View style={{ flex: 1 }} /><View style={s.sideNote}><Icon name="heart-outline" size={21} /><Text style={[u.body, { fontSize: 12 }]}>서두르지 않아도 괜찮아요.{ '\n' }한 번의 결과보다{ '\n' }연습의 과정을 함께 봐요.</Text></View><Text style={[u.small, { marginTop: 20 }]}>오늘도 함께 · 보호자 앱</Text></View>}
    <View style={{ flex: 1, minWidth: 0 }}>
      <View style={[s.header, { paddingHorizontal: wide ? 36 : 18 }]}>{wide ? <Text style={[u.body, { flex: 1 }]}>안녕하세요, {mode === 'demo' ? '보호자' : auth?.name}님</Text> : <View style={{ flex: 1 }}><Brand small /></View>}
        {child && <Pressable accessibilityRole="button" accessibilityLabel="자녀 선택" onPress={() => setPicker(true)} style={[u.row, { gap: 8, padding: 8, borderRadius: 12, backgroundColor: '#F4F6EF' }]}><View style={{ width: 28, height: 28, borderRadius: 10, backgroundColor: child.color, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontFamily: f.bold, color: c.green, fontSize: 13 }}>{child.initials}</Text></View><Text style={{ fontFamily: f.bold, fontSize: 13, color: c.ink }}>{child.name}</Text><Icon name="chevron-down" size={14} /></Pressable>}
      </View>
      <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: wide ? 36 : 18, paddingBottom: wide ? 50 : 100 + inset.bottom, maxWidth: 1240, width: '100%', alignSelf: 'center', gap: 22 }}>
        {mode === 'demo' && <View style={[u.row, { padding: 12, gap: 8, backgroundColor: '#F4EBDA', borderRadius: 12, flexWrap: 'wrap' }]}><Pill tone="amber">시연 모드</Pill><Text style={[u.small, { color: c.amber, flex: 1, minWidth: 140 }]}>가상의 가족과 예시 기록이에요.</Text><Pressable accessibilityRole="button" accessibilityLabel="시연 종료" onPress={logout} style={{ minHeight: 32, justifyContent: 'center' }}><Text style={{ fontFamily: f.bold, fontSize: 12, color: c.amber }}>종료</Text></Pressable></View>}
        <View style={[u.row, { justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }]}><View><Text accessibilityRole="header" style={{ fontFamily: f.bold, color: c.ink, fontSize: wide ? 28 : 25, lineHeight: 38, letterSpacing: -.8 }}>{tabs.find(t => t.id === tab)?.label}</Text><Text style={u.small}>{tab === 'settings' ? '가족 연결과 계정 정보를 관리해요.' : child ? `${child.name}님의 연습 과정을 살펴봐요.` : '자녀를 연결하고 연습 기록을 확인해요.'}</Text></View>{tab !== 'settings' && <View style={[u.row, { borderRadius: 10, backgroundColor: '#E9EDE3', padding: 4 }]}>{[7, 30].map(d => <Pressable key={d} accessibilityRole="button" accessibilityLabel={`최근 ${d}일`} accessibilityState={{ selected: period === d }} onPress={() => setPeriod(d)} style={{ minHeight: 34, paddingHorizontal: 13, justifyContent: 'center', backgroundColor: period === d ? c.paper : 'transparent', borderRadius: 7 }}><Text style={{ fontFamily: period === d ? f.bold : f.medium, color: period === d ? c.green : c.sub, fontSize: 12 }}>{d}일</Text></Pressable>)}</View>}</View>
        {!!error && <AlertMessage message={error} />}{!!notice && <AlertMessage message={notice} />}
        {busy && !data ? <Card><ActivityIndicator color={c.green} /><Text style={[u.body, { textAlign: 'center', marginTop: 12 }]}>가족의 기록을 불러오고 있어요.</Text></Card> : !data ? <Card><Empty title="기록을 불러오지 못했어요" body={error || '서버 연결 상태를 확인해 주세요.'} action={<Button label="다시 불러오기" onPress={refresh} />} /><Button label="로그아웃" tone="plain" onPress={logout} /></Card> : tab === 'settings' ? <>
          <Card><SectionTitle title="연결된 가족" subtitle="선택한 자녀의 기록만 화면에 표시해요." />{currentData.children.length ? currentData.children.map(item => <View key={item.id} style={[u.row, { paddingVertical: 14, borderBottomWidth: 1, borderColor: c.line, gap: 12 }]}><View style={[u.iconTile, { backgroundColor: item.color }]}><Text style={{ fontFamily: f.bold, fontSize: 19, color: c.green }}>{item.initials}</Text></View><View style={{ flex: 1 }}><Text style={u.section}>{item.name}</Text><Text style={u.small}>{dateLabel(item.linkedAt)} 연결</Text></View><Button compact label={`${item.name} 연결 해제`} tone="plain" onPress={() => setUnlinkId(item.id)} /></View>) : <Text style={u.body}>아직 연결된 자녀가 없어요.</Text>}</Card>
          <Card><SectionTitle title="자녀 연결하기" subtitle="자녀 계정에서 발급하고 공유를 승인한 연결 코드를 입력해 주세요." /><TextInput accessibilityLabel="자녀 연결 코드" value={code} onChangeText={v => { setCode(v.toUpperCase()); setError(''); }} placeholder="8자리 연결 코드" placeholderTextColor={c.muted} autoCapitalize="characters" autoCorrect={false} maxLength={8} style={[u.input, { marginBottom: 12 }]} />{mode === 'demo' && <Text style={[u.small, { marginBottom: 12 }]}>시연 연결 코드: DEMO2026</Text>}<Button label="자녀 연결하기" onPress={() => void link()} busy={busy} disabled={code.trim().length !== 8} /></Card>
          <Card><SectionTitle title="계정과 데이터" /><Text style={[u.body, { marginBottom: 16 }]}>{mode === 'demo' ? '시연용 보호자 계정' : auth?.name}</Text><View style={{ gap: 10 }}><Button label="데이터 안내" tone="light" icon="shield-checkmark-outline" onPress={() => setPrivacy(true)} /><Button label="기록 새로고침" tone="light" icon="refresh-outline" onPress={refresh} busy={busy} /><Button label="로그아웃" tone="plain" onPress={logout} /></View></Card>
        </> : !child ? <Card><Empty title="첫 자녀를 연결해 주세요" body="가족 · 설정에서 연결 코드를 입력하면 자녀의 훈련 기록을 확인할 수 있어요." action={<Button label="가족 연결로 이동" onPress={() => navigate('settings')} />} /></Card> : tab === 'home' ? <Overview child={child} reports={all} wide={wide} onReport={setReport} onRecords={() => navigate('records')} /> : tab === 'insights' ? <Insights reports={all} onReport={setReport} /> : <Card><SectionTitle title="하루하루 쌓인 연습" subtitle={`최근 ${period}일 · ${shown.length}개의 기록`} /><View style={[u.row, { flexWrap: 'wrap', gap: 8, marginBottom: 14 }]}>{['all', 'market', 'bus', 'library'].map(k => <Button compact key={k} label={k === 'all' ? '전체' : gameLabel[k as keyof typeof gameLabel]} tone={game === k ? 'green' : 'light'} onPress={() => setGame(k)} />)}</View>{shown.length ? shown.map(r => <ReportRow key={r.id} report={r} onPress={() => setReport(r)} />) : <Empty title="이 기간에는 기록이 없어요" body="다른 기간이나 훈련 종류를 선택해 보세요." />}</Card>}
        {data && <View style={{ gap: 6 }}><Text style={u.small}>마지막 확인 · {dateLabel(data.updatedAt, true)}</Text><Text style={u.small}>훈련 기록을 바탕으로 한 참고 정보이며, 의료적 진단 결과가 아니에요.</Text></View>}
      </ScrollView>
      {!wide && <View style={[s.bottomNav, { paddingBottom: Math.max(12, inset.bottom) }]}>{tabs.map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: tab === item.id }} onPress={() => navigate(item.id)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48, gap: 5 }}><Icon name={item.icon} size={21} color={tab === item.id ? c.green : c.muted} /><Text style={{ fontFamily: tab === item.id ? f.bold : f.medium, color: tab === item.id ? c.green : c.muted, fontSize: 10 }}>{item.label}</Text></Pressable>)}</View>}
    </View>
    {picker && <ChildPicker children={currentData.children} selectedId={childId} onSelect={id => { setChildId(id); setPicker(false); setReport(null); setNotice(''); }} onClose={() => setPicker(false)} />}
    {report && <ReportDetail key={report.id} report={report} onClose={() => setReport(null)} />}
    {(privacy || unlinkId) && <Modal transparent visible animationType="fade" onRequestClose={() => { if (!busy) { setPrivacy(false); setUnlinkId(null); } }}><View style={s.backdrop}><Card style={{ width: '100%', maxWidth: 460, maxHeight: '85%' }}><ScrollView contentContainerStyle={{ gap: 16 }}><Text accessibilityRole="header" style={u.section}>{privacy ? '데이터 안내' : '자녀 연결을 해제할까요?'}</Text><Text style={u.body}>{privacy ? '연결된 자녀의 훈련 기록만 조회해요. 로그인 정보는 앱을 사용하는 동안 메모리에만 보관하며, 비밀번호는 저장하지 않아요. 앱을 완전히 닫으면 다시 로그인해야 해요. 연결 해제는 보호자의 조회 연결을 끊으며 게임의 원본 기록을 삭제하지 않아요.' : '이 보호자 앱에서 해당 자녀의 기록을 더 이상 조회할 수 없어요. 다시 보려면 새 연결 절차가 필요해요. 게임의 원본 기록은 삭제되지 않아요.'}</Text>{privacy ? <Button label="안내 닫기" onPress={() => setPrivacy(false)} /> : <><Button label="연결 해제 확인" tone="danger" busy={busy} onPress={() => void unlink()} /><Button label="취소" tone="plain" disabled={busy} onPress={() => setUnlinkId(null)} /></>}</ScrollView></Card></View></Modal>}
  </View>;
}
const s = StyleSheet.create({
  sidebar: { width: 232, borderRightWidth: 1, borderColor: c.line, backgroundColor: '#FDFEFA', padding: 24, paddingTop: 32 },
  sideTab: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, marginBottom: 6 },
  sideNote: { padding: 15, borderRadius: 14, backgroundColor: '#F1F4EB', gap: 12 },
  header: { minHeight: 78, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: 1, borderColor: c.line, backgroundColor: '#FDFEFA' },
  bottomNav: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', backgroundColor: '#FFFFFF', paddingTop: 10, borderTopWidth: 1, borderColor: c.line },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(27,43,34,.4)', padding: 20 },
});
