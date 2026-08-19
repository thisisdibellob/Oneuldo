#include "llama_runtime_bridge.h"

#include <android/log.h>
#include <jni.h>
#include <llama.h>
#include <ggml-backend.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <fstream>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

namespace oneuldo::llama_runtime {
namespace {

#define ONEULDO_TIMING_LOG(...) \
  __android_log_print(ANDROID_LOG_INFO, "OneuldoLlamaTiming", __VA_ARGS__)

std::mutex runtime_mutex;
std::mutex generation_state_mutex;
llama_model* model = nullptr;
llama_context* context = nullptr;
const llama_vocab* vocab = nullptr;
std::string active_request_id;
std::atomic<bool> cancel_requested{false};
std::atomic<int64_t> deadline_ms{0};

int64_t monotonicMilliseconds() {
  return std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::steady_clock::now().time_since_epoch()).count();
}

bool shouldAbort(void*) {
  const int64_t deadline = deadline_ms.load();
  return cancel_requested.load() || (deadline > 0 && monotonicMilliseconds() >= deadline);
}

void clearRuntime() {
  if (context != nullptr) {
    llama_free(context);
    context = nullptr;
  }
  if (model != nullptr) {
    llama_model_free(model);
    model = nullptr;
  }
  vocab = nullptr;
}

std::string formatPrompt(const std::string& prompt) {
  const char* chat_template = llama_model_chat_template(model, nullptr);
  if (chat_template == nullptr) return prompt;

  const char* system_text =
      "Return concise, natural Korean text only and follow the requested JSON schema exactly.";
  llama_chat_message messages[] = {
      {"system", system_text},
      {"user", prompt.c_str()},
  };
  int32_t required = llama_chat_apply_template(
      chat_template, messages, 2, true, nullptr, 0);
  if (required <= 0) return prompt;

  std::vector<char> buffer(static_cast<size_t>(required) + 1);
  int32_t written = llama_chat_apply_template(
      chat_template, messages, 2, true, buffer.data(), static_cast<int32_t>(buffer.size()));
  return written > 0 ? std::string(buffer.data(), static_cast<size_t>(written)) : prompt;
}

std::vector<llama_token> tokenize(const std::string& text) {
  int32_t count = -llama_tokenize(
      vocab, text.c_str(), static_cast<int32_t>(text.size()), nullptr, 0, true, true);
  if (count <= 0) return {};
  std::vector<llama_token> tokens(static_cast<size_t>(count));
  int32_t written = llama_tokenize(
      vocab, text.c_str(), static_cast<int32_t>(text.size()), tokens.data(), count, true, true);
  if (written < 0) return {};
  tokens.resize(static_cast<size_t>(written));
  return tokens;
}

std::string tokenToPiece(llama_token token) {
  char local_buffer[256];
  int32_t size = llama_token_to_piece(vocab, token, local_buffer, sizeof(local_buffer), 0, true);
  if (size >= 0) return std::string(local_buffer, static_cast<size_t>(size));
  std::vector<char> buffer(static_cast<size_t>(-size));
  size = llama_token_to_piece(vocab, token, buffer.data(), static_cast<int32_t>(buffer.size()), 0, true);
  return size >= 0 ? std::string(buffer.data(), static_cast<size_t>(size)) : std::string();
}

void appendUtf8(std::string& output, uint32_t code_point) {
  if (code_point <= 0x7F) {
    output.push_back(static_cast<char>(code_point));
  } else if (code_point <= 0x7FF) {
    output.push_back(static_cast<char>(0xC0 | (code_point >> 6)));
    output.push_back(static_cast<char>(0x80 | (code_point & 0x3F)));
  } else if (code_point <= 0xFFFF) {
    output.push_back(static_cast<char>(0xE0 | (code_point >> 12)));
    output.push_back(static_cast<char>(0x80 | ((code_point >> 6) & 0x3F)));
    output.push_back(static_cast<char>(0x80 | (code_point & 0x3F)));
  } else {
    output.push_back(static_cast<char>(0xF0 | (code_point >> 18)));
    output.push_back(static_cast<char>(0x80 | ((code_point >> 12) & 0x3F)));
    output.push_back(static_cast<char>(0x80 | ((code_point >> 6) & 0x3F)));
    output.push_back(static_cast<char>(0x80 | (code_point & 0x3F)));
  }
}

class ActiveRequestGuard {
 public:
  ~ActiveRequestGuard() {
    std::lock_guard<std::mutex> lock(generation_state_mutex);
    active_request_id.clear();
    cancel_requested.store(false);
    deadline_ms.store(0);
  }
};

class SamplerGuard {
 public:
  explicit SamplerGuard(llama_sampler* value) : value_(value) {}
  ~SamplerGuard() { if (value_ != nullptr) llama_sampler_free(value_); }
  llama_sampler* get() const { return value_; }
 private:
  llama_sampler* value_;
};

}  // namespace

