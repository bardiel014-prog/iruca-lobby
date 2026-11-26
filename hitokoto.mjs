// ひとこと演技: only the host sees which situation to act out with the given short line.
// Every listener secretly picks one of six situations within 45 seconds, then all answers open at once.
export const HK_GAME='hitokoto';
export const HK_ANSWER_MS=45000;
export const HK_LETTERS=['A','B','C','D','E','F'];
export const PROMPTS=[
 ['えっ',['財布がないと気づいた','好きな人に話しかけられた','会計が思ったより高い','サプライズで祝われた','聞き間違いかと思った','苦手な食べ物が出てきた']],
 ['はぁ',['宿題が倍に増えた','推しがかっこよすぎた','温泉につかった','理不尽に怒られた','階段を上りきった','意味不明な説明を聞いた']],
 ['なるほど',['心から納得した','わかってないけど相づち','皮肉で言う','手品のタネを知った','怪しいもうけ話を聞いた','自分の失敗の原因がわかった']],
 ['ありがとう',['心から感謝','いらない物をもらった','命を助けられた','店員さんに軽く','泣きながら','嫌味っぽく']],
 ['うそでしょ',['宝くじが当たった','電車が目の前で行った','親友が結婚する','テストが0点だった','推しが引退する','服に虫がついていた']],
 ['おいしい',['本当においしい','気をつかって言う','熱すぎる','3日ぶりのごはん','高級店で緊張している','子どもの手料理']],
 ['すごい',['本気で感動した','棒読みの社交辞令','怖いくらい','子どもをほめる','悔しいけど認める','呆れている']],
 ['もしもし',['寝起き','知らない番号から','恋人から','怒っている相手に','電波が悪い','図書館で小声']],
 ['いいよ',['快くOK','しぶしぶ','本当は許していない','誘いにノリノリ','疲れきっている','照れながら']],
 ['ただいま',['楽しい旅行から帰った','くたくたに疲れた','怒られる予感がする','誰もいない家に','久しぶりの実家','サプライズで帰ってきた']],
 ['おはよう',['さわやかに','寝坊して焦って','二日酔い','好きな人に','夜勤明け','けんかの翌朝で気まずい']],
 ['まじか',['うれしい知らせ','絶望した','感心した','ドン引きした','笑いをこらえている','冷静に受け止めた']],
 ['ごめん',['心から謝る','軽いノリで','謝る気ゼロ','誘いを断る','泣きながら','笑いながら']],
 ['よし',['気合を入れる','小さな成功','犬をほめる','覚悟を決めた','失敗をごまかす','疲れて仕方なく']],
 ['ちょっと',['人を呼び止める','怒って注意する','照れている','少しだけほしい','やんわり断る','驚いた']],
 ['あー',['思い出した','疲れた','発声練習','やらかした','あくび','納得した']],
 ['え、なに',['本当に聞こえなかった','けんか腰','照れている','怖い物音がした','いい予感がする','寝ぼけている']],
 ['だいじょうぶ',['本当に平気','強がっている','人を励ます','心配してたずねる','遠慮して断る','酔っぱらっている']],
 ['やったー',['心から喜ぶ','棒読み','小声でこっそり','子どもっぽく','勝利の雄たけび','皮肉で']],
 ['うん',['素直に同意','話を聞いていない','不満がある','照れている','眠い','深く感動した']],
 ['へぇ',['興味津々','興味がない','疑っている','驚いた','感心した','うらやましい']],
 ['おつかれ',['ねぎらう','皮肉で','自分もへとへと','別れぎわに軽く','上司に恐縮して','配信の締めに']],
 ['好き',['告白する','好物を見つけた','冗談っぽく','寝言','照れ隠しでぶっきらぼう','推しへの叫び']],
 ['いただきます',['腹ぺこ','苦手な料理を前に','高級料理を前に','急いでいる','礼儀正しく','大食い挑戦の前']],
 ['わかった',['素直に了解','本当はわかっていない','怒っている','ひらめいた','あきらめた','やさしく受け入れる']],
 ['はい',['元気よく返事','やる気がない','驚いて聞き返す','プロポーズの返事','怒りをこらえて','電話をとる']],
 ['おやすみ',['眠くて限界','恋人に甘く','寝かしつける','怒ったまま','明日が楽しみ','配信の締めに']],
 ['なんで',['本気で不思議','怒って問い詰める','悲しくて','甘えて','ツッコミ','絶望して']],
 ['いけるいける',['本気で励ます','自分に言い聞かせる','無責任に','ノリノリ','ちょっと不安','もう無理そう']],
 ['ふーん',['興味がない','すねている','実は気になる','見下している','納得した','嫉妬している']]
];
const STAT=()=>({rounds:0,hits:0,answers:0,correct:0});
function uniform(n){const limit=Math.floor(4294967296/n)*n;let v;do{v=crypto.getRandomValues(new Uint32Array(1))[0]}while(v>=limit);return v%n}
function reject(message,status=400){throw Object.assign(new Error(message),{status})}
function draw(hk){
  if(hk.used.length>=PROMPTS.length)hk.used=[];
  const free=PROMPTS.map((_,i)=>i).filter(i=>!hk.used.includes(i)),i=free[uniform(free.length)];
  hk.used.push(i);const [word,options]=PROMPTS[i];
  hk.word=word;hk.options=[...options];hk.secret=uniform(options.length);
}
export function hkInit(r){
  r.hk={phase:'ready',round:1,used:[],word:'',options:[],secret:0,answers:{},deadline:null,startedAt:null,last:null,host:STAT()};
  draw(r.hk);
}
const need=(r,phase)=>{if(!r.hk)reject('ひとこと演技の部屋ではありません');if(phase&&r.hk.phase!==phase)reject(phase==='ready'?'回答の受付中です':phase==='answer'?'いまは回答を受け付けていません':'いまはできない操作です')};
export function hkRedraw(r){need(r,'ready');draw(r.hk)}
export function hkOpen(r,at=Date.now()){need(r,'ready');const hk=r.hk;hk.phase='answer';hk.answers={};hk.startedAt=at;hk.deadline=at+HK_ANSWER_MS}
export function hkAnswer(r,p,b){
  need(r,'answer');const hk=r.hk;
  if(p===r.host)reject('配信者は演じる係です');
  if(p.demo)reject('CPUは参加できません');
  if(b.pick==null){delete hk.answers[p.id];return}
  const pick=Number(b.pick);if(!Number.isInteger(pick)||pick<0||pick>=hk.options.length)reject('選択肢を選んでください');
  hk.answers[p.id]={pick};
}
export function hkClose(r,players,at=Date.now()){
  need(r,'answer');const hk=r.hk,byId=new Map(players.map(p=>[p.id,p]));
  const rows=[];
  for(const [id,a] of Object.entries(hk.answers)){const p=byId.get(id);if(!p)continue;rows.push({id,name:p.name,pick:a.pick,ok:a.pick===hk.secret,p})}
  const counts=hk.options.map((_,i)=>rows.filter(x=>x.pick===i).length);
  const correct=rows.filter(x=>x.ok).length,top=Math.max(0,...counts);
  // 伝わった回: the right situation got strictly the most votes (a tie at the top does not count)
  const hit=rows.length>0&&counts[hk.secret]===top&&counts.filter(c=>c===top).length===1;
  for(const x of rows){x.p.hkAnswers=(x.p.hkAnswers||0)+1;if(x.ok)x.p.hkCorrect=(x.p.hkCorrect||0)+1}
  if(rows.length){hk.host.rounds++;hk.host.answers+=rows.length;hk.host.correct+=correct;if(hit)hk.host.hits++}
  hk.last={round:hk.round,word:hk.word,options:hk.options,secret:hk.secret,counts,total:rows.length,correct,hit,at,
    rows:rows.map(({p,...x})=>x).sort((a,b)=>b.ok-a.ok)};
  hk.phase='result';hk.answers={};hk.deadline=null;
  return hk.last;
}
export function hkTick(r,players,now=Date.now()){const hk=r.hk;if(!hk||hk.phase!=='answer'||now<hk.deadline)return null;return hkClose(r,players,now)}
export function hkNext(r){need(r,'result');const hk=r.hk;hk.round++;hk.phase='ready';draw(hk)}
export function hkResetStats(r,players){
  if(!r.hk)reject('ひとこと演技の部屋ではありません');if(r.hk.phase==='answer')reject('回答の受付中はリセットできません');
  r.hk.host=STAT();for(const p of players){p.hkAnswers=0;p.hkCorrect=0}
}
export function hkTimer(r){const hk=r.hk;return hk?.phase==='answer'?{kind:'answer',start:hk.startedAt,end:hk.deadline,total:HK_ANSWER_MS}:null}
export function hkState(r,me){
  const hk=r.hk;if(!hk)return null;
  const isHost=me===r.host,listeners=[...r.players.values()].filter(p=>!p.demo);
  const stat=p=>({id:p.id,name:p.name,answers:p.hkAnswers||0,correct:p.hkCorrect||0});
  const answers=Object.keys(hk.answers);
  return {phase:hk.phase,round:hk.round,word:hk.word,options:hk.options,
    secret:isHost||hk.phase==='result'?hk.secret:null,
    myAnswer:hk.answers[me.id]||null,answered:answers.length,answeredIds:answers,last:hk.last,host:hk.host,
    me:isHost?null:stat(me),
    ranking:listeners.filter(p=>p.hkAnswers).map(stat).sort((a,b)=>b.correct-a.correct||b.correct/b.answers-a.correct/a.answers).slice(0,10)};
}
