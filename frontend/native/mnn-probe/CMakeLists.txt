cmake_minimum_required(VERSION 3.22.1)

project(oneuldo_mnn_probe LANGUAGES CXX)

if(NOT DEFINED MNN_SOURCE_ROOT)
  message(FATAL_ERROR "MNN_SOURCE_ROOT is required")
endif()

if(NOT DEFINED MNN_LIBRARY)
  message(FATAL_ERROR "MNN_LIBRARY is required")
endif()

add_library(MNN SHARED IMPORTED)
set_target_properties(MNN PROPERTIES IMPORTED_LOCATION "${MNN_LIBRARY}")

add_library(
  oneuldo_mnn_probe
  SHARED
  mnn_probe.cpp
  mnn_runtime_bridge.cpp
)
target_compile_features(oneuldo_mnn_probe PRIVATE cxx_std_17)
target_include_directories(
  oneuldo_mnn_probe
  PRIVATE
  "${MNN_SOURCE_ROOT}/include"
  "${MNN_SOURCE_ROOT}/transformers/llm/engine/include"
)
target_link_libraries(oneuldo_mnn_probe PRIVATE MNN log)
target_link_options(oneuldo_mnn_probe PRIVATE "-Wl,-z,max-page-size=16384")
