// Sintonia — jogo multiplayer de equipe. Node 18+, sem dependências.
// Uso: node server.js  (PORT opcional)
const http = require('http');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const VOTE_SECONDS = 30;
const MAX_PLAYERS = 20;
const rooms = new Map();

const PROMPTS = [
  'Quem venceria uma maratona de séries sem dormir?',
  'Quem aceitaria um desafio de comer a pimenta mais forte?',
  'Quem seria o melhor piloto de fuga num filme de assalto?',
  'Quem sempre tem um meme perfeito para cada situação?',
  'Quem se perderia num lugar que já visitou 10 vezes?',
  'Quem ganharia um debate sobre qualquer assunto, mesmo sem saber nada?',
  'Quem seria o vilão mais carismático de um filme?',
  'Quem pediria a sobremesa antes do prato principal?',
  'Quem sobreviveria a um apocalipse zumbi só com o que tem na mochila?',
  'Quem seria o melhor DJ numa festa de última hora?',
  'Quem chegaria atrasado ao próprio casamento?',
  'Quem teria um canal de culinária de sucesso no YouTube?',
  'Quem guardaria um segredo até o fim da vida?',
  'Quem toparia viajar amanhã sem planejar nada?',
  'Quem mais ri das próprias piadas?',
  'Quem seria o melhor chefe de cozinha de um restaurante estrelado?',
  'Quem ficaria famoso por um vídeo viral acidental?',
  'Quem tem cara de quem já ganhou na loteria e não contou a ninguém?',
  'Quem seria o melhor super-herói com o poder mais inútil?',
  'Quem ganharia numa competição de dança em público?',
  'Quem teria 50 abas abertas no navegador agora?',
  'Quem seria o melhor advogado de defesa num julgamento improvável?',
  'Quem mais adora um plano B, C e D?',
  'Quem conseguiria vender gelo no Polo Norte?',
  'Quem seria o primeiro a chorar num filme de animação?',
  'Quem tem a gargalhada mais contagiante?',
  'Quem passaria um mês inteiro sem celular?',
  'Quem seria o melhor locutor de uma partida de futebol?',
  'Quem sempre pede "só mais cinco minutinhos"?',
  'Quem mais merece uma medalha de paciência?',
  'Quem sairia de uma sala de escape primeiro?',
  'Quem teria o apelido mais engraçado na escola?',
  'Quem sobreviveria a um reality show de aventura na selva?',
  'Quem seria o melhor conselheiro num momento difícil?',
  'Quem respeita o limite de velocidade até em estrada vazia?',
  'Quem seria o primeiro a adotar um bicho de estimação sem avisar?',
  'Quem tem mais chance de escrever um livro best-seller?',
  'Quem faria o melhor discurso de despedida?',
  'Quem esqueceria onde guardou os óculos que está usando?',
  'Quem aceitaria cantar parabéns em voz alta num restaurante?',
  'Quem seria o melhor árbitro numa discussão de grupo?',
  'Quem inventaria um aplicativo que todo mundo passaria a usar?',
  'Quem mais gosta de dar opinião sobre tudo?',
  'Quem seria o mais convincente num jogo de blefe?',
  'Quem viraria o mestre de um jogo de RPG?',
  'Quem transformaria sobras da geladeira num prato incrível?',
  'Quem tem a melhor energia de segunda-feira?',
  'Quem acordaria cedo num sábado só para treinar?',
  'Quem seria o melhor tradutor num país onde ninguém fala nossa língua?',
  'Quem mais merece um prêmio de "Salvador da Pátria"?',
  'Quem seria o personagem principal de uma comédia romântica?',
  'Quem nunca perde um prazo?',
  'Quem entraria num sorteio e ganharia todos os prêmios?',
  'Quem faria o melhor trote inofensivo da equipe?',
  'Quem sabe dos melhores lugares para comer na cidade?',
  'Quem seria o melhor negociador de salário do grupo?',
  'Quem passaria a noite toda num karaokê sem cansar?',
  'Quem teria coragem de pular de paraquedas amanhã?',
  'Quem seria o melhor técnico de um time de vôlei?',
  'Quem tem mais cara de ter um segredo surpreendente?',
  'Quem ganharia um concurso de piadas ruins?',
];

const uid = () => crypto.randomBytes(8).toString('hex');
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function newCode() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = Array.from({ length: 4 }, () => L[crypto.randomInt(L.length)]).join(''); } while (rooms.has(c));
  return c;
}

