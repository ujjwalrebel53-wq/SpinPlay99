package com.rebel.panel.security;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/** Layer 8 — zero sensitive strings after use. */
public final class MemoryWiper {

    private MemoryWiper() {}

    public static void wipe(char[] data) {
        if (data != null) Arrays.fill(data, '\0');
    }

    public static void wipe(byte[] data) {
        if (data != null) Arrays.fill(data, (byte) 0);
    }

    public static char[] toChars(String s) {
        return s == null ? new char[0] : s.toCharArray();
    }

    public static byte[] toBytes(String s) {
        return s == null ? new byte[0] : s.getBytes(StandardCharsets.UTF_8);
    }
}
