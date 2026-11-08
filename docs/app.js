/* ============================================================
   CINE FAMÍLIA ADCG — interface
   ============================================================ */
const CFG = window.CINE_CONFIG || {};
const EVENTO = Object.assign({
  titulo: 'Cine Família ADCG',
  filme: 'A Virada: Ignição da Alma',
  data: '2026-11-23', hora: '19:30',
  local: 'UCI Park Shopping Campo Grande',
  maxPessoas: 12,
}, CFG.evento || {});

let store;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtData = () => { const [y, m, d] = EVENTO.data.split('-'); const dt = new Date(+y, m - 1, +d); return dt.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }); };
const pct = (a, b) => b ? Math.round(a * 100 / b) : 0;
const congById = id => store.congs.find(c => c.id === id);
const sortSeats = ids => [...ids].sort((a, b) => a.localeCompare(b, 'pt', { numeric: true }));
const seatsTxt = ids => { const by = {}; sortSeats(ids).forEach(id => { const r = id.match(/^[A-Z]+/)[0]; (by[r] = by[r] || []).push(+id.slice(r.length)); }); return Object.entries(by).map(([r, ns]) => `Fileira ${r}: ${ns.join(', ')}`).join(' · '); };
const CONG_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb923c', '#22d3ee', '#a3e635', '#f87171', '#c084fc', '#2dd4bf', '#facc15', '#e879f9', '#4ade80', '#38bdf8', '#fda4af'];
const congColor = id => { const k = store.congs.findIndex(c => c.id === id); return k < 0 ? '#64748b' : CONG_COLORS[k % CONG_COLORS.length]; };
const baseURL = () => (location.protocol.startsWith('http') && store.mode === 'firebase') ? location.origin + location.pathname : null;
const linkCong = c => baseURL() ? `${baseURL()}?c=${c.token}` : null;
const linkBil = code => baseURL() ? `${baseURL()}?t=${code}` : null;

/* ---------------- estado da interface ---------------- */
const app = {
  view: 'home', token: null, cong: null, insc: [], unInsc: null,
  all: [], unAll: null,
  wiz: null,            // fluxo de nova família / trocar lugares
  ticket: null,
  admTab: 'geral', admSala: 1, paint: { tool: 'area', congId: '', anchor: null }, admBusy: '',
  zoom: 1, busca: '',
};

/* ---------------- utilitários de UI ---------------- */
function toast(msg, kind = 'ok') {
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.classList.add('out'), 3800); setTimeout(() => t.remove(), 4300);
}
function modal(html, { wide } = {}) {
  return new Promise(res => {
    const m = document.createElement('div'); m.className = 'modal-bg';
    m.innerHTML = `<div class="modal ${wide ? 'wide' : ''}">${html}</div>`;
    document.body.appendChild(m);
    m.addEventListener('click', e => {
      const b = e.target.closest('[data-res]');
      if (b) { const v = b.dataset.res; const fm = m.querySelector('form'); modal.vals = fm ? Object.fromEntries(new FormData(fm)) : null; m.remove(); res(v === 'ok' ? (m.querySelector('[data-val]')?.value ?? true) : v === 'cancel' ? false : v); }
      else if (e.target === m) { m.remove(); res(false); }
    });
    m.querySelector('[data-copy]')?.addEventListener('click', ev => copiar(m.querySelector('[data-val]').value, ev.target));
  });
}
const confirmar = (titulo, texto, ok = 'Confirmar', perigo) => modal(`<h3>${titulo}</h3><p class="muted">${texto}</p><div class="row end"><button class="btn ghost" data-res="cancel">Voltar</button><button class="btn ${perigo ? 'danger' : 'primary'}" data-res="ok">${ok}</button></div>`);
async function copiar(txt, btn) {
  try { await navigator.clipboard.writeText(txt); toast('Copiado!'); if (btn) { const o = btn.textContent; btn.textContent = 'Copiado ✓'; setTimeout(() => btn.textContent = o, 1500); } }
  catch (e) { toast('Não foi possível copiar automaticamente. Selecione o texto e copie.', 'warn'); }
}
function baixar(nome, conteudo, mime) {
  modal(`<h3>Exportar ${esc(nome)}</h3><p class="muted">Abra no Excel ou Google Planilhas. Se o download não iniciar, use “Copiar”.</p>
    <textarea data-val readonly rows="8" class="mono">${esc(conteudo)}</textarea>
    <div class="row end"><button class="btn ghost" data-res="cancel">Fechar</button><button class="btn ghost" data-copy>Copiar</button><button class="btn primary" id="dlbtn">Baixar arquivo</button></div>`, { wide: true });
  setTimeout(() => {
    const b = document.getElementById('dlbtn'); if (!b) return;
    b.onclick = () => { try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + conteudo], { type: mime })); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); } catch (e) { toast('Download bloqueado neste ambiente — use Copiar.', 'warn'); } };
  });
}
function qrSVG(text, cell = 4) {
  if (typeof qrcode === 'undefined') return '';
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
}
const go = (view, extra = {}) => { Object.assign(app, extra, { view }); render(); window.scrollTo(0, 0); };

/* ============================================================
   MAPA DE ASSENTOS
   modo 'reserva' | 'admin' | 'ver'
   ============================================================ */
function mapaHTML(sala, modo, ctx = {}) {
  const L = SALA[sala], room = store.rooms[sala] || { seats: {} };
  const step = 30 * app.zoom, sz = 26 * app.zoom;
  let maxX = 0, maxY = 0;
  Object.values(SEATS[sala]).forEach(s => { maxX = Math.max(maxX, s.x); maxY = Math.max(maxY, s.y); });
  const W = (maxX + 1) * step, H = (maxY + 1) * step * 1.08;
  const sel = new Set(ctx.sel || []);
  let h = `<div class="map" style="--sz:${sz}px;width:${W + 2 * step + 16}px">`;
  h += `<div class="seats" style="width:${W}px;height:${H}px;margin-left:${step + 8}px">`;
  ROWSEQ[sala].forEach(row => {
    const top = row.y * step * 1.08;
    h += `<span class="rl" style="top:${top}px;left:${-step - 4}px" ${modo === 'admin' ? `data-act="paintRow" data-row="${row.r}"` : ''}>${row.r}</span>`;
    h += `<span class="rl" style="top:${top}px;left:${W + 4}px" ${modo === 'admin' ? `data-act="paintRow" data-row="${row.r}"` : ''}>${row.r}</span>`;
    row.ids.forEach(id => {
      const s = SEATS[sala][id], st = room.seats[id] || {};
      let cls = 'seat t' + s.t, style = '', dis = false, title = `${id}`;
      if (modo === 'reserva') {
        if (sel.has(id)) cls += ' sel';
        else if (st.b) { cls += ' blk'; dis = true; }
        else if (st.i && st.i === ctx.code) cls += ' own';
        else if (st.i) { cls += ' res'; dis = true; title += ' · reservado'; }
        else if (st.a !== ctx.congId) { cls += ' off'; dis = true; }
        else cls += ' free';
      } else if (modo === 'admin') {
        if (st.a) style = `--c:${congColor(st.a)}`;
        cls += st.a ? ' area' : ' none';
        if (st.b) cls += ' blk';
        if (st.i) cls += ' resd';
        if (app.paint.anchor === id) cls += ' anchor';
        if (ctx.hl && ctx.hl.has(id)) cls += ' hl';
        title += st.a ? ` · ${congById(st.a)?.nome || ''}` : ' · sem área';
        if (st.i) title += ` · reservado (${st.i})`;
      } else {
        cls += sel.has(id) ? ' sel' : ' dim';
        dis = true;
      }
      const lab = s.t === 'W' ? '♿&#xFE0E;' : s.t === 'A' ? 'AC' : s.t === 'O' ? '↔' : (app.zoom >= 1.25 ? s.n : '');
      h += `<button class="${cls}" style="left:${s.x * step}px;top:${top}px;${style}" title="${esc(title)}" data-act="seat" data-id="${id}" ${dis ? 'disabled' : ''}>${lab}</button>`;
    });
  });
  h += `</div><div class="tela" style="margin-left:${step + 8}px;width:${W}px">TELA</div></div>`;
  return h;
}
function mapaFrame(sala, modo, ctx, live) {
  return `<div class="mapwrap"><div class="maptools"><span class="sala-tag" style="--c:${SALA[sala].cor}">${esc(SALA[sala].nome)}</span>
    <span class="grow"></span><button class="btn icon" data-act="zoom" data-z="-1" aria-label="Diminuir">−</button><button class="btn icon" data-act="zoom" data-z="1" aria-label="Aumentar">+</button></div>
    <div class="mapscroll"><div data-live="${live}">${mapaHTML(sala, modo, ctx)}</div></div></div>`;
}
function legenda(modo) {
  if (modo === 'admin') return `<div class="legend"><span><i class="sw none"></i>Sem área</span><span><i class="sw area"></i>Área da congregação (cor)</span><span><i class="sw resd"></i>Reservado</span><span><i class="sw blk"></i>Bloqueado</span><span><i class="sw tW">♿&#xFE0E;</i>Cadeirante</span><span><i class="sw tA">AC</i>Acompanhante</span><span><i class="sw tO">↔</i>Obeso</span></div>`;
  return `<div class="legend"><span><i class="sw free"></i>Livre (sua congregação)</span><span><i class="sw sel"></i>Selecionado</span><span><i class="sw res"></i>Ocupado</span><span><i class="sw off"></i>Outra congregação</span><span><i class="sw free tW">♿&#xFE0E;</i>PCD / especial</span></div>`;
}

