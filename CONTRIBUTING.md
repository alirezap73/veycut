# Contributing to VeyCut

Help us test real editing workflows, fix reproducible bugs and improve the English/Persian interface.

## Report a problem or propose a change

Download the experimental package from [VeyCut Releases](https://github.com/alirezap73/veycut/releases/tag/v0.3.1-beta.2), follow the [quick start](docs/QUICK-START.md), and report the first failed step in [VeyCut Issues](https://github.com/alirezap73/veycut/issues/new/choose). Include your package/build, OS, browser for Web, steps and error text. Use a small sample you can share and review logs before posting.

Open an issue before a large change. The [roadmap](docs/ROADMAP.md) identifies current targets; [platform support](docs/PLATFORMS.md) separates shipped features from development work.

## Work on the source

Native code is in the Rust workspace under `src/`. Internal crate names retain their existing names for compatibility. [Engine setup](src/README.md) lists native dependencies; use the Rust version in `src/Cargo.toml`. FFmpeg development libraries, CMake and a C++ compiler are required for a native editor build.

The browser editor is in `web/`. Its shared project bridge lives in `src/crates/veycut-web/`; see [Web development and limits](web/README.md). A complete static package includes the generated Wasm module. Running the source directory without it uses the disclosed JavaScript fallback.

For a bounded native check, choose the crate affected by your change. For example:

```sh
cd src
cargo fmt --all --check
cargo test --locked -j 1 -p concat-core -p concat-project -- --test-threads=1
cargo clippy --locked -j 1 -p concat-project --all-targets -- -D warnings
```

Full native builds, GPU checks, packaging and browser exports can run through the repository's GitHub Actions. Successful checks apply to their exact source revision. Include relevant checks and limitations in your pull request; avoid declaring a platform verified from source inspection alone.

When editing native UI strings, update the string inventory with `python3 scripts/locales.py` from the repository root. See [translation instructions](TRANSLATING.md). Model changes must keep `models/manifest.toml` and their engine tables consistent; use `python3 scripts/models.py --check`. Model mirroring and release publication are maintainer actions.

Use the existing logging facade and surrounding code style. Preserve compatibility-sensitive internal names and file formats. Keep the app version fixed at **0.3.1** during current development; see [version and commit policy](docs/VERSIONING.md).

## Copyright and licensing

VeyCut's code is distributed under **AGPL-3.0-or-later**. Preserve existing copyright, SPDX headers, third-party font licenses and source notices. [LICENSE](LICENSE), [SOURCE-NOTICES.md](SOURCE-NOTICES.md), [LICENSE-EXCEPTIONS.md](LICENSE-EXCEPTIONS.md) and [TRADEMARK.md](TRADEMARK.md) retain the applicable terms and attribution.

Existing source headers include:

```rust
// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Jareer and Concat contributors
```

Keep that attribution where it applies; add your copyright line for your original work rather than replacing existing lines. Identify third-party code and its license in the pull request.

The retained [CLA.md](CLA.md) identifies the original project and its maintainers. This contribution guide does not change its parties or create a separate VeyCut copyright-assignment or relicensing agreement. Consult the existing license documents when preparing a contribution.

[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) applies to participation in this repository.
