'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, FileText, Link2, Menu, Search, Star, Trash2, X } from 'lucide-react';
import { attachmentKind, demoMessages, koreaDay, makeMessage, messageReducer, offsetMonth, readableDay, type MessageAttachment } from './message-model';
import { MessageList, type ScrollRequest } from './message-list';
import { MessageComposer } from './message-composer';
import { MessageSearch } from './message-search';
import type { MessageHandlers } from './message-bubble';
import s from './preview.module.css';
import { useLiveLibrary } from './use-live-library';
import { LiveLogin } from './live-login';
import { TOKEN_KEY } from './live-library';
import { AnalysisView } from './analysis-view';

type View = 'all'|'day'|'pinned'|'links'|'files'|'trash';
const titles: Record<View,string> = {all:'나에게 보내기',day:'날짜별 기록',pinned:'즐겨찾기',links:'링크',files:'사진·파일',trash:'휴지통'};

export default function SpacePreview({initialDate,initialScreen,demo=false}:{initialDate:string;initialScreen:'entry'|'timeline';demo?:boolean}) {
  const remote=useLiveLibrary(!demo);
  const [saving,setSaving]=useState(false);
  const saveBusy=useRef(false);
  const [screen,setScreen] = useState<'entry'|'timeline'>(initialScreen);
  const [examples,dispatch] = useReducer(messageReducer,initialDate,demoMessages);
  const messages=demo?examples:remote.messages;
  const [today,setToday] = useState(initialDate);
  const [day,setDay] = useState(initialDate);
  const [month,setMonth] = useState(initialDate.slice(0,7));
  const [view,setView] = useState<View>('all');
  const [section,setSection] = useState<'inbox'|'analysis'>('inbox');
  const [draft,setDraft] = useState('');
  const [replyId,setReplyId] = useState<string>();
  const [attachment,setAttachment] = useState<MessageAttachment>();
  const objectUrls=useRef(new Set<string>());
  const [archiveOpen,setArchiveOpen] = useState(false);
  const [searchOpen,setSearchOpen] = useState(false);
  const [notice,setNotice] = useState('');
  const [undoId,setUndoId] = useState<string>();
  const [scroll,setScroll] = useState<ScrollRequest>({serial:0,kind:'bottom'});
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const archiveRef = useRef<HTMLElement>(null);
  useEffect(()=>{if(demo)return;const changed=(event:StorageEvent)=>{if(event.key===TOKEN_KEY||event.key===null){setDraft('');setNotice('');setReplyId(undefined);}};window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed);},[demo]);
  useEffect(()=>{const urls=objectUrls.current;return ()=>{urls.forEach(url=>URL.revokeObjectURL(url));urls.clear();};},[]);
  useEffect(()=>{
    function key(event:KeyboardEvent){
      if(screen!=='timeline'||event.isComposing)return;
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();setArchiveOpen(false);setSearchOpen(value=>!value);}
    }
    window.addEventListener('keydown',key);return ()=>window.removeEventListener('keydown',key);
  },[screen]);
  useEffect(()=>{
    if(!archiveOpen)return;
    const panel=archiveRef.current;
    const controls=()=>Array.from(panel?.querySelectorAll<HTMLElement>('button, input, a[href]')||[]);
    controls()[0]?.focus();
    function key(event:KeyboardEvent){
      if(event.key==='Escape'){event.preventDefault();setArchiveOpen(false);menuRef.current?.focus();}
      if(event.key==='Tab'){
        const list=controls(),first=list[0],last=list[list.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    }
    document.addEventListener('keydown',key);return ()=>document.removeEventListener('keydown',key);
  },[archiveOpen]);
  const live=messages.filter(message=>!message.isDeleted);
  const days=[...new Set(live.map(message=>koreaDay(message.createdAt)))].sort().reverse();
  const visible=messages.filter(message=>view==='trash'?message.isDeleted:!message.isDeleted&&(
    view==='day'?koreaDay(message.createdAt)===day:view==='pinned'?message.isPinned:view==='links'?!!message.link:view==='files'?!!message.attachment:true
  )).sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt));
  const [year,monthNumber]=month.split('-').map(Number);
  const firstWeekday=new Date(Date.UTC(year,monthNumber-1,1)).getUTCDay();
  const monthLength=new Date(Date.UTC(year,monthNumber,0)).getUTCDate();
  function requestScroll(kind:ScrollRequest['kind'],id?:string){setScroll(previous=>({serial:previous.serial+1,kind,id}));}
  function announce(text:string){setNotice(text);setUndoId(undefined);}
  function clearAttachment(){if(attachment){URL.revokeObjectURL(attachment.url);objectUrls.current.delete(attachment.url);}setAttachment(undefined);}
  function attach(file:File){
    if(file.size>10*1024*1024){announce('시안에서는 10 MB 이하 파일을 하나씩 첨부할 수 있어요.');return;}
    clearAttachment();const url=URL.createObjectURL(file);objectUrls.current.add(url);
    setAttachment({name:file.name,size:file.size,mime:file.type,url,kind:attachmentKind(file.type)});
    announce('파일을 첨부했어요. 서버에는 업로드되지 않아요.');inputRef.current?.focus();
  }
  function closeArchive(){setArchiveOpen(false);requestAnimationFrame(()=>menuRef.current?.focus());}
  function chooseView(next:View){setSection('inbox');setView(next);closeArchive();requestScroll(next==='all'?'bottom':'top');}
  function selectDay(next:string){setSection('inbox');setDay(next);setMonth(next.slice(0,7));setView('day');closeArchive();requestScroll('top');}
  function jump(id:string){
    const target=messages.find(message=>message.id===id&&!message.isDeleted);if(!target)return;
    setSection('inbox');setView('all');setDay(koreaDay(target.createdAt));setMonth(koreaDay(target.createdAt).slice(0,7));setArchiveOpen(false);requestScroll('message',id);
  }
  async function send(){
    if(!demo){
      if(saveBusy.current||remote.state==='signed-out'||remote.state==='loading')return;
      const value=draft.trim();
      if(!/^https?:\/\/\S+$/i.test(value)){announce('지금은 링크 하나씩 저장할 수 있어요. 메모·파일 저장은 아직 연결 전이에요.');return;}
      saveBusy.current=true;setSaving(true);
      try{const message=await remote.saveLink(value);setDraft('');setView('all');announce(message);requestScroll('bottom');}
      catch(error){announce(error instanceof Error?error.message:'저장하지 못했어요. 다시 시도해주세요.');}
      finally{saveBusy.current=false;setSaving(false);}
      return;
    }
    if(!draft.trim()&&!attachment)return;
    if(replyId&&!live.some(message=>message.id===replyId)){setReplyId(undefined);announce('원문이 삭제됐어요. 답장 없이 다시 보내주세요.');return;}
    const now=new Date(),date=koreaDay(now);
    dispatch({type:'create',message:makeMessage(draft,now.toISOString(),crypto.randomUUID(),replyId,attachment)});
    setDraft('');setAttachment(undefined);setReplyId(undefined);setToday(date);setDay(date);setView('all');
    announce('시안에 추가했어요.');requestScroll('bottom');inputRef.current?.focus();
  }
  function restore(id:string){dispatch({type:'restore',id,at:new Date().toISOString()});announce('기록을 복구했어요.');}
  const handlers:MessageHandlers={
    update(id,content){dispatch({type:'edit',id,content,at:new Date().toISOString()});announce('수정했어요.');},
    reply(id){setReplyId(id);requestAnimationFrame(()=>inputRef.current?.focus());},
    remove(id){dispatch({type:'delete',id,at:new Date().toISOString()});if(replyId===id)setReplyId(undefined);setUndoId(id);setNotice('휴지통으로 옮겼어요.');},
    restore,
    pin(id){dispatch({type:'pin',id});announce(messages.find(message=>message.id===id)?.isPinned?'즐겨찾기를 해제했어요.':'즐겨찾기에 추가했어요.');},
    jump,announce,
  };

  return <div className={s.preview} data-design="neon">
    <div className={s.previewBar}><Link href="/landing"><ArrowLeft size={12}/>랜딩</Link>{demo?<><span>디자인 시안 · 새로고침 시 초기화</span><div><button aria-pressed={screen==='entry'} onClick={()=>setScreen('entry')}>로그인 전</button><button aria-pressed={screen==='timeline'} onClick={()=>setScreen('timeline')}>로그인 후</button></div></>:<><span role="status">{remote.state==='live'?'● 자동 동기화 · 3초 간격':remote.state==='loading'?'보관함 연결 중…':remote.state==='offline'?'연결 재시도 중':'로그인 필요'}</span><Link href="/space/settings">계정 관리</Link></>}</div>
    {!demo&&remote.state==='signed-out'?<main className={s.entryScreen}><LiveLogin onLogin={()=>{setDraft('');setNotice('');void remote.refresh();}}/></main>:screen==='entry'?<main className={s.entryScreen}>
      <Link href="/landing" className={s.logo}>nuff<span>↗</span></Link>
      <section className={s.loginPanel}><h1>나에게 보내고,<br/>필요할 때 꺼내세요.</h1><p>메모와 링크를 한곳에.<br/>내 기록은 모든 기기에서 이어집니다.</p><div className={s.loginIllustration}><label>이메일<input placeholder="you@example.com" disabled/></label><label>비밀번호<input placeholder="비밀번호" type="password" disabled/></label></div><button className={s.enterButton} onClick={()=>setScreen('timeline')}>내 공간 미리보기<ArrowRight size={16}/></button><small>예시 화면입니다. 입력란은 실제 로그인에 사용되지 않아요.</small><Link href="/space/settings">실제 서비스에서 로그인</Link></section>
    </main>:<div className={s.app}>
      {archiveOpen&&<><button className={s.backdrop} aria-label="날짜 탐색 닫기" onClick={closeArchive}/><aside ref={archiveRef} className={s.sidebar} role="dialog" aria-modal="true" aria-label="내 아카이브 탐색">
        <div className={s.sideLogo}><Link href="/landing" className={s.logo}>nuff<span>↗</span></Link><button onClick={closeArchive} aria-label="탐색 닫기"><X size={18}/></button></div>
        <nav className={s.archiveNav}>{([{key:'all',label:'나에게 보내기',Icon:Menu},{key:'pinned',label:'즐겨찾기',Icon:Star},{key:'links',label:'링크',Icon:Link2},{key:'files',label:'사진·파일',Icon:FileText},{key:'trash',label:'휴지통',Icon:Trash2}] as const).filter(({key})=>demo||!['pinned','trash','files'].includes(key)).map(({key,label,Icon})=><button key={key} aria-current={view===key?'page':undefined} onClick={()=>chooseView(key)}><Icon size={16}/>{label}</button>)}</nav>
        <div className={s.monthHeading}><span>{year}년 {monthNumber}월</span><div><button aria-label="이전 달" onClick={()=>setMonth(offsetMonth(month,-1))}><ChevronLeft size={15}/></button><button aria-label="다음 달" onClick={()=>setMonth(offsetMonth(month,1))}><ChevronRight size={15}/></button></div></div>
        <div className={s.weekdays}>{['일','월','화','수','목','금','토'].map(value=><span key={value}>{value}</span>)}</div>
        <div className={s.calendarGrid}>{Array.from({length:firstWeekday},(_,index)=><span key={`blank-${index}`}/>)}{Array.from({length:monthLength},(_,index)=>{const value=`${month}-${String(index+1).padStart(2,'0')}`,has=days.includes(value);return <button key={value} aria-label={`${readableDay(value)}${has?', 기록 있음':''}`} aria-pressed={view==='day'&&day===value} className={view==='day'&&day===value?s.selectedDay:undefined} onClick={()=>selectDay(value)}>{index+1}{has&&<i/>}</button>})}</div>
        <label className={s.dateJump}>날짜로 이동<input type="date" value={day} onChange={event=>{if(/^\d{4}-\d{2}-\d{2}$/.test(event.target.value))selectDay(event.target.value)}}/></label>
        <div className={s.recentHeading}>최근 기록한 날</div><div className={s.recentDays}>{days.slice(0,8).map(value=><button key={value} onClick={()=>selectDay(value)}>{readableDay(value,true)}</button>)}</div>
        <div className={s.sidebarBottom}>{demo?"예시 데이터로 이용 중":remote.email||"내 Nuff 계정"}{!demo&&<small>최근 200개 · 카톡·공유 저장 자동 확인</small>}<Link href="/space/settings">계정 · 채널 연결 관리 ↗</Link></div>
      </aside></>}
      <main className={s.workspace} inert={archiveOpen||undefined}>
        <header className={s.workspaceHeader}><div><button ref={menuRef} aria-label="아카이브 탐색 열기" aria-expanded={archiveOpen} onClick={()=>setArchiveOpen(true)}><Menu size={19}/></button><div className={s.spaceTitle}><span>nuff<span>↗</span></span><h1>{section==='analysis'?'분석':titles[view]}</h1></div></div><div className={s.headerActions}><button title="오늘 기록" aria-label="오늘 기록 보기" onClick={()=>selectDay(today)}><CalendarDays size={18}/></button>{demo&&<button title="즐겨찾기" aria-label="즐겨찾기 보기" aria-pressed={view==='pinned'} onClick={()=>chooseView(view==='pinned'?'all':'pinned')}><Star size={18}/></button>}<button className={s.searchButton} onClick={()=>setSearchOpen(true)} aria-label="기록 검색"><Search size={17}/><span>검색</span><kbd>⌘ K</kbd></button></div></header>
        {!demo&&remote.error&&<div className={s.connectionNotice} role="status">{remote.error}<button onClick={()=>void remote.refresh()}>다시 확인</button></div>}
        <nav className={s.sectionTabs} aria-label="내 공간 보기"><button aria-pressed={section==='inbox'} onClick={()=>setSection('inbox')}>보관함</button><button aria-pressed={section==='analysis'} onClick={()=>setSection('analysis')}>분석</button></nav>
        {section==='analysis'?<AnalysisView messages={messages} loading={!demo&&remote.state==='loading'} onOpen={jump}/>:<>
        {view!=='all'&&<div className={s.filterBar}><span>{view==='day'?readableDay(day):titles[view]}</span><button onClick={()=>chooseView('all')}>전체 기록<X size={12}/></button></div>}
        <MessageList liveUpdates={!demo&&view==="all"} messages={visible} allMessages={messages} handlers={handlers} grouped heading="" emptyTitle={!demo&&remote.state==="loading"?"저장 목록을 불러오고 있어요.":!demo&&remote.state==="offline"&&!messages.length?"보관함에 연결하지 못했어요.":view==='trash'?'휴지통이 비어 있어요.':view==='pinned'?'중요한 기록을 모아보세요.':'아직 기록이 없어요.'} emptyText={!demo?"카톡이나 공유로 보낸 링크가 자동으로 나타나요.":view==='pinned'?'기록의 더보기 메뉴에서 즐겨찾기를 선택하세요.':'아래 입력창에 메모나 링크를 보내보세요.'} onRecent={()=>chooseView('all')} scrollRequest={scroll} selectDay={selectDay}/>
        <MessageComposer live={!demo} busy={saving||(!demo&&remote.state==="loading")} attachment={attachment} attach={attach} clearAttachment={clearAttachment} draft={draft} setDraft={setDraft} send={send} reply={messages.find(message=>message.id===replyId)} replySelected={!!replyId} cancelReply={()=>setReplyId(undefined)} jump={jump} inputRef={inputRef} notice={notice} undo={!!undoId} onUndo={()=>{if(undoId)restore(undoId)}}/>
        </>}
      </main>
      <MessageSearch open={searchOpen} onOpenChange={setSearchOpen} messages={messages} onSelect={jump}/>
    </div>}
  </div>;
}