/* ============================================================
   TELAS
   ============================================================ */
function header() {
  return `<header class="top"><button class="brand" data-act="home"><span class="logo">🎬</span><span><b>${esc(EVENTO.titulo)}</b><small>${esc(EVENTO.filme)}</small></span></button>
    ${store.mode === 'demo' ? '<span class="pill warn">Demonstração</span>' : ''}</header>`;
}

function vHome() {
  const tot = LAYOUTS.reduce((a, L) => { const s = statsSala(store.rooms[L.id], L.id); a.t += s.total - s.bloq; a.r += s.res; return a; }, { t: 0, r: 0 });
  return `${header()}
  <section class="hero"><img src="${POSTER}" alt="Cartaz do filme ${esc(EVENTO.filme)}"><div>
    <span class="kicker">Sessão exclusiva · Cine Família</span>
    <h1>${esc(EVENTO.filme)}</h1>
    <p class="big">${esc(fmtData())} · <b>${esc(EVENTO.hora)}</b></p>
    <p class="muted">${esc(EVENTO.local)} · 7 salas reservadas</p>
    <div class="meter"><div style="width:${pct(tot.r, tot.t)}%"></div></div>
    <p class="small muted"><b>${tot.r}</b> de ${tot.t} lugares já reservados</p>
  </div></section>
  <section class="cards3">
    <form class="card" data-form="entrarCong"><h3>Sou de uma congregação</h3><p class="muted small">Use o link recebido da coordenação ou digite o código de acesso.</p>
      <input name="tk" placeholder="Código de acesso da congregação" autocomplete="off" required><button class="btn primary block">Entrar</button>
      ${store.mode === 'demo' ? `<p class="small muted">Demonstração: <a href="#" data-act="demoCong">entrar como “${esc(store.congs[1]?.nome || '')}”</a></p>` : ''}</form>
    <form class="card" data-form="verBilhete"><h3>Meu bilhete</h3><p class="muted small">Digite o código do bilhete da sua família para ver sala e assentos.</p>
      <input name="code" placeholder="Ex.: 7KQ2M9P" autocomplete="off" required style="text-transform:uppercase"><button class="btn block">Ver bilhete</button></form>
    <div class="card"><h3>Coordenação</h3><p class="muted small">Painel com ocupação em tempo real, áreas das congregações, relatórios e check-in.</p>
      <button class="btn block" data-act="${store.isAdmin ? 'admin' : 'adminLogin'}">${store.isAdmin ? 'Abrir painel' : 'Entrar como administrador'}</button></div>
  </section>
  <section class="card how"><h3>Como funciona</h3><ol>
    <li><b>A coordenação</b> define a área de cada congregação no mapa das salas (manual ou automática pela cota).</li>
    <li><b>Cada congregação</b> recebe um link único e cadastra suas famílias, escolhendo os lugares lado a lado dentro da sua área.</li>
    <li><b>Cada família</b> recebe um bilhete com QR Code, sala (com cor) e assentos — no dia, é só chegar e sentar.</li></ol></section>`;
}

/* ---------------- Congregação ---------------- */
function congStats() {
  const c = app.cong, out = { area: 0, res: 0, salas: [] };
  LAYOUTS.forEach(L => {
    const room = store.rooms[L.id]; if (!room) return; let a = 0, r = 0;
    Object.entries(room.seats).forEach(([id, st]) => { if (st.a === c.id && !st.b) { a++; if (st.i) r++; } });
    if (a) out.salas.push({ sala: L.id, area: a, res: r });
    out.area += a; out.res += r;
  });
  out.pessoas = app.insc.reduce((t, i) => t + (+i.qtd || 0), 0);
  out.semLugar = app.insc.filter(i => !i.sala).length;
  return out;
}
function vCong() {
  const c = app.cong, s = congStats();
  return `${header()}
  <section class="pagehead"><div><span class="kicker">Congregação</span><h2>${esc(c.nome)}</h2></div>
    <div class="row"><button class="btn ghost sm" data-act="sairCong">Sair</button><button class="btn primary" data-act="novaFamilia">+ Cadastrar família</button></div></section>
  <div data-live="congKpis">${congKpis(s)}</div>
  <div data-live="congList">${congList()}</div>`;
}
function congKpis(s) {
  return `<section class="kpis">
    <div class="kpi"><b>${s.area}</b><span>lugares na área</span></div>
    <div class="kpi"><b>${s.res}</b><span>reservados</span></div>
    <div class="kpi"><b>${Math.max(0, s.area - s.res)}</b><span>disponíveis</span></div>
    <div class="kpi"><b>${app.insc.length}</b><span>famílias · ${s.pessoas} pessoas</span></div></section>
    ${s.area ? `<p class="small muted">Área: ${s.salas.map(x => `<span class="sala-dot" style="--c:${SALA[x.sala].cor}"></span>${esc(SALA[x.sala].nome)} (${x.area})`).join(' · ')}</p>`
      : `<div class="note">A coordenação ainda não definiu a área da sua congregação no mapa. Você já pode cadastrar as famílias — os lugares poderão ser escolhidos (ou distribuídos automaticamente) assim que a área for liberada.</div>`}
    ${s.semLugar ? `<div class="note warn">${s.semLugar} família(s) ainda sem lugar escolhido.</div>` : ''}`;
}
function congList() {
  if (!app.insc.length) return `<div class="empty card">Nenhuma família cadastrada ainda.<br><button class="btn primary" data-act="novaFamilia">Cadastrar a primeira família</button></div>`;
  const list = [...app.insc].sort((a, b) => a.criadoEm - b.criadoEm);
  return `<section class="list">${list.map(i => `<div class="item">
    <div class="grow"><b>${esc(i.responsavel)}</b> <span class="muted small">· ${i.qtd} pessoa(s)</span>
      <div class="small">${i.sala ? `<span class="sala-dot" style="--c:${SALA[i.sala].cor}"></span>${esc(SALA[i.sala].nome)} · ${seatsTxt(i.assentos)}` : '<span class="pill warn">sem lugar</span>'}
      ${i.checkin ? ' <span class="pill ok">entrou</span>' : ''}</div></div>
    <div class="row">${i.sala ? `<button class="btn sm" data-act="abrirBilhete" data-code="${i.code}">Bilhete</button>` : ''}
      <button class="btn sm ghost" data-act="trocarLugares" data-code="${i.code}">${i.sala ? 'Trocar lugares' : 'Escolher lugares'}</button>
      <button class="btn sm ghost" data-act="editarFamilia" data-code="${i.code}">Editar</button>
      <button class="btn sm ghost danger-t" data-act="cancelarFamilia" data-code="${i.code}">Excluir</button></div></div>`).join('')}</section>`;
}

