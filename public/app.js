import {GAMES,gameDefinition} from './games.js';

const $=s=>document.querySelector(s), app=$('#app');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const base=new URL('./',location.href), room=new URL(location.href).searchParams.get('room');
const readToken=id=>{try{return localStorage.getItem(`table:${id}`)||sessionStorage.getItem(`table:${id}`)}catch{return null}};
let auth=room?readToken(room):null,state=null,busy=false,last='',checking=false,clockOffset=0;
let recoveringRoom=auth?room:null;
let editing=null,menuOpen=false,logOpen=false,toastTimer,rollTimer;
const betDrafts={},firstSeen=new Map();let knownIds=null;
const now=()=>Date.now()+clockOffset;

// ---------- storage / connection ----------
function remember(s){if(!auth||!s)return;try{localStorage.setItem(`table:${s.id}`,auth);sessionStorage.setItem(`table:${s.id}`,auth);localStorage.setItem('table:lastRoom',JSON.stringify({id:s.id,title:s.title}))}catch{}}
function forget(id){try{localStorage.removeItem(`table:${id}`);sessionStorage.removeItem(`table:${id}`);const recent=JSON.parse(localStorage.getItem('table:lastRoom')||'null');if(recent?.id===id)localStorage.removeItem('table:lastRoom')}catch{}auth=null;recoveringRoom=null;state=null;last='';knownIds=null;connection(false)}
function connection(lost){const b=$('#connection');if(!b)return;b.hidden=!lost;b.innerHTML=lost?'<strong>通信が切れています</strong><span>自動で再接続中… 戻ると続きから参加できます</span>':''}
function resumeLink(){try{const recent=JSON.parse(localStorage.getItem('table:lastRoom')||'null');if(!recent||!readToken(recent.id))return '';const url=new URL(base);url.searchParams.set('room',recent.id);return `<a class="resume" href="${esc(url.href)}">${icon('back')}<span><strong>前の部屋に戻る</strong><small>${esc(recent.title)} · ROOM ${esc(recent.id)}</small></span></a>`}catch{return ''}}
function toast(s){const t=$('#toast');t.textContent=s;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),3200)}
async function api(path,data){const r=await fetch(new URL(`api/${path}`,base),{method:data?'POST':'GET',signal:AbortSignal.timeout(8000),headers:{'content-type':'application/json',...(auth?{authorization:`Bearer ${auth}`}:{})},...(data?{body:JSON.stringify(data)}:{})});const b=await r.json();if(!r.ok)throw Object.assign(Error(b.error),{status:r.status});if(b.serverNow)clockOffset=b.serverNow-Date.now();else if(b.state?.serverNow)clockOffset=b.state.serverNow-Date.now();return b}

