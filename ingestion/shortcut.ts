import { z } from 'zod';
import { urlsFromMessage, type IngressEnv } from './kakao';
import { authenticateDevice } from './auth';

const payload=z.object({url:z.string().min(1).max(8000)}).strict();

function json(body:unknown,status=200){return Response.json(body,{status,headers:{'Cache-Control':'no-store'}});}

function startOfTodayInKorea(now=Date.now()){
 const kst=new Date(now+9*60*60*1000);
 kst.setUTCHours(0,0,0,0);
 return new Date(kst.getTime()-9*60*60*1000).toISOString();
}

export async function shortcutCapture(request:Request,env:IngressEnv){
 const owner=await authenticateDevice(request,env);
 if(!owner)return json({ok:false,error:'unauthorized'},401);
 if(Number(request.headers.get('content-length')||0)>16384)return json({ok:false,error:'payload_too_large'},413);
 let input:z.infer<typeof payload>;
 try{const raw=await request.text();if(raw.length>16384)return json({ok:false,error:'payload_too_large'},413);input=payload.parse(JSON.parse(raw));}
 catch{return json({ok:false,error:'invalid_payload'},400);}
 let urls:string[];
 try{urls=urlsFromMessage(input.url);}catch(error){return json({ok:false,error:'invalid_url',message:(error as Error).message},400);}
 if(urls.length!==1)return json({ok:false,error:'invalid_url',message:'공유한 내용에서 링크 하나를 찾지 못했어요.'},400);
 const rate=await env.DB.prepare('SELECT COUNT(*) AS n FROM capture_jobs WHERE owner = ? AND created_at >= ?').bind(owner,new Date(Date.now()-3600000).toISOString()).first<{n:number}>();
 if((rate?.n||0)>=60)return json({ok:false,error:'rate_limited',message:'한 시간에 60개까지 저장할 수 있어요.'},429);
 const now=new Date().toISOString();
 const result=await env.DB.prepare("INSERT INTO capture_jobs (id,owner,url,source,status,attempts,available_at,created_at) VALUES (?,?,?,?, 'queued',0,?,?) ON CONFLICT(owner,url) DO NOTHING").bind(crypto.randomUUID(),owner,urls[0],'ios_shortcut',Date.now(),now).run();
 const today=await env.DB.prepare('SELECT COUNT(*) AS n FROM capture_jobs WHERE owner = ? AND created_at >= ?').bind(owner,startOfTodayInKorea()).first<{n:number}>();
 const saved=Number(result.meta.changes)>0;
 return json({ok:true,saved,duplicate:!saved,today:today?.n||0,message:saved?`저장 완료 · 오늘 ${today?.n||0}개`:`이미 저장됨 · 오늘 ${today?.n||0}개`});
}
