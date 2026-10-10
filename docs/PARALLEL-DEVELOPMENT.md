# VeyCut beta development protocol

Keep the public preview and development version fixed until the beta gates in
[BETA-READINESS.md](BETA-READINESS.md) are met. More commits are not a new milestone.

## Parallel work

Use one integrator and at most three workers on independent file sets. Workers
own captions, export/recovery UI, and black-box engine regressions respectively.
They propose bounded fixes with a reproducible trigger, rather than broad rewrites.
The integrator reviews the combined diff, resolves API dependencies, and requests
checks for the exact integrated commit. Do not integrate unreviewed model output.

Full builds, media exports and native UI checks run on GitHub runners. Local work
is limited to reading/editing, formatting and small Python/helper tests. Workers
must not each start a build. Fork full validation uses the Mac beta scope: Linux
engine tests, wasm and macOS compilation. Default CI still checks Windows;
the Mac scope is not evidence of Windows support. Installers are separate and
are not published by either validation workflow.

Native check/lint/test steps use the same development debug-information setting,
so profile switches do not invalidate dependency fingerprints between those
steps. The first cache warm-up may still be slow. Measure complete job durations
before claiming a speed improvement; parallel worker count is not a speed ratio.

## Optional model trials

No external provider is configured or used merely by adding this protocol.
`scripts/model_trial.py` prepares three equal, bounded source-review tasks without
installing a gateway or making network requests:

```sh
python3 scripts/model_trial.py export-files --output /tmp/veycut-export-trial.json
```

Run the same task and source hash against a baseline model and a candidate model.
To actually send the selected source file to a configured provider/router, provide
an explicit model, a `/v1` endpoint, and a key via `VEYCUT_TRIAL_API_KEY` in the
environment, not a command-line argument or committed file:

```sh
python3 scripts/model_trial.py export-files --model MODEL_ID \
  --endpoint https://PROVIDER_HOST/v1 --output /tmp/veycut-candidate-trial.json
```

The response is a suggestion, not a source edit. Compare complete responses;
truncated answers, HTTP errors and timeouts are separate failure evidence, not
reviewer rejection. Trial JSON includes source hash,
elapsed request time and provider-reported usage/model. A reviewer separately
records accepted/rejected reasoning and relevant GitHub test results. Compare
time to an accepted, tested change including review and repair; request latency
alone does not measure coding throughput. Repeat across subtitle-files and
media-recovery before adopting a model for those tasks. No speedup is established
while review/test fields remain null. Do not use trial responses as beta evidence.

Keep architecture and media-engine changes with the lead reviewer. Optional
models may help bounded review, translation or documentation once their trial
quality is acceptable. Pin the chosen model for a task; record actual model
identity when a gateway changes the upstream provider/model. Product runtime
does not depend on this development tool.
