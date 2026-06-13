package com.rebel.panel;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

public class LoginActivity extends AppCompatActivity {

    private static final String PREFS = "rebel_panel_prefs";
    private static final String KEY_USER = "user";
    private static final String KEY_PASS = "pass";
    private static final String USER = "admin";
    private static final String PASS = "rebel2024";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_login);

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        EditText userField = findViewById(R.id.login_user);
        EditText passField = findViewById(R.id.login_pass);
        CheckBox remember = findViewById(R.id.remember_me);
        TextView error = findViewById(R.id.login_error);
        Button loginBtn = findViewById(R.id.login_btn);

        String savedUser = prefs.getString(KEY_USER, "");
        if (!savedUser.isEmpty()) {
            userField.setText(savedUser);
            passField.setText(prefs.getString(KEY_PASS, ""));
            remember.setChecked(true);
            if (USER.equals(savedUser) && PASS.equals(prefs.getString(KEY_PASS, ""))) {
                openDashboard();
                return;
            }
        }

        loginBtn.setOnClickListener(v -> {
            String u = userField.getText().toString().trim();
            String p = passField.getText().toString();
            if (USER.equals(u) && PASS.equals(p)) {
                error.setVisibility(View.GONE);
                if (remember.isChecked()) {
                    prefs.edit().putString(KEY_USER, u).putString(KEY_PASS, p).apply();
                } else {
                    prefs.edit().remove(KEY_USER).remove(KEY_PASS).apply();
                }
                openDashboard();
            } else {
                error.setVisibility(View.VISIBLE);
                passField.setText("");
                Toast.makeText(this, R.string.login_failed, Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void openDashboard() {
        startActivity(new Intent(this, DashboardActivity.class));
        finish();
    }
}
