import { createMarketEnvironment } from './marketEnvironment';
import { parseMarketSessionConfig, type MarketSessionConfig } from './marketSession';
import {
  applyMarketTilemapToConfig,
  createMarketTilemapFromEnvironment,
  MARKET_TILEMAP_FORMAT,
  parseMarketTilemap,
  serializeMarketTilemap
} from './marketTilemap';

/** Both existing file formats enter through the same validation and draft flow. */
export function importMarketSettings(text: string, current: MarketSessionConfig, layoutOnly = false) {
  if (text.length > 1_000_000) throw new Error('JSON은 1MB 이하로 골라 주세요.');
  const value: unknown = JSON.parse(text);
  const isLayout = !!value && typeof value === 'object' && 'format' in value && value.format === MARKET_TILEMAP_FORMAT;
  if (!isLayout && !layoutOnly)
    return {
      kind: 'settings' as const,
      config: parseMarketSessionConfig(text)
    };
  const tilemap = isLayout
    ? parseMarketTilemap(value)
    : (() => {
        const imported = parseMarketSessionConfig(text);
        return createMarketTilemapFromEnvironment(createMarketEnvironment(imported.environment));
      })();
  const environment = createMarketEnvironment({
    ...current.environment,
    seed: current.seed
  }).config;
  return {
    kind: isLayout ? ('layout' as const) : ('settings-layout' as const),
    config: parseMarketSessionConfig(
      JSON.stringify({
        ...current,
        environment: applyMarketTilemapToConfig(environment, tilemap)
      })
    )
  };
}

export function exportMarketSettings(config: MarketSessionConfig, layoutOnly = false) {
  const normalized = parseMarketSessionConfig(JSON.stringify(config));
  return layoutOnly
    ? serializeMarketTilemap(createMarketTilemapFromEnvironment(createMarketEnvironment(normalized.environment)))
    : JSON.stringify(normalized, null, 2);
}
