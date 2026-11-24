import {test} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs';import worker from './dist/server/index.js';
function database(){const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('drizzle/0000_lobby.sql','utf8'));return {DB:{prepare(sql){let args=[];return {bind(...a){args=a;return this},async first(){return db.prepare(sql).get(...args)},async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}}}}}}}
}
const realNow=Date.now;
test('Workerで2〜4人の賭け・準備・3D投擲・一巡・精算・ゲーム終了まで通す',async()=>{
 try{for(const count of [2,3,4]){
 let clock=realNow();Date.now=()=>clock;const env=database();
 async function api(path,data,token){const response=await worker.fetch(new Request('https://test.local/api/'+path,{method:data?'POST':'GET',headers:token?{authorization:'Bearer '+token}:{},body:data?JSON.stringify(data):undefined}),env);return {status:response.status,...await response.json()}}
 const h=await api('rooms',{name:'host',gameType:'chinchiro-rotation'}),root='rooms/'+h.state.id;const tokens={[h.state.me]:h.token};assert.equal(h.state.players.find(p=>p.id===h.state.me).points,3000);assert.deepEqual(h.state.players.filter(p=>p.demo).map(p=>[p.name,p.points]),[['😈デビルゴッドダイス',0],['🛁風呂キャンセル',0]]);
 for(let i=1;i<count;i++){const p=await api(root+'/join',{name:'human'+i});tokens[p.state.me]=p.token;assert.equal(p.state.players.find(x=>x.id===p.state.me).points,0);await api(root+'/action',{type:'want',value:true},p.token);await api(root+'/action',{type:'select',id:p.state.me},h.token)}
 const watcher=await api(root+'/join',{name:'spectator'});let state=await api(root+'/action',{type:'start'},h.token);assert.equal(state.phase,'betting');assert.equal(state.totalRounds,count);assert.equal((await api(root+'/action',{type:'bet',amount:100,ready:true},watcher.token)).status,403);assert.equal((await api(root+'/action',{type:'finish'},h.token)).status,400);
 const dealers=[];let previous=0;
 for(let rounds=0;rounds<count;rounds++){
  assert.equal(state.phase,'betting');dealers.push(state.dealerId);
  const children=state.roundOrder.filter(id=>id!==state.dealerId);
  for(const id of children){state=await api(root+'/action',{type:'bet',amount:100,ready:true},tokens[id]);assert.equal(state.status,200)}
  assert.equal(state.phase,'playing');assert.equal(state.turnId,state.dealerId);
  let guard=0;
  while(state.phase==='playing'&&guard++<50){
   if(state.turnId){const current=state.players.find(p=>p.id===state.turnId);if(!current.done){state=await api(root+'/action',{type:'roll'},tokens[current.id]);assert.equal(state.status,200);assert.ok(state.shot.frames.length>0)}}
   clock=Math.max(clock+1,state.shot.startedAt+state.shot.duration+1201);state=await api(root,null,h.token);
  }
  assert.ok(guard<50);assert.ok(['settlement','finished'].includes(state.phase));assert.equal(state.settlement.rows.reduce((total,p)=>total+p.delta,0),0);
  const before=state.settlement.rows.map(p=>p.points);clock+=1;state=await api(root,null,h.token);assert.deepEqual(state.settlement.rows.map(p=>p.points),before);
  if(state.phase==='settlement')state=await api(root+'/action',{type:'next'},h.token);
 }
 assert.equal(state.phase,'finished');assert.equal(new Set(dealers).size,count);assert.equal(state.settlement.rows.reduce((total,p)=>total+p.points,0),3000);
 }}finally{Date.now=realNow}
});
test('切断中も20秒で100点、20秒で投擲、親交代からゲーム終了まで自動進行',async()=>{
 try{let clock=realNow();Date.now=()=>clock;const env=database();
 async function api(path,data,token){const r=await worker.fetch(new Request('https://test.local/api/'+path,{method:data?'POST':'GET',headers:token?{authorization:'Bearer '+token}:{},body:data?JSON.stringify(data):undefined}),env);return {status:r.status,...await r.json()}}
 const h=await api('rooms',{name:'host',gameType:'chinchiro-rotation'}),root='rooms/'+h.state.id,p=await api(root+'/join',{name:'listener'});
 assert.match(h.state.id,/^\d{8}$/);
 await api(root+'/action',{type:'want',value:true},p.token);await api(root+'/action',{type:'select',id:p.state.me},h.token);
 for(let i=0;i<9;i++)await api(root+'/action',{type:'points',id:p.state.me,delta:1000},h.token);
 let s=await api(root+'/action',{type:'start'},h.token);const child=s.dealerId===p.state.me?h:p;
 clock+=19999;s=await api(root,null,h.token);assert.equal(s.phase,'betting');assert.equal(s.timer.total,20000);
 clock++;const late=await api(root+'/action',{type:'bet',amount:500,ready:true},child.token);assert.equal(late.status,400);
 s=await api(root,null,h.token);assert.equal(s.phase,'playing');assert.equal(s.players.find(x=>x.id===child.state.me).bet,100);assert.equal(s.timer.total,20000);
 clock+=19999;s=await api(root,null,h.token);assert.equal(s.shot,null);
 clock++;s=await api(root,null,h.token);assert.ok(s.shot);assert.ok(s.logs.some(x=>x.includes('自動投擲')));
 clock+=46000;s=await api(root,null,h.token);assert.equal(s.players.find(x=>x.id===p.state.me).online,false);
 const restored=await api(root,null,p.token);assert.equal(restored.me,p.state.me);assert.equal(restored.players.find(x=>x.id===p.state.me).online,true);assert.equal(restored.isHost,false);
 let guard=0;while(s.phase!=='finished'&&guard++<100){clock+=3000;s=await api(root,null,h.token)}assert.equal(s.phase,'finished');assert.equal(s.settlement.rows.reduce((t,p)=>t+p.points,0),12000);
 assert.equal((await api(root,null,'invalid')).status,401);
 }finally{Date.now=realNow}
});
test('24時間の閲覧は期限を延ばさず部屋IDを開放し、期限前のプレイは延長する',async()=>{
 try{let clock=realNow();Date.now=()=>clock;const env=database();
 async function api(path,data,token){const r=await worker.fetch(new Request('https://test.local/api/'+path,{method:data?'POST':'GET',headers:token?{authorization:'Bearer '+token}:{},body:data?JSON.stringify(data):undefined}),env);return {status:r.status,...await r.json()}}
 const h=await api('rooms',{name:'host',gameType:'chinchiro-rotation'}),root='rooms/'+h.state.id,expires=h.state.expiresAt;
 clock=expires-1;assert.equal((await api(root,null,h.token)).expiresAt,expires);
 clock=expires;assert.equal((await api(root,null,h.token)).status,404);
 assert.equal(await env.DB.prepare('SELECT data,version FROM lobby_rooms WHERE id = ?').bind(h.state.id).first(),undefined);
 const h2=await api('rooms',{name:'host2'}),root2='rooms/'+h2.state.id;
 clock+=1000;const bot=h2.state.players.find(x=>x.demo);await api(root2+'/action',{type:'select',id:bot.id},h2.token);
 const s=await api(root2+'/action',{type:'start'},h2.token);assert.equal(s.expiresAt,clock+86400000);
 clock=s.expiresAt;await api('rooms',{name:'cleanup'});
 assert.equal(await env.DB.prepare('SELECT data,version FROM lobby_rooms WHERE id = ?').bind(h2.state.id).first(),undefined);
 }finally{Date.now=realNow}
});