/* ---------------- Assistente: família + lugares ---------------- */
function vWizard() {
  const w = app.wiz;
  if (w.step === 1) return `${header()}
  <section class="pagehead"><div><span class="kicker">${esc(app.cong.nome)}</span><h2>${w.code ? 'Editar família' : 'Nova família'}</h2></div></section>
  <form class="card form" data-form="wizDados">
    <label>Nome do responsável<input name="responsavel" required value="${esc(w.dados.responsavel)}" placeholder="Ex.: Maria da Silva"></label>
    <label>Telefone / WhatsApp<input name="telefone" inputmode="tel" value="${esc(w.dados.telefone)}" placeholder="(21) 9...."></label>
    <label>Quantas pessoas vão sentar juntas? <span class="muted small">(incluindo o responsável${w.code && w.sala ? ' — para mudar a quantidade, troque os lugares depois' : ''})</span>
      <div class="stepper"><button type="button" class="btn icon" data-act="qtd" data-d="-1">−</button><input name="qtd" type="number" min="1" max="${EVENTO.maxPessoas}" value="${w.dados.qtd}" required><button type="button" class="btn icon" data-act="qtd" data-d="1">+</button></div></label>
    <label>Nomes dos acompanhantes <span class="muted small">(opcional, um por linha)</span><textarea name="nomes" rows="3">${esc((w.dados.nomes || []).join('\n'))}</textarea></label>
    <label>Observações <span class="muted small">(ex.: cadeirante, criança de colo)</span><input name="obs" value="${esc(w.dados.obs || '')}"></label>
    <div class="row end"><button type="button" class="btn ghost" data-act="voltarCong">Cancelar</button>
      ${w.code ? '<button class="btn primary">Salvar</button>' : '<button class="btn primary">Continuar → escolher lugares</button>'}</div>
  </form>`;
  const salas = congStats().salas;
  if (!salas.length) return `${header()}<section class="card empty"><h3>Família cadastrada ✓</h3><p class="muted">A área da sua congregação ainda não foi definida. Assim que a coordenação liberar, você poderá escolher os lugares em “Escolher lugares”.</p><button class="btn primary" data-act="voltarCong">Voltar para a lista</button></section>`;
  if (!w.sala || !salas.find(x => x.sala === w.sala)) w.sala = salas[0].sala;
  const n = +w.dados.qtd;
  return `${header()}
  <section class="pagehead"><div><span class="kicker">${esc(app.cong.nome)} · ${esc(w.dados.responsavel)}</span><h2>Escolha ${n} lugar${n > 1 ? 'es' : ''} lado a lado</h2></div></section>
  ${salas.length > 1 ? `<div class="tabs">${salas.map(x => `<button class="tab ${x.sala === w.sala ? 'on' : ''}" data-act="wizSala" data-sala="${x.sala}" style="--c:${SALA[x.sala].cor}">${esc(SALA[x.sala].nome)}</button>`).join('')}</div>` : ''}
  <p class="small muted">Toque no primeiro assento: o sistema seleciona automaticamente ${n > 1 ? `os ${n} lugares seguidos` : 'o lugar'}. Toque em um selecionado para desmarcar.</p>
  ${mapaFrame(w.sala, 'reserva', { congId: app.cong.id, sel: w.sel, code: w.code }, 'wizMap')}
  ${legenda('reserva')}
  <div class="sticky-bar"><div class="grow"><b data-live="wizCount">${wizCount()}</b></div>
    <button class="btn ghost" data-act="sugerir">Sugerir lugares</button>
    <button class="btn primary" data-act="confirmarLugares">Confirmar</button></div>
  <div class="row">${w.code ? '<button class="btn ghost sm" data-act="voltarCong">← Voltar sem alterar</button>'
    : '<button class="btn ghost sm" data-act="voltarCong">← Cancelar cadastro</button><button class="btn ghost sm" data-act="salvarSemLugar">Salvar a família e escolher lugares depois</button>'}</div>`;
}
const wizCount = () => { const w = app.wiz; return `${w.sel.length}/${w.dados.qtd} selecionados${w.sel.length ? ' · ' + seatsTxt(w.sel) : ''}`; };

function selecionarAPartir(id) {
  const w = app.wiz, sala = w.sala, room = store.rooms[sala], n = +w.dados.qtd;
  const ok = x => { const st = room.seats[x] || {}; return !st.b && (!st.i || st.i === w.code) && st.a === app.cong.id; };
  if (w.sel.includes(id)) { w.sel = w.sel.filter(x => x !== id); return; }
  if (w.sel.length && w.sel.length < n) { w.sel.push(id); return; }
  const row = ROWSEQ[sala].find(r => r.r === SEATS[sala][id].r).ids;
  const k = row.indexOf(id), pick = [id];
  for (let j = k + 1; j < row.length && pick.length < n && ok(row[j]) && adj(sala, row[j - 1], row[j]); j++) pick.push(row[j]);
  for (let j = k - 1; j >= 0 && pick.length < n && ok(row[j]) && adj(sala, row[j], row[j + 1]); j--) pick.unshift(row[j]);
  w.sel = pick;
  if (pick.length < n) toast(`Só cabem ${pick.length} lugar(es) seguidos aqui. Selecione os demais na fileira vizinha ou use “Sugerir lugares”.`, 'warn');
}
function contiguo(sala, ids) {
  const s = sortSeats(ids).map(id => SEATS[sala][id]);
  if (new Set(s.map(x => x.r)).size > 1) return false;
  const row = ROWSEQ[sala].find(r => r.r === s[0].r).ids;
  const idx = s.map(x => row.indexOf(x.id)).sort((a, b) => a - b);
  for (let k = 1; k < idx.length; k++) if (idx[k] !== idx[k - 1] + 1 || !adj(sala, row[idx[k - 1]], row[idx[k]])) return false;
  return true;
}

/* ---------------- Bilhete ---------------- */
function vTicket() {
  const b = app.ticket;
  if (!b || b.cancelado) return `${header()}<section class="card empty"><h3>Bilhete não encontrado</h3><p class="muted">Confira o código ou fale com o responsável da sua congregação.</p><button class="btn" data-act="home">Voltar</button></section>`;
  const L = b.sala ? SALA[b.sala] : null;
  const qrTxt = linkBil(b.code) || ('CINEFAMILIA:' + b.code);
  return `${header()}
  <article class="ticket" style="--c:${L ? L.cor : '#64748b'}">
    <div class="t-head"><img src="${POSTER}" alt=""><div><span class="kicker">${esc(EVENTO.titulo)}</span><h2>${esc(EVENTO.filme)}</h2>
      <p>${esc(fmtData())} · <b>${esc(EVENTO.hora)}</b><br>${esc(EVENTO.local)}</p></div></div>
    <div class="t-sala"><span>SALA</span><b>${L ? L.id : '—'}</b><em>${L ? 'Cor ' + esc(L.corNome) + (L.id === 1 ? ' · XPLUS' : '') : 'lugar a definir'}</em></div>
    <div class="t-body">
      <div><small>Responsável</small><b>${esc(b.nome)}</b></div>
      <div><small>Congregação</small><b>${esc(b.congNome)}</b></div>
      <div><small>Pessoas</small><b>${b.qtd}</b></div>
      <div class="full"><small>Assentos</small><b class="seats-big">${b.sala ? esc(seatsTxt(b.assentos)) : 'Aguardando definição'}</b></div>
    </div>
    <div class="t-qr">${qrSVG(qrTxt, 5)}<div><small>Código do bilhete</small><b class="code">${b.code}</b>${b.checkin ? '<span class="pill ok">Entrada confirmada</span>' : '<p class="small muted">Apresente este QR Code na entrada.</p>'}</div></div>
  </article>
  ${L ? `<details class="card"><summary>Ver onde ficam os lugares na sala</summary>${mapaFrame(b.sala, 'ver', { sel: b.assentos }, 'tkMap')}</details>` : ''}
  <div class="row center noprint">
    <button class="btn primary" data-act="imprimir">Salvar PDF / imprimir</button>
    ${linkBil(b.code) ? `<a class="btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`🎬 ${EVENTO.titulo} – ${EVENTO.filme}\n${fmtData()} às ${EVENTO.hora}\nSala ${b.sala} · ${seatsTxt(b.assentos)}\nBilhete: ${linkBil(b.code)}`)}">Enviar no WhatsApp</a>` : ''}
    <button class="btn ghost" data-act="${app.cong ? 'voltarCong' : 'home'}">Voltar</button></div>`;
}

