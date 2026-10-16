import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import PageImage from './PageImage';
import PageNumberInput from './PageNumberInput';

export default function DocumentReader({id,name,pages,page,onPageChange,navigationKey=0}:{id:string,name:string,pages:number,page:number,onPageChange:(page:number)=>void,navigationKey?:number}){
 const viewport=useRef<HTMLDivElement>(null),reported=useRef(0),previousLayout=useRef('');
 const [height,setHeight]=useState(520),[zoom,setZoom]=useState(1),[near,setNear]=useState(new Set<number>());
 const slotHeight=Math.round(height*zoom),layout=slotHeight+':'+navigationKey;
 useEffect(()=>{const element=viewport.current;if(!element)return;const observer=new ResizeObserver(()=>setHeight(element.clientHeight||520));observer.observe(element);setHeight(element.clientHeight||520);return()=>observer.disconnect();},[]);
 useEffect(()=>{const element=viewport.current;if(!element)return;if(reported.current!==page||previousLayout.current!==layout){element.scrollTop=(page-1)*slotHeight;reported.current=page;previousLayout.current=layout;}},[page,slotHeight,layout]);
 useEffect(()=>{
  const element=viewport.current;if(!element)return;
  const observer=new IntersectionObserver(entries=>setNear(previous=>{const next=new Set(previous);for(const entry of entries){const n=Number((entry.target as HTMLElement).dataset.readerPage);if(entry.isIntersecting)next.add(n);else next.delete(n);}return next;}),{root:element,rootMargin:'100% 0px'});
  element.querySelectorAll('[data-reader-page]').forEach(sheet=>observer.observe(sheet));return()=>observer.disconnect();
 },[id,pages,slotHeight]);
 function scroll(){const element=viewport.current;if(!element)return;const next=Math.min(pages,Math.max(1,Math.floor((element.scrollTop+height*0.4)/slotHeight)+1));if(next!==reported.current){reported.current=next;onPageChange(next);}}
 return <div className="document-reader">
  <div className="document-reader-toolbar"><div className="reader-navigation"><button aria-label="Prejšnja stran" disabled={page<=1} onClick={()=>onPageChange(page-1)}><ChevronLeft size={20}/></button><label>Stran <PageNumberInput max={pages} value={page} onChange={onPageChange}/><span>/ {pages}</span></label><button aria-label="Naslednja stran" disabled={page>=pages} onClick={()=>onPageChange(page+1)}><ChevronRight size={20}/></button></div><label className="reader-zoom">Povečava<select aria-label="Povečava načrta" value={zoom} onChange={e=>setZoom(Number(e.target.value))}><option value={1}>Prilagodi</option><option value={1.5}>150 %</option><option value={2}>200 %</option></select></label></div>
  <div className="document-reader-hint">Vseh {pages} strani · po dokumentu listaj z drsenjem ali s puščicama.</div>
  <div ref={viewport} className="document-scroll" role="region" aria-label={'Vse strani PDF-ja: '+name} tabIndex={0} onScroll={scroll}>
   {Array.from({length:pages},(_,i)=>i+1).map(n=><section key={n} data-reader-page={n} className="document-sheet" aria-label={'Izvorna stran '+n} style={{height:slotHeight,width:(zoom*100)+'%'}}><div className="document-sheet-label">Stran {n} / {pages}</div><div className="document-sheet-image">{near.has(n)||n===page?<PageImage id={id} page={n} name={name}/>:<div className="document-sheet-placeholder">Stran {n}</div>}</div></section>)}
  </div>
 </div>;
}
