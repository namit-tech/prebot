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
    Start-Sleep -Seconds 3;
    Write-Host "TEST COMPLETE";
    exit 0;
} catch {
    Write-Host "ERROR:Critical STT Crash: $($_.Exception.Message)";
    exit 99;
}
