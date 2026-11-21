package com.kanimichi.app;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.media.AudioAttributes;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Native Android Text-to-Speech Capacitor plugin for KaniMichi.
 *
 * Designed specifically for reliable offline Japanese playback across Samsung One UI
 * (com.samsung.SMT), Google Speech Services (com.google.android.tts), and other OEMs:
 * - Always creates/binds TextToSpeech on Android's Main Looper (required by Samsung SMT)
 *   without holding locks across binder callbacks, and protects every init/switch with a
 *   timeout so UI buttons never hang.
 * - Distinguishes offline installed Japanese voices (!isNetworkConnectionRequired) from
 *   network-only voices (which fail offline with ERROR_NETWORK = -4), and automatically
 *   probes other installed engines (such as Samsung TTS) when the default engine only has
 *   network voices.
 * - Automatically retries on an alternate TTS engine if runtime playback hits ERROR_NETWORK (-4).
 */
@CapacitorPlugin(name = "NativeTts")
public class NativeTtsPlugin extends Plugin {

    private static final String PREFS_NAME = "kanimichi_tts_prefs";
    private static final String PREF_ENGINE = "preferred_engine";
    private static final String SAMSUNG_TTS = "com.samsung.SMT";
    private static final String GOOGLE_TTS = "com.google.android.tts";
    private static final long INIT_TIMEOUT_MS = 5000L;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final AtomicInteger initGeneration = new AtomicInteger(0);

    private TextToSpeech tts;
    private volatile boolean isInitialized = false;
    private volatile boolean isInitializing = false;
    private volatile String activeEnginePackage = null;
    private volatile String selectedVoiceName = null;
    private volatile int offlineJapaneseVoiceCount = 0;
    private volatile int onlineJapaneseVoiceCount = 0;
    private volatile String lastError = null;

    private volatile PluginCall pendingSpeakCall = null;
    private volatile boolean pendingSpeakAlreadyRetried = false;
    private volatile PluginCall pendingSwitchCall = null;
    private Runnable initTimeoutRunnable = null;

    private final List<String> fallbackEngineQueue = new ArrayList<>();
    private final LinkedHashMap<String, String> knownEngines = new LinkedHashMap<>();
    private final ConcurrentHashMap<String, PendingUtterance> activeUtterances =
        new ConcurrentHashMap<>();

    private static class PendingUtterance {
        final PluginCall call;
        final String text;
        final float rate;
        final float pitch;
        final boolean alreadyRetriedEngine;

        PendingUtterance(
            PluginCall call,
            String text,
            float rate,
            float pitch,
            boolean alreadyRetriedEngine
        ) {
            this.call = call;
            this.text = text;
            this.rate = rate;
            this.pitch = pitch;
            this.alreadyRetriedEngine = alreadyRetriedEngine;
        }
    }

    @Override
    public void load() {
        discoverInstalledEnginesViaPackageManager();
        String saved = getSavedPreferredEngine();
        startInitializationOnMainThread(saved, true);
    }

    private String getSavedPreferredEngine() {
        Context ctx = getContext();
        if (ctx == null) return null;
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String val = prefs.getString(PREF_ENGINE, null);
        return (val != null && !val.trim().isEmpty()) ? val.trim() : null;
    }

    private void savePreferredEngine(String enginePkg) {
        Context ctx = getContext();
        if (ctx == null) return;
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        if (enginePkg == null || enginePkg.trim().isEmpty()) {
            prefs.edit().remove(PREF_ENGINE).apply();
        } else {
            prefs.edit().putString(PREF_ENGINE, enginePkg.trim()).apply();
        }
    }

