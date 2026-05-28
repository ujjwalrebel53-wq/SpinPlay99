package com.rebel.panel.fragments;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.rebel.panel.R;
import com.rebel.panel.firebase.PanelRepository;
import com.rebel.panel.ui.PermissionAdapter;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class PermissionsTabFragment extends DeviceTabFragment {

    public static PermissionsTabFragment newInstance(String deviceId) {
        PermissionsTabFragment f = new PermissionsTabFragment();
        Bundle b = new Bundle();
        b.putString(ARG_DEVICE_ID, deviceId);
        f.setArguments(b);
        return f;
    }

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container,
                             @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_list_tab, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        RecyclerView list = view.findViewById(R.id.tab_list);
        TextView empty = view.findViewById(R.id.tab_empty);
        view.findViewById(R.id.tab_count).setVisibility(View.GONE);
        PermissionAdapter adapter = new PermissionAdapter();
        list.setLayoutManager(new LinearLayoutManager(getContext()));
        list.setAdapter(adapter);
        empty.setText(R.string.no_permissions);

        PanelRepository.get().listenPermissions(deviceId, permissions -> {
            if (!isAdded()) return;
            List<Map.Entry<String, Boolean>> entries = new ArrayList<>(permissions.entrySet());
            adapter.submit(entries);
            empty.setVisibility(entries.isEmpty() ? View.VISIBLE : View.GONE);
        });
    }
}
