import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  getCurrentUserProfile, getCurrentAnalysisJob, startLatestAnalysisJob, type AiUserProfileResponse, type AnalysisJob,
} from '../api/behaviorAnalysis';
import { PressScale } from '../components/PressScale';
import { BrandHeader } from '../components/ui';
import { colors, fonts } from '../theme';

const judgmentCopy = { SUCCESS: '성공으로 해석', FAILURE: '실패로 해석', UNDETERMINED: '판단 보류' };

export function AbilityAnalysisScreen({ accessToken }: { accessToken: string | null }) {
  const [result, setResult] = useState<AiUserProfileResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<AnalysisJob | null>(null);
  const [revision, setRevision] = useState(0);
  const active = job?.status === 'QUEUED' || job?.status === 'RUNNING';
  const [showEvidence, setShowEvidence] = useState(false);
  const requestId = useRef(0);
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;

  useEffect(() => { setResult(null); setJob(null); setError(null); setShowEvidence(false); }, [accessToken]);
  useEffect(() => {
    const id = ++requestId.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let pollNumber = 0;
    if (!accessToken) { setLoading(false); return; }
    const valid = () => !disposed && requestId.current === id && tokenRef.current === accessToken;
    const poll = async () => {
      const number = ++pollNumber;
      const currentPoll = () => valid() && number === pollNumber;
      clearTimeout(timer);
      try {
        const nextJob = await getCurrentAnalysisJob(accessToken);
        if (!currentPoll()) return;
        // READY is written after the profile commits; read the profile after that status.
        const profile = await getCurrentUserProfile(accessToken);
        if (!currentPoll()) return;
        setResult(profile); setJob(nextJob); setError(null);
        if (nextJob?.status === 'QUEUED' || nextJob?.status === 'RUNNING') timer = setTimeout(poll, 3000);
      } catch {
        if (currentPoll()) {
          setError('서버 연결을 확인하고 있어요. 저장된 분석은 유지됩니다.');
          timer = setTimeout(poll, 5000);
        }
      } finally { if (currentPoll()) setLoading(false); }
    };
    setLoading(true); void poll();
    const listener = AppState.addEventListener('change', state => { if (state === 'active' && valid()) void poll(); });
    return () => { disposed = true; clearTimeout(timer); listener.remove(); requestId.current++; };
  }, [accessToken, revision]);

  async function refreshProfile() {
    if (!accessToken || loading || active) return;
    const token = accessToken;
    setLoading(true); setError(null);
    try {
      const next = await startLatestAnalysisJob(token);
      if (tokenRef.current === token) { setJob(next); setRevision(value => value + 1); }
    } catch (error) {
      if (tokenRef.current === token) setError(error instanceof Error ? error.message : '분석을 접수하지 못했어요.');
    } finally { if (tokenRef.current === token) setLoading(false); }
  }

  const stages: Record<string, string> = { QUEUED: '분석 순서를 기다리고 있어요.', PREPARING: '분석 기록을 준비하고 있어요.',
    OBSERVING: '플레이 구간을 분석하고 있어요.', REDUCING: '구간 결과를 정리하고 있어요.', FINALIZING: '최종 분석을 작성하고 있어요.', REVIEWING: '원본과 분석 결과를 대조하고 있어요.',
    PROFILE: '누적 프로필에 반영하고 있어요.', RECOVERING: '저장한 지점부터 다시 처리하고 있어요.' };
  const jobErrors: Record<string, string> = {
    AI_CONNECT_TIMEOUT: 'AI 서버에 연결하지 못했어요. 연결 상태를 확인한 뒤 다시 시도해 주세요.',
    AI_CONNECT_FAILED: 'AI 서버 연결이 거절됐어요. 잠시 후 다시 시도해 주세요.',
    AI_DNS_FAILED: 'AI 서버 주소를 찾지 못했어요.',
    AI_TLS_FAILED: 'AI 서버의 보안 연결을 확인하지 못했어요.',
    AI_RESPONSE_TIMEOUT: 'AI 응답 대기 시간이 지났어요. 서버에서 처리 중일 수 있어요.',
    AI_AUTH_FAILED: 'AI 서버 인증에 실패했어요. 관리자에게 연결 설정 확인을 요청해 주세요.',
    AI_SERVER_ERROR: 'AI 서버에서 오류가 발생했어요.',
    AI_REQUEST_REJECTED: 'AI 서버가 요청을 받아들이지 못했어요.',
    AI_TRANSPORT_ERROR: 'AI 서버와 통신이 중단됐어요.',
    AI_INVALID_RESPONSE: 'AI 서버에서 완성된 응답을 받지 못했어요.',
    AI_QUEUE_FULL: 'AI 요청이 많아요. 잠시 후 다시 시도해 주세요.',
    AI_QUEUE_TIMEOUT: 'AI 처리 순서를 기다리는 시간이 초과됐어요.',
    AI_INTERRUPTED: 'AI 요청 처리가 중단됐어요.',
    AI_RATE_LIMITED: 'AI 서비스의 사용 한도에 도달했어요.',
    OUTPUT_TRUNCATED: 'AI 응답이 끝까지 작성되지 않았어요.',
    INVALID_AI_ANALYSIS: 'AI 응답의 형식이나 근거를 확인하지 못했어요.',
    FINAL_EVIDENCE_EXCEEDS_LIMIT: '통합할 근거의 양이 처리 한도를 넘었어요.',
    PROFILE_UPDATE_FAILED: '플레이 분석은 저장했지만 누적 프로필 반영을 완료하지 못했어요.',
  };
  const analysis = result?.status === 'READY' ? result.profile : null;
  return (
    <View style={styles.root}>
      <BrandHeader />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>나의 행동 분석</Text>
        <Text style={styles.note}>새 플레이가 끝날 때 AI가 직전 프로필과 그 플레이 기록만 합쳐 갱신해요. 의료 진단이나 확정된 능력 평가가 아니에요.</Text>
        {!accessToken ? <Text style={styles.body}>로그인하면 나의 행동 분석을 볼 수 있어요.</Text> : (
          <>
            <PressScale accessibilityRole="button" disabled={loading || active} onPress={() => void refreshProfile()} style={styles.button}>
              <Text style={styles.buttonText}>{active ? '최신 플레이 반영 중…' : loading ? '기록 확인 중…' : '최신 플레이 반영하기'}</Text>
            </PressScale>
            {loading || active ? <ActivityIndicator accessibilityLabel="사용자 프로필 로딩" color={colors.mint} /> : null}
            {active && job ? <View accessibilityLiveRegion="polite" style={styles.card}>
              <Text style={styles.body}>{stages[job.stage] ?? '분석 중이에요.'}</Text>
              {job.total > 0 ? <Text style={styles.note}>{job.total}개 {job.stage === 'PREPARING' ? '기록 중' : '구간 중'} {job.completed}개 {job.stage === 'PREPARING' ? '준비' : '완료'}</Text> : null}
              {job.waitUntil && Date.parse(job.waitUntil) > Date.now() ? <Text style={styles.note}>AI 호출 한도 대기 중 · 약 {Math.ceil((Date.parse(job.waitUntil) - Date.now()) / 1000)}초 후 재개</Text> : null}
              <Text style={styles.note}>앱을 닫아도 서버에서 계속 진행해요. 완료 전까지 이전 프로필을 볼 수 있어요.</Text>
            </View> : null}
            {job?.status === 'FAILED' ? <Text accessibilityRole="alert" style={styles.body}>최근 분석을 완료하지 못했어요. {jobErrors[job.errorCode ?? ''] ?? '잠시 후 다시 시도해 주세요.'} 이전 프로필은 유지됩니다. 최신 플레이 반영하기로 다시 시도할 수 있어요.</Text> : null}
            {error ? <Text accessibilityRole="alert" style={styles.body}>{error}</Text> : null}
            {!loading && !active && !error && !result ? <Text style={styles.body}>아직 누적 프로필이 없어요. 장보기 연습을 한 번 완료해 주세요.</Text> : null}
            {result && result.status !== 'READY' ? <Text style={styles.body}>최근 프로필 갱신에 실패했어요. 이전에 완료된 프로필은 유지돼요.</Text> : null}
            {analysis && result ? (
              <>
                <View style={styles.card}>
                  <Text style={styles.heading}>AI 누적 프로필</Text>
                  <Text style={styles.body}>{analysis.summary}</Text>
                  <Text style={styles.note}>프로필 버전 {result.profileVersion} · 최근 갱신 {(result.latencyMs / 1000).toFixed(1)}초</Text>
                  <Text selectable style={styles.note}>프롬프트: {result.promptVersion} · 사용한 카드: {analysis.usedEvidenceCardIds?.join(', ') || '없음'}</Text>
                  <Text style={styles.note}>{new Date(result.createdAt).toLocaleString()} · {result.model}</Text>
                </View>
                {analysis.findings.map((finding) => (
                  <View key={finding.id} style={styles.card}>
                    <Text style={styles.heading}>{finding.skill}</Text>
                    <Text style={styles.label}>관찰한 행동</Text><Text style={styles.body}>{finding.observation}</Text>
                    <Text style={styles.label}>AI의 해석 · 확인이 필요한 가설</Text><Text style={styles.body}>{finding.interpretation}</Text>
                    {finding.alternativeExplanations.length > 0 ? (
                      <>
                        <Text style={styles.label}>다른 가능한 설명</Text>
                        {finding.alternativeExplanations.map((item, i) => <Text key={i} style={styles.body}>{item}</Text>)}
                      </>
                    ) : null}
                    <Text style={styles.label}>도움이 될 수 있는 지원</Text><Text style={styles.body}>{finding.suggestedSupport}</Text>
                    {showEvidence ? <Text selectable style={styles.note}>근거 이벤트: {finding.evidenceEventIds.join(', ')}</Text> : null}
                  </View>
                ))}
                <View style={styles.card}>
                  <Text style={styles.heading}>다음 연습 목표</Text>
                  <Text style={styles.body}>{analysis.practicePlan.goal}</Text>
                  <Text style={styles.body}>{analysis.practicePlan.rationale}</Text>
                  <Text style={styles.note}>AI 제안 게임 난이도 {analysis.practicePlan.recommendedDifficulty} · 능력 등급이 아니에요</Text>
                </View>
                <View style={styles.card}>
                  <Text style={styles.heading}>아직 알 수 없는 부분</Text>
                  {analysis.uncertainties.map((item, i) => <Text key={i} style={styles.body}>{item}</Text>)}
                  <Text style={styles.note}>접근성 근거 카드 일부를 개발 검토용으로 연결했어요. 전문가·당사자 검증과 모델 추가 학습은 완료되지 않았어요.</Text>
                </View>
                <PressScale accessibilityRole="button" onPress={() => setShowEvidence(!showEvidence)} style={styles.button}>
                  <Text style={styles.buttonText}>{showEvidence ? '판단 근거 접기' : '판단 근거 보기'}</Text>
                </PressScale>
                {showEvidence ? (
                  <View style={styles.card}>
                    <Text style={styles.heading}>세션별 AI 해석</Text>
                    {analysis.sessionAssessments.map((session) => (
                      <View key={session.sessionId}>
                        <Text style={styles.label}>{judgmentCopy[session.judgment]}</Text>
                        <Text style={styles.body}>{session.explanation}</Text>
                        <Text selectable style={styles.note}>세션 {session.sessionId} · 근거 {session.evidenceEventIds.join(', ')}</Text>
                      </View>
                    ))}
                    <Text selectable style={styles.note}>프로필 {result.profileId} / 최근 세션 {result.sourceSessionId} / 분석 {result.sourceAnalysisId}</Text>
                  </View>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.soft },
  content: { padding: 22, paddingBottom: 110, gap: 16 },
  title: { fontFamily: fonts.bold, fontSize: 25, color: colors.ink },
  heading: { fontFamily: fonts.bold, fontSize: 19, color: colors.ink },
  label: { fontFamily: fonts.semibold, fontSize: 14, color: '#456457', marginTop: 8 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 25, color: colors.text },
  note: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 21, color: '#666666' },
  card: { backgroundColor: colors.white, borderRadius: 18, padding: 20, gap: 8 },
  button: { backgroundColor: '#007B59', borderRadius: 14, padding: 15, alignItems: 'center' },
  buttonText: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
});
