# VeyCut — وی‌کات

<img src="assets/icons/veycut.svg" width="72" height="72" alt="VeyCut icon">

VeyCut is a native video editor with timeline editing, video effects, transitions, titles, captions and local speech tools. Product repository: https://github.com/alirezap73/veycut.

## Version 0.2.0 changes

- **Caption workspace:** separate Create, Files and Edit tabs, with a scrolling dialog for smaller windows.
- **Subtitle interchange:** import SRT and plain-text WebVTT; export either format from selected text clips or the whole timeline. Titles are included explicitly in the scope count.
- **Timing correction:** shift selected or all text clips by signed seconds in one undo step. Invalid times and collisions on the same track are rejected before changing anything.
- **Group appearance:** apply placement, size, boxed or outlined appearance to existing text clips, preserving each clip's font and content.
- **Find and replace:** literal, case-sensitive UTF-8 replacement over the chosen text scope, with one undo step and validation before editing.
- **Persian font:** Vazirmatn is embedded in the editor and title renderer. New Persian captions without a chosen title font use it automatically. Boxed and outlined Persian presets are included. The variable font is rendered at its default weight.
- **Quick project formats:** portrait 1080×1920 or 720×1280, square 1080×1080 and landscape 1920×1080, at 30 fps; existing custom controls remain available.
- **Reliable operations:** cancellation invalidates old subtitle/transcription replies; subtitle reads are bounded and writes are atomic. Video export validates filenames and refuses an existing output at preflight. GPU completion/readback waits have a 30-second limit.
- **Verification artifacts:** server tests exercise real Slint forms at desktop and phone sizes, bundled Persian shaping without system fonts, and a bilingual 720p/30 fps export with audio and full decoding.

## Verification status

The 0.2.0 source is being validated. Local project tests and targeted lint checks passed; the standalone export-path tests passed. All 14 locale inventories are consistent. GUI screenshots, native tests and the new video export test run on GitHub runners; their results must be inspected before a release is advertised as verified.

The prior source passed Linux native validation and macOS type checking. Its Windows test job timed out while drawing effect cards. Windows tests now run serially with card progress visible; a successful rerun is still required. Mobile packages and installation on a clean target machine remain unverified.

Follow [GitHub Actions](https://github.com/alirezap73/veycut/actions) for current results. **VeyCut macOS candidate** validates and builds an Apple silicon test artifact; it does not publish a release. See [the release checklist](FORK-RELEASE.md).

## Build and test

Rust 1.93 and the native dependencies documented in [src/README.md](src/README.md) are required. For a small local check:

```sh
cd src
cargo test --locked -j 1 -p concat-core -p concat-project -- --test-threads=1
cargo fmt --check
cargo clippy --locked -j 1 -p concat-project --all-targets -- -D warnings
```

Use GitHub Actions for full native validation and packaging on machines where a large local build is undesirable.

## Subtitle files

Files must be UTF-8 and at most 1 MiB. Timestamps are supported through 99:59:59,999. Cue duration must be at least 1/60 second. Overlaps and multiline text are preserved. Inline cue markup remains literal text; WebVTT export escapes it. WebVTT accepts a header, comments, cue identifiers and short/full timestamps; CSS, regions and cue layout settings are rejected explicitly. Subtitle files carry timing and text, not fonts or appearance. Export and find/replace reject blank separator lines inside a caption.

## License

AGPL-3.0-or-later. Original copyright and third-party notices are retained. See [LICENSE](LICENSE), [source notices](SOURCE-NOTICES.md), [additional permissions](LICENSE-EXCEPTIONS.md) and [trademark notices](TRADEMARK.md). Desktop bundles include the licenses for all embedded fonts.
