'use client';

import { useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronRight, FileText, Play, Share2, Bookmark, Search, Link2 } from 'lucide-react';
import styles from './preview.module.css';

const steps = [
  { name: '보내기', title: '발견한 순간, 휙.', description: '마음에 드는 영상이나 글에서 공유 버튼을 누르고 Nuff를 선택하세요.' },
  { name: '정리하기', title: '흩어진 링크가, 한곳에.', description: '원본 링크는 그대로. 읽을 수 있는 내용은 요약과 태그로 정리해요.' },
  { name: '다시 보기', title: '다시 필요한 순간에.', description: '앱에서도 웹에서도, 같은 보관함에서 나의 발견을 꺼내보세요.' },
];

function Wordmark({ small = false }: { small?: boolean }) {
  return <span className={`${styles.wordmark} ${small ? styles.smallMark : ''}`}>nuff<span aria-hidden="true">↗</span></span>;
}

function SendScene() {
  return <div className={styles.sendScene}>
    <svg className={styles.paths} viewBox="0 0 1000 330" preserveAspectRatio="none" aria-hidden="true">
      <path d="M240 70 C410 70 345 165 500 165 M240 165 H500 M240 260 C410 260 345 165 500 165 M500 165 H790" />
      <path className={styles.travelling} d="M240 70 C410 70 345 165 500 165 M240 165 H500 M240 260 C410 260 345 165 500 165 M500 165 H790" />
    </svg>
    <div className={styles.sources}>
      <div><span className={styles.youtube}><Play size={16} fill="currentColor" /></span><p>계속 생각나는 영상<small>YouTube</small></p><ArrowUpRight size={16}/></div>
      <div><span className={styles.article}><FileText size={19}/></span><p>나중에 읽고 싶은 글<small>Article</small></p><ArrowUpRight size={16}/></div>
      <div><span className={styles.link}><Link2 size={19}/></span><p>놓치기 아쉬운 링크<small>Web</small></p><ArrowUpRight size={16}/></div>
    </div>
    <div className={styles.receiver}><div className={styles.appIcon}><Wordmark small/></div><span>공유 → Nuff</span></div>
    <div className={styles.receipt}><span className={styles.receiptIcon}><Check size={19}/></span><strong>내 보관함에 도착했어요.</strong><p>좋은 발견 하나가 더 쌓였네요.</p><div><Bookmark size={14}/><span>나만의 Nuff</span><span>방금</span></div></div>
  </div>;
}

function OrganizeScene() {
  return <div className={styles.organizeScene}>
    <div className={styles.originalCard}><div className={styles.poster}><span>SMALL<br/>MOMENTS,<br/><em>big ideas.</em></span><Play size={25}/></div><div className={styles.originalText}><small>YOUTUBE · 저장한 링크</small><strong>일상의 발견을 기록하는 방법</strong><p>원본과 함께 보관해요.</p></div></div>
    <div className={styles.organizeArrow}><ArrowRight size={24}/><span>핵심만 차곡차곡</span></div>
    <div className={styles.summaryCard}><div className={styles.summaryLabel}><span/><span>나를 위한 짧은 정리</span><Bookmark size={16}/></div><h3>작게 기록하고,<br/>자주 꺼내보기.</h3><p>인상적인 순간을 짧게 남기고, 다시 읽으며<br className={styles.desktopBreak}/> 내 생각을 더해보세요.</p><div className={styles.tagList}><span>기록 습관</span><span>아이디어</span><span>일상</span></div><div className={styles.sourceFoot}><Link2 size={13}/> 원본 링크도 함께 있어요.</div></div>
  </div>;
}

function LibraryScene() {
  return <div className={styles.libraryScene}>
    <div className={styles.miniSidebar}><Wordmark small/><span className={styles.miniSelected}><Bookmark size={15}/> 나의 보관함</span><span><Link2 size={15}/> 모든 링크</span><div>MY INTERESTS</div><span><i/>기록과 아이디어</span><span><i/>조금 더 나은 일상</span></div>
    <div className={styles.miniLibrary}><div className={styles.miniHeading}><div><small>MY LITTLE COLLECTION</small><h3>나의 발견들</h3></div><Search size={19}/></div><div className={styles.libraryCards}><article><div className={`${styles.thumbnail} ${styles.thumbOne}`}><span>Make room<br/>for <em>ideas.</em></span></div><small>글 · 기록과 아이디어</small><h4>아이디어를 위한 작은 여백</h4><p>분주한 일상에 생각할 틈 만들기</p></article><article><div className={`${styles.thumbnail} ${styles.thumbTwo}`}><span>하루를<br/>한 줄로.</span><span className={styles.playBadge}><Play size={12} fill="currentColor"/></span></div><small>영상 · 기록과 아이디어</small><h4>일상의 발견을 기록하는 방법</h4><p>작게 기록하고, 자주 꺼내보기</p></article><article><div className={`${styles.thumbnail} ${styles.thumbThree}`}><span>slow<br/><em>morning</em></span></div><small>글 · 조금 더 나은 일상</small><h4>나만의 속도로 시작하는 아침</h4><p>내게 맞는 작은 습관 찾기</p></article></div></div>
  </div>;
}

