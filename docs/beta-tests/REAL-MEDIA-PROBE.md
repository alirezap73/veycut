# Official full-movie import pilot

Run VeyCut Mac package inspection with a successful compatible candidate_run,
real_media_probe=true, other committed GUI scenarios disabled, and gui_actions=[].
The existing package-source compatibility gate still applies.

The runner downloads the official 640×360 Big Buck Bunny archive (121,284,117 bytes),
extracts its full movie into a temporary MP4 path, independently checks metadata and
decodes every video/audio frame. The import copy must have the same observed SHA-256.
No movie is downloaded or rendered on the developer laptop.

The packaged app imports that full movie through the native picker, saves the project,
closes and reopens it. Checks require 570–660 seconds, 640×360, audio, the expected
absolute path, and preservation of the original seeded clip. A Media-tab screenshot
is collected without placing the movie on the timeline. REAL-MEDIA-SOURCE.json,
REAL-MEDIA-UI.json, PROJECT-UI-TEST.json and screenshots form the evidence.
Archive and movie files are removed before evidence upload.

This pilot does not verify movie seeking, trimming, subtitles, export, user footage,
high-resolution editing, or installation on a clean consumer Mac. Separate
screen-confirmed scenarios are required after this pilot passes.

Big Buck Bunny — © 2008 Blender Foundation / www.bigbuckbunny.org.
Film and original audio use [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/).
See the [official attribution and licence](https://peach.blender.org/about/).
Observed runner hashes record downloaded bytes; they are not a preexisting trusted digest.