/* ============================================================
   ADMINISTRAÇÃO
   ============================================================ */
function vAdminLogin() {
  return `${header()}<form class="card form narrow" data-form="adminLogin"><h2>Coordenação</h2>
    <label>E-mail<input name="email" type="email" ${store.mode === 'demo' ? 'value="coordenacao@adcg.org"' : 'required'}></label>
    <label>Senha<input name="senha" type="password" required></label>
    ${store.mode === 'demo' ? '<p class="small muted">Demonstração: senha <b>1234</b>.</p>' : ''}
    <div class="row end"><button type="button" class="btn ghost" data-act="home">Voltar</button><button class="btn primary">Entrar</button></div></form>`;
}
function vAdmin() {
  const tabs = [['geral', 'Visão geral'], ['mapa', 'Mapa e áreas'], ['congs', 'Congregações'], ['insc', 'Inscrições'], ['checkin', 'Check-in']];
  return `${header()}
  <section class="pagehead"><div><span class="kicker">Coordenação</span><h2>Painel do evento</h2></div>
    <div class="row">${store.mode === 'demo' ? '<button class="btn sm ghost" data-act="resetDemo">Reiniciar demonstração</button>' : ''}<button class="btn sm ghost" data-act="logout">Sair</button></div></section>
  <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${app.admTab === k ? 'on' : ''}" data-act="admTab" data-tab="${k}">${l}</button>`).join('')}</div>
  ${app.admBusy ? `<div class="note">${esc(app.admBusy)}</div>` : ''}
  ${({ geral: aGeral, mapa: aMapa, congs: aCongs, insc: aInsc, checkin: aCheckin })[app.admTab]()}`;
}

function aGeral() { return `<div data-live="admGeral">${aGeralBody()}</div>`; }
function aGeralBody() {
  if (!Object.keys(store.rooms).length) return `<div class="card empty"><h3>Salas ainda não criadas</h3><p class="muted">Crie as 7 salas no banco de dados a partir das plantas.</p><button class="btn primary" data-act="initRooms">Criar salas</button></div>`;
  const T = { total: 0, bloq: 0, area: 0, res: 0, livre: 0 };
  const rows = LAYOUTS.map(L => { const s = statsSala(store.rooms[L.id], L.id); Object.keys(T).forEach(k => T[k] += s[k]); return [L, s]; });
  const util = T.total - T.bloq;
  const pessoas = app.all.reduce((t, i) => t + (+i.qtd || 0), 0);
  const semLugar = app.all.filter(i => !i.sala);
  const entr = app.all.filter(i => i.checkin).reduce((t, i) => t + (+i.qtd || 0), 0);
  return `<section class="kpis">
    <div class="kpi"><b>${util}</b><span>lugares utilizáveis <em>(${T.total} físicos, ${T.bloq} bloqueados)</em></span></div>
    <div class="kpi"><b>${T.res}</b><span>reservados · ${pct(T.res, util)}%</span></div>
    <div class="kpi"><b>${util - T.res}</b><span>disponíveis</span></div>
    <div class="kpi"><b>${T.area}</b><span>já em áreas de congregações</span></div>
    <div class="kpi"><b>${app.all.length}</b><span>famílias · ${pessoas} pessoas</span></div>
    <div class="kpi"><b>${entr}</b><span>pessoas com entrada confirmada</span></div></section>
  ${semLugar.length ? `<div class="note warn">${semLugar.length} família(s) (${semLugar.reduce((t, i) => t + +i.qtd, 0)} pessoas) cadastradas sem lugar. <button class="btn sm" data-act="autoFamilias">Acomodar automaticamente</button></div>` : ''}
  <section class="card"><h3>Ocupação por sala</h3>${rows.map(([L, s]) => {
    const u = s.total - s.bloq; return `<div class="barrow"><span class="sala-tag" style="--c:${L.cor}">${esc(L.nome)}</span>
    <div class="bar"><div class="b-res" style="width:${pct(s.res, u)}%"></div><div class="b-area" style="width:${pct(s.area - s.res, u)}%"></div></div>
    <span class="small"><b>${s.res}</b>/${u} · ${pct(s.res, u)}%</span></div>`;
  }).join('')}
  <div class="legend"><span><i class="sw" style="background:var(--gold)"></i>Reservado</span><span><i class="sw" style="background:#3b4a7a"></i>Área definida, ainda livre</span><span><i class="sw" style="background:#1d2540"></i>Sem área</span></div></section>
  <section class="card"><div class="row"><h3 class="grow">Por congregação</h3><button class="btn sm" data-act="csvCongs">Exportar CSV</button><button class="btn sm" data-act="csvInsc">Exportar inscrições</button></div>
  ${tabelaCongs()}</section>`;
}
function resumoCongs() {
  const m = {}; store.congs.forEach(c => m[c.id] = { c, area: 0, res: 0, fam: 0, pes: 0, salas: new Set() });
  LAYOUTS.forEach(L => { const r = store.rooms[L.id]; if (!r) return; Object.values(r.seats).forEach(st => { if (st.a && m[st.a] && !st.b) { m[st.a].area++; m[st.a].salas.add(L.id); if (st.i) m[st.a].res++; } }); });
  app.all.forEach(i => { if (m[i.congId]) { m[i.congId].fam++; m[i.congId].pes += +i.qtd || 0; } });
  return Object.values(m).sort((a, b) => a.c.nome.localeCompare(b.c.nome, 'pt'));
}
function tabelaCongs() {
  const q = app.busca.toLowerCase();
  const r = resumoCongs().filter(x => !q || x.c.nome.toLowerCase().includes(q));
  return `<input class="search" placeholder="Buscar congregação…" data-input="busca" value="${esc(app.busca)}">
  <div class="tablewrap"><table><thead><tr><th>Congregação</th><th>Cota</th><th>Área</th><th>Reserv.</th><th>Famílias</th><th>Pessoas</th><th>Salas</th></tr></thead><tbody>
  ${r.map(x => `<tr><td><i class="sw" style="background:${congColor(x.c.id)}"></i> ${esc(x.c.nome)}</td><td>${x.c.cota || 0}</td><td class="${x.area < x.pes ? 'bad' : ''}">${x.area}</td><td>${x.res}</td><td>${x.fam}</td><td>${x.pes}</td><td>${[...x.salas].join(', ')}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nenhuma congregação.</td></tr>'}
  </tbody></table></div>`;
}

function aMapa() {
  const sala = app.admSala, p = app.paint;
  const opts = store.congs.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt')).map(c => `<option value="${c.id}" ${p.congId === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');
  return `<div class="tabs">${LAYOUTS.map(L => `<button class="tab ${L.id === sala ? 'on' : ''}" data-act="admSala" data-sala="${L.id}" style="--c:${L.cor}">${L.id === 1 ? 'Sala 1 XPLUS' : esc(L.nome)}</button>`).join('')}</div>
  <section class="card tools">
    <div class="seg">${[['area', 'Pintar área'], ['limpar', 'Apagar área'], ['bloq', 'Bloquear'], ['desbloq', 'Desbloquear']].map(([k, l]) => `<button class="${p.tool === k ? 'on' : ''}" data-act="tool" data-tool="${k}">${l}</button>`).join('')}</div>
    ${p.tool === 'area' ? `<select data-input="paintCong"><option value="">— escolha a congregação —</option>${opts}</select>` : ''}
    <div class="seg small-seg"><button class="${!p.bloco ? 'on' : ''}" data-act="bloco" data-v="0">Um assento por toque</button><button class="${p.bloco ? 'on' : ''}" data-act="bloco" data-v="1">Bloco (1º e último)</button></div>
    <p class="small muted">${p.bloco ? 'Toque no assento inicial e depois no final: aplica a todo o retângulo entre eles.' : 'Cada toque aplica ao assento.'} Toque na letra da fileira para a fileira inteira. Assentos já reservados não são alterados.</p>
    ${p.anchor ? `<div class="note">Início do bloco: <b>${p.anchor}</b> — toque no assento final. <button class="btn sm ghost" data-act="cancelAnchor">cancelar</button></div>` : ''}
  </section>
  ${mapaFrame(sala, 'admin', {}, 'admMap')}
  ${legenda('admin')}
  <section class="card"><h3>Distribuição automática</h3>
    <p class="small muted">Cria as áreas pela <b>cota</b> de cada congregação que ainda não tem área: as maiores primeiro, em blocos contínuos (fundo → frente, em serpentina), sem dividir a congregação entre salas quando possível. Lugares PCD/acompanhante/obeso ficam livres para a coordenação.</p>
    <div class="row wrap">${LAYOUTS.map(L => `<label class="chk"><input type="checkbox" data-salaauto value="${L.id}" checked> ${L.id}</label>`).join('')}</div>
    <div class="row wrap"><button class="btn primary" data-act="autoAreas">Distribuir áreas</button>
      <button class="btn" data-act="autoFamilias">Acomodar famílias sem lugar</button>
      <button class="btn ghost danger-t" data-act="limparSala">Limpar áreas desta sala</button></div></section>`;
}

