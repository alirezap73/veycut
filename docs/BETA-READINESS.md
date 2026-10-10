# VeyCut beta milestone

The target is a reliable beta for Apple silicon macOS with the main editing path: import media, arrange/trim/split clips, add text and sound, save/reopen, and export. Feature parity with other products and a completion percentage have not been established.

The public preview stays at 0.2.0-preview.1. The existing 0.3.0 build is an unpublished development candidate, not a new public milestone. Keep its version fixed while this beta work continues. Raise the version only for a documented, tested milestone, rather than for each feature or commit.

## Version numbering

Change version numbers only when releasing a tested milestone. Small fixes and modest additions use the next patch number (for example, `0.2.0` to `0.2.1`); pre-release revisions of the same milestone increment their suffix. Reserve a minor-version change for a substantial, documented expansion of capabilities. Major-version changes require a major product milestone. Commit counts and comparisons with other products do not determine the version number. The existing unpublished development version stays fixed during the current work.

## Current source validation at e5d667c

[Native validation](https://github.com/alirezap73/veycut/actions/runs/38057090804) passed Linux engine tests and lints, macOS compilation and WebAssembly checks: 772 successful native test invocations. [Development checks](https://github.com/alirezap73/veycut/actions/runs/38057087322) passed 222 successful test invocations. Counts describe test executions, not distinct features or a completeness percentage.

The combined changes preserve active export cancellation, report rejected caption edits, order project saves, keep the editor open when saving fails, cancel stale captions across successful project switches, and probe replacement files before applying media recovery. The [updated Mac candidate build](https://github.com/alirezap73/veycut/actions/runs/38059935774) and [package inspection](https://github.com/alirezap73/veycut/actions/runs/38062388110) passed for this exact source. Inspection verified the DMG, strict ad-hoc signature, bundled library paths and a native 1024×681 VeyCut window after 30 seconds. Installer SHA-256: `ebbd8910e011976594e72b374fd7a982a3a8d718b97b468f8a5001e6da909908`. The package is a workflow artifact, not a new public release. Independent installation, native picker/drag-drop and complete longer editing sessions remain unverified. The earlier package evidence below remains historical. No external model provider is connected.

## Earlier package evidence at source 231e726

| Main path | Verified evidence | Remaining scope |
| --- | --- | --- |
| Import video, stills and audio | Native integration creates and probes actual encoded video/audio files | Native picker and drag/drop with user-supplied formats |
| Split, trim and move clips | `every_edit_still_exports` exports after each command and checks decoded picture/audio at expected times | Mouse and keyboard operations in the packaged editor |
| Text and subtitles | Bundled Persian shaping, bilingual captions, SRT/WebVTT and undo/redo checks | Full packaged-editor subtitle session |
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

آزمون موتور، خروجی واقعی و بازشدن بسته موفق بوده‌اند. استفادهٔ کامل از رابط برنامه روی دستگاه مستقل، ورود فایل از پنجرهٔ انتخاب/کشیدن‌ورهاکردن و جلسات طولانی هنوز تأیید نشده‌اند. انتشار بعدی به تکمیل این بررسی‌ها و رفع خطاهای مشاهده‌شده وابسته است. مشکل گرافیک ویندوز ثبت شده و فایل نصب ویندوز در این بتا ارائه نمی‌شود.
