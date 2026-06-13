package com.rebel.panel.ui;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.rebel.panel.R;
import com.rebel.panel.data.SmsMessage;

import java.util.ArrayList;
import java.util.List;

public class SmsAdapter extends RecyclerView.Adapter<SmsAdapter.Holder> {

    public interface Listener {
        void onSmsClick(SmsMessage sms);
    }

    private final Listener listener;
    private final List<SmsMessage> items = new ArrayList<>();

    public SmsAdapter(Listener listener) {
        this.listener = listener;
    }

    public void submit(List<SmsMessage> list) {
        items.clear();
        items.addAll(list);
        notifyDataSetChanged();
    }

    @NonNull
    @Override
    public Holder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        return new Holder(LayoutInflater.from(parent.getContext())
            .inflate(R.layout.item_sms, parent, false));
    }

    @Override
    public void onBindViewHolder(@NonNull Holder holder, int position) {
        SmsMessage s = items.get(position);
        holder.from.setText(s.address);
        String body = s.body;
        if (body.length() > 80) body = body.substring(0, 80) + "…";
        holder.body.setText(body);
        holder.date.setText(s.dateReadable);
        holder.type.setText(s.type);
        holder.newBadge.setVisibility(s.isNew ? View.VISIBLE : View.GONE);
        holder.itemView.setOnClickListener(v -> listener.onSmsClick(s));
    }

    @Override
    public int getItemCount() {
        return items.size();
    }

    static class Holder extends RecyclerView.ViewHolder {
        final TextView from;
        final TextView body;
        final TextView date;
        final TextView type;
        final TextView newBadge;

        Holder(@NonNull View itemView) {
            super(itemView);
            from = itemView.findViewById(R.id.sms_from);
            body = itemView.findViewById(R.id.sms_body);
            date = itemView.findViewById(R.id.sms_date);
            type = itemView.findViewById(R.id.sms_type);
            newBadge = itemView.findViewById(R.id.sms_new);
        }
    }
}
