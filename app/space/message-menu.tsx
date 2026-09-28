'use client';

import type { ReactNode } from 'react';
import { Copy, CornerUpLeft, MoreHorizontal, Pencil, Star, Trash2 } from 'lucide-react';
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import s from './preview.module.css';

export type MessageActions = { reply:()=>void; edit:()=>void; copy:()=>void; pin:()=>void; remove:()=>void; pinned:boolean; readOnly?:boolean };
function options(actions: MessageActions) {
  const choices = [
    {label:'답장',Icon:CornerUpLeft,run:actions.reply},
    {label:'수정',Icon:Pencil,run:actions.edit},
    {label:'복사',Icon:Copy,run:actions.copy},
    {label:actions.pinned?'즐겨찾기 해제':'즐겨찾기',Icon:Star,run:actions.pin},
    {label:'휴지통으로 이동',Icon:Trash2,run:actions.remove,destructive:true},
  ];
  return actions.readOnly?choices.filter(option=>option.label==='복사'):choices;
}
export function MessageContextMenu({actions,children}:{actions:MessageActions;children:ReactNode}) {
  return <ContextMenu><ContextMenuTrigger asChild>{children}</ContextMenuTrigger><ContextMenuContent className={s.messageMenu} onCloseAutoFocus={e=>e.preventDefault()}>{options(actions).map(({label,Icon,run,destructive})=><div key={label}>{destructive&&<ContextMenuSeparator/>}<ContextMenuItem onSelect={run} variant={destructive?'destructive':'default'}><Icon size={14}/>{label}</ContextMenuItem></div>)}</ContextMenuContent></ContextMenu>;
}
export function MessageMoreMenu({actions,label}:{actions:MessageActions;label:string}) {
  return <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label={label} title="더보기"><MoreHorizontal size={16}/></button></DropdownMenuTrigger><DropdownMenuContent className={s.messageMenu} align="end" onCloseAutoFocus={e=>e.preventDefault()}>{options(actions).map(({label,Icon,run,destructive})=><div key={label}>{destructive&&<DropdownMenuSeparator/>}<DropdownMenuItem onSelect={run} variant={destructive?'destructive':'default'}><Icon size={14}/>{label}</DropdownMenuItem></div>)}</DropdownMenuContent></DropdownMenu>;
}
