import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,mkdtemp,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const execute=promisify(execFile);
export function createPageImages(root){
 const directory=path.join(root,'previews'),pending=new Map();let queue=Promise.resolve();
 async function render(id,page){
  const folder=path.join(directory,id),cached=path.join(folder,page+'-v1.png');
  try{return await readFile(cached);}catch(e){if(e.code!=='ENOENT')throw e;}
  const temporary=await mkdtemp(path.join(tmpdir(),'tisk-page-'));
  try{
   const output=path.join(temporary,'page');
   await execute('pdftoppm',['-f',String(page),'-l',String(page),'-singlefile','-cropbox','-scale-to','2400','-png',path.join(root,'files',id+'.pdf'),output],{timeout:25000,maxBuffer:1024*1024});
   const bytes=await readFile(output+'.png');await mkdir(folder,{recursive:true});
   const tempCache=cached+'.'+randomUUID()+'.tmp';await writeFile(tempCache,bytes,{mode:0o600});await rename(tempCache,cached);return bytes;
  }finally{await rm(temporary,{recursive:true,force:true});}
 }
 function get(id,page){const key=id+':'+page;if(pending.has(key))return pending.get(key);const task=queue.then(()=>render(id,page));queue=task.catch(()=>{});pending.set(key,task);task.finally(()=>pending.delete(key)).catch(()=>{});return task;}
 async function remove(id){await rm(path.join(directory,id),{recursive:true,force:true});}
 return {get,remove};
}
