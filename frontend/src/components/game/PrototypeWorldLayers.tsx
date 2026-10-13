import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  GestureResponderEvent,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  BUS_STOP_POINT,
  HOME_EXIT_POINT,
  HOME_FRIDGE_POINT,
  HOUSE_ENTRANCE_POINT,
  MARKET_BUS_STOP_POINT,
  MARKET_ENTRANCE_POINT,
  Point,
  VILLAGE_BUILDINGS,
  VILLAGE_DECORATIONS,
  VILLAGE_NPCS,
  VillageBuildingDefinition,
  VillageDecorationDefinition,
  VillageNpcDefinition,
  VillageNpcId,
} from '../../game/prototypeWorld';
import {
  villageBuildingArt,
  villageDecorationArt,
  villageLandmarkArt,
} from '../../game/gameAssets';
import { VILLAGE_NPC_ART_SCALE, villageNpcArt } from '../../game/villageNpcArt';
import { getVillageRenderDepth } from '../../game/villageStreets';
import { colors, fonts } from '../../theme';
import { PressScale } from '../PressScale';
import { MODULAR_CHARACTER_CANVAS, ModularCharacter } from './ModularCharacter';
import { VillageStreets } from './VillageStreets';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type PrototypeControlMode = 'joystick' | 'touch';
export type VillagePortalId = 'home' | 'market';
export type HomeStationId = 'fridge' | 'exit';

export type ExpandedVillageLayerProps = {
  children?: ReactNode;
  controlsLocked?: boolean;
  controlMode: PrototypeControlMode;
  nearbyNpcId: VillageNpcId | null;
  nearbyPortalId: VillagePortalId | null;
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
      <View style={styles.cloudBody}>
        <View style={styles.cloudIcon}>
          <Ionicons color="#42695A" name={icon} size={17} />
        </View>
        <Text numberOfLines={1} style={styles.cloudText}>
          {label}
        </Text>
      </View>
    </Animated.View>
  );
}

function VillageBuilding({ building }: { building: VillageBuildingDefinition }) {
  const compact = building.width < 110;
  const artSource = villageBuildingArt[building.id];
  return (
    <View
      pointerEvents="none"
      style={[
        styles.building,
        {
          height: building.height,
          left: building.x,
          top: building.y,
          width: building.width,
          zIndex: getVillageRenderDepth(building.y + building.height),
        },
      ]}
      testID={`village-building-${building.id}`}
    >
      {artSource ? (
        <Image resizeMode="contain" source={artSource} style={styles.buildingArt} />
      ) : (
        <View style={[styles.buildingFront, { backgroundColor: building.color }]}>
          <View style={styles.buildingRoofLine} />
          <View style={[styles.buildingWindow, styles.buildingWindowLeft]} />
          {building.width >= 125 ? (
            <View style={[styles.buildingWindow, styles.buildingWindowRight]} />
          ) : null}
          <View style={styles.buildingDoor} />
        </View>
      )}
      <Text numberOfLines={1} style={[styles.buildingLabel, compact && styles.buildingLabelCompact]}>
        {building.label}
      </Text>
    </View>
  );
}

function VillageDecoration({ decoration }: { decoration: VillageDecorationDefinition }) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.decoration,
        {
          height: decoration.height,
          left: decoration.x,
          top: decoration.y,
          width: decoration.width,
          zIndex: getVillageRenderDepth(decoration.y + decoration.height),
        },
      ]}
      testID={`village-decoration-${decoration.id}`}
    >
      <View style={{ position: 'absolute', bottom: -2, height: Math.min(12, decoration.height * 0.14), width: decoration.width * 0.64, left: decoration.width * 0.18, borderRadius: 999, backgroundColor: 'rgba(78,83,62,0.12)' }} />
      <Image
        fadeDuration={0}
        resizeMode="contain"
        source={villageDecorationArt[decoration.kind]}
        style={[
          styles.decorationArt,
          {
            transform: [
              { scaleX: decoration.flipX ? -1 : 1 },
              { rotate: `${decoration.rotation ?? 0}deg` },
            ],
          },
        ]}
      />
    </View>
  );
}

