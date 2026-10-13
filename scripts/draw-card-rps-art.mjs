import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = `${root}src/features/pixel-world-phaser/assets/cardRps/`;
const previewDir = `${root}.pixel-world-test.local/`;
const P = Object.fromEntries(Object.entries({
  ink:'#352a2d', deep:'#503236', wood:'#754530', wood2:'#9b6040', lightWood:'#bd8052',
  cream:'#f8e9c4', paper:'#fff7dc', shade:'#dfc99d', blue:'#397faf', paleBlue:'#8fc5d2',
  red:'#b84a50', gold:'#e4b94e', glow:'#ffe582', skin:'#dfaa82', mouse:'#a99796',
  mouse2:'#c9b9ad', pink:'#db8b91', white:'#fff6dc', green:'#667847', black:'#1d1920',
}).map(([k,v])=>[k,[...v.slice(1).match(/../g).map(x=>parseInt(x,16)),255]]));
const cv=(w,h,fill)=>{const c={w,h,data:Buffer.alloc(w*h*4)}; if(fill) rect(c,0,0,w,h,fill); return c};
function px(c,x,y,p){if(x>=0&&y>=0&&x<c.w&&y<c.h)c.data.set(p,(y*c.w+x)*4)}
function rect(c,x,y,w,h,p){for(let j=0;j<h;j++)for(let i=0;i<w;i++)px(c,x+i,y+j,p)}
function line(c,x0,y0,x1,y1,p){const dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1;let e=dx+dy;for(;;){px(c,x0,y0,p);if(x0===x1&&y0===y1)break;const e2=2*e;if(e2>=dy){e+=dy;x0+=sx}if(e2<=dx){e+=dx;y0+=sy}}}
function box(c,x,y,w,h,edge,fill){rect(c,x,y,w,h,edge);rect(c,x+1,y+1,w-2,h-2,fill)}
function blit(d,s,x,y,scale=1){for(let sy=0;sy<s.h;sy++)for(let sx=0;sx<s.w;sx++){const i=(sy*s.w+sx)*4;if(!s.data[i+3])continue;for(let yy=0;yy<scale;yy++)for(let xx=0;xx<scale;xx++)px(d,x+sx*scale+xx,y+sy*scale+yy,[...s.data.subarray(i,i+4)])}}
function card(c,x,y,border,kind){box(c,x+2,y+1,20,30,P.ink,P.paper);rect(c,x+3,y+2,18,2,border);rect(c,x+3,y+28,18,2,border);rect(c,x+3,y+4,2,24,border);rect(c,x+19,y+4,2,24,border);if(kind===3){rect(c,x+6,y+6,12,20,P.deep);rect(c,x+8,y+8,8,16,P.wood);for(let i=0;i<4;i++){px(c,x+11+i%2,y+12+i*3,P.gold);px(c,x+12-i%2,y+12+i*3,P.gold)}}else hand(c,x+6,y+9,kind)}
function hand(c,x,y,kind){if(kind===0){box(c,x+1,y+5,11,10,P.ink,P.skin);rect(c,x+3,y+3,7,3,P.skin);rect(c,x+2,y+2,2,4,P.ink);rect(c,x+5,y+1,2,3,P.ink);rect(c,x+8,y+1,2,3,P.ink)}else if(kind===1){rect(c,x+5,y+6,7,9,P.skin);line(c,x+6,y+7,x+1,y,P.ink);line(c,x+7,y+7,x+3,y,P.skin);line(c,x+9,y+7,x+12,y,P.ink);line(c,x+8,y+7,x+10,y,P.skin);rect(c,x+3,y+13,10,2,P.ink)}else{box(c,x+3,y+7,10,9,P.ink,P.skin);for(let i=0;i<5;i++){rect(c,x+i*2,y+(i%2),2,9,P.ink);px(c,x+i*2+1,y+(i%2)+1,P.skin)}}}
function save(name,c){writeFileSync(`${out}${name}`,png(c));return c}
function crc32(b){let n=0xffffffff;for(const v of b){n^=v;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0)}return(n^0xffffffff)>>>0}
function chunk(t,d){const n=Buffer.from(t),l=Buffer.alloc(4),r=Buffer.alloc(4);l.writeUInt32BE(d.length);r.writeUInt32BE(crc32(Buffer.concat([n,d])));return Buffer.concat([l,n,d,r])}
function png(c){const h=Buffer.alloc(13);h.writeUInt32BE(c.w);h.writeUInt32BE(c.h,4);h[8]=8;h[9]=6;const s=Buffer.alloc((c.w*4+1)*c.h);for(let y=0;y<c.h;y++)c.data.copy(s,y*(c.w*4+1)+1,y*c.w*4,(y+1)*c.w*4);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',deflateSync(s,{level:9})),chunk('IEND',Buffer.alloc(0))])}

mkdirSync(out,{recursive:true}); mkdirSync(previewDir,{recursive:true});
const cards=cv(96,64); for(let row=0;row<2;row++)for(let i=0;i<4;i++)card(cards,i*24,row*32,row?P.red:P.blue,i); save('cards.png',cards);

const table=cv(320,200,P.deep); rect(table,4,4,312,192,P.ink); rect(table,7,7,306,186,P.wood); // 선술집 벽
for(let y=8;y<83;y+=12){rect(table,8,y,304,1,P.deep);for(let x=(y%24?18:8);x<312;x+=42)rect(table,x,y,1,12,P.deep)}
// 깃발과 등불
for(const x of [52,244]){rect(table,x,12,25,4,P.gold);rect(table,x+2,16,21,34,P.blue);line(table,x+2,50,x+12,58,P.blue);line(table,x+22,50,x+12,58,P.blue);rect(table,x+10,27,5,12,P.gold)}
for(const x of [17,288]){box(table,x,20,15,24,P.ink,P.gold);rect(table,x+3,24,9,15,P.glow);rect(table,x+6,17,3,4,P.ink)}
// 원근 테이블
for(let y=0;y<100;y++){const half=80+Math.floor(y*.55);rect(table,160-half,91+y,half*2,1,(y%8===0)?P.deep:P.wood2)}
line(table,80,191,118,91,P.ink);line(table,240,191,202,91,P.ink);rect(table,112,88,96,4,P.gold);rect(table,132,99,56,2,P.lightWood);
// 의자 실루엣 및 카드 자리
box(table,121,62,78,19,P.ink,P.wood2);box(table,116,174,88,20,P.ink,P.wood2);
for(const [x,y,b,k] of [[142,105,P.red,0],[166,105,P.red,3],[130,148,P.blue,1],[154,148,P.blue,2],[178,148,P.blue,3]]){const mini=cv(24,32);card(mini,0,0,b,k);blit(table,mini,x,y)} save('table.png',table);

const glow=cv(32,40);for(let r=15;r>5;r-=3){const col=r>10?P.glow:P.white;for(let a=0;a<360;a+=12)px(glow,16+Math.round(Math.cos(a*Math.PI/180)*r),20+Math.round(Math.sin(a*Math.PI/180)*r),col)}for(let i=0;i<8;i++){rect(glow,(i*11)%28,3+(i*13)%34,2,2,P.glow)}save('glow.png',glow);
const clash=cv(128,32);for(let f=0;f<4;f++){const ox=f*32,cx=ox+16,cy=16;for(let i=0;i<8;i++){const len=4+f*2;line(clash,cx+Math.round(Math.cos(i*Math.PI/4)*3),cy+Math.round(Math.sin(i*Math.PI/4)*3),cx+Math.round(Math.cos(i*Math.PI/4)*len),cy+Math.round(Math.sin(i*Math.PI/4)*len),i%2?P.gold:P.white)}rect(clash,cx-2-f,cy-2-f,4+f*2,4+f*2,P.glow)}save('clash.png',clash);

const faces=cv(72,16);for(let f=0;f<3;f++){box(faces,f*24+1,1,22,12,P.ink,f===0?P.paleBlue:f===1?P.pink:P.cream);px(faces,f*24+10,13,P.ink);px(faces,f*24+11,14,P.ink)}
// x.x, ^.^, -.-
for(const x of [6,15]){line(faces,x,5,x+3,8,P.ink);line(faces,x+3,5,x,8,P.ink)}px(faces,12,9,P.ink);
for(const x of [30,39]){line(faces,x,8,x+2,5,P.ink);line(faces,x+2,5,x+4,8,P.ink)}line(faces,34,10,38,10,P.ink);
for(const x of [54,63])line(faces,x,7,x+3,7,P.ink);line(faces,58,10,62,10,P.ink);save('faces.png',faces);

const bubble=cv(48,16);for(let f=0;f<3;f++){box(bubble,f*16+1,1,14,12,P.ink,P.white);px(bubble,f*16+7,13,P.ink);const tiny=cv(14,14);hand(tiny,1,1,f);blit(bubble,tiny,f*16+1,0)}save('duel-bubble.png',bubble);

// 치즈: 32x40, 4행(idle 4 / 승리 2 / 패배 2 / 섞기 2), 빈 셀 없이 4칸 폭
const mouse=cv(128,160);function mouseFrame(f,row,pose){const x=f*32,y=row*40;rect(mouse,x+10,y+4,5,6,P.ink);rect(mouse,x+17,y+4,5,6,P.ink);rect(mouse,x+11,y+5,3,4,P.pink);rect(mouse,x+18,y+5,3,4,P.pink);box(mouse,x+9,y+7,14,14,P.ink,P.mouse2);px(mouse,x+13,y+12,P.black);px(mouse,x+19,y+12,P.black);px(mouse,x+16,y+15,P.pink);line(mouse,x+8,y+15,x+2,y+13,P.cream);line(mouse,x+23,y+15,x+29,y+13,P.cream);box(mouse,x+8,y+21,16,15,P.ink,P.blue);rect(mouse,x+12,y+22,8,3,P.gold);px(mouse,x+10+f,y+25,P.gold);const bob=(f%2);if(pose==='win'){line(mouse,x+9,y+27-bob,x+3,y+19-bob,P.mouse2);line(mouse,x+23,y+27-bob,x+29,y+19-bob,P.mouse2)}else if(pose==='lose'){line(mouse,x+9,y+27,x+4,y+33,P.mouse2);line(mouse,x+23,y+27,x+28,y+33,P.mouse2);line(mouse,x+13,y+13,x+15,y+15,P.ink);line(mouse,x+15,y+13,x+13,y+15,P.ink)}else if(pose==='shuffle'){box(mouse,x+2+(f%2)*4,y+27,8,10,P.ink,P.paper);box(mouse,x+22-(f%2)*4,y+25,8,10,P.ink,P.paper)}else{line(mouse,x+9,y+27,x+5,y+31+bob,P.mouse2);line(mouse,x+23,y+27,x+27,y+31-bob,P.mouse2)}}
for(let f=0;f<4;f++)mouseFrame(f,0,'idle');for(let r=1;r<4;r++)for(let f=0;f<4;f++)mouseFrame(f,r,r===1?'win':r===2?'lose':'shuffle');save('mouse-dealer.png',mouse);

const prop=cv(64,64);box(prop,7,28,50,12,P.ink,P.wood2);rect(prop,10,31,44,3,P.gold);for(const x of [12,48]){rect(prop,x,40,6,20,P.ink);rect(prop,x+2,40,2,18,P.wood)}box(prop,2,17,17,12,P.ink,P.deep);rect(prop,5,20,11,7,P.blue);box(prop,45,17,17,12,P.ink,P.deep);rect(prop,48,20,11,7,P.red);const pc=cv(24,32);card(pc,0,0,P.blue,3);blit(prop,pc,20,6);save('card-table-prop.png',prop);
const sign=cv(32,48);rect(sign,5,42,22,4,P.ink);rect(sign,9,35,4,9,P.ink);rect(sign,19,35,4,9,P.ink);box(sign,3,3,26,34,P.ink,P.wood2);box(sign,6,6,20,28,P.gold,P.cream);for(let i=0;i<3;i++){box(sign,8+i*5,11+i%2,7,11,P.ink,P.paper);rect(sign,9+i*5,12+i%2,5,2,i===0?P.blue:P.red);px(sign,11+i*5,16+i%2,i===0?P.ink:i===1?P.red:P.blue)}rect(sign,9,27,14,3,P.deep);save('rule-sign.png',sign);

const preview=cv(2040,2720,P.cream);const items=[[table,60,20],[cards,60,1260],[glow,700,1260],[clash,930,1260],[faces,60,1510],[bubble,530,1510],[mouse,60,1710],[prop,900,1710],[sign,1370,1710]];for(const [im,x,y] of items)blit(preview,im,x,y,6);writeFileSync(`${previewDir}card-rps-preview.png`,png(preview));

const py=`from pathlib import Path\nfrom PIL import Image\nr=Path(${JSON.stringify(root)})\nout=r/'src/features/pixel-world-phaser/assets/cardRps'\nrefs=[r/'reference/천광명월 카드가위바위보 설명서1.png',r/'reference/천광명월 카드가위바위보 설명서2.png']\nfor i,p in enumerate(refs,1):\n im=Image.open(p).convert('RGB'); im.thumbnail((1400,1400),Image.Resampling.LANCZOS); im.save(out/f'rules-{i}.webp','WEBP',quality=84,method=6)\n`;
const converted=spawnSync('python',['-I','-c',py],{encoding:'utf8'});assert.equal(converted.status,0,converted.stderr);
console.log('카드 가위바위보 에셋과 6배 미리보기를 만들었습니다.');
