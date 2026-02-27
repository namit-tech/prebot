$ErrorActionPreference = "Stop"
$ASSETS_DIR = Join-Path $PSScriptRoot "assets"
$WHISPER_DIR = Join-Path $ASSETS_DIR "whisper"

# create directories
if (-not (Test-Path $WHISPER_DIR)) {
    New-Item -ItemType Directory -Force -Path $WHISPER_DIR | Out-Null
}

$WHISPER_ZIP = Join-Path $WHISPER_DIR "whisper_bin.zip"
# Direct URL for whisper.cpp stable release binaries
$WHISPER_URL = "https://github.com/ggerganov/whisper.cpp/releases/download/v1.8.3/whisper-bin-x64.zip"
$MODEL_URL = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin"

if (-not (Test-Path (Join-Path $WHISPER_DIR "main.exe"))) {
    Write-Host "Downloading Whisper.cpp Binaries..."

    # Use -UseBasicParsing to avoid IE dependency on older Windows
    Invoke-WebRequest -Uri $WHISPER_URL -OutFile $WHISPER_ZIP -UseBasicParsing

    
    Write-Host "Extracting Whisper..."
    Expand-Archive -Path $WHISPER_ZIP -DestinationPath $WHISPER_DIR -Force
    
    Remove-Item $WHISPER_ZIP
    Write-Host "Whisper Binaries Installed."
}

if (-not (Test-Path (Join-Path $WHISPER_DIR "ggml-base.en.bin"))) {
    Write-Host "Downloading Whisper Model (Base.en)..."
    Invoke-WebRequest -Uri $MODEL_URL -OutFile (Join-Path $WHISPER_DIR "ggml-base.en.bin")
    Write-Host "Model Installed."
}

Write-Host "✅ OpenAI Whisper Setup Complete!"

