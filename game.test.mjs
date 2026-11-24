import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cpuBet,evaluate,exchange,beginGame,prepareRound,setBet,startRoundIfReady,settleRound,nextRound,tickGame,rollPlayer} from './game.mjs';
const roleDice={pin:[1,1,1],triple:[6,6,6],shigoro:[4,5,6],hifumi:[1,2,3],six:[2,2,6],five:[2,2,5],none:[2,3,5]};
function room(n=4){const p=i=>({id:'p'+i,auth:'t'+i,name:'member'+i,points:1000,plays:0,want:true,seen:Date.now()});const host=p(0),players=new Map(Array.from({length:n-1},(_,i)=>{const x=p(i+1);return [x.id,x]}));return {id:'test',host,players,selected:[...players.keys()],logs:[],phase:'lobby'}}
const people=r=>[r.host,...r.players.values()];
function fixedRound(r,parent,child){for(const p of people(r)){p.dice=p.id===r.game.dealerId?parent:child;p.done=true;p.bet=100}r.phase='playing'}
test('役順位・倍率・123倍払い・引分け・ゾロ目の数字比較',()=>{
 const d=roleDice;for(const [role,m] of [['six',1],['shigoro',2],['triple',3],['pin',5]]){assert.equal(exchange(d.none,d[role],100),100*m);assert.equal(exchange(d[role],d.none,100),-100*m)}
 assert.equal(exchange(d.hifumi,d.five,100),200);assert.equal(exchange(d.five,d.hifumi,100),-200);assert.equal(exchange(d.pin,d.hifumi,100),-500);assert.equal(exchange(d.shigoro,d.hifumi,100),-200);
 assert.equal(exchange(d.hifumi,d.hifumi,100),0);assert.equal(exchange(d.six,d.six,100),0);assert.equal(exchange([4,4,4],[6,6,6],100),300);
 const all=[];for(let a=1;a<=6;a++)for(let b=1;b<=6;b++)for(let c=1;c<=6;c++)all.push([a,b,c]);
 for(const a of all)for(const b of all)assert.ok(exchange(a,b,100)===-exchange(b,a,100));
});
test('2〜4人の抽選は全員の順列、全員準備するまで開始しない',()=>{
 for(let n=2;n<=4;n++){const r=room(n);beginGame(r);assert.equal(r.phase,'betting');assert.equal(r.game.order.length,n);assert.equal(new Set(r.game.order).size,n);assert.equal(r.game.dealerId,r.game.order[0]);
  const children=people(r).filter(p=>p.id!==r.game.dealerId);
  for(let i=0;i<children.length;i++){setBet(r,children[i],100,true);if(i<children.length-1){startRoundIfReady(r);assert.equal(r.phase,'betting')}}startRoundIfReady(r);assert.equal(r.phase,'playing');
  assert.throws(()=>setBet(r,children[0],100,true));
 }
});
test('資金0以下は100点のみ、親は全額受け、準備解除と不正掛け金拒否',()=>{
 const r=room();beginGame(r);const p=people(r).find(p=>p.id!==r.game.dealerId);p.points=-500;
 assert.throws(()=>setBet(r,p,200,true));setBet(r,p,100,true);assert.equal(p.ready,true);setBet(r,p,100,false);assert.equal(p.ready,false);
 p.points=1000;assert.throws(()=>setBet(r,p,1100,true));assert.throws(()=>setBet(r,p,150,true));assert.throws(()=>setBet(r,p,-100,true));assert.throws(()=>setBet(r,people(r).find(x=>x.id===r.game.dealerId),100,true));
});
test('ラウンド精算は一度だけ、総額保存、一巡するまで負債者も継続',()=>{
 const r=room(4);beginGame(r);const first=r.game.dealerId;const parent=people(r).find(p=>p.id===first);parent.points=100;
 fixedRound(r,roleDice.hifumi,roleDice.pin);settleRound(r);
 assert.equal(parent.points,-1400);assert.equal(r.phase,'settlement');assert.equal(r.players.size,3);
 assert.equal(people(r).reduce((v,p)=>v+p.points,0),3100);const after=people(r).map(p=>p.points);settleRound(r);assert.deepEqual(people(r).map(p=>p.points),after);
 const dealers=[first];for(let round=1;round<4;round++){nextRound(r);dealers.push(r.game.dealerId);if(parent.id!==r.game.dealerId)setBet(r,parent,100,true);fixedRound(r,roleDice.six,roleDice.six);settleRound(r)}
 assert.equal(new Set(dealers).size,4);assert.equal(r.phase,'finished');if(first!==r.host.id){assert.ok(r.players.has(first));assert.ok(!r.selected.includes(first));assert.equal(r.players.get(first).want,true)}
});
test('全員0点以下でもホストは卓に残り、次ゲームも参加できる',()=>{
 const r=room(2);beginGame(r);r.game.roundIndex=1;prepareRound(r);for(const p of people(r))p.points=0;fixedRound(r,roleDice.six,roleDice.six);settleRound(r);assert.equal(r.phase,'finished');assert.equal(r.players.size,1);assert.equal(r.selected.length,0);assert.equal(r.players.get('p1').auth,'t1');assert.equal(r.players.get('p1').want,true);const p={id:'new',name:'new',auth:'newtoken',points:1000,plays:0,want:true};r.players.set(p.id,p);r.selected=[p.id];r.host.points=-1000;r.hostSatOut=true;beginGame(r);assert.ok(r.game.order.includes(r.host.id));if(r.game.dealerId!==r.host.id){setBet(r,r.host,100,true);assert.throws(()=>setBet(r,r.host,200,true))}
});

