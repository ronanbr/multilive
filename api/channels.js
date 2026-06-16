// GET /api/channels  -> lista pública de lives (com cache na borda).
import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Cache na CDN: a origem é chamada poucas vezes por minuto, mesmo com
  // milhares de espectadores. stale-while-revalidate serve rápido enquanto revalida.
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');

  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`SELECT value FROM settings WHERE key = 'channels'`;
    const channels = rows.length ? rows[0].value : [];
    res.status(200).json({ channels: Array.isArray(channels) ? channels : [] });
  } catch (err) {
    console.error('channels error:', err);
    res.status(200).json({ channels: [] });
  }
}
