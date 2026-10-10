# VeyCut quick start

The public 0.2.0 preview has an Apple silicon macOS DMG. Version 0.3.0 source adds the export and media recovery improvements below; its installer is pending validation. Use the release linked from the repository README, rather than another project's download page.

1. Download the macos-arm64 DMG from the VeyCut release and copy VeyCut into Applications. This experimental app is ad-hoc signed and not Apple-notarized. macOS may require explicit approval to open it.
2. Open VeyCut and create a project. Choose a portrait, landscape or square frame and name the project.
3. Import your own short video and audio files. Place clips on the timeline, trim their edges and preview the sequence. Save before trying a larger edit.
4. Choose Settings → Language for English or Persian. For subtitles, use Captions → Files and the [bilingual sample](caption-examples/TRY-CAPTIONS.txt).
5. Open Export. In 0.3.0, choose a resolution independently of the editing frame, a frame rate and an available codec. The image keeps its aspect ratio. A smaller export does not change the saved project.
6. Choose an output folder and a new filename. Existing output files are preserved: rename the export or choose another folder. Cancellation stops that export and removes only its own temporary work files; completed output files are kept.

## Moved or missing media in 0.3.0

When a project opens with missing media, choose Relink All and select a folder containing the original files. The search runs in the background. Dismiss cancels it; opening another project invalidates the previous result. A successful batch can be undone through the editor.

Only unique, exact filenames are linked automatically. If two copies have the same filename, select a narrower folder containing the intended copy. Symlink files and directories are not followed. Searches stop at 100,000 entries or 64 directory levels, or when a directory cannot be read. An incomplete search makes no edits; select a smaller, readable folder and try again. A blocked filesystem call cannot itself be interrupted.

## Reporting a problem

Open an [issue](https://github.com/alirezap73/veycut/issues) with the VeyCut version, macOS version, steps and actual result. Attach a small sample you can share if the issue concerns one format. Do not attach private media or unreviewed logs.

# شروع سریع وی‌کات

نسخهٔ عمومی ۰٫۲ برای مک با تراشهٔ Apple silicon فایل DMG دارد. سورس ۰٫۳ بهبودهای خروجی و بازیابی رسانهٔ بالا را اضافه می‌کند؛ فایل نصبی آن هنوز در حال اعتبارسنجی است. لینک معتبر دانلود در README همین مخزن قرار دارد.

۱. فایل macos-arm64 DMG را دانلود کنید و VeyCut را به Applications ببرید. نسخه آزمایشی است و تأیید Apple notarization ندارد؛ ممکن است macOS برای بازکردن آن تأیید شما را بخواهد.

۲. پروژه‌ای با قاب عمودی، افقی یا مربع بسازید. یک ویدیوی کوتاه خودتان را وارد کنید، روی تایم‌لاین قرار دهید، ابتدا و انتهای کلیپ را کوتاه کنید و پیش‌نمایش بگیرید. پروژه را ذخیره کنید.

۳. زبان فارسی یا انگلیسی را از Settings → Language انتخاب کنید. زیرنویس را از Captions → Files وارد کنید؛ [نمونهٔ دوزبانه](caption-examples/TRY-CAPTIONS.txt) آماده است.

۴. در خروجی نسخهٔ ۰٫۳، اندازهٔ خروجی را مستقل از اندازهٔ پروژه انتخاب کنید. نسبت تصویر حفظ می‌شود. نامی تازه برای خروجی بگذارید؛ فایل‌های موجود جایگزین نمی‌شوند.

۵. اگر رسانه‌ها جابه‌جا شده‌اند، Relink All را بزنید و پوشهٔ فایل‌های اصلی را انتخاب کنید. جست‌وجو در پس‌زمینه انجام می‌شود و Dismiss آن را لغو می‌کند. فایل‌های هم‌نام خودکار انتخاب نمی‌شوند؛ پوشه‌ای کوچک‌تر انتخاب کنید که فقط نسخهٔ موردنظر در آن باشد. جست‌وجوی ناقص هیچ مسیری را تغییر نمی‌دهد.

برای گزارش اشکال، نسخهٔ برنامه و macOS، مراحل و نتیجهٔ واقعی را در [Issues](https://github.com/alirezap73/veycut/issues) بنویسید. رسانهٔ خصوصی را ضمیمه نکنید.
