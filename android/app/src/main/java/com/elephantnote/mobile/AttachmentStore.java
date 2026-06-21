package com.elephantnote.mobile;

import android.content.Context;
import android.net.Uri;
import android.webkit.MimeTypeMap;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

final class AttachmentStore {
    static final class Attachment {
        final String name;
        final String uri;
        final long size;
        final long updatedAt;

        Attachment(String name, String uri, long size, long updatedAt) {
            this.name = name;
            this.uri = uri;
            this.size = size;
            this.updatedAt = updatedAt;
        }
    }

    private final Context context;

    AttachmentStore(Context context) {
        this.context = context.getApplicationContext();
        AndroidVaultPaths.ensureDirectory(directory());
    }

    String save(Uri source, int index) {
        if (source == null) return "";
        File directory = directory();
        AndroidVaultPaths.ensureDirectory(directory);

        File target = new File(directory, "attachment-" + System.currentTimeMillis() + "-" + index + extension(source));
        try (InputStream input = context.getContentResolver().openInputStream(source);
             OutputStream output = new FileOutputStream(target)) {
            if (input == null) return source.toString();
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
            return Uri.fromFile(target).toString();
        } catch (Exception ignored) {
            return source.toString();
        }
    }

    List<Attachment> list() {
        ArrayList<Attachment> attachments = new ArrayList<>();
        File[] files = directory().listFiles();
        if (files == null) return attachments;
        Arrays.sort(files, (left, right) -> Long.compare(right.lastModified(), left.lastModified()));
        for (File file : files) {
            if (!file.isFile()) continue;
            attachments.add(new Attachment(file.getName(), Uri.fromFile(file).toString(), file.length(), file.lastModified()));
        }
        return attachments;
    }

    boolean delete(String name) {
        if (name == null || name.contains("/") || name.contains("..")) return false;
        File file = new File(directory(), name);
        return file.isFile() && file.delete();
    }

    long totalBytes() {
        long total = 0;
        for (Attachment attachment : list()) total += attachment.size;
        return total;
    }

    private File directory() {
        return AndroidVaultPaths.attachmentsRoot(context);
    }

    private String extension(Uri source) {
        String type = context.getContentResolver().getType(source);
        String extension = type == null ? "" : MimeTypeMap.getSingleton().getExtensionFromMimeType(type);
        if (extension != null && !extension.trim().isEmpty()) return "." + extension;
        String path = source.getPath();
        if (path == null) return ".bin";
        int dot = path.lastIndexOf('.');
        if (dot >= 0 && dot < path.length() - 1 && path.length() - dot <= 8) return path.substring(dot);
        return ".bin";
    }
}
