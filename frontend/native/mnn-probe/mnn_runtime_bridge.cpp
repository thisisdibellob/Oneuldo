#include "mnn_runtime_bridge.h"

#include <jni.h>

#include <atomic>
#include <chrono>
#include <memory>
#include <mutex>
#include <sstream>
#include <string>
#include <vector>

#include <llm/llm.hpp>

namespace oneuldo::mnn {
namespace {

using MNN::Transformer::Llm;

struct LlmDeleter {
  void operator()(Llm* llm) const {
    if (llm != nullptr) {
      Llm::destroy(llm);
    }
  }
};

std::mutex runtime_mutex;
std::mutex generation_state_mutex;
std::unique_ptr<Llm, LlmDeleter> runtime;
std::string active_request_id;
std::atomic<bool> cancel_requested{false};

class ActiveRequestGuard {
 public:
  ~ActiveRequestGuard() {
    std::lock_guard<std::mutex> lock(generation_state_mutex);
    active_request_id.clear();
    cancel_requested.store(false);
  }
};

std::string escapeJsonString(const std::string& value) {
  std::string escaped;
  escaped.reserve(value.size());
  for (const char character : value) {
    switch (character) {
      case '\\': escaped += "\\\\"; break;
      case '"': escaped += "\\\""; break;
      case '\n': escaped += "\\n"; break;
      case '\r': escaped += "\\r"; break;
      case '\t': escaped += "\\t"; break;
      default: escaped += character; break;
    }
  }
  return escaped;
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

std::string fromJString(JNIEnv* env, jstring value) {
  if (value == nullptr) {
    return {};
  }
  const jsize length = env->GetStringLength(value);
  const jchar* characters = env->GetStringChars(value, nullptr);
  if (characters == nullptr) {
    return {};
  }

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
      if (valid) {
        code_point = (code_point << 6) | (next & 0x3F);
      }
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

}  // namespace

InitializationResult initializeRuntime(
    const std::string& config_path,
    const std::string& temporary_path) {
  std::lock_guard<std::mutex> lock(runtime_mutex);
  if (runtime != nullptr) {
    return {true, true, {}};
  }

  std::unique_ptr<Llm, LlmDeleter> candidate(Llm::createLLM(config_path));
  if (candidate == nullptr) {
    return {false, false, "MNN LLM 객체를 생성하지 못했습니다."};
  }

  const std::string runtime_config =
      "{\"async\":false,\"tmp_path\":\"" +
      escapeJsonString(temporary_path) + "\"}";
  if (!candidate->set_config(runtime_config)) {
    return {false, false, "MNN 실행 설정을 적용하지 못했습니다."};
  }

  // load가 끝까지 성공한 객체만 전역 런타임으로 승격한다.
  if (!candidate->load()) {
    std::string native_log = candidate->getLog();
    if (native_log.empty()) {
      native_log = "MNN이 모델 파일을 불러오지 못했습니다.";
    }
    return {false, false, native_log};
  }

  runtime = std::move(candidate);
  return {true, false, {}};
}

bool isRuntimeInitialized() {
  std::lock_guard<std::mutex> lock(runtime_mutex);
  return runtime != nullptr;
}

void resetGenerationState() {
  if (runtime == nullptr) {
    return;
  }
  runtime->reset();
  // MNN의 TIMEOUT/CANCEL 상태도 다음 요청 전에 RUNNING으로 되돌린다.
  runtime->generate_init(nullptr, nullptr);
}

GenerationResult generateText(
    const std::string& request_id,
    const std::string& prompt,
    int max_tokens,
    int64_t timeout_ms) {
  {
    std::lock_guard<std::mutex> state_lock(generation_state_mutex);
    if (!active_request_id.empty()) {
      return {false, {}, "BUSY", "다른 생성 요청이 실행 중입니다."};
    }
    active_request_id = request_id;
    cancel_requested.store(false);
  }
  ActiveRequestGuard request_guard;

  std::lock_guard<std::mutex> runtime_lock(runtime_mutex);
  if (runtime == nullptr) {
    return {false, {}, "NOT_INITIALIZED", "모델이 초기화되지 않았습니다."};
  }

  // 각 요청이 이전 테스트 문맥을 이어받지 않도록 KV cache를 비운다.
  runtime->reset();
  if (!runtime->set_config("{\"timeout_ms\":" + std::to_string(timeout_ms) + "}")) {
    return {false, {}, "GENERATION_FAILED", "MNN timeout 설정을 적용하지 못했습니다."};
  }

  std::ostringstream output;
  const auto started_at = std::chrono::steady_clock::now();
  // prefill 뒤 한 토큰씩 생성해 요청 사이에서 취소와 timeout을 확인한다.
  runtime->response(prompt, &output, nullptr, 0);

  for (int token_index = 0; token_index < max_tokens; ++token_index) {
    if (cancel_requested.load()) {
      resetGenerationState();
      return {false, {}, "CANCELLED", "생성 요청이 취소되었습니다."};
    }
    const auto elapsed_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::steady_clock::now() - started_at).count();
    if (timeout_ms > 0 && elapsed_ms >= timeout_ms) {
      resetGenerationState();
      return {false, {}, "TIMEOUT", "텍스트 생성 시간이 제한을 초과했습니다."};
    }
    if (runtime->stoped()) {
      break;
    }
    runtime->generate(1);
    const auto* token_context = runtime->getContext();
    if (token_context != nullptr &&
        token_context->status == MNN::Transformer::LlmStatus::TIMEOUT) {
      resetGenerationState();
      return {false, {}, "TIMEOUT", "텍스트 생성 시간이 제한을 초과했습니다."};
    }
  }

  const auto* context = runtime->getContext();
  if (context == nullptr || context->status == MNN::Transformer::LlmStatus::INTERNAL_ERROR) {
    std::string native_log = runtime->getLog();
    if (native_log.empty()) {
      native_log = "MNN 텍스트 생성에 실패했습니다.";
    }
    resetGenerationState();
    return {false, {}, "GENERATION_FAILED", native_log};
  }

  const std::string generated_text = output.str();
  if (generated_text.empty()) {
    return {false, {}, "GENERATION_FAILED", "MNN이 빈 생성 결과를 반환했습니다."};
  }
  return {true, generated_text, {}, {}};
}

bool cancelGeneration(const std::string& request_id) {
  std::lock_guard<std::mutex> lock(generation_state_mutex);
  if (active_request_id != request_id) {
    return false;
  }
  // 생성 스레드는 다음 토큰 경계에서 이 값을 확인한다.
  cancel_requested.store(true);
  return true;
}

bool releaseRuntime() {
  cancel_requested.store(true);
  std::lock_guard<std::mutex> runtime_lock(runtime_mutex);
  const bool released = runtime != nullptr;
  runtime.reset();
  return released;
}

}  // namespace oneuldo::mnn

extern "C" JNIEXPORT jstring JNICALL
Java_com_oneuldo_mnn_OneuldoMnnRuntimeModule_nativeInitializeModel(
    JNIEnv* env,
    jobject,
    jstring config_path,
    jstring temporary_path) {
  const auto result = oneuldo::mnn::initializeRuntime(
      oneuldo::mnn::fromJString(env, config_path),
      oneuldo::mnn::fromJString(env, temporary_path));
  if (result.success) {
    return nullptr;
  }
  return oneuldo::mnn::toJString(env, result.error);
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_oneuldo_mnn_OneuldoMnnRuntimeModule_nativeIsModelInitialized(
    JNIEnv*,
    jobject) {
  return oneuldo::mnn::isRuntimeInitialized() ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jobjectArray JNICALL
Java_com_oneuldo_mnn_OneuldoMnnRuntimeModule_nativeGenerateText(
    JNIEnv* env,
    jobject,
    jstring request_id,
    jstring prompt,
    jint max_tokens,
    jlong timeout_ms) {
  const auto result = oneuldo::mnn::generateText(
      oneuldo::mnn::fromJString(env, request_id),
      oneuldo::mnn::fromJString(env, prompt),
      static_cast<int>(max_tokens),
      static_cast<int64_t>(timeout_ms));

  jclass string_class = env->FindClass("java/lang/String");
  jobjectArray response = env->NewObjectArray(3, string_class, nullptr);
  // 배열 순서는 결과, 오류 코드, 오류 메시지로 고정한다.
  const std::string values[] = {result.text, result.error_code, result.error};
  for (int index = 0; index < 3; ++index) {
    if (values[index].empty()) {
      continue;
    }
    jstring java_value = oneuldo::mnn::toJString(env, values[index]);
    env->SetObjectArrayElement(response, index, java_value);
    env->DeleteLocalRef(java_value);
  }
  env->DeleteLocalRef(string_class);
  return response;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_oneuldo_mnn_OneuldoMnnRuntimeModule_nativeCancelGeneration(
    JNIEnv* env,
    jobject,
    jstring request_id) {
  return oneuldo::mnn::cancelGeneration(oneuldo::mnn::fromJString(env, request_id))
      ? JNI_TRUE
      : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_oneuldo_mnn_OneuldoMnnRuntimeModule_nativeReleaseModel(
    JNIEnv*,
    jobject) {
  return oneuldo::mnn::releaseRuntime() ? JNI_TRUE : JNI_FALSE;
}
