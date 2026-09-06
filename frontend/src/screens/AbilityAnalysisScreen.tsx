import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  getCurrentUserProfile, refreshCurrentUserProfile, type AiUserProfileResponse,
} from '../api/behaviorAnalysis';
import { PressScale } from '../components/PressScale';
import { BrandHeader } from '../components/ui';
import { colors, fonts } from '../theme';

const judgmentCopy = { SUCCESS: '성공으로 해석', FAILURE: '실패로 해석', UNDETERMINED: '판단 보류' };

export function AbilityAnalysisScreen({ accessToken }: { accessToken: string | null }) {
  const [result, setResult] = useState<AiUserProfileResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);
  const requestId = useRef(0);
  const tokenRef = useRef(accessToken);
  tokenRef.current = accessToken;

  useEffect(() => {
    const id = ++requestId.current;
    setResult(null); setError(null); setShowEvidence(false);
    if (!accessToken) { setLoading(false); return; }
    setLoading(true);
    getCurrentUserProfile(accessToken).then((value) => {
      if (requestId.current === id && tokenRef.current === accessToken) setResult(value);
    }).catch(() => {
      if (requestId.current === id && tokenRef.current === accessToken) setError('분석 기록을 불러오지 못했어요.');
    }).finally(() => {
      if (requestId.current === id && tokenRef.current === accessToken) setLoading(false);
    });
    return () => { requestId.current++; };
  }, [accessToken]);

  async function refreshProfile() {
    if (!accessToken || loading) return;
    const id = ++requestId.current;
    setLoading(true); setError(null); setResult(null);
    try {
      const next = await refreshCurrentUserProfile(accessToken);
      if (requestId.current === id && tokenRef.current === accessToken) setResult(next);
    } catch {
      if (requestId.current === id && tokenRef.current === accessToken) setError('사용자 프로필을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      if (requestId.current === id && tokenRef.current === accessToken) setLoading(false);
    }
  }

  const analysis = result?.status === 'READY' ? result.profile : null;
  return (
    <View style={styles.root}>
      <BrandHeader />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>나의 행동 분석</Text>
        <Text style={styles.note}>새 플레이가 끝날 때 AI가 직전 프로필과 그 플레이 기록만 합쳐 갱신해요. 의료 진단이나 확정된 능력 평가가 아니에요.</Text>
        {!accessToken ? <Text style={styles.body}>로그인하면 나의 행동 분석을 볼 수 있어요.</Text> : (
          <>
            <PressScale accessibilityRole="button" disabled={loading} onPress={() => void refreshProfile()} style={styles.button}>
              <Text style={styles.buttonText}>{loading ? '최신 플레이 반영 중…' : '최신 플레이 반영하기'}</Text>
            </PressScale>
            {loading ? <ActivityIndicator accessibilityLabel="사용자 프로필 로딩" color={colors.mint} /> : null}
            {error ? <Text accessibilityRole="alert" style={styles.body}>{error}</Text> : null}
            {!loading && !error && !result ? <Text style={styles.body}>아직 누적 프로필이 없어요. 장보기 연습을 한 번 완료해 주세요.</Text> : null}
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
                    <Text style={styles.label}>다른 가능한 설명</Text>
                    {finding.alternativeExplanations.map((item, i) => <Text key={i} style={styles.body}>{item}</Text>)}
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
