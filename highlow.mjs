// ハイ＆ロー: the host turns the next card, every listener may bet on it.
// Flow: bets open → host flips the face-down card on the right (settles bets) → host moves on,
// the flipped card becomes the new current card on the left and betting opens again.
// Payout (returned amount): high/low hit = bet x2, same rank = bet x1, miss = 0.
// Optional colour call multiplies that: right colour x2, wrong colour = 0.
const SUITS=['S','H','D','C'];
export const RED=new Set(['H','D']);
export const HL_GAME='highlow';
// 'highlow-bunny' is the same game with the illustrated J/Q/K deck
export const HL_GAMES=new Set([HL_GAME,'highlow-bunny']);
function uniform(n){const limit=Math.floor(4294967296/n)*n;let v;do{v=crypto.getRandomValues(new Uint32Array(1))[0]}while(v>=limit);return v%n}
function reject(message,status=400){throw Object.assign(new Error(message),{status})}
const balance=p=>p.points??1000;
export const cardColor=c=>RED.has(c.suit)?'red':'black';
export function freshDeck(exclude){
  const deck=[];for(const suit of SUITS)for(let rank=1;rank<=13;rank++)if(!(exclude&&exclude.rank===rank&&exclude.suit===suit))deck.push({rank,suit});
  for(let i=deck.length-1;i>0;i--){const j=uniform(i+1);[deck[i],deck[j]]=[deck[j],deck[i]]}
  return deck;
}
export const maxStake=p=>Math.max(0,Math.floor(balance(p)/100)*100);
export function payout(bet,prev,next){
  const diff=next.rank-prev.rank;
  const base=!diff?bet.amount:(diff>0)===(bet.pick==='high')?bet.amount*2:0;
  const colorHit=bet.color?cardColor(next)===bet.color:null;
  const returned=bet.color?(colorHit?base*2:0):base;
  return {returned,delta:returned-bet.amount,outcome:!diff?'tie':(diff>0)===(bet.pick==='high')?'hit':'miss',colorHit};
}
export function hlInit(r){
  const deck=freshDeck();const current=deck.pop();
  r.hl={deck,current,revealed:null,round:1,bets:{},last:null,history:[current],reshuffled:false};
}
export function hlBet(r,p,b){
  if(!r.hl)reject('ハイ＆ローの部屋ではありません');
  if(p===r.host)reject('配信者はカードをめくる係です');
  if(r.hl.revealed)reject('次のゲームが始まるまでお待ちください');
  if(b.pick==null){delete r.hl.bets[p.id];return}
  if(!['high','low'].includes(b.pick))reject('ハイかローを選んでください');
  if(b.color!=null&&!['red','black'].includes(b.color))reject('色の選択が不正です');
  const amount=Number(b.amount);
  if(!Number.isSafeInteger(amount)||amount<0||amount%100)reject('ベットは100点単位で選んでください');
  if(amount>maxStake(p))reject('持ち点を超えるベットはできません');
  r.hl.bets[p.id]={amount,pick:b.pick,color:b.color??null};
}
export function cpuHighLowBets(r,players){
  const cur=r.hl.current;
  for(const p of players){
    if(!p.demo)continue;
    const pick=cur.rank>=8?'low':cur.rank<=6?'high':(uniform(2)?'high':'low');
    const cap=maxStake(p),amount=p.cpuKind==='devil'?Math.min(cap,Math.ceil(balance(p)/300)*100):Math.min(cap,uniform(2)*100);
    r.hl.bets[p.id]={amount:Math.max(0,amount),pick,color:p.cpuKind==='devil'&&uniform(2)?(uniform(2)?'red':'black'):null};
  }
}
export function hlFlip(r,players,at=Date.now()){
  if(!r.hl)reject('ハイ＆ローの部屋ではありません');
  const hl=r.hl,prev=hl.current;
  if(hl.revealed)reject('もうめくりました。「次のゲームへ」で進めてください');
  if(!hl.deck.length){hl.deck=freshDeck(prev);hl.reshuffled=true}else hl.reshuffled=false;
  const next=hl.deck.pop();
  const byId=new Map(players.map(p=>[p.id,p]));
  const results=[];
  for(const [id,bet] of Object.entries(hl.bets)){
    const p=byId.get(id);if(!p)continue;
    const amount=Math.min(bet.amount,maxStake(p)),res=payout({...bet,amount},prev,next);
    p.points=balance(p)+res.delta;
    if(res.delta>0)p.hlWins=(p.hlWins||0)+1;
    // 連勝: a right call (high/low, and the colour if one was called) adds one, any miss resets to 0.
    // Same rank without a colour call is neither. Rounds without a bet leave the count alone.
    const won=(res.outcome==='hit'&&res.colorHit!==false)||(res.outcome==='tie'&&res.colorHit===true);
    const lost=res.outcome==='miss'||res.colorHit===false;
    if(won)p.hlStreak=(p.hlStreak||0)+1;else if(lost)p.hlStreak=0;
    results.push({id,name:p.name,amount,pick:bet.pick,color:bet.color,...res,won,lost,streak:p.hlStreak||0,points:p.points});
  }
  results.sort((a,b)=>b.delta-a.delta||b.won-a.won||a.lost-b.lost);
  hl.last={round:hl.round,prev,next,results,at};
  hl.history.push(next);hl.history=hl.history.slice(-12);
  hl.revealed=next;hl.bets={};
  return hl.last;
}
export function hlNext(r){
  if(!r.hl)reject('ハイ＆ローの部屋ではありません');
  const hl=r.hl;if(!hl.revealed)reject('まだカードをめくっていません');
  hl.current=hl.revealed;hl.revealed=null;hl.round++;
}
export function hlState(r,me){
  const hl=r.hl;if(!hl)return null;
  const bets=Object.entries(hl.bets),count=k=>bets.filter(([,b])=>b.pick===k||b.color===k).length;
  return {round:hl.round,current:hl.current,revealed:hl.revealed,deckLeft:hl.deck.length,history:hl.history,last:hl.last,reshuffled:hl.reshuffled,
    myBet:hl.bets[me.id]||null,
    tally:{total:bets.length,high:count('high'),low:count('low'),red:count('red'),black:count('black'),stake:bets.reduce((s,[,b])=>s+b.amount,0)},
    bets:bets.map(([id,b])=>({id,...b})),
    streaks:Object.fromEntries([...r.players.values()].filter(p=>p.hlStreak).map(p=>[p.id,p.hlStreak]))};
}
export const cardLabel=c=>`${{S:'♠',H:'♥',D:'♦',C:'♣'}[c.suit]}${({1:'A',11:'J',12:'Q',13:'K'})[c.rank]||c.rank}`;
