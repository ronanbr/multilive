// CanarinhoLives - tela do espectador
// Player automático (embed live_stream). A detecção de "ao vivo x offline" é
// feita no navegador via API do player do YouTube (o servidor é bloqueado pelo
// YouTube). Offline some sozinho; dá pra ocultar/mostrar canais manualmente.

const grid = document.getElementById('grid');
const empty = document.getElementById('empty');
const emptyTitle = document.getElementById('emptyTitle');
const emptyMsg = document.getElementById('emptyMsg');
const countEl = document.getElementById('count');
const channelsBtn = document.getElementById('channelsBtn');
const channelsPanel = document.getElementById('channelsPanel');
const channelsList = document.getElementById('channelsList');
const refreshBtn = document.getElementById('refreshBtn');
const reloadBtn = document.getElementById('reloadBtn');
const chatBtn = document.getElementById('chatBtn');
const chatPanel = document.getElementById('chatPanel');
const chatSelect = document.getElementById('chatSelect');
const chatFrame = document.getElementById('chatFrame');
const chatCloseBtn = document.getElementById('chatCloseBtn');

const PROBE_TIMEOUT = 11000;
const REPROBE_INTERVAL = 120000;
const KICK_POLL_INTERVAL = 45000;

let all = [];                       // [{name, channelId?} | {name, videoId?} | {name, kickSlug?}]
const isKick = (c) => !!c.kickSlug;
const itemId = (c) => c.channelId || c.videoId || ('kick:' + c.kickSlug);
const active = new Set();           // itemId que devem carregar (autoload + ativados na sessão)
const autoInit = new Set();         // itemId já inicializados pelo autoload (não reativar no poll)
const status = new Map();           // itemId -> 'checking' | 'live' | 'off' | 'unknown'
const tiles = new Map();            // itemId -> { tile, player }
const chatSrc = new Map();          // itemId -> URL do iframe de chat
let chatActiveId = null;
let signature = '';

// --- API do YouTube ---
let apiReady = false;
const apiQueue = [];
window.onYouTubeIframeAPIReady = () => { apiReady = true; apiQueue.splice(0).forEach((fn) => fn()); };
(function loadApi() {
  const s = document.createElement('script');
  s.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(s);
})();
function whenApi(fn) { apiReady ? fn() : apiQueue.push(fn); }

// --- helpers ---
// Extrai o slug do Kick a partir da URL (espelha api/_lib.js no cliente).
const KICK_RESERVED = ['category', 'categories', 'following', 'browse', 'popout',
  'embed', 'api', 'search', 'subscriptions', 'clips', 'dashboard', 'help'];
function kickSlugFromUrl(s) {
  if (!s || !/kick\.com/i.test(s)) return null;
  try {
    const u = new URL(s.startsWith('http') ? s : 'https://' + s);
    if (!/(?:^|\.)kick\.com$/i.test(u.hostname)) return null;
    const seg = (u.pathname.split('/').filter(Boolean)[0] || '');
    if (!/^[A-Za-z0-9_]{1,30}$/.test(seg)) return null;
    if (KICK_RESERVED.includes(seg.toLowerCase())) return null;
    return seg;
  } catch { return null; }
}
// Corrige dados antigos: canal do Kick salvo como channelId/videoId vira Kick.
function normalizeChannel(c) {
  if (c && !c.kickSlug) {
    const slug = kickSlugFromUrl(c.channel);
    if (slug) return { name: c.name, channel: c.channel, kickSlug: slug, autoload: !!c.autoload };
  }
  return c;
}


// --- chat ---
function chatUrl(videoId) {
  return `https://www.youtube.com/live_chat?v=${videoId}&embed_domain=${location.hostname}`;
}
function kickChatUrl(slug) {
  return `https://kick.com/popout/${slug}/chat`;
}

function updateChatSelect() {
  const liveWithChat = all.filter((c) => {
    const id = itemId(c);
    return tiles.has(id) && chatSrc.has(id);
  });

  chatSelect.innerHTML = '';

  if (liveWithChat.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = 'Nenhuma live ativa';
    opt.disabled = true;
    opt.selected = true;
    chatSelect.appendChild(opt);
    chatFrame.src = 'about:blank';
    chatActiveId = null;
    return;
  }

  let found = false;
  for (const c of liveWithChat) {
    const id = itemId(c);
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = c.name;
    if (id === chatActiveId) { opt.selected = true; found = true; }
    chatSelect.appendChild(opt);
  }

  if (!found) {
    chatActiveId = itemId(liveWithChat[0]);
    chatSelect.value = chatActiveId;
  }

  const url = chatSrc.get(chatActiveId);
  if (url && chatFrame.src !== url) chatFrame.src = url;
}

