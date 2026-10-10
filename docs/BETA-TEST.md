# VeyCut core beta check

Use a suitable Apple silicon Mac with the candidate being checked. This is a manual test of the packaged editor, distinct from the successful engine and form tests. If a step fails, stop and report the first failure; do not mark later steps as passed. The development candidate remains unpublished and the public preview is still 0.2.0-preview.1.

The [portrait sample](beta-samples/portrait-2s.mp4) is a two-second, 720×1280, 30 fps generated video with baked bilingual captions. It is silent for its first second and contains a synthetic stereo tone in the second. The [WebVTT sample](beta-samples/captions-2s.vtt) contains the same two timed captions. [Provenance and checksums](beta-samples/PROVENANCE.json) identify the native test that created and fully decoded the file. This small fixture is not evidence of support for long camera recordings or every format.

1. Copy the app to Applications and open it. Record the actual build version, macOS version and chip. Confirm a visible editor window and note any startup error.
2. Create a portrait 720×1280/30 fps project in a writable folder. Import the portrait sample through the native file picker, place it on the timeline, and play through both captions. Confirm the tone in its second second. In a separate project, also import it by drag/drop and confirm it appears in the media library.
3. Split the clip near one second. Move the second part to create a visible gap; trim an edge. Preview the changes. Undo the operations and redo them, checking the clip positions and lengths.
4. Open Captions → Files and import the WebVTT sample at the start of the timeline. The two imported text clips should be editable; the text already baked into the video remains part of its picture. Change an imported caption's text/appearance, then check undo/redo. Save the project.
5. Close and reopen the project. Confirm media, clip positions, trims, imported text and appearance remain as saved. Repeat one edit after reopening.
6. Export to a fresh filename. Check the output in a separate player, including picture, caption placement, sound and duration. In the development candidate, also choose a smaller output size and verify the saved editing frame remains 720×1280.
7. Export again using the same filename. The existing file must stay intact and the app must report the collision. In the development candidate, start a fresh export and cancel it, then start another: progress/results from the cancelled job must not replace the new job's state. If the tiny export finishes before cancellation, repeat with a longer test sequence and report cancellation as unverified until exercised.
8. In the development candidate, close the project, move the sample media to another folder, then reopen it. Recover the missing file from the new folder; check playback and save/reopen. Verify dismissing recovery leaves media paths unchanged. Also try a folder with two exact copies of the filename: it must not silently pick one.
9. On a separate clean target machine, repeat installation and the main path using short footage you can share, landscape and portrait media, and separate audio. Follow with a longer editing session. Report exact passed/failed steps and the files/formats used.

Submit failures through the repository's beta bug form. Include the first failed step, expected/actual result and reproducible media if shareable. A passed tiny fixture does not satisfy the independent-machine or longer-session gates in [beta readiness](BETA-READINESS.md).

## آزمون دستی بتا

نمونهٔ بالا فقط دو ثانیه است، روی سرور ساخته و کامل بازخوانی شده است؛ ویدیوی دوربین یا آزمون پروژهٔ طولانی نیست. روی یک مک مناسب، ورود از پنجرهٔ فایل، برش و جابه‌جایی، پخش صدا، زیرنویس، ذخیره و بازکردن و خروجی را طبق مراحل بالا بررسی کنید. در اولین خطا، شمارهٔ مرحله و نتیجهٔ واقعی را گزارش کنید. تغییرات شمارهٔ نسخه متوقف است و کاندید توسعه هنوز انتشار عمومی جدید محسوب نمی‌شود.
