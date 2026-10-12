# VeyCut beta milestone

The target is a reliable beta for Apple silicon macOS with the main editing path: import media, arrange/trim/split clips, add text and sound, save/reopen, and export. Feature parity with other products and a completion percentage have not been established.

The public experimental pre-release is 0.3.1-beta.2. Development source is 0.3.1 after one explicitly requested patch increment for the fixes documented in the changelog. The existing 0.3.0 build remains a separate unpublished candidate and does not contain those fixes. Keep 0.3.1 fixed while it is validated; more commits do not require another version increase or create a public beta.

## Expanded browser editor

[Expanded Web checks](https://github.com/alirezap73/veycut/actions/runs/38192514807) passed on `c538f3f` with eight shared-engine tests and 32 browser scenario groups. The mixed 360×640 WebM fully decoded with 64 video frames and separate source audio, transformed/keyframed stills, native text and burned captions. Legacy-project migration and malformed-project preservation passed. This source expands the Web editor after the beta.2 ZIP; the Mac installer is unchanged. Browser HDR, the full native effect/model catalogue, offline frame accuracy, Safari/Firefox and longer real footage remain unverified or unsupported. MP4 was unavailable in tested Chromium under explicit H.264/AAC codec gating.

## Version numbering

Change version numbers only when releasing a tested milestone. Small fixes and modest additions use the next patch number (for example, `0.2.0` to `0.2.1`); pre-release revisions of the same milestone increment their suffix. Reserve a minor-version change for a substantial, documented expansion of capabilities. Major-version changes require a major product milestone. Commit counts and comparisons with other products do not determine the version number. The app version remains 0.3.1 during current work. The public beta.2 packages and later development commits are separate milestones.

## Latest CJK and accessibility runtime at 974c65e

Source `974c65e` adds a shared 2.74 MB bundled CJK fallback for the UI and title
renderer, plus accessible icon-button roles and names. Common subset coverage
and Simplified Chinese glyph-form limitations apply. The earlier CJK run
[38116050056](https://github.com/alirezap73/veycut/actions/runs/38116050056)
failed to compile a newly added array-iterator test; this was a test-compilation
failure, not evidence of failed CJK rendering. That test is corrected.

[Full validation](https://github.com/alirezap73/veycut/actions/runs/38117995463) passed **806 Rust test invocations**, **0 failed**, with **1 ignored model/audio transcription test**. Quick checks passed **271 invocations** (**250 Rust + 21 Python**). All four CJK UI regressions and the mixed-script raster test passed, along with Linux lints/performance, gRPC checks, WebAssembly and macOS all-target compilation. The Mac job compiles targets rather than executing native tests.

The [final candidate](https://github.com/alirezap73/veycut/actions/runs/38119080271) built successfully from package source `39cc82cebf1904c1b65f860d6fe674b0ca1aacd2`, which includes runtime `974c65e`. Matching [core](https://github.com/alirezap73/veycut/actions/runs/38121113154), [caption-navigation](https://github.com/alirezap73/veycut/actions/runs/38121118094) and [extended](https://github.com/alirezap73/veycut/actions/runs/38121124147) GUI checks passed **55**, **23** and **98** actions. The extended check observed the **AX Pause control**, then paused at **17.473 seconds** after native-panel cancellation and **24.967 seconds** after acceptance, meeting `4 <= paused < 32`. Its 32-second H.264/AAC output at 720×1280/30 fps, 960 frames and 48 kHz stereo fully decoded. This does not establish bare-Space focus restoration or timer updates during the held panel.

[Exact-package real-movie import/reopen](https://github.com/alirezap73/veycut/actions/runs/38121129800) also passed with a 596.46-second, 640×359 H.264/AAC movie. This is import/reopen only; the movie was not placed on the timeline, edited or exported. CJK UI/raster regressions passed in source validation; these packaged scenarios are not a separate CJK-text GUI proof.

The **69,563,828-byte** DMG SHA-256 is `2150c1b883449d1013a9e2d01a177b569795f4bc7244664d16bfd0b339829c1d`. [v0.3.1-beta.2](https://github.com/alirezap73/veycut/releases/tag/v0.3.1-beta.2) is a **public experimental pre-release** with the unchanged validated Mac package and the newer Web prototype. An independent Mac/tester is available, but its actual installation and real-footage editing report is still pending. Earlier package results remain specific to their own source. Development remains 0.3.1; this experimental pre-release does not establish independent installation or real-footage reliability.

## Packaged export protection

[Exact-package inspection](https://github.com/alirezap73/veycut/actions/runs/38128437896) passed on unchanged package source `39cc82c`. The GUI refused an existing output and preserved its SHA-256, then cancelled a real active render after progress and a non-empty temporary video were observed. The editor returned to idle, temporary export directories were removed, no output appeared during a further ten seconds, and the complete saved project remained identical. A subsequent 32-second H.264/AAC export fully decoded at 720×1280/30 fps, with 960 video frames and 48 kHz stereo; an unrelated sentinel file remained unchanged. The inspection driver checks fresh uniquely labelled controls before native clicks. These are generated-fixture tests on the server; destination creation during publication, independent clean installation and real-camera sessions remain separate checks.

[Missing/corrupt media inspection](https://github.com/alirezap73/veycut/actions/runs/38136033405) also passed using the same installer. Both failures showed the native decoder error in the export dialog, preserved the complete project and an unrelated file, cleaned temporary output and published no final video. After restoring the original file at the original path, both retries fully decoded two seconds of H.264/AAC (60 frames, 720×1280, 30 fps, 48 kHz stereo); all twelve saved project snapshots matched. This verifies recovery by restoring the source file, not the relocation/relink picker.

## Exact-package light local check

The final source `39cc82cebf1904c1b65f860d6fe674b0ca1aacd2` package was checked on the development Mac,
**macOS 27.0.1 arm64**, after explicit authorization for the DMG download and
light test. Actual report checks confirm package hash, strict signature,
native media import, split at one second, Undo and Redo with identical IDs and
properties, bilingual caption import, English replacement `Local beta check`,
and normal save/close/reopen with all four clips identical.

Export through the UI produced two seconds of H.264, **720×1280**, **30 fps**,
**60 frames**, with AAC **48 kHz stereo**. All video/audio streams decoded.
Both-channel RMS was zero for the first-second silence and about 0.35353 for
the second-second tone. Extracted frames visually confirmed Persian and the
unique edited English caption. VeyCut was quit and the DMG unmounted afterwards.
No local code build, model download or long-media rendering was performed.

This is **not an independent clean consumer installation**: it used the
existing development Mac, a two-second generated fixture and GitHub CLI download.
Browser quarantine/Gatekeeper flow, separate-player viewing, 10–15-minute real
editing and real-camera footage remain unverified. QuickTime automation timed
out; decoding/frame review is separate evidence. CPU/memory were not sampled,
so no zero-load or measured performance claim is made. An independent Mac/tester
is available; a source-matched completed report remains a release gate.

## Historical runtime and package checks

The following sections retain earlier revision-specific evidence. Descriptions of unpublished candidates and then-current limitations apply to those recorded revisions; current public downloads are 0.3.1-beta.2.

## Stereo layout and GPU failure runtime at e6bce73

Source `e6bce73` fixes the initial/resized meter width through nested layouts,
with bounded shrinking in tiny windows. Uncaptured GPU errors and device loss
share a failure flag across siblings; failed textures/readbacks are refused
and frame exports use the existing device-recovery path.

[Exact-source validation](https://github.com/alirezap73/veycut/actions/runs/38109658662)
passed **801 Rust test invocations**, Linux lints/performance, WebAssembly and
macOS all-target compilation. All four dock-layout regressions and the real
captured/uncaptured GPU-validation regression passed. The Mac job compiles
rather than executing native tests.

[Its Mac candidate](https://github.com/alirezap73/veycut/actions/runs/38115406465)
built successfully. Matching [extended](https://github.com/alirezap73/veycut/actions/runs/38117957948),
[core](https://github.com/alirezap73/veycut/actions/runs/38118020433) and
[caption-navigation](https://github.com/alirezap73/veycut/actions/runs/38118025361)
GUI inspections passed. Core passed **55 steps**, caption navigation **23 steps**, and the extended scenario **98 actions**. The extended output fully decoded 32 seconds of H.264 at 720×1280/30 fps (960 frames) with AAC 48 kHz stereo. Native-panel cancellation and acceptance paused at **16.579** and **24.434 seconds**, both meeting `4 <= paused < 32`, using the screenshot-confirmed Pause coordinate. Default-layout screenshots show a **64-pixel meter pane**, both L/R channels fully visible and a held peak of **−6 dB**. Clipping-reset interaction was not exercised. These results do not validate later CJK/accessibility changes or timer updates during the held panel.
Development version remains **0.3.1**.

## Validated navigation runtime at 36e98b7

Source `36e98b7855d7c6a550cedf39a17e537eb68fe3c9` selects every newly
duplicated clip and adds caption navigation with chronological time ranges,
bounded UTF-8 previews and 50-row pages. Choosing a row selects its title,
seeks to its start and closes the sheet; callbacks verify the original
project/timeline and current clip.

[Exact-source validation](https://github.com/alirezap73/veycut/actions/runs/38107827064)
passed **796 Rust test invocations**, Linux lints/performance, macOS all-target
compilation and WebAssembly. All three navigation regressions passed: sorting,
scope, page bounds, stale tokens, invalid targets and bounded UTF-8 previews.
The Mac job compiles targets rather than executing native tests. The same run
passed **263 development invocations** (249 Rust and 14 Python).

The [matching candidate](https://github.com/alirezap73/veycut/actions/runs/38108844684)
built successfully from source `af14bfb` with the same runtime. The intervening change only teaches the package gate to verify the known full-check wrapper, including its successful quick/native jobs; 13 gate tests pass. The [core GUI inspection](https://github.com/alirezap73/veycut/actions/runs/38115400994)
passed **55 steps**, including native import/placement, split undo/redo,
bilingual caption editing, subtitle export, save/reopen and a fully decoded
two-second H.264/AAC export. Extracted frames show Persian shaping and a
coloured emoji using an available system font; this does not prove COLR portability.

[Caption navigation](https://github.com/alirezap73/veycut/actions/runs/38115397274)
passed **23 steps** with **55 cues** imported through the UI. Pointer, Enter and
Space each selected one cue and sought to its original start, verified through
copy/delete/paste timing and property checks. Page two showed chronological cues
51–55 and the correct range/count. Cleanup and reopen preserved the full baseline.

[Extended GUI inspection](https://github.com/alirezap73/veycut/actions/runs/38116397350)
passed **98 actions** on test/package source `af14bfb`, runtime `36e98b7`.
Group copy/paste, new-copy selection/deletion, single-step duplicate Undo/Redo
with exact IDs/properties, move, head/tail trim, top/bottom track placement and
reopen passed. Both native import panels were held for four seconds during
playback. Pause positions after cancellation and acceptance were **17.569** and
**29.848 seconds**, satisfying `4 <= paused < 32`; cancellation preserved media
and clips, and acceptance added one media item without changing the timeline.
Pause used a screenshot-confirmed native pointer coordinate; **AX Pause controls
and timer updates during the held panel were not verified**.

The extended export fully decoded all streams: H.264, **720×1280**, **30 fps**,
**960 frames**, **32 seconds**; AAC **48 kHz stereo**, 31.978667 seconds. Audio
length and alternating silence/tone checks passed. This is a repeated synthetic
two-second sample, not real user footage or an independent installation. Split
and subtitle editing were exercised by the core scenario, not the extended one.
These results do not validate later meter/GPU or CJK/accessibility changes.
Development remains **0.3.1**.

## Validated runtime source at 32acd2f

Development source `32acd2f` adds COLR v0 solid colour layers, bounded to 128
layers with palette alpha/title foreground and rejection of unusable layer
outlines before font selection. The new native-dialog paths release editor
borrows before opening media/LUT import and frame/audio/subtitle save panels;
media/font picker answers are tied to their original project.

[Native validation](https://github.com/alirezap73/veycut/actions/runs/38105343165)
passed for this exact runtime: **793 successful Rust test invocations**, Linux
workspace/transport lints, the quick performance check, macOS all-target
compilation and WebAssembly checks. The Mac job compiles targets; it does not
execute the native test suite. All four COLR regressions passed.
[Development checks](https://github.com/alirezap73/veycut/actions/runs/38105963558)
passed **263 invocations** (249 Rust and 14 Python), including 31 title tests.
Counts describe test executions, not a feature-completion percentage.

The [matching Mac candidate](https://github.com/alirezap73/veycut/actions/runs/38106368671)
built successfully from source `57337d63761060124cdf0acd8b80be8d92eaeb41`.
Commits after runtime `32acd2f` change validation infrastructure only; candidate
policy checks confirmed runtime identity. [Core GUI inspection](https://github.com/alirezap73/veycut/actions/runs/38108357089) passed all 55 steps: native import/placement, split undo/redo, editable bilingual subtitles, replacement, subtitle-file export, save/reopen and video export. The fully decoded output is H.264/AAC at 720×1280, 30 fps and 60 frames over two seconds. Extracted frames visually show Persian shaping and the unique English caption with a coloured emoji; this uses the available system font and does not establish COLR portability. The DMG checksum is `63cd403e001e3faa3aa34b99db82a311861d4ba63538b08c8fa73e70929b3533`.

[Extended GUI inspection](https://github.com/alirezap73/veycut/actions/runs/38108362606) failed the playback-position assertion after cancelling a held native import panel. It did not reach accepted-panel or 32-second export verification. A screenshot also shows the default meter pane clipping its right channel: the later `e6bce73` source corrects this layout, with four passing layout regressions; its later matching GUI inspection also confirms both channels fully visible in the default meter pane. [The diagnostic repeat](https://github.com/alirezap73/veycut/actions/runs/38109391594) also failed: playback started at zero, no pause log was observed after 21.39 seconds, and no audio-unavailable error was recorded. A later [AX-control attempt](https://github.com/alirezap73/veycut/actions/runs/38115584879) failed because the older icon button did not expose an accessible Pause name; that failure did not prove a playback fault. The unchanged strict playback assertion subsequently passed on runtime `36e98b7` using the screenshot-confirmed coordinate route documented above, including accepted-panel and longer-export checks. These historical failures remain distinct from later passing evidence. No earlier package contains all the later source changes.
Development remains 0.3.1 and the public preview is unchanged.

## Prior validated source at 9a7b5e7

Development source `9a7b5e7` passed [native validation](https://github.com/alirezap73/veycut/actions/runs/38101849643): **789 successful Rust test invocations**, Linux workspace/transport lints, the quick performance check, macOS compilation and WebAssembly checks. The Mac job compiles all targets; it does not execute the native test suite. [Development checks](https://github.com/alirezap73/veycut/actions/runs/38101847158) passed **231 invocations** (218 Rust and 13 Python). Counts are executions, not a feature-completion percentage.

New passing regressions cover PNG/BGRA colour strikes and alpha composition, bitmap-only backgrounds/word highlights and fallback, fitted still-image reader dimensions, unusable frame-rate fallback, oversized export rejection before output/GPU work, loaded extreme-time repair and atomic clipboard rejection. Source also adds compact stereo meter readouts and moves native folder dialogs outside editor borrows, with stale-project answer guards. See [the editing milestone](FEATURE-PROGRESS.md) for explicit scope and remaining GUI checks.

The [Mac candidate for that earlier source](https://github.com/alirezap73/veycut/actions/runs/38102915695) built successfully. It does not contain the later COLR/native-file-dialog changes. The earlier 0.3.0 package below does not contain these changes. Native tests and compilation do not establish packaged gesture/dialog behaviour or independent installation. Public downloads and development version **0.3.1** remain unchanged.

## Previous source validation at e46372a

Clip duplication and clipboard paste now insert a complete snapshot as one edit. A selected group duplicates as one undo step. Regression tests cover all six clip kinds, styling and timing preservation, paste after deleting the original, gap placement and failure rollback. [Native validation](https://github.com/alirezap73/veycut/actions/runs/38067689837) passed 775 native test invocations, Linux lints, macOS compilation and WebAssembly checks. [Development checks](https://github.com/alirezap73/veycut/actions/runs/38067695299) passed 225 test invocations (213 Rust and 12 Python).

The [replacement Mac package build](https://github.com/alirezap73/veycut/actions/runs/38069013402) and [native package/UI inspection](https://github.com/alirezap73/veycut/actions/runs/38082919880) passed for exact source `e46372af035b073ddf3fa04673dcd82d6c66ded2`. Installer SHA-256: `bfa886a430bdd9b20352a683f9e706970bfb29a2cd3d35bac3db615d6dd88df5`. The package remains a workflow artifact; no official beta has been published.

The [55-step packaged GUI check](https://github.com/alirezap73/veycut/actions/runs/38085438701) passed on that exact runtime. It imports a copied generated MP4 through the native picker, removes the initially seeded clip and places the imported media from the library onto the timeline. It splits at one second with undo/redo, imports editable bilingual WebVTT captions with undo/redo, replaces the English caption, exports WebVTT, saves/reopens and exports video through visible controls. The H.264/AAC output was independently fully decoded: 720×1280, 30 fps, 60 frames, two seconds, with silence followed by the expected tone. Visual inspection of the two extracted frames confirmed Persian shaping and the unique replacement text `GUI subtitle pass`, distinct from the fixture's baked captions.

Native project open/save/close/reopen, single-step duplication undo/redo, failed-save window retention and retry also passed. An unsaved undo survived a failed close and was persisted when saving became possible. `CORE-GUI-TEST.json` and `PROJECT-UI-TEST.json` record editing evidence; `PACKAGE-INSPECTION.json` describes only idle startup. This generated two-second fixture does not verify trim/move gestures, drag/drop, longer user footage, transcription or independent-machine installation. The previous installer below does not contain the duplication fix. No official beta has been published.

## Previous source validation at e5d667c

[Native validation](https://github.com/alirezap73/veycut/actions/runs/38057090804) passed Linux engine tests and lints, macOS compilation and WebAssembly checks: 772 successful native test invocations. [Development checks](https://github.com/alirezap73/veycut/actions/runs/38057087322) passed 222 successful test invocations. Counts describe test executions, not distinct features or a completeness percentage.

The combined changes preserve active export cancellation, report rejected caption edits, order project saves, keep the editor open when saving fails, cancel stale captions across successful project switches, and probe replacement files before applying media recovery. The [updated Mac candidate build](https://github.com/alirezap73/veycut/actions/runs/38059935774) and [package inspection](https://github.com/alirezap73/veycut/actions/runs/38062388110) passed for this exact source. Inspection verified the DMG, strict ad-hoc signature, bundled library paths and a native 1024×681 VeyCut window after 30 seconds. Installer SHA-256: `ebbd8910e011976594e72b374fd7a982a3a8d718b97b468f8a5001e6da909908`. The package is a workflow artifact, not a new public release. Independent installation, native picker/drag-drop and complete longer editing sessions remain unverified. The earlier package evidence below remains historical. No external model provider is connected.

[Repeated-launch inspection](https://github.com/alirezap73/veycut/actions/runs/38062789609) also passed on the same package: two launches using the same runner profile, 120 seconds of idle observation each, and four visible-window samples per launch. The app remained alive throughout both observations. The process was terminated with SIGTERM between launches; this does not verify menu-driven quit, editing, native picker/drag-drop, saving through the GUI or export through the GUI. Resource samples are runner-only measurements, not a laptop performance guarantee.

## Earlier package evidence at source 231e726

| Main path | Verified evidence | Remaining scope |
| --- | --- | --- |
| Import video, stills and audio | Native integration creates and probes actual encoded video/audio files | Native picker and drag/drop with user-supplied formats |
| Split, trim and move clips | Engine export regressions plus packaged GUI split undo/redo on an imported clip | Packaged trim/move gestures and longer timelines |
| Text and subtitles | Packaged bilingual WebVTT import, undo/redo, text replacement, file export and rendered video captions | Longer caption sessions, appearance changes and transcription |
| Save and reopen | Integration reopens the project and compares the flattened clips after each export | Longer sessions and interruption/restart on an independent machine |
| Export | Full decoding and audio checks, portrait captions, selectable dimensions, output collision protection | Longer real footage and repeated user-driven exports |
| Cancel and missing media | Stale reply guards, cancellable search, duplicate/partial-tree refusal | User-driven cancel/relink in a complete packaged session |
| Mac package | DMG, strict signature and library paths checked; native 1024×681 editor window observed after 30 seconds | Independent-machine installation and the editing session above |

[Native validation](https://github.com/alirezap73/veycut/actions/runs/38033881735): 763 successful Linux native test invocations, macOS compilation and wasm checks. [Development checks](https://github.com/alirezap73/veycut/actions/runs/38033883718): 209. [Candidate build](https://github.com/alirezap73/veycut/actions/runs/38034984163) and [package inspection](https://github.com/alirezap73/veycut/actions/runs/38037017239) passed. These results do not constitute verification of every GUI workflow.

Windows compilation completed, but the effect-thumbnail test reported GPU device loss and reached its ten-minute timeout. Windows is outside this beta installer scope. The Mac app is ad-hoc signed and not Apple-notarized. Intel Mac, Linux, Windows and mobile installers are not part of this milestone.

## Release gates

Follow the [parallel development protocol](PARALLEL-DEVELOPMENT.md) for bounded
worker ownership, central review, server checks and optional model trials. The
Mac beta validation path excludes Windows explicitly; default cross-platform
CI remains unchanged. Model trials have not established a speedup.

Use the [manual core check and small generated media sample](BETA-TEST.md) to report reproducible results. The sample is a short fixture, not a substitute for user footage or an independent-machine check.

1. Run the complete main path in the packaged editor on an independent Apple silicon Mac, using a short landscape clip, a portrait clip, audio and bilingual text. Check the saved/reopened project and the decoded output.
2. Verify missing/corrupt media and cancellation leave the project and existing output files intact.
3. Fix observed blocking failures and rerun the affected checks. Rebuild and reinspect if the runtime or package changes; keep source and package identity explicit.
4. Publish a beta only with completed evidence, checksums, installation instructions and actual remaining limitations. Do not describe server form fixtures as verified user media playback.

Full builds and media/GUI tests stay on GitHub runners when local laptop use must remain light. The development shipping workflow now keeps compiled workspace crates under a new cache-policy key; the previous candidate's cache excluded them and rebuilt them in 32m06s. The updated candidate completed with the new policy. No controlled speed comparison has established an improvement.

## معیار بتا

هدف، بتای قابل‌اعتماد برای مک Apple silicon است: ورود رسانه، برش و جابه‌جایی، متن و صدا، ذخیره و بازکردن، و خروجی. نسخهٔ عمومی فعلاً ۰٫۲ می‌ماند؛ شمارهٔ کاندید توسعه افزایش نمی‌یابد. درصد نزدیکی به محصولات دیگر تعیین نشده است.

آزمون موتور، خروجی واقعی و بازشدن بسته موفق بوده‌اند. ورود فایل از پنجرهٔ انتخاب، جابه‌جایی و کوتاه‌کردن کلیپ، و خروجی ۳۲ ثانیه‌ای با نمونهٔ مصنوعی روی سرور تأیید شده‌اند. استفادهٔ کامل روی دستگاه مستقل، کشیدن‌ورهاکردن و جلسات طولانی با فایل واقعی هنوز تأیید نشده‌اند. بستهٔ نهایی و آزمون رابط مطابق همان سورس نیز موفق شده‌اند؛ آزمون سبک روی مک توسعه جای نصب مستقل و کار طولانی با فایل واقعی را نمی‌گیرد. انتشار بعدی به تکمیل این بررسی‌ها و رفع خطاهای مشاهده‌شده وابسته است. مشکل گرافیک ویندوز ثبت شده و فایل نصب ویندوز در این بتا ارائه نمی‌شود.
