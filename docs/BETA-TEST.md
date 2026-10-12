# VeyCut core beta check

Use a suitable Apple silicon Mac with the [public experimental 0.3.1-beta.2 Mac package](https://github.com/alirezap73/veycut/releases/tag/v0.3.1-beta.2), or record the exact revision of a separate candidate. The app version is 0.3.1. This is a manual test of the packaged editor, distinct from engine/form tests and earlier runner checks. If a step fails, stop and report the first failure; do not mark later steps as passed. Independent installation and longer real-camera editing remain outstanding. For the separate Web prototype, use the [quick start](QUICK-START.md) and [platform scope](PLATFORMS.md).

The [portrait sample](beta-samples/portrait-2s.mp4) is a two-second, 720×1280, 30 fps generated video with baked bilingual captions. It is silent for its first second and contains a synthetic stereo tone in the second. The [WebVTT sample](beta-samples/captions-2s.vtt) contains the same two timed captions. [Provenance and checksums](beta-samples/PROVENANCE.json) identify the native test that created and fully decoded the file. This small fixture is not evidence of support for long camera recordings or every format.

1. Copy the app to Applications and open it. Record the actual build version, macOS version and chip. Confirm a visible editor window and note any startup error.
2. Create a portrait 720×1280/30 fps project in a writable folder. Import the portrait sample through the native file picker, place it on the timeline, and play through both captions. Confirm the tone in its second second. In a separate project, also import it by drag/drop and confirm it appears in the media library.
3. Split the clip near one second. Move the second part to create a visible gap; trim an edge. Preview the changes. Undo the operations and redo them, checking the clip positions and lengths.
4. Open Captions → Files and import the WebVTT sample at the start of the timeline. The two imported text clips should be editable; the text already baked into the video remains part of its picture. Change an imported caption's text/appearance, then check undo/redo. Save the project.
5. Close and reopen the project. Confirm media, clip positions, trims, imported text and appearance remain as saved. Repeat one edit after reopening.
6. Export to a fresh filename. Check the output in a separate player, including picture, caption placement, sound and duration. For the smaller-output check, create a separate 1080×1920 project, add the sample and export at 720×1280. Verify the decoded output dimensions and confirm the saved editing frame remains 1080×1920.
7. Export again using the same filename. The existing file must stay intact and the app must report the collision. Start a fresh export and cancel it, then start another: progress/results from the cancelled job must not replace the new job's state. If the tiny export finishes before cancellation, repeat with a longer test sequence and report cancellation as unverified until exercised.
8. Using a disposable copy, close the project, move the sample media to another folder, then reopen it. Recover the missing file from the new folder; check playback and save/reopen. Verify dismissing recovery leaves media paths unchanged. Also try a folder with two exact copies of the filename: it must not silently pick one.
9. On a separate clean target machine, repeat installation and the main path using short footage you can share, landscape and portrait media, and separate audio. Follow with a longer editing session. Report exact passed/failed steps and the files/formats used.

Submit failures through the repository's beta bug form. Include the first failed step, expected/actual result and reproducible media if shareable. A passed tiny fixture does not satisfy the independent-machine or longer-session gates in [beta readiness](BETA-READINESS.md).

## Repeatable GUI scenario on a Mac runner

The package inspection workflow can run the committed
[55-step scenario](beta-tests/core-gui.json) against a successful Mac candidate,
without rebuilding it. Use `core_gui=true` and the candidate run ID. The Mac package shipped with beta.2
was built by [candidate run 38119080271](https://github.com/alirezap73/veycut/actions/runs/38119080271)
from source `39cc82cebf1904c1b65f860d6fe674b0ca1aacd2`; it was not rebuilt
from the newer release tag. Select an inspection workflow ref compatible with
that package. The source identity gate rejects runtime or packaging changes
since the chosen candidate; a later development ref is not interchangeable.

The command below is a **historical example for the earlier candidate
38069013402**, not an instruction to test the current public package:

```sh
gh workflow run veycut-inspect.yml --ref development/0.3.0 \
  -f candidate_run=38069013402 -f core_gui=true
```

The scenario places a file imported through the native picker onto the timeline,
splits it with undo/redo, imports editable bilingual captions, replaces the English
caption with `GUI subtitle pass`, exports WebVTT, saves/reopens, and exports video
through the visible export controls. Evidence includes project snapshots, native
action logs, screenshots, the subtitle file and independently decoded output.
Inspect `export-frame-1.4.png` for the unique replacement caption before reporting
caption rendering as passed: the fixture itself already contains baked captions.
Each check must pass; a partially completed run does not establish beta readiness.

## Save and recovery checks for the recorded build

Use disposable copies of the sample project for these failure checks. An older
installer is not evidence for fixes in newer development source; record the
package's source revision as well as its fixed version number. The current Mac
package has runner evidence for save failure, active cancellation and original-file
restoration after missing/corrupt-source errors. Relocation/relink-picker and
independent user-session checks remain separate.

- While an export is running, use the Export shortcut again. Progress and Cancel
  must remain available, and cancellation must still stop that job.
- Edit a caption and immediately open another project, then reopen the first.
  The edit must have been saved. Reopening the same folder must keep its live
  edits. Switching after a save failure must retain the current project.
- In a disposable project, keep a backup of its manifest, move the manifest out
  of the way and place an empty directory at the same manifest path. Save or
  Close must report a failure. Titlebar, system and menu window-close actions
  must keep the window and unsaved edit visible. Restore the original manifest
  after removing only that empty test directory, then retry Save and reopen.
- Clear clip selection before opening Captions → Create to enter script mode.
  Enter `سلام؟ خوبی؟ Ready?` and check three editable captions, undo/redo and
  save/reopen. Separately leave a script draft open, then successfully switch
  or close the project: the old draft must not appear in the next project.
- Test transcription-worker cancellation separately using longer spoken audio
  and an already installed transcription model. Start transcription, confirm it
  is still running, then successfully switch or close the project. No stale
  busy state, old dialog or old result may appear in the next project. If these
  prerequisites are absent or the job finishes first, record worker-boundary
  cancellation as unverified; a script-dialog check does not cover it.
- For a missing-media project, try recovery from a folder containing a zero-byte
  file with the exact expected name. Recovery must report failure and leave every
  project media path unchanged. Repeat with a valid replacement and check playback.

Server tests cover save ordering and publication failures, container-probe
rejection and export cancellation/retry. The user-driven checks above remain
separate; container probing does not guarantee that every frame of any recording
is decodable.

## آزمون دستی بتا

نمونهٔ بالا فقط دو ثانیه است، روی سرور ساخته و کامل بازخوانی شده است؛ ویدیوی دوربین یا آزمون پروژهٔ طولانی نیست. روی یک مک مناسب، ورود از پنجرهٔ فایل، برش و جابه‌جایی، پخش صدا، زیرنویس، ذخیره و بازکردن و خروجی را طبق مراحل بالا بررسی کنید. در اولین خطا، شمارهٔ مرحله و نتیجهٔ واقعی را گزارش کنید. انتشار عمومی فعلی ۰٫۳٫۱-beta.2 آزمایشی است و نسخهٔ خود برنامه ۰٫۳٫۱ باقی مانده است. شناسهٔ بسته یا کاندیدِ مورد آزمون را ثبت کنید؛ آزمون نصب مستقل و تدوین طولانی هنوز باقی است.

بررسی خطای ذخیره و فایل خراب را فقط روی کپی آزمایشی پروژه انجام دهید. در خطای ذخیره، پنجره و تغییرات باید باقی بمانند؛ تعویض موفق پروژه باید تغییرات قبلی را ذخیره و عملیات زیرنویس قبلی را لغو کند. فایل هم‌نامِ خالی نباید به‌عنوان رسانهٔ بازیابی‌شده پذیرفته شود. شمارهٔ ثابت نسخه به‌تنهایی کافی نیست؛ شناسهٔ سورسِ بستهٔ آزمایش‌شده را هم ثبت کنید.
