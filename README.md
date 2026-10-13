# VeyCut · وی‌کات

<img src="assets/icons/veycut.svg" width="72" height="72" alt="VeyCut icon">

**Edit your video and add English or Persian subtitles.** VeyCut combines a native Mac timeline editor with a browser editor for local media.

[Download the Mac beta](https://github.com/alirezap73/veycut/releases/download/v0.3.1-beta.3/VeyCut-0.3.1-macos-arm64.dmg) · [Open the Web editor](https://alirezap73.github.io/veycut/) · [Download Web ZIP](https://alirezap73.github.io/veycut/downloads/VeyCut-web.zip) · [Quick start](docs/QUICK-START.md)

The Mac download is **0.3.1-beta.3**, published October 12, 2026. The expanded Web preview was published separately: [build identity](https://alirezap73.github.io/veycut/build-info.json) and [deployment checks](https://github.com/alirezap73/veycut/actions/runs/38203552214). Both are experimental. The app version remains **0.3.1**. [Mac release notes and checksum](https://github.com/alirezap73/veycut/releases/tag/v0.3.1-beta.3) identify its exact package source.

The Mac and Web interfaces now use English controls while supporting Persian subtitles and right-to-left text. The [Mac package](https://github.com/alirezap73/veycut/actions/runs/38204492520) passed four matching server checks and a light local Mac edit/export test; [package evidence](RELEASE-PREVIEW.md) records the source and checksum.

## Choose your editor

| | Mac beta | Web preview |
|---|---|---|
| Start | Apple silicon Mac installer | Open online, or extract ZIP and serve over local HTTP |
| Editing | Timeline move, trim, split and grouped copy/duplicate with Undo/Redo | Mixed video/image/audio/text tracks; trim/split/move; group clipboard, multiple timelines and Undo/Redo |
| Subtitles | SRT/plain-text WebVTT, cue navigation, timing and appearance edits | SRT/plain-text WebVTT; cue timing/style/find/replace; SRT/VTT download |
| Save | Desktop project folders | Web JSON and supported desktop-manifest import; reconnect original media |
| Video export | Native H.264/AAC export | Real-time WebM with mixed audio, image layers, titles and burned subtitles |

The Web preview has a **600-second (ten-minute) timeline**, **1920-pixel long-edge**, **256-MiB output** and **16 simultaneous media-layer** limit. Transform/crop, property keyframes, thirteen picture effects, speed ramps, dissolve/black/white transitions, stereo meters and frame navigation are included. H.264 MP4 is offered only with explicit browser recording support. AAC is preferred; browsers that only support Opus display that audio choice and its player-compatibility limitation. Chromium has automated test coverage; Safari and Firefox remain unverified. Mac and Web features and project formats differ. See [platform support](docs/PLATFORMS.md) for the current scope. [Five-minute export and fault checks](https://github.com/alirezap73/veycut/actions/runs/38333079698) passed; [measured results](docs/evidence/web-five-minute.json) record the synthetic Chromium scope.

**[Use VeyCut in your browser](https://alirezap73.github.io/veycut/).** The public URL and real Wasm engine passed server verification. [The original beta.2 Web ZIP](https://github.com/alirezap73/veycut/releases/download/v0.3.1-beta.2/VeyCut-0.3.1-beta.2-web.zip) remains the earlier single-track package; it differs from the current hosted preview.

## Make your first edit

1. [Install the Mac app or start the local Web package](docs/QUICK-START.md).
2. Import a short video, trim or split it, and add an SRT subtitle file.
3. Save your project, then export a video using a new filename.

The Mac and Web interfaces use English controls and preserve Persian subtitles, fonts and right-to-left text entry. Matching checks validate the new UI revision. Media stays on your device; the current Web package makes no media uploads. Web export runs on your device in real time, so keep the tab visible.

![VeyCut Web editor](https://alirezap73.github.io/veycut/screenshots/editor.png)

*Web interface captured by the server test; the hosted build identity records its exact source revision.*

![VeyCut caption workspace](docs/veycut-caption-workspace.png)

*Mac caption workspace, documented October 10, 2026 for the 0.2.0 preview. It shows the earlier Create/Files/Edit layout; later cue navigation and the Web interface are not pictured.*

## Beta scope

The Mac package passed matching timeline, bilingual subtitle, save/reopen and export GUI checks. Tests also covered active-export cancellation, existing-file preservation and export retries after restoring a missing or corrupt source. Web [exact-source checks](https://github.com/alirezap73/veycut/actions/runs/38201512547) passed 13 shared-engine tests and real Chromium workflows for mixed media, native-manifest preservation, 55-cue Undo/Redo, multiple timelines, frame navigation, stereo meters and fully decoded short WebM/dissolve output. Unsupported desktop treatments remain preserved and recoverable while their video export is refused. Full native effects/audio filters/models, HDR, complete desktop media/font folder interchange and frame-accurate offline Web output remain gaps.

The Mac app is ad-hoc signed and **not Apple-notarized**. Local editing/export covered a two-second video, while matching server checks covered longer synthetic output and movie import/reopen. Intel Mac, Windows, Linux and mobile installers are not part of this release. Keep backups of projects and source media while testing.

[Current validation and limits](docs/BETA-READINESS.md) · [Historical checks](docs/VALIDATION-HISTORY.md) · [Beta test guide](docs/BETA-TEST.md)

## Help improve VeyCut

[Report a problem](https://github.com/alirezap73/veycut/issues/new/choose) with your package version, platform, steps and error text. Review logs and use a sample you can share before attaching files.

[Roadmap](docs/ROADMAP.md) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [Engine setup](src/README.md)

Full native builds and packaging run on GitHub Actions. See the contribution guide for smaller source checks and the [version policy](docs/VERSIONING.md).

## فارسی

وی‌کات برای تدوین ویدئو و زیرنویس فارسی و انگلیسی است. [نسخهٔ مک](https://github.com/alirezap73/veycut/releases/download/v0.3.1-beta.3/VeyCut-0.3.1-macos-arm64.dmg) و [وب آنلاین](https://alirezap73.github.io/veycut/) یا [ZIP وب](https://alirezap73.github.io/veycut/downloads/VeyCut-web.zip) را دانلود کنید و [راهنمای شروع](docs/QUICK-START.md#فارسی) را بخوانید.

انتشار ۰٫۳٫۱-beta.3 مک آزمایشی است و رابط انگلیسی با پشتیبانی از محتوای فارسی دارد. مک مخصوص Apple silicon است؛ وب آنلاین جداگانه منتشر شده است و ZIP آن هم با سرور محلی HTTP اجرا می‌شود. وب اکنون چند تایم‌لاین، تصویر و صدای جدا، عنوان، کی‌فریم، هشت افکت، گذار تصویر، نشانگر استریو، ورود پروژهٔ مک و زیرنویس‌های بیشتر با یک بازگردانی دارد. امکانات این دو یکسان نیست. خروجی وب WebM و محدود به ۱۲۰ ثانیه است.

## License

AGPL-3.0-or-later. Original copyright and third-party notices are retained. See [LICENSE](LICENSE), [source notices](SOURCE-NOTICES.md), [additional permissions](LICENSE-EXCEPTIONS.md) and [trademark notices](TRADEMARK.md). Desktop bundles include embedded-font licenses.
