package com.elephantnote.mobile;

import android.content.Context;
import java.io.File;

final class AndroidVaultPaths {
    private static final String VAULT_DIR = "ElephantVault";
    private static final String WORKSPACE_DIR = ".elephantnote";
    private static final String NOTES_DIR = "Notes";
    private static final String ATTACHMENTS_DIR = "Attachments";
    private static final String CANVAS_DIR = "Canvas";

    private AndroidVaultPaths() {
    }

    static File vaultRoot(Context context) {
        File base = context.getExternalFilesDir(null);
        if (base == null) base = context.getFilesDir();
        File root = new File(base, VAULT_DIR);
        ensureDirectory(root);
        ensureDirectory(notesRoot(context));
        ensureDirectory(attachmentsRoot(context));
        ensureDirectory(canvasRoot(context));
        ensureDirectory(workspaceRoot(context));
        return root;
    }

    static File notesRoot(Context context) {
        File base = context.getExternalFilesDir(null);
        if (base == null) base = context.getFilesDir();
        return new File(new File(base, VAULT_DIR), NOTES_DIR);
    }

    static File attachmentsRoot(Context context) {
        return new File(vaultRootWithoutRecursion(context), ATTACHMENTS_DIR);
    }

    static File canvasRoot(Context context) {
        return new File(vaultRootWithoutRecursion(context), CANVAS_DIR);
    }

    static File workspaceRoot(Context context) {
        return new File(vaultRootWithoutRecursion(context), WORKSPACE_DIR);
    }

    static File vaultRootWithoutRecursion(Context context) {
        File base = context.getExternalFilesDir(null);
        if (base == null) base = context.getFilesDir();
        return new File(base, VAULT_DIR);
    }

    static void ensureDirectory(File directory) {
        if (directory != null && !directory.exists()) directory.mkdirs();
    }
}