// ---------- small helpers ----------
const ICONS={
 share:'<path d="M12 3v12"/><path d="M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
 menu:'<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
 back:'<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
 mark:'<path d="M12 2.5l9.5 9.5-9.5 9.5L2.5 12z"/>'
};
const icon=n=>`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;
const number=n=>Number(n??0).toLocaleString('ja-JP'),signed=n=>`${n>0?'+':n<0?'−':'±'}${number(Math.abs(n??0))}`;
const PALETTE=['#7A6030','#4B3A6B','#2F5462','#7A4A3A','#3F5B3A','#6B3F4E','#34506B','#5E5A3A','#4D4D57'];
const colorOf=id=>{let h=0;for(const c of String(id))h=(h*31+c.charCodeAt(0))>>>0;return PALETTE[h%PALETTE.length]};
const plain=name=>String(name||'').replace(/^[\p{Extended_Pictographic}️‍]+/u,'')||String(name||'?');
const avatar=(p,size='')=>`<span class="avatar ${size}" style="background:${colorOf(p.id)}" aria-hidden="true">${esc([...plain(p.name)][0]||'?')}</span>`;
function role(d){if(!d?.length)return '';const a=[...d].sort();if(a[0]===a[2])return a[0]===1?'ピンゾロ':`${a[0]}のゾロ目`;if(a.join('')==='456')return 'シゴロ';if(a.join('')==='123')return 'ヒフミ';if(a[0]===a[1])return `${a[2]}の目`;if(a[1]===a[2])return `${a[0]}の目`;return '目なし'}
const hot=r=>/ピンゾロ|ゾロ目|シゴロ/.test(r), bad=r=>/ヒフミ|目なし/.test(r);

// ---------- 3D dice (server physics frames rendered with CSS 3D) ----------
const S=40,HALF=24;
const PIPS={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
const FACES=[[1,'rotateY(90deg)'],[6,'rotateY(-90deg)'],[2,'rotateX(90deg)'],[5,'rotateX(-90deg)'],[3,''],[4,'rotateY(180deg)']];
const faceHtml=n=>`<span class="pips">${Array.from({length:9},(_,k)=>`<i class="${PIPS[n].includes(k)?(n===1?'on red':'on'):''}"></i>`).join('')}</span>`;
const dieHtml=label=>`<div class="die3d">${FACES.map(([n,r])=>`<div class="face" style="transform:${r} translateZ(${HALF}px)">${faceHtml(label(n))}</div>`).join('')}</div>`;
const DIE=dieHtml(n=>n),LOADED_DIE=dieHtml(n=>n<=3?7-n:n); // シゴロ賽: 1・2・3 are copies of 6・5・4
const IDLE=[-1.7,0,1.7].map(x=>[x,.58,.2,0,0,Math.SQRT1_2,Math.SQRT1_2]);
function qmat([x,y,z,w]){return [[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]}
function dieTransform(f){
 const M=qmat(f.slice(3)),F=[1,-1,1],m=(i,j)=>(F[i]*M[i][j]*F[j]).toFixed(4);
 const X=(f[0]*S).toFixed(1),Y=(-f[1]*S).toFixed(1),Z=(f[2]*S).toFixed(1);
 return {die:`matrix3d(${m(0,0)},${m(1,0)},${m(2,0)},0,${m(0,1)},${m(1,1)},${m(2,1)},0,${m(0,2)},${m(1,2)},${m(2,2)},0,${X},${Y},${Z},1)`,
  shadow:`translate3d(${X}px,-1px,${Z}px) rotateX(90deg) scale(${Math.max(.45,1-(f[1]-.58)*.18).toFixed(2)})`};
}
function poseAt(shot,t){
 if(!shot?.frames?.length)return IDLE;
 const idx=Math.max(0,Math.min(shot.frames.length-1,(t-shot.startedAt)/shot.frameMs)),a=shot.frames[Math.floor(idx)],b=shot.frames[Math.min(Math.floor(idx)+1,shot.frames.length-1)],k=idx%1;
 return a.map((d,i)=>{const e=b[i],p=d.map((v,j)=>v+(e[j]-v)*k);const dot=d[3]*e[3]+d[4]*e[4]+d[5]*e[5]+d[6]*e[6];if(dot<0)for(let j=3;j<7;j++)p[j]=d[j]-(e[j]+d[j])*k;const l=Math.hypot(p[3],p[4],p[5],p[6])||1;for(let j=3;j<7;j++)p[j]/=l;return p});
}
let diceRaf;
function shownShot(){return state&&['playing','settlement','finished','judgement'].includes(state.phase)?state.shot:null}
function paintDice(){
 const dice=document.querySelectorAll('.die3d'),shadows=document.querySelectorAll('.die-shadow');if(!dice.length)return false;
 const shot=shownShot(),pose=poseAt(shot,now());
 pose.forEach((f,i)=>{const t=dieTransform(f);if(dice[i])dice[i].style.transform=t.die;if(shadows[i])shadows[i].style.transform=t.shadow});
 return !!shot&&now()<shot.startedAt+shot.duration;
}
function animateDice(){cancelAnimationFrame(diceRaf);const loop=()=>{if(paintDice())diceRaf=requestAnimationFrame(loop)};loop()}
const trayHtml=()=>`<div class="tray-view" role="img" aria-label="トレイの中で転がる3Dサイコロ"><div class="tray-world">
 <div class="tray-floor"></div><div class="tray-wall w1"></div><div class="tray-wall w2"></div><div class="tray-rim"></div>
 ${'<div class="die-shadow"></div>'.repeat(3)}${(shownShot()?.loaded?LOADED_DIE:DIE).repeat(3)}</div></div>`;

// ---------- entry ----------
const GAME_ICONS={
 dice:'<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/>',
 line:'<rect x="3" y="14" width="4" height="6" rx="1"/><rect x="10" y="10" width="4" height="10" rx="1"/><rect x="17" y="5" width="4" height="15" rx="1"/>',
 card:'<rect x="7" y="3" width="12" height="17" rx="2"/><path d="M5 6.5 3.6 7l3.6 13.4 7.3-2"/><path d="M13 9.5c-1.6 1.2-2.6 2.2-2.6 3.3a1.6 1.6 0 0 0 2.6 1.2 1.6 1.6 0 0 0 2.6-1.2c0-1.1-1-2.1-2.6-3.3z"/>'
};
// Families shown top to bottom. Add a new game here (and in games.js) to grow the menu.
const GAME_MENU=[
 {key:'chinchiro',name:'チンチロ',icon:'dice',desc:'サイコロ3つの役で勝負。配信者が指名した最大4人で卓を囲む。',variants:[['chinchiro-rotation','親回り','全員が1回ずつ親'],['chinchiro-fixed','親固定','配信者がずっと親・1回'],['chinchiro-cheat','イカサマあり','親固定・シゴロ賽OK']]},
 {key:'kotoba',name:'ことばならべ',icon:'line',desc:'数字は言わずに、お題に沿った言葉だけで小さい順に並べる協力ゲーム。最大8人、並べるのは配信者。',variants:[['kotoba','','']]},
 {key:'highlow',name:'ハイ＆ロー',icon:'card',desc:'配信者がカードをめくり、入室中のリスナー全員が次のカードに賭ける。',variants:[['highlow','','']]}
].map(f=>({...f,variants:f.variants.filter(([id])=>GAMES.some(g=>g.id===id))})).filter(f=>f.variants.length);
const gameIcon=n=>`<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GAME_ICONS[n]}</svg>`;
function gameMenuHtml(current){
 return `<div class="game-menu" role="radiogroup" aria-label="ゲーム">${GAME_MENU.map(f=>{
  const on=f.variants.some(([id])=>id===current),single=f.variants.length===1&&!f.variants[0][1];
  const head=`<span class="game-icon">${gameIcon(f.icon)}</span><span class="game-text"><strong>${f.name}</strong><small>${f.desc}</small></span>`;
  if(single)return `<label class="game-row ${on?'on':''}"><input type="radio" name="gameType" value="${f.variants[0][0]}" ${on?'checked':''}>${head}</label>`;
  return `<div class="game-row ${on?'on':''}">${head}<div class="variants">${f.variants.map(([id,label,sub])=>`<label class="variant"><input type="radio" name="gameType" value="${id}" ${id===current?'checked':''}><span><b>${label}</b><small>${sub}</small></span></label>`).join('')}</div></div>`;
 }).join('')}</div>`;
}
function rulesHtml(kind,fixed){
 return kind==='highlow'
  ?`<section class="card rules"><div class="card-head"><h2>ルール</h2><span>ハイ＆ロー</span></div><div class="roles"><span>ハイ/ロー的中 <b>2倍戻り</b></span><span>同じ数字 <b>返却</b></span><span>はずれ <b>没収</b></span><span>色も的中 <b>さらに2倍</b></span><span>色はずれ <b>没収</b></span></div><p class="note">次のカードが今より上（ハイ）か下（ロー）かに、0点から100点単位で賭ける。色の予想は任意。Aが一番弱くKが一番強い。配信者がめくるまでベットは変更できる。</p></section>`
  :kind==='cheat'?`<section class="card rules"><div class="card-head"><h2>ルール</h2><span>チンチロ イカサマあり</span></div><div class="roles"><span>ピンゾロ <b>×5</b></span><span>ゾロ目 <b>×3</b></span><span>シゴロ <b>×2</b></span><span>出目 <b>×1</b></span><span>ヒフミ <b>2倍払い</b></span><span>目なし <b>3回まで</b></span></div><p class="note">配信者がずっと親。親は普通のサイコロか、4・5・6しか出ない「シゴロ賽」を選んで振れる。子はゲーム中いつでも「イカサマを指摘」でき、その時点でゲームは不成立になり判定タイムへ。<br>当たり：親が指摘した子に掛け金の10倍を払う。<br>外れ：指摘した子が、ほかの子それぞれに（自分の掛け金＋その子の掛け金）×2を払い、親にもその合計を払う。</p></section>`
  :`<section class="card rules"><div class="card-head"><h2>ルール</h2><span>チンチロ ${fixed?'親固定':'親回り'}</span></div><div class="roles"><span>ピンゾロ <b>×5</b></span><span>ゾロ目 <b>×3</b></span><span>シゴロ <b>×2</b></span><span>出目 <b>×1</b></span><span>ヒフミ <b>2倍払い</b></span><span>目なし <b>3回まで</b></span></div><p class="note">${fixed?'配信者が親。子は配信者とだけ精算して1ゲーム。':'親と順番を抽選し、全員が親を務めたら1ゲーム。'}掛け金・投擲・次への進行はそれぞれ20秒で自動。0点以下でもゲーム中は100点で続行し、終了後にリスナーは待機所へ戻ります。</p></section>`;
}
const DEFAULT_TITLES={chinchiro:'今夜のチンチロ部屋','chinchiro-rotation':'今夜のチンチロ部屋','chinchiro-fixed':'今夜のチンチロ部屋',highlow:'今夜のハイ＆ロー',kotoba:'今夜のことばならべ'};
function entry(error=''){
 menuOpen=false;
 const hero=[4,5,6].map((n,i)=>`<span class="flat-die" style="--tilt:${[-8,5,-3][i]}deg">${faceHtml(n)}</span>`).join('');
 app.innerHTML=`<header class="topbar"><a class="brand" href="./">${icon('mark')}<span>あつまる卓</span></a></header>
 <section class="entry">${room?'':resumeLink()}
  <div class="hero-dice" aria-hidden="true">${hero}</div>
  <p class="eyebrow">STREAM TOGETHER</p>
  <h1>いつもの配信に、<br><em>みんなで囲む一卓</em>を。</h1>
  <p class="lead">待機所に集まって、呼ばれたら着席。<br>見ている時間も、遊ぶ時間もいっしょに。</p>
  <form id="entry" class="card form">
   <h2>${room?'待機所に入る':'配信部屋をつくる'}</h2>
   ${error?`<p class="error" role="alert">${esc(error)}</p>`:''}
   <label class="field"><span>あなたの名前</span><input name="name" maxlength="24" required placeholder="${room?'配信で使っている名前':'配信者名'}" autocomplete="nickname"></label>
   ${room?'':`<fieldset class="game-field"><legend>ゲームを選ぶ</legend>${gameMenuHtml('chinchiro-rotation')}</fieldset>
   <label class="field"><span>部屋の名前</span><input name="title" maxlength="24" value="今夜のチンチロ部屋" required></label>`}
   <button class="btn primary big" type="submit">${room?'入室する':'部屋をつくる'}</button>
   <p class="note">${room?'入室後は観戦から。遊びたくなったら「参加希望」を出そう。':'作成後、リスナー用の招待URLを共有できます。'}</p>
  </form>
  <ol class="steps"><li><b>01</b>集まる</li><li><b>02</b>呼ばれる</li><li><b>03</b>いっしょに遊ぶ</li></ol>
 </section>`;
 $('#entry').addEventListener('change',e=>{if(e.target.name!=='gameType')return;document.querySelectorAll('#entry .game-row').forEach(r=>r.classList.toggle('on',!!r.querySelector('input:checked')));const t=$('#entry input[name=title]');if(t&&Object.values(DEFAULT_TITLES).includes(t.value))t.value=DEFAULT_TITLES[e.target.value]||DEFAULT_TITLES.chinchiro});
 $('#entry').onsubmit=async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button[type=submit]');b.disabled=true;try{const data=Object.fromEntries(new FormData(e.currentTarget));const result=await api(room?`rooms/${room}/join`:'rooms',data);auth=result.token;state=result.state;recoveringRoom=null;remember(state);history.replaceState(null,'',`?room=${state.id}`);last='';render()}catch(err){toast(err.message);b.disabled=false}};
}

// ---------- room ----------
function trackPlayers(s){
 const ids=new Set(s.players.map(p=>p.id));
 if(knownIds){for(const p of s.players)if(!knownIds.has(p.id)&&!p.demo){firstSeen.set(p.id,Date.now());if(p.id!==s.me)toast(`${plain(p.name)} が${['betting','playing','settlement'].includes(s.phase)?'観戦に来ました':'入室しました'}`)}}
 else for(const p of s.players)firstSeen.set(p.id,0);
 knownIds=ids;
}
function render(){
 if(!state)return;
 const s=state;
 const rolling=!!(s.phase==='playing'&&s.shot&&now()<s.shot.startedAt+s.shot.duration);
 const signature=JSON.stringify({...s,serverNow:0,expiresAt:0})+rolling+editing+menuOpen+JSON.stringify(hlDraft)+[...firstSeen].filter(([,t])=>Date.now()-t<8000).length;
 if(signature===last){return}
 if(kbDrag){setTimeout(()=>render(),300);return}
 const act=document.activeElement;if(act?.id==='kb-word'&&kbComposing){setTimeout(()=>{last='';render()},400);return}
 last=signature;const refocus=act?.id==='kb-word'?[act.selectionStart,act.selectionEnd]:null;
 queueMicrotask(()=>{if(refocus){const el=$('#kb-word');if(el){el.focus();try{el.setSelectionRange(...refocus)}catch{}}}});
 if(s.hl){renderHighLow(s);return}
 if(s.kb){renderKotoba(s);return}
 const me=s.players.find(p=>p.id===s.me),host=s.players.find(p=>p.id===s.hostId);
 const def=gameDefinition(s.gameType),fixed=def.dealer==='host';
 const play=s.phase==='playing',betting=s.phase==='betting',settled=s.phase==='settlement',finished=s.phase==='finished',judging=s.phase==='judgement',locked=betting||play||settled||judging,open=!locked;
 const isSeated=p=>s.roundOrder.length&&locked?s.roundOrder.includes(p.id):p.id===s.hostId||s.selected.includes(p.id);
 const seatedMe=isSeated(me),myParent=s.dealerId===s.me;
 const you=p=>`${esc(p.name)}${p.id===s.me?'<small class="you">あなた</small>':''}`;
 const nameOnly=p=>`${esc(p.name)}${p.id===s.me?'（あなた）':''}`;
 const seatIds=locked?s.roundOrder:[s.hostId,...s.selected];
 const seatPlayers=seatIds.map(id=>s.players.find(p=>p.id===id)).filter(Boolean);
 const current=s.players.find(p=>p.id===s.turnId),parent=s.players.find(p=>p.id===s.dealerId);
 const focus=s.players.find(p=>p.id===s.shot?.playerId)||current||parent||host;
 const canRoll=play&&s.turnId===s.me&&!me.done&&!rolling;
 const watchers=s.players.filter(p=>!isSeated(p));
 const phaseNames={lobby:'メンバー募集中',betting:'掛け金・準備',playing:'対戦中',settlement:'ラウンド精算',finished:'ゲーム終了',judgement:'判定タイム'};
 const url=new URL(base);url.searchParams.set('room',s.id);

 // stage callout
 let big='',sub='',tone='';
 const cheat=!!s.cheatMode,accuser=judging?s.players.find(p=>p.id===s.judgement?.accuserId):null;
 if(judging){big='判定タイム';sub=`${accuser?plain(accuser.name):'子'} がイカサマを指摘！ ゲームは不成立`;tone='bad'}
 else if(rolling){big='コロコロ…'}
 else if((play||settled||finished)&&focus?.dice?.length){big=role(focus.dice);sub=`${focus.dice.join('・')} · ${focus.id===s.dealerId?'親の出目':`賭け ${number(focus.bet)}点`}`;tone=hot(big)?'hot':bad(big)?'bad':'mid'}
 else if(play&&current){big=current.id===s.me?'あなたの番':`${plain(current.name)} の番`;sub=current.attempts?`目なし。もう一度（${current.attempts}/3）`:''}
 else if(betting){big=myParent?'あなたが親':seatedMe?'掛け金を決めよう':'掛け金を受付中';sub=myParent||!seatedMe?'子が掛け金を決めています':'親は全額を受けます'}

 const children=seatPlayers.filter(p=>p.id!==s.dealerId),readyCount=children.filter(p=>p.ready).length;
 const betKey=`${s.id}:${s.gameNumber}:${s.round}`,maxBet=Math.max(100,Math.floor((me.points??0)/100)*100),half=Math.max(100,Math.floor((me.points??0)/200)*100);
 const draft=Math.max(100,Math.min(maxBet,Number(betDrafts[betKey]??me.bet??100)));
 const lowOnly=(me.points??0)<=0;

 const controls=betting&&seatedMe&&!myParent?`<form class="bet" id="bet-form">
   <div class="bet-head"><span>掛け金${lowOnly?'（持ち点0以下は100点のみ）':''}</span><span>持ち点 ${number(me.points)}</span></div>
   <div class="stepper"><button type="button" class="btn" data-bet="${draft-100}" ${me.ready||draft<=100?'disabled':''} aria-label="100点減らす">−100</button><output aria-live="polite">${number(draft)}</output><button type="button" class="btn" data-bet="${draft+100}" ${me.ready||draft>=maxBet||lowOnly?'disabled':''} aria-label="100点増やす">＋100</button></div>
   <div class="quick"><button type="button" class="btn" data-bet="100" ${me.ready?'disabled':''}>最小 100</button><button type="button" class="btn" data-bet="${half}" ${me.ready||lowOnly?'disabled':''}>半分 ${number(half)}</button><button type="button" class="btn" data-bet="${maxBet}" ${me.ready||lowOnly?'disabled':''}>全額 ${number(maxBet)}</button></div>
   <button class="btn ${me.ready?'':'primary'} big" type="submit">${me.ready?'準備を解除':`${number(draft)}点で準備OK`}</button>
   <p class="note center">準備 ${readyCount}/${children.length}人</p></form>`
  :betting&&seatedMe?`<div class="waiting-note">${myParent?'親はすべての掛け金を受けます':'準備できました'}<span>準備 ${readyCount}/${children.length}人</span></div>`
  :play&&seatedMe&&cheat&&myParent&&canRoll?`<div class="cheat-roll"><button class="btn primary big" id="roll">${me.attempts?'もう一度振る':'普通のサイコロで振る'}</button><button class="btn big loaded" id="roll-loaded">シゴロ賽で振る</button><p class="note center">どちらで振ったかはリスナーには見えません。見破られたら掛け金の10倍を払います</p></div>`
  :play&&seatedMe?`<button class="btn ${canRoll?'primary':''} big" id="roll" ${canRoll?'':'disabled'}>${rolling?'コロコロ…':canRoll?(me.attempts?'もう一度振る':'サイコロを振る'):me.done?'出目が確定しました':'順番待ち'}</button>`
  :'';
 const otherKids=seatPlayers.filter(p=>p.id!==s.dealerId&&p.id!==s.me);
 const penalty=otherKids.reduce((t,p)=>t+2*((me.bet||100)+(p.bet||100)),0)*2;
 const accuse=cheat&&(betting||play)&&seatedMe&&!myParent?`<div class="accuse"><button class="btn big danger" data-accuse data-gain="${(me.bet||100)*10}" data-loss="${penalty}">イカサマを指摘する</button><p class="note center">当たれば親から +${number((me.bet||100)*10)}点 · 外れたら −${number(penalty)}点</p></div>`:'';
 const secret=cheat&&s.isHost&&locked&&s.hostCheated?'<p class="secret"><span class="tag down">シゴロ賽を使用中</span>あなたにだけ表示されています</p>':'';
 const spectate=locked&&!seatedMe&&!s.isHost?`<div class="spectate"><p><span class="tag dark">観戦中</span>${me.want?'参加希望を出しています。次のゲームで呼ばれるかも':'次のゲームに参加したくなったら↓'}</p>${wantButton(me)}</div>`:'';
 const settlement=settled&&s.settlement?`<div class="settle-table">${s.settlement.rows.map(r=>`<div class="row"><span class="name">${r.id===s.settlement.dealerId?'<span class="tag gold">親</span>':''}${esc(r.name)}</span><span class="tag ${r.delta>0?'up':r.delta<0?'down':''}">${signed(r.delta)}</span><span class="pts">${number(r.points)}</span></div>`).join('')}</div>${s.isHost?`<button class="btn primary big" id="next-round">${s.round>=s.totalRounds?'最終結果へ':'次のラウンドへ'}</button>`:'<p class="note center">配信者が次へ進めます（20秒で自動）</p>'}`:'';

 const stage=locked?`<section class="card stage">
   <div class="stage-title">${avatar(focus,'sm')}<span>${focus.id===s.me?'あなた':esc(focus.name)} のサイコロ</span></div>
   ${trayHtml()}
   <div class="callout ${tone}" aria-live="polite"><strong>${esc(big)}</strong>${sub?`<span>${esc(sub)}</span>`:''}</div>
   <div class="timer" id="timer" ${s.timer?'':'hidden'}><div class="timer-caption"><span id="timer-label"></span><strong id="timer-seconds"></strong></div><div class="timer-track" role="progressbar" aria-label="残り時間" aria-valuemin="0" aria-valuemax="100"><div id="timer-fill"></div></div></div>
   ${secret}${controls}${accuse}${spectate}${settlement}
  </section>`:'';

 const seats=locked?`<section class="seats">${seatPlayers.map(p=>{
   const turn=(play||settled)&&p.id===s.turnId&&!settled;
   const st=rolling&&p.id===s.shot?.playerId?'コロコロ…':judging?(p.id===s.judgement?.accuserId?'イカサマを指摘':p.id===s.dealerId?'判定待ち':'判定待ち'):betting?(p.id===s.dealerId?'全額受け':p.ready?`準備OK · ${number(p.bet)}`:'掛け金を選択中'):settled?`${role(p.dice)} ${signed(p.roundDelta)}`:p.dice?.length?role(p.dice):p.id===s.turnId?'いまの番':p.id===s.dealerId?'親':`順番待ち · 賭 ${number(p.bet)}`;
   return `<div class="seat ${turn?'turn':''}">${p.id===s.dealerId?'<span class="tag gold dealer">親</span>':''}<div class="seat-name">${avatar(p,'sm')}<strong>${nameOnly(p)}</strong></div><div class="seat-pts">${number(p.points)}<small>点</small></div><div class="seat-status">${esc(st)}</div>${!p.online?'<span class="tag offline">接続待ち</span>':''}</div>`}).join('')}</section>`:'';

 const roller=rolling?s.players.find(p=>p.id===s.shot.playerId):null;
 const lastLog=roller?`<div class="lastlog"><span class="tag gold">直前</span><span>${esc(roller.name)} が振っています…</span></div>`:s.logs[0]?`<div class="lastlog"><span class="tag gold">直前</span><span>${esc(s.logs[0])}</span></div>`:'';

 const result=finished&&s.settlement?(()=>{const ranked=s.roundOrder.map(id=>s.players.find(p=>p.id===id)).filter(Boolean).sort((a,b)=>b.points-a.points);
   const j=s.judgement&&s.settlement.judgement?s.judgement:null,host=s.players.find(p=>p.id===s.hostId);
   const verdict=j?`<div class="verdict ${j.cheated?'caught':'clean'}"><strong>${j.cheated?'イカサマ発覚！':'イカサマなし'}</strong><span>${j.cheated?`${esc(host.name)}はシゴロ賽を使っていました。${esc(j.accuserName)}の指摘が的中`:`${esc(j.accuserName)}の指摘は外れ。ゲームは不成立のまま精算`}</span></div>`:'';
   return `<section class="card result"><p class="eyebrow">${j?'JUDGEMENT':'RESULT'}</p><h2>第${s.gameNumber}ゲーム ${j?'不成立':'おしまい'}</h2>${verdict}
   <ol class="ranking">${ranked.map((p,i)=>{const row=s.settlement.rows.find(r=>r.id===p.id);return `<li><span class="medal m${i+1}">${i+1}</span>${avatar(p,'sm')}<span class="name">${nameOnly(p)}<small>${s.settlement.judgement?'判定':'最終ラウンド'} ${signed(row?.delta)}</small></span><strong>${number(p.points)}</strong></li>`}).join('')}</ol>
   <p class="note">持ち点0以下のリスナーは待機所へ戻ります。持ち点は引き継がれます。</p></section>`})():'';

 const lobbySeats=open?`<section class="card table-preview"><div class="card-head"><h2>卓</h2><span>${seatPlayers.length}/4人</span></div>
   <div class="seat-dots">${Array.from({length:4},(_,i)=>{const p=seatPlayers[i];return p?`<div class="dot">${avatar(p,'lg')}<span>${nameOnly(p)}</span></div>`:'<div class="dot empty"><span class="avatar lg ghost">?</span><span>空席</span></div>'}).join('')}</div>
   ${s.isHost?`<button class="btn ${seatPlayers.length>=2?'primary':''} big" id="start" ${seatPlayers.length<2?'disabled':''}>${seatPlayers.length<2?'参加希望の人を指名してね':`${seatPlayers.length}人で${finished?'次のゲームを始める':'ゲームスタート'}`}</button>`
     :`<div class="spectate"><p>${s.selected.includes(me.id)?'<strong>指名されました！</strong> 配信者のスタートを待っています':me.want?'参加希望を出しています。配信者の指名を待とう':'いまは観戦中。遊びたくなったら参加希望を出そう'}</p>${wantButton(me)}</div>`}
  </section>`:'';

 const invite=open&&s.isHost?`<section class="card invite"><p>リスナーにこのURLを送ってね</p><div class="invite-row"><code>${esc(url.host+url.pathname+url.search)}</code><button class="btn" data-share>共有</button></div></section>`:'';

 const queueRows=[...s.players].sort((a,b)=>(b.id===s.hostId)-(a.id===s.hostId)||isSeated(b)-isSeated(a)||(b.want&&!b.demo)-(a.want&&!a.demo)).map(p=>{
   const seated=isSeated(p),fresh=Date.now()-(firstSeen.get(p.id)||0)<8000;
   const tag=p.id===s.hostId?'<span class="tag gold">配信者</span>':seated?`<span class="tag gold">${locked?'対戦中':'卓'}</span>`:p.demo?'<span class="tag">CPU</span>':p.want?'<span class="tag want">参加希望</span>':'<span class="tag">観戦中</span>';
   const canPick=s.isHost&&open&&p.id!==s.hostId,sel=s.selected.includes(p.id),full=s.selected.length>=3;
   return `<li class="member ${seated?'seated':''}"><div class="member-row">${avatar(p)}<div class="member-main"><strong>${you(p)}</strong><span>${tag}${fresh?'<span class="tag new">NEW</span>':''}${!p.online?'<span class="tag offline">接続待ち</span>':''}<span class="pts">${number(p.points)}点</span></span></div>
    ${s.isHost?`<button class="btn sm ${editing===p.id?'active':''}" data-edit="${p.id}" aria-expanded="${editing===p.id}" aria-label="${esc(p.name)}の持ち点を調整">点数</button>`:''}
    ${canPick?`<button class="btn sm ${sel?'':'pick'}" data-select="${p.id}" ${!sel&&(!p.want||!p.online||full)?'disabled':''}>${sel?'外す':'指名'}</button>`:''}</div>
    ${s.isHost&&editing===p.id?`<div class="points-editor" role="group" aria-label="${esc(p.name)}の持ち点">${[100,1000,-100,-1000].map(d=>`<button class="btn ${d>0?'plus':'minus'}" data-points="${p.id}" data-delta="${d}">${d>0?'+':'−'}${Math.abs(d)}</button>`).join('')}</div>`:''}</li>`}).join('');
 const waiting=`<section class="card members"><div class="card-head"><h2>${locked?'待機所・観戦':'待機所'} <span class="count">${locked?watchers.length:s.players.length}</span></h2><span>${s.isHost&&open?'参加希望の人を指名してね':locked?'次のゲームの候補':'入室中の人'}</span></div><ul>${queueRows}</ul></section>`;

 const rules=`<details class="card log" id="log" ${logOpen?'open':''}><summary>卓のできごと</summary><ol>${(rolling?s.logs.slice(1):s.logs).slice(0,12).map(t=>`<li>${esc(t)}</li>`).join('')}</ol></details>`;

 const menu=menuOpen?`<div class="scrim" data-close-menu></div><div class="menu card" role="menu">
   <button class="menu-item" data-share role="menuitem">招待URLを共有</button>
   ${s.isHost&&finished?'<button class="menu-item" data-finish role="menuitem">全員を待機所に戻す</button>':''}
   <a class="menu-item" href="./" role="menuitem">トップへ（部屋はそのまま）</a></div>`:'';

 app.innerHTML=`<header class="topbar"><a class="brand" href="./">${icon('mark')}<span>あつまる卓</span></a><div class="top-actions"><button class="icon-btn" data-share aria-label="招待URLを共有">${icon('share')}</button><button class="icon-btn ${menuOpen?'active':''}" data-menu aria-label="メニュー" aria-expanded="${menuOpen}">${icon('menu')}</button></div></header>${menu}
 <section class="room-head"><div class="chips"><span class="room-id">ROOM ${esc(s.id)}</span><span class="phase ${locked?'live':''}">${phaseNames[s.phase]||s.phase}</span><span class="counts">入室 ${s.players.filter(p=>p.online&&!p.demo).length} · 観戦 ${watchers.filter(p=>p.online&&!p.demo).length}</span></div>
  <h1>${esc(s.title)}</h1><p>${s.cheatMode?'親固定・イカサマあり':fixed?'親固定':'親回り'}${s.gameNumber?` · 第${s.gameNumber}ゲーム`:''}${locked&&!fixed?` · ${s.round}/${s.totalRounds}ラウンド`:''}${s.isHost?' · あなたが配信者':''}</p></section>
 <div class="layout"><div class="main-col">${result}${stage}${locked?lastLog:''}${seats}${rulesHtml(cheat?'cheat':'chinchiro',fixed)}${invite}${lobbySeats}</div><aside class="side-col">${waiting}${rules}</aside></div>
 <footer class="foot">あつまる卓 · 集まって、囲んで、盛り上がる。</footer>`;
 updateTimer();animateDice();
 clearTimeout(rollTimer);if(rolling)rollTimer=setTimeout(()=>{last='';render()},Math.max(50,s.shot.startedAt+s.shot.duration-now()+30));
}
// ---------- ハイ＆ロー ----------
const SUIT={S:'♠',H:'♥',D:'♦',C:'♣'},RANK={1:'A',11:'J',12:'Q',13:'K'};
const isRed=c=>c.suit==='H'||c.suit==='D';
const cardName=c=>`${SUIT[c.suit]}${RANK[c.rank]||c.rank}`;
const cardHtml=(c,cls='')=>`<div class="pcard ${isRed(c)?'red':''} ${cls}" role="img" aria-label="${isRed(c)?'赤':'黒'}の${cardName(c)}"><span class="corner tl">${RANK[c.rank]||c.rank}<i>${SUIT[c.suit]}&#xFE0E;</i></span><span class="suit">${SUIT[c.suit]}&#xFE0E;</span><span class="corner br">${RANK[c.rank]||c.rank}<i>${SUIT[c.suit]}&#xFE0E;</i></span></div>`;
const backHtml=(cls='')=>`<div class="pcard back ${cls}" aria-label="次のカード（裏向き）"></div>`;
const PICK={high:'ハイ',low:'ロー'},COLOR={red:'赤',black:'黒'};
let hlDraft=null,hlAnimated=null;
function hlDraftFor(s,me){
 const key=`${s.id}:${s.hl.round}`,mine=s.hl.myBet;
 if(!hlDraft||hlDraft.key!==key)hlDraft={key,pick:mine?.pick||null,color:mine?.color||null,amount:mine?.amount??0};
 const max=Math.max(0,Math.floor((me.points??0)/100)*100);hlDraft.amount=Math.max(0,Math.min(max,hlDraft.amount));
 return {...hlDraft,max};
}
function renderHighLow(s){
 const hl=s.hl,me=s.players.find(p=>p.id===s.me),url=new URL(base);url.searchParams.set('room',s.id);
 const last=hl.last,fresh=last&&hlAnimated!==last.round&&now()-last.at<6000;
 if(last&&hlAnimated==null&&!fresh)hlAnimated=last.round;
 const anim=fresh?'flip-in':'';
 const d=s.isHost?null:hlDraftFor(s,me);
 const outcome=last?(last.next.rank>last.prev.rank?'ハイ':last.next.rank<last.prev.rank?'ロー':'同じ数字'):'';
 const mine=last?.results.find(x=>x.id===s.me);
 const winners=last?last.results.filter(x=>x.delta>0).length:0;
 const banner=last?`<div class="hl-banner ${fresh?'pop':''}"><strong>${outcome}${last.next.rank===last.prev.rank?'':'！'}</strong><span>${cardName(last.prev)} → ${cardName(last.next)} · ${isRed(last.next)?'赤':'黒'} · 勝ち ${winners}人</span>
   ${mine?`<p class="mine ${mine.delta>0?'up':mine.delta<0?'down':''}">あなた：${PICK[mine.pick]}${mine.color?`・${COLOR[mine.color]}`:''} ${number(mine.amount)}点 → <b>${signed(mine.delta)}</b></p>`:''}</div>`:'<div class="hl-banner"><strong>ハイ？ ロー？</strong><span>次のカードが今より上か下かを当てよう</span></div>';

 const table=`<div class="hl-table">
   <div class="hl-current"><div class="flip ${anim}">${cardHtml(hl.current,'lg')}</div><span>いまのカード</span></div>
   <div class="hl-next">${backHtml('lg')}<span>次のカード</span></div></div>`;

 const tally=hl.tally;
 const tallyHtml=`<div class="hl-tally"><span class="tag up">ハイ ${tally.high}</span><span class="tag down">ロー ${tally.low}</span><span class="tag">赤 ${tally.red}</span><span class="tag">黒 ${tally.black}</span><span class="muted">合計 ${number(tally.stake)}点</span></div>`;

 let panel='';
 if(s.isHost){
  panel=`<div class="hl-host">${tallyHtml}<button class="btn primary big" id="hl-flip">カードをめくる</button><p class="note center">ベット ${tally.total}人。めくるまで変更できます · 山札 残り${hl.deckLeft}枚</p></div>`;
 } else {
  const prev=hl.current.rank,returned=!d.pick?0:d.color?d.amount*4:d.amount*2;
  const half=Math.max(0,Math.floor(d.max/200)*100);
  panel=`<form class="hl-bet" id="hl-form">
   <div class="seg pick" role="group" aria-label="ハイかロー">
     <button type="button" class="${d.pick==='high'?'on':''}" data-hl-pick="high" aria-pressed="${d.pick==='high'}"><b>ハイ</b><small>${RANK[prev]||prev}より上</small></button>
     <button type="button" class="${d.pick==='low'?'on':''}" data-hl-pick="low" aria-pressed="${d.pick==='low'}"><b>ロー</b><small>${RANK[prev]||prev}より下</small></button></div>
   <div class="seg color" role="group" aria-label="色も当てる（任意）"><span>色も当てる</span>
     <button type="button" class="${!d.color?'on':''}" data-hl-color="" aria-pressed="${!d.color}">なし</button>
     <button type="button" class="${d.color==='red'?'on':''} red" data-hl-color="red" aria-pressed="${d.color==='red'}">赤</button>
     <button type="button" class="${d.color==='black'?'on':''}" data-hl-color="black" aria-pressed="${d.color==='black'}">黒</button></div>
   <div class="bet-head"><span>ベット</span><span>持ち点 ${number(me.points)}</span></div>
   <div class="stepper"><button type="button" class="btn" data-hl-amt="${d.amount-100}" ${d.amount<=0?'disabled':''} aria-label="100点減らす">−100</button><output aria-live="polite">${number(d.amount)}</output><button type="button" class="btn" data-hl-amt="${d.amount+100}" ${d.amount>=d.max?'disabled':''} aria-label="100点増やす">＋100</button></div>
   <div class="quick four"><button type="button" class="btn" data-hl-amt="0">0</button><button type="button" class="btn" data-hl-amt="100" ${d.max<100?'disabled':''}>100</button><button type="button" class="btn" data-hl-amt="${half}" ${d.max<200?'disabled':''}>半分</button><button type="button" class="btn" data-hl-amt="${d.max}" ${d.max<100?'disabled':''}>全額</button></div>
   <p class="note center">${d.pick?`当たれば ${number(returned)}点 戻り（${signed(returned-d.amount)}）${d.color?' · 色が外れたら没収':''} · 同じ数字は${d.color?'色が当たれば2倍':'ベットを返却'}`:'ハイかローを選んでね'}</p>
   <button class="btn primary big" type="submit" ${d.pick?'':'disabled'}>${hl.myBet?'ベットを変更':d.pick?`${PICK[d.pick]}${d.color?`・${COLOR[d.color]}`:''}に ${number(d.amount)}点`:'ベットする'}</button>
   ${hl.myBet?`<div class="placed"><span class="tag gold">ベット済み</span>${PICK[hl.myBet.pick]}${hl.myBet.color?`・${COLOR[hl.myBet.color]}`:''} ${number(hl.myBet.amount)}点 <button type="button" class="btn sm" data-hl-cancel>取り消す</button></div>`:''}
   ${(me.points??0)<=0?'<p class="note center">持ち点が0以下のあいだは0点ベットで参加できます</p>':''}
  </form>${tallyHtml}`;
 }

 const bettors=hl.bets.map(b=>{const p=s.players.find(x=>x.id===b.id);return p?`<li>${avatar(p,'sm')}<span class="name">${esc(p.name)}</span><span class="tag ${b.pick==='high'?'up':'down'}">${PICK[b.pick]}</span>${b.color?`<span class="tag ${b.color==='red'?'redtag':''}">${COLOR[b.color]}</span>`:''}<span class="pts">${number(b.amount)}</span></li>`:''}).join('');
 const results=last?.results.length?`<section class="card hl-results"><div class="card-head"><h2>第${last.round}回の結果</h2><span>${cardName(last.prev)} → ${cardName(last.next)}</span></div><ol>${last.results.map(x=>`<li><span class="name">${esc(x.name)}</span><span class="pick">${PICK[x.pick]}${x.color?`・${COLOR[x.color]}`:''} ${number(x.amount)}</span><span class="tag ${x.delta>0?'up':x.delta<0?'down':''}">${signed(x.delta)}</span><span class="pts">${number(x.points)}</span></li>`).join('')}</ol></section>`:'';
 const past=hl.history.slice(0,-1).slice(-5).reverse();
 const history=`<div class="hl-past" aria-label="これまでのカード（新しい順）"><span class="label">これまで</span><div class="row">${past.length?past.map((c,i)=>`<div class="past ${i===0?'latest':''}">${cardHtml(c,'xs')}<small>${i===0?'前回':`${i+1}回前`}</small></div>`).join(''):'<p class="note">まだめくっていません</p>'}${Array.from({length:Math.max(0,5-past.length)},()=>'<div class="past empty"><div class="pcard xs ghost"></div><small>&nbsp;</small></div>').join('')}</div></div>`;

 const members=[...s.players].sort((a,b)=>(b.id===s.hostId)-(a.id===s.hostId)||(b.points??0)-(a.points??0)).map(p=>{
   const bet=hl.bets.find(b=>b.id===p.id),fresh=Date.now()-(firstSeen.get(p.id)||0)<8000;
   const tag=p.id===s.hostId?'<span class="tag gold">ディーラー</span>':bet?'<span class="tag want">ベット済み</span>':p.demo?'<span class="tag">CPU</span>':'<span class="tag">観戦中</span>';
   return `<li class="member"><div class="member-row">${avatar(p)}<div class="member-main"><strong>${esc(p.name)}${p.id===s.me?'<small class="you">あなた</small>':''}</strong><span>${tag}${fresh?'<span class="tag new">NEW</span>':''}${!p.online?'<span class="tag offline">接続待ち</span>':''}<span class="pts">${number(p.points)}点</span></span></div>
    ${s.isHost?`<button class="btn sm ${editing===p.id?'active':''}" data-edit="${p.id}" aria-expanded="${editing===p.id}" aria-label="${esc(p.name)}の持ち点を調整">点数</button>`:''}</div>
    ${s.isHost&&editing===p.id?`<div class="points-editor" role="group" aria-label="${esc(p.name)}の持ち点">${[100,1000,-100,-1000].map(v=>`<button class="btn ${v>0?'plus':'minus'}" data-points="${p.id}" data-delta="${v}">${v>0?'+':'−'}${Math.abs(v)}</button>`).join('')}</div>`:''}</li>`}).join('');
 const watchers=s.players.filter(p=>p.id!==s.hostId);
 const menu=menuOpen?`<div class="scrim" data-close-menu></div><div class="menu card" role="menu"><button class="menu-item" data-share role="menuitem">招待URLを共有</button><a class="menu-item" href="./" role="menuitem">トップへ（部屋はそのまま）</a></div>`:'';
 const invite=s.isHost?`<section class="card invite"><p>リスナーにこのURLを送ってね</p><div class="invite-row"><code>${esc(url.host+url.pathname+url.search)}</code><button class="btn" data-share>共有</button></div></section>`:'';

 app.innerHTML=`<header class="topbar"><a class="brand" href="./">${icon('mark')}<span>あつまる卓</span></a><div class="top-actions"><button class="icon-btn" data-share aria-label="招待URLを共有">${icon('share')}</button><button class="icon-btn ${menuOpen?'active':''}" data-menu aria-label="メニュー" aria-expanded="${menuOpen}">${icon('menu')}</button></div></header>${menu}
 <section class="room-head"><div class="chips"><span class="room-id">ROOM ${esc(s.id)}</span><span class="phase live">ハイ＆ロー</span><span class="counts">入室 ${s.players.filter(p=>p.online&&!p.demo).length} · ベット ${tally.total}</span></div>
  <h1>${esc(s.title)}</h1><p>第${hl.round}回 · ${s.isHost?'あなたがディーラー':'ハイかローに賭けよう'}</p></section>
 <div class="layout"><div class="main-col">
  <section class="card stage hl-stage">${table}${history}${banner}${panel}</section>
  ${rulesHtml('highlow')}
  ${hl.bets.length?`<section class="card hl-bettors"><div class="card-head"><h2>ベット中</h2><span>${hl.bets.length}人</span></div><ul>${bettors}</ul></section>`:''}
  ${results}${invite}
 </div><aside class="side-col">
  <section class="card members"><div class="card-head"><h2>入室中 <span class="count">${watchers.length}</span></h2><span>${s.isHost?'名前の「点数」で持ち点を調整':'配信者が持ち点を配ります'}</span></div><ul>${members}</ul></section>
  <details class="card log" id="log" ${logOpen?'open':''}><summary>卓のできごと</summary><ol>${s.logs.slice(0,12).map(t=>`<li>${esc(t)}</li>`).join('')}</ol></details>
 </aside></div><footer class="foot">あつまる卓 · 集まって、囲んで、盛り上がる。</footer>`;
 if(fresh)hlAnimated=last.round;
}
// ---------- ことばならべ ----------
let kbDraft={key:'',text:''},kbComposing=false;
const KB_PHASE={lobby:'メンバー募集中',express:'表現タイム',arrange:'並べ替え',reveal:'オープン',result:'結果'};
function renderKotoba(s){
 const kb=s.kb,me=s.players.find(p=>p.id===s.me),st=id=>kb.stats[id]||{lives:0,success:0,plays:0};
 const url=new URL(base);url.searchParams.set('room',s.id);
 const open=['lobby','result'].includes(kb.phase),mine=kb.cards.find(c=>c.id===s.me),playing=mine&&!mine.excluded&&!open;
 const byId=id=>kb.cards.find(c=>c.id===id),person=id=>s.players.find(p=>p.id===id);
 const scale=kb.theme?`<div class="kb-scale"><span><b>1</b>${esc(kb.theme.low)}</span><i></i><span>${esc(kb.theme.high)}<b>100</b></span></div>`:'';
 const themeCard=kb.theme&&!open?`<div class="kb-theme"><p class="eyebrow">第${kb.round}回のお題</p><h2>${esc(kb.theme.text)}</h2>${scale}</div>`:'';
 const timer=`<div class="timer" id="timer" ${s.timer?'':'hidden'}><div class="timer-caption"><span id="timer-label"></span><strong id="timer-seconds"></strong></div><div class="timer-track" role="progressbar" aria-label="残り時間" aria-valuemin="0" aria-valuemax="100"><div id="timer-fill"></div></div></div>`;
 let stage='';
 if(kb.phase==='express'){
  const key=`${s.id}:${kb.round}:${kb.theme?.text}`;if(kbDraft.key!==key)kbDraft={key,text:mine?.word||''};
  const status=kb.cards.map(c=>`<li>${avatar(person(c.id)||{id:c.id,name:c.name},'sm')}<span class="name">${esc(c.name)}${c.id===s.me?'<small class="you">あなた</small>':''}</span>${c.word===null?'<span class="tag">考え中…</span>':'<span class="tag want">出した</span>'}</li>`).join('');
  stage=`<section class="card stage kb-stage">${themeCard}${timer}
   ${playing?`<div class="kb-mine"><div class="kb-number" aria-label="あなたの数字">${mine.number}</div><form id="kb-form" class="kb-form"><label class="field"><span>あなたの数字を表す言葉（20文字まで）</span><input id="kb-word" maxlength="20" autocomplete="off" enterkeyhint="send" placeholder="例：ライオン"></label><button class="btn primary big" type="submit">${mine.word?'言葉を出し直す':'この言葉で出す'}</button>${mine.word?`<p class="note center">出した言葉：<b>${esc(mine.word)}</b>（30秒以内なら出し直せます）</p>`:'<p class="note center">30秒以内に出さないと、このゲームから外れます</p>'}</form></div>`
   :s.isHost?`<div class="kb-host-note"><p>参加者が言葉を考えています。言葉がそろうと並べ替えに進みます。</p><button class="btn" id="kb-retheme">お題を引き直す（30秒リセット）</button></div>`
   :`<p class="note center">参加者が言葉を考えています</p>`}
   <ul class="kb-status">${status}</ul></section>`;
 } else if(['arrange','reveal'].includes(kb.phase)||(kb.phase==='result'&&kb.result&&!kb.result.void)){
  const order=kb.order,arrange=kb.phase==='arrange'&&s.isHost,result=kb.phase==='result';
  let maxSoFar=0;
  const rows=order.map((id,i)=>{
   const c=byId(id),revealed=i<kb.revealed,num=c.number,broke=revealed&&num!==null&&num<maxSoFar;if(revealed&&num!==null)maxSoFar=Math.max(maxSoFar,num);
   const rr=result?kb.result.rows.find(x=>x.id===id):null;
   const badge=revealed&&num!==null?`<span class="kb-num ${rr?(rr.ok?'ok':'ng'):broke?'ng':''}">${num}</span>`:c.id===s.me&&num!==null?`<span class="kb-num own" title="あなたの数字">${num}</span>`:'<span class="kb-num back">?</span>';
   return `<li class="kb-card ${arrange?'drag':''} ${revealed?'open':''} ${revealed&&i===kb.revealed-1&&kb.phase==='reveal'?'just':''} ${c.id===s.me?'me':''} ${rr?(rr.ok?'ok':'ng'):broke?'ng':''}" data-kb-id="${id}" ${arrange?`tabindex="0" aria-label="${i+1}番目 ${esc(c.word)}（${esc(c.name)}）。上下キーで移動"`:''}><div class="kb-body"><small>${esc(c.name)}${c.id===s.me?'（あなた）':''}</small><strong>${esc(c.word)}</strong></div>${badge}</li>`}).join('');
  const out=kb.cards.filter(c=>c.excluded);
  const summary=result?`<div class="kb-summary ${kb.result.correct===kb.result.total?'perfect':''}"><strong>${kb.result.correct===kb.result.total?'全員成功！':`${kb.result.correct} / ${kb.result.total} 枚が正しい位置`}</strong><span>正しい位置だった人の成功数が増えました</span></div>`:'';
  stage=`<section class="card stage kb-stage">${themeCard||(result&&kb.theme?`<div class="kb-theme"><p class="eyebrow">第${kb.round}回のお題</p><h2>${esc(kb.theme.text)}</h2>${scale}</div>`:'')}${summary}
   <ol class="kb-line" aria-label="小さい順の並び"><li class="kb-end">小さい（1）</li>${rows}<li class="kb-end">大きい（100）</li></ol>
   ${out.length?`<p class="note center">時間切れで除外：${out.map(c=>esc(c.name)).join('、')}</p>`:''}
   ${arrange?`<button class="btn primary big" id="kb-reveal">並びを決めてオープン</button><p class="note center">パネルをドラッグして並べ替え（時間制限なし）</p>`
    :kb.phase==='arrange'?'<p class="note center">配信者が並べ替え中。動きはリアルタイムで見えます</p>'
    :kb.phase==='reveal'&&s.isHost?`<button class="btn primary big" id="kb-reveal">次をめくる（${kb.revealed}/${order.length}）</button>`
    :kb.phase==='reveal'?`<p class="note center">オープン中（${kb.revealed}/${order.length}）</p>`:''}
  </section>`;
 }
 const voidNote=kb.phase==='result'&&kb.result?.void?'<section class="card kb-void"><h2>不成立</h2><p class="note">言葉を出したのが1人以下だったため、このゲームは不成立です。言葉を出した人のライフは戻しました。</p></section>':'';
 const sel=kb.selected.map(person).filter(Boolean);
 const lobby=open?`<section class="card table-preview"><div class="card-head"><h2>参加者</h2><span>${sel.length}/8人 · 配信者は並べ係</span></div>
   <div class="seat-dots kb-dots">${Array.from({length:8},(_,i)=>{const p=sel[i];return p?`<div class="dot">${avatar(p,'lg')}<span>${esc(p.name)}</span><small>ライフ ${st(p.id).lives}</small></div>`:'<div class="dot empty"><span class="avatar lg ghost">?</span><span>空き</span></div>'}).join('')}</div>
   ${s.isHost?`<button class="btn ${sel.length>=2?'primary':''} big" id="kb-start" ${sel.length<2?'disabled':''}>${sel.length<2?'参加者を2人以上指名してね':`${sel.length}人で${kb.round?'次のゲーム':'ゲームスタート'}`}</button><p class="note center kb-lifenote">始めると参加者のライフが1ずつ減ります</p>`
   :`<div class="spectate"><p>${kb.selected.includes(me.id)?'<strong>指名されました！</strong> 配信者のスタートを待っています':me.want?'参加希望を出しています':'観戦中。遊びたくなったら参加希望を出そう'} · ライフ ${st(me.id).lives} · 成功 ${st(me.id).success}回</p>${wantButton(me)}</div>`}</section>`:'';
 const invite=open&&s.isHost?`<section class="card invite"><p>リスナーにこのURLを送ってね</p><div class="invite-row"><code>${esc(url.host+url.pathname+url.search)}</code><button class="btn" data-share>共有</button></div></section>`:'';
 const members=[...s.players].sort((a,b)=>(b.id===s.hostId)-(a.id===s.hostId)||kb.selected.includes(b.id)-kb.selected.includes(a.id)||(b.want&&!b.demo)-(a.want&&!a.demo)||st(b.id).success-st(a.id).success).map(p=>{
   const isHost=p.id===s.hostId,picked=kb.selected.includes(p.id),fresh=Date.now()-(firstSeen.get(p.id)||0)<8000,t=st(p.id);
   const inPlay=!open&&kb.cards.some(c=>c.id===p.id&&!c.excluded);
   const tag=isHost?'<span class="tag gold">並べ係</span>':inPlay?'<span class="tag gold">参加中</span>':picked?'<span class="tag gold">指名中</span>':p.demo?'<span class="tag">CPU</span>':p.want?'<span class="tag want">参加希望</span>':'<span class="tag">観戦中</span>';
   const canPick=s.isHost&&open&&!isHost&&!p.demo;
   return `<li class="member ${picked?'seated':''}"><div class="member-row">${avatar(p)}<div class="member-main"><strong>${esc(p.name)}${p.id===s.me?'<small class="you">あなた</small>':''}</strong><span>${tag}${fresh?'<span class="tag new">NEW</span>':''}${!p.online?'<span class="tag offline">接続待ち</span>':''}${isHost||p.demo?'':`<span class="tag life">ライフ ${t.lives}</span><span class="tag">成功 ${t.success}</span>`}</span></div>
    ${s.isHost&&!isHost&&!p.demo?`<button class="btn sm ${editing===p.id?'active':''}" data-edit="${p.id}" aria-expanded="${editing===p.id}" aria-label="${esc(p.name)}のライフを調整">ライフ</button>`:''}
    ${canPick?`<button class="btn sm ${picked?'':'pick'}" data-kb-select="${p.id}" ${!picked&&(!p.want||t.lives<1||sel.length>=8)?'disabled':''}>${picked?'外す':'指名'}</button>`:''}</div>
    ${s.isHost&&editing===p.id?`<div class="points-editor three" role="group" aria-label="${esc(p.name)}のライフ">${[[1,'+1'],[5,'+5'],[-1,'−1']].map(([d,l])=>`<button class="btn ${d>0?'plus':'minus'}" data-kb-lives="${p.id}" data-delta="${d}">${l}</button>`).join('')}</div>`:''}</li>`}).join('');
 const rules=`<section class="card rules"><div class="card-head"><h2>ルール</h2><span>ことばならべ</span></div><ol class="kb-rules"><li>指名された参加者に、1〜100の数字が1枚ずつこっそり配られる（配信者は並べ係）</li><li>お題に沿って、自分の数字の大きさを表す言葉を<b>30秒以内</b>に出す。出さなかった人は除外</li><li>言葉だけを手がかりに、<b>配信者だけ</b>が小さい順に並べる（時間制限なし）</li><li>配信者が1枚ずつめくる。<b>正しい位置</b>だった人は成功数+1</li></ol><p class="note">参加するとライフが1減る。ライフは配信者が足す。数字は本人にしか見えない。</p></section>`;
 const menu=menuOpen?`<div class="scrim" data-close-menu></div><div class="menu card" role="menu"><button class="menu-item" data-share role="menuitem">招待URLを共有</button>${s.isHost&&kb.phase==='result'?'<button class="menu-item" id="kb-reset" role="menuitem">結果を閉じて待機所へ</button>':''}<a class="menu-item" href="./" role="menuitem">トップへ（部屋はそのまま）</a></div>`:'';
 app.innerHTML=`<header class="topbar"><a class="brand" href="./">${icon('mark')}<span>あつまる卓</span></a><div class="top-actions"><button class="icon-btn" data-share aria-label="招待URLを共有">${icon('share')}</button><button class="icon-btn ${menuOpen?'active':''}" data-menu aria-label="メニュー" aria-expanded="${menuOpen}">${icon('menu')}</button></div></header>${menu}
 <section class="room-head"><div class="chips"><span class="room-id">ROOM ${esc(s.id)}</span><span class="phase ${open?'':'live'}">${KB_PHASE[kb.phase]}</span><span class="counts">入室 ${s.players.filter(p=>p.online&&!p.demo).length}${kb.cards.length&&!open?` · 参加 ${kb.cards.filter(c=>!c.excluded).length}`:''}</span></div>
  <h1>${esc(s.title)}</h1><p>ことばならべ${kb.round?` · 第${kb.round}回`:''}${s.isHost?' · あなたが並べ係':''}</p></section>
 <div class="layout"><div class="main-col">${stage}${voidNote}${rules}${lobby}${invite}</div><aside class="side-col">
  <section class="card members"><div class="card-head"><h2>入室中 <span class="count">${s.players.length}</span></h2><span>${s.isHost&&open?'参加希望の人を指名':'ライフと成功数'}</span></div><ul>${members}</ul></section>
  <details class="card log" id="log" ${logOpen?'open':''}><summary>卓のできごと</summary><ol>${s.logs.slice(0,12).map(t=>`<li>${esc(t)}</li>`).join('')}</ol></details>
 </aside></div><footer class="foot">あつまる卓 · 集まって、囲んで、盛り上がる。</footer>`;
 const input=$('#kb-word');if(input){input.value=kbDraft.text}
 updateTimer();
}
function wantButton(me){return `<button class="btn ${me.want?'':'primary'} big" data-want="${me.want?'0':'1'}">${me.want?'参加希望を取り消す':'参加希望を出す'}</button>`}

