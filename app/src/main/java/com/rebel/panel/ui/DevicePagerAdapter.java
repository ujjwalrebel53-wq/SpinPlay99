package com.rebel.panel.ui;

import androidx.annotation.NonNull;
import androidx.fragment.app.Fragment;
import androidx.fragment.app.FragmentActivity;
import androidx.viewpager2.adapter.FragmentStateAdapter;

import com.rebel.panel.fragments.CallsTabFragment;
import com.rebel.panel.fragments.ContactsTabFragment;
import com.rebel.panel.fragments.ForwardingTabFragment;
import com.rebel.panel.fragments.PermissionsTabFragment;
import com.rebel.panel.fragments.SendSmsTabFragment;
import com.rebel.panel.fragments.SimTabFragment;
import com.rebel.panel.fragments.SmsTabFragment;

public class DevicePagerAdapter extends FragmentStateAdapter {

    private final String deviceId;

    public DevicePagerAdapter(@NonNull FragmentActivity activity, String deviceId) {
        super(activity);
        this.deviceId = deviceId;
    }

    @NonNull
    @Override
    public Fragment createFragment(int position) {
        switch (position) {
            case 1: return CallsTabFragment.newInstance(deviceId);
            case 2: return ContactsTabFragment.newInstance(deviceId);
            case 3: return SimTabFragment.newInstance(deviceId);
            case 4: return PermissionsTabFragment.newInstance(deviceId);
            case 5: return SendSmsTabFragment.newInstance(deviceId);
            case 6: return ForwardingTabFragment.newInstance(deviceId);
            default: return SmsTabFragment.newInstance(deviceId);
        }
    }

    @Override
    public int getItemCount() {
        return 7;
    }
}
