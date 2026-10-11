# VeyCut editing milestone

Development remains at **0.3.1**. Source implementation, passing engine tests,
packaged GUI evidence and independent installation are distinct milestones.

| Area | Development source | Verified evidence and remaining checks |
| --- | --- | --- |
| Timeline groups | Grouped copy/paste preserves timing, track layout and properties; multi-clip duplicate with all new copies selected, and detached-audio movement | Engine regressions and runtime `36e98b7` packaged group copy/paste, copy selection/deletion, single-step Undo/Redo, move and head/tail trim passed; latest-runtime GUI checks pending |
| Titles and captions | English/Persian caption files, group timing/style, replacement and paged cue navigation; supported PNG/BGRA strikes and COLR v0 solid-layer colour glyph rendering | 31 rendering tests and 3 navigation tests passed; runtime `36e98b7` core GUI passed 55 steps and navigation passed 23 steps with 55 cues, pointer/Enter/Space activation and exact cleanup/reopen |
| Portable CJK text | Shared bundled font serves UI script/language fallback and title rendering, retaining Persian/Latin fonts and existing UI fallback priority | Latest `974c65e` full validation passed, including four CJK UI regressions and mixed-script raster; exact packaged GUI evidence pending; subset/regional-form limits apply |
| Sound metering | dB ruler, stereo bars, held peak and clipping reset in the compact dock | Four `e6bce73` layout regressions and matching GUI checks passed; default 64-pixel pane shows both channels fully and peak readout −6 dB. Clipping-reset interaction unexercised |
| Mixed media | Fitted still-image decoding and arithmetic-checked frame rates | Reader/probe regressions passed; portrait-photo GUI/export checks pending |
| Native dialogs | Media/menu and LUT imports, frame/audio/subtitle saves, export, relink and project folder selection release the editor borrow before native dialogs process timers; stale project replies are discarded | Runtime `36e98b7` core picker and four-second held-panel cancellation/acceptance passed strict playback assertions using a screenshot-confirmed Pause coordinate; held-panel timer updates and AX Pause unverified; latest accessible-button source compiled; matching AX/GUI proof pending |
| Export reliability | Per-job scratch files, no-replace publication, cancellation guards, dimension bounds and explicit errors for unreadable sought frames | Native regressions passed; runtime `36e98b7` core two-second export and extended 32-second H.264/AAC export fully decoded (960 frames, 48 kHz stereo); repeated synthetic sample, not longer user footage |
| GPU failures | Uncaptured errors and loss share a failure flag across device siblings; failed frames/textures are rejected through the existing recovery contract | Real captured/uncaptured regression passed on `e6bce73`; matching package core (55), navigation (23) and extended (98) GUI checks passed |
| Distribution | Public Apple silicon preview remains separate from development candidates | Latest source validation passed; final package building, matching GUI inspection and independent Mac/real-footage report pending; public preview unchanged |

The matching `e6bce73` extended package check fully decoded 32-second H.264/AAC output (720×1280/30 fps, 960 frames, 48 kHz stereo). Native-panel cancel/accept pause positions were 16.579/24.434 seconds, satisfying the strict bounds via the screenshot-confirmed coordinate route. Latest `974c65e` full validation passed 806 Rust invocations (0 failed, 1 ignored model/audio transcription test); quick checks passed 271 (250 Rust + 21 Python). Final package source `39cc82c` is building in run [38119080271](https://github.com/alirezap73/veycut/actions/runs/38119080271); an independent Mac/tester is available, awaiting that package for installation and real-footage verification.

Runtime-specific runs and limitations are recorded in [beta readiness](BETA-READINESS.md). Passing older packaged checks do not validate later CJK/accessibility source changes.

Supported colour glyphs depend on an available font carrying PNG or
premultiplied BGRA strikes, or COLR v0 solid outline layers. COLR uses palette
zero and preserves alpha/foreground entries, with a maximum of 128 layers per
glyph. COLR v1, SVG, palette selection and Slint text-widget parity are not
implemented by this patch. No new model or external service is required.

No feature-completion percentage or full product parity is established. The
next comparison should use observed editing behaviour and release evidence,
including installation and real media, rather than source-file or commit counts.
See [beta readiness](BETA-READINESS.md) for the release gates and historical checks.
