Unpublished development candidate. The public preview remains 0.2.0-preview.1. The existing development version is fixed during core beta work; no new release number is being introduced.

Current validated runtime source: `e5d667ce361ab1133193f30565ef8b1af94f984c`.

This source preserves active export cancellation, reports rejected caption edits, orders project saves, keeps the editor open after failed saves, cancels stale caption work across successful project switches, and validates replacement media before changing paths. Earlier development features include selectable export sizes, isolated export work files, destination collision protection and background missing-media recovery. English and Persian interface languages remain available.

[Native validation](https://github.com/alirezap73/veycut/actions/runs/38057090804) passed 772 native test invocations, macOS compilation and WebAssembly checks. [Development checks](https://github.com/alirezap73/veycut/actions/runs/38057087322) passed 222 test invocations. Counts are executions, not a feature-completion percentage. Windows is outside this explicit Mac beta validation scope.

The [updated Mac candidate](https://github.com/alirezap73/veycut/actions/runs/38059935774) is still being built and has not yet passed package inspection. Existing draft assets and inspection evidence belong to older source `231e726` and do not validate this updated package. Do not attach these notes to the older installer or describe the new installer as inspected until its build and inspection pass.

The target is Apple silicon macOS. The app is ad-hoc signed and not Apple-notarized. Installation on an independent machine, native file-picker/drag/drop workflows and a complete longer editing session remain unverified. Intel Mac, Windows, Linux and mobile installers are outside this beta milestone. Source, copyright and license notices are retained. No external model service is connected.
