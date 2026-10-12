# VeyCut · وی‌کات

<img src="assets/icons/veycut.svg" width="72" height="72" alt="VeyCut icon">

**Edit your video and add English or Persian subtitles.** VeyCut combines a native Mac timeline editor with a browser prototype for local media.

[Download the Mac beta](https://github.com/alirezap73/veycut/releases/download/v0.3.1-beta.2/VeyCut-0.3.1-macos-arm64.dmg) · [Download the Web prototype](https://github.com/alirezap73/veycut/releases/download/v0.3.1-beta.2/VeyCut-0.3.1-beta.2-web.zip) · [Quick start](docs/QUICK-START.md)

The public release is **0.3.1-beta.2**, published October 11, 2026. It is experimental. The app version remains **0.3.1**. [Release notes and checksums](https://github.com/alirezap73/veycut/releases/tag/v0.3.1-beta.2) identify the separate Mac and Web package revisions.

## Choose your editor

| | Mac beta | Web prototype |
|---|---|---|
| Start | Apple silicon Mac installer | Download, extract and serve over local HTTP |
| Editing | Timeline move, trim, split and grouped copy/duplicate with Undo/Redo | Sequential single-track trim, split, remove and Undo/Redo |
| Subtitles | SRT/plain-text WebVTT, cue navigation, timing and appearance edits | SRT import, text editing and SRT download |
| Save | Desktop project folders | Browser project JSON; reconnect original media after reopening |
| Video export | Native H.264/AAC export | Real-time WebM with source audio and burned subtitles |

The Web prototype has a **120-second timeline**, **960-pixel long-edge** and **64-MiB output** limit. Chromium has automated test coverage; Safari and Firefox remain unverified. Mac and Web features and project formats differ. See [platform support](docs/PLATFORMS.md) for the current scope.

**Hosted Web editor:** pending. The downloadable Web package is available now; a public hosted URL has not been announced.

## Make your first edit

1. [Install the Mac app or start the local Web package](docs/QUICK-START.md).
2. Import a short video, trim or split it, and add an SRT subtitle file.
3. Save your project, then export a video using a new filename.

Choose English or Persian in the interface. Media stays on your device; the current Web package makes no media uploads. Web export runs on your device in real time, so keep the tab visible.

![VeyCut caption workspace](docs/veycut-caption-workspace.png)

*Mac caption workspace, documented October 10, 2026 for the 0.2.0 preview. It shows the earlier Create/Files/Edit layout; later cue navigation and the Web interface are not pictured.*

## Beta scope

The Mac package passed matching timeline, bilingual subtitle, save/reopen and export GUI checks. Tests also covered active-export cancellation, existing-file preservation and export retries after restoring a missing or corrupt source. Web checks covered the shared editing engine, project reconnection and short WebM exports with audio and burned subtitles.

Independent clean Mac installation and a 10–15-minute real-camera editing session remain unverified. The Mac app is ad-hoc signed and **not Apple-notarized**. Intel Mac, Windows, Linux and mobile installers are not part of this release. Keep backups of projects and source media while testing.

[Current validation and limits](docs/BETA-READINESS.md) · [Historical checks](docs/VALIDATION-HISTORY.md) · [Beta test guide](docs/BETA-TEST.md)

## Help improve VeyCut

[Report a problem](https://github.com/alirezap73/veycut/issues/new/choose) with your package version, platform, steps and error text. Review logs and use a sample you can share before attaching files.

[Roadmap](docs/ROADMAP.md) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [Engine setup](src/README.md)

Full native builds and packaging run on GitHub Actions. See the contribution guide for smaller source checks and the [version policy](docs/VERSIONING.md).

## فارسی

وی‌کات برای تدوین ویدئو و زیرنویس فارسی و انگلیسی است. [نسخهٔ مک](https://github.com/alirezap73/veycut/releases/download/v0.3.1-beta.2/VeyCut-0.3.1-macos-arm64.dmg) و [نمونهٔ وب](https://github.com/alirezap73/veycut/releases/download/v0.3.1-beta.2/VeyCut-0.3.1-beta.2-web.zip) را دانلود کنید و [راهنمای شروع](docs/QUICK-START.md#فارسی) را بخوانید.

انتشار ۰٫۳٫۱-beta.2 آزمایشی است. مک مخصوص Apple silicon است؛ بستهٔ وب با سرور محلی HTTP اجرا می‌شود و هنوز لینک عمومی آنلاین ندارد. امکانات این دو یکسان نیست. خروجی وب WebM و محدود به ۱۲۰ ثانیه است. آزمون نصب مستقل مک و تدوین طولانی با فیلم دوربین هنوز باقی است.

## License

AGPL-3.0-or-later. Original copyright and third-party notices are retained. See [LICENSE](LICENSE), [source notices](SOURCE-NOTICES.md), [additional permissions](LICENSE-EXCEPTIONS.md) and [trademark notices](TRADEMARK.md). Desktop bundles include embedded-font licenses.
