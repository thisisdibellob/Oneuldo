import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  GestureResponderEvent,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  HOME_EXIT_POINT,
  HOME_FRIDGE_POINT,
  HOUSE_ENTRANCE_POINT,
  MARKET_ENTRANCE_POINT,
  Point,
  VILLAGE_NPCS,
  VillageNpcDefinition,
  VillageNpcId,
} from '../../game/prototypeWorld';
import { colors, fonts } from '../../theme';
import { PressScale } from '../PressScale';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type PrototypeControlMode = 'joystick' | 'touch';
export type VillagePortalId = 'home' | 'market';
export type HomeStationId = 'fridge' | 'exit';
export type NpcQuestState = 'available' | 'active' | 'completed' | 'conversation';

export type ExpandedVillageLayerProps = {
  controlsLocked?: boolean;
  controlMode: PrototypeControlMode;
  nearbyNpcId: VillageNpcId | null;
  nearbyPortalId: VillagePortalId | null;
  npcQuestStates?: Partial<Record<VillageNpcId, NpcQuestState>>;
  onNpcPress: (event: GestureResponderEvent, npc: VillageNpcDefinition) => void;
  onPortalPress: (event: GestureResponderEvent, portalId: VillagePortalId) => void;
  tapTargetMarker?: Point | null;
};

export type HomeWorldLayerProps = {
  controlsLocked?: boolean;
  controlMode: PrototypeControlMode;
  fridgeCompleted?: boolean;
  nearbyStationId: HomeStationId | null;
  onStationPress: (event: GestureResponderEvent, stationId: HomeStationId) => void;
  tapTargetMarker?: Point | null;
};

function InteractionCloud({
  icon,
  label,
  testID,
  visible,
}: {
  icon: IoniconName;
  label: string;
  testID: string;
  visible: boolean;
}) {
  const entrance = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotionEnabled(enabled);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionEnabled,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    entrance.stopAnimation();
    drift.stopAnimation();

    if (!visible) {
      entrance.setValue(0);
      drift.setValue(0);
      return;
    }

    if (reduceMotionEnabled) {
      entrance.setValue(1);
      drift.setValue(0);
      return;
    }

    entrance.setValue(0);
    drift.setValue(0);
    let driftLoop: Animated.CompositeAnimation | null = null;
    const entranceAnimation = Animated.spring(entrance, {
      damping: 14,
      mass: 0.62,
      stiffness: 185,
      toValue: 1,
      useNativeDriver: true,
    });
    entranceAnimation.start(({ finished }) => {
      if (!finished) return;
      driftLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(drift, {
            duration: 1100,
            easing: Easing.inOut(Easing.ease),
            toValue: 2,
            useNativeDriver: true,
          }),
          Animated.timing(drift, {
            duration: 1100,
            easing: Easing.inOut(Easing.ease),
            toValue: -2,
            useNativeDriver: true,
          }),
        ]),
      );
      driftLoop.start();
    });

    return () => {
      entranceAnimation.stop();
      driftLoop?.stop();
      entrance.stopAnimation();
      drift.stopAnimation();
    };
  }, [drift, entrance, reduceMotionEnabled, visible]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.cloudRoot,
        {
          opacity: entrance,
          transform: [
            {
              translateY: Animated.add(
                entrance.interpolate({ inputRange: [0, 1], outputRange: [7, 0] }),
                drift,
              ),
            },
            { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
          ],
        },
      ]}
      testID={testID}
    >
      <View style={[styles.cloudBubble, styles.cloudBubbleLeft]} />
      <View style={[styles.cloudBubble, styles.cloudBubbleRight]} />
      <View style={styles.cloudTail} />
      <View style={styles.cloudBody}>
        <View style={styles.cloudIcon}>
          <Ionicons color="#42695A" name={icon} size={16} />
        </View>
        <Text numberOfLines={1} style={styles.cloudText}>
          {label}
        </Text>
        <Ionicons color="#5C766B" name="chevron-forward" size={15} />
      </View>
    </Animated.View>
  );
}

