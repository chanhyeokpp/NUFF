import { fetchVideoPreview, type VideoPreview } from '@/lib/link-preview';

const cache=new Map<string,{expires:number;result:Promise<VideoPreview|null>}>();
export async function GET(request:Request) {
  const id=new URL(request.url).searchParams.get('video')||'';
  if(!/^[\w-]{11}$/.test(id))return Response.json({error:'Invalid video ID'},{status:400});
  let entry=cache.get(id);
  if(!entry||entry.expires<Date.now()){
    if(cache.size>=300)cache.delete(cache.keys().next().value!);
    entry={expires:Date.now()+60000,result:fetchVideoPreview(id)};
    cache.set(id,entry);
  }
  const preview=await entry.result;
  return Response.json({preview},{headers:{'Cache-Control':preview?'public, max-age=3600':'public, max-age=60'}});
}
