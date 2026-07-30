/**
 * Deploys the published APK to the live Download Portal (admin.elloindia.in).
 *
 * nginx serves /var/prebot/frontend/dist as the site root, so /downloads/<file> reads
 * from dist/downloads. public/downloads is the source that a server-side `npm run build`
 * copies into dist, so both get the file — otherwise the next build wipes it.
 *
 * latest-version.json is MERGED, not overwritten: only the "mobile" key is replaced, so the
 * server keeps whatever Windows installer it is actually hosting.
 *
 * Usage:
 *   node scripts/deploy-downloads.js                 APK only
 *   node scripts/deploy-downloads.js --with-exe      APK + Windows installer
 *   node scripts/deploy-downloads.js --exe-only      Windows installer only
 *   node scripts/deploy-downloads.js --dry-run
 *   node scripts/deploy-downloads.js --host root@1.2.3.4 --remote-root /var/prebot/frontend
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DOWNLOADS = path.join(ROOT_DIR, 'frontend', 'public', 'downloads');
const STABLE_NAME = 'prebot.apk';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const EXE_ONLY = args.includes('--exe-only');
const DEPLOY_APK = !EXE_ONLY;
const DEPLOY_EXE = args.includes('--with-exe') || EXE_ONLY;

function argValue(flag, fallback) {
    const index = args.indexOf(flag);
    return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
}

const HOST = argValue('--host', 'root@62.72.57.4');
const REMOTE_ROOT = argValue('--remote-root', '/var/prebot/frontend');
const REMOTE_PUBLIC = `${REMOTE_ROOT}/public/downloads`;
const REMOTE_DIST = `${REMOTE_ROOT}/dist/downloads`;

function log(message) {
    console.log(`[Deploy] ${message}`);
}

function fail(message) {
    console.error(`[Deploy] ❌ ${message}`);
    process.exit(1);
}

function ssh(command) {
    if (DRY_RUN) {
        log(`(dry-run) ssh ${HOST} "${command}"`);
        return '';
    }
    return execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', HOST, command], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024
    });
}

/** scp runs from the file's directory: a Windows "C:\..." path is parsed as a host by scp. */
function scp(files, cwd, remoteDir) {
    if (DRY_RUN) {
        log(`(dry-run) scp ${files.join(' ')} ${HOST}:${remoteDir}/`);
        return;
    }
    execFileSync('scp', ['-o', 'BatchMode=yes', ...files, `${HOST}:${remoteDir}/`], {
        cwd,
        stdio: 'inherit'
    });
}