function aCongs() {
  const q = app.busca.toLowerCase();
  const list = store.congs.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt')).filter(c => !q || c.nome.toLowerCase().includes(q));
  return `<section class="card"><div class="row wrap"><h3 class="grow">${store.congs.length} congregações</h3>
    <button class="btn sm primary" data-act="novaCong">+ Nova</button><button class="btn sm" data-act="importarCongs">Importar lista</button><button class="btn sm" data-act="csvLinks">Exportar links</button><button class="btn sm ghost" data-act="cotaAuto">Cota = inscritos</button></div>
  <input class="search" placeholder="Buscar…" data-input="busca" value="${esc(app.busca)}">
  <div class="list">${list.map(c => `<div class="item"><i class="sw" style="background:${congColor(c.id)}"></i><div class="grow"><b>${esc(c.nome)}</b><div class="small muted">Cota ${c.cota || 0}${c.responsavel ? ' · ' + esc(c.responsavel) : ''}${c.telefone ? ' · ' + esc(c.telefone) : ''}</div></div>
    <div class="row">${linkCong(c) ? `<button class="btn sm" data-act="copiarLink" data-id="${c.id}">Copiar link</button><a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/${(c.telefone || '').replace(/\D/g, '').replace(/^(?!55)(\d{10,11})$/, '55$1')}?text=${encodeURIComponent(`Paz do Senhor! Link do ${EVENTO.titulo} (${EVENTO.filme}) para a ${c.nome} cadastrar as famílias e escolher os lugares:\n${linkCong(c)}`)}">WhatsApp</a>` : `<button class="btn sm" data-act="entrarComo" data-id="${c.id}">Abrir como congregação</button>`}
    <button class="btn sm ghost" data-act="editCong" data-id="${c.id}">Editar</button></div></div>`).join('') || '<p class="muted">Nenhuma.</p>'}</div></section>`;
}

