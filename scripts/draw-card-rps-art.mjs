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
function ellipse(c,cx,cy,rx,ry,fill,edge=fill){for(let y=-ry;y<=ry;y++)for(let x=-rx;x<=rx;x++){const q=(x*x)/(rx*rx)+(y*y)/(ry*ry);if(q<=1)px(c,cx+x,cy+y,q>.68?edge:fill)}}
function poly(c,points,fill){const minY=Math.min(...points.map(p=>p[1])),maxY=Math.max(...points.map(p=>p[1]));for(let y=minY;y<=maxY;y++){const xs=[];for(let i=0;i<points.length;i++){const [x1,y1]=points[i],[x2,y2]=points[(i+1)%points.length];if(y1===y2||y<Math.min(y1,y2)||y>=Math.max(y1,y2))continue;xs.push(Math.round(x1+(y-y1)*(x2-x1)/(y2-y1)))}xs.sort((a,b)=>a-b);for(let i=0;i+1<xs.length;i+=2)rect(c,xs[i],y,xs[i+1]-xs[i]+1,1,fill)}}
function blit(d,s,x,y,scale=1){for(let sy=0;sy<s.h;sy++)for(let sx=0;sx<s.w;sx++){const i=(sy*s.w+sx)*4;if(!s.data[i+3])continue;for(let yy=0;yy<scale;yy++)for(let xx=0;xx<scale;xx++)px(d,x+sx*scale+xx,y+sy*scale+yy,[...s.data.subarray(i,i+4)])}}
function card(c,x,y,border,kind){box(c,x+2,y+1,20,30,P.ink,P.paper);rect(c,x+3,y+2,18,2,border);rect(c,x+3,y+28,18,2,border);rect(c,x+3,y+4,2,24,border);rect(c,x+19,y+4,2,24,border);if(kind===3){rect(c,x+6,y+6,12,20,P.deep);rect(c,x+8,y+8,8,16,P.wood);for(let i=0;i<4;i++){px(c,x+11+i%2,y+12+i*3,P.gold);px(c,x+12-i%2,y+12+i*3,P.gold)}}else hand(c,x+6,y+9,kind)}
function hand(c,x,y,kind){
  if(kind===0){ // 바위: 둥글게 쥔 주먹과 네 개의 손가락 마디
    ellipse(c,x+7,y+9,6,6,P.skin,P.ink);rect(c,x+2,y+8,11,5,P.skin);rect(c,x+1,y+9,2,4,P.ink);
    for(let i=0;i<4;i++){ellipse(c,x+3+i*3,y+5+(i===0||i===3?1:0),2,3,P.skin,P.ink);px(c,x+3+i*3,y+6+(i===0||i===3?1:0),P.lightWood)}
    line(c,x+3,y+10,x+11,y+10,P.ink);rect(c,x+5,y+11,7,3,P.skin);
  }else if(kind===1){ // 가위: 검지와 중지만 크게 벌린 V
    ellipse(c,x+7,y+11,5,5,P.skin,P.ink);poly(c,[[x+5,y+9],[x,y+1],[x+2,y],[x+8,y+8]],P.ink);poly(c,[[x+5,y+8],[x+2,y+2],[x+3,y+2],[x+8,y+9]],P.skin);
    poly(c,[[x+8,y+8],[x+11,y],[x+13,y+1],[x+10,y+10]],P.ink);poly(c,[[x+9,y+8],[x+11,y+2],[x+12,y+2],[x+10,y+9]],P.skin);line(c,x+4,y+13,x+12,y+13,P.ink);
  }else{ // 보: 손바닥과 다섯 손가락을 완전히 펼친 실루엣
    ellipse(c,x+7,y+10,5,6,P.skin,P.ink);const tips=[[0,4],[2,1],[5,0],[8,1],[11,4]];
    for(let i=0;i<5;i++){const [tx,ty]=tips[i];line(c,x+5+i,y+9,x+tx,y+ty,P.ink);line(c,x+6+i,y+9,x+tx+1,y+ty,P.skin)}rect(c,x+4,y+12,8,4,P.skin);line(c,x+3,y+14,x+12,y+14,P.ink);
  }
}
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
// 기존 밑그림 위에 깊이감 있는 선술집 장면을 다시 그린다.
rect(table,0,0,320,200,P.deep);rect(table,3,3,314,194,P.ink);rect(table,6,6,308,188,P.wood);
for(let y=7;y<82;y+=11){rect(table,7,y,306,1,P.deep);for(let x=12+(y%3)*13;x<313;x+=47)rect(table,x,y,1,11,P.deep)}
for(const x of [7,304]){rect(table,x,7,9,187,P.deep);rect(table,x+2,7,3,187,P.lightWood)}
for(const x of [48,247]){rect(table,x,11,25,4,P.gold);poly(table,[[x+2,15],[x+23,15],[x+23,47],[x+12,56],[x+2,47]],P.blue);rect(table,x+11,23,4,19,P.gold);rect(table,x+6,30,15,4,P.gold)}
for(const x of [20,285]){rect(table,x+5,14,5,5,P.ink);box(table,x,19,15,25,P.ink,P.gold);rect(table,x+3,23,9,16,P.glow);rect(table,x+5,25,5,12,P.white)}
rect(table,17,62,67,3,P.ink);box(table,24,50,12,12,P.ink,P.cream);rect(table,36,53,4,6,P.ink);box(table,54,48,20,14,P.ink,P.wood2);for(let x=57;x<73;x+=5)rect(table,x,49,1,12,P.gold);
rect(table,237,62,66,3,P.ink);box(table,251,50,13,12,P.ink,P.cream);rect(table,264,53,4,6,P.ink);ellipse(table,286,54,9,8,P.wood2,P.ink);rect(table,278,53,17,2,P.gold);
box(table,121,60,78,21,P.ink,P.wood2);rect(table,128,64,64,3,P.lightWood);rect(table,127,78,5,12,P.ink);rect(table,188,78,5,12,P.ink);
poly(table,[[112,87],[208,87],[286,193],[34,193]],P.ink);poly(table,[[115,91],[205,91],[278,189],[42,189]],P.wood2);
for(let y=98;y<188;y+=13){const inset=Math.floor((188-y)*.68);rect(table,43+inset,y,235-inset*2,2,P.deep)}
line(table,160,92,160,189,P.deep);line(table,116,92,45,188,P.lightWood);line(table,204,92,275,188,P.deep);box(table,132,100,56,30,P.deep,P.wood);rect(table,138,104,44,2,P.gold);rect(table,138,124,44,2,P.gold);
box(table,111,176,98,20,P.ink,P.wood2);rect(table,118,180,84,4,P.lightWood);
for(const [x,y,b,k] of [[142,105,P.red,0],[166,105,P.red,3],[130,148,P.blue,1],[154,148,P.blue,2],[178,148,P.blue,3]]){const mini=cv(24,32);card(mini,0,0,b,k);blit(table,mini,x,y)} save('table.png',table);

