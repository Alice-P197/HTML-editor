# Rebuild unpacked Electron runtime: copy dist, rename main exe, slim locales, pack asar, set icon.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$electronDist = Join-Path $root 'node_modules\electron\dist'
$unpacked     = Join-Path $root 'release\win-unpacked'
$staging      = Join-Path $root 'release\staging'
$iconIco      = Join-Path $root 'assets\icon.ico'
$rcedit       = Join-Path $root 'node_modules\rcedit\bin\rcedit-x64.exe'
$keepLocales  = @('zh-CN.pak', 'en-US.pak')
# WebGPU / Vulkan software-runtime chain; this editor renders plain HTML and does not use WebGPU/Vulkan.
$dropRuntime  = @('dxcompiler.dll', 'dxil.dll', 'vk_swiftshader.dll', 'vk_swiftshader_icd.json', 'vulkan-1.dll')

# 1. Clean previous output
if (Test-Path $unpacked) { Remove-Item $unpacked -Recurse -Force }
if (Test-Path $staging)  { Remove-Item $staging  -Recurse -Force }

# 2. Copy Electron runtime, drop debug.log
Copy-Item $electronDist $unpacked -Recurse -Force
Remove-Item (Join-Path $unpacked 'debug.log') -Force -ErrorAction SilentlyContinue

# 3. Rename main executable
$appExe = Join-Path $unpacked 'HtmlEditor.exe'
Move-Item (Join-Path $unpacked 'electron.exe') $appExe

# 4. Slim locales: keep Simplified Chinese and English only
$locDir = Join-Path $unpacked 'locales'
Get-ChildItem $locDir -Filter *.pak | Where-Object { $keepLocales -notcontains $_.Name } | Remove-Item -Force

# 4b. Drop unused WebGPU/Vulkan runtime files
foreach ($f in $dropRuntime) { Remove-Item (Join-Path $unpacked $f) -Force -ErrorAction SilentlyContinue }

# 5. Assemble staging (frontend + main process + icon)
New-Item -ItemType Directory -Force (Join-Path $staging 'electron') | Out-Null
Copy-Item (Join-Path $root 'dist\client') (Join-Path $staging 'dist\client') -Recurse -Force
Copy-Item -Path 'electron\main.cjs', 'electron\preload.cjs', 'electron\splash.html' -Destination (Join-Path $staging 'electron') -Force
Copy-Item (Join-Path $root 'assets\icon.png') (Join-Path $staging 'electron\icon.png') -Force

$pkgObj = [ordered]@{ name = 'html-editor'; version = '1.0.0'; productName = 'HTML Editor'; main = 'electron/main.cjs' }
$pkg = $pkgObj | ConvertTo-Json -Compress
$pkgPath = Join-Path $staging 'package.json'
[IO.File]::WriteAllText($pkgPath, $pkg, (New-Object Text.UTF8Encoding($false)))

$assets = Join-Path $staging 'dist\client\assets'
if (-not (Test-Path $assets)) { throw 'assets dir missing' }
if (-not (Get-ChildItem $assets -Filter *.js)) { throw 'js asset missing' }

# 6. Pack asar and remove default app
$resDir = Join-Path $unpacked 'resources'
npx asar pack $staging (Join-Path $resDir 'app.asar')
if ($LASTEXITCODE -ne 0) { throw 'asar pack failed' }
Remove-Item (Join-Path $resDir 'default_app.asar') -Force -ErrorAction SilentlyContinue

# 7. Write custom icon and version info into the main exe PE resources
& $rcedit $appExe `
  --set-icon $iconIco `
  --set-version-string ProductName 'HTML Editor' `
  --set-version-string FileDescription 'HTML Editor' `
  --set-version-string CompanyName 'HTML Editor' `
  --set-version-string InternalName 'HtmlEditor' `
  --set-version-string OriginalFilename 'HtmlEditor.exe' `
  --set-file-version '1.0.0.0' `
  --set-product-version '1.0.0.0'
if ($LASTEXITCODE -ne 0) { throw 'rcedit failed' }

Write-Host 'unpacked rebuild OK'
$size = (Get-ChildItem $unpacked -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
Write-Host ('unpacked size: {0:N1} MB' -f $size)
