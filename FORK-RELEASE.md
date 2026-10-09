# Fork release checklist

## Source candidate

- [x] Preserve upstream source, copyright, licenses and dependency lockfile.
- [x] Document added functionality and its limits without claiming tested installers.
- [x] Check project logic, subtitle file behavior, translations and formatting locally.
- [x] Prepare manually triggered lightweight and full native GitHub validation.
- [x] Prevent the inherited upstream-name installer publisher from running in this fork.

## Required before the first installer release

- [x] Select VeyCut and the proposed destination `alirezap73/veycut`.
- [ ] Replace user-facing name, icon, application IDs and platform bundle/package metadata.
- [x] Replace desktop UI labels and icon, isolate app data, and prepare macOS bundle metadata. Windows/Linux/mobile package identity still needs review.
- [x] Point the fork's version/update UI at its own release repository; upstream model download attribution stays separate.
- [x] Set fork version 0.1.0 and write source-candidate notes distinguishing inherited features from added features.
- [ ] Run Fork development checks and Fork full validation against the release commit.
- [ ] Build the modified GUI and test the Captions dialog at normal and narrow window sizes.
- [ ] Import valid, corrupt, missing and mixed media through the native picker and drag/drop.
- [ ] Import SRT at both origins; select all three appearances; confirm undo/redo and save/reopen.
- [ ] Verify Persian shaping with a supported selected font; inspect multiline wrapping and backgrounds.
- [ ] Export a short 720p video with audio; inspect dimensions, frame rate, duration, text and complete decode.
- [ ] Package an installer on GitHub and test it on a clean target machine.
- [ ] Include source revision, license/notices, checksum and known limitations with the release.

Begin with one tested desktop target. Mark other desktop/mobile targets unverified until their own checks pass. A green logic test suite is not proof of GUI layout, media output or installer behavior.

## GitHub workflow order

1. Upload the source candidate to the chosen repository.
2. Run Fork development checks.
3. Run Fork full validation. This calls the existing CI: native checks, tests, lints and cross-platform jobs run on GitHub runners.
4. Inspect failures and fix them before enabling a fork installer publisher.
5. Run **VeyCut macOS candidate** to validate and build an Apple silicon test artifact on GitHub. This creates no public release. Test that artifact before releasing an installer.

The inherited Release workflow is intentionally upstream-only. Fork full validation creates no public release and uploads no unbranded installer. Do not remove the publisher restriction until the fork's branding, update URLs and package scripts have been changed and tested.
