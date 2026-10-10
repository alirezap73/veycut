param([ValidateSet('x64', 'arm64')][string]$Architecture = 'x64')

# The same Microsoft shader compiler for Windows validation and bundles.
$ErrorActionPreference = 'Stop'
$archive = Join-Path $env:RUNNER_TEMP 'veycut-dxc.zip'
$root = Join-Path $env:RUNNER_TEMP 'veycut-dxc'
$url = 'https://github.com/microsoft/DirectXShaderCompiler/releases/download/v1.9.2609/dxc_2026_09_29.zip'
$expected = 'ad31b1fc8443175d204f77a611fdb3ef2ec42759bdc2f1167368de24a4a7e7f1'
Invoke-WebRequest -Uri $url -OutFile $archive
if ((Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
    throw 'Microsoft DXC archive checksum mismatch'
}
Expand-Archive $archive -DestinationPath $root -Force
$bin = Join-Path $root "bin/$Architecture"
foreach ($file in @('dxcompiler.dll', 'dxil.dll')) {
    if (-not (Test-Path (Join-Path $bin $file))) { throw "Missing DXC runtime: $file" }
}
$licenses = @(Get-ChildItem $root -Filter 'LICENSE*' -File)
if ($licenses.Count -eq 0) { throw 'Missing Microsoft DXC license notices' }
"DXC_DIR=$bin" | Out-File $env:GITHUB_ENV -Append
"DXC_LICENSE_DIR=$root" | Out-File $env:GITHUB_ENV -Append
$bin | Out-File $env:GITHUB_PATH -Append
Write-Host "Verified Microsoft DXC v1.9.2609 ($Architecture)"
