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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Full screen - status bar hide karo
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
        logo.setAlpha(0f);
        logo.setScaleX(0.2f);
        logo.setScaleY(0.2f);
        appName.setAlpha(0f);
        appName.setTranslationY(30f);
        tagline.setAlpha(0f);
        progress.setAlpha(0f);
        glow.setAlpha(0f);

        // Wait for first frame draw then start animations
        logo.post(new Runnable() {
            @Override
            public void run() {
                startAnimations(logo, appName, tagline, progress, glow);
            }
        });
    }

    private void startAnimations(final ImageView logo, final TextView appName,
                                  final TextView tagline, final ProgressBar progress,
                                  final View glow) {

        // 1. Glow fade in (0ms)
        glow.animate()
            .alpha(1f)
            .setDuration(500)
            .start();

        // 2. Logo scale up + fade in (0ms)
        logo.animate()
            .alpha(1f)
            .scaleX(1f)
            .scaleY(1f)
            .setDuration(600)
            .withEndAction(new Runnable() {
                @Override
                public void run() {
                    // 3. Logo spin after appearing
                    logo.animate()
                        .rotationBy(360f)
                        .setDuration(700)
                        .setInterpolator(new android.view.animation.AccelerateDecelerateInterpolator())
                        .start();
                }
            })
            .start();

        // 4. App name slide up (delayed)
        appName.animate()
            .alpha(1f)
            .translationY(0f)
            .setDuration(500)
            .setStartDelay(500)
            .start();

        // 5. Tagline fade in
        tagline.animate()
            .alpha(1f)
            .setDuration(400)
            .setStartDelay(800)
            .start();

        // 6. Progress bar appear
        progress.animate()
            .alpha(1f)
            .setDuration(300)
            .setStartDelay(1000)
            .start();

        // 7. Launch MainActivity after 2.8 seconds
        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override
            public void run() {
                Intent intent = new Intent(SplashActivity.this, MainActivity.class);
                startActivity(intent);
                overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
                finish();
            }
        }, 2800);
    }
}
