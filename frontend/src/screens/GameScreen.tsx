import { Ionicons } from '@expo/vector-icons';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { icons } from '../assets';
import { PressScale } from '../components/PressScale';
import { StickyBrandHeader } from '../components/ui';
import { SimulationScenario, simulationScenarios } from '../game/scenarios';
import { cardShadow, colors, fonts } from '../theme';

type GameScreenProps = {
  onEnter: () => void;
};

export function GameScreen({ onEnter }: GameScreenProps) {
  const market = simulationScenarios[0];
  const plannedScenarios = simulationScenarios.slice(1);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} stickyHeaderIndices={[0]}>
      <StickyBrandHeader horizontalPadding={20} />

      <View style={styles.intro}>
        <View style={styles.dayBadge}>
          <Ionicons color="#6D593F" name="sunny" size={14} />
          <Text style={styles.dayBadgeText}>DAY 1 · 맑음</Text>
        </View>
        <Text style={styles.eyebrow}>오늘도 마을</Text>
        <Text style={styles.title}>새로운 의뢰가{`\n`}도착했어요</Text>
        <View style={styles.worldStatus}>
          <View style={styles.worldStatusItem}>
            <Ionicons color="#6D795F" name="location" size={16} />
            <Text style={styles.worldStatusText}>목적지  하늘마트</Text>
          </View>
          <View style={styles.worldStatusDivider} />
          <View style={styles.worldStatusItem}>
            <Ionicons color="#B7863F" name="star" size={15} />
            <Text style={styles.worldStatusText}>보상  30 XP</Text>
          </View>
        </View>
      </View>

      <PressScale
        accessibilityHint="오늘도 마을에 들어가 하늘마트로 이동합니다"
        accessibilityLabel="마을에서 마트 장보기 시작"
        accessibilityRole="button"
        onPress={onEnter}
        style={styles.featuredCard}
      >
        <View pointerEvents="none" style={styles.questTapeLeft} />
        <View pointerEvents="none" style={styles.questTapeRight} />
        <View style={styles.featuredHeader}>
          <View style={styles.playableBadge}>
            <Ionicons color="#FFF7E7" name="document-text" size={14} />
            <Text style={styles.playableBadgeText}>오늘의 의뢰</Text>
          </View>
          <Text style={styles.featuredLocation}>QUEST 01</Text>
        </View>

        <MiniMarketScene />

        <View style={styles.featuredCopy}>
          <View style={styles.featuredTitleRow}>
            <View style={styles.featuredIcon}>
              <Ionicons color="#FFF7E8" name={market.icon} size={25} />
            </View>
            <View style={styles.featuredTitleCopy}>
              <Text style={styles.questLocation}>{market.location}</Text>
              <Text style={styles.featuredTitle}>저녁 장을 준비해요</Text>
              <Text style={styles.featuredDescription}>목록을 챙겨 마트에 다녀오세요.</Text>
            </View>
          </View>

          <View style={styles.missionGoalList}>
            {market.skills.map((skill) => (
              <View key={skill} style={styles.missionGoal}>
                <View style={styles.missionGoalBox} />
                <Text style={styles.missionGoalText}>{skill}</Text>
              </View>
            ))}
          </View>

          <View style={styles.featuredAction}>
            <View>
              <Text style={styles.actionLabel}>의뢰 보상</Text>
              <View style={styles.rewardRow}>
                <Ionicons color="#C28A36" name="star" size={16} />
                <Text style={styles.actionTitle}>30 XP</Text>
              </View>
            </View>
            <View style={styles.actionButton}>
              <Text style={styles.actionButtonText}>출발하기</Text>
              <Ionicons color={colors.white} name="arrow-forward" size={20} />
            </View>
          </View>
        </View>
      </PressScale>

      <View style={styles.sectionHeading}>
        <View>
          <Text style={styles.sectionTitle}>마을의 다음 장소</Text>
          <Text style={styles.sectionDescription}>의뢰를 완료하면 새로운 장소가 열려요.</Text>
        </View>
        <Text style={styles.sectionCount}>3곳</Text>
      </View>

      <View style={styles.scenarioGrid}>
        {plannedScenarios.map((scenario) => (
          <ScenarioCard key={scenario.id} scenario={scenario} />
        ))}
      </View>

      <View style={styles.villageSection}>
        <View style={styles.villageCopy}>
          <Text style={styles.villageEyebrow}>FREE ROAM</Text>
          <Text style={styles.villageTitle}>오늘도 마을 자유 탐험</Text>
          <Text style={styles.villageDescription}>의뢰 없이 마을을 걷고 주민과 대화할 수 있어요.</Text>
        </View>
        <PressScale
          accessibilityLabel="오늘도 마을 들어가기"
          accessibilityRole="button"
          onPress={onEnter}
          style={styles.villageButton}
        >
          <Image resizeMode="contain" source={icons.map} style={styles.villageButtonIcon} />
          <Text style={styles.villageButtonText}>자유롭게 둘러보기</Text>
          <Ionicons color="#37574B" name="chevron-forward" size={18} />
        </PressScale>
      </View>

      <View style={styles.bottomSpace} />
    </ScrollView>
  );
}

