import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { attachmentKind, demoMessages, koreaDay, makeMessage, matchesSearch, messageReducer, resolveReply, shouldSend } from '../app/space/message-model';

const at='2026-09-26T12:00:00Z';
test('reply preserves identity across parent edits, deletion and restoration',()=>{
  const parent=makeMessage('original',at,'parent');
  const reply=makeMessage('follow up',at,'reply','parent');
  let state=messageReducer([parent],{type:'create',message:reply});
  state=messageReducer(state,{type:'edit',id:'parent',content:'edited',at:'2026-09-26T13:00:00Z'});
  assert.equal(resolveReply(state,reply)?.content,'edited');
  assert.equal(state[0].createdAt,at);
  state=messageReducer(state,{type:'delete',id:'parent',at});
  assert.equal(resolveReply(state,reply)?.isDeleted,true);
  assert.equal(matchesSearch(state[0],'edited'),false);
  assert.equal(state[1].replyToId,'parent');
  state=messageReducer(state,{type:'restore',id:'parent',at});
  assert.equal(resolveReply(state,reply)?.content,'edited');
  assert.equal(state[0].deletedAt,undefined);
});
test('rejects duplicate sends and replies to missing/deleted or other-owner parents',()=>{
  const parent=makeMessage('hi',at,'parent');
  assert.equal(messageReducer([parent],{type:'create',message:parent}).length,1);
  for(const state of [[],[{...parent,isDeleted:true}],[{...parent,ownerId:'different'}]]){
    assert.equal(messageReducer(state,{type:'create',message:makeMessage('reply',at,'reply','parent')}),state);
  }
});
test('soft deletion protects content from edits, preserves pin, and restores once',()=>{
  let state=messageReducer([makeMessage('keep me',at,'a')],{type:'pin',id:'a'});
  state=messageReducer(state,{type:'delete',id:'a',at});
  state=messageReducer(state,{type:'edit',id:'a',content:'bad update',at});
  assert.equal(state[0].content,'keep me');
  state=messageReducer(state,{type:'restore',id:'a',at});
  state=messageReducer(state,{type:'restore',id:'a',at});
  assert.equal(state.length,1);assert.equal(state[0].isPinned,true);
});
test('editing imported notes preserves source, direct URL edits replace preview',()=>{
  const imported=demoMessages().find(message=>message.id==='b')!;
  const changed=messageReducer([imported],{type:'edit',id:'b',content:'new comment',at});
  assert.deepEqual(changed[0].link,imported.link);
  const direct=makeMessage('https://example.com',at,'direct');
  const next=messageReducer([direct],{type:'edit',id:'direct',content:'plain text',at});
  assert.equal(next[0].type,'text');assert.equal(next[0].link,undefined);
});
test('Enter sends, but ShiftEnter and Korean IME confirmation never send',()=>{
  const enter={key:'Enter',shiftKey:false,isComposing:false};
  assert.equal(shouldSend(enter),true);
  assert.equal(shouldSend({...enter,shiftKey:true}),false);
  assert.equal(shouldSend({...enter,isComposing:true}),false);
  assert.equal(shouldSend({...enter,keyCode:229}),false);
  assert.equal(shouldSend({...enter,key:'a'}),false);
});
test('Seoul midnight groups consistently, and search spans dates and URLs',()=>{
  assert.equal(koreaDay('2026-09-25T14:59:00Z'),'2026-09-25');
  assert.equal(koreaDay('2026-09-25T15:00:00Z'),'2026-09-26');
  assert.equal(demoMessages().filter(message=>matchesSearch(message,'youtube')).length,1);
  assert.equal(demoMessages().filter(message=>matchesSearch(message,'오래된')).length,1);
});
test('attachment-only messages can be sent, searched by file name, and restored',()=>{
  const attachment={name:'project-plan.pdf',mime:'application/pdf',size:2300,url:'blob:local-preview',kind:'file' as const};
  const message=makeMessage('',at,'file',undefined,attachment);
  let state=messageReducer([],{type:'create',message});
  assert.equal(state.length,1);assert.equal(state[0].type,'file');assert.equal(matchesSearch(state[0],'project-plan'),true);
  state=messageReducer(state,{type:'delete',id:'file',at});state=messageReducer(state,{type:'restore',id:'file',at});
  assert.deepEqual(state[0].attachment,attachment);
  assert.equal(attachmentKind('image/png'),'image');
  assert.equal(attachmentKind('image/svg+xml'),'file');
});
