const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const toIco = require('to-ico');

/**
 * Fix icon.ico to ensure it has a 256x256 embedded size
 * Uses your custom image from any available format (PNG, SVG, or ICO)
 */

const assetsDir = path.join(__dirname, 'assets');
const iconIcoPath = path.join(assetsDir, 'icon.ico');
const iconPngPath = path.join(assetsDir, 'icon.png');
const iconSvgPath = path.join(assetsDir, 'icon.svg');
const backupPath = path.join(assetsDir, 'icon.ico.backup');

async function findSourceImage() {
  // Priority: ICO > PNG > SVG
  const sources = [
    { path: iconIcoPath, name: 'icon.ico', priority: 1 },
    { path: iconPngPath, name: 'icon.png', priority: 2 },
    { path: iconSvgPath, name: 'icon.svg', priority: 3 }
  ].filter(s => fs.existsSync(s.path));
  
  if (sources.length === 0) {
    throw new Error('No icon file found! Please provide icon.ico, icon.png, or icon.svg in the assets folder');
  }
  
  // Sort by priority
  sources.sort((a, b) => a.priority - b.priority);
  
  return sources[0];
}

async function extractImageFromSource(sourcePath) {
  console.log(`   📂 Using: ${path.basename(sourcePath)}\n`);
  
  // Try to read the image
  let imageBuffer = null;
  let metadata = null;
  
  try {
    // Read the file
    const fileBuffer = fs.readFileSync(sourcePath);
    
    // Try to process with sharp
    const image = sharp(fileBuffer);
    metadata = await image.metadata();
    
    // Convert to PNG buffer for processing
    imageBuffer = await image
      .ensureAlpha()
      .png()
      .toBuffer();
    
    console.log(`   ✅ Extracted: ${metadata.width}x${metadata.height} pixels`);
    console.log(`   Format: ${metadata.format}\n`);
    
    return { imageBuffer, metadata };
  } catch (error) {
    // If it's an ICO file that sharp can't read directly, try alternative methods
    if (sourcePath.endsWith('.ico')) {
      const icoBuffer = fs.readFileSync(sourcePath);
      
      // Method 1: Look for embedded PNG in ICO (modern ICO format)
      const pngSig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      let offset = icoBuffer.indexOf(pngSig);
      
      if (offset === -1) {
        // Try finding PNG header without full signature
        offset = icoBuffer.indexOf(Buffer.from([0x89, 0x50, 0x4E, 0x47]));
      }
      
      if (offset !== -1) {
        console.log('   🔍 Found embedded PNG in ICO, extracting...');
        const pngData = icoBuffer.slice(offset);
        const img = sharp(pngData);
        metadata = await img.metadata();
        imageBuffer = await img.png().toBuffer();
        console.log(`   ✅ Extracted embedded PNG: ${metadata.width}x${metadata.height} pixels\n`);
        return { imageBuffer, metadata };
      }
    }
    
    throw new Error(`Could not read image from ${path.basename(sourcePath)}: ${error.message}`);
  }
}

async function fixIconIco() {
  try {
    console.log('🔧 Creating icon.ico with required Windows sizes...\n');
    console.log('='.repeat(50) + '\n');
    
    // Find the best source image
    console.log('🔍 Looking for your custom icon...\n');
    const source = await findSourceImage();
    console.log(`✅ Found: ${source.name}\n`);
    
    // Create backup of existing icon.ico if it exists
    if (fs.existsSync(iconIcoPath)) {
      console.log('📦 Creating backup of existing icon.ico...');
      fs.copyFileSync(iconIcoPath, backupPath);
      console.log(`   Backup saved: ${path.basename(backupPath)}\n`);
    }
    
    // Extract image from source
    const { imageBuffer, metadata } = await extractImageFromSource(source.path);
    
    // Check image quality
    const maxDimension = Math.max(metadata.width, metadata.height);
    if (maxDimension < 256) {
      console.log(`   ⚠️  Source image is ${metadata.width}x${metadata.height}`);
      console.log('   💡 Will upscale to 256x256 for Windows requirement\n');
    } else {
      console.log(`   ✅ Source image is large enough (${metadata.width}x${metadata.height})\n`);
    }
    
    // Create ICO file with all required sizes
    console.log('🔄 Generating icon.ico with required sizes...\n');
    
    const sizes = [16, 32, 48, 256];
    const buffers = [];
    
    for (const size of sizes) {
      const buffer = await sharp(imageBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toBuffer();
      console.log(`   ✅ Created ${size}x${size} size`);
      buffers.push(buffer);
    }
    
    // Create new ICO file
    console.log('\n💾 Saving new icon.ico...');
    const icoBuffer = await toIco(buffers);
    fs.writeFileSync(iconIcoPath, icoBuffer);
    
    const stats = fs.statSync(iconIcoPath);
    console.log(`   ✅ icon.ico created successfully!`);
    console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`   Contains: ${sizes.join('x, ')}x sizes\n`);
    
    console.log('='.repeat(50));
    console.log('\n✅ SUCCESS! Your icon.ico is ready for Windows builds!');
    console.log(`\n💡 Your original icon is backed up at: ${path.basename(backupPath)}`);
    console.log('💡 You can now run: npm run build-win\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    // Restore backup if something went wrong
    if (fs.existsSync(backupPath) && fs.existsSync(iconIcoPath)) {
      console.log('\n🔄 Restoring original icon.ico from backup...');
      fs.copyFileSync(backupPath, iconIcoPath);
      console.log('   Original icon restored\n');
    }
    
    console.error('\n📝 Troubleshooting:');
    console.error('   1. Ensure you have icon.ico, icon.png, or icon.svg in assets folder');
    console.error('   2. Make sure sharp and to-ico packages are installed');
    console.error('   3. Check that your image file is not corrupted\n');
    process.exit(1);
  }
}

// Run the fix
fixIconIco();
