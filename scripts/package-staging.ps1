# 组装 Electron staging 目录并打包 app.asar
# 关键：前端产物整目录拷贝，保留 dist/client/assets 层级，避免资源被扁平化导致 file:// 404
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$staging  = Join-Path $root 'release\staging'
$unpacked = Join-Path $root 'release\win-unpacked'

# 1. 清理 staging
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Force (Join-Path $staging 'electron') | Out-Null

# 2. 整目录拷贝前端产物（-Recurse 保留 assets 子目录）
Copy-Item (Join-Path $root 'dist\client') (Join-Path $staging 'dist\client') -Recurse -Force

# 3. 拷贝主进程脚本与图标
Copy-Item -Path 'electron\main.cjs','electron\preload.cjs','electron\splash.html' -Destination (Join-Path $staging 'electron') -Force
Copy-Item (Join-Path $root 'assets\icon.png') (Join-Path $staging 'electron\icon.png') -Force

# 4. staging package.json（asar 入口）。纯 ASCII，避免无 BOM 脚本中文被误解析
$pkgObj = [ordered]@{ name = 'html-editor'; version = '1.0.0'; productName = 'HTML Editor'; main = 'electron/main.cjs' }
$pkg = $pkgObj | ConvertTo-Json -Compress
$pkgPath = Join-Path $staging 'package.json'
[IO.File]::WriteAllText($pkgPath, $pkg, (New-Object Text.UTF8Encoding($false)))
if ((Get-Item $pkgPath).Length -eq 0) { throw 'package.json 写入为空' }
$parsed = Get-Content $pkgPath -Raw | ConvertFrom-Json
if (-not $parsed.main) { throw 'package.json 缺少 main 字段' }

# 5. 断言 assets 层级完整
$assets = Join-Path $staging 'dist\client\assets'
if (-not (Test-Path $assets)) { throw 'assets 目录缺失' }
$js  = Get-ChildItem $assets -Filter *.js
$css = Get-ChildItem $assets -Filter *.css
if ($js.Count -eq 0 -or $css.Count -eq 0) { throw "assets 内 js/css 缺失: js=$($js.Count) css=$($css.Count)" }
Write-Host ("staging OK: js={0} css={1}" -f $js.Count, $css.Count)

# 6. 打包 asar
$asar = Join-Path $unpacked 'resources\app.asar'
npx asar pack $staging $asar
if ($LASTEXITCODE -ne 0) { throw 'asar pack 失败' }
Write-Host "asar packed: $asar"
