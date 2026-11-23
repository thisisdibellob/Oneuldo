import { Text, View } from 'react-native';
import {
  MARKET_TRAINING_PRESETS,
  normalizeMarketTraining,
  type MarketTrainingConfig,
} from '../../game/marketTraining';
import { SettingsAccordion, SettingsButton, ui } from './MarketSettingsUi';
import { useState } from 'react';
import type { ReactNode } from 'react';

export function MarketTrainingOptions({
  value,
  onChange,
  children,
}: {
  value?: Partial<MarketTrainingConfig>;
  onChange: (value: MarketTrainingConfig) => void;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const config = normalizeMarketTraining(value);
  const update = (next: Partial<MarketTrainingConfig>) =>
    onChange({ ...config, ...next });
  return (
    <SettingsAccordion
      label="과제·힌트·돌발 상황"
      open={open}
      onToggle={() => setOpen(!open)}
    >
      <View style={ui.section}>
        <Text style={ui.label}>연습 과제 선택</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {MARKET_TRAINING_PRESETS.map((preset) => (
            <SettingsButton
              key={preset.id}
              text={preset.label}
              selected={
                JSON.stringify(config) ===
                JSON.stringify(normalizeMarketTraining(preset.config))
              }
              onPress={() => onChange(normalizeMarketTraining(preset.config))}
            />
          ))}
        </View>
        <Text style={ui.hint}>
          과제를 고른 뒤 힌트와 돌발 상황을 각각 바꿀 수 있어요. 기본은 힌트
          없음이에요.
        </Text>
        <Text style={ui.label}>직원에게 위치를 물었을 때 화살표</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {[false, true].map((v) => (
            <SettingsButton
              key={String(v)}
              text={v ? '화살표 제공' : '화살표 없음'}
              selected={config.directionHint === v}
              onPress={() => update({ directionHint: v })}
            />
          ))}
        </View>
        <Text style={ui.label}>매장 안 지도</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {[false, true].map((v) => (
            <SettingsButton
              key={String(v)}
              text={v ? '지도 제공' : '지도 없음'}
              selected={config.mapHint === v}
              onPress={() => update({ mapHint: v })}
            />
          ))}
        </View>
        <Text style={ui.label}>돌발 상황</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(
            [
              ['none', '없음'],
              ['crowd', '사람 몰림'],
              ['sound-light', '쿵 소리와 빛'],
              ['both', '두 상황 모두'],
            ] as const
          ).map(([id, label]) => (
            <SettingsButton
              key={id}
              text={label}
              selected={config.incidents === id}
              onPress={() => update({ incidents: id })}
            />
          ))}
        </View>
        <Text style={ui.label}>결과 경로의 시간 표시 간격</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {[2, 5, 10].map((seconds) => (
            <SettingsButton
              key={seconds}
              text={seconds + '초'}
              selected={config.routeIntervalSeconds === seconds}
              onPress={() => update({ routeIntervalSeconds: seconds })}
            />
          ))}
        </View>
        {children}
      </View>
    </SettingsAccordion>
  );
}