/** Chunked so a 1.4 GB installer is not read into memory in one go. */
function sha256(file) {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    const fd = fs.openSync(file, 'r');
    const buffer = Buffer.alloc(1024 * 1024);
    try {
        let bytes;
        while ((bytes = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
            hash.update(buffer.subarray(0, bytes));
        }
    } finally {
        fs.closeSync(fd);
    }
    return hash.digest('hex');
}

/**
 * Uploads the Windows installer, then flips the "standard" entry ONLY after the remote
 * sha256 matches — a half-uploaded 1.4 GB file must never become the advertised download.
 */
function deployExe(meta) {
    if (!meta.standard || !meta.standard.filename) fail('latest-version.json has no "standard" entry.');

    const exe = meta.standard.filename;
    const localExe = path.join(PUBLIC_DOWNLOADS, exe);
    if (!fs.existsSync(localExe)) fail(`Missing local installer: ${exe} — run "npm run build-win" first.`);

    const stat = fs.statSync(localExe);
    log(`🔐 Hashing ${exe} (${(stat.size / 1024 / 1024).toFixed(1)} MB)...`);
    const expected = DRY_RUN ? 'dry-run' : sha256(localExe);

    log(`📦 Uploading ${exe} — this is the slow one, be patient...`);
    scp([exe], PUBLIC_DOWNLOADS, REMOTE_PUBLIC);

    const entry = {
        version: meta.standard.version,
        releaseDate: meta.standard.releaseDate || new Date().toISOString(),
        filename: exe,
        size: stat.size,
        sizeLabel: `${(stat.size / 1024 / 1024).toFixed(1)} MB`,
        sha256: expected
    };

    const entryFile = path.join(os.tmpdir(), 'prebot-standard-entry.json');
    fs.writeFileSync(entryFile, JSON.stringify(entry, null, 2));
    scp([path.basename(entryFile)], path.dirname(entryFile), REMOTE_PUBLIC);
    fs.rmSync(entryFile, { force: true });

    const remote = [
        `set -e`,
        `ACTUAL=$(sha256sum ${REMOTE_PUBLIC}/${exe} | cut -d' ' -f1)`,
        `if [ "$ACTUAL" != "${expected}" ]; then echo "SHA MISMATCH: $ACTUAL"; exit 1; fi`,
        `echo "sha256 verified: $ACTUAL"`,
        `cp ${REMOTE_PUBLIC}/${exe} ${REMOTE_DIST}/`,
        `node -e '` +
            `const fs=require("fs");` +
            `const entry=JSON.parse(fs.readFileSync("${REMOTE_PUBLIC}/prebot-standard-entry.json","utf8"));` +
            `for(const p of ["${REMOTE_PUBLIC}/latest-version.json","${REMOTE_DIST}/latest-version.json"]){` +
                `let m={};try{m=JSON.parse(fs.readFileSync(p,"utf8"))}catch(e){}` +
                `m.standard=entry;fs.writeFileSync(p,JSON.stringify(m,null,2));` +
            `}'`,
        `rm -f ${REMOTE_PUBLIC}/prebot-standard-entry.json`,
        `chmod 644 ${REMOTE_PUBLIC}/${exe} ${REMOTE_DIST}/${exe}`,
        `echo "--- dist/downloads ---"; ls -lh ${REMOTE_DIST}`
    ].join('; ');

    const output = ssh(remote);
    if (output) console.log(output);
    if (!DRY_RUN) log(`✅ Windows ${entry.version} live: https://admin.elloindia.in/downloads/${exe}`);
}

function main() {
    const metaPath = path.join(PUBLIC_DOWNLOADS, 'latest-version.json');
    if (!fs.existsSync(metaPath)) fail('No latest-version.json — run "npm run build:apk" first.');

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

    if (DEPLOY_EXE) deployExe(meta);
    if (!DEPLOY_APK) return;

    if (!meta.mobile) fail('latest-version.json has no "mobile" entry — run "npm run publish:apk" first.');

    // Only the versioned APK travels; prebot.apk is an identical copy made server-side.
    const apk = meta.mobile.filename;
    if (!fs.existsSync(path.join(PUBLIC_DOWNLOADS, apk))) fail(`Missing local file: ${apk}`);

    const sizeMb = (fs.statSync(path.join(PUBLIC_DOWNLOADS, apk)).size / 1024 / 1024).toFixed(1);
    log(`🎯 Target: ${HOST}:${REMOTE_PUBLIC}`);
    log(`📦 Uploading ${apk} (${sizeMb} MB)...`);

    // 1. Upload the APK to the source folder.
    scp([apk], PUBLIC_DOWNLOADS, REMOTE_PUBLIC);

    // 2. Ship the mobile metadata as a side file so the remote merge needs no shell quoting.
    const entryFile = path.join(os.tmpdir(), 'prebot-mobile-entry.json');
    fs.writeFileSync(entryFile, JSON.stringify(meta.mobile, null, 2));
    scp([path.basename(entryFile)], path.dirname(entryFile), REMOTE_PUBLIC);
    fs.rmSync(entryFile, { force: true });

    // 3. Copy into the served dist folder, then merge only the "mobile" key into both metadata files.
    const remoteScript = [
        `set -e`,
        `cp ${REMOTE_PUBLIC}/${apk} ${REMOTE_PUBLIC}/${STABLE_NAME}`,
        `cp ${REMOTE_PUBLIC}/${apk} ${REMOTE_PUBLIC}/${STABLE_NAME} ${REMOTE_DIST}/`,
        `node -e '` +
            `const fs=require("fs");` +
            `const entry=JSON.parse(fs.readFileSync("${REMOTE_PUBLIC}/prebot-mobile-entry.json","utf8"));` +
            `for(const p of ["${REMOTE_PUBLIC}/latest-version.json","${REMOTE_DIST}/latest-version.json"]){` +
                `let m={};try{m=JSON.parse(fs.readFileSync(p,"utf8"))}catch(e){}` +
                `m.mobile=entry;fs.writeFileSync(p,JSON.stringify(m,null,2));` +
            `}'`,
        `rm -f ${REMOTE_PUBLIC}/prebot-mobile-entry.json`,
        `chmod 644 ${REMOTE_PUBLIC}/*.apk ${REMOTE_DIST}/*.apk`,
        `echo "--- dist/downloads ---"; ls -l ${REMOTE_DIST}`,
        `echo "--- metadata ---"; cat ${REMOTE_DIST}/latest-version.json`,
        `echo "--- sha256 ---"; sha256sum ${REMOTE_DIST}/${meta.mobile.filename}`
    ].join('; ');

    const output = ssh(remoteScript);
    if (output) console.log(output);

    if (DRY_RUN) return log('Dry run complete — nothing was changed.');

    if (meta.mobile.sha256 && !output.includes(meta.mobile.sha256)) {
        fail('Remote sha256 does not match the local APK — the upload is incomplete.');
    }

    log(`✅ Live: https://admin.elloindia.in/downloads/${meta.mobile.filename}`);
    log(`   Alias: https://admin.elloindia.in/downloads/${STABLE_NAME}`);
}

main();
