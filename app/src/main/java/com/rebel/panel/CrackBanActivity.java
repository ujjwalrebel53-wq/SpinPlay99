package com.rebel.panel;

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import com.rebel.panel.security.DeviceBanManager;

/**
 * Stable full-screen ban — single instance, no back, blocks LoginActivity relaunch loop.
 */
public class CrackBanActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        DeviceBanManager.setBanScreenShowing(true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(0xFF1A0000);
            getWindow().setNavigationBarColor(0xFF1A0000);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(R.layout.activity_crack_ban);

        TextView msg = findViewById(R.id.crack_ban_message);
        msg.setText(DeviceBanManager.MSG_CRACK_BAN);
    }

    @Override
    protected void onResume() {
        super.onResume();
        DeviceBanManager.setBanScreenShowing(true);
    }

    @Override
    protected void onDestroy() {
        if (isFinishing()) {
            DeviceBanManager.setBanScreenShowing(false);
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        // Block escape
    }
}
