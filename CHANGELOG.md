# VeyCut changelog

## 0.3.1 — development patch (2026-10-11, unpublished)

- Detached sound and picture move independently unless explicitly selected together; the reattachment link is retained.
- The track-add menu exposes top and bottom placement as directly clickable rows.
- Audio meter labels display their actual negative dB values.
- Copy/paste preserves a selected group's timing, track layout and full clip properties across timelines; invalid destinations refuse the whole edit.
- The duplicate shortcut accepts multiple selected clips.
- Titles and captions render supported PNG/BGRA colour font glyphs, with bounded decoding, bitmap fallback and word-highlight/background preservation. COLR/SVG colour fonts and identical Slint text-widget rendering are outside this change.
- The audio meter adds a dB ruler, stereo labels and a held-peak reading, retaining the compact dock and clickable clip indicator.
- Still-image reads preserve fitted dimensions, and unusable container frame rates fall back before reaching frame arithmetic.
- Native folder dialogs run without borrowing editor state across their nested event loop; replies from a previous project are discarded.
- Invalid oversized project/export dimensions and extreme loaded clip times are bounded; unreadable sought video frames fail export instead of silently omitting a layer.
- Packaged-editor scenarios exercise clip movement, both edge trims, grouped clipboard operations, track placement and a 32-second repeated-media export on a Mac runner. A failed run remains partial evidence until its corrected scenario passes.

Native validation and a matching installer inspection are required for these source changes. The previously verified 0.3.0 package does not contain them. This patch increment does not create a public beta release.

## 0.2.0 — source upgrade (2026-10-10)

- Caption Create/Files/Edit workspace, WebVTT import/export and selected/all-text scope.
- Reversible timing correction, group styling and Unicode find/replace.
- Embedded Persian font, Persian presets and automatic font choice for new Persian captions.
- Portrait/square/landscape quick formats and small-window caption scrolling.
- Worker cancellation guards, export filename preflight and bounded GPU waits.
- Server UI screenshots, Persian shaping checks and 720p bilingual/audio export verification.
- Serialize Windows tests and expose effect-card progress to diagnose the previous timeout.

Native validation and installer verification are required before declaring this a stable release.

## 0.1.0 — source candidate

This was the initial VeyCut source candidate.

Added vertical 720p/1080p project presets, boxed and outlined caption presets, mixed media-import feedback, UTF-8 SRT import at timeline zero or the playhead, and SRT export of active timeline text. Imported subtitles form one undo step. Subtitle files are bounded to 1 MiB and saved through atomic replacement.

Applied VeyCut desktop branding, a new icon, separate app-data identity, an own-repository update destination, and macOS bundle metadata. Added manual GitHub validation and Apple silicon candidate-build workflows.

Locally verified project logic and subtitle file behavior. Modified GUI compilation, Persian shaping, video export and clean-machine installation remain unverified. No installer has been released. Windows/Linux/mobile packaging remains under review.

Source and license notices: [SOURCE-NOTICES.md](SOURCE-NOTICES.md).
