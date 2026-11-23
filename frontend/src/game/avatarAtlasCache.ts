import { Asset } from 'expo-asset';
import type { ImageSourcePropType } from 'react-native';

export const AVATAR_ATLAS_LOAD_TIMEOUT_MS = 8000;
export const AVATAR_ATLAS_LOAD_CONCURRENCY = 2;
export const AVATAR_ATLAS_RETRY_DELAY_MS = 2000;
export type AvatarAtlasLoad = { status: 'ready'; source: ImageSourcePropType } | { status: 'failed' | 'timeout' };
type Download = (source: ImageSourcePropType) => Promise<ImageSourcePropType>;
type Entry = { attempts: number; result?: AvatarAtlasLoad; started: boolean; listeners: Set<(result: AvatarAtlasLoad) => void>; source: ImageSourcePropType; retryAfter: number };

async function downloadAtlas(source: ImageSourcePropType): Promise<ImageSourcePropType> {
  const uri = typeof source === 'number' ? null : (Array.isArray(source) ? source[0] : source)?.uri;
  const asset = typeof source === 'number' ? Asset.fromModule(source) : uri ? Asset.fromURI(uri) : null;
  if (!asset) throw new Error('Avatar atlas has no image source');
  await asset.downloadAsync();
  return { uri: asset.localUri ?? asset.uri };
}

/** Shares downloaded files across map mounts, with active poses ahead of optional warmup. */
export function createAvatarAtlasCache(download: Download = downloadAtlas) {
  const entries = new Map<string, Entry>();
  const queue: Entry[] = [];
  let active = 0;
  const broadcast = (entry: Entry, result: AvatarAtlasLoad) => {
    entry.result = result;
    entry.listeners.forEach(listener => listener(result));
  };
  const pump = () => {
    while (active < AVATAR_ATLAS_LOAD_CONCURRENCY && queue.length) {
      const entry = queue.shift()!;
      if (!entry.listeners.size) { entry.started = false; continue; }
      active++; entry.started = true; entry.attempts++;
      const timeout = setTimeout(() => broadcast(entry, { status: 'timeout' }), AVATAR_ATLAS_LOAD_TIMEOUT_MS);
      // Expo Asset downloads are not cancellable. A timed-out request retains its network
      // slot until it settles, so turning repeatedly cannot launch unlimited hidden requests.
      // Callers already show the small idle fallback and never block movement on this queue.
      Promise.resolve().then(() => download(entry.source)).then(source => {
        broadcast(entry, { status: 'ready', source });
      }, () => {
        entry.retryAfter = Date.now() + AVATAR_ATLAS_RETRY_DELAY_MS;
        broadcast(entry, { status: 'failed' });
      }).finally(() => { clearTimeout(timeout); active--; entry.started = false; pump(); });
    }
  };
  return {
    subscribe(source: ImageSourcePropType, listener: (result: AvatarAtlasLoad) => void, priority: 'foreground' | 'background' = 'foreground') {
      const key = JSON.stringify(source);
      let entry = entries.get(key);
      if (!entry) { entry = { source, started: false, listeners: new Set(), attempts: 0, retryAfter: 0 }; entries.set(key, entry); }
      entry.listeners.add(listener);
      if (entry.result) listener(entry.result);
      const retry = entry.result?.status === 'failed' && entry.attempts < 2 && Date.now() >= entry.retryAfter;
      if (!entry.started && (!entry.result || retry)) {
        if (retry) entry.result = undefined;
        const queued = queue.indexOf(entry);
        if (queued >= 0 && priority === 'foreground') queue.splice(queued, 1);
        if (!queue.includes(entry)) {
          if (priority === 'background') queue.push(entry);
          else queue.unshift(entry);
        }
        pump();
      }
      return () => entry!.listeners.delete(listener);
    },
  };
}

export const avatarAtlasCache = createAvatarAtlasCache();
