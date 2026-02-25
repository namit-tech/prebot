const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * verify-build.js
 * 
 * This script checks the 'dist' folder for the generated executable,
 * verifies its size, and provides architecture information to help
 * debug "This app can't run on your PC" errors.
 */

const DIST_DIR = path.join(__dirname, 'dist');

async function verify() {
    console.log('\n🔍 Verifying Build Integrity...\n');

    if (!fs.existsSync(DIST_DIR)) {
        console.error('❌ Error: "dist" folder not found! Please run the build script first.');
        return;
    }

    const files = fs.readdirSync(DIST_DIR);
    const exeFiles = files.filter(f => f.endsWith('.exe'));

    if (exeFiles.length === 0) {
        console.error('❌ Error: No .exe files found in "dist" folder.');
        return;
    }

    console.log(`✅ Found ${exeFiles.length} executable(s):`);
    
    for (const file of exeFiles) {
        const filePath = path.join(DIST_DIR, file);
        const stats = fs.statSync(filePath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

        console.log(`\n📄 File: ${file}`);
        console.log(`   Size: ${sizeMB} MB`);

        if (stats.size < 50 * 1024 * 1024) {
            console.warn('   ⚠️  Warning: File size seems smaller than expected for a portable Electron app (<50MB).');
        }

        // Try to check architecture using PowerShell if on Windows
        if (process.platform === 'win32') {
            try {
                // This command checks for "PE" headers. 0x8664 is x64, 0x014c is i386
                const cmd = `powershell -Command "$hex = [System.BitConverter]::ToString((Get-Content -Path '${filePath}' -Encoding Byte -TotalCount 4096)).Replace('-', ''); if ($hex -match '504500004C01') { 'ia32' } elseif ($hex -match '504500006486') { 'x64' } else { 'unknown' }"`;
                const arch = execSync(cmd).toString().trim();
                
                if (arch === 'ia32') {
                    console.log('   Arch: 32-bit (ia32/i386)');
                } else if (arch === 'x64') {
                    console.log('   Arch: 64-bit (x64)');
                } else {
                    console.log(`   Arch: Unknown (${arch})`);
                }
            } catch (e) {
                console.log('   Arch: Could not determine (PowerShell check failed)');
            }
        }
    }

    console.log('\n💡 Tip for distribution:');
    console.log('   If your users see "This app can\'t run on your PC":');
    console.log('   1. Ensure they are using the correct architecture version (ia32 vs x64).');
    console.log('   2. Verify the file size on their PC matches the one above (corruption during copy).');
    console.log('   3. If the file was downloaded, unblock it: Right-click -> Properties -> Unblock.');
}

verify().catch(console.error);
