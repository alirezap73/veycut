---
name: run-veycut
description: Build and verify the VeyCut native desktop editor. Use GitHub runners for full validation and packaging when local resource use should stay low.
---

# Running and verifying VeyCut

VeyCut is a Rust and Slint native desktop editor. Its Cargo workspace is in `src/`. Internal Cargo target identifiers are retained for compatibility with the source and lockfile.

## Low-resource development

Use the repository's GitHub workflows for native tests, GUI rendering and installer builds. Do not launch or compile the native app locally when the user has requested low laptop load. Small standalone helper tests and formatting checks can run locally.

For a manual server validation, dispatch the CI workflow at the exact development revision. Review Linux native tests and lints, macOS compilation, wasm checks, and Windows separately. A preview package must use the validated source identity recorded in `VALIDATION.json`.

## On a suitable development machine

```sh
cd "<repo-root>/src"
cargo fmt --all --check
cargo check --workspace --all-targets
cargo test --workspace -j 1
cargo run --profile quick -p concat
```

Install the native dependencies documented in `src/README.md` first. GUI and media tests can be expensive; a successful type check alone does not verify rendering or media output.

## Release verification

Run the Mac candidate workflow using a successful native validation run. Inspect the exact resulting DMG without rebuilding: verify image/signature/library paths and observe the packaged editor's native window. Compare its checksum with the release manifest and GitHub asset digest. Create a draft only from the exact candidate; publish with the actual results and remaining limits recorded.

Server-rendered form fixtures and decoded export frames provide different evidence. Do not describe a blank form preview as tested media playback. Clean-machine installation, native file-picker/drag/drop and long sessions require separate verification.
