'use client';
import { useEffect, useRef, useState } from 'react';
import { initialLive, INGRESS_URL, librarySync, TOKEN_KEY } from './live-library';

export function useLiveLibrary(enabled:boolean){
  const [snapshot,setSnapshot]=useState(initialLive);
  const sync=useRef<ReturnType<typeof librarySync>>(null);
  useEffect(()=>{
    if(!enabled)return;
    const client=librarySync({readToken:()=>localStorage.getItem(TOKEN_KEY),publish:setSnapshot});sync.current=client;
    const refresh=()=>{if(document.visibilityState!=='hidden')void client.refresh();};
    const storage=(event:StorageEvent)=>{if(event.key===TOKEN_KEY||event.key===null)void client.refresh();};
    refresh();const interval=setInterval(refresh,3000);
    window.addEventListener('storage',storage);window.addEventListener('focus',refresh);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{clearInterval(interval);client.dispose();sync.current=null;window.removeEventListener('storage',storage);window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[enabled]);
  async function saveLink(content:string){
    const token=localStorage.getItem(TOKEN_KEY);if(!token)throw new Error('로그인이 필요해요.');
    const response=await fetch(`${INGRESS_URL}/captures/shortcut`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({url:content}),signal:AbortSignal.timeout(15000)});
    if(localStorage.getItem(TOKEN_KEY)!==token)throw new Error('계정이 변경됐어요. 현재 계정의 보관함을 확인해주세요.');
    const data=await response.json() as {message?:string};
    if(localStorage.getItem(TOKEN_KEY)!==token)throw new Error('계정이 변경됐어요. 현재 보관함을 확인해주세요.');
    if(!response.ok){void sync.current?.refresh();throw new Error(data.message||'저장하지 못했어요. 입력한 내용은 그대로 남겨뒀어요.');}
    await sync.current?.refresh();
    if(localStorage.getItem(TOKEN_KEY)!==token)throw new Error('계정이 변경됐어요. 현재 보관함을 확인해주세요.');
    return data.message||'링크를 저장했어요.';
  }
  return {...snapshot,refresh:()=>sync.current?.refresh(),saveLink};
}
