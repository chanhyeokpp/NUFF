import { z } from 'zod';
import type { IngressEnv } from './kakao';

const pairPayload=z.object({code:z.string().min(8).max(20)}).strict();
const accountPayload=z.object({email:z.string().email().max(254),password:z.string().min(10).max(128)}).strict();
const verifyPayload=z.object({email:z.string().email().max(254),code:z.string().regex(/^\d{6}$/)}).strict();
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// Cloudflare Workers Web Crypto caps PBKDF2 at 100,000 iterations.
const passwordIterations=100000;

async function hash(value:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function randomCode(length:number){const bytes=crypto.getRandomValues(new Uint8Array(length));return [...bytes].map(x=>alphabet[x%alphabet.length]).join('');}
function randomToken(){const bytes=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
function bytesToBase64(bytes:Uint8Array){return btoa(String.fromCharCode(...bytes));}
function base64ToBytes(value:string){return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
async function passwordHash(password:string,salt:Uint8Array,iterations=passwordIterations){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const saltBuffer=Uint8Array.from(salt).buffer as ArrayBuffer;const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:saltBuffer,iterations},key,256);return bytesToBase64(new Uint8Array(bits));}
function sameValue(a:string,b:string){const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);let diff=x.length^y.length;for(let i=0;i<Math.max(x.length,y.length);i++)diff|=(x[i]||0)^(y[i]||0);return diff===0;}
async function issueToken(env:IngressEnv,userId:string){const token=randomToken(),createdAt=new Date().toISOString();await env.DB.prepare('INSERT INTO device_tokens (id,user_id,token_hash,created_at,last_used_at,revoked_at) VALUES (?,?,?,?,?,NULL)').bind(crypto.randomUUID(),userId,await hash(token),createdAt,createdAt).run();return token;}
function verificationCode(){const bytes=crypto.getRandomValues(new Uint32Array(1));return String(bytes[0]%1000000).padStart(6,'0')}
async function sendVerification(env:IngressEnv,userId:string,email:string){if(!env.RESEND_API_KEY||!env.EMAIL_FROM)return false;const recent=await env.DB.prepare('SELECT created_at FROM email_verification_codes WHERE user_id=? ORDER BY created_at DESC LIMIT 1').bind(userId).first<{created_at:number}>();if(recent&&recent.created_at>Date.now()-60000)return true;const code=verificationCode(),now=Date.now();await env.DB.prepare('DELETE FROM email_verification_codes WHERE user_id=? OR expires_at<?').bind(userId,now).run();await env.DB.prepare('INSERT INTO email_verification_codes (id,user_id,code_hash,expires_at,attempts,created_at) VALUES (?,?,?,?,0,?)').bind(crypto.randomUUID(),userId,await hash(code),now+10*60*1000,now).run();const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:env.EMAIL_FROM,to:[email],subject:'Nuff 이메일 확인 코드',html:`<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px"><h1 style="color:#ff5a1f">Nuff</h1><p>이메일 확인 코드예요.</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${code}</p><p>10분 안에 Nuff에 입력해주세요.</p></div>`}),signal:AbortSignal.timeout(10000)});if(!response.ok){await env.DB.prepare('DELETE FROM email_verification_codes WHERE user_id=?').bind(userId).run();throw new Error('verification_delivery_failed')}return true}

