package com.oneuldo.mnn

import android.content.Context
import android.content.res.AssetManager
import android.os.StatFs
import expo.modules.kotlin.exception.CodedException
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileNotFoundException
import java.io.FileOutputStream
import java.io.IOException
import java.security.MessageDigest

private const val MODEL_DIRECTORY_NAME = "qwen3.5-0.8b-mnn"
private const val MODEL_ASSET_ROOT = "models/$MODEL_DIRECTORY_NAME"
private const val MANIFEST_ASSET_PATH = "$MODEL_ASSET_ROOT/model-manifest.json"
private const val READY_MARKER_NAME = ".oneuldo-model-ready.json"
private const val COPY_BUFFER_SIZE = 1024 * 1024
private const val REQUIRED_FREE_SPACE_AFTER_COPY = 64L * 1024L * 1024L

internal data class ModelFile(
  val name: String,
  val size: Long,
  val sha256: String,
)

internal data class ModelManifest(
  val revision: String,
  val files: List<ModelFile>,
) {
  val totalBytes: Long = files.sumOf { it.size }
}

internal data class ModelPreparation(
  val modelPath: String,
  val revision: String,
  val fileCount: Int,
  val totalBytes: Long,
  val reused: Boolean,
) {
  fun toMap() = mapOf(
    "supported" to true,
    "ready" to true,
    "modelPath" to modelPath,
    "revision" to revision,
    "fileCount" to fileCount,
    "totalBytes" to totalBytes,
    "reused" to reused,
  )
}

internal class ModelPreparationException(
  code: String,
  message: String,
  cause: Throwable? = null,
) : CodedException(code, message, cause)

internal class ModelAssetManager(private val context: Context) {
  @Synchronized
  fun prepareModel(): ModelPreparation {
    val manifest = readManifest()
    val modelsRoot = File(context.noBackupFilesDir, "models")
    val destination = File(modelsRoot, MODEL_DIRECTORY_NAME)

    if (isPreparedModelValid(destination, manifest)) {
      return manifest.toPreparation(destination, reused = true)
    }

    if (destination.exists() && !destination.deleteRecursively()) {
      throw ModelPreparationException(
        "INITIALIZATION_FAILED",
        "Cannot remove the invalid model directory: ${destination.absolutePath}",
      )
    }
    File(modelsRoot, "$MODEL_DIRECTORY_NAME.preparing").deleteRecursively()
    ensureStorageAvailable(modelsRoot, manifest.totalBytes)
    copyAndVerifyModel(modelsRoot, destination, manifest)
    return manifest.toPreparation(destination, reused = false)
  }

  private fun readManifest(): ModelManifest {
    val manifestText = try {
      context.assets.open(MANIFEST_ASSET_PATH).bufferedReader().use { it.readText() }
    } catch (error: FileNotFoundException) {
      throw ModelPreparationException(
        "MODEL_MISSING",
        "Bundled model manifest is missing: $MANIFEST_ASSET_PATH",
        error,
      )
    }

    try {
      val json = JSONObject(manifestText)
      val fileArray = json.getJSONArray("files")
      val files = buildList {
        for (index in 0 until fileArray.length()) {
          val item = fileArray.getJSONObject(index)
          val name = item.getString("name")
          if (name != File(name).name || name.contains('/') || name.contains('\\')) {
            throw ModelPreparationException("MODEL_CORRUPTED", "Invalid model file name: $name")
          }
          add(ModelFile(name, item.getLong("size"), item.getString("sha256")))
        }
      }
      if (files.isEmpty()) {
        throw ModelPreparationException("MODEL_CORRUPTED", "The model manifest has no files.")
      }
      return ModelManifest(json.getString("revision"), files)
    } catch (error: ModelPreparationException) {
      throw error
    } catch (error: Exception) {
      throw ModelPreparationException("MODEL_CORRUPTED", "The model manifest is invalid.", error)
    }
  }

