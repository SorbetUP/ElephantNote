package com.elephantnote.mobile;

import android.app.Activity;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.os.Bundle;
import android.view.MotionEvent;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Toast;
import java.util.ArrayList;
import java.util.List;

public final class SketchActivity extends Activity {
    public static final String EXTRA_DRAWING_ID = "drawingId";

    private DrawingStore store;
    private DrawingView drawingView;
    private EditText title;
    private String drawingId = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        store = new DrawingStore(this);
        drawingId = getIntent().getStringExtra(EXTRA_DRAWING_ID);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(12), dp(12), dp(12), dp(12));
        root.setBackgroundColor(Color.rgb(248, 250, 252));

        title = new EditText(this);
        title.setSingleLine(true);
        title.setHint("Canvas title");
        root.addView(title);

        drawingView = new DrawingView(this);
        root.addView(drawingView, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            0,
            1
        ));

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        Button clear = new Button(this);
        clear.setText("Clear");
        clear.setAllCaps(false);
        clear.setOnClickListener(view -> drawingView.clear());
        Button save = new Button(this);
        save.setText("Save");
        save.setAllCaps(false);
        save.setOnClickListener(view -> saveDrawing());
        actions.addView(clear, new LinearLayout.LayoutParams(0, dp(48), 1));
        actions.addView(save, new LinearLayout.LayoutParams(0, dp(48), 1));
        root.addView(actions);

        setContentView(root);
        loadDrawing();
    }

    private void loadDrawing() {
        if (drawingId == null || drawingId.trim().isEmpty()) return;
        DrawingStore.Drawing drawing = store.get(drawingId);
        if (drawing == null) return;
        title.setText(drawing.title);
        drawingView.setStrokes(drawing.strokes);
    }

    private void saveDrawing() {
        DrawingStore.Drawing drawing = store.save(drawingId, title.getText().toString(), drawingView.serialize());
        drawingId = drawing.id;
        Toast.makeText(this, "Canvas saved", Toast.LENGTH_SHORT).show();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    static final class DrawingView extends View {
        private final Paint strokePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint backgroundPaint = new Paint();
        private final List<List<float[]>> strokes = new ArrayList<>();
        private List<float[]> currentStroke = null;

        DrawingView(Activity context) {
            super(context);
            strokePaint.setColor(Color.rgb(31, 41, 55));
            strokePaint.setStrokeWidth(6f);
            strokePaint.setStyle(Paint.Style.STROKE);
            strokePaint.setStrokeCap(Paint.Cap.ROUND);
            strokePaint.setStrokeJoin(Paint.Join.ROUND);
            backgroundPaint.setColor(Color.WHITE);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            canvas.drawColor(Color.WHITE);
            for (List<float[]> stroke : strokes) drawStroke(canvas, stroke);
            if (currentStroke != null) drawStroke(canvas, currentStroke);
        }

        @Override
        public boolean onTouchEvent(MotionEvent event) {
            if (event.getAction() == MotionEvent.ACTION_DOWN) {
                currentStroke = new ArrayList<>();
                currentStroke.add(new float[] { event.getX(), event.getY() });
                invalidate();
                return true;
            }
            if (event.getAction() == MotionEvent.ACTION_MOVE && currentStroke != null) {
                currentStroke.add(new float[] { event.getX(), event.getY() });
                invalidate();
                return true;
            }
            if ((event.getAction() == MotionEvent.ACTION_UP || event.getAction() == MotionEvent.ACTION_CANCEL) && currentStroke != null) {
                currentStroke.add(new float[] { event.getX(), event.getY() });
                strokes.add(currentStroke);
                currentStroke = null;
                invalidate();
                return true;
            }
            return true;
        }

        void clear() {
            strokes.clear();
            currentStroke = null;
            invalidate();
        }

        String serialize() {
            ArrayList<String> serialized = new ArrayList<>();
            for (List<float[]> stroke : strokes) {
                ArrayList<String> points = new ArrayList<>();
                for (float[] point : stroke) points.add(Math.round(point[0]) + "," + Math.round(point[1]));
                serialized.add(String.join(";", points));
            }
            return String.join("|", serialized);
        }

        void setStrokes(String value) {
            strokes.clear();
            if (value == null || value.trim().isEmpty()) {
                invalidate();
                return;
            }
            for (String strokeText : value.split("\\|")) {
                ArrayList<float[]> stroke = new ArrayList<>();
                for (String pointText : strokeText.split(";")) {
                    String[] parts = pointText.split(",", 2);
                    if (parts.length != 2) continue;
                    try {
                        stroke.add(new float[] { Float.parseFloat(parts[0]), Float.parseFloat(parts[1]) });
                    } catch (Exception ignored) {
                    }
                }
                if (!stroke.isEmpty()) strokes.add(stroke);
            }
            invalidate();
        }

        private void drawStroke(Canvas canvas, List<float[]> stroke) {
            if (stroke.size() == 1) {
                float[] point = stroke.get(0);
                canvas.drawPoint(point[0], point[1], strokePaint);
                return;
            }
            for (int index = 1; index < stroke.size(); index += 1) {
                float[] start = stroke.get(index - 1);
                float[] end = stroke.get(index);
                canvas.drawLine(start[0], start[1], end[0], end[1], strokePaint);
            }
        }
    }
}
