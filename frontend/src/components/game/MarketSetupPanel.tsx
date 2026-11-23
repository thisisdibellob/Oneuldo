import { MarketTrainingOptions } from './MarketTrainingOptions';
import { MarketTrainingLibrary } from './MarketTrainingLibrary';
import { MarketTrainingObjectives } from './MarketTrainingObjectives';
import { useEffect, useRef, useState } from 'react';
import { Image, Platform, Share, StyleSheet, Text, View } from 'react-native';
import { MarketSessionConfig, parseMarketSessionConfig } from '../../game/marketSession';
import { MARKET_LAYOUT_OPTIONS, type MarketEnvironmentConfig, type MarketLayoutId } from '../../game/marketEnvironment';
import { DEFAULT_MARKET_LEARNING_CONFIG } from '../../game/marketLearning';
import { importMarketSettings, exportMarketSettings } from '../../game/marketSettingsTransfer';
import { useGamePreferences } from '../../game/gamePreferences';
import {
  SettingsSurface,
  SettingsTabs,
  SettingsPage,
  SettingsScroll,
  SettingsButton as Choice,
  SettingsInput,
  SettingsAccordion,
  SettingsStepper,
  settingsAssets,
  settingsColors as c,
  ui
} from './MarketSettingsUi';
import { MarketLayoutEditor } from './MarketLayoutEditor';
import { clearMarketTilemapFromConfig } from '../../game/marketTilemap';

