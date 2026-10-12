import { useRef, useState } from 'react';
import { Platform, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { PressScale } from '../PressScale';
import { MarketSessionConfig, parseMarketSessionConfig } from '../../game/marketSession';
import { DEFAULT_MARKET_ENVIRONMENT_CONFIG, MARKET_LAYOUT_OPTIONS, type MarketCount } from '../../game/marketEnvironment';
import { DEFAULT_MARKET_LEARNING_CONFIG } from '../../game/marketLearning';
import { fonts } from '../../theme';

export type MarketSetupChanges = { shelfOrderTouched: boolean; changedConfigPaths?: string[]; lockedSettings?: Record<string,unknown> };

/** Configuration is applied atomically before an episode, never halfway through an attempt. */
export function MarketSetupPanel({ config, onApply, onClose }: {
  config: MarketSessionConfig;
  onApply: (config: MarketSessionConfig, changes: MarketSetupChanges) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(config),
    [json, setJson] = useState(JSON.stringify(config, null, 2));
  const [advanced, setAdvanced] = useState(false),
    [error, setError] = useState('');
  const shelfOrderTouched = useRef(false);
  const touched = useRef(new Set<string>());
  const collectChanges=(before:unknown,after:unknown,prefix='')=>{
    if(JSON.stringify(before)===JSON.stringify(after))return;
    if(prefix==='stockOverrides'||!after||typeof after!=='object'||Array.isArray(after)){if(prefix)touched.current.add(prefix);return;}
    for(const [key,value] of Object.entries(after as Record<string,unknown>))collectChanges((before as Record<string,unknown>|undefined)?.[key],value,prefix?prefix+'.'+key:key);
  };
  const update = (next: MarketSessionConfig) => {
    collectChanges(draft,next);
    setDraft(next);
    setJson(JSON.stringify(next, null, 2));
    setError('');
  };
  // Keep intermediate input (such as an empty budget) editable; validate only on apply/export.
  const learning = { ...DEFAULT_MARKET_LEARNING_CONFIG, ...draft.learning };
  const learn = (next: Partial<typeof learning>) => {Object.keys(next).forEach(key=>touched.current.add('learning.'+key));update({ ...draft, learning: { ...learning, ...next } });};
  const env = (next: Partial<MarketSessionConfig['environment']>) => {
    Object.keys(next).forEach(key=>touched.current.add('environment.'+key));
    if (Object.prototype.hasOwnProperty.call(next, 'shelfOrder')) shelfOrderTouched.current = true;
    update({ ...draft, environment: { ...draft.environment, ...next } });
  };
  const hasChangedJsonShelfOrder = () => {
    const input = JSON.parse(json);
    return input.environment && Object.prototype.hasOwnProperty.call(input.environment, 'shelfOrder')
      && JSON.stringify(input.environment.shelfOrder) !== JSON.stringify(config.environment.shelfOrder);
  };
  const apply = () => {
    try {
      const next = parseMarketSessionConfig(json);
      collectChanges(config,next);
      onApply(next, { shelfOrderTouched: shelfOrderTouched.current || !!hasChangedJsonShelfOrder(), changedConfigPaths:[...touched.current] });
    } catch (e) {
      setError(e instanceof Error ? e.message : '설정 내용을 확인해 주세요.');
    }
  };
  const save = async () => {
    try {
      const text = JSON.stringify(parseMarketSessionConfig(json), null, 2);
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'market-config.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      else await Share.share({ title: '장보기 환경 설정', message: text });
    } catch (e) {
      setError(e instanceof Error ? e.message : '설정을 저장하지 못했어요.');
    }
  };
  const count = (
    title: string,
    key: 'employeeCount' | 'customerCount' | 'pillarCount' | 'chairCount',
    min: number,
    max: number
  ) => {
    const value = draft.environment[key];
    const range = typeof value === 'object' ? value : { min, max };
    const unit = key === 'pillarCount' || key === 'chairCount' ? '개' : '명';
    return <View style={s.field}>
      <Text style={s.label}>
        {title}
      </Text>
      <View style={s.options}>
        <Choice
          text={'랜덤 ' + range.min + '–' + range.max}
          selected={typeof value !== 'number'}
          onPress={() => env({ [key]: { min, max } as MarketCount })}
        />
        {Array.from({ length: max - min + 1 }, (_, i) => i + min).map(n => <Choice
          key={n}
          text={n + unit}
          selected={value === n}
          onPress={() => env({ [key]: n })}
        />)}
      </View>
    </View>;
  };
  return <View accessibilityViewIsModal style={s.overlay}>
    <ScrollView
      style={s.panel}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={s.eyebrow}>장보기 시작 전 설정</Text>
      <Text accessibilityRole="header" style={s.title}>연습 환경 설정</Text>
      <Text style={s.description}>같은 시드와 같은 설정이면 같은 매장이 만들어져요. 설정을 적용하면 아직 시작하지 않은 게임의 배치가 바뀝니다.</Text>
      <Text style={s.description}>직접 바꾼 게임 조건은 다음 AI 추천에서도 고정돼요. AI는 나머지 조건을 조절해요.</Text>
      <Text style={s.label}>시드 (배치를 다시 만드는 값)</Text>
      <TextInput
        accessibilityLabel="환경 시드"
        value={String(draft.seed)}
        onChangeText={seed => update({ ...draft, seed, environment: { ...draft.environment, seed } })}
        autoCapitalize="none"
        style={s.input}
      />
      <Choice
        text="새 랜덤 배치"
        onPress={() => {
          const seed = 'market-' + Date.now();
          shelfOrderTouched.current = true;
          update({ ...draft, seed, environment: { ...draft.environment, seed, shelfOrder: 'random' } });
        }}
      />
      <Text style={s.label}>매장 배치</Text>
      <View style={s.options}>
        {MARKET_LAYOUT_OPTIONS.map(layout => <Choice key={layout.id} text={layout.label}
          selected={(draft.environment.layoutId ?? 'classic') === layout.id}
          onPress={() => env({ layoutId: layout.id })} />)}
      </View>
      <Text style={s.label}>매장 입구 공사</Text>
      <View style={s.options}>
        <Choice text="공사 없음" selected={!draft.environment.entranceConstruction}
          onPress={() => env({ entranceConstruction: false })} />
        <Choice text="입구 공사 중" selected={draft.environment.entranceConstruction === true}
          onPress={() => env({ entranceConstruction: true })} />
      </View>
      <Text style={s.description}>바깥 입구 하나를 펜스로 막아요. 공동 출입문은 열려 있어요. 안쪽 입구를 이용해 주세요.</Text>
      {count('매장 종업원', 'employeeCount', 1, 3)}
      {count('손님', 'customerCount', 1, 5)}
      {count('기둥', 'pillarCount', 0, 4)}
      <Text style={s.description}>매장과 공용 로비에는 의자 · 원형 테이블 · 의자 휴게석이 두 묶음씩 있어요. 엘리베이터와 ATM은 장식이며 이용할 수 없어요.</Text>
      <Text style={s.label}>계산원</Text>
      <View style={s.options}>
        {(['random', 0, 1, 2] as const).map(value => <Choice
          key={value}
          text={value === 'random' ? '랜덤' : value + '명'}
          selected={(draft.environment.cashierCount ?? 'random') === value}
          onPress={() => env({ cashierCount: value })}
        />)}
      </View>
      <Text style={s.label}>계산대 구성</Text>
      <View style={s.options}>
        {([{ id: 'none', label: '유인 계산대 두 줄' }, { id: 'checkout', label: '1번 줄을 셀프 계산대' },
          { id: 'checkout-2', label: '2번 줄을 셀프 계산대' }, { id: 'random', label: '랜덤' }] as const).map(option => <Choice
          key={option.id} text={option.label}
          selected={(draft.environment.kioskLane ?? (draft.environment.kioskPresent === 'random' ? 'random' : draft.environment.kioskPresent ? 'checkout-2' : 'none')) === option.id}
          onPress={() => env({ kioskLane: option.id })} />)}
      </View>
      <Text style={s.description}>셀프 계산대는 한 줄에 두 대를 놓아요. 남은 유인 계산대의 계산원은 최대 한 명이에요. 상품을 직접 스캔하고 결제할 수 있어요.</Text>
      <Text style={s.label}>진열대 위치</Text>
      <View style={s.options}>
        <Choice
          text="매번 섞기"
          selected={draft.environment.shelfOrder === 'random'}
          onPress={() => env({ shelfOrder: 'random' })}
        />
        <Choice
          text="기본 위치"
          selected={Array.isArray(draft.environment.shelfOrder)
            && JSON.stringify(draft.environment.shelfOrder) === JSON.stringify(DEFAULT_MARKET_ENVIRONMENT_CONFIG.shelfOrder)}
          onPress={() => env({ shelfOrder: DEFAULT_MARKET_ENVIRONMENT_CONFIG.shelfOrder })}
        />
      </View>
      <Text style={s.label}>출입 경보기 감점</Text>
      <TextInput accessibilityLabel="출입 경보기 감점" keyboardType="number-pad"
        value={String(draft.alarmPenaltyPoints)}
        onChangeText={text => update({ ...draft, alarmPenaltyPoints: Number(text) })} style={s.input} />
      <Text style={s.description}>100점에서 시작해요. 계산하지 않은 물건을 담고 입구·출구·측면 출입문의 빨간 경보기를 지나 매장 밖으로 나갈 때 적용돼요.</Text>
      <Text style={s.label}>출구 역진입 감점</Text>
      <TextInput accessibilityLabel="출구 역진입 감점" keyboardType="number-pad"
        value={String(draft.wrongWayPenaltyPoints)}
        onChangeText={text => update({ ...draft, wrongWayPenaltyPoints: Number(text) })} style={s.input} />
      <Text style={s.description}>장바구니가 비어 있어도 출구로 매장에 들어오면 적용돼요. 입구가 공사 중이면 복도를 따라 안쪽 입구를 이용해 주세요.</Text>
      <Text style={s.label}>계산원 확인 감점</Text>
      <TextInput accessibilityLabel="계산원 확인 감점" keyboardType="number-pad"
        value={String(draft.cashierRequestPenaltyPoints)}
        onChangeText={text => update({ ...draft, cashierRequestPenaltyPoints: Number(text) })} style={s.input} />
      <Text style={s.description}>계산원이 있는데 없다고 요청하면 적용돼요. 두 계산대가 모두 비어 있을 때 계산을 부탁하면 감점 없이 도와줘요. 0점으로 설정하면 감점하지 않아요.</Text>
      <Text style={s.label}>상품 고르기 조건</Text>
      <View style={s.options}>
        <Choice
          text="같은 종류 허용"
          selected={draft.difficulty === 'family'}
          onPress={() => update({
            ...draft,
            difficulty: 'family',
            objectives: draft.objectives.map(o => ({ ...o, match: 'family' }))
          })}
        />
        <Choice
          text="정확한 상품"
          selected={draft.difficulty === 'exact'}
          onPress={() => update({
            ...draft,
            difficulty: 'exact',
            objectives: draft.objectives.map(o => ({ ...o, match: 'exact' }))
          })}
        />
      </View>
      <Text style={s.label}>계산 내역 확인 연습</Text>
      <View style={s.options}>
        <Choice text="항상 정상 계산" selected={learning.checkoutReviewMode === 'normal'} onPress={() => learn({ checkoutReviewMode: 'normal' })} />
        <Choice text="계산 실수 있음" selected={learning.checkoutReviewMode === 'overcharge'} onPress={() => learn({ checkoutReviewMode: 'overcharge' })} />
        <Choice text="계산 실수 랜덤" selected={learning.checkoutReviewMode === 'random'} onPress={() => learn({ checkoutReviewMode: 'random' })} />
      </View>
      <Text style={s.description}>유인 계산대에서 상품 하나가 한 개 더 찍힐 수 있어요. 장바구니와 계산 내역을 비교하고 직원에게 수량 확인을 부탁해요. 랜덤은 정상 계산과 계산 실수를 절반 확률로 정해요.</Text>
      <Text style={s.label}>품절 상황 연습</Text>
      <View style={s.options}>
        <Choice text="품절 상황 있음" selected={learning.stockoutEnabled} onPress={() => learn({ stockoutEnabled: true })} />
        <Choice text="품절 상황 없음" selected={!learning.stockoutEnabled} onPress={() => learn({ stockoutEnabled: false })} />
      </View>
      <View style={s.options}>
        <Choice text="대체 상품 허용" selected={learning.allowSubstitution} onPress={() => learn({ allowSubstitution: true })} />
        <Choice text="원래 상품만 구매" selected={!learning.allowSubstitution} onPress={() => learn({ allowSubstitution: false })} />
      </View>
      <Text style={s.description}>목록 중 한 상품이 품절돼요. 진열대에서 확인하고 직원에게 재고를 물은 뒤, 부탁한 사람에게 대체 상품이나 사지 못한 이유를 전할 수 있어요.</Text>
      <Text style={s.label}>예산 안에서 직접 고르기</Text>
      <View style={s.options}>
        <Choice text="선택 장보기 있음" selected={learning.budgetChoiceEnabled} onPress={() => learn({ budgetChoiceEnabled: true })} />
        <Choice text="목록만 장보기" selected={!learning.budgetChoiceEnabled} onPress={() => learn({ budgetChoiceEnabled: false })} />
      </View>
      {learning.budgetChoiceEnabled ? <>
        <Text style={s.description}>정해진 예산 안에서 마음에 드는 음료 한 개를 직접 골라요. 휴대폰의 계산기를 사용할 수 있어요.</Text>
        <TextInput accessibilityLabel="선택 상품 예산" keyboardType="number-pad" value={String(learning.choiceBudget)}
          onChangeText={value => learn({ choiceBudget: Number(value) })} style={s.input} />
      </> : null}
      <Text style={s.label}>상품별 기본 재고</Text>
      <TextInput
        accessibilityLabel="상품별 기본 재고"
        keyboardType="number-pad"
        value={String(draft.stockPerProduct)}
        onChangeText={text => update({ ...draft, stockPerProduct: Number(text) })}
        style={s.input}
      />
      <Text style={s.description}>각 진열대는 서로 다른 12종을 골라 12칸에 놓아요. 목표 상품은 구매할 수 있도록 포함됩니다.</Text>
      <Choice text={advanced ? '상세 설정 접기' : '연구용 상세 설정 · JSON 가져오기'} onPress={() => setAdvanced(!advanced)} />
      {advanced
        ? <>
          <Text style={s.description}>목표 상품 ID·개수·판정 조건, 12종 상품 직접 지정, 상품별 재고, 진열대 순서와 사람·오브젝트 후보 위치, 사람/AI 데이터 구분을 설정합니다. 저장한 JSON을 아래에 붙여 넣을 수 있어요.</Text>
          <TextInput
            accessibilityLabel="장보기 설정 JSON"
            value={json}
            onChangeText={setJson}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            style={[s.input, s.json]}
          />
          <Choice
            text="JSON을 간편 설정에 불러오기"
            onPress={() => {
              try {
                if (hasChangedJsonShelfOrder()) shelfOrderTouched.current = true;
                update(parseMarketSessionConfig(json));
              } catch (e) {
                setError(e instanceof Error ? e.message : 'JSON을 확인해 주세요.');
              }
            }}
          />
        </>
        : null}
      {error
        ? <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
        : null}
      <Choice text="설정 JSON 저장" onPress={() => {
        void save();
      }} />
      <Choice
        text="설정 적용"
        selected
        onPress={apply}
      />
      <Choice text="설정 취소" onPress={onClose} />
    </ScrollView>
  </View>;
}
function Choice({ text, selected, onPress }: {
  text: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return <PressScale
    accessibilityRole="button"
    accessibilityLabel={text}
    accessibilityState={{ selected }}
    onPress={onPress}
    style={[s.choice, selected && s.selected]}
  >
    <Text style={[s.choiceText, selected && s.selectedText]}>
      {text}
    </Text>
  </PressScale>;
}
const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 95,
    backgroundColor: 'rgba(31,42,34,0.65)',
    padding: 16,
    justifyContent: 'center'
  },
  panel: {
    flexGrow: 0,
    maxHeight: '95%',
    backgroundColor: '#FFFCF3',
    borderRadius: 22,
    width: '100%',
    maxWidth: 650,
    alignSelf: 'center'
  },
  content: { padding: 22, gap: 12 },
  title: { fontFamily: fonts.cafe24Ssurround, fontSize: 26, color: '#3F5C46' },
  eyebrow: { fontFamily: fonts.medium, fontSize: 11, color: '#768171' },
  label: { fontFamily: fonts.bold, fontSize: 14, color: '#4E5D4B' },
  description: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 21,
    color: '#747C69'
  },
  input: {
    minHeight: 46,
    padding: 12,
    backgroundColor: '#F1F2E9',
    borderWidth: 1,
    borderColor: '#D7DDCA',
    borderRadius: 10,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: '#3F5545'
  },
  json: { height: 300, textAlignVertical: 'top', fontSize: 12 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  field: { gap: 8 },
  choice: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#EBEFE1',
    borderRadius: 12
  },
  selected: { backgroundColor: '#527A5D' },
  choiceText: { fontFamily: fonts.semibold, fontSize: 13, color: '#52634C' },
  selectedText: { color: '#FFFFFF' },
  error: {
    fontFamily: fonts.medium,
    color: '#9D493F',
    fontSize: 13,
    lineHeight: 21
  }
});
