package com.offlineai.mobilequestions;

import android.Manifest;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.locks.ReentrantLock;
import org.json.JSONArray;

// Define Constants Interface locally
interface SpeechConstants {
    int REQUEST_CODE_PERMISSION = 2001;
    int REQUEST_CODE_SPEECH = 2002;
    String IS_RECOGNITION_AVAILABLE = "isRecognitionAvailable";
    String START_LISTENING = "startListening";
    String STOP_LISTENING = "stopListening";
    String GET_SUPPORTED_LANGUAGES = "getSupportedLanguages";
    String HAS_PERMISSION = "hasPermission";
    String REQUEST_PERMISSION = "requestPermission";
    int MAX_RESULTS = 5;
    String NOT_AVAILABLE = "Speech recognition service is not available.";
    String MISSING_PERMISSION = "Missing permission";
    String RECORD_AUDIO_PERMISSION = Manifest.permission.RECORD_AUDIO;
    String ERROR = "Could not get list of languages";
}

@CapacitorPlugin(
    name = "OfflineVoice",
    permissions = { @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "speechRecognition") }
)
public class VoiceNativePlugin extends Plugin implements SpeechConstants {
    private static final String TAG = "OfflineVoice";
    
    // CONSTRUCTOR LOG
    public VoiceNativePlugin() {
        super();
        android.util.Log.d("OfflineVoice", "🏗️ OFFLINEVOICE CLASS CONSTRUCTED");
        // We can't use bridge yet in constructor, so we use a delayed or static approach if needed
        // But instantiation happens on FIRST CALL, so load() should trigger Toast.
    }

    private SpeechRecognizer speechRecognizer;
    private static final String LISTENING_EVENT = "listeningState";
    static final String SPEECH_RECOGNITION = "speechRecognition";

    private Receiver languageReceiver;

    private final ReentrantLock lock = new ReentrantLock();
    private boolean listening = false;

    private JSONArray previousPartialResults = new JSONArray();