const glow=cv(32,40);for(let r=15;r>5;r-=3){const col=r>10?P.glow:P.white;for(let a=0;a<360;a+=12)px(glow,16+Math.round(Math.cos(a*Math.PI/180)*r),20+Math.round(Math.sin(a*Math.PI/180)*r),col)}for(let i=0;i<8;i++){rect(glow,(i*11)%28,3+(i*13)%34,2,2,P.glow)}save('glow.png',glow);
const clash=cv(128,32);for(let f=0;f<4;f++){const ox=f*32,cx=ox+16,cy=16;for(let i=0;i<8;i++){const len=4+f*2;line(clash,cx+Math.round(Math.cos(i*Math.PI/4)*3),cy+Math.round(Math.sin(i*Math.PI/4)*3),cx+Math.round(Math.cos(i*Math.PI/4)*len),cy+Math.round(Math.sin(i*Math.PI/4)*len),i%2?P.gold:P.white)}rect(clash,cx-2-f,cy-2-f,4+f*2,4+f*2,P.glow)}save('clash.png',clash);

const faces=cv(72,16);for(let f=0;f<3;f++){box(faces,f*24+1,1,22,12,P.ink,f===0?P.paleBlue:f===1?P.pink:P.cream);px(faces,f*24+10,13,P.ink);px(faces,f*24+11,14,P.ink)}
// x.x, ^.^, -.-
for(const x of [6,15]){line(faces,x,5,x+3,8,P.ink);line(faces,x+3,5,x,8,P.ink)}px(faces,12,9,P.ink);
for(const x of [30,39]){line(faces,x,8,x+2,5,P.ink);line(faces,x+2,5,x+4,8,P.ink)}line(faces,34,10,38,10,P.ink);
for(const x of [54,63])line(faces,x,7,x+3,7,P.ink);line(faces,58,10,62,10,P.ink);save('faces.png',faces);

