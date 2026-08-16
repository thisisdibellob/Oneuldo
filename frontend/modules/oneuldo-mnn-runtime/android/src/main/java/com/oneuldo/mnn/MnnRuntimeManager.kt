package com.oneuldo.mnn

import android.content.Context
import expo.modules.kotlin.exception.CodedException
import org.json.JSONObject
import java.io.File
import kotlin.system.measureTimeMillis

internal enum class RuntimeState(val value: String) {
  UNINITIALIZED("uninitialized"),
  INITIALIZING("initializing"),
  READY("ready"),
  GENERATING("generating"),
  RELEASING("releasing"),
  ERROR("error"),
}

internal data class RuntimeInitializationStatus(
  val state: RuntimeState,
  val modelPath: String? = null,
  val initializationMs: Long? = null,
  val alreadyInitialized: Boolean = false,
  val activeRequestId: String? = null,
  val errorCode: String? = null,
  val errorMessage: String? = null,
)

internal data class TextGenerationResult(
  val requestId: String,
  val text: String,
  val latencyMs: Long,
)

internal data class CancellationResult(
  val requestId: String,
  val cancelled: Boolean,
)

internal data class ReleaseResult(
  val released: Boolean,
)

internal class MnnRuntimeManager(
  private val context: Context,
  private val modelAssetManager: ModelAssetManager,
  private val initializeNative: (String, String) -> String?,
  private val isNativeInitialized: () -> Boolean,
  private val generateNative: (String, String, Int, Long) -> Array<String?>,
  private val cancelNative: (String) -> Boolean,
  private val releaseNative: () -> Boolean,
) {
  private val stateLock = Any()
  private val recentRequestIds = LinkedHashSet<String>()
  private val cancelledRequestIds = mutableSetOf<String>()

  @Volatile
  private var status = RuntimeInitializationStatus(RuntimeState.UNINITIALIZED)

  fun getStatus(): RuntimeInitializationStatus = status

  @Synchronized
  fun initializeModel(): RuntimeInitializationStatus {
    if (status.state == RuntimeState.INITIALIZING ||
      status.state == RuntimeState.GENERATING ||
      status.state == RuntimeState.RELEASING
    ) {
      return status.copy(errorCode = "BUSY", errorMessage = "런타임 작업이 진행 중입니다.")
    }
    if (status.state == RuntimeState.READY || isNativeInitialized()) {
      val model = modelAssetManager.prepareModel()
      status = RuntimeInitializationStatus(
        state = RuntimeState.READY,
        modelPath = model.modelPath,
        initializationMs = status.initializationMs,
        alreadyInitialized = true,
      )
      return status
    }

    status = RuntimeInitializationStatus(RuntimeState.INITIALIZING)
    var modelPath: String? = null
    var nativeError: String? = null
    var elapsedMs = 0L

    return try {
      val model = modelAssetManager.prepareModel()
      modelPath = model.modelPath
      val runtimeConfig = createTextOnlyRuntimeConfig(model.modelPath)
      val temporaryDirectory = File(context.noBackupFilesDir, "mnn-runtime-cache")
      if (!temporaryDirectory.exists() && !temporaryDirectory.mkdirs()) {
        throw CodedException(
          "INITIALIZATION_FAILED",
          "MNN 임시 디렉터리를 만들지 못했습니다.",
          null,
        )
      }

      elapsedMs = measureTimeMillis {
        nativeError = initializeNative(runtimeConfig.absolutePath, temporaryDirectory.absolutePath)
      }
      if (nativeError != null) {
        throw CodedException("INITIALIZATION_FAILED", nativeError, null)
      }

      RuntimeInitializationStatus(
        state = RuntimeState.READY,
        modelPath = model.modelPath,
        initializationMs = elapsedMs,
      ).also { status = it }
    } catch (error: Throwable) {
      val codedError = error as? CodedException
      RuntimeInitializationStatus(
        state = RuntimeState.ERROR,
        modelPath = modelPath,
        initializationMs = elapsedMs.takeIf { it > 0 },
        errorCode = codedError?.code ?: "INITIALIZATION_FAILED",
        errorMessage = error.message ?: "MNN 모델 초기화에 실패했습니다.",
      ).also { status = it }
    }
  }

  fun reserveGeneration(
    requestId: String,
    prompt: String,
    maxTokens: Int,
    timeoutMs: Long,
  ) {
    if (requestId.isBlank()) {
      throw CodedException("GENERATION_FAILED", "requestId가 비어 있습니다.", null)
    }
    if (prompt.isBlank()) {
      throw CodedException("GENERATION_FAILED", "프롬프트가 비어 있습니다.", null)
    }
    if (maxTokens !in 1..256) {
      throw CodedException("GENERATION_FAILED", "maxTokens는 1~256이어야 합니다.", null)
    }
    if (timeoutMs <= 0) {
      throw CodedException("GENERATION_FAILED", "timeoutMs는 0보다 커야 합니다.", null)
    }
    synchronized(stateLock) {
      if (recentRequestIds.contains(requestId)) {
        throw CodedException("BUSY", "이미 처리한 requestId입니다.", null)
      }
      if (status.state == RuntimeState.INITIALIZING ||
        status.state == RuntimeState.GENERATING ||
        status.state == RuntimeState.RELEASING
      ) {
        throw CodedException("BUSY", "다른 런타임 작업이 진행 중입니다.", null)
      }
      if (status.state != RuntimeState.READY || !isNativeInitialized()) {
        throw CodedException("NOT_INITIALIZED", "모델이 초기화되지 않았습니다.", null)
      }
      status = status.copy(
        state = RuntimeState.GENERATING,
        activeRequestId = requestId,
        errorCode = null,
        errorMessage = null,
      )
    }
  }

  fun generateText(
    requestId: String,
    prompt: String,
    maxTokens: Int,
    timeoutMs: Long,
  ): TextGenerationResult {
    synchronized(stateLock) {
      if (status.activeRequestId != requestId) {
        throw CodedException("BUSY", "생성 요청이 예약되지 않았습니다.", null)
      }
      if (cancelledRequestIds.remove(requestId)) {
        status = status.copy(state = RuntimeState.READY, activeRequestId = null)
        rememberRequestId(requestId)
        throw CodedException("CANCELLED", "생성 요청이 시작 전에 취소되었습니다.", null)
      }
    }

    var nativeResult: Array<String?> = emptyArray()
    try {
      val elapsedMs = measureTimeMillis {
        nativeResult = generateNative(requestId, prompt, maxTokens, timeoutMs)
      }
      val nativeErrorCode = nativeResult.getOrNull(1)
      val nativeErrorMessage = nativeResult.getOrNull(2)
      if (!nativeErrorCode.isNullOrBlank()) {
        throw CodedException(
          nativeErrorCode,
          nativeErrorMessage ?: "MNN 텍스트 생성에 실패했습니다.",
          null,
        )
      }

      val generatedText = nativeResult.getOrNull(0)?.trim().orEmpty()
      if (generatedText.isEmpty()) {
        throw CodedException("GENERATION_FAILED", "MNN이 빈 생성 결과를 반환했습니다.", null)
      }

      synchronized(stateLock) {
        if (status.state != RuntimeState.RELEASING) {
          status = status.copy(
            state = RuntimeState.READY,
            activeRequestId = null,
            errorCode = null,
            errorMessage = null,
          )
        }
      }
      return TextGenerationResult(requestId, generatedText, elapsedMs)
    } catch (error: Throwable) {
      val codedError = error as? CodedException
      synchronized(stateLock) {
        if (status.state != RuntimeState.RELEASING) {
          status = status.copy(
            state = RuntimeState.READY,
            activeRequestId = null,
            errorCode = codedError?.code ?: "GENERATION_FAILED",
            errorMessage = error.message,
          )
        }
      }
      throw error
    } finally {
      synchronized(stateLock) {
        rememberRequestId(requestId)
        cancelledRequestIds.remove(requestId)
        if (status.activeRequestId == requestId) {
          status = status.copy(activeRequestId = null)
        }
      }
    }
  }

  fun cancelGeneration(requestId: String): CancellationResult {
    if (requestId.isBlank()) {
      throw CodedException("GENERATION_FAILED", "requestId가 비어 있습니다.", null)
    }
    val activeRequestId = status.activeRequestId
    if (activeRequestId != requestId) {
      return CancellationResult(requestId, false)
    }
    synchronized(stateLock) {
      cancelledRequestIds.add(requestId)
    }
    cancelNative(requestId)
    return CancellationResult(requestId, true)
  }

  fun releaseModel(): ReleaseResult {
    synchronized(stateLock) {
      if (status.state == RuntimeState.INITIALIZING) {
        throw CodedException("BUSY", "모델 초기화 중에는 해제할 수 없습니다.", null)
      }
      status = status.copy(state = RuntimeState.RELEASING)
    }

    return try {
      val released = releaseNative()
      synchronized(stateLock) {
        status = RuntimeInitializationStatus(RuntimeState.UNINITIALIZED)
        recentRequestIds.clear()
        cancelledRequestIds.clear()
      }
      ReleaseResult(released)
    } catch (error: Throwable) {
      synchronized(stateLock) {
        status = RuntimeInitializationStatus(
          state = RuntimeState.ERROR,
          errorCode = "INITIALIZATION_FAILED",
          errorMessage = error.message ?: "모델 메모리를 해제하지 못했습니다.",
        )
      }
      throw error
    }
  }

  private fun rememberRequestId(requestId: String) {
    recentRequestIds.add(requestId)
    // requestId 기록은 최근 100개만 유지한다.
    while (recentRequestIds.size > 100) {
      recentRequestIds.remove(recentRequestIds.first())
    }
  }

  private fun createTextOnlyRuntimeConfig(modelPath: String): File {
    val modelDirectory = File(modelPath)
    val sourceModelConfig = File(modelDirectory, "llm_config.json")
    val sourceRuntimeConfig = File(modelDirectory, "config.json")

    val textModelConfig = JSONObject(sourceModelConfig.readText())
      .put("is_visual", false)
      .put("has_deepstack", false)
    val textModelConfigFile = File(modelDirectory, ".oneuldo-text-llm-config.json")

    val runtimeConfig = JSONObject(sourceRuntimeConfig.readText())
      .put("llm_config", textModelConfigFile.name)
    val jinjaConfig = runtimeConfig.optJSONObject("jinja") ?: JSONObject()
    val jinjaContext = jinjaConfig.optJSONObject("context") ?: JSONObject()
    // 짧은 응답이 생각 토큰만 출력하지 않도록 실행 설정에서 비활성화한다.
    jinjaContext.put("enable_thinking", false)
    jinjaConfig.put("context", jinjaContext)
    runtimeConfig.put("jinja", jinjaConfig)
    val runtimeConfigFile = File(modelDirectory, ".oneuldo-runtime-config.json")

    // 원본 checksum은 유지하고 실행용 text-only 설정만 따로 만든다.
    writeIfChanged(textModelConfigFile, textModelConfig.toString())
    writeIfChanged(runtimeConfigFile, runtimeConfig.toString())
    return runtimeConfigFile
  }

  private fun writeIfChanged(file: File, content: String) {
    if (file.isFile && file.readText() == content) return
    val temporaryFile = File(file.parentFile, "${file.name}.preparing")
    temporaryFile.writeText(content)
    if (file.exists() && !file.delete()) {
      throw CodedException("INITIALIZATION_FAILED", "실행 설정을 교체하지 못했습니다.", null)
    }
    if (!temporaryFile.renameTo(file)) {
      throw CodedException("INITIALIZATION_FAILED", "실행 설정을 저장하지 못했습니다.", null)
    }
  }
}
