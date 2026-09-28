import { Download, FileText } from 'lucide-react';
import { fileSize, type MessageAttachment } from './message-model';
import s from './preview.module.css';

export function AttachmentPreview({attachment}:{attachment:MessageAttachment}) {
  // These browser-local blob URLs must not go through a remote image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  if(attachment.kind==='image')return <a className={s.imageAttachment} href={attachment.url} download={attachment.name} title={`${attachment.name} 다운로드`}><img src={attachment.url} alt={attachment.name}/></a>;
  return <a className={s.fileAttachment} href={attachment.url} download={attachment.name}><FileText size={23}/><span><strong>{attachment.name}</strong><small>{attachment.name.split('.').pop()?.toUpperCase()} · {fileSize(attachment.size)}</small></span><Download size={14}/></a>;
}
