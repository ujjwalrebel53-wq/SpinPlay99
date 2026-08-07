#include <jni.h>
#include <string.h>
#include "storm_secrets.h"

static void decode_part(const unsigned char *a, unsigned int alen,
                        const unsigned char *b, unsigned int blen,
                        char *out, size_t out_max) {
    unsigned int total = alen + blen;
    if (total >= out_max) {
        out[0] = 0;
        return;
    }
    for (unsigned int i = 0; i < alen; i++) {
        out[i] = (char)(a[i] ^ kCvTable[i % kCvTable_len]);
    }
    for (unsigned int i = 0; i < blen; i++) {
        out[alen + i] = (char)(b[i] ^ kCvTable[(alen + i) % kCvTable_len]);
    }
    out[total] = 0;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_spinplay99_adminpanel_internal_CvNative_n0(JNIEnv *env, jclass, jint id) {
    char buf[512];
    memset(buf, 0, sizeof(buf));
    switch (id) {
        case 0:
            decode_part(kCv_0a, kCv_0a_len, kCv_0b, kCv_0b_len, buf, sizeof(buf));
            break;
        case 1:
            decode_part(kCv_1a, kCv_1a_len, kCv_1b, kCv_1b_len, buf, sizeof(buf));
            break;
        case 2:
            decode_part(kCv_2a, kCv_2a_len, kCv_2b, kCv_2b_len, buf, sizeof(buf));
            break;
        case 3:
            decode_part(kCv_3a, kCv_3a_len, kCv_3b, kCv_3b_len, buf, sizeof(buf));
            break;
        case 4:
            decode_part(kCv_4a, kCv_4a_len, kCv_4b, kCv_4b_len, buf, sizeof(buf));
            break;
        case 5:
            decode_part(kCv_5a, kCv_5a_len, kCv_5b, kCv_5b_len, buf, sizeof(buf));
            break;
        case 6:
            decode_part(kCv_6a, kCv_6a_len, kCv_6b, kCv_6b_len, buf, sizeof(buf));
            break;
        default:
            buf[0] = 0;
            break;
    }
    return env->NewStringUTF(buf);
}
