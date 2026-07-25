/**
 * Android APK build pipeline.
 *
 * Steps:
 *   1. Build the React frontend (frontend/dist)
 *   2. Sync it into www/ (Capacitor webDir), pruning assets that must not ship in the APK
 *   3. npx cap sync android
 *   4. gradlew assembleDebug / assembleRelease
 *   5. Hand the artifact to scripts/publish-apk.js so the Download Portal serves it
 *
 * Usage:
 *   node scripts/build-apk.js                 debug APK (installable, debug-signed) + publish
 *   node scripts/build-apk.js --release       release APK (needs a signingConfig in build.gradle)
 *   node scripts/build-apk.js --skip-web      reuse the current www/ (no frontend rebuild)
 *   node scripts/build-apk.js --no-publish    build only, leave downloads/ untouched
 *   node scripts/build-apk.js --clean         gradlew clean before assembling
 *   node scripts/build-apk.js --bump          versionName := package.json version, versionCode += 1
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const FRONTEND_DIST = path.join(ROOT_DIR, 'frontend', 'dist');
const WWW_DIR = path.join(ROOT_DIR, 'www');
const ANDROID_DIR = path.join(ROOT_DIR, 'android');
const GRADLE_FILE = path.join(ANDROID_DIR, 'app', 'build.gradle');
const SYNCED_WEB_DIR = path.join(ANDROID_DIR, 'app', 'src', 'main', 'assets', 'public');

const args = process.argv.slice(2);
const IS_RELEASE = args.includes('--release');
const SKIP_WEB = args.includes('--skip-web');
const NO_PUBLISH = args.includes('--no-publish');
const DO_CLEAN = args.includes('--clean');
const DO_BUMP = args.includes('--bump');

// Never ship these inside the APK — the Windows installers alone are ~2.4 GB.
const HEAVY_EXTENSIONS = ['.exe', '.apk', '.msix', '.appx', '.map'];

function log(message) {
    console.log(`[Build-APK] ${message}`);
}

function fail(message) {
    console.error(`[Build-APK] ❌ ${message}`);
    process.exit(1);
}

/** Gradle needs a JDK 17+. Fall back to the JBR that ships with Android Studio. */
function resolveJavaHome() {
    const isValid = (dir) => dir && fs.existsSync(path.join(dir, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'));

    if (isValid(process.env.JAVA_HOME)) return process.env.JAVA_HOME;

    const candidates = [
        'C:\\Program Files\\Android\\Android Studio\\jbr',
        'C:\\Program Files\\Android\\Android Studio\\jre',
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Android Studio', 'jbr'),
        path.join(process.env.ProgramFiles || '', 'Android', 'Android Studio', 'jbr')
    ];

    const found = candidates.find(isValid);
    if (found) log(`☕ JAVA_HOME not set — using Android Studio JDK: ${found}`);
    return found || null;
}

function copyRecursive(src, dest, skip = () => false) {
    if (skip(src)) return;
    if (fs.lstatSync(src).isDirectory()) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(child => copyRecursive(path.join(src, child), path.join(dest, child), skip));
    } else {
        fs.copyFileSync(src, dest);
    }
}

/** Files git tracks in `dir` — pruning must never delete these (www/ is committed). */
function trackedFiles(dir) {
    if (!fs.existsSync(dir)) return new Set();
    try {
        const out = execSync('git ls-files -z', { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        return new Set(out.split('\0').filter(Boolean).map(p => path.resolve(dir, p)));
    } catch (e) {
        log('⚠️  git ls-files failed — pruning committed files is disabled for safety.');
        return null;
    }
}

/**
 * Strips installers and source maps from a web folder so they never reach the APK.
 * Returns bytes reclaimed. Git-tracked files are left alone unless `protect` is empty.
 */
function pruneHeavyAssets(dir, protect = new Set()) {
    if (!fs.existsSync(dir)) return 0;
    // A null protect set means we could not read git state — skip pruning entirely.
    if (protect === null) return 0;

    let reclaimed = 0;

    const walk = (current) => {
        fs.readdirSync(current).forEach(entry => {
            const target = path.join(current, entry);
            const stat = fs.lstatSync(target);
            if (stat.isDirectory()) {
                walk(target);
            } else if (HEAVY_EXTENSIONS.includes(path.extname(entry).toLowerCase()) && !protect.has(target)) {
                reclaimed += stat.size;
                fs.rmSync(target, { force: true });
            }
        });
    };

    walk(dir);
    return reclaimed;
}

function mb(bytes) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function bumpVersion() {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
    let gradle = fs.readFileSync(GRADLE_FILE, 'utf8');

    const currentCode = parseInt((gradle.match(/versionCode\s+(\d+)/) || [])[1] || '1', 10);
    const nextCode = currentCode + 1;

    gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${nextCode}`);
    gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${pkg.version}"`);
    fs.writeFileSync(GRADLE_FILE, gradle);

    log(`🔖 Version bumped → versionName ${pkg.version}, versionCode ${nextCode}`);
}

function buildFrontend() {
    log('⚛️  Building frontend...');
    execSync('npm run build', { stdio: 'inherit', cwd: path.join(ROOT_DIR, 'frontend') });

    if (!fs.existsSync(FRONTEND_DIST)) fail('frontend/dist not found after build.');

    log('📂 Syncing frontend/dist → www/ ...');
    // downloads/ holds the desktop installers; only the tiny metadata file belongs in the APK.
    copyRecursive(FRONTEND_DIST, WWW_DIR, (src) => {
        const ext = path.extname(src).toLowerCase();
        return HEAVY_EXTENSIONS.includes(ext);
    });
}

function syncAndroid() {
    // www/ is committed, so only untracked junk (the ~2.5 GB of desktop installers that a
    // previous dist→www copy left in www/downloads) is removed before the sync.
    const reclaimed = pruneHeavyAssets(WWW_DIR, trackedFiles(WWW_DIR));
    if (reclaimed > 0) log(`🧹 Pruned ${mb(reclaimed)} of untracked installers/source maps from www/`);

    log('📱 Running Capacitor sync...');
    execSync('npx cap sync android', { stdio: 'inherit', cwd: ROOT_DIR });

    // The synced copy is pure build output — strip everything the app cannot use there.
    const syncedReclaimed = pruneHeavyAssets(SYNCED_WEB_DIR);
    if (syncedReclaimed > 0) log(`🧹 Pruned ${mb(syncedReclaimed)} from android assets/public`);
}

function assembleApk(javaHome) {
    const wrapper = path.join(ANDROID_DIR, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
    if (!fs.existsSync(wrapper)) {
        fail('gradlew not found in android/. Run "npx cap add android" first.');
    }
    // cmd.exe will not resolve a bare "gradlew.bat" from cwd, so always call it by full path.
    const gradlew = `"${wrapper}"`;

    const env = { ...process.env };
    if (javaHome) env.JAVA_HOME = javaHome;

    const task = IS_RELEASE ? 'assembleRelease' : 'assembleDebug';

    if (DO_CLEAN) {
        log('🧽 gradlew clean ...');
        execSync(`${gradlew} clean`, { stdio: 'inherit', cwd: ANDROID_DIR, env });
    }

    log(`🔨 gradlew ${task} (this takes a few minutes)...`);
    execSync(`${gradlew} ${task}`, { stdio: 'inherit', cwd: ANDROID_DIR, env });
}

function main() {
    log(`🚀 Building ${IS_RELEASE ? 'RELEASE' : 'DEBUG'} APK...`);

    const javaHome = resolveJavaHome();
    if (!javaHome && process.platform === 'win32') {
        fail('No JDK found. Install Android Studio or set JAVA_HOME to a JDK 17+.');
    }

    if (DO_BUMP) bumpVersion();
    if (!SKIP_WEB) buildFrontend();
    else log('⏭️  Skipping frontend build (--skip-web) — using the current www/');

    syncAndroid();
    assembleApk(javaHome);

    log('✅ APK build successful!');

    if (NO_PUBLISH) {
        log('⏭️  Skipping publish (--no-publish). Run "npm run publish:apk" when ready.');
        return;
    }

    log('📤 Publishing APK to the Download Portal...');
    const publishFlags = [
        IS_RELEASE ? '--release' : '',
        args.includes('--prune-old') ? '--prune-old' : '',
        args.includes('--no-mirror') ? '--no-mirror' : ''
    ].filter(Boolean).join(' ');

    execSync(`node "${path.join(__dirname, 'publish-apk.js')}" ${publishFlags}`.trim(), {
        stdio: 'inherit',
        cwd: ROOT_DIR
    });
}

main();
