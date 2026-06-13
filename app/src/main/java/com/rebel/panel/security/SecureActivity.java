package com.rebel.panel.security;

import android.content.Intent;
import android.os.Bundle;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import com.rebel.panel.LoginActivity;

public abstract class SecureActivity extends AppCompatActivity {

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (!DeviceBanManager.gate(this)) {
            finish();
            return;
        }
        if (!SessionManager.hasValidLocalSession(this)) {
            redirectLoginClear();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (DeviceBanManager.isLocallyBanned(this) || DeviceBanManager.isBanScreenShowing()) {
            finish();
            return;
        }
        if (!SessionManager.hasValidLocalSession(this)) {
            redirectLoginClear();
            return;
        }
        SessionManager.ensureValidSessionSoft(this);
    }

    protected void redirectLoginClear() {
        SessionManager.logout(this);
        Intent i = new Intent(this, LoginActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(i);
        finish();
    }
}
