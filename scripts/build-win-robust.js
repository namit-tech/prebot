const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const DIST_DIR = path.join(__dirname, '..', 'dist');
const PROCESSES_TO_KILL = [
    'prebot.exe',
    'electron.exe',
    'Offline AI Assistant.exe',
    'Offline AI Assistant Setup 1.0.0.exe'
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
                try {
                    execSync(`taskkill /F /IM "${proc}"`, { stdio: 'ignore' });
                    log(`Successfully killed ${proc}`);
                } catch (e) {
                    log(`Warning: Failed to kill ${proc}. It might have closed already.`);
                }
            }
        });
    } catch (error) {
        log('Error checking/killing processes: ' + error.message);
    }
}

function cleanDist() {
    log(`Cleaning distribution directory: ${DIST_DIR}`);
    
    if (fs.existsSync(DIST_DIR)) {
        try {
            fs.rmSync(DIST_DIR, { recursive: true, force: true });
            log('Cleaned dist directory successfully.');
        } catch (error) {
            console.error(`ERROR: Failed to clean ${DIST_DIR}. Files are likely locked.`);
            console.error('Common causes:');
            console.error('1. The app is still running (we tried to kill it).');
            console.error('2. You are inside the folder in File Explorer.');
            console.error('3. Antivirus or OneDrive is scanning/syncing the files.');
            process.exit(1);
        }
    } else {
        log('Dist directory does not exist, skipping clean.');
    }
}

function buildFrontend() {
    log('⚛️ Building Frontend...');
    try {
        execSync('cd frontend && npm run build', { stdio: 'inherit' });
        log('✅ Frontend built successfully.');
    } catch (error) {
        console.error('❌ Frontend build failed.');
        process.exit(1);
    }
}

function syncAssets() {
    log('📂 Syncing assets to root...');
    const sourceDir = path.join(__dirname, '..', 'frontend', 'dist');
    const targetDir = path.join(__dirname, '..');
    
    try {
        if (process.platform === 'win32') {
            execSync(`xcopy /s /y /e "${sourceDir}\\*" "${targetDir}"`, { stdio: 'ignore' });
        } else {
            execSync(`cp -r "${sourceDir}/"* "${targetDir}"`, { stdio: 'ignore' });
        }
        log('✅ Assets synced successfully.');
    } catch (error) {
        console.error('❌ Failed to sync assets:', error.message);
        process.exit(1);
    }
}

function runBuild() {
    buildFrontend();
    syncAssets();
    log('Starting electron-builder...');
    
    const buildCommand = 'electron-builder --win --x64 --ia32';
    
    try {
        execSync(buildCommand, { 
            stdio: 'inherit',
            cwd: path.join(__dirname, '..')
        });
        log('Build completed successfully!');
    } catch (error) {
        console.error('Build failed with error code: ' + error.status);
        process.exit(error.status || 1);
    }
}

// Main Execution
try {
    killProcesses();
    // specific wait to ensure file handles are released by OS
    setTimeout(() => {
        cleanDist();
        runBuild();
    }, 2000);
} catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
}
