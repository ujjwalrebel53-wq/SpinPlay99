package com.rebel.panel.fragments;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.rebel.panel.R;
import com.rebel.panel.firebase.PanelRepository;

import java.util.Map;

public class SimTabFragment extends DeviceTabFragment {

    public static SimTabFragment newInstance(String deviceId) {
        SimTabFragment f = new SimTabFragment();
        Bundle b = new Bundle();
        b.putString(ARG_DEVICE_ID, deviceId);
        f.setArguments(b);
        return f;
    }

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container,
                             @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_sim_tab, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        LinearLayout container = view.findViewById(R.id.sim_container);
        TextView empty = view.findViewById(R.id.sim_empty);

        PanelRepository.get().listenSim(deviceId, fields -> {
            if (!isAdded()) return;
            container.removeAllViews();
            if (fields.isEmpty()) {
                empty.setVisibility(View.VISIBLE);
                return;
            }
            empty.setVisibility(View.GONE);
            for (Map.Entry<String, String> e : fields.entrySet()) {
                View row = LayoutInflater.from(getContext())
                    .inflate(R.layout.item_sim_row, container, false);
                ((TextView) row.findViewById(R.id.sim_key)).setText(e.getKey());
                TextView val = row.findViewById(R.id.sim_value);
                val.setText(e.getValue().isEmpty() ? "N/A" : e.getValue());
                container.addView(row);
            }
        });
    }
}
