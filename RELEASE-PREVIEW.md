VeyCut 0.3.0 adds selectable export resolutions, with captions and titles rasterized at the chosen output size. It isolates each export's work files, refuses existing output files at final publication and discards late progress/results after cancellation or project changes. The shipping build uses thin LTO; no measured performance improvement is claimed before its checks complete.

This experimental preview targets Apple silicon macOS. Linux native tests, macOS compilation, wasm checks, lightweight checks and the exact Mac candidate build must pass before creating a release draft. VALIDATION.json records source identity and validation scope. Windows validation is separate; no Windows, Linux or mobile installer is included.

The macOS app is ad-hoc signed and is not Apple-notarized. Package image/signature/library checks and a startup check on a macOS runner are required before publication. Installation and editing on a separate clean machine, native picker/drag/drop and long sessions remain unverified.

The interface supports English and Persian through Settings → Language. Download the macos-arm64 DMG for Apple silicon. Manifest and validation metadata record exact source revisions; SHA256SUMS covers released files. Source and license notices are retained.
