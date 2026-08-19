package com.nya.panel.security;

import java.util.Arrays;

final class MemoryWiper {
    private MemoryWiper() {
    }

    static void wipe(byte[] data) {
        if (data != null) {
            Arrays.fill(data, (byte) 0);
        }
    }
}