function VillageParcels() {
  return <View pointerEvents="none" style={styles.layer}>
    <View style={[styles.landscapePatch, {left:20,top:24,width:260,height:579,borderRadius:64,backgroundColor:'#C8D3AD'}]} />
    <View style={[styles.landscapePatch, {left:42,top:185,width:230,height:340,borderRadius:108,borderWidth:33,borderColor:'#E6D7B8',backgroundColor:'#BACDA2'}]} />
    <View style={[styles.landscapePatch, {left:148,top:483,width:62,height:176,borderRadius:24,backgroundColor:'#E6D7B8'}]} />
    <View style={[styles.landscapePatch, {left:585,top:477,width:445,height:145,borderRadius:26,backgroundColor:'#E9E2D2'}]} />
    <View style={[styles.landscapePatch, {left:1482,top:283,width:149,height:319,borderRadius:48,backgroundColor:'#CDD7B7'}]} />
    <View style={[styles.landscapePatch, {left:1072,top:535,width:372,height:88,borderRadius:22,backgroundColor:'#EEE6D7'}]} />
    <View style={[styles.landscapePatch, {left:1215,top:543,width:100,height:118,borderRadius:18,backgroundColor:'#EEE6D7'}]} />
    <View style={[styles.landscapePatch, {left:580,top:1143,width:1068,height:53,borderRadius:24,backgroundColor:'#EEE6D7'}]} />
    <View style={[styles.landscapePatch, {left:1220,top:877,width:64,height:313,borderRadius:24,backgroundColor:'#EEE6D7'}]} />
    <View style={[styles.landscapePatch, {left:1185,top:1180,width:55,height:309,borderRadius:24,backgroundColor:'#EEE6D7'}]} />
    <View style={[styles.landscapePatch, {left:625,top:1199,width:182,height:230,borderRadius:44,backgroundColor:'#D0D8BC'}]} />
    <View style={[styles.landscapePatch, {left:22,top:1360,width:259,height:205,borderRadius:44,backgroundColor:'#CAD5B3'}]} />
    <View style={[styles.landscapePatch, {left:1975,top:1443,width:208,height:112,borderRadius:32,backgroundColor:'#CCD6B6'}]} />
  </View>;
}

function VillageBusStop({label, point}: {label:string;point:Point}) {
  return <View pointerEvents="none" testID={label === '마트 앞' ? 'village-market-bus-stop' : 'village-east-bus-stop'}
    style={{position:'absolute',left:point.x-80,top:point.y-100,width:160,height:116,zIndex:getVillageRenderDepth(point.y-16)}}>
    <View style={{position:'absolute',left:-6,top:85,width:172,height:30,borderRadius:12,backgroundColor:'#E0D7BF',borderColor:'#C8BEA5',borderWidth:1}} />
    <Image fadeDuration={0} resizeMode="contain" source={villageLandmarkArt.busStop} style={{position:'absolute',left:0,top:0,width:160,height:86}}/>
    <Text style={[styles.landmarkLabel,{left:40,bottom:21,fontSize:9,paddingHorizontal:7}]}>{label}</Text>
  </View>;
}