    @Override
    public void load() {
        super.load();
        
        // IMMEDIATE FEEDBACK IN LOGCAT
        android.util.Log.d("VoiceNativePlugin", "🔥 PLUGIN CLASS LOADED BY BRIDGE 🔥");

        // Use bridge.getWebView().post to run on UI thread
        bridge.getActivity().runOnUiThread(() -> {
            try {
                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(bridge.getActivity());
                SpeechRecognitionListener listener = new SpeechRecognitionListener();
                speechRecognizer.setRecognitionListener(listener);
                
                // VISUAL CONFIRMATION IN APP
                android.widget.Toast.makeText(bridge.getContext(), "🎨 NATIVE PLUGIN INSTANTIATED (v11)", android.widget.Toast.LENGTH_SHORT).show();
                Logger.info(TAG, "Instantiated OfflineVoice SpeechRecognizer in load()");
            } catch (Exception e) {
                Logger.error(TAG, "LOAD FAILED: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void available(PluginCall call) {
        Logger.info(TAG, "Called for available(): " + isSpeechRecognitionAvailable());
        boolean val = isSpeechRecognitionAvailable();
        JSObject result = new JSObject();
        result.put("available", val);
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (!isSpeechRecognitionAvailable()) {
            call.unavailable(NOT_AVAILABLE);
            return;
        }

        if (getPermissionState("speechRecognition") != PermissionState.GRANTED) {
            call.reject(MISSING_PERMISSION);
            return;
        }

        String language = call.getString("language", Locale.getDefault().toString());
        int maxResults = call.getInt("maxResults", MAX_RESULTS);
        String prompt = call.getString("prompt", null);
        boolean partialResults = call.getBoolean("partialResults", false);
        boolean popup = call.getBoolean("popup", false);
        beginListening(language, maxResults, prompt, partialResults, popup, call);
    }

    @PluginMethod
    public void stop(final PluginCall call) {
        try {
            stopListening();
            call.resolve();
        } catch (Exception ex) {
            call.reject(ex.getLocalizedMessage());
        }
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        // Explicit Method for Permissions
        if (getPermissionState("speechRecognition") != PermissionState.GRANTED) {
            requestPermissionForAlias("speechRecognition", call, "permissionCallback");
        } else {
            JSObject result = new JSObject();
            result.put("speechRecognition", "granted");
            call.resolve(result);
        }
    }
    
    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        if (getPermissionState("speechRecognition") == PermissionState.GRANTED) {
            result.put("speechRecognition", "granted");
            call.resolve(result);
        } else {
            call.reject("Permission denied");
        }
    }

    @PluginMethod
    public void getSupportedLanguages(PluginCall call) {
        if (languageReceiver == null) {
            languageReceiver = new Receiver(call);
        }

        List<String> supportedLanguages = languageReceiver.getSupportedLanguages();
        if (supportedLanguages != null) {
            JSONArray languages = new JSONArray(supportedLanguages);
            call.resolve(new JSObject().put("languages", languages));
            return;
        }

        Intent detailsIntent = new Intent(RecognizerIntent.ACTION_GET_LANGUAGE_DETAILS);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            detailsIntent.setPackage("com.google.android.googlequicksearchbox");
        }
        bridge.getActivity().sendOrderedBroadcast(detailsIntent, null, languageReceiver, null, Activity.RESULT_OK, null, null);
    }

    @PluginMethod
    public void isListening(PluginCall call) {
        call.resolve(new JSObject().put("listening", this.listening));
    }

    @ActivityCallback
    private void listeningResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        int resultCode = result.getResultCode();
        if (resultCode == Activity.RESULT_OK) {
            try {
                ArrayList<String> matchesList = result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                JSObject resultObj = new JSObject();
                resultObj.put("matches", new JSArray(matchesList));
                call.resolve(resultObj);
            } catch (Exception ex) {
                call.reject(ex.getMessage());
            }
        } else {
            call.reject(Integer.toString(resultCode));
        }

        this.lock.lock();
        this.listening(false);
        this.lock.unlock();
    }

    private boolean isSpeechRecognitionAvailable() {
        return SpeechRecognizer.isRecognitionAvailable(bridge.getContext());
    }

    private void listening(boolean value) {
        this.listening = value;
    }

    private void beginListening(String language, int maxResults, String prompt, final boolean partialResults, boolean showPopup, PluginCall call) {
        Logger.info(TAG, "Beginning to listen for audible speech");
        // VISUAL DEBUGGING
        // bridge.getActivity().runOnUiThread(() -> {
        //    android.widget.Toast.makeText(bridge.getContext(), "🎤 NATIVE START CALLED", android.widget.Toast.LENGTH_SHORT).show();
        // });

        final Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, maxResults);
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, bridge.getActivity().getPackageName());
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, partialResults);
        
        // TWEAKS FOR EMULATOR / TIMEOUTS
        intent.putExtra("android.speech.extra.DICTATION_MODE", partialResults);
        intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 60000); // 60s silence (Longer patience)
        intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 60000); 
        intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 30000);

        if (prompt != null) {
            intent.putExtra(RecognizerIntent.EXTRA_PROMPT, prompt);
        }

        if (showPopup) {
            startActivityForResult(call, intent, "listeningResult");
        } else {
            bridge.getWebView().post(() -> {
                try {
                    this.lock.lock();

                    // FIX: Reverting to Destroy/Create pattern.
                    // Reusing the instance causes 'ERROR_CLIENT' (State issues).
                    // Destroying ensures a clean slate for every session.
                    if (speechRecognizer != null) {
                        try {
                            speechRecognizer.cancel();
                            speechRecognizer.destroy();
                        } catch (Exception e) {
                            // ignore
                        }
                        speechRecognizer = null;
                    }

                    speechRecognizer = SpeechRecognizer.createSpeechRecognizer(bridge.getActivity());
                    SpeechRecognitionListener listener = new SpeechRecognitionListener();
                    listener.setCall(call);
                    listener.setPartialResults(partialResults);
                    speechRecognizer.setRecognitionListener(listener);
                    
                    speechRecognizer.startListening(intent);
                    this.listening(true);
                    if (partialResults) {
                        call.resolve(); 
                    }
                } catch (Exception ex) {
                    call.reject(ex.getMessage());
                } finally {
                    this.lock.unlock();
                }
            });

        }
    }

    private void stopListening() {
        bridge.getWebView().post(() -> {
            try {
                this.lock.lock();
                if (this.listening) {
                    speechRecognizer.stopListening();
                    this.listening(false);
                }
            } catch (Exception ex) {
                throw ex;
            } finally {
                this.lock.unlock();
            }
        });
    }

    // Inner Class for Receiver
    public class Receiver extends BroadcastReceiver {
        private List<String> supportedLanguagesList;
        private String languagePref;
        private PluginCall call;

        public Receiver(PluginCall call) {
            super();
            this.call = call;
        }

        @Override
        public void onReceive(Context context, Intent intent) {
            Bundle extras = getResultExtras(true);
            if (extras.containsKey(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE)) {
                languagePref = extras.getString(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE);
            }
            if (extras.containsKey(RecognizerIntent.EXTRA_SUPPORTED_LANGUAGES)) {
                supportedLanguagesList = extras.getStringArrayList(RecognizerIntent.EXTRA_SUPPORTED_LANGUAGES);
                JSArray languagesList = new JSArray(supportedLanguagesList);
                call.resolve(new JSObject().put("languages", languagesList));
                return;
            }
            call.reject(ERROR);
        }

        public List<String> getSupportedLanguages() { return supportedLanguagesList; }
    }

    // Inner Class for Listener
    private class SpeechRecognitionListener implements RecognitionListener {
        private PluginCall call;
        private boolean partialResults;

        public void setCall(PluginCall call) { this.call = call; }
        public void setPartialResults(boolean partialResults) { this.partialResults = partialResults; }

        @Override public void onReadyForSpeech(Bundle params) {}

        @Override public void onBeginningOfSpeech() {
            try {
                VoiceNativePlugin.this.lock.lock();
                JSObject ret = new JSObject();
                ret.put("status", "started");
                VoiceNativePlugin.this.notifyListeners(LISTENING_EVENT, ret);
            } finally {
                VoiceNativePlugin.this.lock.unlock();
            }
        }

        @Override public void onRmsChanged(float rmsdB) {}
        @Override public void onBufferReceived(byte[] buffer) {}

        @Override public void onEndOfSpeech() {
            bridge.getWebView().post(() -> {
                try {
                    VoiceNativePlugin.this.lock.lock();
                    VoiceNativePlugin.this.listening(false);
                    JSObject ret = new JSObject();
                    ret.put("status", "stopped");
                    VoiceNativePlugin.this.notifyListeners(LISTENING_EVENT, ret);
                } finally {
                    VoiceNativePlugin.this.lock.unlock();
                }
            });
        }

        @Override public void onError(int error) {
            VoiceNativePlugin.this.stopListening();
            String errorMssg = getErrorText(error);
            
            // Emitting 'stopped' event with error info so JS can restart if needed
            JSObject ret = new JSObject();
            ret.put("status", "stopped");
            ret.put("error", errorMssg);
            VoiceNativePlugin.this.notifyListeners(LISTENING_EVENT, ret);

            // VISUAL DEBUGGING
            bridge.getActivity().runOnUiThread(() -> {
                // Suppress Toast for "No Match" (7), "Speech Timeout" (6), and default catch-all
                // These are expected in continuous listening and shouldn't panic the user
                if (error != SpeechRecognizer.ERROR_NO_MATCH && 
                    error != SpeechRecognizer.ERROR_SPEECH_TIMEOUT &&
                    !errorMssg.equals("Didn't understand, please try again.")) {
                     android.widget.Toast.makeText(bridge.getContext(), "❌ NATIVE ERROR: " + errorMssg, android.widget.Toast.LENGTH_LONG).show();
                }
            });
            if (this.call != null) {
                call.reject(errorMssg);
            }
        }

        @Override public void onResults(Bundle results) {
            ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            try {
                JSArray jsArray = new JSArray(matches);
                if (this.call != null) {
                    if (!this.partialResults) {
                        this.call.resolve(new JSObject().put("status", "success").put("matches", jsArray));
                    } else {
                        JSObject ret = new JSObject();
                        ret.put("matches", jsArray);
                        notifyListeners("partialResults", ret);
                    }
                }
            } catch (Exception ex) {
                this.call.resolve(new JSObject().put("status", "error").put("message", ex.getMessage()));
            }
        }

        @Override public void onPartialResults(Bundle partialResults) {
            ArrayList<String> matches = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            JSArray matchesJSON = new JSArray(matches);
            try {
                if (matches != null && matches.size() > 0 && !previousPartialResults.equals(matchesJSON)) {
                    previousPartialResults = matchesJSON;
                    JSObject ret = new JSObject();
                    ret.put("matches", previousPartialResults);
                    notifyListeners("partialResults", ret);
                }
            } catch (Exception ex) {}
        }

        @Override public void onEvent(int eventType, Bundle params) {}

        private String getErrorText(int errorCode) {
            switch (errorCode) {
                case SpeechRecognizer.ERROR_AUDIO: return "Audio recording error";
                case SpeechRecognizer.ERROR_CLIENT: return "Client side error";
                case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "Insufficient permissions";
                case SpeechRecognizer.ERROR_NETWORK: return "Network error";
                case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: return "Network timeout";
                case SpeechRecognizer.ERROR_NO_MATCH: return "No match";
                case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: return "RecognitionService busy";
                case SpeechRecognizer.ERROR_SERVER: return "error from server";
                case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: return "No speech input";
                default: return "Didn't understand, please try again.";
            }
        }
    }
}