    private void discoverInstalledEnginesViaPackageManager() {
        Context ctx = getContext();
        if (ctx == null) return;
        try {
            PackageManager pm = ctx.getPackageManager();
            Intent intent = new Intent(TextToSpeech.Engine.INTENT_ACTION_TTS_SERVICE);
            List<ResolveInfo> services = pm.queryIntentServices(intent, 0);
            if (services != null) {
                for (ResolveInfo ri : services) {
                    if (ri == null || ri.serviceInfo == null) continue;
                    String pkg = ri.serviceInfo.packageName;
                    if (pkg == null || pkg.isEmpty()) continue;
                    CharSequence labelCs = ri.loadLabel(pm);
                    String label =
                        labelCs != null && labelCs.length() > 0 ? labelCs.toString() : pkg;
                    knownEngines.put(pkg, label);
                }
            }
        } catch (Exception ignored) {
            // Ignore restricted PM queries
        }
    }

    private void mergeEnginesFromTts(TextToSpeech engine) {
        if (engine == null) return;
        try {
            List<TextToSpeech.EngineInfo> engines = engine.getEngines();
            if (engines != null) {
                for (TextToSpeech.EngineInfo info : engines) {
                    if (info == null || info.name == null || info.name.isEmpty()) continue;
                    String label =
                        (info.label != null && !info.label.isEmpty()) ? info.label : info.name;
                    knownEngines.put(info.name, label);
                }
            }
        } catch (Exception ignored) {
            // Ignore
        }
    }

    private void cancelInitTimeout() {
        if (initTimeoutRunnable != null) {
            mainHandler.removeCallbacks(initTimeoutRunnable);
            initTimeoutRunnable = null;
        }
    }

    private void shutdownCurrentTtsOnMain() {
        clearAllActiveUtterances();
        if (tts != null) {
            try {
                tts.stop();
                tts.shutdown();
            } catch (Exception ignored) {
                // Ignore
            }
            tts = null;
        }
        isInitialized = false;
        selectedVoiceName = null;
        offlineJapaneseVoiceCount = 0;
        onlineJapaneseVoiceCount = 0;
    }

    private void startInitializationOnMainThread(
        final String targetEngine,
        final boolean allowAutoProbe
    ) {
        final int gen = initGeneration.incrementAndGet();
        mainHandler.post(() -> {
            if (gen != initGeneration.get()) return;
            Context ctx = getContext();
            if (ctx == null) return;

            cancelInitTimeout();
            shutdownCurrentTtsOnMain();
            discoverInstalledEnginesViaPackageManager();

            isInitializing = true;
            lastError = null;
            activeEnginePackage = targetEngine;

            // Watchdog timeout so Samsung/OEM bind delays never freeze the Settings UI
            initTimeoutRunnable = () -> {
                if (gen != initGeneration.get() || !isInitializing) return;
                isInitializing = false;
                isInitialized = false;
                lastError =
                    "Waktu tunggu koneksi mesin suara habis (" +
                    (targetEngine != null ? targetEngine : "default") +
                    ").";
                if (allowAutoProbe && tryNextFallbackEngine()) {
                    return;
                }
                resolvePendingSwitch(false);
                flushPendingSpeakCall(false, lastError);
            };
            mainHandler.postDelayed(initTimeoutRunnable, INIT_TIMEOUT_MS);

            final Context appCtx = ctx.getApplicationContext();
            final TextToSpeech.OnInitListener listener = status ->
                mainHandler.post(() -> handleTtsInitResult(gen, status, targetEngine, allowAutoProbe));

            try {
                if (targetEngine != null && !targetEngine.isEmpty()) {
                    tts = new TextToSpeech(appCtx, listener, targetEngine);
                } else {
                    tts = new TextToSpeech(appCtx, listener);
                }
            } catch (Exception e) {
                cancelInitTimeout();
                isInitializing = false;
                isInitialized = false;
                lastError = "Gagal membuka mesin TTS: " + e.getMessage();
                if (allowAutoProbe && tryNextFallbackEngine()) {
                    return;
                }
                resolvePendingSwitch(false);
                flushPendingSpeakCall(false, lastError);
            }
        });
    }

