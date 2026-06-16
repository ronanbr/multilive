# LivesDoZé

Multi-platform livestream grid viewer for **YouTube** and **Kick.com** — watch multiple channels simultaneously with automatic live detection, embedded chat, and a password-protected admin panel.

## Features

- **Live detection without API keys** — YouTube channels are probed via the YouTube IFrame Player API (hidden iframe + state-change listener); no YouTube Data API key required
- **Kick.com support** — live status via the official Kick OAuth2 API (with credential-less public API fallback)
- **Auto-sizing grid** — responsive CSS Grid that adapts to the number of currently live streams
- **Embedded chat panel** — side panel to switch between YouTube Live Chat or Kick chat for any active stream
- **Audio control** — all streams start muted; per-tile toggle lets the user choose which audio to hear
- **Hidden channels** — users can hide/show any tile; preference persists in `localStorage`
- **Offline re-probe** — YouTube channels re-checked every 2 min; Kick channels polled every 45 s
- **Admin panel** (`/ze`) — CRUD for the channel list, password-protected, supports multiple input formats

## Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla ES6 modules, CSS Grid, YouTube IFrame Player API |
| Backend | Vercel Serverless Functions (Node.js) |
| Database | Neon (serverless PostgreSQL via `@neondatabase/serverless`) |
| Kick live detection | Kick Official API (OAuth2 client credentials flow) |
| Deployment | Vercel |

No framework, no bundler, no transpilation step — static HTML/JS served as-is.

## Routes

| Route | Description |
|---|---|
| `/` | Public grid viewer — share this URL |
| `/ze` | Admin panel (password-protected) |

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/channels` | GET | Returns channel list (edge-cached: `s-maxage=30, stale-while-revalidate=60`) |
| `/api/save` | POST | Writes channel list — requires `ADMIN_PASSWORD` in request body |
| `/api/kick-status` | GET | Returns live status for a Kick channel slug |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ADMIN_PASSWORD` | Yes | Password for the `/ze` admin panel |
| `DATABASE_URL` | Yes | Neon PostgreSQL pooled connection string |
| `KICK_CLIENT_ID` | No | Kick app client ID (official API) |
| `KICK_CLIENT_SECRET` | No | Kick app client secret (official API) |

Without `KICK_CLIENT_ID` / `KICK_CLIENT_SECRET`, Kick live detection falls back to the public v2 API.

## Running Locally

```bash
npm install
vercel dev          # http://localhost:3000
```

> YouTube chat only loads on the domain configured in `embed_domain`. In production it works normally; on `localhost` the player plays but chat may not load.

## Database Schema

```sql
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value JSONB
);
-- 'channels' key holds the channel list as a JSON array
```

## Channel Input Formats

The admin panel resolves any of the following formats server-side via `api/_lib.js`:

- **YouTube**: `@handle`, `UC…` channel ID, full channel URL, `watch?v=`, `youtu.be/`, `/live/` links
- **Kick**: `kick.com/slug` or `player.kick.com/slug`

## Architecture Notes

- Channel list is stored in Neon PostgreSQL and served with Vercel edge caching; handles high viewer counts on the free tier
- YouTube live detection is entirely client-side — a hidden iframe is created per channel and its player state is observed; no quota costs
- Kick live detection is server-side (`/api/kick-status`) to avoid CORS issues and keep credentials off the client
- An `autoload` flag on a channel forces its iframe to initialize on page open (useful for Kick, which has no JS Player API)
- All iframes start muted per browser autoplay policy; the first user gesture enables audio on the first tile only