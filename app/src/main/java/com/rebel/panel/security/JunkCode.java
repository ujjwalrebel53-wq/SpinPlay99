package com.rebel.panel.security;

/** Layer 17 — junk methods to confuse decompilers. */
@SuppressWarnings("unused")
public final class JunkCode {

    private JunkCode() {}

    public static int junkAlpha(int a, int b) {
        int x = a ^ b;
        for (int i = 0; i < 7; i++) x = (x << 1) | (x >>> 31);
        return x * 0x9E3779B9;
    }

    public static String junkBeta(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = s.length() - 1; i >= 0; i--) sb.append((char) (s.charAt(i) ^ 0x2A));
        return sb.toString();
    }
}
