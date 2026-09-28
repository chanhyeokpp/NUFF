import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { captureMessages, initialLive, librarySync, type CaptureItem, type LiveSnapshot } from '../app/space/live-library';
const item:CaptureItem={id:'job-1',url:'https://example.com/a',title:'example.com',summary:'정리 대기',keywords:[],claims:[],topic:'기타',platform:'웹사이트',createdAt:'2026-09-26T00:00:00Z',mode:'unread',viewed:false,status:'queued',source:'kakao'};
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});

test('pending to analyzed keeps message identity and original observed save time',()=>{
  const first=captureMessages([item],'owner-a');
  const next=captureMessages([{...item,id:'content-99',title:'Actual title',status:'ready',createdAt:'2026-09-26T00:04:00Z'}],'owner-a',first);
  assert.equal(next[0].id,first[0].id);assert.equal(next[0].createdAt,first[0].createdAt);
  assert.equal(next[0].link?.title,'Actual title');assert.equal(next[0].source,'카카오톡으로 보냄');
  assert.notEqual(captureMessages([item],'other')[0].id,first[0].id);
});
test('polling replaces snapshots without duplicating and updates analysis',async()=>{
  let count=0;let state=initialLive;const all:LiveSnapshot[]=[];
  const client=librarySync({readToken:()=> 'test-token',publish:s=>{state=s;all.push(s);},fetcher:async url=>String(url).endsWith('/auth/me')?response({user:{id:'a',email:'a@example.test'}}):response({items:[{...item,status:count++?'ready':'queued'}]})});
  await client.refresh();assert.equal(state.messages[0].status,'queued');
  await client.refresh();assert.equal(state.messages.length,1);assert.equal(state.messages[0].status,'ready');
  const messages=state.messages;await client.refresh();assert.equal(state.messages,messages);client.dispose();
});
test('logout clears data and a late response cannot restore the previous account',async()=>{
  let token:string|null='a';let state=initialLive;
  let release!:(response:Response)=>void;
  const client=librarySync({readToken:()=>token,publish:s=>{state=s;},fetcher:async url=>String(url).endsWith('/auth/me')?response({user:{id:'a',email:null}}):new Promise(resolve=>{release=resolve;})});
  const pending=client.refresh();await new Promise(resolve=>setTimeout(resolve,0));
  token=null;await client.refresh();assert.equal(state.state,'signed-out');
  release(response({items:[item]}));await pending;assert.equal(state.messages.length,0);assert.equal(state.state,'signed-out');client.dispose();
});
test('an account switch ignores old in-flight payloads',async()=>{
  let token='a';let state=initialLive;let release!:(response:Response)=>void;
  const client=librarySync({readToken:()=>token,publish:s=>{state=s;},fetcher:async (url,init)=>{
    const current=new Headers(init?.headers).get('authorization')==='Bearer a'?'a':'b';
    if(String(url).endsWith('/auth/me'))return response({user:{id:current,email:null}});
    return current==='a'?new Promise(resolve=>{release=resolve;}):response({items:[{...item,url:'https://example.com/b'}]});
  }});
  const pending=client.refresh();await new Promise(resolve=>setTimeout(resolve,0));token='b';await client.refresh();
  release(response({items:[item]}));await pending;assert.equal(state.messages[0].ownerId,'b');assert.equal(state.messages[0].content,'https://example.com/b');client.dispose();
});
test('network failures preserve last good messages, recovery refreshes, 401 clears',async()=>{
  let mode='ok';let state=initialLive;
  const client=librarySync({readToken:()=> 'token',publish:s=>{state=s;},fetcher:async url=>{
    if(String(url).endsWith('/auth/me'))return response({user:{id:'a',email:null}});
    if(mode==='offline')throw new Error('offline');
    return mode==='expired'?response({},401):response({items:[item]});
  }});
  await client.refresh();mode='offline';await client.refresh();assert.equal(state.state,'offline');assert.equal(state.messages.length,1);
  mode='ok';await client.refresh();assert.equal(state.state,'live');mode='expired';await client.refresh();assert.equal(state.state,'signed-out');assert.equal(state.messages.length,0);client.dispose();
});
test('no token sends no requests; overlapping refreshes share an in-flight request',async()=>{
  let token:string|null=null,calls=0,release!:(response:Response)=>void;
  const client=librarySync({readToken:()=>token,publish:()=>{},fetcher:async url=>{calls++;return String(url).endsWith('/auth/me')?new Promise(resolve=>{release=resolve;}):response({items:[]});}});
  await client.refresh();assert.equal(calls,0);token='a';const pending=client.refresh();await client.refresh();assert.equal(calls,1);
  release(response({user:{id:'a',email:null}}));await pending;assert.equal(calls,2);client.dispose();
});
test('a newly received capture appears on the next poll without another login',async()=>{
  let items=[item],state=initialLive,accountCalls=0;
  const client=librarySync({readToken:()=> 'test-token',publish:s=>{state=s;},fetcher:async url=>{
    if(String(url).endsWith('/auth/me')){accountCalls++;return response({user:{id:'a',email:null}});}
    return response({items});
  }});
  await client.refresh();assert.equal(state.messages.length,1);
  items=[...items,{...item,id:'second-job',url:'https://example.com/new',createdAt:'2026-09-26T01:00:00Z',source:'ios_shortcut'}];
  await client.refresh();assert.equal(state.messages.length,2);assert.equal(state.messages[1].content,'https://example.com/new');assert.equal(accountCalls,1);client.dispose();
});
