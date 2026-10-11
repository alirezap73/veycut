# VeyCut editing milestone

Development remains at **0.3.1**. Source implementation, passing engine tests,
packaged GUI evidence and independent installation are distinct milestones.

| Area | Development source | Verified evidence and remaining checks |
| --- | --- | --- |
| Timeline groups | Grouped copy/paste preserves timing, track layout and properties; multi-clip duplicate with all new copies selected, and detached-audio movement | Engine regressions and runtime `36e98b7` packaged group copy/paste, copy selection/deletion, single-step Undo/Redo, move and head/tail trim passed; final-package core/extended GUI checks passed |
| Titles and captions | English/Persian caption files, group timing/style, replacement and paged cue navigation; supported PNG/BGRA strikes and COLR v0 solid-layer colour glyph rendering | 31 rendering tests and 3 navigation tests passed; runtime `36e98b7` core GUI passed 55 steps and navigation passed 23 steps with 55 cues, pointer/Enter/Space activation and exact cleanup/reopen |
| Portable CJK text | Shared bundled font serves UI script/language fallback and title rendering, retaining Persian/Latin fonts and existing UI fallback priority | Latest `974c65e` full validation passed, including four CJK UI regressions and mixed-script raster; final package built and general GUI checks passed; dedicated packaged CJK-text interaction unverified; subset/regional-form limits apply |
| Sound metering | dB ruler, stereo bars, held peak and clipping reset in the compact dock | Four `e6bce73` layout regressions and matching GUI checks passed; default 64-pixel pane shows both channels fully and peak readout −6 dB. Clipping-reset interaction unexercised |
| Mixed media | Fitted still-image decoding and arithmetic-checked frame rates | Reader/probe regressions passed; portrait-photo GUI/export checks pending |
| Native dialogs | Media/menu and LUT imports, frame/audio/subtitle saves, export, relink and project folder selection release the editor borrow before native dialogs process timers; stale project replies are discarded | Final-package native import/panel checks passed with observed AX Pause and strict cancel/accept bounds; bare-Space focus restoration, held-panel timer updates and other save-picker paths remain unverified |
| Export reliability | Per-job scratch files, no-replace publication, cancellation guards, dimension bounds and explicit errors for unreadable sought frames | Native regressions passed; runtime `36e98b7` core two-second export and extended 32-second H.264/AAC export fully decoded (960 frames, 48 kHz stereo); repeated synthetic sample, not longer user footage |
| GPU failures | Uncaptured errors and loss share a failure flag across device siblings; failed frames/textures are rejected through the existing recovery contract | Real captured/uncaptured regression passed on `e6bce73`; matching package core (55), navigation (23) and extended (98) GUI checks passed |
| Distribution | Public Apple silicon preview remains separate from development candidates | Final source/package and matching GUI checks passed; beta staged as unpublished draft. Light development-Mac check passed; independent installation, longer real-footage editing and consumer download flow pending |

The matching `e6bce73` extended package check fully decoded 32-second H.264/AAC output (720×1280/30 fps, 960 frames, 48 kHz stereo). Native-panel cancel/accept pause positions were 16.579/24.434 seconds, satisfying the strict bounds via the screenshot-confirmed coordinate route. Latest `974c65e` full validation passed 806 Rust invocations (0 failed, 1 ignored model/audio transcription test); quick checks passed 271 (250 Rust + 21 Python). Final package source `39cc82cebf1904c1b65f860d6fe674b0ca1aacd2` [built successfully](https://github.com/alirezap73/veycut/actions/runs/38119080271). Matching core/navigation/extended checks passed 55/23/98 actions, with observed AX Pause, cancel/accept positions 17.473/24.967 seconds and fully decoded 32-second output. The matching real-movie check proves import/reopen only, not movie editing/export. A light macOS 27.0.1 arm64 development-Mac check proved split Undo/Redo, bilingual editing, exact save/reopen and fully decoded two-second UI export with both-channel audio/frame checks. Independent Mac/real-footage report, separate-player viewing and long sessions remain pending. Public preview remains 0.2.0-preview.1; 0.3.1-beta.1 is an unpublished draft.

Runtime-specific runs and limitations are recorded in [beta readiness](BETA-READINESS.md). Historical checks apply to their recorded source; the latest exact-package evidence is recorded separately.

Supported colour glyphs depend on an available font carrying PNG or
premultiplied BGRA strikes, or COLR v0 solid outline layers. COLR uses palette
zero and preserves alpha/foreground entries, with a maximum of 128 layers per
glyph. COLR v1, SVG, palette selection and Slint text-widget parity are not
implemented by this patch. No new model or external service is required.

No feature-completion percentage or full product parity is established. The
next comparison should use observed editing behaviour and release evidence,
including installation and real media, rather than source-file or commit counts.
See [beta readiness](BETA-READINESS.md) for the release gates and historical checks.
