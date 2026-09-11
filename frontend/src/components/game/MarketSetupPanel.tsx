import { useState } from 'react';
import { Platform, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { PressScale } from '../PressScale';
import { MarketSessionConfig, parseMarketSessionConfig } from '../../game/marketSession';
import { MarketCount } from '../../game/marketEnvironment';
import { fonts } from '../../theme';

/** Configuration is applied atomically before an episode, never halfway through an attempt. */
export function MarketSetupPanel({ config, onApply, onClose }: {
  config: MarketSessionConfig;
  onApply: (config: MarketSessionConfig) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(config),
    [json, setJson] = useState(JSON.stringify(config, null, 2));
  const [advanced, setAdvanced] = useState(false),
    [error, setError] = useState('');
  const update = (next: MarketSessionConfig) => {
    setDraft(next);
    setJson(JSON.stringify(next, null, 2));
    setError('');
  };
  const env = (next: Partial<MarketSessionConfig['environment']>) => update({ ...draft, environment: { ...draft.environment, ...next } });
  const apply = () => {
    try {
      const next = parseMarketSessionConfig(json);
      onApply(next);
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
          update({ ...draft, seed, environment: { ...draft.environment, seed, shelfOrder: 'random' } });
        }}
      />
      {count('매장 종업원', 'employeeCount', 1, 3)}
      {count('손님', 'customerCount', 1, 5)}
      {count('기둥', 'pillarCount', 0, 4)}
      <Text style={s.description}>휴게석은 의자 · 원형 테이블 · 의자 두 묶음으로 고정해요. 엘리베이터와 ATM은 장식이며 이용할 수 없어요.</Text>
      <Text style={s.label}>유인 계산대 2개 · 계산원</Text>
      <View style={s.options}>
        {(['random', 0, 1, 2] as const).map(value => <Choice
          key={value}
          text={value === 'random' ? '랜덤' : value + '명'}
          selected={(draft.environment.cashierCount ?? 'random') === value}
          onPress={() => env({ cashierCount: value })}
        />)}
      </View>
      <Text style={s.label}>무인 계산대 (배치만, 이용 불가)</Text>
      <View style={s.options}>
        {(['random', false, true] as const).map(value => <Choice
          key={String(value)}
          text={value === 'random' ? '랜덤' : value ? '있음' : '없음'}
          selected={(draft.environment.kioskPresent ?? 'random') === value}
          onPress={() => env({ kioskPresent: value })}
        />)}
      </View>
      <Text style={s.label}>진열대 위치</Text>
      <View style={s.options}>
        <Choice
          text="매번 섞기"
          selected={draft.environment.shelfOrder === 'random'}
          onPress={() => env({ shelfOrder: 'random' })}
        />
        <Choice
          text="기본 위치"
          selected={draft.environment.shelfOrder !== 'random'}
          onPress={() => env({ shelfOrder: ['produce', 'fresh', 'household', 'meal', 'drink'] })}
        />
      </View>
      <Text style={s.label}>입구 경보기 감점</Text>
      <TextInput accessibilityLabel="입구 경보기 감점" keyboardType="number-pad"
        value={String(draft.alarmPenaltyPoints)}
        onChangeText={text => update({ ...draft, alarmPenaltyPoints: Number(text) })} style={s.input} />
      <Text style={s.description}>100점에서 시작해요. 계산하지 않은 물건을 담고 빨간 입구 경보기를 나갈 때 적용돼요.</Text>
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
      <Text style={s.label}>상품별 기본 재고</Text>
      <TextInput
        accessibilityLabel="상품별 기본 재고"
        keyboardType="number-pad"
        value={String(draft.stockPerProduct)}
        onChangeText={text => update({ ...draft, stockPerProduct: Number(text) })}
        style={s.input}
      />
      <Text style={s.description}>각 진열대는 9종을 골라 12칸에 놓아요. 중복 진열된 상품도 같은 재고를 사용해요. 목표 상품은 구매할 수 있도록 포함됩니다.</Text>
      <Choice text={advanced ? '상세 설정 접기' : '연구용 상세 설정 · JSON 가져오기'} onPress={() => setAdvanced(!advanced)} />
      {advanced
        ? <>
          <Text style={s.description}>목표 상품 ID·개수·판정 조건, 9종 상품 직접 지정, 상품별 재고, 진열대 순서와 사람·오브젝트 후보 위치, 사람/AI 데이터 구분을 설정합니다. 저장한 JSON을 아래에 붙여 넣을 수 있어요.</Text>
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
