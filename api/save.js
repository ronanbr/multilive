// POST /api/save  -> valida senha, resolve o ID de cada canal e publica a lista.
import { neon } from '@neondatabase/serverless';
import { readJson, resolveChannelId, extractVideoId, extractKickSlug } from './_lib.js';

export const maxDuration = 30;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body;
  try {
    body = await readJson(req);
  } catch {
    res.status(400).json({ error: 'JSON inválido' });
    return;
  }

  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    res.status(500).json({ error: 'ADMIN_PASSWORD não configurada no servidor' });
    return;
  }
  if (!body || body.password !== expected) {
    res.status(401).json({ error: 'Senha incorreta' });
    return;
  }
  if (!process.env.DATABASE_URL) {
    res.status(500).json({ error: 'Banco de dados não configurado' });
    return;
  }

  const input = Array.isArray(body.channels) ? body.channels : [];
  const channels = [];
  const failed = [];
  for (const item of input) {
    const channel = String((item && (item.channel ?? '')) || '').trim();
    if (!channel) continue;
    const name = String((item && item.name) || '').slice(0, 80).trim() || 'Canal';
    const autoload = !!(item && item.autoload);

    // Tenta primeiro como link direto de vídeo (watch?v=, youtu.be/, /live/)
    const videoId = extractVideoId(channel);
    if (videoId) {
      channels.push({ name, channel, videoId, autoload });
      continue;
    }

    // Canal do Kick (kick.com/{slug}, player.kick.com/{slug})
    const kickSlug = extractKickSlug(channel);
    if (kickSlug) {
      channels.push({ name, channel, kickSlug, autoload });
      continue;
    }

    // Caso contrário, resolve como canal (UC..., @handle, URL de canal)
    // se já veio o channelId resolvido e o texto não mudou, reaproveita
    const channelId =
      (item.channelId && /^UC[\w-]{22}$/.test(item.channelId) ? item.channelId : null) ||
      (await resolveChannelId(channel));
    if (!channelId) { failed.push(channel); continue; }
    channels.push({ name, channel, channelId, autoload });
  }

  if (failed.length) {
    res.status(422).json({
      error: 'Não consegui identificar o ID de: ' + failed.join(', ') +
        '. Use o @handle, a URL do canal ou o ID UC...',
      failed,
    });
    return;
  }

  try {
    const sql = neon(process.env.DATABASE_URL);
    await sql`
      INSERT INTO settings (key, value)
      VALUES ('channels', ${JSON.stringify(channels)}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
    res.status(200).json({ ok: true, channels });
  } catch (err) {
    console.error('save error:', err);
    res.status(500).json({ error: 'Falha ao salvar' });
  }
}
