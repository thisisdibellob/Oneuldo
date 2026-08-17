package com.oneuldo.llama

import android.content.Context
import android.os.StatFs
import expo.modules.kotlin.exception.CodedException
import org.json.JSONObject
import java.io.File
import java.io.FileNotFoundException
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

private const val MODEL_DIRECTORY_NAME = "bllossom-3b-q4-k-m"
private const val MANIFEST_ASSET_PATH = "models/$MODEL_DIRECTORY_NAME/model-manifest.json"
private const val READY_MARKER_NAME = ".oneuldo-model-ready.json"
private const val BUFFER_SIZE = 1024 * 1024
private const val REQUIRED_FREE_SPACE = 256L * 1024L * 1024L

internal data class DownloadModelManifest(
  val revision: String,
  val name: String,
  val size: Long,
  val sha256: String,
  val url: String,
)

internal data class ModelPreparation(
  val modelPath: String,
  val revision: String,
  val fileCount: Int,
  val totalBytes: Long,
  val reused: Boolean,
) {
  fun toMap() = mapOf(
    "supported" to true, "ready" to true, "modelPath" to modelPath,
    "revision" to revision, "fileCount" to fileCount,
    "totalBytes" to totalBytes, "reused" to reused,
  )
}

internal class ModelPreparationException(
  code: String,
  message: String,
  cause: Throwable? = null,
) : CodedException(code, message, cause)

internal class ModelDownloadManager(private val context: Context) {
  @Synchronized
  fun prepareModel(): ModelPreparation {
    val manifest = readManifest()
    val modelDirectory = File(context.noBackupFilesDir, "models/$MODEL_DIRECTORY_NAME")
    val modelFile = File(modelDirectory, manifest.name)
    if (isPreparedModelValid(modelDirectory, modelFile, manifest)) {
      return manifest.toPreparation(modelFile, reused = true)
    }

    ensureStorageAvailable(modelDirectory, manifest.size)
    downloadAndActivate(modelDirectory, modelFile, manifest)
    return manifest.toPreparation(modelFile, reused = false)
  }

  private fun readManifest(): DownloadModelManifest {
    val text = try {
      context.assets.open(MANIFEST_ASSET_PATH).bufferedReader().use { it.readText() }
    } catch (error: FileNotFoundException) {
      throw ModelPreparationException("MODEL_MISSING", "Bllossom 모델 manifest가 없습니다.", error)
    }

    try {
      val root = JSONObject(text)
      val file = root.getJSONObject("file")
      val name = file.getString("name")
      if (name != File(name).name || name.contains('/') || name.contains('\\')) {
        throw ModelPreparationException("MODEL_CORRUPTED", "모델 파일 이름이 올바르지 않습니다.")
      }
      return DownloadModelManifest(
        revision = root.getString("revision"),
        name = name,
        size = file.getLong("size"),
        sha256 = file.getString("sha256").lowercase(),
        url = file.getString("url"),
      )
    } catch (error: ModelPreparationException) {
      throw error
    } catch (error: Exception) {
      throw ModelPreparationException("MODEL_CORRUPTED", "모델 manifest가 올바르지 않습니다.", error)
    }
  }

  private fun isPreparedModelValid(
    directory: File,
    modelFile: File,
    manifest: DownloadModelManifest,
  ): Boolean {
    val marker = File(directory, READY_MARKER_NAME)
    if (!modelFile.isFile || modelFile.length() != manifest.size || !marker.isFile) return false
    return try {
      val markerJson = JSONObject(marker.readText())
      markerJson.getString("revision") == manifest.revision &&
        markerJson.getString("sha256") == manifest.sha256
    } catch (_: Exception) {
      false
    }
  }

  private fun ensureStorageAvailable(directory: File, modelBytes: Long) {
    if (!directory.exists() && !directory.mkdirs()) {
      throw ModelPreparationException("INITIALIZATION_FAILED", "앱 모델 디렉터리를 만들지 못했습니다.")
    }
    val available = StatFs(directory.absolutePath).availableBytes
    val required = modelBytes + REQUIRED_FREE_SPACE
    if (available < required) {
      throw ModelPreparationException(
        "INSUFFICIENT_STORAGE",
        "모델 저장 공간이 부족합니다. 필요: $required 바이트, 사용 가능: $available 바이트",
      )
    }
  }

  private fun downloadAndActivate(
    directory: File,
    modelFile: File,
    manifest: DownloadModelManifest,
  ) {
    val partialFile = File(directory, "${manifest.name}.part")
    if (partialFile.exists() && !partialFile.delete()) {
      throw ModelPreparationException("INITIALIZATION_FAILED", "이전 임시 모델 파일을 지우지 못했습니다.")
    }

    val digest = MessageDigest.getInstance("SHA-256")
    var copiedBytes = 0L
    var connection: HttpURLConnection? = null
    try {
      connection = (URL(manifest.url).openConnection() as HttpURLConnection).apply {
        instanceFollowRedirects = true
        connectTimeout = 30_000
        readTimeout = 60_000
        setRequestProperty("User-Agent", "Oneuldo-Android/1.0")
      }
      val responseCode = connection.responseCode
      if (responseCode !in 200..299) {
        throw IOException("HTTP $responseCode")
      }
      connection.inputStream.use { input ->
        FileOutputStream(partialFile).use { output ->
          val buffer = ByteArray(BUFFER_SIZE)
          while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            output.write(buffer, 0, count)
            digest.update(buffer, 0, count)
            copiedBytes += count
          }
          output.fd.sync()
        }
      }
    } catch (error: IOException) {
      partialFile.delete()
      val message = error.message.orEmpty()
      val code = if (message.contains("space", ignoreCase = true)) {
        "INSUFFICIENT_STORAGE"
      } else if (message.contains("resolve", ignoreCase = true) ||
        message.contains("connect", ignoreCase = true)
      ) {
        "NETWORK_UNAVAILABLE"
      } else {
        "MODEL_DOWNLOAD_FAILED"
      }
      throw ModelPreparationException(code, "Bllossom 모델 다운로드에 실패했습니다.", error)
    } finally {
      connection?.disconnect()
    }

    val actualHash = digest.digest().joinToString("") { "%02x".format(it) }
    if (copiedBytes != manifest.size || actualHash != manifest.sha256) {
      partialFile.delete()
      throw ModelPreparationException("MODEL_CORRUPTED", "다운로드한 GGUF 모델 검증에 실패했습니다.")
    }

    if (modelFile.exists() && !modelFile.delete()) {
      partialFile.delete()
      throw ModelPreparationException("INITIALIZATION_FAILED", "기존 모델 파일을 교체하지 못했습니다.")
    }
    if (!partialFile.renameTo(modelFile)) {
      partialFile.delete()
      throw ModelPreparationException("INITIALIZATION_FAILED", "검증된 모델 파일을 활성화하지 못했습니다.")
    }
    File(directory, READY_MARKER_NAME).writeText(
      JSONObject().put("revision", manifest.revision).put("sha256", manifest.sha256).toString(),
    )
  }

  private fun DownloadModelManifest.toPreparation(file: File, reused: Boolean) = ModelPreparation(
    modelPath = file.absolutePath,
    revision = revision,
    fileCount = 1,
    totalBytes = size,
    reused = reused,
  )
}
