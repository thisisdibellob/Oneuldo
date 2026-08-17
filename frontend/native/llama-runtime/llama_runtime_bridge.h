#pragma once

#include <cstdint>
#include <string>

namespace oneuldo::llama_runtime {

struct GenerationResult {
  bool success;
  std::string text;
  std::string error_code;
  std::string error;
};

std::string initializeRuntime(const std::string& model_path);
bool isRuntimeInitialized();
GenerationResult generateText(
    const std::string& request_id,
    const std::string& prompt,
    int max_tokens,
    int64_t timeout_ms);
bool cancelGeneration(const std::string& request_id);
bool releaseRuntime();

}  // namespace oneuldo::llama_runtime
