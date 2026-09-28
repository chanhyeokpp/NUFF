import type { Message } from './message-model';
import { koreaDay, readableDay } from './message-model';
import { LinkTitle } from './message-link';
import s from './preview.module.css';

const statuses:Record<string,string>={queued:'분석 대기',processing:'분석 중',retry:'재시도 대기',ready:'정리 완료',failed:'분석 실패',needs_content:'원문 확인 필요'};
export function AnalysisView({messages,loading,onOpen}:{messages:Message[];loading:boolean;onOpen:(id:string)=>void}){
  const items=messages.filter(message=>!message.isDeleted&&message.link&&message.analysis).slice().reverse();
  return <section className={s.analysisFeed} aria-label="저장한 콘텐츠 분석">
    <div className={s.analysisInner}>
      <header><h2>저장한 것, 조금 더 깊이.</h2><p>요약과 핵심 내용, 분석 상태를 여기서 확인하세요.</p></header>
      {!items.length&&<div className={s.empty}><h2>{loading?'분석 목록을 불러오고 있어요.':'아직 분석할 기록이 없어요.'}</h2><p>저장한 링크의 분석 결과가 여기에 모여요.</p></div>}
      {items.map(message=>{
        const analysis=message.analysis!,pending=['queued','processing','retry'].includes(message.status||'');
        const failed=message.status==='failed';
        const completed=!failed&&!pending&&['ai','extractive'].includes(analysis.mode);
        const label=failed?'분석 실패':pending?statuses[message.status!]:completed?analysis.mode==='ai'?'AI 요약':'본문 발췌':'원문 확인 필요';
        return <article className={s.analysisItem} key={message.id}>
          <div className={s.analysisMeta}><span data-failed={failed||undefined}>{label}</span><time dateTime={message.createdAt}>{readableDay(koreaDay(message.createdAt),true)}</time></div>
          <h3><LinkTitle link={message.link!}/></h3>
          {pending?<p>링크는 저장됐어요. 분석 결과가 도착하면 자동으로 갱신돼요.</p>:<p>{analysis.summary||'원본 링크에서 내용을 확인해주세요.'}</p>}
          {failed&&<small className={s.analysisSaved}>원본 링크는 정상적으로 보관돼 있어요.</small>}
          {completed&&analysis.claims.length>0&&<ul>{analysis.claims.map((claim,index)=><li key={index}>{claim}</li>)}</ul>}
          {completed&&analysis.keywords.length>0&&<div className={s.analysisTags}>{analysis.keywords.map((keyword,index)=><span key={index}>#{keyword}</span>)}</div>}
          <footer><button onClick={()=>onOpen(message.id)}>보관함에서 보기</button><a href={message.link!.url} target="_blank" rel="noopener noreferrer">원본 열기 ↗</a></footer>
        </article>;
      })}
    </div>
  </section>;
}
