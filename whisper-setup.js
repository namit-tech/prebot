const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');
const { promisify } = require('util');
const { app, ipcMain } = require('electron');
const execAsync = promisify(exec);

/**
 * Whisper Setup Utility
 * Automated hardware audit and model management
 */
class WhisperSetup {
    constructor() {
        this.isDownloading = false;
        this.downloadProgress = 0;
        this.modelUrl = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en-q5_1.bin';
        this.modelName = 'ggml-base.en-q5_1.bin';
    }

    async detectHardware() {
        const results = {
            hasNvidia: false,
            gpuName: 'Default CPU',
            totalRamGB: 0,
            isHighSpec: false
        };

        try {
            // 1. Check RAM (Windows)
            if (process.platform === 'win32') {
                const { stdout: ramStdout } = await execAsync('wmic ComputerSystem get TotalPhysicalMemory');
                const ramBytes = parseInt(ramStdout.split('\n')[1], 10);
                results.totalRamGB = Math.round(ramBytes / (1024 * 1024 * 1024));
            }

            // 2. Check for NVIDIA GPU
            if (process.platform === 'win32') {
                try {
                    const { stdout: gpuStdout } = await execAsync('wmic path win32_VideoController get name');
                    const gpus = gpuStdout.split('\n').map(l => l.trim()).filter(l => l && l !== 'Name');
                    const nvidiaGpu = gpus.find(name => name.toLowerCase().includes('nvidia'));
                    
                    if (nvidiaGpu) {
                        results.hasNvidia = true;
                        results.gpuName = nvidiaGpu;
                    } else if (gpus.length > 0) {
                        results.gpuName = gpus[0];
                    }
                } catch (e) {
                    console.error('GPU detection failed:', e);
                }
            }

            results.isHighSpec = results.totalRamGB >= 8 && results.hasNvidia;
        } catch (error) {
            console.error('Hardware audit error:', error);
        }

        return results;
    }

    getModelPath() {
        let basePath = app.isPackaged ? app.getPath('userData') : __dirname;
        return path.join(basePath, 'assets', 'whisper', this.modelName);
    }

    async checkSetup() {
        const modelPath = this.getModelPath();
        const exists = fs.existsSync(modelPath);
        
        if (exists) {
            const stats = fs.statSync(modelPath);
            // ggml-base.en-q5_1.bin is ~50MB. Using 30MB threshold for safety.
            const isComplete = stats.size > 30 * 1024 * 1024; 
            return { exists: true, isComplete, path: modelPath };
        }
        
        return { exists: false, isComplete: false, path: modelPath };
    }

    async downloadModel(event) {
        if (this.isDownloading) return { success: false, message: 'Download already in progress' };

        const modelPath = this.getModelPath();
        const modelFolder = path.dirname(modelPath);

        if (!fs.existsSync(modelFolder)) {
            fs.mkdirSync(modelFolder, { recursive: true });
        }

        this.isDownloading = true;
        this.downloadProgress = 0;

        const sendProgress = (p, status) => {
            if (event) {
                event.sender.send('whisper-setup-progress', { progress: p, status });
            }
        };

        return new Promise((resolve, reject) => {
            sendProgress(0, 'Connecting to neural repository...');

            const downloadWithRedirect = (url) => {
                https.get(url, (res) => {
                    if (res.statusCode === 301 || res.statusCode === 302) {
                        return downloadWithRedirect(res.headers.location);
                    }

                    if (res.statusCode !== 200) {
                        this.isDownloading = false;
                        return reject(new Error(`Server returned ${res.statusCode}`));
                    }

                    const totalSize = parseInt(res.headers['content-length'], 10);
                    let downloadedSize = 0;
                    const file = fs.createWriteStream(modelPath);

                    res.on('data', (chunk) => {
                        downloadedSize += chunk.length;
                        this.downloadProgress = Math.round((downloadedSize / totalSize) * 100);
                        sendProgress(this.downloadProgress, `Downloading: ${this.downloadProgress}%`);
                    });

                    res.pipe(file);

                    file.on('finish', () => {
                        file.close();
                        this.isDownloading = false;
                        sendProgress(100, 'Verification complete.');
                        resolve({ success: true, path: modelPath });
                    });

                    file.on('error', (err) => {
                        fs.unlink(modelPath, () => {});
                        this.isDownloading = false;
                        reject(err);
                    });
                }).on('error', (err) => {
                    this.isDownloading = false;
                    reject(err);
                });
            };

            downloadWithRedirect(this.modelUrl);
        });
    }

    initIPC() {
        ipcMain.handle('whisper:audit-hardware', async () => {
            return await this.detectHardware();
        });

        ipcMain.handle('whisper:check-setup', async () => {
            return await this.checkSetup();
        });

        ipcMain.handle('whisper:download-model', async (event) => {
            try {
                return await this.downloadModel(event);
            } catch (error) {
                return { success: false, error: error.message };
            }
        });
    }
}

module.exports = new WhisperSetup();