function MiniMarketScene() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.marketScene}>
      <View style={styles.marketWall}>
        <View style={styles.marketSign}>
          <Text style={styles.marketSignText}>HANEUL MART</Text>
        </View>
      </View>
      <View style={styles.marketFloor}>
        <View style={[styles.floorLine, { left: '25%' }]} />
        <View style={[styles.floorLine, { left: '50%' }]} />
        <View style={[styles.floorLine, { left: '75%' }]} />
      </View>
      <View style={[styles.previewShelf, styles.previewShelfLeft]}>
        <View style={styles.previewShelfTop} />
        <View style={styles.previewProducts}>
          <View style={[styles.previewProduct, { backgroundColor: '#D9EDF8' }]} />
          <View style={[styles.previewProduct, { backgroundColor: '#FFE1B4' }]} />
          <View style={[styles.previewProduct, { backgroundColor: '#E9D7F2' }]} />
        </View>
      </View>
      <View style={[styles.previewShelf, styles.previewShelfRight]}>
        <View style={styles.previewShelfTop} />
        <View style={styles.previewProducts}>
          <View style={[styles.previewProduct, { backgroundColor: '#F6C9BE' }]} />
          <View style={[styles.previewProduct, { backgroundColor: '#D9E9C5' }]} />
          <View style={[styles.previewProduct, { backgroundColor: '#F5DB91' }]} />
        </View>
      </View>
      <View style={styles.previewCounter}>
        <View style={styles.previewRegister} />
        <View style={styles.previewNpc}>
          <View style={styles.previewNpcHead} />
          <View style={styles.previewNpcBody} />
        </View>
      </View>
      <View style={styles.previewPlayer}>
        <View style={styles.previewPlayerHead} />
        <View style={styles.previewPlayerBody} />
        <View style={styles.previewBasket}>
          <Ionicons color="#FFFFFF" name="basket" size={13} />
        </View>
      </View>
      <View style={styles.previewPath} />
    </View>
  );
}

