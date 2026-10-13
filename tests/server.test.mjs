import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {PDFDocument} from 'pdf-lib';
import net from 'node:net';
test('Password-free upload, concurrent marks, undo and restart persistence',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'tisk-test-'));const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const base='http://127.0.0.1:'+port;
 const staticDir=path.join(dir,'static');await mkdir(path.join(staticDir,'assets'),{recursive:true});await writeFile(path.join(staticDir,'index.html'),'<html>Projekti in tisk</html>');await writeFile(path.join(staticDir,'assets','app.js'),'console.log("ok");');
 let processHandle;
 const launch=async()=>{processHandle=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATA_DIR:dir,STATIC_DIR:staticDir+'/',APP_ORIGIN:base},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{processHandle.stdout.once('data',resolve);processHandle.once('exit',()=>reject(Error('Server failed')));setTimeout(()=>reject(Error('Startup timeout')),10000).unref();});};
 const stop=()=>new Promise(r=>{processHandle.once('exit',r);processHandle.kill('SIGTERM');});
 const request=(method,url='',body)=>fetch(base+'/api/data'+url,{method,headers:{...(body&&!(body instanceof Uint8Array)?{'Content-Type':'application/json'}:{})},body:body?(body instanceof Uint8Array?body:JSON.stringify(body)):undefined});
 try{await launch();
 const home=await fetch(base+'/');assert.equal(home.status,200);assert.match(home.headers.get('content-type'),/text\/html/);assert.match(await home.text(),/Projekti in tisk/);
 const head=await fetch(base+'/',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
 const asset=await fetch(base+'/assets/app.js');assert.equal(asset.status,200);assert.equal(await asset.text(),'console.log("ok");');
 assert.equal((await fetch(base+'/%2e%2e%2fpackage.json')).status,403);
const anonymous=await fetch(base+'/api/data');assert.equal(anonymous.status,200);assert.equal(anonymous.headers.has('www-authenticate'),false);
 const p=await (await request('POST','',{name:'Test project'})).json();const pdf=await PDFDocument.create();pdf.addPage();pdf.addPage();pdf.addPage();const d=await (await request('POST','?kind=upload&project='+p.id+'&group=SDe08%20-%20I.%20del&name=test.pdf',await pdf.save())).json();assert.equal(d.pages,3);assert.equal(d.group,'SDe08 - I. del');
 const projectUpdated=await (await request('PATCH','?kind=project&id='+p.id,{printStamp:'7'})).json();assert.equal(projectUpdated.printStamp,'7');
 assert.equal((await request('PATCH','?kind=project&id='+p.id,{printStamp:'x'})).status,400);
 await Promise.all([request('PATCH','?id='+d.id,{pages:[1],printed:true}),request('PATCH','?id='+d.id,{pages:[2],printed:true})]);
 let rows=await (await request('GET')).json();assert.deepEqual(rows.find(x=>x.id===d.id).printed,[1,2]);
 assert.equal((await request('PATCH','?id='+d.id,{pages:[4],printed:true})).status,400);
 const csrf=await fetch(base+'/api/data',{method:'POST',headers:{Origin:'https://bad.example'},body:'{}'});assert.equal(csrf.status,403);
 const moved=await (await request('PATCH','?kind=group&id='+d.id,{group:'SDe08 - II. del'})).json();assert.equal(moved.group,'SDe08 - II. del');assert.deepEqual(moved.printed,[1,2]);
 await request('PATCH','?id='+d.id,{pages:[1],printed:false});await stop();await launch();rows=await (await request('GET')).json();assert.deepEqual(rows.find(x=>x.id===d.id).printed,[2]);assert.equal(rows.find(x=>x.id===d.id).group,'SDe08 - II. del');assert.equal(rows.find(x=>x.id===p.id).printStamp,'7');
 assert.equal((await request('GET','?kind=file&id='+d.id)).headers.get('content-type'),'application/pdf');
 }finally{if(processHandle&&processHandle.exitCode===null)await stop();await rm(dir,{recursive:true,force:true});}
});

