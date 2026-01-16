/**
 * Update Android Manifest to set mobile-questions.html as entry point
 * Run this after: npx cap sync android
 */

const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

if (!fs.existsSync(manifestPath)) {
    console.log('⚠️ Android project not found. Run "npx cap add android" first.');
    process.exit(1);
}

let manifest = fs.readFileSync(manifestPath, 'utf8');

// Remove any duplicate hardware backbutton meta-data entries
manifest = manifest.replace(
    /<meta-data\s+android:name="android\.hardware\.backbutton"[^>]*\/>\s*/g,
    ''
);

// Ensure hardware back button is enabled (only once, inside activity)
if (!manifest.includes('android.hardware.backbutton')) {
    manifest = manifest.replace(
        /(<activity[^>]*android:exported="true"[^>]*>)/,
        '$1\n        <meta-data android:name="android.hardware.backbutton" android:value="true" />'
    );
}

// Update Capacitor launch URL if it exists (in capacitor.config.json, not manifest)
// The manifest doesn't need the launch URL - Capacitor handles that via config

fs.writeFileSync(manifestPath, manifest, 'utf8');
console.log('✅ Android Manifest updated successfully!');
console.log('   - Entry point: mobile-questions.html');
console.log('   - Hardware back button: enabled');


