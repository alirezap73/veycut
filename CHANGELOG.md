# VeyCut source candidate 0.1.0

## 0.2.0 — source upgrade (2026-10-10)

- Caption Create/Files/Edit workspace, WebVTT import/export and selected/all-text scope.
- Reversible timing correction, group styling and Unicode find/replace.
- Embedded Persian font, Persian presets and automatic font choice for new Persian captions.
- Portrait/square/landscape quick formats and small-window caption scrolling.
- Worker cancellation guards, export filename preflight and bounded GPU waits.
- Server UI screenshots, Persian shaping checks and 720p bilingual/audio export verification.
- Serialize Windows tests and expose effect-card progress to diagnose the previous timeout.

Native validation and installer verification are required before declaring this a stable release.


This is an unreleased VeyCut source candidate.

Added vertical 720p/1080p project presets, boxed and outlined caption presets, mixed media-import feedback, UTF-8 SRT import at timeline zero or the playhead, and SRT export of active timeline text. Imported subtitles form one undo step. Subtitle files are bounded to 1 MiB and saved through atomic replacement.

Applied VeyCut desktop branding, a new icon, separate app-data identity, an own-repository update destination, and macOS bundle metadata. Added manual GitHub validation and Apple silicon candidate-build workflows.

Locally verified project logic and subtitle file behavior. Modified GUI compilation, Persian shaping, video export and clean-machine installation remain unverified. No installer has been released. Windows/Linux/mobile packaging remains under review.

Source and license notices: [SOURCE-NOTICES.md](SOURCE-NOTICES.md).
