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
# A stalled DX12 submission can hang device destruction even after a test
# assertion. Bound the child process, retain its diagnostics and fail loudly.
$stdout = [System.IO.Path]::GetTempFileName()
$stderr = [System.IO.Path]::GetTempFileName()
$process = $null
try {
    $process = Start-Process -FilePath $executable -ArgumentList @(
        'cards::tests::every_card_draws_and_shows_its_package_at_work',
        '--exact', '--test-threads=1', '--nocapture'
    ) -WorkingDirectory (Join-Path $PWD 'src/crates/concat-host') -NoNewWindow `
      -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
    $null = $process.Handle # Retain the handle so ExitCode remains available.
    if (-not $process.WaitForExit(120000)) {
        try { $process.Kill($true) } catch { if (-not $process.HasExited) { throw } }
        if (-not $process.WaitForExit(10000)) { throw 'Timed-out GPU test could not be stopped' }
        throw 'Effect thumbnail test timed out after 120 seconds; no success is claimed'
    }
    $process.Refresh()
    if ($null -eq $process.ExitCode) { throw 'GPU test exit code unavailable' }
    if ($process.ExitCode -ne 0) { throw "Effect thumbnail test failed with exit code $($process.ExitCode)" }
} finally {
    try {
        if ($process -and -not $process.HasExited) {
            try { $process.Kill($true) } catch { if (-not $process.HasExited) { throw } }
            if (-not $process.WaitForExit(10000)) { throw 'GPU test cleanup did not finish' }
        }
    } finally {
        try {
            foreach ($file in @($stdout, $stderr)) {
                if (Test-Path -LiteralPath $file) { Get-Content -LiteralPath $file | Write-Host }
            }
        } finally {
            if ($process) { $process.Dispose() }
            foreach ($file in @($stdout, $stderr)) {
                if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file }
            }
        }
    }
}
