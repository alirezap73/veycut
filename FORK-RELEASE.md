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
- [x] Pass 198 development checks and validate the unchanged release runtime with 748 Linux native test cases, macOS compilation and wasm checks. The baseline run had a Windows timeout; Windows validation remains separate.
- [x] Build the modified GUI and inspect server-rendered Captions and project forms at 1400×900, 900×600 and 360×640.
- [ ] Import valid, corrupt, missing and mixed media through the native picker and drag/drop.
- [ ] Import SRT at both origins; select all three appearances; confirm undo/redo and save/reopen.
- [x] Run the bundled-font Persian shaping test and inspect the plain, boxed and outlined bilingual screenshots.
- [x] Pass the native bilingual 720×1280/30 fps export test with audio and complete decode; inspect its video and frame artifact.
- [x] Package the Apple silicon DMG on GitHub; verify its image, bundle signature and library paths; observe a native window after 30 seconds on a macOS 15 runner.
- [ ] Install and edit on a separate clean target machine.
- [x] Include source revision, license/notices, checksum and known limitations with the release.

Begin with one tested desktop target. Mark other desktop/mobile targets unverified until their own checks pass. A green logic test suite is not proof of GUI layout, media output or installer behavior.

## GitHub workflow order

1. Upload the source candidate to the chosen repository.
2. Run Fork development checks.
3. Run Fork full validation. This calls the existing CI: native checks, tests, lints and cross-platform jobs run on GitHub runners.
4. Inspect failures and fix them before enabling a fork installer publisher.
5. Run **VeyCut macOS candidate** with the successful CI run ID in `validation_run`. It verifies passing Linux native, macOS compilation and wasm checks, rejects any runtime or package-build changes since that validation, records allowed workflow/documentation changes in VALIDATION.json, runs the lightweight checks and builds an Apple silicon test artifact on GitHub. Windows validation is separate and Windows installers are excluded from this preview. This creates no public release. Review that artifact before releasing an installer.

The inherited Release workflow is intentionally upstream-only. Fork full validation creates no public release and uploads no unbranded installer. Do not remove the publisher restriction until the fork's branding, update URLs and package scripts have been changed and tested.

## 0.2.0 regression checks

- [x] Project logic: WebVTT, selected scope, exact shift rejection, group styles, Unicode replacement and undo/redo.
- [x] Standalone filename tests: Unicode boundaries, invalid/reserved names and preservation of an existing output.
- [x] Translation inventory and targeted source formatting/lint.
- [x] Native tests and GUI screenshot review cover the unchanged runtime; the package build and inspection use release source 18dd62d exactly.
- [ ] Re-run Windows tests serially; inspect effect-card progress if they time out again.

Publish source updates for server validation. Publish a Mac preview only after its required Linux/macOS/wasm checks and Mac build succeed, with unsigned/clean-machine limitations stated. A preview is not a verified stable installer.

## Published preview

[VeyCut 0.2.0 preview.1](https://github.com/alirezap73/veycut/releases/tag/v0.2.0-preview.1) was published from `18dd62d3fff2edca5a61caae7c9b544eadd7108e`. [Mac candidate](https://github.com/alirezap73/veycut/actions/runs/38024725413) and [package inspection](https://github.com/alirezap73/veycut/actions/runs/38027085464) passed. The app is ad-hoc signed and not Apple-notarized; no Windows, Linux or mobile installer is included. [Windows validation](https://github.com/alirezap73/veycut/actions/runs/38024989783) remains separate.