// ---------- events (delegated; CSP-safe) ----------
app.addEventListener('click',async e=>{
 const t=e.target.closest('button,[data-close-menu],a');if(!t||!state)return;
 const d=t.dataset,s=state;
 if('share' in d){menuOpen=false;const url=new URL(base);url.searchParams.set('room',s.id);try{if(navigator.share&&matchMedia('(pointer:coarse)').matches)await navigator.share({title:s.title,text:'あつまる卓に招待されています',url:url.href});else{await navigator.clipboard.writeText(url.href);toast('招待URLをコピーしました')}}catch(err){if(err?.name!=='AbortError')prompt('招待URL',url.href)}last='';render();return}
 if('menu' in d){menuOpen=!menuOpen;last='';render();return}
 if('closeMenu' in d){menuOpen=false;last='';render();return}
 if('finish' in d){menuOpen=false;return action({type:'finish'})}
 if('edit' in d){editing=editing===d.edit?null:d.edit;last='';render();return}
 if('points' in d)return action({type:'points',id:d.points,delta:Number(d.delta)});
 if('select' in d)return action({type:'select',id:d.select});
 if('want' in d)return action({type:'want',value:d.want==='1'});
 if('kbSelect' in d)return action({type:'kb-select',id:d.kbSelect});
 if('kbLives' in d)return action({type:'kb-lives',id:d.kbLives,delta:Number(d.delta)});
 if(t.id==='kb-start')return action({type:'kb-start'});
 if(t.id==='kb-retheme')return action({type:'kb-retheme'});
 if(t.id==='kb-reveal'){t.disabled=true;return action({type:'kb-reveal'})}
 if(t.id==='kb-reset'){menuOpen=false;return action({type:'kb-reset'})}
 if('hlPick' in d){hlDraft.pick=d.hlPick;last='';render();return}
 if('hlColor' in d){hlDraft.color=d.hlColor||null;last='';render();return}
 if('hlAmt' in d){hlDraft.amount=Number(d.hlAmt);last='';render();return}
 if('hlCancel' in d)return action({type:'hl-bet',pick:null});
 if(t.id==='hl-flip'){t.disabled=true;return action({type:'hl-flip'})}
 if('bet' in d){betDrafts[`${s.id}:${s.gameNumber}:${s.round}`]=Number(d.bet);last='';render();return}
 if(t.id==='start')return action({type:'start'});
 if(t.id==='next-round')return action({type:'next'});
 if(t.id==='roll'){t.disabled=true;return action({type:'roll'})}
 if(t.id==='roll-loaded'){t.disabled=true;return action({type:'roll',loaded:true})}
 if('accuse' in d){if(!confirm(`イカサマを指摘しますか？\nゲームはその場で不成立になり、判定タイムに入ります。\n\n当たり：親から +${Number(d.gain).toLocaleString('ja-JP')}点\n外れ：あなたが −${Number(d.loss).toLocaleString('ja-JP')}点（ほかの子と親に支払い）`))return;t.disabled=true;return action({type:'accuse'})}
});
app.addEventListener('submit',e=>{if(e.target.id==='kb-form'&&state){e.preventDefault();const w=$('#kb-word')?.value.trim();if(!w){toast('言葉を入力してね');return}kbDraft.text=w;$('#kb-word').blur();action({type:'kb-word',word:w});return}
 if(e.target.id==='hl-form'&&state&&hlDraft){e.preventDefault();action({type:'hl-bet',pick:hlDraft.pick,color:hlDraft.color,amount:hlDraft.amount});return}
 if(e.target.id!=='bet-form'||!state)return;e.preventDefault();const s=state,me=s.players.find(p=>p.id===s.me);const maxBet=Math.max(100,Math.floor((me.points??0)/100)*100);const amount=me.ready?me.bet:Math.max(100,Math.min(maxBet,Number(betDrafts[`${s.id}:${s.gameNumber}:${s.round}`]??me.bet??100)));action({type:'bet',amount,ready:!me.ready})});
