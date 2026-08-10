const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

class PiperHandler {
    constructor() {
        this.piperPath = path.join(__dirname, 'assets', 'piper', 'piper.exe');
        this.modelsPath = path.join(__dirname, 'assets', 'piper');
        this.tempDir = path.join(os.tmpdir(), 'prebot-audio');

        // Ensure temp dir exists
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * Generates speech from text using Piper
     * @param {string} text - Text to speak
     * @param {string} modelName - Name of the ONNX model (e.g. 'en_US-lessac-medium')
     * @returns {Promise<string>} - Path to the generated WAV file
     */
    async generateSpeech(text, modelName = 'en_US-lessac-medium') {
        return new Promise((resolve, reject) => {
            const modelPath = path.join(this.modelsPath, `${modelName}.onnx`);
            
            if (!fs.existsSync(modelPath)) {
                return reject(new Error(`Voice model not found: ${modelName}`));
            }

            if (!fs.existsSync(this.piperPath)) {
                return reject(new Error('Piper executable not found. Please run setup-piper.ps1'));
            }

            const outputFilename = `speech-${uuidv4()}.wav`;
            const outputPath = path.join(this.tempDir, outputFilename);

            // Piper command: echo "params" | piper --model ... --output_file ...
            // We write input to stdin
            
            console.log(`[Piper] Generating speech with model: ${modelName}`);

            const piperProcess = spawn(this.piperPath, [
                '--model', modelPath,
                '--output_file', outputPath
            ]);

            piperProcess.stdin.write(text);
            piperProcess.stdin.end();

            let errorOutput = '';

            piperProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            piperProcess.on('close', (code) => {
                if (code === 0) {
                    console.log(`[Piper] Audio generated: ${outputPath}`);
                    resolve(outputPath);
                } else {
                    console.error('[Piper] Process failed:', errorOutput);
                    reject(new Error(`Piper failed with code ${code}: ${errorOutput}`));
                }
            });

            piperProcess.on('error', (err) => {
                reject(err);
            });
        });
    }

    /**
     * Sample rate the model emits, read from its sidecar config.
     * The renderer needs this to build correctly-pitched AudioBuffers.
     * @param {string} modelName
     * @returns {number} Hz (22050 fallback — the medium-quality Piper default)
     */
    getSampleRate(modelName = 'en_US-lessac-medium') {
        try {
            const cfgPath = path.join(this.modelsPath, `${modelName}.onnx.json`);
            const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
            return cfg?.audio?.sample_rate || 22050;
        } catch (e) {
            return 22050;
        }
    }

    /**
     * Streaming synthesis: emits raw PCM as Piper produces it, instead of writing a
     * WAV file and playing it afterwards. This is what makes barge-in possible —
     * the renderer can play chunks immediately and `cancel()` kills the process
     * mid-sentence when the user interrupts.
     *
     * Output is mono 16-bit signed LE PCM at getSampleRate(modelName).
     *
     * @param {string} text
     * @param {string} modelName
     * @param {{onChunk:Function, onEnd:Function, onError:Function}} handlers
     * @returns {{cancel: Function}} handle — call cancel() to stop generation immediately
     */
    streamSpeech(text, modelName = 'en_US-lessac-medium', handlers = {}) {
        const { onChunk, onEnd, onError } = handlers;
        const modelPath = path.join(this.modelsPath, `${modelName}.onnx`);

        if (!fs.existsSync(modelPath)) {
            if (onError) onError(new Error(`Voice model not found: ${modelName}`));
            return { cancel: () => {} };
        }
        if (!fs.existsSync(this.piperPath)) {
            if (onError) onError(new Error('Piper executable not found. Please run setup-piper.ps1'));
            return { cancel: () => {} };
        }

        const proc = spawn(this.piperPath, [
            '--model', modelPath,
            '--output_raw',
            '--quiet',
        ]);

        let cancelled = false;
        let errorOutput = '';

        proc.stdout.on('data', (chunk) => {
            if (!cancelled && onChunk) onChunk(chunk);
        });
        proc.stderr.on('data', (data) => { errorOutput += data.toString(); });

        proc.on('close', (code) => {
            if (cancelled) return; // caller already moved on
            if (code === 0) {
                if (onEnd) onEnd();
            } else if (onError) {
                onError(new Error(`Piper exited ${code}: ${errorOutput}`));
            }
        });
        proc.on('error', (err) => {
            if (!cancelled && onError) onError(err);
        });

        try {
            proc.stdin.write(text);
            proc.stdin.end();
        } catch (err) {
            if (onError) onError(err);
        }

        return {
            cancel: () => {
                if (cancelled) return;
                cancelled = true;
                try { proc.kill(); } catch (e) { /* already exited */ }
            },
        };
    }

    /**
     * Get available voice models from assets folder
     */
    getVoices() {
        if (!fs.existsSync(this.modelsPath)) return [];
        
        const files = fs.readdirSync(this.modelsPath);
        const onnxFiles = files.filter(f => f.endsWith('.onnx'));
        
        return onnxFiles.map(f => {
            const name = f.replace('.onnx', '');
            // Basic mapping for display
            let displayName = name;
            let lang = 'en-US';
            
            if (name.includes('en_IN')) {
                displayName = "Piper - Indian Accent (Kusal)";
                lang = 'en-IN';
            } else if (name.includes('lessac')) {
                displayName = "Piper - US Female (Lessac)";
                lang = 'en-US';
            } else {
                displayName = `Piper - ${name}`;
            }

            return {
                name: name, // This is the ID used for generation
                displayName: displayName,
                lang: lang
            };
        });
    }
}

module.exports = new PiperHandler();
