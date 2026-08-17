import { requireOptionalNativeModule } from 'expo-modules-core';

import type { NativeRuntimeModule } from './types';

export default requireOptionalNativeModule<NativeRuntimeModule>('OneuldoLlamaRuntime');
