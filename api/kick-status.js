// GET /api/kick-status?slug=...  -> verifica se o canal do Kick está ao vivo.
//
// Preferência 1 (confiável): API oficial do Kick (api.kick.com/public/v1).
//   Requer um app registrado no Kick e as variáveis de ambiente
//   KICK_CLIENT_ID e KICK_CLIENT_SECRET (fluxo client_credentials, sem login de usuário).
// Preferência 2 (best-effort): raspagem da API v2 (costuma cair em 403 do Cloudflare),
//   usada apenas se não houver credenciais ou se a API oficial falhar.
import { UA } from './_lib.js';

export const maxDuration = 15;

// Cache do app access token entre invocações quentes (Fluid Compute reaproveita instâncias).
let tokenCache = { token: null, exp: 0 };

async function getAppToken() {
  const id = process.env.KICK_CLIENT_ID;
  const secret = process.env.KICK_CLIENT_SECRET;
  if (!id || !secret) return null;

  const now = Date.now();
  if (tokenCache.token && now < tokenCache.exp - 60000) return tokenCache.token;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: id,
    client_secret: secret,
  });
  const r = await fetch('https://id.kick.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) return null;
  const data = await r.json().catch(() => null);
  if (!data || !data.access_token) return null;
  const ttl = Number(data.expires_in) > 0 ? Number(data.expires_in) * 1000 : 3600000;
  tokenCache = { token: data.access_token, exp: now + ttl };
  return tokenCache.token;
}

// API oficial: retorna {status,viewers,title} ou null se não der pra decidir.
async function viaOfficial(slug, signal) {
  const token = await getAppToken();
  if (!token) return null;
  const r = await fetch(
    'https://api.kick.com/public/v1/channels?slug=' + encodeURIComponent(slug),
    { signal, headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } },
  );
  if (!r.ok) return null;
  const data = await r.json().catch(() => null);
  const ch = data && Array.isArray(data.data) ? data.data[0] : null;
  if (!ch) return { status: 'off', source: 'api' }; // sem canal => sem live
  const st = ch.stream || {};
  const live = st.is_live === true;
  return {
    status: live ? 'live' : 'off',
    viewers: live ? (st.viewer_count ?? null) : null,
    title: ch.stream_title ?? st.title ?? null,
    source: 'api',
  };
}

// Fallback best-effort: API v2 (frequentemente bloqueada pelo Cloudflare).
async function viaScrape(slug, signal) {
  const r = await fetch('https://kick.com/api/v2/channels/' + slug, {
    redirect: 'follow',
    signal,
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      Cookie: 'CONSENT=YES+1; SOCS=CAI',
    },
  });
  if (!r.ok) return { status: 'unknown', code: r.status, source: 'scrape' };
  const data = await r.json().catch(() => null);
  if (!data || typeof data !== 'object') return { status: 'unknown', source: 'scrape' };
  const ls = data.livestream;
  if (ls && typeof ls === 'object') {
    return { status: 'live', viewers: ls.viewer_count ?? ls.viewers ?? null, title: ls.session_title ?? null, source: 'scrape' };
  }
  return { status: 'off', source: 'scrape' };
}

export default async function handler(req, res) {
  const slug = String((req.query && req.query.slug) || '').trim();
  res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=60');

  if (!/^[A-Za-z0-9_]{1,30}$/.test(slug)) {
    res.status(400).json({ status: 'unknown', error: 'slug inválido' });
    return;
  }

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 9000);
  try {
    // 1) API oficial (se houver credenciais)
    try {
      const official = await viaOfficial(slug, ctrl.signal);
      if (official) { res.status(200).json(official); return; }
    } catch { /* cai pro fallback */ }

    // 2) best-effort
    res.status(200).json(await viaScrape(slug, ctrl.signal));
  } catch (err) {
    res.status(200).json({ status: 'unknown', error: String((err && err.name) || err) });
  } finally {
    clearTimeout(to);
  }
}
