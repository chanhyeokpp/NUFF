'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { Message, koreaDay, readableDay, resolveReply } from './message-model';
import { MessageBubble, MessageHandlers } from './message-bubble';
import s from './preview.module.css';

export type ScrollRequest = { serial:number; kind:'top'|'bottom'|'message'; id?:string };
export function MessageList({ messages,allMessages,handlers,grouped,heading,emptyTitle,emptyText,onRecent,scrollRequest,selectDay,liveUpdates=false }: {
  messages:Message[];allMessages:Message[];handlers:MessageHandlers;grouped:boolean;heading:string;emptyTitle:string;emptyText:string;onRecent:()=>void;scrollRequest:ScrollRequest;selectDay:(day:string)=>void;
  liveUpdates?:boolean;
}) {
  const feed=useRef<HTMLDivElement>(null);
  const targets=useRef(new Map<string,HTMLDivElement>());
  const nearBottom=useRef(true);
  const previousIds=useRef(new Set<string>());
  const [newCount,setNewCount]=useState(0);
  useLayoutEffect(()=>{
    const container=feed.current;if(!container)return;
    const added=messages.filter(message=>!previousIds.current.has(message.id)).length;
    previousIds.current=new Set(messages.map(message=>message.id));
    if(!liveUpdates)return;
    if(nearBottom.current)container.scrollTo({top:container.scrollHeight});
    else if(added){const frame=requestAnimationFrame(()=>setNewCount(count=>count+added));return()=>cancelAnimationFrame(frame);}
  },[messages,liveUpdates]);
  useEffect(()=>{
    const container=feed.current;if(!container)return;
    if(scrollRequest.kind==='message'&&scrollRequest.id){const target=targets.current.get(scrollRequest.id);target?.scrollIntoView({block:'center'});target?.focus({preventScroll:true});}
    else container.scrollTo({top:scrollRequest.kind==='bottom'?container.scrollHeight:0});
    nearBottom.current=container.scrollHeight-container.scrollTop-container.clientHeight<80;
  },[scrollRequest]);
  return <div className={s.feed} ref={feed} aria-label="기록 목록" onScroll={()=>{const container=feed.current;if(!container)return;nearBottom.current=container.scrollHeight-container.scrollTop-container.clientHeight<80;if(nearBottom.current)setNewCount(0);}}><div className={s.feedInner}>
    {messages.length?<>{heading&&<div className={s.dayDivider}><span>{heading}</span></div>}{messages.map((message,index)=>{
      const day=koreaDay(message.createdAt),newDay=index===0||koreaDay(messages[index-1].createdAt)!==day;
      return <div key={message.id} ref={node=>{if(node)targets.current.set(message.id,node);else targets.current.delete(message.id)}} tabIndex={-1} data-message-id={message.id} className={scrollRequest.kind==='message'&&scrollRequest.id===message.id?s.highlightedMessage:undefined}>
        {grouped&&newDay&&<button className={s.searchDay} onClick={()=>selectDay(day)}>{readableDay(day)}<ArrowUpRight size={12}/></button>}
        <MessageBubble message={message} parent={resolveReply(allMessages,message)} handlers={handlers}/>
      </div>;
    })}</>:<div className={s.empty}><h2>{emptyTitle}</h2><p>{emptyText}</p><button onClick={onRecent}>전체 기록으로 가기<ArrowRight size={14}/></button></div>}
  </div>{liveUpdates&&newCount>0&&<button className={s.newMessages} onClick={()=>{const container=feed.current;container?.scrollTo({top:container.scrollHeight});nearBottom.current=true;setNewCount(0);}}>새 기록 {newCount}개 ↓</button>}</div>;
}