function openChat() {
  chatPanel.classList.remove('hidden');
  chatBtn.classList.add('active');
}
function closeChat() {
  chatPanel.classList.add('hidden');
  chatBtn.classList.remove('active');
}

reloadBtn.addEventListener('click', () => location.reload());
chatBtn.addEventListener('click', () => {
  chatPanel.classList.contains('hidden') ? openChat() : closeChat();
});
chatCloseBtn.addEventListener('click', closeChat);
chatSelect.addEventListener('change', () => {
  chatActiveId = chatSelect.value;
  const url = chatSrc.get(chatActiveId);
  if (url) chatFrame.src = url;
});

const kickEmbedUrl = (slug, muted) => `https://player.kick.com/${slug}?autoplay=true&muted=${muted ? 'true' : 'false'}`;
const embedUrl = (item) => {
  if (item.kickSlug) {
    return kickEmbedUrl(item.kickSlug, true);
  }
  if (item.videoId) {
    return `https://www.youtube.com/embed/${item.videoId}` +
      `?autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
  }
  return `https://www.youtube.com/embed/live_stream?channel=${item.channelId}` +
    `&autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
};

// --- áudio: o PRIMEIRO tile do grid toca por padrão; um botão por tile (🔊/🔇)
//     permite escolher manualmente qual ouvir. Sempre só um com som; resto mudo. ---
let userInteracted = false;
let audioId = null;        // tile que deve ter som (ou null = todos mudos)
let bumpTimer = null;
let lastAudioApplied;
function clearBump() { if (bumpTimer) { clearInterval(bumpTimer); bumpTimer = null; } }
function bumpVolume(p) {
  // O player do YouTube às vezes restaura o volume anterior logo após unMute;
  // reforçamos o volume máximo. Só pode existir UM bump ativo.
  clearBump();
  let n = 0;
  bumpTimer = setInterval(() => {
    try { p.unMute(); p.setVolume(100); } catch {}
    if (++n >= 8) clearBump();
  }, 250);
}
// Kick não tem API de JS: trocamos o mudo recarregando o iframe com muted=true/false.
function setKickMuted(id, muted) {
  const t = tiles.get(id);
  if (!t || !t.iframe || t.kickMuted === muted) return;
  const c = all.find((x) => itemId(x) === id);
  if (!c || !c.kickSlug) return;
  t.kickMuted = muted;
  t.iframe.src = kickEmbedUrl(c.kickSlug, muted);
}
function firstTileId() {
  const c = all.find((x) => tiles.has(itemId(x)));
  return c ? itemId(c) : null;
}
function updateMuteIcons() {
  for (const [id, t] of tiles) {
    const b = t.tile.querySelector('.mute-btn');
    if (!b) continue;
    // Só mostra 🔊 quando o som está REALMENTE ligado (precisa de gesto do usuário).
    const on = userInteracted && (id === audioId);
    b.textContent = on ? '🔊' : '🔇';
    b.title = on ? 'Som ligado — clique para mutar' : 'Mudo — clique para ouvir este';
    b.classList.toggle('on', on);
  }
}
function enforceAudio() {
  updateMuteIcons();
  if (!userInteracted) return;
  for (const [id, t] of tiles) {
    const wantAudio = (id === audioId);
    if (t.kick) {
      setKickMuted(id, !wantAudio);            // Kick: som via URL do iframe
    } else if (t.player) {
      try {
        if (wantAudio) { t.player.unMute(); t.player.setVolume(100); t.player.playVideo(); }
        else { t.player.mute(); }
      } catch {}
    }
  }
  if (audioId !== lastAudioApplied) {
    lastAudioApplied = audioId;
    clearBump();
    const ft = audioId ? tiles.get(audioId) : null;
    if (ft && ft.player) bumpVolume(ft.player);
  }
}
// Reavalia quando o grid muda. Não rouba o som de quem o usuário escolheu;
// se o tile escolhido sumiu, cai para o primeiro tile.
function applyAudio() {
  if (audioId && !tiles.has(audioId)) audioId = userInteracted ? firstTileId() : null;
  enforceAudio();
}
// Clique no ícone de som de um tile: escolhe qual ouvir (ou muta tudo).
function toggleAudio(id) {
  userInteracted = true;
  audioId = (audioId === id) ? null : id;
  enforceAudio();
}
// Primeiro gesto na página: liga o som do 1º tile — exceto se o gesto já foi no
// próprio botão de som (aí o clique do botão é que decide, sem ação dupla).
function onFirstGesture(e) {
  if (userInteracted) return;
  userInteracted = true;
  const onMuteBtn = e && e.target && e.target.closest && e.target.closest('.mute-btn');
  if (!onMuteBtn) audioId = firstTileId();
  enforceAudio();
}
['pointerdown', 'keydown'].forEach((ev) =>
  document.addEventListener(ev, onFirstGesture, true)
);

// --- detecção via player ---
function makePlayer(iframeEl, channelId, onStatus) {
  let resolved = false;
  const finish = (s) => { if (!resolved) { resolved = true; clearTimeout(to); onStatus(s); } };
  const to = setTimeout(() => finish('off'), PROBE_TIMEOUT);
  const player = new YT.Player(iframeEl, {
    events: {
      onReady: (e) => {
        try {
          e.target.mute();
          const s = e.target.getPlayerState();
          if (s === 1 || s === 3) { finish('live'); return; }
          e.target.playVideo();
        } catch {}
      },
      onStateChange: (e) => { if (e.data === 1 || e.data === 3) finish('live'); },
      onError: () => finish('off'),
    },
  });
  return player;
}

// --- tiles visíveis ---
function createTile(channel) {
  const { name } = channel;
  const id = itemId(channel);
  const tile = document.createElement('div');
  tile.className = 'tile';

  const iframe = document.createElement('iframe');
  iframe.id = 'yt-' + id;
  iframe.src = embedUrl(channel);
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  iframe.allowFullscreen = true;

  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = name;

  const hideBtn = document.createElement('button');
  hideBtn.className = 'hide-btn';
  hideBtn.title = 'Ocultar este canal';
  hideBtn.textContent = '✕';
  hideBtn.addEventListener('click', () => setActive(id, false));

  // O ícone de som só faz sentido no Kick (troca de áudio via reload do iframe).
  // No YouTube confunde, então não é exibido.
  tile.append(iframe, label, hideBtn);
  if (channel.kickSlug) {
    const muteBtn = document.createElement('button');
    muteBtn.className = 'mute-btn';
    muteBtn.textContent = '🔇';
    muteBtn.title = 'Mudo — clique para ouvir este';
    muteBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleAudio(id); });
    tile.insertBefore(muteBtn, hideBtn);
  }
  grid.appendChild(tile);

  // Kick: sem API de JS — mostra o player direto (sempre mudo) e usa o popout de chat.
  // videoId (link direto do admin): mostra imediatamente.
  // channelId: detecta via player do YouTube se está ao vivo.
  if (channel.kickSlug) {
    // status é controlado pela detecção (refreshKickStatus); aqui só montamos o tile.
    // Nasce mudo (muted=true); o áudio é ligado depois se for o 1º tile do grid.
    chatSrc.set(id, kickChatUrl(channel.kickSlug));
    tiles.set(id, { tile, player: null, iframe, kick: true, kickMuted: true });
    updateChatSelect();
  } else if (channel.videoId) {
    chatSrc.set(id, chatUrl(channel.videoId));
    status.set(id, 'live');
    tiles.set(id, { tile, player: null, iframe });
    whenApi(() => {
      const player = new YT.Player(iframe, {
        events: {
          onReady: (e) => { try { e.target.mute(); e.target.playVideo(); } catch {} },
        },
      });
      tiles.set(id, { tile, player, iframe });
      applyAudio();
    });
    updateChatSelect();
  } else {
    status.set(id, 'checking');
    whenApi(() => {
      const player = makePlayer(iframe, id, (s) => {
        if (s === 'live') {
          try {
            const vdata = player.getVideoData();
            if (vdata && vdata.video_id) chatSrc.set(id, chatUrl(vdata.video_id));
          } catch {}
        }
        setStatus(id, s);          // status vira 'live' aqui
        if (s === 'live') updateChatSelect(); // só filtra depois do status atualizado
      });
      tiles.set(id, { tile, player, iframe });
      applyAudio();               // reavalia o som assim que o player fica pronto
    });
    if (!tiles.has(id)) tiles.set(id, { tile, player: null, iframe });
  }
}

function removeTile(channelId) {
  const t = tiles.get(channelId);
  if (!t) return;
  try { t.player && t.player.destroy(); } catch {}
  t.tile.remove();
  tiles.delete(channelId);
  chatSrc.delete(channelId);
  updateChatSelect();
}

// --- prova off-screen (re-testa canais offline sem atrapalhar os ao vivo) ---
const probing = new Set();
function probeChannel(channel) {
  const id = itemId(channel);
  if (probing.has(id) || tiles.has(id)) return;
  probing.add(id);
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:180px;';
  const iframe = document.createElement('iframe');
  iframe.src = embedUrl(channel);
  iframe.allow = 'autoplay; encrypted-media';
  box.appendChild(iframe);
  document.body.appendChild(box);
  whenApi(() => {
    makePlayer(iframe, id, (s) => {
      probing.delete(id);
      box.remove();
      if (s === 'live') { setStatus(id, 'live'); syncGrid(); }
      else { status.set(id, 'off'); renderPanel(); }
    });
  });
}

// --- estado / sincronização ---
function setStatus(channelId, s) {
  if (status.get(channelId) === s) { renderPanel(); return; }
  status.set(channelId, s);
  if (s === 'off') removeTile(channelId);
  layout();
  renderPanel();
  applyAudio();
}

function setActive(channelId, on) {
  if (on) {
    active.add(channelId);
    status.delete(channelId);                 // re-detecta do zero ao abrir
    const c = all.find((x) => itemId(x) === channelId);
    if (c && isKick(c)) refreshKickStatus(c);  // status rápido do Kick
  } else {
    active.delete(channelId);
  }
  syncGrid();
}

function syncGrid() {
  for (const c of all) {
    const id = itemId(c);
    const st = status.get(id);
    // Comportamento idêntico para YouTube e Kick: só carrega os canais "ativos"
    // (marcados "Carrega ao abrir" ou abertos na lista). Dentre os ativos, tenta
    // carregar e some sozinho quando a detecção confirma que está offline.
    const shouldShow = active.has(id) && st !== 'off';
    if (shouldShow && !tiles.has(id)) createTile(c);
    if (!shouldShow && tiles.has(id)) removeTile(id);
  }
  // reordena os tiles visíveis para seguir a ordem da lista (definida no /ze)
  for (const c of all) {
    const t = tiles.get(itemId(c));
    if (t) grid.appendChild(t.tile);
  }
  layout();
  renderPanel();
  applyAudio(); // o 1º tile do grid (qualquer plataforma) recebe o som
}

function layout() {
  const visible = [...grid.querySelectorAll('.tile')];
  const n = visible.length;
  const liveN = all.filter((c) => status.get(itemId(c)) === 'live' && tiles.has(itemId(c))).length;
  countEl.textContent = liveN ? `${liveN} ao vivo` : '';

  if (n === 0) {
    grid.style.display = 'none';
    empty.style.display = 'flex';
    if (all.length === 0) {
      emptyTitle.textContent = 'Nenhum canal disponível';
      emptyMsg.textContent = 'Volte mais tarde.';
    } else {
      emptyTitle.textContent = 'Nenhuma live aberta';
      emptyMsg.innerHTML = 'Abra um canal no menu <b>Canais</b> (clique nele) para assistir.';
    }
    return;
  }
  grid.style.display = 'grid';
  empty.style.display = 'none';
  // Celular em retrato: tudo numa coluna só (um abaixo do outro).
  // Paisagem / telas maiores: grid quadrado como antes.
  const portraitMobile = window.matchMedia('(orientation: portrait) and (max-width: 820px)').matches;
  if (portraitMobile) {
    grid.classList.add('stacked');
    grid.style.gridTemplateColumns = '1fr';
    grid.style.gridTemplateRows = '';   // cada tile em 16:9, a página rola (CSS)
  } else {
    grid.classList.remove('stacked');
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const rows = Math.ceil(n / cols);
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
  }
}
// Recalcula o layout ao girar a tela / redimensionar.
let layoutTimer = null;
function relayout() { clearTimeout(layoutTimer); layoutTimer = setTimeout(layout, 120); }
window.addEventListener('resize', relayout);
window.addEventListener('orientationchange', relayout);

// --- painel de canais ---
function renderPanel() {
  channelsList.innerHTML = '';
  for (const c of all) {
    const id = itemId(c);
    const isActive = active.has(id);
    const st = status.get(id) || 'checking';
    const stClass = !isActive ? 'off'
      : st === 'live' ? 'live' : st === 'off' ? 'off' : st === 'unknown' ? 'unknown' : 'checking';
    const tag = isKick(c) ? ' <span class="tag">KICK</span>' : '';
    const row = document.createElement('div');
    row.className = 'ch-row' + (isActive ? '' : ' is-hidden');
    row.innerHTML = `<span class="st ${stClass}"></span>` +
      `<span class="nm">${c.name}${tag}</span>` +
      `<span class="eye">${isActive ? '👁' : '▶'}</span>`;
    row.title = !isActive ? 'Clique para carregar'
      : st === 'live' ? 'Ao vivo' : st === 'off' ? 'Offline / sem transmissão'
      : st === 'unknown' ? 'Status desconhecido' : 'Verificando...';
    row.addEventListener('click', () => setActive(id, !isActive));
    channelsList.appendChild(row);
  }
}

channelsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  channelsPanel.classList.toggle('hidden');
});
document.addEventListener('click', (e) => {
  if (!channelsPanel.contains(e.target) && e.target !== channelsBtn) channelsPanel.classList.add('hidden');
});
refreshBtn.addEventListener('click', () => { reprobe(); loadList(); });

// --- re-teste periódico (só dos canais ativos offline: offline -> ao vivo) ---
function reprobe() {
  for (const c of all) {
    if (c.videoId || c.kickSlug) continue; // só YouTube por canal
    const id = itemId(c);
    if (active.has(id) && status.get(id) === 'off') probeChannel(c);
  }
}
setInterval(reprobe, REPROBE_INTERVAL);

// --- detecção do Kick (API oficial via /api/kick-status): mostra/oculta como o YouTube ---
async function refreshKickStatus(channel) {
  const id = itemId(channel);
  try {
    const res = await fetch('/api/kick-status?slug=' + encodeURIComponent(channel.kickSlug), { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    const st = data.status === 'live' ? 'live' : data.status === 'off' ? 'off' : 'unknown';
    if (status.get(id) !== st) { status.set(id, st); syncGrid(); } // syncGrid abre/fecha o tile
  } catch {
    if (!status.has(id)) { status.set(id, 'unknown'); renderPanel(); }
  }
}
// Só consulta os canais Kick ativos (marcados/abertos) — não carrega o resto.
function refreshAllKick() { for (const c of all) if (isKick(c) && active.has(itemId(c))) refreshKickStatus(c); }
setInterval(refreshAllKick, KICK_POLL_INTERVAL);

// --- carga da lista ---
async function loadList() {
  try {
    const res = await fetch('/api/channels');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const list = (Array.isArray(data.channels) ? data.channels : [])
      .map(normalizeChannel)
      .filter((c) => c.channelId || c.videoId || c.kickSlug);
    const newSig = list.map((c) => itemId(c)).join('|');
    if (newSig === signature) return;
    signature = newSig;
    all = list;
    // limpa status de canais que sumiram
    for (const id of [...status.keys()]) if (!all.some((c) => itemId(c) === id)) { removeTile(id); status.delete(id); }
    // "Carrega ao abrir": ativa esses canais automaticamente (uma vez por canal).
    for (const c of all) {
      const id = itemId(c);
      if (c.autoload && !autoInit.has(id)) { autoInit.add(id); active.add(id); }
    }
    syncGrid();
    refreshAllKick(); // detecta os canais Kick ativos (abre/fecha sozinho)
  } catch (err) {
    console.error('Falha ao carregar canais:', err);
  }
}

loadList();
setInterval(loadList, 60000);
