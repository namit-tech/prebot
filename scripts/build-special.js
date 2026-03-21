const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { compileFiles } = require('./bytenode-compiler');

// Configuration
const ROOT_DIR = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const BUILD_TEMP_DIR = path.join(ROOT_DIR, 'dist_build_special');

const PROCESSES_TO_KILL = ['prebot.exe', 'electron.exe', 'Offline AI Assistant.exe', 'PreBot Special Edition (Standalone).exe'];

function log(message) {
    console.log(`[Build-Special] ${message}`);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
    await sleep(2000); 
    log('🚀 Starting Special Edition Build Process...');

    // 1. Prepare Temp Directory with Retry
    if (fs.existsSync(BUILD_TEMP_DIR)) {
        log('🧹 Cleaning old build folder...');
        let deleted = false;
        for (let i = 0; i < 5; i++) {
            try {
                fs.rmSync(BUILD_TEMP_DIR, { recursive: true, force: true });
                deleted = true;
                break;
            } catch (e) {
                log(`⚠️ Retry ${i+1}/5 to clean ${BUILD_TEMP_DIR}...`);
                await sleep(2000);
            }
        }
    }
    fs.mkdirSync(BUILD_TEMP_DIR, { recursive: true });

    // 2. Build Frontend
    log('⚛️ Building Frontend...');
    execSync('npm run build', { stdio: 'inherit', cwd: path.join(ROOT_DIR, 'frontend') });

    // 3. Copy files to Temp Directory for modification
    log('📂 Preparing source for bytecode protection...');
    const filesToCopy = [
        '.', // All files
    ];
    
    // We use a simple copy (excluding dist and node_modules for speed, we will use root node_modules)
    // Actually, electron-builder handles node_modules, so we just need the source
    const excludeFolders = ['dist', 'dist_build_special', 'dist_build_temp', 'frontend', '.git', 'node_modules'];
    
    const items = fs.readdirSync(ROOT_DIR);
    for (const item of items) {
        if (!excludeFolders.includes(item)) {
            const src = path.join(ROOT_DIR, item);
            const dest = path.join(BUILD_TEMP_DIR, item);
            if (fs.lstatSync(src).isDirectory()) {
                // Simplified recursive copy
                copyRecursive(src, dest);
            } else {
                fs.copyFileSync(src, dest);
            }
        }
    }

    // 4. Create Junction for node_modules
    log('🔗 Linking node_modules...');
    const srcNodeModules = path.join(ROOT_DIR, 'node_modules');
    const destNodeModules = path.join(BUILD_TEMP_DIR, 'node_modules');
    if (fs.existsSync(srcNodeModules)) {
        try {
            fs.symlinkSync(srcNodeModules, destNodeModules, 'junction');
        } catch (e) {}
    }

    // 5. Copy built frontend to the temp root
    const frontendDist = path.join(ROOT_DIR, 'frontend', 'dist');
    copyRecursive(frontendDist, BUILD_TEMP_DIR);

    // 5. Apply Bytecode Protection
    await compileFiles(BUILD_TEMP_DIR);

    // 7. Run Electron Builder on the temp directory
    log('📦 Packaging Special Edition executable...');
    
    // Explicitly set the electron version
    let electronVersion = "27.0.0";
    try {
        const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
        electronVersion = rootPkg.devDependencies.electron.replace('^', '').replace('~', '');
    } catch (e) {}

    // We update the product name for the special edition
    const pkgPath = path.join(BUILD_TEMP_DIR, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.build.productName = "PreBot Special Edition (Standalone)";
    pkg.build.appId = "com.prebot.special";
    
    // Force specific output .exe names for the special build
    if (pkg.build.win) pkg.build.win.artifactName = "PreBot_Special_${version}_${arch}.${ext}";
    if (pkg.build.nsis) pkg.build.nsis.artifactName = "PreBot_Special_Setup_${version}_${arch}.${ext}";
    if (pkg.build.portable) pkg.build.portable.artifactName = "PreBot_Special_Portable_${version}_${arch}.${ext}";
    
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

    const distOutputPath = path.join(ROOT_DIR, 'dist', 'special');

    try {
        // Build for x64 only and disable asar for bytecode stability
        execSync(`npx electron-builder --win --x64 -c.electronVersion=${electronVersion} -c.directories.output="${distOutputPath}" -c.asar=false`, { 
            stdio: 'inherit',
            cwd: BUILD_TEMP_DIR,
            env: { ...process.env, NODE_ENV: 'production' }
        });
        log('✨ Special Edition Build Successful!');
        log(`📂 Special files are in: ${distOutputPath}`);

        // --- NEW: AUTO-COPY TO DOWNLOADS ---
        try {
            const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
            const version = pkg.version;
            const downloadDir = path.join(ROOT_DIR, 'frontend', 'public', 'downloads');

            if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

            // Find the special setup file. Naming: "PreBot_Special_Setup_1.0.13_x64.exe"
            const buildFiles = fs.readdirSync(distOutputPath);
            const setupFile = buildFiles.find(f => f.startsWith('PreBot_Special_Setup') && f.endsWith('.exe'));

            if (setupFile) {
                const srcPath = path.join(distOutputPath, setupFile);
                const destPath = path.join(downloadDir, `prebot-special-setup-v${version}.exe`);
                
                log(`🚀 Copying ${setupFile} to Downloads as prebot-special-setup-v${version}.exe...`);
                fs.copyFileSync(srcPath, destPath);

                // Create/Update metadata for the frontend
                const metaPath = path.join(downloadDir, 'latest-version.json');
                let meta = {};
                if (fs.existsSync(metaPath)) {
                    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch (e) {}
                }
                
                meta.special = {
                    version: version,
                    releaseDate: new Date().toISOString(),
                    filename: `prebot-special-setup-v${version}.exe`
                };

                fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
                log('✨ Special Version metadata updated successfully!');
            }
        } catch (copyErr) {
            log(`⚠️ Auto-copy failed: ${copyErr.message}`);
        }
    } catch (err) {
        log('❌ Build Failed!');
    }
}

function copyRecursive(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();
    if (isDirectory) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest);
        fs.readdirSync(src).forEach((childItemName) => {
            copyRecursive(path.join(src, childItemName), path.join(dest, childItemName));
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

startBuild();
