import {test} from 'node:test';import assert from 'node:assert/strict';
import {hkInit,hkOpen,hkAnswer,hkClose,hkTick,hkNext,hkRedraw,hkResetStats,hkState,PROMPTS,HK_ANSWER_MS} from './hitokoto.mjs';
function room(n=4){
  const host={id:'h',name:'配信者',points:3000};const players=new Map();
  for(let i=0;i<n;i++){const id='p'+i;players.set(id,{id,name:'L'+i,points:1000})}
  const r={gameType:'hitokoto',host,players,logs:[]};hkInit(r);return r;
}
const L=(r,i)=>r.players.get('p'+i),all=r=>[...r.players.values()];
test('ひとこと演技：お題は30組・各6択、文字数も短い',()=>{
  assert.ok(PROMPTS.length>=30);assert.equal(HK_ANSWER_MS,45000);
  for(const [w,o] of PROMPTS){assert.equal(o.length,6,w);assert.equal(new Set(o).size,6,w);for(const t of o)assert.ok(t.length<=14,t)}
});
test('ひとこと演技：正解は配信者だけに見え、公開後は全員に見える',()=>{
  const r=room();
  assert.equal(hkState(r,r.host).secret,r.hk.secret);assert.equal(hkState(r,L(r,0)).secret,null);
  assert.throws(()=>hkAnswer(r,L(r,0),{pick:0}),/受け付けていません/);
  hkOpen(r,0);hkAnswer(r,L(r,0),{pick:r.hk.secret});
  assert.equal(hkState(r,L(r,1)).secret,null);assert.equal(hkState(r,L(r,1)).myAnswer,null);assert.equal(hkState(r,L(r,1)).answered,1);
  assert.throws(()=>hkAnswer(r,r.host,{pick:0}),/演じる係/);
  assert.throws(()=>hkRedraw(r),/受付中/);
  hkClose(r,all(r));assert.equal(hkState(r,L(r,1)).secret,r.hk.secret);
});
test('ひとこと演技：正解数・正答率と配信者の「伝わった回」',()=>{
  const r=room(),s=r.hk.secret,w=(s+1)%6;
  hkOpen(r,0);hkAnswer(r,L(r,0),{pick:s});hkAnswer(r,L(r,1),{pick:s});hkAnswer(r,L(r,2),{pick:w});
  const res=hkClose(r,all(r));
  assert.equal(res.correct,2);assert.equal(res.total,3);assert.equal(res.hit,true);assert.equal(res.counts[s],2);
  assert.equal(L(r,0).points,1000,'持ち点は動かない');
  hkNext(r);const s2=r.hk.secret,w2=(s2+1)%6;
  hkOpen(r,0);hkAnswer(r,L(r,0),{pick:w2});hkAnswer(r,L(r,1),{pick:w2});hkAnswer(r,L(r,2),{pick:s2});
  assert.equal(hkClose(r,all(r)).hit,false);
  hkNext(r);const s3=r.hk.secret;hkOpen(r,0);hkAnswer(r,L(r,0),{pick:s3});hkAnswer(r,L(r,1),{pick:(s3+1)%6});
  assert.equal(hkClose(r,all(r)).hit,false,'同票トップは伝わった回にしない');
  hkNext(r);hkOpen(r,0);hkClose(r,all(r));
  assert.deepEqual(r.hk.host,{rounds:3,hits:1,answers:8,correct:4},'回答0人の回は数えない');
  const st=hkState(r,L(r,0));assert.deepEqual(st.me,{id:'p0',name:'L0',answers:3,correct:2});
  assert.equal(st.ranking[0].id,'p0');assert.equal(st.ranking.length,3);
  hkResetStats(r,all(r));assert.equal(r.hk.host.rounds,0);assert.equal(L(r,0).hkAnswers,0);
});
test('ひとこと演技：時間切れで自動公開',()=>{
  const r=room();hkOpen(r,1000);hkAnswer(r,L(r,0),{pick:0});
  assert.equal(hkTick(r,all(r),1000+HK_ANSWER_MS-1),null);
  assert.ok(hkTick(r,all(r),1000+HK_ANSWER_MS));assert.equal(r.hk.phase,'result');
});
test('ひとこと演技：賭けはない（金額を送っても持ち点は動かない）',()=>{
  const r=room();hkOpen(r,0);hkAnswer(r,L(r,0),{pick:r.hk.secret,amount:500});hkAnswer(r,L(r,1),{pick:(r.hk.secret+1)%6,amount:500});
  hkClose(r,all(r));assert.equal(L(r,0).points,1000);assert.equal(L(r,1).points,1000);assert.equal('bet' in hkState(r,L(r,0)),false);
});
