'use client';
import { useState } from 'react';
import Link from 'next/link';
import { INGRESS_URL, TOKEN_KEY } from './live-library';
import s from './preview.module.css';

export function LiveLogin({onLogin,allowSignup=false}:{onLogin:()=>void;allowSignup?:boolean}){
  const [signup,setSignup]=useState(false);
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState(''),[verify,setVerify]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(event:React.FormEvent){
    event.preventDefault();if(busy)return;setBusy(true);setError('');
    try{
      const response=await fetch(`${INGRESS_URL}/auth/${verify?'verify-email':signup?'signup':'login'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(verify?{email,code}:{email,password}),signal:AbortSignal.timeout(15000)});
      const data=await response.json() as {token?:string;message?:string;verificationRequired?:boolean};
      if(data.verificationRequired){setVerify(true);setPassword('');return;}
      if(!response.ok||!data.token)throw new Error(data.message||'로그인하지 못했어요. 다시 확인해주세요.');
      localStorage.setItem(TOKEN_KEY,data.token);setPassword('');setCode('');onLogin();
    }catch(err){setError(err instanceof Error?err.message:'연결하지 못했어요.');}finally{setBusy(false);}
  }
  return <section className={s.loginPanel}><h1>{signup?'내 Nuff 계정 만들기':'내 기록에 연결하기'}</h1><p>앱에서 사용하는 Nuff 계정으로 로그인하면<br/>카톡·공유로 저장한 링크가 여기에 나타나요.</p><form onSubmit={submit}><div className={s.loginIllustration}><label>이메일<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" disabled={busy||verify} required/></label>{verify?<label>이메일 확인 코드<input value={code} onChange={e=>setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={6} required disabled={busy}/></label>:<label>비밀번호<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={signup?"new-password":"current-password"} minLength={signup?10:undefined} maxLength={128} required disabled={busy}/></label>}</div><button className={s.enterButton} disabled={busy}>{busy?'연결 중…':verify?'확인하고 로그인':signup?'계정 만들기':'로그인'}</button>{error&&<p className={s.liveError} role="alert">{error}</p>}</form><small>카카오톡 수신은 같은 계정에 채널이 연결되어 있어야 해요.</small>{allowSignup?<button className={s.authSwitch} disabled={busy} onClick={()=>{setSignup(value=>!value);setVerify(false);setCode('');setError('');setPassword('');}}>{signup?'이미 계정이 있어요 · 로그인':'처음이에요 · 계정 만들기'}</button>:<Link href="/space/settings">계정 만들기 · 연결 관리</Link>}</section>;
}
