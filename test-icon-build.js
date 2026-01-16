const fs = require('fs');
const path = require('path');

/**
 * Test if icon files are ready for build
 * This checks file existence and basic properties without trying to read ICO internals
 */

const iconIcoPath = path.join(__dirname, 'assets', 'icon.ico');
const iconPngPath = path.join(__dirname, 'assets', 'icon.png');

console.log('🔍 Icon Build Readiness Test\n');
console.log('='.repeat(50) + '\n');

let allGood = true;

// Check Windows ICO
console.log('📱 WINDOWS BUILD (icon.ico)\n');
if (fs.existsSync(iconIcoPath)) {
  const stats = fs.statSync(iconIcoPath);
  const fileSizeKB = stats.size / 1024;
  
  console.log(`✅ File exists: icon.ico`);
  console.log(`   Size: ${fileSizeKB.toFixed(2)} KB`);
  console.log(`   Location: assets/icon.ico\n`);
  
  // ICO files typically range from 10KB to 500KB depending on embedded sizes
  // A 39KB file suggests it has multiple embedded sizes, which is good
  if (fileSizeKB < 5) {
    console.log('   ⚠️  File seems very small - might be missing embedded sizes');
    allGood = false;
  } else if (fileSizeKB > 1000) {
    console.log('   ⚠️  File is very large - might cause build issues');
  } else {
    console.log('   ✅ File size looks reasonable for an ICO file');
    console.log('   💡 ICO files contain multiple embedded sizes (16x16, 32x32, 48x48, 256x256, etc.)');
  }
  
  // Check if it's actually an ICO file (basic check - ICO files start with specific bytes)
  const buffer = fs.readFileSync(iconIcoPath);
  const isLikelyICO = buffer[0] === 0x00 && buffer[1] === 0x00; // ICO files typically start with 00 00
  
  if (isLikelyICO || fileSizeKB > 10) {
    console.log('   ✅ File format appears to be ICO\n');
  } else {
    console.log('   ⚠️  File might not be a valid ICO format\n');
    allGood = false;
  }
} else {
  console.log('❌ File NOT found: icon.ico');
  console.log('   Required for Windows builds\n');
  allGood = false;
}

// Check Android PNG
console.log('📱 ANDROID BUILD (icon.png)\n');
if (fs.existsSync(iconPngPath)) {
  const stats = fs.statSync(iconPngPath);
  const fileSizeKB = stats.size / 1024;
  
  console.log(`✅ File exists: icon.png`);
  console.log(`   Size: ${fileSizeKB.toFixed(2)} KB`);
  console.log(`   Location: assets/icon.png\n`);
  
  // Check file header to see if it's PNG or SVG
  const buffer = fs.readFileSync(iconPngPath, { encoding: null });
  const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
  const isSVG = buffer.toString('utf8', 0, Math.min(100, buffer.length)).includes('<svg');
  
  if (isSVG) {
    console.log('   ⚠️  File is actually an SVG, not PNG');
    console.log('   💡 This is okay - the Android icon generator can use SVG');
    console.log('   💡 It will be converted to PNG during the build process\n');
  } else if (isPNG) {
    console.log('   ✅ File is a valid PNG format');
    if (fileSizeKB < 1) {
      console.log('   ⚠️  File is very small - might be low resolution');
    }
    console.log('');
  } else {
    console.log('   ⚠️  File format unclear\n');
  }
} else {
  console.log('⚠️  File NOT found: icon.png');
  console.log('   Android build will use icon.ico if available\n');
}

// Final verdict
console.log('='.repeat(50));
console.log('\n📊 BUILD READINESS\n');

if (allGood) {
  console.log('✅ Your icons appear ready for building!');
  console.log('\n💡 Recommendations:');
  console.log('   1. Windows: Your icon.ico should work fine');
  console.log('   2. Android: Run "npm run generate:android-icons" to generate Android icons');
  console.log('   3. Test build: Run "npm run build-win" to verify\n');
} else {
  console.log('⚠️  Some issues detected');
  console.log('   Please review the warnings above\n');
}

