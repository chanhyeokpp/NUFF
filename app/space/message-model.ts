// Local-only prototype. This owner is not a login or a server authorization check.
export const previewOwner = 'nuff-design-preview';
export type MessageLink = { url: string; title: string; summary: string; kind: 'video'|'article'; example: boolean; thumbnail?:string };
export type MessageAttachment = { name:string; size:number; mime:string; url:string; kind:'image'|'file' };
export type Message = {
  id: string;
  ownerId: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string;
  isDeleted: boolean;
  isPinned: boolean;
  replyToId?: string;
  type: 'text'|'link'|'image'|'file';
  source: '직접 기록'|'공유로 보냄'|'카카오톡으로 보냄';
  link?: MessageLink;
  attachment?:MessageAttachment;
  readOnly?:boolean;
  status?:string;
  analysis?:{summary:string;claims:string[];keywords:string[];mode:'ai'|'extractive'|'unread'|'sample'};
};
export type MessageAction =
  | { type: 'create'; message: Message }
  | { type: 'edit'; id: string; content: string; at: string }
  | { type: 'delete'; id: string; at: string }
  | { type: 'restore'; id: string; at: string }
  | { type: 'pin'; id: string }
  | { type: 'reset'; messages: Message[] };

export const koreaDay = (value: string|Date = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date(value));
export const messageTime = (value: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour:'2-digit', minute:'2-digit' }).format(new Date(value));
export function readableDay(day: string, short = false) {
  return new Intl.DateTimeFormat('ko-KR', { month:'long',day:'numeric',...(short?{}:{weekday:'long' as const}),timeZone:'Asia/Seoul' }).format(new Date(`${day}T12:00:00+09:00`));
}
export function shiftDay(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate()+amount); return date.toISOString().slice(0,10);
}
export function offsetMonth(month: string, amount: number) {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year,number-1+amount,1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;
}
export function linkFromContent(content: string): MessageLink|undefined {
  const match = content.match(/https?:\/\/[^\s<>]+/i);
  if (!match) return;
  try {
    const url = new URL(match[0]);
    if (!['http:','https:'].includes(url.protocol)) return;
    return { url:url.href,title:url.hostname,summary:'시안에서는 원본 링크만 표시해요. 실제 저장·분석은 실행하지 않아요.',kind:'article',example:false };
  } catch { return; }
}
export function makeMessage(content: string, createdAt: string, id: string, replyToId?: string, attachment?:MessageAttachment): Message {
  const link = linkFromContent(content);
  return { id,ownerId:previewOwner,content:content.trim(),createdAt,isDeleted:false,isPinned:false,replyToId,source:'직접 기록',type:attachment?.kind||(link?'link':'text'),link,attachment };
}
export function messageReducer(messages: Message[], action: MessageAction): Message[] {
  if (action.type==='reset') return action.messages;
  if (action.type==='create') {
    const message=action.message;
    if (message.ownerId!==previewOwner || (!message.content.trim()&&!message.attachment) || message.content.length>4000 || messages.some(m=>m.id===message.id)) return messages;
    if (message.replyToId && !messages.some(m=>m.id===message.replyToId && m.ownerId===message.ownerId && !m.isDeleted)) return messages;
    return [...messages,message];
  }
  return messages.map(message=>{
    if (message.id!==action.id || message.ownerId!==previewOwner) return message;
    if (action.type==='restore') return { ...message,isDeleted:false,deletedAt:undefined };
    if (message.isDeleted) return message;
    if (action.type==='delete') return { ...message,isDeleted:true,deletedAt:action.at };
    if (action.type==='pin') return { ...message,isPinned:!message.isPinned };
    if ((!action.content.trim()&&!message.attachment) || action.content.length>4000 || action.content.trim()===message.content) return message;
    // Editing an imported link changes the user's note, not its original source.
    const link=message.source==='직접 기록'?linkFromContent(action.content):message.link;
    return { ...message,content:action.content.trim(),updatedAt:action.at,link,type:message.attachment?.kind||(link?'link':'text') };
  });
}
export function resolveReply(messages: Message[], message: Message) {
  return messages.find(parent=>parent.id===message.replyToId && parent.ownerId===message.ownerId);
}
export function matchesSearch(message: Message, query: string) {
  return !message.isDeleted && `${message.content} ${message.link?.title||''} ${message.link?.url||''} ${message.link?.summary||''} ${message.attachment?.name||''}`.normalize('NFKC').toLocaleLowerCase().includes(query.trim().normalize('NFKC').toLocaleLowerCase());
}
export function attachmentKind(mime:string):MessageAttachment['kind'] { return /^image\/(png|jpeg|gif|webp|avif)$/.test(mime)?'image':'file'; }
export function fileSize(bytes:number) { return bytes<1024*1024?`${Math.max(1,Math.round(bytes/1024))} KB`:`${(bytes/1024/1024).toFixed(1)} MB`; }
export function shouldSend(event: { key:string; shiftKey:boolean; isComposing:boolean; keyCode?:number }) {
  return event.key==='Enter' && !event.shiftKey && !event.isComposing && event.keyCode!==229;
}

export function demoMessages(today='2026-09-26'): Message[] {
  const rows: Array<[string,number,string,string,Message['source'],MessageLink?]> = [
    ['a',0,'09:12','문득 든 생각.\n좋은 정보는 많이 모으는 것보다, 필요할 때 다시 만나는 게 중요한 것 같다.','직접 기록'],
    ['b',0,'10:34','이거 주말에 다시 보기. 특히 작은 습관에 대한 부분.','공유로 보냄',{url:'https://www.youtube.com/',title:'작은 습관이 하루를 바꾸는 방법',summary:'무리한 목표보다 반복할 수 있는 작은 행동에서 시작하기.',kind:'video',example:true}],
    ['c',0,'13:08','다음 주 기획할 때 참고하면 좋겠다.','카카오톡으로 보냄',{url:'https://example.com/',title:'아이디어를 위한 작은 여백',summary:'일상에서 발견한 생각을 짧게 남기고, 다시 읽으며 연결해보기.',kind:'article',example:true}],
    ['d',-1,'11:20','Nuff는 내 생각을 편하게 던져두는 공간이면 좋겠다.\n폴더를 어디에 넣을지부터 고민하지 않도록.','직접 기록'],
    ['e',-1,'18:42','이번 주에 발견한 디자인들, 주말에 천천히 다시 보자.','직접 기록'],
    ['f',-3,'14:05','내가 왜 이걸 저장했는지도 한 줄 남겨놓으면 좋겠네.','공유로 보냄',{url:'https://example.com/',title:'기록을 오래 이어가는 방법',summary:'완벽하게 정리하기보다 다시 찾을 수 있는 작은 단서 남기기.',kind:'article',example:true}],
    ['g',-8,'20:15','오늘 산책하다 떠오른 아이디어.\n저장한 것들을 날짜로 다시 만나면 그날 생각도 기억날 것 같다.','직접 기록'],
    ['h',-45,'09:30','오래된 기록도 바로 찾을 수 있으면 좋겠다. 계속 스크롤하지 않아도.','직접 기록'],
  ];
  return rows.map(([id,offset,time,content,source,link])=>({ ...makeMessage(content,`${shiftDay(today,offset)}T${time}:00+09:00`,id),source,link,type:link?'link':'text' }));
}
