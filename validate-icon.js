const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

/**
 * Comprehensive Icon Validator
 * Checks if your custom icon meets requirements for both Windows and Android
 */

const iconIcoPath = path.join(__dirname, 'assets', 'icon.ico');
const iconPngPath = path.join(__dirname, 'assets', 'icon.png');

async function validateIcon() {
  console.log('🔍 Comprehensive Icon Validation\n');
  console.log('='.repeat(50) + '\n');
  
  let hasErrors = false;
  let hasWarnings = false;
  
  // Check Windows ICO file
  console.log('📱 WINDOWS ICON (icon.ico)\n');
  if (fs.existsSync(iconIcoPath)) {
    try {
      const stats = fs.statSync(iconIcoPath);
      console.log(`✅ File exists: ${iconIcoPath}`);
      console.log(`   File size: ${(stats.size / 1024).toFixed(2)} KB\n`);
      
      // Try to read ICO file - ICO files can contain multiple sizes
      // We'll try to extract and check the largest size
      try {
        const metadata = await sharp(iconIcoPath).metadata();
        console.log(`   Dimensions: ${metadata.width}x${metadata.height} pixels`);
        console.log(`   Format: ${metadata.format}`);
        console.log(`   Channels: ${metadata.channels}`);
        
        if (metadata.width >= 256 && metadata.height >= 256) {
          console.log('   ✅ Meets Windows minimum requirement (256x256)\n');
        } else {
          console.log('   ❌ Does NOT meet Windows minimum requirement (256x256)');
          console.log('   ⚠️  Windows builds require at least 256x256 pixels\n');
          hasErrors = true;
        }
      } catch (icoError) {
        // ICO files can be complex - try alternative method
        console.log('   ⚠️  Could not read ICO dimensions directly');
        console.log('   💡 ICO files can contain multiple embedded sizes');
        console.log('   💡 If your icon is at least 256x256, it should work\n');
        hasWarnings = true;
      }
    } catch (error) {
      console.log(`   ❌ Error reading file: ${error.message}\n`);
      hasErrors = true;
    }
  } else {
    console.log(`❌ File not found: ${iconIcoPath}\n`);
    hasErrors = true;
  }
  
  // Check Android PNG file
  console.log('📱 ANDROID ICON (icon.png)\n');
  if (fs.existsSync(iconPngPath)) {
    try {
      const stats = fs.statSync(iconPngPath);
      console.log(`✅ File exists: ${iconPngPath}`);
      console.log(`   File size: ${(stats.size / 1024).toFixed(2)} KB\n`);
      
      try {
        const metadata = await sharp(iconPngPath).metadata();
        console.log(`   Dimensions: ${metadata.width}x${metadata.height} pixels`);
        console.log(`   Format: ${metadata.format}`);
        console.log(`   Channels: ${metadata.channels}`);
        console.log(`   Has alpha: ${metadata.hasAlpha ? 'Yes' : 'No'}\n`);
        
        // Android recommendations
        const recommendedSizes = [48, 72, 96, 144, 192, 512];
        const isRecommended = recommendedSizes.includes(metadata.width) && 
                              metadata.width === metadata.height;
        
        if (metadata.width >= 192 && metadata.height >= 192) {
          console.log('   ✅ Meets Android minimum requirement (192x192 for xxxhdpi)');
          if (isRecommended) {
            console.log(`   ✅ Size is recommended for Android (${metadata.width}x${metadata.height})`);
          } else {
            console.log(`   💡 Recommended sizes: ${recommendedSizes.join('x, ')}x`);
            console.log('   💡 Your icon will be resized automatically if needed');
          }
        } else {
          console.log('   ⚠️  Below recommended Android size (192x192)');
          console.log('   💡 Android will resize, but quality may be affected');
          hasWarnings = true;
        }
        console.log('');
      } catch (pngError) {
        console.log(`   ❌ Error reading PNG: ${pngError.message}\n`);
        hasErrors = true;
      }
    } catch (error) {
      console.log(`   ❌ Error reading file: ${error.message}\n`);
      hasErrors = true;
    }
  } else {
    console.log(`⚠️  File not found: ${iconPngPath}`);
    console.log('   💡 Android uses icon.png (will be generated if needed)\n');
    hasWarnings = true;
  }
  
  // Summary
  console.log('='.repeat(50));
  console.log('\n📊 VALIDATION SUMMARY\n');
  
  if (hasErrors) {
    console.log('❌ Issues found that may prevent builds from working');
    console.log('   Please fix the errors above before building\n');
    process.exit(1);
  } else if (hasWarnings) {
    console.log('⚠️  Warnings found - builds should work but may have issues');
    console.log('   Review the warnings above\n');
    process.exit(0);
  } else {
    console.log('✅ All checks passed!');
    console.log('   Your icons are ready for both Windows and Android builds\n');
    process.exit(0);
  }
}

// Run validation
validateIcon().catch(error => {
  console.error('\n❌ Validation error:', error.message);
  process.exit(1);
});

