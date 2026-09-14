import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { ComponentProps, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  GestureResponderEvent,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { PressScale } from '../components/PressScale';
import {
  BANANA_YOGURT_CUP_RECIPE,
  type CookingStageDefinition,
  type CookingStageId,
} from '../game/cookingRecipe';
import { colors, fonts } from '../theme';

type CookingPhase = 'briefing' | 'playing' | 'result';
type CookingMode = 'challenge' | 'practice';
type DragDirection = 'down' | 'right' | 'up';
type IngredientOptionId = 'banana' | 'cereal' | 'juice' | 'milk' | 'yogurt';
type ToolOptionId = 'bowl' | 'frying-pan' | 'knife' | 'spoon';
type ChallengeDecisionId = 'mix-now' | 'peel-banana' | 'pour-yogurt';
type IoniconName = ComponentProps<typeof Ionicons>['name'];

type CookingSimulationScreenProps = {
  onClose: () => void;
  onComplete?: () => void;
};

const INGREDIENT_OPTIONS: readonly {
  color: string;
  icon: IoniconName;
  id: IngredientOptionId;
  name: string;
}[] = [
  { color: '#F5D66C', icon: 'nutrition', id: 'banana', name: '바나나' },
  { color: '#BEDCEB', icon: 'ice-cream', id: 'yogurt', name: '요거트' },
  { color: '#E7B875', icon: 'grid', id: 'cereal', name: '시리얼' },
  { color: '#DCE9F3', icon: 'water', id: 'milk', name: '우유' },
  { color: '#F2B385', icon: 'cafe', id: 'juice', name: '주스' },
];

const TOOL_OPTIONS: readonly {
  color: string;
  icon: IoniconName;
  id: ToolOptionId;
  name: string;
}[] = [
  { color: '#DDE9E2', icon: 'ellipse-outline', id: 'bowl', name: '그릇' },
  { color: '#E6E8E4', icon: 'restaurant', id: 'spoon', name: '숟가락' },
  { color: '#E8E0D6', icon: 'cut', id: 'knife', name: '칼' },
  { color: '#E8D9D0', icon: 'flame-outline', id: 'frying-pan', name: '프라이팬' },
];

const RECIPE_INGREDIENT_IDS = new Set<IngredientOptionId>(['banana', 'cereal', 'yogurt']);
const REQUIRED_INGREDIENT_IDS = new Set<IngredientOptionId>(['banana', 'yogurt']);
const REQUIRED_TOOL_IDS = new Set<ToolOptionId>(['bowl', 'spoon']);
const CHALLENGE_DECISION_OPTIONS: readonly {
  id: ChallengeDecisionId;
  label: string;
}[] = [
  { id: 'peel-banana', label: '바나나 껍질을 벗긴다' },
  { id: 'pour-yogurt', label: '요거트를 먼저 모두 붓는다' },
  { id: 'mix-now', label: '빈 그릇을 먼저 젓는다' },
];

type CleanupTarget = 'food' | 'recycle' | 'sink' | 'wipe';

const CLEANUP_TASKS: readonly {
  accessibilityLabel: string;
  color: string;
  icon: IoniconName;
  itemName: string;
  target: CleanupTarget;
}[] = [
  {
    accessibilityLabel: '바나나 껍질 음식물 통에 넣기',
    color: '#8A6A35',
    icon: 'nutrition',
    itemName: '바나나 껍질',
    target: 'food',
  },
  {
    accessibilityLabel: '빈 요거트 컵 재활용 통에 넣기',
    color: '#5D8FA7',
    icon: 'ice-cream',
    itemName: '빈 요거트 컵',
    target: 'recycle',
  },
  {
    accessibilityLabel: '사용한 숟가락 싱크대에 넣기',
    color: '#667B70',
    icon: 'restaurant',
    itemName: '사용한 숟가락',
    target: 'sink',
  },
  {
    accessibilityLabel: '사용한 그릇 싱크대에 넣기',
    color: '#6D8177',
    icon: 'ellipse-outline',
    itemName: '사용한 그릇',
    target: 'sink',
  },
  {
    accessibilityLabel: '행주로 흘린 요거트 닦기',
    color: '#6E907F',
    icon: 'square-outline',
    itemName: '깨끗한 행주',
    target: 'wipe',
  },
];
const STAGE_COLORS: Record<CookingStageId, string> = {
  cleanup: '#70A095',
  ingredients: '#79A98D',
  mix: '#87A978',
  plate: '#D58C70',
  peel: '#E2BC4F',
  split: '#DDA66A',
  topping: '#C98E58',
  yogurt: '#76A9BF',
};

const CHALLENGE_STAGE_SECONDS: Record<CookingStageId, number> = {
  cleanup: 28,
  ingredients: 30,
  mix: 30,
  plate: 22,
  peel: 25,
  split: 35,
  topping: 25,
  yogurt: 30,
};

function stopPropagation(event?: GestureResponderEvent) {
  event?.stopPropagation?.();
}

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function dragTarget(direction: DragDirection, distance: number) {
  if (direction === 'right') return { x: distance, y: 0 };
  if (direction === 'up') return { x: 0, y: -distance };
  return { x: 0, y: distance };
}

function dragSucceeded(direction: DragDirection, dx: number, dy: number, threshold: number) {
  if (direction === 'right') return dx >= threshold && Math.abs(dy) <= threshold * 1.3;
  if (direction === 'up') return dy <= -threshold && Math.abs(dx) <= threshold * 1.3;
  return dy >= threshold && Math.abs(dx) <= threshold * 1.3;
}

function DragAction({
  accessibilityHint,
  accessibilityLabel,
  children,
  direction,
  disabled = false,
  onDrop,
  onDragStateChange,
  onGestureQuality,
  onMiss,
  style,
  threshold = 52,
}: {
  accessibilityHint: string;
  accessibilityLabel: string;
  children: ReactNode;
  direction: DragDirection;
  disabled?: boolean;
  onDrop: () => void;
  onDragStateChange?: (dragging: boolean) => void;
  onGestureQuality?: (quality: number) => void;
  onMiss: () => void;
  style?: StyleProp<ViewStyle>;
  threshold?: number;
}) {
  const translation = useRef(new Animated.ValueXY()).current;
  const dragScale = useRef(new Animated.Value(1)).current;
  const onDropRef = useRef(onDrop);
  const onDragStateChangeRef = useRef(onDragStateChange);
  const onGestureQualityRef = useRef(onGestureQuality);
  const onMissRef = useRef(onMiss);
  const disabledRef = useRef(disabled);
  onDropRef.current = onDrop;
  onDragStateChangeRef.current = onDragStateChange;
  onGestureQualityRef.current = onGestureQuality;
  onMissRef.current = onMiss;
  disabledRef.current = disabled;

  const resetDrag = (missed: boolean) => {
    onDragStateChangeRef.current?.(false);
    Animated.parallel([
      Animated.spring(translation, {
        damping: 15,
        stiffness: 230,
        toValue: { x: 0, y: 0 },
        useNativeDriver: false,
      }),
      Animated.spring(dragScale, {
        damping: 14,
        stiffness: 240,
        toValue: 1,
        useNativeDriver: false,
      }),
    ]).start(() => {
      if (missed) onMissRef.current();
    });
  };

  const completeDrag = (quality: number) => {
    onDragStateChangeRef.current?.(false);
    const target = dragTarget(direction, threshold + 30);
    Animated.parallel([
      Animated.timing(translation, {
        duration: 130,
        easing: Easing.out(Easing.cubic),
        toValue: target,
        useNativeDriver: false,
      }),
      Animated.timing(dragScale, {
        duration: 130,
        toValue: 0.9,
        useNativeDriver: false,
      }),
    ]).start(() => {
      translation.setValue({ x: 0, y: 0 });
      dragScale.setValue(1);
      onGestureQualityRef.current?.(quality);
      onDropRef.current();
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          !disabledRef.current && Math.abs(gesture.dx) + Math.abs(gesture.dy) > 3,
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          !disabledRef.current && Math.abs(gesture.dx) + Math.abs(gesture.dy) > 5,
        onPanResponderGrant: () => {
          onDragStateChangeRef.current?.(true);
          Animated.spring(dragScale, {
            damping: 13,
            stiffness: 260,
            toValue: 1.07,
            useNativeDriver: false,
          }).start();
        },
        onPanResponderMove: (_, gesture) => {
          translation.setValue({ x: gesture.dx, y: gesture.dy });
        },
        onPanResponderRelease: (_, gesture) => {
          if (dragSucceeded(direction, gesture.dx, gesture.dy, threshold)) {
            const primaryDistance =
              direction === 'right'
                ? gesture.dx
                : direction === 'up'
                  ? -gesture.dy
                  : gesture.dy;
            const crossDistance =
              direction === 'right' ? Math.abs(gesture.dy) : Math.abs(gesture.dx);
            const reachScore = Math.min(1, primaryDistance / (threshold + 26));
            const straightScore = Math.max(0, 1 - crossDistance / (threshold * 1.4));
            completeDrag(Math.round((reachScore * 0.45 + straightScore * 0.55) * 100));
          }
          else resetDrag(true);
        },
        onPanResponderTerminate: () => resetDrag(false),
        onPanResponderTerminationRequest: () => false,
        onStartShouldSetPanResponder: () => !disabledRef.current,
      }),
    [direction, threshold, translation, dragScale],
  );

  return (
    <Animated.View
      {...panResponder.panHandlers}
      accessibilityActions={[{ label: accessibilityHint, name: 'activate' }]}
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessible
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'activate' && !disabledRef.current) {
          onGestureQualityRef.current?.(100);
          onDropRef.current();
        }
      }}
      style={[
        styles.draggable,
        style,
        { transform: [{ translateX: translation.x }, { translateY: translation.y }, { scale: dragScale }] },
        disabled && styles.draggableDisabled,
      ]}
    >
      {children}
    </Animated.View>
  );
}

function CircularMixAction({
  accessibilityLabel,
  children,
  disabled,
  onCircle,
  onDragStateChange,
  onGestureQuality,
  onMiss,
}: {
  accessibilityLabel: string;
  children: ReactNode;
  disabled: boolean;
  onCircle: () => void;
  onDragStateChange?: (dragging: boolean) => void;
  onGestureQuality?: (quality: number) => void;
  onMiss: () => void;
}) {
  const translation = useRef(new Animated.ValueXY()).current;
  const accumulatedAngle = useRef(0);
  const lastAngle = useRef<number | null>(null);
  const quadrants = useRef(new Set<number>());
  const onCircleRef = useRef(onCircle);
  const onDragStateChangeRef = useRef(onDragStateChange);
  const onGestureQualityRef = useRef(onGestureQuality);
  const onMissRef = useRef(onMiss);
  const disabledRef = useRef(disabled);
  onCircleRef.current = onCircle;
  onDragStateChangeRef.current = onDragStateChange;
  onGestureQualityRef.current = onGestureQuality;
  onMissRef.current = onMiss;
  disabledRef.current = disabled;

  const reset = (missed: boolean) => {
    onDragStateChangeRef.current?.(false);
    Animated.spring(translation, {
      damping: 15,
      stiffness: 220,
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
    }).start(() => {
      if (missed) onMissRef.current();
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          !disabledRef.current && Math.abs(gesture.dx) + Math.abs(gesture.dy) > 3,
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          !disabledRef.current && Math.abs(gesture.dx) + Math.abs(gesture.dy) > 5,
        onPanResponderGrant: () => {
          onDragStateChangeRef.current?.(true);
          accumulatedAngle.current = 0;
          lastAngle.current = null;
          quadrants.current.clear();
        },
        onPanResponderMove: (_, gesture) => {
          const next = { x: gesture.dx, y: gesture.dy };
          const rawRadius = Math.hypot(next.x, next.y);
          const angle = Math.atan2(next.y, next.x);
          if (rawRadius >= 18) {
            quadrants.current.add(Math.floor(((angle + Math.PI) / (Math.PI * 2)) * 4) % 4);
            if (lastAngle.current !== null) {
              let delta = angle - lastAngle.current;
              if (delta > Math.PI) delta -= Math.PI * 2;
              if (delta < -Math.PI) delta += Math.PI * 2;
              if (Math.abs(delta) <= Math.PI / 2) accumulatedAngle.current += delta;
            }
            lastAngle.current = angle;
          }
          const radius = Math.min(54, rawRadius);
          const ratio = rawRadius > 0 ? radius / rawRadius : 0;
          translation.setValue({ x: next.x * ratio, y: next.y * ratio });
        },
        onPanResponderRelease: () => {
          const completed = Math.abs(accumulatedAngle.current) >= Math.PI * 1.45 && quadrants.current.size >= 3;
          reset(!completed);
          if (completed) {
            const rotationScore = Math.min(1, Math.abs(accumulatedAngle.current) / (Math.PI * 2));
            const coverageScore = Math.min(1, quadrants.current.size / 4);
            onGestureQualityRef.current?.(
              Math.round((rotationScore * 0.55 + coverageScore * 0.45) * 100),
            );
            onCircleRef.current();
          }
        },
        onPanResponderTerminate: () => reset(false),
        onPanResponderTerminationRequest: () => false,
        onStartShouldSetPanResponder: () => !disabledRef.current,
      }),
    [translation],
  );

  return (
    <Animated.View
      {...panResponder.panHandlers}
      accessibilityActions={[{ label: '숟가락으로 원 그리기', name: 'activate' }]}
      accessibilityHint="숟가락을 잡고 그릇 안에서 한 바퀴 돌리세요"
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessible
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'activate' && !disabledRef.current) {
          onGestureQualityRef.current?.(100);
          onCircleRef.current();
        }
      }}
      style={[styles.mixDragLayer, { transform: [{ translateX: translation.x }, { translateY: translation.y }] }]}
    >
      {children}
    </Animated.View>
  );
}

