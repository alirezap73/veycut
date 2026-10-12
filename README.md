# VeyCut · وی‌کات

<img src="assets/icons/veycut.svg" width="72" height="72" alt="VeyCut icon">

**Edit your video and add English or Persian subtitles.** VeyCut combines a native Mac timeline editor with a browser editor for local media.

[Download the Mac beta](https://github.com/alirezap73/veycut/releases/download/v0.3.1-beta.2/VeyCut-0.3.1-macos-arm64.dmg) · [Open the Web editor](https://alirezap73.github.io/veycut/) · [Download Web ZIP](https://alirezap73.github.io/veycut/downloads/VeyCut-web.zip) · [Quick start](docs/QUICK-START.md)

The Mac download is **0.3.1-beta.2**, published October 11, 2026. The expanded Web preview was published October 12: [build identity](https://alirezap73.github.io/veycut/build-info.json) and [deployment checks](https://github.com/alirezap73/veycut/actions/runs/38196479596). Both are experimental. The app version remains **0.3.1**. [Release notes and checksums](https://github.com/alirezap73/veycut/releases/tag/v0.3.1-beta.2) identify the separate Mac and Web package revisions.

## Choose your editor

| | Mac beta | Web preview |
|---|---|---|
| Start | Apple silicon Mac installer | Open online, or extract ZIP and serve over local HTTP |
| Editing | Timeline move, trim, split and grouped copy/duplicate with Undo/Redo | Mixed video/image/audio/text tracks; trim/split/move; group clipboard and Undo/Redo |
| Subtitles | SRT/plain-text WebVTT, cue navigation, timing and appearance edits | SRT/plain-text WebVTT; cue timing/style/find/replace; SRT/VTT download |
| Save | Desktop project folders | Browser project JSON; reconnect original media after reopening |
| Video export | Native H.264/AAC export | Real-time WebM with mixed audio, image layers, titles and burned subtitles |

The Web preview has a **120-second timeline**, **1920-pixel long-edge**, **256-MiB output** and **16 simultaneous media-layer** limit. Transform/crop, property keyframes and three color effects are included. H.264/AAC MP4 is offered only with explicit browser recording support; it was unavailable on tested Chromium. Chromium has automated test coverage; Safari and Firefox remain unverified. Mac and Web features and project formats differ. See [platform support](docs/PLATFORMS.md) for the current scope.

**[Use VeyCut in your browser](https://alirezap73.github.io/veycut/).** The public URL and real Wasm engine passed server verification. [The original beta.2 Web ZIP](https://github.com/alirezap73/veycut/releases/download/v0.3.1-beta.2/VeyCut-0.3.1-beta.2-web.zip) remains the earlier single-track package; it differs from the current hosted preview.

## Make your first edit

1. [Install the Mac app or start the local Web package](docs/QUICK-START.md).
2. Import a short video, trim or split it, and add an SRT subtitle file.
3. Save your project, then export a video using a new filename.

Choose English or Persian in the interface. Media stays on your device; the current Web package makes no media uploads. Web export runs on your device in real time, so keep the tab visible.

![VeyCut Web editor](https://alirezap73.github.io/veycut/screenshots/editor.png)

*Current Web interface, captured by the server test on source `26220d4`.*

![VeyCut caption workspace](docs/veycut-caption-workspace.png)

*Mac caption workspace, documented October 10, 2026 for the 0.2.0 preview. It shows the earlier Create/Files/Edit layout; later cue navigation and the Web interface are not pictured.*

## Beta scope

The Mac package passed matching timeline, bilingual subtitle, save/reopen and export GUI checks. Tests also covered active-export cancellation, existing-file preservation and export retries after restoring a missing or corrupt source. Web checks passed eight shared-engine tests and 32 browser scenario groups, including mixed media, native text, legacy projects, reconnection and fully decoded short WebM output. Full native effects/models, HDR, direct desktop project import and frame-accurate offline Web output remain gaps.

Independent clean Mac installation and a 10–15-minute real-camera editing session remain unverified. The Mac app is ad-hoc signed and **not Apple-notarized**. Intel Mac, Windows, Linux and mobile installers are not part of this release. Keep backups of projects and source media while testing.

[Current validation and limits](docs/BETA-READINESS.md) · [Historical checks](docs/VALIDATION-HISTORY.md) · [Beta test guide](docs/BETA-TEST.md)

## Help improve VeyCut

[Report a problem](https://github.com/alirezap73/veycut/issues/new/choose) with your package version, platform, steps and error text. Review logs and use a sample you can share before attaching files.

[Roadmap](docs/ROADMAP.md) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [Engine setup](src/README.md)

Full native builds and packaging run on GitHub Actions. See the contribution guide for smaller source checks and the [version policy](docs/VERSIONING.md).

## فارسی

وی‌کات برای تدوین ویدئو و زیرنویس فارسی و انگلیسی است. [نسخهٔ مک](https://github.com/alirezap73/veycut/releases/download/v0.3.1-beta.2/VeyCut-0.3.1-macos-arm64.dmg) و [وب آنلاین](https://alirezap73.github.io/veycut/) یا [ZIP وب](https://alirezap73.github.io/veycut/downloads/VeyCut-web.zip) را دانلود کنید و [راهنمای شروع](docs/QUICK-START.md#فارسی) را بخوانید.

انتشار ۰٫۳٫۱-beta.2 آزمایشی است. مک مخصوص Apple silicon است؛ وب آنلاین منتشر شده است و ZIP آن هم با سرور محلی HTTP اجرا می‌شود. وب اکنون چندترک، تصویر و صدای جدا، عنوان، کی‌فریم و زیرنویس قابل ویرایش دارد. امکانات این دو یکسان نیست. خروجی وب WebM و محدود به ۱۲۰ ثانیه است. آزمون نصب مستقل مک و تدوین طولانی با فیلم دوربین هنوز باقی است.

## License

AGPL-3.0-or-later. Original copyright and third-party notices are retained. See [LICENSE](LICENSE), [source notices](SOURCE-NOTICES.md), [additional permissions](LICENSE-EXCEPTIONS.md) and [trademark notices](TRADEMARK.md). Desktop bundles include embedded-font licenses.
