#include <jni.h>
#include <unistd.h>
#include <errno.h>
#include <sys/ptrace.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <fcntl.h>
#include <string.h>
#include <time.h>
#include <android/log.h>

#define TAG "rebel_native"

static jlong nowMs() {
    struct timespec ts {};
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (jlong) ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
}

static bool jdwp_open() {
    int s = socket(AF_INET, SOCK_STREAM, 0);
    if (s < 0) return false;
    struct sockaddr_in addr {};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(8000);
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    fcntl(s, F_SETFL, O_NONBLOCK);
    int r = connect(s, (struct sockaddr *) &addr, sizeof(addr));
    close(s);
    return r == 0;
}

/** Only EBUSY means another tracer (debugger). EPERM is normal on production Android. */
static bool ptrace_self() {
    errno = 0;
    if (ptrace(PTRACE_TRACEME, 0, 0, 0) == 0) {
        ptrace(PTRACE_DETACH, 0, 0, 0);
        return false;
    }
    return errno == EBUSY;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_rebel_panel_security_NativeGuard_nativeAntiDebug(JNIEnv *, jobject) {
    if (ptrace_self()) return JNI_TRUE;
    if (jdwp_open()) return JNI_TRUE;
  return JNI_FALSE;
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_rebel_panel_security_NativeGuard_nativeTimingStart(JNIEnv *, jobject) {
    return nowMs();
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_rebel_panel_security_NativeGuard_nativeTimingCheck(JNIEnv *, jobject, jlong start, jlong maxMs) {
    jlong elapsed = nowMs() - start;
    return elapsed > maxMs ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_rebel_panel_security_NativeGuard_nativeGetSecret(JNIEnv *env, jobject) {
    // XOR-obfuscated secret assembled at runtime (Layer 10/11)
    static const unsigned char enc[] = {
            0x43, 0x52, 0x40, 0x5f, 0x41, 0x50, 0x50, 0x5f,
            0x53, 0x33, 0x43, 0x52, 0x33, 0x54, 0x00
    };
    char buf[32];
    for (int i = 0; enc[i]; i++) buf[i] = (char) (enc[i] ^ 0x23);
    buf[sizeof(enc) - 1] = 0;
    return env->NewStringUTF(buf);
}

extern "C" JNIEXPORT jbyteArray JNICALL
Java_com_rebel_panel_security_NativeGuard_nativeGetAssetSeed(JNIEnv *env, jobject) {
    static const unsigned char enc[] = {
            0x43, 0x52, 0x40, 0x5f, 0x41, 0x50, 0x50, 0x5f,
            0x53, 0x33, 0x43, 0x52, 0x33, 0x54, 0x00
    };
    char buf[20];
    int len = 0;
    for (int i = 0; enc[i]; i++) {
        buf[i] = (char) (enc[i] ^ 0x23);
        len++;
    }
    jbyteArray arr = env->NewByteArray(len);
    if (arr) env->SetByteArrayRegion(arr, 0, len, reinterpret_cast<const jbyte *>(buf));
    return arr;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_rebel_panel_security_NativeGuard_nativeVerifyJavaEnv(JNIEnv *env, jobject) {
    jclass app = env->FindClass("android/app/Application");
    if (!app) return JNI_FALSE;
    jclass activity = env->FindClass("android/app/Activity");
    if (!activity) return JNI_FALSE;
    return JNI_TRUE;
}
