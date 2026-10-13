import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('카드 가위바위보 그림은 규격, 프레임, 투명 배경 조건을 만족한다', () => {
  const result = spawnSync('python', ['-I', '-c', `
import json
from pathlib import Path
from PIL import Image
root=Path.cwd()/'src/features/pixel-world-phaser/assets/cardRps'
specs={'cards.png':((128,88),(32,44)),'table.png':((320,200),None),'glow.png':((32,40),None),'clash.png':((128,32),(32,32)),'faces.png':((72,16),(24,16)),'duel-bubble.png':((48,16),(16,16)),'mouse-dealer.png':((128,160),(32,40)),'card-table-prop.png':((64,64),None),'rule-sign.png':((32,48),None)}
for name,(size,cell) in specs.items():
 im=Image.open(root/name); assert im.mode=='RGBA',(name,im.mode); assert im.size==size,(name,im.size)
 assert set(im.getchannel('A').getdata()) <= {0,255},name
 if name!='table.png': assert 0 in im.getchannel('A').getdata(),name
 if cell:
  frames=[]
  for y in range(0,size[1],cell[1]):
   for x in range(0,size[0],cell[0]):
    frame=im.crop((x,y,x+cell[0],y+cell[1])); assert frame.getchannel('A').getbbox(),(name,x,y); frames.append(frame.tobytes())
  assert len(set(frames))==len(frames),(name,'duplicate frames')
for name in ['rules-1.webp','rules-2.webp']:
 im=Image.open(root/name); assert max(im.size)<=1400,(name,im.size); assert (root/name).stat().st_size<400_000,(name,(root/name).stat().st_size)
print(json.dumps(sorted(specs)))
`], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).length, 9);
});
