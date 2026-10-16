import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const execute=promisify(execFile);
export function searchPattern(query){
 const label=query.trim().match(/^([hv])\s*(\d+)$/i);
 const text=label?label[1]+'\\s*'+label[2]:query.trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');
 return new RegExp('(?<![\\p{L}\\p{N}_])'+text+'(?![\\p{L}\\p{N}_])','iu');
}
export function createPdfSearch(root){
 const directory=path.join(root,'search'),pending=new Map();let queue=Promise.resolve();
 async function extract(document){
  await mkdir(directory,{recursive:true});
  const cache=path.join(directory,document.id+'.json');
  try{const data=JSON.parse(await readFile(cache,'utf8'));if(data.version===1&&data.pages.length===document.pages)return data.pages;}catch{}
  const {stdout}=await execute('pdftotext',['-layout','-enc','UTF-8',path.join(root,'files',document.id+'.pdf'),'-'],{timeout:15000,maxBuffer:16*1024*1024});
  const sections=stdout.split('\f'),pages=Array.from({length:document.pages},(_,i)=>(sections[i]||'').replace(/\s+/g,' ').trim());
  const temporary=cache+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify({version:1,pages}),{mode:0o600});await rename(temporary,cache);return pages;
 }
 function pageText(document){
  if(pending.has(document.id))return pending.get(document.id);
  const task=queue.then(()=>extract(document));queue=task.catch(()=>{});pending.set(document.id,task);task.finally(()=>pending.delete(document.id)).catch(()=>{});return task;
 }
 async function search(documents,query){
  const pattern=searchPattern(query),hits=[],unreadable=[];let emptyPages=0,truncated=false;
  for(const document of documents){
   let pages;try{pages=await pageText(document);}catch{unreadable.push({id:document.id,name:document.name});continue;}
   for(let i=0;i<pages.length;i++){
    const text=pages[i];if(!text){emptyPages++;continue;}
    const match=pattern.exec(text);if(!match)continue;
    if(hits.length>=300){truncated=true;continue;}
    const start=Math.max(0,match.index-65),end=Math.min(text.length,match.index+match[0].length+100);
    hits.push({id:document.id,name:document.name,project:document.project,group:document.group||'',delivery:document.delivery||1,page:i+1,snippet:(start?'…':'')+text.slice(start,end)+(end<text.length?'…':'')});
   }
  }
  return {hits,documents:documents.length,emptyPages,unreadable,truncated};
 }
 async function remove(id){try{await unlink(path.join(directory,id+'.json'));}catch(e){if(e.code!=='ENOENT')throw e;}}
 return {search,remove};
}
