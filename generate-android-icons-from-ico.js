const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

/**
 * Generate Android Icons from ICO file
 * Extracts image from ICO and generates all Android icon sizes
 */

const sourceIconICO = path.join(__dirname, 'assets', 'icon.ico');
const tempPngPath = path.join(__dirname, 'assets', 'icon-temp.png');

// Android icon sizes (in pixels)
const androidIconSizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192
};

async function extractImageFromICO() {
  const icoBuffer = fs.readFileSync(sourceIconICO);
  
  // Try multiple methods to extract PNG from ICO
  const methods = [
    // Method 1: Try sharp on the buffer directly
    async () => {
      return await sharp(icoBuffer).ensureAlpha().png().toBuffer();
    },
    // Method 2: Look for embedded PNG
    async () => {
      const pngSig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      let offset = icoBuffer.indexOf(pngSig);
      if (offset === -1) {
        offset = icoBuffer.indexOf(Buffer.from([0x89, 0x50, 0x4E, 0x47]));
      }
      if (offset !== -1) {
        const pngData = icoBuffer.slice(offset);
        return await sharp(pngData).png().toBuffer();
      }
      throw new Error('No PNG found');
    }
  ];
  
  for (let i = 0; i < methods.length; i++) {
    try {
      const pngBuffer = await methods[i]();
      // Save as temporary PNG
      fs.writeFileSync(tempPngPath, pngBuffer);
      const metadata = await sharp(pngBuffer).metadata();
      console.log(`   ✅ Extracted: ${metadata.width}x${metadata.height} pixels\n`);
      return pngBuffer;
    } catch (error) {
      if (i === methods.length - 1) throw error;
      continue;
    }
  }
}

async function generateIcons() {
  try {
    console.log('📱 Android Icon Generator (from ICO)\n');
    console.log('='.repeat(50) + '\n');
    
    if (!fs.existsSync(sourceIconICO)) {
      console.error('❌ icon.ico not found!');
      process.exit(1);
    }
    
    console.log('🔍 Extracting image from icon.ico...\n');
    const imageBuffer = await extractImageFromICO();
    
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    console.log(`📐 Source image: ${metadata.width}x${metadata.height} pixels\n`);
    
    console.log('🔄 Generating Android icons...\n');
    
    // Generate icons for each density
    for (const [folder, size] of Object.entries(androidIconSizes)) {
      const outputDir = path.join(__dirname, 'android', 'app', 'src', 'main', 'res', folder);
      const outputPath = path.join(outputDir, 'ic_launcher.png');
      const outputRoundPath = path.join(outputDir, 'ic_launcher_round.png');
      
      // Ensure directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Resize and save regular icon
      await sharp(imageBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toFile(outputPath);
      
      // Also create round icon
      await sharp(imageBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toFile(outputRoundPath);
      
      // Generate foreground icon for adaptive icons
      const foregroundSize = Math.round(size * 0.8);
      const foregroundPath = path.join(outputDir, 'ic_launcher_foreground.png');
      await sharp(imageBuffer)
        .resize(foregroundSize, foregroundSize, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toFile(foregroundPath);
      
      console.log(`✅ Generated ${folder}/ic_launcher.png (${size}x${size})`);
      console.log(`✅ Generated ${folder}/ic_launcher_foreground.png (${foregroundSize}x${foregroundSize})`);
    }
    
    // Clean up temp file
    if (fs.existsSync(tempPngPath)) {
      fs.unlinkSync(tempPngPath);
    }
    
    console.log('\n✅ All Android icons generated successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Run: npm run cap:sync');
    console.log('   2. Rebuild your APK in Android Studio\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    // Clean up temp file on error
    if (fs.existsSync(tempPngPath)) {
      fs.unlinkSync(tempPngPath);
    }
    process.exit(1);
  }
}

generateIcons();

