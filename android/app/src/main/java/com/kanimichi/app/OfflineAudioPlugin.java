package com.kanimichi.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.PlaybackParams;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

@CapacitorPlugin(name = "OfflineAudio")
public class OfflineAudioPlugin extends Plugin {
    private static final String TAG = "KaniMichiOfflineAudio";
    private static final String AUDIO_DIR_NAME = "kanimichi_audio";
    private static final int MIN_VALID_MP3_BYTES = 256;
    private static final int MAX_CHUNK_CHARS = 155;
    private static final int CONNECT_TIMEOUT_MS = 8000;
    private static final int READ_TIMEOUT_MS = 12000;
    private static final String USER_AGENT =
            "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

    private final ExecutorService playbackExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService batchCoordinator = Executors.newSingleThreadExecutor();
    private final Object playerLock = new Object();

    private MediaPlayer activePlayer = null;
    private PluginCall activePlayCall = null;
    private AudioFocusRequest activeFocusRequest = null;
    private final AtomicInteger playGeneration = new AtomicInteger(0);

    private volatile AtomicBoolean currentBatchCancel = new AtomicBoolean(false);

    private File getAudioCacheDir() {
        File dir = new File(getContext().getFilesDir(), AUDIO_DIR_NAME);
        if (!dir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        }
        return dir;
    }

