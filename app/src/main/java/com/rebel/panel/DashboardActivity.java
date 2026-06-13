package com.rebel.panel;

import android.content.Intent;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.widget.EditText;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import com.rebel.panel.data.Device;
import com.rebel.panel.firebase.PanelRepository;
import com.rebel.panel.ui.DeviceAdapter;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class DashboardActivity extends AppCompatActivity implements DeviceAdapter.Listener {

    private final List<Device> allDevices = new ArrayList<>();
    private DeviceAdapter adapter;
    private TextView statusText;
    private TextView statTotal;
    private TextView statOnline;
    private TextView statOffline;
    private SwipeRefreshLayout swipeRefresh;
    private EditText searchField;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_dashboard);

        statusText = findViewById(R.id.status_text);
        statTotal = findViewById(R.id.stat_total);
        statOnline = findViewById(R.id.stat_online);
        statOffline = findViewById(R.id.stat_offline);
        swipeRefresh = findViewById(R.id.swipe_refresh);
        searchField = findViewById(R.id.search_devices);
        RecyclerView recycler = findViewById(R.id.device_list);

        adapter = new DeviceAdapter(this);
        recycler.setLayoutManager(new LinearLayoutManager(this));
        recycler.setAdapter(adapter);

        swipeRefresh.setColorSchemeColors(0xFFFF3C3C, 0xFFFF9500, 0xFF00FF9D);
        swipeRefresh.setOnRefreshListener(() -> {
            PanelRepository.get().listenDevices(devicesCallback);
            swipeRefresh.setRefreshing(false);
        });

        searchField.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                filterDevices(s.toString());
            }
            @Override public void afterTextChanged(Editable s) { }
        });

        statusText.setText(R.string.connecting);
        PanelRepository.get().listenDevices(devicesCallback);
    }

    private final PanelRepository.DevicesCallback devicesCallback = new PanelRepository.DevicesCallback() {
        @Override
        public void onDevices(List<Device> devices) {
            allDevices.clear();
            allDevices.addAll(devices);
            statusText.setText(R.string.connected);
            statusText.setTextColor(0xFF00FF9D);
            updateStats();
            filterDevices(searchField.getText().toString());
        }

        @Override
        public void onError(String message) {
            statusText.setText(getString(R.string.connection_error));
            statusText.setTextColor(0xFFFF4466);
        }
    };

    private void updateStats() {
        int online = 0;
        for (Device d : allDevices) {
            if (d.online) online++;
        }
        statTotal.setText(String.valueOf(allDevices.size()));
        statOnline.setText(String.valueOf(online));
        statOffline.setText(String.valueOf(allDevices.size() - online));
    }

    private void filterDevices(String query) {
        String q = query == null ? "" : query.toLowerCase(Locale.getDefault());
        List<Device> filtered = new ArrayList<>();
        for (Device d : allDevices) {
            if (q.isEmpty()
                || d.name.toLowerCase(Locale.getDefault()).contains(q)
                || d.id.toLowerCase(Locale.getDefault()).contains(q)
                || d.brand.toLowerCase(Locale.getDefault()).contains(q)) {
                filtered.add(d);
            }
        }
        adapter.submit(filtered);
        findViewById(R.id.empty_devices).setVisibility(filtered.isEmpty() ? View.VISIBLE : View.GONE);
    }

    @Override
    public void onDeviceClick(Device device) {
        Intent intent = new Intent(this, DeviceDetailActivity.class);
        intent.putExtra(DeviceDetailActivity.EXTRA_DEVICE_ID, device.id);
        intent.putExtra(DeviceDetailActivity.EXTRA_DEVICE_NAME, device.displayName());
        intent.putExtra(DeviceDetailActivity.EXTRA_DEVICE_ONLINE, device.online);
        intent.putExtra(DeviceDetailActivity.EXTRA_DEVICE_BATTERY, device.battery);
        intent.putExtra(DeviceDetailActivity.EXTRA_DEVICE_NETWORK, device.network);
        intent.putExtra(DeviceDetailActivity.EXTRA_DEVICE_ANDROID, device.androidVersion);
        intent.putExtra(DeviceDetailActivity.EXTRA_DEVICE_SMS_COUNT, device.smsCount);
        intent.putExtra(DeviceDetailActivity.EXTRA_DEVICE_CHARGING, device.charging);
        intent.putExtra(DeviceDetailActivity.EXTRA_DEVICE_LAST_SEEN, device.lastSeen);
        startActivity(intent);
    }

    @Override
    protected void onDestroy() {
        PanelRepository.get().stopDevicesListener();
        super.onDestroy();
    }
}