    private void handleTtsInitResult(
        int gen,
        int status,
        String requestedEngine,
        boolean allowAutoProbe
    ) {
        if (gen != initGeneration.get()) {
            return;
        }
        cancelInitTimeout();
        isInitializing = false;

        if (status != TextToSpeech.SUCCESS || tts == null) {
            isInitialized = false;
            lastError =
                "Mesin suara tidak merespons (" +
                (requestedEngine != null ? requestedEngine : "default") +
                ").";
            if (allowAutoProbe && tryNextFallbackEngine()) {
                return;
            }
            resolvePendingSwitch(false);
            flushPendingSpeakCall(false, lastError);
            return;
        }

        mergeEnginesFromTts(tts);

        String boundEngine = requestedEngine;
        if (boundEngine == null || boundEngine.isEmpty()) {
            try {
                boundEngine = tts.getDefaultEngine();
            } catch (Exception ignored) {
                boundEngine = null;
            }
        }
        activeEnginePackage = boundEngine;
        isInitialized = true;

        applyMediaAudioAttributes();
        inspectJapaneseVoiceCounts(tts);

        // Distinguish true OFFLINE Japanese readiness from online-only voices (which fail with -4 offline)
        boolean hasOfflineJa = hasOfflineJapaneseSupport(tts, boundEngine);
        if (!hasOfflineJa && allowAutoProbe) {
            if (fallbackEngineQueue.isEmpty()) {
                buildFallbackProbeQueue(boundEngine);
            }
            if (tryNextFallbackEngine()) {
                return;
            }
        }

        configureBestJapaneseVoice();
        attachUtteranceListener();

        if (hasOfflineJa && activeEnginePackage != null && !activeEnginePackage.isEmpty()) {
            savePreferredEngine(activeEnginePackage);
        }

        resolvePendingSwitch(true);

        PluginCall queued = pendingSpeakCall;
        boolean retried = pendingSpeakAlreadyRetried;
        pendingSpeakCall = null;
        pendingSpeakAlreadyRetried = false;
        if (queued != null) {
            executeSpeak(queued, retried);
        }
    }

    private void buildFallbackProbeQueue(String alreadyTriedEngine) {
        fallbackEngineQueue.clear();
        LinkedHashSet<String> candidates = new LinkedHashSet<>();

        if (knownEngines.containsKey(SAMSUNG_TTS)) {
            candidates.add(SAMSUNG_TTS);
        }
        if (knownEngines.containsKey(GOOGLE_TTS)) {
            candidates.add(GOOGLE_TTS);
        }
        for (String pkg : knownEngines.keySet()) {
            if (pkg != null && !pkg.isEmpty()) {
                candidates.add(pkg);
            }
        }
        if (alreadyTriedEngine != null) {
            candidates.remove(alreadyTriedEngine);
        }
        fallbackEngineQueue.addAll(candidates);
    }

    private boolean tryNextFallbackEngine() {
        if (fallbackEngineQueue.isEmpty()) {
            return false;
        }
        String nextEngine = fallbackEngineQueue.remove(0);
        startInitializationOnMainThread(nextEngine, true);
        return true;
    }

    private String findAlternateEngine(String currentEngine) {
        discoverInstalledEnginesViaPackageManager();
        if (knownEngines.containsKey(SAMSUNG_TTS) && !SAMSUNG_TTS.equals(currentEngine)) {
            return SAMSUNG_TTS;
        }
        if (knownEngines.containsKey(GOOGLE_TTS) && !GOOGLE_TTS.equals(currentEngine)) {
            return GOOGLE_TTS;
        }
        for (String pkg : knownEngines.keySet()) {
            if (pkg != null && !pkg.isEmpty() && !pkg.equals(currentEngine)) {
                return pkg;
            }
        }
        return null;
    }

    private void applyMediaAudioAttributes() {
        if (tts == null) return;
        try {
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build();
            tts.setAudioAttributes(attrs);
        } catch (Exception ignored) {
            // Ignore on restricted OEMs
        }
    }

