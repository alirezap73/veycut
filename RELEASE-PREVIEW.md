# VeyCut 0.3.1-beta.3 — Mac package evidence

The [experimental Mac release](https://github.com/alirezap73/veycut/releases/tag/v0.3.1-beta.3) uses an English-only interface and supports Persian titles, subtitles, fonts, automatic content direction and content-processing language options. The application version remains **0.3.1**. The Web editor is [hosted separately](https://alirezap73.github.io/veycut/) with its own downloadable ZIP.

[Native validation](https://github.com/alirezap73/veycut/actions/runs/38203218423) passed Linux engine tests/lints, WebAssembly checks and macOS all-target compilation. Windows tests also passed; this does not establish a Windows download. [English Web validation](https://github.com/alirezap73/veycut/actions/runs/38203197508) and [public deployment](https://github.com/alirezap73/veycut/actions/runs/38203552214) passed; the [hosted editor](https://alirezap73.github.io/veycut/) is already English-only with Persian content support.

The Apple silicon Mac DMG was built from source `9082f2686b7896e49561d2c531fd3ec105e456eb` in the [candidate run](https://github.com/alirezap73/veycut/actions/runs/38204492520). The same binary was uploaded to beta.3 after local verification.

Matching packaged checks passed: [core import/split/subtitles/save/reopen/decoded output](https://github.com/alirezap73/veycut/actions/runs/38205865493), [32-second editing/output](https://github.com/alirezap73/veycut/actions/runs/38205868345), [caption navigation and pagination](https://github.com/alirezap73/veycut/actions/runs/38205870832) and [full-movie import/reopen](https://github.com/alirezap73/veycut/actions/runs/38206727095). Full-movie import/reopen does not prove a full editing session.

On a local macOS 27.0.1 Mac, the exact DMG passed signature verification. The app imported a two-second portrait video and bilingual SRT, edited Persian text, split and undid/redid the video cut, saved/reopened the project, and exported a two-second 360×640 H.264/AAC file. The full output decoded and both caption frames were inspected. Separate QuickTime playback was not verified because UI automation timed out.

Installer SHA-256: `9c3ad16516af18bccbb5fe11d417c5aa95c54f94408d534df7c2a5f604d871cf`. Compare the downloaded DMG with the release's `SHA256SUMS`. The app is ad-hoc signed and not Apple-notarized. Intel Mac, Windows, Linux, Android and iOS installers are outside this Mac release.

Native/Web feature parity is not established. The Web uses bounded real-time SDR recording; full native effects, audio filters, HDR/model tools and offline frame-accurate output remain gaps. Source and licence notices remain included. No external model service is connected.
