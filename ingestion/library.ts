import { instagramTitle } from '../lib/instagram-preview';
import type { Item } from '../lib/domain';
import { authenticateDevice } from './auth';
import type { IngressEnv } from './kakao';

type LibraryRow = {
  id: string;
  url: string;
  source: string;
  status: string;
  last_error: string | null;
  created_at: string;
  data: string | null;
  viewed: number | null;
};

function platform(url: string) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  if (host === 'youtu.be' || host.endsWith('youtube.com')) return 'YouTube';
  if (host.endsWith('instagram.com')) return 'Instagram';
  return '웹사이트';
}

function pendingItem(row: LibraryRow): Item {
  const failures: Record<string, string> = {
    gemini_video_failed: '영상 분석 API가 응답하지 않았어요. 다시 시도해주세요.',
    gemini_video_unavailable: '이 영상은 공개 상태나 접근 제한 때문에 분석할 수 없어요.',
    gemini_rate_limited: 'Gemini 무료 사용량 한도에 도달했어요. 잠시 후 다시 시도해주세요.',
    gemini_auth_failed: 'Gemini API 연결 설정을 확인해야 해요.',
    youtube_metadata_failed: '유튜브 영상 정보를 가져오지 못했어요.',
    openai_failed: 'AI가 웹 콘텐츠를 정리하지 못했어요. 다시 시도해주세요.',
    timeout: '콘텐츠를 읽는 시간이 너무 오래 걸렸어요.',
    analysis_failed: '분석에 실패했지만 원본 링크는 보관했어요.',
  };
  const messages: Record<string, string> = {
    queued: '정리를 기다리고 있어요.',
    processing: '내용을 읽고 정리하고 있어요.',
    retry: '잠시 후 다시 정리할게요.',
    failed: failures[row.last_error || 'analysis_failed'],
    needs_content: '원본은 저장했어요. 본문 확인이 필요해요.',
  };
  return {
    id: row.id,
    url: row.url,
    title: instagramTitle(row.url, new URL(row.url).hostname.replace(/^www\./, ''))!,
    summary: messages[row.status] || '원본 링크를 보관했어요.',
    claims: [],
    keywords: [],
    topic: '기타',
    platform: platform(row.url),
    createdAt: row.created_at,
    mode: 'unread',
    viewed: false,
  };
}

export async function deviceLibrary(request: Request, env: IngressEnv) {
  const owner = await authenticateDevice(request, env);
  if (!owner) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const rows = await env.DB.prepare(
    `SELECT j.id,j.url,j.source,j.status,j.last_error,j.created_at,c.data,c.viewed
     FROM capture_jobs j
     LEFT JOIN contents c ON c.owner=j.owner AND c.url=j.url
     WHERE j.owner=? ORDER BY j.created_at DESC LIMIT 200`,
  ).bind(owner).all<LibraryRow>();
  const items = rows.results.map(row => {
    if (!row.data) return { ...pendingItem(row), status: row.status, source: row.source };
    try {
      const item=JSON.parse(row.data) as Item;
      return { ...item, title:instagramTitle(row.url,item.title)||item.title, viewed: !!row.viewed, status: row.status, source: row.source };
    } catch {
      return { ...pendingItem(row), status: row.status, source: row.source };
    }
  });
  return Response.json({ ok: true, items }, { headers: { 'Cache-Control': 'no-store' } });
}
