cmake_minimum_required(VERSION 3.22.1)
project(oneuldo_llama_runtime LANGUAGES C CXX)

if(NOT DEFINED LLAMA_SOURCE_ROOT)
  message(FATAL_ERROR "LLAMA_SOURCE_ROOT is required")
endif()

# llama.cpp는 정적 링크해 앱에서 로드할 .so를 하나로 유지한다.
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_COMMON OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TOOLS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_APP OFF CACHE BOOL "" FORCE)
set(GGML_STATIC ON CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
set(GGML_BACKEND_DL OFF CACHE BOOL "" FORCE)

add_subdirectory("${LLAMA_SOURCE_ROOT}" "${CMAKE_BINARY_DIR}/llama.cpp" EXCLUDE_FROM_ALL)

add_library(oneuldo_llama_runtime SHARED llama_runtime_bridge.cpp)
target_compile_features(oneuldo_llama_runtime PRIVATE cxx_std_17)
target_compile_definitions(oneuldo_llama_runtime PRIVATE ONEULDO_LLAMA_VERSION="llama.cpp-b10455")
target_include_directories(oneuldo_llama_runtime PRIVATE "${LLAMA_SOURCE_ROOT}/include")
target_link_libraries(oneuldo_llama_runtime PRIVATE llama android log)
target_link_options(oneuldo_llama_runtime PRIVATE "-Wl,-z,max-page-size=16384")
