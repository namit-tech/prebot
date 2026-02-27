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
                $culture = New-Object System.Globalization.CultureInfo("en-US");
                $global:recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine($culture);
                
                # Accuracy Tuning (Crucial for clear results)
                $global:recognizer.InitialSilenceTimeout = [TimeSpan]::FromSeconds(5);
                $global:recognizer.BabbleTimeout = [TimeSpan]::FromSeconds(0);
                $global:recognizer.EndSilenceTimeout = [TimeSpan]::FromSeconds(1.5);
                $global:recognizer.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromSeconds(2);
                
                $global:recognizer.SetInputToDefaultAudioDevice();
                
                # Load Grammar
                $grammar = New-Object System.Speech.Recognition.DictationGrammar;
                $global:recognizer.LoadGrammar($grammar);
                
                Write-Host "STATUS:LISTENING";
                Write-Host "DIAG:Engine Ready (Tuned Sync Mode)";

                $global:lastState = "";
                while($true) {
                    # Monitoring Level for UI
                    $level = $global:recognizer.AudioLevel;
                    if ($level -gt 5) { Write-Host "LEVEL:$level" }

                    # Sync Recognize with a short internal timeout
                    # The engine uses the .EndSilenceTimeout to decide when a sentence is done
                    $result = $global:recognizer.Recognize([TimeSpan]::FromSeconds(2));
                    
                    if ($result) {
                        # Ignore extremely low confidence immediately
                        if ($result.Confidence -lt 0.1) {
                            # Silence - nothing to log
                        }
                        elseif ($result.Confidence -ge 0.5) {
                            # High quality result
                            Write-Host "RESULT:$($result.Text)";
                        } else {
                            # Mediocre result - log for debug but don't send to chat
                            Write-Host "DIAG:Filtered low-confidence result: $($result.Text) ($($result.Confidence))";
                        }
                    }
                    
                    # Heartbeat
                    $global:cnt++; if ($global:cnt % 15 -eq 0) { 
                        Write-Host "DIAG:HEARTBEAT - State: $($global:recognizer.AudioState)";
                    }
                }
            } catch {
                Write-Host "ERROR:Fatal Script Crash: $($_.Exception.Message)";
                exit 99;
            }
        `;

        // Encode the script in UTF-16LE Base64 for maximum reliability with PowerShell -EncodedCommand
        const scriptBuffer = Buffer.from(psScript, 'utf16le');
        const encodedScript = scriptBuffer.toString('base64');

        this.psProcess = spawn('powershell.exe', [
            '-NoProfile', 
            '-ExecutionPolicy', 'Bypass', 
            '-EncodedCommand', encodedScript
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
            if (err) console.warn('[STT-Internal-Error] ', err);
        });

        this.psProcess.on('close', (code) => {
            console.log(`[STT] Process closed with code ${code}`);
            this.psProcess = null;
            
            if (this.isActive && (code !== 0 && code !== 1)) {
                console.warn(`[STT] Engine crashed (Code: ${code}). Attempting auto-restart...`);
                this.emit('diag', `Engine Auto-Restarting (Last code: ${code})...`);
                this.isActive = false;
                setTimeout(() => this.start(), 2000); 
            } else {
                this.isActive = false;
                this.emit('status', 'OFFLINE');
            }
        });
    }

    stop() {
        if (!this.isActive || !this.psProcess) return;
        try {
            spawn('taskkill', ['/pid', this.psProcess.pid, '/f', '/t']);
        } catch (e) {
            // Error ignored
        }
        this.psProcess = null;
        this.isActive = false;
    }
}

module.exports = new STTHandler();