app.addEventListener('input',e=>{if(e.target.id==='kb-word'){kbDraft.text=e.target.value}});
app.addEventListener('compositionstart',e=>{if(e.target.id==='kb-word')kbComposing=true});
app.addEventListener('compositionend',e=>{if(e.target.id==='kb-word'){kbComposing=false;kbDraft.text=e.target.value}});
// ---- ことばならべ: drag to reorder (host only) ----
let kbDrag=null;
function kbCommit(order){if(!state?.kb)return;state.kb.order=order;last='';render();action({type:'kb-move',order})}
app.addEventListener('pointerdown',e=>{
 const li=e.target.closest('.kb-card.drag');if(!li||e.button>0)return;
 const list=li.parentElement,cards=[...list.querySelectorAll('.kb-card')],from=cards.indexOf(li);
 kbDrag={li,cards,from,to:from,startY:e.clientY,h:li.getBoundingClientRect().height+6,id:e.pointerId};
 li.setPointerCapture(e.pointerId);li.classList.add('dragging');
});
app.addEventListener('pointermove',e=>{
 const d=kbDrag;if(!d||e.pointerId!==d.id)return;e.preventDefault();
 const dy=e.clientY-d.startY;d.li.style.transform=`translateY(${dy}px)`;
 d.to=Math.max(0,Math.min(d.cards.length-1,d.from+Math.round(dy/d.h)));
 d.cards.forEach((c,i)=>{if(c===d.li)return;const shift=d.from<d.to&&i>d.from&&i<=d.to?-d.h:d.from>d.to&&i<d.from&&i>=d.to?d.h:0;c.style.transform=shift?`translateY(${shift}px)`:''});
});
function kbDrop(e){
 const d=kbDrag;if(!d||e.pointerId!==d.id)return;kbDrag=null;
 d.cards.forEach(c=>{c.style.transform='';c.classList.remove('dragging')});
 if(d.to===d.from){last='';render();return}
 const order=[...state.kb.order],[moved]=order.splice(d.from,1);order.splice(d.to,0,moved);kbCommit(order);
}
app.addEventListener('pointerup',kbDrop);app.addEventListener('pointercancel',kbDrop);
app.addEventListener('keydown',e=>{
 const li=e.target.closest?.('.kb-card.drag');if(!li||!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();
 const order=[...state.kb.order],i=order.indexOf(li.dataset.kbId),j=i+(e.key==='ArrowUp'?-1:1);if(j<0||j>=order.length)return;
 [order[i],order[j]]=[order[j],order[i]];kbCommit(order);requestAnimationFrame(()=>document.querySelector(`.kb-card[data-kb-id="${order[j]}"]`)?.focus());
});
app.addEventListener('toggle',e=>{if(e.target.id==='log')logOpen=e.target.open},true);

async function action(data){if(busy)return;busy=true;try{state=await api(`rooms/${state.id}/action`,data);trackPlayers(state);last='';render()}catch(e){toast(e.message);last='';if(state)render()}finally{busy=false}}
async function recover(){
 if(!auth||!recoveringRoom||checking)return;checking=true;
 try{state=await api(`rooms/${recoveringRoom}`);recoveringRoom=null;remember(state);trackPlayers(state);connection(false);last='';render()}
 catch(e){if(e.status===401||e.status===404){const id=recoveringRoom;forget(id);entry(e.message)}else{connection(true);if(!state){app.innerHTML=`<header class="topbar"><a class="brand" href="./">${icon('mark')}<span>あつまる卓</span></a></header><section class="card reconnect"><h2>部屋へ再接続しています</h2><p>回線が戻ると自動で復帰します。</p><button class="btn" id="retry">もう一度接続する</button></section>`;$('#retry').onclick=()=>recover()}}}
 finally{checking=false}
}
async function poll(){
 if(recoveringRoom){await recover();return}
 if(!auth||!state||busy||checking||document.hidden)return;checking=true;
 try{state=await api(`rooms/${state.id}`);remember(state);trackPlayers(state);connection(false);render()}
 catch(e){if(e.status===401||e.status===404){const id=state.id;forget(id);entry(e.message)}else connection(true)}
 finally{checking=false}
}
function updateTimer(){
 const t=state?.timer,fill=$('#timer-fill');if(!t||!fill)return;
 const n=now(),remaining=Math.max(0,t.end-n),ratio=Math.min(1,remaining/t.total);
 fill.style.transform=`scaleX(${ratio})`;
 $('#timer-seconds').textContent=`${Math.ceil(Math.min(t.total,remaining)/1000)}秒`;
 $('#timer-label').textContent=n<t.start?'転がっています…':t.kind==='express'?'言葉を出すまで':t.kind==='judge'?'判定まで':t.kind==='bet'?'時間切れで100点に確定':t.kind==='roll'?'時間切れで自動で振ります':'自動で次へ進みます';
 $('.timer-track')?.setAttribute('aria-valuenow',String(Math.round(ratio*100)));
 $('#timer')?.classList.toggle('urgent',remaining<=5000);
}
if(room&&auth){await recover()}else entry();
setInterval(poll,1200);
setInterval(updateTimer,100);
setInterval(()=>{if(state&&[...firstSeen.values()].some(t=>t&&Date.now()-t>8000&&Date.now()-t<9500)){last='';render()}},1000);
window.addEventListener('online',()=>poll());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll()});
