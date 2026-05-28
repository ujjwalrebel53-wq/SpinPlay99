package com.rebel.panel.ui;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.rebel.panel.R;
import com.rebel.panel.data.Device;

import java.util.ArrayList;
import java.util.List;

public class DeviceAdapter extends RecyclerView.Adapter<DeviceAdapter.Holder> {

    public interface Listener {
        void onDeviceClick(Device device);
    }

    private final Listener listener;
    private final List<Device> items = new ArrayList<>();

    public DeviceAdapter(Listener listener) {
        this.listener = listener;
    }

    public void submit(List<Device> devices) {
        items.clear();
        items.addAll(devices);
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public Holder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_device, parent, false);
        return new Holder(v);
    }

    @Override
    public void onBindViewHolder(@NonNull Holder holder, int position) {
        Device d = items.get(position);
        holder.name.setText(d.name);
        holder.id.setText(d.id.length() > 20 ? d.id.substring(0, 20) + "..." : d.id);
        holder.meta.setText(String.format("⚡%d%%%s  •  %s  •  %d SMS",
            d.battery, d.charging ? " CHG" : "", d.network, d.smsCount));
        holder.status.setText(d.online ? "● ONLINE" : "○ OFFLINE");
        holder.status.setTextColor(d.online ? 0xFF00FF9D : 0xFF6B6B88);
        holder.itemView.setOnClickListener(v -> listener.onDeviceClick(d));
        int accent = d.online ? 0xFF00FF9D : 0xFFFF3C3C;
        holder.indicator.setBackgroundColor(accent);
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    static class Holder extends RecyclerView.ViewHolder {
        final TextView name;
        final TextView id;
        final TextView meta;
        final TextView status;
        final View indicator;

        Holder(@NonNull View itemView) {
            super(itemView);
            name = itemView.findViewById(R.id.device_name);
            id = itemView.findViewById(R.id.device_id);
            meta = itemView.findViewById(R.id.device_meta);
            status = itemView.findViewById(R.id.device_status);
            indicator = itemView.findViewById(R.id.device_indicator);
        }
    }
}
