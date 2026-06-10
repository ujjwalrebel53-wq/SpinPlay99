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
        if (!SecurityOrchestrator.gate(this)) {
            redirectLogin();
            return;
        }
        if (!SessionManager.ensureValidSession(this)) {
            redirectLogin();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!SecurityOrchestrator.gate(this)) {
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
