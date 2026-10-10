# Puts ffmpeg.exe and ffprobe.exe into src-tauri/binaries/ for packaging.
#
#   .\scripts\fetch-ffmpeg.ps1              # download the pinned gyan.dev build and verify its SHA-256
#   .\scripts\fetch-ffmpeg.ps1 -UseInstalled # copy the ffmpeg/ffprobe already on PATH instead
param([switch]$UseInstalled)

$ErrorActionPreference = 'Stop'
$Version = '7.1.1'
$Url = "https://github.com/GyanD/codexffmpeg/releases/download/$Version/ffmpeg-$Version-essentials_build.zip"
# From the winget manifest for Gyan.FFmpeg.Essentials 7.1.1 (same URL).
$Sha256 = '04861d3339c5ebe38b56c19a15cf2c0cc97f5de4fa8910e4d47e5e6404e4a2d4'

$Root = Split-Path -Parent $PSScriptRoot
$Dest = Join-Path $Root 'src-tauri\binaries'
New-Item -ItemType Directory -Force $Dest | Out-Null

if ($UseInstalled) {
    foreach ($tool in 'ffmpeg', 'ffprobe') {
        $src = (Get-Command $tool -ErrorAction Stop).Source
        Copy-Item $src (Join-Path $Dest "$tool.exe") -Force
        Write-Host "Copied $src"
    }
    Write-Warning 'Using the installed FFmpeg: make sure THIRD_PARTY_NOTICES.txt matches its version and license.'
    exit 0
}

$Work = Join-Path ([IO.Path]::GetTempPath()) "simpleclipper-ffmpeg-$([guid]::NewGuid())"
New-Item -ItemType Directory $Work | Out-Null
try {
    $Zip = Join-Path $Work 'ffmpeg.zip'
    Write-Host "Downloading $Url"
    Invoke-WebRequest -Uri $Url -OutFile $Zip -UseBasicParsing
    $actual = (Get-FileHash $Zip -Algorithm SHA256).Hash.ToLower()
    if ($actual -ne $Sha256) {
        throw "SHA-256 mismatch: expected $Sha256, got $actual"
    }
    Expand-Archive $Zip -DestinationPath $Work
    $Dir = Join-Path $Work "ffmpeg-$Version-essentials_build"
    Copy-Item (Join-Path $Dir 'bin\ffmpeg.exe') $Dest -Force
    Copy-Item (Join-Path $Dir 'bin\ffprobe.exe') $Dest -Force
    Copy-Item (Join-Path $Dir 'LICENSE') (Join-Path $Dest 'FFMPEG-LICENSE.txt') -Force
    Write-Host "FFmpeg $Version ready in $Dest"
}
finally {
    Remove-Item $Work -Recurse -Force -ErrorAction SilentlyContinue
}
