import {test} from 'node:test';import assert from 'node:assert/strict';
import {kbInit,kbSelect,kbLives,kbStart,kbWord,kbTick,kbMove,kbReveal,kbReset,kbState,kbRetheme,THEMES,KB_EXPRESS_MS} from './kotoba.mjs';
function room(n=3){
  const host={id:'h',name:'配信者'};const players=new Map();
  for(let i=0;i<n;i++){const id='p'+i;players.set(id,{id,name:'L'+i,want:true,lives:0})}
  players.set('cpu',{id:'cpu',name:'CPU',demo:true,want:true});
  const r={host,players,logs:[]};kbInit(r);return r;
}
test('ことばならべ：ライフがないと指名できず、参加でライフが1減る',()=>{
  const r=room();
  assert.throws(()=>kbSelect(r,'p0'),/ライフがありません/);
  assert.throws(()=>kbSelect(r,'cpu'),/CPU/);
  kbLives(r,'p0',5);kbLives(r,'p1',1);kbLives(r,'p2',1);kbLives(r,'p2',-1);
  kbSelect(r,'p0');kbSelect(r,'p1');assert.throws(()=>kbSelect(r,'p2'),/ライフ/);
  r.players.get('p2').want=false;r.players.get('p2').lives=1;assert.throws(()=>kbSelect(r,'p2'),/参加希望/);
  kbStart(r,0);
  assert.equal(r.players.get('p0').lives,4);assert.equal(r.players.get('p1').lives,0);
  assert.equal(r.kb.phase,'express');assert.ok(r.kb.theme.text);
  assert.equal(new Set(r.kb.cards.map(c=>c.number)).size,2);
});
test('ことばならべ：数字は本人だけ、言葉は表現中は伏せる。45秒で未回答は除外',()=>{
  const r=room(3);for(const id of ['p0','p1','p2']){kbLives(r,id,1);kbSelect(r,id)}
  kbStart(r,0);kbWord(r,r.players.get('p0'),'  ライオン ');
  const s0=kbState(r,r.players.get('p0')),s1=kbState(r,r.players.get('p1')),sh=kbState(r,r.host);
  assert.ok(s0.cards.find(c=>c.id==='p0').number);assert.equal(s0.cards.find(c=>c.id==='p1').number,null);
  assert.equal(sh.cards.every(c=>c.number===null),true);
  assert.equal(s1.cards.find(c=>c.id==='p0').word,'');assert.equal(s0.cards.find(c=>c.id==='p0').word,'ライオン');
  kbWord(r,r.players.get('p1'),'ネコ');
  assert.equal(kbTick(r,KB_EXPRESS_MS-1),undefined);
  assert.equal(kbTick(r,KB_EXPRESS_MS),'arrange');
  assert.equal(r.kb.cards.find(c=>c.id==='p2').excluded,true);
  assert.deepEqual([...r.kb.order].sort(),['p0','p1']);
});
test('ことばならべ：配信者が並べ、1枚ずつめくり、正しい位置の人だけ成功が増える',()=>{
  const r=room(3);for(const id of ['p0','p1','p2']){kbLives(r,id,1);kbSelect(r,id)}
  kbStart(r,0);
  const num={p0:10,p1:50,p2:90};for(const c of r.kb.cards){c.number=num[c.id];kbWord(r,r.players.get(c.id),'w'+c.id)}
  assert.equal(kbTick(r,1),'arrange');
  assert.throws(()=>kbMove(r,['p0','p1']),/不正/);
  kbMove(r,['p1','p0','p2']);
  assert.equal(kbReveal(r),null);assert.equal(kbState(r,r.host).cards.find(c=>c.id==='p1').number,50);
  assert.equal(kbState(r,r.host).cards.find(c=>c.id==='p0').number,null);
  assert.throws(()=>kbMove(r,['p0','p1','p2']),/オープン前/);
  kbReveal(r);const res=kbReveal(r);
  assert.equal(res.correct,1);assert.deepEqual(res.rows.map(x=>x.ok),[false,false,true]);
  assert.equal(r.players.get('p2').kbSuccess,1);assert.equal(r.players.get('p0').kbSuccess??0,0);
  assert.equal(r.kb.phase,'result');kbReset(r);assert.equal(r.kb.phase,'lobby');
});
test('ことばならべ：残り1人以下は不成立でライフを戻す。お題の引き直し',()=>{
  const r=room(2);for(const id of ['p0','p1']){kbLives(r,id,1);kbSelect(r,id)}
  kbStart(r,0);const first=r.kb.theme.text;kbWord(r,r.players.get('p0'),'a');kbRetheme(r,5);
  assert.notEqual(r.kb.theme.text,first);assert.equal(r.kb.cards[0].word,null);
  kbWord(r,r.players.get('p0'),'b');
  assert.equal(kbTick(r,5+KB_EXPRESS_MS),'void');
  assert.equal(r.players.get('p0').lives,1);assert.equal(r.players.get('p1').lives,0);
  assert.equal(THEMES.length>=60,true);assert.equal(KB_EXPRESS_MS,45000);
});
