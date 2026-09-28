// Preview metadata is independent of AI analysis and never contains its output.
export type VideoPreview = { title:string; author:string; thumbnail:string };
export function previewVideoId(value:string):string|null {
  try {
    const url=new URL(value),host=url.hostname.toLowerCase().replace(/^www\./,'');
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port)return null;
    const candidate=host==='youtu.be'?url.pathname.slice(1).split('/')[0]:
      ['youtube.com','m.youtube.com','music.youtube.com'].includes(host)?
        url.pathname==='/watch'?url.searchParams.get('v'):url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)\/?$/)?.[1]:null;
    return candidate&&/^[\w-]{11}$/.test(candidate)?candidate:null;
  } catch {return null;}
}
export const videoThumbnail=(id:string)=>`https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

export async function fetchVideoPreview(id:string,fetcher:typeof fetch=fetch):Promise<VideoPreview|null> {
  if(!/^[\w-]{11}$/.test(id))return null;
  // Only this fixed public destination is fetched; redirects are not followed.
  const endpoint=new URL('https://www.youtube.com/oembed');
  endpoint.searchParams.set('url',`https://www.youtube.com/watch?v=${id}`);
  endpoint.searchParams.set('format','json');
  try {
    const response=await fetcher(endpoint,{redirect:'manual',signal:AbortSignal.timeout(5000)});
    if(!response.ok)return null;
    const data=await response.json() as {title?:unknown;author_name?:unknown};
    if(typeof data.title!=='string'||!data.title.trim())return null;
    return {title:data.title.slice(0,300),author:typeof data.author_name==='string'?data.author_name.slice(0,100):'',thumbnail:videoThumbnail(id)};
  } catch {return null;}
}