export async function signup(request:Request,env:IngressEnv){
 let body:z.infer<typeof accountPayload>;try{body=accountPayload.parse(await request.json())}catch{return Response.json({ok:false,error:'invalid_payload',message:'올바른 이메일과 10자 이상의 비밀번호를 입력해주세요.'},{status:400})}
 const email=body.email.trim().toLowerCase();if(await env.DB.prepare('SELECT user_id FROM email_credentials WHERE email=?').bind(email).first())return Response.json({ok:false,error:'email_exists',message:'이미 가입된 이메일이에요.'},{status:409});
 const userId=`user:${crypto.randomUUID()}`,now=new Date().toISOString(),salt=crypto.getRandomValues(new Uint8Array(16)),password=await passwordHash(body.password,salt);
 try{await env.DB.batch([env.DB.prepare('INSERT INTO users (id,created_at) VALUES (?,?)').bind(userId,now),env.DB.prepare('INSERT INTO email_credentials (user_id,email,password_hash,salt,iterations,created_at) VALUES (?,?,?,?,?,?)').bind(userId,email,password,bytesToBase64(salt),passwordIterations,now),env.DB.prepare('INSERT INTO user_identities (id,user_id,provider,provider_subject,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),userId,'email',email,now)])}catch{return Response.json({ok:false,error:'email_exists',message:'이미 가입된 이메일이에요.'},{status:409})}
 try{if(await sendVerification(env,userId,email))return Response.json({ok:true,verificationRequired:true,email},{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({ok:false,error:'verification_delivery_failed',message:'확인 메일을 보내지 못했어요. 잠시 후 다시 시도해주세요.'},{status:503})}await env.DB.prepare('UPDATE email_credentials SET verified_at=? WHERE user_id=?').bind(new Date().toISOString(),userId).run();return Response.json({ok:true,token:await issueToken(env,userId),user:{id:userId,email}},{headers:{'Cache-Control':'no-store'}});
}

export async function addEmail(request:Request,env:IngressEnv){
 const userId=await authenticateDevice(request,env);if(!userId)return Response.json({ok:false,error:'unauthorized'},{status:401});let body:z.infer<typeof accountPayload>;try{body=accountPayload.parse(await request.json())}catch{return Response.json({ok:false,error:'invalid_payload',message:'올바른 이메일과 10자 이상의 비밀번호를 입력해주세요.'},{status:400})}
 if(await env.DB.prepare('SELECT user_id FROM email_credentials WHERE user_id=?').bind(userId).first())return Response.json({ok:false,error:'email_already_added',message:'이미 이메일 로그인이 연결되어 있어요.'},{status:409});const email=body.email.trim().toLowerCase();if(await env.DB.prepare('SELECT user_id FROM email_credentials WHERE email=?').bind(email).first())return Response.json({ok:false,error:'email_exists',message:'이미 다른 계정에서 사용하는 이메일이에요.'},{status:409});const now=new Date().toISOString(),salt=crypto.getRandomValues(new Uint8Array(16)),password=await passwordHash(body.password,salt);
 try{await env.DB.batch([env.DB.prepare('INSERT INTO email_credentials (user_id,email,password_hash,salt,iterations,created_at) VALUES (?,?,?,?,?,?)').bind(userId,email,password,bytesToBase64(salt),passwordIterations,now),env.DB.prepare('INSERT INTO user_identities (id,user_id,provider,provider_subject,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),userId,'email',email,now)])}catch{return Response.json({ok:false,error:'email_exists',message:'이미 다른 계정에서 사용하는 이메일이에요.'},{status:409})}return Response.json({ok:true,user:{id:userId,email}},{headers:{'Cache-Control':'no-store'}});
}

export async function accountInfo(request:Request,env:IngressEnv){const userId=await authenticateDevice(request,env);if(!userId)return Response.json({ok:false,error:'unauthorized'},{status:401});const credential=await env.DB.prepare('SELECT email FROM email_credentials WHERE user_id=?').bind(userId).first<{email:string}>();const providers=await env.DB.prepare('SELECT provider FROM user_identities WHERE user_id=? ORDER BY provider').bind(userId).all<{provider:string}>();return Response.json({ok:true,user:{id:userId,email:credential?.email||null},providers:providers.results.map(x=>x.provider)},{headers:{'Cache-Control':'no-store'}})}

export async function login(request:Request,env:IngressEnv){
 let body:z.infer<typeof accountPayload>;try{body=accountPayload.parse(await request.json())}catch{return Response.json({ok:false,error:'invalid_payload',message:'이메일과 비밀번호를 확인해주세요.'},{status:400})}
 const email=body.email.trim().toLowerCase(),row=await env.DB.prepare('SELECT user_id,password_hash,salt,iterations,failed_attempts,locked_until,verified_at FROM email_credentials WHERE email=?').bind(email).first<{user_id:string;password_hash:string;salt:string;iterations:number;failed_attempts:number;locked_until:number|null;verified_at:string|null}>();
 if(!row){await passwordHash(body.password,new Uint8Array(16));return Response.json({ok:false,error:'invalid_credentials',message:'이메일 또는 비밀번호가 맞지 않아요.'},{status:401})}
 if(row.locked_until&&row.locked_until>Date.now())return Response.json({ok:false,error:'temporarily_locked',message:'로그인을 여러 번 실패했어요. 15분 후 다시 시도해주세요.'},{status:429});
 const candidate=await passwordHash(body.password,base64ToBytes(row.salt),row.iterations);if(!sameValue(candidate,row.password_hash)){const failed=row.failed_attempts+1;await env.DB.prepare('UPDATE email_credentials SET failed_attempts=?,locked_until=? WHERE user_id=?').bind(failed,failed>=5?Date.now()+15*60*1000:null,row.user_id).run();return Response.json({ok:false,error:'invalid_credentials',message:'이메일 또는 비밀번호가 맞지 않아요.'},{status:401})}
 await env.DB.prepare('UPDATE email_credentials SET failed_attempts=0,locked_until=NULL WHERE user_id=?').bind(row.user_id).run();if(!row.verified_at){try{if(await sendVerification(env,row.user_id,email))return Response.json({ok:false,error:'verification_required',verificationRequired:true,email,message:'이메일로 보낸 확인 코드를 입력해주세요.'},{status:403})}catch{return Response.json({ok:false,error:'verification_delivery_failed',message:'확인 메일을 보내지 못했어요.'},{status:503})}await env.DB.prepare('UPDATE email_credentials SET verified_at=? WHERE user_id=?').bind(new Date().toISOString(),row.user_id).run()}return Response.json({ok:true,token:await issueToken(env,row.user_id),user:{id:row.user_id,email}},{headers:{'Cache-Control':'no-store'}});
}

export async function verifyEmail(request:Request,env:IngressEnv){let body:z.infer<typeof verifyPayload>;try{body=verifyPayload.parse(await request.json())}catch{return Response.json({ok:false,error:'invalid_payload',message:'6자리 확인 코드를 입력해주세요.'},{status:400})}const email=body.email.trim().toLowerCase(),credential=await env.DB.prepare('SELECT user_id,verified_at FROM email_credentials WHERE email=?').bind(email).first<{user_id:string;verified_at:string|null}>();if(!credential)return Response.json({ok:false,error:'invalid_code',message:'확인 코드가 맞지 않아요.'},{status:401});if(credential.verified_at)return Response.json({ok:false,error:'invalid_code',message:'이메일과 비밀번호로 로그인해주세요.'},{status:401});const now=Date.now(),row=await env.DB.prepare('SELECT id,code_hash,attempts FROM email_verification_codes WHERE user_id=? AND expires_at>? ORDER BY created_at DESC LIMIT 1').bind(credential.user_id,now).first<{id:string;code_hash:string;attempts:number}>();if(!row||row.attempts>=5||!sameValue(await hash(body.code),row.code_hash)){if(row)await env.DB.prepare('UPDATE email_verification_codes SET attempts=attempts+1 WHERE id=?').bind(row.id).run();return Response.json({ok:false,error:'invalid_code',message:'확인 코드가 틀렸거나 만료됐어요.'},{status:401})}await env.DB.batch([env.DB.prepare('UPDATE email_credentials SET verified_at=? WHERE user_id=?').bind(new Date().toISOString(),credential.user_id),env.DB.prepare('DELETE FROM email_verification_codes WHERE user_id=?').bind(credential.user_id)]);return Response.json({ok:true,token:await issueToken(env,credential.user_id),user:{id:credential.user_id,email}},{headers:{'Cache-Control':'no-store'}})}

export async function resendVerification(request:Request,env:IngressEnv){let body:{email:string};try{body=z.object({email:z.string().email().max(254)}).strict().parse(await request.json())}catch{return Response.json({ok:false,error:'invalid_payload'},{status:400})}const email=body.email.trim().toLowerCase(),row=await env.DB.prepare('SELECT user_id,verified_at FROM email_credentials WHERE email=?').bind(email).first<{user_id:string;verified_at:string|null}>();if(row&&!row.verified_at){try{await sendVerification(env,row.user_id,email)}catch{return Response.json({ok:false,error:'verification_delivery_failed',message:'확인 메일을 보내지 못했어요.'},{status:503})}}return Response.json({ok:true,message:'가입된 이메일이라면 확인 코드를 보냈어요.'},{headers:{'Cache-Control':'no-store'}})}

export async function resolveKakaoUser(env:IngressEnv,providerSubject:string){
 const found=await env.DB.prepare('SELECT user_id FROM user_identities WHERE provider = ? AND provider_subject = ?').bind('kakao',providerSubject).first<{user_id:string}>();
 if(found)return found.user_id;
 const now=new Date().toISOString();
 await env.DB.batch([
  env.DB.prepare('INSERT OR IGNORE INTO users (id,created_at) VALUES (?,?)').bind(providerSubject,now),
  env.DB.prepare('INSERT OR IGNORE INTO user_identities (id,user_id,provider,provider_subject,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),providerSubject,'kakao',providerSubject,now)
 ]);
 return providerSubject;
}

export async function createPairingCode(env:IngressEnv,userId:string){
 const code=randomCode(8),now=Date.now();
 await env.DB.prepare('DELETE FROM pairing_codes WHERE user_id = ? OR expires_at < ?').bind(userId,now).run();
 await env.DB.prepare('INSERT INTO pairing_codes (code_hash,user_id,expires_at,used_at) VALUES (?,?,?,NULL)').bind(await hash(code),userId,now+10*60*1000).run();
 return code;
}

export async function createDeviceCode(request:Request,env:IngressEnv){const userId=await authenticateDevice(request,env);if(!userId)return Response.json({ok:false,error:'unauthorized'},{status:401});return Response.json({ok:true,code:await createPairingCode(env,userId),expiresIn:600},{headers:{'Cache-Control':'no-store'}})}

export async function pairDevice(request:Request,env:IngressEnv){
 let body:z.infer<typeof pairPayload>;
 try{body=pairPayload.parse(await request.json());}catch{return Response.json({ok:false,error:'invalid_payload'},{status:400});}
 const now=Date.now();
 const row=await env.DB.prepare('UPDATE pairing_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING user_id').bind(now,await hash(body.code.trim().toUpperCase()),now).first<{user_id:string}>();
 if(!row)return Response.json({ok:false,error:'invalid_or_expired_code'},{status:401});
 return Response.json({ok:true,token:await issueToken(env,row.user_id)},{headers:{'Cache-Control':'no-store'}});
}

export async function authenticateDevice(request:Request,env:IngressEnv){
 const auth=request.headers.get('authorization')||'';
 if(!auth.startsWith('Bearer '))return null;
 const tokenHash=await hash(auth.slice(7));
 const row=await env.DB.prepare('SELECT id,user_id FROM device_tokens WHERE token_hash = ? AND revoked_at IS NULL').bind(tokenHash).first<{id:string;user_id:string}>();
 if(!row)return null;
 await env.DB.prepare('UPDATE device_tokens SET last_used_at = ? WHERE id = ?').bind(new Date().toISOString(),row.id).run();
 return row.user_id;
}

export async function linkKakao(request:Request,env:IngressEnv){
 const target=await authenticateDevice(request,env);if(!target)return Response.json({ok:false,error:'unauthorized'},{status:401});let body:z.infer<typeof pairPayload>;try{body=pairPayload.parse(await request.json())}catch{return Response.json({ok:false,error:'invalid_payload'},{status:400})}
 const now=Date.now(),codeHash=await hash(body.code.trim().toUpperCase());
 const pair=await env.DB.prepare('SELECT user_id FROM pairing_codes WHERE code_hash=? AND used_at IS NULL AND expires_at>?').bind(codeHash,now).first<{user_id:string}>();
 if(!pair)return Response.json({ok:false,error:'invalid_or_expired_code',message:'코드가 틀렸거나 만료됐어요.'},{status:401});
 const source=pair.user_id;
 const kakaoIdentity=await env.DB.prepare("SELECT id FROM user_identities WHERE user_id=? AND provider='kakao'").bind(source).first();
 if(!kakaoIdentity)return Response.json({ok:false,error:'not_kakao_code',message:'카카오톡 Nuff 채팅에서 받은 코드를 입력해주세요.'},{status:400});
 if(source===target)return Response.json({ok:true,merged:false});
 if(await env.DB.prepare('SELECT user_id FROM email_credentials WHERE user_id=?').bind(source).first())return Response.json({ok:false,error:'kakao_account_in_use',message:'이미 다른 Nuff 계정에 연결된 카카오예요. 해당 계정으로 로그인해주세요.'},{status:409});
 const existing=await env.DB.prepare("SELECT id FROM user_identities WHERE user_id=? AND provider='kakao'").bind(target).first();if(existing)return Response.json({ok:false,error:'kakao_already_linked',message:'이미 다른 카카오 계정이 연결되어 있어요.'},{status:409});
 const consumed=await env.DB.prepare('UPDATE pairing_codes SET used_at=? WHERE code_hash=? AND user_id=? AND used_at IS NULL AND expires_at>? RETURNING user_id').bind(Date.now(),codeHash,source,Date.now()).first();
 if(!consumed)return Response.json({ok:false,error:'invalid_or_expired_code',message:'코드가 틀렸거나 만료됐어요.'},{status:401});
 await env.DB.batch([
  env.DB.prepare('DELETE FROM contents WHERE owner=? AND url IN (SELECT url FROM contents WHERE owner=?)').bind(source,target),
  env.DB.prepare('DELETE FROM capture_jobs WHERE owner=? AND url IN (SELECT url FROM capture_jobs WHERE owner=?)').bind(source,target),
  env.DB.prepare('UPDATE contents SET owner=? WHERE owner=?').bind(target,source),
  env.DB.prepare('UPDATE capture_jobs SET owner=? WHERE owner=?').bind(target,source),
  env.DB.prepare('UPDATE events SET owner=? WHERE owner=?').bind(target,source),
  env.DB.prepare('UPDATE device_tokens SET user_id=? WHERE user_id=?').bind(target,source),
  env.DB.prepare('DELETE FROM pairing_codes WHERE user_id=?').bind(source),
  env.DB.prepare("UPDATE user_identities SET user_id=? WHERE user_id=? AND provider='kakao'").bind(target,source),
  env.DB.prepare('DELETE FROM users WHERE id=?').bind(source)
 ]);
 return Response.json({ok:true,merged:true},{headers:{'Cache-Control':'no-store'}});
}
