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
 *   node scripts/deploy-downloads.js
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

function main() {
    const metaPath = path.join(PUBLIC_DOWNLOADS, 'latest-version.json');
    if (!fs.existsSync(metaPath)) fail('No latest-version.json — run "npm run build:apk" first.');

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
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
