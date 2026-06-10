package com.rebel.panel;

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import com.rebel.panel.security.DeviceBanManager;

/**
 * Shown when APK is re-signed / tampered. No back, no bypass.
 */
public class CrackBanActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
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
    public void onBackPressed() {
        // Block escape
    }

}