std::string initializeRuntime(const std::string& model_path) {
  const int64_t initialization_start_ms = monotonicMilliseconds();
  std::lock_guard<std::mutex> lock(runtime_mutex);
  if (model != nullptr && context != nullptr) {
    ONEULDO_TIMING_LOG("initialize reused totalMs=%lld",
                       static_cast<long long>(monotonicMilliseconds() - initialization_start_ms));
    return {};
  }
  if (!std::ifstream(model_path, std::ios::binary).good()) {
    return "GGUF 모델 파일을 찾을 수 없습니다.";
  }

  ONEULDO_TIMING_LOG("initialize start");
  ggml_backend_load_all();
  llama_model_params model_params = llama_model_default_params();
  model_params.n_gpu_layers = 0;
  model_params.check_tensors = false;
  model = llama_model_load_from_file(model_path.c_str(), model_params);
  if (model == nullptr) return "Bllossom GGUF 모델을 불러오지 못했습니다.";
  ONEULDO_TIMING_LOG("initialize modelLoaded elapsedMs=%lld",
                     static_cast<long long>(monotonicMilliseconds() - initialization_start_ms));

  vocab = llama_model_get_vocab(model);
  llama_context_params context_params = llama_context_default_params();
  context_params.n_ctx = 2048;
  context_params.n_batch = 512;
  context_params.n_ubatch = 512;
  context_params.n_threads = 4;
  context_params.n_threads_batch = 4;
  context_params.no_perf = true;
  context_params.abort_callback = shouldAbort;
  context = llama_init_from_model(model, context_params);
  if (context == nullptr) {
    clearRuntime();
    return "llama.cpp 추론 컨텍스트를 만들지 못했습니다.";
  }
  ONEULDO_TIMING_LOG("initialize complete totalMs=%lld nCtx=2048 nThreads=4",
                     static_cast<long long>(monotonicMilliseconds() - initialization_start_ms));
  return {};
}

bool isRuntimeInitialized() {
  std::lock_guard<std::mutex> lock(runtime_mutex);
  return model != nullptr && context != nullptr;
}

