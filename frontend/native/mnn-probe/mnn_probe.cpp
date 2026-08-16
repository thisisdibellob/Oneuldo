#include <jni.h>

#include <MNN/Interpreter.hpp>

namespace {
jstring getRuntimeVersion(JNIEnv* env) {
  return env->NewStringUTF(MNN::getVersion());
}
}  // namespace

extern "C" JNIEXPORT jstring JNICALL
Java_com_oneuldo_mnn_OneuldoMnnRuntimeModule_nativeGetVersion(
    JNIEnv* env,
    jobject) {
  return getRuntimeVersion(env);
}
