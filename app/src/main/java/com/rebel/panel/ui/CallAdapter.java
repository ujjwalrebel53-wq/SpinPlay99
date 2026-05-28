package com.rebel.panel.ui;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.rebel.panel.R;
import com.rebel.panel.data.CallEntry;

import java.util.ArrayList;
import java.util.List;

public class CallAdapter extends RecyclerView.Adapter<CallAdapter.Holder> {

    private final List<CallEntry> items = new ArrayList<>();

    public void submit(List<CallEntry> list) {
        items.clear();
        items.addAll(list);
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public Holder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        return new Holder(LayoutInflater.from(parent.getContext())
            .inflate(R.layout.item_call, parent, false));
    }

    @Override
    public void onBindViewHolder(@NonNull Holder holder, int position) {
        CallEntry c = items.get(position);
        holder.number.setText(c.number);
        holder.name.setText(c.contactName.isEmpty() ? "—" : c.contactName);
        holder.date.setText(c.dateReadable);
        holder.duration.setText(c.duration + "s");
        holder.type.setText(c.type);
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    static class Holder extends RecyclerView.ViewHolder {
        final TextView number;
        final TextView name;
        final TextView date;
        final TextView duration;
        final TextView type;

        Holder(@NonNull View itemView) {
            super(itemView);
            number = itemView.findViewById(R.id.call_number);
            name = itemView.findViewById(R.id.call_name);
            date = itemView.findViewById(R.id.call_date);
            duration = itemView.findViewById(R.id.call_duration);
            type = itemView.findViewById(R.id.call_type);
        }
    }
}
