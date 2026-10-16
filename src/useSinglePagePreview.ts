import {useEffect,useState} from 'react';

// Native mobile PDF viewers may ignore the #page fragment.
const query='(max-width: 800px), (hover: none) and (pointer: coarse)';
export default function useSinglePagePreview(){
 const [singlePage,setSinglePage]=useState(()=>window.matchMedia(query).matches);
 useEffect(()=>{const media=window.matchMedia(query),update=()=>setSinglePage(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 return singlePage;
}
