// ことばならべ: everyone but the host gets a secret 1〜100, describes it in words for a theme,
// and the host alone arranges the words from small to large, then turns them over one by one.
export const KB_GAME='kotoba';
export const KB_EXPRESS_MS=45000;
export const KB_MAX=8;
export const THEMES=[
 ['強そうな動物','弱そう','強そう'],['朝ごはんに出てきたらうれしいもの','うれしくない','うれしい'],['夏休みにやりたいこと','やりたくない','やりたい'],
 ['怖い場所','平気','怖い'],['もらってうれしいプレゼント','微妙','最高'],['人気のおにぎりの具','地味','大人気'],['テンションが上がる瞬間','ふつう','最高潮'],
 ['大きい乗り物','小さい','大きい'],['高い買い物','安い','高い'],['辛い食べ物','甘い','激辛'],['うるさい音','静か','うるさい'],['速いもの','遅い','速い'],
 ['重いもの','軽い','重い'],['寒い場所','暑い','極寒'],['長生きしそうなもの','短命','長生き'],['かっこいい職業','地味','憧れ'],['モテそうな特技','モテない','モテる'],
 ['休日にやりたいこと','面倒','やりたい'],['配信でやってほしい企画','見たくない','見たい'],['言われたらうれしい言葉','微妙','うれしい'],['子どもに人気のもの','不人気','大人気'],
 ['朝起きるのがつらい日','平気','地獄'],['食べ放題で食べたいもの','いらない','元を取る'],['旅行で行きたい場所','行かない','絶対行く'],['ゲームで使いたい武器','弱い','最強'],
 ['寝る前にしたいこと','しない','欠かせない'],['ドキドキする場面','平常心','心臓が出る'],['持っていたら自慢できるもの','普通','自慢'],['おいしい飲み物','まずい','うまい'],
 ['懐かしいもの','新しい','懐かしい'],['なくなったら困るもの','困らない','生きていけない'],['学校で人気の行事','退屈','大人気'],['疲れること','楽','へとへと'],
 ['お金がかかる趣味','安上がり','破産'],['面倒な家事','楽','面倒'],['かわいいもの','かわいくない','かわいすぎる'],['ゾンビの世界で役立つもの','役立たず','命綱'],
 ['無人島に持っていくもの','いらない','必需品'],['雨の日の楽しみ','ゆううつ','楽しみ'],['冬に食べたいもの','いらない','食べたい'],['見た目が派手なもの','地味','派手'],
 ['長く続けている人がすごい習慣','誰でも','尊敬'],['キャンプで欲しいもの','いらない','必須'],['ヒーローの必殺技の強さ','しょぼい','最強'],['電車で隣に来たらうれしい人','いや','うれしい'],
 ['盛り上がるパーティーゲーム','しらける','大盛り上がり'],['おとなっぽいもの','子どもっぽい','おとなっぽい'],['ちょっと恥ずかしいこと','平気','恥ずかしい'],['夜中に食べたくなるもの','食べない','我慢できない'],
 ['魔法で使いたい呪文','いらない','使いたい'],['眠くなるもの','目が冴える','即寝'],['お祭りの屋台','素通り','必ず寄る'],['ペットにしたい生き物','無理','飼いたい'],
 ['宇宙で困ること','平気','致命的'],['会社にあったらうれしい制度','いらない','神制度'],['映画で泣ける場面','泣かない','号泣'],['きれいな景色','ふつう','絶景'],
 ['手に入れたら笑顔になるもの','無表情','満面の笑み'],['小学生に人気の遊び','不人気','大人気'],['ロボットにしてほしいこと','頼まない','全部任せたい']
];
function uniform(n){const limit=Math.floor(4294967296/n)*n;let v;do{v=crypto.getRandomValues(new Uint32Array(1))[0]}while(v>=limit);return v%n}
function reject(message,status=400){throw Object.assign(new Error(message),{status})}
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=uniform(i+1);[a[i],a[j]]=[a[j],a[i]]}return a};
export const lives=p=>p.lives??0;
export function kbInit(r){r.kb={phase:'lobby',round:0,selected:[],cards:[],order:[],revealed:0,theme:null,usedThemes:[],result:null}}
const member=(r,id)=>r.players.get(id);
function drawTheme(kb){
  if(kb.usedThemes.length>=THEMES.length)kb.usedThemes=[];
  const free=THEMES.map((_,i)=>i).filter(i=>!kb.usedThemes.includes(i)),i=free[uniform(free.length)];
  kb.usedThemes.push(i);const [text,low,high]=THEMES[i];return {text,low,high};
}
const open=kb=>['lobby','result'].includes(kb.phase);
export function kbSelect(r,id){
  const kb=r.kb;if(!open(kb))reject('ゲーム中は指名を変えられません');
  const p=member(r,id);if(!p)reject('参加者が見つかりません');
  if(kb.selected.includes(id)){kb.selected=kb.selected.filter(x=>x!==id);return}
  if(p.demo)reject('CPUはことばならべに参加できません');
  if(!p.want)reject('参加希望を出している人だけ指名できます');
  if(lives(p)<1)reject('ライフがありません。配信者がライフを足してね');
  if(kb.selected.length>=KB_MAX)reject(`参加は${KB_MAX}人までです`);
  kb.selected.push(id);
}
export function kbLives(r,id,delta){
  if(![1,5,-1].includes(delta))reject('ライフの操作が不正です');
  const p=member(r,id);if(!p)reject('参加者が見つかりません');
  p.lives=Math.max(0,lives(p)+delta);
  return p;
}
export function kbStart(r,at=Date.now()){
  const kb=r.kb;if(!open(kb))reject('すでに始まっています');
  kb.selected=kb.selected.filter(id=>member(r,id));
  const players=kb.selected.map(id=>member(r,id));
  if(players.length<2)reject('参加者を2人以上指名してください');
  const empty=players.find(p=>lives(p)<1);if(empty)reject(`${empty.name}のライフがありません`);
  const numbers=shuffle(Array.from({length:100},(_,i)=>i+1)).slice(0,players.length);
  kb.cards=players.map((p,i)=>{p.lives=lives(p)-1;p.kbPlays=(p.kbPlays||0)+1;return {id:p.id,name:p.name,number:numbers[i],word:null,excluded:false}});
  kb.round++;kb.theme=drawTheme(kb);kb.order=[];kb.revealed=0;kb.result=null;
  kb.phase='express';kb.expressStartedAt=at;kb.expressDeadline=at+KB_EXPRESS_MS;
}
export function kbRetheme(r,at=Date.now()){
  const kb=r.kb;if(kb.phase!=='express')reject('お題は表現の時間中だけ引き直せます');
  kb.theme=drawTheme(kb);for(const c of kb.cards)c.word=null;kb.expressStartedAt=at;kb.expressDeadline=at+KB_EXPRESS_MS;
}
export function kbWord(r,p,word){
  const kb=r.kb;if(kb.phase!=='express')reject('いまは言葉を出す時間ではありません');
  const card=kb.cards.find(c=>c.id===p.id);if(!card)reject('このゲームには参加していません',403);
  const text=String(word??'').replace(/\s+/g,' ').trim().slice(0,20);if(!text)reject('言葉を入力してください');
  card.word=text;
}
export function kbTick(r,now=Date.now()){
  const kb=r.kb;if(!kb||kb.phase!=='express')return;
  if(now<kb.expressDeadline&&!kb.cards.every(c=>c.word))return;
  for(const c of kb.cards)if(!c.word)c.excluded=true;
  const live=kb.cards.filter(c=>!c.excluded);
  if(live.length<2){
    for(const c of live){const p=member(r,c.id);if(p)p.lives=lives(p)+1}
    kb.result={void:true,excluded:kb.cards.filter(c=>c.excluded).map(c=>c.id)};kb.phase='result';return 'void';
  }
  kb.order=shuffle(live.map(c=>c.id));kb.phase='arrange';return 'arrange';
}
export function kbMove(r,order){
  const kb=r.kb;if(kb.phase!=='arrange')reject('並べ替えはオープン前だけです');
  const ids=kb.cards.filter(c=>!c.excluded).map(c=>c.id);
  if(!Array.isArray(order)||order.length!==ids.length||new Set(order).size!==ids.length||!order.every(id=>ids.includes(id)))reject('並び順が不正です');
  kb.order=[...order];
}
export function kbReveal(r){
  const kb=r.kb;
  if(kb.phase==='arrange'){kb.phase='reveal';kb.revealed=0}
  if(kb.phase!=='reveal')reject('いまはめくれません');
  kb.revealed++;
  if(kb.revealed<kb.order.length)return null;
  const cards=kb.order.map(id=>kb.cards.find(c=>c.id===id)),sorted=[...cards].sort((a,b)=>a.number-b.number);
  const rows=cards.map((c,i)=>{const ok=sorted[i].id===c.id;const p=member(r,c.id);if(ok&&p)p.kbSuccess=(p.kbSuccess||0)+1;return {id:c.id,name:c.name,word:c.word,number:c.number,ok,success:p?.kbSuccess??0}});
  kb.result={void:false,rows,correct:rows.filter(x=>x.ok).length,total:rows.length,excluded:kb.cards.filter(c=>c.excluded).map(c=>c.id)};
  kb.phase='result';return kb.result;
}
export function kbReset(r){const kb=r.kb;if(!open(kb))reject('ゲーム中は戻れません');kb.phase='lobby';kb.cards=[];kb.order=[];kb.revealed=0;kb.result=null;kb.theme=null}
export function kbTimer(r){const kb=r.kb;return kb?.phase==='express'?{kind:'express',start:kb.expressStartedAt,end:kb.expressDeadline,total:KB_EXPRESS_MS,label:'表現'}:null}
export function kbState(r,me){
  const kb=r.kb;if(!kb)return null;
  const shown=new Set(kb.phase==='result'?kb.order:kb.order.slice(0,kb.revealed));
  const card=c=>({id:c.id,name:c.name,word:kb.phase==='express'&&c.id!==me.id?(c.word?'':null):c.word,excluded:c.excluded,number:shown.has(c.id)||(c.id===me.id)?c.number:null});
  return {phase:kb.phase,round:kb.round,selected:kb.selected,theme:kb.theme,cards:kb.cards.map(card),order:kb.order,revealed:kb.phase==='result'?kb.order.length:kb.revealed,result:kb.result,
    stats:Object.fromEntries([...r.players.values()].map(p=>[p.id,{lives:lives(p),success:p.kbSuccess||0,plays:p.kbPlays||0}]))};
}
