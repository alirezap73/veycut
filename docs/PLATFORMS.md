# VeyCut platform support

This matrix describes the **public 0.3.1-beta.2 downloads**, published October 11, 2026. Development on the Web editor proceeds separately at app version 0.3.1. New source changes require matching tests and a new package before this matrix marks them as shipped.

| Capability | Apple silicon Mac beta | Downloadable Web prototype |
|---|---|---|
| Interface | Native desktop; English/Persian | Browser interface; English/Persian |
| Local video import | Native media picker | Browser-decodable local files |
| Timeline | Multiple tracks; move/trim/split; grouped clipboard/duplicate | Sequential single video track; trim/split/remove |
| History | Native command Undo/Redo | Shared engine commands/history where Wasm is loaded; disclosed JavaScript fallback otherwise |
| Subtitles | SRT and plain-text WebVTT; timing/style/find/replace; paged navigation | SRT import/edit/download; fixed global cue times |
| Titles and appearance | Native text rendering and presets | Subtitle overlay and burned caption text; separate title tools pending |
| Audio | Native audio editing and stereo meters | Source audio playback and recorded export; separate audio-track mixing pending |
| Effects and transitions | Native tools retained; dedicated packaged checks vary | Pending |
| Project storage | Desktop project folders referencing media | Downloaded browser JSON referencing media; reconnect after reopen |
| Project interchange | Native project format | Browser envelope plus shared engine document; direct desktop project import pending |
| Video export | Native H.264/AAC path verified with generated fixtures | Real-time VP8/Opus WebM path verified in Chromium with short generated media |
| Export limits | Configurable native output; long real-footage sessions unverified | 120 seconds; 960-pixel long edge; requested 30 fps; 64 MiB |
| Failure protection | Existing-output refusal, active Cancel and missing/corrupt-source restoration retry verified | Cancellation, disconnected-source refusal and project preservation verified |
| Installation | DMG, ad-hoc signed; Apple notarization and independent install unverified | Extract ZIP and serve over HTTP; hosted URL pending |

Both projects reference source media instead of embedding it. Their project envelopes and capabilities differ. Sharing the Rust editing engine does not establish matching UI, compositor or codec behavior. Browser timing can drift under load; it does not provide native frame-accurate offline rendering.

## Current Web development · awaiting validation

This second matrix describes the working tree after beta.2. It is **implementation scope awaiting exact-source CI**, not the downloaded beta.2 package. App version stays 0.3.1; the hosted URL remains pending.

| Area | Current development implementation | Remaining limitation or validation |
|---|---|---|
| Timeline and media | Video/audio/image/text on mixed tracks; visibility/mute; grouped placement/clipboard/duplicate, ripple removal and Undo/Redo | Requires shared-engine Wasm for advanced edits; current UI and regressions await CI |
| Titles and captions | Shared-engine text clips, cue timing/appearance, SRT/plain-text WebVTT import/export and find/replace | Browser fonts differ from Mac; 31-cue atomic import and 32-command group limit; parser subset |
| Transform and animation | Position/scale/rotation/opacity/crop and supported property keyframes | Browser interpolation/rendering awaits matching output checks |
| Picture effects | Exposure, contrast and saturation | Full native catalogue, transitions, HDR and model tools remain gaps |
| Audio | Mixed active source audio, speed/volume/fades/mute | Browser/device timing; native audio filters and variable speed curves unsupported |
| Composed output | Shared browser compositor for layered preview and real-time export | SDR Canvas, not native HDR or frame-accurate offline rendering |
| Formats | WebM; MP4 offered only if MediaRecorder reports support | Codec/browser availability varies; current MP4 path unverified |
| Bounds | 120 seconds, 1920-pixel long edge, 256 MiB output, 16 simultaneous non-text media layers | Enlarged limits await CI/stress/performance checks; preview also bounds active/selected sources |

See the [current Web source guide](../web/README.md) for exact limits and the older released evidence. Native/Web feature parity is not established.

## Other platforms and remaining checks

Intel Mac, Windows, Linux, Android and iOS installers are not included in beta.2. Existing source/platform targets and compilation checks do not establish downloadable application support. Chromium was used for the Web checks; Safari/Firefox, longer footage and other OS/browser combinations remain unverified.

The Mac beta still needs an independent clean-install report and a 10–15-minute real-camera editing session with decoded output. Relocation/relink picker interaction, separate-player viewing and controlled performance measurements are also outstanding. Mac recovery tests restored the original source at its original path.

[Downloads](https://github.com/alirezap73/veycut/releases/tag/v0.3.1-beta.2) · [Quick start](QUICK-START.md) · [Beta evidence](BETA-READINESS.md) · [Web evidence and limits](../web/README.md) · [Roadmap](ROADMAP.md)
