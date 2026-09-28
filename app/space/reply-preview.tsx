'use client';

import { CornerUpLeft, X } from 'lucide-react';
import type { Message } from './message-model';
import s from './preview.module.css';

export function ReplyPreview({ message, onJump, onCancel }: { message?: Message; onJump?: (id:string)=>void; onCancel?:()=>void }) {
  const unavailable=!message || message.isDeleted;
  const text=!message?'원본 기록을 찾을 수 없어요.':message.isDeleted?'삭제된 기록이에요.':message.content||message.attachment?.name;
  return <div className={s.replyPreview}>
    <CornerUpLeft size={14}/>
    <button type="button" onClick={()=>{if(message&&!unavailable)onJump?.(message.id)}} disabled={unavailable||!onJump} aria-label={unavailable?text:'답장 원문으로 이동'}>
      <small>{onCancel?'답장 중':'답장'}{message?.updatedAt&&!unavailable?' · 수정됨':''}</small>
      <span>{text}</span>
    </button>
    {onCancel&&<button type="button" className={s.replyCancel} aria-label="답장 취소" onClick={onCancel}><X size={14}/></button>}
  </div>;
}
