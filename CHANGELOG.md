# VeyCut changelog

## Unreleased · Web editing work

Development stays at **0.3.1**. The current branch expands the browser editor toward the Mac editing workflow. [Exact-source checks](https://github.com/alirezap73/veycut/actions/runs/38192514807) passed on `c538f3f`: mixed video/image/audio/text tracks, group clipboard/history, speed, transforms/crop/keyframes, three color effects, subtitle timing/style/find-replace/SRT/WebVTT and decoded WebM output. Legacy projects are normalized before replacing the live session. Static image treatments are cached, and audio silence clocks source preparation/gaps. Current Web ceilings are 120 seconds, 1920 pixels, 256 MiB and 16 simultaneous media layers; only a short 360×640 generated fixture is decoded proof. H.264/AAC MP4 is offered only with explicit browser codec support and was unavailable on tested Chromium. The existing beta.2 download remains the older package. The [roadmap](docs/ROADMAP.md) records targets; it does not mark them as shipped.

## 0.3.1-beta.2 — public experimental release (2026-10-11)

- Published the Apple silicon Mac DMG and a downloadable Web prototype. The app version remains 0.3.1.
- Web adds bounded real-time WebM export with source audio, burned subtitles, progress and cancellation. Limits are 120 seconds, a 960-pixel long edge and 64 MiB. Project JSON and SRT downloads remain available.
- Chromium checks passed import/edit/Undo/Redo, bilingual SRT, save/reopen/media reconnection and short decoded VP8/Opus output. Safari/Firefox and longer real footage remain unverified.
- The unchanged Mac installer includes the native changes below. Packaged checks cover active-export cancellation, existing-output preservation and visible missing/corrupt-source errors with original-file restoration and decoded retry.
- Mac installer source is `39cc82cebf1904c1b65f860d6fe674b0ca1aacd2`; Web export validation source is `8c21b937675745375bf72e7e310ab5d4ec4cdb00`. The release tag contains the newer Web work; it does not imply a native rebuild.

[Downloads, checksums and full release scope](https://github.com/alirezap73/veycut/releases/tag/v0.3.1-beta.2). This release has no hosted Web URL. The Mac app is ad-hoc signed and not Apple-notarized; independent installation and a 10–15-minute real-camera editing session remain outstanding.

## 0.3.1 native changes included in beta.2

- Detached sound and picture move independently unless explicitly selected together; the reattachment link is retained.
- The track-add menu exposes top and bottom placement as directly clickable rows.
- Audio meter labels display their actual negative dB values. Initial and resized nested layouts enforce the stereo pane's 64-pixel width where space permits; very small windows shrink without overlapping panes.
- The caption Edit tab adds a chronological cue list with time ranges, bounded text previews and 50-row pages; choosing a cue selects its title and seeks to its start. Stale project/timeline tokens are rejected.
- Copy/paste preserves a selected group's timing, track layout and full clip properties across timelines; invalid destinations refuse the whole edit.
- The duplicate shortcut accepts multiple selected clips and selects every new copy for subsequent group editing.
- Titles and captions render supported PNG/BGRA strikes and COLR v0 solid colour layers, with bounded decoding/layers, palette alpha and title foreground, bitmap-first fallback and word-highlight/background preservation. COLR v1/SVG fonts, palette selection and identical Slint text-widget rendering are outside this change.
- The audio meter adds a dB ruler, stereo labels and a held-peak reading, retaining the compact dock and clickable clip indicator.
- Uncaptured GPU errors and device loss invalidate all compositors sharing the device. Failed textures/readbacks are refused and frame exports use the existing device-recovery path; scoped shader rejections remain recoverable.
- A bundled Noto Sans CJK subset supplies UI fallback and title glyphs without system fonts. Common Chinese/Korean characters, kana and shipped CJK labels are covered; rare characters outside the subset and region-specific glyph forms remain limited.
- Still-image reads preserve fitted dimensions, and unusable container frame rates fall back before reaching frame arithmetic.
- Native media/LUT import, frame/audio/subtitle save and folder dialogs run without borrowing editor state across their nested event loop; replies from a previous project are discarded.
- Invalid oversized project/export dimensions and extreme loaded clip times are bounded; unreadable sought video frames fail export instead of silently omitting a layer.
- Packaged-editor scenarios exercise clip movement, both edge trims, grouped clipboard operations, track placement and a 32-second repeated-media export on a Mac runner. A failed run remains partial evidence until its corrected scenario passes.

These changes are included in the validated Mac package shipped with the public experimental beta.2. Exact-source tests and matching packaged GUI checks passed. Independent clean installation and longer real-camera editing remain unverified; see [beta readiness](docs/BETA-READINESS.md).

## 0.2.0 — historical source upgrade (2026-10-10)

- Caption Create/Files/Edit workspace, WebVTT import/export and selected/all-text scope.
- Reversible timing correction, group styling and Unicode find/replace.
- Embedded Persian font, Persian presets and automatic font choice for new Persian captions.
- Portrait/square/landscape quick formats and small-window caption scrolling.
- Worker cancellation guards, export filename preflight and bounded GPU waits.
- Server UI screenshots, Persian shaping checks and 720p bilingual/audio export verification.
- Serialize Windows tests and expose effect-card progress to diagnose the previous timeout.

Native validation and installer verification are required before declaring this a stable release.

## 0.1.0 — historical source candidate

This was the initial VeyCut source candidate.

Added vertical 720p/1080p project presets, boxed and outlined caption presets, mixed media-import feedback, UTF-8 SRT import at timeline zero or the playhead, and SRT export of active timeline text. Imported subtitles form one undo step. Subtitle files are bounded to 1 MiB and saved through atomic replacement.

Applied VeyCut desktop branding, a new icon, separate app-data identity, an own-repository update destination, and macOS bundle metadata. Added manual GitHub validation and Apple silicon candidate-build workflows.

Locally verified project logic and subtitle file behavior. Modified GUI compilation, Persian shaping, video export and clean-machine installation remain unverified. No installer has been released. Windows/Linux/mobile packaging remains under review.

Source and license notices: [SOURCE-NOTICES.md](SOURCE-NOTICES.md).
