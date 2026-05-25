package com.elephantnote.mobile;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class ShareActivity extends Activity {
    private NoteStore store;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        store = new NoteStore(this);

        String shared = "";
        Intent intent = getIntent();
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            shared = text == null ? "" : text.toString();
        }

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(24, 24, 24, 24);

        TextView title = new TextView(this);
        title.setText("Save to ElephantNote");
        title.setTextSize(20);
        root.addView(title);

        EditText body = new EditText(this);
        body.setMinLines(4);
        body.setText(shared);
        root.addView(body);

        Button save = new Button(this);
        save.setText("Save offline");
        save.setOnClickListener(view -> {
            String value = body.getText().toString();
            if (!value.trim().isEmpty()) {
                String firstLine = value.split("\\R", 2)[0];
                store.create(firstLine, value);
            }
            finish();
        });
        root.addView(save);

        setContentView(root);
    }
}
