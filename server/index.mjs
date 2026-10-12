import http from 'node:http';
import {readFile,writeFile,mkdir,readdir,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
const root=path.resolve(process.env.DATA_DIR||'data'),dist=fileURLToPath(new URL('../dist/',import.meta.url));
const origin=process.env.APP_ORIGIN;
await mkdir(path.join(root,'meta'),{recursive:true});await mkdir(path.join(root,'files'),{recursive:true});
let queue=Promise.resolve();
function locked(action){const result=queue.then(action);queue=result.catch(()=>{});return result;}
const valid=s=>typeof s==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(s);
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
async function readBody(req,limit){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit){const e=Error('Datoteka je prevelika.');e.status=413;throw e;}chunks.push(chunk);}return Buffer.concat(chunks);}
const meta=id=>path.join(root,'meta',id+'.json');
async function get(id){try{return JSON.parse(await readFile(meta(id),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function put(id,value){const file=meta(id),temp=file+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value),{mode:0o600});await rename(temp,file);}
async function handle(req,res){
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/health'){return json(res,200,{status:'ok'});}
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','SAMEORIGIN');
 if(url.pathname==='/api/data'){
  const id=url.searchParams.get('id'),kind=url.searchParams.get('kind');
  if(req.method==='GET'){
   if(kind==='file'){if(!valid(id))return json(res,400,{error:'Napačen dokument.'});try{const bytes=await readFile(path.join(root,'files',id+'.pdf'));res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':'inline','Cache-Control':'no-store'});res.end(bytes);}catch(e){if(e.code==='ENOENT')return json(res,404,{error:'PDF ni najden.'});throw e;}return;}
   const names=(await readdir(path.join(root,'meta'))).filter(n=>n.endsWith('.json'));
   const rows=await Promise.all(names.map(n=>get(n.slice(0,-5))));return json(res,200,rows.filter(Boolean));
  }
  const reqOrigin=req.headers.origin;if(reqOrigin&&(origin?reqOrigin!==origin:new URL(reqOrigin).host!==req.headers.host))return json(res,403,{error:'Nedovoljen izvor.'});
  if(req.method==='POST'&&kind==='upload'){
   const project=url.searchParams.get('project');if(!valid(project)||!await get('p-'+project))return json(res,400,{error:'Projekt ne obstaja.'});
   const bytes=await readBody(req,40*1024*1024);let pdf;try{pdf=await PDFDocument.load(bytes);}catch{return json(res,400,{error:'PDF je poškodovan ali zaklenjen z geslom.'});}
   const doc={type:'document',id:randomUUID(),project,name:(url.searchParams.get('name')||'Dokument.pdf').slice(0,240),pages:pdf.getPageCount(),printed:[],created:new Date().toISOString(),updated:new Date().toISOString()};
   const file=path.join(root,'files',doc.id+'.pdf');await writeFile(file,bytes,{mode:0o600});try{await put('d-'+doc.id,doc);}catch(e){await unlink(file);throw e;}return json(res,200,doc);
  }
  if(req.method==='POST'){
   const body=JSON.parse((await readBody(req,16384)).toString());if(typeof body.name!=='string'||!body.name.trim())return json(res,400,{error:'Vpiši ime projekta.'});
   const p={type:'project',id:randomUUID(),name:body.name.trim().slice(0,160),number:typeof body.number==='string'?body.number.slice(0,80):'',created:new Date().toISOString()};await put('p-'+p.id,p);return json(res,200,p);
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
