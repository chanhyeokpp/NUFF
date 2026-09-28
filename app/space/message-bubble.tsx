'use client';

import { useState } from 'react';
import { Check, CornerUpLeft, Pencil, Share2, Star, Trash2, Undo2 } from 'lucide-react';
import { Message, messageTime } from './message-model';
import { MessageContextMenu, MessageMoreMenu } from './message-menu';
import { ReplyPreview } from './reply-preview';
import { LinkPreview } from './message-link';
import { AttachmentPreview } from './message-attachment';
import s from './preview.module.css';

export type MessageHandlers = {
  update:(id:string,content:string)=>void;
  reply:(id:string)=>void;
  remove:(id:string)=>void;
  restore:(id:string)=>void;
  pin:(id:string)=>void;
  jump:(id:string)=>void;
  announce:(message:string)=>void;
};

export function MessageBubble({ message, parent, handlers }: { message:Message;parent?:Message;handlers:MessageHandlers }) {
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState(message.content);
  const time=messageTime(message.createdAt);
  const linkOnly=!!message.link&&message.content.trim()===message.link.url;
  function edit(){setDraft(message.content);setEditing(true)}
  function save(){if(!draft.trim()&&!message.attachment)return;handlers.update(message.id,draft);setEditing(false)}
  async function copy(){try{await navigator.clipboard.writeText(message.content);handlers.announce('기록을 복사했어요.')}catch{handlers.announce('복사하지 못했어요. 내용을 선택해서 직접 복사해주세요.')}}
  const actions={reply:()=>handlers.reply(message.id),edit,copy,pin:()=>handlers.pin(message.id),remove:()=>handlers.remove(message.id),pinned:message.isPinned,readOnly:message.readOnly};
  if(message.isDeleted)return <article className={s.deletedEntry}><div className={s.deletedContent}><span><Trash2 size={13}/>삭제된 기록 · {time}</span><p>{message.content||message.attachment?.name}</p><button onClick={()=>handlers.restore(message.id)}><Undo2 size={13}/>복구</button></div></article>;
  return <MessageContextMenu actions={actions}><article className={`${s.messageRow} ${message.content.length>240||editing?s.longMessage:''}`}>
    <div className={s.messageStack}>
      <div className={s.messageToolbar}><div>{!message.readOnly&&<><button aria-label={`${time} 기록에 답장`} title="답장" onClick={actions.reply}><CornerUpLeft size={14}/></button><button aria-label={`${time} 기록 수정`} title="수정" onClick={edit}><Pencil size={13}/></button></>}<MessageMoreMenu actions={actions} label={`${time} 기록 더보기`}/></div></div>
      <div className={`${s.messageBody} ${linkOnly&&!editing?s.linkMessageBody:''}`}>
        {message.replyToId&&<ReplyPreview message={parent} onJump={handlers.jump}/>}
        {editing?<div className={s.editor}><label className={s.srOnly} htmlFor={`edit-${message.id}`}>내 메모 수정</label><textarea autoFocus id={`edit-${message.id}`} value={draft} onChange={e=>setDraft(e.target.value)} rows={3} maxLength={4000} onKeyDown={e=>{if(e.nativeEvent.isComposing||e.nativeEvent.keyCode===229)return;if(e.key==='Escape'){e.preventDefault();setEditing(false)}if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();save()}}}/><div><span>⌘ / Ctrl + Enter 완료</span><button onClick={()=>setEditing(false)}>취소</button><button disabled={!draft.trim()&&!message.attachment} onClick={save}><Check size={12}/>수정 완료</button></div></div>:!linkOnly&&<p className={s.bubble}>{message.content}</p>}
        {message.link&&<LinkPreview link={message.link}/>}
        {message.attachment&&<AttachmentPreview attachment={message.attachment}/>}
      </div>
      <div className={s.messageFoot}>{message.isPinned&&<Star size={10} aria-label="즐겨찾기"/>}{message.source!=='직접 기록'&&<span title={message.source} aria-label={message.source}><Share2 size={11}/></span>}{message.updatedAt&&<span title={new Date(message.updatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}>수정됨 · </span>}<time dateTime={message.createdAt}>{time}</time></div>
    </div>
  </article></MessageContextMenu>;
}
