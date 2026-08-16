#pragma once

#include <cstdint>
#include <string>

namespace oneuldo::mnn {

struct InitializationResult {
  bool success;
  bool already_initialized;
  std::string error;
};

struct GenerationResult {
  bool success;
  std::string text;
  std::string error_code;
  std::string error;
};

InitializationResult initializeRuntime(
    const std::string& config_path,
    const std::string& temporary_path);
bool isRuntimeInitialized();
GenerationResult generateText(
    const std::string& request_id,
    const std::string& prompt,
    int max_tokens,
    int64_t timeout_ms);
bool cancelGeneration(const std::string& request_id);
bool releaseRuntime();

}  // namespace oneuldo::mnn
