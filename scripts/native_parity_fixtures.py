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
(root / 'cases.json').write_text(json.dumps(cases, ensure_ascii=False, indent=2))
