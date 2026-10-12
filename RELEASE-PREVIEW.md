# VeyCut 0.3.1 Mac candidate — English interface

The app version remains **0.3.1**. Current source uses an English-only platform interface while preserving Persian titles, subtitles, fonts, automatic content direction and content-processing language options. Remembered and custom UI locales cannot replace the shipped English labels.

[Native validation](https://github.com/alirezap73/veycut/actions/runs/38203218423) passed Linux engine tests/lints, WebAssembly checks and macOS all-target compilation. Windows validation is a separate status and does not establish a Windows download. [English Web validation](https://github.com/alirezap73/veycut/actions/runs/38203197508) and [public deployment](https://github.com/alirezap73/veycut/actions/runs/38203552214) passed; the [hosted editor](https://alirezap73.github.io/veycut/) is already English-only with Persian content support.

The [new Mac candidate](https://github.com/alirezap73/veycut/actions/runs/38204492520) targets Apple silicon macOS and source `9082f2686b7896e49561d2c531fd3ec105e456eb`. Its build and matching packaged GUI tests must finish before this document can announce a replacement download. The public beta.2 installer remains the older package and still offers its historical interface choices. Prior-package GUI reports do not certify this candidate.

Required packaged checks cover actual media import, split/Undo/Redo, Persian subtitles, save/reopen, decoded short video output, caption navigation and a generated 32-second editing/output scenario. Independent clean installation and a 10–15-minute session editing real camera footage remain outstanding. The app is ad-hoc signed and not Apple-notarized. Intel Mac, Windows, Linux, Android and iOS installers are outside this Mac candidate.

Native/Web feature parity is not established. The Web uses bounded real-time SDR recording; full native effects, audio filters, HDR/model tools and offline frame-accurate output remain gaps. Source and licence notices remain included. No external model service is connected.
