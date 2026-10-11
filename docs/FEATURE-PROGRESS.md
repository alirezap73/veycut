# VeyCut editing milestone

Development remains at **0.3.1**. Source implementation, passing engine tests,
packaged GUI evidence and independent installation are distinct milestones.

| Area | Development source | Verification needed for this revision |
| --- | --- | --- |
| Timeline groups | Grouped copy/paste preserves timing, track layout and properties; multi-clip duplicate and detached-audio movement | Native regressions and packaged movement/trim/clipboard undo/redo |
| Titles and captions | English/Persian caption files, group timing/style and replacement; supported PNG/BGRA strikes and COLR v0 solid-layer colour glyph rendering | Existing Persian tests plus deterministic colour/alpha/fallback tests; packaged rendering |
| Sound metering | dB ruler, stereo bars, held peak and clipping reset in the compact dock | UI compilation and screenshots; real playback/clip-reset checks |
| Mixed media | Fitted still-image decoding and arithmetic-checked frame rates | Reader/probe regressions and portrait-photo GUI/export checks |
| Native dialogs | Media/menu and LUT imports, frame/audio/subtitle saves, export, relink and project folder selection release the editor borrow before native dialogs process timers; stale project replies are discarded | macOS compilation and playing-video folder-picker checks |
| Export reliability | Per-job scratch files, no-replace publication, cancellation guards, dimension bounds and explicit errors for unreadable sought frames | Native export tests and independently decoded packaged GUI output |
| Distribution | Public Apple silicon preview remains separate from development candidates | New exact-source package, signature/checksum inspection, independent Mac installation and longer user footage |

Supported colour glyphs depend on an available font carrying PNG or
premultiplied BGRA strikes, or COLR v0 solid outline layers. COLR uses palette
zero and preserves alpha/foreground entries, with a maximum of 128 layers per
glyph. COLR v1, SVG, palette selection and Slint text-widget parity are not
implemented by this patch. No new model or external service is required.

No feature-completion percentage or full product parity is established. The
next comparison should use observed editing behaviour and release evidence,
including installation and real media, rather than source-file or commit counts.
See [beta readiness](BETA-READINESS.md) for the release gates and historical checks.
