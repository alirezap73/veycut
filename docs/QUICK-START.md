# VeyCut quick start

[0.3.1-beta.3](https://github.com/alirezap73/veycut/releases/tag/v0.3.1-beta.3) contains the Apple silicon Mac app. The Mac download and [hosted Web editor](https://alirezap73.github.io/veycut/) are experimental and distributed separately; app version is 0.3.1. Check the Mac release's SHA256SUMS before using its download. The [platform guide](PLATFORMS.md) explains their different capabilities.

## Mac

1. Download `VeyCut-0.3.1-macos-arm64.dmg` and copy VeyCut to Applications. The app is ad-hoc signed and not Apple-notarized; macOS may ask you to allow it in Privacy & Security at first launch.
2. Create a project with a portrait, landscape or square frame. Import a short video, place it on the timeline and save.
3. Trim clip edges or split at the playhead. Undo/Redo can restore an edit. Select several clips to copy/paste or duplicate their timing, track layout and properties together.
4. The interface uses English controls and supports Persian content. Open **Captions → Files** and import an SRT or plain-text WebVTT file. Try one [bilingual sample](caption-examples/TRY-CAPTIONS.txt).
5. In **Captions → Edit**, choose selected text or all text. Shift timing, change appearance or use literal case-sensitive find/replace. The cue list has 50 rows per page; a row selects its text clip, seeks to its start and closes the sheet. A focused row accepts Enter or Space.
6. Save and reopen the project. Keep the original media in place: project files describe edits and reference source files.
7. Open **Export**, choose resolution, frame rate and an available codec, then select a new output filename. Output size can differ from the editing frame. Existing output files are preserved. Cancel stops that export and removes its own temporary work files.

Packaged tests covered cue navigation, grouped edits and short exports. A local Mac edit/export test used a two-second sample. Use a copy of valuable media for beta testing.

### Missing or moved Mac media

If a source is missing or corrupt, export shows an error. Restoring the original bytes at the original path was verified to allow retry without changing the saved project.

The Mac UI also provides **Relink All** when opening a project with missing media. Choose a folder containing the original files. This separate picker flow remains unverified in packaged GUI testing. Only unique exact filenames are linked; duplicate names remain offline. Symlinks are skipped. Incomplete or unreadable searches make no edits. Select a smaller folder and retry. Dismiss cancels the search; switching projects invalidates its result.

## Web

1. [Open the current Web editor](https://alirezap73.github.io/veycut/). For offline hosting, [download `VeyCut-web.zip`](https://alirezap73.github.io/veycut/downloads/VeyCut-web.zip) and extract it.
2. Serve its `veycut-web` folder over HTTP. For example, if Python 3 is installed, run this **inside that folder**:

   ```sh
   python3 -m http.server 8080 --bind 127.0.0.1
   ```

   Open `http://127.0.0.1:8080` in Chrome/Chromium. Direct file opening does not reliably load the WebAssembly engine. The [hosted editor](https://alirezap73.github.io/veycut/) can be used without a local server.
3. Import a browser-decodable local video, select a clip, and set source in/out points or split. Preview composes supported layers on mixed tracks.
4. Import a UTF-8 SRT file, choose a cue and edit its text. Web controls are English-only; Persian subtitle content and right-to-left text entry remain supported. Caption times stay fixed when video clips change.
5. Save project JSON. After reopening, reconnect the original media files using their filename and size. Media bytes are not embedded. Supported desktop JSON manifests can also be imported with preservation checks. Save desktop JSON is a manifest backup with original paths, not a complete media/font folder bundle; browser-added paths are refused. Native imports initially list all text clips as captions, while Web saves retain explicit caption roles for each timeline.
6. Use the timeline selector to create or switch separate cuts. Each timeline keeps its caption roles and frame/rate settings. Frame buttons and stereo meters support preview navigation and audio monitoring. Reconnect every source, choose an output size and export WebM or an available H.264 MP4 profile. AAC is preferred; an Opus profile may need a compatible player. Keep the tab visible. Export records in real time using your device, checks the result before download and stops on timing stalls. Cancel produces no video download.

Web export includes source audio and burned subtitles. Limits are **600 seconds**, **1920-pixel long edge**, requested **24/25/30/60 fps**, **16 simultaneous media sources**, and **256 MiB**. Chromium was checked with short generated media, a five-minute synthetic source with audio and a late Persian caption, and a six-minute H.264/Opus MP4 from a long 1080p film. Safari/Firefox, AAC recording, other camera codecs, high-resolution/many-layer stress and frame-accurate offline output are unverified. See [Web implementation and limits](../web/README.md).

## Report a problem

Use the [issue form](https://github.com/alirezap73/veycut/issues/new/choose). Include release/build, operating system, browser for Web, first failed step and exact error. Attach reviewed screenshots/logs or a small sample you can share. Keep private media out of public reports.

## فارسی

انتشار عمومی **۰٫۳٫۱-beta.3** شامل نسخهٔ مک Apple silicon است. نسخهٔ وب جداگانه از [سایت وی‌کات](https://alirezap73.github.io/veycut/) در دسترس است. شمارهٔ برنامه **۰٫۳٫۱** باقی مانده است. دانلود مک و SHA256SUMS در [صفحهٔ انتشار](https://github.com/alirezap73/veycut/releases/tag/v0.3.1-beta.3) هستند.

**مک:** فایل DMG را باز کنید و VeyCut را به Applications ببرید. برنامه امضای ad-hoc دارد و Apple notarization ندارد؛ هنگام اجرای نخست ممکن است لازم باشد در Privacy & Security اجازهٔ بازشدن بدهید. پروژه بسازید، ویدیویی کوتاه وارد کنید و روی تایم‌لاین بگذارید. برش و جابه‌جایی را امتحان کنید و ذخیره کنید. رابط انگلیسی است و از متن و زیرنویس فارسی پشتیبانی می‌کند. از Captions → Files یکی از نمونه‌های زیرنویس را وارد کنید. در Edit زمان‌بندی، ظاهر و متن را تغییر دهید؛ فهرست زیرنویس صفحه‌های ۵۰ ردیفی دارد. پروژه را بازگشایی و با نامی تازه خروجی بگیرید.

برای فایل گمشده یا خراب، بازگرداندن فایل اصلی به مسیر قبلی و خروجی مجدد در آزمون بسته موفق بود. انتخاب پوشه با Relink All مسیر جداگانه‌ای است و هنوز در آزمون رابطِ بسته بررسی نشده است.

**وب:** [نسخهٔ آنلاین](https://alirezap73.github.io/veycut/) را باز کنید؛ یا [ZIP وب](https://alirezap73.github.io/veycut/downloads/VeyCut-web.zip) را استخراج و پوشهٔ آن را با سرور محلی HTTP اجرا کنید؛ دستور بالا در همان پوشه اجرا می‌شود. سپس آدرس محلی را در Chrome باز کنید. فایل ویدئو و SRT را وارد و ویرایش کنید. پروژهٔ JSON رسانه را در خود ذخیره نمی‌کند؛ پس از بازگشایی باید فایل‌های اصلی را دوباره متصل کنید. خروجی WebM با صدا و زیرنویس روی دستگاه شما ضبط می‌شود. تب را باز و قابل‌مشاهده نگه دارید. سقف خروجی ۳۰۰ ثانیه، ضلع بلند ۱۹۲۰ پیکسل، ۱۶ رسانهٔ هم‌زمان و حجم ۲۵۶ مگابایت است.

امکانات و قالب پروژهٔ مک و وب یکسان نیستند. گزارش اشکال را با مراحل، نسخه و پیام خطا در [Issues](https://github.com/alirezap73/veycut/issues) بنویسید.
