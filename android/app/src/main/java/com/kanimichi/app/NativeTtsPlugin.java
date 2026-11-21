package com.kanimichi.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Native Android Text-to-Speech Capacitor plugin for KaniMichi.
 * Uses Android's built-in TextToSpeech engine directly (avoiding Android WebView's
 * missing/online-only Web Speech API) and strongly prioritizes installed offline
 * Japanese (ja-JP) voices so pronunciation and listening work 100% offline.
 */
@CapacitorPlugin(name = "NativeTts")
public class NativeTtsPlugin extends Plugin implements TextToSpeech.OnInitListener {

    private TextToSpeech tts;
    private volatile boolean isInitialized = false;
    private volatile boolean isInitializing = false;
    private volatile boolean initFailed = false;
    private volatile PluginCall pendingSpeakCall = null;
    private final ConcurrentHashMap<String, PluginCall> activeCalls = new ConcurrentHashMap<>();

    @Override
    public void load() {
        ensureTtsInitialized();
    }

    private synchronized void ensureTtsInitialized() {
        if (isInitialized || isInitializing) {
            return;
        }
        if (getContext() == null) {
            return;
        }
        isInitializing = true;
        initFailed = false;
        try {
            tts = new TextToSpeech(getContext().getApplicationContext(), this);
        } catch (Exception e) {
            isInitializing = false;
            initFailed = true;
            flushPendingCallWithError("Failed to create Android TTS engine: " + e.getMessage());
        }
    }

    @Override
    public void onInit(int status) {
        isInitializing = false;
        if (status == TextToSpeech.SUCCESS && tts != null) {
            isInitialized = true;
            initFailed = false;
            configureBestJapaneseVoice();
            tts.setOnUtteranceProgressListener(
                new UtteranceProgressListener() {
                    @Override
                    public void onStart(String utteranceId) {
                        // Speech started
                    }

                    @Override
                    public void onDone(String utteranceId) {
                        resolveActiveCall(utteranceId, true, null);
                    }

                    @Override
                    @Deprecated
                    public void onError(String utteranceId) {
                        resolveActiveCall(utteranceId, false, "TTS playback error");
                    }

                    @Override
                    public void onError(String utteranceId, int errorCode) {
                        resolveActiveCall(utteranceId, false, "TTS playback error code: " + errorCode);
                    }

                    @Override
                    public void onStop(String utteranceId, boolean interrupted) {
                        resolveActiveCall(utteranceId, true, null);
                    }
                }
            );

            PluginCall queued = pendingSpeakCall;
            pendingSpeakCall = null;
            if (queued != null) {
                executeSpeak(queued);
            }
        } else {
            isInitialized = false;
            initFailed = true;
            flushPendingCallWithError("Android TTS engine failed to initialize.");
        }
    }

    private void flushPendingCallWithError(String reason) {
        PluginCall queued = pendingSpeakCall;
        pendingSpeakCall = null;
        if (queued != null) {
            JSObject res = new JSObject();
            res.put("spoken", false);
            res.put("reason", reason);
            queued.resolve(res);
        }
    }

