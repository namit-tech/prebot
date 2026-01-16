// Diagnostic script to check video files
const fs = require('fs');
const path = require('path');

console.log('🔍 Checking video files...\n');

// Check video-storage.json
const storageFile = path.join(__dirname, 'video-storage.json');
if (fs.existsSync(storageFile)) {
  const data = JSON.parse(fs.readFileSync(storageFile, 'utf8'));
  console.log(`📄 Found ${data.videos.length} videos in video-storage.json:\n`);
  
  data.videos.forEach((video, index) => {
    console.log(`${index + 1}. ${video.name}`);
    console.log(`   Size: ${(video.size / 1024).toFixed(2)} KB`);
    console.log(`   Path: ${video.path}`);
    console.log(`   Primary: ${video.isPrimary ? 'Yes ⭐' : 'No'}`);
    console.log(`   Has base64 data: ${video.data && video.data.startsWith('data:video/') ? 'Yes ✅' : 'No ❌'}`);
    
    // Check if file exists on disk
    const videoFilePath = path.join(__dirname, 'assets', 'videos', video.name);
    if (fs.existsSync(videoFilePath)) {
      const stats = fs.statSync(videoFilePath);
      console.log(`   File on disk: Yes ✅ (${(stats.size / 1024).toFixed(2)} KB)`);
    } else {
      console.log(`   File on disk: No ❌ (MISSING!)`);
    }
    console.log('');
  });
} else {
  console.log('❌ video-storage.json not found\n');
}

// Check assets/videos directory
const videosDir = path.join(__dirname, 'assets', 'videos');
if (fs.existsSync(videosDir)) {
  const files = fs.readdirSync(videosDir).filter(f => f.endsWith('.mp4'));
  console.log(`📁 Files in assets/videos/ directory: ${files.length}\n`);
  files.forEach(file => {
    const filePath = path.join(videosDir, file);
    const stats = fs.statSync(filePath);
    console.log(`   - ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
  });
} else {
  console.log('❌ assets/videos directory does not exist\n');
}

console.log('\n💡 SOLUTION:');
console.log('If videos are missing from disk, re-upload them in the Admin Panel.');
console.log('They will be automatically saved to disk when uploaded.');


