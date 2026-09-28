'use client';
import { useEffect, useState } from 'react';
import { FileText, Play } from 'lucide-react';
import { previewVideoId, type VideoPreview } from '@/lib/link-preview';
import type { MessageLink } from './message-model';
import s from './preview.module.css';

const previews=new Map<string,Promise<VideoPreview|null>>();
function loadPreview(id:string){
  let request=previews.get(id);
  if(!request){
    if(previews.size>=300)previews.delete(previews.keys().next().value!);
    request=fetch(`/api/link-preview?video=${id}`,{signal:AbortSignal.timeout(7000)}).then(async response=>response.ok?(await response.json() as {preview:VideoPreview|null}).preview:null).catch(()=>null);
    previews.set(id,request);
    void request.then(result=>{if(!result)previews.delete(id);});
  }
  return request;
}
function useLinkMetadata(link:MessageLink){
  const [metadata,setMetadata]=useState<{id:string;value:VideoPreview}|null>(null);
  const videoId=!link.example?previewVideoId(link.url):null;
  useEffect(()=>{let active=true;if(videoId)void loadPreview(videoId).then(value=>{if(active&&value)setMetadata({id:videoId,value});});return()=>{active=false;};},[videoId]);
  const preview=metadata?.id===videoId?metadata?.value:null;
  return {preview,videoId};
}
export function LinkTitle({link}:{link:MessageLink}){
  const {preview}=useLinkMetadata(link);
  return <>{preview?.title||link.title}</>;
}
export function LinkPreview({link}:{link:MessageLink}) {
  const {preview,videoId}=useLinkMetadata(link);
  const [failedImage,setFailedImage]=useState<string>();
  const thumbnail=preview?.thumbnail||link.thumbnail;
  return <a className={s.linkCard} href={link.url} target="_blank" rel="noopener noreferrer">
    <div className={`${s.thumbnail} ${link.kind==='video'?s.video:''}`} aria-hidden="true">{thumbnail&&failedImage!==thumbnail&&/^https?:\/\//i.test(thumbnail)?
      // Third-party preview URLs are displayed directly without an image proxy.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailedImage(thumbnail)}/>:link.kind==='video'?<Play size={24}/>:<FileText size={24}/>}</div>
    <div className={s.linkCopy}><h3>{preview?.title||link.title}</h3>{preview?.author&&<p>{preview.author}</p>}<small>{videoId?'YouTube':new URL(link.url).hostname}{link.example?' · 예시':''} ↗</small></div>
  </a>;
}
