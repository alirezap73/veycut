# Fork release checklist

## Source candidate

- [x] Preserve upstream source, copyright, licenses and dependency lockfile.
- [x] Document added functionality and its limits without claiming tested installers.
- [x] Check project logic, subtitle file behavior, translations and formatting locally.
- [x] Prepare manually triggered lightweight and full native GitHub validation.
- [x] Prevent the inherited upstream-name installer publisher from running in this fork.

## Required before the first installer release

- [x] Select VeyCut and the proposed destination `alirezap73/veycut`.
- [x] Replace desktop name, icon, app-data ID and desktop package metadata. Mobile packaging remains unverified.
- [x] Replace desktop UI labels and icon, isolate app data, and prepare macOS bundle metadata. Windows/Linux metadata has been updated; mobile packaging remains under review.
- [x] Point the fork's version/update UI at its own release repository; upstream model download attribution stays separate.
- [x] Set fork version 0.2.0 and write source-candidate notes distinguishing inherited features from added features.
- [ ] Run Fork development checks and Fork full validation against the release commit.
- [ ] Build the modified GUI and inspect server-rendered Captions and project forms at 1400×900, 900×600 and 360×640.
- [ ] Import valid, corrupt, missing and mixed media through the native picker and drag/drop.
- [ ] Import SRT at both origins; select all three appearances; confirm undo/redo and save/reopen.
- [ ] Run the bundled-font Persian shaping test and inspect the plain, boxed and outlined bilingual screenshots.
- [ ] Pass the native bilingual 720×1280/30 fps export test with audio and complete decode; inspect its video and frame artifact.
- [ ] Package an installer on GitHub and test it on a clean target machine.
- [ ] Include source revision, license/notices, checksum and known limitations with the release.

Begin with one tested desktop target. Mark other desktop/mobile targets unverified until their own checks pass. A green logic test suite is not proof of GUI layout, media output or installer behavior.

## GitHub workflow order

1. Upload the source candidate to the chosen repository.
2. Run Fork development checks.
3. Run Fork full validation. This calls the existing CI: native checks, tests, lints and cross-platform jobs run on GitHub runners.
4. Inspect failures and fix them before enabling a fork installer publisher.
5. Run **VeyCut macOS candidate** with the successful CI run ID in `validation_run`. It verifies that the full native checks passed at the exact same source revision, runs the lightweight checks and builds an Apple silicon test artifact on GitHub. This creates no public release. Review that artifact before releasing an installer.

The inherited Release workflow is intentionally upstream-only. Fork full validation creates no public release and uploads no unbranded installer. Do not remove the publisher restriction until the fork's branding, update URLs and package scripts have been changed and tested.

## 0.2.0 regression checks

- [x] Project logic: WebVTT, selected scope, exact shift rejection, group styles, Unicode replacement and undo/redo.
- [x] Standalone filename tests: Unicode boundaries, invalid/reserved names and preservation of an existing output.
- [x] Translation inventory and targeted source formatting/lint.
- [ ] Native tests, GUI screenshot review and package build at the final 0.2.0 commit.
- [ ] Re-run Windows tests serially; inspect effect-card progress if they time out again.

Publish source updates for server validation. Publish a desktop preview only after its native checks and build succeed, with unsigned/clean-machine limitations stated. A preview is not a verified stable installer.
