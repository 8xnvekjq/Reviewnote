import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Decode the actual shipped PNGs with Pillow, including every animation cell.
test('bug sheets have exact dimensions, distinct non-empty frames and binary alpha', () => {
  const result = spawnSync('python', ['-I', '-c', `
import json
from pathlib import Path
from PIL import Image
root = Path.cwd() / 'src/features/pixel-world-phaser/assets/bugs'
specs = [('dragonflies.png', (64, 80), 16), ('net-swing.png', (128, 32), 32), ('net-icon.png', (16, 16), 16)]
results = []
for name, size, cell in specs:
    im = Image.open(root / name)
    assert im.mode == 'RGBA', (name, im.mode)
    assert im.size == size, (name, im.size)
    assert set(im.getchannel('A').getdata()) == {0, 255}, name
    rows = []
    for y in range(0, size[1], cell):
        frames = []
        for x in range(0, size[0], cell):
            frame = im.crop((x, y, x + cell, y + cell))
            assert frame.getchannel('A').getbbox() is not None, (name, x, y)
            frames.append(frame.tobytes())
        assert len(set(frames)) == len(frames), (name, y, 'duplicate poses')
        rows.append(b''.join(frames))
    assert len(set(rows)) == len(rows), (name, 'duplicate species')
    results.append(name)
print(json.dumps(results))
`], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(result.stdout), ['dragonflies.png', 'net-swing.png', 'net-icon.png']);
});