function BananaArt({ peelProgress = 0, small = false }: { peelProgress?: number; small?: boolean }) {
  const scale = small ? 0.68 : 1;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.bananaArt, { transform: [{ scale }] }]}
    >
      <View style={[styles.bananaStem, peelProgress >= 3 && styles.bananaStemOpen]} />
      <View style={[styles.bananaFruit, peelProgress >= 1 && styles.bananaFruitVisible]} />
      {[0, 1, 2].map((index) => (
        <View
          key={index}
          style={[
            styles.bananaPeel,
            index === 0 && styles.bananaPeelLeft,
            index === 1 && styles.bananaPeelMiddle,
            index === 2 && styles.bananaPeelRight,
            peelProgress > index && styles.bananaPeelOpen,
          ]}
        />
      ))}
      <View style={styles.bananaTip} />
    </View>
  );
}

function RecipeBowl({
  bananaPieces = 0,
  large = false,
  mixCount = 0,
  toppingCount = 0,
  yogurtScoops = 0,
  showSpoon = true,
}: {
  bananaPieces?: number;
  large?: boolean;
  mixCount?: number;
  toppingCount?: number;
  yogurtScoops?: number;
  showSpoon?: boolean;
}) {
  const bowlScale = large ? 1.12 : 0.9;
  const fillHeight = Math.min(18 + yogurtScoops * 10, 48);
  const mixColor = mixCount > 0 ? '#F0DEB0' : '#F6F0DE';
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.bowlStage, { transform: [{ scale: bowlScale }] }]}
    >
      <View style={styles.bowlBack} />
      <View style={[styles.bowlFood, { backgroundColor: mixColor, height: fillHeight }]}>
        {Array.from({ length: bananaPieces }).map((_, index) => (
          <View
            key={`banana-${index}`}
            style={[
              styles.bowlBananaPiece,
              { left: 18 + (index % 4) * 29, top: 5 + (index % 2) * 13 },
            ]}
          />
        ))}
        {Array.from({ length: toppingCount }).map((_, index) => (
          <View
            key={`topping-${index}`}
            style={[
              styles.bowlTopping,
              { left: 25 + (index % 5) * 22, top: 4 + (index % 2) * 8 },
            ]}
          />
        ))}
      </View>
      <View style={styles.bowlFront} />
      {mixCount > 0 && showSpoon ? (
        <View style={[styles.spoon, { transform: [{ rotate: `${-22 + (mixCount % 3) * 18}deg` }] }]}>
          <View style={styles.spoonHandle} />
          <View style={styles.spoonHead} />
        </View>
      ) : null}
    </View>
  );
}

function RecipeCoverArt() {
  return (
    <View pointerEvents="none" style={styles.coverArt}>
      <View style={styles.coverSunOne} />
      <View style={styles.coverSunTwo} />
      <View style={styles.coverBanana}>
        <BananaArt peelProgress={3} small />
      </View>
      <View style={styles.coverBowl}>
        <RecipeBowl bananaPieces={4} toppingCount={4} yogurtScoops={3} />
      </View>
      <View style={styles.coverSparkle}>
        <Ionicons color="#FFF8DC" name="sparkles" size={24} />
      </View>
    </View>
  );
}

function ProgressDots({ stageIndex }: { stageIndex: number }) {
  return (
    <View accessibilityElementsHidden pointerEvents="none" style={styles.progressDots}>
      {BANANA_YOGURT_CUP_RECIPE.stages.map((stage, index) => (
        <View
          key={stage.id}
          style={[
            styles.progressDot,
            index < stageIndex && styles.progressDotDone,
            index === stageIndex && styles.progressDotCurrent,
          ]}
        >
          {index < stageIndex ? <Ionicons color="#FFFFFF" name="checkmark" size={10} /> : null}
        </View>
      ))}
    </View>
  );
}

function StageProgress({ current, target }: { current: number; target: number }) {
  return (
    <View accessibilityLabel={`${target}번 중 ${Math.min(current, target)}번 완료`} style={styles.actionProgress}>
      {Array.from({ length: target }).map((_, index) => (
        <View
          key={index}
          style={[styles.actionProgressSegment, index < current && styles.actionProgressSegmentDone]}
        />
      ))}
    </View>
  );
}

function IngredientStage({
  notice,
  onDragStateChange,
  onGestureQuality,
  onMiss,
  onSelect,
  onToolSelect,
  selected,
  selectedTools,
}: {
  notice: string | null;
  onDragStateChange: (dragging: boolean) => void;
  onGestureQuality: (quality: number) => void;
  onMiss: () => void;
  onSelect: (id: IngredientOptionId) => void;
  onToolSelect: (id: ToolOptionId) => void;
  selected: ReadonlySet<IngredientOptionId>;
  selectedTools: ReadonlySet<ToolOptionId>;
}) {
  const selectedItems = INGREDIENT_OPTIONS.filter(
    (item) => selected.has(item.id) && RECIPE_INGREDIENT_IDS.has(item.id),
  );
  return (
    <>
      <View style={styles.toolSelectionSection}>
        <View style={styles.toolSelectionHeader}>
          <View>
            <Text style={styles.toolSelectionTitle}>먼저 쓸 도구를 골라요</Text>
            <Text style={styles.toolSelectionHint}>이 요리는 불과 칼을 쓰지 않아요</Text>
          </View>
          <Text style={styles.toolSelectionCount}>{selectedTools.size}/2</Text>
        </View>
        <View style={styles.toolOptionRow}>
          {TOOL_OPTIONS.map((tool) => {
            const selectedTool = selectedTools.has(tool.id);
            return (
              <PressScale
                accessibilityHint="바나나 요거트 컵에 쓸 도구인지 골라 보세요"
                accessibilityLabel={`${tool.name} 선택${selectedTool ? '됨' : ''}`}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedTool }}
                disabled={selectedTool}
                key={tool.id}
                onPress={(event) => {
                  stopPropagation(event);
                  onToolSelect(tool.id);
                }}
                scaleTo={0.95}
                style={[styles.toolOption, selectedTool && styles.toolOptionSelected]}
              >
                <View style={[styles.toolOptionIcon, { backgroundColor: tool.color }]}>
                  <Ionicons color="#536057" name={tool.icon} size={22} />
                </View>
                <Text style={styles.toolOptionName}>{tool.name}</Text>
                {selectedTool ? (
                  <View style={styles.toolOptionCheck}>
                    <Ionicons color="#FFFFFF" name="checkmark" size={11} />
                  </View>
                ) : null}
              </PressScale>
            );
          })}
        </View>
      </View>
      <View style={styles.ingredientBasket}>
        <View style={styles.ingredientBasketIcon}>
          <Ionicons color="#FFFFFF" name="basket" size={22} />
        </View>
        <View style={styles.ingredientBasketCopy}>
          <Text style={styles.ingredientBasketTitle}>준비 바구니</Text>
          <Text style={styles.ingredientBasketHint}>
            {selectedItems.length > 0
              ? selectedItems.map((item) => item.name).join(' · ')
              : '바나나와 요거트를 여기에 놓아요'}
          </Text>
        </View>
      </View>
      <View style={styles.dragGuideRow}>
        <Ionicons color="#688072" name="arrow-up" size={17} />
        <Text style={styles.dragGuideText}>재료를 잡아 위로 끌어 놓아요</Text>
      </View>
      <View style={styles.ingredientGrid}>
        {INGREDIENT_OPTIONS.map((item) => {
          const isSelected = selected.has(item.id);
          return (
            <DragAction
              accessibilityHint="잡아서 위쪽 준비 바구니로 끌어 놓으세요"
              accessibilityLabel={`${item.name}${isSelected ? ', 준비함' : ', 바구니로 끌기'}`}
              direction="up"
              disabled={isSelected}
              key={item.id}
              onDragStateChange={onDragStateChange}
              onDrop={() => onSelect(item.id)}
              onGestureQuality={onGestureQuality}
              onMiss={onMiss}
              style={styles.ingredientDragWrap}
              threshold={44}
            >
              <View style={[styles.ingredientCard, isSelected && styles.ingredientCardSelected]}>
                <View style={[styles.ingredientIcon, { backgroundColor: item.color }]}>
                  <Ionicons color="#4B514C" name={item.icon} size={29} />
                </View>
                <Text style={styles.ingredientName}>{item.name}</Text>
                {item.id === 'cereal' && !isSelected ? (
                  <Text style={styles.ingredientOptional}>선택</Text>
                ) : null}
                {isSelected ? (
                  <View style={styles.ingredientCheck}>
                    <Ionicons color="#FFFFFF" name="checkmark" size={13} />
                  </View>
                ) : null}
              </View>
            </DragAction>
          );
        })}
      </View>
      <View accessibilityLiveRegion="polite" style={styles.inlineNoticeArea}>
        {notice ? <Text style={styles.inlineNotice}>{notice}</Text> : null}
      </View>
    </>
  );
}

function ChallengeDecision({
  feedback,
  onSelect,
}: {
  feedback: string | null;
  onSelect: (id: ChallengeDecisionId) => void;
}) {
  return (
    <View accessibilityLabel="다음 요리 순서 고르기" style={styles.challengeDecision}>
      <View style={styles.challengeDecisionHeader}>
        <View style={styles.challengeDecisionIcon}>
          <Ionicons color="#8B653F" name="footsteps" size={20} />
        </View>
        <View style={styles.challengeDecisionCopy}>
          <Text style={styles.challengeDecisionEyebrow}>도전 판단</Text>
          <Text style={styles.challengeDecisionTitle}>준비가 끝났어요. 다음에는 무엇을 할까요?</Text>
        </View>
      </View>
      <View style={styles.challengeDecisionOptions}>
        {CHALLENGE_DECISION_OPTIONS.map((option) => (
          <PressScale
            accessibilityLabel={option.label}
            accessibilityRole="button"
            key={option.id}
            onPress={(event) => {
              stopPropagation(event);
              onSelect(option.id);
            }}
            scaleTo={0.97}
            style={styles.challengeDecisionOption}
          >
            <Text style={styles.challengeDecisionOptionText}>{option.label}</Text>
            <Ionicons color="#698073" name="chevron-forward" size={18} />
          </PressScale>
        ))}
      </View>
      {feedback ? (
        <View accessibilityLiveRegion="polite" style={styles.challengeDecisionFeedback}>
          <Ionicons color="#966743" name="information-circle" size={17} />
          <Text style={styles.challengeDecisionFeedbackText}>{feedback}</Text>
        </View>
      ) : null}
    </View>
  );
}

function PeelStage({
  onAction,
  onDragStateChange,
  onGestureQuality,
  onMiss,
  progress,
}: {
  onAction: () => void;
  onDragStateChange: (dragging: boolean) => void;
  onGestureQuality: (quality: number) => void;
  onMiss: () => void;
  progress: number;
}) {
  return (
    <View style={styles.mainFoodAction}>
      <DragAction
        accessibilityHint="바나나 껍질을 잡고 아래로 길게 당기세요"
        accessibilityLabel={`바나나 껍질 아래로 벗기기, 3갈래 중 ${progress}갈래 완료`}
        direction="down"
        disabled={progress >= 3}
        onDragStateChange={onDragStateChange}
        onDrop={onAction}
        onGestureQuality={onGestureQuality}
        onMiss={onMiss}
        style={styles.peelDragTarget}
        threshold={48}
      >
        <BananaArt peelProgress={progress} />
        {progress < 3 ? (
          <View style={styles.peelGrip}>
            <View style={styles.peelGripLine} />
            <View style={styles.peelGripLine} />
          </View>
        ) : null}
      </DragAction>
      <View style={styles.actionHintPill}>
        <Ionicons color="#7B6428" name={progress >= 3 ? 'checkmark' : 'arrow-down'} size={18} />
        <Text style={styles.actionHintText}>
          {progress >= 3 ? '껍질을 다 벗겼어요' : '잡고 아래로 당겨요'}
        </Text>
      </View>
    </View>
  );
}

function SplitStage({
  onAction,
  onDragStateChange,
  onGestureQuality,
  onMiss,
  progress,
  target,
}: {
  onAction: () => void;
  onDragStateChange: (dragging: boolean) => void;
  onGestureQuality: (quality: number) => void;
  onMiss: () => void;
  progress: number;
  target: number;
}) {
  return (
    <View style={styles.splitStage}>
      <View style={styles.transferStage}>
        <View style={styles.splitSourceCard}>
          {progress < target ? (
            <DragAction
              accessibilityHint="바나나 조각을 잡고 오른쪽 그릇으로 옮기세요"
              accessibilityLabel={`바나나 조각 그릇에 넣기, ${target}개 중 ${progress}개 완료`}
              direction="right"
              onDragStateChange={onDragStateChange}
              onDrop={onAction}
              onGestureQuality={onGestureQuality}
              onMiss={onMiss}
              style={styles.splitPieceDrag}
              threshold={54}
            >
              <View style={styles.splitPiece} />
            </DragAction>
          ) : (
            <View style={styles.sourceCompleteIcon}>
              <Ionicons color="#FFFFFF" name="checkmark" size={23} />
            </View>
          )}
          <Text style={styles.sourceCount}>{target - Math.min(progress, target)}개 남음</Text>
        </View>
        <View style={styles.transferArrow}>
          <Ionicons color="#789184" name="arrow-forward" size={27} />
          <Text style={styles.transferCount}>끌기</Text>
        </View>
        <RecipeBowl bananaPieces={progress} />
      </View>
      <Text style={styles.sceneCaption}>
        {progress >= target ? '조각을 모두 담았어요' : '조각을 잡아 그릇에 놓아요'}
      </Text>
    </View>
  );
}

