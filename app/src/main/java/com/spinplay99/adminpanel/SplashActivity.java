package com.spinplay99.adminpanel;

import android.animation.AnimatorSet;
import android.animation.ObjectAnimator;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.view.animation.DecelerateInterpolator;
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

public class SplashActivity extends AppCompatActivity {

    private static final int SPLASH_DURATION = 2800;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Full screen
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
            View.SYSTEM_UI_FLAG_IMMERSIVE);

        setContentView(R.layout.activity_splash);

        ImageView  logo     = findViewById(R.id.splash_logo);
        TextView   appName  = findViewById(R.id.splash_app_name);
        TextView   tagline  = findViewById(R.id.splash_tagline);
        ProgressBar progress = findViewById(R.id.splash_progress);
        View       glowView  = findViewById(R.id.splash_glow);

        // Start everything invisible
        logo.setAlpha(0f);
        logo.setScaleX(0.3f);
        logo.setScaleY(0.3f);
        appName.setAlpha(0f);
        appName.setTranslationY(20f);
        tagline.setAlpha(0f);
        progress.setAlpha(0f);
        glowView.setAlpha(0f);

        // Glow fade in
        glowView.animate().alpha(1f).setDuration(600).start();

        // Logo scale + fade in
        AnimatorSet logoAnim = new AnimatorSet();
        logoAnim.playTogether(
            ObjectAnimator.ofFloat(logo, "alpha",  0f, 1f).setDuration(700),
            ObjectAnimator.ofFloat(logo, "scaleX", 0.3f, 1f).setDuration(700),
            ObjectAnimator.ofFloat(logo, "scaleY", 0.3f, 1f).setDuration(700)
        );
        logoAnim.setInterpolator(new DecelerateInterpolator(1.5f));
        logoAnim.start();

        // Logo spin once after appearing
        ObjectAnimator spin = ObjectAnimator.ofFloat(logo, "rotation", 0f, 360f);
        spin.setDuration(800);
        spin.setStartDelay(500);
        spin.setInterpolator(new AccelerateDecelerateInterpolator());
        spin.start();

        // App name slide up
        appName.animate()
            .alpha(1f).translationY(0f)
            .setStartDelay(600).setDuration(500)
            .setInterpolator(new DecelerateInterpolator())
            .start();

        // Tagline fade
        tagline.animate()
            .alpha(1f)
            .setStartDelay(900).setDuration(500)
            .start();

        // Progress bar
        progress.animate()
            .alpha(1f)
            .setStartDelay(1100).setDuration(400)
            .start();

        // Launch MainActivity
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            startActivity(new Intent(SplashActivity.this, MainActivity.class));
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
            finish();
        }, SPLASH_DURATION);
    }
}