test('使用中の8桁IDは上書きせず、24時間後は同じIDを新しい資格で再利用できる',async()=>{
 const oldNow=Date.now,oldRandom=crypto.getRandomValues;let clock=realNow();Date.now=()=>clock;
 try{const env=database();async function api(path,data,token){const r=await worker.fetch(new Request('https://test.local/api/'+path,{method:data?'POST':'GET',headers:token?{authorization:'Bearer '+token}:{},body:data?JSON.stringify(data):undefined}),env);return {status:r.status,...await r.json()}}
 const h=await api('rooms',{name:'original'}),other=(Number(h.state.id)+1)%100000000;let calls=0;
 crypto.getRandomValues=a=>a instanceof Uint32Array?(a[0]=calls++===0?Number(h.state.id):other,a):oldRandom.call(crypto,a);
 const second=await api('rooms',{name:'second'});assert.equal(second.state.id,String(other).padStart(8,'0'));assert.equal((await api('rooms/'+h.state.id,null,h.token)).isHost,true);
 clock=h.state.expiresAt;crypto.getRandomValues=a=>a instanceof Uint32Array?(a[0]=Number(h.state.id),a):oldRandom.call(crypto,a);
 const reused=await api('rooms',{name:'new owner'});assert.equal(reused.state.id,h.state.id);assert.notEqual(reused.token,h.token);assert.equal((await api('rooms/'+h.state.id,null,h.token)).status,401);assert.equal((await api('rooms/'+h.state.id,null,reused.token)).isHost,true);
 }finally{Date.now=oldNow;crypto.getRandomValues=oldRandom}
});

