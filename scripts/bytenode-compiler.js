const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT_DIR = path.join(__dirname, '..');

const FILES_TO_COMPILE = [
    // 'main.js', // Excluded: Handled safely by scripts/compile.js using loader.js architecture
    'desktop-server.js',
    'ollama-bridge-manager.js',
    'security-manager.js',
    'ollama-setup.js',
    'whisper-setup.js',
    'whisper-handler.js',
    'piper-handler.js',
    'stt-handler.js',
    'embedded-backend.js'
];

async function compileFiles(distDir) {
    console.log('🛡️  Starting Electron-Compatible Bytecode Compilation...');
    
    const electronPath = require('electron');
    
    for (const file of FILES_TO_COMPILE) {
        const filePath = path.join(distDir, file);
        if (fs.existsSync(filePath)) {
            console.log(`🔒 Protecting: ${file}`);
            
            const jscPath = path.join(distDir, `${file}c`);
            const tempWorkerPath = path.join(distDir, `temp-worker-${Date.now()}.js`);
            
            try {
                // Clean up any old .jsc file
                if (fs.existsSync(jscPath)) fs.unlinkSync(jscPath);
                
                // Create a temporary worker script to avoid Windows quote escaping issues
                const workerCode = `
                try {
                    require('bytenode').compileFile({ filename: ${JSON.stringify(filePath)}, output: ${JSON.stringify(jscPath)} });
                    process.exit(0);
                } catch (err) {
                    console.error(err);
                    process.exit(1);
                }
                `;
                fs.writeFileSync(tempWorkerPath, workerCode);

                // Use execFileSync to completely bypass Windows cmd.exe interference
                execFileSync(electronPath, ['--no-lazy', tempWorkerPath, '--no-sandbox'], { 
                    stdio: 'inherit',
                    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } 
                });
                
                // CRITICAL FIX: Only overwrite the source file IF the .jsc was successfully generated
                if (fs.existsSync(jscPath)) {
                    const loaderContent = `
require('v8').setFlagsFromString('--no-lazy');
require('bytenode');
module.exports = require('./${file}c');`;
                    fs.writeFileSync(filePath, loaderContent);
                    console.log(`✅ ${file} is now V8-compatible and encrypted.`);
                } else {
                    throw new Error("Compilation completed but .jsc file is missing.");
                }
            } catch (err) {
                console.error(`❌ Failed to protect ${file}. Skipping encryption for this file. Error:`, err.message);
            } finally {
                if (fs.existsSync(tempWorkerPath)) fs.unlinkSync(tempWorkerPath);
            }
        }
    }
    console.log('✨ Protection Complete.');
}

module.exports = { compileFiles };
