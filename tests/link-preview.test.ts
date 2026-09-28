import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fetchVideoPreview, previewVideoId } from '../lib/link-preview';
import { captureMessages, type CaptureItem } from '../app/space/live-library';

test('video IDs accept supported forms and reject arbitrary hosts or schemes',()=>{
  for(const url of ['https://youtu.be/dQw4w9WgXcQ?si=test','https://www.youtube.com/watch?v=dQw4w9WgXcQ','https://m.youtube.com/shorts/dQw4w9WgXcQ'])assert.equal(previewVideoId(url),'dQw4w9WgXcQ');
  for(const url of ['https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ','https://youtube.com@localhost/watch?v=dQw4w9WgXcQ','ftp://youtube.com/watch?v=dQw4w9WgXcQ','https://youtube.com:8080/watch?v=dQw4w9WgXcQ','not a URL'])assert.equal(previewVideoId(url),null);
});
test('preview fetch is fixed-destination, manual-redirect and does not return embedded HTML',async()=>{
  const result=await fetchVideoPreview('dQw4w9WgXcQ',async(input,init)=>{
    assert.equal(new URL(String(input)).origin,'https://www.youtube.com');
    assert.equal(init?.redirect,'manual');
    return Response.json({title:'Video title',author_name:'Creator',html:'<script>unsafe</script>',thumbnail_url:'https://untrusted.test/image'});
  });
  assert.deepEqual(result,{title:'Video title',author:'Creator',thumbnail:'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg'});
  let calls=0;assert.equal(await fetchVideoPreview('invalid',async()=>{calls++;return Response.json({});}),null);assert.equal(calls,0);
});
test('unavailable previews degrade without making analysis requests',async()=>{
  for(const status of [302,404,429,500])assert.equal(await fetchVideoPreview('dQw4w9WgXcQ',async()=>new Response(null,{status})),null);
  assert.equal(await fetchVideoPreview('dQw4w9WgXcQ',async()=>{throw new Error('offline');}),null);
  assert.equal(await fetchVideoPreview('dQw4w9WgXcQ',async()=>Response.json({title:null})),null);
});
test('analysis failures and summaries stay separate from link preview metadata',()=>{
  const item:CaptureItem={id:'one',url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ',title:'youtube.com',summary:'영상 분석 API가 응답하지 않았어요.',keywords:[],claims:[],topic:'기타',platform:'YouTube',createdAt:'2026-09-26T00:00:00Z',mode:'unread',viewed:false,status:'failed'};
  const [failed]=captureMessages([item],'test-owner');
  assert.equal(failed.link?.summary,'');assert.equal(failed.link?.title,'유튜브 영상');assert.ok(failed.link?.thumbnail);assert.equal(failed.analysis?.summary,item.summary);
  const [ready]=captureMessages([{...item,status:'ready',summary:'AI가 만든 요약',mode:'ai',claims:['핵심 내용']}],'test-owner',[failed]);
  assert.equal(ready.link?.summary,'');assert.equal(ready.analysis?.summary,'AI가 만든 요약');assert.deepEqual(ready.analysis?.claims,['핵심 내용']);assert.equal(ready.id,failed.id);
});