function VillageLandmarks() {
  return <>
    <VillageBusStop label="마트 앞" point={MARKET_BUS_STOP_POINT}/>
    <VillageBusStop label="동쪽 정류장" point={BUS_STOP_POINT}/>
  </>;
}
function VillageNpc({
  controlMode,
  controlsLocked,
  nearby,
  npc,
  onPress,
}: {
  controlMode: PrototypeControlMode;
  controlsLocked: boolean;
  nearby: boolean;
  npc: VillageNpcDefinition;
  onPress: (event: GestureResponderEvent, npc: VillageNpcDefinition) => void;
}) {
  const rolePrefix = npc.id === 'minsu' ? '안내원 ' : '';
  const touchLabel = `${rolePrefix}${npc.name}로 이동해 대화하기`;
  const artwork = villageNpcArt[npc.id];

  return (
    <PressScale
      accessibilityHint={
        controlMode === 'touch'
          ? nearby
            ? npc.activityLabel
              ? `대화하거나 ${npc.activityLabel}를 시작합니다`
              : '대화하거나 부탁을 확인합니다'
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
        {
          left: npc.point.x - 35,
          top: npc.point.y - (artwork ? MODULAR_CHARACTER_CANVAS.pivotY * VILLAGE_NPC_ART_SCALE : 45),
          zIndex: getVillageRenderDepth(npc.point.y) + 1,
        },
        artwork ? styles.npcIllustrated : undefined,
        !nearby && styles.npcDistant,
      ]}
      testID={`village-npc-${npc.id}`}
    >
      <View style={styles.npcCloudAnchor}>
        <InteractionCloud
          icon="chatbubble"
          label={npc.activityLabel ? `${npc.name} · ${npc.activityLabel}` : npc.name}
          testID={`npc-proximity-cloud-${npc.id}`}
          visible={nearby}
        />
      </View>
      {artwork ? (
        <ModularCharacter
          layers={[{ id: npc.id, slot: 'bodySkin', source: artwork, fadeDuration: 0 }]}
          scale={VILLAGE_NPC_ART_SCALE}
          testID={`village-npc-art-${npc.id}`}
        />
      ) : (
        <>
          <View style={styles.npcShadow} />
          <View style={[styles.npcBody, { backgroundColor: npc.accentColor }]}>
            <View style={styles.npcHead} />
            <View style={styles.npcCollar} />
          </View>
        </>
      )}
      <Text style={styles.npcName}>{npc.name}</Text>
      <Text style={styles.npcRole}>{npc.roleLabel}</Text>
    </PressScale>
  );
}

