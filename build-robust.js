const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    console.log('🛡️ Starting Robust Build Process...');

    // 1. Kill lingering processes
    try {
        console.log('🔪 Killing lingering Electron processes...');
        try { execSync('taskkill /F /IM electron.exe', { stdio: 'ignore' }); } catch (e) {}
        try { execSync('taskkill /F /IM "Offline AI Chatbot.exe"', { stdio: 'ignore' }); } catch (e) {}
        console.log('✅ Processes killed.');
    } catch (e) {
        console.log('ℹ️ No lingering processes found (or failed to kill).');
    }

    await sleep(2000); // Wait for OS to release locks

    // 2. Clean dist folder with retry
    const distPath = path.join(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
        console.log('🧹 Cleaning dist folder...');
        let deleted = false;
        for (let i = 0; i < 5; i++) {
            try {
                fs.rmSync(distPath, { recursive: true, force: true });
                deleted = true;
                console.log('✅ dist folder cleaned.');
                break;
            } catch (e) {
                console.log(`⚠️ Attempt ${i + 1}/5 to clean dist failed. Retrying in 1s...`);
                await sleep(1000);
            }
        }
        if (!deleted) {
            console.error('❌ Could not clean dist folder. Please restart your computer.');
            process.exit(1);
        }
    }

    // 3. Build Frontend
    console.log('⚛️  Building Frontend...');
    try {
        // Check for --local flag to decide environment
        const isLocal = process.argv.includes('--local');
        const mode = isLocal ? 'development' : 'production';
        console.log(`   Using mode: ${mode}`);
        
        execSync(`cd frontend && npm run build -- --mode ${mode}`, { stdio: 'inherit' });
        console.log('✅ Frontend built successfully.');
    } catch (e) {
        console.error('❌ Frontend build failed.');
        process.exit(1);
    }

    // 4. Copy Frontend to Root (for Electron)
    console.log('📂 Copying frontend assets to root...');
    try {
        const sourceDir = path.join(__dirname, 'frontend', 'dist');
        const targetDir = __dirname;
        
        if (process.platform === 'win32') {
            // Robust copy for Windows using xcopy
            execSync(`xcopy /s /y /e "${sourceDir}\\*" "${targetDir}"`, { stdio: 'ignore' });
        } else {
            // Linux/Mac
            execSync(`cp -r "${sourceDir}/"* "${targetDir}"`, { stdio: 'ignore' });
        }
        console.log('✅ Assets copied.');
    } catch (e) {
        console.error('❌ Failed to copy assets:', e.message);
        process.exit(1);
    }

    // 5. Run Electron Build
    console.log('🏗️ Starting electron-builder...');
    const build = spawn('npm', ['run', 'build-win'], { stdio: 'inherit', shell: true });

    build.on('close', (code) => {
        if (code === 0) {
            console.log('\n✅ BUILD SUCCESSFUL!');
            console.log('📁 Exe location: dist/Offline AI Chatbot 1.0.0.exe');
        } else {
            console.error('\n❌ Build Failed.');
        }
    });
}

run();
