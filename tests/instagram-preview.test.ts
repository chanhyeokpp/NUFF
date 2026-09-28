import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instagramContent, instagramTitle } from '../lib/instagram-preview';
import { analyzeContent, extract } from '../lib/pipeline';

test('Instagram fetch URLs drop share tracking but accept author paths; unrelated hosts remain untouched', () => {
  assert.equal(instagramContent('https://www.instagram.com/creator/reel/ABC_123/?stkn=tracking')?.url, 'https://www.instagram.com/reel/ABC_123/');
  assert.equal(instagramContent('https://instagram.com/p/ABC/')?.title, '인스타그램 게시물');
  for (const url of ['https://instagram.com.evil.test/reel/ABC/', 'https://instagram.com@evil.test/reel/ABC/', 'https://instagram.com/profile/', 'https://instagram.com:8080/p/ABC/']) assert.equal(instagramContent(url), null);
  assert.equal(instagramTitle('https://instagram.com/reel/ABC/', 'www.instagram.com'), '인스타그램 릴스');
  assert.equal(instagramTitle('https://instagram.com/reel/ABC/', '실제 제목'), '실제 제목');
});

test('oversized single HTML chunk keeps head metadata, decodes captions, and never calls AI for Instagram', async () => {
  const original = globalThis.fetch;
  const shared = 'https://www.instagram.com/reel/ABC/?stkn=tracking';
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === 'cloudflare-dns.com') return Response.json({ Answer: [{ type: 1, data: '157.240.1.1' }] });
    assert.equal(url.href, 'https://www.instagram.com/reel/ABC/');
    return new Response('<head><meta property="og:title" content="야구 &#x26be; 훈련"><meta property="og:description" content="짧은 설명"><meta property="og:image" content="https://cdn.example.com/cover.jpg?a=1&amp;b=2"></head>' + 'x'.repeat(800000), { headers: { 'Content-Type': 'text/html' } });
  };
  try {
    const item = await analyzeContent(shared, undefined, { OPENAI_API_KEY: 'must-not-be-used', GEMINI_API_KEY: 'must-not-be-used' }, () => {});
    assert.equal(item.url, shared);
    assert.equal(item.title, '야구 ⚾ 훈련');
    assert.equal(item.thumbnail, 'https://cdn.example.com/cover.jpg?a=1&b=2');
    assert.equal(item.summary, '짧은 설명');
    assert.equal(item.mode, 'unread');
  } finally { globalThis.fetch = original; }
});

test('blocked, login, missing and unsafe images do not become misleading preview cards', async () => {
  const original = globalThis.fetch;
  try {
    for (const html of [null, '<title>Login • Instagram</title><meta property="og:description" content="Sign up"><meta property="og:image" content="https://cdn.example.com/logo.jpg">', '<title>릴스 제목</title>', '<title>릴스 제목</title><meta property="og:image" content="http://127.0.0.1/secret">']) {
      globalThis.fetch = async input => String(input).includes('cloudflare-dns.com')
        ? Response.json({ Answer: [{ type: 1, data: '157.240.1.1' }] })
        : new Response(html, { status: html === null ? 403 : 200, headers: { 'Content-Type': 'text/html' } });
      const result = await extract('https://instagram.com/reel/ABC/');
      assert.equal(result.thumbnail, undefined);
      assert.equal(result.readable, false);
      if (!html || html.includes('Login')) { assert.equal(result.title, '인스타그램 릴스'); assert.equal(result.description, ''); }
    }
  } finally { globalThis.fetch = original; }
});
