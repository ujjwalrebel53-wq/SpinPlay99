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
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

public class SplashActivity extends AppCompatActivity {

    private static final int SPLASH_DURATION = 2500;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);

        setContentView(R.layout.activity_splash);

        ImageView logo      = findViewById(R.id.splash_logo);
        TextView  appName   = findViewById(R.id.splash_app_name);
        TextView  tagline   = findViewById(R.id.splash_tagline);
        ProgressBar progress = findViewById(R.id.splash_progress);

        // Logo scale-in + fade-in
        logo.setAlpha(0f);
        logo.setScaleX(0.5f);
        logo.setScaleY(0.5f);

        ObjectAnimator fadeIn  = ObjectAnimator.ofFloat(logo, "alpha", 0f, 1f);
        ObjectAnimator scaleX  = ObjectAnimator.ofFloat(logo, "scaleX", 0.5f, 1f);
        ObjectAnimator scaleY  = ObjectAnimator.ofFloat(logo, "scaleY", 0.5f, 1f);
        fadeIn.setDuration(700);
        scaleX.setDuration(700);
        scaleY.setDuration(700);
        fadeIn.setInterpolator(new AccelerateDecelerateInterpolator());
        scaleX.setInterpolator(new AccelerateDecelerateInterpolator());
        scaleY.setInterpolator(new AccelerateDecelerateInterpolator());

        AnimatorSet logoAnim = new AnimatorSet();
        logoAnim.playTogether(fadeIn, scaleX, scaleY);
        logoAnim.start();

        // Text fade in (delayed)
        appName.setAlpha(0f);
        tagline.setAlpha(0f);
        appName.animate().alpha(1f).setStartDelay(600).setDuration(500).start();
        tagline.animate().alpha(1f).setStartDelay(900).setDuration(500).start();

        // Progress bar pulse
        progress.setAlpha(0f);
        progress.animate().alpha(1f).setStartDelay(1000).setDuration(400).start();

        // Rotate logo gently
        ObjectAnimator rotateAnim = ObjectAnimator.ofFloat(logo, "rotation", 0f, 15f, -10f, 8f, 0f);
        rotateAnim.setDuration(1800);
        rotateAnim.setStartDelay(700);
        rotateAnim.setInterpolator(new AccelerateDecelerateInterpolator());
        rotateAnim.start();

        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            Intent intent = new Intent(SplashActivity.this, MainActivity.class);
            startActivity(intent);
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
            finish();
        }, SPLASH_DURATION);
    }
}
