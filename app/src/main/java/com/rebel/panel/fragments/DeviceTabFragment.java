package com.rebel.panel.fragments;

import android.os.Bundle;

import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

public abstract class DeviceTabFragment extends Fragment {

    protected static final String ARG_DEVICE_ID = "device_id";
    protected String deviceId;

    @Override
    public void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getArguments() != null) {
            deviceId = getArguments().getString(ARG_DEVICE_ID);
        }
    }
}
