package com.oneuldo.llama

import expo.modules.kotlin.exception.CodedException
import kotlin.system.measureTimeMillis

internal enum class RuntimeState(val value: String) {
  UNINITIALIZED("uninitialized"), INITIALIZING("initializing"), READY("ready"),
  GENERATING("generating"), RELEASING("releasing"), ERROR("error"),
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
internal data class TextGenerationResult(val requestId: String, val text: String, val latencyMs: Long)
internal data class CancellationResult(val requestId: String, val cancelled: Boolean)
internal data class ReleaseResult(val released: Boolean)

internal class LlamaRuntimeManager(
  private val modelDownloadManager: ModelDownloadManager,
  private val initializeNative: (String) -> String?,
  private val isNativeInitialized: () -> Boolean,
  private val generateNative: (String, String, Int, Long) -> Array<String?>,
  private val cancelNative: (String) -> Boolean,
  private val releaseNative: () -> Boolean,
) {
  private val stateLock = Any()
  private val recentRequestIds = LinkedHashSet<String>()
  private val cancelledRequestIds = mutableSetOf<String>()

  @Volatile private var status = RuntimeInitializationStatus(RuntimeState.UNINITIALIZED)

  fun getStatus(): RuntimeInitializationStatus = status

  @Synchronized
  fun initializeModel(): RuntimeInitializationStatus {
    if (status.state in setOf(RuntimeState.INITIALIZING, RuntimeState.GENERATING, RuntimeState.RELEASING)) {
      return status.copy(errorCode = "BUSY", errorMessage = "런타임 작업이 진행 중입니다.")
    }
    if (status.state == RuntimeState.READY || isNativeInitialized()) {
      val model = modelDownloadManager.prepareModel()
      return RuntimeInitializationStatus(
        state = RuntimeState.READY,
        modelPath = model.modelPath,
        initializationMs = status.initializationMs,
        alreadyInitialized = true,
      ).also { status = it }
    }

    status = RuntimeInitializationStatus(RuntimeState.INITIALIZING)
    var modelPath: String? = null
    var elapsedMs = 0L
    return try {
      val model = modelDownloadManager.prepareModel()
      modelPath = model.modelPath
      var nativeError: String? = null
      elapsedMs = measureTimeMillis { nativeError = initializeNative(model.modelPath) }
      if (nativeError != null) throw CodedException("INITIALIZATION_FAILED", nativeError, null)
      RuntimeInitializationStatus(
        state = RuntimeState.READY,
        modelPath = model.modelPath,
        initializationMs = elapsedMs,
      ).also { status = it }
    } catch (error: Throwable) {
      val coded = error as? CodedException
      RuntimeInitializationStatus(
        state = RuntimeState.ERROR,
        modelPath = modelPath,
        initializationMs = elapsedMs.takeIf { it > 0 },
        errorCode = coded?.code ?: "INITIALIZATION_FAILED",
        errorMessage = error.message ?: "Bllossom 모델 초기화에 실패했습니다.",
      ).also { status = it }
    }
  }

  fun reserveGeneration(requestId: String, prompt: String, maxTokens: Int, timeoutMs: Long) {
    if (requestId.isBlank()) throw CodedException("GENERATION_FAILED", "requestId가 비어 있습니다.", null)
    if (prompt.isBlank()) throw CodedException("GENERATION_FAILED", "프롬프트가 비어 있습니다.", null)
    // GGUF 런타임의 2,048 토큰 컨텍스트 안에서 최대 1,024 토큰 출력을 허용한다.
    if (maxTokens !in 1..1024) throw CodedException("GENERATION_FAILED", "maxTokens는 1~1024여야 합니다.", null)
    if (timeoutMs <= 0) throw CodedException("GENERATION_FAILED", "timeoutMs는 0보다 커야 합니다.", null)
    synchronized(stateLock) {
      if (recentRequestIds.contains(requestId)) throw CodedException("BUSY", "이미 처리한 requestId입니다.", null)
      if (status.state in setOf(RuntimeState.INITIALIZING, RuntimeState.GENERATING, RuntimeState.RELEASING)) {
        throw CodedException("BUSY", "다른 런타임 작업이 진행 중입니다.", null)
      }
      if (status.state != RuntimeState.READY || !isNativeInitialized()) {
        throw CodedException("NOT_INITIALIZED", "모델이 초기화되지 않았습니다.", null)
      }
      // 비동기 실행 전에 요청 소유권을 먼저 확정한다.
      status = status.copy(
        state = RuntimeState.GENERATING,
        activeRequestId = requestId,
        errorCode = null,
        errorMessage = null,
      )
    }
  }

  fun generateText(requestId: String, prompt: String, maxTokens: Int, timeoutMs: Long): TextGenerationResult {
    synchronized(stateLock) {
      if (status.activeRequestId != requestId) throw CodedException("BUSY", "생성 요청이 예약되지 않았습니다.", null)
      if (cancelledRequestIds.remove(requestId)) {
        status = status.copy(state = RuntimeState.READY, activeRequestId = null)
        rememberRequestId(requestId)
        throw CodedException("CANCELLED", "생성 요청이 시작 전에 취소되었습니다.", null)
      }
    }

    try {
      var nativeResult: Array<String?> = emptyArray()
      val elapsedMs = measureTimeMillis {
        nativeResult = generateNative(requestId, prompt, maxTokens, timeoutMs)
      }
      val errorCode = nativeResult.getOrNull(1)
      if (!errorCode.isNullOrBlank()) {
        throw CodedException(errorCode, nativeResult.getOrNull(2) ?: "Bllossom 생성에 실패했습니다.", null)
      }
      val text = nativeResult.getOrNull(0)?.trim().orEmpty()
      if (text.isEmpty()) throw CodedException("GENERATION_FAILED", "Bllossom이 빈 결과를 반환했습니다.", null)
      synchronized(stateLock) {
        if (status.state != RuntimeState.RELEASING) {
          status = status.copy(state = RuntimeState.READY, activeRequestId = null, errorCode = null, errorMessage = null)
        }
      }
      return TextGenerationResult(requestId, text, elapsedMs)
    } catch (error: Throwable) {
      val coded = error as? CodedException
      synchronized(stateLock) {
        if (status.state != RuntimeState.RELEASING) {
          status = status.copy(
            state = RuntimeState.READY,
            activeRequestId = null,
            errorCode = coded?.code ?: "GENERATION_FAILED",
            errorMessage = error.message,
          )
        }
      }
      throw error
    } finally {
      synchronized(stateLock) {
        rememberRequestId(requestId)
        cancelledRequestIds.remove(requestId)
        if (status.activeRequestId == requestId) status = status.copy(activeRequestId = null)
      }
    }
  }

  fun cancelGeneration(requestId: String): CancellationResult {
    if (requestId.isBlank()) throw CodedException("GENERATION_FAILED", "requestId가 비어 있습니다.", null)
    if (status.activeRequestId != requestId) return CancellationResult(requestId, false)
    synchronized(stateLock) { cancelledRequestIds.add(requestId) }
    cancelNative(requestId)
    return CancellationResult(requestId, true)
  }

  fun releaseModel(): ReleaseResult {
    synchronized(stateLock) {
      if (status.state == RuntimeState.INITIALIZING) throw CodedException("BUSY", "모델 초기화 중에는 해제할 수 없습니다.", null)
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
        status = RuntimeInitializationStatus(RuntimeState.ERROR, errorCode = "INITIALIZATION_FAILED", errorMessage = error.message)
      }
      throw error
    }
  }

  private fun rememberRequestId(requestId: String) {
    recentRequestIds.add(requestId)
    // 중복 방지 기록은 최근 100개만 유지한다.
    while (recentRequestIds.size > 100) recentRequestIds.remove(recentRequestIds.first())
  }
}
