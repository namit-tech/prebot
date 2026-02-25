package com.offlineai.mobilequestions;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import android.widget.Toast;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 1. Pre-registration (Standard Cap 6)
        try {
            this.registerPlugin(VoiceNativePlugin.class);
            android.widget.Toast.makeText(this, "🔌 NATIVE REGISTRATION Success", android.widget.Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            android.util.Log.e("MainActivity", "❌ REGISTRATION FAILED", e);
            android.widget.Toast.makeText(this, "❌ REGISTRATION FAILED: " + e.getMessage(), android.widget.Toast.LENGTH_LONG).show();
        }

        super.onCreate(savedInstanceState);

        // 2. Audit Registry (See what's actually there)
        // SKIPPED: getBridge().getPlugins() is not public in Capacitor 6.
        // We rely on registerPlugin() call above.

        // Ensure Permission Request Granting for WebView
        this.getBridge().getWebView().setWebChromeClient(new android.webkit.WebChromeClient() {
            @Override
            public void onPermissionRequest(final android.webkit.PermissionRequest request) {
                request.grant(request.getResources());
            }
        });
    }
}