const bubble=cv(48,16);for(let f=0;f<3;f++){box(bubble,f*16+1,1,14,12,P.ink,P.white);px(bubble,f*16+7,13,P.ink);const tiny=cv(14,14);hand(tiny,1,1,f);blit(bubble,tiny,f*16+1,0)}save('duel-bubble.png',bubble);

// 치즈: 32x40, 4행(idle / win / lose / shuffle), 행마다 4프레임.
const mouse=cv(128,160);
// 동그란 얼굴, 큰 귀와 눈, 딜러 조끼가 보이는 새 치즈.
function cuteMouseFrame(f,row,pose){const x=f*32,y=row*40,bob=pose==='win'?(f%2?0:-2):f%2;
  // 꼬리, 귀, 머리
  line(mouse,x+23,y+27+bob,x+29,y+24+(f%2)*3,P.ink);line(mouse,x+24,y+27+bob,x+30,y+25+(f%2)*3,P.pink);
  ellipse(mouse,x+10,y+9+bob,6,6,P.mouse2,P.ink);ellipse(mouse,x+22,y+9+bob,6,6,P.mouse2,P.ink);ellipse(mouse,x+10,y+9+bob,3,3,P.pink);ellipse(mouse,x+22,y+9+bob,3,3,P.pink);
  ellipse(mouse,x+16,y+15+bob,10,9,P.mouse2,P.ink);rect(mouse,x+9,y+18+bob,3,2,P.pink);rect(mouse,x+21,y+18+bob,3,2,P.pink);
  if(pose==='lose'){line(mouse,x+11,y+12+bob,x+14,y+15+bob,P.ink);line(mouse,x+14,y+12+bob,x+11,y+15+bob,P.ink);line(mouse,x+19,y+12+bob,x+22,y+15+bob,P.ink);line(mouse,x+22,y+12+bob,x+19,y+15+bob,P.ink)}
  else{box(mouse,x+10,y+11+bob,5,6,P.ink,P.white);box(mouse,x+18,y+11+bob,5,6,P.ink,P.white);rect(mouse,x+12,y+13+bob,2,3,P.black);rect(mouse,x+20,y+13+bob,2,3,P.black);px(mouse,x+12,y+12+bob,P.white);px(mouse,x+20,y+12+bob,P.white)}
  ellipse(mouse,x+16,y+18+bob,2,2,P.pink,P.ink);line(mouse,x+8,y+18+bob,x+2,y+16+bob,P.cream);line(mouse,x+24,y+18+bob,x+30,y+16+bob,P.cream);
  px(mouse,x+7+f,y+20+bob,P.pink);
  // 조끼, 셔츠와 나비넥타이
  poly(mouse,[[x+9,y+23+bob],[x+23,y+23+bob],[x+25,y+37],[x+7,y+37]],P.ink);poly(mouse,[[x+11,y+24+bob],[x+21,y+24+bob],[x+22,y+36],[x+10,y+36]],P.blue);rect(mouse,x+15,y+25+bob,3,11,P.cream);rect(mouse,x+12,y+24+bob,3,3,P.red);rect(mouse,x+18,y+24+bob,3,3,P.red);px(mouse,x+16,y+28+bob,P.gold);px(mouse,x+16,y+33+bob,P.gold);
  if(pose==='win'){line(mouse,x+9,y+27+bob,x+3,y+20+bob,P.mouse2);line(mouse,x+23,y+27+bob,x+29,y+20+bob,P.mouse2);rect(mouse,x+13,y+38,7,2,P.ink)}
  else if(pose==='shuffle'){const shift=f%2?3:0;box(mouse,x+3+shift,y+28,8,10,P.ink,P.paper);box(mouse,x+21-shift,y+26,8,10,P.ink,P.paper);rect(mouse,x+5+shift,y+30,4,2,P.red);rect(mouse,x+23-shift,y+28,4,2,P.blue)}
  else{line(mouse,x+10,y+28+bob,x+5,y+31+bob,P.mouse2);line(mouse,x+22,y+28+bob,x+27,y+31-bob,P.mouse2)}
}
rect(mouse,0,0,128,160,[0,0,0,0]);for(let f=0;f<4;f++)cuteMouseFrame(f,0,'idle');for(let r=1;r<4;r++)for(let f=0;f<4;f++)cuteMouseFrame(f,r,r===1?'win':r===2?'lose':'shuffle');save('mouse-dealer.png',mouse);

