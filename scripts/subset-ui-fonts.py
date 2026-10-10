"""Rebuild the free Source Han subsets. Requires fonttools[woff] (4.51.0 used).

python scripts/subset-ui-fonts.py --source-dir <download-cache>
Missing originals are downloaded from sources.json and SHA-256 checked.
Normal game builds use the committed WOFF2 files and need no Python/network.
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import urlretrieve
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-dir', type=Path, required=True)
args = parser.parse_args()
args.source_dir.mkdir(parents=True, exist_ok=True)
directory = root / 'src/ui/fonts'
manifest = directory / 'sources.json'
records = json.loads(manifest.read_text(encoding='utf-8'))
# Include generated names, data, descriptions and punctuation, not just the mock.
text = ''.join(p.read_text(encoding='utf-8') for p in (root / 'src').rglob('*')
               if p.suffix in {'.ts', '.tsx'} and 'testing' not in p.parts and '.test.' not in p.name)
characters = set(text) | {chr(c) for c in range(32, 127)}
coverage = None
for record in records:
    original = args.source_dir / record['sourceFile']
    if not original.exists():
        urlretrieve(record['download'], original)
    if hashlib.sha256(original.read_bytes()).hexdigest() != record['sourceSha256']:
        raise ValueError(f'Upstream file changed: {original}; review the new release first.')
    font = TTFont(original, recalcTimestamp=False)
    supported = characters & {chr(c) for c in font.getBestCmap()}
    missing = {c for c in characters - supported if '\u3400' <= c <= '\u9fff'}
    if missing:
        raise ValueError(f'Missing CJK glyphs: {sorted(missing)}')
    coverage = supported if coverage is None else coverage & supported
    options = subset.Options()
    options.name_IDs = ['*']  # Preserve upstream copyright and OFL metadata.
    options.name_legacy = True
    options.name_languages = ['*']
    sub = subset.Subsetter(options=options)
    sub.populate(text=''.join(sorted(supported)))
    sub.subset(font)
    family = 'Blackmoss ' + record['family']
    weight = record['weight']
    full = family + ' ' + weight
    psname = family.replace(' ', '') + '-' + weight
    names = {1: family, 2: weight, 3: full + ' UI subset', 4: full, 6: psname, 16: family, 17: weight}
    for name in font['name'].names:
        if name.nameID in names:
            name.string = names[name.nameID].encode(name.getEncoding())
    if 'CFF ' in font:
        cff = font['CFF '].cff
        cff.fontNames = [psname]
        cff.topDictIndex[0].FullName = full
        cff.topDictIndex[0].FamilyName = family
    font.flavor = 'woff2'
    dest = directory / (record['output'] + '.woff2')
    font.save(dest)
    record['sha256'] = hashlib.sha256(dest.read_bytes()).hexdigest()
    record['bytes'] = dest.stat().st_size
    print(f'{dest.name}: {record["bytes"]:,} bytes, {len(supported)} glyphs')
(directory / 'characters.txt').write_text(''.join(sorted(coverage)) + '\n', encoding='utf-8')
manifest.write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
