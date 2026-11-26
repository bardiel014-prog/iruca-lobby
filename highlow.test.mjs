import {test} from 'node:test';import assert from 'node:assert/strict';
import {payout,hlInit,hlBet,hlFlip,hlNext,hlState,freshDeck,maxStake} from './highlow.mjs';
const c=(rank,suit='S')=>({rank,suit});
test('ハイ＆ロー：的中2倍・同数返却・外れ没収',()=>{
  assert.equal(payout({amount:300,pick:'high'},c(5),c(9)).delta,300);
  assert.equal(payout({amount:300,pick:'low'},c(5),c(9)).delta,-300);
  assert.equal(payout({amount:300,pick:'high'},c(5),c(5,'H')).delta,0);
  assert.equal(payout({amount:0,pick:'high'},c(5),c(9)).delta,0);
});
test('ハイ＆ロー：色も当てるとさらに倍、色違いは没収',()=>{
  assert.equal(payout({amount:100,pick:'high',color:'red'},c(5),c(9,'H')).returned,400);
  assert.equal(payout({amount:100,pick:'high',color:'black'},c(5),c(9,'H')).delta,-100);
  assert.equal(payout({amount:100,pick:'low',color:'red'},c(5),c(9,'D')).delta,-100);
  assert.equal(payout({amount:100,pick:'high',color:'red'},c(5),c(5,'H')).returned,200);
  assert.equal(payout({amount:100,pick:'high',color:'black'},c(5),c(5,'H')).delta,-100);
});
test('ハイ＆ロー：ベット・めくり・持ち点・山札の切り直し',()=>{
  const host={id:'h',points:3000},a={id:'a',points:1000},z={id:'z',points:0};
  const r={host,players:new Map([[a.id,a],[z.id,z]])};
  hlInit(r);assert.equal(r.hl.deck.length,51);
  assert.throws(()=>hlBet(r,host,{pick:'high',amount:0}),/めくる係/);
  assert.throws(()=>hlBet(r,a,{pick:'high',amount:150}),/100点単位/);
  assert.throws(()=>hlBet(r,a,{pick:'high',amount:1100}),/超える/);
  assert.throws(()=>hlBet(r,z,{pick:'low',amount:100}),/超える/);
  hlBet(r,z,{pick:'low',amount:0});assert.equal(maxStake(z),0);
  r.hl.current=c(7);r.hl.deck.push(c(12,'H'));
  hlBet(r,a,{pick:'high',amount:200,color:'red'});
  assert.equal(hlState(r,a).myBet.amount,200);assert.equal(hlState(r,a).tally.total,2);
  const res=hlFlip(r,[host,a,z]);
  assert.equal(a.points,1600);assert.equal(z.points,0);assert.equal(host.points,3000);
  assert.equal(res.results.find(x=>x.id==='a').delta,600);
  // the flipped card stays on the right until the host moves on; no bets or second flip meanwhile
  assert.deepEqual(r.hl.current,c(7));assert.deepEqual(r.hl.revealed,c(12,'H'));assert.equal(r.hl.round,1);assert.deepEqual(r.hl.bets,{});
  assert.deepEqual(hlState(r,a).revealed,c(12,'H'));
  assert.throws(()=>hlBet(r,a,{pick:'low',amount:0}),/次のゲーム/);
  assert.throws(()=>hlFlip(r,[host,a,z]),/もうめくりました/);
  hlNext(r);assert.deepEqual(r.hl.current,c(12,'H'));assert.equal(r.hl.revealed,null);assert.equal(r.hl.round,2);
  assert.throws(()=>hlNext(r),/まだカード/);
  r.hl.deck=[];hlFlip(r,[host,a,z]);assert.equal(r.hl.reshuffled,true);assert.equal(r.hl.deck.length,50);
  assert.equal(new Set(freshDeck().map(x=>x.suit+x.rank)).size,52);
});
test('ハイ＆ロー：連勝は的中で+1、外れで0、ベットなし・同数（色なし）は据え置き',()=>{
  const host={id:'h',points:3000},a={id:'a',points:1000},b={id:'b',points:1000};
  const r={host,players:new Map([[a.id,a],[b.id,b]])};hlInit(r);
  const flip=(next,bets)=>{for(const [p,x] of bets)hlBet(r,p,x);r.hl.deck.push(next);const res=hlFlip(r,[host,a,b]);hlNext(r);return res};
  r.hl.current=c(7);
  flip(c(9),[[a,{pick:'high',amount:100}],[b,{pick:'high',amount:0}]]);assert.equal(a.hlStreak,1);assert.equal(b.hlStreak,1,'0点ベットも数える');
  flip(c(3),[[a,{pick:'low',amount:100}]]);assert.equal(a.hlStreak,2);assert.equal(b.hlStreak,1,'ベットなしは据え置き');
  flip(c(3,'H'),[[a,{pick:'high',amount:100}]]);assert.equal(a.hlStreak,2,'同数・色なしは据え置き');
  flip(c(3,'D'),[[a,{pick:'low',amount:100,color:'red'}]]);assert.equal(a.hlStreak,3,'同数でも色が当たれば勝ち');
  assert.deepEqual(hlState(r,a).streaks,{a:3,b:1});
  flip(c(10,'S'),[[a,{pick:'high',amount:100,color:'red'}]]);assert.equal(a.hlStreak,0,'色はずれで0');
  flip(c(1),[[b,{pick:'high',amount:0}]]);assert.equal(b.hlStreak,0);
  assert.deepEqual(hlState(r,a).streaks,{});
});
