import {useEffect,useState} from 'react';

export default function PageNumberInput({value,max,onChange,disabled=false}:{value:number,max:number,onChange:(value:number)=>void,disabled?:boolean}){
 const [draft,setDraft]=useState(String(value));
 useEffect(()=>{setDraft(String(value));},[value,max]);
 function commit(){
  const number=draft.trim()?Number(draft):value;
  const next=Number.isFinite(number)?Math.min(Math.max(1,max),Math.max(1,Math.trunc(number))):value;
  setDraft(String(next));onChange(next);
 }
 return <input type="number" inputMode="numeric" min={1} max={max} step={1} disabled={disabled} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}/>;
}
