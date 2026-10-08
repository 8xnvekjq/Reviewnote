import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';
import assert from 'node:assert/strict';

// 픽셀 맵: . = 투명, O = 외곽선. 모든 원본과 미리보기는 정수 픽셀만 사용한다.
const root = fileURLToPath(new URL('../', import.meta.url));
const out = `${root}src/features/pixel-world-phaser/assets/fishing/`;
const palette = {
  O: '#493c36', W: '#fff1d2', A: '#bddbe0', B: '#779faa', C: '#527c89',
  G: '#8cab62', H: '#bdcc85', J: '#557c4c', K: '#d3a46b', L: '#a47451',
  R: '#d36e5d', P: '#edaa8e', Y: '#edcd75', V: '#a98bb6', U: '#719fc8',
  T: '#305569', E: '#406f80', F: '#558c98', I: '#75adb5', N: '#e0c395',
};
const rgba = hex => [...hex.slice(1).match(/../g).map(v => parseInt(v, 16)), 255];
const colors = Object.fromEntries(Object.entries(palette).map(([k,v]) => [k,rgba(v)]));
function canvas(w,h) { return { w,h, data: Buffer.alloc(w*h*4) }; }
function pixel(c,x,y,color) {
  assert(x >= 0 && y >= 0 && x < c.w && y < c.h, `pixel outside ${c.w}x${c.h}: ${x},${y}`);
  c.data.set(color, (y*c.w+x)*4);
}
function map(c, rows, x=0,y=0, overrides={}) {
  rows = typeof rows === 'string' ? rows.trim().split('\n').map(r=>r.trim()) : rows;
  rows.forEach((r,dy)=>[...r].forEach((key,dx)=> {
    if(key !== '.') { const color=overrides[key] || colors[key]; assert(color,`unknown pixel ${key}`); pixel(c,x+dx,y+dy,color); }
  }));
}
function blit(dst,src,x,y,scale=1, checker=false) {
  for(let sy=0;sy<src.h;sy++) for(let sx=0;sx<src.w;sx++) {
    let color = [...src.data.subarray((sy*src.w+sx)*4,(sy*src.w+sx)*4+4)];
    if(checker && !color[3]) color=rgba((Math.floor(sx/4)+Math.floor(sy/4))%2 ? '#ded6c7' : '#f3ebdc');
    if(!color[3]) continue;
    for(let dy=0;dy<scale;dy++) for(let dx=0;dx<scale;dx++) pixel(dst,x+sx*scale+dx,y+sy*scale+dy,color);
  }
}
function crc32(buf) {
  let crc=0xffffffff;
  for(const v of buf) { crc^=v; for(let bit=0;bit<8;bit++) crc=(crc>>>1)^((crc&1)?0xedb88320:0); }
  return (crc^0xffffffff)>>>0;
}
function chunk(type,data) {
  const name=Buffer.from(type), size=Buffer.alloc(4), crc=Buffer.alloc(4);
  size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name,data])));
  return Buffer.concat([size,name,data,crc]);
}
function png(c) {
  const header=Buffer.alloc(13); header.writeUInt32BE(c.w); header.writeUInt32BE(c.h,4); header[8]=8; header[9]=6;
  const scan=Buffer.alloc((c.w*4+1)*c.h);
  for(let y=0;y<c.h;y++) c.data.copy(scan,y*(c.w*4+1)+1,y*c.w*4,(y+1)*c.w*4);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(scan,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
const sheets=[];
function save(name,c,frames) {
  for(let i=3;i<c.data.length;i+=4) assert(c.data[i]===0 || c.data[i]===255,'binary alpha');
  frames.forEach(([x,y,w,h])=>assert(x+w<=c.w && y+h<=c.h,'frame outside sheet'));
  const bytes=png(c);
  // 인코더 출력의 크기, CRC, 압축 해제를 함께 검증한다.
  let offset=8; const idat=[];
  while(offset<bytes.length) {
    const len=bytes.readUInt32BE(offset), type=bytes.toString('ascii',offset+4,offset+8), data=bytes.subarray(offset+8,offset+8+len);
    assert.equal(crc32(bytes.subarray(offset+4,offset+8+len)),bytes.readUInt32BE(offset+8+len));
    if(type==='IDAT') idat.push(data);
    offset+=len+12;
  }
  assert.equal(inflateSync(Buffer.concat(idat)).length,(c.w*4+1)*c.h);
  writeFileSync(`${out}${name}.png`,bytes); sheets.push({name,c,frames});
}
mkdirSync(out,{recursive:true});

// 물결 세 프레임은 타일 경계에서 같은 색으로 이어진다.
const water = `
FFFFFFFFFFFFFFFF
FFFFIIFFFFFFFFFF
FFFIAAIFFFFFFFFF
FFFFFFFFFFFFFIIF
FFFFFFFFFFFFFFAF
FFFFFFFFFFFFFFFF
FFFFEFFFFFFFFFFF
FFFEEEFFFFFFFIFF
FFFFFFFFFFFFIAIF
FFFFFFFFFFFFFFFF
FFIIFFFFFFFFFFFF
FIAAIFFFFFFFFFFF
FFFFFFFFFFEEFFFF
FFFFFFFFFEEEEFFF
FFFFFFFFFFFFFFFF
FFFFFFFFFFFFFFFF`;
const river=canvas(144,16);
for(let f=0;f<3;f++) {
  const tile=canvas(16,16); map(tile,water);
  for(let y=0;y<16;y++) for(let x=0;x<16;x++) pixel(river,f*16+x,y,[...tile.data.subarray((y*16+(x+f*3)%16)*4,(y*16+(x+f*3)%16)*4+4)]);
}
const bank=`
GGHGGGGGGGHGGGGG
GGGGGGHGGGGGGGGG
HGGGGGGGGGGGGHGG
GGGGGHGGGGGGGGGG
GGGGGGGGGHGGGGGG
JJGGGGJJGGGGGJJG
LLJJJJLLJJJJJLLJ
KKLLLLKKLLLLLKKL
NNKKKKNNKKKKKNNK
CCNNNNCCNNNNNCCN
FFCCCCFFCCCCCFFC
FFFFFFFFFFFFFFFF
FFFFIIFFFFFFFFFF
FFFIAAIFFFFFFFFF
FFFFFFFFFFFFFFFF
FFFFFFFFFFFFFFFF`;
map(river,bank,48); map(river,bank.trim().split('\n').reverse(),64);
map(river,`
OOOOOOOOOOOOOOOO
OKKKKKKKKKKKKKKO
ONNNKKNNNKKNNNKO
OKKKKKKKKKKKKKKO
OLLLLLLLLLLLLLLO
OKKKKKKKKKKKKKKO
OKNNNKKKKNNNKKKO
OKKKKKKKKKKKKKKO
OLLLLLLLLLLLLLLO
OKKKKKKKKKKKKKKO
OKKKKNNNKKKKKKKO
OKKKKKKKKKKKKKKO
OLLLLLLLLLLLLLLO
OKKKKKKKKKKKKKKO
OKKKKKKKKKKKKKKO
OOOOOOOOOOOOOOOO`,80);
map(river,`
................
....OO.....OO...
....KY.....KY...
....KY..O..KY...
....OO..J..OO...
.O..JG..JG.JG...
.JG.JG..JG.JG.O.
.JG.JG.OJG.JG.J.
..JGJG.JGJ.JGJG.
..JGJG.JGJ.JGJ..
...JGJ.JGJJGJ...
...JGJJGJJGJ....
....JGJGJGJ.....
.....JJGJJ......
......JJJ.......
................`,96);
map(river,`
................
................
......OOOO......
....OOHHGGOO....
...OHHGGGGJJO...
..OHHGGGGGJJJO..
..OHGGGGGJJJJO..
..OGGGGGJJJOO...
...OGGGJOOO.....
....OJJJO..O....
.....OOO..O.....
................
................
................
................
................`,112);
map(river,`
................
................
................
......OOOO......
....OOAAABO.....
...OAAAAABBO....
..OAAAABBBBCO...
..OAABBBCCCCC O.
..OBBBBCCCCCCO..
...OCCCCCCCCO...
....OOOOOOOO....
................`.replace('CCCCC O','CCCCCO'),128);
save('river-tiles',river,Array.from({length:9},(_,i)=>[i*16,0,16,16]));

// 각 어종은 색뿐 아니라 꼬리, 몸통, 등지느러미, 수염 모양도 다르다.
const fishes=[
  ['pirami',`....OOO.........\n...OBBBO........\n....OOOOOOOO....\n.OOOBBAAAAAAO...\n.OBBBAAAAAOWAO..\n..OBAAAABBOOAO..\n.OBBBCCCCCCCO...\n.OOOOCCCCOOO....\n.....OCCO.......\n......OO........`],
  ['buri',`......OOO.......\n.....OKKKO......\n....OOKKKOO.....\n.OOOBKKNNNKO....\n.OKBKKNNNWOKO...\n..OBKKNNNOOKO...\n.OKBKKKKKKKKO...\n.OOOBLLLLLLO....\n.....OOLLOO.....\n.......OO.......`],
  ['minnow',`................\n................\n......OO........\n.....OAAOOO.....\n..OOOAAWWWBO....\n..OAAWWWOWABO...\n...OABBBBOBBO...\n..OAAOOOOOOO....\n..OOO..OO.......`],
  ['catfish_small',`......OO........\n.....OVVO.......\n....OOOOOOOO....\n.OOOVVVVBBAAO...\n.OVVVVVBBAOWAO..\n..OVVVBBBBBOAO..\n.OVVVBBCCCCCOO..\n.OOOOCCCCOO.O.O.\n.....OOOO..O..O.\n...........O....`],
  ['carp',`......OOOO......\n.....OKKKKO.....\n....OKYKYKOO....\n.OOOKYYKYKYKO...\n.OKKKYKYKYWOKO..\n..OKYKYKYYOOKO..\n.OKKKYKKYKKKKO..\n.OOOKKLLLLLLO...\n....OOOLLOOO....\n.......OO.......`],
  ['mandarin',`....O.O.O.......\n...OKOKOKO......\n....OOOOOOOO....\n.OOOKJGKGJKKO...\n.OKGKKJGKKWOKO..\n..OKJGKKJKOOKO..\n.OKGKKJKGKKKO...\n.OOOOJJKKJOO....\n.....OKOOO......\n......O.........`],
  ['eel',`................\n.........OOOO...\n.......OOJHWHO..\n.....OOJHHHOJO..\n....OJHHJOOOO...\n...OJHJOO.......\n..OJHJO.........\n..OJHJO.........\n...OJHJOOOO.....\n....OJJHHHJO....\n.....OOOOJJO....\n.........OO.....`],
  ['catfish',`.....OOOO.......\n....OCCCBO......\n...OOCCCBOOO....\n.OOCCCCCCBBBO...\n.OBCCCCBBBWOBO..\n..OCCCCCBBOOBO..\n.OBCCCCCBBBBBOO.\n.OOCCCCCCCCOOO.O\n...OOOOOOOO.O..O\n.....OCCO...O...\n......OO........`],
  ['goby',`.....O.O........\n....OKOKO.......\n....OOOOOOO.....\n.OOOKKKLKKKO....\n.OKLKKLLKWOKO...\n..OKLLKKKOOKO...\n.OOOKKKLKKKKO...\n....OOLLKOOO....\n...OKO.OOKO.....\n....O....O......`],
  ['trout',`......OOO.......\n.....OBBBO......\n....OOOOOOOO....\n.OOOBABABABAO...\n.OBBAAAABAWOAO..\n..OAPPRPRPOOAO..\n.OBBAAAABAAAO...\n.OOOOCCCCOOO....\n.....OCCO.......\n......OO........`],
  ['moonfish',`.......A........\n....AA...AA.....\n...A..OOO..A....\n.....OBABO......\n....OOAAAOO.....\n..OOBAWWWWAO....\n..OAAWWWUWBAO...\n...OAAWWWUBAO...\n..OAABAAAABO....\n..OOOOBBBOO.....\n....A.OOO.A.....\n.....AA.AA......\n.......A........`],
  ['rainbow_koi',`......OOOO......\n.....OPYYPO.....\n....OOPYYPOO....\n.OOORRYGGAUVO...\n.OPRRYGGAAUWVO..\n..ORYGGAAUOOVO..\n.OPRRGGAAUVVO...\n.OOORRGAUVVO....\n....OOOPPOO.....\n......OPPO......\n.......OO.......`],
];
const fish=canvas(192,16);
fishes.forEach(([,rows],i)=>map(fish,rows,i*16,1));
save('fish-icons',fish,fishes.map((_,i)=>[i*16,0,16,16]));

const shadow=canvas(72,14);
map(shadow,`................\n.......TTTT.....\n.....TTTTTTTT...\n.TTTTTTTTTTTTT..\n..TTTTTTTTTTTT..\n.TTTTTTTTTTTT...\n.....TTTTTT.....\n................`);
map(shadow,`........................\n..........TTTTTT........\n.......TTTTTTTTTTT......\n.....TTTTTTTTTTTTTTT....\n..TTTTTTTTTTTTTTTTTTT...\n...TTTTTTTTTTTTTTTTTTT..\n....TTTTTTTTTTTTTTTTTT..\n...TTTTTTTTTTTTTTTTTT...\n..TTTTTTTTTTTTTTTTTT....\n.....TTTTTTTTTTTTT......\n........TTTTTTT.........\n........................`,16);
map(shadow,`................................\n.............TTTTTTTT...........\n..........TTTTTTTTTTTTTT........\n........TTTTTTTTTTTTTTTTTT......\n.....TTTTTTTTTTTTTTTTTTTTTT.....\n..TTTTTTTTTTTTTTTTTTTTTTTTTT....\n...TTTTTTTTTTTTTTTTTTTTTTTTTT...\n....TTTTTTTTTTTTTTTTTTTTTTTTT...\n...TTTTTTTTTTTTTTTTTTTTTTTTT....\n..TTTTTTTTTTTTTTTTTTTTTTTTT.....\n.....TTTTTTTTTTTTTTTTTTTT.......\n.........TTTTTTTTTTTTTT.........\n............TTTTTTTT............\n................................`,40);
save('fish-shadow',shadow,[[0,0,16,8],[16,0,24,12],[40,0,32,14]]);
const bobber=canvas(24,8);
['...OO...\n..ORRO..\n..ORPO..\n..OWWO..\n...OO...\n.II..II.\n..IIII..\n........','........\n........\n...OO...\n..ORRO..\n..OWWO..\n.II..II.\n..IIII..\n........','........\n........\n........\n.I....I.\n..IOOI..\nIAORROAI\n..IIII..\n........'].forEach((m,i)=>map(bobber,m,i*8));
save('bobber',bobber,Array.from({length:3},(_,i)=>[i*8,0,8,8]));
const splash=canvas(64,16);
[
`................\n................\n................\n................\n................\n.......WW.......\n......WAAW......\n......WAAW......\n.......AA.......\n.....IIAAII.....\n....IAAAAAAI....\n.....IIIIII.....`,
`................\n................\n...A........A...\n...WA......AW...\n....WA....AW....\n.....WA..AW.....\n.....WAAAAW.....\n......AAAA......\n...IIAAAAAAII...\n..IAAAAAAAAAAI..\n...IIAAAAAAII...\n.....IIIIII.....`,
`................\n..A..........A..\n..W..........W..\n................\n....A......A....\n....W......W....\n................\n..II........II..\n.IAAI......IAAI.\n..IIAAAAAAAAII..\n....IIAAAAII....\n......IIII......`,
`................\n................\n................\n................\n................\n................\n................\n.II..........II.\nI..............I\n.II..........II.\n...III....III...\n......IIII......`,
].forEach((m,i)=>map(splash,m,i*16));
save('splash',splash,Array.from({length:4},(_,i)=>[i*16,0,16,16]));

// 몸통, 얼굴, 안경, 목도리의 맵을 분리해 표정과 호흡만 바꾼다.
const shell=`
........OOOOOOOO........
......OOJJGGGGJJOO......
.....OJGGGHHHHGGJJO.....
....OJGGOOOOOOGGGJJO....
...OJGGOGGHHGGOJJGJJO...
..OJGGOGGGHHGGGOJJGJJO..
..OJGGOGGGGGGGGOJJGJJO..
.OJGGOOGGGGGGGGOOJJGJJO.
.OJGGJGOGGGGGGOGJJJGJJO.
.OJJGJJGOOOOOOGJJJJGJJO.
..OJJGJJJJJJJJJJJJGJJO..
...OOJJJJJJJJJJJJJOO....
.....OOOOOOOOOOOOOO.....`;
const head=`
.....OOOOOOOO......
...OOHHHHHHHHOO....
..OHHHHHHHHHHHHO...
.OHHHHHHHHHHHHHHO..
.OHHHHHHHHHHHHHHO..
OHHHHHHHHHHHHHHHHO.
OHHHHHHHHHHHHHHHHO.
OHPPHHHHHHHHHHP PHO.
.OHHHHHHHHHHHHHHO..
..OHHHHHHHHHHHHO...
...OOHHHHHHHHOO....
.....OOOOOOOO......`.replace('P PH','PPH');
const glasses=`
.OOO.....OOO.
OAAAO...OAAAO
OAWAO O OAWAO
OAAAO...OAAAO
.OOO.....OOO.`.replace('O O O','OOOOO');
const scarf=`
OOOOOOOOOOOOOOO
ORRRRPPPRRRRRRO
.OOOOOOOOOOORRO
............ORO
............OPO
............OOO`;
const turtle=canvas(128,64);
for(let f=0;f<6;f++) {
  const c=canvas(32,32), talking=f>=4, lift=f===1||f===5 ? -1:0;
  map(c,'OOO....OOO\nOGHO..OHGO\nOOOO..OOOO',11,27);
  map(c,shell,4,15);
  map(c,'..OO..............OO..\n.OHHO............OHHO.\nOHHHO............OHHHO\n.OOO..............OOO.',5,21);
  map(c,head,7,4+lift);
  map(c,glasses,10,8+lift);
  if(f===2) { map(c,'OOO.....OOO',11,10+lift); }
  else { map(c,'O.......O',12,10+lift); }
  map(c,talking ? (f===4 ? 'OOO\nOPO\n.O.' : 'OOO\nOPO\nOOO') : 'O.O\n.O.',15,13+lift);
  map(c,scarf,9,17+lift);
  if(f===3) map(c,'P',23,21);
  blit(turtle,c,(f%4)*32,Math.floor(f/4)*32);
}
save('turtle',turtle,[[0,0,32,32],[32,0,32,32],[64,0,32,32],[96,0,32,32],[0,32,32,32],[32,32,32,32]]);
const rain=canvas(5,4); map(rain,'A\nA\nI\nI'); map(rain,'IAAI',1);
save('rain',rain,[[0,0,1,4],[1,0,4,1]]);
const sparkle=canvas(24,8);
['........\n...Y....\n...W....\n.YWWWY..\n...W....\n...Y....\n........\n........','...Y....\n...W....\n..WWW...\nYWWWWWY.\n..WWW...\n...W....\n...Y....\n........','........\n........\n...Y....\n..YWY...\n...Y....\n........\n........\n........'].forEach((m,i)=>map(sparkle,m,i*8));
save('sparkle',sparkle,Array.from({length:3},(_,i)=>[i*8,0,8,8]));

// 미리보기 글꼴도 비트맵: 추가 패키지, 브라우저, 시스템 글꼴 없이 재현 가능.
// 물가 소품은 기존 팔레트와 이진 알파를 그대로 사용한다.
const props = [
  ['lamp', 16, 32, `
......OOOO......
.....OKKKKO.....
....OOOOOOOO....
....OWYYYYWO....
....OWYYYYWO....
....OWYYYYWO....
.....OOOOOO.....
.......OO.......
.......LO.......
.......LO.......
.......LO.......
.......LO.......
.......LO.......
.......LO.......
.......LO.......
.......LO.......
.......LO.......
.......LO.......
.......LO.......
.......LO.......
.......LO.......
.......LO.......
.......LO.......
.......LO.......
.......LO.......
.......LO.......
......OOOO......
.....OKLLKO.....
.....OOOOOO.....`],
  ['crate', 16, 16, `
.....OO..OO.....
.....KO..AO.....
.....KO..AO.....
..OOOOOOOOOOOO..
..OKKKKKKKKKKO..
..OKNNNNNNNNKO..
..OKLLLLLLLLKO..
..OKKKKKKKKKKO..
..OKKOKKKKOKKO..
..OKKKOKKOKKKO..
..OLLLLOOLLLLO..
..OKKKOKKOKKKO..
..OKKOKKKKOKKO..
..OOOOOOOOOOOO..`],
  ['bucket', 16, 16, `
.....OOOOOO.....
....O......O....
....O......O....
...OOOOOOOOOO...
...OAWWWWWABO...
...OABBBBBBBO...
....OABBBBCO....
....OABBBBCO....
....OABBBBCO....
....OABBBBCO....
.....OCCCCO.....
......OOOO......`],
  ['lily-small', 16, 16, `
................
................
.....OOOOOO.....
...OOHHGGGJOO...
..OHHGGGGGJJJO..
..OHGGGGGJJJJO..
..OGGGGGJJOOO...
...OGGJOOO......
....OOO.........`],
  ['lily-flower', 16, 16, `
................
......RRR.......
.....RPWPR......
....RPPWPPR.....
.....RPWPR......
...OOHRRRGJOO...
..OHHGGGGGJJJO..
..OHGGGGGJJJJO..
..OGGGGGJJOOO...
...OGGJOOO......
....OOO.........`],
  ['flowers', 16, 16, `
................
...R.......V....
..RWR.....VWV...
...R.......V....
...J...Y...J....
...JG.YWY.GJ....
....J..Y..J.....
....JG.J.GJ.....
.....JJGJJ......
......JJJ.......`],
];
for (const [name, w, h, rows] of props) { const c = canvas(w, h); map(c, rows); save(name, c, [[0, 0, w, h]]); }

// 낚싯대는 같은 실루엣에 대나무 마디, 네잎클로버, 금빛 반짝임을 더한다.
const rodMap = `
............OO..
...........OKO..
..........OKO.A.
.........OKO..A.
........OKO...A.
.......OKO....A.
......OKO.....A.
.....OKO......A.
....OKO.......A.
...OKO........A.
..OLO.........A.
.OLLO..OO.....A.
.OLLO.OWBO....A.
..OO...OO.....R.
..............W.
................`;
for (const [name, color] of [['basic', '#d3a46b'], ['bamboo', '#8cab62'], ['steel', '#9ca6ad'], ['lucky', '#557c4c'], ['gold', '#edcd75']]) {
  const c = canvas(16, 16); map(c, rodMap, 0, 0, { K: rgba(color) });
  if (name === 'bamboo') map(c, 'N', 8, 5);
  if (name === 'lucky') map(c, '.GG.GG\n.GHGHG\n..GGG.\n.GHGHG\n.GG.GG\n...J..', 0, 0);
  if (name === 'gold') map(c, '..W..\n..W..\nWWWWW\n..W..\n..W..', 0, 0);
  save(`rod_${name}`, c, [[0, 0, 16, 16]]);
}

// 지렁이가 올라온 작은 미끼 통.
const bait = canvas(16, 16);
map(bait, `................
......RR........
.....R..R.......
.....R.R........
......RR........
...OOOOOOOOOO...
..OAAWWWWWWAAO..
..OBOOOOOOOOBO..
...OBBBBBBBBO...
...OBBAAAABBO...
...OBBARRABBO...
...OBBARBABBO...
...OBBBBBBBBO...
...OCCCCCCCCO...
....OOOOOOOO....
................`);
save('bait', bait, [[0, 0, 16, 16]]);

const font={
  A:'010/101/111/101/101', B:'110/101/110/101/110', C:'011/100/100/100/011', D:'110/101/101/101/110',
  E:'111/100/110/100/111', F:'111/100/110/100/100', G:'011/100/101/101/011', H:'101/101/111/101/101',
  I:'111/010/010/010/111', J:'001/001/001/101/010', K:'101/101/110/101/101', L:'100/100/100/100/111',
  M:'101/111/111/101/101', N:'101/111/111/111/101', O:'010/101/101/101/010', P:'110/101/110/100/100',
  Q:'010/101/101/111/011', R:'110/101/110/101/101', S:'011/100/010/001/110', T:'111/010/010/010/010',
  U:'101/101/101/101/111', V:'101/101/101/101/010', W:'101/101/111/111/101', X:'101/101/010/101/101',
  Y:'101/101/010/010/010', Z:'111/001/010/100/111', '0':'111/101/101/101/111', '1':'010/110/010/010/111',
  '2':'110/001/010/100/111','3':'110/001/010/001/110','4':'101/101/111/001/001','5':'111/100/110/001/110',
  '6':'011/100/110/101/010','7':'111/001/010/010/010','8':'010/101/010/101/010','9':'010/101/011/001/110',
  '-':'000/000/111/000/000', ':':'000/010/000/010/000', '/':'001/001/010/100/100', '.':'000/000/000/000/010',
};
function label(c,text,x,y) {
  for(const ch of text.toUpperCase()) {
    if(ch!==' ') { assert(font[ch],`missing glyph ${ch}`); map(c,font[ch].split('/').map(r=>r.replaceAll('0','.').replaceAll('1','O')),x,y); }
    x+=4;
  }
}
const preview=canvas(208, sheets.reduce((height, sheet) => height + sheet.c.h + 15, 96));
for(let y=0;y<preview.h;y++) for(let x=0;x<preview.w;x++) pixel(preview,x,y,rgba('#f3ebdc'));
label(preview,'FISHING ART / 8X NEAREST',8,5);
let y=17;
for(const {name,c,frames} of sheets) {
  label(preview,`${name.replaceAll('_','-')} ${c.w}X${c.h}`,8,y); y+=8;
  blit(preview,c,8,y,1,true);
  // 셀 경계를 작은 빨간 눈금으로 표시한다. 원본 시트는 그대로 보존.
  for(const [x,fy] of frames) pixel(preview,8+x,y+fy,colors.R);
  y+=c.h+7;
}
label(preview,'FISH ORDER',8,y); y+=8;
fishes.forEach(([name],i)=>{ label(preview,`${i+1} ${name.replaceAll('_','-')}`,8+(i%2)*96,y+Math.floor(i/2)*7); });
y+=46;
label(preview,'SHADOWS: SET ALPHA 0.35',8,y);
const enlarged=canvas(preview.w*8,preview.h*8); blit(enlarged,preview,0,0,8);
mkdirSync(`${root}docs/pixel-world/`,{recursive:true});
writeFileSync(`${root}docs/pixel-world/fishing-art-preview.png`,png(enlarged));
console.log(`Generated ${sheets.length} sheets and ${enlarged.w}x${enlarged.h} preview; dimensions, bounds, binary alpha, PNG CRC and inflate checks passed.`);
