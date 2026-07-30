const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { compileFiles } = require('./bytenode-compiler');

// Configuration
const ROOT_DIR = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const BUILD_TEMP_DIR = path.join(ROOT_DIR, 'dist_build_temp');
const PROCESSES_TO_KILL = [
    'prebot.exe',
    'electron.exe',
    'Offline AI Chatbot.exe'
];

function log(message) {
    console.log(`[Build-Robust] ${message}`);
}

function killProcesses() {
    log('Checking for running processes to kill...');
    try {
        const runningProcesses = execSync('tasklist', { encoding: 'utf8' });
        PROCESSES_TO_KILL.forEach(proc => {
            if (runningProcesses.toLowerCase().includes(proc.toLowerCase())) {
                log(`Killing ${proc}...`);
                try { execSync(`taskkill /F /IM "${proc}"`, { stdio: 'ignore' }); } catch (e) {}
            }
        });
    } catch (error) {}
}

async function startBuild() {
    killProcesses();
    log('🚀 Starting Secure Build Process...');

    // Clean DIST folder completely to avoid old version conflicts
    if (fs.existsSync(DIST_DIR)) {
        log(`🗑️ Cleaning old builds in ${DIST_DIR}...`);
        try {
            fs.rmSync(DIST_DIR, { recursive: true, force: true });
        } catch (e) {
            log(`⚠️ Direct deletion failed: ${e.message}. Trying rename-then-delete...`);
            const renamePath = `${DIST_DIR}_old_${Date.now()}`;
            try {
                fs.renameSync(DIST_DIR, renamePath);
                log(`✅ Renamed locked folder to ${path.basename(renamePath)}`);
                // Try to delete the renamed folder in background, but don't let it stop us
                try { fs.rmSync(renamePath, { recursive: true, force: true }); } catch (err) {}
            } catch (renameErr) {
                log(`❌ Critical: Could not clean or rename DIST folder: ${renameErr.message}`);
                log(`💡 Please manually close any apps or folders using "${DIST_DIR}" and try again.`);
                process.exit(1);
            }
        }
    }
    if (!fs.existsSync(DIST_DIR)) {
        fs.mkdirSync(DIST_DIR, { recursive: true });
    }

    // 1. Prepare Temp Directory (to avoid ruining source files with bytecode)
    if (fs.existsSync(BUILD_TEMP_DIR)) {
        fs.rmSync(BUILD_TEMP_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(BUILD_TEMP_DIR, { recursive: true });

    // 2. Build Frontend
    log('⚛️ Building Frontend...');
    execSync('npm run build', { stdio: 'inherit', cwd: path.join(ROOT_DIR, 'frontend') });

    // 3. Copy files to Temp Directory
    log('📂 Syncing source to temporary build folder...');
    // downloads/, android/ and www/ are excluded by build.files anyway — copying them here
    // just moved several GB around before electron-builder threw them away.
    const excludeFolders = ['dist', 'dist_build_temp', 'dist_build_special', 'frontend', '.git', 'node_modules',
                            'downloads', 'android', 'www'];
    
    fs.readdirSync(ROOT_DIR).forEach(item => {
        if (!excludeFolders.includes(item)) {
            const src = path.join(ROOT_DIR, item);
            const dest = path.join(BUILD_TEMP_DIR, item);
            if (fs.lstatSync(src).isDirectory()) copyRecursive(src, dest);
            else fs.copyFileSync(src, dest);
        }
    });

    // 4. Create Junction for node_modules (Crucial for electron-builder to find Electron)
    log('🔗 Linking node_modules...');
    const srcNodeModules = path.join(ROOT_DIR, 'node_modules');
    const destNodeModules = path.join(BUILD_TEMP_DIR, 'node_modules');
    if (fs.existsSync(srcNodeModules)) {
        try {
            // Use 'junction' for folders on Windows
            fs.symlinkSync(srcNodeModules, destNodeModules, 'junction');
        } catch (e) {
            log('⚠️ Failed to create link, falling back to manual copy (this may be slow)...');
            // copyRecursive(srcNodeModules, destNodeModules); // Too slow/large, let's hope symlink works
        }
    }

    // 5. Sync built frontend
    const frontendDist = path.join(ROOT_DIR, 'frontend', 'dist');
    copyRecursive(frontendDist, BUILD_TEMP_DIR);

    // 5. Apply Bytecode Protection (Bytenode)
    log('🛡️  Applying Bytecode Protection...');
    await compileFiles(BUILD_TEMP_DIR);

    // 6. Run Electron Builder
    log('📦 Packaging application...');
    
    // Explicitly set the electron version
    let electronVersion = "27.0.0";
    try {
        const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
        electronVersion = rootPkg.devDependencies.electron.replace('^', '').replace('~', '');
    } catch (e) {}

    const distOutputPath = path.join(ROOT_DIR, 'dist');
    
    // Optional: "--target nsis" builds just the installer instead of nsis + portable + appx.
    const targetArg = process.argv.indexOf('--target');
    const winTarget = targetArg !== -1 && process.argv[targetArg + 1] ? process.argv[targetArg + 1] : '';
    if (winTarget) log(`🎯 Limiting Windows targets to: ${winTarget}`);

    try {
        // Build for x64 only and disable asar for bytecode stability
        execSync(`npx electron-builder --win ${winTarget} --x64 -c.electronVersion=${electronVersion} -c.directories.output="${distOutputPath}" -c.asar=false`, {
            stdio: 'inherit',
            cwd: BUILD_TEMP_DIR
        });
        log('✅ Build Successful!');
        log(`📂 Files are in: ${distOutputPath}`);

        // --- NEW: AUTO-COPY TO DOWNLOADS ---
        try {
            const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
            const version = pkg.version;
            const productName = pkg.build.productName || "PreBot";
            const downloadDir = path.join(ROOT_DIR, 'frontend', 'public', 'downloads');

            if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

            // Find the setup file. Electron builder naming is: "Offline AI Chatbot Setup 1.0.13 x64.exe"
            const buildFiles = fs.readdirSync(distOutputPath);
            const setupFile = buildFiles.find(f => f.includes('Setup') && f.endsWith('.exe'));

            if (setupFile) {
                const srcPath = path.join(distOutputPath, setupFile);
                const destPath = path.join(downloadDir, `prebot-setup-v${version}.exe`);
                
                log(`🚀 Copying ${setupFile} to Downloads as prebot-setup-v${version}.exe...`);
                fs.copyFileSync(srcPath, destPath);

                // Create metadata for the frontend
                const metaPath = path.join(downloadDir, 'latest-version.json');
                let meta = {};
                if (fs.existsSync(metaPath)) {
                    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch (e) {}
                }
                
                meta.standard = {
                    version: version,
                    releaseDate: new Date().toISOString(),
                    filename: `prebot-setup-v${version}.exe`
                };

                fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
                log('✨ Version metadata updated successfully!');
            }
        } catch (copyErr) {
            log(`⚠️ Auto-copy failed: ${copyErr.message}`);
        }
    } catch (err) {
        log('❌ Build Failed!');
    }
    
    // Cleanup
    log('🧹 Cleaning up temp files...');
    if (fs.existsSync(BUILD_TEMP_DIR)) {
        fs.rmSync(BUILD_TEMP_DIR, { recursive: true, force: true });
    }
}

function copyRecursive(src, dest) {
    if (fs.lstatSync(src).isDirectory()) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest);
        fs.readdirSync(src).forEach(child => copyRecursive(path.join(src, child), path.join(dest, child)));
    } else {
        fs.copyFileSync(src, dest);
    }
}

startBuild();