export function ExpandedVillageLayer({
  children,
  controlMode,
  controlsLocked = false,
  nearbyNpcId,
  nearbyPortalId,
  onNpcPress,
  onPortalPress,
  tapTargetMarker = null,
}: ExpandedVillageLayerProps) {
  return (
    <View pointerEvents="box-none" style={styles.layer} testID="expanded-village-layer">
      <VillageStreets />
      <VillageParcels />

      {VILLAGE_DECORATIONS.filter(({ layer }) => layer === 'back').map((decoration) => (
        <VillageDecoration decoration={decoration} key={decoration.id} />
      ))}

      <VillageLandmarks />

      {VILLAGE_BUILDINGS.map((building) => (
        <VillageBuilding building={building} key={building.id} />
      ))}

      {VILLAGE_DECORATIONS.filter(({ layer }) => layer === 'front').map((decoration) => (
        <VillageDecoration decoration={decoration} key={decoration.id} />
      ))}
      {children}

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

      {VILLAGE_NPCS.map((npc) => (
        <VillageNpc
          controlMode={controlMode}
          controlsLocked={controlsLocked}
          key={npc.id}
          nearby={nearbyNpcId === npc.id}
          npc={npc}
          onPress={onNpcPress}
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
              ? '냉장고를 열어 살펴보기 또는 요리를 선택합니다'
              : '냉장고 앞으로 이동합니다'
            : undefined
        }
        accessibilityLabel="냉장고로 이동해 열기"
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
            label="냉장고"
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
  layer: { ...StyleSheet.absoluteFill },
  landscapePatch: { position: 'absolute' },
  decoration: { position: 'absolute' },
  decorationBack: { zIndex: 1 },
  decorationFront: { zIndex: 5 },
  decorationArt: { height: '100%', width: '100%' },
  tapTargetMarker: {
    borderColor: 'rgba(52,91,68,0.72)',
    borderRadius: 12,
    borderWidth: 3,
    height: 24,
    position: 'absolute',
    width: 24,
    zIndex: 3,
  },
  building: { alignItems: 'center', position: 'absolute', zIndex: 2 },
  buildingArt: {
    height: '100%',
    left: 0,
    position: 'absolute',
    top: 0,
    width: '100%',
  },
  buildingFront: {
    borderColor: 'rgba(54,54,54,0.25)',
    borderRadius: 9,
    borderWidth: 2,
    height: '100%',
    overflow: 'hidden',
    position: 'absolute',
    width: '100%',
  },
  buildingRoofLine: {
    backgroundColor: 'rgba(67,71,66,0.2)',
    height: 22,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  buildingDoor: {
    backgroundColor: 'rgba(66,69,65,0.72)',
    bottom: 0,
    height: 52,
    position: 'absolute',
    width: 38,
  },
  buildingWindow: {
    backgroundColor: 'rgba(236,243,236,0.7)',
    borderColor: 'rgba(73,82,76,0.25)',
    borderRadius: 5,
    borderWidth: 1,
    height: 36,
    position: 'absolute',
    top: '52%',
    width: 46,
  },
  buildingWindowLeft: { left: 22 },
  buildingWindowRight: { right: 22 },
  buildingLabel: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderColor: 'rgba(95,105,97,0.35)',
    borderRadius: 10,
    borderWidth: 1,
    color: '#333333',
    fontFamily: fonts.semibold,
    fontSize: 12,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
    position: 'absolute',
    top: 32,
    zIndex: 3,
  },
  buildingLabelCompact: { fontSize: 9, paddingHorizontal: 5 },
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
    alignSelf: 'center',
    height: 38,
    justifyContent: 'center',
    position: 'relative',
  },
  cloudBody: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,253,248,0.98)',
    borderColor: 'rgba(255,255,255,0.98)',
    borderRadius: 16,
    borderWidth: 1,
    elevation: 5,
    flexDirection: 'row',
    gap: 5,
    height: 32,
    justifyContent: 'center',
    maxWidth: 190,
    minWidth: 64,
    paddingHorizontal: 12,
    shadowColor: '#466A60',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    zIndex: 2,
  },
  cloudIcon: {
    alignItems: 'center',
    height: 18,
    justifyContent: 'center',
    width: 18,
  },
  cloudText: {
    color: '#263A31',
    flexShrink: 1,
    fontFamily: fonts.cafe24Ssurround,
    fontSize: 13,
    lineHeight: 16,
    textAlign: 'center',
    transform: [{ translateY: 1 }],
  },
  busStop: {
    height: 70,
    position: 'absolute',
    width: 128,
    zIndex: 4,
  },
  landmarkArt: {
    height: '100%',
    left: 0,
    position: 'absolute',
    top: 0,
    width: '100%',
  },
  landmarkLabel: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 7,
    bottom: 0,
    color: '#344A43',
    fontFamily: fonts.semibold,
    fontSize: 9,
    left: 0,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    position: 'absolute',
  },
  park: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
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
  communityGarden: {
    backgroundColor: '#B3C2A5',
    borderColor: '#88997F',
    borderRadius: 8,
    borderWidth: 2,
    height: 90,
    left: 1480,
    overflow: 'hidden',
    position: 'absolute',
    top: 510,
    width: 210,
    zIndex: 1,
  },
  communityGardenPath: {
    backgroundColor: 'rgba(239,232,207,0.72)',
    bottom: 0,
    left: 92,
    position: 'absolute',
    top: 0,
    width: 25,
  },
  communityShrub: {
    backgroundColor: '#70896D',
    borderRadius: 20,
    height: 40,
    position: 'absolute',
    top: 13,
    width: 40,
  },
  communityShrubOne: { left: 20 },
  communityShrubTwo: { right: 20, top: 31 },
  communityGardenLabel: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 6,
    bottom: 3,
    color: '#4D5748',
    fontFamily: fonts.semibold,
    fontSize: 8,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
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
  npcIllustrated: { height: MODULAR_CHARACTER_CANVAS.height * VILLAGE_NPC_ART_SCALE + 30 },
  npcCloudAnchor: { alignItems: 'center', left: -65, position: 'absolute', top: -45, width: 200 },
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
  homeOutside: { ...StyleSheet.absoluteFill, backgroundColor: '#C9D2C2' },
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
  fridgeCloudAnchor: { alignItems: 'center', left: -25, position: 'absolute', top: 154, width: 200 },
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
  exitCloudAnchor: { alignItems: 'center', left: -18, position: 'absolute', top: -55, width: 200 },
  fridgeInteractionGuide: {
    backgroundColor: '#5D987C',
    borderRadius: 5,
    height: 10,
    opacity: 0.34,
    position: 'absolute',
    width: 10,
  },
});