function ScenarioCard({ scenario }: { scenario: SimulationScenario }) {
  return (
    <View style={[styles.scenarioCard, { backgroundColor: scenario.accentSoft }]}>
      <View style={styles.scenarioCardTop}>
        <View style={[styles.scenarioIcon, { backgroundColor: colors.white }]}>
          <Ionicons color={scenario.accent} name={scenario.icon} size={25} />
        </View>
        <View style={styles.plannedBadge}>
          <Text style={styles.plannedBadgeText}>LOCKED</Text>
        </View>
      </View>
      <Text style={styles.scenarioLocation}>{scenario.location}</Text>
      <Text style={styles.scenarioTitle}>{scenario.shortTitle}</Text>
      <Text numberOfLines={2} style={styles.scenarioDescription}>{scenario.description}</Text>
      <View style={styles.npcRow}>
        <View style={[styles.npcAvatar, { borderColor: scenario.accent }]}>
          <View style={[styles.npcAvatarHead, { backgroundColor: scenario.accent }]} />
        </View>
        <View>
          <Text style={styles.npcName}>{scenario.npcName}</Text>
          <Text style={styles.npcRole}>{scenario.npcRole}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { alignSelf: 'center', backgroundColor: '#F5F1E7', maxWidth: 720, paddingHorizontal: 20, width: '100%' },
  intro: { paddingBottom: 8, paddingTop: 18 },
  dayBadge: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#E9DFC8', borderColor: '#D5C6A7', borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 9, paddingVertical: 5 },
  dayBadgeText: { color: '#6D593F', fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.4 },
  eyebrow: { color: '#4F725E', fontFamily: fonts.bold, fontSize: 13, letterSpacing: 0.2, lineHeight: 18, marginTop: 14 },
  title: { color: '#2B302B', fontFamily: fonts.laundryBold, fontSize: 30, letterSpacing: -1, lineHeight: 38, marginTop: 4 },
  introDescription: { color: '#767676', fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, marginTop: 9 },
  worldStatus: { alignItems: 'center', backgroundColor: '#E9E4D7', borderColor: '#D9D1BE', borderRadius: 12, borderWidth: 1, flexDirection: 'row', marginTop: 15, paddingHorizontal: 12, paddingVertical: 10 },
  worldStatusItem: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center' },
  worldStatusDivider: { backgroundColor: '#CEC5B2', height: 18, width: 1 },
  worldStatusText: { color: '#595B51', fontFamily: fonts.semibold, fontSize: 11 },
  featuredCard: {
    backgroundColor: '#FFF8E9', borderColor: '#C9B48D', borderRadius: 14, borderWidth: 2,
    marginTop: 18, overflow: 'visible', ...cardShadow,
  },
  questTapeLeft: { backgroundColor: 'rgba(209,190,150,0.74)', height: 24, left: 28, position: 'absolute', top: -12, transform: [{ rotate: '-4deg' }], width: 64, zIndex: 8 },
  questTapeRight: { backgroundColor: 'rgba(209,190,150,0.74)', height: 24, position: 'absolute', right: 28, top: -12, transform: [{ rotate: '4deg' }], width: 64, zIndex: 8 },
  featuredHeader: { alignItems: 'center', backgroundColor: '#B4553F', borderTopLeftRadius: 12, borderTopRightRadius: 12, flexDirection: 'row', justifyContent: 'space-between', overflow: 'hidden', paddingHorizontal: 16, paddingVertical: 11 },
  playableBadge: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  playableDot: { backgroundColor: colors.mint, borderRadius: 4, height: 8, marginRight: 6, width: 8 },
  playableBadgeText: { color: '#FFF7E7', fontFamily: fonts.bold, fontSize: 12 },
  featuredLocation: { color: 'rgba(255,247,231,0.74)', fontFamily: fonts.bold, fontSize: 10, letterSpacing: 1.2 },
  marketScene: { backgroundColor: '#EDE6D9', height: 210, overflow: 'hidden', position: 'relative' },
  marketWall: { backgroundColor: '#F3E5D4', height: 54, left: 0, position: 'absolute', right: 0, top: 0 },
  marketSign: { alignItems: 'center', alignSelf: 'center', backgroundColor: '#C95D46', borderRadius: 5, marginTop: 13, paddingHorizontal: 18, paddingVertical: 7 },
  marketSignText: { color: '#FFF9EE', fontFamily: fonts.bold, fontSize: 10, letterSpacing: 1.2 },
  marketFloor: { backgroundColor: '#E8E0D2', bottom: 0, left: 0, position: 'absolute', right: 0, top: 54, transform: [{ skewX: '-5deg' }] },
  floorLine: { backgroundColor: 'rgba(255,255,255,0.52)', bottom: 0, position: 'absolute', top: 0, width: 1 },
  previewShelf: { backgroundColor: '#8F6B50', borderColor: '#73533D', borderRadius: 7, borderWidth: 1, height: 75, padding: 6, position: 'absolute', top: 78, width: 100 },
  previewShelfLeft: { left: 18 },
  previewShelfRight: { right: 18 },
  previewShelfTop: { backgroundColor: '#6D4E39', borderRadius: 3, height: 7, marginBottom: 7 },
  previewProducts: { flexDirection: 'row', gap: 5 },
  previewProduct: { borderColor: 'rgba(74,51,37,0.18)', borderRadius: 3, borderWidth: 1, height: 37, width: 23 },
  previewCounter: { backgroundColor: '#B9916D', borderColor: '#795A41', borderRadius: 7, borderWidth: 1, height: 48, left: '39%', position: 'absolute', top: 65, width: 86 },
  previewRegister: { backgroundColor: '#565B5A', borderRadius: 3, height: 15, left: 12, position: 'absolute', top: -10, width: 24 },
  previewNpc: { alignItems: 'center', position: 'absolute', right: 12, top: -31 },
  previewNpcHead: { backgroundColor: '#E4B994', borderColor: '#684C3C', borderRadius: 10, borderWidth: 1, height: 20, width: 20 },
  previewNpcBody: { backgroundColor: '#659673', borderColor: '#476A51', borderRadius: 5, borderWidth: 1, height: 25, marginTop: -1, width: 20 },
  previewPlayer: { alignItems: 'center', bottom: 17, left: '45%', position: 'absolute', zIndex: 3 },
  previewPlayerHead: { backgroundColor: '#E5BB98', borderColor: '#63483A', borderRadius: 10, borderWidth: 1, height: 21, width: 21 },
  previewPlayerBody: { backgroundColor: '#E39344', borderColor: '#704C2A', borderRadius: 5, borderWidth: 1, height: 31, marginTop: -1, width: 23 },
  previewBasket: { alignItems: 'center', backgroundColor: '#C95D46', borderRadius: 9, height: 22, justifyContent: 'center', position: 'absolute', right: -17, top: 25, width: 22 },
  previewPath: { borderColor: 'rgba(255,255,255,0.82)', borderRadius: 16, borderStyle: 'dashed', borderWidth: 1.5, bottom: 49, height: 1, left: '28%', position: 'absolute', transform: [{ rotate: '-12deg' }], width: 150 },
  featuredCopy: { padding: 17 },
  featuredTitleRow: { alignItems: 'center', flexDirection: 'row' },
  featuredIcon: { alignItems: 'center', backgroundColor: '#B4553F', borderColor: '#D78A70', borderRadius: 24, borderWidth: 3, height: 48, justifyContent: 'center', marginRight: 12, width: 48 },
  featuredTitleCopy: { flex: 1 },
  questLocation: { color: '#9A745D', fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.4 },
  featuredTitle: { color: '#302820', fontFamily: fonts.laundryBold, fontSize: 21, letterSpacing: -0.5, marginTop: 2 },
  featuredDescription: { color: '#756E68', fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, marginTop: 3 },
  missionGoalList: { backgroundColor: '#F2E9D6', borderColor: '#DDCEB1', borderRadius: 10, borderStyle: 'dashed', borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16, padding: 11 },
  missionGoal: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  missionGoalBox: { backgroundColor: '#FFF9ED', borderColor: '#9E8A66', borderRadius: 3, borderWidth: 1.5, height: 14, width: 14 },
  missionGoalText: { color: '#665C4C', fontFamily: fonts.semibold, fontSize: 11 },
  featuredAction: { alignItems: 'center', borderTopColor: '#DDCEB1', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, paddingTop: 14 },
  actionLabel: { color: '#9A8564', fontFamily: fonts.medium, fontSize: 10 },
  rewardRow: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 2 },
  actionTitle: { color: '#514330', fontFamily: fonts.bold, fontSize: 16 },
  actionButton: { alignItems: 'center', backgroundColor: '#3F785D', borderColor: '#2D5D46', borderRadius: 12, borderWidth: 2, flexDirection: 'row', gap: 5, height: 47, justifyContent: 'center', paddingHorizontal: 18 },
  actionButtonText: { color: colors.white, fontFamily: fonts.bold, fontSize: 15 },
  sectionHeading: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', marginTop: 29 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 20, letterSpacing: -0.5 },
  sectionDescription: { color: '#8A8A8A', fontFamily: fonts.regular, fontSize: 12, marginTop: 5 },
  sectionCount: { color: '#8A8A8A', fontFamily: fonts.medium, fontSize: 12 },
  scenarioGrid: { gap: 10, marginTop: 13 },
  scenarioCard: { borderColor: 'rgba(91,76,56,0.24)', borderRadius: 14, borderStyle: 'dashed', borderWidth: 1.5, padding: 16 },
  scenarioCardTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  scenarioIcon: { alignItems: 'center', borderRadius: 14, height: 44, justifyContent: 'center', width: 44 },
  plannedBadge: { backgroundColor: 'rgba(58,57,50,0.72)', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
  plannedBadgeText: { color: '#FFFDF5', fontFamily: fonts.bold, fontSize: 9, letterSpacing: 0.5 },
  scenarioLocation: { color: '#77726C', fontFamily: fonts.medium, fontSize: 11, marginTop: 14 },
  scenarioTitle: { color: '#252525', fontFamily: fonts.bold, fontSize: 18, letterSpacing: -0.4, marginTop: 3 },
  scenarioDescription: { color: '#716E69', fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, marginTop: 6 },
  npcRow: { alignItems: 'center', borderTopColor: 'rgba(73,67,59,0.09)', borderTopWidth: 1, flexDirection: 'row', marginTop: 14, paddingTop: 12 },
  npcAvatar: { alignItems: 'center', backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1.5, height: 32, justifyContent: 'center', marginRight: 9, width: 32 },
  npcAvatarHead: { borderRadius: 6, height: 12, opacity: 0.65, width: 12 },
  npcName: { color: '#3D3A36', fontFamily: fonts.semibold, fontSize: 12 },
  npcRole: { color: '#85817C', fontFamily: fonts.regular, fontSize: 10, marginTop: 1 },
  villageSection: { backgroundColor: '#E5EADB', borderColor: '#BFC9B5', borderRadius: 14, borderWidth: 1.5, marginTop: 12, padding: 16 },
  villageCopy: { paddingRight: 5 },
  villageEyebrow: { color: '#6E8879', fontFamily: fonts.bold, fontSize: 10, letterSpacing: 1 },
  villageTitle: { color: '#303431', fontFamily: fonts.bold, fontSize: 16, marginTop: 4 },
  villageDescription: { color: '#7B817D', fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, marginTop: 5 },
  villageButton: { alignItems: 'center', backgroundColor: '#F5F8EF', borderColor: '#A9B7A1', borderRadius: 10, borderWidth: 1, flexDirection: 'row', height: 48, marginTop: 13, paddingHorizontal: 12 },
  villageButtonIcon: { height: 34, marginRight: 8, width: 34 },
  villageButtonText: { color: '#37574B', flex: 1, fontFamily: fonts.semibold, fontSize: 14 },
  bottomSpace: { height: 120 },
});
