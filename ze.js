// MultiLive - painel restrito (/ze)
const rowsEl = document.getElementById('rows');
const msgEl = document.getElementById('msg');
const pwEl = document.getElementById('password');

function makeRow(name = '', url = '', autoload = false) {
  const row = document.createElement('div');
  row.className = 'row';

  const n = document.createElement('input');
  n.className = 'inp name';
  n.placeholder = 'Nome do canal';
  n.value = name;

  const u = document.createElement('input');
  u.className = 'inp url';
  u.placeholder = 'Canal: link YouTube, @handle, ID UC... ou link do Kick';
  u.value = url;

  const auto = document.createElement('label');
  auto.className = 'auto';
  auto.title = 'Carregar este canal automaticamente ao abrir a página (útil para Kick)';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'autoload';
  cb.checked = !!autoload;
  const cbLabel = document.createElement('span');
  cbLabel.textContent = 'Carrega ao abrir';
  auto.append(cb, cbLabel);

  const move = document.createElement('div');
  move.className = 'move-grp';
  const up = document.createElement('button');
  up.className = 'btn move';
  up.textContent = '▲';
  up.title = 'Mover para cima';
  up.addEventListener('click', () => {
    const prev = row.previousElementSibling;
    if (prev) rowsEl.insertBefore(row, prev);
  });
  const down = document.createElement('button');
  down.className = 'btn move';
  down.textContent = '▼';
  down.title = 'Mover para baixo';
  down.addEventListener('click', () => {
    const next = row.nextElementSibling;
    if (next) rowsEl.insertBefore(next, row);
  });
  move.append(up, down);

  const x = document.createElement('button');
  x.className = 'btn x';
  x.textContent = '✕';
  x.title = 'Remover';
  x.addEventListener('click', () => row.remove());

  row.append(move, n, u, auto, x);
  rowsEl.appendChild(row);
  return row;
}

function collect() {
  const out = [];
  for (const row of rowsEl.querySelectorAll('.row')) {
    const name = row.querySelector('.inp.name').value.trim();
    const channel = row.querySelector('.inp.url').value.trim();
    const autoload = row.querySelector('.autoload').checked;
    if (channel) out.push({ name, channel, autoload });
  }
  return out;
}

function setMsg(text, kind) {
  msgEl.innerHTML = '';
  if (!text) return;
  const d = document.createElement('div');
  d.className = 'msg ' + (kind || '');
  d.textContent = text;
  msgEl.appendChild(d);
}

async function loadCurrent() {
  try {
    const res = await fetch('/api/channels?_=' + Date.now(), { cache: 'no-store' });
    const data = await res.json();
    rowsEl.innerHTML = '';
    const list = Array.isArray(data.channels) ? data.channels : [];
    if (list.length === 0) makeRow();
    else for (const c of list) makeRow(c.name || '', c.channel || '', !!c.autoload);
    setMsg('', '');
  } catch {
    rowsEl.innerHTML = '';
    makeRow();
  }
}

async function save() {
  const password = pwEl.value;
  if (!password) { setMsg('Informe a senha.', 'err'); return; }
  const channels = collect();
  setMsg('Salvando...', '');
  try {
    const res = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, channels }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { setMsg('Senha incorreta.', 'err'); return; }
    if (!res.ok) { setMsg(data.error || ('Erro ' + res.status), 'err'); return; }
    const n = (data.channels || []).length;
    setMsg(`Publicado! ${n} ${n === 1 ? 'canal cadastrado' : 'canais cadastrados'}.`, 'ok');
    // recarrega com o que o servidor aceitou
    rowsEl.innerHTML = '';
    if ((data.channels || []).length === 0) makeRow();
    else for (const c of data.channels) makeRow(c.name || '', c.channel || '', !!c.autoload);
  } catch (err) {
    setMsg('Falha de rede: ' + err.message, 'err');
  }
}

document.getElementById('add').addEventListener('click', () => makeRow());
document.getElementById('reload').addEventListener('click', loadCurrent);
document.getElementById('save').addEventListener('click', save);

loadCurrent();
