package com.kanimichi.app;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.os.Bundle;
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
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Native Android Text-to-Speech Capacitor plugin for KaniMichi.
 *
 * Key Android/Samsung compatibility features:
 * - Automatically probes ALL installed TTS engines (e.g., Samsung TTS com.samsung.SMT
 *   and Google Speech Services com.google.android.tts) if the system default engine does
 *   not have Japanese (ja-JP) installed.
 * - Explicitly routes speech to AudioAttributes.USAGE_MEDIA + CONTENT_TYPE_SPEECH so
 *   Samsung One UI plays audio reliably through the Media volume channel even in Vibrate mode.
 * - Avoids Samsung-incompatible Bundle params (like KEY_FEATURE_NETWORK_SYNTHESIS) and
 *   falls back cleanly from Voice selection to Locale.JAPAN if an OEM engine rejects setVoice().
 */
@CapacitorPlugin(name = "NativeTts")
public class NativeTtsPlugin extends Plugin {

    private static final String PREFS_NAME = "kanimichi_tts_prefs";
    private static final String PREF_ENGINE = "preferred_engine";
    private static final String SAMSUNG_TTS = "com.samsung.SMT";
    private static final String GOOGLE_TTS = "com.google.android.tts";

    private TextToSpeech tts;
    private volatile boolean isInitialized = false;
    private volatile boolean isInitializing = false;
    private volatile boolean initFailed = false;
    private volatile String activeEnginePackage = null;
    private volatile String selectedVoiceName = null;
    private volatile String lastError = null;
    private volatile PluginCall pendingSpeakCall = null;
    private volatile PluginCall pendingSwitchCall = null;

    private final List<String> fallbackEngineQueue = new ArrayList<>();
    private final List<TextToSpeech.EngineInfo> knownEngines = new ArrayList<>();
    private final ConcurrentHashMap<String, PluginCall> activeCalls = new ConcurrentHashMap<>();