    private void resolveActiveCall(String utteranceId, boolean spoken, String reason) {
        if (utteranceId == null) return;
        PluginCall call = activeCalls.remove(utteranceId);
        if (call != null) {
            JSObject res = new JSObject();
            res.put("spoken", spoken);
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

    private boolean isVoiceInstalled(Voice voice) {
        if (voice == null) return false;
        Set<String> features = voice.getFeatures();
        if (features != null && features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) {
            return false;
        }
        return true;
    }

    private Voice findBestJapaneseVoice(boolean offlineOnly) {
        if (tts == null || !isInitialized) return null;
        try {
            Set<Voice> voices = tts.getVoices();
            if (voices == null || voices.isEmpty()) return null;

            Voice best = null;
            int bestScore = Integer.MIN_VALUE;

            for (Voice voice : voices) {
                if (voice == null || voice.getLocale() == null) continue;
                String lang = voice.getLocale().getLanguage();
                if (!"ja".equalsIgnoreCase(lang) && !"jpn".equalsIgnoreCase(lang)) continue;
                if (!isVoiceInstalled(voice)) continue;
                if (offlineOnly && voice.isNetworkConnectionRequired()) continue;

                int score = 0;
                // Strongly prefer offline voices so audio works without internet
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
        try {
            Voice offlineVoice = findBestJapaneseVoice(true);
            if (offlineVoice != null) {
                tts.setVoice(offlineVoice);
                return true;
            }
            Voice anyJaVoice = findBestJapaneseVoice(false);
            if (anyJaVoice != null) {
                tts.setVoice(anyJaVoice);
                return false;
            }
            tts.setLanguage(Locale.JAPAN);
        } catch (Exception ignored) {
            try {
                tts.setLanguage(Locale.JAPAN);
            } catch (Exception ignored2) {
                // Ignore
            }
        }
        return false;
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
            res.put("reason", "TTS not ready");
            call.resolve(res);
            return;
        }

        float rate = call.getFloat("rate", 0.92f);
        float pitch = call.getFloat("pitch", 1.0f);
        rate = Math.max(0.5f, Math.min(2.0f, rate));
        pitch = Math.max(0.5f, Math.min(2.0f, pitch));

        try {
            clearAllActiveCalls();
            boolean usingOfflineVoice = configureBestJapaneseVoice();
            tts.setSpeechRate(rate);
            tts.setPitch(pitch);

            String utteranceId = "km_" + UUID.randomUUID().toString();
            activeCalls.put(utteranceId, call);

            Bundle params = new Bundle();
            params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);
            if (usingOfflineVoice) {
                params.putString(TextToSpeech.Engine.KEY_FEATURE_NETWORK_SYNTHESIS, "false");
            }

            int result = tts.speak(text.trim(), TextToSpeech.QUEUE_FLUSH, params, utteranceId);
            if (result != TextToSpeech.SUCCESS) {
                resolveActiveCall(utteranceId, false, "TextToSpeech.speak returned ERROR");
            }
        } catch (Exception e) {
            JSObject res = new JSObject();
            res.put("spoken", false);
            res.put("reason", e.getMessage());
            call.resolve(res);
        }
    }

    @PluginMethod
    public void speak(PluginCall call) {
        if (isInitialized && tts != null) {
            executeSpeak(call);
            return;
        }
        if (initFailed) {
            // Retry initialization in case TTS engine became available
            ensureTtsInitialized();
        }
        if (!isInitialized) {
            if (pendingSpeakCall != null) {
                JSObject prev = new JSObject();
                prev.put("spoken", false);
                prev.put("reason", "superseded");
                pendingSpeakCall.resolve(prev);
            }
            pendingSpeakCall = call;
            ensureTtsInitialized();
            return;
        }
        executeSpeak(call);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (pendingSpeakCall != null) {
            JSObject prev = new JSObject();
            prev.put("spoken", false);
            prev.put("reason", "stopped");
            pendingSpeakCall.resolve(prev);
            pendingSpeakCall = null;
        }
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
        ensureTtsInitialized();
        JSObject res = new JSObject();
        res.put("ready", isInitialized);

        boolean hasOfflineJa = false;
        boolean hasAnyJa = false;
        if (isInitialized && tts != null) {
            Voice offlineVoice = findBestJapaneseVoice(true);
            Voice anyVoice = findBestJapaneseVoice(false);
            hasOfflineJa = offlineVoice != null;
            hasAnyJa = anyVoice != null;
            if (!hasAnyJa) {
                int avail = tts.isLanguageAvailable(Locale.JAPAN);
                hasAnyJa =
                    avail == TextToSpeech.LANG_AVAILABLE ||
                    avail == TextToSpeech.LANG_COUNTRY_AVAILABLE ||
                    avail == TextToSpeech.LANG_COUNTRY_VAR_AVAILABLE;
            }
            res.put("engine", tts.getDefaultEngine());
        }

        res.put("hasOfflineJapaneseVoice", hasOfflineJa);
        res.put("hasJapaneseVoice", hasAnyJa);
        call.resolve(res);
    }

    @PluginMethod
    public void openInstallVoiceData(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Activity unavailable");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                Intent installIntent = new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA);
                installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getActivity().startActivity(installIntent);
                call.resolve();
            } catch (ActivityNotFoundException e) {
                try {
                    Intent settingsIntent = new Intent("com.android.settings.TTS_SETTINGS");
                    settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getActivity().startActivity(settingsIntent);
                    call.resolve();
                } catch (Exception ex) {
                    call.reject("Unable to open Android TTS settings: " + ex.getMessage());
                }
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
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
        super.handleOnDestroy();
    }
}
