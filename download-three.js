const fs = require('fs');
const https = require('https');
const path = require('path');

const fileUrl = 'https://unpkg.com/three@0.158.0/build/three.min.js';
const outputPath = path.join(__dirname, 'assets', 'libs', 'three.min.js');

const file = fs.createWriteStream(outputPath);

console.log(`Downloading ${fileUrl}...`);

https.get(fileUrl, function(response) {
  if (response.statusCode !== 200) {
    console.error(`Failed to download: ${response.statusCode}`);
    return;
  }
  response.pipe(file);
  file.on('finish', function() {
    file.close(() => {
        console.log(`Download completed: ${outputPath}`);
    });
  });
}).on('error', function(err) {
  fs.unlink(outputPath);
  console.error(`Error: ${err.message}`);
});