    private String mapTtsErrorCode(int errorCode) {
        switch (errorCode) {
            case TextToSpeech.ERROR_NETWORK:
            case TextToSpeech.ERROR_NETWORK_TIMEOUT:
                return "Suara Bahasa Jepang pada mesin ini hanya tersedia online (error jaringan " +
                errorCode +
                "). Pilih mesin Samsung TTS atau unduh data suara Jepang offline di Pengaturan TTS Android.";
            case TextToSpeech.ERROR_NOT_INSTALLED_YET:
                return "Paket data suara Bahasa Jepang pada mesin ini belum terpasang.";
            case TextToSpeech.ERROR_SYNTHESIS:
                return "Mesin suara gagal memproses teks Bahasa Jepang (error " + errorCode + ").";
            case TextToSpeech.ERROR_OUTPUT:
                return "Gagal mengirim audio ke speaker perangkat (error " + errorCode + ").";
            case TextToSpeech.ERROR_SERVICE:
                return "Layanan TTS Android tidak tersedia (error " + errorCode + ").";
            default:
                return "Gagal memutar audio TTS (kode " + errorCode + ").";
        }
    }

    private void attachUtteranceListener() {
        if (tts == null) return;
        tts.setOnUtteranceProgressListener(
            new UtteranceProgressListener() {
                @Override
                public void onStart(String utteranceId) {
                    // Started
                }

                @Override
                public void onDone(String utteranceId) {
                    resolveActiveUtterance(utteranceId, true, null);
                }

                @Override
                @Deprecated
                public void onError(String utteranceId) {
                    handleUtteranceError(utteranceId, TextToSpeech.ERROR);
                }

                @Override
                public void onError(String utteranceId, int errorCode) {
                    handleUtteranceError(utteranceId, errorCode);
                }

                @Override
                public void onStop(String utteranceId, boolean interrupted) {
                    resolveActiveUtterance(utteranceId, true, null);
                }
            }
        );
    }

    private void handleUtteranceError(String utteranceId, int errorCode) {
        PendingUtterance pending = utteranceId != null ? activeUtterances.remove(utteranceId) : null;
        String friendlyMsg = mapTtsErrorCode(errorCode);
        lastError = friendlyMsg;

        if (pending == null) return;

        // If playback failed because of network-only voice (-4/-5) or missing data (-9),
        // automatically retry ONCE on an alternate installed engine (e.g. Google -> Samsung TTS)
        boolean isRetryableOfflineError =
            errorCode == TextToSpeech.ERROR_NETWORK ||
            errorCode == TextToSpeech.ERROR_NETWORK_TIMEOUT ||
            errorCode == TextToSpeech.ERROR_NOT_INSTALLED_YET;

        if (isRetryableOfflineError && !pending.alreadyRetriedEngine) {
            String altEngine = findAlternateEngine(activeEnginePackage);
            if (altEngine != null) {
                mainHandler.post(() -> {
                    pendingSpeakCall = pending.call;
                    pendingSpeakAlreadyRetried = true;
                    fallbackEngineQueue.clear();
                    startInitializationOnMainThread(altEngine, false);
                });
                return;
            }
        }

        JSObject res = new JSObject();
        res.put("spoken", false);
        res.put("engine", activeEnginePackage);
        res.put("voice", selectedVoiceName);
        res.put("errorCode", errorCode);
        res.put("reason", friendlyMsg);
        pending.call.resolve(res);
    }

