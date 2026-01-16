$ErrorActionPreference = "Stop"
$ASSETS_DIR = Join-Path $PSScriptRoot "assets"
$PIPER_DIR = Join-Path $ASSETS_DIR "piper"

# Create directories
if (-not (Test-Path $PIPER_DIR)) {
    New-Item -ItemType Directory -Force -Path $PIPER_DIR | Out-Null
    Write-Host "Created $PIPER_DIR"
}

# 1. Download Piper Binary (v1.2.0)
$PIPER_ZIP = Join-Path $PIPER_DIR "piper_windows_amd64.zip"
$PIPER_URL = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip"

if (-not (Test-Path (Join-Path $PIPER_DIR "piper.exe"))) {
    Write-Host "Downloading Piper Binary..."
    Invoke-WebRequest -Uri $PIPER_URL -OutFile $PIPER_ZIP
    
    Write-Host "Extracting Piper..."
    Expand-Archive -Path $PIPER_ZIP -DestinationPath $ASSETS_DIR -Force
    
    # Cleanup
    Remove-Item $PIPER_ZIP
    Write-Host "Piper Binary Installed."
} else {
    Write-Host "Piper Binary already exists."
}

# 2. Download Voice Models
$VOICES = @(
    @{
        Name = "en_US-lessac-medium"
        Onnx = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx"
        Json = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"
    },
    @{
        Name = "en_IN-kusal-medium"
        Onnx = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_IN/kusal/medium/en_IN-kusal-medium.onnx"
        Json = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_IN/kusal/medium/en_IN-kusal-medium.onnx.json"
    }
)

foreach ($voice in $VOICES) {
    $OnnxPath = Join-Path $PIPER_DIR "$($voice.Name).onnx"
    $JsonPath = Join-Path $PIPER_DIR "$($voice.Name).onnx.json"
    
    if (-not (Test-Path $OnnxPath)) {
        Write-Host "Downloading $($voice.Name) Model..."
        Invoke-WebRequest -Uri $voice.Onnx -OutFile $OnnxPath
    }
    
    if (-not (Test-Path $JsonPath)) {
        Write-Host "Downloading $($voice.Name) Config..."
        Invoke-WebRequest -Uri $voice.Json -OutFile $JsonPath
    }
}

Write-Host "✅ Piper TTS Setup Complete!"
