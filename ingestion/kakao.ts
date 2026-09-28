import { z } from 'zod';
import { normalizeUrl } from '../lib/pipeline';
import type { Item } from '../lib/domain';
import { createPairingCode, resolveKakaoUser } from './auth';
export type IngressEnv={DB:D1Database;KAKAO_SKILL_SECRET:string;KAKAO_BOT_ID:string;OPENAI_API_KEY?:string;OPENAI_MODEL?:string;YOUTUBE_API_KEY?:string;GEMINI_API_KEY?:string;GEMINI_MODEL?:string;RESEND_API_KEY?:string;EMAIL_FROM?:string};
const payload=z.object({bot:z.object({id:z.string().min(1).max(200)}),userRequest:z.object({utterance:z.string().max(8000),user:z.object({id:z.string().min(1).max(200),type:z.literal('botUserKey')})})});
export function reply(text:string){return Response.json({version:'2.0',template:{outputs:[{simpleText:{text:text.slice(0,1000)}}]}},{headers:{'Cache-Control':'no-store'}});}
export function urlsFromMessage(text:string){const raw=text.match(/https?:\/\/[^\s<>"\u0000-\u001f]+/gi)||[];if(raw.length>5)throw new Error('한 번에 링크를 5개까지 보내주세요.');return [...new Set(raw.map(s=>normalizeUrl(s.replace(/[\])},.!?。]+$/g,''))))];}
function platformLabel(url:string){const host=new URL(url).hostname.replace(/^www\./,'');if(host==='youtu.be'||host.endsWith('youtube.com'))return '유튜브 영상';if(host.endsWith('instagram.com'))return '인스타그램 콘텐츠';if(host.endsWith('tiktok.com'))return '틱톡 영상';return '웹 콘텐츠';}
export async function kakaoOwner(bot:string,user:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${bot}\u0000${user}`));return `kakao:${[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('')}`;}
export async function sameSecret(a:string,b:string){const enc=new TextEncoder();const [x,y]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(a)),crypto.subtle.digest('SHA-256',enc.encode(b))]);let diff=0;new Uint8Array(x).forEach((n,i)=>{diff|=n^new Uint8Array(y)[i]});return diff===0;}
export async function kakaoWebhook(request:Request,env:IngressEnv){
 if(!env.KAKAO_SKILL_SECRET||!env.KAKAO_BOT_ID)return Response.json({error:'integration_not_configured'},{status:503});
 if(!await sameSecret(request.headers.get('x-nuff-skill-key')||'',env.KAKAO_SKILL_SECRET))return Response.json({error:'unauthorized'},{status:401});
 if(Number(request.headers.get('content-length')||0)>32768)return Response.json({error:'payload_too_large'},{status:413});
 let parsed:z.infer<typeof payload>;try{const text=await request.text();if(text.length>32768)return Response.json({error:'payload_too_large'},{status:413});parsed=payload.parse(JSON.parse(text));}catch{return Response.json({error:'invalid_payload'},{status:400});}
 if(parsed.bot.id!==env.KAKAO_BOT_ID)return Response.json({error:'wrong_bot'},{status:403});
 const owner=await resolveKakaoUser(env,await kakaoOwner(parsed.bot.id,parsed.userRequest.user.id));const message=parsed.userRequest.utterance.trim();
 try{
 if(message==='앱 연결'){
 const code=await createPairingCode(env,owner);
 return reply(`Nuff 앱 연결 코드예요.\n\n${code}\n\n10분 안에 앱에 입력해주세요. 한 번 사용하면 만료돼요.`);
 }
 if(['보관함','요약','내 링크'].includes(message)){
 const recent=await env.DB.prepare('SELECT status,url FROM capture_jobs WHERE owner = ? ORDER BY created_at DESC LIMIT 5').bind(owner).all<{status:string;url:string}>();
 if(!recent.results.length)return reply('아직 저장한 링크가 없어요. 유용한 콘텐츠의 링크를 이 채팅방에 보내주세요.');
 const records=await env.DB.prepare('SELECT data FROM contents WHERE owner = ? ORDER BY created_at DESC LIMIT 5').bind(owner).all<{data:string}>();
 const byURL=new Map(records.results.map(r=>{const i=JSON.parse(r.data) as Item;return [i.url,i] as const}));
 return reply('최근 저장한 콘텐츠예요.\n\n'+recent.results.map((r,i)=>{const item=byURL.get(r.url);const status=r.status==='ready'?'정리 완료':r.status==='needs_content'?'본문 확인 필요':r.status==='failed'?'분석 실패':r.status==='retry'?'재시도 대기':'정리 대기';const title=item?.title?` · ${item.title}`:'';return `${i+1}. ${platformLabel(r.url)}${title} · ${status}${message==='요약'&&item?`\n${item.summary}`:''}`}).join('\n\n')+'\n\n자세한 내용은 Nuff 앱 또는 웹에서 확인해주세요.');
 }
 if(message==='다시 시도'){
 const result=await env.DB.prepare("UPDATE capture_jobs SET status='queued', attempts=0, available_at=?, last_error=NULL WHERE owner=? AND status='failed'").bind(Date.now(),owner).run();return reply(result.meta.changes?'분석에 실패한 링크를 다시 처리할게요. 원본 링크는 그대로 보관되어 있어요.':'다시 시도할 분석 실패 링크가 없어요.');
 }
 let urls:string[];try{urls=urlsFromMessage(message)}catch(e){return reply((e as Error).message)}
 if(!urls.length)return reply('기억하고 싶은 콘텐츠의 링크를 보내주세요.\n\n링크는 먼저 보관하고, 읽을 수 있는 내용을 뒤에서 정리해요.\n“보관함” · 최근 링크 확인\n“요약” · 정리된 내용 확인\n“다시 시도” · 분석 실패 재처리');
 const rate=await env.DB.prepare("SELECT COUNT(*) AS n FROM capture_jobs WHERE owner = ? AND created_at >= ?").bind(owner,new Date(Date.now()-3600000).toISOString()).first<{n:number}>();if((rate?.n||0)+urls.length>60)return reply('잠시 쉬었다가 보내주세요. 한 시간에 60개까지 저장할 수 있어요.');
 const now=new Date().toISOString();const results=await env.DB.batch(urls.map(url=>env.DB.prepare("INSERT INTO capture_jobs (id,owner,url,source,status,attempts,available_at,created_at) VALUES (?,?,?,?, 'queued',0,?,?) ON CONFLICT(owner,url) DO NOTHING").bind(crypto.randomUUID(),owner,url,'kakao',Date.now(),now)));
 const count=results.reduce((n,r)=>n+r.meta.changes,0);
 return reply(count?`링크 ${count}개를 보관했어요.${urls.length-count?` 이미 보관된 ${urls.length-count}개는 중복 저장하지 않았어요.`:''}\n읽을 수 있는 내용은 차례대로 정리할게요.\n\n“보관함”을 보내면 확인할 수 있어요.`:'이미 보관한 링크예요. “보관함”을 보내 확인해보세요.');
 }catch{return reply('지금은 링크를 보관하지 못했어요. 잠시 후 다시 보내주세요.');}
}
