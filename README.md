# VeyCut — وی‌کات

VeyCut is a native video editor with vertical project presets and subtitle editing. Product repository: https://github.com/alirezap73/veycut. This repository is a source candidate; it has no verified installer release yet.

## Current changes

- Vertical 720×1280 and 1080×1920 project presets at 30 fps.
- Boxed and outlined text presets.
- Import feedback showing successful and failed file counts.
- UTF-8 SRT import, from timeline zero or the current playhead.
- Editable subtitle clips imported in one undo step.
- SRT export of all text clips in the active timeline, including titles.
- Caption appearance choices preserving the selected font and wrapping inside 82% of the frame width.
- Bounded subtitle reads and atomic file replacement.

The editor includes a timeline, media engine, effects and local AI features. See the attribution section below for the source origin.

## Verification status

Locally passed: 123 project tests, including 10 subtitle tests, and 4 standalone subtitle-file tests. Translation inventory for all 14 languages and targeted formatting/lint checks passed. The modified GUI has not been built or visually tested. Persian text persistence is tested; Persian shaping is not yet verified.

Run **Fork development checks** in GitHub Actions for the lightweight checks, then **Fork full validation** for native GUI and engine checks through the existing cross-platform CI. **VeyCut macOS candidate** runs validation and builds an Apple silicon test artifact. These workflows do not publish a release. They have been prepared but have not yet run on GitHub.

The source version is 0.1.0. Desktop UI labels, app icons, app-data identity, update destination and macOS bundle metadata now use VeyCut. Windows/Linux/mobile packaging needs further review before distribution.

## Build and test

Rust 1.93 and the native dependencies documented in [src/README.md](src/README.md) are required. Keep compilation to one job on a laptop:

```sh
cd src
cargo test --locked -j 1 -p concat-core -p concat-project -- --test-threads=1
cargo fmt -p concat-project -p concat-host --check
cargo clippy --locked -j 1 -p concat-project --all-targets -- -D warnings
```

For full native validation, use GitHub Actions to avoid a large local build. See [the release checklist](FORK-RELEASE.md) before producing installers.

## Subtitle files

SRT files must be UTF-8 and at most 1 MiB. Timestamps are supported through 99:59:59,999. Cue duration must be at least 1/60 second. Overlaps and multiline text are preserved. Inline markup stays literal. Export rejects blank separator lines inside a caption instead of silently corrupting the file. SRT contains text and timing, not font or appearance information.

## Attribution and license

Derived from [Concat](https://github.com/jub0t/Concat) commit `63f263349433d55c710df2ce1d0618be1ebde1e4` (0.2.6). Original copyright and third-party notices are retained. [The preserved upstream README](README.upstream.md) documents the original project; its downloads are upstream builds. See [LICENSE](LICENSE), [LICENSE-EXCEPTIONS.md](LICENSE-EXCEPTIONS.md) and [TRADEMARK.md](TRADEMARK.md). The modified product must use its own name and icon before distribution. The inherited upstream release workflow is restricted to the upstream repository until fork packaging is implemented.
