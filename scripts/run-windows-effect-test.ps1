param([Parameter(Mandatory = $true)][string]$Artifacts)
$ErrorActionPreference = "Stop"
# Run the exact unit-test binary reported by the successful workspace build.
# A second cargo invocation re-ran native dependency build scripts and consumed
# almost the entire previous ten-minute GPU-test budget before executing tests.
$executables = @(Get-Content -LiteralPath $Artifacts | ForEach-Object {
    $record = $_ | ConvertFrom-Json
    if ($record.reason -eq "compiler-artifact" -and $record.profile.test -and
        $record.target.name -eq "concat_host" -and $record.executable) {
        $record.executable
    }
} | Select-Object -Unique)
if ($executables.Count -ne 1) { throw "Expected exactly one compiled host unit-test executable" }
$executable = $executables[0]
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { throw "Compiled test executable is missing" }
$deps = Split-Path -Parent $executable
$debug = Split-Path -Parent $deps
$env:PATH = "$deps;$debug;$env:PATH"
Push-Location src/crates/concat-host
try {
    & $executable 'cards::tests::every_card_draws_and_shows_its_package_at_work' --exact --test-threads=1 --nocapture
    if ($LASTEXITCODE -ne 0) { throw "Effect thumbnail tests failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}
