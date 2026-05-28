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
import com.rebel.panel.ui.ContactAdapter;

public class ContactsTabFragment extends DeviceTabFragment {

    public static ContactsTabFragment newInstance(String deviceId) {
        ContactsTabFragment f = new ContactsTabFragment();
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
        ContactAdapter adapter = new ContactAdapter();
        list.setLayoutManager(new LinearLayoutManager(getContext()));
        list.setAdapter(adapter);
        empty.setText(R.string.no_contacts);

        PanelRepository.get().listenContacts(deviceId, (contacts, total) -> {
            if (!isAdded()) return;
            count.setText(getString(R.string.count_fmt, total));
            adapter.submit(contacts);
            empty.setVisibility(contacts.isEmpty() ? View.VISIBLE : View.GONE);
            list.setVisibility(contacts.isEmpty() ? View.GONE : View.VISIBLE);
        });
    }
}
