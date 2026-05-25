package com.spinplay99.adminpanel;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.SharedPreferences;
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

        logo.setAlpha(0f);    logo.setScaleX(0.2f); logo.setScaleY(0.2f);
        appName.setAlpha(0f); appName.setTranslationY(30f);
        tagline.setAlpha(0f); progress.setAlpha(0f); glow.setAlpha(0f);

        logo.post(() -> startAnimations(logo, appName, tagline, progress, glow));

        // Ask for battery exemption ONLY ONCE ever
        askBatteryExemptionOnce();
    }

    private void startAnimations(ImageView logo, TextView appName,
                                  TextView tagline, ProgressBar progress, View glow) {
        glow.animate().alpha(1f).setDuration(500).start();
        logo.animate()
            .alpha(1f).scaleX(1f).scaleY(1f).setDuration(600)
            .withEndAction(() ->
                logo.animate().rotationBy(360f).setDuration(700)
                    .setInterpolator(new android.view.animation.AccelerateDecelerateInterpolator())
                    .start())
            .start();
        appName.animate().alpha(1f).translationY(0f).setDuration(500).setStartDelay(500).start();
        tagline.animate().alpha(1f).setDuration(400).setStartDelay(800).start();
        progress.animate().alpha(1f).setDuration(300).setStartDelay(1000).start();

        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            startActivity(new Intent(SplashActivity.this, MainActivity.class));
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
            finish();
        }, 2800);
    }

    /**
     * Shows battery optimization exemption dialog EXACTLY ONCE.
     * After first ask, never shown again regardless of user choice.
     */
    @SuppressLint("BatteryLife")
    private void askBatteryExemptionOnce() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        SharedPreferences prefs = getSharedPreferences("SpinPlayPrefs", MODE_PRIVATE);
        // If already asked before, skip
        if (prefs.getBoolean("battery_asked", false)) return;
        // Mark as asked so we never ask again
        prefs.edit().putBoolean("battery_asked", true).apply();
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                i.setData(Uri.parse("package:" + getPackageName()));
                startActivity(i);
            }
        } catch (Exception ignored) {}
    }
}