GenerationResult generateText(
    const std::string& request_id,
    const std::string& prompt,
    int max_tokens,
    int64_t timeout_ms) {
  const int64_t request_start_ms = monotonicMilliseconds();
  {
    std::lock_guard<std::mutex> state_lock(generation_state_mutex);
    if (!active_request_id.empty()) {
      return {false, {}, "BUSY", "다른 생성 요청이 실행 중입니다."};
    }
    active_request_id = request_id;
    cancel_requested.store(false);
    deadline_ms.store(timeout_ms > 0 ? monotonicMilliseconds() + timeout_ms : 0);
  }
  ActiveRequestGuard request_guard;
  ONEULDO_TIMING_LOG(
      "generate start request=%s maxTokens=%d timeoutMs=%lld promptBytes=%zu",
      request_id.c_str(), max_tokens, static_cast<long long>(timeout_ms), prompt.size());

  std::lock_guard<std::mutex> runtime_lock(runtime_mutex);
  ONEULDO_TIMING_LOG("generate runtimeLock request=%s waitMs=%lld",
                     request_id.c_str(),
                     static_cast<long long>(monotonicMilliseconds() - request_start_ms));
  if (model == nullptr || context == nullptr || vocab == nullptr) {
    return {false, {}, "NOT_INITIALIZED", "모델이 초기화되지 않았습니다."};
  }

  // 요청마다 KV cache를 비워 이전 대화가 다음 생성에 섞이지 않게 한다.
  llama_memory_clear(llama_get_memory(context), true);
  const int64_t prompt_prepare_start_ms = monotonicMilliseconds();
  const std::string formatted_prompt = formatPrompt(prompt);
  std::vector<llama_token> prompt_tokens = tokenize(formatted_prompt);
  ONEULDO_TIMING_LOG(
      "generate promptPrepared request=%s promptTokens=%zu formattedBytes=%zu elapsedMs=%lld",
      request_id.c_str(), prompt_tokens.size(), formatted_prompt.size(),
      static_cast<long long>(monotonicMilliseconds() - prompt_prepare_start_ms));
  if (prompt_tokens.empty()) {
    return {false, {}, "GENERATION_FAILED", "프롬프트를 토큰으로 변환하지 못했습니다."};
  }
  if (prompt_tokens.size() + static_cast<size_t>(max_tokens) > 2048) {
    return {false, {}, "GENERATION_FAILED", "프롬프트가 2048 토큰 컨텍스트를 초과합니다."};
  }

  auto sampler_params = llama_sampler_chain_default_params();
  sampler_params.no_perf = true;
  llama_sampler* sampler = llama_sampler_chain_init(sampler_params);
  SamplerGuard sampler_guard(sampler);
  llama_sampler_chain_add(sampler, llama_sampler_init_top_k(20));
  llama_sampler_chain_add(sampler, llama_sampler_init_top_p(0.95f, 1));
  llama_sampler_chain_add(sampler, llama_sampler_init_temp(0.7f));
  llama_sampler_chain_add(sampler, llama_sampler_init_dist(LLAMA_DEFAULT_SEED));

  // 긴 프롬프트는 n_batch(512)에 맞춰 나누어 KV cache에 채운다.
  const int64_t prompt_decode_start_ms = monotonicMilliseconds();
  size_t prompt_offset = 0;
  while (prompt_offset < prompt_tokens.size()) {
    const int32_t batch_size = static_cast<int32_t>(
        std::min<size_t>(512, prompt_tokens.size() - prompt_offset));
    llama_batch prompt_batch = llama_batch_get_one(prompt_tokens.data() + prompt_offset, batch_size);
    if (llama_decode(context, prompt_batch) != 0) {
      if (shouldAbort(nullptr)) {
        const bool cancelled = cancel_requested.load();
        ONEULDO_TIMING_LOG(
            "generate abort request=%s phase=promptDecode decodedTokens=%zu totalMs=%lld",
            request_id.c_str(), prompt_offset,
            static_cast<long long>(monotonicMilliseconds() - request_start_ms));
        return {false, {}, cancelled ? "CANCELLED" : "TIMEOUT",
                cancelled ? "생성 요청이 취소되었습니다." : "텍스트 생성 시간이 제한을 초과했습니다."};
      }
      return {false, {}, "GENERATION_FAILED", "프롬프트 디코딩에 실패했습니다."};
    }
    prompt_offset += static_cast<size_t>(batch_size);
    ONEULDO_TIMING_LOG(
        "generate promptProgress request=%s decodedTokens=%zu/%zu elapsedMs=%lld",
        request_id.c_str(), prompt_offset, prompt_tokens.size(),
        static_cast<long long>(monotonicMilliseconds() - prompt_decode_start_ms));
  }
  const int64_t output_start_ms = monotonicMilliseconds();
  ONEULDO_TIMING_LOG("generate promptComplete request=%s promptDecodeMs=%lld totalMs=%lld",
                     request_id.c_str(),
                     static_cast<long long>(output_start_ms - prompt_decode_start_ms),
                     static_cast<long long>(output_start_ms - request_start_ms));

  std::string output;
  for (int token_index = 0; token_index < max_tokens; ++token_index) {
    if (shouldAbort(nullptr)) {
      const bool cancelled = cancel_requested.load();
      ONEULDO_TIMING_LOG(
          "generate abort request=%s phase=outputLoop generatedTokens=%d outputMs=%lld totalMs=%lld",
          request_id.c_str(), token_index,
          static_cast<long long>(monotonicMilliseconds() - output_start_ms),
          static_cast<long long>(monotonicMilliseconds() - request_start_ms));
      return {false, {}, cancelled ? "CANCELLED" : "TIMEOUT",
              cancelled ? "생성 요청이 취소되었습니다." : "텍스트 생성 시간이 제한을 초과했습니다."};
    }
    llama_token next_token = llama_sampler_sample(sampler, context, -1);
    if (llama_vocab_is_eog(vocab, next_token)) {
      ONEULDO_TIMING_LOG("generate eog request=%s generatedTokens=%d totalMs=%lld",
                         request_id.c_str(), token_index,
                         static_cast<long long>(monotonicMilliseconds() - request_start_ms));
      break;
    }
    output += tokenToPiece(next_token);
    if (token_index + 1 < max_tokens) {
      llama_batch token_batch = llama_batch_get_one(&next_token, 1);
      if (llama_decode(context, token_batch) != 0) {
        if (shouldAbort(nullptr)) {
          const bool cancelled = cancel_requested.load();
          ONEULDO_TIMING_LOG(
              "generate abort request=%s phase=outputDecode generatedTokens=%d outputMs=%lld totalMs=%lld",
              request_id.c_str(), token_index + 1,
              static_cast<long long>(monotonicMilliseconds() - output_start_ms),
              static_cast<long long>(monotonicMilliseconds() - request_start_ms));
          return {false, {}, cancelled ? "CANCELLED" : "TIMEOUT",
                  cancelled ? "생성 요청이 취소되었습니다." : "텍스트 생성 시간이 제한을 초과했습니다."};
        }
        return {false, {}, "GENERATION_FAILED", "llama.cpp 디코딩에 실패했습니다."};
      }
    }
    if (token_index == 0 || (token_index + 1) % 5 == 0) {
      ONEULDO_TIMING_LOG(
          "generate outputProgress request=%s generatedTokens=%d outputMs=%lld totalMs=%lld",
          request_id.c_str(), token_index + 1,
          static_cast<long long>(monotonicMilliseconds() - output_start_ms),
          static_cast<long long>(monotonicMilliseconds() - request_start_ms));
    }
  }

  if (output.empty()) {
    return {false, {}, "GENERATION_FAILED", "Bllossom이 빈 생성 결과를 반환했습니다."};
  }
  ONEULDO_TIMING_LOG("generate complete request=%s outputBytes=%zu totalMs=%lld",
                     request_id.c_str(), output.size(),
                     static_cast<long long>(monotonicMilliseconds() - request_start_ms));
  return {true, output, {}, {}};
}

