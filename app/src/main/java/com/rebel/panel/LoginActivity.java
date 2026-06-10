package com.rebel.panel;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.CountDownTimer;
import android.os.Handler;
import android.os.Looper;
import android.text.InputFilter;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;

import com.rebel.panel.security.BruteForceGuard;
import com.rebel.panel.security.KeyValidator;
import com.rebel.panel.security.SessionManager;
import com.rebel.panel.security.TamperDetector;

/**
 * LAUNCHER — FLAG_SECURE, full environment gate before MainActivity.
 * Prevents: screenshot key theft, intent bypass, resumed session hijack.
 */
public class LoginActivity extends AppCompatActivity {

    private EditText keyInput;
    private TextView errorText;
    private TextView lockText;
    private Button loginBtn;
    private CountDownTimer lockTimer;
    private final Handler handler = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(0xFF050508);
            getWindow().setNavigationBarColor(0xFF050508);
        }
        setContentView(R.layout.activity_login);

        keyInput = findViewById(R.id.login_key);
        errorText = findViewById(R.id.login_error);
        lockText = findViewById(R.id.login_lock);
        loginBtn = findViewById(R.id.login_submit);

        keyInput.setFilters(new InputFilter[]{
                (source, start, end, dest, dstart, dend) -> {
                    String out = source.toString().toUpperCase().replaceAll("[^A-Z0-9\\-]", "");
                    return out.equals(source.toString()) ? null : out;
                }
        });

        loginBtn.setOnClickListener(v -> attemptLogin());

        if (SessionManager.hasValidLocalSession(this) && TamperDetector.isEnvironmentSafe(this)) {
            openMain();
            return;
        }
        updateLockUi();
    }

    @Override
    protected void onResume() {
        super.onResume();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);

        if (TamperDetector.isLocked()) {
            showSessionExpired(TamperDetector.lockRemainingMs());
            blockInput(TamperDetector.lockRemainingMs());
            return;
        }

        String tamper = TamperDetector.checkAll(this);
        if (tamper != null) {
            TamperDetector.wipeAndLogout(this);
            showSessionExpired(TamperDetector.LOCK_SECONDS * 1000L);
            blockInput(TamperDetector.LOCK_SECONDS * 1000L);
            return;
        }

        String jwt = com.rebel.panel.security.SecurityPrefs.getAccessJwt(this);
        if (!jwt.isEmpty()) {
            if (!SessionManager.ensureValidSession(this)) {
                SessionManager.logout(this);
                showSessionExpired(30_000L);
                blockInput(30_000L);
                return;
            }
            openMain();
            return;
        }
        updateLockUi();
    }

    @Override
    protected void onDestroy() {
        if (lockTimer != null) lockTimer.cancel();
        super.onDestroy();
    }

    private void attemptLogin() {
        errorText.setVisibility(View.GONE);
        if (BruteForceGuard.isPermanentlyLocked(this)) {
            showSessionExpired(0);
            return;
        }
        if (BruteForceGuard.isLocked(this) || TamperDetector.isLocked()) {
            updateLockUi();
            return;
        }
        if (!TamperDetector.isEnvironmentSafe(this)) {
            TamperDetector.wipeAndLogout(this);
            showSessionExpired(TamperDetector.LOCK_SECONDS * 1000L);
            blockInput(TamperDetector.LOCK_SECONDS * 1000L);
            return;
        }

        String key = keyInput.getText().toString().trim();
        if (key.isEmpty()) {
            errorText.setText("Enter access key");
            errorText.setVisibility(View.VISIBLE);
            return;
        }

        loginBtn.setEnabled(false);
        new Thread(() -> {
            KeyValidator.Result r = KeyValidator.login(LoginActivity.this, key);
            handler.post(() -> {
                loginBtn.setEnabled(true);
                keyInput.setText("");
                if (r.ok) {
                    openMain();
                } else {
                    errorText.setText("Session expired".equals(r.error) ? r.error : r.error);
                    errorText.setVisibility(View.VISIBLE);
                    updateLockUi();
                }
            });
        }).start();
    }

    private void openMain() {
        startActivity(new Intent(this, MainActivity.class));
        finish();
    }

    private void showSessionExpired(long lockMs) {
        errorText.setText("Session expired");
        errorText.setVisibility(View.VISIBLE);
        if (lockMs > 0) blockInput(lockMs);
    }

    private void updateLockUi() {
        long ms = Math.max(BruteForceGuard.lockRemainingMs(this), TamperDetector.lockRemainingMs());
        if (BruteForceGuard.isPermanentlyLocked(this)) {
            lockText.setText("Device locked. Contact admin.");
            lockText.setVisibility(View.VISIBLE);
            loginBtn.setEnabled(false);
            keyInput.setEnabled(false);
            return;
        }
        if (ms > 0) {
            blockInput(ms);
        } else {
            lockText.setVisibility(View.GONE);
            loginBtn.setEnabled(true);
            keyInput.setEnabled(true);
        }
    }

    private void blockInput(long ms) {
        loginBtn.setEnabled(false);
        keyInput.setEnabled(false);
        lockText.setVisibility(View.VISIBLE);
        if (lockTimer != null) lockTimer.cancel();
        lockTimer = new CountDownTimer(ms, 1000) {
            @Override
            public void onTick(long left) {
                lockText.setText("Try again in " + (left / 1000) + "s");
            }

            @Override
            public void onFinish() {
                if (!BruteForceGuard.isPermanentlyLocked(LoginActivity.this)) {
                    loginBtn.setEnabled(true);
                    keyInput.setEnabled(true);
                    lockText.setVisibility(View.GONE);
                }
            }
        }.start();
    }
}
