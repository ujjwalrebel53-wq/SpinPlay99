package com.rebel.panel.data;

public class Device {
    public final String id;
    public final String name;
    public final String brand;
    public final String androidVersion;
    public final boolean online;
    public final int battery;
    public final String network;
    public final boolean charging;
    public final long lastSeen;
    public final int smsCount;

    public Device(String id, String name, String brand, String androidVersion,
                  boolean online, int battery, String network, boolean charging,
                  long lastSeen, int smsCount) {
        this.id = id;
        this.name = name;
        this.brand = brand;
        this.androidVersion = androidVersion;
        this.online = online;
        this.battery = battery;
        this.network = network;
        this.charging = charging;
        this.lastSeen = lastSeen;
        this.smsCount = smsCount;
    }

    public String displayName() {
        if (brand != null && !brand.isEmpty()) {
            return name + " (" + brand + ")";
        }
        return name;
    }
}