test('掛け金期限は未準備だけ100点にし、確定済み金額は維持する',()=>{
 const original=Date.now;let clock=100000;Date.now=()=>clock;
 try{const r=room(3);beginGame(r);const children=people(r).filter(p=>p.id!==r.game.dealerId);setBet(r,children[0],300,true);setBet(r,children[1],500,false);
 clock+=19999;tickGame(r);assert.equal(r.phase,'betting');clock++;tickGame(r);assert.equal(r.phase,'playing');assert.equal(children[0].bet,300);assert.equal(children[1].bet,100);assert.equal(r.game.rollDeadlineAt,clock+20000);
 }finally{Date.now=original}
});

test('精算後の親交代も20秒まで待つ',()=>{
 const oldNow=Date.now;let clock=100000;Date.now=()=>clock;
 try{const r=room(2);beginGame(r);fixedRound(r,roleDice.six,roleDice.six);settleRound(r,clock);clock+=19999;tickGame(r);assert.equal(r.phase,'settlement');clock++;tickGame(r);assert.equal(r.phase,'betting');assert.equal(r.round,2);assert.equal(r.game.betDeadlineAt,clock+20000)}finally{Date.now=oldNow}
});

test('デビルは所持金1/3の100点単位切り上げ、残額と0以下の最低100点を守る',()=>{
 for(const [points,expected] of [[3000,1000],[1000,400],[900,300],[800,300],[400,200],[300,100],[200,100],[100,100],[0,100],[-200,100]])assert.equal(cpuBet({cpuKind:'devil',points}),expected);
});
test('風呂は100点・200点の両方を抽選し、残高不足時だけ100点になる',()=>{
 const original=crypto.getRandomValues;
 try{for(const draw of [0,1]){crypto.getRandomValues=a=>(a[0]=draw,a);assert.equal(cpuBet({cpuKind:'bath',points:1000}),(draw+1)*100);assert.equal(cpuBet({cpuKind:'bath',points:100}),100);assert.equal(cpuBet({cpuKind:'bath',points:0}),100);assert.equal(cpuBet({cpuKind:'bath',points:-100}),100)}}finally{crypto.getRandomValues=original}
});
test('CPUはラウンド開始時に準備し、手番と振り直しはアニメーション終了後すぐ行動',()=>{
 const oldNow=Date.now;let clock=100000;Date.now=()=>clock;
 try{const r=room(3),devil=r.players.get('p1'),bath=r.players.get('p2');devil.demo=true;devil.cpuKind='devil';bath.demo=true;bath.cpuKind='bath';
 beginGame(r);r.game.order=['p0','p1','p2'];r.game.roundIndex=0;prepareRound(r,clock);assert.equal(r.phase,'playing');assert.equal(devil.bet,400);assert.equal(devil.ready,true);assert.ok([100,200].includes(bath.bet));assert.equal(bath.ready,true);
 for(let i=0;i<3&&!r.host.done;i++){rollPlayer(r,r.host,clock);clock=r.shot.startedAt+r.shot.duration}
 assert.equal(r.game.nextTurnAt,clock);tickGame(r);assert.equal(r.shot.playerId,devil.id);assert.equal(r.shot.startedAt,clock);
 const attempts=devil.attempts;clock=r.shot.startedAt+r.shot.duration;tickGame(r);
 if(!devil.done||devil.attempts>attempts){assert.equal(r.shot.playerId,devil.id);assert.equal(devil.attempts,attempts+1);assert.equal(r.shot.startedAt,clock)}else{assert.equal(r.shot.playerId,bath.id);assert.equal(r.shot.startedAt,clock)}
 }finally{Date.now=oldNow}
});

test('親固定はホストが毎ゲーム親、1ラウンドで精算・終了し、各子はホストとのみ精算する',()=>{
 for(const count of [2,3,4]){
 const r=room(count);r.gameType='chinchiro-fixed';
 for(let game=0;game<4;game++){
 beginGame(r);assert.equal(r.game.dealerId,r.host.id);assert.equal(r.game.totalRounds,1);assert.equal(r.game.roundOrder[0],r.host.id);
 for(const p of people(r)){p.done=true;p.bet=100;p.dice=p===r.host?roleDice.five:roleDice.pin}
 const before=people(r).map(p=>p.points);settleRound(r);assert.equal(r.phase,'finished');assert.equal(r.settlement.dealerId,r.host.id);assert.equal(r.settlement.matchups.length,count-1);
 assert.equal(r.host.points,before[0]-500*(count-1));for(let i=1;i<count;i++)assert.equal(people(r)[i].points,before[i]+500);
 }
 }
});
