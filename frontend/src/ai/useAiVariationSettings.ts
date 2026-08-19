import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import {
  getNativeRuntimeStatus,
  initializeNativeModel,
  prepareNativeModel,
  releaseNativeModel,
} from './nativeRuntime';

export type AiModelSetupState =
  | 'checking'
  | 'not-ready'
  | 'preparing'
  | 'ready'
  | 'unsupported'
  | 'error';

export function useAiVariationSettings() {
  const [enabled, setEnabled] = useState(false);
  const [setupState, setSetupState] = useState<AiModelSetupState>(
    Platform.OS === 'android' ? 'checking' : 'unsupported',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const preparing = useRef(false);

  const prepareAndEnable = useCallback(async () => {
    if (preparing.current || Platform.OS !== 'android') return;
    preparing.current = true;
    setSetupState('preparing');
    setErrorMessage(null);
    try {
      // 첫 실행부터 백그라운드에서 모델을 준비하고 이후에는 검증된 파일을 재사용한다.
      const preparation = await prepareNativeModel();
      if (!preparation.supported || !preparation.ready) {
        setSetupState('unsupported');
        return;
      }
      const status = await initializeNativeModel();
      if (status.state !== 'ready') throw new Error(status.errorMessage ?? '모델을 시작하지 못했어요.');
      setSetupState('ready');
      setEnabled(true);
    } catch (error) {
      setEnabled(false);
      setSetupState('error');
      setErrorMessage(error instanceof Error ? error.message : 'AI 모델 준비에 실패했어요.');
    } finally {
      preparing.current = false;
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    // 앱 셸이나 로그인 화면 진입 여부와 관계없이 설치 후 첫 실행부터 다운로드를 시작한다.
    void prepareAndEnable();
  }, [prepareAndEnable]);

  const toggleEnabled = useCallback(async () => {
    if (setupState !== 'ready') {
      await prepareAndEnable();
      return;
    }
    setEnabled((current) => !current);
  }, [prepareAndEnable, setupState]);

  const disableAndRelease = useCallback(async () => {
    setEnabled(false);
    try {
      await releaseNativeModel();
      setSetupState('not-ready');
    } catch {
      // 메모리 해제 실패가 설정 화면을 막지 않도록 비활성화 상태는 유지한다.
    }
  }, []);

  return {
    enabled,
    errorMessage,
    prepareAndEnable,
    setupState,
    toggleEnabled,
    disableAndRelease,
  };
}

export type AiVariationSettings = ReturnType<typeof useAiVariationSettings>;
