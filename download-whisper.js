const https = require('https');
const fs = require('fs');
const url = require('url');

function downloadFile(fileUrl, outputPath) {
    return new Promise((resolve, reject) => {
        const parsedUrl = url.parse(fileUrl);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.path,
            headers: { 'User-Agent': 'Node.js' }
        };

        https.get(options, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                console.log(`Redirecting to: ${res.headers.location}`);
                return downloadFile(res.headers.location, outputPath).then(resolve).catch(reject);
            }

            if (res.statusCode !== 200) {
                return reject(new Error(`Failed to download: ${res.statusCode}`));
            }

            const file = fs.createWriteStream(outputPath);
            res.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

const targetUrl = 'https://github.com/ggerganov/whisper.cpp/releases/download/v1.8.3/whisper-bin-x64.zip';
const targetPath = 'whisper_bin.zip';

console.log(`Starting download from: ${targetUrl}`);
downloadFile(targetUrl, targetPath)
    .then(() => console.log('Download complete!'))
    .catch(err => {
        console.error('Download failed:', err.message);
        process.exit(1);
    });