function IsoBuilding({
  color,
  height,
  label,
  width,
  x,
  y,
}: {
  color: string;
  height: number;
  label: string;
  width: number;
  x: number;
  y: number;
}) {
  return (
    <View pointerEvents="none" style={[styles.building, { height, left: x, top: y, width }]}>
      <View style={[styles.buildingFront, { backgroundColor: color }]} />
      <View style={[styles.buildingRoof, { backgroundColor: color, width: width * 0.72 }]} />
      <View style={styles.buildingDoor} />
      <Text style={styles.buildingLabel}>{label}</Text>
    </View>
  );
}

function VillageLandmarks() {
  return (
    <>
      <View pointerEvents="none" style={styles.busStop}>
        <View style={styles.busStopRoof} />
        <View style={styles.busStopBench} />
        <View style={styles.busStopSign}>
          <Ionicons color="#FFFFFF" name="bus" size={19} />
        </View>
        <Text style={styles.landmarkLabel}>동쪽 버스정류장</Text>
      </View>

      <IsoBuilding color="#C8A588" height={160} label="마을 상가" width={240} x={650} y={800} />
      <IsoBuilding color="#97AD9C" height={180} label="주민센터" width={280} x={1080} y={720} />

      <View pointerEvents="none" style={[styles.planter, styles.eastPlanter]}>
        <View style={styles.shrub} />
        <View style={[styles.shrub, styles.shrubMiddle]} />
        <View style={[styles.shrub, styles.shrubRight]} />
        <Text style={styles.parkLabel}>작은 공원</Text>
      </View>
      <View pointerEvents="none" style={[styles.planter, styles.southPlanter]}>
        <View style={styles.flowerDot} />
        <View style={[styles.flowerDot, styles.flowerDotTwo]} />
        <View style={[styles.flowerDot, styles.flowerDotThree]} />
        <Text style={styles.parkLabel}>산책 화단</Text>
      </View>
    </>
  );
}

function questStatePresentation(state: NpcQuestState | undefined, hasQuest: boolean) {
  if (!hasQuest || state === 'conversation') {
    return { icon: 'chatbubble' as const, label: '대화하기' };
  }
  if (state === 'completed') {
    return { icon: 'checkmark' as const, label: '부탁 완료' };
  }
  if (state === 'active') {
    return { icon: 'book-outline' as const, label: '부탁 진행 중' };
  }
  return { icon: 'sparkles' as const, label: '새로운 부탁' };
}

function VillageNpc({
  controlMode,
  controlsLocked,
  nearby,
  npc,
  onPress,
  questState,
}: {
  controlMode: PrototypeControlMode;
  controlsLocked: boolean;
  nearby: boolean;
  npc: VillageNpcDefinition;
  onPress: (event: GestureResponderEvent, npc: VillageNpcDefinition) => void;
  questState?: NpcQuestState;
}) {
  const presentation = questStatePresentation(questState, Boolean(npc.questId));
  const rolePrefix = npc.id === 'minsu' ? '안내원 ' : '';
  const touchLabel = `${rolePrefix}${npc.name}로 이동해 대화하기`;

  return (
    <PressScale
      accessibilityHint={
        controlMode === 'touch'
          ? nearby
            ? '대화하거나 부탁을 확인합니다'
            : '가까이 이동한 뒤 대화합니다'
          : undefined
      }
      accessibilityLabel={controlMode === 'touch' ? touchLabel : `${rolePrefix}${npc.name}`}
      accessibilityRole={controlMode === 'touch' ? 'button' : undefined}
      disabled={controlMode !== 'touch' || controlsLocked}
      onPress={(event) => {
        event?.stopPropagation?.();
        onPress(event, npc);
      }}
      scaleTo={0.94}
      style={[
        styles.npc,
        { left: npc.point.x - 35, top: npc.point.y - 45 },
        !nearby && styles.npcDistant,
      ]}
      testID={`village-npc-${npc.id}`}
    >
      <View style={styles.npcCloudAnchor}>
        <InteractionCloud
          icon={presentation.icon}
          label={`${npc.name} · ${presentation.label}`}
          testID={`npc-proximity-cloud-${npc.id}`}
          visible={nearby}
        />
      </View>
      <View style={styles.npcShadow} />
      <View style={[styles.npcBody, { backgroundColor: npc.accentColor }]}>
        <View style={styles.npcHead} />
        <View style={styles.npcCollar} />
      </View>
      <Text style={styles.npcName}>{npc.name}</Text>
      <Text style={styles.npcRole}>{npc.roleLabel}</Text>
    </PressScale>
  );
}

