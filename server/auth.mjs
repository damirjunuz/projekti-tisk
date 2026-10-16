import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
export const validPin=pin=>typeof pin==='string'&&/^\d{6,12}$/.test(pin);
export function createAuth({adminPin,origin,getPerson,listPeople}){
 if(!validPin(adminPin))throw Error('Nastavi ADMIN_PIN: od 6 do 12 številk.');
 const adminSalt=randomBytes(16).toString('hex'),adminHash=scryptSync(adminPin,adminSalt,32);
 const sessions=new Map(),attempts=new Map();const ttl=12*60*60*1000;
 const cookieOptions='; Path=/; HttpOnly; SameSite=Strict'+(origin?.startsWith('https://')?'; Secure':'');
 function session(req){
  const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('tisk_session='))?.slice(13);
  const value=token&&sessions.get(token);if(!value)return null;if(value.expires<Date.now()){sessions.delete(token);return null;}return value;
 }
 function invalidate(personId){for(const [key,s] of sessions)if(s.personId===personId)sessions.delete(key);}
 function same(pin,salt,hash){try{return validPin(pin)&&timingSafeEqual(scryptSync(pin,salt,32),Buffer.isBuffer(hash)?hash:Buffer.from(hash,'hex'));}catch{return false;}}
 async function people(){return (await listPeople()).filter(Boolean).map(p=>({id:p.id,name:p.name}));}
 async function login(req,res,body){
  const role=body.role,key=(role==='admin'?'admin':'staff:'+String(body.personId||''))+'|'+req.socket.remoteAddress;
  const prior=attempts.get(key);if(prior&&prior.until>Date.now()&&prior.count>=8)return {status:429,error:'Preveč napačnih PIN-ov. Poskusi čez 15 minut.'};
  let user=null;
  if(role==='admin'&&same(body.pin,adminSalt,adminHash))user={role:'admin',name:'Upravitelj'};
  if(role==='staff'&&typeof body.personId==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(body.personId)){
   const p=await getPerson(body.personId);if(p)user={role:p.access==='viewer'?'viewer':'staff',personId:p.id,name:p.name};
  }
  if(!user){const previous=prior&&prior.until>Date.now()?prior.count:0;attempts.set(key,{count:previous+1,until:Date.now()+15*60*1000});if(attempts.size>5000){for(const [k,v] of attempts)if(v.until<Date.now())attempts.delete(k);}return {status:401,error:'Napačen PIN ali neveljaven sodelavec.'};}
  attempts.delete(key);for(const [k,v] of sessions)if(v.expires<Date.now())sessions.delete(k);
  const token=randomBytes(32).toString('hex');sessions.set(token,{...user,expires:Date.now()+ttl});
  res.setHeader('Set-Cookie','tisk_session='+token+cookieOptions+'; Max-Age='+Math.floor(ttl/1000));return {status:200,user};
 }
 function logout(req,res){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('tisk_session='))?.slice(13);if(token)sessions.delete(token);res.setHeader('Set-Cookie','tisk_session='+cookieOptions+'; Max-Age=0');}
 return {session,invalidate,login,logout,people};
}