function makePlayer(name, room) {
  name = String(name || '').trim().slice(0, 20) || 'Jogador';
  const names = [...room.players.values()].map((p) => p.name);
  let n = name, i = 2;
  while (names.includes(n)) n = name + ' (' + i++ + ')';
  return { id: uid(), name: n, score: 0, received: 0, connected: false, res: null };
}

function publicState(room, pid) {
  return {
    code: room.code, you: pid, hostId: room.hostId, phase: room.phase,
    round: room.round, totalRounds: room.totalRounds, prompt: room.prompt,
    voteSeconds: VOTE_SECONDS,
    timeLeft: room.phase === 'voting' ? Math.max(0, room.deadline - Date.now()) : 0,
    players: [...room.players.values()].map((p) => ({
      id: p.id, name: p.name, score: p.score, received: p.received, connected: p.connected,
      voted: room.phase === 'voting' && p.id in room.votes,
    })),
    myVote: room.votes[pid] || null,
    result: room.phase === 'reveal' ? room.result : null,
  };
}

function broadcast(room) {
  for (const p of room.players.values()) {
    if (p.res) p.res.write('data: ' + JSON.stringify(publicState(room, p.id)) + '\n\n');
  }
}

function fixHost(room) {
  const h = room.players.get(room.hostId);
  if (h && h.connected) return;
  const next = [...room.players.values()].find((p) => p.connected);
  if (next) room.hostId = next.id;
}

function allVoted(room) {
  const online = [...room.players.values()].filter((p) => p.connected);
  return online.length > 0 && online.every((p) => p.id in room.votes);
}

function startRound(room) {
  if (!room.deck.length) room.deck = shuffle(PROMPTS);
  room.prompt = room.deck.pop();
  room.round++;
  room.votes = {};
  room.result = null;
  room.phase = 'voting';
  room.deadline = Date.now() + VOTE_SECONDS * 1000;
  clearTimeout(room.timer);
  room.timer = setTimeout(() => reveal(room), VOTE_SECONDS * 1000 + 300);
  broadcast(room);
}

function reveal(room) {
  if (room.phase !== 'voting') return;
  clearTimeout(room.timer);
  const counts = {};
  const valid = Object.entries(room.votes).filter(([v, t]) => room.players.has(v) && room.players.has(t));
  for (const [, t] of valid) counts[t] = (counts[t] || 0) + 1;
  const max = Math.max(0, ...Object.values(counts));
  const winners = max ? Object.keys(counts).filter((id) => counts[id] === max) : [];
  for (const [id, n] of Object.entries(counts)) room.players.get(id).received += n;
  const matched = [];
  for (const [v, t] of valid) if (winners.includes(t)) { room.players.get(v).score++; matched.push(v); }
  room.result = { counts, winners, max, matched };
  room.phase = 'reveal';
  broadcast(room);
}

function removePlayer(room, pid) {
  const p = room.players.get(pid);
  if (!p) return;
  if (p.res) { try { p.res.end(); } catch {} p.res = null; }
  room.players.delete(pid);
  delete room.votes[pid];
  if (!room.players.size) { clearTimeout(room.timer); rooms.delete(room.code); return; }
  fixHost(room);
  if (room.phase === 'voting' && allVoted(room)) return reveal(room);
  broadcast(room);
}

