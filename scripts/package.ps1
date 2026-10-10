# Builds the portable release zip: release/SimpleClipper-<version>-win-x64.zip
# Run scripts/fetch-ffmpeg.ps1 first.
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$Version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$Bin = Join-Path $Root 'src-tauri\binaries'
foreach ($f in 'ffmpeg.exe', 'ffprobe.exe') {
    if (-not (Test-Path (Join-Path $Bin $f))) { throw "Missing src-tauri\binaries\$f - run scripts\fetch-ffmpeg.ps1 first." }
}

# Through cmd so PowerShell 5.1 does not treat npm/cargo progress on stderr as errors.
cmd /c "npm run tauri build -- --no-bundle 2>&1"
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }

$Name = "SimpleClipper-$Version-win-x64"
$Stage = Join-Path $Root "release\$Name"
Remove-Item $Stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $Stage | Out-Null

Copy-Item 'src-tauri\target\release\SimpleClipper.exe' $Stage
Copy-Item (Join-Path $Bin 'ffmpeg.exe'), (Join-Path $Bin 'ffprobe.exe') $Stage
Copy-Item 'LICENSE', 'THIRD_PARTY_NOTICES.txt' $Stage
if (Test-Path (Join-Path $Bin 'FFMPEG-LICENSE.txt')) { Copy-Item (Join-Path $Bin 'FFMPEG-LICENSE.txt') $Stage }

$ZipPath = Join-Path $Root "release\$Name.zip"
Remove-Item $ZipPath -Force -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $Stage '*') -DestinationPath $ZipPath
$size = [math]::Round((Get-Item $ZipPath).Length / 1MB, 1)
Write-Host "Created $ZipPath ($size MB)"