export type MarketSetupChanges = { shelfOrderTouched: boolean; changedConfigPaths?: string[]; lockedSettings?: Record<string,unknown>; trainingTestTouched?:boolean };
type Section = 'layout' | 'practice' | 'transfer';
/** One draft and one apply action. Live editing only replaces space, never task progress. */
export function MarketSetupPanel({
  config,
  onApply,
  onClose,
  layoutOnly = false
}: {
  config: MarketSessionConfig;
  onApply: (config: MarketSessionConfig, changes: MarketSetupChanges) => void;
  onClose: () => void;
  layoutOnly?: boolean;
}) {
  const { preferences, updatePreferences } = useGamePreferences();
  const [draft, setDraft] = useState(config);
  const [section, setSection] = useState<Section>('layout');
  const [json, setJson] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [automatic, setAutomatic] = useState(false);
  const [extraPractice, setExtraPractice] = useState(false);
  const penaltyMemory = useRef({
    alarmPenaltyPoints: config.alarmPenaltyPoints || 10,
    wrongWayPenaltyPoints: config.wrongWayPenaltyPoints || 10,
    cashierRequestPenaltyPoints: config.cashierRequestPenaltyPoints || 10
  });
  const [pendingPreset, setPendingPreset] = useState<'random' | MarketLayoutId | null>(null);
  const [editingConfig, setEditingConfig] = useState<MarketSessionConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const pendingFile = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pendingFile.current?.remove();
    };
  }, []);
  const touched = useRef(new Set<string>());
  const collectChanges = (before: unknown, after: unknown, prefix = '') => {
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    if (!after || typeof after !== 'object' || Array.isArray(after)) { if(prefix) touched.current.add(prefix); return; }
    const previous=before&&typeof before==='object'?before as Record<string,unknown>:{};
    const current=after as Record<string,unknown>;
    for (const key of new Set([...Object.keys(previous),...Object.keys(current)])) collectChanges(previous[key],current[key],prefix?prefix+'.'+key:key);
  };
  const update = (next: MarketSessionConfig) => {
    collectChanges(draft, next);
    setDraft(next);
    setError('');
    setNotice('');
  };
  const learning = { ...DEFAULT_MARKET_LEARNING_CONFIG, ...draft.learning };
  const learn = (next: Partial<typeof learning>) => update({ ...draft, learning: { ...learning, ...next } });
  const env = (next: Partial<MarketSessionConfig['environment']>) =>
    update({ ...draft, environment: { ...draft.environment, ...next } });
  const customLayout = draft.environment.tilemap;
  const changePreset = (preset: 'random' | MarketLayoutId) => {
    const environment = customLayout
      ? clearMarketTilemapFromConfig(draft.environment as MarketEnvironmentConfig)
      : draft.environment;
    if (preset === 'random') {
      const seed = 'market-' + Date.now();
      update({
        ...draft,
        seed,
        environment: { ...environment, seed, shelfOrder: 'random' }
      });
    } else update({ ...draft, environment: { ...environment, layoutId: preset } });
    setPendingPreset(null);
  };
  const choosePreset = (preset: 'random' | MarketLayoutId) =>
    customLayout ? setPendingPreset(preset) : changePreset(preset);
  const openLayoutEditor = () => {
    try {
      setEditingConfig(parseMarketSessionConfig(JSON.stringify(draft)));
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '설정 내용을 확인해 주세요.');
    }
  };
  const importJson = (text: string) => {
    try {
      const imported = importMarketSettings(text, draft, layoutOnly);
      update(imported.config);
      setNotice(
        imported.kind === 'settings'
          ? '전체 설정을 불러왔어요. 배치와 연습 조건을 확인한 뒤 적용해 주세요.'
          : imported.kind === 'settings-layout'
            ? '전체 설정에서 배치만 불러왔어요. 현재 구매 조건과 진행은 유지돼요.'
            : '배치만 불러왔어요. 구매 조건과 재고는 유지돼요.'
      );
      setPendingPreset(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'JSON 내용을 확인해 주세요.');
    }
  };
  const importFile = () => {
    if (Platform.OS !== 'web' || busy) return;
    pendingFile.current?.remove();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    pendingFile.current = input;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !mounted.current) return;
      if (file.size > 1_000_000) {
        setError('JSON 파일은 1MB 이하로 골라 주세요.');
        return;
      }
      setBusy(true);
      try {
        const text = await file.text();
        if (mounted.current) {
          setJson(text);
          importJson(text);
        }
      } catch {
        if (mounted.current) setError('파일을 읽지 못했어요. JSON 내용을 붙여 넣어 주세요.');
      } finally {
        if (mounted.current) setBusy(false);
        input.remove();
      }
    };
    input.click();
  };
  const save = async (onlyLayout: boolean) => {
    try {
      const text = exportMarketSettings(draft, onlyLayout);
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = onlyLayout ? 'market-layout.json' : 'market-config.json';
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else
        await Share.share({
          title: onlyLayout ? '마트 배치' : '마트 전체 설정',
          message: text
        });
      if (mounted.current) {
        setError('');
        setNotice(onlyLayout ? '배치 JSON을 내보냈어요.' : '배치와 연습 조건을 함께 내보냈어요.');
      }
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : '설정을 저장하지 못했어요.');
    }
  };
  const apply = () => {
    try {
      onApply(parseMarketSessionConfig(JSON.stringify(draft)), { shelfOrderTouched: touched.current.has('environment.shelfOrder'), changedConfigPaths: [...touched.current], trainingTestTouched:[...touched.current].some(path=>path==='objectives'||path.startsWith('objectives.')||path==='training'||path.startsWith('training.')) });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '설정 내용을 확인해 주세요.');
    }
  };
  const stepCount = (
    key: 'employeeCount' | 'customerCount' | 'pillarCount' | 'cashierCount',
    min: number,
    max: number,
    direction: 1 | -1
  ) => {
    const value = draft.environment[key];
    const current = typeof value === 'number' ? value - min + 1 : 0;
    const index = (current + direction + max - min + 2) % (max - min + 2);
    env({ [key]: index === 0 ? (key === 'cashierCount' ? 'random' : { min, max }) : min + index - 1 });
  };
  const countText = (
    key: 'employeeCount' | 'customerCount' | 'pillarCount' | 'cashierCount',
    min: number,
    max: number
  ) => {
    const value = draft.environment[key];
    return typeof value === 'number'
      ? String(value)
      : value && typeof value === 'object'
        ? `${value.min}~${value.max}`
        : `${min}~${max}`;
  };
  const penalty = (
    title: string,
    key: 'alarmPenaltyPoints' | 'wrongWayPenaltyPoints' | 'cashierRequestPenaltyPoints',
    help: string
  ) => {
    const enabled = draft[key] > 0;
    return (
      <View style={s.penaltyBlock}>
        <View style={s.splitRow}>
          <View style={s.penaltyOptions}>
            <Text style={ui.label}>{title}</Text>
            <View style={[ui.row, { marginTop: 11 }]}>
              <Choice
                text="활성화"
                label={`${title} 활성화`}
                selected={enabled}
                onPress={() => update({ ...draft, [key]: penaltyMemory.current[key] || 10 })}
              />
              <Choice
                text="비활성화"
                label={`${title} 비활성화`}
                selected={!enabled}
                onPress={() => {
                  if (enabled) penaltyMemory.current[key] = draft[key];
                  update({ ...draft, [key]: 0 });
                }}
              />
            </View>
          </View>
          <View style={s.penaltyScore}>
            <Text style={ui.label}>감점 점수</Text>
            <SettingsInput
              accessibilityLabel={
                key === 'alarmPenaltyPoints'
                  ? '출입 경보기 감점'
                  : key === 'wrongWayPenaltyPoints'
                    ? '출구 역진입 감점'
                    : '계산원 확인 감점'
              }
              keyboardType="number-pad"
              editable={enabled}
              value={String(draft[key])}
              onChangeText={(text) => update({ ...draft, [key]: Number(text) })}
              style={[s.number, { marginTop: 11 }, !enabled && ui.disabled]}
            />
          </View>
        </View>
        <Text style={[ui.hint, { marginTop: 7 }]}>{help}</Text>
      </View>
    );
  };
  if (editingConfig)
    return (
      <MarketLayoutEditor
        config={editingConfig.environment as MarketEnvironmentConfig}
        onApply={(environment) => {
          update({ ...editingConfig, environment });
          setEditingConfig(null);
        }}
        onOpenTransfer={(environment) => {
          update({ ...editingConfig, environment });
          setEditingConfig(null);
          setSection('transfer');
        }}
        onClose={() => setEditingConfig(null)}
      />
    );
  const lane =
    draft.environment.kioskLane ??
    (draft.environment.kioskPresent === 'random' ? 'random' : draft.environment.kioskPresent ? 'checkout-2' : 'none');
  return (
    <SettingsSurface
      footer={
        <>
          <Choice text="뒤로가기" footer disabled={busy} onPress={onClose} />
          <Choice text={layoutOnly ? '배치 적용' : '설정 적용'} footer selected disabled={busy} onPress={apply} />
        </>
      }
    >
      <SettingsTabs
        options={
          [
            { id: 'layout', label: '기본 설정' },
            { id: 'practice', label: '상황 설정' },
            { id: 'transfer', label: '세이브 · 로드' }
          ] as const
        }
        value={section}
        disabled={busy}
        onChange={(next) => {
          setSection(next);
          setError('');
        }}
      />
      <SettingsScroll
        key={section}
        style={ui.scroll}
        contentContainerStyle={ui.content}
        keyboardShouldPersistTaps="handled"
        testID="market-settings-scroll"
      >
        <SettingsPage key={section}>
          {section === 'layout' ? (
            <>
              <Choice text="" label="직접 배치 편집" selected={false} onPress={openLayoutEditor} style={s.editCard} />
              <View pointerEvents="none" style={s.editCardContent}>
                <Image source={settingsAssets.edit} style={s.editIcon} />
                <Text style={s.editText}>직접 배치 편집</Text>
              </View>
              {!layoutOnly ? <View style={{marginTop:16}}><MarketTrainingOptions value={draft.training} onChange={training=>update({...draft,training})}><MarketTrainingObjectives config={draft} onChange={update}/><MarketTrainingLibrary config={draft} onSelect={update}/></MarketTrainingOptions></View> : null}
              {layoutOnly ? (
                <Text style={[ui.hint, { marginTop: 16 }]}>
                  장보기 중에는 배치만 바꿔요. 구매 조건과 진행은 유지돼요.
                </Text>
              ) : (
                <View style={{ marginTop: 16 }}>
                  <SettingsAccordion label="구조 및 배치" open={automatic} onToggle={() => setAutomatic(!automatic)}>
                    <View style={ui.section}>
                      <Text style={ui.label}>재현용 시드</Text>
                      <SettingsInput
                        accessibilityLabel="환경 시드"
                        value={String(draft.seed)}
                        autoCapitalize="none"
                        onChangeText={(seed) => update({ ...draft, seed, environment: { ...draft.environment, seed } })}
                      />
                      <Text style={ui.hint}>같은 값과 설정으로 랜덤 배치를 다시 만들어요.</Text>
                    </View>
                    <View style={ui.section}>
                      <Text style={ui.label}>인테리어</Text>
                      <View style={ui.row}>
                        <Choice
                          text="화이트 · 그린"
                          selected={preferences.marketInteriorTheme === 'classic'}
                          onPress={() => updatePreferences({ marketInteriorTheme: 'classic' })}
                          style={ui.grow}
                        />
                        <Choice
                          text="핑크 · 그린"
                          selected={preferences.marketInteriorTheme === 'cozy'}
                          onPress={() => updatePreferences({ marketInteriorTheme: 'cozy' })}
                          style={ui.grow}
                        />
                      </View>
                    </View>
                    <View style={ui.section}>
                      <Text style={ui.label}>도면</Text>
                      <View style={ui.row}>
                        {MARKET_LAYOUT_OPTIONS.map((option, index) => (
                          <Choice
                            key={option.id}
                            text={['기본', '가로 배치', '모퉁이'][index]}
                            label={option.label}
                            selected={!customLayout && (draft.environment.layoutId ?? 'classic') === option.id}
                            onPress={() => choosePreset(option.id)}
                          />
                        ))}
                      </View>
                    </View>
                    {pendingPreset ? (
                      <View style={ui.section}>
                        <Text style={ui.hint}>직접 만든 배치를 바꿀까요? 보관함에 저장한 배치는 남아 있어요.</Text>
                        <View style={[ui.row, { flexWrap: 'wrap' }]}>
                          <Choice text="직접 배치 유지" onPress={() => setPendingPreset(null)} />
                          <Choice text="선택한 배치로 변경" selected onPress={() => changePreset(pendingPreset)} />
                        </View>
                      </View>
                    ) : null}
                    <View style={ui.section}>
                      <Text style={ui.label}>기믹 배치</Text>
                      <View style={ui.row}>
                        <Choice
                          text="없음"
                          label="공사 없음"
                          selected={!draft.environment.entranceConstruction}
                          onPress={() => env({ entranceConstruction: false })}
                        />
                        <Choice
                          text="입구 공사"
                          label="입구 공사 중"
                          selected={draft.environment.entranceConstruction === true}
                          onPress={() => env({ entranceConstruction: true })}
                        />
                      </View>
                    </View>
                    <View style={ui.section}>
                      <Text style={ui.label}>개수/인원 변경</Text>
                      <View style={s.counts}>
                        <SettingsStepper
                          label="종업원"
                          value={countText('employeeCount', 1, 3)}
                          disabled={!!customLayout}
                          onStep={(direction) => stepCount('employeeCount', 1, 3, direction)}
                        />
                        <SettingsStepper
                          label="손님"
                          value={countText('customerCount', 1, 5)}
                          disabled={!!customLayout}
                          onStep={(direction) => stepCount('customerCount', 1, 5, direction)}
                        />
                        <SettingsStepper
                          label="기둥"
                          value={countText('pillarCount', 0, 4)}
                          onStep={(direction) => stepCount('pillarCount', 0, 4, direction)}
                        />
                        <SettingsStepper
                          label="계산원"
                          value={countText('cashierCount', 0, 2)}
                          onStep={(direction) => stepCount('cashierCount', 0, 2, direction)}
                        />
                      </View>
                      {customLayout ? <Text style={ui.hint}>종업원과 손님은 직접 배치 편집에서 바꿔요.</Text> : null}
                    </View>
                    <View style={ui.section}>
                      <Text style={ui.label}>라인별 계산대 구성</Text>
                      <View style={ui.row}>
                        <View style={{ gap: 10, flex: 1.1 }}>
                          {(['checkout', 'checkout-2'] as const).map((id, index) => (
                            <View key={id} style={ui.row}>
                              <Text style={s.laneNumber}>{index + 1}</Text>
                              <Choice
                                text="일반"
                                label={`${index + 1}번 줄 일반 계산대`}
                                selected={lane !== 'random' && lane !== id}
                                style={lane === 'random' && ui.disabled}
                                onPress={() => env({ kioskLane: lane === id || lane === 'random' ? 'none' : lane })}
                              />
                              <Choice
                                text="무인"
                                label={`${index + 1}번 줄 무인 계산대`}
                                selected={lane === id}
                                style={lane === 'random' && ui.disabled}
                                onPress={() => env({ kioskLane: id })}
                              />
                            </View>
                          ))}
                        </View>
                        <Choice
                          text="모두 랜덤으로"
                          selected={lane === 'random'}
                          style={{ flex: 1, alignSelf: 'stretch' }}
                          onPress={() => env({ kioskLane: 'random' })}
                        />
                      </View>
                    </View>
                    {!customLayout ? (
                      <View style={ui.section}>
                        <Text style={ui.label}>진열대 위치</Text>
                        <View style={ui.row}>
                          <Choice
                            text="매번 섞기"
                            selected={draft.environment.shelfOrder === 'random'}
                            onPress={() => env({ shelfOrder: 'random' })}
                          />
                          <Choice
                            text="정해진 위치"
                            selected={JSON.stringify(draft.environment.shelfOrder)===JSON.stringify(['produce','fresh','household','meal','drink'])}
                            onPress={() => env({ shelfOrder: ['produce', 'fresh', 'household', 'meal', 'drink'] })}
                          />
                        </View>
                        <Choice text="새 랜덤 배치" onPress={() => choosePreset('random')} />
                      </View>
                    ) : null}
                  </SettingsAccordion>
                </View>
              )}
            </>
          ) : section === 'practice' ? (
            layoutOnly ? (
              <Text style={ui.hint}>
                상황 설정은 장보기를 시작하기 전에 바꿀 수 있어요. 현재 구매 조건과 점수는 유지돼요.
              </Text>
            ) : (
              <View style={{ paddingHorizontal: 4 }}>
                <View style={[s.splitRow, { marginBottom: 18 }]}>
                  <View style={{ flex: 1.28, gap: 11 }}>
                    <Text style={ui.label}>상품별 기본 재고</Text>
                    <SettingsInput
                      accessibilityLabel="상품별 기본 재고"
                      keyboardType="number-pad"
                      style={s.number}
                      value={String(draft.stockPerProduct)}
                      onChangeText={(text) => update({ ...draft, stockPerProduct: Number(text) })}
                    />
                  </View>
                  <View style={[ui.grow, ui.disabled, { gap: 11 }]}>
                    <Text style={ui.label}>기본 점수(고정)</Text>
                    <SettingsInput accessibilityLabel="기본 점수 고정" value="100" editable={false} style={s.number} />
                  </View>
                </View>
                {penalty('출입 경보기 경보', 'alarmPenaltyPoints', '계산하지 않은 물건을 담고 출입문을 넘을 때')}
                {penalty('출구 역진입 경보', 'wrongWayPenaltyPoints', '출구에서 매장으로 진입 시')}
                {penalty(
                  '계산원 확인 감점',
                  'cashierRequestPenaltyPoints',
                  '상주 계산원이 있는데 점원에게 계산을 요청 시'
                )}
                <View style={[s.splitRow, { marginBottom: 20 }]}>
                  <View style={{ gap: 11 }}>
                    <Text style={ui.label}>품절 상황</Text>
                    <View style={ui.row}>
                      <Choice
                        text="있음"
                        label="품절 상황 있음"
                        selected={learning.stockoutEnabled}
                        onPress={() => learn({ stockoutEnabled: true })}
                      />
                      <Choice
                        text="없음"
                        label="품절 상황 없음"
                        selected={!learning.stockoutEnabled}
                        onPress={() => learn({ stockoutEnabled: false })}
                      />
                    </View>
                  </View>
                  <View style={{ gap: 11 }}>
                    <Text style={ui.label}>대체 상품 구매</Text>
                    <View style={ui.row}>
                      <Choice
                        text="허용"
                        label="대체 상품 허용"
                        selected={learning.allowSubstitution}
                        onPress={() => learn({ allowSubstitution: true })}
                      />
                      <Choice
                        text="원래 상품만"
                        label="원래 상품만 구매"
                        selected={!learning.allowSubstitution}
                        onPress={() => learn({ allowSubstitution: false })}
                      />
                    </View>
                  </View>
                </View>
                <View style={s.splitRow}>
                  <View style={s.penaltyOptions}>
                    <Text style={ui.label}>자율 고르기</Text>
                    <View style={[ui.row, { marginTop: 11 }]}>
                      <Choice
                        text="음료"
                        label="선택 장보기 있음"
                        selected={learning.budgetChoiceEnabled}
                        onPress={() => learn({ budgetChoiceEnabled: true })}
                      />
                      <Choice
                        text="없음"
                        label="목록만 장보기"
                        selected={!learning.budgetChoiceEnabled}
                        onPress={() => learn({ budgetChoiceEnabled: false })}
                      />
                    </View>
                  </View>
                  <View style={s.penaltyScore}>
                    <Text style={ui.label}>자율 예산</Text>
                    <SettingsInput
                      accessibilityLabel="선택 상품 예산"
                      keyboardType="number-pad"
                      value={String(learning.choiceBudget)}
                      editable={learning.budgetChoiceEnabled}
                      style={[s.number, { marginTop: 11 }, !learning.budgetChoiceEnabled && ui.disabled]}
                      onChangeText={(value) => learn({ choiceBudget: Number(value) })}
                    />
                  </View>
                </View>
                <View style={{ marginTop: 22 }}>
                  <SettingsAccordion
                    label="추가 연습 조건"
                    open={extraPractice}
                    onToggle={() => setExtraPractice(!extraPractice)}
                  >
                    <View style={ui.section}>
                      <Text style={ui.label}>상품 고르기 조건</Text>
                      <View style={[ui.row, { flexWrap: 'wrap' }]}>
                        {(['family', 'exact'] as const).map((mode) => (
                          <Choice
                            key={mode}
                            text={mode === 'family' ? '같은 종류 허용' : '정확한 상품'}
                            selected={draft.difficulty === mode}
                            onPress={() =>
                              update({
                                ...draft,
                                difficulty: mode,
                                objectives: draft.objectives.map((objective) => ({ ...objective, match: mode }))
                              })
                            }
                          />
                        ))}
                      </View>
                    </View>
                    <View style={ui.section}>
                      <Text style={ui.label}>계산 내역 확인 연습</Text>
                      <View style={[ui.row, { flexWrap: 'wrap' }]}>
                        {(['normal', 'overcharge', 'random'] as const).map((mode, index) => (
                          <Choice
                            key={mode}
                            text={['항상 정상 계산', '계산 실수 있음', '계산 실수 랜덤'][index]}
                            selected={learning.checkoutReviewMode === mode}
                            onPress={() => learn({ checkoutReviewMode: mode })}
                          />
                        ))}
                      </View>
                    </View>
                  </SettingsAccordion>
                </View>
              </View>
            )
          ) : (
            <View style={{ paddingHorizontal: 4 }}>
              <View style={ui.section}>
                <Text style={ui.label}>설정 저장</Text>
                <View style={ui.row}>
                  <Choice
                    text="전체 설정 저장"
                    selected
                    onPress={() => {
                      void save(false);
                    }}
                    style={ui.grow}
                  />
                  <Choice
                    text="배치만 저장"
                    onPress={() => {
                      void save(true);
                    }}
                    style={ui.grow}
                  />
                </View>
              </View>
              <View style={[ui.section, { marginTop: 3 }]}>
                <Text style={ui.label}>설정 불러오기</Text>
                {Platform.OS === 'web' ? (
                  <Choice text={busy ? '파일 읽는 중' : 'JSON 파일 불러오기'} disabled={busy} onPress={importFile} />
                ) : null}
                <Text style={ui.hint}>
                  {layoutOnly
                    ? '장보기 중에는 파일의 배치만 불러와요. 구매 조건과 진행은 유지해요.'
                    : '배치 파일과 전체 설정 파일을 자동으로 구분해요.'}
                </Text>
              </View>
              <SettingsInput
                accessibilityLabel="마트 설정 가져오기 JSON"
                value={json}
                editable={!busy}
                onChangeText={(text) => {
                  setJson(text);
                  setError('');
                }}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                style={s.json}
                placeholder="저장한 JSON 직접 입력..."
              />
              <Choice
                text="붙여넣은 설정 불러오기"
                label="붙여 넣은 설정 불러오기"
                selected
                disabled={busy}
                onPress={() => importJson(json)}
                style={{ marginTop: 12 }}
              />
              {notice ? (
                <Text accessibilityLiveRegion="polite" style={ui.message}>
                  {notice}
                </Text>
              ) : null}
            </View>
          )}
        </SettingsPage>
      </SettingsScroll>
      {error ? (
        <Text accessibilityRole="alert" style={[ui.error, { marginHorizontal: 24 }]}>
          {error}
        </Text>
      ) : null}
    </SettingsSurface>
  );
}

const s = StyleSheet.create({
  editCard: { height: 194, borderRadius: 14, backgroundColor: c.card, padding: 0 },
  editCardContent: { position: 'absolute', top: 0, left: 0, right: 0, height: 194, alignItems: 'center' },
  editIcon: { width: 86, height: 86, marginTop: 36 },
  editText: { ...ui.accordionText, marginTop: 30 },
  splitRow: { flexDirection: 'row', gap: 14, justifyContent: 'space-between' },
  penaltyBlock: { marginBottom: 18 },
  penaltyOptions: { flex: 1.28, minWidth: 0 },
  penaltyScore: { flex: 1, minWidth: 0 },
  number: { textAlign: 'center' },
  counts: { flexDirection: 'row', gap: 8, paddingTop: 2 },
  laneNumber: { ...ui.label, fontSize: 16, width: 16, textAlign: 'center' },
  json: { height: 240, textAlignVertical: 'top', padding: 12 }
});
