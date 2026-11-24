import {simulateThrow} from './physics.mjs';
import {gameDefinition} from './public/games.js';
export const AUTO_DELAY=20000;
export function reject(message,status=400){throw Object.assign(new Error(message),{status})}
export const member=(r,id)=>id===r.host.id?r.host:r.players.get(id);
export const balance=p=>p.points??1000;
export function cpuBet(p){
 const available=Math.max(100,Math.floor(balance(p)/100)*100);
 const desired=(p.cpuKind==='devil'||p.name==='😈デビルゴッドダイス')?Math.ceil(balance(p)/300)*100:(uniform(2)+1)*100;
 return Math.max(100,Math.min(available,desired));
}
export const inGame=r=>['betting','playing','settlement','judgement'].includes(r.phase);
export const JUDGE_DELAY=4000;
export function evaluate(dice){
  if(dice.length!==3)return {name:'未投',rank:-1,pip:0,multiplier:1};
  const [a,b,c]=[...dice].sort((a,b)=>a-b);
  if(a===c)return a===1?{name:'ピンゾロ',rank:5,pip:0,multiplier:5}:{name:'ゾロ目',rank:4,pip:a,multiplier:3};
  if(a===4&&b===5&&c===6)return {name:'シゴロ',rank:3,pip:0,multiplier:2};
  if(a===1&&b===2&&c===3)return {name:'ヒフミ',rank:0,pip:0,multiplier:1};
  const pip=a===b?c:b===c?a:0;
  return pip?{name:`${pip}の目`,rank:2,pip,multiplier:1}:{name:'目なし',rank:1,pip:0,multiplier:1};
}
export function exchange(parentDice,childDice,bet){
  const p=evaluate(parentDice),c=evaluate(childDice),comparison=c.rank-p.rank||c.pip-p.pip;
  if(!comparison)return 0;
  const winner=comparison>0?c:p,loser=comparison>0?p:c;
  return Math.sign(comparison)*bet*Math.max(winner.multiplier,loser.rank===0?2:1);
}
export function logEvent(r,text){r.logs.unshift(text);r.logs.length=Math.min(r.logs.length,20)}
export function seats(r){return r.game&&r.phase!=='lobby'?r.game.roundOrder.map(id=>member(r,id)).filter(Boolean):[r.host,...r.selected.map(id=>member(r,id)).filter(Boolean)]}
function uniform(n){const limit=Math.floor(4294967296/n)*n;let v;do{v=crypto.getRandomValues(new Uint32Array(1))[0]}while(v>=limit);return v%n}
export function beginGame(r){
  const players=seats({...r,game:null,phase:'lobby'});
  if(players.length<2||players.length>4)reject('参加者を2〜4人にしてください');
  const order=players.map(p=>p.id);for(let i=order.length-1;i>0;i--){const j=uniform(i+1);[order[i],order[j]]=[order[j],order[i]]}
  const fixed=gameDefinition(r.gameType).dealer==='host';
  if(fixed){order.splice(order.indexOf(r.host.id),1);order.unshift(r.host.id)}
  r.game={order,totalRounds:fixed?1:order.length,roundIndex:0,roundOrder:[],settledRound:-1,cheated:false};r.gameNumber=(r.gameNumber||0)+1;r.settlement=null;r.judgement=null;
  for(const p of players){p.plays++;p.gameStartPoints=balance(p)}
  prepareRound(r);
  logEvent(r,`第${r.gameNumber}ゲーム：${fixed?'ホストが親。子の順番を抽選しました':'親と順番を抽選しました'}`);
}
export function prepareRound(r,at=Date.now()){
  const g=r.game;g.roundOrder=[...g.order.slice(g.roundIndex),...g.order.slice(0,g.roundIndex)];g.dealerId=g.roundOrder[0];g.turnIndex=0;g.nextTurnAt=null;g.demoRollAt=null;g.demoReadyAt=at+AUTO_DELAY;g.betStartedAt=at;g.betDeadlineAt=at+AUTO_DELAY;g.rollDeadlineAt=null;g.nextRoundAt=null;g.timingVersion=2;
  r.round=g.roundIndex+1;r.phase='betting';r.shot=null;r.lastRollId=null;
  for(const p of seats(r)){p.dice=[];p.done=false;p.attempts=0;p.bet=100;p.ready=p.id===g.dealerId;p.roundDelta=null;if(p.demo&&p.id!==g.dealerId)setBet(r,p,cpuBet(p),true)}
  logEvent(r,`第${r.round}ラウンド：👑 ${member(r,g.dealerId).name}。子の掛け金を受付中`);
  startRoundIfReady(r,at);
}
export function setBet(r,p,amount,ready){
  if(r.phase!=='betting')reject('掛け金はラウンド開始前に決めてください');
  if(!r.game.roundOrder.includes(p.id)||p.id===r.game.dealerId)reject('掛け金を決めるのは参加中の子だけです',403);
  if(!Number.isSafeInteger(amount)||amount<100||amount%100!==0)reject('掛け金は100点単位です');
  if(balance(p)<=0&&amount!==100)reject('持ち点が0以下の間は100点だけ賭けられます');
  if(balance(p)>0&&amount>balance(p))reject('持ち点を超えて賭けられません');
  p.bet=amount;p.ready=!!ready;
}
export function startRoundIfReady(r,at=Date.now()){
  if(r.phase!=='betting'||!seats(r).every(p=>p.ready))return;
  r.phase='playing';r.game.turnIndex=0;r.game.turnStartedAt=at;r.game.rollDeadlineAt=at+AUTO_DELAY;r.game.demoRollAt=at+AUTO_DELAY;
  logEvent(r,`第${r.round}ラウンド開始。親はすべての掛け金を受けます`);
}
// シゴロ賽: faces 1・2・3 are copies of their opposite faces (6・5・4), so only 4〜6 can come up.
// The physics is unchanged; the die is simply labelled differently and drawn that way (shot.loaded).
export const loadedValue=v=>v<=3?7-v:v;
export function loadShot(shot){return {...shot,dice:shot.dice.map(loadedValue),loaded:true}}
export function rollPlayer(r,p,at=Date.now(),automatic=false,loaded=false){
  if(r.phase!=='playing'||r.game.roundOrder[r.game.turnIndex]!==p.id)reject('今はあなたの番ではありません');
  if(p.done)reject('出目は確定しています');
  if(r.shot&&at<r.shot.startedAt+r.shot.duration)reject('サイコロが止まるまで待ってね');
  if(loaded&&(!gameDefinition(r.gameType).cheat||p.id!==r.game.dealerId))reject('シゴロ賽は使えません',403);
  let shot;for(let i=0;i<5&&!shot;i++)shot=simulateThrow();if(!shot)reject('サイコロが安定しませんでした。もう一度振ってね');
  if(loaded){shot=loadShot(shot);r.game.cheated=true}
  r.shot={...shot,version:2,id:crypto.randomUUID(),playerId:p.id,startedAt:at};p.dice=shot.dice;p.attempts++;
  const role=evaluate(p.dice);p.done=role.name!=='目なし'||p.attempts>=3;r.lastRollId=p.id;
  logEvent(r,`${p.id===r.game.dealerId?'👑 ':''}${p.name}${p===r.host?' ⭐️':''}：${p.dice.join('・')} ${role.name}`);
  if(automatic&&!p.demo)logEvent(r,`${p.name}：20秒経過で自動投擲`);
  r.game.turnStartedAt=at+shot.duration;
  r.game.rollDeadlineAt=p.done?null:at+shot.duration+AUTO_DELAY;
  if(p.done)r.game.nextTurnAt=at+shot.duration+(member(r,r.game.roundOrder[r.game.turnIndex+1])?.demo?0:1200);
}
export function settleRound(r,at=Date.now()){
  const g=r.game;if(!g||g.settledRound===g.roundIndex)return;
  const players=seats(r);if(players.some(p=>!p.done))reject('全員の出目が確定していません');
  const parent=member(r,g.dealerId),deltas=Object.fromEntries(players.map(p=>[p.id,0]));const matchups=[];
  for(const child of players.filter(p=>p!==parent)){
    const delta=exchange(parent.dice,child.dice,child.bet);deltas[child.id]+=delta;deltas[parent.id]-=delta;
    matchups.push({childId:child.id,bet:child.bet,delta});
  }
  g.settledRound=g.roundIndex;
  for(const p of players){p.points=balance(p)+deltas[p.id];p.roundDelta=deltas[p.id]}
  r.settlement={round:r.round,dealerId:parent.id,matchups,rows:players.map(p=>({id:p.id,name:p.name,demo:!!p.demo,points:balance(p),delta:deltas[p.id],dice:p.dice,bet:p===parent?null:p.bet}))};
  logEvent(r,`第${r.round}ラウンド精算：${players.map(p=>`${p.name} ${deltas[p.id]>=0?'+':''}${deltas[p.id]}点`).join(' / ')}`);
  if(g.roundIndex+1<(g.totalRounds??g.order.length)){r.phase='settlement';g.nextRoundAt=at+AUTO_DELAY;return}
  r.phase='finished';r.lastGameRows=r.settlement.rows;
  for(const p of players)if(p!==r.host&&balance(p)<=0){
    logEvent(r,`${p.name}は持ち点0以下のため待機所へ戻りました`);
    p.want=true;r.selected=r.selected.filter(id=>id!==p.id);
  }
  logEvent(r,gameDefinition(r.gameType).dealer==='host'?'ホストとの精算が終わりました。ゲーム終了':'全員が親を務めました。ゲーム終了');
}
export function accuse(r,p,at=Date.now()){
  if(!gameDefinition(r.gameType).cheat)reject('このゲームではイカサマを指摘できません');
  if(!['betting','playing'].includes(r.phase))reject('ゲーム中だけ指摘できます');
  const g=r.game;if(!g.roundOrder.includes(p.id)||p.id===g.dealerId)reject('指摘できるのは卓についている子だけです',403);
  r.phase='judgement';g.judgement={accuserId:p.id,at,revealAt:at+JUDGE_DELAY};
  logEvent(r,`${p.name}がイカサマを指摘！ ゲームは不成立。判定タイム`);
}
export function resolveJudgement(r,at=Date.now()){
  const g=r.game,j=g.judgement,players=seats(r),parent=member(r,g.dealerId),accuser=member(r,j.accuserId);
  const deltas=Object.fromEntries(players.map(p=>[p.id,0])),cheated=!!g.cheated;
  if(cheated){const pay=accuser.bet*10;deltas[parent.id]-=pay;deltas[accuser.id]+=pay}
  else{
    let total=0;
    for(const child of players.filter(p=>p!==parent&&p!==accuser)){const pay=2*(accuser.bet+child.bet);deltas[child.id]+=pay;total+=pay}
    deltas[accuser.id]-=total*2;deltas[parent.id]+=total;
  }
  for(const p of players){p.points=balance(p)+deltas[p.id];p.roundDelta=deltas[p.id]}
  r.judgement={accuserId:accuser.id,accuserName:accuser.name,cheated,at};
  r.settlement={round:r.round,dealerId:parent.id,judgement:true,matchups:[],rows:players.map(p=>({id:p.id,name:p.name,demo:!!p.demo,points:balance(p),delta:deltas[p.id],dice:p.dice,bet:p===parent?null:p.bet}))};
  g.settledRound=g.roundIndex;r.phase='finished';r.lastGameRows=r.settlement.rows;
  logEvent(r,cheated?`判定：イカサマ発覚！ ${parent.name}が${accuser.name}に${-deltas[parent.id]}点を支払い`:`判定：イカサマなし。${accuser.name}が合計${-deltas[accuser.id]}点を支払い`);
  for(const p of players)if(p!==r.host&&balance(p)<=0){logEvent(r,`${p.name}は持ち点0以下のため待機所へ戻りました`);p.want=true;r.selected=r.selected.filter(id=>id!==p.id)}
}
export function tickGame(r){
  if(inGame(r)&&!r.game){r.phase='lobby';r.shot=null;return}
  const now=Date.now();let throws=0;
  for(let events=0;events<128;events++){
    const g=r.game;if(!g)return;
    if(g.timingVersion!==2){
      if(g.betStartedAt)g.betDeadlineAt=g.betStartedAt+AUTO_DELAY;
      if(g.turnStartedAt&&g.rollDeadlineAt)g.rollDeadlineAt=g.turnStartedAt+AUTO_DELAY;
      if(g.nextRoundAt)g.nextRoundAt+=AUTO_DELAY-3000;
      g.demoReadyAt=g.betDeadlineAt;g.demoRollAt=g.rollDeadlineAt;g.timingVersion=2;
    }
    if(r.phase==='judgement'){if(now>=g.judgement.revealAt){resolveJudgement(r,g.judgement.revealAt);continue}return}
    if(r.phase==='betting'){
      g.betStartedAt??=now;g.betDeadlineAt??=g.betStartedAt+AUTO_DELAY;
      if(seats(r).every(p=>p.ready)){startRoundIfReady(r,now);continue}
      for(const p of seats(r))if(p.demo&&p.id!==g.dealerId&&!p.ready)setBet(r,p,cpuBet(p),true);
      if(seats(r).every(p=>p.ready)){startRoundIfReady(r,Math.min(now,g.betDeadlineAt));continue}
      if(now>=g.betDeadlineAt){
        for(const p of seats(r))if(p.id!==g.dealerId&&!p.ready){p.bet=100;p.ready=true;logEvent(r,`${p.name}：20秒経過で100点を自動確定`)}
        startRoundIfReady(r,g.betDeadlineAt);continue;
      }
      return;
    }
    if(r.phase==='settlement'){
      g.nextRoundAt??=now+AUTO_DELAY;
      if(now>=g.nextRoundAt){nextRound(r,g.nextRoundAt);continue}
      return;
    }
    if(r.phase!=='playing')return;
    if(g.nextTurnAt&&now>=g.nextTurnAt){const at=g.nextTurnAt;g.turnIndex++;g.nextTurnAt=null;g.turnStartedAt=at;g.rollDeadlineAt=at+AUTO_DELAY;g.demoRollAt=at+AUTO_DELAY;continue}
    const current=member(r,g.roundOrder[g.turnIndex]);
    if(!current){settleRound(r,g.turnStartedAt||now);continue}
    if(current.done)return;
    g.turnStartedAt??=now;g.rollDeadlineAt??=g.turnStartedAt+AUTO_DELAY;
    const at=current.demo?g.turnStartedAt:g.rollDeadlineAt;
    if(now<at||throws>=3)return;
    rollPlayer(r,current,at,true);throws++;
  }
}
export function nextRound(r,at=Date.now()){if(r.phase!=='settlement')reject('ラウンド精算後に進めます');r.game.roundIndex++;prepareRound(r,at)}
export function timerState(r){
 const g=r.game;if(!g)return null;
 if(r.phase==='betting')return {kind:'bet',start:g.betStartedAt,end:g.betDeadlineAt,total:AUTO_DELAY,label:'掛け金・準備'};
 if(r.phase==='judgement')return {kind:'judge',start:g.judgement.at,end:g.judgement.revealAt,total:JUDGE_DELAY,label:'判定'};
 if(r.phase==='settlement')return {kind:'next',start:g.nextRoundAt-AUTO_DELAY,end:g.nextRoundAt,total:AUTO_DELAY,label:'次の親へ'};
 if(r.phase==='playing'){
  const p=member(r,g.roundOrder[g.turnIndex]);
  if(p&&!p.demo&&!p.done&&g.rollDeadlineAt)return {kind:'roll',start:g.turnStartedAt,end:g.rollDeadlineAt,total:AUTO_DELAY,label:'サイコロ'};
 }
 return null;
}
export function returnLobby(r){if(inGame(r))reject('進行中のゲームは終了できません');r.game=null;r.phase='lobby';r.shot=null;r.settlement=null;r.judgement=null}
