'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Mail, MessageCircle, Smartphone, LogOut } from 'lucide-react';
import { INGRESS_URL, TOKEN_KEY } from '../live-library';
import { LiveLogin } from '../live-login';
import s from '../preview.module.css';

type Profile={user:{id:string;email:string|null};providers:string[]};
export default function AccountSettings(){
  const [profile,setProfile]=useState<Profile|null>(null);
  const [state,setState]=useState<'loading'|'ready'|'signed-out'|'error'>('loading');
  const [revision,setRevision]=useState(0);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const [code,setCode]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState('');
  const alive=useRef(true),mutationBusy=useRef(false);
  const profileToken=useRef<string|null>(null);
  function refresh(){setProfile(null);setState('loading');setRevision(value=>value+1);}
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{
    const changed=(event:StorageEvent)=>{if(event.key===TOKEN_KEY||event.key===null){setCode('');setEmail('');setPassword('');setError('');setNotice('');refresh();}};
    window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed);
  },[]);
  useEffect(()=>{
    const token=localStorage.getItem(TOKEN_KEY),controller=new AbortController();
    profileToken.current=token;
    let active=true;
    const current=()=>active&&!controller.signal.aborted&&localStorage.getItem(TOKEN_KEY)===token;
    const timer=setTimeout(()=>controller.abort(),10000);
    void (async()=>{
      if(!token){clearTimeout(timer);setProfile(null);setState('signed-out');return;}
      try{
        const response=await fetch(`${INGRESS_URL}/auth/me`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal});
        if(!current())return;
        if(response.status===401){localStorage.removeItem(TOKEN_KEY);setProfile(null);setState('signed-out');return;}
        if(!response.ok)throw new Error('계정 정보를 불러오지 못했어요. 다시 확인해주세요.');
        const data=await response.json() as Profile;
        if(!current())return;
        if(!data.user?.id||!Array.isArray(data.providers))throw new Error('계정 정보를 확인하지 못했어요.');
        setProfile(data);setState('ready');
      }catch(err){if(active&&alive.current&&localStorage.getItem(TOKEN_KEY)===token){setError(err instanceof Error&&err.name!=='AbortError'?err.message:'연결이 늦어지고 있어요. 다시 확인해주세요.');setState('error');}}
      finally{clearTimeout(timer);}
    })();
    return()=>{active=false;clearTimeout(timer);controller.abort();};
  },[revision]);

  async function submit(event:React.FormEvent,kind:'link-kakao'|'add-email'){
    event.preventDefault();if(mutationBusy.current||state!=='ready')return;
    const token=localStorage.getItem(TOKEN_KEY);
    if(!token||token!==profileToken.current){refresh();return;}
    mutationBusy.current=true;setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch(`${INGRESS_URL}/auth/${kind}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(kind==='link-kakao'?{code:code.trim().toUpperCase()}:{email,password}),signal:AbortSignal.timeout(15000)});
      const data=await response.json() as {message?:string};
      if(!alive.current||localStorage.getItem(TOKEN_KEY)!==token)return;
      if(!response.ok)throw new Error(data.message||'처리하지 못했어요. 입력 내용을 확인해주세요.');
      setCode('');setPassword('');setNotice(kind==='link-kakao'?'카카오톡이 내 보관함에 연결됐어요.':'기존 보관함에 이메일 로그인을 추가했어요.');refresh();
    }catch(err){if(alive.current&&localStorage.getItem(TOKEN_KEY)===token)setError(err instanceof Error?err.message:'연결하지 못했어요.');}
    finally{mutationBusy.current=false;if(alive.current)setBusy(false);}
  }
  function logout(){localStorage.removeItem(TOKEN_KEY);setCode('');setEmail('');setPassword('');setError('');setNotice('');refresh();}
  const kakao=profile?.providers.includes('kakao');

  return <div className={s.preview} data-design="neon">
    <div className={s.previewBar}><Link href="/space"><ArrowLeft size={12}/>보관함</Link><span>내 Nuff 설정</span><Link href="/landing">랜딩</Link></div>
    <div className={s.app}><main className={s.workspace}>
      <header className={s.workspaceHeader}><div className={s.spaceTitle}><span>nuff<span>↗</span></span><h1>계정 · 채널 관리</h1></div><Link className={s.settingsBack} href="/space" aria-label="보관함으로 돌아가기"><ArrowLeft size={16}/><span>돌아가기</span></Link></header>
      <div className={s.settingsScroll}>
        {state==='loading'?<div className={s.empty} role="status"><h2>계정 정보를 확인하고 있어요.</h2></div>:
        state==='signed-out'?<div className={s.settingsLogin}><LiveLogin allowSignup onLogin={()=>{setError('');refresh();}}/></div>:
        state==='error'?<div className={s.empty}><p role="alert">{error}</p><button onClick={()=>{setError('');refresh();}}>다시 확인</button></div>:
        <div className={s.settingsInner}>
          <header className={s.settingsIntro}><small>YOUR SPACE, CONNECTED</small><h2>내 기록이 모이는 곳.</h2><p>하나의 Nuff 계정으로, 편한 곳에서 보내세요.</p></header>
          <section className={s.settingsSection} aria-labelledby="account-heading"><div className={s.settingsSectionTitle}><Mail size={18}/><h3 id="account-heading">내 계정</h3><span>로그인됨</span></div><p className={s.accountEmail}>{profile?.user.email||'이메일을 연결하지 않은 계정'}</p>
            <p>앱과 웹에서 같은 계정을 사용하면 저장한 기록이 이어져요.</p>
            {!profile?.user.email&&<details className={s.settingsDetails}><summary>이메일 로그인 추가</summary><form className={s.settingsForm} onSubmit={event=>void submit(event,'add-email')}><label>이메일<input type="email" autoComplete="email" required value={email} onChange={event=>setEmail(event.target.value)} disabled={busy}/></label><label>새 비밀번호<input type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={password} onChange={event=>setPassword(event.target.value)} disabled={busy}/></label><button disabled={busy} className={s.settingsPrimary}>{busy?'추가 중…':'이메일 추가'}</button></form></details>}
          </section>
          <section className={s.settingsSection} aria-labelledby="channels-heading"><div className={s.settingsSectionTitle}><MessageCircle size={18}/><h3 id="channels-heading">수집 채널</h3><span>선택 연결</span></div>
            <div className={s.channelRow}><div className={s.channelIcon}><MessageCircle size={21}/></div><div><h4>카카오톡</h4><p>Nuff 채널로 보내는 링크를 이 보관함에 모아요.</p></div><span className={kakao?s.connectedBadge:s.disconnectedBadge}>{kakao?<><Check size={12}/>연결됨</>:'미연결'}</span></div>
            {kakao?<p className={s.channelHelp}>이미 연결되어 있어요. 카톡 Nuff 채널에 링크를 보내면 돼요.</p>:<details className={s.settingsDetails}><summary>카카오톡 연결하기</summary><p>Nuff 채널에 <strong>앱 연결</strong>을 보내고 받은 8자리 코드를 입력하세요. 기존 카카오 저장 기록도 이 계정으로 합쳐져요.</p><form className={s.settingsForm} onSubmit={event=>void submit(event,'link-kakao')}><label>연결 코드<input value={code} onChange={event=>setCode(event.target.value.toUpperCase())} autoComplete="one-time-code" autoCapitalize="characters" minLength={8} maxLength={8} required placeholder="8자리 코드" disabled={busy}/></label><button className={s.settingsPrimary} disabled={busy||code.trim().length!==8}>{busy?'연결 중…':'내 계정에 연결'}</button></form></details>}
            <div className={s.channelRow}><div className={s.channelIcon}><Smartphone size={21}/></div><div><h4>아이폰 공유</h4><p>Nuff 앱에서 같은 계정으로 로그인한 뒤 공유 메뉴를 사용하세요.</p></div></div>
            <p className={s.channelHelp}>DM·디스코드는 준비 중이에요.</p>
          </section>
          {error&&<p className={s.liveError} role="alert">{error}</p>}{notice&&<p className={s.settingsNotice} role="status">{notice}</p>}
          <footer className={s.settingsFooter}><Link href="/space">보관함으로 돌아가기 ↗</Link><button onClick={logout} disabled={busy}><LogOut size={14}/>로그아웃</button></footer>
        </div>}
      </div>
    </main></div>
  </div>;
}
