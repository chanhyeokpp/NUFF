import { instagramContent, instagramTitle } from '@/lib/instagram-preview';
import type { Item } from '@/lib/domain';
import type { Message } from './message-model';
import { previewVideoId, videoThumbnail } from '@/lib/link-preview';

export const INGRESS_URL='https://nuff-kakao-ingress.cksrowldms9-475.workers.dev';
export const TOKEN_KEY='nuffDeviceToken';
export type CaptureItem=Item&{status?:string;source?:string};
export type LiveSnapshot={state:'loading'|'live'|'offline'|'signed-out';messages:Message[];email:string|null;error:string;checkedAt:number|null};
export const initialLive:LiveSnapshot={state:'loading',messages:[],email:null,error:'',checkedAt:null};

export function captureMessages(items:CaptureItem[],owner:string,previous:Message[]=[]):Message[]{
  const unique=new Map<string,Message>();
  const known=new Map(previous.map(message=>[message.id,message]));
  for(const item of items){
    if(!item||typeof item.url!=='string'||!Number.isFinite(Date.parse(item.createdAt)))continue;
    let url:URL;try{url=new URL(item.url);}catch{continue;}
    if(!['https:','http:'].includes(url.protocol))continue;
    // capture_jobs and analyzed contents have different IDs. The owner+URL key
    // stays stable when a queued capture receives its analysis result.
    const id=`capture:${owner}:${item.url}`;
    const videoId=previewVideoId(item.url);
    const instagram=instagramContent(item.url);
    const displayTitle=instagramTitle(item.url,item.title)||item.title;
    unique.set(id,{id,ownerId:owner,content:item.url,createdAt:known.get(id)?.createdAt||item.createdAt,isDeleted:false,isPinned:false,type:'link',readOnly:true,
      source:item.source==='kakao'?'카카오톡으로 보냄':'공유로 보냄',status:item.status,
      link:{url:item.url,title:displayTitle&&!['youtube.com','www.youtube.com','youtu.be','YouTube',url.hostname].includes(displayTitle)?displayTitle:videoId?'유튜브 영상':url.hostname,summary:'',kind:videoId||instagram?.title==='인스타그램 릴스'||instagram?.title==='인스타그램 영상'?'video':'article',example:false,thumbnail:item.thumbnail||(videoId?videoThumbnail(videoId):undefined)},
      analysis:{summary:item.summary||'',claims:item.claims||[],keywords:item.keywords||[],mode:item.mode},
    });
  }
  return [...unique.values()].sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt));
}

// Injectable transport allows lifecycle/race tests without a production token.
export function librarySync({readToken,fetcher=fetch,publish}:{readToken:()=>string|null;fetcher?:typeof fetch;publish:(snapshot:LiveSnapshot)=>void}){
  let snapshot=initialLive,token:string|null|undefined,controller:AbortController|undefined,disposed=false,generation=0,profile:{id:string;email:string|null}|undefined;
  let rejectedToken:string|undefined;
  function emit(next:LiveSnapshot){snapshot=next;if(!disposed)publish(next);}
  async function refresh(){
    if(disposed)return;
    const current=readToken();
    if(current!==token){generation++;controller?.abort();controller=undefined;token=current;profile=undefined;rejectedToken=undefined;emit({...initialLive,state:current?'loading':'signed-out'});}
    if(!current||controller||rejectedToken===current)return;
    const requestGeneration=generation,active=new AbortController();controller=active;
    const timer=setTimeout(()=>active.abort(),10000);
    const valid=()=>!disposed&&generation===requestGeneration&&readToken()===current;
    const options={headers:{Authorization:`Bearer ${current}`},cache:'no-store' as const,signal:active.signal};
    try{
      if(!profile){
        const response=await fetcher(`${INGRESS_URL}/auth/me`,options);
        if(!valid())return;
        if(response.status===401){rejectedToken=current;emit({...initialLive,state:'signed-out',error:'로그인이 만료됐어요. 다시 로그인해주세요.'});return;}
        if(!response.ok)throw new Error('계정을 확인하지 못했어요. 다시 연결할게요.');
        const data=await response.json() as {user?:{id:string;email:string|null}};
        if(!valid())return;
        if(!data.user?.id)throw new Error('계정 응답을 확인하지 못했어요.');
        profile=data.user;
      }
      const response=await fetcher(`${INGRESS_URL}/captures`,options);
      if(!valid())return;
      if(response.status===401){rejectedToken=current;profile=undefined;emit({...initialLive,state:'signed-out',error:'로그인이 만료됐어요. 다시 로그인해주세요.'});return;}
      if(!response.ok)throw new Error('연결이 잠시 끊겼어요. 자동으로 다시 확인할게요.');
      const data=await response.json() as {items?:CaptureItem[]};
      if(!valid())return;
      if(!Array.isArray(data.items))throw new Error('저장 목록을 확인하지 못했어요.');
      const messages=captureMessages(data.items,profile.id,snapshot.messages);
      emit({state:'live',messages:JSON.stringify(messages)===JSON.stringify(snapshot.messages)?snapshot.messages:messages,email:profile.email,error:'',checkedAt:Date.now()});
    }catch(error){if(valid())emit({...snapshot,state:'offline',error:error instanceof Error&&error.name!=='AbortError'?error.message:'응답이 늦어지고 있어요. 자동으로 다시 연결할게요.'});}
    finally{clearTimeout(timer);if(controller===active)controller=undefined;}
  }
  function dispose(){disposed=true;generation++;controller?.abort();}
  return {refresh,dispose};
}