  private fun isPreparedModelValid(directory: File, manifest: ModelManifest): Boolean {
    if (!directory.isDirectory) return false
    val marker = File(directory, READY_MARKER_NAME)
    if (!marker.isFile) return false

    return try {
      val markerJson = JSONObject(marker.readText())
      if (markerJson.getString("revision") != manifest.revision) return false
      manifest.files.all { modelFile ->
        val file = File(directory, modelFile.name)
        file.isFile && file.length() == modelFile.size
      }
    } catch (_: Exception) {
      false
    }
  }

  private fun ensureStorageAvailable(modelsRoot: File, modelBytes: Long) {
    if (!modelsRoot.exists() && !modelsRoot.mkdirs()) {
      throw ModelPreparationException(
        "INITIALIZATION_FAILED",
        "Cannot create the private model directory: ${modelsRoot.absolutePath}",
      )
    }
    val requiredBytes = modelBytes + REQUIRED_FREE_SPACE_AFTER_COPY
    val availableBytes = StatFs(modelsRoot.absolutePath).availableBytes
    if (availableBytes < requiredBytes) {
      throw ModelPreparationException(
        "INSUFFICIENT_STORAGE",
        "Not enough storage for the model. Required: $requiredBytes, available: $availableBytes",
      )
    }
  }

  private fun copyAndVerifyModel(
    modelsRoot: File,
    destination: File,
    manifest: ModelManifest,
  ) {
    val staging = File(modelsRoot, "$MODEL_DIRECTORY_NAME.preparing")
    staging.deleteRecursively()
    if (!staging.mkdirs()) {
      throw ModelPreparationException(
        "INITIALIZATION_FAILED",
        "Cannot create the temporary model directory: ${staging.absolutePath}",
      )
    }

    try {
      manifest.files.forEach { copyAndVerifyAsset(it, staging) }
      writeReadyMarker(staging, manifest)

      if (destination.exists() && !destination.deleteRecursively()) {
        throw IOException("Cannot replace the invalid model directory: ${destination.absolutePath}")
      }
      if (!staging.renameTo(destination)) {
        throw IOException("Cannot activate the prepared model directory: ${destination.absolutePath}")
      }
    } catch (error: ModelPreparationException) {
      staging.deleteRecursively()
      throw error
    } catch (error: IOException) {
      staging.deleteRecursively()
      val code = if (error.message?.contains("No space left", ignoreCase = true) == true) {
        "INSUFFICIENT_STORAGE"
      } else {
        "INITIALIZATION_FAILED"
      }
      throw ModelPreparationException(code, "Failed to prepare the model files.", error)
    }
  }

  private fun copyAndVerifyAsset(modelFile: ModelFile, staging: File) {
    val destination = File(staging, modelFile.name)
    val digest = MessageDigest.getInstance("SHA-256")
    var copiedBytes = 0L

    try {
      context.assets.open(
        "$MODEL_ASSET_ROOT/${modelFile.name}",
        AssetManager.ACCESS_STREAMING,
      ).use { input ->
        FileOutputStream(destination).use { output ->
          val buffer = ByteArray(COPY_BUFFER_SIZE)
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
    } catch (error: FileNotFoundException) {
      throw ModelPreparationException(
        "MODEL_MISSING",
        "Bundled model file is missing: ${modelFile.name}",
        error,
      )
    }

    val actualHash = digest.digest().joinToString("") { "%02x".format(it) }
    if (copiedBytes != modelFile.size || actualHash != modelFile.sha256) {
      throw ModelPreparationException(
        "MODEL_CORRUPTED",
        "Bundled model file failed verification: ${modelFile.name}",
      )
    }
  }

  private fun writeReadyMarker(directory: File, manifest: ModelManifest) {
    val files = JSONArray()
    manifest.files.forEach { modelFile ->
      files.put(
        JSONObject()
          .put("name", modelFile.name)
          .put("size", modelFile.size)
          .put("sha256", modelFile.sha256),
      )
    }
    val marker = JSONObject()
      .put("revision", manifest.revision)
      .put("files", files)
    File(directory, READY_MARKER_NAME).writeText(marker.toString())
  }

  private fun ModelManifest.toPreparation(directory: File, reused: Boolean) = ModelPreparation(
    modelPath = directory.absolutePath,
    revision = revision,
    fileCount = files.size,
    totalBytes = totalBytes,
    reused = reused,
  )
}