function YogurtStage({
  onAction,
  onDragStateChange,
  onGestureQuality,
  onMiss,
  progress,
  target,
}: {
  onAction: () => void;
  onDragStateChange: (dragging: boolean) => void;
  onGestureQuality: (quality: number) => void;
  onMiss: () => void;
  progress: number;
  target: number;
}) {
  return (
    <View style={styles.transferStage}>
      <DragAction
        accessibilityHint="요거트 컵을 잡고 오른쪽 그릇으로 옮기세요"
        accessibilityLabel={`요거트 그릇에 담기, ${target}번 중 ${progress}번 완료`}
        direction="right"
        disabled={progress >= target}
        onDragStateChange={onDragStateChange}
        onDrop={onAction}
        onGestureQuality={onGestureQuality}
        onMiss={onMiss}
        threshold={54}
      >
        <View style={[styles.yogurtCup, progress >= target && styles.foodSourceDone]}>
          <View style={styles.yogurtLid} />
          <Ionicons color="#5D8FA7" name="ice-cream" size={34} />
          <Text style={styles.yogurtCupText}>요거트</Text>
        </View>
      </DragAction>
      <View style={styles.transferArrow}>
        <Ionicons color="#789184" name="arrow-forward" size={27} />
        <Text style={styles.transferCount}>{progress}/{target}</Text>
      </View>
      <RecipeBowl bananaPieces={6} yogurtScoops={progress} />
    </View>
  );
}

function ToppingStage({
  onAction,
  onDragStateChange,
  onGestureQuality,
  onMiss,
  onSkip,
  progress,
  target,
}: {
  onAction: () => void;
  onDragStateChange: (dragging: boolean) => void;
  onGestureQuality: (quality: number) => void;
  onMiss: () => void;
  onSkip: () => void;
  progress: number;
  target: number;
}) {
  return (
    <View style={styles.toppingStage}>
      <View style={styles.transferStage}>
        <DragAction
          accessibilityHint="시리얼 상자를 잡고 오른쪽 그릇으로 옮기세요"
          accessibilityLabel={`시리얼 그릇에 뿌리기, ${target}번 중 ${progress}번 완료`}
          direction="right"
          disabled={progress >= target}
          onDragStateChange={onDragStateChange}
          onDrop={onAction}
          onGestureQuality={onGestureQuality}
          onMiss={onMiss}
          threshold={54}
        >
          <View style={[styles.cerealBox, progress >= target && styles.foodSourceDone]}>
            <View style={styles.cerealBoxTop} />
            <Ionicons color="#8A5C36" name="grid" size={33} />
            <Text style={styles.cerealBoxText}>시리얼</Text>
            <Text style={styles.cerealSafeMark}>표시 확인</Text>
          </View>
        </DragAction>
        <View style={styles.transferArrow}>
          <Ionicons color="#789184" name="arrow-forward" size={27} />
          <Text style={styles.transferCount}>{progress}/{target}</Text>
        </View>
        <RecipeBowl bananaPieces={6} toppingCount={progress} yogurtScoops={4} />
      </View>
      {progress === 0 ? (
        <PressScale
          accessibilityHint="알레르기나 삼킴 특성에 맞지 않으면 토핑을 넣지 않고 다음 단계로 갑니다"
          accessibilityLabel="토핑 없이 계속하기"
          accessibilityRole="button"
          onPress={(event) => {
            stopPropagation(event);
            onSkip();
          }}
          scaleTo={0.96}
          style={styles.skipToppingButton}
        >
          <Ionicons color="#64736B" name="arrow-forward-circle" size={18} />
          <Text style={styles.skipToppingText}>토핑 없이 계속</Text>
        </PressScale>
      ) : null}
    </View>
  );
}

function MixStage({
  hasTopping,
  onAction,
  onDragStateChange,
  onGestureQuality,
  onMiss,
  progress,
  target,
}: {
  hasTopping: boolean;
  onAction: () => void;
  onDragStateChange: (dragging: boolean) => void;
  onGestureQuality: (quality: number) => void;
  onMiss: () => void;
  progress: number;
  target: number;
}) {
  return (
    <View style={styles.mainFoodAction}>
      <RecipeBowl
        bananaPieces={6}
        large
        mixCount={Math.max(1, progress)}
        showSpoon={false}
        toppingCount={hasTopping ? 4 : 0}
        yogurtScoops={4}
      />
      <CircularMixAction
        accessibilityLabel={`숟가락으로 원 그리며 섞기, ${target}바퀴 중 ${progress}바퀴 완료`}
        disabled={progress >= target}
        onCircle={onAction}
        onDragStateChange={onDragStateChange}
        onGestureQuality={onGestureQuality}
        onMiss={onMiss}
      >
        <View style={styles.mixSpoonHandle}>
          <Ionicons color="#5F7268" name="restaurant" size={27} />
        </View>
      </CircularMixAction>
      <View style={styles.actionHintPill}>
        <Ionicons color="#547665" name="refresh" size={19} />
        <Text style={[styles.actionHintText, styles.mixHintText]}>
          {progress >= target ? '부드럽게 잘 섞였어요' : '숟가락을 잡고 원을 그려요'}
        </Text>
      </View>
    </View>
  );
}

function PlateStage({
  hasTopping,
  onAction,
  onDragStateChange,
  onGestureQuality,
  onMiss,
  progress,
}: {
  hasTopping: boolean;
  onAction: () => void;
  onDragStateChange: (dragging: boolean) => void;
  onGestureQuality: (quality: number) => void;
  onMiss: () => void;
  progress: number;
}) {
  const plated = progress >= 1;
  return (
    <View style={styles.plateStage}>
      <View style={styles.transferStage}>
        <View style={styles.plateSource}>
          {!plated ? (
            <DragAction
              accessibilityHint="완성한 그릇을 잡고 오른쪽 식탁 매트 중앙에 놓으세요"
              accessibilityLabel="완성한 그릇 식탁에 차리기"
              direction="right"
              onDragStateChange={onDragStateChange}
              onDrop={onAction}
              onGestureQuality={onGestureQuality}
              onMiss={onMiss}
              threshold={58}
            >
              <RecipeBowl
                bananaPieces={6}
                mixCount={3}
                showSpoon={false}
                toppingCount={hasTopping ? 4 : 0}
                yogurtScoops={4}
              />
            </DragAction>
          ) : (
            <View style={styles.sourceCompleteIcon}>
              <Ionicons color="#FFFFFF" name="checkmark" size={23} />
            </View>
          )}
        </View>
        <View style={styles.transferArrow}>
          <Ionicons color="#789184" name="arrow-forward" size={27} />
          <Text style={styles.transferCount}>차리기</Text>
        </View>
        <View style={[styles.plateMat, plated && styles.plateMatDone]}>
          {plated ? (
            <RecipeBowl
              bananaPieces={6}
              mixCount={3}
              showSpoon={false}
              toppingCount={hasTopping ? 4 : 0}
              yogurtScoops={4}
            />
          ) : (
            <>
              <Ionicons color="#789184" name="restaurant-outline" size={30} />
              <Text style={styles.plateMatText}>여기에 놓아요</Text>
            </>
          )}
        </View>
      </View>
      <Text style={styles.sceneCaption}>
        {plated ? '먹기 좋게 식탁에 차렸어요' : '그릇을 잡아 식탁 매트 가운데에 놓아요'}
      </Text>
    </View>
  );
}

function CleanupStage({
  onAction,
  onDragStateChange,
  onGestureQuality,
  onMiss,
  progress,
}: {
  onAction: () => void;
  onDragStateChange: (dragging: boolean) => void;
  onGestureQuality: (quality: number) => void;
  onMiss: () => void;
  progress: number;
}) {
  const complete = progress >= CLEANUP_TASKS.length;
  const task = CLEANUP_TASKS[Math.min(progress, CLEANUP_TASKS.length - 1)];
  const sortingWaste = task.target === 'food' || task.target === 'recycle';
  return (
    <View style={styles.cleanupStage}>
      <View style={styles.cleanupCounter}>
        <Ionicons color="#527665" name="sparkles" size={18} />
        <Text style={styles.cleanupCounterText}>
          {complete ? '정리 완료' : `${progress + 1} / ${CLEANUP_TASKS.length} 정리하기`}
        </Text>
      </View>
      <View style={styles.transferStage}>
        <View style={styles.cleanupSourceCard}>
          {!complete ? (
            <DragAction
              accessibilityHint={
                task.target === 'wipe'
                  ? '행주를 잡고 오른쪽 요거트 자국 끝까지 밀어 닦으세요'
                  : `${task.itemName}을 잡고 오른쪽의 ${task.target === 'sink' ? '싱크대' : '알맞은 통'}로 옮기세요`
              }
              accessibilityLabel={task.accessibilityLabel}
              direction="right"
              onDragStateChange={onDragStateChange}
              onDrop={onAction}
              onGestureQuality={onGestureQuality}
              onMiss={onMiss}
              threshold={54}
            >
              <View
                style={[
                  styles.cleanupItem,
                  task.target === 'recycle' && styles.cleanupCup,
                  task.target === 'sink' && styles.cleanupDish,
                  task.target === 'wipe' && styles.cleanupCloth,
                ]}
              >
                <Ionicons color={task.color} name={task.icon} size={34} />
                <Text style={styles.cleanupItemText}>{task.itemName}</Text>
              </View>
            </DragAction>
          ) : (
            <View style={styles.sourceCompleteIcon}>
              <Ionicons color="#FFFFFF" name="checkmark" size={23} />
            </View>
          )}
        </View>
        <View style={styles.transferArrow}>
          <Ionicons color="#789184" name="arrow-forward" size={27} />
          <Text style={styles.transferCount}>
            {task.target === 'wipe' ? '닦기' : task.target === 'sink' ? '옮기기' : '분류'}
          </Text>
        </View>
        {complete ? (
          <View style={styles.cleanupFinished}>
            <Ionicons color="#5B8B71" name="checkmark-circle" size={35} />
            <Text style={styles.cleanupFinishedText}>조리대 정리 완료</Text>
          </View>
        ) : sortingWaste ? (
          <View style={styles.cleanupBins}>
            <View style={[styles.cleanupBin, task.target === 'food' && styles.cleanupBinActiveFood]}>
              <Ionicons color="#8A6A35" name="leaf" size={25} />
              <Text style={styles.cleanupBinLabel}>음식물</Text>
              {progress >= 1 ? <Ionicons color="#5B8B71" name="checkmark-circle" size={17} /> : null}
            </View>
            <View style={[styles.cleanupBin, task.target === 'recycle' && styles.cleanupBinActiveRecycle]}>
              <Ionicons color="#5D8FA7" name="sync" size={25} />
              <Text style={styles.cleanupBinLabel}>재활용</Text>
              {progress >= 2 ? <Ionicons color="#5B8B71" name="checkmark-circle" size={17} /> : null}
            </View>
          </View>
        ) : task.target === 'sink' ? (
          <View style={styles.cleanupSink}>
            <Ionicons color="#5D8FA7" name="water" size={31} />
            <View style={styles.cleanupSinkBasin} />
            <Text style={styles.cleanupSinkText}>싱크대</Text>
            <Text style={styles.cleanupSinkCount}>{Math.max(0, progress - 2)}/2</Text>
          </View>
        ) : (
          <View style={styles.cleanupSpillArea}>
            <View style={styles.cleanupSpillDrop} />
            <View style={[styles.cleanupSpillDrop, styles.cleanupSpillDropSmall]} />
            <Text style={styles.cleanupSpillText}>흘린 요거트</Text>
          </View>
        )}
      </View>
      <Text style={styles.sceneCaption}>
        {complete
          ? '사용한 도구와 조리대까지 깨끗하게 정리했어요'
          : task.target === 'wipe'
            ? '행주를 잡고 요거트 자국을 끝까지 닦아요'
            : `${task.itemName}을 ${task.target === 'sink' ? '싱크대로 옮겨요' : '알맞은 통에 넣어요'}`}
      </Text>
    </View>
  );
}

