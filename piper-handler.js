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
