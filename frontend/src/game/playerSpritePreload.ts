import { Asset } from 'expo-asset';
import { Image, PixelRatio, Platform, type ImageSourcePropType } from 'react-native';

import { avatarAtlasCache } from './avatarAtlasCache';
import { selectAvatarAtlasSource, type AvatarAnimationManifest, type AvatarAtlasSheet } from './avatarAnimation';
import { chibiPlayerAvatar } from './chibiPlayerAvatar';
import { BUS_PLAYER_SCALE } from './busWorld';
import { CAFE_PLAYER_SCALE } from './cafeWorld';
import { LAUNDRY_PLAYER_SCALE } from './laundryWorld';
import { LIBRARY_PLAYER_SCALE } from './libraryWorld';

/** Village/market/home player scale in GamePrototypeScreen. Keep in sync with PLAYER_ART_SCALE there. */
const VILLAGE_PLAYER_SCALE = 0.5;
const PLAYER_SCALES = [VILLAGE_PLAYER_SCALE, BUS_PLAYER_SCALE, CAFE_PLAYER_SCALE, LAUNDRY_PLAYER_SCALE, LIBRARY_PLAYER_SCALE];
const CONCURRENCY = 3;
const PER_SOURCE_TIMEOUT_MS = 30_000;

export type SpritePreloadProgress = { loaded: number; total: number };

/**
 * Every atlas density the player can request on this device, plus the single-frame fallbacks.
 * Loading only changes caches (Expo Asset, image cache, avatarAtlasCache); game state is untouched.
 */
export function playerSpriteSources(manifest: AvatarAnimationManifest = chibiPlayerAvatar, pixelRatio = PixelRatio.get()): ImageSourcePropType[] {
  const { essential, later } = playerSpriteSourceGroups(manifest, pixelRatio);
  return [...essential, ...later];
}

/**
 * essential: 서 있기·걷기와 한 장짜리 대체 그림(준비 화면이 기다리는 것).
 * later: 달리기 시트. 게임에 들어간 뒤 뒤에서 이어서 받는다.
 */
export function playerSpriteSourceGroups(manifest: AvatarAnimationManifest = chibiPlayerAvatar, pixelRatio = PixelRatio.get()) {
  const seen = new Set<string>();
  const collect = (sheets: (AvatarAtlasSheet | undefined)[], extra: ImageSourcePropType[] = []) => {
    const out: ImageSourcePropType[] = [];
    const add = (source: ImageSourcePropType | undefined) => {
      if (source === undefined) return;
      const key = JSON.stringify(source);
      if (seen.has(key)) return;
      seen.add(key); out.push(source);
    };
    new Set(sheets.filter(Boolean) as AvatarAtlasSheet[]).forEach((sheet) =>
      PLAYER_SCALES.forEach((scale) => add(selectAvatarAtlasSource(sheet, scale, pixelRatio))));
    extra.forEach(add);
    return out;
  };
  const directions = Object.values(manifest.atlases ?? {}).filter(Boolean) as NonNullable<NonNullable<AvatarAnimationManifest['atlases']>[keyof NonNullable<AvatarAnimationManifest['atlases']>]>[];
  const essential = collect(directions.flatMap((d) => [d.idle, d.walk]), (['front', 'back'] as const).map((facing) => manifest[facing].idle[0]));
  const later = collect(directions.map((d) => d.sprint));
  return { essential, later };
}

function assetUri(source: ImageSourcePropType): string | null {
  if (typeof source === 'number') {
    try { return Asset.fromModule(source).uri; } catch { return null; }
  }
  const first = Array.isArray(source) ? source[0] : source;
  return first?.uri ?? null;
}

async function warmSource(source: ImageSourcePropType): Promise<void> {
  try {
    if (typeof source === 'number') await Asset.fromModule(source).downloadAsync();
  } catch { /* the game keeps its own fallback when a file cannot be fetched */ }
  // 휴대폰은 위의 Asset 다운로드가 곧 게임이 쓰는 파일이라 다시 받지 않는다(예전엔 두 번 받았음). 웹만 브라우저 캐시를 데운다.
  const uri = Platform.OS === 'web' ? assetUri(source) : null;
  if (uri) { try { await Image.prefetch(uri); } catch { /* best effort */ } }
  // Register the file in the shared atlas cache so the game's first subscribe is already 'ready'.
  await new Promise<void>((resolve) => {
    let settled = false;
    let leave: (() => void) | undefined;
    const finish = () => { if (settled) return; settled = true; clearTimeout(timer); leave?.(); resolve(); };
    const timer = setTimeout(finish, PER_SOURCE_TIMEOUT_MS);
    leave = avatarAtlasCache.subscribe(source, () => finish(), 'background');
    if (settled) leave();
  });
}

let preload: Promise<void> | null = null;
let done = false;
let progress: SpritePreloadProgress = { loaded: 0, total: 0 };
const listeners = new Set<(progress: SpritePreloadProgress) => void>();

export function arePlayerSpritesPreloaded() { return done; }

/** Loads the player's sprite sheets once per app run. Later calls reuse the same promise. */
export function preloadPlayerSprites(onProgress?: (progress: SpritePreloadProgress) => void): Promise<void> {
  if (!preload) {
    const { essential, later } = playerSpriteSourceGroups();
    const queue = [...essential];
    progress = { loaded: 0, total: queue.length };
    const worker = async () => {
      while (queue.length) {
        await warmSource(queue.shift()!);
        progress = { loaded: progress.loaded + 1, total: progress.total };
        listeners.forEach((listener) => listener(progress));
      }
    };
    preload = Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker)).then(() => {
      done = true;
      // 달리기 시트는 게임을 연 뒤 하나씩 이어서 받는다. 실패해도 게임은 기존 대체 그림을 쓴다.
      void later.reduce((chain, source) => chain.then(() => warmSource(source)), Promise.resolve());
    });
  }
  if (onProgress) {
    onProgress(progress);
    if (!done) {
      listeners.add(onProgress);
      void preload.finally(() => listeners.delete(onProgress));
    }
  }
  return preload;
}

export function resetPlayerSpritePreloadForTests(ready = false) {
  preload = ready ? Promise.resolve() : null;
  done = ready;
  progress = { loaded: 0, total: 0 };
  listeners.clear();
}