function StageScene({
  notice,
  onAction,
  onDragStateChange,
  onGestureQuality,
  onIngredientSelect,
  onMiss,
  onToppingSkip,
  onToolSelect,
  progress,
  selectedIngredients,
  selectedTools,
  stage,
  toppingSkipped,
}: {
  notice: string | null;
  onAction: () => void;
  onDragStateChange: (dragging: boolean) => void;
  onGestureQuality: (quality: number) => void;
  onIngredientSelect: (id: IngredientOptionId) => void;
  onMiss: () => void;
  onToppingSkip: () => void;
  onToolSelect: (id: ToolOptionId) => void;
  progress: number;
  selectedIngredients: ReadonlySet<IngredientOptionId>;
  selectedTools: ReadonlySet<ToolOptionId>;
  stage: CookingStageDefinition;
  toppingSkipped: boolean;
}) {
  switch (stage.id) {
    case 'ingredients':
      return (
        <IngredientStage
          notice={notice}
          onDragStateChange={onDragStateChange}
          onGestureQuality={onGestureQuality}
          onMiss={onMiss}
          onSelect={onIngredientSelect}
          onToolSelect={onToolSelect}
          selected={selectedIngredients}
          selectedTools={selectedTools}
        />
      );
    case 'peel':
      return (
        <PeelStage
          onAction={onAction}
          onDragStateChange={onDragStateChange}
          onGestureQuality={onGestureQuality}
          onMiss={onMiss}
          progress={progress}
        />
      );
    case 'split':
      return (
        <SplitStage
          onAction={onAction}
          onDragStateChange={onDragStateChange}
          onGestureQuality={onGestureQuality}
          onMiss={onMiss}
          progress={progress}
          target={stage.targetCount}
        />
      );
    case 'yogurt':
      return (
        <YogurtStage
          onAction={onAction}
          onDragStateChange={onDragStateChange}
          onGestureQuality={onGestureQuality}
          onMiss={onMiss}
          progress={progress}
          target={stage.targetCount}
        />
      );
    case 'topping':
      return (
        <ToppingStage
          onAction={onAction}
          onDragStateChange={onDragStateChange}
          onGestureQuality={onGestureQuality}
          onMiss={onMiss}
          onSkip={onToppingSkip}
          progress={progress}
          target={stage.targetCount}
        />
      );
    case 'mix':
      return (
        <MixStage
          hasTopping={!toppingSkipped}
          onAction={onAction}
          onDragStateChange={onDragStateChange}
          onGestureQuality={onGestureQuality}
          onMiss={onMiss}
          progress={progress}
          target={stage.targetCount}
        />
      );
    case 'plate':
      return (
        <PlateStage
          hasTopping={!toppingSkipped}
          onAction={onAction}
          onDragStateChange={onDragStateChange}
          onGestureQuality={onGestureQuality}
          onMiss={onMiss}
          progress={progress}
        />
      );
    case 'cleanup':
      return (
        <CleanupStage
          onAction={onAction}
          onDragStateChange={onDragStateChange}
          onGestureQuality={onGestureQuality}
          onMiss={onMiss}
          progress={progress}
        />
      );
  }
}

