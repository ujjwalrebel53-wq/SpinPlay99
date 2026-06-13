package com.rebel.panel.ui;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.rebel.panel.R;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public class PermissionAdapter extends RecyclerView.Adapter<PermissionAdapter.Holder> {

    private final List<Map.Entry<String, Boolean>> items = new ArrayList<>();

    public void submit(List<Map.Entry<String, Boolean>> list) {
        items.clear();
        items.addAll(list);
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public Holder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        return new Holder(LayoutInflater.from(parent.getContext())
            .inflate(R.layout.item_permission, parent, false));
    }

    @Override
    public void onBindViewHolder(@NonNull Holder holder, int position) {
        Map.Entry<String, Boolean> e = items.get(position);
        holder.name.setText(e.getKey().replace('_', ' '));
        boolean granted = Boolean.TRUE.equals(e.getValue());
        holder.status.setText(granted ? "✅ OK" : "❌ Denied");
        holder.status.setTextColor(granted ? 0xFF00FF9D : 0xFFFF4466);
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    static class Holder extends RecyclerView.ViewHolder {
        final TextView name;
        final TextView status;

        Holder(@NonNull View itemView) {
            super(itemView);
            name = itemView.findViewById(R.id.perm_name);
            status = itemView.findViewById(R.id.perm_status);
        }
    }
}