function handleAction(room, pid, a) {
  const isHost = room.hostId === pid;
  switch (a.type) {
    case 'start': {
      if (!isHost || room.phase !== 'lobby') throw new Error('Só o anfitrião pode iniciar.');
      if (room.players.size < 2) throw new Error('São necessários ao menos 2 jogadores.');
      const r = Number(a.rounds);
      room.totalRounds = [3, 5, 8, 10].includes(r) ? r : 5;
      room.round = 0;
      for (const p of room.players.values()) { p.score = 0; p.received = 0; }
      startRound(room);
      break;
    }
    case 'vote': {
      if (room.phase !== 'voting') throw new Error('Votação encerrada.');
      if (a.target === pid || !room.players.has(a.target)) throw new Error('Voto inválido.');
      room.votes[pid] = a.target;
      if (allVoted(room)) reveal(room); else broadcast(room);
      break;
    }
    case 'reveal':
      if (!isHost) throw new Error('Apenas o anfitrião.');
      reveal(room);
      break;
    case 'next':
      if (!isHost || room.phase !== 'reveal') throw new Error('Ação inválida.');
      if (room.round >= room.totalRounds) { room.phase = 'end'; broadcast(room); }
      else startRound(room);
      break;
    case 'restart':
      if (!isHost) throw new Error('Apenas o anfitrião.');
      clearTimeout(room.timer);
      room.phase = 'lobby'; room.votes = {}; room.result = null;
      broadcast(room);
      break;
    case 'leave':
      removePlayer(room, pid);
      break;
    default:
      throw new Error('Ação desconhecida.');
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 10000) { reject(new Error('Muito grande')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { reject(new Error('JSON inválido')); } });
  });
}
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(HTML);
    }
    if (req.method === 'GET' && url.pathname === '/healthz') return json(res, 200, { ok: true });

    if (req.method === 'GET' && url.pathname === '/events') {
      const room = rooms.get(String(url.searchParams.get('room') || '').toUpperCase());
      const p = room && room.players.get(url.searchParams.get('pid'));
      if (!p) { res.writeHead(404); return res.end(); }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive', 'X-Accel-Buffering': 'no',
      });
      if (p.res) { try { p.res.end(); } catch {} }
      p.res = res; p.connected = true; room.lastActive = Date.now();
      res.write('retry: 2000\n\n');
      broadcast(room);
      req.on('close', () => {
        if (p.res !== res) return;
        p.res = null; p.connected = false; room.lastActive = Date.now();
        if (!rooms.has(room.code)) return;
        fixHost(room);
        if (room.phase === 'voting' && allVoted(room)) return reveal(room);
        broadcast(room);
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/create') {
      const b = await readJson(req);
      const room = {
        code: newCode(), hostId: null, players: new Map(), phase: 'lobby', round: 0, totalRounds: 5,
        prompt: '', votes: {}, result: null, deadline: 0, timer: null, deck: [], lastActive: Date.now(),
      };
      const p = makePlayer(b.name, room);
      room.players.set(p.id, p); room.hostId = p.id;
      rooms.set(room.code, room);
      return json(res, 200, { room: room.code, pid: p.id });
    }

    if (req.method === 'POST' && url.pathname === '/api/join') {
      const b = await readJson(req);
      const room = rooms.get(String(b.room || '').trim().toUpperCase());
      if (!room) return json(res, 404, { error: 'Sala não encontrada.' });
      if (room.players.size >= MAX_PLAYERS) return json(res, 400, { error: 'Sala cheia.' });
      const p = makePlayer(b.name, room);
      room.players.set(p.id, p);
      return json(res, 200, { room: room.code, pid: p.id });
    }

    if (req.method === 'POST' && url.pathname === '/api/action') {
      const b = await readJson(req);
      const room = rooms.get(String(b.room || '').toUpperCase());
      if (!room || !room.players.has(b.pid)) return json(res, 404, { error: 'Sala expirada.' });
      room.lastActive = Date.now();
      handleAction(room, b.pid, b);
      return json(res, 200, { ok: true });
    }

    res.writeHead(404); res.end('Not found');
  } catch (e) {
    json(res, 400, { error: e.message || 'Erro' });
  }
});

// Remove salas inativas (sem ninguém conectado há 30 min)
setInterval(() => {
  for (const [code, r] of rooms) {
    const online = [...r.players.values()].some((p) => p.connected);
    if (!online && Date.now() - r.lastActive > 30 * 60 * 1000) { clearTimeout(r.timer); rooms.delete(code); }
  }
}, 5 * 60 * 1000);
// Heartbeat SSE (evita timeout de proxies)
setInterval(() => {
  for (const r of rooms.values()) for (const p of r.players.values()) if (p.res) p.res.write(': ping\n\n');
}, 20000);

server.listen(PORT, () => console.log('Sintonia rodando em http://localhost:' + PORT));

