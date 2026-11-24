import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,readFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import worker from './dist/server/index.js';

export function createServer({databasePath=process.env.LOBBY_DB||'./data/lobby.sqlite'}={}){
 if(databasePath!==':memory:')mkdirSync(dirname(databasePath),{recursive:true,mode:0o700});
 const database=new DatabaseSync(databasePath);
 database.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
 database.exec(readFileSync(new URL('./drizzle/0000_lobby.sql',import.meta.url),'utf8').replace('CREATE TABLE ','CREATE TABLE IF NOT EXISTS '));
 const env={DB:{prepare(sql){let args=[];return {bind(...values){args=values;return this},async first(){return database.prepare(sql).get(...args)},async run(){return {meta:{changes:database.prepare(sql).run(...args).changes}}}}}}};
 const server=http.createServer(async(req,res)=>{
  try{
   const chunks=[];let length=0;
   for await(const chunk of req){length+=chunk.length;if(length>8192){res.writeHead(413);res.end('入力が長すぎます');return}chunks.push(chunk)}
   const url=new URL(req.url,'http://'+req.headers.host);
   const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
   const response=await worker.fetch(request,env);
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:'通信に失敗しました'}))}
 });
 server.on('close',()=>database.close());
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const server=createServer();server.listen(Number(process.env.PORT||3190),process.env.HOST||'127.0.0.1',()=>console.log('iruca lobby ready'));
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
