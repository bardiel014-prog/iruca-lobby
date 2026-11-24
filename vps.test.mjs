import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from './server-vps.mjs';
const listen=s=>new Promise(resolve=>s.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+s.address().port)));
const close=s=>new Promise(resolve=>s.close(resolve));
test('VPS HTTP API、静的assets、Origin検査、再起動後の同じ資格による部屋復帰',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'lobby-vps-')),databasePath=join(dir,'lobby.sqlite');let server=createServer({databasePath});
 try{
  let base=await listen(server);
  const created=await fetch(base+'/api/rooms',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'host'})});assert.equal(created.status,201);const host=await created.json();
  const joined=await fetch(base+'/api/rooms/'+host.state.id+'/join',{method:'POST',body:JSON.stringify({name:'listener'})});const guest=await joined.json();assert.equal(guest.state.players.find(p=>p.id===guest.state.me).points,0);
  for(const [path,mime] of [['/','text/html'],['/app.js','text/javascript'],['/games.js','text/javascript'],['/style.css','text/css'],['/dice-bundle.js','text/javascript']]){const res=await fetch(base+path);assert.equal(res.status,200);assert.ok(res.headers.get('content-type').startsWith(mime))}
  const bad=await fetch(base+'/api/rooms/'+host.state.id+'/action',{method:'POST',headers:{origin:'https://other.example',authorization:'Bearer '+host.token},body:'{"type":"start"}'});assert.equal(bad.status,403);
  await close(server);server=createServer({databasePath});base=await listen(server);
  for(const [token,id,isHost] of [[host.token,host.state.me,true],[guest.token,guest.state.me,false]]){const res=await fetch(base+'/api/rooms/'+host.state.id,{headers:{authorization:'Bearer '+token}});assert.equal(res.status,200);const state=await res.json();assert.equal(state.me,id);assert.equal(state.isHost,isHost);assert.equal(state.gameType,'chinchiro-fixed')}
 }finally{await close(server);rmSync(dir,{recursive:true,force:true})}
});
