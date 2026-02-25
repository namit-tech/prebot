const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const EventEmitter = require('events');

class STTHandler extends EventEmitter {
    constructor() {
        super();
        this.psProcess = null;
        this.isActive = false;
    }

    start() {
        if (this.isActive) return;
        this.isActive = true;

        console.log('[STT] Starting High-Accuracy Continuous Engine...');

        const psScript = `
            $ErrorActionPreference = "Stop"
            try {
                Add-Type -AssemblyName System.Speech;
                [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
                
                $engines = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers();
                if ($engines.Count -eq 0) {
                    Write-Host "ERROR:No Speech Engines found.";
                    exit 1;
                }

                $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine;
                
                # Accuracy Tuning
                $recognizer.InitialSilenceTimeout = [TimeSpan]::FromSeconds(3);
                $recognizer.EndSilenceTimeout = [TimeSpan]::FromSeconds(1.5);
                $recognizer.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromSeconds(2);
                
                $recognizer.SetInputToDefaultAudioDevice();
                
                $grammar = New-Object System.Speech.Recognition.DictationGrammar;
                $recognizer.LoadGrammar($grammar);
                
                # Continuous Recognition Events
                $recognizer.add_SpeechRecognized({
                    param($s, $e);
                    if ($e.Result.Confidence -gt 0.1) {
                        Write-Host "RESULT:$($e.Result.Text)";
                    }
                });

                $recognizer.add_SpeechRecognitionRejected({
                    param($s, $e);
                    Write-Host "DIAG:Speech Rejected (Low Confidence)";
                });

                $recognizer.add_AudioLevelUpdated({
                    param($s, $e);
                    Write-Host "LEVEL:$($e.AudioLevel)";
                });

                $recognizer.add_RecognizeCompleted({
                    param($s, $e);
                    Write-Host "STATUS:IDLE";
                });

                # Start Async Continuous Mode
                $recognizer.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple);
                Write-Host "STATUS:LISTENING";
                Write-Host "DIAG:Engine Initialized - Multi-Mode Active";

                # Keep process alive forever until killed
                while($true) {
                    Start-Sleep -Seconds 5;
                    Write-Host "DIAG:HEARTBEAT - Monitoring...";
                }
            } catch {
                Write-Host "ERROR:Critical STT Crash: $($_.Exception.Message)";
                exit 99;
            }
        `;

        // Write the script to a temporary file to avoid PowerShell argument length and escaping bugs
        const tempScriptPath = path.join(os.tmpdir(), 'prebot-stt-engine.ps1');
        try {
            fs.writeFileSync(tempScriptPath, psScript, 'utf8');
        } catch (err) {
            console.error('[STT] Failed to create temp PS1 script', err);
            return;
        }

        this.psProcess = spawn('powershell.exe', [
            '-NoProfile', 
            '-ExecutionPolicy', 'Bypass', 
            '-File', tempScriptPath
        ]);

        this.psProcess.stdout.on('data', (data) => {
            const output = data.toString().trim();
            const lines = output.split(/\r?\n/);
            
            lines.forEach(line => {
                const trimmed = line.trim();
                if (!trimmed) return;
                
                if (trimmed.startsWith('RESULT:')) {
                    const text = trimmed.replace('RESULT:', '').trim();
                    this.emit('recognized', text);
                } else if (trimmed.startsWith('STATUS:')) {
                    const status = trimmed.replace('STATUS:', '').trim();
                    this.emit('status', status);
                } else if (trimmed.startsWith('LEVEL:')) {
                    const level = trimmed.replace('LEVEL:', '').trim();
                    this.emit('level', level);
                } else if (trimmed.startsWith('ERROR:')) {
                    const error = trimmed.replace('ERROR:', '').trim();
                    this.emit('error', error);
                } else if (trimmed.startsWith('DIAG:')) {
                    const msg = trimmed.replace('DIAG:', '').trim();
                    this.emit('diag', msg);
                }
            });
        });

        this.psProcess.stderr.on('data', (data) => {
            const err = data.toString().trim();
            if (err) console.warn('[STT-Internal] ', err.substring(0, 100));
        });

        this.psProcess.on('close', (code) => {
            console.log(`[STT] Process closed with code ${code}`);
            this.isActive = false;
            if (code !== 0 && code !== 1) {
                this.emit('error', `STT Engine Crashed (Code: ${code})`);
            }
            this.emit('status', 'OFFLINE');
        });
    }

    stop() {
        if (!this.isActive || !this.psProcess) return;
        try {
            spawn('taskkill', ['/pid', this.psProcess.pid, '/f', '/t']);
        } catch (e) {}
        this.psProcess = null;
        this.isActive = false;
    }
}

module.exports = new STTHandler();
