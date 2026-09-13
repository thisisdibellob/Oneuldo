import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { isLoaded, isLoading, loadAsync, unloadAsync, type FontSource } from 'expo-font';

import { appFontAssets } from './appFontAssets';

// These are the exact three families used across both onboarding/login views.
export const onboardingFontAssets = {
  'LaundryGothic-Bold': appFontAssets['LaundryGothic-Bold'],
  LaundryGothic: appFontAssets.LaundryGothic,
  'Pretendard-Bold': appFontAssets['Pretendard-Bold'],
};

export const remainingFontAssets = Object.fromEntries(
  Object.entries(appFontAssets).filter(([family]) => !(family in onboardingFontAssets)),
);
export const APP_FONT_LOAD_TIMEOUT_MS = 30_000;

type FontGroup = Record<string, FontSource>;
type LoadStage = 'onboarding' | 'remaining';

function groupIsReady(group: FontGroup) {
  return Object.keys(group).every(
    family => isLoaded(family) && (typeof isLoading !== 'function' || !isLoading(family)),
  );
}

export function useAppFonts() {
  const [startupReady, setStartupReady] = useState(() => groupIsReady(onboardingFontAssets));
  const [allReady, setAllReady] = useState(() => groupIsReady(appFontAssets));
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef<Partial<Record<LoadStage, Promise<void>>>>({});
  const failed = useRef(new Set<LoadStage>());

  useEffect(() => {
    let active = true;
    let frame: number | undefined;
    let deferred: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;

    function request(group: FontGroup, stage: LoadStage) {
      const existing = pending.current[stage];
      if (existing) return existing; // A retry must await the real in-flight load.
      const promise = (async () => {
        if (failed.current.has(stage) && Platform.OS === 'web') {
          // Expo web can retain a CSS face after its observer rejects. Clear only
          // this unrendered stage before retrying, so cached CSS cannot fake success.
          await Promise.all(Object.keys(group).map(family => unloadAsync(family)));
          failed.current.delete(stage);
        }
        // Settle every font before marking a stage failed. Otherwise the first
        // rejection could leave other CSS faces in flight during retry cleanup.
        const results = await Promise.allSettled(
          Object.entries(group).map(([family, source]) => loadAsync(family, source)),
        );
        const failure = results.find(result => result.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
        failed.current.delete(stage);
      })();
      pending.current[stage] = promise;
      void promise.then(
        () => { delete pending.current[stage]; },
        () => {
          failed.current.add(stage);
          delete pending.current[stage];
        },
      );
      return promise;
    }

    function waitForGroup(group: FontGroup, stage: LoadStage, onReady: () => void) {
      deadline = setTimeout(() => {
        if (active) setError(new Error('글꼴을 불러오는 데 시간이 오래 걸리고 있어요.'));
      }, APP_FONT_LOAD_TIMEOUT_MS);
      void request(group, stage).then(
        () => {
          if (!active) return;
          clearTimeout(deadline);
          setError(null);
          onReady();
        },
        reason => {
          if (!active) return;
          clearTimeout(deadline);
          setError(reason instanceof Error ? reason : new Error('글꼴을 불러오지 못했어요.'));
        },
      );
    }

    if (!startupReady) {
      waitForGroup(onboardingFontAssets, 'onboarding', () => setStartupReady(true));
    } else if (!allReady) {
      // Let the small onboarding page paint before eight unused fonts compete
      // for bandwidth. AppShell/marketLab remain gated until these are ready.
      frame = requestAnimationFrame(() => {
        deferred = setTimeout(() => {
          if (active) waitForGroup(remainingFontAssets, 'remaining', () => setAllReady(true));
        }, 0);
      });
    }

    return () => {
      active = false;
      if (frame !== undefined) cancelAnimationFrame(frame);
      clearTimeout(deferred);
      clearTimeout(deadline);
    };
  }, [startupReady, allReady, attempt]);

  return {
    startupReady,
    allReady,
    error,
    retry: () => {
      setError(null);
      setAttempt(value => value + 1);
    },
  };
}
