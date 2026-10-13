"""Preserve the pinned encoder's actual FFmpeg PTS, including priming packets.

The worker already returns p.pts. Upstream main-thread code relabels packets
starting at zero, losing AAC encoder delay. No per-platform delay is guessed.
"""
import json,re
from pathlib import Path
bundle=Path('web/vendor/mediabunny-aac-encoder.min.mjs')
text=bundle.read_text()
pattern=r'this\.nextPacketTimestampInSamples/this\.sampleRate,(\w+)\.duration/this\.sampleRate'
changed,count=re.subn(pattern,lambda m:f'{m.group(1)}.pts/this.sampleRate,{m.group(1)}.duration/this.sampleRate',text)
assert count==1,'Pinned AAC packet timestamp expression changed; review source before patching'
bundle.write_text(changed)
preferred=Path('web/vendor/aac-source/encoder.ts');text=preferred.read_text();needle='this.nextPacketTimestampInSamples / this.sampleRate,';assert text.count(needle)==1
preferred.write_text(text.replace(needle,'p.pts / this.sampleRate,'))
(Path('web/vendor/aac-source')/'SOURCE.txt').write_text('Mediabunny AAC encoder 1.61.4, immutable source d901f02d5fdd33d7a7488bd8b9393f76a98b2eb1. VeyCut changes encoder.ts packet timestamp to the existing worker-provided p.pts, preserving AAC priming. Worker/C/WASM are unchanged. Original preferred source and build repository: https://github.com/Vanilagy/mediabunny/tree/d901f02d5fdd33d7a7488bd8b9393f76a98b2eb1/packages/aac-encoder . Bundle patch implementation: scripts/patch_aac_pts.py in VeyCut source. MPL-2.0; original notices retained.\n')
print(json.dumps({'aacPTS':'worker-provided','bundleEdits':count,'source':'d901f02d5fdd33d7a7488bd8b9393f76a98b2eb1'}))
