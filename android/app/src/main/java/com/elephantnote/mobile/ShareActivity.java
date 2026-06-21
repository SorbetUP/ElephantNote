package com.elephantnote.mobile;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.ArrayList;

public final class ShareActivity extends Activity {
    private NoteStore store;
    private AttachmentStore attachmentStore;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        store = new NoteStore(this);
        attachmentStore = new AttachmentStore(this);

        String shared = "";
        Intent intent = getIntent();
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            shared = buildSharedMarkdown(text == null ? "" : text.toString(), stream);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
            CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
            ArrayList<Uri> streams = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            shared = buildSharedMarkdown(text == null ? "" : text.toString(), streams);
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
                store.create("", value);
            }
            finish();
        });
        root.addView(save);

        setContentView(root);
    }

    private String buildSharedMarkdown(String text, Uri stream) {
        ArrayList<Uri> streams = new ArrayList<>();
        if (stream != null) streams.add(stream);
        return buildSharedMarkdown(text, streams);
    }

    private String buildSharedMarkdown(String text, ArrayList<Uri> streams) {
        StringBuilder body = new StringBuilder();
        if (streams != null && !streams.isEmpty()) {
            body.append("folder: Attachments\n#attachment");
            String type = getIntent().getType();
            if (type != null && type.startsWith("image/")) body.append(" #image");
            body.append("\n\n");
            int index = 0;
            for (Uri stream : streams) {
                if (stream == null) continue;
                String localUri = attachmentStore.save(stream, index);
                body.append("![](").append(localUri).append(")\n\n");
                index += 1;
            }
        }
        if (text != null && !text.trim().isEmpty()) {
            if (body.length() == 0) body.append("folder: Shared\n#shared\n\n");
            body.append(text.trim()).append("\n");
        }
        return body.toString();
    }
}
