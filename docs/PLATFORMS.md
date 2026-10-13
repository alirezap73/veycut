# VeyCut platform support

This matrix describes the **public 0.3.1-beta.3 Mac download** and the separately [hosted current Web editor](https://alirezap73.github.io/veycut/). Both remain experimental at app version 0.3.1. New source changes require matching tests and a new package or deployment before this matrix marks them as shipped.

| Capability | Apple silicon Mac beta | Current Web editor/ZIP |
|---|---|---|
| Interface | Native desktop; English controls, Persian content | English controls, Persian content |
| Local video import | Native media picker | Browser-decodable local files |
| Timeline | Multiple tracks; move/trim/split; grouped clipboard/duplicate | Mixed video/image/audio/text tracks, multiple timelines, trim/split/move and grouped edits |
| History | Native command Undo/Redo | Shared engine Undo/Redo where Wasm is loaded |
| Subtitles | SRT and plain-text WebVTT; timing/style/find/replace; paged navigation | SRT and plain-text WebVTT; timing/style/find/replace and download |
| Titles and appearance | Native text rendering and presets | Text tracks, transform/keyframes and burned captions |
| Audio | Native audio editing and stereo meters | Mixed source audio, stereo meters and browser bass/treble/telephone/echo controls |
| Effects and transitions | Native tools retained; dedicated packaged checks vary | Thirteen picture effects and dissolve/black/white transitions |
| Project storage | Desktop project folders referencing media | JSON with manual reconnect, or portable `.veycut` Web project with original media (1 GiB maximum) |
| Project interchange | Native project format | Browser envelope plus shared engine document; supported desktop manifest import with media reconnect |
| Video export | Native H.264/AAC path verified with generated fixtures | Real-time WebM and H.264/Opus MP4 verified in Chromium; short mixed layers and ten-minute real-footage output passed |
| Export limits | Configurable native output; local 2-second and server 32-second output checked | 600 seconds; 1920-pixel long edge; 256 MiB; 16 simultaneous non-text media layers; requested 2/5/8 Mbps quality profiles |
| Failure protection | Existing-output refusal, active Cancel and missing/corrupt-source restoration retry verified | Cancellation, disconnected-source refusal, decoded readback, clock/render faults, early quality-budget refusal and project preservation verified |
| Installation | DMG, ad-hoc signed; not Apple-notarized | Hosted editor or extract the current ZIP and serve over HTTP |

Desktop folders and JSON-only Web saves reference source media; portable Web saves embed originals. Their project envelopes and capabilities differ. Sharing the Rust editing engine does not establish matching UI, compositor or codec behavior. Browser timing can drift under load; it does not provide native frame-accurate offline rendering.

## Current expanded Web editor · server-validated source

The public Web editor uses English-only controls while retaining Persian/UTF-8 caption content, licensed fonts and content-level RTL direction. [English-interface browser checks](https://github.com/alirezap73/veycut/actions/runs/38203197508) and [public deployment](https://github.com/alirezap73/veycut/actions/runs/38203552214) passed. Earlier feature runs below remain scoped to their recorded revisions.

The [five-minute and reliability checks](https://github.com/alirezap73/veycut/actions/runs/38333079698) passed on their recorded Web revision at app version 0.3.1. [Measured results](evidence/web-five-minute.json) include full video/audio decode, timed colour/audio markers, a late Persian caption, cancellation and fault refusal. The [ten-minute real-footage and quality checks](https://github.com/alirezap73/veycut/actions/runs/38339770104) also passed; [their evidence](evidence/web-ten-minute-mp4.json) records the current validation scope. The [hosted editor](https://alirezap73.github.io/veycut/) and [current ZIP](https://alirezap73.github.io/veycut/downloads/VeyCut-web.zip) identify their exact published revision in [build-info.json](https://alirezap73.github.io/veycut/build-info.json); publication requires successful checks for that exact commit.

| Area | Verified Web implementation | Remaining limitation or validation |
|---|---|---|
| Timeline and media | Video/audio/image/text and seven generated shapes on mixed tracks; grouped placement/clipboard/duplicate, ripple removal, multiple timelines and Undo/Redo | Shared Wasm engine required for advanced edits; short generated scenarios and a ten-minute live-action/CGI film export passed in Chromium; other browsers and camera codecs unverified |
| Titles and captions | Shared-engine text clips, timing/appearance, SRT/plain-text WebVTT, find/replace and per-timeline caption roles | Browser fonts differ from Mac; bulk import needs non-overlapping times, 512 total project clips and a 1 MiB request; ordinary group edits have a 32-command bound |
| Transform and animation | Position/scale/rotation/opacity/crop and supported property keyframes | Keyed opacity and transformed still output passed the short mixed-layer check |
| Picture effects and transitions | Thirteen effects: exposure, contrast, saturation, warm/cool, vibrance, posterize, pixelate, sharpen, Gaussian blur, chroma key, mono without grain and vignette; dissolve and black/white dips | Full native catalogue, grain, HDR and model tools remain gaps; source-handle preroll/frozen holds preserve original project data |
| Sound and navigation | Mixed source audio, constant speed and three-point speed ramps, volume/fades/mute, bass/treble/telephone/echo controls, real stereo meters, held peak and frame navigation | Speed curves map source time in preview/export; trim and split require clearing a curve because those native edits do not preserve nonlinear mapping. Browser filters approximate native FFmpeg chains; browser/device timing varies |
| Project interchange | Supported desktop JSON manifests import with native-property preservation checks; original media reconnects; native JSON backup preserves paths | JSON-only backups omit media/fonts; portable Web projects include original media but are not native desktop folders; browser-added paths cannot be exported as a desktop manifest; unknown-size native media is not cryptographically verified |
| Composed output | Shared compositor with output-rate painting, continuous caption rendering and decoded output checkpoints; fully decoded mixed, dissolve and five-minute WebM checks passed | SDR Canvas, not native HDR or frame-accurate offline rendering; unsupported treatments remain recoverable in the project and refuse video output |
| Formats | WebM; H.264 MP4 with AAC preferred and explicit Opus fallback | Codec support is checked on the device; Opus MP4 is not compatible with every player. Ten-minute H.264/Opus MP4 fully decoded; AAC recording and other browser implementations are unverified. |
| Bounds | 600 seconds, 1920-pixel long edge, 256 MiB, 16 simultaneous non-text media layers | Ten-minute 640×360/24 fps output from a long 1080p film and 601-second refusal passed; high-resolution output/layer/byte stress and other camera codecs unverified |

[Ten-minute real-footage evidence](evidence/web-ten-minute-mp4.json) and [reproduction instructions](WEB-REAL-FOOTAGE-TEST.md) describe the six- and ten-minute MP4 checks. Native/Web feature parity is not established. See the [Web source guide](../web/README.md) for exact import/export and capacity rules. Earlier mixed-layer validation remains recorded in the changelog.

## Other platforms and remaining checks

Intel Mac, Windows, Linux, Android and iOS installers are not included in beta.3. Existing source/platform targets and compilation checks do not establish downloadable application support. Chromium was used for Web checks, including one ten-minute real-footage MP4. Safari/Firefox, additional camera codecs and other OS/browser combinations remain unverified.

The Mac beta still needs an independent clean-install report and a 10–15-minute real-camera editing session with decoded output. Relocation/relink picker interaction, separate-player viewing and controlled performance measurements are also outstanding. Mac recovery tests restored the original source at its original path.

[Mac download](https://github.com/alirezap73/veycut/releases/tag/v0.3.1-beta.3) · [Current Web editor](https://alirezap73.github.io/veycut/) · [Quick start](QUICK-START.md) · [Beta evidence](BETA-READINESS.md) · [Web evidence and limits](../web/README.md) · [Roadmap](ROADMAP.md)