test('0点以下のリスナーは席だけ外れ、同じ資格と持ち点で待機・観戦を続けられる',async()=>{
 const oldNow=Date.now;let clock=realNow();Date.now=()=>clock;
 try{const env=database();async function api(path,data,token){const r=await worker.fetch(new Request('https://test.local/api/'+path,{method:data?'POST':'GET',headers:token?{authorization:'Bearer '+token}:{},body:data?JSON.stringify(data):undefined}),env);return {status:r.status,...await r.json()}}
 const h=await api('rooms',{name:'host',gameType:'chinchiro-rotation'}),root='rooms/'+h.state.id,p=await api(root+'/join',{name:'listener'});
 await api(root+'/action',{type:'want',value:true},p.token);await api(root+'/action',{type:'select',id:p.state.me},h.token);
 for(const id of [h.state.me,p.state.me])for(let i=0;i<11;i++)await api(root+'/action',{type:'points',id,delta:-1000},h.token);
 let s=await api(root+'/action',{type:'start'},h.token);let guard=0;while(s.phase!=='finished'&&guard++<20){clock+=100000;s=await api(root,null,h.token)}assert.equal(s.phase,'finished');
 const guest=await api(root,null,p.token);assert.equal(guest.status,200);assert.equal(guest.me,p.state.me);assert.ok(!guest.selected.includes(p.state.me));const waiting=guest.players.find(x=>x.id===p.state.me);assert.equal(waiting.want,true);assert.ok(waiting.points<=0);assert.equal(guest.players.find(x=>x.id===h.state.me).points<=0,true);assert.equal(guest.hostPlaying,true);
 const adjusted=await api(root+'/action',{type:'points',id:p.state.me,delta:1000},h.token);assert.equal(adjusted.status,200);assert.equal(adjusted.players.find(x=>x.id===p.state.me).points,waiting.points+1000);
 }finally{Date.now=oldNow}
});

test('部屋作成時に両モードを選択でき、親固定は1ラウンドで終了し、不明なゲームは拒否',async()=>{
 const oldNow=Date.now;let clock=realNow();Date.now=()=>clock;
 try{const env=database();async function api(path,data,token){const r=await worker.fetch(new Request('https://test.local/api/'+path,{method:data?'POST':'GET',headers:token?{authorization:'Bearer '+token}:{},body:data?JSON.stringify(data):undefined}),env);return {status:r.status,...await r.json()}}
 assert.equal((await api('rooms',{name:'invalid',gameType:'not-a-game'})).status,400);
 assert.equal((await api('rooms',{name:'default'})).state.gameType,'chinchiro-fixed');
 const rotation=await api('rooms',{name:'rotation',gameType:'chinchiro-rotation'});assert.equal(rotation.state.gameName,'チンチロ（親回り）');
 const h=await api('rooms',{name:'fixed',gameType:'chinchiro-fixed'}),root='rooms/'+h.state.id;
 const p=await api(root+'/join',{name:'listener'});assert.equal(p.state.gameType,'chinchiro-fixed');
 await api(root+'/action',{type:'want',value:true},p.token);await api(root+'/action',{type:'select',id:p.state.me},h.token);
 let s=await api(root+'/action',{type:'start'},h.token);assert.equal(s.totalRounds,1);assert.equal(s.dealerId,h.state.me);
 let guard=0;while(s.phase!=='finished'&&guard++<20){clock+=30000;s=await api(root,null,h.token)}assert.equal(s.phase,'finished');assert.equal(s.round,1);assert.equal(s.settlement.dealerId,h.state.me);
 const saved=await env.DB.prepare('SELECT data,version FROM lobby_rooms WHERE id = ?').bind(h.state.id).first();assert.equal(JSON.parse(saved.data).gameType,'chinchiro-fixed');
 const legacy=JSON.parse(saved.data);delete legacy.gameType;legacy.phase='lobby';delete legacy.game;await env.DB.prepare('UPDATE lobby_rooms SET data = ?, version = version + 1 WHERE id = ? AND version = ?').bind(JSON.stringify(legacy),h.state.id,saved.version).run();
 assert.equal((await api(root,null,h.token)).gameType,'chinchiro-rotation');
 }finally{Date.now=oldNow}
});
