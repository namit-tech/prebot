const { app } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const EventEmitter = require('events');

class WhisperHandler extends EventEmitter {
    constructor() {
        super();
        this.isActive = false;
        this.currentLanguage = 'en';
    }

    getPaths() {
        // Find the base path, handling packaged vs dev environments
        let appPath = app.getAppPath();
        
        // Handle ASAR: External binaries and models CANNOT be read from inside app.asar
        // If we are in asar, we must point to the unpacked version
        if (appPath.includes('app.asar')) {
            appPath = appPath.replace('app.asar', 'app.asar.unpacked');
        }

        const whisperDir = path.join(appPath, 'assets', 'whisper');
        const cliPath = path.join(whisperDir, 'Release', 'whisper-cli.exe');

        // Model can be in resources (packed) or userData (setup via app)
        const userDataPath = app.getPath('userData');
        const userDataModelPath = path.join(userDataPath, 'assets', 'whisper', 'ggml-base.en-q5_1.bin');
        
        // Prefer userData (the downloaded one) as it's guaranteed to be on disk
        const modelPath = fs.existsSync(userDataModelPath) ? userDataModelPath : path.join(whisperDir, 'ggml-base.en-q5_1.bin');

        console.log(`[Whisper-Paths] Binary: ${cliPath}`);
        console.log(`[Whisper-Paths] Model: ${modelPath}`);

        return {
            exePath: cliPath,
            modelPath: modelPath,
            whisperDir
        };
    }

    /**
     * Transcribe a WAV audio file using whisper-cli.exe (batch mode).
     * This gives maximum accuracy because whisper processes the entire
     * recording at once with full context — no real-time pressure.
     */
    async transcribeFile(wavPath, language = 'en') {
        const { exePath, modelPath } = this.getPaths();
        const cpuCores = os.cpus().length || 4;
        const threads = Math.max(1, Math.min(cpuCores - 1, 8));

        console.log(`[Whisper-Batch] Transcribing: ${wavPath}`);
        console.log(`[Whisper-Batch] Model: ${modelPath}`);
        console.log(`[Whisper-Batch] Threads: ${threads}, Language: ${language}`);

        if (!fs.existsSync(exePath)) {
            const error = `Whisper CLI not found at: ${exePath}`;
            this.emit('error', error);
            return { success: false, error };
        }

        if (!fs.existsSync(modelPath)) {
            const error = `Whisper model not found at: ${modelPath}`;
            this.emit('error', error);
            return { success: false, error };
        }

        if (!fs.existsSync(wavPath)) {
            const error = `Audio file not found at: ${wavPath}`;
            this.emit('error', error);
            return { success: false, error };
        }

        this.isActive = true;
        this.emit('status', 'PROCESSING');
        this.emit('diag', `Transcribing audio (${threads} threads, beam 5)...`);

        return new Promise((resolve) => {
            const args = [
                '-m', modelPath,
                '-t', threads.toString(),
                '--beam-size', '2',
                '--language', language,
                '--no-timestamps',
                '-f', wavPath
            ];

            console.log(`[Whisper-Batch] Command: ${exePath} ${args.join(' ')}`);

            let stdout = '';
            let stderr = '';

            const proc = execFile(exePath, args, {
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer
                timeout: 120000 // 2 minute timeout
            }, (error, stdoutData, stderrData) => {
                this.isActive = false;
                stdout = stdoutData || '';
                stderr = stderrData || '';

                if (error) {
                    console.error('[Whisper-Batch] Error:', error.message);
                    this.emit('error', `Transcription failed: ${error.message}`);
                    this.emit('status', 'OFFLINE');
                    resolve({ success: false, error: error.message });
                    return;
                }

                // Parse the output - whisper-cli outputs transcribed text to stdout
                let transcription = stdout
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => {
                        // Skip empty lines, timestamp lines, and system output
                        if (!line) return false;
                        if (line.startsWith('[')) return false; // timestamps like [00:00:00.000 --> ...]
                        if (line.includes('whisper_')) return false; // system logs
                        if (line.includes('main:')) return false;
                        return true;
                    })
                    .join(' ')
                    .trim();

                // Clean up common noise hallucinations
                const noiseTags = [
                    '[MUSIC PLAYING]', '[MUSIC]', '[BLANK_AUDIO]',
                    '[NOISE]', '[LAUGHTER]', '[APPLAUSE]', '[SILENCE]',
                    '[Start speaking]', '(silence)', '(whistling)',
                    '(beeping)', '(chiming)', '(birds chirping)',
                    '(scissors snipping)', '(slurping)',
                    'Beep beep beep', 'beep beep beep',
                    '(Silence)', '(audio blanks)'
                ];
                noiseTags.forEach(tag => {
                    transcription = transcription.split(tag).join('').trim();
                });

                console.log(`[Whisper-Batch] Result: "${transcription}"`);
                this.emit('diag', `Transcription complete: "${transcription.substring(0, 80)}..."`);
                this.emit('status', 'OFFLINE');

                // Clean up the temp WAV file
                try { fs.unlinkSync(wavPath); } catch (e) { /* ignore */ }

                resolve({ success: true, text: transcription });
            });
        });
    }

    // Legacy start/stop kept as no-ops for compatibility
    start() { this.isActive = true; }
    stop() { this.isActive = false; }
}

module.exports = new WhisperHandler();
