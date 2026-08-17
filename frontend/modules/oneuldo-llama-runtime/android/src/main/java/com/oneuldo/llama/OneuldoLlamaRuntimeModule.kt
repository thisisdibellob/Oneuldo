package com.oneuldo.llama

import android.os.Build
import android.util.Log
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OneuldoLlamaRuntimeModule : Module() {
  private val modelDownloadManager by lazy {
    val context = appContext.reactContext ?: throw Exceptions.AppContextLost()
    ModelDownloadManager(context)
  }
  private val runtimeManager by lazy {
    LlamaRuntimeManager(
      modelDownloadManager = modelDownloadManager,
      initializeNative = ::nativeInitializeModel,
      isNativeInitialized = ::nativeIsModelInitialized,
      generateNative = ::nativeGenerateText,
      cancelNative = ::nativeCancelGeneration,
      releaseNative = ::nativeReleaseModel,
    )
  }

  companion object {
    private const val TAG = "OneuldoLlamaRuntime"
    init { System.loadLibrary("oneuldo_llama_runtime") }
  }

  private external fun nativeGetVersion(): String
  private external fun nativeInitializeModel(modelPath: String): String?
  private external fun nativeIsModelInitialized(): Boolean
  private external fun nativeGenerateText(requestId: String, prompt: String, maxTokens: Int, timeoutMs: Long): Array<String?>
  private external fun nativeCancelGeneration(requestId: String): Boolean
  private external fun nativeReleaseModel(): Boolean

  override fun definition() = ModuleDefinition {
    Name("OneuldoLlamaRuntime")

    AsyncFunction("getRuntimeStatus") {
      runtimeManager.getStatus().toMap(nativeGetVersion(), Build.SUPPORTED_ABIS.firstOrNull())
    }
    AsyncFunction("prepareModel") {
      // 다운로드와 SHA-256 검증은 UI 스레드 밖에서 처리한다.
      modelDownloadManager.prepareModel().toMap()
    }
    AsyncFunction("initializeModel") {
      runtimeManager.initializeModel().toMap(nativeGetVersion(), Build.SUPPORTED_ABIS.firstOrNull())
    }
    Function("reserveGeneration") { requestId: String, prompt: String, maxTokens: Int, timeoutMs: Long ->
      runtimeManager.reserveGeneration(requestId, prompt, maxTokens, timeoutMs)
    }
    AsyncFunction("generateText") { requestId: String, prompt: String, maxTokens: Int, timeoutMs: Long ->
      val result = runtimeManager.generateText(requestId, prompt, maxTokens, timeoutMs)
      Log.i(TAG, "Text generation finished: requestId=$requestId, elapsed=${result.latencyMs}")
      result.toMap()
    }
    Function("cancelGeneration") { requestId: String -> runtimeManager.cancelGeneration(requestId).toMap() }
    AsyncFunction("releaseModel") { runtimeManager.releaseModel().toMap() }
  }
}

private fun RuntimeInitializationStatus.toMap(runtimeVersion: String, abi: String?) = mapOf(
  "supported" to true, "platform" to "android", "state" to state.value,
  "runtimeVersion" to runtimeVersion, "abi" to abi, "modelPath" to modelPath,
  "initializationMs" to initializationMs, "alreadyInitialized" to alreadyInitialized,
  "activeRequestId" to activeRequestId, "errorCode" to errorCode, "errorMessage" to errorMessage,
)
private fun TextGenerationResult.toMap() = mapOf("requestId" to requestId, "text" to text, "latencyMs" to latencyMs)
private fun CancellationResult.toMap() = mapOf("requestId" to requestId, "cancelled" to cancelled)
private fun ReleaseResult.toMap() = mapOf("released" to released)
