"""Small deterministic fixture shared by both actual exporters; GitHub only."""
import json
from pathlib import Path

root = Path('output/native-parity')
root.mkdir(parents=True, exist_ok=True)
effects = {
    'exposure': {'stops': 0.6}, 'contrast': {'amount': 35},
    'saturation': {'amount': -45}, 'warm': {'temperature': 4600},
    'cool': {'temperature': 8500}, 'vibrance': {'amount': .7},
    'posterize': {'levels': 4}, 'pixelate': {'size': 16},
    'sharpen': {'amount': 1}, 'gaussian-blur': {'radius': 5},
    'chroma-key': {'color': 11616511, 'similarity': 30, 'softness': 10, 'spill': 50},
    'mono': {'colour': 40, 'contrast': 40, 'grain': 0}, 'vignette': {'strength': 50},
}
cases = [{'name': 'identity', 'effects': [], 'text': None}]
for name, params in effects.items():
    cases.append({'name': name, 'effects': [{'id': 'concat.' + name, 'params': params, 'enabled': True}], 'text': None})
for name, content, align, width in [
    ('english', 'VeyCut 2026', 'center', 0),
    ('persian', 'سلام جهان؛ ویرایش ویدیو', 'center', 0),
    ('mixed', 'VeyCut 2026 — سلام دنیا', 'center', .86),
    ('multiline', 'English line\nمتن فارسی', 'center', .7),
    ('left-box', 'English wrapped text with a fixed width', 'left', .55),
    ('right-box', 'متن فارسی با عرض ثابت برای چند خط', 'right', .55),
]:
    style = dict(content=content, fontFamily='Vazirmatn', fontSize=.09,
                 fontWeight=600, italic=False, color='#ffffff', align=align,
                 opacity=1, strokeWidth=0, strokeColor='#000000', shadow=False,
                 background='#152b46', backgroundRadius=.012,
                 backgroundPaddingX=.018, backgroundPaddingY=.012,
                 lineHeight=1.2, tracking=0, maxWidth=width, maxHeight=0)
    cases.append({'name': 'text-' + name, 'effects': [], 'text': style})
# Broaden comparison beyond opaque single layers: every native blend at
# two partial opacities over the same source, transformed/exposed independently.
for blend in ['normal', 'multiply', 'screen', 'add', 'lighten', 'darken']:
    for opacity in [.25, .75]:
        cases.append(dict(name=f'blend-{blend}-{int(opacity*100)}', effects=[], text=None,
                          overlay=dict(blend=blend, opacity=opacity, scale=.7,
                                       offsetX=.08, offsetY=-.05,
                                       videoEffects=[dict(id='concat.exposure',params=dict(stops=-.7),enabled=True)])))
# Existing six layouts did not cover these style fields.
base = next(case['text'] for case in cases if case['name']=='text-mixed')
for name, patch in [
    ('shadow', dict(shadow=True, background='')),
    ('outline', dict(strokeWidth=.006, strokeColor='#101030', background='')),
    ('opacity', dict(opacity=.5, background='#152b4680')),
    ('light-weight', dict(fontWeight=400)),
    ('heavy-weight', dict(fontWeight=800)),
    ('italic', dict(italic=True)),
]:
    cases.append(dict(name='text-'+name, effects=[], text={**base, **patch}))
(root / 'cases.json').write_text(json.dumps(cases, ensure_ascii=False, indent=2))
