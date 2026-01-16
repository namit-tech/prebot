const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

/**
 * Validate Windows ICO file
 * Checks if the existing icon.ico meets the minimum size requirement (256x256)
 * This script only validates - it does NOT generate or modify your icon.ico file
 */

const outputIconPath = path.join(__dirname, 'assets', 'icon.ico');

async function validateWindowsIcon() {
  try {
    console.log('🔄 Validating Windows icon.ico...\n');
    
    // Check if icon.ico exists
    if (!fs.existsSync(outputIconPath)) {
      console.error('❌ icon.ico not found!');
      console.error(`   Expected at: ${outputIconPath}`);
      console.error('\n📝 Please provide your icon.ico file in the assets directory');
      process.exit(1);
    }
    
    // Try to read and validate the ICO file
    try {
      const metadata = await sharp(outputIconPath).metadata();
      const isValid = metadata.width >= 256 && metadata.height >= 256;
      
      if (isValid) {
        const stats = fs.statSync(outputIconPath);
        console.log('✅ icon.ico found and meets requirements!');
        console.log(`   Dimensions: ${metadata.width}x${metadata.height}`);
        console.log(`   File size: ${(stats.size / 1024).toFixed(2)} KB`);
        console.log(`   Location: ${outputIconPath}\n`);
        console.log('✅ Your custom icon.ico is ready to use!\n');
      } else {
        console.error(`❌ icon.ico does not meet minimum size requirement!`);
        console.error(`   Current size: ${metadata.width}x${metadata.height}`);
        console.error(`   Required: at least 256x256 pixels\n`);
        console.error('📝 Please provide an icon.ico file that is at least 256x256 pixels');
        process.exit(1);
      }
    } catch (error) {
      // If we can't read it with sharp, it might still be a valid ICO
      // but we can't verify the size - warn the user
      console.log('⚠️  Could not verify icon.ico dimensions');
      console.log('   The file exists but format verification failed');
      console.log('   Make sure your icon.ico is at least 256x256 pixels\n');
      console.log('💡 If you get build errors, ensure your icon.ico is 256x256 or larger');
    }
    
  } catch (error) {
    console.error('\n❌ Error validating Windows icon:', error.message);
    console.error('\n📝 Please ensure:');
    console.error('   1. icon.ico exists in the assets directory');
    console.error('   2. The icon is at least 256x256 pixels');
    process.exit(1);
  }
}

// Run the validator
validateWindowsIcon();
