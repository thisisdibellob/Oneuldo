import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getLatestAbilityProfile, type AbilityProfileResponse } from '../api/abilityProfile';
import {
  getMarketDifficultyRecommendation,
  type MarketDifficultyRecommendation,
} from '../api/marketPersonalization';
import {
  abilityCopy,
  abilityLevel,
  behaviorEvidenceCopy,
  classifyAbility,
  confidenceLabel,
  independenceLabel,
  type AbilityStatus,
} from '../analysis/abilityAnalysis';
import { PressScale } from '../components/PressScale';
import { BrandHeader } from '../components/ui';
import { colors, fonts } from '../theme';

const TARGET_SKILLS = [
  'LANGUAGE_COMPREHENSION',
  'NUMERACY',
  'MONEY_MANAGEMENT',
];

const STATUS_STYLE: Record<AbilityStatus, {
  color: string;
  background: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = {
  STRENGTH: { background: '#E7F7EE', color: '#27845D', icon: 'sparkles', label: '잘하고 있어요' },
  DEVELOPING: { background: '#FFF5D9', color: '#A46D12', icon: 'trending-up', label: '발달 중이에요' },
  NEEDS_PRACTICE: { background: '#FFF0EC', color: '#C45C42', icon: 'leaf', label: '연습이 필요해요' },
  INSUFFICIENT: { background: '#F1F3F5', color: '#778087', icon: 'ellipsis-horizontal', label: '더 지켜볼게요' },
};

const DIFFICULTY_COPY = {
  1: { color: '#3B8B6A', label: '난이도 1', text: '도움을 충분히 제공하는 단계' },
  2: { color: '#D38A27', label: '난이도 2', text: '현재 능력을 안정적으로 연습하는 단계' },
  3: { color: '#D05D56', label: '난이도 3', text: '혼자 해결하는 범위를 넓히는 단계' },
} as const;

export function AbilityAnalysisScreen({ accessToken }: { accessToken: string | null }) {
  const [profile, setProfile] = useState<AbilityProfileResponse | null>(null);
  const [recommendation, setRecommendation] = useState<MarketDifficultyRecommendation | null>(null);
  const [showAnalyzedBehaviors, setShowAnalyzedBehaviors] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextProfile, nextRecommendation] = await Promise.all([
        getLatestAbilityProfile(accessToken),
        getMarketDifficultyRecommendation(accessToken),
      ]);
      setProfile(nextProfile);
      setRecommendation(nextRecommendation);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '능력 분석을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const skills = useMemo(() => {
    if (!profile) return [];
    return TARGET_SKILLS
      .map((code) => profile.profileData.skills[code])
      .filter((skill) => skill !== undefined);
  }, [profile]);

  if (!accessToken) {
    return <EmptyAnalysis icon="lock-closed-outline" message="로그인하면 나의 능력 분석을 볼 수 있어요." />;
  }

  if (loading) {
    return (
      <View style={styles.root}>
        <BrandHeader />
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.mint} size="large" />
          <Text style={styles.stateText}>최근 수행 기록을 분석하고 있어요</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <EmptyAnalysis
        actionLabel="다시 불러오기"
        icon="cloud-offline-outline"
        message={error}
        onAction={() => void load()}
      />
    );
  }

  if (!profile || skills.length === 0) {
    return (
      <EmptyAnalysis
        actionLabel="새로고침"
        icon="analytics-outline"
        message="아직 판단할 수행 기록이 부족해요. 장보기 퀘스트를 완료하면 여기에 결과가 나타나요."
        onAction={() => void load()}
      />
    );
  }

  const difficulty = DIFFICULTY_COPY[recommendation?.recommendedDifficulty ?? 2];
  const difficultySource = recommendation?.policyVersion === 'market-ai-difficulty-v1'
    ? 'AI 추천 난이도'
    : '전체 추천 난이도';
  const strengthCount = skills.filter((skill) => classifyAbility(skill) === 'STRENGTH').length;
  const practiceCount = skills.filter((skill) => classifyAbility(skill) === 'NEEDS_PRACTICE').length;

  return (
    <View style={styles.root}>
      <BrandHeader />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons color="#FFFFFF" name="analytics" size={24} />
          </View>
          <Text style={styles.eyebrow}>맞춤 능력 분석</Text>
          <Text style={styles.title}>지금 나의 생활 기술</Text>
          <Text style={styles.subtitle}>
            AI가 다음 퀘스트를 만들 때 참고하는 최근 행동 분석 결과예요.
          </Text>
        </View>

        <View style={styles.difficultyCard}>
          <View style={styles.difficultyCopy}>
            <Text style={styles.sectionEyebrow}>{difficultySource}</Text>
            <Text style={styles.difficultyDescription}>{difficulty.text}</Text>
          </View>
          <View style={[styles.difficultyBadge, { backgroundColor: difficulty.color }]}>
            <Text style={styles.difficultyBadgeText}>{difficulty.label}</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <SummaryCard color="#27845D" count={strengthCount} label="강점으로 관찰" />
          <SummaryCard color="#C45C42" count={practiceCount} label="연습 필요" />
          <SummaryCard
            color="#65777C"
            count={profile.inputEventCount}
            label="분석한 행동"
            onPress={() => setShowAnalyzedBehaviors((visible) => !visible)}
            open={showAnalyzedBehaviors}
          />
        </View>

        {showAnalyzedBehaviors ? (
          <AnalyzedBehaviorPanel eventCount={profile.inputEventCount} skills={skills} />
        ) : null}

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>능력별 분석</Text>
          <Text style={styles.updatedAt}>{formatUpdatedAt(profile.generatedAt)}</Text>
        </View>

        {skills.map((skill) => {
          const copy = abilityCopy(skill.skillCode);
          const status = classifyAbility(skill);
          const statusStyle = STATUS_STYLE[status];
          const level = abilityLevel(skill);
          const rate = skill.independentSuccessRate;
          return (
            <View accessible accessibilityLabel={`${copy.label}, ${statusStyle.label}`} key={skill.skillCode} style={styles.skillCard}>
              <View style={styles.skillHeader}>
                <View style={[styles.statusIcon, { backgroundColor: statusStyle.background }]}>
                  <Ionicons color={statusStyle.color} name={statusStyle.icon} size={20} />
                </View>
                <View style={styles.skillHeadingCopy}>
                  <Text style={styles.skillName}>{copy.label}</Text>
                  <Text style={[styles.statusLabel, { color: statusStyle.color }]}>{statusStyle.label}</Text>
                </View>
                <View style={styles.levelPill}>
                  <Text style={styles.levelText}>{level ? `Lv.${level}` : '측정 중'}</Text>
                </View>
              </View>
              <Text style={styles.skillDescription}>{copy.description}</Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: statusStyle.color,
                      width: `${Math.max(3, rate ?? 3)}%` as `${number}%`,
                    },
                  ]}
                />
              </View>
              <View style={styles.skillMeta}>
                <Text style={styles.skillRate}>{rate === null ? '성공률 계산 중' : `독립 수행 ${Math.round(rate)}%`}</Text>
                <Text style={styles.skillEvidence}>
                  {confidenceLabel(skill.confidence)} · {skill.distinctSessionCount}회 수행
                </Text>
              </View>
              {skill.interpretationLimits[0] ? (
                <Text style={styles.limitText}>※ {skill.interpretationLimits[0]}</Text>
              ) : null}
            </View>
          );
        })}

        <View style={styles.noticeCard}>
          <Ionicons color="#60787C" name="information-circle-outline" size={20} />
          <Text style={styles.noticeText}>
            이 결과는 퀘스트 수행 기록을 바탕으로 한 맞춤화 정보이며, 의학적·심리학적 진단이 아니에요.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function SummaryCard({
  color,
  count,
  label,
  onPress,
  open = false,
}: {
  color: string;
  count: number;
  label: string;
  onPress?: () => void;
  open?: boolean;
}) {
  const content = (
    <>
      <Text style={[styles.summaryCount, { color }]}>{count}</Text>
      <View style={styles.summaryLabelRow}>
        <Text style={styles.summaryLabel}>{label}</Text>
        {onPress ? (
          <Ionicons color="#77847F" name={open ? 'chevron-up' : 'chevron-down'} size={12} />
        ) : null}
      </View>
    </>
  );
  if (!onPress) return <View style={styles.summaryCard}>{content}</View>;
  return (
    <PressScale
      accessibilityHint="능력 판단에 반영된 행동 목록을 펼쳐 봅니다."
      accessibilityLabel={`분석한 행동 ${count}개`}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      style={[styles.summaryCard, styles.summaryButton, open && styles.summaryButtonOpen]}
    >
      {content}
    </PressScale>
  );
}