bool cancelGeneration(const std::string& request_id) {
  std::lock_guard<std::mutex> lock(generation_state_mutex);
  if (active_request_id != request_id) return false;
  cancel_requested.store(true);
  return true;
}

bool releaseRuntime() {
  cancel_requested.store(true);
  std::lock_guard<std::mutex> runtime_lock(runtime_mutex);
  const bool released = model != nullptr || context != nullptr;
  clearRuntime();
  return released;
}

std::string fromJString(JNIEnv* env, jstring value) {
  if (value == nullptr) return {};
  const jsize length = env->GetStringLength(value);
  const jchar* characters = env->GetStringChars(value, nullptr);
  if (characters == nullptr) return {};
  std::string result;
  result.reserve(static_cast<size_t>(length) * 3);
  for (jsize index = 0; index < length; ++index) {
    uint32_t code_point = characters[index];
    if (code_point >= 0xD800 && code_point <= 0xDBFF && index + 1 < length) {
      const uint32_t low = characters[index + 1];
      if (low >= 0xDC00 && low <= 0xDFFF) {
        code_point = 0x10000 + ((code_point - 0xD800) << 10) + (low - 0xDC00);
        ++index;
      } else {
        code_point = 0xFFFD;
      }
    } else if (code_point >= 0xDC00 && code_point <= 0xDFFF) {
      code_point = 0xFFFD;
    }
    appendUtf8(result, code_point);
  }
  env->ReleaseStringChars(value, characters);
  return result;
}