export default function Landing() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  return <div className={styles.landing}>
    <header className={styles.header}><a href="/landing" aria-label="Nuff 랜딩 홈"><Wordmark/></a><nav aria-label="주요 메뉴"><a href="#how-it-works">사용 방법</a><a className={styles.navCta} href="/space">내 보관함 <ArrowUpRight size={15}/></a></nav></header>
    <main className={styles.main}>
      <section className={styles.hero} aria-labelledby="landing-title">
        <div className={styles.heroGlow} aria-hidden="true"/>
        <p className={styles.eyebrow}><span/> A LITTLE SPACE FOR YOUR CURIOSITY</p>
        <h1 id="landing-title">좋은 발견을,<br/>가볍게 <span className={styles.flick}>휙.<svg viewBox="0 0 190 24" aria-hidden="true"><path d="M6 18Q74 0 171 10M150 3l26 7-21 10"/></svg></span></h1>
        <p className={styles.heroCopy}>스크롤하다 만난, 그냥 지나치기 아쉬운 것들.<br/>Nuff에 보내두고, 나의 공간에서 다시 만나요.</p>
        <a className={styles.heroCta} href="/space">나의 Nuff 시작하기 <ArrowUpRight size={19}/></a>
        <a className={styles.heroSubLink} href="#how-it-works">어떻게 쓰는지 볼까요? <ArrowDown size={13}/></a>
        <div className={styles.heroBottom}><span>SAVE A LITTLE. KEEP WHAT MATTERS.</span><span>발견에서, 나의 것으로 <span aria-hidden="true">↘</span></span></div>
      </section>
      <section className={styles.features} id="how-it-works" aria-labelledby="features-title">
        <div className={styles.featureGlow} aria-hidden="true"/>
        <div className={styles.featureIntro}><div><p className={styles.sectionIndex}>01 — THE NUFF WAY</p><h2 id="features-title">저장은 가볍게.<br/><span>다시 볼 땐, 간편하게.</span></h2></div><p>좋은 정보를 찾은 다음은,<br/>Nuff에 맡겨두세요.</p></div>
        <div className={styles.showcase}>
          <div className={styles.showcaseTop}><div className={styles.tabs} role="tablist" aria-label="Nuff 사용 단계">{steps.map((step, index) => <button key={step.name} ref={el=>{tabs.current[index]=el}} id={`step-tab-${index}`} role="tab" aria-selected={active === index} aria-controls={`step-panel-${index}`} tabIndex={active === index ? 0 : -1} onClick={()=>setActive(index)} onKeyDown={event=>{let next:number|undefined;if(event.key==='ArrowRight')next=(index+1)%steps.length;if(event.key==='ArrowLeft')next=(index+steps.length-1)%steps.length;if(event.key==='Home')next=0;if(event.key==='End')next=steps.length-1;if(next!==undefined){event.preventDefault();setActive(next);tabs.current[next]?.focus();}}}><span>0{index+1}</span>{step.name}</button>)}</div><span className={styles.demoLabel}>사용 흐름 예시</span></div>
          <div role="tabpanel" id={`step-panel-${active}`} aria-labelledby={`step-tab-${active}`} tabIndex={0} className={styles.panel} key={active}>{active === 0 ? <SendScene/> : active === 1 ? <OrganizeScene/> : <LibraryScene/>}</div>
          <div className={styles.showcaseBottom}><div><h3>{steps[active].title}</h3><p>{steps[active].description}</p></div><span className={styles.stepCount}>0{active+1}<span> / 03</span></span></div>
        </div>
        <div className={styles.featureNote}><span><Share2 size={14}/> 공유 버튼에서 시작되는 나만의 보관함</span><a href="/space">직접 둘러보기 <ChevronRight size={15}/></a></div>
      </section>
    </main>
    <footer className={styles.footer}><Wordmark/><p>좋은 발견이, 나에게 남도록.</p><span>LANDING DESIGN — CONCEPT 01</span></footer>
  </div>;
}
