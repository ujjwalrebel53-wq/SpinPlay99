package com.spinplay99.adminpanel;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

public class SplashActivity extends AppCompatActivity {

    @SuppressLint("BatteryLife")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN);

        setContentView(R.layout.activity_splash);

        final ImageView   logo     = findViewById(R.id.splash_logo);
        final TextView    appName  = findViewById(R.id.splash_app_name);
        final TextView    tagline  = findViewById(R.id.splash_tagline);
        final ProgressBar progress = findViewById(R.id.splash_progress);
        final View        glow     = findViewById(R.id.splash_glow);

        // Start invisible
        logo.setAlpha(0f);     logo.setScaleX(0.2f); logo.setScaleY(0.2f);
        appName.setAlpha(0f);  appName.setTranslationY(30f);
        tagline.setAlpha(0f);  progress.setAlpha(0f); glow.setAlpha(0f);

        // Wait for first frame then animate
        logo.post(() -> startAnimations(logo, appName, tagline, progress, glow));

        // Request battery optimization exemption (critical for staying online)
        requestBatteryExemption();
    }

    private void startAnimations(ImageView logo, TextView appName,
                                  TextView tagline, ProgressBar progress, View glow) {
        // 1. Glow
        glow.animate().alpha(1f).setDuration(500).start();

        // 2. Logo scale + fade
        logo.animate()
            .alpha(1f).scaleX(1f).scaleY(1f)
            .setDuration(600)
            .withEndAction(() ->
                // 3. Spin after appearing
                logo.animate()
                    .rotationBy(360f)
                    .setDuration(700)
                    .setInterpolator(new android.view.animation.AccelerateDecelerateInterpolator())
                    .start())
            .start();

        // 4. App name
        appName.animate().alpha(1f).translationY(0f)
            .setDuration(500).setStartDelay(500).start();

        // 5. Tagline
        tagline.animate().alpha(1f)
            .setDuration(400).setStartDelay(800).start();

        // 6. Progress bar
        progress.animate().alpha(1f)
            .setDuration(300).setStartDelay(1000).start();

        // 7. Launch MainActivity
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            startActivity(new Intent(SplashActivity.this, MainActivity.class));
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
            finish();
        }, 2800);
    }

    /**
     * Asks the user to exempt this app from battery optimization.
     * Without this, Android Doze mode ignores WakeLocks and kills the service,
     * causing Firebase to disconnect after ~5 minutes.
     * This system dialog appears once and is remembered permanently.
     */
    @SuppressLint("BatteryLife")
    private void requestBatteryExemption() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            String pkg = getPackageName();
            if (pm != null && !pm.isIgnoringBatteryOptimizations(pkg)) {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + pkg));
                startActivity(intent);
            }
        } catch (Exception ignored) {}
    }
}
