package com.rebel.panel.security;

import android.content.Intent;
import android.os.Bundle;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import com.rebel.panel.LoginActivity;

/**
 * Base for all post-login screens — blocks intent bypass to MainActivity.
 */
public abstract class SecureActivity extends AppCompatActivity {

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (!SessionManager.ensureValidSession(this)) {
            redirectLogin();
            return;
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (TamperDetector.isLocked()) {
            redirectLogin();
            return;
        }
        String tamper = TamperDetector.checkAll(this);
        if (tamper != null) {
            TamperDetector.wipeAndLogout(this);
            redirectLogin();
            return;
        }
        if (!SessionManager.ensureValidSession(this)) {
            SessionManager.logout(this);
            redirectLogin();
        }
    }

    protected void redirectLogin() {
        Intent i = new Intent(this, LoginActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(i);
        finish();
    }
}
