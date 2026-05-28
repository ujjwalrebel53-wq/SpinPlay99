package com.spinplay99.adminpanel;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

public class SplashActivity extends AppCompatActivity {

    private static final long SPLASH_MS = 1200;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN);
        setContentView(R.layout.activity_splash);

        ImageView logo = findViewById(R.id.splash_logo);
        TextView appName = findViewById(R.id.splash_app_name);
        TextView tagline = findViewById(R.id.splash_tagline);
        ProgressBar progress = findViewById(R.id.splash_progress);
        View glow = findViewById(R.id.splash_glow);

        logo.setAlpha(0f);
        logo.setScaleX(0.85f);
        logo.setScaleY(0.85f);
        appName.setAlpha(0f);
        tagline.setAlpha(0f);
        progress.setAlpha(0f);
        glow.setAlpha(0f);

        logo.post(() -> {
            glow.animate().alpha(1f).setDuration(250).start();
            logo.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(350).start();
            appName.animate().alpha(1f).setDuration(300).setStartDelay(150).start();
            tagline.animate().alpha(1f).setDuration(250).setStartDelay(250).start();
            progress.animate().alpha(1f).setDuration(200).setStartDelay(300).start();
        });

        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            startActivity(new Intent(SplashActivity.this, MainActivity.class));
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
            finish();
        }, SPLASH_MS);
    }
}
