package com.rebel.panel.security;

/**
 * Layer 14 — lightweight bytecode VM for auth token sanity check.
 * Opcodes: LOAD, XOR, CMP, RET
 */
public final class SimpleVm {

    private static final int OP_LOAD = 1;
    private static final int OP_XOR = 2;
    private static final int OP_CMP = 3;
    private static final int OP_RET = 4;

    private SimpleVm() {}

    /** Returns true if license/auth token passes VM program. */
    public static boolean validateAuthToken(String token, String deviceFp) {
        if (token == null || token.length() < 8) return false;
        int seed = deviceFp.hashCode() ^ token.hashCode();
        byte[] prog = buildProgram(seed);
        int acc = 0;
        int pc = 0;
        while (pc < prog.length) {
            int op = prog[pc++] & 0xFF;
            switch (op) {
                case OP_LOAD:
                    acc = prog[pc++] & 0xFF;
                    break;
                case OP_XOR:
                    acc ^= (prog[pc++] & 0xFF);
                    break;
                case OP_CMP:
                    int expect = prog[pc++] & 0xFF;
                    if (acc != expect) return false;
                    break;
                case OP_RET:
                    return acc == (prog[pc] & 0xFF);
                default:
                    return false;
            }
        }
        return false;
    }

    private static byte[] buildProgram(int seed) {
        int target = (seed & 0xFF) ^ 0xA5;
        int a = target ^ 0x5A;
        return new byte[]{OP_LOAD, (byte) a, OP_XOR, 0x5A, OP_CMP, (byte) target, OP_RET, (byte) target};
    }
}
