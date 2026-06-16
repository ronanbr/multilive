// Utilitários compartilhados pelas funções serverless.

const UC_RE = /^UC[\w-]{22}$/;
const VID_RE = /^[\w-]{11}$/;

// Extrai o videoId de uma URL de vídeo do YouTube.
// Aceita: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/live/ID.
// Retorna null se não for uma URL de vídeo reconhecida.
export function extractVideoId(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  try {
    const u = new URL(s.startsWith('http') ? s : 'https://' + s);
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0];
      return VID_RE.test(id) ? id : null;
    }
    if (/youtube\.com$/.test(u.hostname)) {
      const v = u.searchParams.get('v');
      if (v && VID_RE.test(v)) return v;
      const m = u.pathname.match(/^\/live\/([\w-]{11})(?:\/|$)/);
      if (m) return m[1];
    }
  } catch {}
  return null;
}

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Paths do kick.com que NÃO são canais (não devem virar slug).
const KICK_RESERVED = new Set([
  'category', 'categories', 'following', 'browse', 'popout', 'embed',
  'api', 'search', 'subscriptions', 'clips', 'dashboard', 'help',
]);

// Extrai o slug de um canal do Kick a partir de uma URL/host do Kick.
// Aceita: kick.com/{slug}, https://kick.com/{slug}, player.kick.com/{slug}.
// Retorna null se não for um canal do Kick.
export function extractKickSlug(input) {
  const s = String(input || '').trim();
  if (!s || !/kick\.com/i.test(s)) return null;
  try {
    const u = new URL(s.startsWith('http') ? s : 'https://' + s);
    if (!/(?:^|\.)kick\.com$/i.test(u.hostname)) return null;
    const seg = u.pathname.split('/').filter(Boolean)[0] || '';
    if (!/^[A-Za-z0-9_]{1,30}$/.test(seg)) return null;
    if (KICK_RESERVED.has(seg.toLowerCase())) return null;
    return seg;
  } catch {
    return null;
  }
}

// URL da página principal de um canal (sem /live), a partir de @handle,
// URL completa ou handle sem @.
function channelPageUrl(input) {
  let c = String(input || '').trim();
  if (!c) return null;
  if (/youtube\.com|youtu\.be|^https?:\/\//i.test(c)) {
    try {
      const u = new URL(c.startsWith('http') ? c : 'https://' + c);
      const p = u.pathname.replace(/\/live\/?$/i, '').replace(/\/+$/, '');
      return p ? 'https://www.youtube.com' + p : null;
    } catch { return null; }
  }
  if (c.startsWith('@')) return `https://www.youtube.com/${c}`;
  return `https://www.youtube.com/@${c.replace(/^@/, '')}`;
}

// Resolve o ID do canal (UC...) a partir de: ID puro, URL /channel/UC...,
// @handle, /c/Nome, /user/Nome. Faz um fetch único (no /ze, baixa frequência).
export async function resolveChannelId(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  if (UC_RE.test(s)) return s;
  const direct = s.match(/channel\/(UC[\w-]{22})/);
  if (direct) return direct[1];

  const url = channelPageUrl(s);
  if (!url) return null;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8', Cookie: 'CONSENT=YES+1; SOCS=CAI' },
    });
    const html = await res.text();
    const m =
      html.match(/"externalId":"(UC[\w-]{22})"/) ||
      html.match(/<meta itemprop="(?:channelId|identifier)" content="(UC[\w-]{22})"/) ||
      html.match(/channel\/(UC[\w-]{22})/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// Lê o corpo JSON de uma requisição (funções Node da Vercel não fazem sozinhas).
export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}
