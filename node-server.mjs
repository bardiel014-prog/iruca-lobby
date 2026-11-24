import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {evaluate,balance,inGame,beginGame,setBet,startRoundIfReady,rollPlayer,tickGame,nextRound,returnLobby,logEvent,timerState,accuse} from './game.mjs';
import {GAMES,gameDefinition} from './public/games.js';
import {roomExpiry,roomExpired} from './room-life.mjs';
import {HL_GAME,hlInit,hlBet,hlFlip,hlState,cpuHighLowBets,cardLabel} from './highlow.mjs';
import {KB_GAME,kbInit,kbSelect,kbLives,kbStart,kbRetheme,kbWord,kbTick,kbMove,kbReveal,kbReset,kbTimer,kbState} from './kotoba.mjs';

const rooms = new Map();
const token = () => randomBytes(24).toString('hex');
const clean = (v, fallback) => String(v || fallback).trim().slice(0, 24) || fallback;
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const active = p => p.demo || Date.now() - p.seen < 45000;
export function hand(dice) {return evaluate(dice).name;}
function state(r,me){
  const g=r.game;
  return {id:r.id,serverNow:Date.now(),expiresAt:roomExpiry(r),timer:r.gameType===KB_GAME?kbTimer(r):timerState(r),gameType:gameDefinition(r.gameType).id,gameName:gameDefinition(r.gameType).name,title:r.title,hostId:r.host.id,phase:r.phase,round:r.round,gameNumber:r.gameNumber||0,
    turnId:r.phase==='playing'?g?.roundOrder[g.turnIndex]||null:null,
    dealerId:g?.dealerId||null,roundOrder:g?.roundOrder||[],totalRounds:g?.totalRounds??g?.order.length??0,
    lastRollId:r.lastRollId||null,shot:r.shot?.version===2?r.shot:null,settlement:r.settlement||null,
    me:me.id,isHost:me===r.host,hostPlaying:true,selected:r.selected,logs:r.logs,hl:hlState(r,me),kb:r.gameType===KB_GAME?kbState(r,me):null,cheatMode:!!gameDefinition(r.gameType).cheat,judgement:r.phase==='judgement'?{accuserId:g.judgement.accuserId,revealAt:g.judgement.revealAt}:r.judgement||null,hostCheated:me===r.host&&gameDefinition(r.gameType).cheat?!!g?.cheated:undefined,
    players:[r.host,...r.players.values()].map(p=>({id:p.id,name:p.name,want:p.want,online:active(p),demo:!!p.demo,
      points:balance(p),plays:p.plays,dice:p.dice,attempts:p.attempts,done:p.done,bet:p.bet||100,ready:!!p.ready,roundDelta:p.roundDelta??null}))};
}
const log=logEvent;
function kbAdvance(r){
  const res=kbTick(r);if(!res)return;
  const out=r.kb.cards.filter(c=>c.excluded).map(c=>c.name);
  if(out.length)log(r,`時間切れで除外：${out.join('、')}`);
  log(r,res==='void'?'残りが1人以下のため不成立。ライフは除外されなかった人に戻しました':'全員の言葉がそろいました。配信者が並べ替えます');
}
function addDemoListeners(r) {
  if(r.gameType===KB_GAME)return;
  const names=['😈デビルゴッドダイス','🛁風呂キャンセル'];
  for(const p of r.players.values())if(p.demo)p.cpuKind=p.name===names[0]?'devil':'bath';
  if(r.cpuRosterVersion===1||inGame(r))return;
  const previous=[...r.players.values()].filter(p=>p.demo);
  for(let i=0;i<names.length;i++){
    const p=previous[i]||{id:token(),auth:token(),want:true,demo:true,points:0,seen:Date.now(),plays:0,dice:[],attempts:0,done:false};
    p.name=names[i];p.cpuKind=i===0?'devil':'bath';r.players.set(p.id,p);
  }
  for(const p of previous.slice(names.length)){r.players.delete(p.id);r.selected=r.selected.filter(id=>id!==p.id)}
  r.cpuRosterVersion=1;
  log(r,'CPUのデビルゴッドダイスと風呂キャンセルが待機しています');
}
async function body(req) {
  let s = '';
  for await (const chunk of req) { s += chunk; if (s.length > 8192) fail('入力が長すぎます', 413); }
  try { return JSON.parse(s || '{}'); } catch { fail('入力を読み取れません'); }
}
export const server = http.createServer(async (req, res) => {
  const send = (status, data) => { res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}); res.end(JSON.stringify(data)); };
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      if (req.method === 'POST' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) fail('別サイトからは操作できません',403);
      if (url.pathname === '/api/rooms' && req.method === 'POST') {
        for(const [key,room] of rooms)if(roomExpired(room))rooms.delete(key);
        if (rooms.size >= 100) fail('部屋がいっぱいです',503);
        const b = await body(req);
        const gameType=b.gameType??'chinchiro-fixed';
        if(!GAMES.some(game=>game.id===gameType))fail('ゲームの種類を選んでください');
        let id;
        do { id = String(randomInt(0,100000000)).padStart(8,'0'); } while (rooms.has(id));
        const host = { id:token(), auth:token(), name:clean(b.name,'配信者'), points:3000, want:false, seen:Date.now(), plays:0, dice:[], attempts:0, done:false };
        const r = { id, gameType, title:clean(b.title,gameType===HL_GAME?'今夜のハイ＆ロー':gameType===KB_GAME?'今夜のことばならべ':'今夜のチンチロ部屋'), host, players:new Map(), selected:[], phase:'lobby', round:0, logs:[], createdAt:Date.now(),lastPlayedAt:Date.now(),updated:Date.now() };
        rooms.set(id,r); log(r,'部屋ができました。参加者を待っています'); addDemoListeners(r);
        if(gameType===KB_GAME)kbInit(r);
        if(gameType===HL_GAME){hlInit(r);cpuHighLowBets(r,[...r.players.values()]);log(r,`ハイ＆ロー開始：最初のカードは ${cardLabel(r.hl.current)}`)}
        return send(201,{token:host.auth,state:state(r,host)});
      }
      const match = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{8})(?:\/(join|action))?$/);
      if (!match) fail('見つかりません',404);
      const r = rooms.get(match[1]); if (!r) fail('部屋が見つかりません。配信者に新しいURLを確認してね',404);
      r.lastPlayedAt??=r.createdAt??r.updated;
      if(roomExpired(r)){rooms.delete(r.id);fail('最終プレイから24時間が経過し、部屋IDは解放されました',404)}
      if (match[2] === 'join' && req.method === 'POST') {
        if (r.players.size >= 200) fail('満室です');
        const b = await body(req);
        const p = { id:token(), auth:token(), name:clean(b.name,'リスナー'), points:0, want:false, seen:Date.now(), plays:0, dice:[], attempts:0, done:false };
        r.players.set(p.id,p); r.updated=Date.now(); log(r,`${p.name} が入室しました`);
        return send(201,{token:p.auth,state:state(r,p)});
      }
      const auth = req.headers.authorization?.replace(/^Bearer /,'');
      const me = [r.host,...r.players.values()].find(p=>p.auth===auth);
      if (!me) fail('入室してください',401);
      r.__requestAuthorized=true;
      if(me===r.host) addDemoListeners(r);
      me.seen=Date.now(); r.updated=Date.now();
      tickGame(r);kbAdvance(r);
      if (!match[2] && req.method==='GET') return send(200,state(r,me));
      if (match[2] !== 'action' || req.method !== 'POST') fail('操作できません',405);
      const b=await body(req);
      if (['select','start','finish','points','next','hl-flip','kb-select','kb-start','kb-retheme','kb-move','kb-reveal','kb-reset','kb-lives'].includes(b.type) && me!==r.host) fail('配信者だけが操作できます',403);
      const isHL=r.gameType===HL_GAME;
      const isKB=r.gameType===KB_GAME;
      if((isHL||isKB)&&['select','start','bet','roll','next','finish','accuse'].includes(b.type))fail('このゲームでは使えない操作です');
      if(!isKB&&String(b.type).startsWith('kb-'))fail('このゲームでは使えない操作です');
      if(!isHL&&String(b.type).startsWith('hl-'))fail('このゲームでは使えない操作です');
      if(b.type==='points') {
        const p=b.id===r.host.id?r.host:r.players.get(b.id);
        if(!p) fail('メンバーが見つかりません');
        if(![100,1000,-100,-1000].includes(b.delta)) fail('持ち点の操作が不正です');
        const total=(p.points??1000)+b.delta;
        if(!Number.isSafeInteger(total)) fail('持ち点の上限です');
        p.points=total;
        if(r.phase==='betting'&&p.id!==r.game.dealerId&&p.bet>Math.max(100,total)){p.bet=100;p.ready=false}
        log(r,`${p.name}${p===r.host?' ⭐️':''}：${b.delta>0?'+':''}${b.delta}点（${p.points}点）`);
      } else if (b.type==='want') {
        if (me===r.host) fail('配信者は常に参加します');
        if (inGame(r) && r.game?.order.includes(me.id)) fail('対戦中は変更できません');
        me.want=!!b.value;
        if (!me.want) {r.selected=r.selected.filter(id=>id!==me.id);if(r.kb&&['lobby','result'].includes(r.kb.phase))r.kb.selected=r.kb.selected.filter(id=>id!==me.id)}
      } else if (b.type==='select') {
        if (!['lobby','finished'].includes(r.phase)) fail('ゲーム終了後に入れ替えられます');
        const p=r.players.get(b.id); if (!p) fail('参加者が見つかりません');
        if (r.selected.includes(p.id)) r.selected=r.selected.filter(id=>id!==p.id);
        else { if (!p.want || !active(p)) fail('参加希望・接続状態を確認してください'); if (r.selected.length>=3) fail('卓は4人までです'); r.selected.push(p.id); }
      } else if(b.type==='start') {
        if(!['lobby','finished'].includes(r.phase))fail('すでに開始しています');
        if(r.selected.some(id=>!r.players.get(id)?.want||!active(r.players.get(id))))fail('参加者の接続状態を確認してください');
        beginGame(r);
      } else if(b.type==='bet') {
        setBet(r,me,b.amount,b.ready);startRoundIfReady(r);
      } else if(b.type==='roll') {
        rollPlayer(r,me,Date.now(),false,b.loaded===true);
      } else if(b.type==='accuse') {
        accuse(r,me);
      } else if(b.type==='next') {
        nextRound(r);
      } else if(b.type==='finish') {
        returnLobby(r);
      } else if(b.type==='kb-select') {
        kbSelect(r,b.id);
      } else if(b.type==='kb-lives') {
        const p=kbLives(r,b.id,b.delta);log(r,`${p.name}：ライフ ${b.delta>0?'+':''}${b.delta}（残り${p.lives}）`);
      } else if(b.type==='kb-start') {
        kbStart(r);log(r,`第${r.kb.round}回：お題「${r.kb.theme.text}」。30秒で言葉を出してね`);
      } else if(b.type==='kb-retheme') {
        kbRetheme(r);log(r,`お題を引き直し：「${r.kb.theme.text}」`);
      } else if(b.type==='kb-word') {
        kbWord(r,me,b.word);
      } else if(b.type==='kb-move') {
        kbMove(r,b.order);
      } else if(b.type==='kb-reveal') {
        const res=kbReveal(r);if(res)log(r,`第${r.kb.round}回：${res.correct}/${res.total}枚が正しい位置${res.correct===res.total?'。全員成功！':''}`);
      } else if(b.type==='kb-reset') {
        kbReset(r);
      } else if(b.type==='hl-bet') {
        hlBet(r,me,b);
      } else if(b.type==='hl-flip') {
        const res=hlFlip(r,[r.host,...r.players.values()]),diff=res.next.rank-res.prev.rank;
        log(r,`第${res.round}回：${cardLabel(res.prev)} → ${cardLabel(res.next)}（${diff>0?'ハイ':diff<0?'ロー':'同じ数字'}）・勝ち ${res.results.filter(x=>x.delta>0).length}人`);
        if(r.hl.reshuffled)log(r,'山札を切り直しました');
        cpuHighLowBets(r,[...r.players.values()]);
      } else fail('不明な操作です');
      if(['start','bet','roll','next','hl-bet','hl-flip','kb-start','kb-word','kb-move','kb-reveal'].includes(b.type))r.lastPlayedAt=Date.now();
      tickGame(r);kbAdvance(r);
      return send(200,state(r,me));
    }
    if (req.method!=='GET' && req.method!=='HEAD') fail('操作できません',405);
    const file = ['app.js','games.js','dice-bundle.js','style.css'].find(f=>url.pathname.endsWith('/'+f))||'index.html';
    const data=await readFile(new URL(`./public/${file}`,import.meta.url));
    res.writeHead(200,{'content-type':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}); res.end(req.method==='HEAD'?undefined:data);
  } catch(e) { send(e.status||500,{error:e.status?e.message:'通信に失敗しました'}); }
});
const timer=setInterval(()=>{for(const [id,r] of rooms) if(roomExpired(r))rooms.delete(id);},60000); timer.unref();
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const option = name => { const i=process.argv.indexOf(name); return i>=0?process.argv[i+1]:undefined; };
  server.listen(Number(option('--port')||process.env.PORT||3000),option('--host')||process.env.HOST||'0.0.0.0',()=>console.log('Stream lobby listening'));
}