    private boolean isJapaneseLocale(Locale loc) {
        if (loc == null) return false;
        String lang = loc.getLanguage();
        if ("ja".equalsIgnoreCase(lang) || "jpn".equalsIgnoreCase(lang)) {
            return true;
        }
        try {
            String iso3 = loc.getISO3Language();
            return "jpn".equalsIgnoreCase(iso3);
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean isVoiceInstalled(Voice voice) {
        if (voice == null) return false;
        try {
            Set<String> features = voice.getFeatures();
            if (features != null) {
                for (String f : features) {
                    if (
                        TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED.equals(f) ||
                        "notInstalled".equalsIgnoreCase(f)
                    ) {
                        return false;
                    }
                }
            }
        } catch (Exception ignored) {
            // Assume installed if features cannot be inspected
        }
        return true;
    }

    private void inspectJapaneseVoiceCounts(TextToSpeech engine) {
        int offline = 0;
        int online = 0;
        if (engine != null) {
            try {
                Set<Voice> voices = engine.getVoices();
                if (voices != null) {
                    for (Voice v : voices) {
                        if (v == null || !isJapaneseLocale(v.getLocale())) continue;
                        if (!isVoiceInstalled(v)) continue;
                        if (v.isNetworkConnectionRequired()) {
                            online++;
                        } else {
                            offline++;
                        }
                    }
                }
            } catch (Exception ignored) {
                // Ignore
            }
        }
        offlineJapaneseVoiceCount = offline;
        onlineJapaneseVoiceCount = online;
    }

    private boolean isJapaneseLangAvailable(TextToSpeech engine) {
        if (engine == null) return false;
        try {
            int avail = engine.isLanguageAvailable(Locale.JAPAN);
            if (
                avail == TextToSpeech.LANG_AVAILABLE ||
                avail == TextToSpeech.LANG_COUNTRY_AVAILABLE ||
                avail == TextToSpeech.LANG_COUNTRY_VAR_AVAILABLE
            ) {
                return true;
            }
            int availLang = engine.isLanguageAvailable(Locale.JAPANESE);
            if (
                availLang == TextToSpeech.LANG_AVAILABLE ||
                availLang == TextToSpeech.LANG_COUNTRY_AVAILABLE ||
                availLang == TextToSpeech.LANG_COUNTRY_VAR_AVAILABLE
            ) {
                return true;
            }
        } catch (Exception ignored) {
            // Ignore
        }
        return false;
    }

    private boolean hasOfflineJapaneseSupport(TextToSpeech engine, String enginePkg) {
        if (engine == null) return false;
        inspectJapaneseVoiceCounts(engine);
        if (offlineJapaneseVoiceCount > 0) {
            return true;
        }
        // Samsung TTS sometimes does not populate getVoices() even when Japanese is installed offline
        if (onlineJapaneseVoiceCount == 0 && SAMSUNG_TTS.equals(enginePkg)) {
            return isJapaneseLangAvailable(engine);
        }
        return false;
    }

    private Voice findBestJapaneseVoice(TextToSpeech engine, boolean offlineOnly) {
        if (engine == null) return null;
        try {
            Set<Voice> voices = engine.getVoices();
            if (voices == null || voices.isEmpty()) return null;

            Voice best = null;
            int bestScore = Integer.MIN_VALUE;

            for (Voice voice : voices) {
                if (voice == null || !isJapaneseLocale(voice.getLocale())) continue;
                if (!isVoiceInstalled(voice)) continue;
                if (offlineOnly && voice.isNetworkConnectionRequired()) continue;

                int score = 0;
                if (!voice.isNetworkConnectionRequired()) {
                    score += 1000;
                }
                if ("JP".equalsIgnoreCase(voice.getLocale().getCountry())) {
                    score += 100;
                }
                score += voice.getQuality();
                score -= voice.getLatency();

                if (score > bestScore) {
                    bestScore = score;
                    best = voice;
                }
            }
            return best;
        } catch (Exception ignored) {
            return null;
        }
    }

    private void configureBestJapaneseVoice() {
        if (tts == null || !isInitialized) return;
        selectedVoiceName = null;

        try {
            int langRes = tts.setLanguage(Locale.JAPAN);
            if (
                langRes == TextToSpeech.LANG_MISSING_DATA ||
                langRes == TextToSpeech.LANG_NOT_SUPPORTED
            ) {
                tts.setLanguage(Locale.JAPANESE);
            }
        } catch (Exception ignored) {
            // Ignore
        }

        // Strongly prefer offline voice first!
        try {
            Voice offlineVoice = findBestJapaneseVoice(tts, true);
            if (offlineVoice != null && tts.setVoice(offlineVoice) == TextToSpeech.SUCCESS) {
                selectedVoiceName = offlineVoice.getName();
                return;
            }
            Voice anyVoice = findBestJapaneseVoice(tts, false);
            if (anyVoice != null && tts.setVoice(anyVoice) == TextToSpeech.SUCCESS) {
                selectedVoiceName = anyVoice.getName();
                return;
            }
        } catch (Exception ignored) {
            // Fall back to Locale.JAPAN
        }

        selectedVoiceName = "ja-JP";
    }

    private void resolvePendingSwitch(boolean ok) {
        PluginCall call = pendingSwitchCall;
        pendingSwitchCall = null;
        if (call != null) {
            JSObject statusObj = buildStatusPayload();
            statusObj.put("switched", ok);
            call.resolve(statusObj);
        }
    }

    private void flushPendingSpeakCall(boolean spoken, String reason) {
        PluginCall queued = pendingSpeakCall;
        pendingSpeakCall = null;
        if (queued != null) {
            JSObject res = new JSObject();
            res.put("spoken", spoken);
            res.put("engine", activeEnginePackage);
            if (reason != null) {
                res.put("reason", reason);
            }
            queued.resolve(res);
        }
    }

    private void resolveActiveUtterance(String utteranceId, boolean spoken, String reason) {
        if (utteranceId == null) return;
        PendingUtterance pending = activeUtterances.remove(utteranceId);
        if (pending != null) {
            JSObject res = new JSObject();
            res.put("spoken", spoken);
            res.put("engine", activeEnginePackage);
            res.put("voice", selectedVoiceName);
            if (reason != null) {
                res.put("reason", reason);
            }
            pending.call.resolve(res);
        }
    }

    private void clearAllActiveUtterances() {
        for (String id : activeUtterances.keySet()) {
            resolveActiveUtterance(id, true, "stopped");
        }
    }

    private void executeSpeak(PluginCall call, boolean alreadyRetriedEngine) {
        String text = call.getString("text", "");
        if (text == null || text.trim().isEmpty()) {
            JSObject res = new JSObject();
            res.put("spoken", false);
            call.resolve(res);
            return;
        }

        if (tts == null || !isInitialized) {
            JSObject res = new JSObject();
            res.put("spoken", false);
            res.put("reason", lastError != null ? lastError : "Engine TTS belum siap.");
            call.resolve(res);
            return;
        }

        Float rawRate = call.getFloat("rate", 0.92f);
        Float rawPitch = call.getFloat("pitch", 1.0f);
        float rate = Math.max(0.5f, Math.min(2.0f, rawRate != null ? rawRate : 0.92f));
        float pitch = Math.max(0.5f, Math.min(2.0f, rawPitch != null ? rawPitch : 1.0f));

        try {
            clearAllActiveUtterances();
            applyMediaAudioAttributes();
            configureBestJapaneseVoice();
            tts.setSpeechRate(rate);
            tts.setPitch(pitch);

            String utteranceId = "km_" + UUID.randomUUID().toString();
            activeUtterances.put(
                utteranceId,
                new PendingUtterance(call, text.trim(), rate, pitch, alreadyRetriedEngine)
            );

            Bundle params = new Bundle();
            params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);

            int result = tts.speak(text.trim(), TextToSpeech.QUEUE_FLUSH, params, utteranceId);
            if (result != TextToSpeech.SUCCESS) {
                tts.setLanguage(Locale.JAPAN);
                result = tts.speak(text.trim(), TextToSpeech.QUEUE_FLUSH, params, utteranceId);
            }

            if (result != TextToSpeech.SUCCESS) {
                lastError = "TextToSpeech.speak gagal pada mesin " + activeEnginePackage;
                resolveActiveUtterance(utteranceId, false, lastError);
            } else {
                lastError = null;
            }
        } catch (Exception e) {
            lastError = e.getMessage();
            JSObject res = new JSObject();
            res.put("spoken", false);
            res.put("engine", activeEnginePackage);
            res.put("reason", lastError);
            call.resolve(res);
        }
    }

    private JSObject buildStatusPayload() {
        discoverInstalledEnginesViaPackageManager();
        if (tts != null && isInitialized) {
            mergeEnginesFromTts(tts);
            inspectJapaneseVoiceCounts(tts);
        }

        JSObject res = new JSObject();
        res.put("ready", isInitialized);
        res.put("engine", activeEnginePackage != null ? activeEnginePackage : "");

        String activeLabel = activeEnginePackage != null ? activeEnginePackage : "";
        JSArray engineList = new JSArray();
        for (Map.Entry<String, String> entry : knownEngines.entrySet()) {
            JSObject item = new JSObject();
            item.put("name", entry.getKey());
            item.put("label", entry.getValue());
            engineList.put(item);
            if (entry.getKey().equals(activeEnginePackage)) {
                activeLabel = entry.getValue();
            }
        }
        res.put("engineLabel", activeLabel);
        res.put("engines", engineList);

        boolean hasOfflineJa = isInitialized && tts != null && hasOfflineJapaneseSupport(tts, activeEnginePackage);
        boolean hasAnyJa =
            hasOfflineJa ||
            onlineJapaneseVoiceCount > 0 ||
            (isInitialized && tts != null && isJapaneseLangAvailable(tts));

        res.put("hasJapaneseVoice", hasAnyJa);
        res.put("hasOfflineJapaneseVoice", hasOfflineJa);
        res.put("offlineVoiceCount", offlineJapaneseVoiceCount);
        res.put("onlineVoiceCount", onlineJapaneseVoiceCount);
        res.put("selectedVoiceName", selectedVoiceName != null ? selectedVoiceName : "");
        if (lastError != null) {
            res.put("lastError", lastError);
        }
        return res;
    }

    @PluginMethod
    public void speak(PluginCall call) {
        if (isInitialized && tts != null) {
            mainHandler.post(() -> executeSpeak(call, false));
            return;
        }
        if (pendingSpeakCall != null) {
            flushPendingSpeakCall(false, "superseded");
        }
        pendingSpeakCall = call;
        if (!isInitializing) {
            fallbackEngineQueue.clear();
            startInitializationOnMainThread(getSavedPreferredEngine(), true);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        flushPendingSpeakCall(false, "stopped");
        clearAllActiveUtterances();
        mainHandler.post(() -> {
            if (tts != null && isInitialized) {
                try {
                    tts.stop();
                } catch (Exception ignored) {
                    // Ignore
                }
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        if (!isInitialized && !isInitializing) {
            fallbackEngineQueue.clear();
            startInitializationOnMainThread(getSavedPreferredEngine(), true);
        }
        call.resolve(buildStatusPayload());
    }

    @PluginMethod
    public void setEngine(PluginCall call) {
        String enginePkg = call.getString("engine", "");
        if (pendingSwitchCall != null) {
            resolvePendingSwitch(false);
        }
        if (enginePkg == null || enginePkg.trim().isEmpty()) {
            savePreferredEngine(null);
            fallbackEngineQueue.clear();
            pendingSwitchCall = call;
            startInitializationOnMainThread(null, true);
            return;
        }
        String cleanPkg = enginePkg.trim();
        savePreferredEngine(cleanPkg);
        fallbackEngineQueue.clear();
        pendingSwitchCall = call;
        startInitializationOnMainThread(cleanPkg, false);
    }

    @PluginMethod
    public void openInstallVoiceData(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Activity unavailable");
            return;
        }
        String mode = call.getString("mode", "settings");
        getActivity().runOnUiThread(() -> {
            Intent primary = "install".equals(mode)
                ? new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA)
                : new Intent("com.android.settings.TTS_SETTINGS");
            Intent fallback = "install".equals(mode)
                ? new Intent("com.android.settings.TTS_SETTINGS")
                : new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA);

            try {
                primary.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(primary);
                call.resolve();
            } catch (ActivityNotFoundException e) {
                try {
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getActivity().startActivity(fallback);
                    call.resolve();
                } catch (Exception ex) {
                    call.reject("Unable to open Android TTS settings: " + ex.getMessage());
                }
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        cancelInitTimeout();
        mainHandler.post(this::shutdownCurrentTtsOnMain);
        super.handleOnDestroy();
    }
}
