/**
 * Capacitor Mobile Integration
 * This file loads Capacitor plugins for hardware back button control
 * Works in both browser (with fallback) and Capacitor app
 */

(function() {
    'use strict';

    // Initialize Capacitor APIs
    window.CapacitorApp = null;
    window.CapacitorStatusBar = null;
    window.CapacitorKeyboard = null;
    window.Capacitor = null;

    // Check if Capacitor is already loaded (injected by Capacitor runtime)
    if (typeof window !== 'undefined' && window.Capacitor) {
        console.log('✅ Capacitor runtime detected (injected by Capacitor)');
        
        // Try to load plugins from global scope (Capacitor injects them)
        if (window.App) {
            window.CapacitorApp = window.App;
        }
        if (window.StatusBar) {
            window.CapacitorStatusBar = window.StatusBar;
        }
        if (window.Keyboard) {
            window.CapacitorKeyboard = window.Keyboard;
        }
    }

    // Try to load Capacitor from node_modules (when bundled in app)
    if (typeof require !== 'undefined') {
        try {
            // This will work when bundled in Capacitor app
            const { Capacitor } = require('@capacitor/core');
            const { App } = require('@capacitor/app');
            const { StatusBar } = require('@capacitor/status-bar');
            const { Keyboard } = require('@capacitor/keyboard');
            
            window.Capacitor = Capacitor;
            if (!window.CapacitorApp) window.CapacitorApp = App;
            if (!window.CapacitorStatusBar) window.CapacitorStatusBar = StatusBar;
            if (!window.CapacitorKeyboard) window.CapacitorKeyboard = Keyboard;
            
            console.log('✅ Capacitor plugins loaded from node_modules');
        } catch (e) {
            // Not in Node.js environment or Capacitor not installed
            if (typeof window === 'undefined' || !window.Capacitor) {
                console.log('⚠️ Capacitor not available (running in browser)');
            }
        }
    }

    // Fallback: Check for CapacitorWeb (browser fallback)
    if (typeof window !== 'undefined' && !window.Capacitor && window.CapacitorWeb) {
        window.Capacitor = window.CapacitorWeb;
        console.log('⚠️ Using Capacitor Web (browser mode)');
    }

    // Helper function to check if Capacitor is available and running natively
    window.isCapacitorAvailable = function() {
        if (!window.Capacitor) {
            return false;
        }
        
        // Check if running on native platform
        if (window.Capacitor.isNativePlatform && typeof window.Capacitor.isNativePlatform === 'function') {
            return window.Capacitor.isNativePlatform();
        }
        
        // Fallback: Check platform name
        if (window.Capacitor.getPlatform && typeof window.Capacitor.getPlatform === 'function') {
            const platform = window.Capacitor.getPlatform();
            return platform === 'android' || platform === 'ios';
        }
        
        // Last resort: Check if we're not in a browser
        return !window.Capacitor.isPluginAvailable || 
               (window.Capacitor.getPlatform && window.Capacitor.getPlatform() !== 'web');
    };

    // Log status
    console.log('📱 Capacitor Mobile Integration loaded');
    console.log('   - Capacitor Available:', !!window.Capacitor);
    console.log('   - App Plugin:', !!window.CapacitorApp);
    console.log('   - Native Platform:', window.isCapacitorAvailable ? window.isCapacitorAvailable() : false);
    
    // Expose for debugging
    if (typeof window !== 'undefined') {
        window.__CAPACITOR_DEBUG__ = {
            Capacitor: !!window.Capacitor,
            App: !!window.CapacitorApp,
            StatusBar: !!window.CapacitorStatusBar,
            Keyboard: !!window.CapacitorKeyboard,
            isNative: window.isCapacitorAvailable ? window.isCapacitorAvailable() : false
        };
    }
})();

