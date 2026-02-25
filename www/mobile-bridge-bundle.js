(function() {
    // Helper to log to the user's screen (the #debugConsole DIV)
    function log(msg, type='info') {
        try {
            const consoleEl = document.getElementById('debugConsole');
            if (consoleEl) {
                const entry = document.createElement('div');
                entry.textContent = `[BRIDGE] ${msg}`;
                entry.style.color = type === 'error' ? '#ff6b6b' : (type === 'warn' ? '#fbbf24' : '#0f0');
                consoleEl.prepend(entry);
                if(type === 'error') consoleEl.style.display = 'block';
            }
        } catch(e) {}
        console.log(`[BRIDGE] ${msg}`);
    }

    log('🔌 Mobile Bridge Bundle (Vanilla) Loading...');

    // CREATE MANUAL PROXY
    // Since we don't have @capacitor/core to call registerPlugin(), we build the proxy manually.
    // This connects JS directly to the Native Bridge.
    const createOfflineVoiceProxy = () => {
        return {
            start: (options) => window.Capacitor.nativePromise('OfflineVoice', 'start', options),
            stop: () => window.Capacitor.nativePromise('OfflineVoice', 'stop', {}),
            requestPermissions: () => window.Capacitor.nativePromise('OfflineVoice', 'requestPermissions', {}),
            available: () => window.Capacitor.nativePromise('OfflineVoice', 'available', {}),
            addListener: (eventName, callback) => {
                return window.Capacitor.addListener('OfflineVoice', eventName, callback);
            },
            removeAllListeners: () => {
                // Remove all listeners for this plugin
                // Note: removeListener might vary by version, so we check
                if (window.Capacitor.removeListener) {
                     return window.Capacitor.removeListener('OfflineVoice');
                } else {
                     log('⚠️ removeListener not available on global Capacitor', 'warn');
                     return Promise.resolve();
                }
            }
        };
    };

    const initBridge = function() {
        if (!window.Capacitor) {
            log('⏳ Waiting for Capacitor...', 'warn');
            return;
        }

        log('✅ Capacitor global found!');
        
        // 1. Try to find existing plugin (if auto-registered)
        let OfflineVoice = window.Capacitor.Plugins ? window.Capacitor.Plugins.OfflineVoice : null;

        // 2. If not found, create manual proxy
        if (!OfflineVoice) {
            log('ℹ️ Plugin not auto-found. Creating manual proxy...');
            if (window.Capacitor.nativePromise) {
                OfflineVoice = createOfflineVoiceProxy();
                log('✅ Manual Proxy Created.');
            } else {
                log('❌ CRITICAL: window.Capacitor.nativePromise missing!', 'error');
            }
        }

        // 3. Expose
        if (OfflineVoice) {
            window.CapacitorSpeech = OfflineVoice;
            log('✅ OfflineVoice READY and exposed as window.CapacitorSpeech');
            
            // Allow debugging
            window.OfflineVoiceDebug = OfflineVoice; 
        } else {
            log('❌ Failed to initialize OfflineVoice bridge', 'error');
        }
    };

    // Retry logic
    if (window.Capacitor) {
        initBridge();
    } else {
        document.addEventListener('DOMContentLoaded', initBridge);
        setTimeout(initBridge, 1000);
        setTimeout(initBridge, 3000);
        setTimeout(initBridge, 5000);
    }
})();
