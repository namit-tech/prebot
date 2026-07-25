const { app } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const EventEmitter = require('events');

const SERVER_PORT = 8899;
const NOISE_TAGS = [
    '[MUSIC PLAYING]', '[MUSIC]', '[BLANK_AUDIO]', '[NOISE]', '[LAUGHTER]',
    '[APPLAUSE]', '[SILENCE]', '[Start speaking]', '(silence)', '(whistling)',
    '(beeping)', '(chiming)', '(birds chirping)', '(scissors snipping)',
    '(slurping)', 'Beep beep beep', 'beep beep beep', '(Silence)', '(audio blanks)'
];

class WhisperHandler extends EventEmitter {
    constructor() {
        super();
        this.isActive = false;
        this.serverProcess = null;
        this.serverReady = false;
        this.serverStarting = false;
    }

    getPaths() {
        let appPath = app.getAppPath();
        if (appPath.includes('app.asar')) {
            appPath = appPath.replace('app.asar', 'app.asar.unpacked');
        }
        const appDir = path.join(appPath, 'assets', 'whisper');
        const udDir = path.join(app.getPath('userData'), 'assets', 'whisper');

        // Prefer userData copies (deployed on first run in packaged builds)
        const pick = (sub) => {
            const ud = path.join(udDir, sub);
            return fs.existsSync(ud) ? ud : path.join(appDir, sub);
        };

        return {
            exePath:    pick(path.join('Release', 'whisper-cli.exe')),
            serverPath: pick(path.join('Release', 'whisper-server.exe')),
            modelPath:  pick('ggml-base.en-q5_1.bin'),
        };
    }

    cleanTranscription(text) {
        let t = text || '';
        NOISE_TAGS.forEach(tag => { t = t.split(tag).join(''); });
        return t.trim();
    }

    // --- Server lifecycle ---

