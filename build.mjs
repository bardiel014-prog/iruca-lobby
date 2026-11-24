import fs from 'node:fs';
import {build} from 'esbuild';
await build({entryPoints:['dice-view.js'],bundle:true,format:'esm',platform:'browser',minify:true,outfile:'public/dice-bundle.js'});
let code=fs.readFileSync('node-server.mjs','utf8');
code=code.replace(/^import .*;\n/gm,'').replace('export function hand','function hand');
code=code.replace('export const server = http.createServer(async (req, res) => {','async function handle(req, res) {');
code=code.slice(0,code.indexOf('const timer='));
code=code.trim().replace(/\}\);$/,'}');
const assets=Object.fromEntries(['index.html','app.js','games.js','style.css','dice-bundle.js'].map(f=>[f,fs.readFileSync('public/'+f,'utf8')]));
const prefix=`import {GAMES,gameDefinition} from './public/games.js';\nimport {evaluate,balance,inGame,beginGame,setBet,startRoundIfReady,rollPlayer,tickGame,nextRound,returnLobby,logEvent,timerState,accuse} from './game.mjs';\nimport {ROOM_TTL,roomExpiry,roomExpired} from './room-life.mjs';\nimport {HL_GAME,hlInit,hlBet,hlFlip,hlState,cpuHighLowBets,cardLabel} from './highlow.mjs';\nimport {KB_GAME,kbInit,kbSelect,kbLives,kbStart,kbRetheme,kbWord,kbTick,kbMove,kbReveal,kbReset,kbTimer,kbState} from './kotoba.mjs';\nconst assets=${JSON.stringify(assets)};
const randomBytes=n=>({toString:()=>Array.from(crypto.getRandomValues(new Uint8Array(n)),v=>v.toString(16).padStart(2,'0')).join('')});
const randomInt=(min,max)=>{let x; const limit=Math.floor(4294967296/(max-min))*(max-min); do{x=crypto.getRandomValues(new Uint32Array(1))[0]}while(x>=limit);return min+x%(max-min)};
async function readFile(url){return assets[url.pathname.split('/').pop()]}
export default {async fetch(request,env){
const url=new URL(request.url), roomId=url.pathname.match(/^\\/api\\/rooms\\/([a-f0-9]{8})/)?.[1];
const payload=await request.text();
for(let retry=0;retry<8;retry++){
`;
const suffix=`
if(url.pathname==='/api/rooms'&&request.method==='POST')await env.DB.prepare("DELETE FROM lobby_rooms WHERE COALESCE(json_extract(data,'$.lastPlayedAt'),json_extract(data,'$.createdAt'),json_extract(data,'$.updated'),0) <= ?").bind(Date.now()-ROOM_TTL).run();
let original=null;
if(roomId){original=await env.DB.prepare('SELECT data,version FROM lobby_rooms WHERE id = ?').bind(roomId).first();if(original){const r=JSON.parse(original.data);if(roomExpired(r)){const gone=await env.DB.prepare('DELETE FROM lobby_rooms WHERE id = ? AND version = ?').bind(roomId,original.version).run();if(!gone.meta.changes)continue;return Response.json({error:'最終プレイから24時間が経過し、部屋IDは解放されました'},{status:404})}r.players=new Map(r.players);rooms.set(roomId,r)}}
const req={url:url.pathname+url.search,method:request.method,headers:{...Object.fromEntries(request.headers),host:url.host},async *[Symbol.asyncIterator](){yield payload}};
let status=200,headers={},response='';
const res={writeHead(s,h){status=s;headers=h},end(s){response=s??''}};
await handle(req,res);
const r=roomId?rooms.get(roomId):[...rooms.values()][0];
if((status<400||r?.__requestAuthorized) && url.pathname.startsWith('/api/')){
if(r)delete r.__requestAuthorized;
if(r){const data=JSON.stringify({...r,players:[...r.players]});
if(original){const saved=await env.DB.prepare('UPDATE lobby_rooms SET data = ?, version = version + 1 WHERE id = ? AND version = ?').bind(data,r.id,original.version).run();if(!saved.meta.changes)continue;}
else {const saved=await env.DB.prepare('INSERT INTO lobby_rooms (id,data,version) VALUES (?,?,0) ON CONFLICT(id) DO NOTHING').bind(r.id,data).run();if(!saved.meta.changes)continue;}
}}
return new Response(request.method==='HEAD'?null:response,{status,headers});
}
return Response.json({error:'混み合っています。もう一度試してね'},{status:409});
}};
`;
fs.mkdirSync('dist/server',{recursive:true});
fs.mkdirSync('dist/.openai',{recursive:true});
await build({stdin:{contents:prefix+code+suffix,resolveDir:process.cwd(),loader:'js'},bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/server/index.js'});
if(fs.existsSync('.openai/hosting.json'))fs.copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');
