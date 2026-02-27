
            $ErrorActionPreference = "Stop"
            trap {
                Write-Host "ERROR:Global Trap Caught: $($_.Exception.Message)"
                exit 99
            }
            try {
                Write-Host "DIAG:Initializing .NET Speech Component..."
                Add-Type -AssemblyName System.Speech;
                [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
                
                $engines = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers();
                if ($engines.Count -eq 0) {
                    Write-Host "ERROR:No Speech Engines found on this Windows system.";
                    exit 1;
                }

                Write-Host "DIAG:Creating Recognizer Engine..."
                $global:recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine;
                
                # Accuracy Tuning
                $global:recognizer.InitialSilenceTimeout = [TimeSpan]::FromSeconds(3);
                $global:recognizer.EndSilenceTimeout = [TimeSpan]::FromSeconds(1.5);
                $global:recognizer.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromSeconds(2);
                
                Write-Host "DIAG:Setting Audio Input..."
                try {
                    $global:recognizer.SetInputToDefaultAudioDevice();
                } catch {
                    Write-Host "ERROR:Failed to connect to Default Audio Device. Check privacy settings! ($($_.Exception.Message))";
                    exit 2;
                }
                
                Write-Host "DIAG:Loading Dictation Grammar..."
                $grammar = New-Object System.Speech.Recognition.DictationGrammar;
                $global:recognizer.LoadGrammar($grammar);
                
                # Continuous Recognition Events
                $global:recognizer.add_SpeechRecognized({
                    param($s, $e);
                    try {
                        if ($e.Result.Confidence -gt 0.1) {
                            Write-Host "RESULT:$($e.Result.Text)";
                        }
                    } catch { Write-Host "DIAG:Event Error - Recognized: $($_.Exception.Message)" }
                });

                $global:recognizer.add_SpeechRecognitionRejected({
                    param($s, $e);
                    Write-Host "DIAG:Speech Rejected (Low Confidence)";
                });

                $global:recognizer.add_AudioLevelUpdated({
                    param($s, $e);
                    # Only log every 10th level to avoid stdout spam
                    # $global:counter++; if ($global:counter % 10 -eq 0) { Write-Host "LEVEL:$($e.AudioLevel)" }
                });

                $global:recognizer.add_RecognizeCompleted({
                    param($s, $e);
                    Write-Host "STATUS:IDLE";
                    if ($e.Error) { Write-Host "ERROR:Recognition Engine Error: $($e.Error.Message)" }
                });

                # Start Async Continuous Mode
                Write-Host "DIAG:Starting Async Recognition..."
                $global:recognizer.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple);
                Write-Host "STATUS:LISTENING";
                Write-Host "DIAG:Engine Initialized - Multi-Mode Active";

                # Keep process alive forever until killed
                while($true) {
                    Start-Sleep -Seconds 5;
                    Write-Host "DIAG:HEARTBEAT - Monitoring...";
                }
            } catch {
                Write-Host "ERROR:Fatal Engine Crash: $($_.Exception.Message)";
                if ($_.Exception.InnerException) { Write-Host "DIAG:Inner Error: $($_.Exception.InnerException.Message)" }
                exit 99;
            }
        