const prop=cv(64,64);box(prop,5,27,54,14,P.ink,P.wood2);rect(prop,9,30,46,3,P.gold);for(let x=10;x<56;x+=9)rect(prop,x,35,7,2,P.deep);for(const x of [10,48]){rect(prop,x,40,7,20,P.ink);rect(prop,x+2,41,3,17,P.wood)}box(prop,1,16,18,12,P.ink,P.deep);rect(prop,4,19,12,6,P.blue);box(prop,45,16,18,12,P.ink,P.deep);rect(prop,48,19,12,6,P.red);const pc=cv(24,32);card(pc,0,0,P.blue,3);blit(prop,pc,20,4);ellipse(prop,16,10,5,4,P.glow,P.gold);ellipse(prop,49,10,5,4,P.glow,P.gold);save('card-table-prop.png',prop);
const sign=cv(32,48);rect(sign,5,42,22,4,P.ink);rect(sign,9,35,4,9,P.ink);rect(sign,19,35,4,9,P.ink);box(sign,2,2,28,36,P.ink,P.wood2);rect(sign,4,4,24,2,P.gold);box(sign,5,7,22,27,P.gold,P.cream);for(let i=0;i<3;i++){box(sign,7+i*6,10+i%2,8,14,P.ink,P.paper);rect(sign,8+i*6,11+i%2,6,2,i===0?P.blue:P.red);const tiny=cv(14,14);hand(tiny,1,1,i);blit(sign,tiny,5+i*6,10+i%2)}rect(sign,8,28,16,3,P.deep);px(sign,10,29,P.gold);px(sign,21,29,P.gold);save('rule-sign.png',sign);

const preview=cv(2040,2720,P.cream);const items=[[table,60,20],[cards,60,1260],[glow,700,1260],[clash,930,1260],[faces,60,1510],[bubble,530,1510],[mouse,60,1710],[prop,900,1710],[sign,1370,1710]];for(const [im,x,y] of items)blit(preview,im,x,y,6);writeFileSync(`${previewDir}card-rps-preview.png`,png(preview));

const rulesPy=`from pathlib import Path\nfrom PIL import Image\nr=Path(${JSON.stringify(root)})\nout=r/'src/features/pixel-world-phaser/assets/cardRps'\nrefs=sorted((r/'reference').glob('*.png'))\nassert len(refs)>=2, refs\nfor i,p in enumerate(refs[:2],1):\n im=Image.open(p).convert('RGB'); im.thumbnail((1400,1400),Image.Resampling.LANCZOS); im.save(out/f'rules-{i}.webp','WEBP',quality=84,method=6)\n`;
const converted=spawnSync('python',['-I','-c',rulesPy],{encoding:'utf8'});assert.equal(converted.status,0,converted.stderr);
console.log('카드 가위바위보 에셋과 6배 미리보기를 만들었습니다.');