    async ensureServerRunning() {
        if (this.serverReady && this.serverProcess && !this.serverProcess.killed) return true;

        // Another call already started the server — wait for it
        if (this.serverStarting) {
            return new Promise((resolve) => {
                const poll = setInterval(() => {
                    if (!this.serverStarting) { clearInterval(poll); resolve(this.serverReady); }
                }, 250);
                setTimeout(() => { clearInterval(poll); resolve(false); }, 16000);
            });
        }

        // Orphan check: if a previous crash left a server running, reuse it rather than fighting for the port
        const alreadyUp = await this.pollPort();
        if (alreadyUp) {
            this.serverReady = true;
            this.serverStarting = false;
            console.log('[WhisperServer] Reusing existing server on port', SERVER_PORT);
            return true;
        }

        const { serverPath, modelPath } = this.getPaths();
        if (!fs.existsSync(serverPath)) {
            console.warn('[WhisperServer] whisper-server.exe not found:', serverPath);
            return false;
        }
        if (!fs.existsSync(modelPath)) {
            console.warn('[WhisperServer] Model not found:', modelPath);
            return false;
        }

        this.serverStarting = true;
        const threads = Math.max(1, Math.min((os.cpus().length || 4) - 1, 8));

        return new Promise((resolve) => {
            const args = [
                '-m', modelPath,
                '-t', threads.toString(),
                '--host', '127.0.0.1',
                '--port', SERVER_PORT.toString(),
            ];

            console.log(`[WhisperServer] Spawning on port ${SERVER_PORT} (${threads} threads)...`);
            this.serverProcess = spawn(serverPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

            let resolved = false;
            const markReady = () => {
                if (resolved) return;
                resolved = true;
                this.serverReady = true;
                this.serverStarting = false;
                console.log('[WhisperServer] ✅ Ready — model warm in RAM');
                resolve(true);
            };
            const markFailed = () => {
                if (resolved) return;
                resolved = true;
                this.serverStarting = false;
                resolve(false);
            };

            const onOutput = (data) => {
                const txt = data.toString();
                if (txt.trim()) console.log('[WhisperServer]', txt.trim().slice(0, 150));
                if (txt.toLowerCase().includes('listening') || txt.includes('HTTP server')) markReady();
            };

            this.serverProcess.stdout.on('data', onOutput);
            this.serverProcess.stderr.on('data', onOutput);

            this.serverProcess.on('close', (code) => {
                console.log(`[WhisperServer] Exited (code ${code})`);
                this.serverReady = false;
                this.serverProcess = null;
                this.serverStarting = false;
            });

            this.serverProcess.on('error', (err) => {
                console.error('[WhisperServer] Spawn error:', err.message);
                markFailed();
            });

            // Timeout: model load can take ~5s, give 14s total then poll the port once
            setTimeout(async () => {
                if (resolved) return;
                console.log('[WhisperServer] No "listening" line yet — polling port...');
                const up = await this.pollPort();
                if (up) { markReady(); } else { console.warn('[WhisperServer] Startup timeout'); markFailed(); }
            }, 14000);
        });
    }

    pollPort() {
        return new Promise((resolve) => {
            const req = http.get(`http://127.0.0.1:${SERVER_PORT}/`, (res) => {
                res.resume();
                resolve(true);
            });
            req.on('error', () => resolve(false));
            req.setTimeout(2000, () => { req.destroy(); resolve(false); });
        });
    }

    stopServer() {
        if (this.serverProcess) {
            try { this.serverProcess.kill(); } catch (e) {}
            this.serverProcess = null;
            this.serverReady = false;
            console.log('[WhisperServer] Stopped');
        }
    }

    // --- Transcription ---

    async transcribeViaServer(wavPath, language) {
        const boundary = `whisper${Date.now()}`;
        const fileBytes = fs.readFileSync(wavPath);
        const name = path.basename(wavPath);

        // Build multipart/form-data manually — no external deps
        const body = Buffer.concat([
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: audio/wav\r\n\r\n`),
            fileBytes,
            Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language}\r\n--${boundary}--\r\n`),
        ]);

        return new Promise((resolve, reject) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port: SERVER_PORT,
                path: '/inference',
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': body.length,
                },
            }, (res) => {
                let raw = '';
                res.on('data', c => { raw += c; });
                res.on('end', () => {
                    try {
                        const json = JSON.parse(raw);
                        resolve({ success: true, text: this.cleanTranscription(json.text || '') });
                    } catch (e) {
                        resolve({ success: false, error: 'Bad JSON from whisper-server' });
                    }
                });
            });
            req.on('error', reject);
            req.setTimeout(30000, () => { req.destroy(); reject(new Error('Inference timeout')); });
            req.write(body);
            req.end();
        });
    }

    /**
     * Main entry point called by IPC handler.
     * Fast path: whisper-server (model warm) → ~300-500ms.
     * Fallback: whisper-cli (cold start) → 2-5s.
     */
    async transcribeFile(wavPath, language = 'en') {
        this.isActive = true;
        this.emit('status', 'PROCESSING');
        this.emit('diag', 'Transcribing audio...');

        const serverUp = await this.ensureServerRunning();
        if (serverUp) {
            try {
                const t0 = Date.now();
                const result = await this.transcribeViaServer(wavPath, language);
                const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
                console.log(`[WhisperServer] ⚡ ${elapsed}s — "${result.text}"`);
                this.isActive = false;
                this.emit('status', 'OFFLINE');
                try { fs.unlinkSync(wavPath); } catch (e) {}
                return result;
            } catch (err) {
                console.warn('[WhisperServer] Request failed — falling back to CLI:', err.message);
                this.serverReady = false; // force retry next time
            }
        }

        return this.transcribeViaCLI(wavPath, language);
    }

    async transcribeViaCLI(wavPath, language = 'en') {
        const { exePath, modelPath } = this.getPaths();
        const threads = Math.max(1, Math.min((os.cpus().length || 4) - 1, 8));

        console.log(`[Whisper-CLI] Fallback: ${wavPath} (${threads} threads, lang: ${language})`);

        if (!fs.existsSync(exePath)) return { success: false, error: `Whisper CLI not found: ${exePath}` };
        if (!fs.existsSync(modelPath)) return { success: false, error: `Model not found: ${modelPath}` };
        if (!fs.existsSync(wavPath)) return { success: false, error: `Audio not found: ${wavPath}` };

        return new Promise((resolve) => {
            execFile(exePath, [
                '-m', modelPath,
                '-t', threads.toString(),
                '--beam-size', '2',
                '--language', language,
                '--no-timestamps',
                '-f', wavPath,
            ], { maxBuffer: 10 * 1024 * 1024, timeout: 120000 }, (error, stdout) => {
                this.isActive = false;
                this.emit('status', 'OFFLINE');
                try { fs.unlinkSync(wavPath); } catch (e) {}

                if (error) {
                    console.error('[Whisper-CLI] Error:', error.message);
                    resolve({ success: false, error: error.message });
                    return;
                }

                const transcription = this.cleanTranscription(
                    (stdout || '').split('\n')
                        .map(l => l.trim())
                        .filter(l => l && !l.startsWith('[') && !l.includes('whisper_') && !l.includes('main:'))
                        .join(' ')
                );
                console.log(`[Whisper-CLI] Result: "${transcription}"`);
                resolve({ success: true, text: transcription });
            });
        });
    }

    // Legacy no-ops
    start() { this.isActive = true; }
    stop() { this.isActive = false; }
}

module.exports = new WhisperHandler();