export function ExpandedVillageLayer({
  controlMode,
  controlsLocked = false,
  nearbyNpcId,
  nearbyPortalId,
  npcQuestStates = {},
  onNpcPress,
  onPortalPress,
  tapTargetMarker = null,
}: ExpandedVillageLayerProps) {
  return (
    <View pointerEvents="box-none" style={styles.layer} testID="expanded-village-layer">
      <View pointerEvents="none" style={styles.villageGround} />
      <View pointerEvents="none" style={[styles.road, styles.roadMain]} />
      <View pointerEvents="none" style={[styles.road, styles.roadBranch]} />
      <View pointerEvents="none" style={[styles.road, styles.roadEast]} />
      <View pointerEvents="none" style={[styles.road, styles.roadSouth]} />
      <View pointerEvents="none" style={[styles.roadEdge, styles.roadEdgeOne]} />
      <View pointerEvents="none" style={[styles.roadEdge, styles.roadEdgeTwo]} />

      {tapTargetMarker && controlMode === 'touch' ? (
        <View
          pointerEvents="none"
          style={[
            styles.tapTargetMarker,
            { left: tapTargetMarker.x - 12, top: tapTargetMarker.y - 12 },
          ]}
          testID="touch-target-marker"
        />
      ) : null}

      <IsoBuilding color="#C99C78" height={184} label="집" width={238} x={112} y={116} />
      <IsoBuilding color="#9AAE98" height={190} label="하늘마트" width={230} x={660} y={122} />

      <PressScale
        accessibilityHint={
          controlMode === 'touch'
            ? nearbyPortalId === 'home'
              ? '누르면 집 안으로 들어갑니다'
              : '누르면 집 입구로 이동합니다'
            : undefined
        }
        accessibilityLabel={controlMode === 'touch' ? '집으로 이동해 들어가기' : '우리 집 입구'}
        accessibilityRole={controlMode === 'touch' ? 'button' : undefined}
        disabled={controlMode !== 'touch' || controlsLocked}
        onPress={(event) => {
          event?.stopPropagation?.();
          onPortalPress(event, 'home');
        }}
        scaleTo={0.96}
        style={[
          styles.portal,
          {
            left: HOUSE_ENTRANCE_POINT.x - 82,
            top: HOUSE_ENTRANCE_POINT.y - 94,
          },
        ]}
        testID="village-home-portal"
      >
        <InteractionCloud
          icon="home"
          label="우리 집"
          testID="home-proximity-cloud"
          visible={nearbyPortalId === 'home'}
        />
      </PressScale>

      <PressScale
        accessibilityHint={
          controlMode === 'touch'
            ? nearbyPortalId === 'market'
              ? '누르면 하늘마트에 들어갑니다'
              : '누르면 하늘마트 입구로 이동합니다'
            : undefined
        }
        accessibilityLabel={
          controlMode === 'touch' ? '하늘마트로 이동해 들어가기' : '하늘마트 입구'
        }
        accessibilityRole={controlMode === 'touch' ? 'button' : undefined}
        disabled={controlMode !== 'touch' || controlsLocked}
        onPress={(event) => {
          event?.stopPropagation?.();
          onPortalPress(event, 'market');
        }}
        scaleTo={0.96}
        style={[
          styles.portal,
          {
            left: MARKET_ENTRANCE_POINT.x - 82,
            top: MARKET_ENTRANCE_POINT.y - 94,
          },
        ]}
        testID="village-market-portal"
      >
        <InteractionCloud
          icon="storefront"
          label="하늘마트"
          testID="market-proximity-cloud"
          visible={nearbyPortalId === 'market'}
        />
      </PressScale>

      <View pointerEvents="none" style={[styles.originalObstacle, styles.centerPlanter]}>
        <View style={styles.originalShrub} />
        <View style={[styles.originalShrub, styles.originalShrubRight]} />
      </View>
      <View pointerEvents="none" style={[styles.originalObstacle, styles.lowerBlock]}>
        <Text style={styles.objectLabel}>공터</Text>
      </View>

      <VillageLandmarks />

      {VILLAGE_NPCS.map((npc) => (
        <VillageNpc
          controlMode={controlMode}
          controlsLocked={controlsLocked}
          key={npc.id}
          nearby={nearbyNpcId === npc.id}
          npc={npc}
          onPress={onNpcPress}
          questState={npcQuestStates[npc.id]}
        />
      ))}
    </View>
  );
}

