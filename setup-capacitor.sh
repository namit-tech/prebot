#!/bin/bash

echo "========================================"
echo "Capacitor Setup for Mobile App"
echo "========================================"
echo ""

echo "[1/4] Installing Capacitor dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: npm install failed"
    exit 1
fi

echo ""
echo "[2/4] Initializing Capacitor..."
npx cap init "AI Assistant Questions" "com.offlineai.mobilequestions" --web-dir="."
if [ $? -ne 0 ]; then
    echo "ERROR: Capacitor init failed"
    exit 1
fi

echo ""
echo "[3/4] Adding Android platform..."
npx cap add android
if [ $? -ne 0 ]; then
    echo "ERROR: Adding Android platform failed"
    exit 1
fi

echo ""
echo "[4/4] Syncing files..."
npx cap sync
if [ $? -ne 0 ]; then
    echo "ERROR: Sync failed"
    exit 1
fi

echo ""
echo "========================================"
echo "Setup Complete!"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Install Android Studio (if not installed)"
echo "2. Run: npm run cap:open:android"
echo "3. Build APK in Android Studio"
echo ""


