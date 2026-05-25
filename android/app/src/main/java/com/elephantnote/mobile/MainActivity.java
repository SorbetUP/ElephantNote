package com.elephantnote.mobile;

import android.app.Activity;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.text.DateFormat;
import java.util.Date;

public final class MainActivity extends Activity {
    private NoteStore store;
    private LinearLayout list;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        store = new NoteStore(this);
        render();
    }

    private void render() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(24, 24, 24, 24);

        TextView title = new TextView(this);
        title.setText("ElephantNote");
        title.setTextSize(24);
        title.setGravity(Gravity.START);
        root.addView(title);

        EditText quickNote = new EditText(this);
        quickNote.setHint("Take a note");
        quickNote.setMinLines(2);
        root.addView(quickNote);

        Button save = new Button(this);
        save.setText("Save offline");
        save.setOnClickListener(view -> {
            String body = quickNote.getText().toString();
            if (!body.trim().isEmpty()) {
                String firstLine = body.split("\\R", 2)[0];
                store.create(firstLine, body);
                quickNote.setText("");
                refreshList();
            }
        });
        root.addView(save);

        ScrollView scrollView = new ScrollView(this);
        list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        scrollView.addView(list);
        root.addView(scrollView, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0,
            1
        ));

        setContentView(root);
        refreshList();
    }

    private void refreshList() {
        list.removeAllViews();
        for (NoteStore.Note note : store.list()) {
            TextView card = new TextView(this);
            card.setText(note.title + "\n" + note.body + "\n" + DateFormat.getDateTimeInstance().format(new Date(note.updatedAt)));
            card.setTextSize(16);
            card.setPadding(18, 18, 18, 18);
            list.addView(card);
        }
    }
}