function AnalyzedBehaviorPanel({
  eventCount,
  skills,
}: {
  eventCount: number;
  skills: AbilityProfileResponse['profileData']['skills'][string][];
}) {
  const evidenceCount = skills.reduce(
    (total, skill) => total + skill.observedStrengths.length + skill.observedDifficulties.length,
    0,
  );
  return (
    <View style={styles.behaviorPanel}>
      <View style={styles.behaviorPanelHeader}>
        <View style={styles.behaviorPanelIcon}>
          <Ionicons color="#397B68" name="list-outline" size={20} />
        </View>
        <View style={styles.behaviorPanelHeadingCopy}>
          <Text style={styles.behaviorPanelTitle}>분석한 행동</Text>
          <Text style={styles.behaviorPanelSubtitle}>
            수집한 행동 {eventCount}개 중 능력 판단에 반영된 행동을 기술별로 요약했어요.
          </Text>
        </View>
      </View>

      {evidenceCount === 0 ? (
        <Text style={styles.noBehaviorText}>아직 능력 판단에 사용할 행동 근거가 없어요.</Text>
      ) : skills.map((skill) => {
        const evidence = [
          ...skill.observedStrengths.map((item) => ({ item, kind: 'strength' as const })),
          ...skill.observedDifficulties.map((item) => ({ item, kind: 'difficulty' as const })),
        ];
        if (evidence.length === 0) return null;
        return (
          <View key={skill.skillCode} style={styles.behaviorSkillSection}>
            <Text style={styles.behaviorSkillName}>{abilityCopy(skill.skillCode).label}</Text>
            {evidence.map(({ item, kind }, index) => {
              const positive = kind === 'strength';
              return (
                <View
                  key={`${item.eventCode}-${kind}-${index}`}
                  style={styles.behaviorEvidenceRow}
                >
                  <View
                    style={[
                      styles.behaviorEvidenceIcon,
                      { backgroundColor: positive ? '#E7F7EE' : '#FFF0EC' },
                    ]}
                  >
                    <Ionicons
                      color={positive ? '#27845D' : '#C45C42'}
                      name={positive ? 'checkmark' : 'alert'}
                      size={14}
                    />
                  </View>
                  <View style={styles.behaviorEvidenceCopy}>
                    <Text style={styles.behaviorEvidenceText}>
                      {behaviorEvidenceCopy(item, kind)}
                    </Text>
                    <Text style={styles.behaviorEvidenceMeta}>
                      {independenceLabel(item.independenceLevel)} · {item.observationCount}회 관찰
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}

      <Text style={styles.behaviorPanelNotice}>
        같은 행동을 여러 번 수행한 경우 한 줄로 묶어 횟수로 표시해요.
      </Text>
    </View>
  );
}

function EmptyAnalysis({
  actionLabel,
  icon,
  message,
  onAction,
}: {
  actionLabel?: string;
  icon: keyof typeof Ionicons.glyphMap;
  message: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.root}>
      <BrandHeader />
      <View style={styles.centerState}>
        <View style={styles.emptyIcon}>
          <Ionicons color="#4A8D78" name={icon} size={30} />
        </View>
        <Text style={styles.emptyTitle}>나의 능력 분석</Text>
        <Text style={styles.stateText}>{message}</Text>
        {actionLabel && onAction ? (
          <PressScale accessibilityRole="button" onPress={onAction} style={styles.refreshButton}>
            <Text style={styles.refreshButtonText}>{actionLabel}</Text>
          </PressScale>
        ) : null}
      </View>
    </View>
  );
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}월 ${date.getDate()}일 업데이트`;
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#F7FAF8', flex: 1, paddingHorizontal: 20 },
  content: { alignSelf: 'center', maxWidth: 720, paddingBottom: 116, width: '100%' },
  hero: { backgroundColor: '#397B68', borderRadius: 24, marginTop: 8, padding: 22 },
  heroIcon: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 16, height: 48, justifyContent: 'center', marginBottom: 16, width: 48 },
  eyebrow: { color: '#CFE9DE', fontFamily: fonts.bold, fontSize: 12, lineHeight: 16 },
  title: { color: '#FFFFFF', fontFamily: fonts.extraBold, fontSize: 26, lineHeight: 34, marginTop: 3 },
  subtitle: { color: '#E6F2ED', fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, marginTop: 8 },
  difficultyCard: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#E2EBE6', borderRadius: 20, borderWidth: 1, flexDirection: 'row', marginTop: 14, padding: 17 },
  difficultyCopy: { flex: 1, paddingRight: 10 },
  sectionEyebrow: { color: '#688078', fontFamily: fonts.bold, fontSize: 12, lineHeight: 16 },
  difficultyDescription: { color: '#293B35', fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, marginTop: 4 },
  difficultyBadge: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  difficultyBadgeText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 13 },
  summaryRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  summaryCard: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#E6ECE8', borderRadius: 16, borderWidth: 1, flex: 1, paddingHorizontal: 5, paddingVertical: 13 },
  summaryButton: { justifyContent: 'center' },
  summaryButtonOpen: { backgroundColor: '#EDF5F1', borderColor: '#8DB6A8' },
  summaryCount: { fontFamily: fonts.extraBold, fontSize: 21, lineHeight: 27 },
  summaryLabel: { color: '#74817C', fontFamily: fonts.medium, fontSize: 10, lineHeight: 14, textAlign: 'center' },
  summaryLabelRow: { alignItems: 'center', flexDirection: 'row', gap: 2, marginTop: 1 },
  behaviorPanel: { backgroundColor: '#FFFFFF', borderColor: '#DCE8E2', borderRadius: 20, borderWidth: 1, marginTop: 10, padding: 17 },
  behaviorPanelHeader: { alignItems: 'flex-start', flexDirection: 'row' },
  behaviorPanelIcon: { alignItems: 'center', backgroundColor: '#E6F3EE', borderRadius: 13, height: 40, justifyContent: 'center', width: 40 },
  behaviorPanelHeadingCopy: { flex: 1, marginLeft: 11 },
  behaviorPanelTitle: { color: '#24342F', fontFamily: fonts.bold, fontSize: 17, lineHeight: 22 },
  behaviorPanelSubtitle: { color: '#72807B', fontFamily: fonts.regular, fontSize: 11, lineHeight: 17, marginTop: 3 },
  behaviorSkillSection: { borderTopColor: '#EDF1EF', borderTopWidth: 1, marginTop: 15, paddingTop: 13 },
  behaviorSkillName: { color: '#3B5049', fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, marginBottom: 8 },
  behaviorEvidenceRow: { alignItems: 'flex-start', flexDirection: 'row', marginBottom: 9 },
  behaviorEvidenceIcon: { alignItems: 'center', borderRadius: 10, height: 28, justifyContent: 'center', marginTop: 1, width: 28 },
  behaviorEvidenceCopy: { flex: 1, marginLeft: 9 },
  behaviorEvidenceText: { color: '#34463F', fontFamily: fonts.medium, fontSize: 12, lineHeight: 17 },
  behaviorEvidenceMeta: { color: '#8A9691', fontFamily: fonts.regular, fontSize: 10, lineHeight: 14, marginTop: 1 },
  behaviorPanelNotice: { color: '#7C8A84', fontFamily: fonts.regular, fontSize: 10, lineHeight: 15, marginTop: 4 },
  noBehaviorText: { color: '#7B8883', fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, marginTop: 15 },
  sectionHeading: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, marginTop: 23 },
  sectionTitle: { color: '#24342F', fontFamily: fonts.bold, fontSize: 20, lineHeight: 27 },
  updatedAt: { color: '#8A9792', fontFamily: fonts.regular, fontSize: 11 },
  skillCard: { backgroundColor: '#FFFFFF', borderColor: '#E3EAE6', borderRadius: 20, borderWidth: 1, marginBottom: 10, padding: 17 },
  skillHeader: { alignItems: 'center', flexDirection: 'row' },
  statusIcon: { alignItems: 'center', borderRadius: 14, height: 42, justifyContent: 'center', width: 42 },
  skillHeadingCopy: { flex: 1, marginLeft: 12 },
  skillName: { color: '#24342F', fontFamily: fonts.bold, fontSize: 17, lineHeight: 22 },
  statusLabel: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 15, marginTop: 1 },
  levelPill: { backgroundColor: '#F1F5F2', borderRadius: 14, paddingHorizontal: 11, paddingVertical: 6 },
  levelText: { color: '#51635D', fontFamily: fonts.bold, fontSize: 11 },
  skillDescription: { color: '#66756F', fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, marginTop: 12 },
  progressTrack: { backgroundColor: '#EDF1EF', borderRadius: 5, height: 7, marginTop: 13, overflow: 'hidden' },
  progressFill: { borderRadius: 5, height: 7 },
  skillMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  skillRate: { color: '#42534D', fontFamily: fonts.semibold, fontSize: 11 },
  skillEvidence: { color: '#89958F', fontFamily: fonts.regular, fontSize: 10 },
  limitText: { color: '#9A7A54', fontFamily: fonts.regular, fontSize: 10, lineHeight: 15, marginTop: 8 },
  noticeCard: { alignItems: 'flex-start', backgroundColor: '#EDF4F2', borderRadius: 16, flexDirection: 'row', gap: 9, marginTop: 6, padding: 14 },
  noticeText: { color: '#60726C', flex: 1, fontFamily: fonts.regular, fontSize: 11, lineHeight: 17 },
  centerState: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingBottom: 80, paddingHorizontal: 28 },
  stateText: { color: '#78847F', fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, marginTop: 12, textAlign: 'center' },
  emptyIcon: { alignItems: 'center', backgroundColor: '#E7F3EE', borderRadius: 28, height: 56, justifyContent: 'center', width: 56 },
  emptyTitle: { color: '#293B35', fontFamily: fonts.bold, fontSize: 20, marginTop: 15 },
  refreshButton: { backgroundColor: '#438B74', borderRadius: 18, marginTop: 18, paddingHorizontal: 20, paddingVertical: 10 },
  refreshButtonText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 13 },
});
