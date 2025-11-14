# PowerShell script to download TensorFlow.js pose detection models
# Run this script from the project root directory

Write-Host "Downloading TensorFlow.js pose detection models..." -ForegroundColor Green

# Function to download and extract model
function Download-Model {
    param(
        [string]$Url,
        [string]$OutputDir
    )
    
    Write-Host "Downloading from: $Url" -ForegroundColor Yellow
    Write-Host "Output directory: $OutputDir" -ForegroundColor Yellow
    
    # Create output directory
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
    
    # Download the model
    $tempFile = "$env:TEMP\model-$(Get-Random).tar.gz"
    try {
        $downloadUrl = "$Url" + "?tfjs-format=compressed"
        Write-Host "Full URL: $downloadUrl" -ForegroundColor Gray
        Invoke-WebRequest -Uri $downloadUrl -OutFile $tempFile -UseBasicParsing -ErrorAction Stop
        
        # Check if it's actually a tar.gz file
        $header = Get-Content $tempFile -TotalCount 1 -Raw -Encoding Byte
        if ($header[0] -eq 0x1F -and $header[1] -eq 0x8B) {
            # It's a gzip file, extract it
            Write-Host "Extracting model files..." -ForegroundColor Yellow
            # Use 7zip or tar if available
            if (Get-Command tar -ErrorAction SilentlyContinue) {
                tar -xzf $tempFile -C $OutputDir
            } else {
                Write-Host "Warning: tar command not found. Please extract $tempFile manually to $OutputDir" -ForegroundColor Red
            }
        } else {
            Write-Host "Warning: Downloaded file doesn't appear to be a tar.gz archive" -ForegroundColor Red
        }
    } catch {
        Write-Host "Error downloading: $_" -ForegroundColor Red
        Write-Host "You may need to download manually from: $Url" -ForegroundColor Yellow
    } finally {
        if (Test-Path $tempFile) {
            Remove-Item $tempFile -ErrorAction SilentlyContinue
        }
    }
}

# MoveNet Models
Write-Host "`n=== Downloading MoveNet Models ===" -ForegroundColor Cyan
Download-Model -Url "https://tfhub.dev/google/tfjs-model/movenet/singlepose/lightning/4" -OutputDir "assets/models/movenet/singlepose-lightning"
Download-Model -Url "https://tfhub.dev/google/tfjs-model/movenet/singlepose/thunder/4" -OutputDir "assets/models/movenet/singlepose-thunder"
Download-Model -Url "https://tfhub.dev/google/tfjs-model/movenet/multipose/lightning/1" -OutputDir "assets/models/movenet/multipose-lightning"

# BlazePose Models
Write-Host "`n=== Downloading BlazePose Models ===" -ForegroundColor Cyan

# Detector (same for all variants)
Download-Model -Url "https://tfhub.dev/mediapipe/tfjs-model/blazepose_3d/detector/1" -OutputDir "assets/models/blazepose/detector"

# Landmark models for each variant
Download-Model -Url "https://tfhub.dev/mediapipe/tfjs-model/blazepose_3d/landmark/lite/2" -OutputDir "assets/models/blazepose/lite/landmark"
Download-Model -Url "https://tfhub.dev/mediapipe/tfjs-model/blazepose_3d/landmark/full/2" -OutputDir "assets/models/blazepose/full/landmark"
Download-Model -Url "https://tfhub.dev/mediapipe/tfjs-model/blazepose_3d/landmark/heavy/2" -OutputDir "assets/models/blazepose/heavy/landmark"

# Copy detector to each variant directory
Write-Host "`nCopying detector model to variant directories..." -ForegroundColor Yellow
if (Test-Path "assets/models/blazepose/detector/model.json") {
    Copy-Item "assets/models/blazepose/detector/*" -Destination "assets/models/blazepose/lite/detector/" -Recurse -Force
    Copy-Item "assets/models/blazepose/detector/*" -Destination "assets/models/blazepose/full/detector/" -Recurse -Force
    Copy-Item "assets/models/blazepose/detector/*" -Destination "assets/models/blazepose/heavy/detector/" -Recurse -Force
}

Write-Host "`n=== Download Complete ===" -ForegroundColor Green
Write-Host "Note: If downloads failed, TensorFlow.js will automatically fall back to CDN." -ForegroundColor Yellow
Write-Host "You can also download models manually from TensorFlow Hub and place them in the assets/models/ directory." -ForegroundColor Yellow

