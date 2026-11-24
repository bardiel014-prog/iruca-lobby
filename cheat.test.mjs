import {test} from 'node:test';import assert from 'node:assert/strict';
import {loadShot,loadedValue,beginGame,accuse,resolveJudgement,rollPlayer,setBet,tickGame} from './game.mjs';
test('シゴロ賽：1・2・3の面は裏の6・5・4の写し。軌跡はそのままで、表示用に loaded が付く',()=>{
  assert.deepEqual([1,2,3,4,5,6].map(loadedValue),[6,5,4,4,5,6]);
  const frame=[[0,.58,0,0,0,0,1],[1,.58,0,0,0,0,1],[2,.58,0,0,0,0,1]];
  const shot=loadShot({dice:[1,2,3],frames:[frame],frameMs:33,duration:0});
  assert.deepEqual(shot.dice,[6,5,4]);assert.equal(shot.loaded,true);assert.deepEqual(shot.frames,[frame]);
});
function room(){
  const mk=(id,name,points)=>({id,name,points,want:true,seen:Date.now(),plays:0,dice:[],attempts:0,done:false});
  const host=mk('h','配信者',3000),a=mk('a','A',1000),b=mk('b','B',1000),c=mk('c','C',1000);
  const r={id:'00000001',gameType:'chinchiro-cheat',host,players:new Map([[a.id,a],[b.id,b],[c.id,c]]),selected:['a','b','c'],phase:'lobby',round:0,logs:[]};
  beginGame(r);setBet(r,a,200,true);setBet(r,b,100,true);setBet(r,c,300,true);
  return {r,host,a,b,c};
}
test('イカサマ指摘：外れたら他の子に(自分+相手)×2、親にその合計',()=>{
  const {r,host,a,b,c}=room();
  accuse(r,a);assert.equal(r.phase,'judgement');
  resolveJudgement(r);
  assert.equal(b.points,1600);assert.equal(c.points,2000);assert.equal(host.points,4600);assert.equal(a.points,1000-3200);
  assert.equal(r.phase,'finished');assert.equal(r.judgement.cheated,false);
});
test('イカサマ指摘：当たったら親が掛け金の10倍を払う',()=>{
  const {r,host,a,b,c}=room();
  tickGame(r);assert.equal(r.phase,'playing');
  rollPlayer(r,host,Date.now(),false,true);
  assert.ok(host.dice.every(v=>v>=4));assert.equal(r.game.cheated,true);
  accuse(r,a);resolveJudgement(r);
  assert.equal(a.points,3000);assert.equal(host.points,1000);assert.equal(b.points,1000);assert.equal(c.points,1000);
  assert.equal(r.judgement.cheated,true);
});
test('イカサマ指摘・シゴロ賽を使える人と場面',()=>{
  const {r,host,a}=room();
  assert.throws(()=>accuse(r,host),/子だけ/);
  tickGame(r);
  r.game.turnIndex=r.game.roundOrder.indexOf('a');
  assert.throws(()=>rollPlayer(r,a,Date.now(),false,true),/使えません/);
  const other=room();other.r.gameType='chinchiro-fixed';
  assert.throws(()=>accuse(other.r,other.a),/指摘できません/);
  tickGame(other.r);assert.throws(()=>rollPlayer(other.r,other.host,Date.now(),false,true),/使えません/);
});
