/**
 * Publishes a built APK to the Download Portal (the "PREBOT MOBILE" card).
 *
 * Copies the freshly built APK into frontend/public/downloads/ (which Vite ships to
 * frontend/dist/downloads on the next site build) and records it in latest-version.json
 * so the portal links to the current build instead of a hardcoded filename.
 *
 * Usage:
 *   node scripts/publish-apk.js                     newest debug APK
 *   node scripts/publish-apk.js --release           newest release APK
 *   node scripts/publish-apk.js --apk path/to.apk   explicit artifact
 *   node scripts/publish-apk.js --version 1.2.0     override the version label
 *   node scripts/publish-apk.js --prune-old         delete older prebot-v*.apk files
 *   node scripts/publish-apk.js --no-stable         skip the /downloads/prebot.apk alias
 *   node scripts/publish-apk.js --no-mirror         skip the root downloads/ copy
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.join(__dirname, '..');
const APK_OUTPUT_DIR = path.join(ROOT_DIR, 'android', 'app', 'build', 'outputs', 'apk');
const GRADLE_FILE = path.join(ROOT_DIR, 'android', 'app', 'build.gradle');
const PUBLIC_DOWNLOADS = path.join(ROOT_DIR, 'frontend', 'public', 'downloads');
const DIST_DOWNLOADS = path.join(ROOT_DIR, 'frontend', 'dist', 'downloads');
const ROOT_DOWNLOADS = path.join(ROOT_DIR, 'downloads');
const STABLE_NAME = 'prebot.apk';

const args = process.argv.slice(2);
const IS_RELEASE = args.includes('--release');
const NO_STABLE = args.includes('--no-stable');
const NO_MIRROR = args.includes('--no-mirror');
const PRUNE_OLD = args.includes('--prune-old');

function argValue(flag) {
    const index = args.indexOf(flag);
    return index !== -1 ? args[index + 1] : null;
}

function log(message) {
    console.log(`[Publish-APK] ${message}`);
}

function fail(message) {
    console.error(`[Publish-APK] ❌ ${message}`);
    process.exit(1);
}

function mb(bytes) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Picks the APK to publish: explicit --apk, else the newest matching build output. */
function resolveApk() {
    const explicit = argValue('--apk');
    if (explicit) {
        const resolved = path.resolve(ROOT_DIR, explicit);
        if (!fs.existsSync(resolved)) fail(`APK not found: ${resolved}`);
        return resolved;
    }

    const variant = IS_RELEASE ? 'release' : 'debug';
    const variantDir = path.join(APK_OUTPUT_DIR, variant);
    if (!fs.existsSync(variantDir)) {
        fail(`No ${variant} APK found. Run "npm run build:apk${IS_RELEASE ? ' -- --release' : ''}" first.`);
    }

    const candidates = fs.readdirSync(variantDir)
        .filter(f => f.endsWith('.apk') && !f.includes('androidTest'))
        .map(f => ({ file: f, full: path.join(variantDir, f), mtime: fs.statSync(path.join(variantDir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);

    if (!candidates.length) fail(`No APK files in ${variantDir}`);

    const unsigned = candidates.find(c => c.file.includes('unsigned'));
    const signed = candidates.find(c => !c.file.includes('unsigned'));

    if (!signed && unsigned) {
        fail(`Only an unsigned APK was produced (${unsigned.file}). Android refuses to install it — ` +
             'add a signingConfig to android/app/build.gradle, or build the debug variant instead.');
    }

    return signed.full;
}

/** The APK's real identity comes from build.gradle, not package.json. */
function readGradleVersion() {
    const override = argValue('--version');
    let versionName = override || '1.0.0';
    let versionCode = 1;

    if (fs.existsSync(GRADLE_FILE)) {
        const gradle = fs.readFileSync(GRADLE_FILE, 'utf8');
        if (!override) versionName = (gradle.match(/versionName\s+"([^"]+)"/) || [])[1] || versionName;
        versionCode = parseInt((gradle.match(/versionCode\s+(\d+)/) || [])[1] || '1', 10);
    }

    return { versionName, versionCode };
}

function sha256(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function writeMetadata(dir, entry) {
    const metaPath = path.join(dir, 'latest-version.json');
    let meta = {};
    if (fs.existsSync(metaPath)) {
        try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch (e) { /* rewrite from scratch */ }
    }
    meta.mobile = entry;
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    return metaPath;
}

function pruneOldApks(dir, keep) {
    fs.readdirSync(dir)
        .filter(f => f.endsWith('.apk') && f !== keep && f !== STABLE_NAME)
        .forEach(f => {
            fs.rmSync(path.join(dir, f), { force: true });
            log(`🗑️  Removed old ${f}`);
        });
}

function main() {
    const apkPath = resolveApk();
    const { versionName, versionCode } = readGradleVersion();
    const stat = fs.statSync(apkPath);
    const buildType = IS_RELEASE ? 'release' : 'debug';
    const filename = `prebot-v${versionName}.apk`;

    log(`📦 Source: ${path.relative(ROOT_DIR, apkPath)} (${mb(stat.size)}, built ${stat.mtime.toISOString()})`);

    if (!fs.existsSync(PUBLIC_DOWNLOADS)) fs.mkdirSync(PUBLIC_DOWNLOADS, { recursive: true });

    const versionedDest = path.join(PUBLIC_DOWNLOADS, filename);
    log(`🚀 Copying → frontend/public/downloads/${filename}`);
    fs.copyFileSync(apkPath, versionedDest);

    // Stable alias: browsers still running a cached bundle request /downloads/prebot.apk.
    if (!NO_STABLE) {
        log(`🔗 Copying → frontend/public/downloads/${STABLE_NAME} (stable alias)`);
        fs.copyFileSync(apkPath, path.join(PUBLIC_DOWNLOADS, STABLE_NAME));
    }

    if (PRUNE_OLD) pruneOldApks(PUBLIC_DOWNLOADS, filename);

    const entry = {
        version: versionName,
        versionCode,
        buildType,
        releaseDate: new Date().toISOString(),
        filename,
        size: stat.size,
        sizeLabel: mb(stat.size),
        sha256: sha256(apkPath)
    };

    log(`✨ Updated ${path.relative(ROOT_DIR, writeMetadata(PUBLIC_DOWNLOADS, entry))}`);

    // Mirror into the already-built site output and the local dev copy, so neither needs
    // a full frontend rebuild (which re-copies every installer in public/downloads).
    if (!NO_MIRROR) {
        const mirrors = [
            { dir: DIST_DOWNLOADS, label: 'frontend/dist/downloads (deployable site build)', onlyIfBuilt: true },
            { dir: ROOT_DOWNLOADS, label: 'downloads/ (local dev)', onlyIfBuilt: false }
        ];

        mirrors.forEach(({ dir, label, onlyIfBuilt }) => {
            if (onlyIfBuilt && !fs.existsSync(path.dirname(dir))) return;
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.copyFileSync(apkPath, path.join(dir, filename));
            if (!NO_STABLE) fs.copyFileSync(apkPath, path.join(dir, STABLE_NAME));
            if (PRUNE_OLD) pruneOldApks(dir, filename);
            writeMetadata(dir, entry);
            log(`🪞 Mirrored into ${label}`);
        });
    }

    log('');
    log(`✅ Published PreBot Mobile v${versionName} (${buildType}, code ${versionCode}, ${entry.sizeLabel})`);
    log('   Portal link: /downloads/' + filename);
    log('   Next: deploy frontend/dist to admin.elloindia.in so users get this build.');
}

main();
