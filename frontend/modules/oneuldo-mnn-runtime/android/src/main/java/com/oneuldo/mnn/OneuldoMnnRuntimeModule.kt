package com.oneuldo.mnn

import android.os.Build
import android.util.Log
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OneuldoMnnRuntimeModule : Module() {
  private val modelAssetManager by lazy {
    val context = appContext.reactContext ?: throw Exceptions.AppContextLost()
    ModelAssetManager(context)
  }

  private val runtimeManager by lazy {
    val context = appContext.reactContext ?: throw Exceptions.AppContextLost()
    MnnRuntimeManager(
      context = context,
      modelAssetManager = modelAssetManager,
      initializeNative = ::nativeInitializeModel,
      isNativeInitialized = ::nativeIsModelInitialized,
      generateNative = ::nativeGenerateText,
      cancelNative = ::nativeCancelGeneration,
      releaseNative = ::nativeReleaseModel,
    )
  }

  companion object {
    private const val TAG = "OneuldoMnnRuntime"

    init {
      System.loadLibrary("MNN")
      System.loadLibrary("oneuldo_mnn_probe")
    }
  }

  private external fun nativeGetVersion(): String
  private external fun nativeInitializeModel(configPath: String, temporaryPath: String): String?
  private external fun nativeIsModelInitialized(): Boolean
  private external fun nativeGenerateText(
    requestId: String,
    prompt: String,
    maxTokens: Int,
    timeoutMs: Long,
  ): Array<String?>
  private external fun nativeCancelGeneration(requestId: String): Boolean
  private external fun nativeReleaseModel(): Boolean

  override fun definition() = ModuleDefinition {
    Name("OneuldoMnnRuntime")

    AsyncFunction("getRuntimeStatus") {
      val runtimeVersion = nativeGetVersion()
      val abi = Build.SUPPORTED_ABIS.firstOrNull()
      val runtimeStatus = runtimeManager.getStatus()
      Log.i(TAG, "Runtime status requested from TypeScript: MNN $runtimeVersion, ABI $abi")

      runtimeStatus.toMap(runtimeVersion, abi)
    }

    AsyncFunction("prepareModel") {
      val result = modelAssetManager.prepareModel()
      Log.i(
        TAG,
        "Model assets ready: ${result.modelPath}, reused=${result.reused}, bytes=${result.totalBytes}",
      )
      result.toMap()
    }

    AsyncFunction("initializeModel") {
      // Expo의 기본 모듈 큐에서 실행되므로 UI 스레드를 막지 않는다.
      val result = runtimeManager.initializeModel()
      Log.i(
        TAG,
        "Model initialization finished: state=${result.state.value}, " +
          "elapsed=${result.initializationMs}, reused=${result.alreadyInitialized}",
      )
      result.toMap(nativeGetVersion(), Build.SUPPORTED_ABIS.firstOrNull())
    }

    Function("reserveGeneration") {
        requestId: String,
        prompt: String,
        maxTokens: Int,
        timeoutMs: Long,
      ->
      // 비동기 큐에 넣기 전에 requestId와 런타임 점유를 먼저 확정한다.
      runtimeManager.reserveGeneration(requestId, prompt, maxTokens, timeoutMs)
    }

    AsyncFunction("generateText") { requestId: String, prompt: String, maxTokens: Int, timeoutMs: Long ->
      // 긴 추론은 Expo 모듈 큐에서 실행해 화면 스레드와 분리한다.
      val result = runtimeManager.generateText(requestId, prompt, maxTokens, timeoutMs)
      Log.i(TAG, "Text generation finished: requestId=$requestId, elapsed=${result.latencyMs}")
      result.toMap()
    }

    Function("cancelGeneration") { requestId: String ->
      // 취소 플래그는 JS 스레드에서 즉시 전달하고 무거운 작업은 하지 않는다.
      runtimeManager.cancelGeneration(requestId).toMap()
    }

    AsyncFunction("releaseModel") {
      val result = runtimeManager.releaseModel()
      Log.i(TAG, "Model released: released=${result.released}")
      result.toMap()
    }
  }
}

private fun RuntimeInitializationStatus.toMap(runtimeVersion: String, abi: String?) = mapOf(
  "supported" to true,
  "platform" to "android",
  "state" to state.value,
  "runtimeVersion" to runtimeVersion,
  "abi" to abi,
  "modelPath" to modelPath,
  "initializationMs" to initializationMs,
  "alreadyInitialized" to alreadyInitialized,
  "activeRequestId" to activeRequestId,
  "errorCode" to errorCode,
  "errorMessage" to errorMessage,
)

private fun TextGenerationResult.toMap() = mapOf(
  "requestId" to requestId,
  "text" to text,
  "latencyMs" to latencyMs,
)

private fun CancellationResult.toMap() = mapOf(
  "requestId" to requestId,
  "cancelled" to cancelled,
)

private fun ReleaseResult.toMap() = mapOf(
  "released" to released,
)