// ───────────────────────── Cliente (HTML/CSS/JS) ─────────────────────────
const HTML = String.raw`<!doctype html>
<html lang="pt-BR"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sintonia 🎯</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:linear-gradient(160deg,#1e1b4b,#312e81 55%,#0f172a);background-attachment:fixed;color:#f8fafc;min-height:100vh;display:flex;justify-content:center;padding:16px}
#app{width:100%;max-width:560px}
.card{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);border-radius:20px;padding:20px;margin-bottom:12px}
h1{margin:0 0 4px;font-size:30px}
h2{margin:8px 0 14px;font-size:22px;line-height:1.3}
h3{margin:0 0 10px;font-size:15px;opacity:.8;text-transform:uppercase;letter-spacing:.05em}
.sub{opacity:.8;margin:0 0 16px}
input,select{width:100%;padding:14px;border-radius:12px;border:0;font-size:16px;margin-bottom:10px;background:#fff;color:#111}
.btn{display:block;width:100%;min-height:48px;padding:12px 14px;border-radius:12px;border:2px solid transparent;font-size:16px;font-weight:600;cursor:pointer;background:rgba(255,255,255,.15);color:#fff;margin-bottom:8px;text-align:left}
.btn.c{text-align:center}
.btn.primary{background:#f59e0b;color:#1c1917;text-align:center}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn.sel{background:#6366f1;border-color:#fff}
.btn.link{background:none;text-align:center;opacity:.7;font-size:14px;min-height:36px}
.or{text-align:center;opacity:.6;margin:6px 0 12px;font-size:14px}
.row{display:flex;justify-content:space-between;align-items:center;gap:8px}
.bar{height:10px;background:rgba(255,255,255,.15);border-radius:99px;overflow:hidden;margin:8px 0 4px}
.fill{height:100%;background:#f59e0b;width:100%;transition:width .2s linear}
.code{font-size:46px;letter-spacing:8px;font-weight:800;text-align:center;margin:4px 0 12px}
.player{display:flex;justify-content:space-between;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.07);margin-bottom:6px}
.off{opacity:.45}
.res{margin-bottom:12px}
.track{height:30px;background:rgba(255,255,255,.12);border-radius:8px;overflow:hidden;margin-top:4px}
.val{height:100%;background:#6366f1;min-width:3px;transition:width .6s}
.win .val{background:#f59e0b}
.msg{padding:12px;border-radius:12px;background:rgba(255,255,255,.1);margin-bottom:14px;text-align:center;font-weight:600}
.msg.ok{background:rgba(34,197,94,.25)}
.small{font-size:13px;opacity:.75}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#ef4444;color:#fff;padding:12px 18px;border-radius:12px;font-weight:600;max-width:90%;z-index:9}
.rules li{margin-bottom:4px}
</style></head>
<body><div id="app"></div>
<script>
var app = document.getElementById('app');
var S = null, es = null, endAt = 0, roundsChoice = 5;
var session = null;
try { session = JSON.parse(localStorage.getItem('sintonia-session')); } catch (e) {}
var params = new URLSearchParams(location.search);
var preCode = (params.get('sala') || '').toUpperCase();

function h(tag, props) {
  var e = document.createElement(tag);
  props = props || {};
  for (var k in props) {
    var v = props[k];
    if (k === 'class') e.className = v;
    else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), v);
    else if (k === 'style') e.style.cssText = v;
    else if (v !== false && v != null) e[k] = v;
  }
  var kids = Array.prototype.slice.call(arguments, 2);
  (function add(list) {
    list.forEach(function (c) {
      if (Array.isArray(c)) return add(c);
      if (c == null || c === false) return;
      e.append(c.nodeType ? c : document.createTextNode(String(c)));
    });
  })(kids);
  return e;
}
function toast(msg) {
  var t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  setTimeout(function () { t.remove(); }, 3000);
}
function api(path, body) {
  return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Erro'); return j; }); });
}
function act(a) {
  a.room = S.code; a.pid = S.you;
  return api('/api/action', a).catch(function (e) { toast(e.message); });
}
function saveSession() { try { localStorage.setItem('sintonia-session', JSON.stringify(session)); } catch (e) {} }
function clearSession() { session = null; S = null; try { localStorage.removeItem('sintonia-session'); } catch (e) {} if (es) es.close(); es = null; history.replaceState(null, '', '/'); }

function enter(path, body) {
  try { localStorage.setItem('sintonia-name', body.name); } catch (e) {}
  api(path, body).then(function (r) {
    session = { room: r.room, pid: r.pid }; saveSession(); connect();
  }).catch(function (e) { toast(e.message); });
}
function connect() {
  if (es) es.close();
  es = new EventSource('/events?room=' + session.room + '&pid=' + session.pid);
  es.onmessage = function (e) { S = JSON.parse(e.data); endAt = Date.now() + S.timeLeft; render(); };
  es.onerror = function () {
    if (es.readyState === 2) { clearSession(); render(); toast('Sala encerrada ou expirada.'); }
  };
}
function leave() { act({ type: 'leave' }).then(function () { clearSession(); render(); }); }

function nameOf(id) { var p = S.players.find(function (x) { return x.id === id; }); return p ? p.name : '?'; }
function isHost() { return S.hostId === S.you; }
function footer() { return h('button', { class: 'btn link', onclick: leave }, 'Sair da sala'); }

function home() {
  var saved = ''; try { saved = localStorage.getItem('sintonia-name') || ''; } catch (e) {}
  var name = h('input', { placeholder: 'Seu nome', maxLength: 20, value: saved, autocomplete: 'nickname' });
  var code = h('input', { placeholder: 'Código da sala (4 letras)', maxLength: 4, value: preCode, style: 'text-transform:uppercase' });
  var needName = function () { if (!name.value.trim()) { toast('Digite seu nome.'); name.focus(); return false; } return true; };
  return h('div', null,
    h('div', { class: 'card' },
      h('h1', null, '🎯 Sintonia'),
      h('p', { class: 'sub' }, 'Quão em sintonia está a sua equipe? Vote em colegas e descubra.'),
      name,
      h('button', { class: 'btn primary', onclick: function () { if (needName()) enter('/api/create', { name: name.value }); } }, 'Criar sala'),
      h('div', { class: 'or' }, 'ou entre em uma sala'),
      code,
      h('button', { class: 'btn c', onclick: function () { if (needName()) enter('/api/join', { name: name.value, room: code.value }); } }, 'Entrar')
    ),
    h('div', { class: 'card' },
      h('h3', null, 'Como jogar'),
      h('ul', { class: 'rules', style: 'margin:0;padding-left:18px' },
        h('li', null, 'Cada rodada traz uma pergunta sobre a equipe.'),
        h('li', null, 'Vote em segredo em um colega (não vale em si mesmo).'),
        h('li', null, 'O mais votado ganha 👑.'),
        h('li', null, 'Quem votou no mais votado ganha 1 ponto de sintonia.')
      )
    )
  );
}

function lobby() {
  var link = location.origin + '/?sala=' + S.code;
  var sel = h('select', { onchange: function (e) { roundsChoice = Number(e.target.value); } },
    [3, 5, 8, 10].map(function (n) { return h('option', { value: n, selected: n === roundsChoice }, n + ' rodadas'); }));
  return h('div', null,
    h('div', { class: 'card' },
      h('h3', null, 'Código da sala'),
      h('div', { class: 'code' }, S.code),
      h('button', { class: 'btn c', onclick: function () {
        if (navigator.clipboard) navigator.clipboard.writeText(link).then(function () { toast('Link copiado!'); }, function () { prompt('Copie o link:', link); });
        else prompt('Copie o link:', link);
      } }, '🔗 Copar link do convite'.replace('Copar', 'Copiar')),
      h('div', { class: 'small', style: 'text-align:center' }, link)
    ),
    h('div', { class: 'card' },
      h('h3', null, 'Jogadores (' + S.players.length + ')'),
      S.players.map(function (p) {
        return h('div', { class: 'player' + (p.connected ? '' : ' off') },
          h('span', null, p.name + (p.id === S.you ? ' (você)' : '')),
          h('span', null, p.id === S.hostId ? '⭐ anfitrião' : ''));
      })
    ),
    isHost()
      ? h('div', { class: 'card' }, sel,
          h('button', { class: 'btn primary', disabled: S.players.length < 2, onclick: function () { act({ type: 'start', rounds: roundsChoice }); } },
            S.players.length < 2 ? 'Aguardando mais jogadores…' : 'Começar jogo'))
      : h('div', { class: 'msg' }, 'Aguardando o anfitrião iniciar…'),
    footer()
  );
}

function voting() {
  var others = S.players.filter(function (p) { return p.id !== S.you; });
  var online = S.players.filter(function (p) { return p.connected; });
  var voted = online.filter(function (p) { return p.voted; }).length;
  return h('div', null,
    h('div', { class: 'card' },
      h('div', { class: 'row small' }, h('span', null, 'Rodada ' + S.round + '/' + S.totalRounds), h('span', { id: 'timer' }, '')),
      h('div', { class: 'bar' }, h('div', { class: 'fill', id: 'fill' })),
      h('h2', null, S.prompt),
      others.map(function (p) {
        return h('button', { class: 'btn' + (S.myVote === p.id ? ' sel' : ''), onclick: function () { act({ type: 'vote', target: p.id }); } },
          (S.myVote === p.id ? '✓ ' : '') + p.name);
      }),
      h('div', { class: 'small', style: 'text-align:center' }, voted + '/' + online.length + ' já votaram — você pode mudar seu voto até o fim.'),
      isHost() ? h('button', { class: 'btn c', style: 'margin-top:10px', onclick: function () { act({ type: 'reveal' }); } }, 'Revelar agora') : null
    ),
    footer()
  );
}

function reveal() {
  var r = S.result;
  var sorted = S.players.slice().sort(function (a, b) { return (r.counts[b.id] || 0) - (r.counts[a.id] || 0); });
  var mine = r.matched.indexOf(S.you) >= 0;
  var msg = !r.winners.length ? 'Ninguém votou nesta rodada 😅'
    : mine ? '✨ Em sintonia! Você ganhou +1 ponto'
    : S.myVote ? 'Dessa vez você não acompanhou o grupo.' : 'Você não votou nesta rodada.';
  var last = S.round >= S.totalRounds;
  return h('div', null,
    h('div', { class: 'card' },
      h('div', { class: 'small' }, 'Rodada ' + S.round + '/' + S.totalRounds),
      h('h2', null, S.prompt),
      h('div', { class: 'msg' + (mine ? ' ok' : '') }, msg),
      sorted.map(function (p) {
        var n = r.counts[p.id] || 0, win = r.winners.indexOf(p.id) >= 0;
        return h('div', { class: 'res' + (win ? ' win' : '') },
          h('div', { class: 'row' }, h('span', null, (win ? '👑 ' : '') + p.name), h('span', null, n + (n === 1 ? ' voto' : ' votos'))),
          h('div', { class: 'track' }, h('div', { class: 'val', style: 'width:' + (r.max ? (n / r.max) * 100 : 0) + '%' })));
      })
    ),
    h('div', { class: 'card' },
      h('h3', null, 'Pontos de sintonia'),
      S.players.slice().sort(function (a, b) { return b.score - a.score; }).map(function (p) {
        return h('div', { class: 'player' }, h('span', null, p.name), h('span', null, p.score + ' pts'));
      })
    ),
    isHost()
      ? h('button', { class: 'btn primary', onclick: function () { act({ type: 'next' }); } }, last ? 'Ver resultado final' : 'Próxima rodada')
      : h('div', { class: 'msg' }, 'Aguardando o anfitrião…'),
    footer()
  );
}

function end() {
  var rank = S.players.slice().sort(function (a, b) { return b.score - a.score || b.received - a.received; });
  var maxRec = Math.max.apply(null, S.players.map(function (p) { return p.received; }));
  var stars = maxRec > 0 ? S.players.filter(function (p) { return p.received === maxRec; }).map(function (p) { return p.name; }).join(', ') : null;
  var medals = ['🥇', '🥈', '🥉'];
  return h('div', null,
    h('div', { class: 'card' },
      h('h1', null, '🏆 Fim de jogo'),
      h('p', { class: 'sub' }, 'Ranking de sintonia'),
      rank.map(function (p, i) {
        return h('div', { class: 'player' }, h('span', null, (medals[i] || (i + 1) + 'º') + ' ' + p.name), h('span', null, p.score + ' pts'));
      }),
      stars ? h('div', { class: 'msg', style: 'margin-top:12px' }, '👑 Mais votado: ' + stars + ' (' + maxRec + ' votos)') : null
    ),
    isHost()
      ? h('button', { class: 'btn primary', onclick: function () { act({ type: 'restart' }); } }, 'Jogar de novo')
      : h('div', { class: 'msg' }, 'Aguardando o anfitrião…'),
    footer()
  );
}

function render() {
  var view = !S ? home() : S.phase === 'lobby' ? lobby() : S.phase === 'voting' ? voting() : S.phase === 'reveal' ? reveal() : end();
  app.replaceChildren(view);
  tick();
}
function tick() {
  if (!S || S.phase !== 'voting') return;
  var f = document.getElementById('fill'), t = document.getElementById('timer');
  if (!f) return;
  var left = Math.max(0, endAt - Date.now());
  f.style.width = (left / (S.voteSeconds * 1000)) * 100 + '%';
  t.textContent = '⏱ ' + Math.ceil(left / 1000) + 's';
}
setInterval(tick, 200);

if (session) connect();
render();
</script></body></html>`;
