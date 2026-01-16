const fs = require('fs');
const path = require('path');

/**
 * Generate Android Icons from Source Icon
 * 
 * This script helps generate Android app icons from your source icon file.
 * It will create all required sizes for different screen densities.
 */

const sourceIconPath = path.join(__dirname, 'assets', 'icon.png');
const sourceIconICO = path.join(__dirname, 'assets', 'icon.ico');

// Android icon sizes (in pixels)
const androidIconSizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192
};

// Check if source icon exists - use either PNG or ICO format
let sourceIcon = null;
let isICO = false;
if (fs.existsSync(sourceIconPath)) {
  sourceIcon = sourceIconPath;
  console.log('✅ Found icon.png (will use for Android icons)');
} else if (fs.existsSync(sourceIconICO)) {
  sourceIcon = sourceIconICO;
  isICO = true;
  console.log('✅ Found icon.ico (will extract and use for Android icons)');
} else {
  console.error('❌ No icon file found!');
  console.error('   Please ensure you have either:');
  console.error('   - assets/icon.png');
  console.error('   - assets/icon.ico');
  process.exit(1);
}

console.log('\n📱 Android Icon Generator');
console.log('================================\n');

// Check if sharp is available (best option)
let sharp = null;
try {
  sharp = require('sharp');
  console.log('✅ Using Sharp library for image processing\n');
} catch (e) {
  console.log('⚠️  Sharp library not found');
  console.log('   Installing sharp...\n');
  
  // Try to install sharp
  const { execSync } = require('child_process');
  try {
    execSync('npm install sharp --save-dev', { stdio: 'inherit' });
    sharp = require('sharp');
    console.log('✅ Sharp installed successfully\n');
  } catch (installError) {
    console.error('❌ Failed to install sharp');
    console.error('   Please install manually: npm install sharp --save-dev');
    console.error('\n📝 Alternative: Use Android Asset Studio');
    console.error('   1. Go to: https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html');
    console.error('   2. Upload your icon.png or icon.ico');
    console.error('   3. Download and extract the generated icons');
    console.error('   4. Replace files in android/app/src/main/res/mipmap-*/');
    process.exit(1);
  }
}

// Extract image from ICO if needed
async function extractImageFromICO(icoPath) {
  const fs = require('fs');
  
  try {
    // Method 1: Try reading ICO file buffer directly with sharp
    const fileBuffer = fs.readFileSync(icoPath);
    const image = sharp(fileBuffer);
    const metadata = await image.metadata();
    return await image.ensureAlpha().png().toBuffer();
  } catch (error) {
    // Method 2: ICO might contain embedded PNG - try to extract it
    const icoBuffer = fs.readFileSync(icoPath);
    
    // Look for PNG signature in ICO (modern ICO format contains PNG)
    const pngSig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    let offset = icoBuffer.indexOf(pngSig);
    
    if (offset === -1) {
      // Try finding PNG header without full signature
      offset = icoBuffer.indexOf(Buffer.from([0x89, 0x50, 0x4E, 0x47]));
    }
    
    if (offset !== -1) {
      // Extract PNG from ICO
      const pngData = icoBuffer.slice(offset);
      return await sharp(pngData).png().toBuffer();
    }
    
    throw new Error(`Could not extract image from ICO: ${error.message}`);
  }
}

// Generate icons
async function generateIcons() {
  try {
    console.log('🔄 Generating Android icons...\n');
    
    let imageBuffer = null;
    let image = null;
    
    // If ICO format, extract image first
    if (isICO) {
      console.log('🔍 Extracting image from icon.ico...\n');
      imageBuffer = await extractImageFromICO(sourceIcon);
      image = sharp(imageBuffer);
    } else {
      // PNG format - use directly
      image = sharp(sourceIcon);
    }
    
    const metadata = await image.metadata();
    console.log(`📐 Source image: ${metadata.width}x${metadata.height} pixels\n`);
    
    // Generate icons for each density
    for (const [folder, size] of Object.entries(androidIconSizes)) {
      const outputDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'res', folder);
      const outputPath = path.join(outputDir, 'ic_launcher.png');
      const outputRoundPath = path.join(outputDir, 'ic_launcher_round.png');
      
      // Ensure directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Use the image buffer if we extracted from ICO, otherwise use the image directly
      const sourceForResize = imageBuffer ? sharp(imageBuffer) : image;
      
      // Delete existing files first to ensure fresh generation
      if (fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
      }
      if (fs.existsSync(outputRoundPath)) {
        fs.unlinkSync(outputRoundPath);
      }
      
      // Resize and save regular icon
      await sourceForResize
        .clone()
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toFile(outputPath);
      
      // Also create round icon (same as regular for now)
      await sourceForResize
        .clone()
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toFile(outputRoundPath);
      
      // Generate foreground icon for adaptive icons (Android 8.0+)
      // Foreground should be slightly smaller (about 80% of the size) to fit within safe zone
      const foregroundSize = Math.round(size * 0.8);
      const foregroundPath = path.join(outputDir, 'ic_launcher_foreground.png');
      
      // Delete existing foreground icon
      if (fs.existsSync(foregroundPath)) {
        fs.unlinkSync(foregroundPath);
      }
      
      await sourceForResize
        .clone()
        .resize(foregroundSize, foregroundSize, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toFile(foregroundPath);
      
      console.log(`✅ Generated ${folder}/ic_launcher.png (${size}x${size})`);
      console.log(`✅ Generated ${folder}/ic_launcher_foreground.png (${foregroundSize}x${foregroundSize})`);
    }
    
    console.log('\n✅ All Android icons generated successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Review the generated icons in android/app/src/main/res/mipmap-*/');
    console.log('   2. Run: npm run cap:sync');
    console.log('   3. Build your APK');
    console.log('\n');
    
  } catch (error) {
    console.error('\n❌ Error generating icons:', error.message);
    console.error('\n📝 Alternative: Use Android Asset Studio');
    console.error('   1. Go to: https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html');
    console.error('   2. Upload your icon.png or icon.ico');
    console.error('   3. Download and extract the generated icons');
    console.error('   4. Replace files in android/app/src/main/res/mipmap-*/');
    process.exit(1);
  }
}

// Run the generator
generateIcons();

