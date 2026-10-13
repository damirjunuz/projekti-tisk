import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {PDFDocument} from 'pdf-lib';
import net from 'node:net';
test('Admin session, upload, task history and restart persistence',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'tisk-test-'));const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const base='http://127.0.0.1:'+port;
 const staticDir=path.join(dir,'static');await mkdir(path.join(staticDir,'assets'),{recursive:true});await writeFile(path.join(staticDir,'index.html'),'<html>Projekti in tisk</html>');await writeFile(path.join(staticDir,'assets','app.js'),'console.log("ok");');
 let processHandle,sessionCookie='';
 const launch=async()=>{processHandle=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',ADMIN_PIN:'123456',DATA_DIR:dir,STATIC_DIR:staticDir+'/',APP_ORIGIN:base},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{processHandle.stdout.once('data',resolve);processHandle.once('exit',()=>reject(Error('Server failed')));setTimeout(()=>reject(Error('Startup timeout')),10000).unref();});const login=await fetch(base+'/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:'admin',pin:'123456'})});assert.equal(login.status,200);sessionCookie=login.headers.get('set-cookie').split(';')[0];};
 const stop=()=>new Promise(r=>{processHandle.once('exit',r);processHandle.kill('SIGTERM');});
 const request=(method,url='',body)=>fetch(base+'/api/data'+url,{method,headers:{Cookie:sessionCookie,...(body&&!(body instanceof Uint8Array)?{'Content-Type':'application/json'}:{})},body:body?(body instanceof Uint8Array?body:JSON.stringify(body)):undefined});
 try{await launch();
 const home=await fetch(base+'/');assert.equal(home.status,200);assert.match(home.headers.get('content-type'),/text\/html/);assert.match(await home.text(),/Projekti in tisk/);
 const head=await fetch(base+'/',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
 const asset=await fetch(base+'/assets/app.js');assert.equal(asset.status,200);assert.equal(await asset.text(),'console.log("ok");');
 assert.equal((await fetch(base+'/%2e%2e%2fpackage.json')).status,403);
const anonymous=await fetch(base+'/api/data');assert.equal(anonymous.status,401);assert.equal(anonymous.headers.has('www-authenticate'),false);
 const p=await (await request('POST','',{name:'Test project'})).json();assert.equal(p.nextDelivery,1);assert.equal((await request('PATCH','?kind=finish-delivery&id='+p.id,{delivery:1})).status,400);const pdf=await PDFDocument.create();pdf.addPage();pdf.addPage();pdf.addPage();const d=await (await request('POST','?kind=upload&project='+p.id+'&group=SDe08%20-%20I.%20del&name=test.pdf',await pdf.save())).json();assert.equal(d.pages,3);assert.equal(d.group,'SDe08 - I. del');
 const person=await (await request('POST','?kind=person',{name:'Sodelavec'})).json();const samePerson=await (await request('POST','?kind=person',{name:'sodelavec'})).json();assert.equal(samePerson.id,person.id);
 const otherPerson=await (await request('POST','?kind=person',{name:'Drugi'})).json();assert.equal((await request('POST','?kind=task',{project:p.id,title:'Pločevine',assigneeId:'missing'})).status,404);
 const task=await (await request('POST','?kind=task',{project:p.id,title:'Pločevine',assigneeId:person.id})).json();assert.equal(task.assigneeName,'Sodelavec');assert.equal(task.done,false);
 assert.equal((await fetch(base+'/api/data?kind=task&id='+task.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({done:true,actorId:otherPerson.id})})).status,401);
 const confirmed=await (await request('PATCH','?kind=task&id='+task.id,{done:true,actorId:person.id})).json();assert.equal(confirmed.done,true);assert.equal(confirmed.confirmedBy,'Upravitelj');assert.ok(confirmed.confirmedAt);assert.equal(confirmed.history.length,1);
 const repeat=await (await request('PATCH','?kind=task&id='+task.id,{done:true,actorId:person.id})).json();assert.equal(repeat.confirmedAt,confirmed.confirmedAt);assert.equal(repeat.history.length,1);

 const closed=await (await request('PATCH','?kind=finish-delivery&id='+p.id,{delivery:1})).json();assert.deepEqual(closed.completedDeliveries,[1]);assert.equal(closed.nextDelivery,2);
 const closedAgain=await (await request('PATCH','?kind=finish-delivery&id='+p.id,{delivery:1})).json();assert.equal(closedAgain.nextDelivery,2);assert.deepEqual(closedAgain.completedDeliveries,[1]);

 const projectUpdated=await (await request('PATCH','?kind=project&id='+p.id,{printStamp:'7'})).json();assert.equal(projectUpdated.printStamp,'7');
 assert.equal((await request('PATCH','?kind=project&id='+p.id,{printStamp:'x'})).status,400);
 await Promise.all([request('PATCH','?id='+d.id,{pages:[1],printed:true}),request('PATCH','?id='+d.id,{pages:[2],printed:true})]);
 let rows=await (await request('GET')).json();assert.deepEqual(rows.find(x=>x.id===d.id).printed,[1,2]);
 assert.equal((await request('PATCH','?id='+d.id,{pages:[4],printed:true})).status,400);
 const csrf=await fetch(base+'/api/data',{method:'POST',headers:{Cookie:sessionCookie,Origin:'https://bad.example'},body:'{}'});assert.equal(csrf.status,403);
 const moved=await (await request('PATCH','?kind=group&id='+d.id,{group:'SDe08 - II. del'})).json();assert.equal(moved.group,'SDe08 - II. del');assert.deepEqual(moved.printed,[1,2]);
 await request('PATCH','?id='+d.id,{pages:[1],printed:false});await stop();await launch();rows=await (await request('GET')).json();assert.deepEqual(rows.find(x=>x.id===d.id).printed,[2]);assert.equal(rows.find(x=>x.id===d.id).group,'SDe08 - II. del');assert.equal(rows.find(x=>x.id===p.id).printStamp,'7');assert.equal(rows.find(x=>x.id===p.id).nextDelivery,2);assert.deepEqual(rows.find(x=>x.id===p.id).completedDeliveries,[1]);assert.equal(rows.find(x=>x.id===task.id).done,true);assert.equal(rows.find(x=>x.id===task.id).confirmedBy,'Upravitelj');const reopened=await (await request('PATCH','?kind=task&id='+task.id,{done:false,actorId:person.id})).json();assert.equal(reopened.confirmedAt,null);assert.equal(reopened.history.length,2);
 assert.equal((await request('GET','?kind=file&id='+d.id)).headers.get('content-type'),'application/pdf');
 const d2=await (await request('POST','?kind=upload&project='+p.id+'&name=second.pdf',await pdf.save())).json();assert.equal(d2.delivery,1);rows=await (await request('GET')).json();assert.deepEqual(rows.find(x=>x.id===p.id).completedDeliveries,[]);assert.equal(rows.find(x=>x.id===p.id).nextDelivery,2);
 const p2=await (await request('POST','',{name:'Keep this project'})).json();const keepTask=await (await request('POST','?kind=task',{project:p2.id,title:'Keep task',assigneeId:person.id})).json();const removeTask=await (await request('POST','?kind=task',{project:p2.id,title:'Remove task',assigneeId:person.id})).json();assert.equal((await request('DELETE','?kind=task&id='+removeTask.id)).status,200);const d3=await (await request('POST','?kind=upload&project='+p2.id+'&name=keep.pdf',await pdf.save())).json();const legacy={...d3};delete legacy.delivery;await writeFile(path.join(dir,'meta','d-'+d3.id+'.json'),JSON.stringify(legacy));rows=await (await request('GET')).json();assert.equal(rows.find(x=>x.id===d3.id).delivery,1);
 const assigned=await (await request('PATCH','?kind=delivery',{ids:[d.id,d2.id],delivery:2})).json();assert.equal(assigned.length,2);assert.equal(assigned[0].delivery,2);const next=await (await request('PATCH','?kind=finish-delivery&id='+p.id,{delivery:2})).json();assert.equal(next.nextDelivery,3);assert.deepEqual(next.completedDeliveries,[2]);assert.deepEqual(assigned[0].printed,[2]);
 assert.equal((await request('PATCH','?kind=delivery',{ids:[d.id],delivery:100})).status,400);
 assert.equal((await request('DELETE','',{ids:['missing-document']})).status,404);
 const deleted=await (await request('DELETE','',{ids:[d.id]})).json();assert.deepEqual(deleted.deleted,[d.id]);assert.equal((await request('GET','?kind=file&id='+d.id)).status,404);
 rows=await (await request('GET')).json();assert.equal(rows.some(x=>x.id===d.id),false);assert.equal(rows.some(x=>x.id===d2.id),true);
 const removed=await (await request('DELETE','?kind=project&id='+p.id)).json();assert.deepEqual([...removed.deleted].sort(),[d2.id,task.id].sort());assert.equal(removed.project,p.id);
 assert.equal((await request('GET','?kind=file&id='+d2.id)).status,404);rows=await (await request('GET')).json();assert.equal(rows.some(x=>x.id===p.id),false);assert.equal(rows.some(x=>x.id===p2.id),true);assert.equal(rows.some(x=>x.id===d3.id),true);assert.equal(rows.some(x=>x.id===task.id),false);assert.equal(rows.some(x=>x.id===keepTask.id),true);assert.equal(rows.some(x=>x.id===removeTask.id),false);assert.equal(rows.some(x=>x.id===person.id),true);

 }finally{if(processHandle&&processHandle.exitCode===null)await stop();await rm(dir,{recursive:true,force:true});}
});

