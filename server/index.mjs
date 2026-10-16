import http from 'node:http';
import {readFile,writeFile,mkdir,readdir,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
import {createAuth} from './auth.mjs';
import {createPdfSearch} from './pdf-search.mjs';
const root=path.resolve(process.env.DATA_DIR||'data'),dist=path.resolve(process.env.STATIC_DIR||fileURLToPath(new URL('../dist/',import.meta.url)));
const origin=process.env.APP_ORIGIN;
const pdfSearch=createPdfSearch(root);
await mkdir(path.join(root,'meta'),{recursive:true});await mkdir(path.join(root,'files'),{recursive:true});
let queue=Promise.resolve();
function locked(action){const result=queue.then(action);queue=result.catch(()=>{});return result;}
const valid=s=>typeof s==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(s);
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
async function readBody(req,limit){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit){const e=Error('Datoteka je prevelika.');e.status=413;throw e;}chunks.push(chunk);}return Buffer.concat(chunks);}
const meta=id=>path.join(root,'meta',id+'.json');
async function get(id){try{const record=JSON.parse(await readFile(meta(id),'utf8'));if(record.type==='document'){if(!record.delivery)record.delivery=1;if(!Array.isArray(record.workConfirmedPages))record.workConfirmedPages=record.workDone?Array.from({length:record.pages},(_,i)=>i+1):[];record.workDone=record.pages>0&&record.workConfirmedPages.length===record.pages;if(!record.workPageConfirmations)record.workPageConfirmations=Object.fromEntries(record.workConfirmedPages.map(n=>[n,{by:record.workConfirmedBy,at:record.workConfirmedAt}]));}return record;}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function put(id,value){const file=meta(id),temp=file+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value),{mode:0o600});await rename(temp,file);}
function taskProgress(rows){return rows.map(r=>{if(r?.type!=='task')return r;const documents=rows.filter(d=>d?.type==='document'&&d.project===r.project&&d.assigneeId===r.assigneeId);const totalPages=documents.reduce((n,d)=>n+d.pages,0),confirmedPages=documents.reduce((n,d)=>n+d.workConfirmedPages.length,0),progress={totalPages,confirmedPages,totalFiles:documents.length,confirmedFiles:documents.filter(d=>d.workDone).length};return {...r,pdfProgress:progress,done:!!r.done&&confirmedPages===totalPages,confirmedBy:confirmedPages===totalPages?r.confirmedBy:null,confirmedAt:confirmedPages===totalPages?r.confirmedAt:null};});}
async function listPeople(){const names=(await readdir(path.join(root,'meta'))).filter(n=>n.startsWith('u-')&&n.endsWith('.json'));return (await Promise.all(names.map(n=>get(n.slice(0,-5))))).filter(Boolean);}
const auth=createAuth({adminPin:process.env.ADMIN_PIN,origin,getPerson:id=>get('u-'+id),listPeople});
function sameOrigin(req){const value=req.headers.origin;try{return !value||(origin?value===origin:new URL(value).host===req.headers.host);}catch{return false;}}
const projectSummary=p=>({type:'project',id:p.id,name:p.name,number:p.number});
const documentSummary=d=>({type:'document',id:d.id,project:d.project,name:d.name,pages:d.pages,group:d.group||'',delivery:d.delivery||1});
async function canReadDocument(session,document){if(session.role==='admin')return true;if(session.role==='staff')return document.assigneeId===session.personId;const project=await get('p-'+document.project);return !!project?.viewerIds?.includes(session.personId);}
async function handle(req,res){
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/health'){return json(res,200,{status:'ok'});}
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','SAMEORIGIN');
 if(url.pathname==='/api/auth/people'&&req.method==='GET')return json(res,200,await auth.people());
 if(url.pathname==='/api/auth'){
  if(req.method==='GET'){const user=auth.session(req);return user?json(res,200,{role:user.role,name:user.name,personId:user.personId}):json(res,401,{error:'Potrebna je prijava s PIN-om.'});}
  if(!sameOrigin(req))return json(res,403,{error:'Nedovoljen izvor.'});
  if(req.method==='POST'){const body=JSON.parse((await readBody(req,16384)).toString());const result=await auth.login(req,res,body);return json(res,result.status,result.user||{error:result.error});}
  if(req.method==='DELETE'){auth.logout(req,res);return json(res,200,{ok:true});}return json(res,405,{error:'Nedovoljena metoda.'});
 }
 if(url.pathname==='/api/data'){
  const session=auth.session(req);if(!session)return json(res,401,{error:'Potrebna je prijava s PIN-om.'});
  const id=url.searchParams.get('id'),kind=url.searchParams.get('kind');
  if(req.method==='GET'||(req.method==='HEAD'&&kind==='file')){
   if(kind==='file'){if(!valid(id))return json(res,400,{error:'Napačen dokument.'});const document=await get('d-'+id);if(!document)return json(res,404,{error:'PDF ni najden.'});if(!await canReadDocument(session,document))return json(res,403,{error:'Ta PDF ni v tvoji mapi.'});const pageValue=url.searchParams.get('page'),page=pageValue===null?null:Number(pageValue);if(page!==null&&(!/^\d+$/.test(pageValue)||!Number.isInteger(page)||page<1||page>document.pages))return json(res,400,{error:'Napačna številka strani.'});try{let bytes=await readFile(path.join(root,'files',id+'.pdf'));if(page!==null){const source=await PDFDocument.load(bytes),preview=await PDFDocument.create();const [selected]=await preview.copyPages(source,[page-1]);preview.addPage(selected);bytes=Buffer.from(await preview.save());}res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':page===null?'inline':'inline; filename="stran-'+page+'.pdf"','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:bytes);}catch(e){if(e.code==='ENOENT')return json(res,404,{error:'PDF ni najden.'});throw e;}return;}
   if(kind==='search'){
    const projectId=url.searchParams.get('project'),documentId=url.searchParams.get('document'),query=(url.searchParams.get('q')||'').trim();if(!valid(projectId)||(documentId!==null&&!valid(documentId))||query.length<2||query.length>80)return json(res,400,{error:'Izberi projekt in vpiši oznako (2–80 znakov), npr. H22 ali V23.'});
    const project=await get('p-'+projectId);if(!project)return json(res,404,{error:'Projekt ni najden.'});
    const names=(await readdir(path.join(root,'meta'))).filter(n=>n.startsWith('d-')&&n.endsWith('.json'));let documents=(await Promise.all(names.map(n=>get(n.slice(0,-5))))).filter(d=>d&&d.project===projectId);
    if(session.role==='viewer'&&!project.viewerIds?.includes(session.personId))return json(res,403,{error:'Projekt ni dodeljen za pregled.'});
    if(session.role==='staff'){documents=documents.filter(d=>d.assigneeId===session.personId);if(!documents.length)return json(res,403,{error:'V tem projektu nimaš dodeljenih PDF-jev.'});}
    if(documentId!==null){documents=documents.filter(d=>d.id===documentId);if(!documents.length)return json(res,403,{error:'PDF ni dostopen v izbranem projektu.'});}
    return json(res,200,await pdfSearch.search(documents,query));
   }
   const names=(await readdir(path.join(root,'meta'))).filter(n=>n.endsWith('.json'));
   const rows=taskProgress(await Promise.all(names.map(n=>get(n.slice(0,-5)))));if(session.role==='viewer'){const projects=rows.filter(r=>r?.type==='project'&&r.viewerIds?.includes(session.personId));const ids=new Set(projects.map(p=>p.id));return json(res,200,[...projects.map(projectSummary),...rows.filter(r=>r?.type==='document'&&ids.has(r.project)).map(documentSummary)]);}if(session.role==='staff'){const tasks=rows.filter(r=>r?.type==='task'&&r.assigneeId===session.personId);const documents=rows.filter(r=>r?.type==='document'&&r.assigneeId===session.personId);const projectIds=new Set([...tasks,...documents].map(t=>t.project));const projects=rows.filter(r=>r?.type==='project'&&projectIds.has(r.id)).map(p=>({type:'project',id:p.id,name:p.name,number:p.number}));return json(res,200,[...projects,...tasks,...documents]);}return json(res,200,rows.filter(Boolean));
  }
  if(!sameOrigin(req))return json(res,403,{error:'Nedovoljen izvor.'});
  if(session.role!=='admin'&&!(session.role==='staff'&&req.method==='PATCH'&&(kind==='task'||kind==='document-confirmation')))return json(res,403,{error:'Ta možnost je na voljo upravitelju.'});
  if(req.method==='PATCH'&&kind==='viewer-access'){
   const body=JSON.parse((await readBody(req,16384)).toString());if(!valid(id)||!Array.isArray(body.personIds)||body.personIds.length>500||body.personIds.some(x=>!valid(x)))return json(res,400,{error:'Izberi pregledovalce projekta.'});
   return locked(async()=>{const project=await get('p-'+id);if(!project)return json(res,404,{error:'Projekt ni najden.'});const people=await Promise.all([...new Set(body.personIds)].map(id=>get('u-'+id)));if(people.some(p=>!p||p.access!=='viewer'))return json(res,400,{error:'Izberi uporabnika za pregled PDF-jev.'});project.viewerIds=people.map(p=>p.id);await put('p-'+id,project);json(res,200,project);});
  }
  if(req.method==='PATCH'&&kind==='document-confirmation'){
   const body=JSON.parse((await readBody(req,65536)).toString());if(!Array.isArray(body.ids)||!body.ids.length||body.ids.length>500||body.ids.some(x=>!valid(x))||typeof body.done!=='boolean'||(body.pages!==undefined&&(body.ids.length!==1||!Array.isArray(body.pages)||!body.pages.length)))return json(res,400,{error:'Izberi PDF-je ali strani za potrditev.'});
   return locked(async()=>{const documents=await Promise.all([...new Set(body.ids)].map(id=>get('d-'+id)));if(documents.some(d=>!d))return json(res,404,{error:'Dokument ni najden.'});if(session.role!=='admin'&&documents.some(d=>d.assigneeId!==session.personId))return json(res,403,{error:'Potrdiš lahko samo PDF-je iz svoje mape.'});if(body.pages&&body.pages.some(n=>!Number.isInteger(n)||n<1||n>documents[0].pages))return json(res,400,{error:'Napačna številka strani.'});const at=new Date().toISOString(),by=session.role==='admin'?'Upravitelj':session.name;
    for(const d of documents){const pages=body.pages||Array.from({length:d.pages},(_,i)=>i+1),confirmed=new Set(d.workConfirmedPages),changed=[...new Set(pages)].filter(n=>confirmed.has(n)!==body.done);if(!changed.length)continue;for(const n of changed){if(body.done){confirmed.add(n);d.workPageConfirmations[n]={by,at};}else{confirmed.delete(n);delete d.workPageConfirmations[n];}}d.workConfirmedPages=[...confirmed].sort((a,b)=>a-b);d.workDone=d.pages>0&&d.workConfirmedPages.length===d.pages;d.workConfirmedBy=d.workDone?by:null;d.workConfirmedAt=d.workDone?at:null;d.workHistory=[...(d.workHistory||[]),{event:'confirmed',done:body.done,pages:changed,by,at}];d.updated=at;await put('d-'+d.id,d);}json(res,200,documents);
   });
  }
  if(req.method==='PATCH'&&kind==='document-owner'){
   const body=JSON.parse((await readBody(req,16384)).toString());if(!Array.isArray(body.ids)||!body.ids.length||body.ids.length>500||body.ids.some(x=>!valid(x))||(body.assigneeId!==null&&!valid(body.assigneeId)))return json(res,400,{error:'Izberi PDF-je in mapo sodelavca.'});
   return locked(async()=>{const person=body.assigneeId?await get('u-'+body.assigneeId):null;if(person?.access==='viewer')return json(res,400,{error:'Pregledovalcu dodeli projekt v razdelku Dostop za pregled.'});if(body.assigneeId&&!person)return json(res,404,{error:'Sodelavec ni najden.'});const documents=await Promise.all([...new Set(body.ids)].map(id=>get('d-'+id)));if(documents.some(d=>!d))return json(res,404,{error:'Dokument ni najden.'});for(const d of documents){if((d.assigneeId||null)!==(person?.id||null)){d.workDone=false;d.workConfirmedPages=[];d.workPageConfirmations={};d.workConfirmedBy=null;d.workConfirmedAt=null;d.workHistory=[...(d.workHistory||[]),{event:'moved',to:person?.name||null,at:new Date().toISOString()}];}d.assigneeId=person?.id||null;d.assigneeName=person?.name||null;d.updated=new Date().toISOString();await put('d-'+d.id,d);}json(res,200,documents);});
  }
  if(req.method==='POST'&&kind==='person'){
   const body=JSON.parse((await readBody(req,16384)).toString());if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>80||(body.access!==undefined&&!['staff','viewer'].includes(body.access)))return json(res,400,{error:'Vpiši ime sodelavca (največ 80 znakov).'});
   return locked(async()=>{const name=body.name.trim();const names=(await readdir(path.join(root,'meta'))).filter(n=>n.startsWith('u-')&&n.endsWith('.json'));const people=await Promise.all(names.map(n=>get(n.slice(0,-5))));const existing=people.find(p=>p&&p.name.toLocaleLowerCase()===name.toLocaleLowerCase());if(existing){if((existing.access||'staff')!==(body.access||'staff'))return json(res,409,{error:'To ime že obstaja z drugo vrsto dostopa. Uporabi drugo ime.'});return json(res,200,existing);}const person={type:'person',id:randomUUID(),name,access:body.access||'staff',created:new Date().toISOString()};await put('u-'+person.id,person);json(res,200,person);});
  }
  if(req.method==='POST'&&kind==='task'){
   const body=JSON.parse((await readBody(req,16384)).toString());if(!valid(body.project)||!valid(body.assigneeId)||typeof body.title!=='string'||!body.title.trim()||body.title.trim().length>160)return json(res,400,{error:'Vpiši nalogo in izberi zadolženega sodelavca.'});
   return locked(async()=>{const p=await get('p-'+body.project),person=await get('u-'+body.assigneeId);if(!p||!person)return json(res,404,{error:'Projekt ali sodelavec ni najden.'});if(person.access==='viewer')return json(res,400,{error:'Pregledovalec nima nalog za potrjevanje.'});const task={type:'task',id:randomUUID(),project:body.project,title:body.title.trim(),assigneeId:person.id,assigneeName:person.name,done:false,confirmedBy:null,confirmedAt:null,history:[],created:new Date().toISOString()};await put('t-'+task.id,task);json(res,200,task);});
  }
  if(req.method==='PATCH'&&kind==='task'){
   if(!valid(id))return json(res,400,{error:'Napačna naloga.'});const body=JSON.parse((await readBody(req,16384)).toString());if(typeof body.done!=='boolean')return json(res,400,{error:'Napačna potrditev.'});
   return locked(async()=>{const task=await get('t-'+id),actor=session.role==='admin'?{id:'admin',name:'Upravitelj'}:await get('u-'+session.personId);if(!task||!actor)return json(res,404,{error:'Naloga ali sodelavec ni najden.'});if(session.role!=='admin'&&task.assigneeId!==actor.id)return json(res,403,{error:'Ta naloga ni dodeljena tebi.'});if(body.done){const names=(await readdir(path.join(root,'meta'))).filter(n=>n.startsWith('d-')&&n.endsWith('.json'));const documents=(await Promise.all(names.map(n=>get(n.slice(0,-5))))).filter(d=>d&&d.project===task.project&&d.assigneeId===task.assigneeId);if(documents.some(d=>!d.workDone))return json(res,409,{error:'Naloga še ni v celoti narejena. Najprej potrdi vse dodeljene PDF-je oziroma njihove strani.'});}if(task.done===body.done)return json(res,200,task);const at=new Date().toISOString();task.done=body.done;task.confirmedBy=body.done?actor.name:null;task.confirmedAt=body.done?at:null;task.history=[...(task.history||[]),{done:body.done,by:actor.name,at}];await put('t-'+id,task);json(res,200,task);});
  }
  if(req.method==='DELETE'&&kind==='task'){
   if(!valid(id))return json(res,400,{error:'Napačna naloga.'});return locked(async()=>{if(!await get('t-'+id))return json(res,404,{error:'Naloga ni najdena.'});await unlink(meta('t-'+id));json(res,200,{deleted:[id]});});
  }
  if(req.method==='POST'&&kind==='upload'){
   const project=url.searchParams.get('project');if(!valid(project)||!await get('p-'+project))return json(res,400,{error:'Projekt ne obstaja.'});
   const delivery=Number(url.searchParams.get('delivery')||1);if(!Number.isInteger(delivery)||delivery<1||delivery>99)return json(res,400,{error:'Napačna številka pošiljke.'});
   const bytes=await readBody(req,40*1024*1024);let pdf;try{pdf=await PDFDocument.load(bytes);}catch{return json(res,400,{error:'PDF je poškodovan ali zaklenjen z geslom.'});}
   const doc={type:'document',id:randomUUID(),project,delivery,group:(url.searchParams.get('group')||'').trim().slice(0,160),name:(url.searchParams.get('name')||'Dokument.pdf').slice(0,240),pages:pdf.getPageCount(),printed:[],created:new Date().toISOString(),updated:new Date().toISOString()};
   const file=path.join(root,'files',doc.id+'.pdf');await writeFile(file,bytes,{mode:0o600});try{await put('d-'+doc.id,doc);}catch(e){await unlink(file);throw e;}await locked(async()=>{const p=await get('p-'+project);if(p?.completedDeliveries?.includes(delivery)){p.completedDeliveries=p.completedDeliveries.filter(n=>n!==delivery);await put('p-'+project,p);}});return json(res,200,doc);
  }
  if(req.method==='POST'){
   const body=JSON.parse((await readBody(req,16384)).toString());if(typeof body.name!=='string'||!body.name.trim())return json(res,400,{error:'Vpiši ime projekta.'});
   const p={type:'project',id:randomUUID(),name:body.name.trim().slice(0,160),number:typeof body.number==='string'?body.number.slice(0,80):'',printStamp:'5',completedDeliveries:[],nextDelivery:1,created:new Date().toISOString()};await put('p-'+p.id,p);return json(res,200,p);
  }
  if(req.method==='PATCH'&&kind==='finish-delivery'){
   if(!valid(id))return json(res,400,{error:'Napačen projekt.'});const body=JSON.parse((await readBody(req,16384)).toString());
   if(!Number.isInteger(body.delivery)||body.delivery<1||body.delivery>=99)return json(res,400,{error:'Pošiljka mora biti med 1 in 98.'});
   return locked(async()=>{const p=await get('p-'+id);if(!p)return json(res,404,{error:'Projekt ni najden.'});const names=(await readdir(path.join(root,'meta'))).filter(n=>n.startsWith('d-')&&n.endsWith('.json'));const documents=await Promise.all(names.map(n=>get(n.slice(0,-5))));
    if(!documents.some(d=>d&&d.project===id&&d.delivery===body.delivery))return json(res,400,{error:'Najprej dodaj vsaj en PDF v to pošiljko.'});
    p.completedDeliveries=[...new Set([...(p.completedDeliveries||[]),body.delivery])].sort((a,b)=>a-b);p.nextDelivery=Math.max(p.nextDelivery||1,body.delivery+1);await put('p-'+id,p);json(res,200,p);
   });
  }
  if(req.method==='PATCH'&&kind==='delivery'){
   const body=JSON.parse((await readBody(req,16384)).toString());
   if(!Array.isArray(body.ids)||!body.ids.length||body.ids.length>500||body.ids.some(x=>!valid(x))||!Number.isInteger(body.delivery)||body.delivery<1||body.delivery>99)return json(res,400,{error:'Napačen izbor dokumentov ali pošiljke.'});
   return locked(async()=>{const documents=await Promise.all([...new Set(body.ids)].map(id=>get('d-'+id)));if(documents.some(d=>!d))return json(res,404,{error:'Dokument ni najden.'});for(const d of documents){d.delivery=body.delivery;d.updated=new Date().toISOString();await put('d-'+d.id,d);}json(res,200,documents);});
  }
  if(req.method==='DELETE'){
   return locked(async()=>{
    let documents;
    if(kind==='project'){
     if(!valid(id)||!await get('p-'+id))return json(res,404,{error:'Projekt ni najden.'});
     const names=(await readdir(path.join(root,'meta'))).filter(n=>n.startsWith('d-')&&n.endsWith('.json'));
     documents=(await Promise.all(names.map(n=>get(n.slice(0,-5))))).filter(d=>d&&d.project===id);
    }else{
     const body=JSON.parse((await readBody(req,16384)).toString());if(!Array.isArray(body.ids)||!body.ids.length||body.ids.length>500||body.ids.some(x=>!valid(x)))return json(res,400,{error:'Izberi dokumente za brisanje.'});
     documents=await Promise.all([...new Set(body.ids)].map(id=>get('d-'+id)));if(documents.some(d=>!d))return json(res,404,{error:'Dokument ni najden.'});
    }
    for(const d of documents){try{await unlink(path.join(root,'files',d.id+'.pdf'));}catch(e){if(e.code!=='ENOENT')throw e;}await unlink(meta('d-'+d.id));await pdfSearch.remove(d.id);}
    let tasks=[];if(kind==='project'){const names=(await readdir(path.join(root,'meta'))).filter(n=>n.startsWith('t-')&&n.endsWith('.json'));tasks=(await Promise.all(names.map(n=>get(n.slice(0,-5))))).filter(t=>t&&t.project===id);for(const t of tasks)await unlink(meta('t-'+t.id));await unlink(meta('p-'+id));}
    json(res,200,{deleted:[...documents.map(d=>d.id),...tasks.map(t=>t.id)],project:kind==='project'?id:null});
   });
  }
  if(req.method==='PATCH'&&kind==='project'){
   if(!valid(id))return json(res,400,{error:'Napačen projekt.'});const body=JSON.parse((await readBody(req,16384)).toString());
   if(typeof body.printStamp!=='string'||!/^\d{1,6}$/.test(body.printStamp))return json(res,400,{error:'Vpiši številko za tisk (1–6 mest).'});
   return locked(async()=>{const p=await get('p-'+id);if(!p)return json(res,404,{error:'Projekt ni najden.'});p.printStamp=body.printStamp;await put('p-'+id,p);json(res,200,p);});
  }
  if(req.method==='PATCH'&&kind==='group'){
   if(!valid(id))return json(res,400,{error:'Napačen dokument.'});const body=JSON.parse((await readBody(req,16384)).toString());
   if(typeof body.group!=='string'||body.group.length>160)return json(res,400,{error:'Ime skupine je predolgo.'});
   return locked(async()=>{const d=await get('d-'+id);if(!d)return json(res,404,{error:'Dokument ni najden.'});d.group=body.group.trim();d.updated=new Date().toISOString();await put('d-'+id,d);json(res,200,d);});
  }
  if(req.method==='PATCH'){
   if(!valid(id))return json(res,400,{error:'Napačen dokument.'});const body=JSON.parse((await readBody(req,1024*1024)).toString());
   return locked(async()=>{const d=await get('d-'+id);if(!d)return json(res,404,{error:'Dokument ni najden.'});if(!Array.isArray(body.pages)||body.pages.length>d.pages||body.pages.some(n=>!Number.isInteger(n)||n<1||n>d.pages)||typeof body.printed!=='boolean')return json(res,400,{error:'Napačen izbor strani.'});const set=new Set(d.printed);for(const p of body.pages){if(body.printed)set.add(p);else set.delete(p);}d.printed=[...set].sort((a,b)=>a-b);d.updated=new Date().toISOString();await put('d-'+id,d);json(res,200,d);});
  }
  return json(res,405,{error:'Nedovoljena metoda.'});
 }
 if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Nedovoljena metoda.'});
 const pathname=decodeURIComponent(url.pathname);const file=path.resolve(dist,'.'+pathname);if(file!==dist&&!file.startsWith(dist+path.sep))return json(res,403,{error:'Nedovoljena pot.'});
 const contentType={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.ico':'image/x-icon'};
 let bytes;let ext=path.extname(file);try{bytes=await readFile(file);}catch(e){if(e.code!=='ENOENT'&&e.code!=='EISDIR')throw e;if(ext)return json(res,404,{error:'Datoteka ni najdena.'});bytes=await readFile(path.join(dist,'index.html'));ext='.html';}
 res.writeHead(200,{'Content-Type':contentType[ext]||'application/octet-stream','Cache-Control':ext==='.html'?'no-store':'private, max-age=3600'});res.end(req.method==='HEAD'?undefined:bytes);
}
const server=http.createServer((req,res)=>{handle(req,res).catch(e=>{console.error('Request failed:',e.code||e.name);if(!res.headersSent)json(res,e.status||500,{error:e.status===413?'PDF je prevelik (največ 40 MB).':'Operacija ni uspela.'});else res.destroy();});});
server.listen(Number(process.env.PORT||3100),process.env.HOST||'0.0.0.0',()=>console.log('Projekti in tisk: pripravljen.'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>process.exit(0)));

