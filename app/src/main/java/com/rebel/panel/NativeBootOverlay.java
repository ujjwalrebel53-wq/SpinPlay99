package com.rebel.panel;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.LinearInterpolator;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

/**
 * GPU-only native boot splash — runs at display refresh rate while WebView loads underneath.
 */
public final class NativeBootOverlay {

    public interface OnFinishListener {
        void onBootOverlayFinished();
    }

    public static final long BOOT_DURATION_MS = 1500L;

    private static final String[] STATUSES = {
            "INITIALIZING", "VERIFYING", "SECURE CHANNEL", "READY"
    };

    private final View root;
    private final View bootRing;
    private final View bootOrb1;
    private final View bootOrb2;
    private final ProgressBar bootProgress;
    private final TextView bootStatus;
    private final TextView bootPct;
    private ValueAnimator progressAnimator;
    private ObjectAnimator ringSpin;
    private boolean finished;

    public NativeBootOverlay(AppCompatActivity activity, FrameLayout container) {
        root = LayoutInflater.from(activity).inflate(R.layout.native_boot_overlay, container, false);
        container.addView(root);
        bootRing = root.findViewById(R.id.bootRing);
        bootOrb1 = root.findViewById(R.id.bootOrb1);
        bootOrb2 = root.findViewById(R.id.bootOrb2);
        bootProgress = root.findViewById(R.id.bootProgress);
        bootStatus = root.findViewById(R.id.bootStatus);
        bootPct = root.findViewById(R.id.bootPct);

        View avatar = root.findViewById(R.id.bootAvatar);
        avatar.setScaleX(0.88f);
        avatar.setScaleY(0.88f);
        avatar.animate().scaleX(1f).scaleY(1f).setDuration(500).start();
    }

    public void start(OnFinishListener listener) {
        root.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        ringSpin = ObjectAnimator.ofFloat(bootRing, View.ROTATION, 0f, 360f);
        ringSpin.setDuration(2800);
        ringSpin.setInterpolator(new LinearInterpolator());
        ringSpin.setRepeatCount(ValueAnimator.INFINITE);
        ringSpin.start();

        orbFloat(bootOrb1, -14f, 2200);
        orbFloat(bootOrb2, 12f, 2600);

        progressAnimator = ValueAnimator.ofInt(0, 100);
        progressAnimator.setDuration(BOOT_DURATION_MS);
        progressAnimator.setInterpolator(new LinearInterpolator());
        progressAnimator.addUpdateListener(a -> {
            int p = (int) a.getAnimatedValue();
            bootProgress.setProgress(p);
            bootPct.setText(p + "%");
            int idx = Math.min(STATUSES.length - 1, (p * STATUSES.length) / 100);
            bootStatus.setText(STATUSES[idx]);
        });
        progressAnimator.addListener(new AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(Animator animation) {
                dismiss(listener);
            }
        });
        progressAnimator.start();
    }

    private void orbFloat(View v, float dy, long dur) {
        ObjectAnimator anim = ObjectAnimator.ofFloat(v, View.TRANSLATION_Y, 0f, dy, 0f);
        anim.setDuration(dur);
        anim.setRepeatCount(ValueAnimator.INFINITE);
        anim.start();
    }

    public void dismiss(OnFinishListener listener) {
        if (finished) return;
        finished = true;
        if (progressAnimator != null) {
            progressAnimator.cancel();
        }
        if (ringSpin != null) {
            ringSpin.cancel();
        }
        root.animate()
                .alpha(0f)
                .setDuration(260)
                .withEndAction(() -> {
                    ViewGroup parent = (ViewGroup) root.getParent();
                    if (parent != null) {
                        parent.removeView(root);
                    }
                    if (listener != null) {
                        listener.onBootOverlayFinished();
                    }
                })
                .start();
    }

    public void cancel() {
        if (progressAnimator != null) {
            progressAnimator.cancel();
        }
        if (ringSpin != null) {
            ringSpin.cancel();
        }
    }
}
