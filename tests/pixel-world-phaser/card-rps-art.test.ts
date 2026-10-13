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

test('경기 화면 HD 그림(hd/)은 규격·칸·배치 정보 조건을 만족한다', () => {
  const result = spawnSync('python', ['-I', '-c', `
import json
from pathlib import Path
from PIL import Image
hd=Path.cwd()/'src/features/pixel-world-phaser/assets/cardRps/hd'
room=Image.open(hd/'room.webp'); assert room.size==(1600,1000),room.size
def frames(name,size,cell):
 im=Image.open(hd/name); assert im.mode=='RGBA',(name,im.mode); assert im.size==size,(name,im.size)
 out=[]
 for y in range(0,size[1],cell[1]):
  for x in range(0,size[0],cell[0]):
   f=im.crop((x,y,x+cell[0],y+cell[1])); assert f.getchannel('A').getbbox(),(name,x,y); out.append(f)
 assert len({f.tobytes() for f in out})==len(out),(name,'duplicate frames')
 return out
cards=frames('cards.png',(768,512),(192,256))
# 8장 모두 같은 외곽 크기로 칸을 채운다(뒷면 포함).
boxes={f.getchannel('A').getbbox() for f in cards}
assert len(boxes)==1,boxes
l,t,r,b=boxes.pop(); assert r-l>=176 and b-t>=240,(l,t,r,b)
cheese=frames('cheese.png',(1920,384),(384,384))
# 치즈는 다섯 포즈 모두 아래 끝이 칸 바닥(탁자 가장자리)에 닿는다.
for f in cheese: assert f.getchannel('A').point(lambda v:255 if v>128 else 0).getbbox()[3]==384
frames('fx.png',(512,256),(256,256))
layout=json.loads((hd/'layout.json').read_text(encoding='utf-8'))
assert len(layout['tableTop'])==4
assert layout['rows']['opponent']<layout['rows']['clash']<layout['rows']['mine']<1000
assert layout['cardHeight']['opponent']<layout['cardHeight']['clash']<layout['cardHeight']['mine']
assert 0<layout['opponentSeat']['bottomY']-layout['opponentScale']
total=sum(p.stat().st_size for p in hd.iterdir()); assert total<2_000_000,total
print(json.dumps(sorted(p.name for p in hd.iterdir())))
`], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(result.stdout), ['cards.png', 'cheese.png', 'fx.png', 'layout.json', 'room.webp']);
});
