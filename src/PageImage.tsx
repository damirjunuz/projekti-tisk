import {useState} from 'react';
import {Loader2} from 'lucide-react';
export default function PageImage({id,page,name}:{id:string,page:number,name:string}){
 const [loaded,setLoaded]=useState(false),[failed,setFailed]=useState(false);
 const source='/api/data?kind=page-image&id='+encodeURIComponent(id)+'&page='+page;
 return <div className={'page-image'+(loaded?' is-loaded':'')}>
  {!loaded&&!failed&&<div className="page-image-status" role="status"><Loader2 size={22} className="spin"/><span>Nalagam izvorno stran {page} …</span></div>}
  {failed?<div className="page-image-status" role="alert"><p>Izvorne strani {page} ni bilo mogoče prikazati.</p><button onClick={()=>{setFailed(false);setLoaded(false);}}>Poskusi znova</button><a href={'/api/data?kind=file&id='+encodeURIComponent(id)+'&page='+page} target="_blank" rel="noreferrer">Odpri PDF te strani</a></div>:<img src={source} alt={name+' – izvorna stran '+page} onLoad={()=>setLoaded(true)} onError={()=>setFailed(true)}/>}
 </div>;
}
