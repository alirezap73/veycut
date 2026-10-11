# VeyCut editing milestone

Development remains at **0.3.1**. Source implementation, passing engine tests,
packaged GUI evidence and independent installation are distinct milestones.

| Area | Development source | Verification needed for this revision |
| --- | --- | --- |
| Timeline groups | Grouped copy/paste preserves timing, track layout and properties; multi-clip duplicate with all new copies selected, and detached-audio movement | Engine group regressions passed; new duplicate-selection and packaged gesture verification pending |
| Titles and captions | English/Persian caption files, group timing/style, replacement and paged cue navigation; supported PNG/BGRA strikes and COLR v0 solid-layer colour glyph rendering | 31 rendering tests and 3 cue-navigation tests passed; prior package visually confirms bilingual text/colour emoji; new GUI navigation pending |
| Sound metering | dB ruler, stereo bars, held peak and clipping reset in the compact dock | Packaged screenshot exposes default-width clipping; layout correction and real playback/clip-reset checks pending |
| Mixed media | Fitted still-image decoding and arithmetic-checked frame rates | Reader/probe regressions passed; portrait-photo GUI/export checks pending |
| Native dialogs | Media/menu and LUT imports, frame/audio/subtitle saves, export, relink and project folder selection release the editor borrow before native dialogs process timers; stale project replies are discarded | Core native picker passed; extended held-panel playback assertion failed; diagnosis pending |
| Export reliability | Per-job scratch files, no-replace publication, cancellation guards, dimension bounds and explicit errors for unreadable sought frames | Native export tests passed; prior 0.3.1 package produced a fully decoded two-second GUI export; new/longer checks pending |
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