    @Override
    public void load() {
        String saved = getSavedPreferredEngine();
        startInitialization(saved, true);
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

    private synchronized void shutdownCurrentTts() {
        clearAllActiveCalls();
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
    }

    private synchronized void startInitialization(String targetEngine, boolean allowAutoProbe) {
        Context ctx = getContext();
        if (ctx == null) return;

        shutdownCurrentTts();
        isInitializing = true;
        initFailed = false;
        lastError = null;
        activeEnginePackage = targetEngine;

        final Context appCtx = ctx.getApplicationContext();
        final TextToSpeech.OnInitListener listener = status ->
            handleTtsInitResult(status, targetEngine, allowAutoProbe);

        try {
            if (targetEngine != null && !targetEngine.isEmpty()) {
                tts = new TextToSpeech(appCtx, listener, targetEngine);
            } else {
                tts = new TextToSpeech(appCtx, listener);
            }
        } catch (Exception e) {
            isInitializing = false;
            initFailed = true;
            lastError = "Gagal membuat engine TTS: " + e.getMessage();
            resolvePendingSwitch(false);
            flushPendingSpeakCall(false, lastError);
        }
    }

    private synchronized void handleTtsInitResult(
        int status,
        String requestedEngine,
        boolean allowAutoProbe
    ) {
        isInitializing = false;

        if (status != TextToSpeech.SUCCESS || tts == null) {
            isInitialized = false;
            lastError =
                "Engine TTS gagal inisialisasi (" +
                (requestedEngine != null ? requestedEngine : "default") +
                ", status=" +
                status +
                ")";
            if (allowAutoProbe && tryNextFallbackEngine()) {
                return;
            }
            initFailed = true;
            resolvePendingSwitch(false);
            flushPendingSpeakCall(false, lastError);
            return;
        }

        // Capture full list of installed TTS engines on this device
        try {
            List<TextToSpeech.EngineInfo> engines = tts.getEngines();
            if (engines != null && !engines.isEmpty()) {
                knownEngines.clear();
                knownEngines.addAll(engines);
            }
        } catch (Exception ignored) {
            // Ignore
        }

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
        initFailed = false;

        // Route TTS explicitly to Media stream so Samsung One UI plays even in Vibrate mode
        applyMediaAudioAttributes();

        // Check whether this engine actually has Japanese available
        boolean hasJa = checkJapaneseAvailable(tts);
        if (!hasJa && allowAutoProbe) {
            // Build fallback probe queue once from all installed engines
            if (fallbackEngineQueue.isEmpty()) {
                buildFallbackProbeQueue(boundEngine);
            }
            if (tryNextFallbackEngine()) {
                return;
            }
        }

        // Configure Japanese language / voice and utterance callbacks
        configureBestJapaneseVoice();
        attachUtteranceListener();

        if (hasJa && activeEnginePackage != null && !activeEnginePackage.isEmpty()) {
            savePreferredEngine(activeEnginePackage);
        }

        resolvePendingSwitch(true);

        PluginCall queued = pendingSpeakCall;
        pendingSpeakCall = null;
        if (queued != null) {
            executeSpeak(queued);
        }
    }

    private void buildFallbackProbeQueue(String alreadyTriedEngine) {
        fallbackEngineQueue.clear();
        LinkedHashSet<String> candidates = new LinkedHashSet<>();

        // Prefer Samsung TTS and Google TTS first when present on device
        for (TextToSpeech.EngineInfo info : knownEngines) {
            if (info != null && SAMSUNG_TTS.equals(info.name)) {
                candidates.add(info.name);
            }
        }
        for (TextToSpeech.EngineInfo info : knownEngines) {
            if (info != null && GOOGLE_TTS.equals(info.name)) {
                candidates.add(info.name);
            }
        }
        for (TextToSpeech.EngineInfo info : knownEngines) {
            if (info != null && info.name != null && !info.name.isEmpty()) {
                candidates.add(info.name);
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
        startInitialization(nextEngine, true);
        return true;
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
            // Ignore on OEMs that restrict setAudioAttributes
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
                    resolveActiveCall(utteranceId, true, null);
                }

                @Override
                @Deprecated
                public void onError(String utteranceId) {
                    lastError = "Playback error pada engine TTS.";
                    resolveActiveCall(utteranceId, false, lastError);
                }

                @Override
                public void onError(String utteranceId, int errorCode) {
                    lastError = "TTS error code: " + errorCode;
                    resolveActiveCall(utteranceId, false, lastError);
                }

                @Override
                public void onStop(String utteranceId, boolean interrupted) {
                    resolveActiveCall(utteranceId, true, null);
                }
            }
        );
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

    private boolean checkJapaneseAvailable(TextToSpeech engine) {
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
            // Fall through to voice inspection
        }
        return findBestJapaneseVoice(engine, false) != null;
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

    private boolean configureBestJapaneseVoice() {
        if (tts == null || !isInitialized) return false;
        selectedVoiceName = null;

        // Always set Japanese locale first (required by Samsung SMT before speak/setVoice)
        try {
            int langRes = tts.setLanguage(Locale.JAPAN);
            if (langRes == TextToSpeech.LANG_MISSING_DATA || langRes == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts.setLanguage(Locale.JAPANESE);
            }
        } catch (Exception ignored) {
            // Ignore
        }

        // Prefer an installed offline Japanese voice if the engine exposes voices
        try {
            Voice offlineVoice = findBestJapaneseVoice(tts, true);
            if (offlineVoice != null) {
                if (tts.setVoice(offlineVoice) == TextToSpeech.SUCCESS) {
                    selectedVoiceName = offlineVoice.getName();
                    return true;
                }
            }
            Voice anyVoice = findBestJapaneseVoice(tts, false);
            if (anyVoice != null) {
                if (tts.setVoice(anyVoice) == TextToSpeech.SUCCESS) {
                    selectedVoiceName = anyVoice.getName();
                    return !anyVoice.isNetworkConnectionRequired();
                }
            }
        } catch (Exception ignored) {
            // Fall back cleanly to Locale.JAPAN
        }

        selectedVoiceName = "ja-JP";
        return checkJapaneseAvailable(tts);
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

    private void resolveActiveCall(String utteranceId, boolean spoken, String reason) {
        if (utteranceId == null) return;
        PluginCall call = activeCalls.remove(utteranceId);
        if (call != null) {
            JSObject res = new JSObject();
            res.put("spoken", spoken);
            res.put("engine", activeEnginePackage);
            res.put("voice", selectedVoiceName);
            if (reason != null) {
                res.put("reason", reason);
            }
            call.resolve(res);
        }
    }

    private void clearAllActiveCalls() {
        for (String id : activeCalls.keySet()) {
            resolveActiveCall(id, true, "stopped");
        }
    }

    private void executeSpeak(PluginCall call) {
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

        float rate = call.getFloat("rate", 0.92f);
        float pitch = call.getFloat("pitch", 1.0f);
        rate = Math.max(0.5f, Math.min(2.0f, rate));
        pitch = Math.max(0.5f, Math.min(2.0f, pitch));

        try {
            clearAllActiveCalls();
            applyMediaAudioAttributes();
            configureBestJapaneseVoice();
            tts.setSpeechRate(rate);
            tts.setPitch(pitch);

            String utteranceId = "km_" + UUID.randomUUID().toString();
            activeCalls.put(utteranceId, call);

            // Clean Bundle with ONLY UTTERANCE_ID (Samsung SMT rejects KEY_FEATURE_NETWORK_SYNTHESIS)
            Bundle params = new Bundle();
            params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);

            int result = tts.speak(text.trim(), TextToSpeech.QUEUE_FLUSH, params, utteranceId);
            if (result != TextToSpeech.SUCCESS) {
                // Fallback retry using plain Locale.JAPAN without explicit Voice object
                tts.setLanguage(Locale.JAPAN);
                result = tts.speak(text.trim(), TextToSpeech.QUEUE_FLUSH, params, utteranceId);
            }

            if (result != TextToSpeech.SUCCESS) {
                lastError = "TextToSpeech.speak gagal pada engine " + activeEnginePackage;
                resolveActiveCall(utteranceId, false, lastError);
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
        JSObject res = new JSObject();
        res.put("ready", isInitialized);
        res.put("engine", activeEnginePackage != null ? activeEnginePackage : "");

        String activeLabel = activeEnginePackage != null ? activeEnginePackage : "";
        JSArray engineList = new JSArray();
        for (TextToSpeech.EngineInfo info : knownEngines) {
            if (info == null || info.name == null) continue;
            JSObject item = new JSObject();
            item.put("name", info.name);
            item.put("label", info.label != null ? info.label : info.name);
            engineList.put(item);
            if (info.name.equals(activeEnginePackage) && info.label != null) {
                activeLabel = info.label;
            }
        }
        res.put("engineLabel", activeLabel);
        res.put("engines", engineList);

        boolean hasOfflineJa = false;
        boolean hasAnyJa = false;
        if (isInitialized && tts != null) {
            hasAnyJa = checkJapaneseAvailable(tts);
            Voice offlineVoice = findBestJapaneseVoice(tts, true);
            hasOfflineJa = offlineVoice != null || (hasAnyJa && SAMSUNG_TTS.equals(activeEnginePackage));
        }

        res.put("hasJapaneseVoice", hasAnyJa);
        res.put("hasOfflineJapaneseVoice", hasOfflineJa);
        res.put("selectedVoiceName", selectedVoiceName != null ? selectedVoiceName : "");
        if (lastError != null) {
            res.put("lastError", lastError);
        }
        return res;
    }

    @PluginMethod
    public void speak(PluginCall call) {
        if (isInitialized && tts != null) {
            executeSpeak(call);
            return;
        }
        if (pendingSpeakCall != null) {
            flushPendingSpeakCall(false, "superseded");
        }
        pendingSpeakCall = call;
        if (!isInitializing) {
            fallbackEngineQueue.clear();
            startInitialization(getSavedPreferredEngine(), true);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        flushPendingSpeakCall(false, "stopped");
        clearAllActiveCalls();
        if (tts != null && isInitialized) {
            try {
                tts.stop();
            } catch (Exception ignored) {
                // Ignore
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        if (!isInitialized && !isInitializing) {
            fallbackEngineQueue.clear();
            startInitialization(getSavedPreferredEngine(), true);
        }
        call.resolve(buildStatusPayload());
    }

    @PluginMethod
    public void setEngine(PluginCall call) {
        String enginePkg = call.getString("engine", "");
        if (enginePkg == null || enginePkg.trim().isEmpty()) {
            savePreferredEngine(null);
            fallbackEngineQueue.clear();
            pendingSwitchCall = call;
            startInitialization(null, true);
            return;
        }
        String cleanPkg = enginePkg.trim();
        savePreferredEngine(cleanPkg);
        fallbackEngineQueue.clear();
        pendingSwitchCall = call;
        startInitialization(cleanPkg, false);
    }

    @PluginMethod
    public void openInstallVoiceData(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Activity unavailable");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                Intent settingsIntent = new Intent("com.android.settings.TTS_SETTINGS");
                settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(settingsIntent);
                call.resolve();
            } catch (ActivityNotFoundException e) {
                try {
                    Intent installIntent = new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA);
                    installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getActivity().startActivity(installIntent);
                    call.resolve();
                } catch (Exception ex) {
                    call.reject("Unable to open Android TTS settings: " + ex.getMessage());
                }
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        shutdownCurrentTts();
        super.handleOnDestroy();
    }
}
