package com.rebel.panel.fragments;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.rebel.panel.R;
import com.rebel.panel.firebase.PanelRepository;
import com.rebel.panel.ui.KeyValueAdapter;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class ForwardingTabFragment extends DeviceTabFragment {

    public static ForwardingTabFragment newInstance(String deviceId) {
        ForwardingTabFragment f = new ForwardingTabFragment();
        Bundle b = new Bundle();
        b.putString(ARG_DEVICE_ID, deviceId);
        f.setArguments(b);
        return f;
    }

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container,
                             @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_forwarding, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        CheckBox enabled = view.findViewById(R.id.fw_enabled);
        EditText number = view.findViewById(R.id.fw_number);
        CheckBox forwardAll = view.findViewById(R.id.fw_all);
        EditText filters = view.findViewById(R.id.fw_filters);
        LinearLayout filterBox = view.findViewById(R.id.fw_filter_box);
        Button save = view.findViewById(R.id.fw_save);
        RecyclerView history = view.findViewById(R.id.fw_history);
        KeyValueAdapter adapter = new KeyValueAdapter();
        history.setLayoutManager(new LinearLayoutManager(getContext()));
        history.setAdapter(adapter);

        forwardAll.setOnCheckedChangeListener((b, checked) ->
            filterBox.setVisibility(checked ? View.GONE : View.VISIBLE));

        PanelRepository.get().listenForwarding(deviceId, (en, forwardTo, all, filterList) -> {
            if (!isAdded()) return;
            enabled.setChecked(en);
            number.setText(forwardTo);
            forwardAll.setChecked(all);
            if (filterList != null && !filterList.isEmpty()) {
                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < filterList.size(); i++) {
                    if (i > 0) sb.append(", ");
                    sb.append(filterList.get(i));
                }
                filters.setText(sb.toString());
            }
            filterBox.setVisibility(all ? View.GONE : View.VISIBLE);
        });

        save.setOnClickListener(v -> {
            List<String> filterList = new ArrayList<>();
            if (!forwardAll.isChecked()) {
                String raw = filters.getText().toString();
                if (!raw.trim().isEmpty()) {
                    filterList.addAll(Arrays.asList(raw.split(",")));
                    for (int i = 0; i < filterList.size(); i++) {
                        filterList.set(i, filterList.get(i).trim());
                    }
                }
            }
            PanelRepository.get().saveForwarding(
                deviceId,
                enabled.isChecked(),
                number.getText().toString().trim(),
                forwardAll.isChecked(),
                filterList,
                new PanelRepository.VoidCallback() {
                    @Override
                    public void onSuccess() {
                        if (!isAdded()) return;
                        Toast.makeText(getContext(), R.string.settings_saved, Toast.LENGTH_SHORT).show();
                    }

                    @Override
                    public void onError(String message) {
                        if (!isAdded()) return;
                        Toast.makeText(getContext(), message, Toast.LENGTH_SHORT).show();
                    }
                });
        });

        PanelRepository.get().listenForwardedSms(deviceId, rows -> {
            if (!isAdded()) return;
            adapter.submit(rows, new String[]{"from", "to", "body", "forwarded_at"});
        });
    }
}
