'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';
import { ArrowUp, FileText, Plus, X } from 'lucide-react';
import { Message, MessageAttachment, fileSize, shouldSend } from './message-model';
import { ReplyPreview } from './reply-preview';
import s from './preview.module.css';

export function MessageComposer({ draft,setDraft,send,reply,replySelected,cancelReply,jump,inputRef,notice,undo,onUndo,attachment,attach,clearAttachment,live=false,busy=false }: {
  draft:string;setDraft:(value:string)=>void;send:()=>void;reply?:Message;replySelected:boolean;cancelReply:()=>void;jump:(id:string)=>void;inputRef:RefObject<HTMLTextAreaElement|null>;notice:string;undo:boolean;onUndo:()=>void;
  attachment?:MessageAttachment;attach:(file:File)=>void;clearAttachment:()=>void;
  live?:boolean;busy?:boolean;
}) {
  const composing=useRef(false);
  const fileInput=useRef<HTMLInputElement>(null);
  useLayoutEffect(()=>{
    const input=inputRef.current;if(!input)return;
    input.style.height='auto';input.style.height=`${Math.min(input.scrollHeight,144)}px`;
  },[draft,inputRef]);
  return <div className={s.composerArea}>
    {notice&&<div className={s.noticeRow}><span role="status">{notice}</span>{undo&&<button onClick={onUndo}>실행 취소</button>}</div>}
    <div className={s.composer}>
      {replySelected&&<ReplyPreview message={reply} onJump={jump} onCancel={cancelReply}/>}
      {attachment&&<div className={s.pendingAttachment}><FileText size={15}/><span>{attachment.name}<small>{fileSize(attachment.size)} · 시안용 첨부</small></span><button onClick={clearAttachment} aria-label="첨부 취소"><X size={14}/></button></div>}
      <div className={s.composerInput}>
      {!live&&<input className={s.srOnly} type="file" ref={fileInput} tabIndex={-1} aria-label="사진 또는 파일 선택" onChange={event=>{const file=event.target.files?.[0];if(file)attach(file);event.target.value='';}}/>}
      {!live&&<button className={s.attachButton} onClick={()=>fileInput.current?.click()} aria-label="사진·파일 첨부" title="사진·파일 첨부 (시안용, 최대 10 MB)"><Plus size={19}/></button>}
      <label className={s.srOnly} htmlFor="new-entry">새 메모 또는 링크</label>
      <textarea id="new-entry" ref={inputRef} rows={1} maxLength={4000} disabled={busy} value={draft} onChange={e=>setDraft(e.target.value)} placeholder={live?'저장할 링크를 붙여넣으세요...':replySelected?'답장을 입력하세요...':'메모나 링크를 나에게 보내세요...'} onCompositionStart={()=>{composing.current=true}} onCompositionEnd={()=>{composing.current=false}} onKeyDown={event=>{
        if(event.key==='Escape'&&!composing.current){cancelReply();return;}
        if(shouldSend({key:event.key,shiftKey:event.shiftKey,isComposing:composing.current||event.nativeEvent.isComposing,keyCode:event.nativeEvent.keyCode})){event.preventDefault();send();}
      }}/>
      <button className={s.sendButton} onClick={send} disabled={busy||(!draft.trim()&&!attachment)} aria-label={live?"링크 저장":"시안에 기록 보내기"}><ArrowUp size={18}/></button></div>
    </div>
    <div className={s.composerCaption}>{live&&<span>{busy?"저장 중…":"현재 링크 저장 지원"}</span>}<span>Enter 전송 · Shift + Enter 줄바꿈</span></div>
  </div>;
}
