package com.rebel.panel.fragments;

import android.app.AlertDialog;
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
import com.rebel.panel.data.SmsMessage;
import com.rebel.panel.firebase.PanelRepository;
import com.rebel.panel.ui.SmsAdapter;

import java.util.List;

public class SmsTabFragment extends DeviceTabFragment {

    public static SmsTabFragment newInstance(String deviceId) {
        SmsTabFragment f = new SmsTabFragment();
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
        TextView count = view.findViewById(R.id.tab_count);
        RecyclerView list = view.findViewById(R.id.tab_list);
        TextView empty = view.findViewById(R.id.tab_empty);
        SmsAdapter adapter = new SmsAdapter(sms -> new AlertDialog.Builder(requireContext())
            .setTitle(sms.address)
            .setMessage(sms.body)
            .setPositiveButton(android.R.string.ok, null)
            .show());
        list.setLayoutManager(new LinearLayoutManager(getContext()));
        list.setAdapter(adapter);

        PanelRepository.get().listenSms(deviceId, (messages, total) -> {
            if (!isAdded()) return;
            count.setText(getString(R.string.sms_count_fmt, messages.size(), total));
            adapter.submit(messages);
            empty.setVisibility(messages.isEmpty() ? View.VISIBLE : View.GONE);
            list.setVisibility(messages.isEmpty() ? View.GONE : View.VISIBLE);
        });
    }
}
