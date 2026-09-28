'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Message, matchesSearch, koreaDay, readableDay } from './message-model';
import s from './preview.module.css';

export function MessageSearch({open,onOpenChange,messages,onSelect}:{open:boolean;onOpenChange:(open:boolean)=>void;messages:Message[];onSelect:(id:string)=>void}) {
  const [query,setQuery]=useState('');
  const results=messages.filter(m=>matchesSearch(m,query)).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
  const [active,setActive]=useState(0);
  const shown=results.slice(0,30);
  const selected=Math.min(active,Math.max(0,shown.length-1));
  const selectedId=shown[selected]?.id;
  useEffect(()=>{if(open&&selectedId)document.getElementById(`result-${selectedId}`)?.scrollIntoView({block:'nearest'});},[open,selectedId]);
  function choose(id:string){onOpenChange(false);setQuery('');setActive(0);onSelect(id)}
  return <Dialog open={open} onOpenChange={value=>{onOpenChange(value);if(!value){setQuery('');setActive(0)}}}><DialogContent className={s.searchDialog} onCloseAutoFocus={e=>e.preventDefault()}>
    <DialogTitle>내 기록 빠르게 찾기</DialogTitle><DialogDescription>모든 날짜에서 검색해요. 삭제된 기록은 휴지통에 있어요.</DialogDescription>
    <label className={s.paletteInput}><Search size={17}/><input autoFocus aria-label="빠른 검색" role="combobox" aria-expanded="true" aria-controls="message-search-results" aria-autocomplete="list" aria-activedescendant={shown[selected]?`result-${shown[selected].id}`:undefined} value={query} placeholder="기억나는 단어나 링크를 입력하세요" onChange={e=>{setQuery(e.target.value);setActive(0)}} onKeyDown={e=>{if(e.nativeEvent.isComposing||e.nativeEvent.keyCode===229)return;if(e.key==='ArrowDown'){e.preventDefault();setActive(Math.min(selected+1,shown.length-1));}if(e.key==='ArrowUp'){e.preventDefault();setActive(Math.max(0,selected-1));}if(e.key==='Enter'&&shown[selected]){e.preventDefault();choose(shown[selected].id)}}}/></label>
    <div id="message-search-results" role="listbox" aria-label="기록 검색 결과" className={s.searchResults}>{shown.map((m,index)=><button key={m.id} id={`result-${m.id}`} role="option" aria-selected={selected===index} onMouseEnter={()=>setActive(index)} onClick={()=>choose(m.id)}><span><small>{readableDay(koreaDay(m.createdAt))}</small><span>{m.content||m.attachment?.name}</span></span><ArrowUpRight size={14}/></button>)}{!shown.length&&<p>일치하는 기록이 없어요.</p>}</div>
    <div className={s.searchHint}><span>{results.length}개{results.length>30?' · 최근 30개 표시':''}</span><span>↑↓ 이동 · Enter 열기 · Esc 닫기</span></div>
  </DialogContent></Dialog>;
}
