Add-Type -AssemblyName System.Speech;
try {
    $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine;
    Write-Host "Engine Created"
    $recognizer.SetInputToDefaultAudioDevice();
    Write-Host "Audio Device Connected"
    $grammar = New-Object System.Speech.Recognition.DictationGrammar;
    $recognizer.LoadGrammar($grammar);
    Write-Host "Grammar Loaded"
    $recognizer.RecognizeAsync([System.Speech.Recognition.RecognizeMode]::Multiple);
    Write-Host "STATUS:LISTENING"
} catch {
    Write-Host "ERROR:" $_.Exception.Message
    if ($_.Exception.InnerException) {
        Write-Host "INNER_ERROR:" $_.Exception.InnerException.Message
    }
}
