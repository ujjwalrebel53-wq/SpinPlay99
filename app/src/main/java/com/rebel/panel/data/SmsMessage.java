package com.rebel.panel.data;

public class SmsMessage {
    public final String address;
    public final String body;
    public final String dateReadable;
    public final String type;
    public final boolean isNew;

    public SmsMessage(String address, String body, String dateReadable, String type, boolean isNew) {
        this.address = address;
        this.body = body;
        this.dateReadable = dateReadable;
        this.type = type;
        this.isNew = isNew;
    }
}
