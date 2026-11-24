import {execFileSync} from 'node:child_process';
import {mkdirSync,copyFileSync,rmSync} from 'node:fs';
await import('./build.mjs');
rmSync('release-vps',{recursive:true,force:true});
for(const dir of ['dist/server','drizzle','deploy'])mkdirSync('release-vps/'+dir,{recursive:true});
for(const file of ['server-vps.mjs','dist/server/index.js','drizzle/0000_lobby.sql','deploy/lobby.caddy','deploy/iruca-lobby.service','README.md'])copyFileSync(file,'release-vps/'+file);
execFileSync('tar',['-czf','lobby-vps.tar.gz','-C','release-vps','.']);
console.log('Created lobby-vps.tar.gz (Node 24+, no runtime npm install)');