function aInsc() {
  const q = app.busca.toLowerCase();
  const list = app.all.filter(i => !q || (i.responsavel + ' ' + (congById(i.congId)?.nome || '') + ' ' + i.code).toLowerCase().includes(q)).sort((a, b) => (congById(a.congId)?.nome || '').localeCompare(congById(b.congId)?.nome || '', 'pt') || a.responsavel.localeCompare(b.responsavel, 'pt'));
  return `<section class="card"><div class="row wrap"><h3 class="grow">${app.all.length} famílias</h3><button class="btn sm" data-act="csvInsc">Exportar CSV</button></div>
  <input class="search" placeholder="Buscar por nome, congregação ou código…" data-input="busca" value="${esc(app.busca)}">
  <div class="tablewrap"><table><thead><tr><th>Responsável</th><th>Congregação</th><th>Pessoas</th><th>Sala</th><th>Assentos</th><th>Código</th><th></th></tr></thead><tbody>
  ${list.map(i => `<tr><td>${esc(i.responsavel)}${i.obs ? `<div class="small muted">${esc(i.obs)}</div>` : ''}</td><td>${esc(congById(i.congId)?.nome || '?')}</td><td>${i.qtd}</td><td>${i.sala ? `<span class="sala-dot" style="--c:${SALA[i.sala].cor}"></span>${i.sala}` : '<span class="pill warn">—</span>'}</td><td class="small">${sortSeats(i.assentos).join(' ')}</td><td class="mono">${i.code}</td><td>${i.checkin ? '<span class="pill ok">entrou</span>' : ''} <button class="btn sm ghost" data-act="abrirBilhete" data-code="${i.code}">Bilhete</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nenhuma inscrição.</td></tr>'}
  </tbody></table></div></section>`;
}

function aCheckin() {
  const cam = 'BarcodeDetector' in window && navigator.mediaDevices;
  const entr = app.all.filter(i => i.checkin);
  return `<section class="card form narrow"><h3>Validar entrada</h3>
    <form data-form="checkin" class="row"><input name="code" placeholder="Código do bilhete" autocomplete="off" style="text-transform:uppercase" required><button class="btn primary">Buscar</button></form>
    ${cam ? '<button class="btn block" data-act="scan">📷 Ler QR Code com a câmera</button><video id="scanv" playsinline muted hidden></video>' : '<p class="small muted">Leitura por câmera disponível no Chrome do Android; aqui, digite o código.</p>'}
    <div id="ckres"></div></section>
  <section class="card"><h3>${entr.length} famílias · ${entr.reduce((t, i) => t + +i.qtd, 0)} pessoas já entraram</h3>
  <div class="small muted">${entr.slice(-12).reverse().map(i => `${esc(i.responsavel)} (Sala ${i.sala || '—'})`).join(' · ')}</div></section>`;
}

/* ============================================================
   RENDER + ATUALIZAÇÃO EM TEMPO REAL
   ============================================================ */
const VIEWS = { home: vHome, cong: vCong, wiz: vWizard, ticket: vTicket, adminLogin: vAdminLogin, admin: vAdmin };
function render() {
  if (app.view === 'admin' && !store.isAdmin) app.view = 'adminLogin';
  $('#app').innerHTML = VIEWS[app.view]();
  centrarMapa();
}
function centrarMapa() {
  const sc = document.querySelector('.mapscroll'); if (!sc) return;
  const alvo = sc.querySelector('.seat.sel') || sc.querySelector('.seat.free') || sc.querySelector('.seat.area');
  if (!alvo) { sc.scrollLeft = (sc.scrollWidth - sc.clientWidth) / 2; return; }
  const a = alvo.getBoundingClientRect(), c = sc.getBoundingClientRect();
  sc.scrollLeft += a.left - c.left - c.width / 2;
  sc.scrollTop += a.top - c.top - c.height / 2;
}
const LIVE = {
  congKpis: () => congKpis(congStats()), congList,
  wizMap: () => mapaHTML(app.wiz.sala, 'reserva', { congId: app.cong.id, sel: app.wiz.sel, code: app.wiz.code }),
  wizCount,
  admMap: () => mapaHTML(app.admSala, 'admin', {}),
  admGeral: aGeralBody,
  tkMap: () => mapaHTML(app.ticket.sala, 'ver', { sel: app.ticket.assentos }),
};
function live() {
  const els = document.querySelectorAll('[data-live]');
  if (!els.length) { if (['home', 'admin'].includes(app.view) && !document.activeElement?.matches('input,textarea,select')) render(); return; }
  els.forEach(el => { const f = LIVE[el.dataset.live]; if (f) el.innerHTML = f(); });
}

/* ============================================================
   AÇÕES
   ============================================================ */
async function entrarCong(token) {
  const c = await store.congByToken(token.trim());
  if (!c) { toast('Código de acesso não encontrado.', 'err'); return false; }
  app.token = token.trim(); app.cong = c;
  if (app.unInsc) app.unInsc();
  app.unInsc = store.watchInsc(app.token, list => { app.insc = list; app.cong = congById(app.cong.id) || app.cong; live(); });
  try { sessionStorage.setItem('cf.tk', app.token); } catch (e) {}
  go('cong'); return true;
}
function startAll() { if (!app.unAll && store.isAdmin) app.unAll = store.watchAllInsc(list => { app.all = list; live(); }); }
async function abrirBilhete(code) {
  const b = await store.getBilhete(code.trim().toUpperCase());
  go('ticket', { ticket: b });
}
const wizFromInsc = (i, step) => ({ step, code: i.code, dados: { responsavel: i.responsavel, telefone: i.telefone || '', qtd: i.qtd, nomes: i.nomes || [], obs: i.obs || '' }, sala: i.sala, sel: [...(i.assentos || [])] });
const findInsc = code => app.insc.find(i => i.code === code) || app.all.find(i => i.code === code);

function aplicarPintura(ids) {
  const p = app.paint, ch = {};
  if (p.tool === 'area' && !p.congId) { toast('Escolha a congregação antes de pintar.', 'warn'); return; }
  ids.forEach(id => ch[id] = p.tool === 'area' ? { a: p.congId } : p.tool === 'limpar' ? { a: null } : { b: p.tool === 'bloq' });
  store.adminSeats(app.admSala, ch).then(sk => { if (sk) toast(`${sk} assento(s) reservado(s) não foram alterados.`, 'warn'); }).catch(e => toast(e.message, 'err'));
}

const ACTS = {
  home: () => go('home'),
  demoCong: (el, e) => { e.preventDefault(); entrarCong(store.congs[1].token); },
  adminLogin: () => go('adminLogin'),
  admin: () => { startAll(); go('admin'); },
  logout: async () => { await store.adminLogout(); if (app.unAll) { app.unAll(); app.unAll = null; } go('home'); },
  resetDemo: async () => { if (await confirmar('Reiniciar demonstração?', 'Apaga tudo o que foi feito e recria os dados de exemplo.', 'Reiniciar', true)) { await store.resetDemo(); toast('Demonstração reiniciada.'); render(); } },
  voltarCong: () => go('cong', { wiz: null }),
  novaFamilia: () => go('wiz', { wiz: { step: 1, code: null, dados: { responsavel: '', telefone: '', qtd: 2, nomes: [], obs: '' }, sala: null, sel: [] } }),
  editarFamilia: el => go('wiz', { wiz: wizFromInsc(findInsc(el.dataset.code), 1) }),
  trocarLugares: el => go('wiz', { wiz: wizFromInsc(findInsc(el.dataset.code), 2) }),
  abrirBilhete: el => abrirBilhete(el.dataset.code),
  cancelarFamilia: async el => {
    const i = findInsc(el.dataset.code);
    if (await confirmar('Excluir família?', `${esc(i.responsavel)} — os lugares voltam a ficar livres e o bilhete deixa de valer.`, 'Excluir', true)) {
      await store.cancelar(app.token, i); toast('Família excluída.');
    }
  },
  qtd: el => { const inp = $('input[name=qtd]'); inp.value = Math.min(EVENTO.maxPessoas, Math.max(1, (+inp.value || 1) + +el.dataset.d)); },
  wizSala: el => { app.wiz.sala = +el.dataset.sala; app.wiz.sel = []; render(); },
  zoom: el => { app.zoom = Math.min(1.6, Math.max(0.6, +(app.zoom + 0.2 * el.dataset.z).toFixed(1))); live(); },
  seat: el => {
    const id = el.dataset.id;
    if (app.view === 'wiz') { selecionarAPartir(id); live(); return; }
    if (app.view === 'admin') {
      const p = app.paint;
      if (!p.bloco) { aplicarPintura([id]); return; }
      if (!p.anchor) { p.anchor = id; render(); return; }
      const a = SEATS[app.admSala][p.anchor], b = SEATS[app.admSala][id];
      const [r0, r1] = [Math.min(a.ri, b.ri), Math.max(a.ri, b.ri)], [x0, x1] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
      const ids = Object.values(SEATS[app.admSala]).filter(s => s.ri >= r0 && s.ri <= r1 && s.x >= x0 - 0.01 && s.x <= x1 + 0.01).map(s => s.id);
      p.anchor = null; aplicarPintura(ids); render();
    }
  },
  paintRow: el => { const row = ROWSEQ[app.admSala].find(r => r.r === el.dataset.row); aplicarPintura(row.ids); },
  cancelAnchor: () => { app.paint.anchor = null; render(); },
  sugerir: () => {
    const w = app.wiz; const n = +w.dados.qtd;
    const room = JSON.parse(JSON.stringify(store.rooms[w.sala]));
    if (w.code) Object.values(room.seats).forEach(st => { if (st.i === w.code) delete st.i; });
    const ids = acharLugares(room, w.sala, app.cong.id, n);
    if (!ids) {
      const other = congStats().salas.find(x => x.sala !== w.sala && acharLugares(store.rooms[x.sala], x.sala, app.cong.id, n));
      toast(other ? `Não há ${n} lugares seguidos nesta sala. Veja a ${SALA[other.sala].nome}.` : `Não há ${n} lugares seguidos livres na área. Selecione manualmente em fileiras vizinhas ou peça à coordenação para ampliar a área.`, 'warn');
      return;
    }
    w.sel = ids; live(); centrarMapa();

  },
  confirmarLugares: async el => {
    const w = app.wiz, n = +w.dados.qtd;
    if (w.sel.length !== n) { toast(`Selecione exatamente ${n} lugar(es). Selecionados: ${w.sel.length}.`, 'warn'); return; }
    if (!contiguo(w.sala, w.sel)) {
      const room = JSON.parse(JSON.stringify(store.rooms[w.sala])); if (w.code) Object.values(room.seats).forEach(st => { if (st.i === w.code) delete st.i; });
      if (acharLugares(room, w.sala, app.cong.id, n)) { toast('Ainda existem lugares lado a lado na mesma fileira. Use “Sugerir lugares” para manter a família junta.', 'warn'); return; }
      if (!await confirmar('Lugares em fileiras diferentes', 'Não há mais lugares seguidos suficientes na mesma fileira. Confirmar mesmo assim?', 'Confirmar')) return;
    }
    el.disabled = true;
    try {
      if (w.code) { await store.definirLugares(app.token, { code: w.code }, w.sala, w.sel); toast('Lugares atualizados!'); abrirBilhete(w.code); }
      else { const i = await store.criarInscricao(app.token, app.cong, w.dados, w.sala, w.sel); toast('Família cadastrada e lugares reservados!'); abrirBilhete(i.code); }
      app.wiz = null;
    } catch (e) { toast(e.message, 'err'); w.sel = []; el.disabled = false; live(); }
  },
  salvarSemLugar: async el => {
    el.disabled = true;
    try { await store.criarInscricao(app.token, app.cong, app.wiz.dados, null, []); toast('Família salva. Escolha os lugares quando quiser.'); go('cong', { wiz: null }); }
    catch (e) { toast(e.message, 'err'); el.disabled = false; }
  },
  sairCong: () => { if (app.unInsc) app.unInsc(); app.unInsc = null; app.cong = null; app.token = null; app.insc = []; go('home'); },
  bloco: el => { app.paint.bloco = el.dataset.v === '1'; app.paint.anchor = null; render(); },
  imprimir: () => { try { window.print(); } catch (e) { toast('Impressão indisponível aqui. Faça uma captura de tela do bilhete.', 'warn'); } },

  admTab: el => { app.admTab = el.dataset.tab; app.busca = ''; render(); },
  admSala: el => { app.admSala = +el.dataset.sala; app.paint.anchor = null; render(); },
  tool: el => { app.paint.tool = el.dataset.tool; app.paint.anchor = null; render(); },
  initRooms: async () => { await store.initRooms(); toast('Salas criadas.'); render(); },
  limparSala: async () => {
    if (!await confirmar('Limpar áreas desta sala?', 'Remove as áreas das congregações nos assentos sem reserva desta sala.', 'Limpar', true)) return;
    const ch = {}; Object.entries(store.rooms[app.admSala].seats).forEach(([id, st]) => { if (st.a && !st.i) ch[id] = { a: null }; });
    const sk = await store.adminSeats(app.admSala, ch); toast('Áreas removidas' + (sk ? ` (${sk} reservados mantidos)` : '') + '.');
  },
  autoAreas: async () => {
    const usada = s => Object.values(store.rooms[s]?.seats || {}).some(st => st.a);
    const salas = [...document.querySelectorAll('[data-salaauto]:checked')].map(i => +i.value).sort((a, b) => usada(b) - usada(a) || a - b);
    const comArea = new Set(); LAYOUTS.forEach(L => Object.values(store.rooms[L.id]?.seats || {}).forEach(st => st.a && comArea.add(st.a)));
    const alvo = store.congs.filter(c => !comArea.has(c.id) && +c.cota > 0);
    if (!alvo.length) { toast('Todas as congregações com cota já têm área (ou nenhuma tem cota).', 'warn'); return; }
    const plan = planoDistribuicao(store.rooms, alvo, salas);
    const falta = plan.filter(p => p.falta), ok = plan.filter(p => p.ids);
    const resumo = salas.map(s => { const n = ok.filter(p => p.sala === s).reduce((t, p) => t + p.ids.length, 0); return n ? `Sala ${s}: ${n}` : ''; }).filter(Boolean).join(' · ');
    if (!await confirmar('Distribuir áreas automaticamente?', `${alvo.length} congregações · ${ok.reduce((t, p) => t + p.ids.length, 0)} lugares.<br>${resumo}${falta.length ? `<br><b>Atenção:</b> faltaram lugares para ${falta.length} congregação(ões).` : ''}`, 'Distribuir')) return;
    for (const s of salas) { const ch = {}; ok.filter(p => p.sala === s).forEach(p => p.ids.forEach(id => ch[id] = { a: p.congId })); if (Object.keys(ch).length) await store.adminSeats(s, ch); }
    toast('Áreas distribuídas!');
  },
  autoFamilias: async () => {
    const pend = app.all.filter(i => !i.sala).sort((a, b) => b.qtd - a.qtd);
    if (!pend.length) { toast('Todas as famílias já têm lugar.'); return; }
    const rooms = JSON.parse(JSON.stringify(store.rooms));
    const bySala = {}, sem = [];
    pend.forEach(i => {
      let done = false;
      for (const L of LAYOUTS) {
        const ids = acharLugares(rooms[L.id], L.id, i.congId, +i.qtd);
        if (ids) { ids.forEach(id => rooms[L.id].seats[id].i = i.code); (bySala[L.id] = bySala[L.id] || []).push({ token: i.token, code: i.code, ids, congId: i.congId }); done = true; break; }
      }
      if (!done) sem.push(i);
    });
    const n = Object.values(bySala).reduce((t, l) => t + l.length, 0);
    if (!await confirmar('Acomodar famílias automaticamente?', `${n} de ${pend.length} famílias serão acomodadas lado a lado dentro da área da própria congregação.${sem.length ? `<br>${sem.length} não couberam (área cheia ou inexistente) — amplie a área dessas congregações.` : ''}`, 'Acomodar')) return;
    app.admBusy = 'Acomodando famílias…'; render();
    try { for (const [s, list] of Object.entries(bySala)) await store.adminSeatMany(+s, list); toast(`${n} famílias acomodadas.`); }
    catch (e) { toast(e.message, 'err'); }
    app.admBusy = ''; render();
  },
  novaCong: () => editarCong({ nome: '', responsavel: '', telefone: '', cota: 0 }),
  editCong: el => editarCong(congById(el.dataset.id)),
  copiarLink: el => copiar(linkCong(congById(el.dataset.id)), el),
  entrarComo: el => entrarCong(congById(el.dataset.id).token),
  cotaAuto: async () => {
    if (!await confirmar('Cota = pessoas inscritas', 'Define a cota de cada congregação como o total de pessoas já cadastradas (útil antes de distribuir as áreas).', 'Aplicar')) return;
    const r = resumoCongs(); for (const x of r) if (x.pes && x.pes !== +x.c.cota) await store.saveCong({ ...x.c, cota: x.pes });
    toast('Cotas atualizadas.');
  },
  importarCongs: async () => {
    const txt = await modal(`<h3>Importar congregações</h3><p class="small muted">Uma por linha: <b>Nome; Responsável; Telefone; Cota</b> (só o nome é obrigatório). Pode colar direto do Excel.</p><textarea data-val rows="10" placeholder="Congregação Exemplo; Pb. Fulano; 21999999999; 40"></textarea><div class="row end"><button class="btn ghost" data-res="cancel">Cancelar</button><button class="btn primary" data-res="ok">Importar</button></div>`, { wide: true });
    if (!txt) return;
    const exist = new Set(store.congs.map(c => c.nome.trim().toLowerCase()));
    const list = txt.split(/\r?\n/).map(l => l.split(/[;\t]/).map(s => s.trim())).filter(p => p[0] && !exist.has(p[0].toLowerCase())).map(([nome, responsavel = '', telefone = '', cota = 0]) => ({ nome, responsavel, telefone, cota: parseInt(cota) || 0 }));
    if (!list.length) { toast('Nada novo para importar.', 'warn'); return; }
    await store.saveCongs(list); toast(`${list.length} congregações importadas.`);
  },
  csvLinks: () => baixar('links-congregacoes.csv', csv([['Congregação', 'Responsável', 'Telefone', 'Cota', 'Link de acesso', 'Código de acesso'], ...store.congs.map(c => [c.nome, c.responsavel, c.telefone, c.cota, linkCong(c) || '', c.token])]), 'text/csv'),
  csvCongs: () => baixar('congregacoes.csv', csv([['Congregação', 'Cota', 'Lugares na área', 'Reservados', 'Famílias', 'Pessoas', 'Salas'], ...resumoCongs().map(x => [x.c.nome, x.c.cota || 0, x.area, x.res, x.fam, x.pes, [...x.salas].join(' ')])]), 'text/csv'),
  csvInsc: () => baixar('inscricoes.csv', csv([['Código', 'Congregação', 'Responsável', 'Telefone', 'Pessoas', 'Acompanhantes', 'Observações', 'Sala', 'Assentos', 'Entrada', 'Cadastro'], ...app.all.map(i => [i.code, congById(i.congId)?.nome || '', i.responsavel, i.telefone, i.qtd, (i.nomes || []).join(', '), i.obs, i.sala || '', sortSeats(i.assentos).join(' '), i.checkin ? new Date(i.checkin).toLocaleString('pt-BR') : '', new Date(i.criadoEm).toLocaleString('pt-BR')])]), 'text/csv'),
  scan: () => scanQR(),
  ckToggle: async el => { await store.checkin(el.dataset.code, el.dataset.v === '1'); toast(el.dataset.v === '1' ? 'Entrada confirmada!' : 'Entrada desfeita.'); mostrarCheckin(el.dataset.code); },
};
const csv = rows => rows.map(r => r.map(v => { v = String(v ?? ''); return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(';')).join('\r\n');

async function editarCong(c) {
  const html = `<h3>${c.id ? 'Editar' : 'Nova'} congregação</h3><form class="form" id="fcong">
    <label>Nome<input name="nome" required value="${esc(c.nome)}"></label>
    <label>Responsável<input name="responsavel" value="${esc(c.responsavel)}"></label>
    <label>Telefone<input name="telefone" value="${esc(c.telefone)}"></label>
    <label>Cota de lugares<input name="cota" type="number" min="0" value="${+c.cota || 0}"></label></form>
    <div class="row end">${c.id ? '<button class="btn ghost danger-t" data-res="del">Excluir</button><span class="grow"></span>' : ''}<button class="btn ghost" data-res="cancel">Cancelar</button><button class="btn primary" data-res="save">Salvar</button></div>`;
  const r = await modal(html);
  const vals = modal.vals;
  if (r === 'save' && vals) {
    if (!vals.nome.trim()) { toast('Informe o nome.', 'warn'); return; }
    await store.saveCong({ ...c, ...vals, cota: +vals.cota || 0 }); toast('Salvo.');
  } else if (r === 'del') {
    const n = app.all.filter(i => i.congId === c.id).length;
    if (n) { toast(`Esta congregação tem ${n} família(s) cadastrada(s). Exclua as inscrições antes.`, 'err'); return; }
    if (await confirmar('Excluir congregação?', esc(c.nome) + ' — o link de acesso deixa de funcionar e a área é liberada.', 'Excluir', true)) { await store.deleteCong(c.id); toast('Excluída.'); }
  }
}

async function mostrarCheckin(code) {
  code = code.trim().toUpperCase().replace(/^.*[?&]t=/, '').replace(/^CINEFAMILIA:/, '');
  const b = await store.getBilhete(code); const box = $('#ckres'); if (!box) return;
  if (!b || b.cancelado) { box.innerHTML = `<div class="note err">Bilhete <b>${esc(code)}</b> não encontrado ou cancelado.</div>`; return; }
  const L = b.sala ? SALA[b.sala] : null;
  box.innerHTML = `<div class="ckcard" style="--c:${L ? L.cor : '#64748b'}"><div class="t-sala"><span>SALA</span><b>${L ? L.id : '—'}</b></div><div class="grow">
    <b>${esc(b.nome)}</b> · ${b.qtd} pessoa(s)<div class="small">${esc(b.congNome)}</div><div class="small">${b.sala ? esc(seatsTxt(b.assentos)) : 'sem lugar definido'}</div>
    ${b.checkin ? `<div class="pill warn">Já entrou às ${new Date(b.checkin).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>` : ''}</div>
    ${b.checkin ? `<button class="btn ghost sm" data-act="ckToggle" data-code="${b.code}" data-v="0">Desfazer</button>` : `<button class="btn primary" data-act="ckToggle" data-code="${b.code}" data-v="1">Confirmar entrada</button>`}</div>`;
}
async function scanQR() {
  const v = $('#scanv'); if (!v) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    v.hidden = false; v.srcObject = stream; await v.play();
    const det = new BarcodeDetector({ formats: ['qr_code'] });
    const stop = () => { stream.getTracks().forEach(t => t.stop()); v.hidden = true; };
    const loop = async () => {
      if (!document.body.contains(v)) return stop();
      const r = await det.detect(v).catch(() => []);
      if (r.length) { stop(); mostrarCheckin(r[0].rawValue); return; }
      requestAnimationFrame(loop);
    };
    loop();
  } catch (e) { toast('Não foi possível abrir a câmera. Digite o código.', 'warn'); }
}

/* ---------------- formulários ---------------- */
const FORMS = {
  entrarCong: f => entrarCong(f.tk.value.replace(/^.*[?&]c=/, '')),
  verBilhete: f => abrirBilhete(f.code.value),
  adminLogin: async f => {
    const btn = f.querySelector('button.primary'); btn.disabled = true;
    try { await store.adminLogin(f.email.value, f.senha.value); startAll(); go('admin'); }
    catch (e) { toast(e.message.includes('auth/') ? 'E-mail ou senha inválidos.' : e.message, 'err'); btn.disabled = false; }
  },
  wizDados: async f => {
    const w = app.wiz;
    const qtd = Math.min(EVENTO.maxPessoas, Math.max(1, parseInt(f.qtd.value) || 1));
    const dados = { responsavel: f.responsavel.value.trim(), telefone: f.telefone.value.trim(), qtd, nomes: f.nomes.value.split('\n').map(s => s.trim()).filter(Boolean), obs: f.obs.value.trim() };
    if (w.code) {
      const cur = findInsc(w.code);
      if (cur.sala && qtd !== +cur.qtd) { dados.qtd = cur.qtd; toast('Quantidade mantida: para mudar o número de pessoas, use “Trocar lugares”.', 'warn'); }
      await store.atualizarInscricao(app.token, w.code, dados); toast('Dados atualizados.');
      if (cur.sala && qtd !== +cur.qtd) { app.wiz = wizFromInsc({ ...cur, ...dados, qtd }, 2); app.wiz.sel = []; render(); return; }
      go('cong', { wiz: null }); return;
    }
    w.dados = dados;
    if (!congStats().salas.length) {
      try { await store.criarInscricao(app.token, app.cong, dados, null, []); } catch (e) { toast(e.message, 'err'); return; }
    }
    w.step = 2; w.sel = []; render();
  },
  checkin: f => mostrarCheckin(f.code.value),
};

/* ---------------- inicialização ---------------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el || el.closest('.modal-bg')) return;
  const f = ACTS[el.dataset.act]; if (f) { if (el.tagName === 'A' && !el.href.startsWith('http')) e.preventDefault(); f(el, e); }
});
document.addEventListener('submit', e => {
  const f = FORMS[e.target.dataset.form]; if (f) { e.preventDefault(); f(e.target); }
});
document.addEventListener('input', e => {
  const k = e.target.dataset.input; if (!k) return;
  if (k === 'busca') { app.busca = e.target.value; const pos = e.target.selectionStart; render(); const n = document.querySelector('[data-input=busca]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
});
document.addEventListener('change', e => { if (e.target.dataset.input === 'paintCong') app.paint.congId = e.target.value; });

(async function boot() {
  try {
    store = CFG.firebase && CFG.firebase.apiKey ? await makeFirebaseStore(CFG.firebase) : makeLocalStore();
    await store.init();
  } catch (e) {
    console.error(e);
    $('#app').innerHTML = `<div class="card empty"><h3>Não foi possível conectar</h3><p class="muted">${esc(e.message)}</p></div>`; return;
  }
  store.on(live);
  let qs = {}; try { qs = Object.fromEntries(new URLSearchParams(location.search)); } catch (e) {}
  if (qs.t) return abrirBilhete(qs.t);
  if (qs.c && await entrarCong(qs.c)) return;
  if (qs.admin !== undefined) return go(store.isAdmin ? 'admin' : 'adminLogin');
  if (store.isAdmin) startAll();
  render();
})();
