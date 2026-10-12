# VeyCut roadmap

The next target is a browser workflow closer to the Mac editor while keeping the app version at **0.3.1**. These are development goals, not release promises or completed features. [Platform support](PLATFORMS.md) records the shipped beta.2 scope.

## Browser editing priorities

| Priority | Target | Evidence needed before shipping |
|---|---|---|
| 1 | A clearer media bin, preview, timeline and editing controls | Exact-source browser editing, keyboard/focus and English/Persian layout checks |
| 2 | More timeline and text controls with reversible edits | Shared-engine and browser regressions; save/reopen preserving all properties |
| 3 | Closer caption, title and audio workflows | Actual UI editing and decoded output with the added text/audio properties |
| 4 | More dependable browser video output | Cancellation/cleanup, gaps/audio/caption timing and longer real-footage decode checks |
| 5 | Hosted editor access — published | [Public URL and Wasm verification](https://github.com/alirezap73/veycut/actions/runs/38196479596) passed; [open the editor](https://alirezap73.github.io/veycut/) |

Mixed-track compositing, titles/captions, separate audio mixing and grouped edits passed [short Chromium workflows and decoded output checks](https://github.com/alirezap73/veycut/actions/runs/38192514807). Full native effects/transitions, HDR, model tools, desktop/Web project interchange and frame-accurate offline output remain gaps. Browser breadth, longer footage and performance determine the next milestones.

## Mac beta validation

The existing package passed core/generated-fixture GUI checks. The next validation priorities are an independent Apple silicon Mac installation, a 10–15-minute real-camera editing session, relink-picker recovery and separate-player viewing. Source tests and earlier package checks stay tied to their revisions.

Broader browser and installer support follows measured results. Model workflows remain separate from this core editing milestone; no external model service is connected.

## Publication policy

A commit does not increase the version or create a release. Keep development at 0.3.1, record exact source/package checks and known limits, then publish a tested milestone. See [version policy](VERSIONING.md) and [beta readiness](BETA-READINESS.md).
