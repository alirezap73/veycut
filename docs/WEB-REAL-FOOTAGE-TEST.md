# Real-footage browser export check

Run the `VeyCut Web` workflow with `real_export=true` and `real_seconds=360` or `600`. Downloading, browser recording and complete decoding run on GitHub. This test does not launch a browser or decode footage on the developer's laptop.

The source is **Tears of Steel**, Blender Foundation / Mango Open Movie Project, licensed under [Creative Commons Attribution 3.0](https://mango.blender.org/about/). It contains live-action footage, CGI, scene changes, dialogue and music. The [original download page](https://mango.blender.org/download/) lists the [Xiph mirror](https://media.xiph.org/tearsofsteel/). The test downloads `tears_of_steel_1080p.webm` from that mirror. The source is not distributed in the application or retained in the test artifact; the decoder report records its SHA-256. The exported excerpt is a test artifact credited in its accompanying report.

The workflow imports the full source, trims source seconds 30–390 or 30–630 to a six- or ten-minute timeline, adds a late Persian subtitle, saves/reopens/reconnects the project, and records 640×360 H.264 MP4 at requested 24 fps. It also exercises a separate short MP4 recording. AAC is preferred when supported; an explicit Opus fallback is checked against the actual encoded stream. Opus MP4 is not a universal substitute for AAC MP4.

Before download, browser readback checks dimensions, duration and decoded beginning/middle/end frames. Server checks then decode every video/audio packet, examine timestamp coverage and gaps, compare five picture checkpoints against the original, and correlate audio envelopes across the excerpt. Saved projects before and after export must match. Failures stop publication.

These checks cover one film and one server browser. They do not establish support for every camera codec, variable frame rate, HDR, Safari/Firefox or offline frame-exact export. The previous six-minute result remains recorded separately. [Ten-minute validation](evidence/web-ten-minute-mp4.json) passed, including full decoding, audio correspondence, picture checkpoints and project preservation.

## Fixed-frame and unchanged-input checks

Set `frame_export=true` along with `real_export=true` and `real_seconds=600` to test the separate fixed-frame H.264/AAC renderer. The long source's picture stream is copied, while input audio is converted to Opus on GitHub for decoder compatibility. This distinguishes long-duration output proof from support for the original source audio codec. The verifier requires exactly 14,400 video frames, timestamps within two microseconds of `index / 24`, complete decoding, corresponding picture/audio and preserved edits.

The ordinary browser suite separately downloads the unchanged [W3C Sintel MP4](https://media.w3.org/2010/05/sintel/trailer.mp4), verifies H.264/AAC input and renders four seconds with H.264/AAC output. There is no input transcoding in that check. Attribution: © copyright Blender Foundation | durian.blender.org, [CC BY 3.0](https://durian.blender.org/sharing/). Reports record the downloaded source hash; the raw input is removed before artifact retention. This short animated sample does not establish support for all cameras or long-duration AAC inputs. Audio-filter checks also compare bass, telephone and echo output in both modes, including an echo crossing a one-second audio window boundary.