jstring toJString(JNIEnv* env, const std::string& value) {
  std::vector<jchar> utf16;
  utf16.reserve(value.size());
  size_t index = 0;
  while (index < value.size()) {
    const auto first = static_cast<unsigned char>(value[index]);
    uint32_t code_point = 0xFFFD;
    size_t byte_count = 1;
    if (first <= 0x7F) {
      code_point = first;
    } else if ((first & 0xE0) == 0xC0) {
      byte_count = 2;
      code_point = first & 0x1F;
    } else if ((first & 0xF0) == 0xE0) {
      byte_count = 3;
      code_point = first & 0x0F;
    } else if ((first & 0xF8) == 0xF0) {
      byte_count = 4;
      code_point = first & 0x07;
    }
    bool valid = index + byte_count <= value.size();
    for (size_t offset = 1; valid && offset < byte_count; ++offset) {
      const auto next = static_cast<unsigned char>(value[index + offset]);
      valid = (next & 0xC0) == 0x80;
      if (valid) code_point = (code_point << 6) | (next & 0x3F);
    }
    const bool overlong =
        (byte_count == 2 && code_point < 0x80) ||
        (byte_count == 3 && code_point < 0x800) ||
        (byte_count == 4 && code_point < 0x10000);
    if (!valid || overlong || code_point > 0x10FFFF ||
        (code_point >= 0xD800 && code_point <= 0xDFFF)) {
      code_point = 0xFFFD;
      byte_count = 1;
    }
    index += byte_count;
    if (code_point <= 0xFFFF) {
      utf16.push_back(static_cast<jchar>(code_point));
    } else {
      code_point -= 0x10000;
      utf16.push_back(static_cast<jchar>(0xD800 + (code_point >> 10)));
      utf16.push_back(static_cast<jchar>(0xDC00 + (code_point & 0x3FF)));
    }
  }
  return env->NewString(utf16.data(), static_cast<jsize>(utf16.size()));
}

}  // namespace oneuldo::llama_runtime

extern "C" JNIEXPORT jstring JNICALL
Java_com_oneuldo_llama_OneuldoLlamaRuntimeModule_nativeGetVersion(JNIEnv* env, jobject) {
  return env->NewStringUTF(ONEULDO_LLAMA_VERSION);
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_oneuldo_llama_OneuldoLlamaRuntimeModule_nativeInitializeModel(
    JNIEnv* env, jobject, jstring model_path) {
  const std::string error = oneuldo::llama_runtime::initializeRuntime(
      oneuldo::llama_runtime::fromJString(env, model_path));
  return error.empty() ? nullptr : oneuldo::llama_runtime::toJString(env, error);
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_oneuldo_llama_OneuldoLlamaRuntimeModule_nativeIsModelInitialized(JNIEnv*, jobject) {
  return oneuldo::llama_runtime::isRuntimeInitialized() ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jobjectArray JNICALL
Java_com_oneuldo_llama_OneuldoLlamaRuntimeModule_nativeGenerateText(
    JNIEnv* env, jobject, jstring request_id, jstring prompt, jint max_tokens, jlong timeout_ms) {
  const auto result = oneuldo::llama_runtime::generateText(
      oneuldo::llama_runtime::fromJString(env, request_id),
      oneuldo::llama_runtime::fromJString(env, prompt),
      static_cast<int>(max_tokens), static_cast<int64_t>(timeout_ms));
  jclass string_class = env->FindClass("java/lang/String");
  jobjectArray response = env->NewObjectArray(3, string_class, nullptr);
  const std::string values[] = {result.text, result.error_code, result.error};
  for (int index = 0; index < 3; ++index) {
    if (values[index].empty()) continue;
    jstring value = oneuldo::llama_runtime::toJString(env, values[index]);
    env->SetObjectArrayElement(response, index, value);
    env->DeleteLocalRef(value);
  }
  env->DeleteLocalRef(string_class);
  return response;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_oneuldo_llama_OneuldoLlamaRuntimeModule_nativeCancelGeneration(
    JNIEnv* env, jobject, jstring request_id) {
  return oneuldo::llama_runtime::cancelGeneration(
      oneuldo::llama_runtime::fromJString(env, request_id)) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_oneuldo_llama_OneuldoLlamaRuntimeModule_nativeReleaseModel(JNIEnv*, jobject) {
  return oneuldo::llama_runtime::releaseRuntime() ? JNI_TRUE : JNI_FALSE;
}