export function CookingSimulationScreen({ onClose, onComplete }: CookingSimulationScreenProps) {
  const [phase, setPhase] = useState<CookingPhase>('briefing');
  const [mode, setMode] = useState<CookingMode>('practice');
  const [stageIndex, setStageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [selectedIngredients, setSelectedIngredients] = useState<ReadonlySet<IngredientOptionId>>(
    new Set(),
  );
  const [selectedTools, setSelectedTools] = useState<ReadonlySet<ToolOptionId>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [hintLevel, setHintLevel] = useState(0);
  const [closeConfirmationVisible, setCloseConfirmationVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [toppingSkipped, setToppingSkipped] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(CHALLENGE_STAGE_SECONDS.ingredients);
  const [timeOver, setTimeOver] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [usedHelp, setUsedHelp] = useState(false);
  const [challengeDecisionVisible, setChallengeDecisionVisible] = useState(false);
  const [challengeDecisionFeedback, setChallengeDecisionFeedback] = useState<string | null>(null);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const stageEntrance = useRef(new Animated.Value(1)).current;
  const actionPulse = useRef(new Animated.Value(1)).current;
  const completionReported = useRef(false);
  const timerDeadline = useRef<number | null>(null);
  const currentStage = BANANA_YOGURT_CUP_RECIPE.stages[stageIndex];
  const stageTimeLimit = CHALLENGE_STAGE_SECONDS[currentStage.id];
  const ingredientCount = [...selectedIngredients].filter((id) => REQUIRED_INGREDIENT_IDS.has(id)).length;
  const toolCount = [...selectedTools].filter((id) => REQUIRED_TOOL_IDS.has(id)).length;
  const currentProgress = currentStage.id === 'ingredients' ? ingredientCount + toolCount : progress;
  const stageComplete = currentProgress >= currentStage.targetCount;
  const stageLabel = useMemo(
    () => `${stageIndex + 1}/${BANANA_YOGURT_CUP_RECIPE.stages.length} ${currentStage.title}`,
    [currentStage.title, stageIndex],
  );

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const nextActive = nextState === 'active';
      if (!nextActive && timerDeadline.current !== null) {
        setTimeLeft(Math.max(0, Math.ceil((timerDeadline.current - Date.now()) / 1000)));
        timerDeadline.current = null;
      }
      setAppActive(nextActive);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (
      phase !== 'playing' ||
      mode !== 'challenge' ||
      countdown === null ||
      closeConfirmationVisible ||
      timeOver ||
      stageComplete ||
      !appActive
    ) {
      return;
    }
    const timeout = setTimeout(() => {
      setCountdown((current) => (current === null || current <= 1 ? null : current - 1));
    }, 900);
    return () => clearTimeout(timeout);
  }, [appActive, closeConfirmationVisible, countdown, mode, phase, stageComplete, timeOver]);

  useEffect(() => {
    if (
      phase !== 'playing' ||
      mode !== 'challenge' ||
      countdown !== null ||
      closeConfirmationVisible ||
      timeOver ||
      stageComplete ||
      !appActive
    ) {
      return;
    }
    if (timerDeadline.current === null) {
      timerDeadline.current = Date.now() + timeLeft * 1000;
    }
    const updateClock = () => {
      if (timerDeadline.current === null) return;
      setTimeLeft(Math.max(0, Math.ceil((timerDeadline.current - Date.now()) / 1000)));
    };
    updateClock();
    const interval = setInterval(updateClock, 250);
    return () => clearInterval(interval);
  }, [appActive, closeConfirmationVisible, countdown, mode, phase, stageComplete, timeLeft, timeOver]);

  useEffect(() => {
    if (mode !== 'challenge' || phase !== 'playing' || !stageComplete || timerDeadline.current === null) {
      return;
    }
    setTimeLeft(Math.max(0, Math.ceil((timerDeadline.current - Date.now()) / 1000)));
    timerDeadline.current = null;
  }, [mode, phase, stageComplete]);

  useEffect(() => {
    if (
      phase !== 'playing' ||
      mode !== 'challenge' ||
      countdown !== null ||
      timeLeft > 0 ||
      timeOver ||
      stageComplete
    ) {
      return;
    }
    timerDeadline.current = null;
    setDragging(false);
    setTimeOver(true);
    AccessibilityInfo.announceForAccessibility('시간이 끝났어요. 현재 단계부터 연습으로 이어갈 수 있어요.');
  }, [countdown, mode, phase, stageComplete, timeLeft, timeOver]);

  useEffect(() => {
    if (
      phase !== 'playing' ||
      mode !== 'practice' ||
      stageComplete ||
      hintLevel >= currentStage.hints.length ||
      closeConfirmationVisible
    ) {
      return;
    }
    const timeout = setTimeout(
      () => setHintLevel((current) => Math.min(currentStage.hints.length, current + 1)),
      hintLevel === 0 ? 5500 : 8500,
    );
    return () => clearTimeout(timeout);
  }, [closeConfirmationVisible, currentStage.hints.length, hintLevel, mode, phase, stageComplete, stageIndex]);

  useEffect(() => {
    if (phase !== 'playing') return;
    stageEntrance.setValue(reduceMotion ? 1 : 0);
    if (!reduceMotion) {
      Animated.timing(stageEntrance, {
        duration: 280,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }).start();
    }
  }, [phase, reduceMotion, stageEntrance, stageIndex]);

  useEffect(() => {
    if (!stageComplete || phase !== 'playing') return;
    AccessibilityInfo.announceForAccessibility(`${currentStage.title} 단계를 완료했어요.`);
  }, [currentStage.title, phase, stageComplete]);

  const animateAction = () => {
    if (reduceMotion) return;
    actionPulse.stopAnimation();
    actionPulse.setValue(0.96);
    Animated.spring(actionPulse, {
      damping: 12,
      mass: 0.5,
      stiffness: 240,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const recordSuccess = () => {
    animateAction();
  };

  const handleGestureQuality = (quality: number) => {
    const safeQuality = Math.max(0, Math.min(100, Math.round(quality)));
    if (safeQuality >= 90) setNotice('정확하게 놓았어요! 손동작이 아주 안정적이에요.');
    else if (safeQuality >= 72) setNotice('좋아요. 알맞은 곳에 잘 옮겼어요.');
    else setNotice('잘 놓았어요. 다음에는 화살표를 따라 조금 더 곧게 움직여 봐요.');
  };

  const handleMiss = () => {
    setNotice('조금 더 끝까지 끌어 놓아요. 다시 해도 괜찮아요.');
    setMistakes((current) => current + 1);
  };

  const handleAction = () => {
    if (stageComplete || timeOver || countdown !== null) return;
    recordSuccess();
    setProgress((current) => Math.min(currentStage.targetCount, current + 1));
  };

  const handleIngredientSelect = (id: IngredientOptionId) => {
    if (stageComplete || timeOver || countdown !== null) return;
    if (!RECIPE_INGREDIENT_IDS.has(id)) {
      handleMiss();
      setNotice(`${INGREDIENT_OPTIONS.find((item) => item.id === id)?.name ?? '이 재료'}는 이번 레시피에 쓰지 않아요.`);
      return;
    }
    recordSuccess();
    setSelectedIngredients((current) => new Set([...current, id]));
  };

  const handleToolSelect = (id: ToolOptionId) => {
    if (stageComplete || timeOver || countdown !== null) return;
    if (!REQUIRED_TOOL_IDS.has(id)) {
      setMistakes((current) => current + 1);
      setNotice(
        id === 'knife'
          ? '칼 대신 담을 그릇과 섞을 숟가락을 골라요.'
          : '불을 쓰지 않으니 프라이팬 대신 그릇과 숟가락을 골라요.',
      );
      return;
    }
    recordSuccess();
    setSelectedTools((current) => new Set([...current, id]));
    setNotice(`${TOOL_OPTIONS.find((tool) => tool.id === id)?.name ?? '도구'}을 준비했어요.`);
  };

  const skipTopping = () => {
    if (
      currentStage.id !== 'topping' ||
      progress > 0 ||
      timeOver ||
      countdown !== null
    ) {
      return;
    }
    setToppingSkipped(true);
    setProgress(currentStage.targetCount);
    setNotice('안전 정보와 내 선택을 확인하고 토핑을 넣지 않았어요.');
    AccessibilityInfo.announceForAccessibility('토핑을 넣지 않고 다음 단계로 진행합니다.');
  };

  const moveToNextStage = () => {
    setHintLevel(0);
    setNotice(null);
    setProgress(0);
    setChallengeDecisionVisible(false);
    setChallengeDecisionFeedback(null);
    if (stageIndex >= BANANA_YOGURT_CUP_RECIPE.stages.length - 1) {
      timerDeadline.current = null;
      setPhase('result');
      if (!completionReported.current) {
        completionReported.current = true;
        onComplete?.();
      }
      return;
    }
    const nextStageIndex = stageIndex + 1;
    setStageIndex(nextStageIndex);
    if (mode === 'challenge') {
      setTimeLeft(CHALLENGE_STAGE_SECONDS[BANANA_YOGURT_CUP_RECIPE.stages[nextStageIndex].id]);
      timerDeadline.current = null;
    }
  };

  const handleChallengeDecision = (id: ChallengeDecisionId) => {
    if (id !== 'peel-banana') {
      setMistakes((current) => current + 1);
      setChallengeDecisionFeedback('재료를 섞기 전에 바나나 껍질부터 벗겨야 해요.');
      return;
    }
    AccessibilityInfo.announceForAccessibility('맞아요. 바나나 껍질 벗기기로 이동합니다.');
    moveToNextStage();
  };

  const advanceStage = () => {
    if (!stageComplete || timeOver || countdown !== null || challengeDecisionVisible) return;
    if (mode === 'challenge' && currentStage.id === 'ingredients') {
      setChallengeDecisionVisible(true);
      setChallengeDecisionFeedback(null);
      setNotice(null);
      return;
    }
    moveToNextStage();
  };

  const startCooking = (selectedMode: CookingMode = mode) => {
    setMode(selectedMode);
    setPhase('playing');
    setStageIndex(0);
    setProgress(0);
    setSelectedIngredients(new Set());
    setSelectedTools(new Set());
    setToppingSkipped(false);
    setHintLevel(0);
    setNotice(null);
    setDragging(false);
    setCloseConfirmationVisible(false);
    setCountdown(selectedMode === 'challenge' ? 3 : null);
    setTimeLeft(CHALLENGE_STAGE_SECONDS.ingredients);
    setTimeOver(false);
    setMistakes(0);
    setUsedHelp(false);
    setChallengeDecisionVisible(false);
    setChallengeDecisionFeedback(null);
    timerDeadline.current = null;
  };

  const restartCooking = () => {
    completionReported.current = false;
    startCooking(mode);
  };

  const continueInPractice = () => {
    setMode('practice');
    setCountdown(null);
    setTimeOver(false);
    setTimeLeft(stageTimeLimit);
    setNotice('시간 제한 없이 지금 단계부터 이어서 연습해요.');
    timerDeadline.current = null;
  };

  const retryCurrentStage = () => {
    setTimeOver(false);
    setDragging(false);
    setCountdown(mode === 'challenge' ? 3 : null);
    setTimeLeft(stageTimeLimit);
    setHintLevel(0);
    setNotice(mode === 'practice' ? '이 단계만 처음부터 다시 연습해요.' : null);
    setChallengeDecisionVisible(false);
    setChallengeDecisionFeedback(null);
    timerDeadline.current = null;
    if (currentStage.id === 'ingredients') {
      setSelectedIngredients(new Set());
      setSelectedTools(new Set());
    }
    else setProgress(0);
    if (currentStage.id === 'topping') setToppingSkipped(false);
  };

  const requestClose = () => {
    if (phase === 'briefing' || phase === 'result') {
      onClose();
      return;
    }
    if (timerDeadline.current !== null) {
      setTimeLeft(Math.max(0, Math.ceil((timerDeadline.current - Date.now()) / 1000)));
      timerDeadline.current = null;
    }
    setCloseConfirmationVisible(true);
  };

  const revealNextHint = () => {
    if (hintLevel >= currentStage.hints.length) {
      setHintLevel(0);
      return;
    }
    setUsedHelp(true);
    setHintLevel((current) => Math.min(currentStage.hints.length, current + 1));
  };

  const renderTopBar = () => (
    <View style={styles.topBar}>
      <PressScale
        accessibilityLabel="요리 나가기"
        accessibilityRole="button"
        onPress={(event) => {
          stopPropagation(event);
          requestClose();
        }}
        scaleTo={0.9}
        style={styles.topIconButton}
      >
        <Ionicons color="#37483F" name="close" size={25} />
      </PressScale>
      <View style={styles.topBarCopy}>
        <Text numberOfLines={1} style={styles.topBarEyebrow}>우리 집 · 첫 요리</Text>
        <Text numberOfLines={1} style={styles.topBarTitle}>
          {phase === 'briefing'
            ? BANANA_YOGURT_CUP_RECIPE.name
            : phase === 'result'
              ? '요리 완성'
              : stageLabel}
        </Text>
      </View>
      {phase === 'playing' ? (
        <PressScale
          accessibilityLabel={
            hintLevel >= currentStage.hints.length
              ? '도움말 닫기'
              : hintLevel > 0
                ? '다음 도움말 보기'
                : '도움말 보기'
          }
          accessibilityRole="button"
          accessibilityState={{ expanded: hintLevel > 0 }}
          onPress={(event) => {
            stopPropagation(event);
            revealNextHint();
          }}
          scaleTo={0.9}
          style={[styles.topIconButton, hintLevel > 0 && styles.topIconButtonActive]}
        >
          <Ionicons color={hintLevel > 0 ? '#FFFFFF' : '#37483F'} name="help" size={22} />
        </PressScale>
      ) : (
        <View style={styles.topIconPlaceholder} />
      )}
    </View>
  );

  return (
    <View style={styles.root} testID="cooking-simulation-screen">
      <StatusBar hidden />
      {renderTopBar()}

      {phase === 'briefing' ? (
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.briefingScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.briefingCard}>
            <RecipeCoverArt />
            <View style={styles.recipeBadge}>
              <Ionicons color="#FFFFFF" name="restaurant" size={15} />
              <Text style={styles.recipeBadgeText}>불 없이 만드는 첫 요리</Text>
            </View>
            <Text style={styles.recipeTitle}>{BANANA_YOGURT_CUP_RECIPE.name}</Text>
            <Text style={styles.recipeDescription}>
              바나나를 손으로 나누고 요거트와 토핑을 담아 완성해요.
            </Text>
            <View style={styles.recipeFacts}>
              <View style={styles.recipeFact}>
                <Ionicons color="#547060" name="time-outline" size={17} />
                <Text style={styles.recipeFactText}>약 {BANANA_YOGURT_CUP_RECIPE.durationMinutes}분</Text>
              </View>
              <View style={styles.recipeFact}>
                <Ionicons color="#547060" name="flame-outline" size={17} />
                <Text style={styles.recipeFactText}>불 사용 안 함</Text>
              </View>
              <View style={styles.recipeFact}>
                <Ionicons color="#547060" name="cut-outline" size={17} />
                <Text style={styles.recipeFactText}>칼 사용 안 함</Text>
              </View>
            </View>
          </View>

          <View style={styles.preparationCard}>
            <View style={styles.preparationHeader}>
              <View style={styles.preparationIcon}>
                <Ionicons color="#547060" name="shield-checkmark" size={20} />
              </View>
              <View style={styles.preparationHeaderCopy}>
                <Text style={styles.preparationTitle}>시작하기 전에 확인해요</Text>
                <Text style={styles.preparationSubtitle}>실제 요리할 때 지켜야 하는 안전 순서예요.</Text>
              </View>
            </View>
            {BANANA_YOGURT_CUP_RECIPE.safetySummary.map((item, index) => (
              <View key={item} style={styles.safetyRow}>
                <View style={styles.safetyNumber}>
                  <Text style={styles.safetyNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.safetyText}>{item}</Text>
              </View>
            ))}
            <View style={styles.allergenNotice}>
              <Ionicons color="#8A633D" name="alert-circle" size={19} />
              <Text style={styles.allergenNoticeText}>
                알레르기: {BANANA_YOGURT_CUP_RECIPE.allergens.join(', ')}. 실제 조리 전 제품 표시와 함께하는 사람의 안내를 확인해요.
              </Text>
            </View>
          </View>

          <View style={styles.modeSection}>
            <Text style={styles.modeSectionTitle}>어떻게 만들어 볼까요?</Text>
            <Text style={styles.modeSectionSubtitle}>원하는 방식은 언제든 다시 고를 수 있어요.</Text>
            <View style={styles.modeOptions}>
              <PressScale
                accessibilityHint="시간 제한 없이 안내를 보며 연습합니다"
                accessibilityLabel="연습 모드"
                accessibilityRole="button"
                accessibilityState={{ selected: mode === 'practice' }}
                onPress={(event) => {
                  stopPropagation(event);
                  setMode('practice');
                }}
                style={[styles.modeCard, mode === 'practice' && styles.modeCardPracticeSelected]}
              >
                <View style={[styles.modeIcon, styles.modeIconPractice]}>
                  <Ionicons color="#4E7B64" name="leaf" size={23} />
                </View>
                <Text style={styles.modeCardTitle}>연습 모드</Text>
                <Text style={styles.modeCardBody}>시간 제한 없이{`\n`}도움말과 함께</Text>
                {mode === 'practice' ? (
                  <View style={styles.modeSelectedBadge}>
                    <Ionicons color="#FFFFFF" name="checkmark" size={13} />
                  </View>
                ) : null}
              </PressScale>
              <PressScale
                accessibilityHint="단계마다 새 제한시간을 받고 문제 상황을 직접 해결합니다"
                accessibilityLabel="도전 모드"
                accessibilityRole="button"
                accessibilityState={{ selected: mode === 'challenge' }}
                onPress={(event) => {
                  stopPropagation(event);
                  setMode('challenge');
                }}
                style={[styles.modeCard, mode === 'challenge' && styles.modeCardChallengeSelected]}
              >
                <View style={[styles.modeIcon, styles.modeIconChallenge]}>
                  <Ionicons color="#A06833" name="timer" size={24} />
                </View>
                <Text style={styles.modeCardTitle}>도전 모드</Text>
                <Text style={styles.modeCardBody}>단계마다 시간{`\n`}문제 상황 확인</Text>
                {mode === 'challenge' ? (
                  <View style={[styles.modeSelectedBadge, styles.modeSelectedBadgeChallenge]}>
                    <Ionicons color="#FFFFFF" name="checkmark" size={13} />
                  </View>
                ) : null}
              </PressScale>
            </View>
          </View>

          <PressScale
            accessibilityLabel={`${mode === 'challenge' ? '도전' : '연습'} 모드로 바나나 요거트 컵 만들기 시작`}
            accessibilityRole="button"
            onPress={(event) => {
              stopPropagation(event);
              startCooking();
            }}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>
              {mode === 'challenge' ? '도전 시작' : '연습 시작'}
            </Text>
            <Ionicons color="#FFFFFF" name="arrow-forward" size={20} />
          </PressScale>
        </ScrollView>
      ) : phase === 'playing' ? (
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.playingScrollContent}
          scrollEnabled={!dragging && !timeOver && countdown === null}
          showsVerticalScrollIndicator={false}
        >
          {mode === 'challenge' ? (
            <View style={styles.challengeHud}>
              <View style={[styles.hudChip, timeLeft <= 5 && styles.hudChipUrgent]}>
                <Ionicons color={timeLeft <= 5 ? '#FFFFFF' : '#70572D'} name="timer" size={18} />
                <Text
                  accessibilityLabel={`${currentStage.title} 남은 시간 ${formatSeconds(timeLeft)}`}
                  style={[styles.hudValue, timeLeft <= 5 && styles.hudValueUrgent]}
                >
                  {formatSeconds(timeLeft)}
                </Text>
              </View>
              <View style={styles.timerTrack}>
                <View
                  style={[
                    styles.timerFill,
                    timeLeft <= 10 && styles.timerFillWarning,
                    timeLeft <= 5 && styles.timerFillUrgent,
                    { width: `${Math.max(0, Math.min(100, (timeLeft / stageTimeLimit) * 100))}%` },
                  ]}
                />
              </View>
            </View>
          ) : (
            <View style={styles.practiceBanner}>
              <Ionicons color="#4F7B65" name="leaf" size={16} />
              <Text style={styles.practiceBannerText}>연습 모드 · 천천히 해도 괜찮아요</Text>
            </View>
          )}
          <View style={styles.progressHeader}>
            <ProgressDots stageIndex={stageIndex} />
            <Text accessibilityLabel={stageLabel} style={styles.progressText}>
              {stageIndex + 1} / {BANANA_YOGURT_CUP_RECIPE.stages.length}
            </Text>
          </View>
          <Animated.View
            style={[
              styles.stageCard,
              {
                opacity: stageEntrance,
                transform: [
                  {
                    translateY: stageEntrance.interpolate({
                      inputRange: [0, 1],
                      outputRange: [14, 0],
                    }),
                  },
                  { scale: actionPulse },
                ],
              },
            ]}
          >
            <View style={[styles.stageNumberBadge, { backgroundColor: STAGE_COLORS[currentStage.id] }]}>
              <Text style={styles.stageNumberText}>{currentStage.shortLabel}</Text>
            </View>
            <Text style={styles.stageTitle}>{currentStage.title}</Text>
            <Text style={styles.stageInstruction}>{currentStage.instruction}</Text>
            <StageProgress current={currentProgress} target={currentStage.targetCount} />
            {hintLevel > 0 ? (
              <View accessibilityLiveRegion="polite" style={styles.hintCard}>
                <Ionicons color="#547060" name="bulb" size={19} />
                <View style={styles.hintCopy}>
                  <Text style={styles.hintLevelText}>
                    도움 {hintLevel}/{currentStage.hints.length}
                  </Text>
                  <Text style={styles.hintText}>{currentStage.hints[hintLevel - 1]}</Text>
                </View>
              </View>
            ) : null}
            <View style={styles.stageScene}>
              {challengeDecisionVisible ? (
                <ChallengeDecision
                  feedback={challengeDecisionFeedback}
                  onSelect={handleChallengeDecision}
                />
              ) : (
                <StageScene
                  notice={notice}
                  onAction={handleAction}
                  onDragStateChange={setDragging}
                  onGestureQuality={handleGestureQuality}
                  onIngredientSelect={handleIngredientSelect}
                  onMiss={handleMiss}
                  onToppingSkip={skipTopping}
                  onToolSelect={handleToolSelect}
                  progress={progress}
                  selectedIngredients={selectedIngredients}
                  selectedTools={selectedTools}
                  stage={currentStage}
                  toppingSkipped={toppingSkipped}
                />
              )}
            </View>
            {currentStage.id !== 'ingredients' && notice && !challengeDecisionVisible ? (
              <View accessibilityLiveRegion="polite" style={styles.gestureNotice}>
                <Ionicons
                  color={notice.startsWith('정확하게') ? '#4F856A' : '#8A6849'}
                  name={notice.startsWith('정확하게') ? 'sparkles' : 'information-circle'}
                  size={17}
                />
                <Text style={styles.gestureNoticeText}>{notice}</Text>
              </View>
            ) : null}
            {stageComplete ? (
              <View accessibilityLiveRegion="polite" style={styles.stageCompleteRow}>
                <View style={styles.stageCompleteIcon}>
                  <Ionicons color="#FFFFFF" name="checkmark" size={18} />
                </View>
                <Text style={styles.stageCompleteText}>{currentStage.title} 완료</Text>
              </View>
            ) : null}
          </Animated.View>
          <View style={styles.playingFooter}>
            <PressScale
              accessibilityLabel={
                stageIndex >= BANANA_YOGURT_CUP_RECIPE.stages.length - 1
                  ? '요리 완성하기'
                  : '다음 요리 단계'
              }
              accessibilityRole="button"
              accessibilityState={{ disabled: !stageComplete || challengeDecisionVisible }}
              disabled={!stageComplete || challengeDecisionVisible}
              onPress={(event) => {
                stopPropagation(event);
                advanceStage();
              }}
              style={[
                styles.primaryButton,
                styles.stageNextButton,
                (!stageComplete || challengeDecisionVisible) && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {stageIndex >= BANANA_YOGURT_CUP_RECIPE.stages.length - 1 ? '완성하기' : '다음 단계'}
              </Text>
              <Ionicons color="#FFFFFF" name="arrow-forward" size={20} />
            </PressScale>
            {currentProgress > 0 || notice ? (
              <PressScale
                accessibilityLabel={`${currentStage.title} 단계 처음부터 다시 하기`}
                accessibilityRole="button"
                onPress={(event) => {
                  stopPropagation(event);
                  retryCurrentStage();
                }}
                style={styles.stageRetryButton}
              >
                <Ionicons color="#62736A" name="refresh" size={16} />
                <Text style={styles.stageRetryText}>이 단계만 다시 하기</Text>
              </PressScale>
            ) : null}
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.resultScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View accessibilityLiveRegion="polite" style={styles.resultCard}>
            <View style={styles.resultHalo}>
              <View style={styles.resultBowl}>
                <RecipeBowl
                  bananaPieces={6}
                  large
                  mixCount={3}
                  toppingCount={toppingSkipped ? 0 : 4}
                  yogurtScoops={4}
                />
              </View>
              <View style={[styles.resultSparkle, styles.resultSparkleOne]}>
                <Ionicons color="#F0C65D" name="sparkles" size={24} />
              </View>
              <View style={[styles.resultSparkle, styles.resultSparkleTwo]}>
                <Ionicons color="#8DB79E" name="sparkles" size={18} />
              </View>
            </View>
            <Text style={styles.resultEyebrow}>
              {mode === 'challenge' ? '도전 요리 완성!' : '첫 요리 완성!'}
            </Text>
            <Text style={styles.resultTitle}>{BANANA_YOGURT_CUP_RECIPE.name}</Text>
            <Text style={styles.resultDescription}>
              재료를 확인하고 차근차근 만든 뒤, 식탁에 차리고 주방까지 정리했어요.
            </Text>
            <View style={styles.badgeRow}>
              <View style={styles.completionBadge}>
                <Ionicons color="#4F7B65" name="checkmark-circle" size={17} />
                <Text style={styles.completionBadgeText}>목표 완료</Text>
              </View>
              <View style={styles.completionBadge}>
                <Ionicons color="#4F7B65" name={mistakes > 0 ? 'refresh' : usedHelp ? 'bulb' : 'hand-left'} size={17} />
                <Text style={styles.completionBadgeText}>
                  {mistakes > 0 ? '스스로 수정' : usedHelp ? '도움 활용' : '스스로 진행'}
                </Text>
              </View>
              <View style={styles.completionBadge}>
                <Ionicons color="#4F7B65" name="sparkles" size={17} />
                <Text style={styles.completionBadgeText}>주방 정리 완료</Text>
              </View>
            </View>
          </View>

          <View style={styles.sequenceCard}>
            <Text style={styles.sequenceTitle}>만든 순서를 다시 볼까요?</Text>
            <View style={styles.sequenceList}>
              {BANANA_YOGURT_CUP_RECIPE.stages.map((stage, index) => (
                <View key={stage.id} style={styles.sequenceItem}>
                  <View style={[styles.sequenceNumber, { backgroundColor: STAGE_COLORS[stage.id] }]}>
                    <Text style={styles.sequenceNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.sequenceText}>{stage.title}</Text>
                </View>
              ))}
            </View>
          </View>

          <PressScale
            accessibilityLabel="요리를 마치고 집으로 돌아가기"
            accessibilityRole="button"
            onPress={(event) => {
              stopPropagation(event);
              onClose();
            }}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>집으로 돌아가기</Text>
            <Ionicons color="#FFFFFF" name="home" size={19} />
          </PressScale>
          <PressScale
            accessibilityLabel={mode === 'challenge' ? '도전 모드 다시 하기' : '도전 모드 해보기'}
            accessibilityRole="button"
            onPress={(event) => {
              stopPropagation(event);
              if (mode === 'challenge') restartCooking();
              else {
                completionReported.current = false;
                startCooking('challenge');
              }
            }}
            style={styles.secondaryButton}
          >
            <Ionicons color="#4E735F" name={mode === 'challenge' ? 'refresh' : 'timer'} size={18} />
            <Text style={styles.secondaryButtonText}>
              {mode === 'challenge' ? '도전 다시 하기' : '도전 모드 해보기'}
            </Text>
          </PressScale>
        </ScrollView>
      )}

      {phase === 'playing' && countdown !== null ? (
        <View
          accessibilityLabel={`도전 시작 ${countdown}`}
          accessibilityLiveRegion="assertive"
          accessibilityViewIsModal
          onStartShouldSetResponder={() => true}
          style={styles.countdownOverlay}
        >
          <View style={styles.countdownCard}>
            <Text style={styles.countdownEyebrow}>준비</Text>
            <Text style={styles.countdownNumber}>{countdown}</Text>
            <Text style={styles.countdownHint}>재료를 잡아 움직이면 시작해요</Text>
          </View>
        </View>
      ) : null}

      {phase === 'playing' && timeOver ? (
        <View
          accessibilityLabel="도전 시간이 끝났어요"
          accessibilityViewIsModal
          onStartShouldSetResponder={() => true}
          style={styles.timeOverOverlay}
        >
          <View style={styles.timeOverSheet}>
            <View style={styles.timeOverIcon}>
              <Ionicons color="#A16A34" name="timer" size={28} />
            </View>
            <Text style={styles.timeOverTitle}>시간이 끝났어요</Text>
            <Text style={styles.timeOverBody}>
              {currentStage.title} 단계에서 잠시 멈췄어요. 이 단계만 다시 도전하거나 시간 없이 이어갈 수 있어요.
            </Text>
            <PressScale
              accessibilityLabel="현재 단계부터 연습 모드로 이어서 하기"
              accessibilityRole="button"
              onPress={(event) => {
                stopPropagation(event);
                continueInPractice();
              }}
              style={styles.primaryButton}
            >
              <Ionicons color="#FFFFFF" name="leaf" size={19} />
              <Text style={styles.primaryButtonText}>연습으로 이어서 하기</Text>
            </PressScale>
            <PressScale
              accessibilityLabel={`${currentStage.title} 단계 다시 도전하기`}
              accessibilityRole="button"
              onPress={(event) => {
                stopPropagation(event);
                retryCurrentStage();
              }}
              style={styles.secondaryButton}
            >
              <Ionicons color="#4E735F" name="refresh" size={18} />
              <Text style={styles.secondaryButtonText}>이 단계 다시 도전</Text>
            </PressScale>
          </View>
        </View>
      ) : null}

      {closeConfirmationVisible ? (
        <View style={styles.confirmationOverlay}>
          <Pressable
            accessibilityLabel="요리 계속하기"
            onPress={(event) => {
              stopPropagation(event);
              setCloseConfirmationVisible(false);
            }}
            style={styles.confirmationDim}
          />
          <View accessibilityViewIsModal style={styles.confirmationSheet}>
            <View style={styles.confirmationIcon}>
              <Ionicons color="#8A633D" name="restaurant" size={25} />
            </View>
            <Text style={styles.confirmationTitle}>요리를 그만할까요?</Text>
            <Text style={styles.confirmationBody}>지금 나가면 이번 요리는 처음부터 다시 시작해요.</Text>
            <PressScale
              accessibilityLabel="계속 만들기"
              accessibilityRole="button"
              onPress={(event) => {
                stopPropagation(event);
                setCloseConfirmationVisible(false);
              }}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>계속 만들기</Text>
            </PressScale>
            <PressScale
              accessibilityLabel="요리 그만두기"
              accessibilityRole="button"
              onPress={(event) => {
                stopPropagation(event);
                onClose();
              }}
              style={styles.confirmationExitButton}
            >
              <Text style={styles.confirmationExitText}>요리 그만두기</Text>
            </PressScale>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#F4F0E6',
    cursor: 'auto',
    zIndex: 80,
  },
  topBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,253,247,0.98)',
    flexDirection: 'row',
    minHeight: 76,
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  topIconButton: {
    alignItems: 'center',
    backgroundColor: '#EEE9DE',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  topIconButtonActive: { backgroundColor: '#5F8E75' },
  topIconPlaceholder: { height: 44, width: 44 },
  topBarCopy: { alignItems: 'center', flex: 1, paddingHorizontal: 8 },
  topBarEyebrow: { color: '#8B918C', fontFamily: fonts.semibold, fontSize: 11 },
  topBarTitle: { color: '#27362E', fontFamily: fonts.laundryBold, fontSize: 18, marginTop: 2 },
  briefingScrollContent: {
    alignItems: 'center',
    paddingBottom: 34,
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  briefingCard: {
    alignItems: 'center',
    backgroundColor: '#FFFDF8',
    borderRadius: 28,
    elevation: 2,
    maxWidth: 580,
    overflow: 'hidden',
    paddingBottom: 22,
    width: '100%',
    shadowColor: '#4D584F',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
  },
  coverArt: {
    alignItems: 'center',
    backgroundColor: '#DDE8D4',
    height: 210,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  coverSunOne: {
    backgroundColor: 'rgba(255,255,255,0.32)',
    borderRadius: 120,
    height: 240,
    left: -95,
    position: 'absolute',
    top: 32,
    width: 240,
  },
  coverSunTwo: {
    backgroundColor: 'rgba(247,219,132,0.22)',
    borderRadius: 105,
    height: 210,
    position: 'absolute',
    right: -72,
    top: -88,
    width: 210,
  },
  coverBanana: { left: '17%', position: 'absolute', top: 52, transform: [{ rotate: '-14deg' }] },
  coverBowl: { bottom: 23, position: 'absolute', right: '12%' },
  coverSparkle: { position: 'absolute', right: '12%', top: 35 },
  recipeBadge: {
    alignItems: 'center',
    backgroundColor: '#6E9B7F',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 6,
    marginTop: -16,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  recipeBadgeText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 12 },
  recipeTitle: { color: '#26362E', fontFamily: fonts.laundryBold, fontSize: 26, marginTop: 15 },
  recipeDescription: {
    color: '#6F7772',
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 7,
    paddingHorizontal: 22,
    textAlign: 'center',
  },
  recipeFacts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginTop: 16,
    paddingHorizontal: 14,
  },
  recipeFact: {
    alignItems: 'center',
    backgroundColor: '#EEF3EB',
    borderRadius: 15,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  recipeFactText: { color: '#547060', fontFamily: fonts.semibold, fontSize: 12 },
  preparationCard: {
    backgroundColor: '#FFFDF8',
    borderRadius: 24,
    elevation: 1,
    marginTop: 14,
    maxWidth: 580,
    padding: 18,
    width: '100%',
    shadowColor: '#4D584F',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
  },
  preparationHeader: { alignItems: 'center', flexDirection: 'row' },
  preparationIcon: {
    alignItems: 'center',
    backgroundColor: '#E8F0E8',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  preparationHeaderCopy: { flex: 1, marginLeft: 10 },
  preparationTitle: { color: '#2C3A32', fontFamily: fonts.bold, fontSize: 16 },
  preparationSubtitle: { color: '#828984', fontFamily: fonts.regular, fontSize: 11, marginTop: 2 },
  safetyRow: { alignItems: 'center', flexDirection: 'row', marginTop: 13 },
  safetyNumber: {
    alignItems: 'center',
    backgroundColor: '#EEF3EB',
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  safetyNumberText: { color: '#5B7666', fontFamily: fonts.bold, fontSize: 11 },
  safetyText: { color: '#545D58', flex: 1, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, marginLeft: 9 },
  allergenNotice: {
    alignItems: 'flex-start',
    backgroundColor: '#FFF4E7',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    marginTop: 15,
    padding: 12,
  },
  allergenNoticeText: { color: '#745D47', flex: 1, fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  modeSection: {
    backgroundColor: '#FFFDF8',
    borderRadius: 24,
    elevation: 1,
    marginTop: 14,
    maxWidth: 580,
    padding: 18,
    shadowColor: '#4D584F',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    width: '100%',
  },
  modeSectionTitle: { color: '#2C3A32', fontFamily: fonts.bold, fontSize: 17 },
  modeSectionSubtitle: { color: '#838A85', fontFamily: fonts.regular, fontSize: 12, marginTop: 3 },
  modeOptions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modeCard: {
    alignItems: 'flex-start',
    backgroundColor: '#F1F0EA',
    borderRadius: 19,
    flex: 1,
    minHeight: 144,
    padding: 14,
    position: 'relative',
  },
  modeCardPracticeSelected: {
    backgroundColor: '#DDEDE1',
    elevation: 2,
    shadowColor: '#52705E',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  modeCardChallengeSelected: {
    backgroundColor: '#F7E4C7',
    elevation: 2,
    shadowColor: '#8A633D',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  modeIcon: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  modeIconPractice: { backgroundColor: '#CBE1D1' },
  modeIconChallenge: { backgroundColor: '#F2D2A7' },
  modeCardTitle: { color: '#334039', fontFamily: fonts.bold, fontSize: 15, marginTop: 10 },
  modeCardBody: { color: '#737B76', fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, marginTop: 3 },
  modeSelectedBadge: {
    alignItems: 'center',
    backgroundColor: '#639177',
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    position: 'absolute',
    right: 10,
    top: 10,
    width: 20,
  },
  modeSelectedBadgeChallenge: { backgroundColor: '#B67A3E' },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#4F8D6E',
    borderRadius: 19,
    flexDirection: 'row',
    gap: 8,
    height: 56,
    justifyContent: 'center',
    marginTop: 16,
    maxWidth: 580,
    paddingHorizontal: 22,
    width: '100%',
  },
  primaryButtonText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 16 },
  playingScrollContent: { alignItems: 'center', flexGrow: 1, paddingBottom: 18 },
  challengeHud: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    marginTop: 12,
    maxWidth: 640,
    paddingHorizontal: 2,
    width: '92%',
  },
  hudChip: {
    alignItems: 'center',
    backgroundColor: '#F5E5C8',
    borderRadius: 17,
    flexDirection: 'row',
    gap: 5,
    minWidth: 76,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  hudChipUrgent: { backgroundColor: '#D66D55' },
  hudValue: { color: '#70572D', fontFamily: fonts.bold, fontSize: 14 },
  hudValueUrgent: { color: '#FFFFFF' },
  timerTrack: { backgroundColor: '#DDD9CE', borderRadius: 4, flex: 1, height: 8, overflow: 'hidden' },
  timerFill: { backgroundColor: '#6F9D7E', borderRadius: 4, height: '100%' },
  timerFillWarning: { backgroundColor: '#D5A340' },
  timerFillUrgent: { backgroundColor: '#D55F4B' },
  practiceBanner: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#E4F0E5',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  practiceBannerText: { color: '#4F725F', fontFamily: fonts.semibold, fontSize: 12 },
  progressHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 14,
    maxWidth: 640,
    width: '92%',
  },
  progressDots: { flexDirection: 'row', gap: 7 },
  progressDot: { backgroundColor: '#D8D5CC', borderRadius: 7, height: 14, width: 28 },
  progressDotDone: { alignItems: 'center', backgroundColor: '#78A388', justifyContent: 'center' },
  progressDotCurrent: { backgroundColor: '#E4B956', width: 42 },
  progressText: { color: '#6B736E', fontFamily: fonts.bold, fontSize: 12 },
  stageCard: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#FFFDF8',
    borderRadius: 28,
    elevation: 2,
    marginHorizontal: 16,
    marginTop: 13,
    maxWidth: 640,
    minHeight: 430,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingTop: 17,
    width: '92%',
    shadowColor: '#4D584F',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
  },
  stageNumberBadge: { borderRadius: 13, paddingHorizontal: 11, paddingVertical: 5 },
  stageNumberText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 11 },
  stageTitle: { color: '#26362E', fontFamily: fonts.laundryBold, fontSize: 24, marginTop: 8 },
  stageInstruction: { color: '#68716C', fontFamily: fonts.regular, fontSize: 14, marginTop: 4, textAlign: 'center' },
  actionProgress: { flexDirection: 'row', gap: 5, marginTop: 12 },
  actionProgressSegment: { backgroundColor: '#E4E0D7', borderRadius: 4, height: 7, width: 27 },
  actionProgressSegmentDone: { backgroundColor: '#75A286' },
  hintCard: {
    alignItems: 'center',
    backgroundColor: '#EFF5EC',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    maxWidth: 480,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: '100%',
  },
  hintCopy: { flex: 1 },
  hintLevelText: { color: '#7A907F', fontFamily: fonts.bold, fontSize: 9, marginBottom: 2 },
  hintText: { color: '#587061', fontFamily: fonts.medium, fontSize: 12, lineHeight: 18 },
  stageScene: { alignItems: 'center', flex: 1, justifyContent: 'center', marginTop: 4, width: '100%' },
  gestureNotice: {
    alignItems: 'center',
    backgroundColor: '#F4F1E8',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 6,
    marginBottom: 9,
    maxWidth: 440,
    paddingHorizontal: 11,
    paddingVertical: 7,
    width: '100%',
  },
  gestureNoticeText: { color: '#6B6F68', flex: 1, fontFamily: fonts.semibold, fontSize: 11 },
  stageCompleteRow: {
    alignItems: 'center',
    backgroundColor: '#ECF6EE',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 7,
    marginBottom: 15,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  stageCompleteIcon: {
    alignItems: 'center',
    backgroundColor: '#68A57E',
    borderRadius: 11,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  stageCompleteText: { color: '#4E735F', fontFamily: fonts.bold, fontSize: 13 },
  playingFooter: { alignItems: 'center', paddingBottom: 18, paddingHorizontal: 18 },
  stageNextButton: { marginTop: 12 },
  stageRetryButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    marginTop: 6,
    minHeight: 38,
    paddingHorizontal: 14,
  },
  stageRetryText: { color: '#62736A', fontFamily: fonts.semibold, fontSize: 12 },
  buttonDisabled: { backgroundColor: '#B9BDB8', opacity: 0.58 },
  draggable: {},
  draggableDisabled: { opacity: 0.72 },
  toolSelectionSection: {
    backgroundColor: '#F3F1E8',
    borderRadius: 20,
    marginBottom: 10,
    maxWidth: 390,
    padding: 11,
    width: '100%',
  },
  toolSelectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  toolSelectionTitle: { color: '#3E5147', fontFamily: fonts.bold, fontSize: 13 },
  toolSelectionHint: { color: '#778078', fontFamily: fonts.regular, fontSize: 10, marginTop: 2 },
  toolSelectionCount: { color: '#5E7D6C', fontFamily: fonts.bold, fontSize: 11 },
  toolOptionRow: { flexDirection: 'row', gap: 7, marginTop: 9 },
  toolOption: {
    alignItems: 'center',
    backgroundColor: '#FFFDF8',
    borderRadius: 15,
    flex: 1,
    minHeight: 72,
    minWidth: 0,
    paddingHorizontal: 3,
    paddingVertical: 7,
    position: 'relative',
  },
  toolOptionSelected: { backgroundColor: '#DDEADF' },
  toolOptionIcon: { alignItems: 'center', borderRadius: 16, height: 34, justifyContent: 'center', width: 34 },
  toolOptionName: { color: '#4D5A53', fontFamily: fonts.semibold, fontSize: 10, marginTop: 5, textAlign: 'center' },
  toolOptionCheck: {
    alignItems: 'center',
    backgroundColor: '#679779',
    borderRadius: 8,
    height: 16,
    justifyContent: 'center',
    position: 'absolute',
    right: 4,
    top: 4,
    width: 16,
  },
  challengeDecision: { maxWidth: 460, paddingBottom: 13, paddingTop: 9, width: '100%' },
  challengeDecisionHeader: { alignItems: 'center', flexDirection: 'row' },
  challengeDecisionIcon: {
    alignItems: 'center',
    backgroundColor: '#F1E3CF',
    borderRadius: 19,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  challengeDecisionCopy: { flex: 1, marginLeft: 10 },
  challengeDecisionEyebrow: { color: '#9A7046', fontFamily: fonts.bold, fontSize: 9 },
  challengeDecisionTitle: { color: '#3A4941', fontFamily: fonts.bold, fontSize: 14, lineHeight: 19, marginTop: 2 },
  challengeDecisionOptions: { gap: 7, marginTop: 12 },
  challengeDecisionOption: {
    alignItems: 'center',
    backgroundColor: '#F2F4EE',
    borderRadius: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 45,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  challengeDecisionOptionText: { color: '#4A5B52', flex: 1, fontFamily: fonts.semibold, fontSize: 12 },
  challengeDecisionFeedback: {
    alignItems: 'center',
    backgroundColor: '#F7E9DC',
    borderRadius: 13,
    flexDirection: 'row',
    gap: 6,
    marginTop: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  challengeDecisionFeedbackText: { color: '#815D43', flex: 1, fontFamily: fonts.medium, fontSize: 11, lineHeight: 16 },
  ingredientBasket: {
    alignItems: 'center',
    backgroundColor: '#E0ECDD',
    borderRadius: 20,
    flexDirection: 'row',
    marginBottom: 8,
    maxWidth: 390,
    paddingHorizontal: 14,
    paddingVertical: 11,
    width: '100%',
  },
  ingredientBasketIcon: {
    alignItems: 'center',
    backgroundColor: '#6F9D7E',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  ingredientBasketCopy: { flex: 1, marginLeft: 10 },
  ingredientBasketTitle: { color: '#395346', fontFamily: fonts.bold, fontSize: 13 },
  ingredientBasketHint: { color: '#65766C', fontFamily: fonts.regular, fontSize: 11, marginTop: 2 },
  dragGuideRow: { alignItems: 'center', flexDirection: 'row', gap: 5, marginBottom: 9 },
  dragGuideText: { color: '#688072', fontFamily: fonts.semibold, fontSize: 11 },
  ingredientDragWrap: { borderRadius: 18 },
  ingredientOptional: {
    backgroundColor: '#F0DEC3',
    borderRadius: 8,
    color: '#8B673F',
    fontFamily: fonts.semibold,
    fontSize: 9,
    left: 7,
    paddingHorizontal: 5,
    paddingVertical: 2,
    position: 'absolute',
    top: 7,
  },
  ingredientGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 430 },
  ingredientCard: {
    alignItems: 'center',
    backgroundColor: '#F8F5ED',
    borderRadius: 18,
    height: 112,
    justifyContent: 'center',
    position: 'relative',
    width: 104,
  },
  ingredientCardSelected: {
    backgroundColor: '#DDEEDF',
    elevation: 2,
    shadowColor: '#5D7968',
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 7,
  },
  ingredientIcon: { alignItems: 'center', borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
  ingredientName: { color: '#424C46', fontFamily: fonts.bold, fontSize: 13, marginTop: 8 },
  ingredientCheck: {
    alignItems: 'center',
    backgroundColor: '#69A17E',
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    position: 'absolute',
    right: 7,
    top: 7,
    width: 20,
  },
  inlineNoticeArea: { height: 28, justifyContent: 'center', marginTop: 6 },
  inlineNotice: { color: '#A06149', fontFamily: fonts.semibold, fontSize: 12, textAlign: 'center' },
  mainFoodAction: { alignItems: 'center', justifyContent: 'center', minHeight: 260, width: '100%' },
  peelDragTarget: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, position: 'relative' },
  peelGrip: {
    alignItems: 'center',
    backgroundColor: '#E1B94A',
    borderRadius: 14,
    bottom: 8,
    flexDirection: 'row',
    gap: 3,
    height: 28,
    justifyContent: 'center',
    position: 'absolute',
    width: 56,
  },
  peelGripLine: { backgroundColor: 'rgba(91,72,27,0.38)', borderRadius: 2, height: 12, width: 3 },
  actionHintPill: {
    alignItems: 'center',
    backgroundColor: '#FFF3C8',
    borderRadius: 17,
    flexDirection: 'row',
    gap: 7,
    marginTop: 18,
    paddingHorizontal: 15,
    paddingVertical: 8,
  },
  actionHintText: { color: '#7B6428', fontFamily: fonts.bold, fontSize: 13 },
  mixHintText: { color: '#547665' },
  bananaArt: { height: 190, position: 'relative', width: 150 },
  bananaStem: {
    backgroundColor: '#8B6D2F',
    borderRadius: 5,
    height: 24,
    left: 68,
    position: 'absolute',
    top: 5,
    width: 14,
    zIndex: 5,
  },
  bananaStemOpen: { transform: [{ rotate: '-8deg' }] },
  bananaFruit: {
    backgroundColor: '#FFF0A7',
    borderColor: '#E6C85F',
    borderRadius: 26,
    borderWidth: 2,
    height: 145,
    left: 49,
    opacity: 0.25,
    position: 'absolute',
    top: 23,
    width: 52,
  },
  bananaFruitVisible: { opacity: 1 },
  bananaPeel: {
    backgroundColor: '#F2CF4A',
    borderColor: '#C9A52B',
    borderRadius: 24,
    borderWidth: 2,
    height: 142,
    left: 51,
    position: 'absolute',
    top: 28,
    width: 48,
  },
  bananaPeelLeft: { transform: [{ rotate: '-2deg' }] },
  bananaPeelMiddle: { opacity: 0.98 },
  bananaPeelRight: { transform: [{ rotate: '2deg' }] },
  bananaPeelOpen: { height: 116, top: 72, transform: [{ rotate: '24deg' }], width: 29 },
  bananaTip: { backgroundColor: '#85652A', borderRadius: 4, bottom: 16, height: 10, left: 70, position: 'absolute', width: 10 },
  splitStage: { alignItems: 'center', justifyContent: 'center', width: '100%' },
  splitSourceCard: {
    alignItems: 'center',
    backgroundColor: '#FFF1B9',
    borderRadius: 22,
    height: 118,
    justifyContent: 'center',
    width: 112,
  },
  splitPieceDrag: { alignItems: 'center', height: 58, justifyContent: 'center', width: 66 },
  sourceCompleteIcon: {
    alignItems: 'center',
    backgroundColor: '#73A185',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  sourceCount: { color: '#75672E', fontFamily: fonts.bold, fontSize: 11, marginTop: 8 },
  splitSourceRow: { flexDirection: 'row', gap: 7, marginBottom: 5 },
  splitPieceButton: {
    alignItems: 'center',
    backgroundColor: '#F1EEE5',
    borderRadius: 15,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  splitPieceCurrent: {
    backgroundColor: '#FFF0A8',
    elevation: 2,
    shadowColor: '#B28C2F',
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 5,
  },
  splitPieceMoved: { backgroundColor: '#EEF4EE' },
  splitPiece: { backgroundColor: '#FFE68A', borderColor: '#DBBD50', borderRadius: 17, borderWidth: 2, height: 34, width: 34 },
  sceneCaption: { color: '#777F7A', fontFamily: fonts.semibold, fontSize: 12, marginTop: 5 },
  transferStage: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', width: '100%' },
  plateStage: { alignItems: 'center', justifyContent: 'center', minHeight: 250, width: '100%' },
  plateSource: { alignItems: 'center', height: 150, justifyContent: 'center', width: 116 },
  plateMat: {
    alignItems: 'center',
    backgroundColor: '#DFEBDD',
    borderRadius: 28,
    height: 150,
    justifyContent: 'center',
    width: 138,
  },
  plateMatDone: { backgroundColor: '#D5E8D6' },
  plateMatText: { color: '#6C8174', fontFamily: fonts.bold, fontSize: 10, marginTop: 5 },
  cleanupStage: { alignItems: 'center', justifyContent: 'center', minHeight: 255, width: '100%' },
  cleanupCounter: {
    alignItems: 'center',
    backgroundColor: '#EAF2EA',
    borderRadius: 15,
    flexDirection: 'row',
    gap: 6,
    marginBottom: 13,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  cleanupCounterText: { color: '#527665', fontFamily: fonts.bold, fontSize: 11 },
  cleanupSourceCard: {
    alignItems: 'center',
    backgroundColor: '#F8F1E6',
    borderRadius: 22,
    height: 124,
    justifyContent: 'center',
    width: 112,
  },
  cleanupItem: {
    alignItems: 'center',
    backgroundColor: '#F3E0A8',
    borderRadius: 18,
    height: 88,
    justifyContent: 'center',
    width: 88,
  },
  cleanupCup: { backgroundColor: '#DDEDF4' },
  cleanupDish: { backgroundColor: '#E4ECE7' },
  cleanupCloth: { backgroundColor: '#DCEDE3' },
  cleanupItemText: { color: '#5F625E', fontFamily: fonts.bold, fontSize: 10, marginTop: 4 },
  cleanupBins: { flexDirection: 'row', gap: 7 },
  cleanupBin: {
    alignItems: 'center',
    backgroundColor: '#EEEAE0',
    borderRadius: 17,
    height: 105,
    justifyContent: 'center',
    width: 72,
  },
  cleanupBinActiveFood: { backgroundColor: '#F1E5C9' },
  cleanupBinActiveRecycle: { backgroundColor: '#DDECF2' },
  cleanupBinLabel: { color: '#626B65', fontFamily: fonts.bold, fontSize: 10, marginVertical: 4 },
  cleanupSink: {
    alignItems: 'center',
    backgroundColor: '#DDECF0',
    borderRadius: 20,
    height: 112,
    justifyContent: 'center',
    width: 136,
  },
  cleanupSinkBasin: { backgroundColor: '#A9C7CF', borderRadius: 16, height: 24, marginTop: 3, width: 88 },
  cleanupSinkText: { color: '#587680', fontFamily: fonts.bold, fontSize: 10, marginTop: 4 },
  cleanupSinkCount: { color: '#75909A', fontFamily: fonts.semibold, fontSize: 9, marginTop: 1 },
  cleanupSpillArea: {
    alignItems: 'center',
    backgroundColor: '#E6E2D5',
    borderRadius: 20,
    height: 112,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    width: 136,
  },
  cleanupSpillDrop: { backgroundColor: '#F8F3DD', borderRadius: 18, height: 35, transform: [{ rotate: '-8deg' }], width: 68 },
  cleanupSpillDropSmall: { height: 14, position: 'absolute', right: 19, top: 25, width: 20 },
  cleanupSpillText: { color: '#777262', fontFamily: fonts.bold, fontSize: 10, marginTop: 7 },
  cleanupFinished: {
    alignItems: 'center',
    backgroundColor: '#DDECE0',
    borderRadius: 20,
    height: 112,
    justifyContent: 'center',
    width: 136,
  },
  cleanupFinishedText: { color: '#557564', fontFamily: fonts.bold, fontSize: 10, marginTop: 6 },
  toppingStage: { alignItems: 'center', justifyContent: 'center', width: '100%' },
  yogurtCup: {
    alignItems: 'center',
    backgroundColor: '#EAF4F8',
    borderColor: '#9FC8D9',
    borderRadius: 16,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderWidth: 2,
    height: 128,
    justifyContent: 'center',
    position: 'relative',
    width: 92,
  },
  yogurtLid: { backgroundColor: '#6FA5BC', borderRadius: 6, height: 12, left: -5, position: 'absolute', top: -7, width: 100 },
  yogurtCupText: { color: '#537D90', fontFamily: fonts.bold, fontSize: 12, marginTop: 4 },
  foodSourceDone: { opacity: 0.55 },
  transferArrow: { alignItems: 'center', marginHorizontal: 9 },
  transferCount: { color: '#789184', fontFamily: fonts.bold, fontSize: 11, marginTop: 4 },
  cerealBox: {
    alignItems: 'center',
    backgroundColor: '#F5D9A7',
    borderColor: '#B9824E',
    borderRadius: 14,
    borderWidth: 2,
    height: 140,
    justifyContent: 'center',
    position: 'relative',
    width: 92,
  },
  cerealBoxTop: { backgroundColor: '#D89B59', borderRadius: 4, height: 13, position: 'absolute', top: 0, width: '100%' },
  cerealBoxText: { color: '#8A5C36', fontFamily: fonts.bold, fontSize: 12, marginTop: 3 },
  cerealSafeMark: { backgroundColor: '#FFF5DF', borderRadius: 8, color: '#8A633D', fontFamily: fonts.semibold, fontSize: 9, marginTop: 6, paddingHorizontal: 6, paddingVertical: 3 },
  skipToppingButton: {
    alignItems: 'center',
    backgroundColor: '#EEEDE7',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 6,
    marginTop: 3,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  skipToppingText: { color: '#64736B', fontFamily: fonts.semibold, fontSize: 12 },
  bowlStage: { height: 164, position: 'relative', width: 180 },
  bowlBack: { backgroundColor: '#D6E5E1', borderColor: '#72918A', borderRadius: 70, borderWidth: 3, height: 75, left: 20, position: 'absolute', top: 35, width: 140 },
  bowlFood: { borderRadius: 55, bottom: 55, left: 28, overflow: 'hidden', position: 'absolute', width: 124, zIndex: 2 },
  bowlFront: { backgroundColor: '#8EB5AE', borderBottomLeftRadius: 58, borderBottomRightRadius: 58, borderColor: '#628780', borderTopColor: 'transparent', borderWidth: 3, height: 74, left: 20, position: 'absolute', top: 72, width: 140, zIndex: 3 },
  bowlBananaPiece: { backgroundColor: '#FFE489', borderColor: '#D6B949', borderRadius: 9, borderWidth: 1, height: 18, position: 'absolute', width: 18 },
  bowlTopping: { backgroundColor: '#B77947', borderRadius: 4, height: 8, position: 'absolute', transform: [{ rotate: '25deg' }], width: 12 },
  spoon: { height: 142, left: 88, position: 'absolute', top: -1, width: 34, zIndex: 5 },
  spoonHandle: { backgroundColor: '#E5E0D6', borderColor: '#8D8C87', borderRadius: 4, borderWidth: 2, height: 112, left: 13, position: 'absolute', top: 0, width: 9 },
  spoonHead: { backgroundColor: '#E5E0D6', borderColor: '#8D8C87', borderRadius: 14, borderWidth: 2, bottom: 0, height: 28, left: 4, position: 'absolute', width: 28 },
  mixDragLayer: {
    alignItems: 'center',
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    marginTop: -142,
    width: 64,
    zIndex: 8,
  },
  mixSpoonHandle: {
    alignItems: 'center',
    backgroundColor: '#F0ECE2',
    borderRadius: 25,
    elevation: 3,
    height: 50,
    justifyContent: 'center',
    shadowColor: '#4F5D55',
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 7,
    transform: [{ rotate: '-24deg' }],
    width: 50,
  },
  resultScrollContent: { alignItems: 'center', paddingBottom: 30, paddingHorizontal: 18, paddingTop: 18 },
  resultCard: {
    alignItems: 'center',
    backgroundColor: '#FFFDF8',
    borderRadius: 28,
    elevation: 2,
    maxWidth: 580,
    padding: 22,
    shadowColor: '#4D584F',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    width: '100%',
  },
  resultHalo: { alignItems: 'center', backgroundColor: '#E7F0DF', borderRadius: 100, height: 200, justifyContent: 'center', position: 'relative', width: 200 },
  resultBowl: { marginTop: 22 },
  resultSparkle: { position: 'absolute' },
  resultSparkleOne: { right: 12, top: 30 },
  resultSparkleTwo: { bottom: 34, left: 19 },
  resultEyebrow: { color: '#6D947C', fontFamily: fonts.bold, fontSize: 13, marginTop: 15 },
  resultTitle: { color: '#26362E', fontFamily: fonts.laundryBold, fontSize: 27, marginTop: 4 },
  resultDescription: { color: '#6D756F', fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, marginTop: 8, textAlign: 'center' },
  badgeRow: { flexDirection: 'row', gap: 8, marginTop: 17 },
  completionBadge: { alignItems: 'center', backgroundColor: '#EDF5ED', borderRadius: 15, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 7 },
  completionBadgeText: { color: '#4F7B65', fontFamily: fonts.bold, fontSize: 11 },
  sequenceCard: { backgroundColor: '#FFFDF8', borderRadius: 22, marginTop: 13, maxWidth: 580, padding: 17, width: '100%' },
  sequenceTitle: { color: '#35443B', fontFamily: fonts.bold, fontSize: 15 },
  sequenceList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  sequenceItem: { alignItems: 'center', backgroundColor: '#F5F2E9', borderRadius: 14, flexDirection: 'row', gap: 6, paddingHorizontal: 9, paddingVertical: 7 },
  sequenceNumber: { alignItems: 'center', borderRadius: 9, height: 18, justifyContent: 'center', width: 18 },
  sequenceNumberText: { color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 9 },
  sequenceText: { color: '#5D655F', fontFamily: fonts.semibold, fontSize: 11 },
  secondaryButton: { alignItems: 'center', backgroundColor: '#E7EFE8', borderRadius: 19, flexDirection: 'row', gap: 7, height: 52, justifyContent: 'center', marginTop: 9, maxWidth: 580, width: '100%' },
  secondaryButtonText: { color: '#4E735F', fontFamily: fonts.bold, fontSize: 14 },
  countdownOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: 'rgba(39,49,43,0.38)',
    justifyContent: 'center',
    zIndex: 84,
  },
  countdownCard: {
    alignItems: 'center',
    backgroundColor: '#FFF8E8',
    borderRadius: 34,
    elevation: 12,
    height: 210,
    justifyContent: 'center',
    shadowColor: '#26372E',
    shadowOffset: { height: 9, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    width: 210,
  },
  countdownEyebrow: { color: '#A2733E', fontFamily: fonts.bold, fontSize: 14 },
  countdownNumber: { color: '#4F7F67', fontFamily: fonts.laundryBold, fontSize: 78, lineHeight: 88 },
  countdownHint: { color: '#766E61', fontFamily: fonts.regular, fontSize: 11, marginTop: 2 },
  timeOverOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: 'rgba(39,49,43,0.46)',
    justifyContent: 'center',
    paddingHorizontal: 18,
    zIndex: 86,
  },
  timeOverSheet: {
    alignItems: 'center',
    backgroundColor: '#FFFDF8',
    borderRadius: 28,
    elevation: 12,
    maxWidth: 380,
    padding: 22,
    shadowColor: '#26372E',
    shadowOffset: { height: 9, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    width: '100%',
  },
  timeOverIcon: {
    alignItems: 'center',
    backgroundColor: '#F7E4C9',
    borderRadius: 26,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  timeOverTitle: { color: '#2C3932', fontFamily: fonts.laundryBold, fontSize: 23, marginTop: 12 },
  timeOverBody: {
    color: '#717974',
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
    textAlign: 'center',
  },
  confirmationOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', zIndex: 90 },
  confirmationDim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(42,47,43,0.42)' },
  confirmationSheet: {
    alignItems: 'center',
    backgroundColor: '#FFFDF8',
    borderRadius: 26,
    elevation: 12,
    maxWidth: 360,
    padding: 22,
    shadowColor: '#26372E',
    shadowOffset: { height: 9, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    width: '88%',
  },
  confirmationIcon: { alignItems: 'center', backgroundColor: '#FFF0D6', borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
  confirmationTitle: { color: '#2C3932', fontFamily: fonts.laundryBold, fontSize: 22, marginTop: 12 },
  confirmationBody: { color: '#727A75', fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, marginTop: 6, textAlign: 'center' },
  confirmationExitButton: { alignItems: 'center', height: 44, justifyContent: 'center', marginTop: 3, width: '100%' },
  confirmationExitText: { color: '#8C6C5B', fontFamily: fonts.semibold, fontSize: 14 },
});
