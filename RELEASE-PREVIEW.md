Unpublished development candidate. The public preview remains 0.2.0-preview.1. The existing development version is fixed during core beta work; no new release number is being introduced.

Current validated runtime source: `e5d667ce361ab1133193f30565ef8b1af94f984c`.

This source preserves active export cancellation, reports rejected caption edits, orders project saves, keeps the editor open after failed saves, cancels stale caption work across successful project switches, and validates replacement media before changing paths. Earlier development features include selectable export sizes, isolated export work files, destination collision protection and background missing-media recovery. English and Persian interface languages remain available.

[Native validation](https://github.com/alirezap73/veycut/actions/runs/38057090804) passed 772 native test invocations, macOS compilation and WebAssembly checks. [Development checks](https://github.com/alirezap73/veycut/actions/runs/38057087322) passed 222 test invocations. Counts are executions, not a feature-completion percentage. Windows is outside this explicit Mac beta validation scope.

The [updated Mac candidate](https://github.com/alirezap73/veycut/actions/runs/38059935774) and [package inspection](https://github.com/alirezap73/veycut/actions/runs/38062388110) passed for this exact source. Inspection verified the DMG, strict ad-hoc signature, bundled library paths and a native 1024×681 VeyCut window after 30 seconds. The new package is retained as a workflow artifact, not a new public release. Its SHA-256 is `ebbd8910e011976594e72b374fd7a982a3a8d718b97b468f8a5001e6da909908`. Existing private draft assets still belong to older source `231e726`; do not attach these notes to that older installer.

The target is Apple silicon macOS. The app is ad-hoc signed and not Apple-notarized. Installation on an independent machine, native file-picker/drag/drop workflows and a complete longer editing session remain unverified. Intel Mac, Windows, Linux and mobile installers are outside this beta milestone. Source, copyright and license notices are retained. No external model service is connected.
