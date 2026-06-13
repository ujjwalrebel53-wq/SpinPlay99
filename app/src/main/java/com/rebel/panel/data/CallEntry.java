package com.rebel.panel.data;

public class CallEntry {
    public final String number;
    public final String contactName;
    public final String dateReadable;
    public final String duration;
    public final String type;

    public CallEntry(String number, String contactName, String dateReadable, String duration, String type) {
        this.number = number;
        this.contactName = contactName;
        this.dateReadable = dateReadable;
        this.duration = duration;
        this.type = type;
    }
}
