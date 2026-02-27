$ErrorActionPreference = "Stop"
$ASSETS_DIR = Join-Path $PSScriptRoot "assets"
$VOSK_DIR = Join-Path $ASSETS_DIR "vosk-model"

# create directories
if (-not (Test-Path $VOSK_DIR)) {
    New-Item -ItemType Directory -Force -Path $VOSK_DIR | Out-Null
}

$MODEL_ZIP = Join-Path $ASSETS_DIR "vosk-model-en-us-0.22.zip"
$MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"

if (-not (Test-Path (Join-Path $VOSK_DIR "am"))) {
    Write-Host "Downloading Vosk Small English Model..."
    Invoke-WebRequest -Uri $MODEL_URL -OutFile $MODEL_ZIP
    
    Write-Host "Extracting Model..."
    # The zip usually contains a folder named 'vosk-model-small-en-us-0.15'
    $TEMP_EXTRACT = Join-Path $ASSETS_DIR "temp_vosk"
    Expand-Archive -Path $MODEL_ZIP -DestinationPath $TEMP_EXTRACT -Force
    
    # Move files to the final destination
    $EXTRACTED_FOLDER = Get-ChildItem -Path $TEMP_EXTRACT -Directory | Select-Object -First 1
    Move-Item -Path "$($EXTRACTED_FOLDER.FullName)\*" -Destination $VOSK_DIR -Force
    
    # Cleanup
    Remove-Item $MODEL_ZIP
    Remove-Item $TEMP_EXTRACT -Recurse -Force
    
    Write-Host "Vosk Model Installed."
} else {
    Write-Host "Vosk Model already exists."
}

Write-Host "✅ Vosk STT Setup Complete!"
