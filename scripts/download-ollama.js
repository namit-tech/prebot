const fs = require('fs');
const path = require('path');
const https = require('https');

const installerDir = path.join(__dirname, '..', 'resources', 'installers');
const installerPath = path.join(installerDir, 'OllamaSetup.exe');
const url = 'https://ollama.com/download/OllamaSetup.exe';

if (!fs.existsSync(installerDir)) {
    fs.mkdirSync(installerDir, { recursive: true });
}

console.log(`Downloading Ollama installer from ${url}...`);

const download = (url, dest) => {
    const file = fs.createWriteStream(dest);
    const request = https.get(url, (response) => {
        // Handle Redirects
        if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
            console.log(`Redirecting to: ${response.headers.location}`);
            download(response.headers.location, dest);
            return;
        }

        if (response.statusCode !== 200) {
            console.error(`Failed to download: ${response.statusCode}`);
            return;
        }

        response.pipe(file);

        file.on('finish', () => {
            file.close();
            console.log(`✅ Ollama installer downloaded to: ${dest}`);
        });
    }).on('error', (err) => {
        fs.unlink(dest, () => {});
        console.error(`Error downloading file: ${err.message}`);
    });
};

download(url, installerPath);
