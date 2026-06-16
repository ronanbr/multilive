# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**CanarinhoLives** is a YouTube multi-channel live streaming grid viewer. It lets users watch multiple YouTube live streams simultaneously in a grid layout. The app scrapes YouTube channel pages (no API key) to detect which channels are live, then embeds YouTube iframes (player + chat) for each active stream.

Two routes:
- `/` — Public grid viewer
- `/ze` — Admin panel (password-protected) for managing the channel list

## Development

**Prerequisites:** Node.js, Vercel CLI (`npm i -g vercel`)

```bash
npm install       # Install dependencies (@vercel/blob)
vercel dev        # Run locally at http://localhost:3000
```

There are no build, lint, or test scripts — this is a plain static + serverless project with no transpilation step.

## Environment Variables

Required in `.env.local` for local development:

- `ADMIN_PASSWORD` — Password used to authenticate `POST /api/save`
- `BLOB_READ_WRITE_TOKEN` — Vercel Blob storage token (for reading/writing `channels.json`)

## Architecture

**No frameworks, no bundler.** Vanilla JS ES6 modules + Vercel serverless functions.

### Data flow

1. Channel list is stored as `channels.json` in Vercel Blob.
2. `GET /api/channels` reads it and returns the list (CDN-cached: `s-maxage=30, stale-while-revalidate=300`).
3. The public viewer (`app.js`) fetches `/api/channels`, creates YouTube iframes via the YouTube Player API, then detects live/offline status by listening for player state changes.
4. Admin panel (`ze.js`) loads the current list from `/api/channels`, allows edits, and submits to `POST /api/save` with the admin password. The save endpoint resolves any YouTube URL/@handle/channel-ID input to a canonical `UC...` ID via `api/_lib.js`.

### Key files

| File | Role |
|------|------|
| `api/_lib.js` | Shared serverless utilities: `resolveChannelId()` (URL→UC ID), `readJson()`, `channelPageUrl()` |
| `api/channels.js` | `GET /api/channels` — serves channel list from Blob with edge caching |
| `api/save.js` | `POST /api/save` — validates password, resolves channel IDs, writes to Blob |
| `app.js` | Public viewer: grid management, YouTube Player API integration, localStorage persistence for hidden channels |
| `ze.js` | Admin panel: CRUD for channel list, communicates with `/api/save` |

### Channel resolution

`resolveChannelId(input)` in `api/_lib.js` accepts YouTube channel URLs, `@handle` format, or raw `UC...` IDs. It performs a lightweight HTTP fetch of the YouTube channel page to extract the canonical channel ID — no YouTube Data API key required.

### Vercel config

`vercel.json` defines one rewrite: `/ze` → `/ze.html`. No other routing configuration.
