import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import {
  marketTrainingStore,
  type SavedMarketTraining,
} from '../../game/marketTrainingStore';
import type { MarketSessionConfig } from '../../game/marketSession';
import { SettingsButton, SettingsInput, ui } from './MarketSettingsUi';

export function MarketTrainingLibrary({
  config,
  onSelect,
}: {
  config: MarketSessionConfig;
  onSelect: (config: MarketSessionConfig) => void;
}) {
  const [tests, setTests] = useState<SavedMarketTraining[]>([]),
    [name, setName] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    void marketTrainingStore
      .list()
      .then((rows) => {
        if (mounted.current) setTests(rows);
      })
      .catch(() => {
        if (mounted.current)
          setMessage(
            '저장한 테스트를 읽지 못했어요. 세이브·로드에서 JSON을 사용할 수 있어요.'
          );
      });
    return () => {
      mounted.current = false;
    };
  }, []);
  const save = async () => {
    setBusy(true);
    try {
      const rows = await marketTrainingStore.save(name, config);
      if (mounted.current) {
        setTests(rows);
        setName('');
        setMessage('현재 배치·물건 목록·과제·힌트·상황을 저장했어요.');
      }
    } catch (error) {
      if (mounted.current)
        setMessage(
          error instanceof Error
            ? error.message
            : '기기에 저장하지 못했어요. JSON으로 내보내 주세요.'
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <View style={ui.section}>
      <Text style={ui.label}>내가 만든 테스트</Text>
      <SettingsInput
        accessibilityLabel="테스트 이름"
        placeholder="예: 어머니 심부름 · 힌트 없이"
        maxLength={32}
        value={name}
        onChangeText={setName}
      />
      <SettingsButton
        text="현재 조건을 테스트로 저장"
        disabled={busy}
        onPress={() => {
          void save();
        }}
      />
      <View style={{ gap: 8 }}>
        {tests.map((test) => (
          <SettingsButton
            key={test.name}
            text={test.name}
            label={'테스트 선택 ' + test.name}
            onPress={() => {
              onSelect({
                ...test.config,
                provenance: config.provenance,
                startedAt: config.startedAt,
                sessionId: config.sessionId,
              });
              setMessage(
                test.name +
                  '을 불러왔어요. 설정 적용을 누르면 시작 화면에 반영돼요.'
              );
            }}
          />
        ))}
      </View>
      {message ? (
        <Text accessibilityLiveRegion="polite" style={ui.hint}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}