    private String sha256Hex(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                sb.append(String.format("%02x", b & 0xff));
            }
            return sb.toString();
        } catch (Exception e) {
            return String.valueOf(input.hashCode());
        }
    }

    private File getClipFile(String normalizedText) {
        return new File(getAudioCacheDir(), sha256Hex(normalizedText) + ".mp3");
    }

    private boolean isValidAudioFile(File f) {
        return f != null && f.exists() && f.isFile() && f.length() >= MIN_VALID_MP3_BYTES;
    }

    private boolean isNetworkAvailable() {
        try {
            ConnectivityManager cm =
                    (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            Network active = cm.getActiveNetwork();
            if (active == null) return false;
            NetworkCapabilities caps = cm.getNetworkCapabilities(active);
            return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        } catch (Exception e) {
            return true;
        }
    }

    private static List<String> splitJapaneseChunks(String text) {
        List<String> chunks = new ArrayList<>();
        String trimmed = text == null ? "" : text.trim();
        if (trimmed.isEmpty()) return chunks;
        if (trimmed.length() <= MAX_CHUNK_CHARS) {
            chunks.add(trimmed);
            return chunks;
        }

        int start = 0;
        int len = trimmed.length();
        while (start < len) {
            int remaining = len - start;
            if (remaining <= MAX_CHUNK_CHARS) {
                String tail = trimmed.substring(start).trim();
                if (!tail.isEmpty()) chunks.add(tail);
                break;
            }

            int end = start + MAX_CHUNK_CHARS;
            int splitAt = -1;
            for (int i = end; i > start + 25; i--) {
                char c = trimmed.charAt(i - 1);
                if (c == '。' || c == '？' || c == '！' || c == '?' || c == '!' || c == '\n') {
                    splitAt = i;
                    break;
                }
            }
            if (splitAt == -1) {
                for (int i = end; i > start + 25; i--) {
                    char c = trimmed.charAt(i - 1);
                    if (c == '、' || c == ',' || c == '・' || c == ' ' || c == '　') {
                        splitAt = i;
                        break;
                    }
                }
            }
            if (splitAt == -1) {
                splitAt = end;
            }

            String part = trimmed.substring(start, splitAt).trim();
            if (!part.isEmpty()) {
                chunks.add(part);
            }
            start = splitAt;
        }
        return chunks;
    }

    private static boolean looksLikeTextOrError(byte[] data) {
        if (data == null || data.length < MIN_VALID_MP3_BYTES) return true;
        int inspect = Math.min(data.length, 32);
        String prefix = new String(data, 0, inspect, StandardCharsets.US_ASCII).trim().toLowerCase();
        return prefix.startsWith("<!doc")
                || prefix.startsWith("<html")
                || prefix.startsWith("<?xml")
                || prefix.startsWith("{")
                || prefix.startsWith("error");
    }

    private byte[] fetchUrlAudioBytes(String urlStr) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);
            conn.setRequestMethod("GET");
            conn.setRequestProperty("User-Agent", USER_AGENT);
            conn.setRequestProperty("Accept", "audio/mpeg, audio/*;q=0.9, */*;q=0.8");
            conn.setRequestProperty("Referer", "https://translate.google.com/");

            int status = conn.getResponseCode();
            if (status < 200 || status >= 300) {
                return null;
            }

            String contentType = conn.getContentType();
            if (contentType != null && contentType.toLowerCase().contains("text/html")) {
                return null;
            }

            try (InputStream in = conn.getInputStream();
                 ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buf = new byte[8192];
                int read;
                while ((read = in.read(buf)) != -1) {
                    out.write(buf, 0, read);
                }
                byte[] bytes = out.toByteArray();
                if (looksLikeTextOrError(bytes)) {
                    return null;
                }
                return bytes;
            }
        } catch (Exception e) {
            return null;
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private byte[] fetchChunkWithMirrors(String chunk) {
        try {
            String encoded = URLEncoder.encode(chunk, "UTF-8").replace("+", "%20");
            List<String> mirrors = new ArrayList<>();
            mirrors.add("https://translate.googleapis.com/translate_tts?ie=UTF-8&q=" + encoded + "&tl=ja&client=gtx");
            mirrors.add("https://translate.google.com/translate_tts?ie=UTF-8&q=" + encoded + "&tl=ja&client=tw-ob");
            if (chunk.length() <= 60) {
                mirrors.add("https://dict.youdao.com/dictvoice?audio=" + encoded + "&le=jap");
            }

            for (String mirrorUrl : mirrors) {
                byte[] data = fetchUrlAudioBytes(mirrorUrl);
                if (data != null && data.length >= MIN_VALID_MP3_BYTES) {
                    return data;
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Chunk download failed: " + e.getMessage());
        }
        return null;
    }

    private File downloadClipToCache(String normalizedText) {
        File target = getClipFile(normalizedText);
        if (isValidAudioFile(target)) {
            return target;
        }
        if (!isNetworkAvailable()) {
            return null;
        }

        List<String> chunks = splitJapaneseChunks(normalizedText);
        if (chunks.isEmpty()) return null;

        ByteArrayOutputStream combined = new ByteArrayOutputStream();
        for (String chunk : chunks) {
            byte[] part = fetchChunkWithMirrors(chunk);
            if (part == null) {
                return null;
            }
            try {
                combined.write(part);
            } catch (IOException e) {
                return null;
            }
        }

        byte[] fullAudio = combined.toByteArray();
        if (fullAudio.length < MIN_VALID_MP3_BYTES) {
            return null;
        }

        File tmp = new File(getAudioCacheDir(), target.getName() + "." + Thread.currentThread().getId() + ".tmp");
        try (FileOutputStream fos = new FileOutputStream(tmp)) {
            fos.write(fullAudio);
            fos.flush();
        } catch (IOException e) {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            return null;
        }

        if (target.exists()) {
            //noinspection ResultOfMethodCallIgnored
            target.delete();
        }
        if (tmp.renameTo(target) && isValidAudioFile(target)) {
            return target;
        }
        // Fallback: if renameTo failed because another thread already wrote target
        if (isValidAudioFile(target)) {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
            return target;
        }
        //noinspection ResultOfMethodCallIgnored
        tmp.delete();
        return null;
    }

    private AudioAttributes buildSpeechAudioAttributes() {
        return new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build();
    }

    private void requestAudioFocus() {
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                AudioFocusRequest req = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                        .setAudioAttributes(buildSpeechAudioAttributes())
                        .setWillPauseWhenDucked(false)
                        .build();
                activeFocusRequest = req;
                am.requestAudioFocus(req);
            } else {
                //noinspection deprecation
                am.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK);
            }
        } catch (Exception ignored) {
        }
    }

    private void abandonAudioFocus() {
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && activeFocusRequest != null) {
                am.abandonAudioFocusRequest(activeFocusRequest);
                activeFocusRequest = null;
            }
        } catch (Exception ignored) {
        }
    }

    private void stopActivePlayer(boolean resolvePendingAsInterrupted) {
        PluginCall callToResolve = null;
        synchronized (playerLock) {
            if (activePlayer != null) {
                try {
                    if (activePlayer.isPlaying()) {
                        activePlayer.stop();
                    }
                } catch (Exception ignored) {
                }
                try {
                    activePlayer.release();
                } catch (Exception ignored) {
                }
                activePlayer = null;
            }
            if (resolvePendingAsInterrupted && activePlayCall != null) {
                callToResolve = activePlayCall;
                activePlayCall = null;
            }
            abandonAudioFocus();
        }
        if (callToResolve != null) {
            JSObject res = new JSObject();
            res.put("played", false);
            res.put("reason", "interrupted");
            callToResolve.resolve(res);
        }
    }

    @PluginMethod
    public void play(PluginCall call) {
        String rawText = call.getString("text", "");
        String cleanText = rawText == null ? "" : rawText.trim();
        if (cleanText.isEmpty()) {
            JSObject res = new JSObject();
            res.put("played", false);
            res.put("reason", "empty");
            call.resolve(res);
            return;
        }

        Float rateObj = call.getFloat("rate");
        Float pitchObj = call.getFloat("pitch");
        final float rate = Math.max(0.5f, Math.min(2.0f, rateObj != null ? rateObj : 1.0f));
        final float pitch = Math.max(0.75f, Math.min(1.30f, pitchObj != null ? pitchObj : 1.0f));
        final boolean allowNetwork = Boolean.TRUE.equals(call.getBoolean("allowNetwork", true));

        final int gen = playGeneration.incrementAndGet();
        stopActivePlayer(true);

        playbackExecutor.execute(() -> {
            if (gen != playGeneration.get()) {
                JSObject res = new JSObject();
                res.put("played", false);
                res.put("reason", "interrupted");
                call.resolve(res);
                return;
            }

            File clip = getClipFile(cleanText);
            String source = "cache";

            if (!isValidAudioFile(clip)) {
                if (!allowNetwork) {
                    JSObject res = new JSObject();
                    res.put("played", false);
                    res.put("reason", "not_cached");
                    call.resolve(res);
                    return;
                }
                clip = downloadClipToCache(cleanText);
                source = "downloaded";
            }

            if (gen != playGeneration.get()) {
                JSObject res = new JSObject();
                res.put("played", false);
                res.put("reason", "interrupted");
                call.resolve(res);
                return;
            }

            if (!isValidAudioFile(clip)) {
                JSObject res = new JSObject();
                res.put("played", false);
                res.put("reason", isNetworkAvailable() ? "download_failed" : "offline_missing");
                call.resolve(res);
                return;
            }

            final File playableFile = clip;
            final String finalSource = source;
            final long fileBytes = playableFile.length();

            MediaPlayer mp = new MediaPlayer();
            try {
                mp.setAudioAttributes(buildSpeechAudioAttributes());
                mp.setDataSource(playableFile.getAbsolutePath());
                mp.prepare();

                mp.setOnCompletionListener(player -> {
                    PluginCall doneCall = null;
                    synchronized (playerLock) {
                        if (activePlayer == player) {
                            activePlayer = null;
                            doneCall = activePlayCall;
                            activePlayCall = null;
                        }
                        try {
                            player.release();
                        } catch (Exception ignored) {
                        }
                        abandonAudioFocus();
                    }
                    if (doneCall != null) {
                        JSObject res = new JSObject();
                        res.put("played", true);
                        res.put("source", finalSource);
                        res.put("bytes", fileBytes);
                        doneCall.resolve(res);
                    }
                });

                mp.setOnErrorListener((player, what, extra) -> {
                    PluginCall errCall = null;
                    synchronized (playerLock) {
                        if (activePlayer == player) {
                            activePlayer = null;
                            errCall = activePlayCall;
                            activePlayCall = null;
                        }
                        try {
                            player.release();
                        } catch (Exception ignored) {
                        }
                        abandonAudioFocus();
                    }
                    // Delete corrupted file so it can be re-downloaded cleanly later
                    //noinspection ResultOfMethodCallIgnored
                    playableFile.delete();
                    if (errCall != null) {
                        JSObject res = new JSObject();
                        res.put("played", false);
                        res.put("reason", "media_error_" + what);
                        errCall.resolve(res);
                    }
                    return true;
                });

                synchronized (playerLock) {
                    if (gen != playGeneration.get()) {
                        try {
                            mp.release();
                        } catch (Exception ignored) {
                        }
                        JSObject res = new JSObject();
                        res.put("played", false);
                        res.put("reason", "interrupted");
                        call.resolve(res);
                        return;
                    }
                    activePlayer = mp;
                    activePlayCall = call;
                }

                requestAudioFocus();
                mp.start();

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                        && (Math.abs(rate - 1.0f) > 0.02f || Math.abs(pitch - 1.0f) > 0.02f)) {
                    try {
                        PlaybackParams params = mp.getPlaybackParams();
                        params.setSpeed(rate);
                        params.setPitch(pitch);
                        mp.setPlaybackParams(params);
                    } catch (Exception ignored) {
                        // Some devices reject pitch shifts on certain MP3 streams; play with default params
                    }
                }
            } catch (Exception e) {
                try {
                    mp.release();
                } catch (Exception ignored) {
                }
                //noinspection ResultOfMethodCallIgnored
                playableFile.delete();
                synchronized (playerLock) {
                    if (activePlayer == mp) {
                        activePlayer = null;
                        activePlayCall = null;
                    }
                    abandonAudioFocus();
                }
                JSObject res = new JSObject();
                res.put("played", false);
                res.put("reason", "playback_exception");
                call.resolve(res);
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        playGeneration.incrementAndGet();
        stopActivePlayer(true);
        call.resolve();
    }

    @PluginMethod
    public void getStorageStats(PluginCall call) {
        playbackExecutor.execute(() -> {
            File dir = getAudioCacheDir();
            File[] files = dir.listFiles();
            int count = 0;
            long totalBytes = 0;
            if (files != null) {
                for (File f : files) {
                    if (f.isFile() && f.getName().endsWith(".mp3") && f.length() >= MIN_VALID_MP3_BYTES) {
                        count++;
                        totalBytes += f.length();
                    }
                }
            }
            JSObject res = new JSObject();
            res.put("totalFiles", count);
            res.put("totalBytes", totalBytes);
            res.put("isOnline", isNetworkAvailable());
            call.resolve(res);
        });
    }

    @PluginMethod
    public void countCached(PluginCall call) {
        JSArray arr = call.getArray("texts");
        if (arr == null) {
            JSObject res = new JSObject();
            res.put("totalCount", 0);
            res.put("cachedCount", 0);
            res.put("cachedBytes", 0);
            call.resolve(res);
            return;
        }

        final List<String> unique = extractUniqueTexts(arr);
        playbackExecutor.execute(() -> {
            int cached = 0;
            long bytes = 0;
            for (String text : unique) {
                File f = getClipFile(text);
                if (isValidAudioFile(f)) {
                    cached++;
                    bytes += f.length();
                }
            }
            JSObject res = new JSObject();
            res.put("totalCount", unique.size());
            res.put("cachedCount", cached);
            res.put("cachedBytes", bytes);
            call.resolve(res);
        });
    }

    @PluginMethod
    public void downloadBatch(PluginCall call) {
        final String packId = call.getString("packId", "custom");
        JSArray arr = call.getArray("texts");
        final List<String> unique = extractUniqueTexts(arr);

        if (unique.isEmpty()) {
            JSObject res = new JSObject();
            res.put("packId", packId);
            res.put("cancelled", false);
            res.put("total", 0);
            res.put("completed", 0);
            res.put("downloadedNew", 0);
            res.put("skippedExisting", 0);
            res.put("failed", 0);
            res.put("bytesAdded", 0);
            call.resolve(res);
            return;
        }

        // Cancel any previous batch
        currentBatchCancel.set(true);
        final AtomicBoolean cancelFlag = new AtomicBoolean(false);
        currentBatchCancel = cancelFlag;

        batchCoordinator.execute(() -> {
            final int total = unique.size();
            final AtomicInteger completed = new AtomicInteger(0);
            final AtomicInteger downloadedNew = new AtomicInteger(0);
            final AtomicInteger skippedExisting = new AtomicInteger(0);
            final AtomicInteger failed = new AtomicInteger(0);
            final AtomicLong bytesAdded = new AtomicLong(0);
            final AtomicLong lastEmitMs = new AtomicLong(0);

            // Emit initial progress
            emitBatchProgress(packId, 0, total, 0, 0, 0, 0, "");

            final List<String> missing = new ArrayList<>();
            for (String text : unique) {
                File existing = getClipFile(text);
                if (isValidAudioFile(existing)) {
                    skippedExisting.incrementAndGet();
                    completed.incrementAndGet();
                } else {
                    missing.add(text);
                }
            }

            if (skippedExisting.get() > 0) {
                emitBatchProgress(
                        packId,
                        completed.get(),
                        total,
                        0,
                        skippedExisting.get(),
                        0,
                        0,
                        ""
                );
            }

            if (!missing.isEmpty() && !cancelFlag.get()) {
                ExecutorService workers = Executors.newFixedThreadPool(2);
                CountDownLatch latch = new CountDownLatch(missing.size());

                for (final String text : missing) {
                    workers.execute(() -> {
                        try {
                            if (cancelFlag.get()) {
                                return;
                            }
                            File saved = downloadClipToCache(text);
                            if (saved != null && isValidAudioFile(saved)) {
                                downloadedNew.incrementAndGet();
                                bytesAdded.addAndGet(saved.length());
                            } else {
                                failed.incrementAndGet();
                            }
                            int done = completed.incrementAndGet();
                            long now = System.currentTimeMillis();
                            long prev = lastEmitMs.get();
                            if (done == total || (now - prev >= 140 && lastEmitMs.compareAndSet(prev, now))) {
                                emitBatchProgress(
                                        packId,
                                        done,
                                        total,
                                        downloadedNew.get(),
                                        skippedExisting.get(),
                                        failed.get(),
                                        bytesAdded.get(),
                                        text
                                );
                            }
                            // Gentle pacing to avoid rate-limiting
                            try {
                                Thread.sleep(65);
                            } catch (InterruptedException ignored) {
                                Thread.currentThread().interrupt();
                            }
                        } finally {
                            latch.countDown();
                        }
                    });
                }

                try {
                    latch.await();
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                } finally {
                    workers.shutdownNow();
                }
            }

            boolean wasCancelled = cancelFlag.get();
            emitBatchProgress(
                    packId,
                    completed.get(),
                    total,
                    downloadedNew.get(),
                    skippedExisting.get(),
                    failed.get(),
                    bytesAdded.get(),
                    ""
            );

            JSObject res = new JSObject();
            res.put("packId", packId);
            res.put("cancelled", wasCancelled);
            res.put("total", total);
            res.put("completed", completed.get());
            res.put("downloadedNew", downloadedNew.get());
            res.put("skippedExisting", skippedExisting.get());
            res.put("failed", failed.get());
            res.put("bytesAdded", bytesAdded.get());
            call.resolve(res);
        });
    }

    private void emitBatchProgress(
            String packId,
            int completed,
            int total,
            int downloadedNew,
            int skippedExisting,
            int failed,
            long bytesAdded,
            String currentText
    ) {
        JSObject payload = new JSObject();
        payload.put("packId", packId);
        payload.put("completed", completed);
        payload.put("total", total);
        payload.put("downloadedNew", downloadedNew);
        payload.put("skippedExisting", skippedExisting);
        payload.put("failed", failed);
        payload.put("bytesAdded", bytesAdded);
        payload.put("currentText", currentText);
        notifyListeners("downloadProgress", payload);
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        currentBatchCancel.set(true);
        call.resolve();
    }

    @PluginMethod
    public void clearTexts(PluginCall call) {
        JSArray arr = call.getArray("texts");
        final List<String> unique = extractUniqueTexts(arr);
        playbackExecutor.execute(() -> {
            int deletedFiles = 0;
            long deletedBytes = 0;
            for (String text : unique) {
                File f = getClipFile(text);
                if (f.exists() && f.isFile()) {
                    long len = f.length();
                    if (f.delete()) {
                        deletedFiles++;
                        deletedBytes += len;
                    }
                }
            }
            JSObject res = new JSObject();
            res.put("deletedFiles", deletedFiles);
            res.put("deletedBytes", deletedBytes);
            call.resolve(res);
        });
    }

    @PluginMethod
    public void clearAll(PluginCall call) {
        currentBatchCancel.set(true);
        playGeneration.incrementAndGet();
        stopActivePlayer(true);

        playbackExecutor.execute(() -> {
            File dir = getAudioCacheDir();
            File[] files = dir.listFiles();
            int deletedFiles = 0;
            long deletedBytes = 0;
            if (files != null) {
                for (File f : files) {
                    if (f.isFile()) {
                        long len = f.length();
                        if (f.delete()) {
                            deletedFiles++;
                            deletedBytes += len;
                        }
                    }
                }
            }
            JSObject res = new JSObject();
            res.put("deletedFiles", deletedFiles);
            res.put("deletedBytes", deletedBytes);
            call.resolve(res);
        });
    }

    private List<String> extractUniqueTexts(JSArray arr) {
        Set<String> set = new LinkedHashSet<>();
        if (arr == null) return new ArrayList<>();
        for (int i = 0; i < arr.length(); i++) {
            try {
                String raw = arr.getString(i);
                if (raw != null) {
                    String trimmed = raw.trim();
                    if (!trimmed.isEmpty()) {
                        set.add(trimmed);
                    }
                }
            } catch (JSONException ignored) {
            }
        }
        return new ArrayList<>(set);
    }

    @Override
    protected void handleOnDestroy() {
        currentBatchCancel.set(true);
        playGeneration.incrementAndGet();
        stopActivePlayer(false);
        playbackExecutor.shutdownNow();
        batchCoordinator.shutdownNow();
        super.handleOnDestroy();
    }
}
