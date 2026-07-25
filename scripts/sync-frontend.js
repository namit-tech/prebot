const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const FRONTEND_DIST = path.join(ROOT_DIR, 'frontend', 'dist');

function log(msg) {
    console.log(`[Sync] ${msg}`);
}

function copyRecursive(src, dest) {
    if (fs.lstatSync(src).isDirectory()) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(child => copyRecursive(path.join(src, child), path.join(dest, child)));
    } else {
        fs.copyFileSync(src, dest);
    }
}

async function sync() {
    log('🔄 Syncing frontend assets to root...');

    if (!fs.existsSync(FRONTEND_DIST)) {
        log('❌ Frontend dist not found. Please run "npm run build:frontend" first.');
        process.exit(1);
    }

    // 1. Clean up the accidental nested assets folder if it exists
    const nestedAssets = path.join(ROOT_DIR, 'assets', 'assets');
    if (fs.existsSync(nestedAssets)) {
        log('🧹 Cleaning up nested assets folder...');
        fs.rmSync(nestedAssets, { recursive: true, force: true });
    }

    // 2. Copy index.html
    const srcIndex = path.join(FRONTEND_DIST, 'index.html');
    const destIndex = path.join(ROOT_DIR, 'index.html');
    if (fs.existsSync(srcIndex)) {
        log('📄 Copying index.html...');
        fs.copyFileSync(srcIndex, destIndex);
    }

    // 3. Copy assets folder content
    const srcAssets = path.join(FRONTEND_DIST, 'assets');
    const destAssets = path.join(ROOT_DIR, 'assets');
    if (fs.existsSync(srcAssets)) {
        log('📂 Copying assets folder content...');
        copyRecursive(srcAssets, destAssets);
    }

    // 4. Copy vad/ folder (VAD WASM files — must be at ./vad/ relative to index.html)
    const srcVad = path.join(FRONTEND_DIST, 'vad');
    const destVad = path.join(ROOT_DIR, 'vad');
    if (fs.existsSync(srcVad)) {
        log('🎙️ Copying vad/ folder (Silero VAD WASM)...');
        copyRecursive(srcVad, destVad);
    }

    // 5. Copy rnnoise/ folder (RNNoise worklet + WASM — must be at ./rnnoise/ relative to index.html)
    const srcRnnoise = path.join(FRONTEND_DIST, 'rnnoise');
    const destRnnoise = path.join(ROOT_DIR, 'rnnoise');
    if (fs.existsSync(srcRnnoise)) {
        log('🔇 Copying rnnoise/ folder (RNNoise neural denoiser)...');
        copyRecursive(srcRnnoise, destRnnoise);
    }

    // 6. Copy downloads/ folder if present
    const srcDownloads = path.join(FRONTEND_DIST, 'downloads');
    const destDownloads = path.join(ROOT_DIR, 'downloads');
    if (fs.existsSync(srcDownloads)) {
        log('📦 Copying downloads/ folder...');
        copyRecursive(srcDownloads, destDownloads);
    }

    log('✅ Sync complete! Your local dev environment now matches the latest build.');
}

sync();
