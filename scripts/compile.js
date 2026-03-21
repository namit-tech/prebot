const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 Compiling main.js to V8 bytecode (main.jsc)...');

const mainJsPath = path.join(__dirname, '../main.js');
const mainJscPath = path.join(__dirname, '../main.jsc');
const tempWorkerPath = path.join(__dirname, 'temp-compile-worker.js');

// Remove old .jsc file if it exists to ensure fresh compilation
if (fs.existsSync(mainJscPath)) {
    fs.unlinkSync(mainJscPath);
}

// Create a temporary worker script to avoid Windows quote escaping issues
const workerCode = `
try {
    require('bytenode').compileFile({ filename: ${JSON.stringify(mainJsPath)}, output: ${JSON.stringify(mainJscPath)} });
    process.exit(0);
} catch (err) {
    console.error(err);
    process.exit(1);
}
`;
fs.writeFileSync(tempWorkerPath, workerCode);

try {
    // Industry Standard: Safely get the exact path to the local Electron binary
    const electronPath = require('electron');

    // execFileSync avoids cmd.exe entirely, making it 100% immune to Windows path/space issues
    execFileSync(electronPath, [tempWorkerPath], { 
        stdio: 'inherit', 
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } 
    });

    console.log('✅ Successfully generated main.jsc');
} catch (error) {
    console.error('❌ Bytecode compilation failed:', error.message);
    process.exit(1);
} finally {
    // Clean up temporary worker
    if (fs.existsSync(tempWorkerPath)) {
        fs.unlinkSync(tempWorkerPath);
    }
}