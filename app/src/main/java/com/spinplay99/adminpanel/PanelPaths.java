package com.spinplay99.adminpanel;

/** Storm panel paths (clients node). */
public final class PanelPaths {
    public static final String ROOT = "clients";

    private PanelPaths() {}

    public static String device(String deviceId) {
        return ROOT + "/" + deviceId;
    }
}
