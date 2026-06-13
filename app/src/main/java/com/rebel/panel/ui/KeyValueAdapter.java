package com.rebel.panel.ui;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.rebel.panel.R;

import java.text.DateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class KeyValueAdapter extends RecyclerView.Adapter<KeyValueAdapter.Holder> {

    private final List<String[]> rows = new ArrayList<>();

    public void submit(List<Map<String, Object>> data, String[] keys) {
        rows.clear();
        for (Map<String, Object> map : data) {
            StringBuilder line = new StringBuilder();
            for (int i = 0; i < keys.length; i++) {
                if (i > 0) line.append("\n");
                Object v = map.get(keys[i]);
                line.append(format(keys[i], v));
            }
            rows.add(new String[]{line.toString()});
        }
        notifyDataSetChanged();
    }

    private String format(String key, Object value) {
        if (value == null) return key + ": —";
        if ("sent_at".equals(key) || "forwarded_at".equals(key)) {
            try {
                long ts = value instanceof Long ? (Long) value : Long.parseLong(String.valueOf(value));
                return key + ": " + DateFormat.getDateTimeInstance().format(new Date(ts));
            } catch (Exception e) {
                return key + ": " + value;
            }
        }
        return key + ": " + value;
    }

    @NonNull
    @Override
    public Holder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        return new Holder(LayoutInflater.from(parent.getContext())
            .inflate(R.layout.item_key_value, parent, false));
    }

    @Override
    public void onBindViewHolder(@NonNull Holder holder, int position) {
        holder.text.setText(rows.get(position)[0]);
    }

    @Override
    public int getItemCount() {
        return rows.size();
    }

    static class Holder extends RecyclerView.ViewHolder {
        final TextView text;

        Holder(@NonNull View itemView) {
            super(itemView);
            text = itemView.findViewById(R.id.kv_text);
        }
    }
}
