// Pure helpers shared by the extraction engine and library presentation.
export function instagramContent(value: string) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    if (!['instagram.com', 'www.instagram.com', 'm.instagram.com'].includes(url.hostname)) return null;
    const match = url.pathname.match(/^\/(?:[\w.]+\/)?(reel|reels|p|tv)\/([\w-]+)\/?$/);
    if (!match) return null;
    const kind = match[1] === 'reels' ? 'reel' : match[1];
    return { url: `https://www.instagram.com/${kind}/${match[2]}/`, title: kind === 'reel' ? '인스타그램 릴스' : kind === 'tv' ? '인스타그램 영상' : '인스타그램 게시물' };
  } catch { return null; }
}

export function instagramTitle(value: string, title?: string) {
  const content = instagramContent(value);
  if (!content) return title;
  const text = title?.trim() || '';
  return !text || /^(?:(?:www\.|m\.)?instagram\.com\/?|instagram|인스타그램|login\s*[•|–-]?\s*instagram|로그인\s*[•|–-]?\s*instagram)$/i.test(text)
    || /^(?:page not found|content not available|sorry, this page|페이지를 사용할 수|페이지를 찾을 수|just a moment|access denied)/i.test(text)
    ? content.title : text;
}