function FurnitureLabel({ children }: { children: string }) {
  return <Text style={styles.furnitureLabel}>{children}</Text>;
}

export function HomeWorldLayer({
  controlMode,
  controlsLocked = false,
  fridgeCompleted = false,
  nearbyStationId,
  onStationPress,
  tapTargetMarker = null,
}: HomeWorldLayerProps) {
  return (
    <View pointerEvents="box-none" style={styles.layer} testID="home-world-layer">
      <View pointerEvents="none" style={styles.homeOutside} />
      <View pointerEvents="none" style={styles.homeFloor}>
        <View style={styles.floorStripeOne} />
        <View style={styles.floorStripeTwo} />
        <View style={styles.homeRug} />
      </View>
      <View pointerEvents="none" style={styles.homeTopWall}>
        <Text style={styles.homeTitle}>우리 집</Text>
      </View>

      {tapTargetMarker && controlMode === 'touch' ? (
        <View
          pointerEvents="none"
          style={[
            styles.tapTargetMarker,
            { left: tapTargetMarker.x - 12, top: tapTargetMarker.y - 12 },
          ]}
          testID="touch-target-marker"
        />
      ) : null}

      <PressScale
        accessibilityHint={
          controlMode === 'touch'
            ? nearbyStationId === 'fridge'
              ? '냉장고의 유통기한과 필요한 물건을 확인합니다'
              : '냉장고 앞으로 이동합니다'
            : undefined
        }
        accessibilityLabel="냉장고 확인하기"
        accessibilityRole={controlMode === 'touch' ? 'button' : undefined}
        disabled={controlMode !== 'touch' || controlsLocked}
        onPress={(event) => {
          event?.stopPropagation?.();
          onStationPress(event, 'fridge');
        }}
        scaleTo={0.96}
        style={styles.fridge}
        testID="home-fridge-station"
      >
        <View style={styles.fridgeTopDoor}>
          <View style={styles.fridgeHandle} />
          {fridgeCompleted ? (
            <View style={styles.fridgeCompleteBadge}>
              <Ionicons color="#FFFFFF" name="checkmark" size={14} />
            </View>
          ) : null}
        </View>
        <View style={styles.fridgeBottomDoor} />
        <FurnitureLabel>냉장고</FurnitureLabel>
        <View style={styles.fridgeCloudAnchor}>
          <InteractionCloud
            icon={fridgeCompleted ? 'checkmark' : 'search'}
            label={fridgeCompleted ? '확인 완료' : '냉장고 확인'}
            testID="fridge-proximity-cloud"
            visible={nearbyStationId === 'fridge'}
          />
        </View>
      </PressScale>

      <View pointerEvents="none" style={styles.kitchenCounter}>
        <View style={styles.sinkBasin} />
        <View style={styles.stoveBurner} />
        <View style={[styles.stoveBurner, styles.stoveBurnerRight]} />
        <FurnitureLabel>주방</FurnitureLabel>
      </View>

      <View pointerEvents="none" style={styles.diningTable}>
        <View style={styles.tablePlate} />
        <View style={[styles.tablePlate, styles.tablePlateRight]} />
        <FurnitureLabel>식탁</FurnitureLabel>
      </View>

      <View pointerEvents="none" style={styles.bed}>
        <View style={styles.pillow} />
        <FurnitureLabel>침대</FurnitureLabel>
      </View>

      <View pointerEvents="none" style={styles.sofa}>
        <View style={styles.sofaSeat} />
        <FurnitureLabel>소파</FurnitureLabel>
      </View>

      <View pointerEvents="none" style={styles.tvConsole}>
        <View style={styles.tvScreen} />
        <FurnitureLabel>TV</FurnitureLabel>
      </View>

      <PressScale
        accessibilityHint={
          controlMode === 'touch'
            ? nearbyStationId === 'exit'
              ? '누르면 마을로 나갑니다'
              : '현관으로 이동합니다'
            : undefined
        }
        accessibilityLabel={controlMode === 'touch' ? '집에서 마을로 나가기' : '집 출구'}
        accessibilityRole={controlMode === 'touch' ? 'button' : undefined}
        disabled={controlMode !== 'touch' || controlsLocked}
        onPress={(event) => {
          event?.stopPropagation?.();
          onStationPress(event, 'exit');
        }}
        scaleTo={0.96}
        style={[
          styles.homeExit,
          { left: HOME_EXIT_POINT.x - 86, top: HOME_EXIT_POINT.y - 34 },
        ]}
        testID="home-exit-station"
      >
        <Ionicons color="#617168" name="exit-outline" size={21} />
        <Text style={styles.homeExitText}>마을로 나가기</Text>
        <View style={styles.exitCloudAnchor}>
          <InteractionCloud
            icon="exit-outline"
            label="현관"
            testID="home-exit-proximity-cloud"
            visible={nearbyStationId === 'exit'}
          />
        </View>
      </PressScale>

      <View
        pointerEvents="none"
        style={[
          styles.fridgeInteractionGuide,
          { left: HOME_FRIDGE_POINT.x - 5, top: HOME_FRIDGE_POINT.y - 5 },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFillObject },
  villageGround: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#DDE4D5',
    borderColor: '#B7C1AF',
    borderWidth: 12,
  },
  road: { backgroundColor: '#C8C6B8', position: 'absolute' },
  roadMain: {
    height: 126,
    left: -80,
    top: 444,
    transform: [{ rotate: '-18deg' }],
    width: 1160,
  },
  roadBranch: {
    height: 104,
    left: 420,
    top: 120,
    transform: [{ rotate: '49deg' }],
    width: 760,
  },
  roadEast: {
    height: 126,
    left: 850,
    top: 420,
    transform: [{ rotate: '5deg' }],
    width: 750,
  },
  roadSouth: {
    height: 700,
    left: 900,
    top: 500,
    transform: [{ rotate: '-4deg' }],
    width: 120,
  },
  roadEdge: {
    backgroundColor: 'rgba(255,255,255,0.55)',
    height: 3,
    position: 'absolute',
    width: 1120,
  },
  roadEdgeOne: { left: -50, top: 444, transform: [{ rotate: '-18deg' }] },
  roadEdgeTwo: { left: -30, top: 564, transform: [{ rotate: '-18deg' }] },
  tapTargetMarker: {
    borderColor: 'rgba(52,91,68,0.72)',
    borderRadius: 12,
    borderWidth: 3,
    height: 24,
    position: 'absolute',
    width: 24,
    zIndex: 3,
  },
  building: { alignItems: 'center', position: 'absolute' },
  buildingFront: {
    borderColor: 'rgba(54,54,54,0.25)',
    borderWidth: 2,
    bottom: 0,
    height: '66%',
    left: 0,
    opacity: 0.86,
    position: 'absolute',
    right: 0,
  },
  buildingRoof: {
    aspectRatio: 1,
    borderColor: 'rgba(54,54,54,0.3)',
    borderWidth: 2,
    position: 'absolute',
    top: -18,
    transform: [{ rotate: '45deg' }, { scaleY: 0.64 }],
  },
  buildingDoor: {
    backgroundColor: '#5E625D',
    bottom: 0,
    height: 42,
    position: 'absolute',
    width: 28,
  },
  buildingLabel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#B9B9B9',
    borderRadius: 9,
    borderWidth: 1,
    color: '#333333',
    fontFamily: fonts.semibold,
    fontSize: 12,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
    position: 'absolute',
    top: 46,
  },
  portal: {
    alignItems: 'center',
    height: 78,
    justifyContent: 'center',
    position: 'absolute',
    width: 164,
    zIndex: 9,
  },
  cloudRoot: {
    alignItems: 'center',
    height: 70,
    justifyContent: 'center',
    position: 'relative',
    width: 158,
  },
  cloudBubble: {
    backgroundColor: 'rgba(255,253,248,0.97)',
    borderColor: 'rgba(255,255,255,0.95)',
    borderRadius: 21,
    borderWidth: 1,
    height: 40,
    position: 'absolute',
    top: 4,
    width: 40,
  },
  cloudBubbleLeft: { left: 24 },
  cloudBubbleRight: { right: 25, top: 7 },
  cloudTail: {
    backgroundColor: 'rgba(255,253,248,0.97)',
    bottom: 6,
    height: 17,
    position: 'absolute',
    transform: [{ rotate: '45deg' }],
    width: 17,
    zIndex: 1,
  },
  cloudBody: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,253,248,0.98)',
    borderColor: 'rgba(255,255,255,0.98)',
    borderRadius: 25,
    borderWidth: 1.5,
    elevation: 5,
    flexDirection: 'row',
    gap: 6,
    height: 50,
    justifyContent: 'center',
    paddingHorizontal: 11,
    shadowColor: '#466A60',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    width: 150,
    zIndex: 2,
  },
  cloudIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(107,198,164,0.18)',
    borderRadius: 11,
    height: 29,
    justifyContent: 'center',
    width: 29,
  },
  cloudText: {
    color: '#263A31',
    flex: 1,
    fontFamily: fonts.laundryBold,
    fontSize: 13,
    textAlign: 'center',
  },
  originalObstacle: {
    backgroundColor: '#AAB79B',
    borderColor: '#89947E',
    borderWidth: 2,
    position: 'absolute',
  },
  centerPlanter: {
    height: 105,
    left: 406,
    top: 330,
    transform: [{ rotate: '-8deg' }],
    width: 150,
  },
  lowerBlock: {
    alignItems: 'center',
    height: 110,
    justifyContent: 'center',
    left: 120,
    top: 548,
    width: 184,
  },
  originalShrub: {
    backgroundColor: '#73876C',
    borderRadius: 35,
    height: 70,
    left: 12,
    position: 'absolute',
    top: 14,
    width: 70,
  },
  originalShrubRight: { left: 65, top: 23 },
  objectLabel: { color: '#4D5748', fontFamily: fonts.semibold, fontSize: 13 },
  busStop: {
    backgroundColor: '#A8B9B5',
    borderColor: '#758983',
    borderRadius: 14,
    borderWidth: 2,
    height: 170,
    left: 1030,
    position: 'absolute',
    top: 180,
    width: 290,
  },
  busStopRoof: {
    backgroundColor: '#5D7F94',
    borderRadius: 8,
    height: 24,
    left: -8,
    position: 'absolute',
    right: -8,
    top: -7,
  },
  busStopBench: {
    backgroundColor: '#886D59',
    borderColor: '#5D4A3C',
    borderRadius: 7,
    borderWidth: 2,
    bottom: 25,
    height: 38,
    left: 55,
    position: 'absolute',
    width: 176,
  },
  busStopSign: {
    alignItems: 'center',
    backgroundColor: '#5D7F94',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    position: 'absolute',
    right: 18,
    top: 35,
    width: 40,
  },
  landmarkLabel: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 9,
    bottom: -14,
    color: '#344A43',
    fontFamily: fonts.semibold,
    fontSize: 12,
    left: 72,
    overflow: 'hidden',
    paddingHorizontal: 11,
    paddingVertical: 5,
    position: 'absolute',
  },
  planter: {
    alignItems: 'center',
    backgroundColor: '#AAB79B',
    borderColor: '#89947E',
    borderRadius: 18,
    borderWidth: 2,
    justifyContent: 'center',
    position: 'absolute',
  },
  eastPlanter: { height: 90, left: 900, top: 555, width: 160 },
  southPlanter: { height: 100, left: 350, top: 910, width: 220 },
  shrub: {
    backgroundColor: '#73876C',
    borderRadius: 24,
    height: 48,
    left: 16,
    position: 'absolute',
    top: 17,
    width: 48,
  },
  shrubMiddle: { left: 54, top: 10 },
  shrubRight: { left: 94, top: 18 },
  flowerDot: {
    backgroundColor: '#F1C777',
    borderRadius: 10,
    height: 20,
    left: 37,
    position: 'absolute',
    top: 32,
    width: 20,
  },
  flowerDotTwo: { backgroundColor: '#EAA695', left: 88, top: 20 },
  flowerDotThree: { backgroundColor: '#F6E6A4', left: 143, top: 40 },
  parkLabel: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 8,
    bottom: 6,
    color: '#4D5748',
    fontFamily: fonts.semibold,
    fontSize: 10,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    position: 'absolute',
  },
  npc: {
    alignItems: 'center',
    height: 92,
    position: 'absolute',
    width: 70,
    zIndex: 12,
  },
  npcDistant: { opacity: 0.82 },
  npcCloudAnchor: { left: -44, position: 'absolute', top: -73 },
  npcShadow: {
    backgroundColor: 'rgba(26,35,28,0.2)',
    borderRadius: 20,
    bottom: 22,
    height: 13,
    position: 'absolute',
    width: 38,
  },
  npcBody: {
    alignItems: 'center',
    borderColor: '#3F4D5B',
    borderRadius: 8,
    borderWidth: 2,
    height: 42,
    marginTop: 17,
    width: 28,
  },
  npcHead: {
    backgroundColor: '#D8B493',
    borderColor: '#5E493D',
    borderRadius: 13,
    borderWidth: 2,
    height: 26,
    marginTop: -16,
    width: 26,
  },
  npcCollar: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 4,
    height: 5,
    marginTop: 2,
    width: 16,
  },
  npcName: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    color: '#333333',
    fontFamily: fonts.semibold,
    fontSize: 11,
    marginTop: 2,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  npcRole: {
    color: '#55635A',
    fontFamily: fonts.medium,
    fontSize: 8,
    marginTop: 1,
  },
  homeOutside: { ...StyleSheet.absoluteFillObject, backgroundColor: '#C9D2C2' },
  homeFloor: {
    backgroundColor: '#EEE2CD',
    borderColor: '#A88E72',
    borderRadius: 18,
    borderWidth: 10,
    bottom: 30,
    left: 30,
    overflow: 'hidden',
    position: 'absolute',
    right: 30,
    top: 30,
  },
  floorStripeOne: {
    backgroundColor: 'rgba(180,145,102,0.10)',
    height: 7,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 480,
  },
  floorStripeTwo: {
    backgroundColor: 'rgba(180,145,102,0.10)',
    height: 7,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 735,
  },
  homeRug: {
    backgroundColor: '#C8D7C6',
    borderColor: '#9EB19B',
    borderRadius: 75,
    borderWidth: 3,
    height: 150,
    left: 375,
    position: 'absolute',
    top: 570,
    transform: [{ rotate: '-6deg' }],
    width: 300,
  },
  homeTopWall: {
    alignItems: 'center',
    backgroundColor: '#D8C5A9',
    borderBottomColor: '#9D8267',
    borderBottomWidth: 4,
    height: 58,
    left: 30,
    position: 'absolute',
    right: 30,
    top: 30,
  },
  homeTitle: {
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderRadius: 10,
    color: '#57493C',
    fontFamily: fonts.cafe24Ssurround,
    fontSize: 15,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 6,
    top: 12,
  },
  fridge: {
    alignItems: 'center',
    backgroundColor: '#DCE7E2',
    borderColor: '#789088',
    borderRadius: 13,
    borderWidth: 3,
    height: 170,
    left: 95,
    position: 'absolute',
    top: 90,
    width: 150,
    zIndex: 8,
  },
  fridgeTopDoor: {
    borderBottomColor: '#789088',
    borderBottomWidth: 2,
    height: 72,
    position: 'relative',
    width: '100%',
  },
  fridgeBottomDoor: { flex: 1, width: '100%' },
  fridgeHandle: {
    backgroundColor: '#789088',
    borderRadius: 3,
    bottom: 8,
    height: 5,
    position: 'absolute',
    right: 9,
    width: 29,
  },
  fridgeCompleteBadge: {
    alignItems: 'center',
    backgroundColor: '#6BB894',
    borderColor: '#FFFFFF',
    borderRadius: 13,
    borderWidth: 2,
    height: 26,
    justifyContent: 'center',
    left: 9,
    position: 'absolute',
    top: 9,
    width: 26,
  },
  fridgeCloudAnchor: { left: -5, position: 'absolute', top: 154 },
  furnitureLabel: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 7,
    bottom: -12,
    color: '#4A514D',
    fontFamily: fonts.semibold,
    fontSize: 10,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    position: 'absolute',
  },
  kitchenCounter: {
    alignItems: 'center',
    backgroundColor: '#98B6AA',
    borderColor: '#667F76',
    borderRadius: 12,
    borderWidth: 3,
    height: 105,
    left: 270,
    position: 'absolute',
    top: 90,
    width: 530,
  },
  sinkBasin: {
    backgroundColor: '#D4E0DF',
    borderColor: '#708681',
    borderRadius: 15,
    borderWidth: 2,
    height: 53,
    left: 58,
    position: 'absolute',
    top: 22,
    width: 120,
  },
  stoveBurner: {
    backgroundColor: '#56655F',
    borderColor: '#C7D1CD',
    borderRadius: 24,
    borderWidth: 6,
    height: 48,
    position: 'absolute',
    right: 105,
    top: 25,
    width: 48,
  },
  stoveBurnerRight: { right: 43 },
  diningTable: {
    alignItems: 'center',
    backgroundColor: '#BD9167',
    borderColor: '#826143',
    borderRadius: 52,
    borderWidth: 3,
    height: 125,
    left: 300,
    position: 'absolute',
    top: 330,
    width: 250,
  },
  tablePlate: {
    backgroundColor: '#F7F4E9',
    borderColor: '#D2C5B0',
    borderRadius: 27,
    borderWidth: 2,
    height: 54,
    left: 47,
    position: 'absolute',
    top: 28,
    width: 54,
  },
  tablePlateRight: { left: 149 },
  bed: {
    alignItems: 'center',
    backgroundColor: '#C7D5C1',
    borderColor: '#7E8E78',
    borderRadius: 18,
    borderWidth: 3,
    height: 165,
    left: 90,
    position: 'absolute',
    top: 550,
    width: 170,
  },
  pillow: {
    backgroundColor: '#F6F0E3',
    borderColor: '#CFC6B5',
    borderRadius: 14,
    borderWidth: 2,
    height: 61,
    left: 16,
    position: 'absolute',
    top: 17,
    width: 79,
  },
  sofa: {
    alignItems: 'center',
    backgroundColor: '#C5987E',
    borderColor: '#896752',
    borderRadius: 25,
    borderWidth: 3,
    height: 105,
    left: 560,
    padding: 12,
    position: 'absolute',
    top: 570,
    width: 220,
  },
  sofaSeat: {
    borderColor: '#A77B62',
    borderRadius: 17,
    borderWidth: 2,
    flex: 1,
    width: '100%',
  },
  tvConsole: {
    alignItems: 'center',
    backgroundColor: '#8A755F',
    borderColor: '#5E4D3E',
    borderRadius: 9,
    borderWidth: 3,
    height: 55,
    left: 610,
    position: 'absolute',
    top: 390,
    width: 150,
  },
  tvScreen: {
    backgroundColor: '#4D5C60',
    borderColor: '#2F383A',
    borderRadius: 8,
    borderWidth: 3,
    height: 75,
    position: 'absolute',
    top: -68,
    width: 122,
  },
  homeExit: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: '#B7AC9C',
    borderRadius: 17,
    borderStyle: 'dashed',
    borderWidth: 2,
    flexDirection: 'row',
    gap: 8,
    height: 58,
    justifyContent: 'center',
    position: 'absolute',
    width: 172,
    zIndex: 8,
  },
  homeExitText: { color: '#617168', fontFamily: fonts.bold, fontSize: 13 },
  exitCloudAnchor: { left: 7, position: 'absolute', top: -73 },
  fridgeInteractionGuide: {
    backgroundColor: '#5D987C',
    borderRadius: 5,
    height: 10,
    opacity: 0.34,
    position: 'absolute',
    width: 10,
  },
});
