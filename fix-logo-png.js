const sharp = require('sharp');
const path = require('path');

async function fixLogo() {
    try {
        const source = path.join(__dirname, 'assets', 'icon.png');
        const target = path.join(__dirname, 'www', 'assets', 'logo.png');
        
        console.log(`🔄 Converting ${source} to real PNG...`);
        
        await sharp(source)
            .resize(512, 512, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 0 }
            })
            .png()
            .toFile(target);
            
        console.log('✅ logo.png is now a valid 512x512 PNG file.');
    } catch (error) {
        console.error('❌ Failed to convert logo:', error);
    }
}

fixLogo();
