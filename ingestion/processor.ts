import { analyzeContent } from '../lib/pipeline';
import type { IngressEnv } from './kakao';
type Job={id:string;owner:string;url:string;attempts:number;lease_token:string;created_at:string};
function failureCode(error:unknown){const message=error instanceof Error?error.message:'';if(['gemini_video_failed','gemini_video_unavailable','gemini_rate_limited','gemini_auth_failed'].includes(message))return message;if(message==='youtube_metadata_failed')return message;if(message.includes('AI 분석')||message.includes('AI가 분석'))return 'openai_failed';if(message.toLowerCase().includes('timeout')||message.toLowerCase().includes('abort'))return 'timeout';return 'analysis_failed';}
export async function processNext(env:IngressEnv,analyze=analyzeContent){
 const now=Date.now(),token=crypto.randomUUID();
 // A lease plus a completion fence prevents two workers from committing the same job.
 const job=await env.DB.prepare("UPDATE capture_jobs SET status='processing', attempts=attempts+1, lease_until=?, lease_token=? WHERE id=(SELECT id FROM capture_jobs WHERE attempts<3 AND ((status IN ('queued','retry') AND available_at<=?) OR (status='processing' AND lease_until<?)) ORDER BY available_at LIMIT 1) RETURNING *").bind(now+180000,token,now,now).first<Job>();
 if(!job)return false;
 try{const item=await analyze(job.url,undefined,env,()=>{});item.id=job.id;item.createdAt=job.created_at;
 await env.DB.batch([
 env.DB.prepare("INSERT INTO contents (id,owner,url,data,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM capture_jobs WHERE id=? AND lease_token=? AND status='processing') ON CONFLICT(owner,url) DO UPDATE SET data=excluded.data").bind(job.id,job.owner,job.url,JSON.stringify(item),job.created_at,job.id,token),
 env.DB.prepare("UPDATE capture_jobs SET status=?, lease_until=NULL, lease_token=NULL, last_error=NULL WHERE id=? AND lease_token=? AND status='processing'").bind(item.mode==='unread'?'needs_content':'ready',job.id,token)
 ]);
 }catch(error){
 const dead=job.attempts>=3;
 await env.DB.prepare("UPDATE capture_jobs SET status=?,available_at=?,lease_until=NULL,lease_token=NULL,last_error=? WHERE id=? AND lease_token=?").bind(dead?'failed':'retry',Date.now()+60000*2**(job.attempts-1),failureCode(error),job.id,token).run();
 }
 return true;
}
export async function drain(env:IngressEnv){
 await env.DB.prepare("UPDATE capture_jobs SET status='failed',lease_until=NULL,lease_token=NULL,last_error='worker_interrupted' WHERE status='processing' AND lease_until<? AND attempts>=3").bind(Date.now()).run();
 // Four independent short jobs per tick; pending jobs remain durable in D1.
 await Promise.all(Array.from({length:4},()=>processNext(env)));
}
