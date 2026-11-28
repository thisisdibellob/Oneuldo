import { useState } from 'react';
import { Text, View } from 'react-native';
import type { MarketSessionConfig } from '../../game/marketSession';
import {
  getMarketProduct,
  marketCategories,
  marketProducts,
  type MarketCategoryId,
} from '../../game/scenarios';
import { SettingsAccordion, SettingsButton, ui } from './MarketSettingsUi';

export function MarketTrainingObjectives({
  config,
  onChange,
}: {
  config: MarketSessionConfig;
  onChange: (value: MarketSessionConfig) => void;
}) {
  const [open, setOpen] = useState(false),
    [adding, setAdding] = useState(false),
    [category, setCategory] = useState<MarketCategoryId>('fresh');
  const change = (index: number, delta: number) =>
    onChange({
      ...config,
      objectives: config.objectives.map((item, i) =>
        i === index
          ? {
              ...item,
              quantity: Math.max(1, Math.min(99, item.quantity + delta)),
            }
          : item
      ),
    });
  const add = (productId: string) => {
    const found = config.objectives.findIndex(
      (item) => item.productId === productId
    );
    if (found >= 0) change(found, 1);
    else
      onChange({
        ...config,
        objectives: [
          ...config.objectives,
          { productId, quantity: 1, match: config.difficulty },
        ],
      });
    setAdding(false);
  };
  return (
    <SettingsAccordion
      label="부탁 물건 목록"
      open={open}
      onToggle={() => setOpen(!open)}
    >
      <View style={ui.section}>
        {config.objectives.map((item, index) => {
          const product = getMarketProduct(item.productId)!;
          return (
            <View key={item.productId + '-' + index} style={{ gap: 8 }}>
              <Text style={ui.label}>
                {product.name} · {product.detail}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  gap: 8,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <SettingsButton
                  text="−"
                  label={product.name + ' 수량 줄이기'}
                  disabled={item.quantity <= 1}
                  onPress={() => change(index, -1)}
                />
                <Text style={ui.label}>{item.quantity}개</Text>
                <SettingsButton
                  text="+"
                  label={product.name + ' 수량 늘리기'}
                  disabled={item.quantity >= 99}
                  onPress={() => change(index, 1)}
                />
                <SettingsButton
                  text="빼기"
                  label={product.name + ' 목록에서 빼기'}
                  disabled={config.objectives.length <= 1}
                  onPress={() =>
                    onChange({
                      ...config,
                      objectives: config.objectives.filter(
                        (_, i) => i !== index
                      ),
                    })
                  }
                />
              </View>
            </View>
          );
        })}
        <SettingsButton
          text={adding ? '물건 선택 닫기' : '새 물건 추가'}
          onPress={() => setAdding(!adding)}
        />
        {adding ? (
          <>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {marketCategories.map((c) => (
                <SettingsButton
                  key={c.id}
                  text={c.label}
                  selected={c.id === category}
                  onPress={() => setCategory(c.id)}
                />
              ))}
            </View>
            <View style={{ gap: 8 }}>
              {marketProducts
                .filter((p) => p.categoryId === category)
                .map((p) => (
                  <SettingsButton
                    key={p.id}
                    text={p.name + ' · ' + p.detail}
                    label={'부탁 목록에 추가 ' + p.name + ' ' + p.detail}
                    onPress={() => add(p.id)}
                  />
                ))}
            </View>
          </>
        ) : null}
      </View>
    </SettingsAccordion>
  );
}
